# Today Duplicate Completion Proof

Status: Review artifact ready; implementation has not started

Updated: 2026-08-17

Acceptance case: TODAY-06

Linked journey: [Interactive mockup](design/longview-pwa-interactive-mockup.html#completion-done)

## Smallest judged outcome

When the same Today completion is submitted again, Longview returns the original
completion instead of creating another record. The user sees that progress was already
saved, when it was recorded, and that no duplicate was added.

This slice proves duplicate and concurrent retry safety only. Offline outbox and
reconnection behavior remain TODAY-07.

## Durable contract

The completion identity remains deterministic for owner, date, Plan, and step type.
The gateway returns a typed result containing the validated completion and a
`duplicate` flag.

One transaction must:

1. read the deterministic completion document;
2. create it only when it does not exist;
3. return the validated stored document with `duplicate: true` when it already exists;
4. reject malformed or cross-owner stored data without overwriting it; and
5. give concurrent callers one created result and the same durable proof thereafter.

## Interaction contract

- First success says the step is complete and shows the saved completion.
- Duplicate success says **That progress was already saved**.
- The proof shows the Plan, completed date, duration, and completion record identifier.
- Duplicate success never shows another completion, changed duration, or new schedule.
- Failure keeps the step open and retries the same deterministic completion identity.

## Acceptance

1. Repeating the same completion creates exactly one Firestore document.
2. A duplicate returns the original completion and `duplicate: true`.
3. Two concurrent submissions converge on the same completion identity and values.
4. Reload restores the completed state without writing.
5. Malformed, unavailable, or cross-owner records fail closed and are not replaced.
6. The PWA distinguishes first success from duplicate proof in user-friendly language.
7. Existing confirmation, cancellation, and failed-save retry behavior remains intact.

## Review instructions

Open the linked mockup at **Step completed**, choose **Edge**, then select
**Completion already recorded**. Confirm that the original proof is visible and the
screen explicitly says no second completion was added.
