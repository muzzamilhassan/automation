# QA — Live fix wave C2 (data pages)

*Built 2026-11-20 from the live test report (research/live-e2e-test-2026-11-20.md). Plain-English QA. The "Evidence" column is filled by tests run here. The live rows are for the lead to check after deploy.*

## What changed, in one line each

- **T2-13**: Analytics now uses one 28-day total. "Shorts vs long-form" is shown out of the same total as the tiles, and any views YouTube didn't sort get their own "Not sorted" row. The page header says "data through Nov 17" once, taken from the last day YouTube returned. The leaderboard says it is "Saved nightly" and that it can differ a little from the live numbers.
- **T2-14**: Watch time shows minutes under 1 hour ("24 min"), one decimal under 10 hours ("4.4 h"), and whole hours above that. It no longer rounds to "0".
- **T2-18**: A real zero shows "0". Only an unknown value shows "—". Countries with 0 views are hidden, so "ID 0" is gone.
- **T2-19**: The Analytics picker shows channel names, not QU / IN / TH codes. The leaderboard follows the picker and says which channels it shows. The Topic Desk opens on **All channels**, which lists every channel's waiting topics. Click a channel to manage it.
- **T2-20**: Today's chart chip says "YouTube · data through Nov 17", not today's date. The bars have a y-axis (the real max at the top, 0 at the bottom). Hovering a bar shows its day and value, and screen readers read each bar ("11-17: 55 views").
- **T2-26**: The six Analytics tiles sit three across until very wide screens, and the labels are shorter, so none is cut off at 1440.
- **T2-16**: If GitHub fails, `/runs` keeps showing the last good run list, either the server's copy or this tab's copy. A small line says "Couldn't refresh — showing runs from 20 Nov 13:05" and gives the reason. The wording no longer contradicts itself: a 403 reads "GitHub refused the request (403) — often a short rate limit."
- **T2-23**: Runs show plain origins: "Scheduled check", "On schedule", "You or an approval started it" and "Started on request". Heartbeat runs read "Heartbeat — checks all channels" and other batch runs read "All channels", instead of "Untagged".
- **T2-11**: Library rows without a link now say why. "Link not saved" means the Short was uploaded but the engine kept only its title, and a **Find on YouTube** button searches for it. "Scheduled" means it is not live yet.
- **T2-17**: The Library count says what renders: "Showing 24 of 86" on phones and in the grid, and "86 videos · 25 per page" on the desktop table.
- **T2-24**: The Library's channel, type, status and view filters are kept in the URL. Each change is a new history step, so Back returns to the previous filter. Typing in search does not add history steps.
- **T1-17 (part)**: Finished drills ("DRILL 2: simulated revoked token") no longer appear in the Inbox's "Recently resolved".
- **T2-22**: Each report in the Reports card shows its real date, read from the file name. When the newest report is more than 2 days old, the card says "Last report: Sep 19 — new daily reports aren't being saved here right now" and shows a "not current" chip.

## EARS rules

| ID | Rule |
|---|---|
| C2-1 | The Analytics page SHALL show one 28-day view total. The Shorts/long-form split SHALL add up to that total, and any remainder SHALL be named "Not sorted". |
| C2-2 | The Analytics header SHALL state "data through <date>" once, from the last day YouTube Analytics returned. |
| C2-3 | The leaderboard SHALL be labelled as a nightly snapshot that can differ from the live numbers. It SHALL show only the picked channel when one is picked. |
| C2-4 | WHEN watch time is under 1 hour, it SHALL show in minutes. WHEN it is under 10 hours, it SHALL show one decimal. Otherwise it SHALL show whole hours. |
| C2-5 | A known zero SHALL show "0". An unknown value SHALL show "—". Countries with 0 views SHALL NOT be listed. |
| C2-6 | The Analytics and Topic Desk pickers SHALL show channel names with "All channels" first. The Topic Desk SHALL open on "All channels". |
| C2-7 | Today's chart chip SHALL name the last day with data, never the fetch date. Every bar SHALL expose its day and value to hover and to screen readers, and the chart SHALL show its max value. |
| C2-8 | WHEN GitHub fails AND an earlier good run list exists (on the server or in this browser tab), `/runs` SHALL show it with a "Couldn't refresh — showing runs from <time>" line instead of an error page. |
| C2-9 | A GitHub failure SHALL be described by what happened (refused, token not accepted, problem on GitHub's side, couldn't be reached), never as "didn't answer" for a reply. |
| C2-10 | A run with no single channel SHALL read "Heartbeat — checks all channels" or "All channels", never "Untagged". Origins SHALL use plain words. |
| C2-11 | A Library row without a link SHALL say why ("Link not saved" with Find on YouTube, or "Scheduled"). |
| C2-12 | The Library count SHALL match what renders ("Showing N of M"). Filter changes SHALL be history steps, so Back restores the previous filter. |
| C2-13 | Finished drill or test alerts (code or title starting "DRILL", or a test/drill flag) SHALL NOT be listed in the Inbox's "Recently resolved". |
| C2-14 | Each report SHALL show the date from its file name. WHEN the newest report is more than 2 days old, the card SHALL say new reports aren't being saved. |

