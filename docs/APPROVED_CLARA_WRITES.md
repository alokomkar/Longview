# Approved Clara Plan-schedule Writes

Status: Implemented and verified locally; awaiting product-owner acceptance

Updated: 2026-08-17

Linked journey: [Interactive mockup](design/longview-pwa-interactive-mockup.html#clara-chat)

## Slice boundary

Clara may propose one change to an existing Plan's working days while preserving its
weekly allocation. This uses the versioned Plan schedule that already exists. It does
not create clock-time blocks, daily task records, multi-Plan writes, background work,
or autonomous changes.

The managed context adds the selected Plan's `workingDays` and `scheduleVersion`. A
validated proposal contains the Plan ID, expected schedule version, exact before and
after working days, unchanged weekly hours, rationale, downstream effect, and no other
mutable fields.

## Approval contract

- The preview names the Plan and shows exact before/after values before any write.
- Cancel and rejection create no Plan or audit write.
- Approval sends a new idempotency key plus the reviewed expected version and proposal.
- The authenticated backend rereads the owner-scoped Plan, validates the complete
  proposal and invariants, then transactionally updates the schedule version and writes
  one immutable audit event.
- Reusing an idempotency key returns the original audited result without a second write.
- A stale expected version returns a conflict and requires a freshly generated preview.
- The UI shows success only from the committed result and then reloads Today and Plan
  Details from authoritative data.

## Failure behavior

Authentication failure, invalid fields, empty working days, changed weekly hours,
cross-owner access, stale versions, offline requests, cancellation, transaction failure,
and partial result reads leave the Plan unchanged. Audit events contain bounded IDs and
before/after values, not model reasoning traces or authentication tokens.

## Local verification

The localhost PWA and FastAPI service implement this contract against the Firestore
Emulator. Browser acceptance verified a managed recommendation, exact before/after
review, one approved transaction, version increment, audit record, and authoritative
Plans refresh. Tests cover rejection, malformed proposals, authentication failure,
stale state, unavailable storage, and stable idempotency fingerprints. No production
deployment is claimed by this verification.
