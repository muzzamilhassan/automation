# 03 — Dashboard & Data-Viz Audit (Overview + Analytics)

Lens: the Overview (home) dashboard and the Analytics page — KPIs, charts, data density, and whether the numbers can be trusted.
Evidence: `shots-full/page-home--{desktop,tablet,mobile}.png`, `page-analytics--{desktop,mobile}.png`, plus `studio/app/page.js`, `studio/app/analytics/page.js`, `studio/components/charts.js`, `studio/components/ui.js`, `studio/app/api/analytics/route.js`, `studio/app/api/overview/route.js`, `studio/components/shell/AppShell.js`, `studio/lib/site-data.js`.
Everything here was read only. No files were changed apart from this report.

---

## 1. Plain-English summary for the owner

- **The dashboard says things that aren't true.** The "Views per day" chart is blank and every channel shows **0 views** next to a green **"real data"** badge. If YouTube didn't answer, the panel has no way of telling you. The sidebar always shows **"3"** on Studio and **"1"** on Operations, and the top bar always says **"Engine live"**. All three are typed into the code, so they never change. The Operations "1" sits right beside a card that says "0 open warnings".
- **The page doesn't answer your three morning questions in order:** did everything upload, is anything broken, what's growing. The top row is lifetime totals (241 subs, 90K views, 823 videos), which barely move from day to day. The answer to "did it upload?" is half-way down the page, and it says "queued", not "published". That "queued" count isn't even checked against today's date.
- **The "Average watched" panel shows numbers from September 19 as if they were current.** They are typed into the code. The "smoking gun" note states them as fact, and YT-BOT is missing from the panel.
- **The Analytics page opens with two large empty boxes** ("No snapshots yet", "fills as Phase 4 S4 lands"), then four zeros. Further down, a table says viewers found you by searching "personal finance" 48 times. Both are labelled "real data", but they can't both be right.
- **The fix is mostly about honesty and order, not new features.** Every number should carry its source and how old it is. Failures should say what failed. Empty states should say why they're empty. The home page should be reordered as: upload status, problems, growth, then tomorrow's plan.

---

## 2. Findings table

