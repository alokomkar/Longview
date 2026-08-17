# Calendar Approved Day

Status: Review required before runtime implementation

Updated: 2026-08-17

Linked journey: [Interactive mockup](design/longview-pwa-interactive-mockup.html#schedule-proposal)

## Smallest judged outcome

The user reviews one succeeded Calendar proposal and explicitly approves its exact
ordered minute blocks for one selected date. The approved day survives reloads and a
later generation or approval failure cannot replace it.

This slice does not assign clock times, edit individual blocks, drag tasks, carry work
forward, or update future dates. Adjusting means returning to Calendar, changing the
planning window, and generating a new proposal.

## Durable contract

`approvedDays/{date}` is owner-scoped and contains schema version, owner and workspace
IDs, date, revision, source run ID, capacity and scheduled minutes, ordered blocks, and
approved status. Each block contains only Plan ID, Plan title, step title, duration, and
order.

Approval submits schema version, source run ID, expected day revision, and an
idempotency key. One Firestore transaction must:

1. verify the authenticated owner and selected date;
2. verify that the source run belongs to that owner and ended successfully;
3. copy the exact published proposal without accepting client-edited blocks;
4. reject a stale expected revision without writing;
5. write the approved day and one immutable audit record atomically; and
6. return the original result for a repeated idempotency key.

Replacing an existing approved day requires a newly generated proposal, an explicit
replacement confirmation, and the current expected revision. A failed, cancelled, or
timed-out run can never be approved.

## Interaction contract

- The proposal offers **Approve this order**, **Adjust planning window**, **Try again**,
  and **Take a break today**.
- Approval shows an accessible progress indicator for the full network operation.
- Success shows the selected date, ordered minute blocks, revision, and source run ID.
- Failure keeps the previously approved day and permits a safe retry with the same
  idempotency key.
- A stale revision asks the user to review the latest approved day before generating a
  replacement. A duplicate request shows the original approved result.

## Acceptance

1. First approval persists across reload and affects only the selected date.
2. Repeating the same approval creates neither a second revision nor a second audit.
3. A stale expected revision writes nothing and exposes the latest approved day.
4. Network, transaction, or generation failure preserves the previous approved day.
5. A proposal from a failed, cancelled, timed-out, or differently owned run is rejected.
6. The progress indicator remains visible until success or failure is known.
7. The approved blocks exactly match the terminal run result and contain no clock times.
