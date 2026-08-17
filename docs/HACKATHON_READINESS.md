# Longview Hackathon Readiness Ledger

Status: Active delivery checklist

Updated: 2026-08-17

Sources: [PRD](PRODUCT_REQUIREMENTS.md) | [Implementation phases](IMPLEMENTATION_PHASES.md) | [Interactive mockup](design/longview-pwa-interactive-mockup.html) | [Gallery](demo/DEVPOST_GALLERY.md) | [Demo script](demo/PROTOTYPE_DEMO_SCRIPT.md)

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
| 1 | Today | Capacity-aware work and conflict | Partial | Add working days, multi-Plan capacity, and visible conflict reasoning. |
| 2 | Portfolio | Three Plans sharing finite capacity | Partial | Add operating modes, allocations, milestones, next actions, and cross-Plan recommendation. |
| 3 | Plan creation | Reviewed structured Plan | Partial | Add working-day selection and advisor-assisted suggestions; preserve explicit confirmation. |
| 4 | Plan details | One Plan with execution and context | Missing | Make Plan cards navigable; add overview, schedule, current step, history, decisions, research, and brief entry points. |
| 5 | Plan achievement | Outcome and consented reflection | Missing | Add completion evidence, reflection, and explicit reusable-memory consent. |
| 6 | Clara context | Visible bounded context | Partial | Current preview uses one Plan and Today step; add deployed managed API and multi-Plan context where required. |
| 7 | Agentic actions | Bounded action catalogue | Missing | Add judged quick actions backed by typed agent tools. |
| 8 | Tradeoff recommendation | Cross-Plan managed recommendation | Missing | Add managed model call, structured response, timeout/malformed protection, and rationale. |
| 9 | Human approval | Before/after preview and approved write | Partial | Today completion is approval-gated; schedule-change preview, rejection, stale check, audit, and idempotent write remain. |
| 10 | Research review | Accept/reject/defer evidence | Missing | Add attributed cards and non-destructive review states. |
| 11 | Versioned memory | User-approved brief version | Missing | Add editable proposal, attribution, version history, and explicit save. |
| 12 | Calendar success | One approved capacity-bounded day | Missing | Add propose, adjust, approve, break, retry, and one-day persistence. |
| 13 | Failure recovery | Failed agent run preserves state | Partial | Client failures are covered; add managed run timeout, malformed output, cancellation, stale write, and partial-recovery evidence. |

## Completed implementation

- Installable responsive PWA shell and offline fallback.
- Anonymous and Google authentication, safe linking, sign-out warnings, and local-data controls.
- Owner-scoped workspace provisioning and Firestore rules.
- Reviewed, validated, idempotent Plan creation and owner-scoped Plans list.
- Deterministic Today step and confirmed immutable completion.
- Typed read-only recommendation preview with cancellation, timeout, offline,
  unavailable, malformed-response, and retry handling.

## Deadline delivery order

1. Persist availability with at least one working day and expose it in Settings.
2. Add navigable Plan Details with the stored Plan, working days, and current step.
3. Add three-Plan portfolio capacity and the minimal managed recommendation API.
4. Add exact recommendation preview, approval/rejection, idempotent write, and audit record.
5. Add one checkpointed asynchronous run plus Cloud logs and recovery evidence.
6. Add the calendar success/failure path required by the demo.
7. Add research review, versioned brief, achievement, and consented reflection.
8. Re-capture all 13 screenshots from verified PWA states and record the final PWA demo.

No prototype screenshot or narration claim is implementation proof. Final submission
copy must distinguish verified PWA behavior, managed cloud behavior, and design-only
screens until every corresponding acceptance check passes.
