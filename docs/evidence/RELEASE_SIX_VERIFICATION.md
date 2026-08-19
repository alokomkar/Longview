# Release 6 Verification

Status: Local release gate passed; merge and deployment pending

Verified: 2026-08-19

## Automated evidence

| Gate | Result |
|---|---:|
| Frontend unit/integration | 322 passed |
| Firestore rules | 19 passed |
| Emulator-backed Release 6 mobile E2E | 2 passed |
| Full regression E2E | 32 passed |
| Release 5 regression E2E | 2 passed |

The mobile journey covers blocked completion, evidence validation, selective and
default-deny consent, no-reflection completion, cancellation, offline failure, atomic
save, reload, completed-Plan history, revocation, and 200% text scaling.

## Build and responsiveness

- Release 6 precache: 991.79 KiB.
- Main JavaScript: 453.12 kB / 127.47 kB gzip. CSS: 12.28 kB / 3.19 kB gzip.
- Existing Firestore chunk: 523.50 kB / 155.21 kB gzip; this remains the size warning.
- The production build embeds the Cloud Run API URL and no local emulator endpoint.
- Emulator-backed mobile navigation stayed under 3 seconds, the multi-screen editor
  interaction under 5 seconds, and the atomic completion transaction under 10 seconds.
  These thresholds are local safeguards, not production latency evidence.
- Pixel 7 viewport at 200% root text had no horizontal overflow.

## Recording and limits

QuickTime acceptance recording:

- `~/Desktop/Longview Release 6 Achievement Consent Acceptance 2026-08-19.mov`
- 41.49 seconds, 3456 x 2234, 27.49 MB.
- Visually checked at the evidence editor, saved achievement, completed-Plan history,
  consent withdrawal, and reload boundaries.

The verified browser uses isolated Firebase emulators and an intercepted empty approved-day
response; it does not prove Firebase Hosting, production Firestore rules, production IAM,
or real-user latency. Release 6 does not call a model when recording achievement or changing
reuse consent.
