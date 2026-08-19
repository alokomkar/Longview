from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


WORKING_DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


def _validate_working_days(days: list[str]) -> None:
    if len(set(days)) != len(days):
        raise ValueError("working days must be unique")
    if days != [day for day in WORKING_DAYS if day in days]:
        raise ValueError("working days must use calendar order")


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class PlanContext(StrictModel):
    id: str = Field(min_length=1, max_length=128)
    title: str = Field(min_length=3, max_length=80)
    outcome: str = Field(min_length=10, max_length=300)
    target_date: date = Field(alias="targetDate")
    weekly_hours: int = Field(alias="weeklyHours", ge=1, le=40)
    working_days: list[Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]] = Field(
        alias="workingDays", min_length=1, max_length=7
    )
    schedule_version: int = Field(alias="scheduleVersion", ge=1)

    @model_validator(mode="after")
    def validate_working_days(self):
        _validate_working_days(self.working_days)
        return self


class StepContext(StrictModel):
    title: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=3, max_length=500)
    duration_minutes: int = Field(alias="durationMinutes", ge=1, le=480)
    date: date


class RecommendationRequest(StrictModel):
    schema_version: Literal[1] = Field(alias="schemaVersion")
    request_id: str = Field(alias="requestId", min_length=1, max_length=128)
    scope: Literal["plan", "today-step"]
    plan: PlanContext
    step: StepContext | None = None

    @model_validator(mode="after")
    def validate_scope(self):
        if self.scope == "today-step" and self.step is None:
            raise ValueError("today-step scope requires a step")
        if self.scope == "plan" and self.step is not None:
            raise ValueError("plan scope cannot include a step")
        return self


class ModelPlanScheduleChange(StrictModel):
    working_days_after: list[
        Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    ] = Field(alias="workingDaysAfter", min_length=1, max_length=7)
    rationale: str = Field(min_length=10, max_length=300)
    downstream_effect: str = Field(alias="downstreamEffect", min_length=10, max_length=300)

    @model_validator(mode="after")
    def validate_working_days(self):
        _validate_working_days(self.working_days_after)
        return self


class ModelRecommendationPayload(StrictModel):
    headline: str = Field(min_length=3, max_length=100)
    recommendation: str = Field(min_length=10, max_length=500)
    rationale: str = Field(min_length=10, max_length=500)
    confidence: Literal["low", "medium", "high"]
    requires_clarification: bool = Field(alias="requiresClarification")
    source_facts: list[str] = Field(alias="sourceFacts", min_length=1, max_length=4)
    proposed_change: ModelPlanScheduleChange | None = Field(default=None, alias="proposedChange")

    @model_validator(mode="after")
    def validate_source_facts(self):
        if any(len(fact.strip()) < 3 or len(fact.strip()) > 120 for fact in self.source_facts):
            raise ValueError("source facts must contain 3 to 120 characters")
        return self


class PlanScheduleChangePreview(StrictModel):
    kind: Literal["plan-working-days"]
    plan_id: str = Field(alias="planId", min_length=1, max_length=128)
    expected_schedule_version: int = Field(alias="expectedScheduleVersion", ge=1)
    working_days_before: list[
        Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    ] = Field(alias="workingDaysBefore", min_length=1, max_length=7)
    working_days_after: list[
        Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    ] = Field(alias="workingDaysAfter", min_length=1, max_length=7)
    weekly_hours: int = Field(alias="weeklyHours", ge=1, le=40)
    rationale: str = Field(min_length=10, max_length=300)
    downstream_effect: str = Field(alias="downstreamEffect", min_length=10, max_length=300)

    @model_validator(mode="after")
    def validate_schedule_change(self):
        _validate_working_days(self.working_days_before)
        _validate_working_days(self.working_days_after)
        if len(set(self.working_days_before).symmetric_difference(self.working_days_after)) != 1:
            raise ValueError("proposal must change exactly one working day")
        return self


class RecommendationResponse(ModelRecommendationPayload):
    schema_version: Literal[1] = Field(alias="schemaVersion")
    request_id: str = Field(alias="requestId", min_length=1, max_length=128)
    source_plan_id: str = Field(alias="sourcePlanId", min_length=1, max_length=128)
    proposed_change: PlanScheduleChangePreview | None = Field(alias="proposedChange")


