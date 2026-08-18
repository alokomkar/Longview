# Phase 0 Early Access Release

Status: Release candidate

Target: 18th August 2026

Interactive acceptance: [Phase 0 release journey](design/longview-phase-zero-release.html)

## User outcome

A new user can enter Longview, create one Plan with working days, receive one bounded
step on an eligible day, and explicitly record completion. The saved Plan remains the
source of truth across reloads and Google-linked devices.

## Production surface

- Anonymous or Google authentication and owner-scoped workspace provisioning.
- Empty Today, Plan creation, review, save, Plans list, and Plan Details.
- Plan-level working days and weekly allocation.
- Deterministic 30–60 minute Today step and idempotent completion confirmation.
- Account linking, sign-out protection, and local-data controls.

## Deliberately hidden

Calendar proposals, day breaks, Clara recommendations and writes, research, Plan
Briefs, and execution history remain implemented experiments, not Phase 0 promises.
The production Today flow does not call those services. Offline cold-start recovery is
also deferred; online reliability is the release priority.

## Release gates

1. Unit and component tests cover empty, ready, save failure, retry, duplicate,
   malformed data, ownership, and the Phase 0 service boundary.
2. Firestore emulator rules deny unauthenticated and cross-owner access.
3. Mobile Chrome E2E covers authentication and workspace continuity.
4. A production build must show only Today, Plans, and Settings navigation.
5. Firebase Hosting smoke verification must pass before sharing the URL.

## Manual acceptance

Open the interactive journey, follow **Begin Phase 0**, create and review a Plan,
return to Today, complete the step, then inspect Plans. Use the scenario menu to verify
authentication, workspace, Plan-save, Plans-load, and completion failures all preserve
the last confirmed data and offer a safe retry.
