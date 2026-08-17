import pytest
from pydantic import ValidationError

from clara_api.models import CreateScheduleRunRequest, ScheduleRun
from clara_api.schedule_runs import build_proposal


def request(capacity=90):
    return CreateScheduleRunRequest.model_validate({
        "schemaVersion": 1, "requestId": "request-1", "selectedDate": "2026-08-17",
        "capacityMinutes": capacity, "retryOf": None,
        "plans": [
            {"id": "later", "title": "Later target", "targetDate": "2026-09-20", "weeklyHours": 3, "workingDays": ["mon"], "mode": "Maintain"},
            {"id": "focus", "title": "Nearest target", "targetDate": "2026-08-20", "weeklyHours": 4, "workingDays": ["mon"], "mode": "Focus"},
        ],
        "steps": [
            {"planId": "later", "planTitle": "Later target", "title": "Review later proof", "description": "Review one later result.", "durationMinutes": 60},
            {"planId": "focus", "planTitle": "Nearest target", "title": "Define nearest proof", "description": "Write one nearest result.", "durationMinutes": 60},
        ],
    })


def test_proposal_prioritizes_focus_and_never_exceeds_capacity():
    proposal = build_proposal(request())
    assert [block.plan_id for block in proposal.blocks] == ["focus", "later"]
    assert [block.duration_minutes for block in proposal.blocks] == [60, 30]
    assert proposal.total_minutes == proposal.capacity_minutes == 90


def test_small_remaining_fragment_is_not_published_as_a_task():
    proposal = build_proposal(request(70))
    assert len(proposal.blocks) == 1
    assert proposal.total_minutes == 60


def test_terminal_contract_rejects_mixed_publication_state():
    with pytest.raises(ValidationError):
        ScheduleRun.model_validate({
            "schemaVersion": 1, "runId": "run-1", "requestId": "request-1",
            "selectedDate": "2026-08-17", "status": "cancelled", "checkpoint": 3,
            "checkpointLabel": "Proposal generated", "retryOf": None, "failure": None,
            "proposal": build_proposal(request()).model_dump(mode="json", by_alias=True),
        })