class ResearchPlanContext(StrictModel):
    id: str = Field(min_length=1, max_length=128)
    title: str = Field(min_length=3, max_length=80)
    outcome: str = Field(min_length=10, max_length=300)
    why: str = Field(min_length=10, max_length=300)
    target_date: date = Field(alias="targetDate")


class ResearchRequest(StrictModel):
    schema_version: Literal[1] = Field(alias="schemaVersion")
    request_id: str = Field(alias="requestId", min_length=8, max_length=128)
    plan: ResearchPlanContext
    existing_research_ids: list[str] = Field(alias="existingResearchIds", max_length=50)

    @model_validator(mode="after")
    def validate_existing_ids(self):
        if len(set(self.existing_research_ids)) != len(self.existing_research_ids):
            raise ValueError("existing research identifiers must be unique")
        if any(len(value) < 8 or len(value) > 128 for value in self.existing_research_ids):
            raise ValueError("invalid existing research identifier")
        return self


class ModelResearchCard(StrictModel):
    headline: str = Field(min_length=3, max_length=160)
    finding: str = Field(min_length=10, max_length=800)
    source_index: int = Field(alias="sourceIndex", ge=0, le=20)


class ModelResearchPayload(StrictModel):
    cards: list[ModelResearchCard] = Field(min_length=1, max_length=3)


class ResearchSource(StrictModel):
    kind: Literal["web"]
    title: str = Field(min_length=3, max_length=200)
    locator: str = Field(pattern=r"^https://", max_length=1000)
    domain: str | None = Field(default=None, min_length=3, max_length=200)
    published_at: datetime | None = Field(default=None, alias="publishedAt")
    retrieved_at: datetime = Field(alias="retrievedAt")
    search_queries: list[str] = Field(default_factory=list, alias="searchQueries", max_length=3)

    @model_validator(mode="after")
    def validate_search_queries(self):
        if any(len(query.strip()) < 1 or len(query.strip()) > 200 for query in self.search_queries):
            raise ValueError("search queries must contain 1 to 200 characters")
        return self


class ResearchCard(StrictModel):
    schema_version: Literal[1] = Field(alias="schemaVersion")
    research_id: str = Field(alias="researchId", min_length=8, max_length=128)
    request_id: str = Field(alias="requestId", min_length=8, max_length=128)
    source_plan_id: str = Field(alias="sourcePlanId", min_length=1, max_length=128)
    headline: str = Field(min_length=3, max_length=160)
    finding: str = Field(min_length=10, max_length=800)
    source: ResearchSource


class ResearchResponse(StrictModel):
    schema_version: Literal[1] = Field(alias="schemaVersion")
    request_id: str = Field(alias="requestId", min_length=8, max_length=128)
    source_plan_id: str = Field(alias="sourcePlanId", min_length=1, max_length=128)
    cards: list[ResearchCard] = Field(min_length=1, max_length=3)


class ApprovalRequest(StrictModel):
    schema_version: Literal[1] = Field(alias="schemaVersion")
    idempotency_key: str = Field(alias="idempotencyKey", min_length=8, max_length=128)
    proposal: PlanScheduleChangePreview


class ApprovalResponse(StrictModel):
    schema_version: Literal[1] = Field(alias="schemaVersion")
    idempotency_key: str = Field(alias="idempotencyKey", min_length=8, max_length=128)
    plan_id: str = Field(alias="planId", min_length=1, max_length=128)
    schedule_version: int = Field(alias="scheduleVersion", ge=2)
    working_days: list[
        Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    ] = Field(alias="workingDays", min_length=1, max_length=7)
    weekly_hours: int = Field(alias="weeklyHours", ge=1, le=40)
    audit_event_id: str = Field(alias="auditEventId", min_length=1, max_length=128)
    duplicate: bool


class ScheduleRunPlanContext(StrictModel):
    id: str = Field(min_length=1, max_length=128)
    title: str = Field(min_length=3, max_length=80)
    target_date: date = Field(alias="targetDate")
    weekly_hours: int = Field(alias="weeklyHours", ge=1, le=40)
    working_days: list[Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]] = Field(
        alias="workingDays", min_length=1, max_length=7
    )
    mode: Literal["Focus", "Maintain", "Prepare"]

    @model_validator(mode="after")
    def validate_working_days(self):
        _validate_working_days(self.working_days)
        return self


