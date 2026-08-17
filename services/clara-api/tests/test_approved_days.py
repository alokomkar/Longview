import pytest
from pydantic import ValidationError

from clara_api.models import ApprovedDay, DayApprovalRequest


def test_request_requires_explicit_replacement_and_non_negative_revision():
    value = DayApprovalRequest.model_validate({
        "schemaVersion": 1,
        "idempotencyKey": "day-approval-1",
        "expectedDayRevision": 0,
        "replaceCurrent": False,
    })
    assert value.expected_day_revision == 0 and value.replace_current is False
    with pytest.raises(ValidationError):
        DayApprovalRequest.model_validate({
            "schemaVersion": 1,
            "idempotencyKey": "day-approval-1",
            "expectedDayRevision": -1,
            "replaceCurrent": False,
        })


def test_approved_day_rejects_gaps_and_mismatched_totals():
    base = {
        "schemaVersion": 1,
        "selectedDate": "2026-08-17",
        "revision": 1,
        "sourceRunId": "run-1",
        "capacityMinutes": 90,
        "totalMinutes": 60,
        "blocks": [{
            "order": 1,
            "planId": "plan-1",
            "planTitle": "Launch Longview",
            "title": "Define the first proof",
            "durationMinutes": 60,
        }],
        "status": "approved",
        "approvalEventId": "day-approval-1",
    }
    assert ApprovedDay.model_validate(base).revision == 1
    for invalid in (
        {**base, "blocks": [{**base["blocks"][0], "order": 2}]},
        {**base, "totalMinutes": 61},
    ):
        with pytest.raises(ValidationError):
            ApprovedDay.model_validate(invalid)