| ID | Sev | Page / component | Evidence | Problem | Recommendation |
|---|---|---|---|---|---|
| DV-01 | **P0** | Home: Views per day | `page-home--desktop.png` (empty 200px area plus five "0 views · 28d" tiles); `app/page.js:157` `right={<Chip tone="ok">real data</Chip>}`; `app/page.js:164` renders `MiniBars` with `data=[]`; `charts.js:254-268` draws nothing for an empty array | The chart is blank with no message, every channel tile says **0**, and the badge is a green "real data". The badge never changes, whatever the result. A blank chart under a "real data" badge is the worst failure state a dashboard can have, because it looks like a real result of zero. | Pick one of three states and render it. **Live:** show the bars, with "data through Nov 15" on the badge. **Partial:** amber "3 of 5 channels reporting", with the missing channels named. **Failed:** red "YouTube Analytics unreachable · last good pull 06:12", with a Retry button. Never show `0` for a channel whose fetch failed. Show `—` with a "no data: re-auth" link instead. |
| DV-02 | **P0** | `/api/analytics` (powers both pages) | `api/analytics/route.js:138-140` catches each channel's error and fills in zero totals; `:162` drops failed channels from `slim`; `:127-176` the `all` payload has **no error field** | When a channel's token or quota fails, the error is quietly turned into a zero. The UI cannot tell "no views" apart from "couldn't ask", and the failure is cached for an hour (`:122`). This is the root cause of DV-01 and DV-05. | Add `all.coverage = { ok: [...slugs], failed: [{slug, error}] }` and a `fetchedAt` time. Don't cache a result where every channel failed, or cache it for 60s at most. The UI reads `coverage` to choose the state from DV-01. |
| DV-03 | **P0** | Shell: sidebar badges and the "Engine live" pill | `AppShell.js:148-156` typed-in `3` (Studio) and `1` (Operations); `AppShell.js:370-372` a green "Engine live" with nothing behind it; `page-home--desktop.png` shows "Operations 1" while the Needs-attention card says "0 open warnings" | Badges and a health pill that don't reflect anything break the owner's trust in every other number on the page. They contradict the live warnings count (#126) on the same screen. This also goes against the "never a fake number" rule (`AppShell.js:239`) and the no-static-maps directive. | Operations badge = `openWarningRows.length` (hidden when 0). Studio badge = number of review-queue items pending, or remove it. "Engine live" should come from the last pipeline run's age: green under 26h, amber 26–48h, red over 48h or last run failed, with the run time in a tooltip. |
| DV-04 | **P0** | Analytics: Average watched (retention) | `lib/site-data.js:8-14` a typed-in `RETENTION` list (Sep-19 audit); `analytics/page.js:102-113` falls back to it; `:317` "The smoking gun: …"; `page-analytics--desktop.png` | Two-month-old numbers are drawn as full bars beside live numbers, with only a small amber "partly live" badge to tell them apart. The insight copy states the old numbers as fact. YT-BOT isn't in the list, so the panel can never be fully live for 5 channels. This is a typed-in data map, which the owner's no-static-maps directive forbids. | Delete `RETENTION`. Bars come only from the live `avgWatched`. A channel with no live value gets a dashed empty bar labelled "no data — needs analytics scope". If any baseline is kept, draw it as a hollow tick labelled "Sep 19", not as a filled bar. Write the insight only from live values. |
| DV-05 | **P0** | Analytics: KPI row vs search terms | `page-analytics--desktop.png`: "Views · 28 days **0**", "Watch time **0**", "Subs gained **0**", yet "personal finance **48** views" with a green "real data" badge; `analytics/page.js:296-298` uses `?? 0`; `:461` typed-in badge | Two panels on the same screen contradict each other, and both claim to be real. The KPIs show `0` when the fetch failed (`real` undefined → `?? 0`). | When `real` is missing or `coverage.failed` covers every channel, KPIs show `—` with an "unavailable" note, not `0`. Each panel's badge states its source and age, for example "CI engine · Nov 17" or "YouTube API · through Nov 15". |
| DV-06 | **P1** | Home: Today's production line | `app/page.js:240-243` "N queued"; `api/overview/route.js:78` `todayVideos: (s.lastVideos||[]).length` (never compared to today's date); `page-home--desktop.png` | "Shorts today: 1 queued" counts the *last* run's videos, which may be yesterday's. "Queued" doesn't answer "did it go live on YouTube?". The Episode column shows **2026-11-16** in a green "ok" badge although it's 2 days old (`page.js:253`). The Poster column is "—" on every row, so it carries no information. | Columns: **Channel · Today's Short (Published 18:05 ✓ / Scheduled 22:35 / Failed ✗ / Not run) · Episode (Published / due Thu) · Next upload (local time + countdown)**. Only count `lastVideos` when `lastRun === today`. Colour the Episode date by age: green today, neutral 1–6 days, amber when overdue against `docDays`. Hide Poster unless a channel actually posts one. |
| DV-07 | **P1** | Home: information order | `page-home--desktop.png` (first screen = greeting, tabs, 5 lifetime KPIs, an empty chart, an empty "Needs attention" box) | The first 5 seconds go on lifetime totals that barely change and on empty boxes. The two most useful answers, upload status and failures, are below the fold or hidden. "Today's researched topics" and "Trend radar" take up 45% of the page height, but they're inputs to the machine and the owner doesn't act on them each morning. | Use the wireframe in §3.1: status strip, then exceptions, then growth, then the upcoming plan. Move topics and trend radar to Studio → Topic Desk, or collapse them into one "Today's topics" disclosure. |
| DV-08 | **P1** | Home: KPI tiles | `app/page.js:143-147`; `page-home--desktop.png` "YT VIEWS 90K **+0%**"; `page.js:100-102` | The **90K** is all-time views (from the channels list), but the delta is *last day vs the day before* from a different 28-day source. The chip is a green **"+0%"** when the day before is 0 (`prev ? … : 0`). The last days are also always incomplete, because analytics take 48–72h to settle (noted in `analytics/page.js:29` but ignored here), so the delta always reads low. The Videos tile (823) and IG tile (3) are lifetime numbers that don't lead to any action. | KPI = **change over 7 days vs the previous 7 days, using settled days only**: "Views (7d) 4.1K ▲12% vs prev 7d", "Subs gained (7d) +38", "Uploads this week 26/28 planned", "Failed runs (7d) 0". Put lifetime totals in a small footer line (one already exists at `page.js:326`). Hide the delta when the comparison base is 0 or missing. Never show green "+0%". |
| DV-09 | **P1** | `/api/analytics` daily window | `api/analytics/route.js:38` `endDate = today` | The last 2–3 bars of every daily chart are near zero because YouTube hasn't processed those days yet. It looks like views are dropping every single morning. | Set `endDate = today − 3d` for the headline. If the recent days are drawn, show them as hatched or 30% opacity "settling" bars, with a legend line: "Last 3 days still processing". |
| DV-10 | **P1** | Home: Needs attention | `app/page.js:187-207`; `page-home--desktop.png` (a 1/3-width card, ~400px tall, mostly empty) | When everything is fine, it uses a third of the first screen to say "nothing". When things are wrong, it only knows about `/api/warnings`. It misses YT-BOT "not run today" (shown amber in the table below), analytics re-auth needed (`analytics/page.js:258`, only on Analytics), YouTube API errors (`c.yt.error`, `route.js:74`) and paused flows (`flowPaused`, `route.js:81`). | One **Exceptions** list that combines warnings, channels not run or failed today, re-auth needed, YouTube read errors, and paused flows. Sort by severity, give each a one-click fix ("Re-auth", "Run now", "Open log"). When it's empty, collapse it to a single green line in the status strip: "✓ No issues". |
| DV-11 | **P1** | `charts.js` MiniBars (the only chart in use) | `charts.js:254-268`; `page-analytics--desktop.png` | No y-axis, no gridlines and no value labels, so the bars can't be read as numbers. The height is also encoded twice through opacity (`0.32 + 0.68·v/max`), so low days nearly disappear and look "disabled". A 4px minimum height makes zero days look like small positive values. Tooltips use `title=` only, which keyboard and touch users can't reach, and there is no `role`/`aria-label`. 28 labels at 9px crowd together. Empty `data` renders nothing (DV-01). | Fixed opacity. Zero = a 1px baseline tick, not 4px. Add three light gridlines with compact labels (0 / 2K / 4K) and direct-label the max and the latest bar. Label every 7th day ("Nov 4", "Nov 11"…). Wrap the chart in `role="img" aria-label="Daily views, Oct 22–Nov 15, peak 1.2K on Nov 9"` and add a visually hidden data table. Use a focusable or hover tooltip component, not `title`. Built-in empty, loading and error slots. |
| DV-12 | **P1** | `charts.js` MultiChart (unused, but kept "for later") | `charts.js:61-62` `max = Math.ceil(rawMax / 4 / 500) * 500`; `charts.js:63,80,113` divide by `labels.length - 1`; `charts.js:89` gradient id `ag-${s.key}` is global | The y-scale is wrong. With rawMax = 2,000 it computes max = 500, so the lines are drawn 4× off the top. Any data above about 2,000 goes off-chart. One label means a division by zero (NaN paths). Two charts on one page share gradient ids. `app/page.js:162` warns never to bring it back after a crash (a7c4a8c). These bugs are a likely contributor. | Either delete MultiChart and Donut (both unused) or fix them: `step = niceStep(rawMax/4); max = step*4`, guard `labels.length < 2`, use `useId()` for gradient ids. Choose one maintained chart approach (see Bigger bets) instead of three half-finished hand-made SVGs. |
| DV-13 | **P1** | Analytics: page order and empty states | `page-analytics--desktop.png` (top ~330px = two empty cards); `analytics/page.js:168-253`; `:247` "No data yet — fills as Phase 4 S4 lands" | The page opens with two empty boxes. "Phase 4 S4" is build-plan wording that means nothing to the owner. The KPIs, the reason for opening the page, sit below the empty boxes. | Order: KPIs (with period comparison), then Views per day, then Leaderboard, then Retention, then Shorts vs Long, then audience, then search terms, then reports. Empty states in plain words: "Ranks appear after the first nightly snapshot (tonight 05:17 UTC ≈ 10:17 your time)." "Win rates need 7 days of published videos — first numbers expected Nov 25." Collapse empty cards to one line instead of 300px boxes. |
| DV-14 | **P1** | Analytics: RetentionBars goal marker | `charts.js:235-246`; `page-analytics--desktop.png` (marker line at 70%, "▲ goal 70%" text centred at ~50%) | The goal label sits in the middle of a `justify-between` row, not under the 70% marker, so the ▲ points at the wrong place. Pass/fail is shown by colour alone (green % text, `charts.js:226`). The OL accent bar is low-contrast grey-beige on dark. | Place the label absolutely at `left: goal%`. Add a text marker: "86% ✓ above goal" / "35% — 35 pts below goal". Use a neutral bar fill for every channel and colour only the over-goal part (or every bar in one ink colour), so brand accents don't carry meaning. |
| DV-15 | **P2** | Analytics: channel selector | `page-analytics--desktop.png` "All channels · QU · IN · TH · OL · YT"; `api/overview/route.js:99` short = first 2 letters of the label | "TH" (The Money Rulebook) and "YT" (YT-BOT) don't mean anything, and the selector has no tooltips. Two-letter codes make the owner translate in their head. | Use a dropdown or segmented control with the brand mark + full name ("The Money Rulebook"). On mobile, a select. Keep the selection in the URL (`?ch=money-rulebook`) so it's shareable and survives a refresh. |
| DV-16 | **P2** | Analytics: time ranges | `analytics/page.js:32` (7/28/90 only for the leaderboard); everything else fixed at 28d | Two different time controls: the leaderboard has one, the rest of the page is fixed. There's no comparison period anywhere except the leaderboard trend chip. | One page-level range control at the top (7d / 28d / 90d), applied to every panel, with "vs previous period" deltas on every KPI. |
| DV-17 | **P2** | Colour tokens for data | `app/page.js:146-147` typed-in `#3b82f6`/`#ec4899`; `analytics/page.js:120-127` `#ff4444`; `analytics/page.js:298` Subs gained uses `#ec4899` | Platform colours are hex values written into the components, and pink means **Instagram** in one card and **Subs gained** in another. Brand accents (`c.accent`) are used as series colours without any contrast check against `--surface`. | Add tokens `--data-yt`, `--data-fb`, `--data-ig`, `--data-pos`, `--data-neg`, `--data-neutral` and categorical `--series-1..8` in `globals.css`, checked at ≥3:1 against the card surface in both themes. One meaning per colour across the app. |
| DV-18 | **P2** | Analytics: "Who watches" / "Top countries" | `page-analytics--desktop.png` ("Who watches" card empty with no message); `analytics/page.js:409-433` has no empty branch; `:395` shows raw ISO codes; `:424` "18-24" from `age18-24` | One card is blank with no explanation. The other prints country codes ("US", "PK") rather than names. | Empty state: "Needs ~100 views in the period before YouTube shares demographics." Use `Intl.DisplayNames(['en'],{type:'region'})` with a flag. Show gender as one stacked 100% bar with direct labels instead of loose chips. |
| DV-19 | **P2** | Analytics: Viewer search terms | `page-analytics--desktop.png` (8 rows at ~62px each plus pagination for 20 items) | A full DataTable with paging for 20 two-column rows uses ~650px to show 8 numbers. Proportions are hard to compare. | Horizontal bar list (term, bar, count), top 10 visible, "show all 20" link. Same pattern as Top countries, about 260px tall. |
| DV-20 | **P2** | Analytics: Reports | `page-analytics--desktop.png` (newest report "2026-09-19", generated 2026-10-04); `analytics/page.js:492-503` rows are `div`s, not links | The newest report is two months old and nothing says the reporting pipeline has stopped. The rows can't be clicked or downloaded. The "repo /reports" chip adds nothing. | Make rows download links. If the newest report is more than 2 days old, show an amber "Reporting pipeline idle since Sep 19" line with a link to Operations. Remove the chip. |
| DV-21 | **P2** | Mobile/tablet layout | `page-home--mobile.png` (IG tile alone on its row; production table cut at "EPIS…"); `page-home--tablet.png` (FB + IG plus an empty cell); `page-analytics--mobile.png` ("WATCH TIME · …", "SUBS GAINED · …" cut off) | 5 KPIs in a 2- or 3-column grid always leave an orphan tile. The production table scrolls sideways, which hides the most important columns on a phone. The KPI labels are cut off. | Use 4 KPIs (see DV-08) so 2×2 and 4×1 both fill cleanly. On screens under `md`, render the production line as one card per channel ("QQ · Short ✓ 18:05 · Next 22:35 in 3h"). Shorter labels ("Watch hrs", "Subs +"). |
| DV-22 | **P2** | Home: Trend radar naming | `app/page.js:312` shows raw `{slug}`; `page-home--desktop.png` "debt-free-doctrine" with an **OL** mark | The radar shows internal slugs while the rest of the page shows labels, and "debt-free-doctrine" appears under the Old Money Code mark, so the owner can't tell which channel it is. | Use `BRAND[slug]?.label ?? slug`, the same as everywhere else. |
| DV-23 | **P3** | Home: greeting / hygiene | `app/page.js:111` typed-in "Muzzamil"; `:104` unused `upcoming`; `page-home--desktop.png` time-of-day greeting | Staff and client accounts are greeted as "Muzzamil". `upcoming` (recent Short/Episode logs) is computed but never shown, yet it is exactly the "what went out" list the owner needs. | Use the session user's first name. Show `upcoming` as the "Last 24h uploads" list in the status strip's drill-down. |
| DV-24 | **P3** | Overview → "Deep Analytics" tab | `app/page.js:137-138` embeds the whole `<Analytics/>` including its own `PageHeader` | Two page headers ("Good evening…" then "Analytics"), two Refresh buttons and two "Views per day" charts in one view. | Remove the tab. Link "Open analytics →" from the Growth section instead, or let `Analytics` accept `embedded` and skip its header. |

