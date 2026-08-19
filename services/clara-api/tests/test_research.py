import asyncio
import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from clara_api.auth import AuthenticationError
from clara_api.main import create_app
from clara_api.research import GroundedResearchEngine, ResearchEngineUnavailableError


REQUEST = {
    "schemaVersion": 1,
    "requestId": "research-request-123",
    "plan": {
        "id": "plan-123",
        "title": "Launch Longview",
        "outcome": "Release a tested planning workflow to real users.",
        "why": "Real usage is the strongest product evidence.",
        "targetDate": "2026-09-30",
    },
    "existingResearchIds": [],
}
RESPONSE = {
    "schemaVersion": 1,
    "requestId": "research-request-123",
    "sourcePlanId": "plan-123",
    "cards": [{
        "schemaVersion": 1,
        "researchId": "research-123",
        "requestId": "research-request-123",
        "sourcePlanId": "plan-123",
        "headline": "Visible first value improves activation",
        "finding": "Users continue setup after seeing one meaningful outcome.",
        "source": {
            "kind": "web",
            "title": "Activation research",
            "locator": "https://example.com/research",
            "domain": "example.com",
            "publishedAt": None,
            "retrievedAt": "2026-08-19T08:00:00Z",
            "searchQueries": [],
        },
    }],
}


class Verifier:
    def __init__(self, fail=False):
        self.fail = fail

    async def verify(self, token):
        if self.fail:
            raise AuthenticationError()
        return "owner-1"


class ResearchEngine:
    def __init__(self, value=RESPONSE, error=None, delay=0):
        self.value, self.error, self.delay, self.calls = value, error, delay, []

    async def research(self, context, user_id):
        self.calls.append((context, user_id))
        if self.delay:
            await asyncio.sleep(self.delay)
        if self.error:
            raise self.error
        return self.value


def client(engine=None, timeout=1, mode="full", verifier=None):
    return TestClient(create_app(
        verifier=verifier or Verifier(), research_engine=engine or ResearchEngine(),
        timeout_seconds=timeout, release_mode=mode,
    ))


def test_research_is_authenticated_and_plan_bound():
    engine = ResearchEngine()
    api = client(engine)
    assert api.post("/v1/clara/research", json=REQUEST).status_code == 401
    response = api.post("/v1/clara/research", json=REQUEST, headers={"Authorization": "Bearer token"})
    assert response.status_code == 200
    assert response.json() == RESPONSE
    assert engine.calls[0][1] == "owner-1"


def test_research_maps_timeout_unavailable_and_malformed_output_safely():
    headers = {"Authorization": "Bearer token"}
    timed_out = client(ResearchEngine(delay=0.05), timeout=0.01).post("/v1/clara/research", json=REQUEST, headers=headers)
    unavailable = client(ResearchEngine(error=ResearchEngineUnavailableError())).post("/v1/clara/research", json=REQUEST, headers=headers)
    malformed = client(ResearchEngine({"malformedResearchOutput": "missing attribution"})).post("/v1/clara/research", json=REQUEST, headers=headers)
    assert timed_out.status_code == 504
    assert unavailable.status_code == 503
    assert malformed.status_code == 502


def test_research_rejects_mismatched_duplicate_and_existing_cards():
    headers = {"Authorization": "Bearer token"}
    mismatch = client(ResearchEngine({**RESPONSE, "sourcePlanId": "other-plan"})).post("/v1/clara/research", json=REQUEST, headers=headers)
    duplicate = client(ResearchEngine({**RESPONSE, "cards": [RESPONSE["cards"][0], RESPONSE["cards"][0]]})).post("/v1/clara/research", json=REQUEST, headers=headers)
    existing_request = {**REQUEST, "existingResearchIds": ["research-123"]}
    existing = client().post("/v1/clara/research", json=existing_request, headers=headers)
    assert mismatch.status_code == duplicate.status_code == existing.status_code == 502


def test_release_five_exposes_prior_paths_and_research_but_earlier_modes_do_not():
    release_five = client(mode="release-five")
    paths = set(release_five.get("/openapi.json").json()["paths"])
    assert "/v1/clara/research" in paths
    assert "/v1/clara/recommendations" in paths
    assert "/v1/clara/approvals" in paths
    assert "/v1/clara/schedule-runs" in paths
    assert "/v1/clara/research" not in set(client(mode="release-three").get("/openapi.json").json()["paths"])


class FakeModels:
    def __init__(self, response=None, error=None):
        self.response, self.error, self.calls = response, error, []

    async def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return self.response


def fake_response(source_index=0, with_source=True):
    web = SimpleNamespace(uri="https://example.com/research", title="Activation research", domain="example.com") if with_source else None
    chunk = SimpleNamespace(web=web)
    metadata = SimpleNamespace(grounding_chunks=[chunk], web_search_queries=["activation research"])
    return SimpleNamespace(
        text=json.dumps({"cards": [{
            "headline": "Visible first value improves activation",
            "finding": "Users continue setup after seeing one meaningful outcome.",
            "sourceIndex": source_index,
        }]}),
        candidates=[SimpleNamespace(grounding_metadata=metadata)],
    )


@pytest.mark.asyncio
async def test_grounded_engine_maps_only_search_metadata_into_attribution():
    models = FakeModels(fake_response())
    engine = GroundedResearchEngine(SimpleNamespace(aio=SimpleNamespace(models=models)))
    from clara_api.models import ResearchRequest
    result = await engine.research(ResearchRequest.model_validate(REQUEST), "owner-1")
    assert result["cards"][0]["source"]["locator"] == "https://example.com/research"
    assert result["cards"][0]["source"]["searchQueries"] == ["activation research"]
    assert result["cards"][0]["researchId"].startswith("research-")
    assert models.calls[0]["config"].tools[0].google_search is not None
    assert models.calls[0]["config"].response_schema is None


@pytest.mark.asyncio
async def test_grounded_engine_rejects_missing_or_out_of_range_grounding():
    from clara_api.models import ResearchRequest
    context = ResearchRequest.model_validate(REQUEST)
    missing = GroundedResearchEngine(SimpleNamespace(aio=SimpleNamespace(models=FakeModels(fake_response(with_source=False)))))
    outside = GroundedResearchEngine(SimpleNamespace(aio=SimpleNamespace(models=FakeModels(fake_response(source_index=2)))))
    assert "malformedResearchOutput" in await missing.research(context, "owner-1")
    assert "malformedResearchOutput" in await outside.research(context, "owner-1")


@pytest.mark.asyncio
async def test_grounded_engine_maps_provider_failure_to_unavailable():
    from clara_api.models import ResearchRequest
    engine = GroundedResearchEngine(SimpleNamespace(aio=SimpleNamespace(models=FakeModels(error=RuntimeError("provider")))))
    with pytest.raises(ResearchEngineUnavailableError):
        await engine.research(ResearchRequest.model_validate(REQUEST), "owner-1")
