# Managed Clara Recommendation API

Status: Implementation contract

Updated: 2026-08-17

## Slice boundary

This slice replaces the deterministic browser preview with an authenticated,
read-only recommendation call. It does not approve changes, write Firestore, start a
background run, or claim a deployed Cloud Run revision.

## Runtime contract

- `POST /v1/clara/recommendations` accepts the existing versioned Today-step context.
- The API verifies a Firebase ID token and uses its UID as the only user identity.
- The request contains one selected Plan and one derived Today step; no unrelated Plan,
  browser state, or Firestore document is available to the model.
- Google ADK invokes Vertex AI model `gemini-3.6-flash` and returns the existing strict
  recommendation payload. The API supplies trusted request and Plan identifiers plus
  `proposedChange: null`, then parses the complete response before it reaches the PWA.
- A response may request clarification, but `proposedChange` must remain `null` in this
  read-only slice.

## Fail-closed behavior

- Missing or invalid authentication returns `401` without invoking the model.
- Invalid context returns `422`; oversized or unknown fields are rejected.
- Timeout returns `504`; unavailable dependencies return `503`.
- Malformed, mismatched, or write-bearing model output returns `502`.
- Cancellation stops the client request. No retry writes or durable side effects exist.

## Configuration

- Local development requires Python 3.11+ and an isolated virtual environment under
  `services/clara-api/.venv`. Copy the service `.env.example` to ignored `.env.local`.
- The PWA uses the managed gateway only when `VITE_CLARA_API_URL` is present.
- Local UI development without that variable keeps the clearly labelled deterministic
  preview adapter.
- Cloud Run uses Application Default Credentials with `GOOGLE_CLOUD_PROJECT`,
  `GOOGLE_CLOUD_QUOTA_PROJECT`, `GOOGLE_CLOUD_LOCATION=global`, and
  `GOOGLE_GENAI_USE_VERTEXAI=TRUE`.
- `CLARA_ALLOWED_ORIGINS` is a comma-separated exact allowlist. It defaults to the
  Firebase Hosting production origin; local origins must be opted in explicitly.

Deployment, IAM grants, API enablement, Firebase Hosting rewrites, Cloud Logging proof,
and production endpoint evidence require a separate explicit deployment approval.
