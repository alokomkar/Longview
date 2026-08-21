# Custom-domain Google redirect authentication

## Problem

Google popup authentication is intermittent on the custom production domain. The
popup can complete account selection while the opener loses the completion signal,
returning the user to the sign-in screen with a generic failure.

## Experience

Longview uses Firebase's full-page redirect flow for both Google sign-in and linking
an anonymous workspace:

1. The user chooses Google from Longview.
2. The current tab moves to Google; no second window is opened.
3. Google returns to Longview's same-domain Firebase handler.
4. Longview completes the redirect result before observing the restored account.
5. Success opens the existing workspace. A safe failure keeps the signed-out choices
   or the current anonymous workspace available.

## Boundaries

- Redirect completion performs authentication only; it does not merge workspaces or
  change Plan data.
- An account-link conflict leaves the anonymous workspace unchanged and offers an
  explicit switch to the existing Google workspace.
- Cancellation, offline failure, malformed errors, reload, and unmount-before-return
  must not create an authenticated UI with the wrong account.
- The production auth domain and redirect handler remain on
  `longview.sortedqueue.com`.

## Acceptance criteria

1. Sign-in and anonymous linking use full-page redirects, not popups.
2. Redirect completion runs exactly once before the auth observer is attached.
3. A returning Google user reaches the same workspace and stays signed in after reload.
4. A signed-out failure retains Google retry and anonymous entry.
5. A link conflict retains the anonymous workspace and exposes no silent merge.
6. Sign-out followed by a second Google sign-in succeeds on the production domain.

## Review artifact

[Interactive redirect-auth journey](design/longview-google-redirect-auth.html)
