# Longview Hackathon Readiness Ledger

Status: Active delivery checklist

Updated: 2026-08-17

Sources: [PRD](PRODUCT_REQUIREMENTS.md) | [Implementation phases](IMPLEMENTATION_PHASES.md) | [Interactive mockup](design/longview-pwa-interactive-mockup.html) | [Acceptance demo](design/longview-hackathon-acceptance-demo.html) | [Gallery](demo/DEVPOST_GALLERY.md) | [Demo script](demo/PROTOTYPE_DEMO_SCRIPT.md)

## Submission evidence inventory

| Evidence | Verified artifact | Current status | Required final action |
|---|---|---|---|
| Gallery | 13 PNGs, each 2400 x 1600 (3:2) | Complete prototype set | Replace each image only after its PWA behavior is implemented and verified; retain prototype label until then. |
| Thumbnail | `docs/demo/longview-devpost-thumbnail-v1.png`, 1536 x 1024 (3:2) | Ready | Recheck branding and file-size limit before final upload. |
| Demo video | `docs/demo/output/longview-prototype-demo.mp4`, 1920 x 1080, 125 seconds, 3.8 MB | Prototype walkthrough only | Record a new implemented-PWA demo with live agent and Cloud evidence. |
| Narration | MP3, AIFF, and VTT under `docs/demo/audio/` | Prototype narration ready | Rewrite only where implemented behavior or disclosure changes. |
| Architecture | `output/pdf/longview-architecture-v0.1.pdf` | Initial v0.1 | Update after the deployed API, worker, and observability path are final. |

## Gallery-to-implementation ledger

| # | Submitted screenshot | Required product proof | Current PWA status | Remaining work |
|---:|---|---|---|---|
| 1 | Today | Capacity-aware work and conflict | Partial | Portfolio capacity is visible; time-based conflict detection remains post-hackathon unless time permits. |
| 2 | Portfolio | Three Plans sharing finite capacity | Implemented | Committed hours, operating modes, allocation shares, milestones, and deterministic guidance are visible. |
| 3 | Plan creation | Reviewed structured Plan | Partial | Working-day selection is implemented; advisor-assisted suggestions remain. |
| 4 | Plan details | One Plan with execution and context | Partial | Authoritative details, current step, schedule, and context entry points exist; persisted history, decisions, research, and brief content remain. |
| 5 | Plan achievement | Outcome and consented reflection | Missing | Add completion evidence, reflection, and explicit reusable-memory consent. |
| 6 | Clara context | Visible bounded context | Partial | Local managed boundary uses one Plan and Today step; add deployed-model evidence and multi-Plan context where required. |
| 7 | Agentic actions | Bounded action catalogue | Missing | Add judged quick actions backed by typed agent tools. |
| 8 | Tradeoff recommendation | Cross-Plan managed recommendation | Missing | The local single-Plan managed boundary is ready; add deployed cross-Plan reasoning and evidence. |
| 9 | Human approval | Before/after preview and approved write | Implemented locally | Capture production Cloud evidence for the exact preview, rejection, stale check, audit, and idempotent write. |
| 10 | Research review | Accept/reject/defer evidence | Missing | Add attributed cards and non-destructive review states. |
| 11 | Versioned memory | User-approved brief version | Missing | Add editable proposal, attribution, version history, and explicit save. |
| 12 | Calendar success | One approved capacity-bounded day | Partial | Local proposal, adjustment, approval, replacement, retry, persistence, reload, and recovery are implemented. Add break carryover and production Cloud evidence. |
| 13 | Failure recovery | Failed agent run preserves state | Partial | Local managed timeout, malformed output, cancellation, stale write, and atomic transaction behavior are covered; add production recovery evidence. |

## Completed implementation

- Installable responsive PWA shell and offline fallback.
- Anonymous and Google authentication, safe linking, sign-out warnings, and local-data controls.
- Owner-scoped workspace provisioning and Firestore rules.
- Reviewed, validated, idempotent Plan creation and owner-scoped Plans list.
- Deterministic Today step and confirmed immutable completion.
- Typed read-only recommendation preview with cancellation, timeout, offline,
  unavailable, malformed-response, and retry handling.
- Versioned Plan working days and weekly allocation with Plan Details editing,
  validation, retry, stale-save rejection, and owner-scoped rules.
- Finite portfolio allocation summary plus the Plan Details shell with safe
  loading, missing, malformed, failed-read, retry, and context-empty states.
- Local Clara schedule-change proposal with exact before/after review, explicit
  rejection, authenticated version check, idempotent transaction, immutable audit
  record, and authoritative refresh.
- Local Calendar approved-day transaction with exact terminal-run copying, explicit
  replacement, owner/date scoping, revision conflict protection, idempotent audit,
  durable reload, and failure preservation.

## Deadline delivery order

1. Deploy and capture production evidence for the managed API and approved write.
2. Add one checkpointed asynchronous run plus Cloud logs and recovery evidence.
3. Add the calendar success/failure path required by the demo.
4. Add research review, versioned brief, achievement, and consented reflection.
5. Re-capture all 13 screenshots from verified PWA states and record the final PWA demo.

No prototype screenshot or narration claim is implementation proof. Final submission
copy must distinguish verified PWA behavior, managed cloud behavior, and design-only
screens until every corresponding acceptance check passes.

The acceptance demo is the review control room for these requirements. Its reviewed
checkmarks record manual mockup review only; implementation status remains authoritative.
