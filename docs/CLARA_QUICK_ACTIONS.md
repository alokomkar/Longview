# Clara Quick Actions

Status: Implemented locally

Updated: 2026-08-18

Acceptance case: AI-07

Linked journey: [Interactive mockup](design/longview-pwa-interactive-mockup.html#clara-actions)

## Smallest judged outcome

A user can open **Ask Clara** from Today, inspect the attached context, choose a Quick
Action group, open **Plan my day**, and hand off to the existing Calendar proposal flow.
Opening the catalogue performs no network request and changes no saved data.

## Typed boundary

Every catalogue action has a stable identifier and one allowed destination: Calendar or
Plans. Unknown groups fail closed. The catalogue cannot write to Firestore, invoke a
model, approve a proposal, or manufacture unsupported results.

Calendar actions reuse the managed checkpointed schedule run and its visible progress,
failure, retry, and approval states. Plans actions open the authoritative portfolio.
Every durable schedule write still requires an exact reviewed proposal.

## Acceptance

1. Incomplete and completed Today states expose Ask Clara without replacing the scoped
   step recommendation.
2. Ask Clara states the attached Plan and eligible-step counts.
3. Quick Actions are grouped by Plan my day, Prioritize, Move work, and Review progress.
4. The catalogue and detail screen make no network request or durable write.
5. Build today’s schedule opens Calendar but does not start a run until **Prepare today**.
6. Every action routes only to Calendar or Plans.
7. Mobile layout stacks action cards without hiding the safety disclosure.

## Review instructions

From an incomplete Today step, choose **Ask Clara → Quick Actions → Plan my day → Build
today’s schedule**. Confirm Calendar opens with **Prepare today** and no proposal has
started. Return to Today and verify **Ask Clara about this step** still opens the existing
read-only managed recommendation.
