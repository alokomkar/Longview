# Checkpointed Clara Schedule Run

Status: Localhost implementation complete; production worker remains pending

Updated: 2026-08-17

Linked journey: [Interactive mockup](design/longview-pwa-interactive-mockup.html#calendar)

## Smallest judged outcome

Longview prepares one selected day's portfolio-aware schedule in a background run. The
run produces an advisory proposal only; it never replaces the current approved day.
Calendar approval and persistence remain the following slice.

The request contains the authenticated owner, selected date, bounded capacity, active
Plan IDs, operating modes, target dates, working days, weekly allocations, and unfinished
eligible task summaries. Completion records are checked before the request, and completed
steps are excluded. It also excludes unrelated workspace content, authentication tokens, model
reasoning traces, and future dates.

## Run contract

- One user may have only one active run for the same date and context version.
- The API creates a correlated run ID and enqueues one idempotent event.
- The worker records four monotonic checkpoints: queued, context validated, proposal
  generated, and result published.
- The UI polls the owner-scoped run, shows its ID and current checkpoint, and permits
  cancellation while work is non-terminal.
- An indeterminate progress indicator remains visible for the entire active network
  operation. Its accessible label reports the current checkpoint; reduced-motion mode
  uses a static filled track instead of animation.
- Cancellation is cooperative: it stops future checkpoints and preserves the last safe
  one. No schedule proposal is published after cancellation wins.
- Retry creates a new run ID linked by `retryOf`; terminal runs are immutable.
- The validated result and terminal success state publish in one transaction. Pub/Sub
  redelivery returns the existing checkpoint/result instead of repeating model work.

## Failure and cost boundaries

Authentication failure, malformed context, duplicate events, model timeout, worker
restart, cancellation, and finalization failure cannot change an approved schedule.
A staged result is never visible until terminal publication succeeds; recovery either
resumes the last checkpoint or marks the run failed without mixed versions.

The MVP permits one model invocation per run, one active run per user/date, a 30-second
worker deadline, bounded payload/result sizes, and automatic expiry of operational run
documents. Cloud deployment and log evidence require separate approval.

## Localhost implementation

The PWA Calendar now creates an authenticated FastAPI run, polls owner-scoped Firestore
Emulator checkpoints, keeps a progress indicator visible until terminal state, and
supports cancellation and retry with a new correlated ID. The published result is an
ordered list with minute budgets—not clock times—and remains read only.

Before creating a run, Calendar verifies completion state for every step scheduled that
day. A failed check blocks generation; partial completion removes only completed steps;
when all scheduled steps are complete, Calendar shows a finished-for-today state.

The localhost worker uses a deterministic bounded proposal builder so the workflow can
be tested without consuming model calls. A durable queued Cloud worker, one model call,
operational expiry, production logging, and deployment evidence remain separate work and
must not be inferred from this local slice.

## Acceptance

1. If no Plan is eligible today, show a direct path to create a Plan; when Plans exist,
   also offer a path to review their schedules. Do not start an empty run.
2. Exclude completed steps. If every scheduled step is complete, show the completed-day
   state; if any completion check fails, fail closed without starting a run.
3. Start a run and see its correlated ID plus checkpoint progress.
   The progress indicator remains visible until the run becomes terminal.
4. Cancel it and confirm no proposal or schedule write appears.
5. Time it out and retry with a new ID linked to the failed run.
6. Redeliver an event and confirm no duplicate model invocation or result.
7. Interrupt before final publication and confirm no mixed schedule version is visible.
