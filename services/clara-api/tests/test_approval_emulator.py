import os
import uuid

import pytest

from clara_api.approval import ApprovalConflictError, FirestoreApprovalRepository
from clara_api.models import ApprovalRequest


pytestmark = pytest.mark.skipif(
    not os.getenv("FIRESTORE_EMULATOR_HOST"), reason="Firestore Emulator is not configured"
)


def request(plan_id, key="approval-emulator-1", after=None):
    return ApprovalRequest.model_validate({
        "schemaVersion": 1,
        "idempotencyKey": key,
        "proposal": {
            "kind": "plan-working-days",
            "planId": plan_id,
            "expectedScheduleVersion": 2,
            "workingDaysBefore": ["mon", "fri"],
            "workingDaysAfter": after or ["mon", "wed", "fri"],
            "weeklyHours": 4,
            "rationale": "A midweek checkpoint reduces the gap between sessions.",
            "downstreamEffect": "Today can select this Plan on Wednesday without changing weekly time.",
        },
    })


def test_emulator_transaction_is_atomic_idempotent_and_conflict_safe():
    user_id, plan_id = f"approval-test-{uuid.uuid4()}", f"plan-{uuid.uuid4()}"
    repository = FirestoreApprovalRepository()
    client = repository.client()
    plan_ref = client.document(f"users/{user_id}/workspaces/default/plans/{plan_id}")
    audit_ref = client.document(
        f"users/{user_id}/workspaces/default/auditEvents/approval-emulator-1"
    )
    plan_ref.set({
        "ownerUid": user_id, "workspaceId": "default", "scheduleVersion": 2,
        "workingDays": ["mon", "fri"], "weeklyHours": 4,
    })
    try:
        first = repository._apply(user_id, request(plan_id))
        duplicate = repository._apply(user_id, request(plan_id))
        assert first.duplicate is False and duplicate.duplicate is True
        assert plan_ref.get().to_dict()["scheduleVersion"] == 3
        assert audit_ref.get().exists
        with pytest.raises(ApprovalConflictError):
            repository._apply(
                user_id, request(plan_id, after=["mon", "tue", "fri"])
            )
        assert plan_ref.get().to_dict()["workingDays"] == ["mon", "wed", "fri"]
    finally:
        audit_ref.delete()
        plan_ref.delete()
