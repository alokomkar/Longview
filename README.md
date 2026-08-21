# Longview

Longview is a PWA-first personal AI chief of staff. Clara helps people coordinate
multiple long-term goals against finite time, turn recommendations into reviewable
changes, and preserve the reasoning behind important decisions.

## Product artifacts

- [Product requirements](docs/PRODUCT_REQUIREMENTS.md)
- [Implementation phases](docs/IMPLEMENTATION_PHASES.md)
- [Phase 0 release contract](docs/PHASE_ZERO_RELEASE.md)
- [Release 1 Ask Clara contract](docs/RELEASE_ONE_ASK_CLARA.md)
- [Release 2 Clara schedule review](docs/RELEASE_TWO_CLARA_SCHEDULE_REVIEW.md)
- [Release 3 daily schedule](docs/RELEASE_THREE_DAILY_SCHEDULE.md)
- [Release 4 durable Plan record](docs/RELEASE_FOUR_PLAN_RECORD.md)
- [Release 5 research and Plan Brief](docs/RELEASE_FIVE_RESEARCH_BRIEF.md)
- [Pending feature ledger](docs/PENDING_FEATURES.md)
- [Custom-domain Google redirect authentication](docs/CUSTOM_DOMAIN_REDIRECT_AUTH.md)
- [Hackathon tech stack](docs/TECH_STACK.md)
- [Hackathon readiness ledger](docs/HACKATHON_READINESS.md)
- [Interactive PWA mockup](docs/design/longview-pwa-interactive-mockup.html)
- [Hackathon acceptance demo](docs/design/longview-hackathon-acceptance-demo.html)

## Current status

Release 4 is live on Firebase Hosting. Release 5 is implemented on its feature branch
and remains local until product-owner merge and deployment approval. It adds reviewed,
Plan-scoped research and immutable, attributed Plan Brief versions while preserving
the existing authentication, Today, Calendar, Clara approval, and Plan-record journeys.
Offline cold-start recovery remains outside the production surface.

Release 1 adds authenticated, read-only Clara guidance for a selected Plan or today's
step. Its Cloud Run API cannot expose or apply agent-driven writes.

Authentication and Day 1 Plan creation are available on Firebase Hosting. They include
the PWA shell, Firebase Auth boundary, local emulator configuration, production-safe
Firestore rules, idempotent user/default-workspace provisioning, and representative
unit/mobile E2E tests. Local development writes only to the Firestore emulator while
the hosted build uses production Firestore rules and Google authentication.
Settings provides separate sign-out and confirmed browser-local data clearing actions;
neither action deletes the workspace record.
Anonymous users can complete onboarding without linking Google; linking remains an
optional cross-device access action.
Because MVP recovery is unavailable, anonymous sign-out warns about losing access and
offers Google linking before confirmation.
Validated Plan creation includes working days and a weekly time allocation, followed
by explicit review and an idempotent owner-scoped Firestore write. Plan Details is the
single place to inspect or change that Plan's schedule; older Plans are prompted to
add one. The Plans tab includes loading, empty, failure, retry, and populated states.
It also totals committed weekly hours, derives target-ordered operating modes, and
shows one deterministic portfolio recommendation without changing any Plan. Opening a
Plan performs a fresh owner-scoped read and exposes its current step, schedule, context
empty states, and safe missing/read-failure recovery.
Today deterministically selects the nearest active target from Plans scheduled for
that day and prepares one bounded 30–60 minute proof-of-progress step. Stored Plans
are checked at runtime before use, and this step performs no automatic write.
Today-step completion now requires explicit confirmation and records one immutable,
owner-scoped event. Retrying reuses the same completion ID, reload restores the result,
and neither the Plan nor schedule is changed.
A typed Clara recommendation shows its source facts, rationale, and confidence. The
production PWA sends a Firebase-authenticated bounded context to Cloud Run. Clara may
propose adding or removing one Plan working day while preserving weekly time, but the
user must review the exact before/after values and explicitly approve. The API then
checks ownership, current values and version, performs one idempotent transaction, and
creates one audit record. A live Vertex response and safe rejection were verified on
18th August 2026.

## Local development

1. Install Node.js 22 and Java 21+ for the current Firebase Emulator Suite. Java 17
   may remain installed for Android tooling.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local`; production Firebase values remain local. Set
   `VITE_USE_FIREBASE_EMULATORS=false` to test the real Google account chooser, or
   `true` for deterministic emulator tests. Set `VITE_RELEASE_SURFACE=release-four`
   for the live journey, `release-five` for this release candidate, or `full` for the
   development workbench.
4. Run `npm run dev:local`; it starts the Auth and Firestore emulators before Vite.
5. Open `http://127.0.0.1:5173`. Local sign-in and data stay in the emulators. To
   test the real Google chooser, set `VITE_USE_FIREBASE_EMULATORS=false` and run
   `npm run dev` instead.

Verification: `npm test`, `npm run test:rules`, `npm run build`, and
`npm run test:e2e`. With Auth and Firestore emulators plus the Release 4 dev server
running at port 5175, run `npm run test:e2e:release-four` for the durable-record
journey. Run `npm run test:e2e:release-five` for the isolated emulator-backed research
and Plan Brief journey. The emulator requires Java 21+ compiled for the host CPU.

For the managed API, use Python 3.11+ and run the following from
`services/clara-api`:

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install -e '.[test]'
cp .env.example .env.local
.venv/bin/uvicorn clara_api.main:app --host 127.0.0.1 --port 8787 --env-file .env.local
```

Run `.venv/bin/python -m pytest -q` for its deterministic contract tests. Add
`VITE_CLARA_API_URL=http://127.0.0.1:8787` to the PWA `.env.local` only when testing
the managed path. Runtime configuration and the cloud-credential gate are documented
in [the managed Clara API contract](docs/MANAGED_CLARA_API.md).

Production PWA: `https://longview.sortedqueue.com/` (Firebase Hosting custom domain).

Production Clara API: `https://longview-clara-api-112452643430.asia-south1.run.app`.

Build the hosted release with `npm run build:production`. This command pins the
Release 4 surface, the managed Clara API, and production Firebase connections so a
developer’s local emulator settings cannot be embedded in the hosted bundle.
`npm run build:release-five` prepares the equivalent managed Release 5 candidate but
does not deploy it.

Production builds also pin `VITE_FIREBASE_AUTH_DOMAIN=longview.sortedqueue.com` so
Google authentication uses the same origin as the app. The Google OAuth web client
must allow `https://longview.sortedqueue.com/__/auth/handler`. The PWA navigation
fallback excludes Firebase’s reserved `/__/` namespace so authentication helpers and
hosted Firebase configuration always reach Firebase Hosting.

## Review the mockup

Open `docs/design/longview-pwa-interactive-mockup.html` directly in a browser. Use the
screen and edge-case selectors in the top bar to inspect the complete journey.
