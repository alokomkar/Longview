# Calendar Break Carryover

Status: Localhost implementation complete; production evidence remains pending

Updated: 2026-08-17

Linked journey: [Interactive mockup](design/longview-pwa-interactive-mockup.html#break-confirm)

## Smallest judged outcome

The user can take a break from one approved day without completing work. Longview
shows where every unfinished block will next become eligible, then carries those blocks
only after explicit confirmation. Future days remain unapproved and are never silently
overwritten.

This slice moves the whole unfinished day. Per-task blocking reasons, clock times,
same-day rescheduling, and user-selected destination dates remain post-hackathon work.

## Preview contract

The preview is deterministic and server-authoritative. For each unfinished approved
block it shows the first later date allowed by that Plan's current working days. It also
shows the source approved-day revision and every Plan schedule version used.

Preview fails without writes when a Plan has no later eligible day, a destination has
an approved user-reviewed order, or required Plan/schedule data is missing.

## Durable contract

Confirmation submits the source date and revision, the reviewed destinations, the
observed Plan schedule versions, and an idempotency key. One owner-scoped transaction
must:

1. re-read the approved source day and affected Plan schedules;
2. reject stale source or schedule versions;
3. reject any destination with an approved order;
4. mark the source day as a break without recording completion;
5. create one pending carryover per unfinished block for its reviewed destination;
6. write one immutable break event; and
7. return the original result for a repeated idempotency key.

Pending carryovers join that date's next Calendar proposal. They do not directly create
or replace an approved future day.

## Interaction contract

- **Take a break today** opens a before-write review of every task and destination.
- **Confirm break and carry tasks** shows progress until the transaction finishes.
- Cancel keeps today's approved order unchanged.
- Failure, stale state, missing destinations, or future-day conflicts move nothing.
- Success identifies the source revision, break event, and pending carryover count.
- Duplicate confirmation shows the original successful result.

## Acceptance

1. Only unfinished blocks from the selected approved day are carried.
2. Each block uses its own Plan's next eligible working day.
3. No completion, future approval, or overwrite is created.
4. Source-day, Plan-schedule, and destination conflicts write nothing.
5. Success is atomic; partial carryover cannot become visible.
6. Repeating one idempotency key creates no duplicate pending task or event.
7. Reload restores the saved break and destination carryovers.
8. The progress indicator remains visible through success or failure.

## Localhost implementation

The PWA loads an approved day before offering a break, requests a server-authoritative
preview, and shows every unfinished block beside its next eligible Plan date. Preview
and confirmation keep accessible progress indicators visible for the complete network
operation. Reload restores the saved break revision and immutable event identifier.

FastAPI re-reads the source approved day, affected Plan schedules, destination days,
and pending carryovers. One Firestore transaction marks only the source day as a break,
creates the reviewed pending carryovers, and writes one audit result. Stale source or
schedule versions, an existing destination approval, missing eligibility, duplicate
pending work, or an unavailable transaction leave every day unchanged. Reusing one
idempotency key returns the original result.

Pending carryovers are server-enriched into their destination Calendar proposal and
are consumed only when that later proposal is explicitly approved. The localhost
emulators prove this behavior without claiming production Cloud deployment.
