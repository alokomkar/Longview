# Checkpointed Clara Schedule Run

Status: Review contract before implementation

Updated: 2026-08-17

Linked journey: [Interactive mockup](design/longview-pwa-interactive-mockup.html#calendar)

## Smallest judged outcome

Longview prepares one selected day's portfolio-aware schedule in a background run. The
run produces an advisory proposal only; it never replaces the current approved day.
Calendar approval and persistence remain the following slice.

The request contains the authenticated owner, selected date, bounded capacity, active
Plan IDs, operating modes, target dates, working days, weekly allocations, and eligible
task summaries. It excludes unrelated workspace content, authentication tokens, model
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

## Acceptance

1. Start a run and see its correlated ID plus checkpoint progress.
   The progress indicator remains visible until the run becomes terminal.
2. Cancel it and confirm no proposal or schedule write appears.
3. Time it out and retry with a new ID linked to the failed run.
4. Redeliver an event and confirm no duplicate model invocation or result.
5. Interrupt before final publication and confirm no mixed schedule version is visible.
