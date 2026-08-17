# Longview Implementation Phases

Status: Day 2 Slice 3 implemented locally, awaiting acceptance - subject to change
Updated: 2026-08-17
Links: [PRD](PRODUCT_REQUIREMENTS.md) | [Mockup](design/longview-pwa-interactive-mockup.html) | [Stack](TECH_STACK.md)

## Rules

- Scope is an installable, mobile-friendly PWA.
- Review mockup failures before implementation.
- Model output is typed and advisory; durable writes require explicit approval.
- Test success, cancellation, timeout, malformed input, offline operation, retries,
  concurrency, stale versions, idempotency, and partial recovery.

## Phases

1. **Cloud prerequisite:** Create one Google Cloud project and enable Firebase on it;
   claim credits, configure budgets, emulators, least-privilege identities, and secrets.
   Choose Firestore/Cloud Run regions only after confirming Vertex AI availability.
2. **Authentication:** Build anonymous sign-in, Google linking, session continuity, and
   FastAPI token verification. Test cancellation, popup blocking, expiry, revocation,
   malformed tokens, concurrent tabs, offline return, duplicates, and account
   collisions. Linking must retain exactly one workspace transactionally.
3. **PWA foundation:** Add routing, responsive shell, manifest, service worker,
   accessibility, availability onboarding, IndexedDB outbox, and update recovery.
4. **Goal authority:** Add versioned schemas, Firestore rules, Goals, Today, Portfolio,
   deterministic scheduling, cross-user isolation, audit events, and emulator seeds.
5. **Clara read loop:** Use Google ADK with Gemini 3.5 Flash or newer through Vertex AI.
   Return scoped recommendations and clarification; fail closed on timeout, malformed
   output, or prompt injection. No model-direct writes.
6. **Approved writes:** Show exact before/after previews; enforce authorization,
   invariants, expected versions, idempotency, transactions, rejection, and recovery.
7. **Async follow-through:** Trigger a Cloud Run worker through Pub/Sub; checkpoint,
   retry, cancel, dead-letter, and correlate Cloud logs. Results remain advisory.
8. **Memory and release:** Add reviewed research and versioned Goal Briefs; deploy the
   PWA/API/worker; add README instructions, CI/E2E gates, current
   architecture diagram, disclosure, and a live Cloud-evidenced demo.

## First review gate

Product-owner authorization to begin local implementation was received on 2026-08-16.
The first slice implements emulator-backed anonymous continuity, a mobile Playwright
contract, explicit authentication failures, and owner-scoped Firestore rules. Google
linking is a separate boundary: cancellation, blocked popups, offline failures, and
account collisions must preserve the anonymous workspace. No Cloud deployment is
authorized by this approval.

The second slice provisions `/users/{uid}` and `/users/{uid}/workspaces/default` in
one idempotent transaction after authentication. Anonymous-to-Google linking retains
the Firebase UID, so the same workspace remains authoritative. Provisioning failure
keeps the authenticated session, exposes retry, and never creates a second workspace.

The local PWA foundation now gates Vite startup on Firestore Emulator readiness,
lazy-loads Firestore after authentication, exposes offline/update status, captures a
realistic weekly availability budget, and lands on Empty Today with mobile navigation.
Settings includes explicit sign-out and confirmed local-data clearing. Local clearing
removes browser preferences and cached PWA files, then signs out; it never deletes the
cloud or emulator workspace. Anonymous sessions retain a Google-link action in Settings
after onboarding, so cross-device protection is never hidden by local progress.

The authentication slice is deployed to Firebase Hosting for production-domain
acceptance. The hosted build uses Google and anonymous authentication plus owner-scoped
production Firestore rules; emulator flags remain limited to local development.
When a Google identity already owns a workspace, Longview never merges silently. It
preserves the anonymous workspace and offers an explicit switch to the existing Google
workspace. Local-data clearing also unregisters the service worker before deleting its
caches to prevent a controlled page from referencing an empty cache.
Anonymous authentication never gates onboarding on account linking. Workspace-ready
users can continue directly to availability and Today, while Google linking remains an
optional secondary action available again from Settings.
Anonymous sign-out and local-data clearing require a loss-of-access warning and offer
Google linking first. Recovering an unlinked anonymous session is explicitly deferred
beyond the MVP; the underlying workspace is not silently deleted.

