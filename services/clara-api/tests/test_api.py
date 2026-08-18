import asyncio

from fastapi.testclient import TestClient

from clara_api.auth import AuthenticationError
from clara_api.approval import ApprovalConflictError, ApprovalNotFoundError, ApprovalUnavailableError
from clara_api.approved_days import ApprovedDayConflictError, ApprovedDayNotFoundError, ApprovedDayUnavailableError
from clara_api.engine import EngineUnavailableError
from clara_api.main import create_app
from clara_api.models import ApprovalResponse, ApprovedDay, DayApprovalResponse, ScheduleRun
from clara_api.schedule_runs import ScheduleRunNotFoundError, ScheduleRunUnavailableError


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
        "workingDays": ["mon", "fri"],
        "scheduleVersion": 2,
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
PROPOSAL = {
    "kind": "plan-working-days",
    "planId": "plan-1",
    "expectedScheduleVersion": 2,
    "workingDaysBefore": ["mon", "fri"],
    "workingDaysAfter": ["mon", "wed", "fri"],
    "weeklyHours": 4,
    "rationale": "A midweek checkpoint reduces the gap between sessions.",
    "downstreamEffect": "Today can select this Plan on Wednesday without changing weekly time.",
}
SCHEDULE_REQUEST = {
    "schemaVersion": 1, "requestId": "schedule-request-1", "selectedDate": "2026-08-17",
    "capacityMinutes": 120, "retryOf": None,
    "plans": [{"id": "plan-1", "title": "Launch Longview", "targetDate": "2026-08-20",
               "weeklyHours": 4, "workingDays": ["mon", "fri"], "mode": "Focus"}],
    "steps": [{"planId": "plan-1", "planTitle": "Launch Longview", "title": "Define the first proof",
               "description": "Write one observable result.", "durationMinutes": 60}],
}
SCHEDULE_RUN = ScheduleRun.model_validate({
    "schemaVersion": 1, "runId": "run-1", "requestId": "schedule-request-1",
    "selectedDate": "2026-08-17", "status": "queued", "checkpoint": 1,
    "checkpointLabel": "Run queued", "retryOf": None, "proposal": None, "failure": None,
})


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


class ApprovalRepository:
    def __init__(self, result=None, error=None):
        self.result, self.error, self.calls = result, error, []

    async def apply(self, user_id, request):
        self.calls.append((user_id, request))
        if self.error:
            raise self.error
        return self.result


class ScheduleCoordinator:
    def __init__(self, result=SCHEDULE_RUN, error=None):
        self.result, self.error, self.calls = result, error, []

    async def create(self, user_id, request):
        self.calls.append(("create", user_id, request))
        if self.error: raise self.error
        return self.result

    async def get(self, user_id, run_id):
        self.calls.append(("get", user_id, run_id))
        if self.error: raise self.error
        return self.result

    async def cancel(self, user_id, run_id):
        self.calls.append(("cancel", user_id, run_id))
        if self.error: raise self.error
        return ScheduleRun.model_validate({**self.result.model_dump(by_alias=True), "status": "cancelled"})


APPROVED_DAY = ApprovedDay.model_validate({
    "schemaVersion": 1, "selectedDate": "2026-08-17", "revision": 1,
    "sourceRunId": "run-1", "capacityMinutes": 120, "totalMinutes": 60,
    "blocks": [{"order": 1, "planId": "plan-1", "planTitle": "Launch Longview",
                "title": "Define the first proof", "durationMinutes": 60}],
    "status": "approved", "approvalEventId": "day-approval-1",
})


class ApprovedDayRepository:
    def __init__(self, error=None):
        self.error, self.calls = error, []

    async def get(self, user_id, selected_date):
        self.calls.append(("get", user_id, selected_date))
        if self.error: raise self.error
        return APPROVED_DAY

    async def approve(self, user_id, run_id, request):
        self.calls.append(("approve", user_id, run_id, request))
        if self.error: raise self.error
        return DayApprovalResponse(
            schemaVersion=1, idempotencyKey=request.idempotency_key,
            duplicate=False, approvedDay=APPROVED_DAY,
        )


def client(verifier=None, engine=None, timeout=8, approval_repository=None, schedule_run_coordinator=None, approved_day_repository=None):
    return TestClient(create_app(
        verifier=verifier or Verifier(), engine=engine or Engine(),
        approval_repository=approval_repository, schedule_run_coordinator=schedule_run_coordinator,
        approved_day_repository=approved_day_repository,
        timeout_seconds=timeout
    ))


def read_only_client(engine=None):
    return TestClient(create_app(
        verifier=Verifier(), engine=engine or Engine(), timeout_seconds=8,
        release_mode="read-only",
    ))


