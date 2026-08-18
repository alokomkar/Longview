# Release 3: Daily Schedule

Status: Local release contract; not merged or deployed

Last updated: 2026-08-18

Interactive acceptance: [Release 3 daily schedule](design/longview-release-three-daily-schedule.html)

## Outcome

A user can turn the unfinished steps from Plans scheduled for one selected day into
one capacity-bounded order, review it, and explicitly approve it. The proposal is
advisory. No Plan, completion, or approved day changes while Longview prepares it.

## Release boundary

- Calendar handles today only. The planning window is 30–480 minutes.
- Completed steps are excluded. Eligible unfinished steps are ordered consistently
  across Plans and truncated before the capacity limit is exceeded.
- The run shows four checkpoints, supports cancellation, and has a fixed deadline.
- Approval stores the exact reviewed blocks, capacity, source run, revision, and one
  immutable audit event in a transaction.
- Preparing a replacement keeps the current approved day readable. Replacement needs
  the expected revision and explicit approval; a stale revision fails closed.
- Taking a break first previews where every unfinished block will go. Confirmation
  marks today as a break and creates pending carryovers together. Destination days are
  not approved or overwritten.
- A carried block joins the next proposal for its Plan's next eligible working day and
  is consumed only when that proposal is approved.
- Clara cannot change a Plan or approved day through this release surface. Clock-time
  scheduling, blocked-task reasons, arbitrary task moves, and offline cold starts are
  deferred.

## User journey

1. Calendar loads today's latest approved revision and unfinished eligible steps.
2. The user chooses a planning window and selects **Prepare today**.
3. Longview displays network progress through queued, validated, generated, and
   published checkpoints. The user may cancel before publication.
4. The user reviews the ordered blocks, rationale, total minutes, and unused capacity.
5. They approve the exact order, adjust the window, request a new proposal, or leave.
6. Approval shows the saved day revision and audit record. A duplicate retry restores
   the original result without another revision or audit event.
7. For an existing day, the user may prepare a replacement or preview a break. Both
   paths preserve the approved revision until their explicit confirmation succeeds.

## Failure and recovery contract

| Failure | User-visible result | Durable effect | Recovery |
|---|---|---|---|
| Offline or network unavailable | Connection-specific message | None | Reconnect and start a new run |
| Client or service timeout | Deadline message | None | Start a new run linked to the prior run |
| Cancel | Cancelled result | None | Start a new run |
| Malformed response | Safety-check message | None | Return or start a new run |
| Concurrent duplicate run | Existing active/result run | One run | Continue the returned run |
| Approval network failure | Current day remains | None or one atomic approval | Retry with the same idempotency key |
| Stale replacement | Latest revision is preserved | None | Reload day and prepare again |
| Duplicate approval | Original result is restored | No duplicate revision/audit | Continue |
| Break source changed | Current day remains | None | Reload and preview again |
| Future approved conflict | Both days remain | None | Keep today or review later |
| No eligible carry date | Current day remains | None | Update that Plan's working days |
| Duplicate break confirmation | Original result is restored | No duplicate carryover/audit | Continue |

## Acceptance and evidence

- Unit tests cover typed parsing, capacity boundaries, malformed data, cancellation,
  timeouts, offline/unavailable states, retries, and release-surface gating.
- Firestore emulator tests cover ownership, atomic approval/replacement/break writes,
  stale revisions, concurrency, idempotency, carryover conflicts, and partial failure.
- Mobile E2E covers prepare → review → approve, replacement, break/carry-forward,
  cancellation, network recovery, and safe conflicts.
- Full regression, production build size, page load, network latency, responsiveness,
  and a QuickTime acceptance recording are required before requesting merge approval.

Local verification evidence: [Release 3 verification](evidence/RELEASE_THREE_LOCAL_VERIFICATION.md)