---

## 3. Redesign proposals

### 3.1 Home: built around the owner's morning questions

The owner opens this page once or twice a day to answer, in order:
1. **Did everything go out?** (uploads, by channel, today)
2. **Is anything broken or waiting on me?** (failures, re-auth, review queue)
3. **What's growing / shrinking?** (7-day trend, best and worst channel)
4. **What happens next?** (next uploads in local time)

**Before** (`page-home--desktop.png`): greeting, tabs, 5 lifetime KPIs, empty chart + empty alerts box, production table ("queued"), topics, trend radar, footer.

**After (desktop 1440):**

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│ Wednesday, Nov 18 · 23:40 PKT                                    [↻ 2 min ago] [Run…]│
│                                                                                     │
│ ╔═ TODAY ════════════════════════════════════════════════════════════════════════╗ │
│ ║  ✓ 4 of 5 Shorts published    ⚠ 1 not run (YT-BOT)    ✓ 0 failed runs        ║ │
│ ║  ✓ 2 episodes this week (due: MR Thu)   Engine: last run 21:35 ✓ (2h ago)     ║ │
│ ╚═════════════════════════════════════════════════════════════════════════════════╝ │
│                                                                                     │
│ NEEDS YOU (2)                                              (hidden when 0 → "✓")   │
│ ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│ │ ● YT-BOT did not run today · last run Nov 16            [Run now] [Open log]    │ │
│ │ ● Analytics scope missing for 2 channels (OL, YT)       [Re-auth]               │ │
│ └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                     │
│ CHANNELS TODAY                                                                      │
│ ┌──────────────────┬──────────────────────┬────────────────┬──────────────┬───────┐ │
│ │ Channel          │ Today's Short        │ Episode        │ Next upload  │ 7d ▲▼ │ │
│ ├──────────────────┼──────────────────────┼────────────────┼──────────────┼───────┤ │
│ │ (QU) Quote Quarry│ ✓ Published 03:35    │ ✓ Today        │ 19:30 · 20h  │ ▲ 18% │ │
│ │ (IN) Investor's C│ ✓ Published 04:35    │ ✓ Today        │ 02:35 · 3h   │ ▲  4% │ │
│ │ (MR) Money Ruleb.│ ◷ Scheduled 05:05    │   Nov 16 (2d)  │ 05:05 · 5h   │ ▼  9% │ │
│ │ (OM) Old Money C.│ ✓ Published 05:35    │   Nov 16 (2d)  │ 06:35 · 7h   │  —    │ │
│ │ (YT) YT-BOT      │ ✗ Not run            │   —            │ —            │  n/a  │ │
│ └──────────────────┴──────────────────────┴────────────────┴──────────────┴───────┘ │
│   times in your local zone (PKT) · hover shows UTC                                  │
│                                                                                     │
│ GROWTH · last 7 settled days (through Nov 15) vs previous 7        [7d|28d|90d]     │
│ ┌────────────┬────────────┬────────────┬────────────┐                               │
│ │ Views      │ Watch hrs  │ Subs gained│ Uploads    │                               │
│ │ 4.1K ▲12%  │ 61  ▲ 5%   │ +38  ▲ 9   │ 26/28      │                               │
│ │ ▁▂▃▂▅▆▇    │ ▂▂▃▃▄▄▅    │ ▁▁▂▃▂▄▅    │ plan 93%   │                               │
│ └────────────┴────────────┴────────────┴────────────┘                               │
│ ┌ Daily views by channel (stacked bars, settled days solid, last 3 hatched) ─────┐  │
│ │ 1.2K ┤        ▆                                                               │  │
│ │ 600  ┤   ▃ ▅ ▆█▇ ▅                                    QU ■  IN ■  MR ■  OM ■  │  │
│ │ 0    ┼───────────────────────── ░ ░ ░                                         │  │
│ │      Nov 2      Nov 9       Nov 15  (processing)                               │  │
│ └───────────────────────────────────────────────────────── Open analytics → ────┘  │
│                                                                                     │
│ ▸ Today's topics (4)       ▸ Trend radar (4 niches)     — collapsed disclosures     │
│                                                                                     │
│ Lifetime: 241 YT subs · 89,991 views · 823 videos · 23K FB · 3 IG                   │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**Mobile (390):** the status strip becomes three stacked lines. "Needs you" stays the same. Channels become one card per channel:
```
┌ (QU) Quote Quarry ─────────── ▲18% ┐
│ Short  ✓ Published 03:35           │
│ Next   19:30 (in 20h) · Episode ✓  │
└────────────────────────────────────┘
```
Growth becomes 2×2 KPIs, then the chart.

