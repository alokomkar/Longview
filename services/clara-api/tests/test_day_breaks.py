from datetime import date

import pytest
from pydantic import ValidationError

from clara_api.day_breaks import DayBreakConflictError, _next_eligible_day
from clara_api.models import DayBreakPreview, DayBreakResponse


CARRYOVER = {
    "order": 1,
    "planId": "plan-1",
    "planTitle": "Launch Longview",
    "title": "Define the first proof",
    "durationMinutes": 60,
    "destinationDate": "2026-08-18",
    "scheduleVersion": 2,
}


def test_next_eligible_day_is_strictly_later_and_plan_scoped():
    assert _next_eligible_day(date(2026, 8, 17), ["tue", "fri"]).isoformat() == "2026-08-18"
    assert _next_eligible_day(date(2026, 8, 18), ["mon"]).isoformat() == "2026-08-24"
    with pytest.raises(DayBreakConflictError, match="no-eligible-day"):
        _next_eligible_day(date(2026, 8, 17), [])


def test_break_models_reject_order_gaps_and_non_break_results():
    with pytest.raises(ValidationError):
        DayBreakPreview.model_validate({
            "schemaVersion": 1, "selectedDate": "2026-08-17", "expectedDayRevision": 1,
            "sourceApprovalEventId": "approval-1", "carryovers": [{**CARRYOVER, "order": 2}],
        })
    with pytest.raises(ValidationError):
        DayBreakResponse.model_validate({
            "schemaVersion": 1, "idempotencyKey": "break-key-1", "duplicate": False,
            "carryovers": [CARRYOVER],
            "breakDay": {
                "schemaVersion": 1, "selectedDate": "2026-08-17", "revision": 1,
                "sourceRunId": "run-1", "capacityMinutes": 120, "totalMinutes": 60,
                "blocks": [{**CARRYOVER, "destinationDate": None, "scheduleVersion": None}],
                "status": "approved", "approvalEventId": "approval-1",
            },
        })