class ScheduleRunStepContext(StrictModel):
    plan_id: str = Field(alias="planId", min_length=1, max_length=128)
    plan_title: str = Field(alias="planTitle", min_length=3, max_length=80)
    title: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=3, max_length=500)
    duration_minutes: int = Field(alias="durationMinutes", ge=1, le=480)


class CreateScheduleRunRequest(StrictModel):
    schema_version: Literal[1] = Field(alias="schemaVersion")
    request_id: str = Field(alias="requestId", min_length=1, max_length=128)
    selected_date: date = Field(alias="selectedDate")
    capacity_minutes: int = Field(alias="capacityMinutes", ge=30, le=480)
    plans: list[ScheduleRunPlanContext] = Field(min_length=1, max_length=10)
    steps: list[ScheduleRunStepContext] = Field(min_length=1, max_length=10)
    retry_of: str | None = Field(default=None, alias="retryOf", max_length=128)

    @model_validator(mode="after")
    def validate_plan_references(self):
        plan_ids = {plan.id for plan in self.plans}
        if len(plan_ids) != len(self.plans):
            raise ValueError("plan ids must be unique")
        if any(step.plan_id not in plan_ids for step in self.steps):
            raise ValueError("every step must reference a supplied plan")
        return self


class ScheduleBlock(StrictModel):
    plan_id: str = Field(alias="planId", min_length=1, max_length=128)
    plan_title: str = Field(alias="planTitle", min_length=3, max_length=80)
    title: str = Field(min_length=3, max_length=120)
    duration_minutes: int = Field(alias="durationMinutes", ge=1, le=480)


class ScheduleProposal(StrictModel):
    selected_date: date = Field(alias="selectedDate")
    capacity_minutes: int = Field(alias="capacityMinutes", ge=30, le=480)
    total_minutes: int = Field(alias="totalMinutes", ge=1, le=480)
    rationale: str = Field(min_length=10, max_length=300)
    blocks: list[ScheduleBlock] = Field(min_length=1, max_length=10)

    @model_validator(mode="after")
    def validate_totals(self):
        if self.total_minutes > self.capacity_minutes:
            raise ValueError("proposal exceeds capacity")
        if sum(block.duration_minutes for block in self.blocks) != self.total_minutes:
            raise ValueError("proposal total must equal its blocks")
        return self


class ScheduleRun(StrictModel):
    schema_version: Literal[1] = Field(alias="schemaVersion")
    run_id: str = Field(alias="runId", min_length=1, max_length=128)
    request_id: str = Field(alias="requestId", min_length=1, max_length=128)
    selected_date: date = Field(alias="selectedDate")
    status: Literal["queued", "running", "succeeded", "cancelled", "failed", "timed-out"]
    checkpoint: int = Field(ge=1, le=4)
    checkpoint_label: str = Field(alias="checkpointLabel", min_length=3, max_length=80)
    retry_of: str | None = Field(default=None, alias="retryOf", max_length=128)
    proposal: ScheduleProposal | None = None
    failure: str | None = Field(default=None, max_length=160)

    @model_validator(mode="after")
    def validate_terminal_state(self):
        if self.status == "succeeded" and (self.checkpoint != 4 or self.proposal is None or self.failure):
            raise ValueError("successful runs require one published proposal")
        if self.status != "succeeded" and self.proposal is not None:
            raise ValueError("only successful runs may expose a proposal")
        if self.status in {"failed", "timed-out"} and not self.failure:
            raise ValueError("failed runs require a reason")
        return self


class DayApprovalRequest(StrictModel):
    schema_version: Literal[1] = Field(alias="schemaVersion")
    idempotency_key: str = Field(alias="idempotencyKey", min_length=8, max_length=128)
    expected_day_revision: int = Field(alias="expectedDayRevision", ge=0)
    replace_current: bool = Field(alias="replaceCurrent")


class ApprovedDayBlock(ScheduleBlock):
    order: int = Field(ge=1, le=10)


