# Release 5 Verification

Status: Local release gate passed; merge and deployment pending

Verified: 2026-08-19

## Automated evidence

| Gate | Result |
|---|---:|
| Frontend unit/integration | 306 passed |
| FastAPI | 56 passed, 11 skipped |
| Firestore rules | 17 passed |
| Emulator-backed Release 5 mobile E2E | 2 passed |
| Full regression E2E | 32 passed |

The browser journey covers all three research decisions, source display, editable and
final brief review, immutable history, reload, two-tab stale protection, cancellation,
timeout, malformed output, unavailable service, offline behavior, and 200% text scaling.

## Build and responsiveness

- Release 5 build: 1,012 KiB; precache 960.86 KiB.
- Main JavaScript: 429.87 kB / 122.40 kB gzip. CSS: 10.68 kB / 2.90 kB gzip.
- Existing Firestore chunk: 523.49 kB / 155.21 kB gzip; this is the only size warning.
- No `127.0.0.1`, Auth-emulator, or Firestore-emulator endpoint is embedded.
- Local static checks at 320 px and 456 px loaded in under 50 ms with no horizontal
  overflow; 200% root text also had no horizontal overflow.
- Thirty local asset requests averaged under 0.7 ms. These are machine-local timings,
  not production latency evidence.

## Recording and limits

`/Users/alokgudikote/Desktop/Longview Release 5 Research Brief Acceptance 2026-08-19.mov`
is a 40.62-second, 3456 × 2234, 16.28 MB full-screen QuickTime recording. Extracted
frames were visually checked at the research review, final brief review, and stale-edit
journey. It uses the isolated emulator and an intercepted attributed response; it does
not prove live Google Search, Cloud Run, Firebase Hosting, or production IAM. Docker
image construction was not run because this host has no Docker CLI; FastAPI import and
contract tests passed instead.

Official constraints checked: [Google Search grounding](https://ai.google.dev/gemini-api/docs/google-search)
and [structured outputs with tools](https://ai.google.dev/gemini-api/docs/structured-output).
