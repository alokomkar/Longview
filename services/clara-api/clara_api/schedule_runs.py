import asyncio
import hashlib
import json
import os
import uuid
from typing import Protocol

import firebase_admin
from firebase_admin import firestore as admin_firestore
from google.cloud import firestore

from .models import CreateScheduleRunRequest, ScheduleProposal, ScheduleRun


CHECKPOINTS = {
    1: "Run queued",
    2: "Context validated",
    3: "Proposal generated",
    4: "Result published",
}
TERMINAL = {"succeeded", "cancelled", "failed", "timed-out"}


class ScheduleRunNotFoundError(Exception):
    pass


class ScheduleRunUnavailableError(Exception):
    pass


class ScheduleRunCoordinator(Protocol):
    async def create(self, user_id: str, request: CreateScheduleRunRequest) -> ScheduleRun: ...
    async def get(self, user_id: str, run_id: str) -> ScheduleRun: ...
    async def cancel(self, user_id: str, run_id: str) -> ScheduleRun: ...


def _context_fingerprint(request: CreateScheduleRunRequest) -> str:
    value = request.model_dump(mode="json", by_alias=True)
    value.pop("requestId", None)
    value.pop("retryOf", None)
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def build_proposal(request: CreateScheduleRunRequest) -> ScheduleProposal:
    modes = {plan.id: plan.mode for plan in request.plans}
    targets = {plan.id: plan.target_date for plan in request.plans}
    priority = {"Focus": 0, "Maintain": 1, "Prepare": 2}
    ordered = sorted(
        request.steps,
        key=lambda step: (priority[modes[step.plan_id]], targets[step.plan_id], step.plan_id),
    )
    remaining = request.capacity_minutes
    blocks = []
    for step in ordered:
        if remaining <= 0:
            break
        duration = min(step.duration_minutes, remaining)
        if duration < 15 and blocks:
            break
        blocks.append({
            "planId": step.plan_id,
            "planTitle": step.plan_title,
            "title": step.title,
            "durationMinutes": duration,
        })
        remaining -= duration
    return ScheduleProposal.model_validate({
        "selectedDate": request.selected_date,
        "capacityMinutes": request.capacity_minutes,
        "totalMinutes": sum(block["durationMinutes"] for block in blocks),
        "rationale": "Nearest active targets come first while the proposal stays within your planning window.",
        "blocks": blocks,
    })


