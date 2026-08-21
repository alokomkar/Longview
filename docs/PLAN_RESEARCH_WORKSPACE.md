# Plan Research Workspace

Status: URL addition slice approved for implementation; broader workspace remains phased

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

## Implemented URL addition slice

The first shippable slice starts inside one Plan and therefore uses that Plan as the
explicit initial association. It includes public-HTTPS validation, tracking-parameter
normalization, deterministic duplicate detection, exact review, one transactional
source-and-link save, idempotent retry, reload restoration, and owner isolation.

Clara matching, unassigned capture, linking one source to several Plans, card state
changes, wiki authoring, and Plan Brief promotion remain represented in this approved
design but are not implied by the URL-addition release.

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

## Durable model proposal

| Record | Boundary |
|---|---|
| `researchSources/{sourceId}` | Owner-scoped canonical URL, title, excerpt, capture metadata, and content fingerprint |
| `sourceNotes/{noteId}` | Owner-authored note, topic, research question, and revision |
| `planSourceLinks/{linkId}` | Explicit Plan association, confirmation actor, rationale, and server time |
| `sourceStateEvents/{eventId}` | Append-only Inbox/Reading/Useful/Archived transition |
| `wikiPages/{pageId}` | Plan-scoped page identity and current revision pointer |
| `wikiVersions/{versionId}` | Immutable user-approved text with statement-to-source references |

Clara suggestions are transient until confirmed. A matching request and its response may
be recorded for audit, but it cannot create a `planSourceLink` or wiki version.

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

The product owner approved the interactive journey on 21st August 2026 and explicitly
authorized implementation, testing, and production deployment of the URL-addition slice.
