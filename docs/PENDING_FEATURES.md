# Longview Pending Features

Status: archived hackathon ledger; current delivery status is maintained in release documents

Updated: 2026-08-21

Sources: [Acceptance demo](design/longview-hackathon-acceptance-demo.html) | [PRD](PRODUCT_REQUIREMENTS.md) | [Readiness ledger](HACKATHON_READINESS.md)

This file preserves the hackathon snapshot and is no longer the live implementation
count. Plan Research Workspace status is tracked in
[Plan Research Workspace](PLAN_RESEARCH_WORKSPACE.md). The historical ledger recorded
28 implemented, 7 partial, and 22 missing cases. Partial
means a safe client contract exists but the full judged behavior or cloud evidence does
not. Review checkmarks in the demo are not implementation status.

## Deadline-critical P0

1. **Today resilience** — TODAY-02 next-eligible-day guidance and
   [TODAY-06 duplicate completion proof](TODAY_DUPLICATE_COMPLETION.md) are merged.
   [TODAY-07 offline pending sync](TODAY_OFFLINE_SYNC.md) is implemented for an
   already-open session with owner-scoped reconnect, duplicate, retry, and
   partial-cleanup recovery. Cold offline launch and reload are deferred.
2. **Managed Clara loop** — the selected-Plan recommendation and approved schedule
   change are implemented locally. [Bounded Quick Actions](CLARA_QUICK_ACTIONS.md) now
   group outcomes and hand off to existing reviewed flows without a menu-time network
   call. Deployment evidence, cross-Plan tradeoff, and judged failure captures remain.
3. **Calendar** — CAL-01 through CAL-05 are implemented locally: completion-aware
   preparation, checkpointed proposal generation, explicit approval or replacement,
   owner-scoped one-day persistence, reload, idempotency, stale conflict handling, and
   preservation after generation or approval failure. A reviewed break atomically marks
   only the source day, queues each unfinished block for its Plan's next eligible day,
   and never approves or overwrites a future day. Production Cloud evidence remains.
4. **Checkpointed run** — RUN-01 through RUN-04 are implemented locally: correlated run
   identifier, cancellation, timeout, checkpoints, retry, and safe terminal publication.
5. **Submission evidence** — EVID-01 through EVID-03: replace all 13 prototype captures,
   record the implemented PWA video, and refresh architecture/reproducibility evidence.

## P1 after the judged path

1. **Reviewed research** — MEM-01 and MEM-02 are implemented locally with attributed
   cards, Accept/Reject/Not now history, strict parsing, cancellation, timeout, offline,
   idempotency, and concurrent-review recovery. Production Cloud evidence remains.
2. **Versioned brief** — MEM-03 and MEM-04 are implemented locally with an editable
   proposal, one to three accepted sources, explicit final save, immutable history,
   idempotency, and stale-version protection. Production Cloud evidence remains.
3. **Achievement and consent** — MEM-05 and MEM-06 are implemented locally with
   completion evidence, optional private reflection, exact statement-level reuse
   permission, default-deny consent, atomic finish, retry, stale protection,
   revocation, and no memory write after failure. Merge, deployment, and production
   evidence await product-owner review of [the release](RELEASE_SIX_ACHIEVEMENT_CONSENT.md).

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
states, and fails safely when the Plan is missing or unavailable. Release 4 now restores
immutable completion and approved-change proof, reviewed decisions, and explicitly
retained Clara guidance. Release 5 now supplies reviewed research and versioned Plan
Brief content on `master`; Cloud deployment and production evidence remain pending.

Release 6 locally adds immutable achievement evidence, optional private reflection,
append-only exact reuse consent and revocation, and a completed-Plan portfolio state.
Production Firestore-rule deployment and acceptance evidence remain pending.

The local selected-Plan Clara loop now covers typed managed recommendations, exact
schedule previews, explicit rejection, stale checks, idempotent approval, one immutable
audit event, and authoritative refresh. Production Cloud evidence remains pending.

Calendar break handling now covers authoritative next-eligible-day preview, explicit
confirmation, atomic source-day update plus pending carryovers, reload, destination
proposal enrichment, idempotency, and safe stale/future-conflict recovery.
