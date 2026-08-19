# Release 4 Implementation Verification

Status: Production release gate passed

Verified: 2026-08-19 (Asia/Kolkata)

Contract: [Release 4 durable Plan record](../RELEASE_FOUR_PLAN_RECORD.md)

## Implemented boundary

- Plan Details loads immutable completion and approved-change evidence with source IDs.
- A user reviews an exact decision and rationale before one append-only Plan record.
- Validated Clara guidance remains transient until a second explicit review saves its
  recommendation, rationale, confidence, source facts, and recommendation ID.
- Owner-scoped Firestore rules allow valid record creation and reads, deny cross-owner
  access, and prohibit update/delete. Audit events are owner-readable but client writes
  remain forbidden.
- Record creation verifies the Plan, uses one request fingerprint and idempotency key,
  and restores the original record after a lost response or duplicate retry.

## Automated evidence

- Frontend unit/integration: 275 passed across 33 files.
- FastAPI with Firestore emulator: 60 passed. The approval transaction permits ten
  Firestore retries so concurrent requests converge to one commit and one conflict.
- Firestore security rules: 14 passed, including record ownership, shape, parent-Plan,
  immutability, and audit-read boundaries.
- Existing Playwright regression: 26 passed.
- Emulator-backed mobile PWA: anonymous onboarding, Plan creation, decision save,
  retained Clara guidance, reload, authoritative restore, and horizontal fit passed.
- Production TypeScript/PWA build passed, and its assets contain no local Auth,
  Firestore, or Clara emulator endpoint.

## Size comparison

| Asset | Baseline | Release 4 | Delta |
|---|---:|---:|---:|
| Main JS, gzip | 114.80 kB | 117.29 kB | +2.49 kB |
| CSS, gzip | 2.59 kB | 2.72 kB | +0.13 kB |
| Firestore JS, gzip | 155.18 kB | 155.21 kB | +0.03 kB |
| PWA precache | 918.07 KiB | 931.50 KiB | +13.43 KiB |

The existing greater-than-500-kB Firestore chunk warning remains. The Release 4 main
bundle increase is 2.17% gzip and does not add a network call during navigation.

## Production acceptance

- PR #21 merged to `master` at `a3fc534`.
- Firestore rules and Firebase Hosting deployed successfully to
  `https://longview-505611.web.app`.
- A fresh anonymous production context created a Plan, saved a reviewed decision,
  received managed Clara guidance, explicitly retained it, reloaded, and restored both
  immutable records. The mobile production E2E passed in 28.2 seconds.
- The passing managed recommendation completed in 13.736 seconds. One preceding call
  returned a safe invalid-response error; the UI kept all data unchanged and exposed
  retry. Managed-model response consistency remains an observed reliability risk.

## Production recording

- QuickTime file: `~/Desktop/Longview Release 4 Production Anonymous 2026-08-19.mov`.
- 237.172 seconds, 3456×2234, 39,805,451 bytes.
- Full-screen coverage: anonymous onboarding, Plan creation, exact decision review,
  immutable save, Clara progress, guidance review/save, reload, and record restoration.
- Frames sampled at 30, 120, and 225 seconds confirm the full-resolution journey.
