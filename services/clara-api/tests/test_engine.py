import json
from types import SimpleNamespace

import pytest

from clara_api.engine import AdkRecommendationEngine
from clara_api.models import RecommendationRequest


CONTEXT = RecommendationRequest.model_validate({
    "schemaVersion": 1,
    "requestId": "request-1",
    "scope": "today-step",
    "plan": {
        "id": "plan-1",
        "title": "Launch Longview",
        "outcome": "Release a tested PWA to real users.",
        "targetDate": "2026-08-20",
        "weeklyHours": 4,
        "workingDays": ["mon", "fri"],
        "scheduleVersion": 2,
    },
    "step": {
        "title": "Define the first proof",
        "description": "Write one observable result.",
        "durationMinutes": 60,
        "date": "2026-08-17",
    },
})


class SessionService:
    async def create_session(self, **_kwargs):
        return None


class Runner:
    def __init__(self, payload):
        self.payload = payload
        self.session_service = SessionService()

    async def run_async(self, **_kwargs):
        content = SimpleNamespace(parts=[SimpleNamespace(text=json.dumps(self.payload))])
        yield SimpleNamespace(is_final_response=lambda: True, content=content)


@pytest.mark.asyncio
async def test_engine_adds_trusted_envelope_after_validating_model_payload():
    payload = {
        "headline": "Protect the smallest proof",
        "recommendation": "Finish the selected step before adding more work.",
        "rationale": "It creates evidence for the nearest active Plan target.",
        "confidence": "medium",
        "requiresClarification": False,
        "sourceFacts": ["Plan: Launch Longview"],
    }
    result = await AdkRecommendationEngine(Runner(payload)).recommend(CONTEXT, "owner-1")
    assert result == {
        "schemaVersion": 1,
        "requestId": "request-1",
        "sourcePlanId": "plan-1",
        **payload,
        "proposedChange": None,
    }


@pytest.mark.asyncio
async def test_engine_rejects_model_supplied_identity_or_write_fields():
    payload = {
        "headline": "Protect the smallest proof",
        "recommendation": "Finish the selected step before adding more work.",
        "rationale": "It creates evidence for the nearest active Plan target.",
        "confidence": "medium",
        "requiresClarification": False,
        "sourceFacts": ["Plan: Launch Longview"],
        "requestId": "forged",
        "proposedChange": {"title": "mutate"},
    }
    result = await AdkRecommendationEngine(Runner(payload)).recommend(CONTEXT, "owner-1")
    assert set(result) == {"malformedModelOutput"}


@pytest.mark.asyncio
async def test_engine_wraps_a_valid_model_change_in_trusted_plan_identity():
    payload = {
        "headline": "Add a midweek checkpoint",
        "recommendation": "Use Wednesday to keep progress moving between sessions.",
        "rationale": "The current gap between working days is unnecessarily long.",
        "confidence": "medium",
        "requiresClarification": False,
        "sourceFacts": ["Working days: Monday and Friday"],
        "proposedChange": {
            "workingDaysAfter": ["mon", "wed", "fri"],
            "rationale": "A midweek checkpoint reduces the gap between sessions.",
            "downstreamEffect": "Today can select this Plan on Wednesday without changing weekly time.",
        },
    }
    result = await AdkRecommendationEngine(Runner(payload)).recommend(CONTEXT, "owner-1")
    assert result["proposedChange"] == {
        "kind": "plan-working-days",
        "planId": "plan-1",
        "expectedScheduleVersion": 2,
        "workingDaysBefore": ["mon", "fri"],
        "workingDaysAfter": ["mon", "wed", "fri"],
        "weeklyHours": 4,
        "rationale": payload["proposedChange"]["rationale"],
        "downstreamEffect": payload["proposedChange"]["downstreamEffect"],
    }
