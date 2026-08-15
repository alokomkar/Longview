# Longview Implementation Phases

Status: Initial v0.1 - subject to change  
Updated: 2026-08-15  
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

Approve Phase 1 states before coding. Implement emulator-backed anonymous continuity
and one mobile Playwright test first; account linking follows as a separate slice.
