import asyncio
import hashlib
import json
import os
from functools import lru_cache
from typing import Protocol

import firebase_admin
from firebase_admin import firestore as admin_firestore
from google.cloud import firestore

from .models import ApprovalRequest, ApprovalResponse, PlanScheduleChangePreview


class ApprovalNotFoundError(Exception):
    pass


class ApprovalConflictError(Exception):
    pass


class ApprovalUnavailableError(Exception):
    pass


class ApprovalRepository(Protocol):
    async def apply(self, user_id: str, request: ApprovalRequest) -> ApprovalResponse: ...


def _fingerprint(request: ApprovalRequest) -> str:
    encoded = json.dumps(
        request.model_dump(mode="json", by_alias=True), sort_keys=True, separators=(",", ":")
    ).encode()
    return hashlib.sha256(encoded).hexdigest()


def validate_plan_for_approval(
    user_id: str, plan: dict, proposal: PlanScheduleChangePreview
) -> int:
    if plan.get("ownerUid") != user_id or plan.get("workspaceId") != "default":
        raise ApprovalNotFoundError("Plan not found")
    if plan.get("scheduleVersion") != proposal.expected_schedule_version:
        raise ApprovalConflictError("Plan schedule changed")
    if plan.get("workingDays") != proposal.working_days_before:
        raise ApprovalConflictError("preview no longer matches the Plan")
    if plan.get("weeklyHours") != proposal.weekly_hours:
        raise ApprovalConflictError("weekly allocation changed")
    return proposal.expected_schedule_version + 1


class FirestoreApprovalRepository:
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

    async def apply(self, user_id: str, request: ApprovalRequest) -> ApprovalResponse:
        try:
            return await asyncio.to_thread(self._apply, user_id, request)
        except (ApprovalNotFoundError, ApprovalConflictError):
            raise
        except Exception as error:
            raise ApprovalUnavailableError("approval transaction failed") from error

    def _apply(self, user_id: str, request: ApprovalRequest) -> ApprovalResponse:
        client = self.client()
        proposal = request.proposal
        plan_ref = client.document(
            f"users/{user_id}/workspaces/default/plans/{proposal.plan_id}"
        )
        audit_ref = client.document(
            f"users/{user_id}/workspaces/default/auditEvents/{request.idempotency_key}"
        )
        fingerprint = _fingerprint(request)
        @firestore.transactional
        def apply_transaction(active_transaction):
            audit_snapshot = audit_ref.get(transaction=active_transaction)
            plan_snapshot = plan_ref.get(transaction=active_transaction)
            if audit_snapshot.exists:
                audit = audit_snapshot.to_dict() or {}
                if audit.get("requestFingerprint") != fingerprint:
                    raise ApprovalConflictError("idempotency key was already used")
                return ApprovalResponse.model_validate({**audit["result"], "duplicate": True})
            if not plan_snapshot.exists:
                raise ApprovalNotFoundError("Plan not found")
            plan = plan_snapshot.to_dict() or {}
            next_version = validate_plan_for_approval(user_id, plan, proposal)
            result = ApprovalResponse(
                schemaVersion=1,
                idempotencyKey=request.idempotency_key,
                planId=proposal.plan_id,
                scheduleVersion=next_version,
                workingDays=proposal.working_days_after,
                weeklyHours=proposal.weekly_hours,
                auditEventId=request.idempotency_key,
                duplicate=False,
            )
            active_transaction.update(plan_ref, {
                "workingDays": proposal.working_days_after,
                "scheduleVersion": next_version,
                "updatedAt": firestore.SERVER_TIMESTAMP,
            })
            active_transaction.set(audit_ref, {
                "id": request.idempotency_key,
                "ownerUid": user_id,
                "workspaceId": "default",
                "planId": proposal.plan_id,
                "kind": proposal.kind,
                "requestFingerprint": fingerprint,
                "before": {
                    "workingDays": proposal.working_days_before,
                    "scheduleVersion": proposal.expected_schedule_version,
                },
                "after": {
                    "workingDays": proposal.working_days_after,
                    "scheduleVersion": next_version,
                },
                "result": result.model_dump(mode="json", by_alias=True),
                "createdAt": firestore.SERVER_TIMESTAMP,
            })
            return result

        return apply_transaction(client.transaction(max_attempts=10))


@lru_cache(maxsize=1)
def default_approval_repository() -> ApprovalRepository:
    return FirestoreApprovalRepository()
