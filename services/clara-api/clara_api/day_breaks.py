import asyncio
import hashlib
import json
import os
from datetime import date, timedelta
from functools import lru_cache
from typing import Protocol

import firebase_admin
from firebase_admin import firestore as admin_firestore
from google.cloud import firestore

from .approved_days import _public_day
from .models import DayBreakCarryover, DayBreakPreview, DayBreakRequest, DayBreakResponse


WORKING_DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


class DayBreakNotFoundError(Exception):
    pass


class DayBreakConflictError(Exception):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


class DayBreakUnavailableError(Exception):
    pass


class DayBreakRepository(Protocol):
    async def preview(self, user_id: str, selected_date: str) -> DayBreakPreview: ...
    async def confirm(
        self, user_id: str, selected_date: str, request: DayBreakRequest
    ) -> DayBreakResponse: ...


def _fingerprint(selected_date: str, request: DayBreakRequest) -> str:
    encoded = json.dumps(
        {"selectedDate": selected_date, **request.model_dump(mode="json", by_alias=True)},
        sort_keys=True,
        separators=(",", ":"),
    ).encode()
    return hashlib.sha256(encoded).hexdigest()


def _next_eligible_day(selected_date: date, working_days: list[str]) -> date:
    if not working_days or any(day not in WORKING_DAYS for day in working_days):
        raise DayBreakConflictError("no-eligible-day")
    allowed = {WORKING_DAYS.index(day) for day in working_days}
    for offset in range(1, 8):
        candidate = selected_date + timedelta(days=offset)
        if candidate.weekday() in allowed:
            return candidate
    raise DayBreakConflictError("no-eligible-day")


def _validate_plan(user_id: str, plan_id: str, value: dict) -> tuple[list[str], int]:
    days = value.get("workingDays")
    version = value.get("scheduleVersion")
    if (
        value.get("id") != plan_id
        or value.get("ownerUid") != user_id
        or value.get("workspaceId") != "default"
        or value.get("status") != "active"
        or value.get("schemaVersion") != 2
        or not isinstance(version, int)
        or version < 1
        or not isinstance(days, list)
        or not days
        or len(days) != len(set(days))
        or any(day not in WORKING_DAYS for day in days)
    ):
        raise DayBreakConflictError("no-eligible-day")
    return days, version


