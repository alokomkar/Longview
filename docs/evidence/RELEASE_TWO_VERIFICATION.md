# Release 2 verification evidence

Status: merged and deployed on 18th August 2026.

## Automated verification

- PWA unit/integration: 241 passed.
- FastAPI unit/integration: 48 passed; 11 emulator-only tests skipped in the non-emulator run.
- Firestore rules: 11 passed.
- Firestore approval emulator: 2 passed, including concurrent approvals where exactly one succeeds and one receives a stale-version conflict.
- Mobile Chrome E2E: 18 passed, covering the full acceptance suite and Release 2 success, rejection, timeout, malformed response, network failure, stale conflict, idempotent recovery and responsive layout.

## Performance checks

- Page load, 10 isolated 390x844 Chrome contexts: DOMContentLoaded median 44.5 ms, p95 47.6 ms; load median 44.6 ms, p95 47.7 ms.
- Responsive checks at 320, 375, 768 and 1280 px: no horizontal overflow; visible controls were at least 44x44 px.
- Main JavaScript delta versus Release 1: +7,798 bytes raw and +1,554 bytes gzip (about 1.38%).
- Local API health, 20 calls: median 0.21 ms, p95 0.28 ms.
- First emulator-backed approval: 256.46 ms. Ten duplicate-result recoveries: median 2.26 ms, p95 2.78 ms.
- Existing Firestore bundle warning remains; Release 2 did not introduce it.

## QuickTime evidence

- Local artifact: `/Users/alokgudikote/Desktop/Screen Recording 2026-08-18 at 10.56.46 PM.mov`
- H.264, 3456x2234, 125.475 seconds, 51,764,495 bytes.
- Journey: recommendation loading, context/rationale/confidence, exact before/after review, explicit approval, progress, audit result, rejection, stale conflict, duplicate recovery and invalid proposal.
- The video is intentionally not committed because of its 52 MB size.

## Deployment boundary

- PR #18 merged to `master` as `94378d3`.
- Firebase Hosting serves the Release 2 bundle from <https://longview-505611.web.app/> with no localhost or emulator endpoint embedded.
- Cloud Run revision `longview-clara-api-00003-x8f` serves 100% of traffic at <https://longview-clara-api-112452643430.asia-south1.run.app>.
- Production OpenAPI exposes only `/health`, `/v1/clara/recommendations`, and `/v1/clara/approvals`; hidden schedule-run routes return `404`, unauthenticated valid approval requests return `401`, and the production origin passes CORS preflight.
- The runtime identity has `roles/aiplatform.user`, `roles/firebaseauth.viewer`, and `roles/datastore.user`; it has no project-wide editor or owner role.
- An authenticated production Plan request returned a Vertex recommendation and exact review preview. Rejection restored the unchanged Plan schedule; no approval write was submitted during deployment verification.
