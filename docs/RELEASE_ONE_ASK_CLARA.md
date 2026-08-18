# Release 1: Ask Clara

Status: Implementation in progress

Target: 18th August 2026

Interactive acceptance: [Ask Clara release journey](design/longview-release-one-ask-clara.html)

## User outcome

A signed-in user can ask Clara for guidance about a saved Plan or today's selected
step. Clara shows the exact context used, one recommendation, its rationale, and a
plain-language confidence level. The request cannot change Plan, schedule, task, or
completion data.

## Production boundary

- Firebase authentication remains the identity boundary.
- The PWA sends only the selected Plan, and the selected step when applicable.
- FastAPI verifies the Firebase ID token before invoking Google ADK on Vertex AI.
- The Cloud Run release exposes health and recommendation routes only.
- Model output is validated against a strict schema and matched to the request and
  Plan before it reaches the UI.
- Recommendations are cached per user and Plan for five minutes.

## Failure contract

- **Clarification:** show Clara's question and low confidence; never invent missing
  context.
- **Cancellation:** stop the active request and return to the unchanged screen.
- **Timeout:** stop after the bounded deadline and offer a safe retry.
- **Malformed or mismatched output:** reject the response and show no recommendation.
- **Offline or unavailable service:** explain that nothing changed and offer retry.
- **Unexpected proposed change:** reject it at the API and client release boundaries.

## Deliberately hidden

Calendar generation, Quick Actions, schedule proposals, approvals, task edits,
research, Plan Briefs, and every agent-driven write remain outside Release 1.

## Release gates

1. Unit and API tests cover Plan and step requests, clarification, cancellation,
   timeout, malformed output, mismatched IDs, authentication, and read-only routing.
2. Production OpenAPI contains no write-capable Clara route.
3. The mobile PWA shows progress for the full network request and leaves saved data
   unchanged across success and every failure.
4. Cloud Run health, authentication rejection, CORS, and hosted-PWA smoke checks pass.

