# QA — Live fix wave C4 (settings, team, users, sessions, AI usage, Create, registry detail)

*Built 2026-11-20 from the live test report (research/live-e2e-test-2026-11-20.md). Plain-English QA. The "Evidence" column is filled by tests run here; the live rows are for the lead to check after deploy.*

## What changed, in one line each

- **T5-06:** Create's "Rendered videos" only lists real render jobs: a folder counts as a job only if it has its own `status.json`, so the nested `hf-out/tech/` folder is gone. If GitHub can't be read, the page says "Couldn't check rendered videos right now (GitHub 502). Try Refresh in a minute." instead of quietly showing nothing. A job whose status can't be read shows "Status unknown" with a Refresh button, not a spinner that never stops.
- **T5-07:** Every sign-in time on Settings › Security, Sessions and Users uses one format in your own time zone, labelled: "7:38 pm your time" today, "Nov 19, 9:05 am your time" on other days.
- **T5-08:** "Active sign-ins" no longer stops at 20 without saying so. It shows the first 20 and then "Showing 20 of 40 — See all". Devices read "Chrome on Windows", "Safari on iPhone", "Script (curl)" instead of a raw user-agent. The full text is in the tooltip.
- **T5-09:** Team members (not owners) have a role picker, staff or client. Changing it asks first, then signs them out so the new role applies when they sign back in. The last owner can never be demoted or removed. The help text now says what's true: "Ask Claude to add another owner." The invite form has an optional Name field.
- **T5-10:** The API trims a name to 60 characters, stores it, and sends back the same stored value. The Name field won't take more than 60.
- **T5-11:** The Accounts count under Team updates straight after you add, remove or re-role someone.
- **T5-12:** On /users, channels with no owner email are the owner's own, so the owner card lists all the owner's channels and the "no owner assigned" box is empty. "Client channels" counts only channels bound to client accounts (0 today, not 1). API keys come from the same vault file `/providers` reads, per channel: "The Money Rulebook: gemini, groq, openrouter, pexels, pixabay". /users has a real `<h1>`.
- **T5-13:** The usage page is now "AI usage" because it shows AI calls and tokens only. No existing API reports today's YouTube upload quota use. Calls not tied to a channel ("web-message", none) are grouped under one "Other" row. Under the tiles: "29 of 129 calls failed · most often groq — HTTP error (16)".
- **T5-17:** `/templates/registry/detail` with no id says "Pick a template from the registry" with a link back. It no longer says `"" has no registry metadata`.
- **Orphan draft previews:** The Drafts Inbox only shows previews attached to draft files that exist on this deploy. The Registry page never reads previews. So the 5 leftover `draft-*` rows can't show on either page. No data was deleted. The ids are listed below for the lead to clean up.

## EARS rules

| ID | Rule |
|---|---|
| J1 | WHEN GitHub answers non-OK for the `hf-out` listing, the job reader SHALL throw "Couldn't check rendered videos right now (GitHub <status>)" and SHALL NOT return an empty list or cache the failure. |
| J2 | WHEN `hf-out` does not exist (404), the job list SHALL be empty. |
| J3 | A folder in `hf-out` SHALL count as a job only when its own `status.json` exists. |
| J4 | WHEN a job's `status.json` can't be read for another reason, the job SHALL be listed with state `unknown`. |
| J6 | WHILE a job's state is `unknown` (or not recognised), Create SHALL show "Status unknown" and a Refresh button, and SHALL NOT show a spinner. Spinners are only for `queued`. |
| S1 | Session lists SHALL show a readable device made from the stored user-agent ("Chrome on Windows"; scripts as "Script (…)"). |
| S2 | Session and last-action times SHALL use one format in the viewer's own time zone, ending in "your time". |
| S3 | WHEN there are more sign-ins than shown, the list SHALL say "Showing N of M" with a "See all" control. Rows SHALL NOT be hidden silently. |
| T1 | The team API SHALL clean the name (no control characters, single spaces, at most 60 characters), store that value, and return the same value. |
| T2 | A role change SHALL be staff ↔ client only, and SHALL be refused for the last owner. |
| T4 | Each non-owner member SHALL have a role picker. A change SHALL ask through `useConfirm` before it is sent. |
| T6 | WHEN a member is added, removed or re-roled, the Users section's counts SHALL refresh without a reload. |
| U1 | A registry channel with no owner email SHALL belong to the owner account(s). Only a channel naming an email that isn't on the team SHALL show as "no owner assigned". |
| U2 | "Client channels" SHALL count only channels bound to client accounts. |
| U3 | A user's API keys SHALL be read per owned channel from the same vault file and decrypt that `/providers` uses. The response SHALL contain provider names only. |
| G1 | Usage rows whose key is not a registry channel SHALL be shown as one "Other" row that names what it holds. |
| G2 | WHEN calls failed, the page SHALL show "F of N calls failed · most often <provider> — <reason> (<count>)". |
| R1 | WHEN the registry detail has no `?template=`, the page SHALL say "Pick a template from the registry" with a link back, and SHALL NOT fetch. |
| R2 | The Drafts and Registry pages SHALL NOT read `/api/template-previews`. Draft previews SHALL come only attached to existing draft files. |

