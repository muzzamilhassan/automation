# QA — Retire the legacy qs_key cookie (#117)

*Built 2026-11-18. Plain-English QA. Every row executed for real before shipping.*

## The rule for this fix

The old `qs_key` cookie was a password-equivalent: a fast hash of the login password, stamped on every login, and accepted as **owner** by the panel forever — with no way to revoke it and no expiry that mattered. Worse, because it was derived from the login password, anyone holding one could guess the password itself offline. Now: only the revocable A1 session cookie (`qs_session`) counts. Old qs_key cookies stop working everywhere; logout still wipes them from old browsers.

## QA rows

| # | What to do | What should happen | Evidence / result |
|---|---|---|---|
| 1 | New pin-tests | All qs_key-retirement contracts pass | PASS — `node --test tests/qs-key-removal.test.mjs` → **9/9 pass** |
| 2 | Regression: auth/session/wizard suites | Everything green | PASS — combined run → **63/63** (incl. #116's logout suite) |
| 3 | Full repo regression | Only pre-existing failures allowed | PASS — **1372/1373**; the single failure (`T4b reportChannels`) is the same pre-existing parallel-session data drift proven on a clean tree during #116 |
| 4 | Lint the changed files | ESLint clean | PASS — `pnpm exec eslint app/api/login/route.js lib/route-auth.js proxy.js lib/auth-token.js` → exit 0 |
| 5 | A request with ONLY a qs_key cookie authenticates as nobody | getUser → null, regardless of the cookie's value | PASS — EARS-2 behavioral test over 3 values (correct hash shape, garbage, forged) |
| 6 | A valid A1 session still logs in | Signed claims resolve exactly as before (no-DB fallback = documented behavior) | PASS — EARS-3 test |
| 7 | Stale qs_key riding along with a valid A1 cookie changes nothing | A1 wins; qs_key ignored | PASS — combined-cookie test |
| 8 | Login no longer mints qs_key | No qs_key Set-Cookie; no authToken import; qs_session still set | PASS — source-scan (pattern-scoped so history comments don't trip it) |
| 9 | Proxy and getUser have no qs_key acceptance | No legacy-cookie reads; expiry check intact | PASS — source-scans on proxy.js + route-auth.js |
| 10 | Logout still clears old qs_key cookies | The clearing Set-Cookie survives | PASS — source-scan (also pinned in #116's suite) |
| 11 | Fail-closed without STUDIO_PASSWORD is preserved | No password + VERCEL set → null | PASS — EARS-5 test |
| 12 | Connect-link + session HMAC still work | hmacToken export intact and functional | PASS — 64-hex signature test; authToken + its in-repo SALT removed |
| 13 | Production build + deploy | Vercel build green, deployment READY | PASS — see issue #117 close comment for the deployment URL |
| 14 | Nothing else changed | Diff limited to 4 source files + test + QA file | PASS — named-files-only commit |

## Files in this change

- [studio/app/api/login/route.js](../../app/api/login/route.js) — stops minting qs_key; the A1 qs_session cookie is the only login credential
- [studio/lib/route-auth.js](../../lib/route-auth.js) — qs_key acceptance block deleted (with the why in a comment)
- [studio/proxy.js](../../proxy.js) — qs_key branch deleted; expired/absent A1 = plain unauthenticated
- [studio/lib/auth-token.js](../../lib/auth-token.js) — dead `authToken` + its in-repo salt removed; `hmacToken` (connect links, sessions) intact
- [tests/qs-key-removal.test.mjs](../../tests/qs-key-removal.test.mjs) — 9 pin-tests (behavioral + source scans)
- QA file: this one

## Owner follow-up (recommended, one command)

Rotate `STUDIO_PASSWORD` once (`vercel env` + local .env + redeploy). Old qs_key values are already inert (nothing accepts them), but rotating kills their value as a cracking target for the session-HMAC key too. Until you rotate, nothing breaks — existing A1 sessions keep working; new logins mint only qs_session.

## Known limits (honest)

- Browsers that only held a qs_key cookie (no A1 session) will need one fresh password login — expected, one time.
- The pre-A1 `parseSession` branch in route-auth/session.js is now provably dead (all such cookies expired ~Nov 8) but is left in place — removing it is a separate cleanup so this diff stays reviewable.