**Data needs (all already in `/api/overview` or close):** `lastRun` vs today (`route.js:77`), `lastVideos` with publish time and status, `flowPaused` (`route.js:81`), `yt.error` (`route.js:74`), `docDays` (`route.js:83`), the `upcoming` logs (`page.js:104`), `/api/warnings`, `snap.reAuth` (from `/api/analytics/leaderboard`), and the new `coverage` from DV-02.

### 3.2 Status grammar (use it everywhere)

| State | Glyph | Token | Copy pattern |
|---|---|---|---|
| Done | ✓ | `--data-pos` | "Published 03:35" |
| Scheduled | ◷ | `--data-neutral` | "Scheduled 05:05" |
| Warning | ⚠ | `--warn` | "Not run · last Nov 16" |
| Failed | ✗ | `--bad` | "Failed · step: upload" |
| Unknown | — | `--faint` | "No data · re-auth" |

Every state has both a glyph and a word, so colour is never the only signal (WCAG 1.4.1). This replaces the current mix of "1 queued", a bare "—" and an always-green date badge.

### 3.3 Freshness badge (replaces every typed-in "real data" badge)

`<DataSource source="YouTube API" through="2026-11-15" fetchedAt=… coverage={{ok:4,total:5}} />` renders as:
- `● YouTube · through Nov 15` (green, full coverage)
- `● 4 of 5 channels · through Nov 15` (amber, tooltip names the missing channel and the reason)
- `● Unavailable · last good 06:12 · Retry` (red)

