from datetime import date
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
    scope: Literal["today-step"]
    plan: PlanContext
    step: StepContext


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
