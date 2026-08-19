# Release 4: Durable Plan Record

Status: Design review ready; implementation not started

Last updated: 2026-08-19

Interactive acceptance: [Release 4 durable Plan record](design/longview-release-four-plan-record.html)

## Outcome

Plan Details becomes the authoritative place to understand what happened, why a choice
was made, and which Clara guidance the user deliberately kept. Existing completion and
approved-change evidence is read from its authoritative source. New decisions and saved
guidance are immutable, Plan-scoped records.

## Release boundary

- **Execution history** combines relevant completed steps and approved changes in a
  newest-first timeline. Each entry retains its source identifier and recorded time.
- **Decisions** are short user-authored conclusions with rationale. The user reviews the
  exact text before one append-only save.
- **Clara guidance** remains read-only when generated. A recommendation becomes durable
  only after **Save to this Plan** and a second review of recommendation, rationale,
  confidence, and source facts.
- The release does not add research, Plan Briefs, reflections, editing, deletion,
  cross-Plan memory, autonomous writes, or offline creation.
- Navigation and previously loaded records remain usable without invoking Clara or
  making a durable write.

## Durable model

New records live below the owner-scoped Plan at
`users/{uid}/workspaces/default/plans/{planId}/records/{recordId}`.

| Field | Contract |
|---|---|
| `recordId` | Client-created idempotency key and document identifier |
| `kind` | `decision` or `clara-guidance` |
| `planId`, `ownerUid`, `workspaceId` | Immutable ownership boundary |
| `summary` | Decision or recommendation snapshot, 3–500 characters |
| `rationale` | User rationale or Clara rationale, 10–500 characters |
| `confidence`, `sourceFacts` | Required only for retained Clara guidance |
| `sourceRecommendationId` | Binds guidance to the validated Clara response |
| `schemaVersion` | `1` |
| `recordedAt` | Server timestamp |

The create transaction checks the current Plan, exact request fingerprint, and existing
record. Reusing the same key with the same payload returns the original result. Reusing
it with different content fails closed. Records cannot be updated or deleted.

## Journey

1. Open a Plan and load its latest owner-scoped details and record concurrently.
2. Review execution history with completion and approved-change source proof.
3. Add a decision, review the exact conclusion and rationale, then save or cancel.
4. Ask Clara about this Plan. Timeout, cancellation, malformed output, and network
   failure retain no guidance.
5. Choose **Save to this Plan**, review the validated guidance snapshot, then confirm.
6. Return to Plan Details and see the retained guidance in the timeline and Guidance
   section after an authoritative reload.

## Failure and recovery contract

| Failure | Visible result | Durable effect | Recovery |
|---|---|---|---|
| Cancel decision or guidance review | Return with draft/recommendation available | None | Review again |
| Clara timeout or cancellation | Safe stop with retry | None | Retry recommendation |
| Malformed Clara response | Validation message | None | Request new guidance |
| Offline/network write failure | Draft remains on screen | None or one atomic record | Retry same key |
| Concurrent duplicate save | Original record restored | One record | Continue |
| Key reused with different payload | Conflict message | None | Start a new review |
| Response lost after commit | Recovery checks original key | One record | Restore original result |
| Record read failure | Last confirmed Plan metadata remains; record hidden as unavailable | None | Retry record only |
| Missing/malformed Plan | No stale details shown | None | Return to Plans |

## Acceptance and evidence

- Unit tests cover parsing, ownership, empty and malformed values, stable ordering,
  idempotency fingerprints, and mixed timeline sources.
- Firestore emulator tests cover owner isolation, append-only rules, duplicate and
  conflicting keys, concurrent creates, and forbidden update/delete.
- Integration tests cover success, cancellation, timeout, malformed response,
  offline/network failure, retry, unknown-result recovery, and authoritative reload.
- Mobile E2E covers history, decision save, retained guidance, safe failure states,
  keyboard use, and 200% text scaling.
- Full regression, page load, record latency, interaction responsiveness, bundle delta,
  and a QuickTime recording are required before merge approval.
