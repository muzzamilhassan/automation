# Spec + QA — Confirmations, audit rows, error pages (2026-11-16)

Admin-panel review 2026-11-15 bug #8.

- R1: Pause/Resume everything, template unassign and provider remove SHALL ask for confirmation.
- R2: profile save, template assign/unassign, provider set/deactivate route and create-video SHALL write an audit row (template drafts already record to `template_approvals`). Before/after values arrive with the Neon single-source-of-truth step (C).
- R3: A page crash SHALL show an error page with "Try again"; unknown URLs SHALL show a 404 page.

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | R1 | window.confirm inside setAll / unassign / removeProvider | automated | `node --test tests/panel-safety-audit.test.mjs` |
| 2 | R2 | appendAudit imported and called with each action name | automated | same |
| 3 | R3 | `app/error.js` (client, reset) + `app/not-found.js` exist; eslint clean; `next build` OK | automated | same + local |
| 4 | R1–R3 | owner: Pause everything asks first; an unknown URL shows the 404 page | manual | browser |

Note: pre-existing eslint `set-state-in-effect` errors in TemplateAssignPanel.js:95 and ProviderRoutingPanel.js:47 (effect-load pattern) are unchanged — tracked with the audit's 13 existing ones.
