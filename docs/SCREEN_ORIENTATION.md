# Screen orientation

## Problem

Longview highlights the active primary tab, but deeper screens do not consistently
name their parent section. Feature or release labels can also occupy the header where
the user expects location context. A user can therefore lose track of whether they are
reviewing Today, Calendar, a Plan, research, or an approval.

## Proposed experience

The application uses one navigation model:

1. A persistent location header names the current primary section.
2. Primary screens show only the section name: **Today**, **Calendar**, **Plans**, or
   **Settings**.
3. A screen inside a section adds a plain-language page title and a Back action. For
   example: **Plans / Launch Longview / Research** with **Back to Plan**.
4. Desktop uses a persistent left navigation; mobile uses the existing bottom
   navigation. Both show the parent section as selected with `aria-current="page"`
   and a stronger visual state.
5. Loading, empty, error, review, and success states retain the same location header.
6. Authentication remains outside the signed-in navigation shell.

Feature names, release numbers, and internal journey labels do not appear as global
production location labels.

## Boundaries

- Location changes are presentational and local; they make no network request or write.
- The desktop sidebar is an adaptive rendering of the same four primary destinations,
  not a second information architecture or browser-history router.
- Back actions return to an existing authoritative surface and never silently discard a
  durable change.
- Mobile keeps the location header and bottom navigation visible without obscuring the
  current page.

## Acceptance criteria

1. Every signed-in screen exposes one current primary section.
2. Exactly one bottom-navigation item is selected on every signed-in screen.
3. Plan details, Clara, schedule review, research, and achievement screens show their
   parent section and a clear Back action.
4. Empty, loading, timeout, malformed-response, and unavailable-record states preserve
   the same location context.
5. Screen readers receive the page title and `aria-current="page"` state.
6. At 360 px width and 200% text size, location controls wrap without horizontal
   scrolling or covering actions.
7. Existing navigation, approval boundaries, data ownership, and retry behavior remain
   unchanged.

## Review artifact

Use the linked interactive mockup to inspect primary screens, nested screens, and safe
failure states before implementation:

[Screen orientation interactive mockup](design/longview-screen-orientation.html)