class ApprovedDay(StrictModel):
    schema_version: Literal[1] = Field(alias="schemaVersion")
    selected_date: date = Field(alias="selectedDate")
    revision: int = Field(ge=1)
    source_run_id: str = Field(alias="sourceRunId", min_length=1, max_length=128)
    capacity_minutes: int = Field(alias="capacityMinutes", ge=30, le=480)
    total_minutes: int = Field(alias="totalMinutes", ge=1, le=480)
    blocks: list[ApprovedDayBlock] = Field(min_length=1, max_length=10)
    status: Literal["approved", "break"]
    approval_event_id: str = Field(alias="approvalEventId", min_length=8, max_length=128)
    break_event_id: str | None = Field(default=None, alias="breakEventId", min_length=8, max_length=128)
    carryover_count: int | None = Field(default=None, alias="carryoverCount", ge=1, le=10)

    @model_validator(mode="after")
    def validate_day(self):
        if self.total_minutes > self.capacity_minutes:
            raise ValueError("approved day exceeds capacity")
        if sum(block.duration_minutes for block in self.blocks) != self.total_minutes:
            raise ValueError("approved day total must equal its blocks")
        if [block.order for block in self.blocks] != list(range(1, len(self.blocks) + 1)):
            raise ValueError("approved day blocks must use consecutive order")
        if self.status == "approved" and (self.break_event_id is not None or self.carryover_count is not None):
            raise ValueError("approved days cannot contain break metadata")
        if self.status == "break" and (self.break_event_id is None or self.carryover_count is None):
            raise ValueError("break days require break metadata")
        return self


class DayApprovalResponse(StrictModel):
    schema_version: Literal[1] = Field(alias="schemaVersion")
    idempotency_key: str = Field(alias="idempotencyKey", min_length=8, max_length=128)
    duplicate: bool
    approved_day: ApprovedDay = Field(alias="approvedDay")


class DayBreakCarryover(StrictModel):
    order: int = Field(ge=1, le=10)
    plan_id: str = Field(alias="planId", min_length=1, max_length=128)
    plan_title: str = Field(alias="planTitle", min_length=3, max_length=80)
    title: str = Field(min_length=3, max_length=120)
    duration_minutes: int = Field(alias="durationMinutes", ge=1, le=480)
    destination_date: date = Field(alias="destinationDate")
    schedule_version: int = Field(alias="scheduleVersion", ge=1)


class DayBreakPreview(StrictModel):
    schema_version: Literal[1] = Field(alias="schemaVersion")
    selected_date: date = Field(alias="selectedDate")
    expected_day_revision: int = Field(alias="expectedDayRevision", ge=1)
    source_approval_event_id: str = Field(alias="sourceApprovalEventId", min_length=8, max_length=128)
    carryovers: list[DayBreakCarryover] = Field(min_length=1, max_length=10)

    @model_validator(mode="after")
    def validate_orders(self):
        if [value.order for value in self.carryovers] != list(range(1, len(self.carryovers) + 1)):
            raise ValueError("break carryovers must use consecutive order")
        return self


class DayBreakRequest(StrictModel):
    schema_version: Literal[1] = Field(alias="schemaVersion")
    idempotency_key: str = Field(alias="idempotencyKey", min_length=8, max_length=128)
    expected_day_revision: int = Field(alias="expectedDayRevision", ge=1)
    carryovers: list[DayBreakCarryover] = Field(min_length=1, max_length=10)

    @model_validator(mode="after")
    def validate_orders(self):
        if [value.order for value in self.carryovers] != list(range(1, len(self.carryovers) + 1)):
            raise ValueError("break carryovers must use consecutive order")
        return self


class DayBreakResponse(StrictModel):
    schema_version: Literal[1] = Field(alias="schemaVersion")
    idempotency_key: str = Field(alias="idempotencyKey", min_length=8, max_length=128)
    duplicate: bool
    break_day: ApprovedDay = Field(alias="breakDay")
    carryovers: list[DayBreakCarryover] = Field(min_length=1, max_length=10)

    @model_validator(mode="after")
    def validate_break(self):
        if self.break_day.status != "break" or self.break_day.carryover_count != len(self.carryovers):
            raise ValueError("break result must match its carryovers")
        return self
