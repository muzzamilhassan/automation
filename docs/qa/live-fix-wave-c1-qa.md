# QA — Live fix wave C1 (shell, login, 404, tab titles, naming)

*Built 2026-11-20 from the live test report (research/live-e2e-test-2026-11-20.md). Plain-English QA. The "Evidence" column is filled by tests run here. The live rows are for the lead to check after deploy.*

## What changed, in one line each

- **T1-12**: On Template drafts the sidebar now lights **Create**, the same place the breadcrumb starts ("Create › Templates › Drafts"). Before, it lit Inbox.
- **T1-15**: The 404 page no longer throws React error #418. The static 404 is built under the address "/_not-found", but your browser has the address you typed, so the two breadcrumbs differed. A breadcrumb guessed from the address now waits until the page is live.
- **T1-23**: On a 404, the breadcrumb and tab say **Page not found**, not the made-up address ("Does Not Exist"). The button says **Back to Today**.
- **T1-24**: `/channels/<made-up name>` now returns a real **404**. While channel names load, the breadcrumb says **Channel** instead of a guess from the address ("Quotequarry").
- **T1-16**: The **TikTok dashboard** link is gone from the sidebar. TikTok is retired.
- **T1-17 / T2-21**: Two names for this area. **Inbox** (`/tasks`) holds problems and approvals. **Alerts** (`/warnings`) is the full alert list. The Inbox heading says "Inbox", the Alerts heading says "Alerts", and the bell's link says **See all alerts →**.
- **T1-18**: The sign-in, proof and client pages no longer call `/api/overview`, so there is no red 401 in the console.
- **T1-20**: If you open `/login` while already signed in, you go straight to the page you were heading to, or to Today.
- **T1-29**: A wrong password now says "Wrong password. 4 tries left. Try again in 15 minutes if you run out." The password box is cleared.
- **T1-30**: A password made only of spaces keeps the button off. Pressing Enter in an empty box says **Enter your password**.
- **T1-25**: Each page has its own browser-tab title, such as "Today · Quarry Studio", "Channels · Quarry Studio" or "The Money Rulebook · Quarry Studio". Sign-in says "Sign in · Quarry Studio".
- **T1-26**: The footer's "v4.0 · Dreams UI" stays on one line on phones.
- **T1-27**: On phones a deep breadcrumb shows "… › Templates › Registry". The "…" goes back to the hidden parent. Desktop still shows the full trail.
- **T1-28**: Channel names in the sidebar, breadcrumb and search are in one style. ALL CAPS names show in Title Case ("The Money Rulebook"). Initials come from the main words: MR, QQ, IC, DF. The stored names are unchanged. The shared helper is `studio/lib/channel-display.mjs`.

## EARS rules