def test_health_does_not_require_authentication():
    assert client().get("/health").json() == {"status": "ok"}


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


def test_schedule_run_create_poll_and_cancel_are_owner_scoped():
    coordinator = ScheduleCoordinator()
    api = client(schedule_run_coordinator=coordinator)
    headers = {"Authorization": "Bearer token"}
    assert api.post("/v1/clara/schedule-runs", json=SCHEDULE_REQUEST, headers=headers).status_code == 202
    assert api.get("/v1/clara/schedule-runs/run-1", headers=headers).status_code == 200
    cancelled = api.post("/v1/clara/schedule-runs/run-1/cancel", headers=headers)
    assert cancelled.json()["status"] == "cancelled"
    assert [(call[0], call[1]) for call in coordinator.calls] == [
        ("create", "owner-1"), ("get", "owner-1"), ("cancel", "owner-1")
    ]


def test_schedule_run_rejects_malformed_context_before_work():
    coordinator = ScheduleCoordinator()
    response = client(schedule_run_coordinator=coordinator).post(
        "/v1/clara/schedule-runs",
        json={**SCHEDULE_REQUEST, "steps": [{**SCHEDULE_REQUEST["steps"][0], "planId": "missing"}]},
        headers={"Authorization": "Bearer token"},
    )
    assert response.status_code == 422
    assert coordinator.calls == []


def test_schedule_run_maps_missing_and_unavailable_without_leaking_details():
    headers = {"Authorization": "Bearer token"}
    missing = client(schedule_run_coordinator=ScheduleCoordinator(error=ScheduleRunNotFoundError())).get(
        "/v1/clara/schedule-runs/missing", headers=headers
    )
    unavailable = client(schedule_run_coordinator=ScheduleCoordinator(error=ScheduleRunUnavailableError())).post(
        "/v1/clara/schedule-runs", json=SCHEDULE_REQUEST, headers=headers
    )
    assert missing.status_code == 404
    assert unavailable.status_code == 503


def test_approved_day_load_and_approval_are_owner_scoped():
    repository = ApprovedDayRepository()
    api = client(approved_day_repository=repository)
    headers = {"Authorization": "Bearer token"}
    loaded = api.get("/v1/clara/approved-days/2026-08-17", headers=headers)
    approved = api.post(
        "/v1/clara/schedule-runs/run-1/approve",
        json={"schemaVersion": 1, "idempotencyKey": "day-approval-1",
              "expectedDayRevision": 0, "replaceCurrent": False},
        headers=headers,
    )
    assert loaded.status_code == approved.status_code == 200
    assert approved.json()["approvedDay"]["revision"] == 1
    assert [(call[0], call[1]) for call in repository.calls] == [("get", "owner-1"), ("approve", "owner-1")]


def test_approved_day_maps_missing_conflict_and_unavailable():
    headers = {"Authorization": "Bearer token"}
    for error, status in (
        (ApprovedDayNotFoundError(), 404),
        (ApprovedDayConflictError("changed"), 409),
        (ApprovedDayUnavailableError(), 503),
    ):
        repository = ApprovedDayRepository(error)
        response = client(approved_day_repository=repository).post(
            "/v1/clara/schedule-runs/run-1/approve",
            json={"schemaVersion": 1, "idempotencyKey": "day-approval-1",
                  "expectedDayRevision": 0, "replaceCurrent": False},
            headers=headers,
        )
        assert response.status_code == status


def test_approved_day_rejects_invalid_date_payload_and_missing_auth():
    repository = ApprovedDayRepository()
    api = client(approved_day_repository=repository)
    assert api.get("/v1/clara/approved-days/not-a-date", headers={"Authorization": "Bearer token"}).status_code == 422
    assert api.post(
        "/v1/clara/schedule-runs/run-1/approve",
        json={"schemaVersion": 1, "idempotencyKey": "short", "expectedDayRevision": 0, "replaceCurrent": False},
        headers={"Authorization": "Bearer token"},
    ).status_code == 422
    assert api.get("/v1/clara/approved-days/2026-08-17").status_code == 401
    assert repository.calls == []


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


def test_accepts_plan_scope_without_a_step_and_rejects_scope_mismatches():
    plan_request = {key: value for key, value in REQUEST.items() if key != "step"}
    plan_request["scope"] = "plan"
    accepted = client().post(
        "/v1/clara/recommendations", json=plan_request,
        headers={"Authorization": "Bearer token"},
    )
    assert accepted.status_code == 200
    for body in ({**REQUEST, "step": None}, {**plan_request, "step": REQUEST["step"]}):
        assert client().post(
            "/v1/clara/recommendations", json=body,
            headers={"Authorization": "Bearer token"},
        ).status_code == 422


