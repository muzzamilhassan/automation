# QA — #121 shared rate limiter (audit RL-1 … RL-6)

*Shipped 2026-11-18. Design: docs/superpowers/specs/2026-11-18-wave3-rate-limits-design.md. Evidence: tests/rate-limit.test.mjs (17/17 green) + full suite.*

**What this feature is, in one line:** the panel's expensive buttons now have per-person speed limits (stored in the Neon database, the same place the login lockout lives), so one leaked login or a stuck browser tab can no longer burn YouTube quota, billable Actions runs, or the free AI providers. Normal clicking never hits a limit — every cap sits well above human pace.

| # | What we checked | How we know it works | Result |
|---|---|---|---|
| 1 | The counter is one atomic database operation — no two server instances can race | The whole check is a single INSERT-OR-UPDATE statement in SQL; tests verify the exact statement text the library runs (a test stub rejects anything else) | PASS |
| 2 | A request at the limit still passes; the one after is blocked (no off-by-one) | Behavioral test: count 1…limit → allowed, limit+1 → blocked with a correct "try again in ~60 min" value | PASS |
| 3 | When blocked, the panel answers **429** with a `Retry-After` header and a plain-English message naming the limit | Test: blocked request returns status 429, header ≈ 3600s, message "Too many requests — … limit reached" | PASS |
| 4 | If Neon is briefly unreachable, the limiter **lets requests through** (deliberate: it's a cost guard, auth already happened) and logs a warning | Test: simulated database failure → allowed with a `failOpen` marker + the warning appears in the log; empty counter row also fails open | PASS |
| 5 | Every block writes one line to the audit trail (actor, what was blocked, when the window resets) | Test: block → exactly one `rate-limit-deny` audit row with the actor's email; passing requests write nothing | PASS |
| 6 | AI background images (60-second calls to the free 10-requests/minute provider): max **5/hour and 20/day** per person, checked after login and after the key check, before the expensive call | Source-scan test pins both limits and their position in [ai-bg/route.js](../../studio/app/api/thumbs/ai-bg/route.js) | PASS |
| 7 | Brand-kit AI autofill (Groq free tier): max **10/hour** — and only on the AI path; the free deterministic fallback stays unlimited | Source-scan test pins the limit inside the `useLLM` branch of [kit/route.js](../../studio/app/api/channels/kit/route.js) | PASS |
| 8 | Billable GitHub Actions runs (run buttons + video creation): **10/hour and 30/day** per person, one shared bucket so the two routes can't double-dip | Source-scan tests pin `dispatch` limits in both [action/route.js](../../studio/app/api/action/route.js) and [create-video/route.js](../../studio/app/api/create-video/route.js); the cheap job-list GET stays unlimited | PASS |
| 9 | The `topup` heal amount can no longer be set to an absurd number — it's clamped to **≤ 20 slots** per run | Test proves the clamped write exists and the old unclamped write is gone | PASS |
| 10 | "Refresh" (`fresh=1`) — which re-pulls every channel from Google and burns the same quota the nightly autopilot needs — is now **owner-only** (staff/clients get 403) and capped at **5/hour** | Source-scan tests pin the owner gate + cap in both analytics and overview routes | PASS |
| 11 | Anonymous callers can no longer bust the caches: overview now checks **who you are before it loads any data** (also a small speed win on every 401 probe) | Test: the 401 fires before the data-loading line; user is resolved exactly once; `bustCache()` runs only after the owner gate passed | PASS |
| 12 | Thumbnail preview (up to 12 MB photo fetch + render): max **30 per 10 minutes** | Source-scan pin in [preview/route.js](../../studio/app/api/thumbs/preview/route.js) | PASS |
| 13 | Performance/videos boards (uncached Google fan-outs): max **20/hour**, shared bucket across both routes | Source-scan pins in both routes | PASS |
| 14 | The public demo thumbnail route tells the CDN to cache each render for a day (`s-maxage=86400`) — one render per URL variant instead of re-rendering per viewer | Source-scan pin in [demo/route.js](../../studio/app/api/thumbs/demo/route.js); existing colour validation untouched | PASS |
| 15 | The `rate_limits` table exists in Neon with the right primary key | Added to db-setup.mjs and **run against Neon 2026-11-18** (idempotent — all other tables reported unchanged); composite PK matches the upsert's conflict target | PASS |
| 16 | Lint + full regression stay green | ESLint clean on all 12 touched files; full suite: only the known pre-existing T4b failure (parallel-session data drift, never chase) | PASS |

## Operator notes

- **Limits are one-line changes.** Every cap is a `{ bucket, limit, windowSec }` literal in the route file — if a real workflow ever bumps into one, it's a one-number edit, not a redesign.
- **This is not the login lockout.** The login throttle (5 wrong passwords per IP) already existed and is unchanged.
- **Fail-open was a deliberate, owner-approved deviation:** if Neon blips, the limits vanish for that moment but nothing else breaks. Authentication stays fail-closed (#118 doctrine untouched).

## Owner step (one click, not code) — Vercel Attack Challenge Mode

**DONE 2026-11-18 — the owner enabled it for 24 hours.** Correction to the original guidance: the toggle is an *emergency switch* with a maximum duration of **24 hours** (1h / 24h options) — it auto-expires and can be re-enabled any time. It is NOT a permanent setting; the permanent layer is the code-level rate limiter shipped in this issue.

What it is and where it sits:
- **Where:** at Vercel's front door (the edge network), in front of every Studio page and API — it is platform-level, not in our code.
- **Why:** during the window, Vercel challenges visitors whose traffic looks automated or abusive; bots are stopped at Vercel and never reach the code — so they can't burn YouTube quota, trigger billable Actions, or hammer the AI routes, and don't run up serverless compute. Real browser visitors pass without noticing.
- **After 24h:** it turns itself off — nothing to renew. If traffic ever looks abusive again, flip it on for another window.
- **Safe for the fleet:** the autopilot/CI workflows talk to GitHub, Neon and YouTube — never to the Studio URL — so a challenge window breaks nothing in the automation.

Related: [master-key-hardening-qa.md](master-key-hardening-qa.md) (#120), [fail-closed-sweep-qa.md](fail-closed-sweep-qa.md) (#118).
