import asyncio
import hashlib
import json
import os
from functools import lru_cache
from typing import Protocol

import firebase_admin
from firebase_admin import firestore as admin_firestore
from google.cloud import firestore

from .models import ApprovedDay, DayApprovalRequest, DayApprovalResponse, ScheduleRun


class ApprovedDayNotFoundError(Exception):
    pass


class ApprovedDayConflictError(Exception):
    pass


class ApprovedDayUnavailableError(Exception):
    pass


class ApprovedDayRepository(Protocol):
    async def get(self, user_id: str, selected_date: str) -> ApprovedDay: ...
    async def approve(self, user_id: str, run_id: str, request: DayApprovalRequest) -> DayApprovalResponse: ...


def _fingerprint(run_id: str, request: DayApprovalRequest) -> str:
    encoded = json.dumps(
        {"runId": run_id, **request.model_dump(mode="json", by_alias=True)},
        sort_keys=True,
        separators=(",", ":"),
    ).encode()
    return hashlib.sha256(encoded).hexdigest()


def _public_run(value: dict) -> ScheduleRun:
    return ScheduleRun.model_validate({
        key: value.get(key) for key in (
            "schemaVersion", "runId", "requestId", "selectedDate", "status", "checkpoint",
            "checkpointLabel", "retryOf", "proposal", "failure"
        )
    })


def _public_day(value: dict) -> ApprovedDay:
    return ApprovedDay.model_validate({
        key: value.get(key) for key in (
            "schemaVersion", "selectedDate", "revision", "sourceRunId", "capacityMinutes",
            "totalMinutes", "blocks", "status", "approvalEventId"
        )
    })


class FirestoreApprovedDayRepository:
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

    async def get(self, user_id: str, selected_date: str) -> ApprovedDay:
        try:
            return await asyncio.to_thread(self._get, user_id, selected_date)
        except ApprovedDayNotFoundError:
            raise
        except Exception as error:
            raise ApprovedDayUnavailableError("approved day read failed") from error

    def _get(self, user_id: str, selected_date: str) -> ApprovedDay:
        snapshot = self.client().document(f"{self._root(user_id)}/approvedDays/{selected_date}").get()
        if not snapshot.exists:
            raise ApprovedDayNotFoundError()
        value = snapshot.to_dict() or {}
        if value.get("ownerUid") != user_id or value.get("workspaceId") != "default":
            raise ApprovedDayNotFoundError()
        return _public_day(value)

    async def approve(self, user_id: str, run_id: str, request: DayApprovalRequest) -> DayApprovalResponse:
        try:
            return await asyncio.to_thread(self._approve, user_id, run_id, request)
        except (ApprovedDayNotFoundError, ApprovedDayConflictError):
            raise
        except Exception as error:
            raise ApprovedDayUnavailableError("approved day transaction failed") from error

    def _approve(self, user_id: str, run_id: str, request: DayApprovalRequest) -> DayApprovalResponse:
        client = self.client()
        root = self._root(user_id)
        run_ref = client.document(f"{root}/scheduleRuns/{run_id}")
        audit_ref = client.document(f"{root}/auditEvents/{request.idempotency_key}")
        fingerprint = _fingerprint(run_id, request)
        transaction = client.transaction()

        @firestore.transactional
        def approve_transaction(active_transaction):
            audit_snapshot = audit_ref.get(transaction=active_transaction)
            if audit_snapshot.exists:
                audit = audit_snapshot.to_dict() or {}
                if audit.get("requestFingerprint") != fingerprint or audit.get("kind") != "calendar-day-approved":
                    raise ApprovedDayConflictError("idempotency key was already used")
                return DayApprovalResponse.model_validate({**audit["result"], "duplicate": True})

            run_snapshot = run_ref.get(transaction=active_transaction)
            if not run_snapshot.exists:
                raise ApprovedDayNotFoundError("schedule run not found")
            stored_run = run_snapshot.to_dict() or {}
            if stored_run.get("ownerUid") != user_id or stored_run.get("workspaceId") != "default":
                raise ApprovedDayNotFoundError("schedule run not found")
            run = _public_run(stored_run)
            if run.status != "succeeded" or run.checkpoint != 4 or run.proposal is None:
                raise ApprovedDayConflictError("only a successful terminal run can be approved")

            selected_date = run.selected_date.isoformat()
            day_ref = client.document(f"{root}/approvedDays/{selected_date}")
            day_snapshot = day_ref.get(transaction=active_transaction)
            current_revision = 0
            if day_snapshot.exists:
                stored_day = day_snapshot.to_dict() or {}
                if stored_day.get("ownerUid") != user_id or stored_day.get("workspaceId") != "default":
                    raise ApprovedDayNotFoundError("approved day not found")
                current_revision = _public_day(stored_day).revision

            if request.expected_day_revision != current_revision:
                raise ApprovedDayConflictError("approved day changed")
            if day_snapshot.exists != request.replace_current:
                raise ApprovedDayConflictError("replacement confirmation no longer matches")

            next_revision = current_revision + 1
            proposal = run.proposal
            blocks = [
                {**block.model_dump(mode="json", by_alias=True), "order": index}
                for index, block in enumerate(proposal.blocks, start=1)
            ]
            day = ApprovedDay.model_validate({
                "schemaVersion": 1,
                "selectedDate": selected_date,
                "revision": next_revision,
                "sourceRunId": run.run_id,
                "capacityMinutes": proposal.capacity_minutes,
                "totalMinutes": proposal.total_minutes,
                "blocks": blocks,
                "status": "approved",
                "approvalEventId": request.idempotency_key,
            })
            result = DayApprovalResponse(
                schemaVersion=1,
                idempotencyKey=request.idempotency_key,
                duplicate=False,
                approvedDay=day,
            )
            active_transaction.set(day_ref, {
                **day.model_dump(mode="json", by_alias=True),
                "ownerUid": user_id,
                "workspaceId": "default",
                "updatedAt": firestore.SERVER_TIMESTAMP,
            })
            active_transaction.set(audit_ref, {
                "id": request.idempotency_key,
                "ownerUid": user_id,
                "workspaceId": "default",
                "kind": "calendar-day-approved",
                "selectedDate": selected_date,
                "sourceRunId": run.run_id,
                "requestFingerprint": fingerprint,
                "beforeRevision": current_revision,
                "afterRevision": next_revision,
                "result": result.model_dump(mode="json", by_alias=True),
                "createdAt": firestore.SERVER_TIMESTAMP,
            })
            return result

        return approve_transaction(transaction)


@lru_cache(maxsize=1)
def default_approved_day_repository() -> ApprovedDayRepository:
    return FirestoreApprovedDayRepository()
