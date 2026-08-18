# Today Connection-Loss Completion Sync

Status: Implemented for an already-open session; cold offline launch deferred

Updated: 2026-08-18

Acceptance case: TODAY-07

Linked journey: [Interactive mockup](design/longview-pwa-interactive-mockup.html#today)

## Smallest judged outcome

A user with Longview already open can lose connectivity, mark today's step complete,
see that it is saved only on this device, and safely synchronize it after reconnecting.
Reconnect creates at most one Firestore completion and replaces the pending state only
after validated server proof.

This slice covers one Today completion during an already-loaded session. Cold offline
launch or reload, Background Sync, cross-device offline editing, and offline Plan or
Calendar changes remain outside the hackathon MVP.

## Durable contract

The client stores one owner-scoped IndexedDB outbox item per deterministic completion
identifier. The item contains only the versioned completion payload, owner UID, creation
time, attempt count, and last retryable failure. Repeating the offline action updates the
same item rather than adding another.

On app foreground, an `online` event, or explicit retry, the synchronizer:

1. ignores items belonging to another authenticated UID;
2. submits the deterministic completion through the existing Firestore transaction;
3. accepts either first-save or duplicate server proof;
4. validates the returned owner, Plan, date, duration, and completion identifier;
5. removes the outbox item only after that proof is stored in UI state; and
6. retains retryable failures without claiming the step is synchronized.

Local persistence failure leaves the step open. Authentication or validation failure is
blocked rather than retried forever and never overwrites server data.

## Interaction contract

- An already-loaded Today screen remains usable when the connection drops.
- Offline confirmation says **Save on this device** rather than implying cloud success.
- Pending proof says **Saved on this device · Waiting to sync** and shows one record ID.
- Reconnect shows an indeterminate progress indicator for the complete network request.
- First-save and duplicate responses both end with validated server proof.
- A retryable failure keeps the pending item, attempt history, and manual retry action.
- Sign-out warns when an owner has pending work; another account never replays it.

## Acceptance

1. One offline completion creates exactly one outbox item.
2. Returning to Today in the loaded session restores pending state without a network write.
3. Reconnect success clears the item only after validated Firestore proof.
4. A server duplicate clears the item and returns the original completion.
5. Repeated online events or concurrent tabs cannot create another completion.
6. Offline, timeout, and unavailable failures remain pending and retryable.
7. Local storage, malformed proof, authentication, and ownership failures fail closed.
8. Cold offline launch and reload are explicitly deferred and never claimed as accepted.

## Review instructions

Open the linked mockup, choose **Edge**, then **Offline completion pending**. Mark the
step complete, confirm **Save on this device**, and simulate reconnection. Compare the
pending, syncing, successful, duplicate, and retry-failure states with the localhost PWA.

## Implemented boundary

The PWA now uses a native IndexedDB outbox keyed by owner and deterministic completion
identifier. Reconnect and foreground events coalesce into one request, validate
first-save or duplicate proof, and clean up only after the verified result is rendered.
Sign-out warns about pending work; clearing the device explicitly removes that owner's
outbox.

Local verification covers connection-loss save and in-app restoration, storage failure,
retryable network and deadline failures, malformed or unauthorized proof, duplicate
convergence, concurrent events, and recovery when server success is followed by local
cleanup failure. Hosted Firebase evidence remains separate from this local acceptance.

Known limitation: reloading or launching while Chrome is already offline can stop at the
safe **Workspace unavailable** state. Full offline boot is deferred so hackathon work can
prioritize a reliable online journey.
