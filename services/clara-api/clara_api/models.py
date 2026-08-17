from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class PlanContext(StrictModel):
    id: str = Field(min_length=1, max_length=128)
    title: str = Field(min_length=3, max_length=80)
    outcome: str = Field(min_length=10, max_length=300)
    target_date: date = Field(alias="targetDate")
    weekly_hours: int = Field(alias="weeklyHours", ge=1, le=40)


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


class RecommendationResponse(StrictModel):
    schema_version: Literal[1] = Field(alias="schemaVersion")
    request_id: str = Field(alias="requestId", min_length=1, max_length=128)
    source_plan_id: str = Field(alias="sourcePlanId", min_length=1, max_length=128)
    headline: str = Field(min_length=3, max_length=100)
    recommendation: str = Field(min_length=10, max_length=500)
    rationale: str = Field(min_length=10, max_length=500)
    confidence: Literal["low", "medium", "high"]
    requires_clarification: bool = Field(alias="requiresClarification")
    source_facts: list[str] = Field(alias="sourceFacts", min_length=1, max_length=4)
    proposed_change: None = Field(alias="proposedChange")

    @model_validator(mode="after")
    def validate_source_facts(self):
        if any(len(fact.strip()) < 3 or len(fact.strip()) > 120 for fact in self.source_facts):
            raise ValueError("source facts must contain 3 to 120 characters")
        return self
