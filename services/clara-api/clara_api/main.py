import asyncio
import os
from datetime import date
from functools import lru_cache
from typing import Literal

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
from .approved_days import (
    ApprovedDayConflictError,
    ApprovedDayNotFoundError,
    ApprovedDayRepository,
    ApprovedDayUnavailableError,
    default_approved_day_repository,
)
from .auth import AuthenticationError, FirebaseTokenVerifier, TokenVerifier, bearer_token
from .day_breaks import (
    DayBreakConflictError,
    DayBreakNotFoundError,
    DayBreakRepository,
    DayBreakUnavailableError,
    default_day_break_repository,
)
from .engine import AdkRecommendationEngine, EngineUnavailableError, RecommendationEngine
from .models import (
    ApprovalRequest,
    ApprovalResponse,
    ApprovedDay,
    CreateScheduleRunRequest,
    DayApprovalRequest,
    DayApprovalResponse,
    DayBreakPreview,
    DayBreakRequest,
    DayBreakResponse,
    RecommendationRequest,
    RecommendationResponse,
    ResearchRequest,
    ResearchResponse,
    ScheduleRun,
)
from .research import GroundedResearchEngine, ResearchEngine, ResearchEngineUnavailableError
from .schedule_runs import (
    ScheduleRunCoordinator,
    ScheduleRunNotFoundError,
    ScheduleRunUnavailableError,
    default_schedule_run_coordinator,
)


@lru_cache(maxsize=2)
def default_engine(allow_proposed_changes: bool = True) -> RecommendationEngine:
    return AdkRecommendationEngine(allow_proposed_changes=allow_proposed_changes)


@lru_cache(maxsize=1)
def default_research_engine() -> ResearchEngine:
    return GroundedResearchEngine()


