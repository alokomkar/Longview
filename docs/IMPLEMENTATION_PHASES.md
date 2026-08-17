# Longview Implementation Phases

Status: Authentication slice deployed - subject to change
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
