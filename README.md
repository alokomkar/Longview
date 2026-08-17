# Longview

Longview is a PWA-first personal AI chief of staff. Clara helps people coordinate
multiple long-term goals against finite time, turn recommendations into reviewable
changes, and preserve the reasoning behind important decisions.

## Product artifacts

- [Product requirements](docs/PRODUCT_REQUIREMENTS.md)
- [Implementation phases](docs/IMPLEMENTATION_PHASES.md)
- [Hackathon tech stack](docs/TECH_STACK.md)
- [Hackathon readiness ledger](docs/HACKATHON_READINESS.md)
- [Interactive PWA mockup](docs/design/longview-pwa-interactive-mockup.html)
- [Hackathon acceptance demo](docs/design/longview-hackathon-acceptance-demo.html)

## Current status

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
Validated Plan creation uses an explicit review and idempotent owner-scoped Firestore
write. The Plans tab now loads the owner's saved Plans with loading, empty, failure,
retry, and populated states. Today deterministically selects the nearest active target
and prepares one bounded 30–60 minute proof-of-progress step. Stored Plans are checked
at runtime before use, and this step performs no automatic write. Editing, deletion,
collaboration, and model recommendations remain outside this slice.
Today-step completion now requires explicit confirmation and records one immutable,
owner-scoped event. Retrying reuses the same completion ID, reload restores the result,
and neither the Plan nor schedule is changed.
A typed, read-only Clara recommendation preview now shows its source facts, rationale,
and confidence. Its deterministic preview adapter validates the UI and failure
contract; it is not a managed model call and cannot change durable data.

## Local development

1. Install Node.js 22 and Java 21+ for the current Firebase Emulator Suite. Java 17
   may remain installed for Android tooling.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local`; production Firebase values remain local. Set
   `VITE_USE_FIREBASE_EMULATORS=false` to test the real Google account chooser, or
   `true` for deterministic emulator tests.
4. Run `npm run dev:local`; it waits for Firestore Emulator before starting Vite.
5. Open `http://127.0.0.1:5173`. Google Auth is real; Firestore remains local.

Verification: `npm test`, `npm run test:rules`, `npm run build`, and
`npm run test:e2e`. The emulator requires Java 21+ compiled for the host CPU.

Hosted authentication acceptance: `https://longview-505611.web.app/`.

## Review the mockup

Open `docs/design/longview-pwa-interactive-mockup.html` directly in a browser. Use the
screen and edge-case selectors in the top bar to inspect the complete journey.
