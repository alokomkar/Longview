# Release 4 Pre-implementation Baseline

Status: Passed locally; implementation not started

Verified: 2026-08-19 (Asia/Kolkata)

Contract: [Release 4 durable Plan record](../RELEASE_FOUR_PLAN_RECORD.md)

Base: `master` at `c8a75f9`; design commit `a63064b`

## Regression baseline

- Frontend unit/integration: 252 passed across 29 files in 2.47 seconds.
- FastAPI with the live Firestore emulator: 60 passed in 5.79 seconds.
- Firestore security rules: 11 passed in 0.78 seconds.
- Full Playwright E2E: 26 passed in 15.4 seconds, including all five Release 4
  interactive-mockup contracts.
- TypeScript production build: passed in 0.76 seconds.

Existing React `act(...)`, IndexedDB fallback, and Starlette/httpx deprecation warnings
remain baseline warnings; no new product implementation exists in this branch yet.

## Size and local delivery baseline

- Main PWA bundle: 396.07 kB minified / 114.80 kB gzip.
- Firestore bundle: 523.42 kB minified / 155.18 kB gzip. Vite reports the existing
  greater-than-500-kB chunk warning.
- CSS: 8.89 kB minified / 2.59 kB gzip.
- PWA precache: 11 entries / 918.07 KiB; complete `dist` output: 957,236 bytes.
- Thirty production-preview requests to the HTML: 0.585 ms average total, 0.457 ms
  p50, 0.883 ms p95, and 3.422 ms maximum on this local machine.
- Thirty requests to the main bundle: 0.714 ms average total and 0.942 ms p95.
- Thirty requests to the Firestore bundle: 0.725 ms average total and 1.060 ms p95.

These loopback measurements are regression anchors, not production-user latency.
An attempted emulator-driven Plan Details interaction sample was discarded because
anonymous workspace setup timing made the run non-repeatable. Post-change acceptance
must collect a deterministic browser sample before making an interaction claim.

## Review media

- QuickTime design acceptance recording: `~/Desktop/Longview Release 4 Plan Record
  2026-08-19.mov`.
- Media properties: 92.648 seconds, 3456×2234, 17,442,425 bytes.
- Coverage: successful history/decision/guidance journeys plus cancellation, timeout,
  malformed response, offline, duplicate, conflict, lost-response recovery, and record
  read failure states.

The recording demonstrates the reviewed design contract only. It is not evidence that
Release 4 is implemented.

## Open gate

Product-owner approval of the linked interactive mockup is required before code changes.
Merge, production deployment, post-change performance comparison, and an implemented
journey recording remain pending.
