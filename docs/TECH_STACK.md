# Longview Hackathon Tech Stack

Status: Proposed for implementation

Last updated: 2026-08-15

## Hackathon fit

Longview will enter the **Collaborative Partner** category. Clara leads a bounded
follow-through loop, requests clarification when needed, captures feedback, and adapts
future recommendations. The demo must show useful agent work, not only conversation.

## Selected stack

| Layer | Choice | Responsibility |
|---|---|---|
| PWA | React, TypeScript, Vite, Workbox | Responsive installable UI, service worker, offline shell |
| Client state | TanStack Query, XState, IndexedDB | Server cache, explicit workflow states, offline mutation outbox |
| Identity | Firebase Authentication | Anonymous accounts and safe Google account linking |
| API | FastAPI on Cloud Run | Typed authorization boundary, previews, approvals, durable writes |
| Agent | Google ADK with Gemini 2.5 Flash on Vertex AI | Clarification, planning, recommendations, and structured output |
| Async runtime | Pub/Sub push to a separate Cloud Run worker | Background follow-through runs, retry isolation, and cancellation |
| Durable state | Firestore | Goals, versions, run checkpoints, idempotency records, and audit events |
| Security | Secret Manager and least-privilege service accounts | Credentials and workload isolation |
| Observability | Cloud Logging, Error Reporting, Trace | Run evidence, latency, failures, and recovery |
| Hosting | Firebase Hosting | PWA delivery with Cloud Run API routing |
| Contracts | OpenAPI and JSON Schema | Generated TypeScript now; Kotlin and Swift clients later |
| Tests | Vitest, Testing Library, Playwright, pytest | Unit, accessibility, offline, integration, and E2E coverage |

## Runtime boundary

The PWA calls the Cloud Run API; it never calls Vertex AI or Firestore with privileged
credentials. Pub/Sub starts a worker run, which checkpoints progress in Firestore and
invokes ADK. Model output remains advisory. A durable mutation still requires a visible
preview, explicit approval, schema and authorization checks, an expected version, and
an idempotent Firestore transaction.

## Demo and delivery evidence

- Keep the public demo near four minutes and record one continuous working flow.
- Show the hosted PWA, an asynchronous run, approval, and recovery from one failure.
- Show Cloud Run revision/runtime evidence and matching Cloud Logging run identifiers.
- Include an architecture diagram plus reproducible local and Google Cloud setup.

## Native extension path

Android will use Jetpack Compose and iOS will use SwiftUI against the same versioned
API, schemas, event vocabulary, and authorization rules. UI code is intentionally not
shared; Kotlin Multiplatform is reconsidered only after stable native requirements.

## Explicit exclusions

Do not add React Native, Kubernetes, a vector database, or bonus media models solely
for the submission. They increase delivery risk without strengthening the judged loop.
