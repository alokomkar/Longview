# Longview PWA Product Requirements

Status: Release 2 deployed

Last updated: 2026-08-18

Target: All Things Agentic hackathon PWA

Visual specification: [Longview interactive PWA mockup](design/longview-pwa-interactive-mockup.html)

Acceptance simulation: [Longview hackathon acceptance demo](design/longview-hackathon-acceptance-demo.html)

Delivery evidence: [Hackathon readiness ledger](HACKATHON_READINESS.md)

Pending delivery: [Pending feature ledger](PENDING_FEATURES.md)

## 1. Product definition

Longview is a personal AI chief of staff for people pursuing several meaningful,
long-running goals at once. Clara maintains continuity across goals, finite weekly
capacity, daily tasks, research, decisions, and reflection. The product is not another
unbounded task list: it makes tradeoffs visible and proposes one reviewable next move.

**Tagline:** Many ambitions. One considered path.

## 2. Problem and customer outcome

People can define goals but struggle to coordinate them when deadlines, energy, and
available time compete. Conventional planners store tasks independently and lose the
reasoning behind changes.

Longview should help a user:

- keep several long-term goals active without pretending all are equally urgent;
- understand what fits today and what is deliberately deferred;
- approve concrete changes instead of granting an agent unbounded authority;
- preserve research, decisions, and learning as durable goal context;
- finish a goal with a reflection Clara may reuse only with permission.

## 3. Hackathon boundary

The contest build is a new PWA and a bounded **Agentic Follow-through Loop**. Concepts
from earlier work may inform the design, but Longview receives its own repository,
branding, implementation history, and disclosure. Android, iOS, store billing, native
voice, and broad third-party integrations are out of scope.

Longview targets the **Collaborative Partner** category. The implementation stack and
deployment proof are specified in [Hackathon Tech Stack](TECH_STACK.md).

### Phase 0 production boundary

The first public early-access release is the smallest complete outcome: authenticate,
create and review one Plan, receive one deterministic step on a selected working day,
and explicitly record completion. Its dedicated acceptance journey and failure states
are defined in [Phase 0 Early Access Release](PHASE_ZERO_RELEASE.md).

Calendar proposals, day breaks, Clara, research, Plan Briefs, and execution history
remain outside the Phase 0 production surface. They must not block Today or appear as
available actions until their managed services pass an independent release gate.

### Release 1 production boundary

Release 1 promotes only Clara's authenticated read path. A user may ask about a saved
Plan or today's selected step and inspect the exact context, recommendation, rationale,
confidence, and clarification question. The Cloud Run service exposes no approval,
schedule-run, approved-day, or day-break endpoint. Any response containing a proposed
change fails closed. Calendar, Quick Actions, writes, research, Plan Briefs, and offline
cold-start recovery remain hidden. The complete contract is in
[Release 1: Ask Clara](RELEASE_ONE_ASK_CLARA.md).

### Release 2 review-first write boundary

Release 2 permits one approved mutation: add or remove exactly one working day on the
selected Plan without changing its weekly allocation. Clara's proposal is advisory.
The PWA shows exact before/after values and downstream effect; rejection and
cancellation write nothing. Approval must verify owner, current schedule version,
current values, and idempotency inside one transaction that also creates the audit
record. The full contract is in
[Release 2: Clara Schedule Review](RELEASE_TWO_CLARA_SCHEDULE_REVIEW.md).

## 4. Canonical demo portfolio

The mockup and acceptance tests use one consistent account:

| Goal | Operating mode | Weekly allocation | Current milestone |
|---|---|---:|---|
| Build SaaS Startup | Primary focus | 6 hours | Validate customer activation |
| Learn AI / ML Application | Maintain momentum | 4 hours | Evaluate a retrieval baseline |
| Build a House | Prepare, do not accelerate | 2 hours | Clarify land and financing constraints |

Total weekly capacity is 12 hours. Clara may recommend reallocations but cannot write
them without approval.

## 5. Product language

- **Goal:** a long-term outcome.
- **Task:** an executable unit of work belonging to a Goal.
- **Today's task:** a task scheduled for the selected day.
- **Goal Brief:** the current versioned understanding of a Goal.
- **Recommendation:** Clara's read-only proposed action and rationale.
- **Approved change:** the exact preview the user accepted and Longview persisted.

## 6. End-to-end journey

