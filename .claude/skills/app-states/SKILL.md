---
name: app-states
description: Design the four states every surface needs — loading, empty, error, success — with skeleton-not-spinner loading, invitation-tone empty states, specific unapologetic error copy, and the state coverage matrix per surface type. Use when building any page, list, table, card, dialog, or form, or when a UI has no loading/empty/error treatment.
license: MIT
metadata:
  source: fullstack-agent-os (authored; references skeleton-screen perceived-performance practice, premium-frontend microcopy)
  category: frontend
---

# App States — a stateless surface is an unfinished feature

Every surface (page, list, table, card, dialog, form) ships with FOUR states. The happy path is one of four — the other three are where products feel professional or feel broken.

## Loading — skeletons that mirror the layout

- Skeletons matching the REAL layout shape (same cards, same rows) — not a centered spinner. The skeleton IS the layout preview; layout shift on load = wrong skeleton.
- Keep it under the fold of attention: fast loads (<300ms) get NO skeleton at all (flash of skeleton is worse).
- Never block the whole page for one widget — scope loading to the region that is waiting.

## Empty — an invitation to act

- State the benefit, then ONE next action: "No projects yet. Create your first project to see your dashboard come alive." + button.
- Blank tables/silence = broken. The empty state is often the FIRST screen a new user sees — it is onboarding, not absence.
- Distinguish: never-used (invite), no-results (adjust filters, shown with them), cleared/archived (where did it go).

## Error — specific, actionable, no apology

- Name what failed and the next step: "We couldn't save your changes — the connection dropped. Retry" — not "Something went wrong" / "Oops".
- Never blame the user ("invalid input" → "Enter a valid email — e.g. name@company.com").
- Form errors sit NEXT TO the field, tied via `aria-describedby`; page-level errors are dismissible and don't nuke entered data.
- Preserve the user's input through every error path — losing typed work is the worst bug a form can have.

## Success — confirm, then next action

- Confirm WHAT happened ("Invoice #1042 sent to acme@…"), offer the logical next step ("Create another", "Back to list").
- Toasts: success may auto-dismiss; errors stay until addressed.

## Microcopy rules (all states)

"Save changes" not "Submit" · verbs match the action · no jargon, no error codes in the user's face (codes go in the expandable detail / console) · sentence case, no exclamation marks in system messages.

## Coverage matrix (check per surface before done)

| Surface | Loading | Empty | Error | Success |
|---------|---------|-------|-------|---------|
| every page/list/table/card/dialog/form | ✓ | ✓ | ✓ | ✓ |

Each ✓ is verified in `qa-run`/`visual-review-loop` — a surface missing a state fails QA.
