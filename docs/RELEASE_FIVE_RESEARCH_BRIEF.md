# Release 5: Reviewed Research and Versioned Plan Brief

Status: Implemented and verified locally; merge and deployment pending

Last updated: 2026-08-19

Interactive acceptance: [Release 5 reviewed research and Plan Brief](design/longview-release-five-research-brief.html)

## Outcome

A user can turn attributed evidence into a Plan Brief without allowing research or
model output to silently change the Plan. Research remains inspectable and recoverable;
every saved brief is an immutable, user-approved version.

## Release boundary

- Research requests are Plan-scoped and read-only until a user reviews a card.
- Every card shows its finding, source type, source title, source locator, observed or
  published date, and retrieval time. A card without valid attribution is rejected.
- **Accept**, **Reject**, and **Not now** append a reviewed decision. Rejected evidence
  remains auditable, deferred evidence remains recoverable, and a later review appends
  a new decision rather than erasing history.
- Accepted cards may be used to prepare an editable Plan Brief proposal. Preparing or
  editing a proposal creates no durable brief version.
- Saving requires a final preview containing the edited text, evidence attribution,
  expected current version, and exact Plan. **Not now** leaves the current brief intact.
- This release does not add autonomous research scheduling, cross-Plan memory,
  reflection memory, background web crawling, or model-direct writes.

## Durable model

All documents are owner- and Plan-scoped below
`users/{uid}/workspaces/default/plans/{planId}`.

| Record | Contract |
|---|---|
| `research/{researchId}` | Immutable validated evidence and attribution snapshot |
| `researchReviews/{reviewId}` | Append-only status decision, expected research revision, idempotency key, server time |
| `briefVersions/{versionId}` | Immutable focus, approach, success evidence, one to three accepted research IDs, and version number |
| Plan brief pointer | Current version and revision, changed only in the brief-save transaction |

The server derives trusted ownership, Plan identity, current revisions, and timestamps.
The same idempotency key and fingerprint restores the original outcome; reuse with
different content fails closed.

## Complete journey

1. Open Plan Details and enter **Research and Brief** without making a network request.
2. Load saved cards, their current review states, and the current brief independently.
3. Request new research. Progress remains visible until success, cancellation, timeout,
   malformed response, or network failure. Existing cards and brief remain available.
4. Inspect attribution and choose Accept, Reject, or Not now. The reviewed state is
   saved once and restored after an interrupted or duplicate response.
5. Prepare a proposal from accepted cards, edit its fields, inspect linked evidence,
   and choose **Not now** or **Review Plan Brief**.
6. Confirm the exact proposal and expected version. A successful transaction appends
   one immutable version and advances the current pointer once.
7. Open version history to compare the current and earlier brief with their sources.

## Failure and recovery contract

| Failure | Visible result | Durable effect | Recovery |
|---|---|---|---|
| Cancel, timeout, malformed research, offline request | Existing cards and brief stay visible | None | Retry research |
| Missing attribution | Invalid card is excluded and explained | None | Request fresh research |
| Review cancellation or write failure | Card keeps its last confirmed state | None or one review event | Retry original key |
| Concurrent/duplicate card review | Latest authoritative state is shown | One matching event | Reload card |
| Research response lost after commit | Original review is restored | One event | Continue |
| Brief proposal cancelled or deferred | Current brief and accepted cards remain | None | Prepare again |
| Brief save offline/network failure | Edited proposal remains on screen | None or one version | Retry original key |
| Stale or concurrent brief edit | Current version is shown; edit is not saved | None | Refresh and reapply |
| Duplicate/unknown brief result | Original saved version is restored | One version | View history |
| Research read failure | Current brief remains; cards show unavailable | None | Retry cards only |
| Brief read failure | Cards remain; no stale brief is shown | None | Retry brief only |

## Acceptance and evidence

- Unit tests cover attribution validation, derived review state, proposal parsing,
  source binding, fingerprints, version ordering, empty values, and malformed data.
- Firestore emulator tests cover owner isolation, append-only evidence and versions,
  expected revisions, idempotency conflicts, concurrent saves, and pointer atomicity.
- Integration tests cover success, cancellation, timeout, malformed output, offline and
  network failure, retries, unknown results, stale edits, and partial recovery.
- Mobile E2E covers all three research decisions, proposal editing and deferral, exact
  review, version history, stale conflict, keyboard use, and 200% text scaling.
- Local verification passes 306 frontend tests, 56 API tests, 17 Firestore rule tests,
  2 emulator-backed Release 5 E2E cases, and 32 regression E2E cases.
- The Release 5 build is 1,012 KiB and has no local emulator endpoint. The existing
  523.49 kB Firestore chunk remains the only size warning.
- Google Search grounding stays read-only, derives URLs only from provider grounding
  metadata, preserves up to three Search suggestions, and validates model JSON before use.
- Measured evidence and recording provenance are in
  [Release 5 verification](evidence/RELEASE_FIVE_VERIFICATION.md).
- Merge and deployment require separate product-owner approval.
