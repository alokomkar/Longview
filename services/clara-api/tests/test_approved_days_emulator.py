import os
import uuid

import pytest

from clara_api.approved_days import ApprovedDayConflictError, FirestoreApprovedDayRepository
from clara_api.models import DayApprovalRequest


pytestmark = pytest.mark.skipif(
    not os.getenv("FIRESTORE_EMULATOR_HOST"), reason="Firestore Emulator is not configured"
)


def request(key, revision=0, replace=False):
    return DayApprovalRequest.model_validate({
        "schemaVersion": 1,
        "idempotencyKey": key,
        "expectedDayRevision": revision,
        "replaceCurrent": replace,
    })


def run_payload(user_id, run_id, title="Define the first proof"):
    return {
        "schemaVersion": 1,
        "runId": run_id,
        "requestId": str(uuid.uuid4()),
        "selectedDate": "2026-08-17",
        "status": "succeeded",
        "checkpoint": 4,
        "checkpointLabel": "Result published",
        "retryOf": None,
        "failure": None,
        "ownerUid": user_id,
        "workspaceId": "default",
        "proposal": {
            "selectedDate": "2026-08-17",
            "capacityMinutes": 90,
            "totalMinutes": 60,
            "rationale": "The nearest active target comes first within capacity.",
            "blocks": [{
                "planId": "plan-1",
                "planTitle": "Launch Longview",
                "title": title,
                "durationMinutes": 60,
            }],
        },
    }


def test_transaction_persists_reloads_replaces_and_is_idempotent():
    user_id, run_id = f"day-test-{uuid.uuid4()}", str(uuid.uuid4())
    key = f"day-approval-{uuid.uuid4()}"
    repository = FirestoreApprovedDayRepository()
    client = repository.client()
    root = f"users/{user_id}/workspaces/default"
    run_ref = client.document(f"{root}/scheduleRuns/{run_id}")
    day_ref = client.document(f"{root}/approvedDays/2026-08-17")
    audit_ref = client.document(f"{root}/auditEvents/{key}")
    run_ref.set(run_payload(user_id, run_id))
    try:
        first = repository._approve(user_id, run_id, request(key))
        duplicate = repository._approve(user_id, run_id, request(key))
        restored = repository._get(user_id, "2026-08-17")
        assert first.duplicate is False and duplicate.duplicate is True
        assert restored.revision == 1 and restored.source_run_id == run_id
        assert restored.blocks[0].order == 1 and audit_ref.get().exists

        replacement_run = str(uuid.uuid4())
        replacement_key = f"day-approval-{uuid.uuid4()}"
        replacement_ref = client.document(f"{root}/scheduleRuns/{replacement_run}")
        replacement_audit = client.document(f"{root}/auditEvents/{replacement_key}")
        replacement_ref.set(run_payload(user_id, replacement_run, "Review the published proof"))
        replacement = repository._approve(
            user_id, replacement_run, request(replacement_key, revision=1, replace=True)
        )
        assert replacement.approved_day.revision == 2
        assert replacement.approved_day.blocks[0].title == "Review the published proof"
        replacement_audit.delete()
        replacement_ref.delete()
    finally:
        audit_ref.delete()
        day_ref.delete()
        run_ref.delete()


def test_conflicts_and_failed_runs_preserve_the_current_day():
    user_id, run_id = f"day-conflict-{uuid.uuid4()}", str(uuid.uuid4())
    repository = FirestoreApprovedDayRepository()
    client = repository.client()
    root = f"users/{user_id}/workspaces/default"
    run_ref = client.document(f"{root}/scheduleRuns/{run_id}")
    day_ref = client.document(f"{root}/approvedDays/2026-08-17")
    run_ref.set(run_payload(user_id, run_id))
    first_key = f"day-approval-{uuid.uuid4()}"
    first_audit = client.document(f"{root}/auditEvents/{first_key}")
    repository._approve(user_id, run_id, request(first_key))
    failed_run = str(uuid.uuid4())
    failed_ref = client.document(f"{root}/scheduleRuns/{failed_run}")
    failed = run_payload(user_id, failed_run)
    failed.update({"status": "failed", "checkpoint": 3, "checkpointLabel": "Proposal generated", "proposal": None, "failure": "failed"})
    failed_ref.set(failed)
    try:
        cases = [
            (run_id, request(f"day-approval-{uuid.uuid4()}", revision=0, replace=True)),
            (run_id, request(f"day-approval-{uuid.uuid4()}", revision=1, replace=False)),
            (failed_run, request(f"day-approval-{uuid.uuid4()}", revision=1, replace=True)),
        ]
        for candidate_run, candidate_request in cases:
            with pytest.raises(ApprovedDayConflictError):
                repository._approve(user_id, candidate_run, candidate_request)
        assert repository._get(user_id, "2026-08-17").revision == 1
        assert day_ref.get().to_dict()["sourceRunId"] == run_id
    finally:
        first_audit.delete()
        failed_ref.delete()
        day_ref.delete()
        run_ref.delete()


def test_approval_consumes_pending_carryover_from_the_terminal_run():
    user_id, run_id = f"day-carryover-{uuid.uuid4()}", str(uuid.uuid4())
    key = f"day-approval-{uuid.uuid4()}"
    repository = FirestoreApprovedDayRepository()
    client = repository.client()
    root = f"users/{user_id}/workspaces/default"
    run_ref = client.document(f"{root}/scheduleRuns/{run_id}")
    pending_ref = client.document(f"{root}/pendingCarryovers/carryover-1")
    day_ref = client.document(f"{root}/approvedDays/2026-08-17")
    audit_ref = client.document(f"{root}/auditEvents/{key}")
    payload = run_payload(user_id, run_id)
    payload["carryoverIds"] = ["carryover-1"]
    run_ref.set(payload)
    pending_ref.set({
        "ownerUid": user_id, "workspaceId": "default", "destinationDate": "2026-08-17",
        "status": "pending",
    })
    try:
        repository._approve(user_id, run_id, request(key))
        stored = pending_ref.get().to_dict()
        assert stored["status"] == "approved" and stored["approvedDayDate"] == "2026-08-17"
    finally:
        audit_ref.delete()
        day_ref.delete()
        pending_ref.delete()
        run_ref.delete()
