# Longview Agent Prerequisites

## Product artifact rule

Every meaningful user-facing change must update both:

1. A Markdown PRD or phase document.
2. A linked interactive HTML mockup showing the complete journey and failure states.

Implementation begins only after the mockup is reviewed, unless the product owner
explicitly skips that gate.

## Product boundary

- Longview is a new project. Do not rename, move, or modify any pre-existing app.
- Clara is Longview's assistant. Do not reuse assistant branding from pre-existing apps.
- The hackathon scope is PWA only. Android and iOS are deferred.
- Reused concepts or code must be disclosed. Never imply pre-existing work was built
  during the contest period.
- Durable agent changes require a visible preview and explicit user approval.

## Delivery rules

- Prefer small, independently reviewable pull requests.
- Preserve typed boundaries between model output and durable writes.
- Test success, cancellation, timeout, malformed output, offline behavior,
  idempotency, and partial-write recovery.
- Do not publish or deploy without explicit approval.