class FirestoreScheduleRunCoordinator:
    def __init__(self, client=None, step_delay_seconds: float | None = None, deadline_seconds: float | None = None):
        self._client = client
        self._tasks: dict[tuple[str, str], asyncio.Task] = {}
        self._step_delay = step_delay_seconds if step_delay_seconds is not None else float(
            os.getenv("CLARA_LOCAL_RUN_STEP_DELAY_SECONDS", "0.8")
        )
        self._deadline = deadline_seconds if deadline_seconds is not None else float(
            os.getenv("CLARA_RUN_TIMEOUT_SECONDS", "30")
        )
        if self._step_delay < 0 or self._deadline <= 0:
            raise ValueError("schedule run timing must be positive")

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

    def _run_ref(self, user_id: str, run_id: str):
        return self.client().document(f"users/{user_id}/workspaces/default/scheduleRuns/{run_id}")

    def _to_run(self, value: dict) -> ScheduleRun:
        return ScheduleRun.model_validate({
            key: value.get(key) for key in (
                "schemaVersion", "runId", "requestId", "selectedDate", "status", "checkpoint",
                "checkpointLabel", "retryOf", "proposal", "failure"
            )
        })

    async def create(self, user_id: str, request: CreateScheduleRunRequest) -> ScheduleRun:
        try:
            run = await asyncio.to_thread(self._create, user_id, request)
            self._ensure_worker(user_id, run.run_id)
            return run
        except Exception as error:
            if isinstance(error, ScheduleRunUnavailableError):
                raise
            raise ScheduleRunUnavailableError("schedule run creation failed") from error

    def _create(self, user_id: str, request: CreateScheduleRunRequest) -> ScheduleRun:
        client = self.client()
        fingerprint = _context_fingerprint(request)
        lock_id = hashlib.sha256(f"{request.selected_date}:{fingerprint}".encode()).hexdigest()
        lock_ref = client.document(f"users/{user_id}/workspaces/default/scheduleRunLocks/{lock_id}")
        request_ref = client.document(f"users/{user_id}/workspaces/default/scheduleRunRequests/{request.request_id}")
        transaction = client.transaction()

        @firestore.transactional
        def create_transaction(active_transaction):
            request_snapshot = request_ref.get(transaction=active_transaction)
            if request_snapshot.exists:
                existing_id = (request_snapshot.to_dict() or {}).get("runId")
                existing = self._run_ref(user_id, existing_id).get(transaction=active_transaction)
                if existing.exists:
                    return self._to_run(existing.to_dict() or {})
            lock_snapshot = lock_ref.get(transaction=active_transaction)
            if lock_snapshot.exists:
                active_id = (lock_snapshot.to_dict() or {}).get("runId")
                active = self._run_ref(user_id, active_id).get(transaction=active_transaction)
                if active.exists and (active.to_dict() or {}).get("status") not in TERMINAL:
                    return self._to_run(active.to_dict() or {})
            run_id = str(uuid.uuid4())
            run_ref = self._run_ref(user_id, run_id)
            payload = {
                "schemaVersion": 1,
                "runId": run_id,
                "requestId": request.request_id,
                "selectedDate": request.selected_date.isoformat(),
                "status": "queued",
                "checkpoint": 1,
                "checkpointLabel": CHECKPOINTS[1],
                "retryOf": request.retry_of,
                "proposal": None,
                "failure": None,
                "ownerUid": user_id,
                "workspaceId": "default",
                "contextFingerprint": fingerprint,
                "request": request.model_dump(mode="json", by_alias=True),
            }
            active_transaction.set(run_ref, payload)
            active_transaction.set(request_ref, {"runId": run_id, "contextFingerprint": fingerprint})
            active_transaction.set(lock_ref, {"runId": run_id, "contextFingerprint": fingerprint})
            return self._to_run(payload)

        return create_transaction(transaction)

    async def get(self, user_id: str, run_id: str) -> ScheduleRun:
        try:
            value = await asyncio.to_thread(self._read, user_id, run_id)
            if value.status not in TERMINAL:
                self._ensure_worker(user_id, run_id)
            return value
        except ScheduleRunNotFoundError:
            raise
        except Exception as error:
            raise ScheduleRunUnavailableError("schedule run read failed") from error

    def _read(self, user_id: str, run_id: str) -> ScheduleRun:
        snapshot = self._run_ref(user_id, run_id).get()
        if not snapshot.exists:
            raise ScheduleRunNotFoundError()
        return self._to_run(snapshot.to_dict() or {})

    async def cancel(self, user_id: str, run_id: str) -> ScheduleRun:
        try:
            return await asyncio.to_thread(self._cancel, user_id, run_id)
        except ScheduleRunNotFoundError:
            raise
        except Exception as error:
            raise ScheduleRunUnavailableError("schedule run cancellation failed") from error

    def _cancel(self, user_id: str, run_id: str) -> ScheduleRun:
        ref = self._run_ref(user_id, run_id)
        transaction = self.client().transaction()

        @firestore.transactional
        def cancel_transaction(active_transaction):
            snapshot = ref.get(transaction=active_transaction)
            if not snapshot.exists:
                raise ScheduleRunNotFoundError()
            value = snapshot.to_dict() or {}
            if value.get("status") not in TERMINAL:
                value.update({"status": "cancelled", "proposal": None, "failure": None})
                active_transaction.update(ref, {"status": "cancelled", "proposal": None, "failure": None})
            return self._to_run(value)

        return cancel_transaction(transaction)

    def _ensure_worker(self, user_id: str, run_id: str) -> None:
        key = (user_id, run_id)
        task = self._tasks.get(key)
        if task is None or task.done():
            self._tasks[key] = asyncio.create_task(self._run_with_deadline(user_id, run_id))

    async def _run_with_deadline(self, user_id: str, run_id: str) -> None:
        try:
            await asyncio.wait_for(self._run(user_id, run_id), timeout=self._deadline)
        except TimeoutError:
            await asyncio.to_thread(self._terminal_failure, user_id, run_id, "timed-out", "The run took too long.")
        except Exception:
            await asyncio.to_thread(self._terminal_failure, user_id, run_id, "failed", "The proposal could not be prepared.")

    async def _run(self, user_id: str, run_id: str) -> None:
        for checkpoint in (2, 3):
            await asyncio.sleep(self._step_delay)
            continued = await asyncio.to_thread(self._advance, user_id, run_id, checkpoint)
            if not continued:
                return
        await asyncio.sleep(self._step_delay)
        await asyncio.to_thread(self._publish, user_id, run_id)

    def _advance(self, user_id: str, run_id: str, checkpoint: int) -> bool:
        ref = self._run_ref(user_id, run_id)
        transaction = self.client().transaction()

        @firestore.transactional
        def advance_transaction(active_transaction):
            snapshot = ref.get(transaction=active_transaction)
            value = snapshot.to_dict() or {}
            if not snapshot.exists or value.get("status") in TERMINAL:
                return False
            active_transaction.update(ref, {
                "status": "running", "checkpoint": checkpoint,
                "checkpointLabel": CHECKPOINTS[checkpoint],
            })
            return True

        return advance_transaction(transaction)

    def _publish(self, user_id: str, run_id: str) -> None:
        ref = self._run_ref(user_id, run_id)
        transaction = self.client().transaction()

        @firestore.transactional
        def publish_transaction(active_transaction):
            snapshot = ref.get(transaction=active_transaction)
            if not snapshot.exists:
                return
            value = snapshot.to_dict() or {}
            if value.get("status") in TERMINAL:
                return
            request = CreateScheduleRunRequest.model_validate(value["request"])
            proposal = build_proposal(request).model_dump(mode="json", by_alias=True)
            active_transaction.update(ref, {
                "status": "succeeded", "checkpoint": 4, "checkpointLabel": CHECKPOINTS[4],
                "proposal": proposal, "failure": None,
            })

        publish_transaction(transaction)

    def _terminal_failure(self, user_id: str, run_id: str, status: str, failure: str) -> None:
        ref = self._run_ref(user_id, run_id)
        transaction = self.client().transaction()

        @firestore.transactional
        def fail_transaction(active_transaction):
            snapshot = ref.get(transaction=active_transaction)
            value = snapshot.to_dict() or {}
            if snapshot.exists and value.get("status") not in TERMINAL:
                active_transaction.update(ref, {
                    "status": status, "proposal": None, "failure": failure,
                })

        fail_transaction(transaction)


_default_coordinator: FirestoreScheduleRunCoordinator | None = None


def default_schedule_run_coordinator() -> FirestoreScheduleRunCoordinator:
    global _default_coordinator
    if _default_coordinator is None:
        _default_coordinator = FirestoreScheduleRunCoordinator()
    return _default_coordinator
