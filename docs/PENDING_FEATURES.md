# Longview Pending Features

Status: 36 acceptance cases pending after the availability slice

Updated: 2026-08-17

Sources: [Acceptance demo](design/longview-hackathon-acceptance-demo.html) | [PRD](PRODUCT_REQUIREMENTS.md) | [Readiness ledger](HACKATHON_READINESS.md)

The ledger currently records 20 implemented, 9 partial, and 27 missing cases. Partial
means a safe client contract exists but the full judged behavior or cloud evidence does
not. Review checkmarks in the demo are not implementation status.

## Deadline-critical P0

1. **Plan and portfolio details** — PLAN-06 through PLAN-09: finite capacity, navigable
   details, missing-Plan handling, and failed-read recovery.
2. **Today resilience** — TODAY-02, TODAY-06, TODAY-07: next eligible day, duplicate
   completion proof, and offline pending sync.
3. **Managed Clara loop** — AI-01 through AI-11: deployed recommendation, clarification,
   injection rejection, quick actions, cross-Plan tradeoff, exact preview, stale-version
   rejection, and duplicate approval. Timeout, malformed, and unavailable client states
   remain partial until the managed adapter is evidenced.
4. **Calendar** — CAL-01 through CAL-04: prepare one day, adjust/approve, persist the
   approved day, and preserve it on generation failure.
5. **Checkpointed run** — RUN-01 through RUN-04: correlated run identifier, cancellation,
   timeout, checkpoints, retry, and partial-write reconciliation.
6. **Submission evidence** — EVID-01 through EVID-03: replace all 13 prototype captures,
   record the implemented PWA video, and refresh architecture/reproducibility evidence.

## P1 after the judged path

1. **Break handling** — CAL-05: carry tasks only to their next eligible working days.
2. **Reviewed research** — MEM-01 and MEM-02: attributed accept/reject/defer cards and
   non-destructive failure recovery.
3. **Versioned brief** — MEM-03 and MEM-04: editable proposal, attribution, explicit save,
   history, and stale-version conflict handling.
4. **Achievement and consent** — MEM-05 and MEM-06: evidence, reflection, explicit
   reusable-memory permission, retry, and no memory write after failure.

## Completed boundary

Identity and availability cases are implemented. Availability now persists selected
working days, weekly capacity, preferred time, versioned conflict protection, load/save
recovery, and Settings editing. It does not yet schedule around ineligible days.
