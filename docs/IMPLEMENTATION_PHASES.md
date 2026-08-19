# Longview Implementation Phases

Status: Release 2 deployed; Release 3 local implementation
Updated: 2026-08-18
Links: [PRD](PRODUCT_REQUIREMENTS.md) | [Mockup](design/longview-pwa-interactive-mockup.html) | [Stack](TECH_STACK.md)

## Rules

- Scope is an installable, mobile-friendly PWA.
- Review mockup failures before implementation.
- Model output is typed and advisory; durable writes require explicit approval.
- Test success, cancellation, timeout, malformed input, offline operation, retries,
  concurrency, stale versions, idempotency, and partial recovery.

## Phases

### Phase 0: one usable online loop

Release authentication → Plan creation → Plan-level schedule → Today step → explicit
completion on Firebase Hosting. Production navigation contains Today, Plans, and
Settings only. Calendar, Clara, research, brief, and offline cold-start work remain
behind the full development surface and cannot block the core journey. See the
[release contract](PHASE_ZERO_RELEASE.md) and
[interactive acceptance](design/longview-phase-zero-release.html).

The numbered implementation roadmap below remains the post-release expansion order.

### Release 1: Ask Clara

Add authenticated, read-only guidance for a selected Plan or today's step. The hosted
PWA shows context, recommendation, rationale, confidence, clarification, progress,
timeout, cancellation, invalid-response, and unavailable states. A dedicated FastAPI
entry point on Cloud Run exposes recommendation and health routes only; write-capable
Clara routes remain unavailable. See the [release contract](RELEASE_ONE_ASK_CLARA.md)
and [interactive acceptance](design/longview-release-one-ask-clara.html).

### Release 2: Clara schedule review

Promote one narrowly bounded write: Clara may propose changing exactly one Plan
working day while preserving weekly hours. The user reviews exact before/after values,
rationale, and downstream effect, then explicitly approves or rejects. Approval uses
expected-version conflict detection, an idempotency key, one Firestore transaction,
and one audit event. The release hides Calendar and every unrelated agent write. See
the [release contract](RELEASE_TWO_CLARA_SCHEDULE_REVIEW.md) and
[interactive acceptance](design/longview-release-two-clara-approval.html).

### Release 3: daily schedule

Expose the existing bounded Calendar path as its own release surface: prepare one
selected day across eligible unfinished Plans, review and approve an exact order,
replace only the current day with revision checks, or confirm a break with pending
carryovers to each Plan's next eligible day. Every network operation shows progress;
cancel, timeout, malformed, offline, stale, duplicate, and destination-conflict paths
fail without corrupting approved work. See the
[release contract](RELEASE_THREE_DAILY_SCHEDULE.md) and
[interactive acceptance](design/longview-release-three-daily-schedule.html).

1. **Cloud prerequisite:** Create one Google Cloud project and enable Firebase on it;
   claim credits, configure budgets, emulators, least-privilege identities, and secrets.
   Choose Firestore/Cloud Run regions only after confirming Vertex AI availability.
2. **Authentication:** Build anonymous sign-in, Google linking, session continuity, and
   FastAPI token verification. Test cancellation, popup blocking, expiry, revocation,
   malformed tokens, concurrent tabs, offline return, duplicates, and account
   collisions. Linking must retain exactly one workspace transactionally.
3. **PWA foundation:** Add routing, responsive shell, manifest, service worker,
   accessibility, IndexedDB outbox, and update recovery.
4. **Goal authority:** Add versioned schemas, Firestore rules, Goals, Today, Portfolio,
   deterministic scheduling, cross-user isolation, audit events, and emulator seeds.
5. **Clara read loop:** Use Google ADK with Gemini 2.5 Flash through Vertex AI.
   Return scoped recommendations and clarification; fail closed on timeout, malformed
   output, or prompt injection. No model-direct writes. Bounded Quick Actions first
   route to existing Calendar or Plans review surfaces; opening the catalogue never
   invokes the model or changes durable data. See [the Quick Actions contract](CLARA_QUICK_ACTIONS.md).
6. **Approved writes:** Show exact before/after previews; enforce authorization,
   invariants, expected versions, idempotency, transactions, rejection, and recovery.
7. **Async follow-through:** Trigger a Cloud Run worker through Pub/Sub; checkpoint,
   retry, cancel, dead-letter, and correlate Cloud logs. Results remain advisory.
8. **Memory and release:** Add reviewed research and versioned Goal Briefs; deploy the
   PWA/API/worker; add README instructions, CI/E2E gates, current
   architecture diagram, disclosure, and a live Cloud-evidenced demo.

## First review gate

Product-owner authorization to begin local implementation was received on 2026-08-16.
The first slice implements emulator-backed anonymous continuity, a mobile Playwright
contract, explicit authentication failures, and owner-scoped Firestore rules. Google
linking is a separate boundary: cancellation, blocked popups, offline failures, and
account collisions must preserve the anonymous workspace. No Cloud deployment is
authorized by this approval.

