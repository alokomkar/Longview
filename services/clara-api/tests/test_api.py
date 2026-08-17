import asyncio

from fastapi.testclient import TestClient

from clara_api.auth import AuthenticationError
from clara_api.engine import EngineUnavailableError
from clara_api.main import create_app


REQUEST = {
    "schemaVersion": 1,
    "requestId": "request-1",
    "scope": "today-step",
    "plan": {
        "id": "plan-1",
        "title": "Launch Longview",
        "outcome": "Release a tested PWA to real users.",
        "targetDate": "2026-08-20",
        "weeklyHours": 4,
    },
    "step": {
        "title": "Define the first proof",
        "description": "Write one observable result.",
        "durationMinutes": 60,
        "date": "2026-08-17",
    },
}
RESPONSE = {
    "schemaVersion": 1,
    "requestId": "request-1",
    "sourcePlanId": "plan-1",
    "headline": "Protect the smallest proof",
    "recommendation": "Finish the selected step before adding more work.",
    "rationale": "It creates evidence for the nearest active Plan target.",
    "confidence": "medium",
    "requiresClarification": False,
    "sourceFacts": ["Plan: Launch Longview"],
    "proposedChange": None,
}


class Verifier:
    def __init__(self, failure=False):
        self.failure = failure
        self.tokens = []

    async def verify(self, token):
        self.tokens.append(token)
        if self.failure:
            raise AuthenticationError()
        return "owner-1"


class Engine:
    def __init__(self, result=RESPONSE, error=None, delay=0):
        self.result, self.error, self.delay, self.calls = result, error, delay, []

    async def recommend(self, context, user_id):
        self.calls.append((context, user_id))
        if self.delay:
            await asyncio.sleep(self.delay)
        if self.error:
            raise self.error
        return self.result


def client(verifier=None, engine=None, timeout=8):
    return TestClient(create_app(verifier or Verifier(), engine or Engine(), timeout))


def test_health_does_not_require_authentication():
    assert client().get("/healthz").json() == {"status": "ok"}


def test_cors_allows_only_the_configured_pwa_origin():
    app = create_app(Verifier(), Engine(), allowed_origins=["https://longview.example.test"])
    test_client = TestClient(app)
    allowed = test_client.options(
        "/v1/clara/recommendations",
        headers={
            "Origin": "https://longview.example.test",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    denied = test_client.options(
        "/v1/clara/recommendations",
        headers={"Origin": "https://other.example.test", "Access-Control-Request-Method": "POST"},
    )
    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "https://longview.example.test"
    assert "access-control-allow-origin" not in denied.headers


def test_verifies_token_and_returns_strict_read_only_response():
    verifier, engine = Verifier(), Engine()
    response = client(verifier, engine).post(
        "/v1/clara/recommendations", json=REQUEST, headers={"Authorization": "Bearer token-1"}
    )
    assert response.status_code == 200
    assert response.json() == RESPONSE
    assert verifier.tokens == ["token-1"]
    assert engine.calls[0][1] == "owner-1"


def test_accepts_a_read_only_clarification():
    result = {**RESPONSE, "requiresClarification": True, "recommendation": "Which result would prove this step is finished today?"}
    response = client(engine=Engine(result)).post(
        "/v1/clara/recommendations", json=REQUEST, headers={"Authorization": "Bearer token"}
    )
    assert response.status_code == 200
    assert response.json()["requiresClarification"] is True


def test_missing_malformed_and_invalid_tokens_fail_before_engine():
    for headers, verifier in [({}, Verifier()), ({"Authorization": "Basic token"}, Verifier()), ({"Authorization": "Bearer bad"}, Verifier(True))]:
        engine = Engine()
        response = client(verifier, engine).post("/v1/clara/recommendations", json=REQUEST, headers=headers)
        assert response.status_code == 401
        assert engine.calls == []


def test_unknown_oversized_and_invalid_context_are_rejected():
    cases = [
        {**REQUEST, "unknown": True},
        {**REQUEST, "plan": {**REQUEST["plan"], "title": "x" * 81}},
        {**REQUEST, "step": {**REQUEST["step"], "date": "2026-02-30"}},
    ]
    for body in cases:
        assert client().post(
            "/v1/clara/recommendations", json=body, headers={"Authorization": "Bearer token"}
        ).status_code == 422


def test_timeout_and_unavailable_dependency_are_distinct():
    timeout = client(engine=Engine(delay=0.05), timeout=0.001).post(
        "/v1/clara/recommendations", json=REQUEST, headers={"Authorization": "Bearer token"}
    )
    unavailable = client(engine=Engine(error=EngineUnavailableError())).post(
        "/v1/clara/recommendations", json=REQUEST, headers={"Authorization": "Bearer token"}
    )
    assert timeout.status_code == 504
    assert unavailable.status_code == 503


def test_malformed_mismatched_and_write_bearing_outputs_fail_closed():
    cases = [
        {"invalid": True},
        {**RESPONSE, "requestId": "another-request"},
        {**RESPONSE, "proposedChange": {"title": "mutate"}},
    ]
    for result in cases:
        response = client(engine=Engine(result)).post(
            "/v1/clara/recommendations", json=REQUEST, headers={"Authorization": "Bearer token"}
        )
        assert response.status_code == 502
