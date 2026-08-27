# Managed Clara Recommendation API

Status: Implementation contract

Updated: 2026-08-19

## Slice boundary

This slice replaces the deterministic browser preview with an authenticated,
read-only recommendation call. It does not approve changes, write Firestore, start a
background run, or claim a deployed Cloud Run revision.

## Runtime contract

- `POST /v1/clara/recommendations` accepts the existing versioned Today-step context.
- The API verifies a Firebase ID token and uses its UID as the only user identity.
- The request contains one selected Plan and one derived Today step; no unrelated Plan,
  browser state, or Firestore document is available to the model.
- Google ADK invokes Vertex AI model `gemini-3.5-flash` and returns the existing strict
  recommendation payload. The API supplies trusted request and Plan identifiers plus
  `proposedChange: null`, then parses the complete response before it reaches the PWA.
- A response may request clarification, but `proposedChange` must remain `null` in this
  read-only slice.
- The browser keeps one validated recommendation per user-owned Plan in memory for five
  minutes, with a 50-Plan upper bound. A hit requires the same Firebase UID and complete
  Plan/Today context without `requestId`; its response receives the current request ID.
  A context change replaces that Plan's entry only after a valid response. Expiry,
  sign-in changes, page reloads, malformed responses, and failures miss the cache and
  never reuse a token.

## Fail-closed behavior

- Asking Clara immediately opens a dedicated loading state. An indeterminate progress
  bar remains visible and animated until a recommendation, failure, timeout, or user
  cancellation ends the request. It never invents a completion percentage.
- The loading region uses `aria-busy` and an indeterminate `progressbar` label. Reduced
  motion keeps a visible static indicator while preserving the same status copy.
- Missing or invalid authentication returns `401` without invoking the model.
- Invalid context returns `422`; oversized or unknown fields are rejected.
- The managed model call has a 15-second budget and returns `504` when exhausted.
  The PWA waits up to 18 seconds so it can classify that response as a timeout;
  unavailable dependencies return `503`.
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
- `CLARA_TIMEOUT_SECONDS` controls the managed model budget and defaults to `15`.

Deployment, IAM grants, API enablement, Firebase Hosting rewrites, Cloud Logging proof,
and production endpoint evidence require a separate explicit deployment approval.

## Release 5 grounded research

- `POST /v1/clara/research` is authenticated, Plan-scoped, read-only, and exposed only
  by the Release 5 service entry point.
- Gemini uses Google Search grounding. Each request returns one strictly validated
  card, derives HTTPS attribution only from grounding metadata, and preserves up to
  three provider Search suggestions for display. Users can request another card after
  reviewing the first.
- The grounded request is deliberately bounded to one short card and a 3,000-token
  model budget so search reasoning cannot truncate the validated JSON payload. A
  single provider source index may be normalized from one-based to zero-based only
  when exactly one grounded source exists; ambiguous attribution still fails closed.
- The browser allows 25 seconds for identity lookup, transport, and the server's
  bounded model call. Cancellation still aborts the request immediately.
- Schema-enforced output combined with built-in tools is documented for Gemini 3 only.
  The research path is on Gemini 3.5 but still requests JSON and validates it with
  strict Pydantic models before any card reaches the PWA, rather than relying on
  `output_schema` alongside the Google Search tool.
- `CLARA_RESEARCH_MODEL` overrides the research model; it defaults to `CLARA_MODEL`,
  then `gemini-3.5-flash`. Timeout, unavailable, malformed, and missing-attribution
  responses fail closed and create no durable research.
