# Plan Research Workspace

Status: complete implementation candidate; production acceptance pending

Last updated: 2026-08-21

Interactive review: [Plan Research Workspace mockup](design/longview-plan-research-workspace.html)

## Outcome

A user can collect research they found themselves, decide which Plan or Plans it
supports, organize it into an evolving cited wiki, and deliberately promote selected
conclusions into the existing Plan Brief. Clara may recommend associations and expose
conflicts, but cannot silently attach, accept, rewrite, or promote a source.

## Product boundary

- The workspace is not a general-purpose bookmark manager. Every saved source needs a
  research question, user note, topic, or intended use.
- A source is stored once in the user's Research Library. Plan membership is represented
  by separate links, so one source may support several Plans without duplication.
- Capturing from inside a Plan gives a deterministic initial Plan association.
- Capturing outside a Plan may ask Clara to rank active Plans using the page title,
  selected excerpt, user note, Plan outcomes, topics, and prior confirmed associations.
- Clara returns a recommendation, alternatives, rationale, confidence, and an explicit
  clarification state. The user confirms every link.
- An uncertain source can remain in **Unassigned research** without being lost.
- Research cards contain raw evidence and the user's interpretation. Wiki pages contain
  user-authored synthesis with statement-level citations. Plan Briefs remain concise,
  versioned execution guidance.
- The first release accepts a URL, title, excerpt, note, and topic supplied by the user.
  It does not crawl arbitrary pages, upload documents, generate embeddings, or run
  background research.

## Implemented workspace

The PWA now implements manual URL capture, public-HTTPS validation, tracking-parameter
normalization, a workspace Research Library, unassigned capture, one-to-many Plan
associations, reviewed Inbox/Reading/Useful/Archived transitions, source details and
search. Canonical evidence is immutable; organization changes create an append-only
event and advance one optimistic-concurrency pointer.

Authenticated Clara matching ranks bounded active-Plan summaries without writing data.
It returns alternatives, rationale, confidence and clarification state; manual selection
remains available after cancellation, malformed output, timeout or service failure.

Useful Plan-linked sources can be cited in user-authored Wiki pages. Each exact Wiki
revision is immutable and stale writes fail closed. A cited Wiki version can prepare an
editable Plan Brief proposal; only the final reviewed confirmation advances the existing
versioned Plan Brief pointer.

## Complete journey

1. Open **Plans / Plan / Research** and review the Plan-scoped workspace without a write.
2. Choose **Add a source**, then enter a URL, title, excerpt, note, and topic.
3. Ask Clara to suggest an association or skip matching and select Plans manually.
4. Review one recommended Plan, alternatives, confidence, and rationale. Choose one or
   several Plans, or keep the source unassigned.
5. Review the exact source and associations, then confirm one save.
6. Move cards through **Inbox**, **Reading**, **Useful**, and **Archived**. These are
   user-controlled states; movement never changes a Plan Brief.
7. Open a card to inspect its excerpt, note, topic, Plan links, capture time, and source
   URL. Add or remove Plan links through another explicit review.
8. Group useful sources under research questions and add cited statements to a Plan Wiki.
9. Review a wiki revision showing its exact text and source links before saving.
10. Select wiki conclusions to prepare an editable Plan Brief proposal. Existing Plan
    Brief review, versioning, idempotency, and stale-write protections remain unchanged.

## Durable model

| Record | Boundary |
|---|---|
| `researchSources/{sourceId}` | Owner-scoped canonical URL, title, excerpt, capture metadata, and content fingerprint |
| `researchSourceStates/{sourceId}` | Current note, topic, workflow state, Plan links and optimistic revision |
| `researchSourceEvents/{eventId}` | Immutable reviewed organization transition and idempotency evidence |
| `wikiPages/{pageId}` | Plan-scoped page identity and current revision pointer |
| `wikiVersions/{versionId}` | Immutable user-approved text with statement-to-source references |
| `briefVersions/{versionId}` | Existing immutable Plan Brief version, attributed to accepted research or one cited Wiki version |

Clara suggestions are transient and cannot create source state, Plan associations, Wiki
versions, or Plan Brief versions.

## Failure and recovery contract

| Failure | Visible result | Durable effect | Recovery |
|---|---|---|---|
| Clara unavailable or timeout | Manual Plan selection remains available | None | Continue manually or retry |
| Ambiguous match | Multiple candidates and explanation | None | Select one, several, or unassigned |
| No plausible Plan | Unassigned is recommended | None | Keep unassigned or choose manually |
| Duplicate URL | Existing source and current Plan links are shown | None | Link existing source or cancel |
| Invalid or private URL | Safe explanation; typed fields remain | None | Correct URL or save note without URL |
| Offline/save unavailable | Review remains on screen | None or one idempotent save | Retry original request key |
| Concurrent source edit | Latest source revision is shown | None | Reapply note or association |
| Wiki citation removed concurrently | Stale draft is not saved | None | Review current sources and revise |
| Plan deleted or completed | Source remains in the library | No new link | Choose another Plan or unassigned |

## Acceptance gate for implementation

- Product owner reviews the linked success, ambiguity, multi-Plan, duplicate, unassigned,
  unavailable-Clara, offline-save, and stale-wiki journeys.
- The first implementation remains PWA-only and begins with manual capture. A desktop
  browser extension and mobile share target are separate later releases.
- Unit tests cover URL normalization, duplicate fingerprints, association ranking
  parsing, multiple Plan links, unassigned sources, and citation validation.
- Integration tests cover cancellation, timeout, malformed suggestions, offline writes,
  idempotent retry, concurrent edits, partial-write recovery, and owner isolation.

The product owner approved the interactive journey and explicitly authorized complete
implementation, testing, and production deployment on 21st August 2026.