Used on: `page.js:157`, `analytics/page.js:340`, `:461`, `:174`, `:229`, `:309`.

### 3.4 Chart-by-chart fixes

| Chart | Today | Fix |
|---|---|---|
| **Home: Views per day** (`page.js:164`) | MiniBars, total only, empty = blank, opacity encodes height a second time | Stacked bars by channel (or total bars with per-channel small multiples below). Settled vs processing days shown differently. Gridlines plus max/latest labels. Three explicit states (DV-01). Per-channel tiles become a sparkline row with a 7d delta, showing `—` (not 0) for failed channels. |
| **Home: KPI sparkline** (`ui.js:128-131`, `charts.js:6`) | 14 days including unsettled days, min-max scaled (a flat line looks dramatic) | Settled days only. Baseline at zero, or note "range 820–1.2K". Hide when fewer than 5 points. |
| **Analytics: KPI row** (`analytics/page.js:295-300`) | 0 when unavailable, no comparison | `—` when unavailable. "vs previous 28d" delta with ▲/▼ glyph and colour. Shorter labels on mobile. |
| **Analytics: Views per day** (`:349`) | 28 bars, 28 labels at 9px, no axis | Same component as home, weekly tick labels, optional "compare previous period" ghost bars in `--data-neutral` at 35%. |
| **Analytics: Average watched** (`charts.js:216`) | Typed-in baseline mixed with live, misplaced goal label, colour-only pass/fail | Live only. Goal label positioned at 70%. "✓ above goal" or "−35 pts" text. Neutral bars. Sorted descending, ties by views. |
| **Analytics: Shorts vs long-form** (`:365-379`) | 100% bar with accent/info, text below | Keep the 100% bar but direct-label inside the segments ("Shorts 82%"). Add a third figure: views per video for each format. That answers "which format earns more per upload". |
| **Analytics: Top countries / ages** (`:390-432`) | Raw codes, no empty state | Country names + flags. Empty state with a reason. Ages as one horizontal bar list sorted by age band (not by views), so the distribution shape can be read. |
| **Analytics: Leaderboard** (`:181-216`) | Good table, but trend chip colour-only plus ▲ | Keep it. Add a per-row 28-day sparkline column. "Channel" shows the label, not `r.channelId` (`:200`). |
| **Analytics: Audience split** (`:439-453`) | Followers list, typed-in colours, unused Donut | Keep as a list (correct choice: Donut is weaker for 3 very unequal values like 241 / 23K / 3). Use platform tokens. |
| **Analytics: Search terms** (`:467-480`) | Paginated DataTable | Bar list, top 10 (DV-19). |

