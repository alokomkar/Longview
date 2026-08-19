# Release 4 Implementation Verification

Status: Local release gate passed; production acceptance pending

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

## Remaining production gate

Merge the reviewed branch, deploy Firestore rules and Firebase Hosting, then use a new
anonymous browser context to create a Plan, save a decision and Clara guidance, reload,
and confirm both records restore. Record that exact production journey with QuickTime.
