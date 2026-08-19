# Release 6: Plan Achievement, Reflection, and Reuse Consent

Status: Implemented and verified locally; merge and deployment require product-owner approval

Last updated: 2026-08-19

Interactive acceptance: [Release 6 achievement and consent](design/longview-release-six-achievement-consent.html)

## Outcome

A user can finish a Plan with measurable evidence, preserve an optional private
reflection, and approve the exact reflection statements Clara may reuse. Completion
does not turn private reflection into model context by default.

## Release boundary

- **Finish Plan** is available only after every required Plan step is complete.
- The user records a required outcome statement and one to three evidence references.
  Each reference has a label and optional HTTPS URL; Release 6 does not upload files.
- Reflection is optional and user-authored: what worked, what changed, and what to do
  differently next time. Clara does not generate or rewrite it.
- Every non-empty reflection statement has a separate, unchecked reuse control.
  **Reuse nothing** is always available and is the default.
- A final review shows the exact completion evidence, private reflection, and selected
  reusable statements. Saving creates one immutable achievement and one consent
  snapshot atomically. It does not rewrite the Plan Brief or research history.
- A user may later revoke future reuse. Revocation appends a consent revision; it does
  not erase the historical achievement or claim that previous model calls are undone.
- Cross-Plan recommendations, file storage, public sharing, and automatic retrospective
  generation are outside this release.

## Durable model

All records are owner- and Plan-scoped below
`users/{uid}/workspaces/default/plans/{planId}`.

| Record | Contract |
|---|---|
| `achievements/{achievementId}` | Immutable outcome, one to three validated evidence references, completed step IDs, expected Plan revision, and server time |
| `reflections/{reflectionId}` | Immutable optional user-authored statements bound to the achievement |
| `reuseConsents/{consentId}` | Append-only exact approved reflection field IDs, purpose `future_plan_guidance`, policy version, and server time |
| Plan completion pointer | Achievement ID and completed state advanced once in the same transaction |

The client supplies an idempotency key and content fingerprint. The server derives the
owner, Plan identity, completed-step set, current Plan revision, and timestamps. A
matching retry restores the original result; a reused key with changed content fails.

## Complete journey

1. Open Plan Details. An unfinished required step explains why the Plan cannot finish.
2. When all required steps are complete, choose **Finish Plan**.
3. Record the measurable outcome and one to three evidence references. Invalid or
   non-HTTPS links stay editable and nothing is saved.
4. Add any reflection statements or skip reflection entirely.
5. Review each non-empty statement. Select only the exact statements Clara may reuse,
   or choose **Reuse nothing**. No box is preselected.
6. Inspect a final before-save preview that separates completion evidence, private
   reflection, and reusable learning.
7. Save once. The Plan becomes completed only after the atomic result is confirmed.
8. Reload the achievement record, inspect consent, and optionally revoke future reuse.

## Failure and recovery contract

| Failure | Visible result | Durable effect | Recovery |
|---|---|---|---|
| Cancel before final save | Draft remains in the current browser session | None | Resume or discard |
| Empty outcome, no evidence, invalid URL | Field-level explanation | None | Correct draft |
| Offline or network failure before commit | Exact draft remains editable | None | Retry same key |
| Response lost after commit | Completion remains pending until reconciled | One atomic result | Retry same key and restore result |
| Duplicate submission | Original achievement and consent return | One result | Continue to record |
| Stale/concurrent Plan completion | Latest completed or changed Plan is shown | None or original result | Reload authoritative Plan |
| Partial-write attempt | Transaction fails without a completion pointer | None | Retry safely |
| Malformed stored achievement | No stale proof or consent is shown | None | Retry authoritative read |
| Consent revocation offline/conflict | Existing consent remains authoritative | None | Reload and retry revision |

## Acceptance and evidence plan

- Unit tests cover validation, exact selection, default-deny consent, fingerprints,
  malformed records, empty reflection, URL boundaries, and consent revisions.
- Firestore emulator tests cover owner isolation, all-steps-complete enforcement,
  atomic writes, append-only records, idempotency conflicts, stale revisions,
  concurrent finish attempts, and revocation.
- Integration tests cover success, cancellation, offline/network failure, unknown
  result recovery, duplicate retry, stale Plan, malformed reads, and partial failure.
- Mobile E2E covers blocked completion, no-reflection completion, selective consent,
  reuse-nothing, reload, revocation, keyboard use, and 200% text scaling.
- Measure initial load, interaction latency, transaction latency, responsive overflow,
  and release bundle deltas. Record the verified journey and important safe failures
  with QuickTime after implementation.
- Merge and deployment require separate product-owner approval.

## Verification result

- The typed client, transactional Firestore gateway, immutable records, exact consent
  revisions, completed-Plan portfolio state, and safe failure UI are implemented.
- 320 frontend unit/integration tests, 19 Firestore-rule tests, 2 emulator-backed
  Release 6 mobile E2E cases, 32 regression E2E cases, and 2 Release 5 regression
  cases pass.
- The Release 6 production build passes. Local mobile E2E verifies blocked finish,
  selective consent, cancellation, offline failure, reload, revocation, and 200% text.
- Evidence is recorded in
  [Release 6 verification](evidence/RELEASE_SIX_VERIFICATION.md).