---

## 4. Quick wins (each ≤ 1 day)

1. **Remove the typed-in badges and "Engine live"** (`AppShell.js:148-156, 370-372`). Wire them to `openWarningRows.length` and the last run's age, or hide them. *(DV-03)*
2. **Stop showing 0 when the fetch failed.** Add `coverage` and `fetchedAt` to `/api/analytics` (`route.js:127-176`). In the UI: `—` plus an "unavailable" note, and a coloured badge per DV-01/§3.3. *(DV-01, DV-02, DV-05)*
3. **Empty-chart guard in `MiniBars`**: render "No views data for this period" or the error slot when `data.length === 0`. *(DV-01, DV-11)*
4. **Delete the `RETENTION` typed-in list** and draw only live bars, with a "no data" bar for channels without analytics scope. *(DV-04)*
5. **Fix the "Shorts today" truth**: only count `lastVideos` when `lastRun === today` (`overview/route.js:78`). Change "queued" to "made". Colour Episode dates by age. *(DV-06)*
6. **Fix the KPI delta**: hide it when `prev === 0`, use settled days (`endDate = today−3`), and compare 7d vs the previous 7d. *(DV-08, DV-09)*
7. **Move the RetentionBars goal label** to `left: goal%` and add a text pass/fail marker. *(DV-14)*
8. **Analytics page order**: KPIs first, empty cards collapsed to one line, and "Phase 4 S4" rewritten in plain words. *(DV-13)*
9. **Channel names, not codes**: full labels in the analytics selector, and labels instead of slugs in Trend radar (`page.js:312`). *(DV-15, DV-22)*
10. **Fix or delete MultiChart/Donut** (the y-max bug at `charts.js:62`). *(DV-12)*
11. **Data colour tokens** in `globals.css`. Replace the 6 typed-in hex values; pink means one thing only. *(DV-17)*
12. **Use the session user's name** in the greeting. Remove the nested Analytics tab or pass `embedded`. *(DV-23, DV-24)*