def create_app(
    verifier: TokenVerifier | None = None,
    engine: RecommendationEngine | None = None,
    research_engine: ResearchEngine | None = None,
    approval_repository: ApprovalRepository | None = None,
    schedule_run_coordinator: ScheduleRunCoordinator | None = None,
    approved_day_repository: ApprovedDayRepository | None = None,
    day_break_repository: DayBreakRepository | None = None,
    timeout_seconds: float | None = None,
    allowed_origins: list[str] | None = None,
    release_mode: Literal["read-only", "release-two", "release-three", "release-five", "full"] = "full",
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

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/v1/clara/recommendations", response_model=RecommendationResponse, response_model_by_alias=True)
    async def recommend(
        context: RecommendationRequest,
        authorization: str | None = Header(default=None),
    ) -> RecommendationResponse:
        user_id = await authenticated_user(authorization)

        try:
            active_engine = engine or default_engine(release_mode != "read-only")
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
        if release_mode == "read-only" and change is not None:
            raise HTTPException(status_code=502, detail="Invalid read-only recommendation response")
        if change and (
            change.plan_id != context.plan.id
            or change.expected_schedule_version != context.plan.schedule_version
            or change.working_days_before != context.plan.working_days
            or change.weekly_hours != context.plan.weekly_hours
            or len(set(change.working_days_before).symmetric_difference(change.working_days_after)) != 1
        ):
            raise HTTPException(status_code=502, detail="Invalid recommendation change")
        return response

    @app.post("/v1/clara/research", response_model=ResearchResponse, response_model_by_alias=True)
    async def research(
        context: ResearchRequest,
        authorization: str | None = Header(default=None),
    ) -> ResearchResponse:
        user_id = await authenticated_user(authorization)
        try:
            active_engine = research_engine or default_research_engine()
            raw = await asyncio.wait_for(
                active_engine.research(context, user_id), timeout=request_timeout
            )
        except TimeoutError as error:
            raise HTTPException(status_code=504, detail="Research timed out") from error
        except (ResearchEngineUnavailableError, ImportError) as error:
            raise HTTPException(status_code=503, detail="Research unavailable") from error
        try:
            response = ResearchResponse.model_validate(raw)
        except ValidationError as error:
            raise HTTPException(status_code=502, detail="Invalid research response") from error
        if response.request_id != context.request_id or response.source_plan_id != context.plan.id:
            raise HTTPException(status_code=502, detail="Mismatched research response")
        if len({card.research_id for card in response.cards}) != len(response.cards):
            raise HTTPException(status_code=502, detail="Duplicate research response")
        if any(card.research_id in context.existing_research_ids for card in response.cards):
            raise HTTPException(status_code=502, detail="Existing research returned again")
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

    def approved_days() -> ApprovedDayRepository:
        return approved_day_repository or default_approved_day_repository()

    def day_breaks() -> DayBreakRepository:
        return day_break_repository or default_day_break_repository()

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

    @app.get(
        "/v1/clara/approved-days/{selected_date}",
        response_model=ApprovedDay,
        response_model_by_alias=True,
    )
    async def get_approved_day(
        selected_date: date,
        authorization: str | None = Header(default=None),
    ) -> ApprovedDay:
        user_id = await authenticated_user(authorization)
        try:
            return await approved_days().get(user_id, selected_date.isoformat())
        except ApprovedDayNotFoundError as error:
            raise HTTPException(status_code=404, detail="Approved day not found") from error
        except ApprovedDayUnavailableError as error:
            raise HTTPException(status_code=503, detail="Approved day unavailable") from error

    @app.post(
        "/v1/clara/schedule-runs/{run_id}/approve",
        response_model=DayApprovalResponse,
        response_model_by_alias=True,
    )
    async def approve_schedule_run(
        run_id: str,
        request: DayApprovalRequest,
        authorization: str | None = Header(default=None),
    ) -> DayApprovalResponse:
        user_id = await authenticated_user(authorization)
        try:
            return await approved_days().approve(user_id, run_id, request)
        except ApprovedDayNotFoundError as error:
            raise HTTPException(status_code=404, detail="Schedule run not found") from error
        except ApprovedDayConflictError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        except ApprovedDayUnavailableError as error:
            raise HTTPException(status_code=503, detail="Approved day unavailable") from error

    @app.get(
        "/v1/clara/approved-days/{selected_date}/break-preview",
        response_model=DayBreakPreview,
        response_model_by_alias=True,
    )
    async def preview_day_break(
        selected_date: date,
        authorization: str | None = Header(default=None),
    ) -> DayBreakPreview:
        user_id = await authenticated_user(authorization)
        try:
            return await day_breaks().preview(user_id, selected_date.isoformat())
        except DayBreakNotFoundError as error:
            raise HTTPException(status_code=404, detail="Approved day not found") from error
        except DayBreakConflictError as error:
            raise HTTPException(status_code=409, detail=error.reason) from error
        except DayBreakUnavailableError as error:
            raise HTTPException(status_code=503, detail="Day break unavailable") from error

    @app.post(
        "/v1/clara/approved-days/{selected_date}/break",
        response_model=DayBreakResponse,
        response_model_by_alias=True,
    )
    async def confirm_day_break(
        selected_date: date,
        request: DayBreakRequest,
        authorization: str | None = Header(default=None),
    ) -> DayBreakResponse:
        user_id = await authenticated_user(authorization)
        try:
            return await day_breaks().confirm(user_id, selected_date.isoformat(), request)
        except DayBreakNotFoundError as error:
            raise HTTPException(status_code=404, detail="Approved day not found") from error
        except DayBreakConflictError as error:
            raise HTTPException(status_code=409, detail=error.reason) from error
        except DayBreakUnavailableError as error:
            raise HTTPException(status_code=503, detail="Day break unavailable") from error

    if release_mode != "full":
        allowed_paths = {
            "/health", "/v1/clara/recommendations", "/openapi.json", "/docs",
            "/docs/oauth2-redirect", "/redoc",
        }
        if release_mode in {"release-two", "release-three", "release-five"}:
            allowed_paths.add("/v1/clara/approvals")
        if release_mode in {"release-three", "release-five"}:
            allowed_paths.update({
                "/v1/clara/schedule-runs",
                "/v1/clara/schedule-runs/{run_id}",
                "/v1/clara/schedule-runs/{run_id}/cancel",
                "/v1/clara/schedule-runs/{run_id}/approve",
                "/v1/clara/approved-days/{selected_date}",
                "/v1/clara/approved-days/{selected_date}/break-preview",
                "/v1/clara/approved-days/{selected_date}/break",
            })
        if release_mode == "release-five":
            allowed_paths.add("/v1/clara/research")
        app.router.routes = [
            route for route in app.router.routes
            if getattr(route, "path", None) in allowed_paths
        ]

    return app


app = create_app()