## Day 1 delivery slices

1. **Plan creation:** A typed form captures title, desired outcome, rationale, target
   date, and weekly capacity. Users review before an idempotent Firestore transaction;
   validation, cancellation, failed saves, retries, ownership, and immutable creation
   are tested. This PR deliberately stops before Plans listing and Today scheduling.
2. **Plans list:** Load owner-scoped Plans and replace empty states without expanding
   into editing, deletion, or collaboration. Loading, empty, populated, and failed
   reads have explicit mobile states; failed reads preserve data and offer retry.
3. **First Today step:** Derive one deterministic, reviewable next step from the saved
   Plan. Model-generated recommendations remain a separate Day 2 boundary. The nearest
   active target wins with stable tie-breaking; weekly capacity bounds the step to
   30–60 minutes. This slice performs no automatic write.

Slice 1 was accepted and merged on 2026-08-17. Slice 2 reads the authenticated
owner's Plans only when the Plans tab opens, orders them by creation time, and keeps
read failures non-destructive. Firestore rules test owner listing plus unauthenticated
and cross-owner denial. The linked mockup exposes populated, loading, empty, and
failed-list states under Long-term Plans.

Slice 2 was accepted and merged on 2026-08-17. Slice 3 validates stored Plan data at
runtime, fails closed on malformed records, and prepares one deterministic Today step.
The result identifies its source Plan and explains that nothing was changed. Empty,
loading, read-failure/retry, and ready states remain explicit. The linked mockup's first
step and Today failure states reflect this non-model, non-writing boundary.

Slice 3 was accepted and merged on 2026-08-17, completing the planned Day 1 slices.

## Day 2 delivery slices

1. **Today completion:** Require explicit confirmation before one owner-scoped,
   immutable completion write. The completion ID is deterministic for date, Plan, and
   step type, so retries are idempotent and reload restores the completed state.
   Cancellation and failed saves leave the step open. Completing a step does not edit
   the Plan, prepare another task, or change the schedule. The linked mockup includes
   confirmation, failed-save recovery, and completed states.

Slice 1 was accepted and merged on 2026-08-17.

2. **Clara read recommendation:** Build a minimal typed context from the selected
   Plan and Today step and return one read-only recommendation with rationale,
   confidence, and visible source facts. Cancellation, timeout, offline, unavailable,
   and malformed-response states leave all durable data unchanged. This slice uses a
   deterministic preview adapter to validate the client contract; the managed model
   and API adapter are the next boundary and are not claimed here.
3. **Availability days:** Persist at least one user-selected working day with the
   weekly budget, restore it across sessions, and make it editable from Settings.
   Empty, invalid, offline, retry, and concurrent-session behavior must preserve the
   last accepted availability.
4. **Plan Details:** Make every Plan card navigable and show the saved outcome,
   rationale, target, weekly allocation, working days, and current Today status.
   Loading, malformed data, missing Plan, and failed-read recovery are explicit.

Slice 2 was accepted and merged on 2026-08-17. Slice 3 now persists working days,
weekly capacity, and preferred time in the owner workspace. Versioned transactions
reject stale concurrent saves; invalid or failed saves retain the last accepted value.
Settings reopens the same schedule for editing. This slice does not yet make Today
skip ineligible days. Existing workspaces without a saved schedule instead expose a
clear Set availability action in Settings; the remaining scheduling behavior stays
tracked in [Pending features](PENDING_FEATURES.md).

The remaining judged surfaces and the replacement status of every gallery asset are
tracked in [Hackathon readiness](HACKATHON_READINESS.md).