The second slice provisions `/users/{uid}` and `/users/{uid}/workspaces/default` in
one idempotent transaction after authentication. Anonymous-to-Google linking retains
the Firebase UID, so the same workspace remains authoritative. Provisioning failure
keeps the authenticated session, exposes retry, and never creates a second workspace.

The local PWA foundation now gates Vite startup on Firestore Emulator readiness,
lazy-loads Firestore after authentication, exposes offline/update status, and lands on
Empty Today with mobile navigation.
Settings includes explicit sign-out and confirmed local-data clearing. Local clearing
removes browser preferences and cached PWA files, then signs out; it never deletes the
cloud or emulator workspace. Anonymous sessions retain a Google-link action in Settings
after onboarding, so cross-device protection is never hidden by local progress.

The authentication slice is deployed to Firebase Hosting for production-domain
acceptance. The hosted build uses Google and anonymous authentication plus owner-scoped
production Firestore rules; emulator flags remain limited to local development.
When a Google identity already owns a workspace, Longview never merges silently. It
preserves the anonymous workspace and offers an explicit switch to the existing Google
workspace. Local-data clearing also unregisters the service worker before deleting its
caches to prevent a controlled page from referencing an empty cache.
Anonymous authentication never gates onboarding on account linking. Workspace-ready
users can continue directly to Today, while Google linking remains an
optional secondary action available again from Settings.
Anonymous sign-out and local-data clearing require a loss-of-access warning and offer
Google linking first. Recovering an unlinked anonymous session is explicitly deferred
beyond the MVP; the underlying workspace is not silently deleted.

## Day 1 delivery slices

1. **Plan creation:** A typed form captures title, desired outcome, rationale, target
   date, and weekly capacity. Users review before an idempotent Firestore transaction;
   validation, cancellation, failed saves, retries, ownership, and immutable creation
   are tested. Every new Create Plan entry resets the form and idempotency key, while
   Review → Edit and failed-save retry preserve the active draft. This PR deliberately
   stops before Plans listing and Today scheduling.
2. **Plans list:** Load owner-scoped Plans and replace empty states without expanding
   into editing, deletion, or collaboration. Loading, empty, populated, and failed
   reads have explicit mobile states; failed reads preserve data and offer retry.
3. **First Today step:** Derive one deterministic, reviewable next step from the saved
   Plan. Model-generated recommendations remain a separate Day 2 boundary. The nearest
   active target wins with stable tie-breaking; weekly capacity bounds the step to
   30–60 minutes. This slice performs no automatic write.

Slice 1 was accepted and merged on 2026-08-17. Slice 2 reads the authenticated
owner's Plans only when the Plans tab opens, orders them by creation time, and keeps
read failures non-destructive. Firestore rules test owner listing plus unauthenticated
and cross-owner denial. The linked mockup exposes populated, loading, empty, and
failed-list states under Long-term Plans.

Slice 2 was accepted and merged on 2026-08-17. Slice 3 validates stored Plan data at
runtime, fails closed on malformed records, and prepares one deterministic Today step.
The result identifies its source Plan and explains that nothing was changed. Empty,
loading, read-failure/retry, and ready states remain explicit. The linked mockup's first
step and Today failure states reflect this non-model, non-writing boundary.

Slice 3 was accepted and merged on 2026-08-17, completing the planned Day 1 slices.

## Day 2 delivery slices

1. **Today completion:** Require explicit confirmation before one owner-scoped,
   immutable completion write. The completion ID is deterministic for date, Plan, and
   step type, so retries are idempotent and reload restores the completed state.
   Cancellation and failed saves leave the step open. Completing a step does not edit
   the Plan, prepare another task, or change the schedule. The linked mockup includes
   confirmation, failed-save recovery, and completed states.

Slice 1 was accepted and merged on 2026-08-17.

2. **Clara read recommendation:** Build a minimal typed context from the selected
   Plan and Today step and return one read-only recommendation with rationale,
   confidence, and visible source facts. Cancellation, timeout, offline, unavailable,
   and malformed-response states leave all durable data unchanged. This slice uses a
   deterministic preview adapter to validate the client contract; the managed model
   and API adapter are the next boundary and are not claimed here.
3. **Plan schedule:** Persist at least one working day and weekly allocation on each
   Plan, restore it across sessions, and edit it from Plan Details. Empty, invalid,
   offline, retry, and concurrent-session behavior preserve the last accepted schedule.
   Workspace availability, clock time, and per-day hour allocation are out of scope.
4. **Plan Details:** Make every Plan card navigable and show the saved outcome,
   rationale, target, weekly allocation, working days, and current Today status.
   Loading, malformed data, missing Plan, and failed-read recovery are explicit.

   This slice also summarizes the portfolio's total committed weekly hours. It derives
   Focus, Maintain, and Prepare modes deterministically from target order rather than
   persisting an unreviewed recommendation. Plan Details reads the selected Plan again
   from its owner-scoped path, never displays stale details after a missing/failed read,
   and presents honest empty states for history, decisions, research, and brief work
   that later slices will populate.

Slice 2 was accepted and merged on 2026-08-17. The product owner replaced the initial
workspace-availability design before merge. Slice 3 now stores working days and weekly
allocation on each Plan, applies eligible days to Today, and edits the versioned
schedule from Plan Details. Existing unscheduled Plans are preserved and clearly ask
for a schedule. Clock time and per-day allocation remain out of scope.

