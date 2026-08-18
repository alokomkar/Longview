# Today Duplicate Completion Proof

Status: Localhost implementation and browser verification complete; product review pending

Updated: 2026-08-18

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

## Implementation evidence

- The Firestore gateway uses one transaction and returns a typed completion plus
  `duplicate` flag.
- Existing proof is validated against owner, Plan, date, duration, and deterministic
  document identity before it is returned.
- First and duplicate success render the saved completion identifier; duplicate success
  explicitly confirms that only one record remains.
- Unit and component coverage exercises create, duplicate, invalid stored proof,
  confirmation, retry, and reload paths.
- Two stale localhost tabs submitted concurrently and converged on one completion
  identifier; one received first-save proof and the other received duplicate proof.

## Local acceptance instructions

Open the PWA at `http://127.0.0.1:5173/` with the local Firebase emulators running.
Complete today's step in one tab, then submit the same deterministic completion from a
second stale tab. Confirm the second tab says **Progress already saved**, shows the same
completion identifier, and says no second completion was added.
