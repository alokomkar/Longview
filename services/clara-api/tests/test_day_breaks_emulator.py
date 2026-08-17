import os
import uuid

import pytest

from clara_api.day_breaks import DayBreakConflictError, FirestoreDayBreakRepository
from clara_api.models import DayBreakRequest


pytestmark = pytest.mark.skipif(
    not os.getenv("FIRESTORE_EMULATOR_HOST"), reason="Firestore Emulator is not configured"
)


def approved_day(user_id):
    return {
        "schemaVersion": 1, "selectedDate": "2026-08-17", "revision": 1,
        "sourceRunId": "run-1", "capacityMinutes": 120, "totalMinutes": 90,
        "blocks": [
            {"order": 1, "planId": "plan-1", "planTitle": "Launch Longview",
             "title": "Define the first proof", "durationMinutes": 60},
            {"order": 2, "planId": "plan-2", "planTitle": "Evaluate retrieval",
             "title": "Run the baseline evaluation", "durationMinutes": 30},
        ],
        "status": "approved", "approvalEventId": "day-approval-1",
        "ownerUid": user_id, "workspaceId": "default",
    }


def plan(user_id, plan_id, working_days, version=1):
    return {
        "id": plan_id, "ownerUid": user_id, "workspaceId": "default", "status": "active",
        "schemaVersion": 2, "scheduleVersion": version, "workingDays": working_days,
    }


def request(preview, key):
    return DayBreakRequest.model_validate({
        "schemaVersion": 1, "idempotencyKey": key,
        "expectedDayRevision": preview.expected_day_revision,
        "carryovers": [value.model_dump(mode="json", by_alias=True) for value in preview.carryovers],
    })


def test_break_transaction_is_atomic_idempotent_and_reloads():
    user_id = f"break-test-{uuid.uuid4()}"
    key = f"day-break-{uuid.uuid4()}"
    repository = FirestoreDayBreakRepository()
    client = repository.client()
    root = f"users/{user_id}/workspaces/default"
    day_ref = client.document(f"{root}/approvedDays/2026-08-17")
    plan_refs = [client.document(f"{root}/plans/plan-1"), client.document(f"{root}/plans/plan-2")]
    audit_ref = client.document(f"{root}/auditEvents/{key}")
    day_ref.set(approved_day(user_id))
    plan_refs[0].set(plan(user_id, "plan-1", ["tue"], 2))
    plan_refs[1].set(plan(user_id, "plan-2", ["wed"], 3))
    try:
        preview = repository._preview(user_id, "2026-08-17")
        assert [value.destination_date.isoformat() for value in preview.carryovers] == [
            "2026-08-18", "2026-08-19"
        ]
        first = repository._confirm(user_id, "2026-08-17", request(preview, key))
        duplicate = repository._confirm(user_id, "2026-08-17", request(preview, key))
        stored = day_ref.get().to_dict()
        pending = list(client.collection(f"{root}/pendingCarryovers").stream())
        assert first.duplicate is False and duplicate.duplicate is True
        assert stored["status"] == "break" and stored["revision"] == 2
        assert len(pending) == 2 and all(value.to_dict()["status"] == "pending" for value in pending)
        assert audit_ref.get().exists
    finally:
        for value in client.collection(f"{root}/pendingCarryovers").stream(): value.reference.delete()
        audit_ref.delete()
        day_ref.delete()
        for ref in plan_refs: ref.delete()


def test_stale_schedule_and_future_approval_preserve_today():
    user_id = f"break-conflict-{uuid.uuid4()}"
    repository = FirestoreDayBreakRepository()
    client = repository.client()
    root = f"users/{user_id}/workspaces/default"
    day_ref = client.document(f"{root}/approvedDays/2026-08-17")
    plan_ref = client.document(f"{root}/plans/plan-1")
    day = approved_day(user_id)
    day["blocks"] = day["blocks"][:1]
    day["totalMinutes"] = 60
    day_ref.set(day)
    plan_ref.set(plan(user_id, "plan-1", ["tue"], 1))
    try:
        preview = repository._preview(user_id, "2026-08-17")
        plan_ref.update({"scheduleVersion": 2, "workingDays": ["wed"]})
        with pytest.raises(DayBreakConflictError, match="source-changed"):
            repository._confirm(user_id, "2026-08-17", request(preview, f"day-break-{uuid.uuid4()}"))
        assert day_ref.get().to_dict()["status"] == "approved"

        plan_ref.update({"scheduleVersion": 1, "workingDays": ["tue"]})
        future_ref = client.document(f"{root}/approvedDays/2026-08-18")
        future = {**day, "selectedDate": "2026-08-18"}
        future_ref.set(future)
        with pytest.raises(DayBreakConflictError, match="future-approved"):
            repository._preview(user_id, "2026-08-17")
        assert day_ref.get().to_dict()["revision"] == 1
        future_ref.delete()
    finally:
        day_ref.delete()
        plan_ref.delete()
