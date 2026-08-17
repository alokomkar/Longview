import asyncio
import os
import uuid

import pytest

from clara_api.models import CreateScheduleRunRequest
from clara_api.schedule_runs import FirestoreScheduleRunCoordinator


pytestmark = pytest.mark.skipif(
    not os.getenv("FIRESTORE_EMULATOR_HOST"), reason="Firestore Emulator is not configured"
)


def request(request_id, retry_of=None):
    return CreateScheduleRunRequest.model_validate({
        "schemaVersion": 1, "requestId": request_id, "selectedDate": "2026-08-17",
        "capacityMinutes": 90, "retryOf": retry_of,
        "plans": [{"id": "plan-1", "title": "Launch Longview", "targetDate": "2026-08-20",
                   "weeklyHours": 4, "workingDays": ["mon"], "mode": "Focus"}],
        "steps": [{"planId": "plan-1", "planTitle": "Launch Longview", "title": "Define the first proof",
                   "description": "Write one observable result.", "durationMinutes": 60}],
    })


async def wait_for_terminal(coordinator, user_id, run_id):
    for _ in range(50):
        current = await coordinator.get(user_id, run_id)
        if current.status in {"succeeded", "cancelled", "failed", "timed-out"}:
            return current
        await asyncio.sleep(.02)
    raise AssertionError("run did not become terminal")


@pytest.mark.asyncio
async def test_emulator_run_is_idempotent_and_publishes_result_atomically():
    user_id = f"schedule-test-{uuid.uuid4()}"
    coordinator = FirestoreScheduleRunCoordinator(step_delay_seconds=.02, deadline_seconds=2)
    value = request(str(uuid.uuid4()))
    first = await coordinator.create(user_id, value)
    duplicate = await coordinator.create(user_id, value)
    assert duplicate.run_id == first.run_id
    terminal = await wait_for_terminal(coordinator, user_id, first.run_id)
    assert terminal.status == "succeeded"
    assert terminal.checkpoint == 4 and terminal.proposal is not None


@pytest.mark.asyncio
async def test_emulator_cancellation_wins_and_never_publishes_a_proposal():
    user_id = f"schedule-cancel-test-{uuid.uuid4()}"
    coordinator = FirestoreScheduleRunCoordinator(step_delay_seconds=.08, deadline_seconds=2)
    created = await coordinator.create(user_id, request(str(uuid.uuid4())))
    cancelled = await coordinator.cancel(user_id, created.run_id)
    await asyncio.sleep(.3)
    current = await coordinator.get(user_id, created.run_id)
    assert cancelled.status == current.status == "cancelled"
    assert current.proposal is None


@pytest.mark.asyncio
async def test_emulator_timeout_is_terminal_and_retry_gets_a_new_correlated_id():
    user_id = f"schedule-timeout-test-{uuid.uuid4()}"
    coordinator = FirestoreScheduleRunCoordinator(step_delay_seconds=.1, deadline_seconds=.01)
    timed_out = await coordinator.create(user_id, request(str(uuid.uuid4())))
    terminal = await wait_for_terminal(coordinator, user_id, timed_out.run_id)
    assert terminal.status == "timed-out" and terminal.proposal is None
    retry = await coordinator.create(user_id, request(str(uuid.uuid4()), terminal.run_id))
    assert retry.run_id != terminal.run_id
    assert retry.retry_of == terminal.run_id
