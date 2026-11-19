# QA — Feedback round 1: a much simpler home ("Today") page

*Owner items B + D (home part), 2026-11-19. Evidence: tests/home-simple.test.mjs + the updated home pins in tests/cockpit-verdict.test.mjs, tests/static-text-sweep.test.mjs (R3), tests/phase0-truth.test.mjs, plus the full suite.*

**What this change is, in one line:** the home page now shows only three things: one line that says whether anything needs you, one short row per channel for today, and the views chart. Everything else moved to the Analytics page. Nothing was deleted.

## Acceptance criteria (EARS)

- **H1** WHEN the home page loads, THE studio SHALL show only three things, in this order: the one-line verdict, the channel list for today, and the views chart.
- **H2** WHEN something needs the owner, THE studio SHALL show "N things need you" on one line, with a link to `/warnings` when there are open problems (or to `/review` when the only thing waiting is a script approval).
- **H3** WHEN a source can't be checked (warnings, approvals or channels), THE studio SHALL say the status is unknown and that it is not an all-clear, with a Retry button. It SHALL never say "All good" in that case.
- **H4** WHILE a client (non-owner/staff) is signed in, THE studio SHALL NOT show any problem or warning on home. The verdict never counts warnings for them.
- **H5** THE home page SHALL NOT render a list of warnings. The "Needs attention" card is gone. Problems are listed only in the bell and on the Inbox page.
- **H6** WHEN channels are listed on home, THE studio SHALL show one compact row per live channel with: name, today's state (made today / waiting for first slot / not run / paused / can't reach YouTube), a "poster" or "episode" mark only when that was made today, and the next upload slot. Each row opens that channel's page. There is no second table repeating the same channels.
- **H7** THE home page SHALL keep the "Views per day" chart with its honest coverage chip ("YouTube", "N of M channels", or "YouTube unavailable · Retry"). When YouTube Analytics doesn't answer, it says unavailable, never zero.
- **H8** WHEN the owner opens Analytics, THE studio SHALL show the lifetime totals that used to be on home and are not already on Analytics (all-time YouTube views, total videos), next to the existing subscriber total. Facebook and Instagram followers stay in the existing "Audience split" card, so they are not shown twice.
- **H9** WHEN the owner opens Analytics, THE studio SHALL show "Today's researched topics" and "Trend radar" (moved from home), following the channel picker at the top of the page.
- **H10** WHEN the overview can't load on Analytics, THE studio SHALL show "—" for the moved totals and "unavailable" for topics and trends. It SHALL never show a fake 0 or "no trends yet".
- **H11** THE home page SHALL NOT have the "Pulse & Production / Deep Analytics (28d)" tabs. Deep Analytics is the Analytics page in the menu, which already showed exactly that content.

## Plain-English QA checklist

| # | What to check | How to check it | Result |
|---|---|---|---|
| H1 | Home shows just 3 things: verdict line, channel rows, views chart | Open Today. Scroll. No KPI tiles, no production table, no topics, no trend radar, no tabs | |
| H2 | "N things need you" links somewhere useful | With an open alert: the line has a "See what" link that opens Alerts (/warnings). With only scripts waiting: it opens Script approvals | |
| H3 | Unknown never looks like all-clear | Turn the DB off (or block /api/warnings): the line says "status unknown … not an all-clear" with Retry | |
| H4 | Clients see no problems | Sign in as a client: the line never mentions problems/warnings | |
| H5 | No warning list on home | With open warnings, home shows only the count line. The list is in the bell and Inbox | |
| H6 | One row per channel, no duplicates | Each live channel appears once: mark, name, state chip, poster/episode mark if made today, "next HH:MM UTC · in Xh". Click a row and the channel page opens | |
| H7 | Views chart is honest | Chart shows the last 14 days. The chip says YouTube / N of M / unavailable. On failure the text says "unavailable", not 0 | |
| H8 | Lifetime totals moved to Analytics | Analytics: "Views · all time" and "Videos · total" tiles next to "Subscribers · total". FB/IG followers are in "Audience split" | |
| H9 | Topics + trend radar moved to Analytics | Analytics bottom: "Today's researched topics" and "Trend radar". Pick one channel at the top and both show only that channel | |
| H10 | Analytics stays honest on failure | Block /api/overview: totals read "—", topics/trends read "unavailable" | |
| H11 | No home tabs | Home has no tab bar. Analytics in the menu shows the 28-day analytics as before | |
