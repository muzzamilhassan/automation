# QA — Live fix wave A1 (sign-in safety, bell truth, sessions, AI routing)

*Built 2026-11-20 from the live test report (research/live-e2e-test-2026-11-20.md). Plain-English QA. The "Evidence" column is filled by tests run here; the live rows are for the lead to check after deploy.*

## What changed, in one line each

- **T1-01** — After signing in, the studio only sends you to a page **inside the studio**. A link like `/login?next=//example.com` now lands on Today instead of another website.
- **T1-14** — The sign-in page only shows its own fixed messages. `/login?error=<any text>` no longer prints that text.
- **T1-02** — When the alerts check fails, the bell says **"Can't check alerts right now — status unknown"** with a **Retry** button. It never says "Nothing needs attention" unless the check worked.
- **T1-10** — If your session was revoked (signed out elsewhere, or by the owner), the studio sends you to the sign-in page with **"You were signed out — please sign in again."** It no longer shows a broken, empty app.
- **T5-03** — Sessions now mark **"this device"** on the right row (Sessions page and Settings › Security), and revoking your own device warns you first.
- **T3-11** — AI routing changes (↑ / ↓ / Add / Remove) are **drafts** until you press **Save** and confirm. For the all-channels default the button says **"Save for all channels"**.
- **T3-27** — AI routing uses plain words: no "prio 100", no `effective: …` code line, no key names in the Add list.

## EARS rules

| ID | Rule |
|---|---|
| A1-1 | WHEN sign-in succeeds, the studio SHALL go to `?next=` only if it is a same-origin path (one leading `/`, not `//` or `/\`, no scheme, no control characters, also after decoding); otherwise it SHALL go to `/`. |
| A1-2 | WHEN `/login?error=` holds a known code (`signed_out`, `google_expired`, `google_failed`, `not_invited`), the page SHALL show that code's fixed message; for any other value it SHALL show nothing. |
| A1-3 | The Google sign-in callback SHALL send only those known codes, never free text. |
| A1-4 | WHEN the alerts check failed, the bell list SHALL say "Can't check alerts right now — status unknown" with Retry, and SHALL NOT show the all-clear. |
| A1-5 | The bell SHALL show the "owner/staff" note only when the check answered "not allowed" (401/403); "Nothing needs attention" only after a successful check with zero alerts. |
| A1-6 | WHEN `/api/me` answers 401 inside the app frame, the browser SHALL go to `/login?next=<this page>&error=signed_out`. It SHALL NOT do this on `/login`, `/proof` or `/client`. |
| A1-7 | The signed-in user SHALL carry both `id` and `session_id` (the same sessions row id), so `/api/sessions` returns the real `current` row. |
| A1-8 | Settings › Security SHALL mark the current row "this device"; the Sessions page already marks it and warns before revoking it. |
| A1-9 | WHILE editing AI routing, ↑ / ↓ / Add / Remove SHALL change only the screen; nothing SHALL be saved until Save is pressed AND confirmed. |
| A1-10 | WHEN switching between "This channel" and "All channels" with unsaved changes, the panel SHALL ask before discarding them. |

## QA rows

| # | What to do | What should happen | Evidence |
|---|---|---|---|
| 1 | `node --test tests/safe-next.test.mjs` | All open-redirect cases pass | PASS — 8/8 |
| 2 | `node --test tests/wave-a1.test.mjs` | All wave A1 pins and pure-logic tests pass | PASS — 21/21 |
| 3 | Full suite `node --test tests/*.test.mjs` | Only the known T4b (and flaky T4c) may fail | See the A1 report |
| 4 | Live: sign out, open `/login?next=//example.com`, sign in with the password | You land on Today, not example.com | Lead, after deploy |
| 5 | Live: open `/login?next=/channels` and sign in | You land on Channels | Lead, after deploy |
| 6 | Live: open `/login?error=Call+this+number` | No red text under the form | Lead, after deploy |
| 7 | Live: block `/api/warnings` (DevTools → block request), reload, open the bell | "Can't check alerts right now — status unknown" + Retry; badge shows "?" | Lead, after deploy |
| 8 | Live: on device A open Settings › Security — check the "this device" chip; revoke device A from device B's Sessions page; reload any page on device A | Device A lands on sign-in with "You were signed out — please sign in again." | Lead, after deploy |
| 9 | Live: Sessions page — the row for this browser shows "this device"; press Revoke on it | The confirm says "This is YOUR current device — you will be signed out." | Lead, after deploy |
| 10 | Live: /providers → move a provider ↑ | Row moves, "not saved" chip + "Save for all channels" bar appear; reload → the old order is back (nothing was saved) | Lead, after deploy |
| 11 | Live: press "Save for all channels" → Cancel, then Save → confirm | Cancel writes nothing; confirm saves and shows "Saved for all channels." | Lead, after deploy |
| 12 | Live: a channel's AI routing drawer → edit, then switch to "All channels (default)" | "Discard unsaved changes?" asks first | Lead, after deploy |

## Files

- `studio/lib/safe-next.mjs` (new) — `safeNextPath`, `isBarePath`, `signedOutLoginUrl`
- `studio/lib/login-errors.mjs` (new) — the known `?error=` codes and their fixed messages
- `studio/lib/route-draft.mjs` (new) — draft helpers for AI routing (`chainIdsFor`, `moveInDraft`, `planChainSave`, `sameOrder`)
- `studio/app/login/page.js` — uses both helpers
- `studio/app/api/auth/google/callback/route.js` — sends codes instead of free text (the not-invited email is now logged server-side instead of shown)
- `studio/components/shell/AppShell.js` — bell status/retry, signed-out redirect, shared bare-page list
- `studio/lib/session-db.js` — `sessionUserFromRow` returns `id` and `session_id`
- `studio/app/settings/page.js` — "this device" chip on Security › active sign-ins
- `studio/components/ProviderRoutingPanel.js` — draft + Save + confirm; plain words
- Tests: `tests/safe-next.test.mjs`, `tests/wave-a1.test.mjs`; pins updated in `tests/channels-drawers.test.mjs` and `tests/panel-safety-audit.test.mjs` (the confirm moved from Remove to Save)

## Known limits (honest)

- The signed-out check adds one small `/api/me` call when the app frame first loads (the account menu makes its own). It runs once per full page load, not on every click; pages using `apiFetch` still catch a revoke mid-session.
- If the database briefly fails while checking your session, the server already answers 401, so you would be sent to sign in. That is existing server behaviour (route-auth), not changed here.
- Google sign-in still always lands on Today — it never carried `?next=`, so there was nothing unsafe to follow.
- AI routing drafts are lost if the drawer is closed without saving (same as the other drawers; T3-05 covers that).