Slice 4 was accepted and merged on 2026-08-17. It totals committed
weekly hours, derives target-ordered Focus/Maintain/Prepare modes, and shows one
deterministic non-writing portfolio recommendation. Selecting a Plan performs a fresh
owner-scoped read and exposes current-step, context-empty, missing, and retry states.

5. **Managed Clara recommendation API:** Add an authenticated FastAPI boundary for the
   existing versioned context and response schemas. Google ADK calls Vertex AI model
   `gemini-2.5-flash`; Firebase ID token verification binds the caller. Authentication,
   validation, timeout, unavailable, malformed-output, cancellation, and clarification
   paths remain read-only. The preview adapter stays available only when a managed API
   URL is not configured. Deployment and Cloud evidence require explicit approval.

Slice 5 was accepted and merged on 2026-08-17. It verifies Firebase ID tokens, enforces
strict request and response schemas, invokes an ADK runner with a 15-second managed
timeout, and applies an exact browser-origin allowlist. The PWA keeps one validated
recommendation per user and Plan for five minutes and displays an accessible ongoing
indicator while waiting. Local Vertex responses are verified; a Cloud Run revision and
production evidence are not yet claimed.

6. **Approved Clara Plan-schedule write:** Extend the selected-Plan context with working
   days and schedule version. Clara may propose adding or removing working days while
   weekly hours remain unchanged. The exact preview shows before/after days, rationale,
   and downstream effect. Approval requires authentication, a reviewed expected version,
   a new idempotency key, one backend transaction, and one immutable audit event.
   Cancellation writes nothing; stale or duplicate approval fails safely or returns the
   original result. Clock times, daily task moves, and cross-Plan writes remain later
   slices. See [the reviewed contract](APPROVED_CLARA_WRITES.md).

Slice 6 was implemented and verified locally on 2026-08-17. The
managed response is wrapped in trusted Plan identity and schedule version, then parsed
again by the PWA. Approval re-reads the owner-scoped Plan and transactionally saves one
schedule update plus one immutable audit record. The same key returns the original
result; rejection creates no write; stale, malformed, unauthenticated, and unavailable
paths fail closed. Browser acceptance confirmed version 1 to 2 with a refreshed Plans
view. Production deployment is not part of this local acceptance gate.

Slice 6 was accepted and merged on 2026-08-17.

7. **Checkpointed background schedule proposal:** Start one owner-scoped asynchronous
   run for a selected day and bounded portfolio context. Expose a correlated run ID and
   four monotonic checkpoints. Cancellation, timeout, worker restart, duplicate event,
   retry lineage, and interrupted finalization must preserve the existing approved day.
   The run publishes an advisory proposal only; Calendar approval is the next slice.
   See [the review contract](CHECKPOINTED_ASYNC_RUN.md).

The checkpointed run, approved-day, and Calendar break slices are implemented and
merged locally. Production Cloud evidence remains separate from local acceptance.

8. **Today duplicate completion proof:** Return the original deterministic completion
   when a retry or concurrent tab submits the same step again. Show user-friendly proof
   that progress was saved once, reject malformed existing records without overwrite,
   and preserve confirmation and failed-save retry behavior. Offline pending sync stays
   in the next slice. See [the review contract](TODAY_DUPLICATE_COMPLETION.md).

The merged implementation uses a typed transaction result, returns original proof on
duplicate submission, rejects invalid stored proof without overwrite, and shows the
deterministic completion identifier. Concurrent localhost browser verification passed.

9. **Today offline completion sync:** Store one owner-scoped deterministic completion in
   a native IndexedDB outbox, show device-only pending proof, synchronize on foreground
   or reconnect through the existing Firestore transaction, and clear the item only
   after validated first-save or duplicate server proof. Retryable failure remains
   visible; ownership, authentication, local-storage, and malformed-proof failures fail
   closed. See [the review contract](TODAY_OFFLINE_SYNC.md).

The product owner approved the linked journey for an already-open session. The local
implementation includes a native owner-scoped IndexedDB outbox, explicit pending and
syncing states, deterministic duplicate convergence, foreground and reconnect retry, and
safe partial-cleanup recovery. Cold offline launch and reload are deferred; production
Firebase evidence remains separate.

The remaining judged surfaces and the replacement status of every gallery asset are
tracked in [Hackathon readiness](HACKATHON_READINESS.md).

## Post-hackathon MVP candidate — only if the judged path is complete

1. Add a default start time and 30-minute duration to each Plan schedule.
2. Materialize versioned daily task occurrences and detect overlaps deterministically.
3. Let users mark a task blocked with a structured reason and optional note.
4. Offer confirmed moves to the next free slot today, the nearest free eligible slot
   tomorrow, or a chosen time; also allow Skip.
5. Test collision, no-free-slot, stale-tab, duplicate-carryover, offline retry, and
   history preservation. Keep external calendars, task splitting, and automatic
   rescheduling of other tasks out of this enhancement.