## How to check it (plain English)

| # | Do this | You should see | Evidence |
|---|---|---|---|
| 1 | Open **Analytics** with All channels picked. | The header ends "· data through Nov 17" (or the latest day). The "Views · 28d" tile and the Shorts/long-form card ("Of the same 866 views") use the same total, and Shorts + Long-form + Not sorted add up to it. | `tests/wave-c2.test.mjs` T2-13 |
| 2 | Look at the leaderboard. | The sub-line says "All channels · Saved nightly · 28 days to Nov 18". Under the table: "Saved each night, so it can differ a little from the live 28-day numbers below." | T2-13 |
| 3 | Pick a channel in the picker. | The buttons show names (Quote Quarry, Investor's Compass…), not codes. The leaderboard shows only that channel. | T2-19 |
| 4 | Look at the "Watch time · 28d" tile, and the leaderboard's Watch hrs column. | Values such as "24 min" or "4.4 h", never a bare "0" for 0.4 h. | T2-14 |
| 5 | Look at the leaderboard Subs column and Top countries. | A channel with no new subs shows "0", not "—". No country is listed with 0 views. | T2-18 |
| 6 | At 1440px wide, look at the six tiles. | No label ends in "…". | T2-26 |
| 7 | Open **Today**, look at the "Views per day" chip, then hover a bar. | The chip reads "YouTube · data through Nov 17". A small label shows the day and views. The left edge shows the max value and 0. | T2-20 |
| 8 | Open **Topics** (`/topics`). | It opens on "All channels" with one row per channel (N waiting, ideas, next topic). Clicking a row opens that channel. | T2-19 |
| 9 | On **Runs**, find a heartbeat row. | Channel column: "Heartbeat — checks all channels". Under the workflow name: "Scheduled check · channel-autopilot.yml". The filter says "All-channel runs", not "Untagged". | T2-23 |
| 10 | Live check (lead): while GitHub returns 403 (or with the network tab blocking `/api/runs` after one good load and a reload), open **Runs**. | The run list stays, with "Couldn't refresh — showing runs from <time>. GitHub refused the request (403) — often a short rate limit." | T2-16 (source pins + `parseSavedRuns` unit test) |
| 11 | Open **Library**. | Older Shorts say "Link not saved" with a **Find on YouTube** button. The count line reads "Showing 24 of 86" on a phone or in Grid, and "86 videos · 25 per page" on the desktop table. | T2-11, T2-17 |
| 12 | In Library, pick Episodes, then Scheduled, then press Back twice. | Back goes Scheduled → Episodes → All, and stays in the Library. | T2-24 |
| 13 | Open **Inbox** (`/tasks`). | "Recently resolved" has no "DRILL …" row. | T1-17 |
| 14 | On Analytics, look at the **Reports** card. | Each file shows a date ("Sep 19 · 12 KB"). Above them: "Last report: Sep 19 — new daily reports aren't being saved here right now", with a "not current" chip. | T2-22 |

## Known limits (said out loud)

- **Approval vs. manual runs**: GitHub's run list doesn't say whether a channel run came from the owner's Run button or from an approval's resume. Both read "You or an approval started it".
- **Links not saved**: the engine records older Shorts by title and time only (`titleHistory` has no videoId; `lastVideos` keeps only the newest upload). The panel can search for them but can't link them directly until the engine saves the id. That is an engine change, so it is not made here.
- **Reports**: the reporting workflow builds a workbook every day, but only as an Actions artifact (kept 30 days) and an ntfy push. Its commit step adds `state/` and `logs/` only, so the repo `/reports` folder (the list this card reads) was last filled by hand on 2026-10-05. Engine not changed here.
- **Open drills**: an open drill still counts in the Inbox, bell and Today, because those numbers must stay identical. Only finished drills are hidden.