1. The user learns that Longview coordinates several ambitions one day at a time.
2. They continue anonymously or sign in with Google.
3. Empty Today invites them to create their first Goal.
4. They set the Plan's working days and weekly allocation while creating it.
5. Clara extracts the outcome and may recommend target date and operating mode.
6. The user edits or confirms the Plan before it enters the portfolio.
7. Today shows only scheduled work plus a compact Clara insight.
8. Portfolio explains allocation and the tradeoff across all active Goals.
9. Ask Clara exposes context-aware Quick Actions and Chat.
10. Clara proposes a concrete schedule or task change with rationale and before/after
    values.
11. The user approves or rejects it; only approval creates an idempotent write.
12. Calendar prepares and approves one day at a time, including a break path.
13. Goal Details keeps tasks, history, decisions, research, and Goal Brief together.
14. Accepted research creates a Goal Brief proposal; it never updates automatically.
15. Achievement captures an optional reflection and asks what Clara may remember.

## 7. Required surfaces

### Onboarding

- Welcome, anonymous/Google authentication, explanation, and Empty Today.
- There is no workspace-level availability. Every Plan owns exactly one schedule:
  at least one working day plus its weekly allocation. Clock time and per-day hour
  allocation are deferred beyond the hackathon MVP.
- Persist calendar dates as ISO `YYYY-MM-DD`. Render saved Plan, schedule, and
  completion dates as ordinal day, full month, and year (for example,
  `17th August 2026`). Native date inputs may retain the browser's locale-aware control.
- Anonymous work remains usable and can later be linked without creating a duplicate
  workspace.
- Authentication cancellation returns safely to Sign in.

### Today and portfolio

- Today shows active Goal context, task descriptions, duration, completion, and Clara.
- Portfolio shows operating mode, allocation, milestone, next action, and one explicit
  cross-goal recommendation.
- Starting Create Plan from Today or Portfolio always opens a fresh draft with a new
  idempotency key. Only Review → Edit and failed-save retry retain the current draft.
- No-task days show the next eligible scheduled date instead of claiming work is ready.

### Clara

- The first production Clara release is strictly read-only and supports a selected
  Plan or today's step. It cannot return or apply a proposed change.
- Today context includes every active Goal, today's tasks, capacity, and decisions.
- Goal context is restricted to that Goal and descendants.
- Quick Actions are grouped by outcome and route only to typed, existing review
  surfaces. Opening the catalogue or an action detail makes no network call and writes
  nothing. Chat uses the identical context boundary.
- Clara may explain, recommend, draft, and preview. She may not silently create, move,
  complete, delete, or reprioritize durable data.
- Every write preview shows the old value, new value, rationale, downstream effect,
  and Approve/Cancel actions.

### Calendar

- Generate only one selected day's schedule.
- Explain ordering and capacity conflicts.
- Support Approve, Adjust, Try again, and Take a break today.
- A break carries work only to each task's next eligible day and cannot overwrite a
  user-edited future task.

### Goal Details

- Selecting any Plan card opens its Plan Details screen; the Plans list is not a
  terminal surface.
- Overview, current task, timeline, allocated time and days, execution history,
  decisions, research cards, current Goal Brief, and version history.
- Research cards support Accept, Reject, and Not now.
- Accepted cards create an editable brief proposal with evidence attribution.
- Deferred insights remain recoverable; rejected evidence remains auditable.

### Achievement and reflection

- Confirm the measurable outcome and summarize the journey.
- Ask what worked, what changed, and what should happen differently next time.
- Save only the learning the user explicitly permits Clara to remember.

### Settings and subscription

- Account/linking, notifications, data controls, and appearance. Plan schedules are
  edited only from Plan Details, never from Settings.
- Theme palette, system/light/dark mode, reading font, and text size with live preview.
- Web checkout uses Stripe internationally and Razorpay in India; entitlement is
  backend-verified before paid access changes.

## 8. AI and write architecture

The React/TypeScript PWA is hosted on Firebase Hosting and calls a FastAPI service on
Cloud Run. A separate Cloud Run worker receives Pub/Sub events for asynchronous
follow-through runs. Google ADK invokes Gemini 2.5 Flash through Vertex AI;
Firestore stores run checkpoints, versions, idempotency records, and audit events.

Clara receives a minimal typed context packet and returns a strict schema containing
recommendation, rationale, confidence, clarification requirement, and optional change
preview. Application code validates authorization, schema, invariants, and stale data.
The model never writes Firestore directly.

Approved mutations require an authenticated user, idempotency key, expected resource
version, transactional write, and audit event. Duplicate approvals return the original
result. Model output is advisory until deterministic application checks pass.