| ID | Rule |
|---|---|
| C1-1 (T1-12) | WHEN any page opens, the sidebar SHALL highlight the menu item that the breadcrumb starts with (one rule: `menuSectionFor` in `lib/breadcrumbs.mjs`). |
| C1-2 (T1-15) | The shell SHALL NOT render a breadcrumb label guessed from the URL until hydration is complete. The server HTML and the first client render SHALL match on every page, including the static 404. |
| C1-3 (T1-23) | WHEN the page does not exist, the breadcrumb SHALL read "Page not found" AND the button SHALL read "Back to Today". |
| C1-4 (T1-24) | WHEN `/channels/<slug>` names no channel in brands.json (dormant brands included) or in the registry (parked and paused included), the server SHALL answer HTTP 404. IF the channel list can't be read, or the registry comes back empty, the page SHALL render normally (fail open). |
| C1-5 (T1-24) | WHILE the live channel names are loading, a channel breadcrumb SHALL read "Channel", never a name guessed from the slug. |
| C1-6 (T1-16) | The sidebar SHALL NOT link to the retired TikTok dashboard. |
| C1-7 (T2-21) | `/tasks` SHALL be called "Inbox" and `/warnings` SHALL be called "Alerts" in the menu, breadcrumb, phone bar, page headings and the bell's footer link ("See all alerts →"). |
| C1-8 (T1-18) | WHILE on a bare page (`/login`, `/proof`, `/client`), the workspace loader SHALL NOT call `/api/overview`. |
| C1-9 (T1-20) | WHEN `/login` opens AND `/api/me` says this device is signed in, the page SHALL go to `?next=` (only through `safeNextPath`) or to `/`. |
| C1-10 (T1-29) | WHEN a password is wrong, the message SHALL read "Wrong password. N tries left. Try again in 15 minutes if you run out." (15 = the login route's failure window) AND the password field SHALL be cleared. |
| C1-11 (T1-30) | The sign-in button SHALL stay disabled WHILE the password is empty or only spaces. WHEN Enter is pressed in that state, the page SHALL show "Enter your password". |
| C1-12 (T1-25) | Every page in the app frame SHALL set the tab title to "<current crumb> · Quarry Studio". The 404 SHALL use "Page not found · Quarry Studio" and sign-in SHALL use "Sign in · Quarry Studio". |
| C1-13 (T1-26) | The footer version text SHALL NOT wrap. |
| C1-14 (T1-27) | WHEN a breadcrumb has more than two crumbs, phones SHALL show "… › parent › page". The "…" SHALL link to the nearest hidden crumb. Desktop SHALL show every crumb. |
| C1-15 (T1-28) | WHEN a stored channel label is ALL CAPS, the shell SHALL show it in Title Case. Otherwise it SHALL show the label as stored. Initials SHALL be the first letters of the first two significant words, skipping "The", "of", "and" and similar. |

## QA rows

| # | What to do | What should happen | Evidence |
|---|---|---|---|
| 1 | `node --test tests/wave-c1.test.mjs` | All wave C1 pins and pure-logic tests pass | PASS: 22/22 |
| 2 | `node --test tests/channel-display.test.mjs` | Name, initials and known-slug rules pass | PASS: 7/7 |
| 3 | `node --test tests/breadcrumbs.test.mjs tests/nav-ia.test.mjs tests/static-text-sweep.test.mjs` | Updated pins pass (Drafts → Create, "Channel", "See all alerts →") | PASS except the nav-ia raw-button sentinel, which flags `app/settings/page.js:514` (Team C4's in-flight file) |
| 4 | Full suite `node --test tests/*.test.mjs` | Only T4b (and flaky T4c) plus other teams' in-flight files may fail | See the C1 report |
| 5 | Live: open `/templates/drafts` | The sidebar lights **Create**; the breadcrumb reads Create › Templates › Drafts | Lead, after deploy |
| 6 | Live: open `/does-not-exist` with DevTools open | No React #418 in the console. Breadcrumb and tab say "Page not found". The button says "Back to Today" | Lead, after deploy |
| 7 | Live: open `/channels/not-a-real-channel` | Network tab shows **404**. The 404 page shows | Lead, after deploy |
| 8 | Live: open `/channels/money-rulebook` (hard reload) | Breadcrumb shows "Channel", then "The Money Rulebook". It never shows "Money Rulebook" guessed from the URL. Tab: "The Money Rulebook · Quarry Studio" | Lead, after deploy |
| 9 | Live: look at the sidebar | No "TikTok dashboard". Names read "Quote Quarry", "Investor's Compass", "The Money Rulebook", "Debt-Free Doctrine". Marks read QQ, IC, MR, DF | Lead, after deploy |
| 10 | Live: open `/tasks`, then `/warnings`, then the bell | Headings "Inbox" and "Alerts". The bell's footer says "See all alerts →" | Lead, after deploy |
| 11 | Live, signed out: open `/login` with DevTools open | No `/api/overview` request. Tab: "Sign in · Quarry Studio" | Lead, after deploy |
| 12 | Live, signed in: open `/login?next=/runs` | Lands on Runs, not the form | Lead, after deploy |
| 13 | Live: type a wrong password | "Wrong password. 4 tries left. Try again in 15 minutes if you run out."; the box is empty | Lead, after deploy (uses one of 5 tries) |
| 14 | Live: type three spaces | The button stays off. Clear the box and press Enter: "Enter your password" | Lead, after deploy |
| 15 | Live, 390px phone: open `/templates/registry` | Breadcrumb "… › Templates › Registry". Tapping "…" opens Create | Lead, after deploy |
| 16 | Live, 360px phone: scroll to the footer | "v4.0 · Dreams UI" is on one line | Lead, after deploy |
| 17 | Live: switch between Today, Channels and Runs | The tab title changes each time | Lead, after deploy |
