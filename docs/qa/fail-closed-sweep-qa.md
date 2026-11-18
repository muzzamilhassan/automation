# QA — Fail-closed sweep: overview / analytics / leaderboard / topics (#118)

*Built 2026-11-18. Plain-English QA. Every row executed for real before shipping.*

## The rule for this fix

Four panel routes decided "who may see what" in a way that could accidentally show everything: if the user couldn't be resolved, or the channel registry hiccupped, the safety filter silently switched OFF — showing the whole network's stats (and, on the Topics desk, letting a client write to any channel's queue). Now: an unknown user gets a plain 401, and a registry hiccup gives a client an EMPTY view instead of everything. Owner/staff see exactly what they saw before.

## QA rows

| # | What to do | What should happen | Evidence / result |
|---|---|---|---|
| 1 | New pin-tests | All fail-closed contracts pass | PASS — `node --test tests/fail-closed-routes.test.mjs` → **6/6 pass** |
| 2 | Regression: auth/session/wizard/analytics suites | Everything green | PASS — combined run → **81/81** |
| 3 | Full repo regression | Only pre-existing failures allowed | PASS — **1378/1379**; the single failure (`T4b reportChannels`) is the same pre-existing parallel-session data drift proven on a clean tree in #116 |
| 4 | Lint the changed files | ESLint clean | PASS — `pnpm exec eslint` on all four routes → exit 0 |
| 5 | owner/staff behavior unchanged | `slugsForUser` returns null (= all) WITHOUT touching the registry — the new `[]` fallback can only hit clients | PASS — behavioral test (owner → null, staff → null, missing user → []) + source test proving the client short-circuit order |
| 6 | Unknown user → 401 on all four routes | overview, analytics, leaderboard get the 401 gate; topics guard returns 'not signed in' | PASS — source scans on all four |
| 7 | A client during a registry blip sees nothing, not everything | scope resolves to [] on overview (producing + logs + controlChannels all read the same `owned`) | PASS — overview source scan |
| 8 | A client during a registry blip can't write to any queue | topics guard: empty owned → 'not your channel' for every slug | PASS — topics guard scan (guard shared by read + write paths) |
| 9 | The analytics cache can't leak across users | cache key still derives from the post-filter slug list (#47 rule intact) | PASS — `scopeKey` assertion |
| 10 | The old fail-open shape is gone | No `slugsForUser(...).catch(() => null)` remains in the four routes; no `user ? slugsForUser : null` ternary in analytics/leaderboard | PASS — negative assertions |
| 11 | Production build + deploy | Vercel build green, deployment READY | PASS — see issue #118 close comment for the deployment URL |
| 12 | Nothing else changed | Diff limited to 4 routes + test + QA file | PASS — named-files-only commit |

## Files in this change

- [studio/app/api/overview/route.js](../../app/api/overview/route.js) — 401 gate + `[]` fallback (was the double fail-open route)
- [studio/app/api/analytics/route.js](../../app/api/analytics/route.js) — 401 gate (client fallback was already correct)
- [studio/app/api/analytics/leaderboard/route.js](../../app/api/analytics/leaderboard/route.js) — 401 gate
- [studio/app/api/topics/route.js](../../app/api/topics/route.js) — guard `[]` fallback (closes the client write hole)
- [tests/fail-closed-routes.test.mjs](../../tests/fail-closed-routes.test.mjs) — 6 pin-tests
- QA file: this one

## Known limits (honest)

- During a registry blip a CLIENT now sees an empty overview/analytics until the registry recovers — the documented #47 tradeoff (empty is the safe direction).
- These gates matter when the edge proxy is bypassed or misconfigured; through the normal proxy, anonymous callers were already stopped (verified live in the audit: 15/15 endpoints 401). This issue makes the routes stand on their own, per the project's own doctrine.