## 5. Bigger bets (multi-day, high impact)

1. **Morning-questions home rebuild** (§3.1): a status strip, a combined Exceptions feed with one-click fixes, a per-channel "today" table/cards in local time with countdowns, a growth block on settled data, and research collapsed. Needs a small `/api/today` that joins state, logs, warnings, reAuth and cadence. *(about 3–4 days)*
2. **One chart component with honest states**: replace MiniBars, MultiChart, Sparkline and Donut with one tested `<TimeSeries>`/`<BarList>`/`<Spark>` set. Built-in empty, loading, partial and error states; axes and gridlines; settled vs processing rendering; keyboard-focusable tooltips; an `aria-label` summary plus a hidden table; token colours. Either fix the hand-made SVG (the MultiChart crash and scale bug were never root-caused, see `page.js:162`) or adopt one small, pinned library. Add a unit test for scale maths and empty input. *(about 3 days)*
3. **Per-number provenance** (`<DataSource>` §3.3) on every metric in the app: source, "through" date, coverage, last fetch, retry. This changes the dashboard from "pretty" to "trusted". *(about 2 days after quick win 2)*
4. **Analytics v2**: one page-level range control with period-over-period comparison on every panel, a URL-persisted channel selector, per-format efficiency (views per Short vs per episode), and a leaderboard with sparklines. Win rates and snapshots fill in as their pipelines land, with dated empty states. *(about 3–4 days)*
5. **Daily digest**: the §3.1 status strip sent as a one-screen morning message (email or Telegram) using the same `/api/today` payload, so the owner only opens the studio when "Needs you" isn't empty. *(about 2 days, optional)*
