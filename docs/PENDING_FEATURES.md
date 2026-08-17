# Longview Pending Features

Status: P0 ledger updated through the approved Clara write slice

Updated: 2026-08-17

Sources: [Acceptance demo](design/longview-hackathon-acceptance-demo.html) | [PRD](PRODUCT_REQUIREMENTS.md) | [Readiness ledger](HACKATHON_READINESS.md)

The ledger currently records 24 implemented, 10 partial, and 23 missing cases. Partial
means a safe client contract exists but the full judged behavior or cloud evidence does
not. Review checkmarks in the demo are not implementation status.

## Deadline-critical P0

1. **Today resilience** — TODAY-02, TODAY-06, TODAY-07: next eligible day, duplicate
   completion proof, and offline pending sync.
2. **Managed Clara loop** — the selected-Plan recommendation and approved schedule
   change are implemented locally. Deployment evidence, quick actions, cross-Plan
   tradeoff, and judged failure captures remain.
3. **Calendar** — CAL-01 through CAL-04 are implemented locally: completion-aware
   preparation, checkpointed proposal generation, explicit approval or replacement,
   owner-scoped one-day persistence, reload, idempotency, stale conflict handling, and
   preservation after generation or approval failure. Production Cloud evidence remains.
4. **Checkpointed run** — RUN-01 through RUN-04 are implemented locally: correlated run
   identifier, cancellation, timeout, checkpoints, retry, and safe terminal publication.
5. **Submission evidence** — EVID-01 through EVID-03: replace all 13 prototype captures,
   record the implemented PWA video, and refresh architecture/reproducibility evidence.

## P1 after the judged path

1. **Break handling** — CAL-05: product contract and interactive failure-state mockup
   are ready for review; implementation remains pending. Carry unfinished tasks only to
   their next eligible working days without approving or overwriting future days.
2. **Reviewed research** — MEM-01 and MEM-02: attributed accept/reject/defer cards and
   non-destructive failure recovery.
3. **Versioned brief** — MEM-03 and MEM-04: editable proposal, attribution, explicit save,
   history, and stale-version conflict handling.
4. **Achievement and consent** — MEM-05 and MEM-06: evidence, reflection, explicit
   reusable-memory permission, retry, and no memory write after failure.

## Post-hackathon MVP enhancement — pick up only if time permits

**Time-aware daily scheduling:** add a default start time and 30-minute duration to a
Plan, materialize versioned daily tasks, and detect overlapping time ranges
deterministically. A blocked task records a reason and may be moved to the next free
slot today, the nearest free eligible slot tomorrow, a user-selected time, or skipped.
All moves require confirmation, recheck conflicts, reject stale/duplicate carryover,
and retain history. External calendars, per-day hour templates, task splitting,
automatic movement of other tasks, and travel-time-zone handling remain deferred.

## Completed boundary

Identity and Plan-schedule cases are implemented. Each Plan owns its working days and
weekly allocation with versioned conflict protection, load/save recovery, Today
eligibility, and editing from Plan Details. Existing unscheduled Plans remain readable
and offer Add schedule. Workspace availability and clock-time scheduling do not exist.
The portfolio totals committed weekly hours, derives reviewable operating modes and
allocation shares, and gives one non-writing cross-Plan recommendation. Plan Details
performs an owner-scoped authoritative read, exposes the current step and context empty
states, and fails safely when the Plan is missing or unavailable. Persisted history,
decisions, research, and brief content remain in their later acceptance slices.

The local selected-Plan Clara loop now covers typed managed recommendations, exact
schedule previews, explicit rejection, stale checks, idempotent approval, one immutable
audit event, and authoritative refresh. Production Cloud evidence remains pending.
