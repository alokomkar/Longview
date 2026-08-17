import pytest

from clara_api.approval import (
    ApprovalConflictError,
    ApprovalNotFoundError,
    _fingerprint,
    validate_plan_for_approval,
)
from clara_api.models import ApprovalRequest


REQUEST = ApprovalRequest.model_validate({
    "schemaVersion": 1,
    "idempotencyKey": "approval-123",
    "proposal": {
        "kind": "plan-working-days",
        "planId": "plan-1",
        "expectedScheduleVersion": 2,
        "workingDaysBefore": ["mon", "fri"],
        "workingDaysAfter": ["mon", "wed", "fri"],
        "weeklyHours": 4,
        "rationale": "A midweek checkpoint reduces the gap between sessions.",
        "downstreamEffect": "Today can select this Plan on Wednesday without changing weekly time.",
    },
})
PLAN = {
    "ownerUid": "owner-1", "workspaceId": "default", "scheduleVersion": 2,
    "workingDays": ["mon", "fri"], "weeklyHours": 4,
}


def test_valid_plan_returns_the_next_schedule_version():
    assert validate_plan_for_approval("owner-1", PLAN, REQUEST.proposal) == 3


@pytest.mark.parametrize("change,error", [
    ({"ownerUid": "other"}, ApprovalNotFoundError),
    ({"workspaceId": "other"}, ApprovalNotFoundError),
    ({"scheduleVersion": 3}, ApprovalConflictError),
    ({"workingDays": ["mon", "wed"]}, ApprovalConflictError),
    ({"weeklyHours": 5}, ApprovalConflictError),
])
def test_rejects_cross_owner_and_stale_plan_state(change, error):
    with pytest.raises(error):
        validate_plan_for_approval("owner-1", {**PLAN, **change}, REQUEST.proposal)


def test_fingerprint_is_stable_and_changes_with_the_request():
    same = ApprovalRequest.model_validate(REQUEST.model_dump(mode="json", by_alias=True))
    changed = ApprovalRequest.model_validate({
        **REQUEST.model_dump(mode="json", by_alias=True), "idempotencyKey": "approval-456"
    })
    assert _fingerprint(REQUEST) == _fingerprint(same)
    assert _fingerprint(REQUEST) != _fingerprint(changed)
