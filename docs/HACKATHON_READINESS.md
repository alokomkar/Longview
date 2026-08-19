# Longview Hackathon Readiness Ledger

Status: Active delivery checklist

Updated: 2026-08-19

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
| 4 | Plan details | One Plan with execution and context | Implemented locally | Details, execution proof, reviewed decisions, research, current brief, and version history are present; Release 5 production evidence remains. |
| 5 | Plan achievement | Outcome and consented reflection | Implemented locally | Release 6 verifies required evidence, optional private reflection, exact statement-level reuse consent, atomic recovery, reload, and revocation; production evidence remains. |
| 6 | Clara context | Visible bounded context | Partial | Local managed boundary uses one Plan and Today step; add deployed-model evidence and multi-Plan context where required. |
| 7 | Agentic actions | Bounded action catalogue | Implemented locally | Ask Clara exposes grouped, typed Quick Actions that make no menu-time network call or write and hand off to existing Calendar and Plans review flows. |
| 8 | Tradeoff recommendation | Cross-Plan managed recommendation | Missing | The local single-Plan managed boundary is ready; add deployed cross-Plan reasoning and evidence. |
| 9 | Human approval | Before/after preview and approved write | Implemented locally | Capture production Cloud evidence for the exact preview, rejection, stale check, audit, and idempotent write. |
| 10 | Research review | Accept/reject/defer evidence | Implemented locally | Capture live grounded-provider and production persistence evidence. |
| 11 | Versioned memory | User-approved brief version | Implemented locally | Capture production save, reload, history, and stale-edit evidence. |
| 12 | Calendar success | One approved capacity-bounded day | Partial | Local proposal, adjustment, approval, replacement, retry, persistence, reload, recovery, and next-eligible-day break carryover are implemented. Production Cloud evidence remains. |
| 13 | Failure recovery | Failed agent run preserves state | Partial | Local managed timeout, malformed output, cancellation, stale write, and atomic transaction behavior are covered; add production recovery evidence. |

## Completed implementation

- Installable responsive PWA shell and offline fallback.
- Anonymous and Google authentication, safe linking, sign-out warnings, and local-data controls.
- Owner-scoped workspace provisioning and Firestore rules.
- Reviewed, validated, idempotent Plan creation and owner-scoped Plans list.
- Deterministic Today step and confirmed immutable completion.
- Owner-scoped connection-loss Today completion outbox with device-only pending proof,
  reconnect progress, idempotent duplicate convergence, and safe retry. Cold offline
  launch and reload are deferred.
- No-task Today guidance names the next eligible scheduled Plan day.
- Typed read-only recommendation preview with cancellation, timeout, offline,
  unavailable, malformed-response, and retry handling.
- Bounded Clara Quick Actions grouped by outcome, restricted to typed Calendar and
  Plans destinations, with no menu-time network call or durable write.
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
- Local Calendar break transaction with authoritative destination preview, explicit
  confirmation, atomic pending carryovers, reload, destination proposal enrichment,
  idempotent audit, and preservation on stale or future-day conflicts.
- Local attributed research with strict provider-response validation, visible source
  links and Search suggestions, explicit Accept/Reject/Not now reviews, and recovery.
- Local editable Plan Brief proposals with accepted-source enforcement, final review,
  immutable versions, current pointer, reload, idempotency, and stale-tab protection.
- Local Plan achievement with required completion proof, optional private reflection,
  default-deny exact reuse consent, atomic completion, reload, append-only revocation,
  idempotency, stale protection, and completed-Plan portfolio history.

## Deadline delivery order

1. Deploy and capture production evidence for the managed API and approved write.
2. Add one checkpointed asynchronous run plus Cloud logs and recovery evidence.
3. Add the calendar success/failure path required by the demo.
4. Deploy and capture production evidence for research review, the versioned brief,
   achievement, and consented reflection.
5. Re-capture all 13 screenshots from verified PWA states and record the final PWA demo.

No prototype screenshot or narration claim is implementation proof. Final submission
copy must distinguish verified PWA behavior, managed cloud behavior, and design-only
screens until every corresponding acceptance check passes.

The acceptance demo is the review control room for these requirements. Its reviewed
checkmarks record manual mockup review only; implementation status remains authoritative.
