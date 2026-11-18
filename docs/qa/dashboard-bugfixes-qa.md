# QA — Dashboard bug fixes: analytics poll URL + template-previews 503 (#119)

*Built 2026-11-18. Plain-English QA. Every row executed for real before shipping.*

## What was broken (in plain words)

1. **The dashboard's analytics widgets were empty on every normal poll.** The page asked the server for `/api/analytics?slug=all?fresh=1` — one "?" too many — so the server read the channel name as `all?fresh=1`, found nothing by that name, and answered null. Only the manual Refresh button ever showed data.
2. **A bad database URL could crash the template-previews route.** The library that opens the DB connection was created outside the error guard, so a malformed `DATABASE_URL` produced a raw crash page (500) instead of the clean "db unavailable" answer (503) the route already used for a missing URL — and a second crash on cleanup.

## QA rows

| # | What to do | What should happen | Evidence / result |
|---|---|---|---|
| 1 | New pin-tests | URL contract + both route fixes proven | PASS — `node --test tests/dashboard-bugfixes.test.mjs` → **3/3 pass** |
| 2 | Prove the old URL was the bug | Old shape parses as slug=`all?fresh=1` (server → null); new shape parses slug=`all` on both branches | PASS — behavioral test through the same `URLSearchParams` parser the route uses |
| 3 | Fresh poll still cache-busts | fresh=true → `?slug=all&fresh=1` | PASS — asserted `fresh=1` present |
| 4 | Background poll uses the cache | fresh=false → `?slug=all` only, no fresh param | PASS — asserted `fresh` absent |
| 5 | Old broken expression gone from page.js | No `: '?fresh=1'` branch remains | PASS — source scan |
| 6 | template-previews: constructor inside its own try | No top-level `const sql = postgres(`; `let sql; try { sql = postgres(url …` | PASS — source scan |
| 7 | Bad DB URL → clean 503, not 500 | Construction failure returns the same 503 `{samples:{}, error:'db unavailable'}` as missing URL (two 503 sites) | PASS — source scan |
| 8 | Query failures + success path unchanged | 502 path kept; `sql.end()` still closes the connection on every path that built one | PASS — source scan |
| 9 | Lint the changed files | ESLint clean | PASS — `pnpm exec eslint app/page.js app/api/template-previews/route.js` → exit 0 |
| 10 | Regression: auth/session/analytics suites | Everything green | PASS — combined run → **68/68** |
| 11 | Full repo regression | Only the known pre-existing failure allowed | PASS — **1381/1382**; single failure = `T4b reportChannels` (pre-existing parallel-session data drift, proven pre-existing in #116) |
| 12 | Production build + deploy | Vercel build green, deployment READY | PASS — see issue #119 close comment for the deployment URL |
| 13 | Nothing else changed | Diff limited to page.js + template-previews route + test + QA file | PASS — named-files-only commit |

## Files in this change

- [studio/app/page.js](../../app/page.js) — poll URL appends `''` (not a second `?`) when not fresh
- [studio/app/api/template-previews/route.js](../../app/api/template-previews/route.js) — constructor guarded; construction failure = 503
- [tests/dashboard-bugfixes.test.mjs](../../tests/dashboard-bugfixes.test.mjs) — 3 pin-tests
- QA file: this one

## Known limits (honest)

- The behavioral test feeds the URL through Node's parser, not a live browser; the dashboard's actual rendering was verified live during the audit crawl (all pages 200, 0 console errors) — after deploy, the poll now returns the aggregate instead of null on the same code path.
- BUG-2 (voice state clobber, from the same audit) is NOT in this issue — it was not part of the owner-approved Wave 1 item 4 scope.