def test_release_one_exposes_only_health_and_read_only_recommendations():
    api = read_only_client()
    schema_paths = set(api.get("/openapi.json").json()["paths"])
    assert schema_paths == {"/health", "/v1/clara/recommendations"}
    assert api.post(
        "/v1/clara/approvals", json={}, headers={"Authorization": "Bearer token"}
    ).status_code == 404
    assert api.post(
        "/v1/clara/schedule-runs", json={}, headers={"Authorization": "Bearer token"}
    ).status_code == 404


def test_release_one_rejects_a_model_proposed_change():
    response = read_only_client(Engine({**RESPONSE, "proposedChange": PROPOSAL})).post(
        "/v1/clara/recommendations", json=REQUEST,
        headers={"Authorization": "Bearer token"},
    )
    assert response.status_code == 502


def test_accepts_one_bounded_plan_schedule_proposal():
    response = client(engine=Engine({**RESPONSE, "proposedChange": PROPOSAL})).post(
        "/v1/clara/recommendations", json=REQUEST, headers={"Authorization": "Bearer token"}
    )
    assert response.status_code == 200
    assert response.json()["proposedChange"] == PROPOSAL


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


def test_default_timeout_reads_the_service_configuration(monkeypatch):
    monkeypatch.setenv("CLARA_TIMEOUT_SECONDS", "0.001")
    response = TestClient(create_app(Verifier(), Engine(delay=0.05))).post(
        "/v1/clara/recommendations", json=REQUEST, headers={"Authorization": "Bearer token"}
    )
    assert response.status_code == 504


def test_rejects_a_non_positive_timeout(monkeypatch):
    monkeypatch.setenv("CLARA_TIMEOUT_SECONDS", "0")
    try:
        create_app(Verifier(), Engine())
        raise AssertionError("expected invalid timeout to be rejected")
    except ValueError as error:
        assert str(error) == "CLARA_TIMEOUT_SECONDS must be greater than zero"


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


def test_rejects_mismatched_or_multi_day_proposals():
    cases = [
        {**PROPOSAL, "planId": "another-plan"},
        {**PROPOSAL, "workingDaysAfter": ["mon", "tue", "wed", "fri"]},
        {**PROPOSAL, "weeklyHours": 5},
    ]
    for proposal in cases:
        response = client(engine=Engine({**RESPONSE, "proposedChange": proposal})).post(
            "/v1/clara/recommendations", json=REQUEST, headers={"Authorization": "Bearer token"}
        )
        assert response.status_code in (422, 502)


def test_approval_verifies_auth_and_returns_committed_result():
    result = ApprovalResponse.model_validate({
        "schemaVersion": 1, "idempotencyKey": "approval-123", "planId": "plan-1",
        "scheduleVersion": 3, "workingDays": ["mon", "wed", "fri"], "weeklyHours": 4,
        "auditEventId": "approval-123", "duplicate": False,
    })
    repository = ApprovalRepository(result=result)
    response = client(approval_repository=repository).post(
        "/v1/clara/approvals",
        json={"schemaVersion": 1, "idempotencyKey": "approval-123", "proposal": PROPOSAL},
        headers={"Authorization": "Bearer token"},
    )
    assert response.status_code == 200
    assert response.json()["scheduleVersion"] == 3
    assert repository.calls[0][0] == "owner-1"


def test_approval_maps_conflict_missing_and_unavailable_without_retrying():
    cases = [
        (ApprovalConflictError("Plan schedule changed"), 409),
        (ApprovalNotFoundError(), 404),
        (ApprovalUnavailableError(), 503),
    ]
    for error, status in cases:
        repository = ApprovalRepository(error=error)
        response = client(approval_repository=repository).post(
            "/v1/clara/approvals",
            json={"schemaVersion": 1, "idempotencyKey": "approval-123", "proposal": PROPOSAL},
            headers={"Authorization": "Bearer token"},
        )
        assert response.status_code == status
        assert len(repository.calls) == 1


def test_approval_rejects_invalid_payload_and_missing_auth_before_repository():
    repository = ApprovalRepository()
    invalid = client(approval_repository=repository).post(
        "/v1/clara/approvals",
        json={"schemaVersion": 1, "idempotencyKey": "short", "proposal": PROPOSAL},
        headers={"Authorization": "Bearer token"},
    )
    unauthenticated = client(approval_repository=repository).post(
        "/v1/clara/approvals",
        json={"schemaVersion": 1, "idempotencyKey": "approval-123", "proposal": PROPOSAL},
    )
    assert invalid.status_code == 422
    assert unauthenticated.status_code == 401
    assert repository.calls == []
