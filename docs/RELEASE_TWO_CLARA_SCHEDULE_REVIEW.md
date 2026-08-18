# Release 2: Clara Schedule Review

Status: Local implementation

Interactive acceptance: [schedule-change journey](design/longview-release-two-clara-approval.html)

Verification: [automated, performance and QuickTime evidence](evidence/RELEASE_TWO_VERIFICATION.md)

## User outcome

Clara may propose adding or removing exactly one working day from the selected Plan.
The user sees the current and proposed days, unchanged weekly hours, rationale, and
downstream effect before explicitly approving or rejecting the proposal.

## Safety and persistence contract

- Opening Clara or rejecting a proposal writes nothing.
- Model output never supplies trusted Plan identity, version, or current values.
- Approval requires Firebase authentication, a fresh idempotency key, the expected
  schedule version, and an exact match with current working days and weekly hours.
- One Firestore transaction updates the Plan version and creates one immutable audit
  event. Repeating the same key and payload returns the original result.
- A reused key with different input, stale version, changed days, changed allocation,
  missing Plan, or wrong owner fails without a partial write.

## User-visible states

Recommendation progress, recommendation-only, review, approval progress, success,
explicit rejection, cancellation, timeout, malformed proposal, offline/network
failure, stale conflict, duplicate recovery, and safe retry are required.

## Production boundary

The Release 2 PWA exposes direct Plan/step questions and the schedule review only.
Calendar, Quick Actions, day preparation, breaks, research, Plan Briefs, task writes,
and model-direct writes remain hidden. The Release 2 FastAPI entry point exposes only
health, recommendations, and approvals.

## Release gates

1. Unit and integration tests cover schema, auth, ownership, stale values,
   concurrency, idempotency, transaction failure, and response validation.
2. Mobile E2E covers approve, reject, conflict, network failure, retry, and reload.
3. Full E2E sanity and bundle, page-load, network-latency, and responsiveness checks
   have recorded evidence and no unexplained regression.
4. QuickTime records the successful journey and important failure states.
5. No merge or deployment occurs without product-owner approval.
