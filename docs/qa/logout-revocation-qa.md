# QA — Sign Out revokes the current session (#116)

*Built 2026-11-18. Plain-English QA. Every row executed for real before shipping — the evidence column says what actually happened.*

## The rule for this fix

Pressing **Sign Out** must kill your session on the server, not just in the browser. Before this fix, Sign Out cleared the browser cookies but the session row in Neon stayed valid for its full 30 days — anyone holding a copy of the cookie (a log, a synced browser profile) could keep using the panel for a month after you signed out. Now the server row is revoked the moment you sign out.

## QA rows

| # | What to do | What should happen | Evidence / result |
|---|---|---|---|
| 1 | New pin-tests | All logout-revocation contracts pass | PASS — `node --test tests/logout-revocation.test.mjs` → **8/8 pass** |
| 2 | Regression: session/auth/wizard suites stay green | session-admin (13) + route-roles + thumbs-auth + wizard suites | PASS — combined run → **54/54 pass** |
| 3 | Full repo regression | Only pre-existing failures allowed | PASS — **1363/1364**; the single failure (`T4b reportChannels`) also fails on a clean tree (verified via `git stash`) — parallel-session data drift (`yt-bot` slug in report data), not this change |
| 4 | Lint the changed files | ESLint clean | PASS — `pnpm exec eslint lib/session-db.js lib/session.js app/api/logout/route.js` → exit 0 |
| 5 | A real A1 (dotted) cookie gets revoked | The stub sessions row keyed by SHA-256 of the opaque token flips to revoked | PASS — EARS-1 test: signed cookie → row flipped; the UPDATE targets the hash, never raw cookie text |
| 6 | A tampered cookie (swapped HMAC) revokes nothing | No SQL issued; function returns false | PASS — EARS-1 tamper test: forged body+mac pair rejected |
| 7 | Legacy bare tokens still work | Dot-less values revoke directly, exactly like the old route | PASS — EARS-2 test incl. dot-less garbage (harmless no-match UPDATE, same as before) |
| 8 | Garbage cookies never break logout | Missing/empty/malformed → no SQL, no throw | PASS — EARS-3 test over null/undefined/''/spaces/'%zz'/'a.a.a.' |
| 9 | After revocation the same cookie fails auth | The revoked flag is what `userByToken` checks | PASS — the stub flips `revoked`; `userByToken` (existing logic, untested here) rejects revoked rows |
| 10 | Cookies are still always cleared | qs_key + qs_session Set-Cookie lines fire even when revocation throws | PASS — source-scan: clearing happens outside the try block (pin-tested) |
| 11 | Logout needs no login | No requireRole/getUser in the route | PASS — source-scan pin test |
| 12 | The old bug can never return | Route must not contain the dot-gate or a direct revokeToken call | PASS — source-scan asserts `includes('.')` and `revokeToken(` are gone |
| 13 | Production build + deploy | Vercel build green, deployment READY | PASS — see issue #116 close comment for the deployment URL |
| 14 | Nothing else changed | Diff limited to the two lib files, the route, the test, this QA file | PASS — commit contains exactly those 5 files (named-files-only rule) |

## Files in this change

- [studio/lib/session-db.js](../../studio/lib/session-db.js) — new `revokeSessionFromCookie(cookieVal, dbClient?)`: parses the dotted A1 cookie (HMAC-verified) and revokes by `claims.t`; bare tokens revoked directly; injectable client for tests
- [studio/app/api/logout/route.js](../../app/api/logout/route.js) — calls the new function; the buggy dot-gate removed; header comment now tells the truth
- [studio/lib/session.js](../../studio/lib/session.js) — one-line import fix (`'./auth-token'` → `'./auth-token.js'`) so the lib resolves under plain node (same fix as #113); no behavior change
- [tests/logout-revocation.test.mjs](../../tests/logout-revocation.test.mjs) — 8 pin-tests (real signed cookies + stub sessions table + route source-scan)
- QA file: this one

## Known limits (honest)

- If `STUDIO_PASSWORD` is unset, the dotted cookie can't be parsed (no HMAC key) and revocation is skipped — but sessions can't be created without a password either, so there is nothing to revoke.
- If Neon is down at the moment you press Sign Out, the browser cookies are still cleared (you're out on that device), but the row revocation is skipped — a copied cookie could survive until the DB returns. Closing that DB-outage gap is SEC-3, a separate issue in this wave.
- Sign Out still signs out only the current device. "Sign out everywhere" (Settings → Sessions) remains the all-devices kill switch.
