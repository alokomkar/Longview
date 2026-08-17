import asyncio
import os
from functools import lru_cache

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from .approval import (
    ApprovalConflictError,
    ApprovalNotFoundError,
    ApprovalRepository,
    ApprovalUnavailableError,
    default_approval_repository,
)
from .auth import AuthenticationError, FirebaseTokenVerifier, TokenVerifier, bearer_token
from .engine import AdkRecommendationEngine, EngineUnavailableError, RecommendationEngine
from .models import (
    ApprovalRequest,
    ApprovalResponse,
    CreateScheduleRunRequest,
    RecommendationRequest,
    RecommendationResponse,
    ScheduleRun,
)
from .schedule_runs import (
    ScheduleRunCoordinator,
    ScheduleRunNotFoundError,
    ScheduleRunUnavailableError,
    default_schedule_run_coordinator,
)


@lru_cache(maxsize=1)
def default_engine() -> RecommendationEngine:
    return AdkRecommendationEngine()


def create_app(
    verifier: TokenVerifier | None = None,
    engine: RecommendationEngine | None = None,
    approval_repository: ApprovalRepository | None = None,
    schedule_run_coordinator: ScheduleRunCoordinator | None = None,
    timeout_seconds: float | None = None,
    allowed_origins: list[str] | None = None,
) -> FastAPI:
    app = FastAPI(title="Longview Clara API", version="0.1.0")
    request_timeout = timeout_seconds if timeout_seconds is not None else float(
        os.getenv("CLARA_TIMEOUT_SECONDS", "15")
    )
    if request_timeout <= 0:
        raise ValueError("CLARA_TIMEOUT_SECONDS must be greater than zero")
    origins = allowed_origins if allowed_origins is not None else [
        origin.strip()
        for origin in os.getenv("CLARA_ALLOWED_ORIGINS", "https://longview-505611.web.app").split(",")
        if origin.strip()
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )
    token_verifier = verifier or FirebaseTokenVerifier()

    async def authenticated_user(authorization: str | None) -> str:
        try:
            return await token_verifier.verify(bearer_token(authorization))
        except AuthenticationError as error:
            raise HTTPException(status_code=401, detail="Authentication required") from error

    @app.get("/healthz")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/v1/clara/recommendations", response_model=RecommendationResponse, response_model_by_alias=True)
    async def recommend(
        context: RecommendationRequest,
        authorization: str | None = Header(default=None),
    ) -> RecommendationResponse:
        user_id = await authenticated_user(authorization)

        try:
            active_engine = engine or default_engine()
            raw = await asyncio.wait_for(
                active_engine.recommend(context, user_id), timeout=request_timeout
            )
        except TimeoutError as error:
            raise HTTPException(status_code=504, detail="Recommendation timed out") from error
        except (EngineUnavailableError, ImportError) as error:
            raise HTTPException(status_code=503, detail="Recommendation unavailable") from error

        try:
            response = RecommendationResponse.model_validate(raw)
        except ValidationError as error:
            raise HTTPException(status_code=502, detail="Invalid recommendation response") from error
        if response.request_id != context.request_id or response.source_plan_id != context.plan.id:
            raise HTTPException(status_code=502, detail="Mismatched recommendation response")
        change = response.proposed_change
        if change and (
            change.plan_id != context.plan.id
            or change.expected_schedule_version != context.plan.schedule_version
            or change.working_days_before != context.plan.working_days
            or change.weekly_hours != context.plan.weekly_hours
            or len(set(change.working_days_before).symmetric_difference(change.working_days_after)) != 1
        ):
            raise HTTPException(status_code=502, detail="Invalid recommendation change")
        return response

    @app.post("/v1/clara/approvals", response_model=ApprovalResponse, response_model_by_alias=True)
    async def approve(
        request: ApprovalRequest,
        authorization: str | None = Header(default=None),
    ) -> ApprovalResponse:
        user_id = await authenticated_user(authorization)
        repository = approval_repository or default_approval_repository()
        try:
            return await repository.apply(user_id, request)
        except ApprovalNotFoundError as error:
            raise HTTPException(status_code=404, detail="Plan not found") from error
        except ApprovalConflictError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        except ApprovalUnavailableError as error:
            raise HTTPException(status_code=503, detail="Approval unavailable") from error

    def runs() -> ScheduleRunCoordinator:
        return schedule_run_coordinator or default_schedule_run_coordinator()

    @app.post(
        "/v1/clara/schedule-runs",
        response_model=ScheduleRun,
        response_model_by_alias=True,
        status_code=202,
    )
    async def create_schedule_run(
        request: CreateScheduleRunRequest,
        authorization: str | None = Header(default=None),
    ) -> ScheduleRun:
        user_id = await authenticated_user(authorization)
        try:
            return await runs().create(user_id, request)
        except ScheduleRunUnavailableError as error:
            raise HTTPException(status_code=503, detail="Schedule run unavailable") from error

    @app.get(
        "/v1/clara/schedule-runs/{run_id}",
        response_model=ScheduleRun,
        response_model_by_alias=True,
    )
    async def get_schedule_run(
        run_id: str,
        authorization: str | None = Header(default=None),
    ) -> ScheduleRun:
        user_id = await authenticated_user(authorization)
        try:
            return await runs().get(user_id, run_id)
        except ScheduleRunNotFoundError as error:
            raise HTTPException(status_code=404, detail="Schedule run not found") from error
        except ScheduleRunUnavailableError as error:
            raise HTTPException(status_code=503, detail="Schedule run unavailable") from error

    @app.post(
        "/v1/clara/schedule-runs/{run_id}/cancel",
        response_model=ScheduleRun,
        response_model_by_alias=True,
    )
    async def cancel_schedule_run(
        run_id: str,
        authorization: str | None = Header(default=None),
    ) -> ScheduleRun:
        user_id = await authenticated_user(authorization)
        try:
            return await runs().cancel(user_id, run_id)
        except ScheduleRunNotFoundError as error:
            raise HTTPException(status_code=404, detail="Schedule run not found") from error
        except ScheduleRunUnavailableError as error:
            raise HTTPException(status_code=503, detail="Schedule run unavailable") from error

    return app


app = create_app()