## QA rows

| # | What to do | What should happen | Evidence |
|---|---|---|---|
| 1 | `node --test tests/wave-c4.test.mjs` | All C4 rules pass | PASS — 31/31 |
| 2 | Full suite `node --test tests/*.test.mjs` | Only the known T4b (and flaky T4c) may fail | 2130/2146: T4b, T4c, and 14 in wave-c2 + channels-drawers (C2/C3 in-progress files, none touched here) |
| 3 | Live: open /create | "Rendered videos" has no "tech" card and no card spinning forever | Lead, after deploy |
| 4 | Live: Settings › Security & Sessions | Your sign-ins show "Chrome on Windows"-style names and times like "7:38 pm your time"; the All sessions table below uses the same format | Lead, after deploy |
| 5 | Live: same tab, with more than 20 sign-ins | Under the list: "Showing 20 of 40 — See all"; clicking See all shows them all | Lead, after deploy |
| 6 | Live: Settings › Team & Access | Name field (stops at 60 characters); help text ends "Ask Claude to add another owner."; owner row shows an "owner" chip and no picker | Lead, after deploy |
| 7 | Live: add a test member (staff), then change them to client → Cancel | Nothing changes | Lead, after deploy |
| 8 | Live: change them to client → Make client | The row shows client; the Accounts count below matches without reload; then remove the test member and the count drops again | Lead, after deploy |
| 9 | Live: /users | Big "Users" heading; owner card lists Debt-Free Doctrine, Investor's Compass, The Money Rulebook, Quote Quarry and YT-BOT; "Client channels" = 0; API keys shows "The Money Rulebook: gemini, groq, openrouter, pexels, pixabay"; no "no owner assigned" box; Last action time ends in "your time" | Lead, after deploy |
| 10 | Live: /usage | Title "AI usage"; a line under the tiles like "29 of 129 calls failed · most often groq — HTTP error (16)"; By channel has an "Other (web-message)" row, not a "web-message" channel | Lead, after deploy |
| 11 | Live: open `/templates/registry/detail` (no `?template=`) | "Pick a template from the registry" with "Back to the registry" | Lead, after deploy |
| 12 | Live: Templates › Drafts | Inbox is empty and shows no leftover sample cards | Lead, after deploy |

## Orphan draft preview rows (not deleted — for the lead)

All five have an approved twin with its own render under the bare id, so the gallery never uses them:

- `draft-night-signal-storybook`
- `draft-iron-five-storybook`
- `draft-marble-quill-storybook`
- `draft-full-current-storybook`
- `draft-old-banners-storybook`

## Not changed here (other teams' files)

- `studio/components/shell/nav.js` line 81 (C1): `label: 'Quota & costs'`, `desc: 'YouTube quota and AI spend'` → suggested `label: 'AI usage'`, `desc: 'AI calls, tokens and failures'`.
- `studio/app/network/page.js` line 14: `label: 'Quota & Costs'` → `'AI usage'`.

## Files

- `studio/lib/hf-jobs.mjs` (readJobs, JOBS_UNREACHABLE), `studio/app/create/page.js`
- `studio/lib/session-view.mjs` (new), `studio/lib/session-db.js`, `studio/app/settings/page.js`, `studio/app/sessions/page.js`
- `studio/lib/team-rules.mjs` (new), `studio/app/api/team/route.js`
- `studio/lib/users-view.mjs` (new), `studio/app/api/users/route.js`, `studio/app/users/page.js`
- `studio/lib/usage-view.mjs` (new), `studio/app/api/usage/route.js`, `studio/app/usage/page.js`
- `studio/app/templates/registry/detail/page.js`
- `tests/wave-c4.test.mjs` (new)