## 9. Failure and recovery

- Offline work is clearly marked pending and retries without duplicate writes.
- A model timeout or malformed response leaves durable state unchanged.
- Schedule generation failure preserves the current approved day.
- Partial writes reconcile transactionally before success is shown.
- Research failure preserves saved cards and every Goal Brief version.
- Payment interruption leaves the existing entitlement unchanged.
- Conflicting edits require refresh and a new preview.

## 10. Privacy, accessibility, and trust

- Show the context Clara is using and keep Goal-scoped conversations isolated.
- Request permissions only at the point of need.
- Support keyboard navigation, visible focus, semantic headings, screen readers,
  reduced motion, contrast, and 200% text scaling without clipped controls.
- Do not train on private content without separate explicit consent.
- Record agent recommendations, approvals, writes, failures, and recovery outcomes.

## 11. Proposed implementation slices

1. **Foundation:** repository, PWA shell, design tokens, routing, CI, Firebase projects.
2. **Identity:** anonymous auth, Google linking, account preservation, onboarding.
3. **Goal model:** Goal creation, portfolio, Today, deterministic sample scheduling.
4. **Clara read loop:** typed context, ADK/Gemini recommendation, clarification, chat.
5. **Approved write loop:** preview, transactional persistence, audit, idempotency.
6. **Async follow-through:** Pub/Sub worker, checkpoints, retries, cancellation, logs.
7. **Goal memory:** research review, Goal Brief proposal and version history.
8. **Completion:** achievement, reflection, consented reusable learning.
9. **Release evidence:** failure injection, E2E tests, architecture diagram, Cloud Run
   and Logging proof, reproducible setup, README, and unedited demo recording.

Billing and advanced appearance can follow the judged agentic loop unless required for
the submission narrative.

## 12. Acceptance criteria

- A judge can anonymously complete the canonical journey in a hosted installable PWA.
- New Plans persist at least one selected working day and their weekly allocation.
  Existing Plans without a schedule remain intact and expose Add schedule in Details.
- Every Plan card opens Plan Details showing the saved outcome, rationale, target,
  weekly allocation, working days, and current Today-step/completion state.
- Three Goals share one visible finite-capacity portfolio.
- Clara uses Gemini 2.5 Flash through Google ADK and Vertex AI.
- One Pub/Sub-triggered Cloud Run worker completes a checkpointed asynchronous run.
- At least one recommendation produces a specific preview and approved durable write.
- Rejection, duplicate approval, timeout, malformed output, offline mode, stale data,
  and partial-write recovery cause no unintended state change.
- Today reflects an approved change and its rationale remains inspectable.
- Research acceptance creates a user-confirmed, attributed Goal Brief version.
- Achievement saves only user-approved reflection memory.
- The public README identifies the contest commit range and reused foundations.
- The repository includes an architecture diagram, reproducible deployment steps, and
  Cloud Run/Logging evidence shown in the approximately four-minute demo.
- Android, iOS, and behavior from pre-existing applications are not claimed as
  hackathon output.

The current implementation and every submitted gallery asset are tracked individually
in the [Hackathon readiness ledger](HACKATHON_READINESS.md). Prototype screenshots and
the prototype video remain design evidence until replaced by verified PWA captures.

## 13. Deferred decisions

- Final pricing and free-tier limits.
- Calendar/email integrations and notification strategy.
- Native clients and store billing.
- Voice conversation and multilingual speech.
- Automated multi-day planning or autonomous external actions.
- Trademark, domain, App Store, and Play Store clearance for Longview and Clara.

### Post-hackathon MVP candidate: time-aware daily scheduling

If the judged path is complete with time remaining, extend each Plan schedule with a
default start time and a duration in 30-minute increments. Materialize versioned daily
task occurrences so deterministic application code can detect overlapping time ranges.
The model may explain a conflict or propose a move, but it cannot decide overlap or
persist a schedule change without confirmation.

A blocked task records a structured reason plus an optional short note. The user may
move it to the next free slot today, request tomorrow, choose another time, or skip it.
Every move checks the destination for conflicts, rejects stale or duplicate carryover,
and preserves the original occurrence in history. “Tomorrow” means the nearest free
eligible slot after revalidation, not an unconditional write at the same time.

The first version excludes external calendars, per-day working-hour templates, task
splitting, automatic movement of other tasks, travel-time-zone handling, and autonomous
rescheduling. Those boundaries keep conflict handling deterministic and reviewable.
