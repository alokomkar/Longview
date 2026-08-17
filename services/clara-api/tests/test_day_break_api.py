from fastapi.testclient import TestClient
import pytest

from clara_api.day_breaks import DayBreakConflictError, DayBreakNotFoundError, DayBreakUnavailableError
from clara_api.main import create_app
from clara_api.models import ApprovedDay, DayBreakPreview, DayBreakResponse


class Verifier:
    async def verify(self, _token):
        return "owner-1"


PREVIEW = DayBreakPreview.model_validate({
    "schemaVersion": 1, "selectedDate": "2026-08-17", "expectedDayRevision": 1,
    "sourceApprovalEventId": "approval-1",
    "carryovers": [{"order": 1, "planId": "plan-1", "planTitle": "Launch Longview",
                    "title": "Define the first proof", "durationMinutes": 60,
                    "destinationDate": "2026-08-18", "scheduleVersion": 2}],
})
BREAK_DAY = ApprovedDay.model_validate({
    "schemaVersion": 1, "selectedDate": "2026-08-17", "revision": 2,
    "sourceRunId": "run-1", "capacityMinutes": 120, "totalMinutes": 60,
    "blocks": [{"order": 1, "planId": "plan-1", "planTitle": "Launch Longview",
                "title": "Define the first proof", "durationMinutes": 60}],
    "status": "break", "approvalEventId": "approval-1", "breakEventId": "break-key-1",
    "carryoverCount": 1,
})


class Repository:
    def __init__(self, error=None):
        self.error, self.calls = error, []

    async def preview(self, user_id, selected_date):
        self.calls.append(("preview", user_id, selected_date))
        if self.error: raise self.error
        return PREVIEW

    async def confirm(self, user_id, selected_date, request):
        self.calls.append(("confirm", user_id, selected_date, request))
        if self.error: raise self.error
        return DayBreakResponse(
            schemaVersion=1, idempotencyKey=request.idempotency_key, duplicate=False,
            breakDay=BREAK_DAY, carryovers=PREVIEW.carryovers,
        )


def api(repository):
    return TestClient(create_app(verifier=Verifier(), day_break_repository=repository))


def test_preview_and_confirm_are_authenticated_and_owner_scoped():
    repository = Repository()
    client = api(repository)
    headers = {"Authorization": "Bearer token"}
    assert client.get("/v1/clara/approved-days/2026-08-17/break-preview", headers=headers).status_code == 200
    response = client.post("/v1/clara/approved-days/2026-08-17/break", headers=headers, json={
        "schemaVersion": 1, "idempotencyKey": "break-key-1", "expectedDayRevision": 1,
        "carryovers": PREVIEW.model_dump(mode="json", by_alias=True)["carryovers"],
    })
    assert response.status_code == 200 and response.json()["breakDay"]["status"] == "break"
    assert [(call[0], call[1]) for call in repository.calls] == [
        ("preview", "owner-1"), ("confirm", "owner-1")
    ]


@pytest.mark.parametrize("error,status,detail", [
    (DayBreakNotFoundError(), 404, "Approved day not found"),
    (DayBreakConflictError("future-approved"), 409, "future-approved"),
    (DayBreakUnavailableError(), 503, "Day break unavailable"),
])
def test_day_break_errors_are_safe(error, status, detail):
    response = api(Repository(error)).get(
        "/v1/clara/approved-days/2026-08-17/break-preview",
        headers={"Authorization": "Bearer token"},
    )
    assert response.status_code == status and response.json()["detail"] == detail