class FirestoreDayBreakRepository:
    def __init__(self, client=None) -> None:
        self._client = client

    def client(self):
        if self._client is not None:
            return self._client
        try:
            firebase_admin.get_app()
        except ValueError:
            firebase_admin.initialize_app(options={
                "projectId": os.getenv("GOOGLE_CLOUD_PROJECT", "longview-505611")
            })
        self._client = admin_firestore.client()
        return self._client

    def _root(self, user_id: str) -> str:
        return f"users/{user_id}/workspaces/default"

    def _carryover_id(self, source_date: str, value: DayBreakCarryover) -> str:
        return f"{source_date}--{value.destination_date.isoformat()}--{value.plan_id}--{value.order}"

    async def preview(self, user_id: str, selected_date: str) -> DayBreakPreview:
        try:
            return await asyncio.to_thread(self._preview, user_id, selected_date)
        except (DayBreakNotFoundError, DayBreakConflictError):
            raise
        except Exception as error:
            raise DayBreakUnavailableError("day break preview failed") from error

    def _preview(self, user_id: str, selected_date: str) -> DayBreakPreview:
        client = self.client()
        root = self._root(user_id)
        day_snapshot = client.document(f"{root}/approvedDays/{selected_date}").get()
        if not day_snapshot.exists:
            raise DayBreakNotFoundError("approved day not found")
        stored_day = day_snapshot.to_dict() or {}
        if stored_day.get("ownerUid") != user_id or stored_day.get("workspaceId") != "default":
            raise DayBreakNotFoundError("approved day not found")
        day = _public_day(stored_day)
        if day.status != "approved":
            raise DayBreakConflictError("source-changed")

        carryovers = []
        destination_dates: set[str] = set()
        for block in day.blocks:
            plan_snapshot = client.document(f"{root}/plans/{block.plan_id}").get()
            if not plan_snapshot.exists:
                raise DayBreakConflictError("no-eligible-day")
            working_days, schedule_version = _validate_plan(
                user_id, block.plan_id, plan_snapshot.to_dict() or {}
            )
            destination = _next_eligible_day(day.selected_date, working_days)
            destination_date = destination.isoformat()
            destination_dates.add(destination_date)
            carryovers.append(DayBreakCarryover(
                order=block.order,
                planId=block.plan_id,
                planTitle=block.plan_title,
                title=block.title,
                durationMinutes=block.duration_minutes,
                destinationDate=destination_date,
                scheduleVersion=schedule_version,
            ))

        for destination_date in destination_dates:
            if client.document(f"{root}/approvedDays/{destination_date}").get().exists:
                raise DayBreakConflictError("future-approved")
        for value in carryovers:
            if client.document(f"{root}/pendingCarryovers/{self._carryover_id(selected_date, value)}").get().exists:
                raise DayBreakConflictError("future-approved")

        return DayBreakPreview(
            schemaVersion=1,
            selectedDate=selected_date,
            expectedDayRevision=day.revision,
            sourceApprovalEventId=day.approval_event_id,
            carryovers=carryovers,
        )

    async def confirm(
        self, user_id: str, selected_date: str, request: DayBreakRequest
    ) -> DayBreakResponse:
        try:
            return await asyncio.to_thread(self._confirm, user_id, selected_date, request)
        except (DayBreakNotFoundError, DayBreakConflictError):
            raise
        except Exception as error:
            raise DayBreakUnavailableError("day break transaction failed") from error

    def _confirm(
        self, user_id: str, selected_date: str, request: DayBreakRequest
    ) -> DayBreakResponse:
        client = self.client()
        root = self._root(user_id)
        day_ref = client.document(f"{root}/approvedDays/{selected_date}")
        audit_ref = client.document(f"{root}/auditEvents/{request.idempotency_key}")
        fingerprint = _fingerprint(selected_date, request)
        transaction = client.transaction()

        @firestore.transactional
        def confirm_transaction(active_transaction):
            audit_snapshot = audit_ref.get(transaction=active_transaction)
            if audit_snapshot.exists:
                audit = audit_snapshot.to_dict() or {}
                if audit.get("requestFingerprint") != fingerprint or audit.get("kind") != "calendar-day-break":
                    raise DayBreakConflictError("idempotency-conflict")
                return DayBreakResponse.model_validate({**audit["result"], "duplicate": True})

            day_snapshot = day_ref.get(transaction=active_transaction)
            if not day_snapshot.exists:
                raise DayBreakNotFoundError("approved day not found")
            stored_day = day_snapshot.to_dict() or {}
            if stored_day.get("ownerUid") != user_id or stored_day.get("workspaceId") != "default":
                raise DayBreakNotFoundError("approved day not found")
            day = _public_day(stored_day)
            if day.status != "approved" or day.revision != request.expected_day_revision:
                raise DayBreakConflictError("source-changed")
            if len(day.blocks) != len(request.carryovers):
                raise DayBreakConflictError("source-changed")

            pending_refs = []
            for block, reviewed in zip(day.blocks, request.carryovers, strict=True):
                plan_ref = client.document(f"{root}/plans/{block.plan_id}")
                plan_snapshot = plan_ref.get(transaction=active_transaction)
                if not plan_snapshot.exists:
                    raise DayBreakConflictError("no-eligible-day")
                working_days, schedule_version = _validate_plan(
                    user_id, block.plan_id, plan_snapshot.to_dict() or {}
                )
                destination = _next_eligible_day(day.selected_date, working_days)
                expected = DayBreakCarryover(
                    order=block.order,
                    planId=block.plan_id,
                    planTitle=block.plan_title,
                    title=block.title,
                    durationMinutes=block.duration_minutes,
                    destinationDate=destination.isoformat(),
                    scheduleVersion=schedule_version,
                )
                if reviewed != expected:
                    raise DayBreakConflictError("source-changed")
                destination_ref = client.document(
                    f"{root}/approvedDays/{reviewed.destination_date.isoformat()}"
                )
                if destination_ref.get(transaction=active_transaction).exists:
                    raise DayBreakConflictError("future-approved")
                pending_ref = client.document(
                    f"{root}/pendingCarryovers/{self._carryover_id(selected_date, reviewed)}"
                )
                if pending_ref.get(transaction=active_transaction).exists:
                    raise DayBreakConflictError("future-approved")
                pending_refs.append((pending_ref, reviewed))

            break_day = day.model_copy(update={
                "revision": day.revision + 1,
                "status": "break",
                "break_event_id": request.idempotency_key,
                "carryover_count": len(request.carryovers),
            })
            result = DayBreakResponse(
                schemaVersion=1,
                idempotencyKey=request.idempotency_key,
                duplicate=False,
                breakDay=break_day,
                carryovers=request.carryovers,
            )
            active_transaction.set(day_ref, {
                **break_day.model_dump(mode="json", by_alias=True),
                "ownerUid": user_id,
                "workspaceId": "default",
                "updatedAt": firestore.SERVER_TIMESTAMP,
            })
            for pending_ref, value in pending_refs:
                active_transaction.set(pending_ref, {
                    **value.model_dump(mode="json", by_alias=True),
                    "id": pending_ref.id,
                    "ownerUid": user_id,
                    "workspaceId": "default",
                    "sourceDate": selected_date,
                    "sourceDayRevision": day.revision,
                    "breakEventId": request.idempotency_key,
                    "status": "pending",
                    "createdAt": firestore.SERVER_TIMESTAMP,
                })
            active_transaction.set(audit_ref, {
                "id": request.idempotency_key,
                "ownerUid": user_id,
                "workspaceId": "default",
                "kind": "calendar-day-break",
                "selectedDate": selected_date,
                "requestFingerprint": fingerprint,
                "beforeRevision": day.revision,
                "afterRevision": break_day.revision,
                "result": result.model_dump(mode="json", by_alias=True),
                "createdAt": firestore.SERVER_TIMESTAMP,
            })
            return result

        return confirm_transaction(transaction)


@lru_cache(maxsize=1)
def default_day_break_repository() -> DayBreakRepository:
    return FirestoreDayBreakRepository()
