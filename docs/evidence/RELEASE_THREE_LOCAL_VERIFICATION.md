# Release 3 Local Verification

Status: Passed locally; not merged or deployed

Verified: 2026-08-18

Contract: [Release 3 daily schedule](../RELEASE_THREE_DAILY_SCHEDULE.md)

## Automated evidence

- Frontend unit/integration: 252 passed.
- FastAPI plus live Firestore emulator: 60 passed.
- Firestore security rules: 11 passed.
- Mobile Chrome E2E: 21 passed, including the complete Release 3 mockup and failures.
- TypeScript production build: passed.

The suites cover capacity bounds, completed-step exclusion, typed malformed responses,
offline/unavailable classification, client and service deadlines, cancellation,
transactional approval/replacement/break writes, stale revisions, concurrent duplicate
runs, idempotent retries, destination conflicts, pending carryover consumption, and
atomic failure recovery.

## Browser acceptance

An isolated Release 3 stack used Firebase Auth and Firestore emulators, FastAPI at
`127.0.0.1:8787`, and the PWA at `127.0.0.1:5175`. The real React journey passed:
anonymous onboarding, Plan creation, proposal checkpoints, explicit approval,
cancellation with revision 1 preserved, break preview to the next eligible Plan day,
and atomic break confirmation. No production data was read or written.

## Performance and media

- Production preview: DOM ready 35 ms, load 37 ms, four resources, 121,153 transferred
  bytes and 410,797 decoded bytes on the local machine.
- Main PWA bundle: 396.07 kB minified / 114.80 kB gzip, up 1.47 kB / 0.52 kB from
  Release 2 (0.37% / 0.46%). Firestore bundle stayed 523.42 kB / 155.18 kB gzip.
- Precache: 918.07 KiB, up 1.44 KiB (0.16%). Mobile E2E found no horizontal overflow.
- Concise QuickTime evidence: `~/Desktop/Screen Recording 2026-08-18 at
  11.43.09 PM.mov`; 76.065 seconds, 3456×2234, 28,702,660 bytes. The recording is a
  local review artifact and is not committed.

## Open release gates

- Merge and Firebase Hosting/Cloud Run deployment require product-owner approval.
- Production smoke, Cloud Run revision/log evidence, and real-user latency remain
  pending until that approval.
- Pub/Sub worker isolation and offline cold-start support remain later releases.
