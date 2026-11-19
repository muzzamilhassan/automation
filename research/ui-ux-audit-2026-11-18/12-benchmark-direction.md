# 12 — Competitive benchmark and redesign direction

**Lens:** how best-in-class products handle the jobs this panel does, and which redesign direction fits one non-technical owner running 5 to 30 automated channels.
**Date:** 2026-11-18 · **Evidence:** desktop screenshots in `C:\Users\Revnix\AppData\Local\Temp\studio-ui-audit\shots-full\` (home, studio, content, operations, network, settings, thumbs, channels-add, analytics), code under `studio/`, and public product docs (URLs inline).
**Mode:** read-only. No files changed except this report.

---

## 1. Plain-English summary for the owner

- **The home page shows everything, but it doesn't tell you what needs you.** YouTube Studio, Stripe and Linear all put "problems and things waiting for you" first. Quarry's home opens with five follower counters (one of them is "IG followers 3"), and its "Needs attention" box says *nothing needs attention*. Meanwhile Settings shows the script brain as **failing** and the Studio page shows **"db unavailable"**.
- **The menu follows how the engine is built, not what you do each day.** You go to "Command / Studio / Content / Operations / Network" and then pick a tab inside each one. Best-in-class tools name pages after your daily jobs: *Inbox, Schedule, Videos, Analytics, Runs, Channels.* Analytics has no menu entry at all. You can only reach it through search or a tab on the home page.
- **One channel goes by three names.** It's "OLD MONEY CODE" on the Network page, "debt-free-doctrine" in the Videos table, and "Debt-Free Doctrine" on Add Channel. YouTube and Metricool use one avatar and one name everywhere, plus a single "which channel am I looking at" switcher.
- **The panel shows that automation exists, but not whether it worked.** Operations has diagrams and "Produce now" buttons, yet there's no list saying "last night's run: done / failed, at 02:33, took 6 min". GitHub Actions and Vercel are built around exactly that list.
- **Recommendation:** go with a **"calm automation cockpit"**. The home page says either "all good" or "2 things need you". Pages are named after your jobs. Videos and analytics follow the YouTube Studio layout you already know, and ⌘K search stays as a shortcut. That fits one person checking in a few times a day, and it keeps working at 30 channels.

---

## 2. Benchmark table

| # | Job the owner does | Best-in-class pattern | Source | What Quarry Studio does today | Gap |
|---|---|---|---|---|---|
| 1 | "Is anything wrong / waiting for me?" | YouTube Studio dashboard has **Channel violations** and **Important notifications** cards. Stripe Home "surfaces important notifications, like unresolved disputes". Linear Inbox has a **Priority** tab, chosen by default. | [YT dashboard help](https://support.google.com/youtube/answer/2673341) · [Stripe Dashboard basics](https://docs.stripe.com/dashboard/basics) · [Linear Inbox docs](https://linear.app/docs/inbox), [Priority inbox changelog](https://linear.app/changelog/2026-09-03-priority-inbox) | Home leads with 5 KPI tiles (`app/page.js:143-147`). "Needs attention" reads only the warnings table (`app/page.js:189`), so it says "Nothing needs attention" while `page-settings--desktop.png` shows **Script brain: failing** and **Threads: attention**, and `page-studio--desktop.png` shows **db unavailable** | **Large.** Health signals are split across 3 pages, and the one box meant to collect them misses most of them. |
| 2 | "How did the latest upload do?" | YT Studio **Latest content performance** card: a snapshot of the newest video, collapsible | [YT dashboard help](https://support.google.com/youtube/answer/2673341) | Nothing like it. Home shows "1 queued" per channel (`page-home--desktop.png`) but not how the last published video performed. | Large |
| 3 | Browse the video library | YT Studio **Content** tab: thumbnail, visibility, date, views, plus a **Notices** column (red means a hard limit) and sortable columns | [ppc.land on Notices column](https://ppc.land/youtube-studios-content-tab-gets-a-notices-column-and-estimated-revenue-view/) · [YT restrictions help](https://support.google.com/youtube/answer/9668091) | `page-content--desktop.png`: 2-letter initials instead of thumbnails, no views/likes columns, scheduled and published mixed in one list, visible duplicates ("How Marcus Aurelius…" ×2, "Enron's $63B Fall…" ×2) with no flag | Medium to large |
| 4 | Switch between channels / see all at once | Metricool: "use the dropdown next to the Brand name", plus a "View as table" for all brands. vidIQ: Channels section to switch. Buffer: **All Channels** filter on the calendar. | [Metricool brands](https://help.metricool.com/whats-a-brand-in-metricool-and-how-does-it-work-5l78b) · [vidIQ dashboard](https://support.vidiq.com/en/articles/9820526-navigating-your-new-dashboard) · [Buffer calendar](https://support.buffer.com/articles/how-to-use-buffers-calendar-feature-FSSKbH32DN) | No global scope. Sidebar channel links go to separate pages. Only Analytics has a QU/IN/TH/OL/YT chip filter (`page-analytics--desktop.png`). Network shows 2 large cards per row (`page-network--desktop.png`, ~400 px tall each): fine at 5 channels, about 6,000 px of scrolling at 30. | **Large at 30 channels** |
| 5 | "What goes out when?" | Buffer **Calendar** (Week/Month) plus a per-channel **Queue** that publishes in the channel's own timezone | [Buffer calendar](https://support.buffer.com/articles/how-to-use-buffers-calendar-feature-FSSKbH32DN) · [Buffer timezones](https://support.buffer.com/en-us/articles/setting-up-your-timezones-and-posting-schedules-P4iSag90Fl) | Slots appear as raw UTC strings ("22:35 + 14:30") on Home and Network. No calendar. Scheduled items are only visible as rows in the Videos table. | Medium |
| 6 | "Did last night's run work?" | GitHub Actions: each job is a node with a **status icon**, lines show dependencies, and clicking opens the log. Vercel: dense **deployments list**, status filters saved in the URL, status in the browser-tab icon. | [GH visualization graph](https://docs.github.com/en/actions/how-tos/monitor-workflows/use-the-visualization-graph) · [Vercel redesigned deployments list](https://vercel.com/changelog/redesigned-deployments-list) · [Vercel deployment filters](https://vercel.com/changelog/deployment-filters-for-project-dashboard) · [Vercel dashboard redesign](https://vercel.com/blog/dashboard-redesign) | `page-operations--desktop.png`: static pipeline diagrams ("Script brain → Voice → Render…") with a permanent green **live** chip. No last-run time, result or duration per channel. Logs sit in a separate tab. | **Large.** This is the core job of an automation panel. |
| 7 | Approve scripts / topics / drafts | Linear **Inbox** (Priority tab, snooze) and **Triage** queue as first-class destinations | [Linear Inbox](https://linear.app/docs/inbox) · [Linear Triage](https://linear.app/docs/triage) | Review Queue is tab 1 of 5 inside "Studio". The Studio badge says **3**, but the page shows "db unavailable" and a spinner that never stops (`app/review/page.js:157-163`) | Large |
| 8 | Jump anywhere fast | Linear command menu: groups ranked by the current view, anchored to the element that opened it | [Linear contextual command menu](https://linear.app/changelog/2019-10-07-contextual-command-menu) · [Linear new command menu](https://linear.app/changelog/2019-12-18-new-command-menu) | ⌘K exists (`components/shell/CommandPalette.js`, ↑↓/↵ hints at :207-208), which is good. But it's the **only** way to reach `/analytics`, `/tasks`, `/users` (`components/shell/nav.js:45-66`), and it doesn't adapt to the current page. | Small to medium |
| 9 | Know where you are | Linear 2024 redesign: "less cluttered" sidebar; tabs, headers and filters adjusted to cut noise; better "hierarchy, balance, and density" | [Linear new UI changelog](https://linear.app/changelog/2024-03-20-new-linear-ui) | Double headers on every hub: "Studio Desk" → "Review Desk", "Operations Hub" → "Production", "Content & Media Library" → "Videos". Breadcrumb reads **"Quarry Studio / Quarry Studio"** on Analytics, Thumbs and Add Channel because the title lookup only knows the 6 sidebar items (`components/shell/AppShell.js:280-281`). Add Channel highlights "Network" in the sidebar. | Medium |
| 10 | Empty and error states | Stripe: title "No transactions **yet**", explain why, offer a next step; use a spinner while loading, not an empty state | [Stripe empty state](https://docs.stripe.com/stripe-apps/patterns/empty-state) · [Stripe waiting screens](https://edge-docs.stripe.com/stripe-apps/patterns/waiting-screens) | Analytics says "No data yet — fills as **Phase 4 S4** lands" (`app/analytics/page.js:247`). Home "Views per day" is a ~200 px blank area with a green **real data** chip (`app/page.js:154-157`). Studio shows a red error **and** a loading spinner at the same time (`app/review/page.js:157-163`). | Medium |
| 11 | Shape your own home | Stripe: **Edit overview → Add/remove widgets → Apply**; mobile can reorder | [Stripe Dashboard basics](https://docs.stripe.com/dashboard/basics) | Fixed layout. Two long research blocks (Researched topics + Trend radar) take about 45% of the home page's height (`page-home--desktop.png`, `app/page.js:266-303`) | Small (and a nice-to-have) |
| 12 | Thumbnail A/B testing | YouTube native **Test & compare**: up to 3 thumbnails or titles, winner by watch time; not available for Shorts | [YT Test & compare](https://support.google.com/youtube/answer/13861714) · [YT A/B titles & thumbnails](https://support.google.com/youtube/answer/16391400) | Custom "A/B test (auto-swap) · swap every 48h" (`page-thumbs--desktop.png`) with no mention of the native feature or the Shorts limit | Medium (product decision, not just UI) |
| 13 | Settings | Stripe Settings: one index page grouped by area, each area its own page | [Stripe Dashboard basics](https://docs.stripe.com/dashboard/basics) | One ~2,000 px page mixing theme, live integration health, team, password and sessions (`page-settings--desktop.png`). Stale copy: "flips back to private **on Oct 1**" (`app/settings/page.js:306`); internal labels "A1 session upgrade" (`:440`) and "(#120)". | Medium |
| 14 | Recognise a channel at a glance | YouTube shows the real channel avatar and name everywhere | [YT dashboard help](https://support.google.com/youtube/answer/2673341) | Coloured 2-letter circles (QU/IN/TH/OL/YT), ALL-CAPS names in the sidebar, and one channel under three names (Network "OLD MONEY CODE" / Videos "debt-free-doctrine" / Add Channel "Debt-Free Doctrine"; `page-network--desktop.png`, `page-content--desktop.png`, `page-channels-add--desktop.png`). Tab says **"Channels (16)"**, header says "5 live channels" (`app/network/page.js:12`). | Medium, and an easy trust win |
| 15 | Calm by design | Calm Technology, principle 1: "technology should require the smallest possible amount of attention"; inform without demanding | [Amber Case, Principles of Calm Technology](https://www.caseorganic.com/post/principles-of-calm-technology) · [O'Reilly](https://oreilly.com/content/principles-calm-technology-we-are-not-bad-at-technology-technology-is-bad-at-us) | Four separate "everything is fine" signals compete: topbar **Engine live**, sidebar **Engine connected**, **real data** chips, and **live** chips on every pipeline card. None of them can turn red when a run fails. | Medium |

---

## 3. Findings table

| ID | Sev | Page / component | Evidence | Problem | Recommendation |
|---|---|---|---|---|---|
| BM-01 | **P1** | Home "Needs attention" | `page-home--desktop.png`; `app/page.js:189`; `page-settings--desktop.png` (Integrations: Script brain **failing**, Threads **attention**); `page-studio--desktop.png` (db unavailable) | The only "is anything wrong" box reads just one source and reports "nothing" while 3 problems are visible elsewhere. This damages trust more than having no box at all. | One **health model** feeds Home, the bell and the sidebar badges: open warnings + integrations not `connected` + failed runs in the last 24h + API errors from the current page. Benchmark: YT "Channel violations / Important notifications" placed first; Stripe Home surfacing disputes. |
| BM-02 | **P1** | IA / sidebar | `components/shell/nav.js:26-43, 45-66`; double headers in `page-studio`, `page-operations`, `page-content--desktop.png` | The menu names engine areas (Command, Network, Operations) and hides real pages inside tabs. Analytics, Tasks and Users can only be reached through ⌘K. | Job-based menu (section 4C): **Today · Inbox · Schedule · Videos · Analytics · Runs · Channels**, a "Make" group (Create, Thumbnails, Templates, Music), and Settings. Remove the hub-title-over-page-title nesting. |
| BM-03 | **P1** | Operations | `page-operations--desktop.png`; `app/production/page.js` (embedded) | No run history at the place you'd look for one. A permanent "live" chip claims health that nothing checks. | A **Runs** list in the style of Vercel and GitHub Actions: one row per run → channel · workflow · status icon · started · duration · "view log". Filters (channel, status) stored in the URL. Pipeline diagram only inside a run's detail page, with per-step status icons. |
| BM-04 | **P1** | Review queue | `app/review/page.js:157-163`; `page-studio--desktop.png` | Error text and an endless "Loading queue…" spinner at the same time, while the badge promises 3 items | Three exclusive states: loading (skeleton rows), error (card: "Can't reach the review database. Your channels are still paused safely. [Retry]"), empty ("Nothing waiting for you yet"). Stripe pattern. |
| BM-05 | **P1** | Channel identity | `page-network--desktop.png`, `page-content--desktop.png`, `page-channels-add--desktop.png`, `app/network/page.js:12` | Three names for one channel; tab count 16 vs 5 live | One display name plus the real YouTube avatar (from the brand registry and API, no hard-coded maps, per the owner's no-static-maps rule) on every surface. Slugs only in tooltips. The tab count comes from live data. |
| BM-06 | P2 | Videos table | `page-content--desktop.png` | No thumbnails or views. Duplicates not flagged. Scheduled and published mixed together. | YT-Studio Content columns: thumbnail 96×54 · title · channel avatar · visibility/state · date · views · a "Notices" column (duplicate / failed upload / held). Tabs: *Scheduled · Published · Held*. |
| BM-07 | P2 | Global scope | `page-analytics--desktop.png` (chip filter only here) | Every page decides its own channel scope, which won't work at 30 channels | A **scope switcher** at the top of the sidebar: "All channels ▾" with search. It applies to Today, Videos, Schedule, Analytics and Runs. Metricool / vidIQ pattern. Persist the scope in the URL (`?ch=`). |
| BM-08 | P2 | Breadcrumb | `components/shell/AppShell.js:280-281`; `page-analytics/thumbs/channels-add--desktop.png` | "Quarry Studio / Quarry Studio" on every non-sidebar route | Resolve titles from `ALL_NAV_ITEMS` (it already holds labels for all 18 routes), using the longest-prefix match. |
| BM-09 | P2 | Empty / jargon copy | `app/analytics/page.js:247` ("Phase 4 S4"), `:317` ("The smoking gun"), `app/settings/page.js:306` (Oct 1), `:440` ("A1 session upgrade"), `components/shell/AppShell.js:433` ("v4.0 · Dreams UI") | Internal roadmap codes and stale dates in owner-facing copy | Rule: no issue numbers, phase codes or past dates in UI strings. Example: "No win-rate data yet. It appears 7 days after your first reviewed script is published." |
| BM-10 | P2 | Home chart | `app/page.js:154-162`; `page-home--desktop.png` | Blank chart area plus a "real data" badge; per-channel tiles all show 0 | When every value is 0, collapse to one line: "No views recorded in the last 28 days yet. YouTube Analytics can lag 48 h." Never show a "real data" badge on an empty chart. |
| BM-11 | P2 | Settings | `page-settings--desktop.png` | Live health (Integrations) is buried under Appearance | Move Integrations health to **Runs → Connections** and feed it into BM-01. Settings becomes an index: Appearance · Team · Security · AI keys · Usage & costs. |
| BM-12 | P2 | Thumbnails A/B | `page-thumbs--desktop.png` | Custom 48h auto-swap ignores YouTube's native Test & compare | Add an info line: "YouTube now runs official A/B tests for long videos (up to 3 thumbnails, winner by watch time). Use ours for Shorts and for batch tests." Owner decides whether to keep the custom tester. |
| BM-13 | P3 | Home customisation | `app/page.js:266-303` | Research blocks dominate the home page | Move Researched topics and Trend radar to **Inbox → Topics** (where you act on them). Optional Stripe-style "Edit home" later. |
| BM-14 | P3 | Status chrome | topbar "Engine live", footer "Engine connected", chips on every card | Too many always-green signals | One topbar health pill fed by BM-01: **All good** (green) / **2 need you** (amber, opens Inbox) / **Run failed** (red). Remove the rest. |

---

## 4. Three candidate redesign directions

### Direction A: "Linear-dense command center"

**Principles:** keyboard-first (⌘K plus single-key shortcuts like `g i` for Inbox, `a` to approve), dense 32 px rows, lists over cards, contextual command menu, triage inbox as home. Sources: [Linear new UI](https://linear.app/changelog/2024-03-20-new-linear-ui), [Linear command menu](https://linear.app/changelog/2019-10-07-contextual-command-menu), [Vercel denser list](https://vercel.com/changelog/redesigned-deployments-list).

```
┌ Sidebar 200px ┬──────────────────────────────────────────────────────────┐
│ ⌘K Search     │ Inbox · 4                          [All channels ▾] [⌘K] │
│ Inbox      4  ├──────────────────────────────────────────────────────────┤
│ Runs          │ ● FAIL  Script brain  Groq 429 — MR short           2m  ↵│
│ Videos        │ ◐ HOLD  Script review  QQ "Toxic Trap…"            14m  a│
│ Schedule      │ ◐ HOLD  Script review  IC "GTA-6 Bet…"             1h   a│
│ Analytics     │ ○ INFO  Threads token expires Oct 29               3h   s│
│ Channels      │──────────────────────────────────────────────────────────│
│ ── Make ──    │ Runs today  ✓✓✓✓✗  (4 ok · 1 failed)   Next: QQ 22:35    │
│ Settings      │ 28d views 90K  ▁▂▃▅▃▂▆  subs +12                         │
└───────────────┴──────────────────────────────────────────────────────────┘
```

**Pros:** fastest for power use; scales well to 30+ channels; least visual noise.
**Cons:** built for people who think in shortcuts. The non-technical owner won't learn `g i`. Dense rows are hard to tap on mobile, and [one breakdown notes keyboard advantages fade on touch](https://www.buildmvpfast.com/blog/linear-aesthetic-tokens-density-keyboard-first-ux-2026).
**Effort:** about 3–4 weeks (new list components, shortcut layer, inbox data model).

### Direction B: "YouTube-Studio-familiar"

**Principles:** reuse the owner's existing mental model. Channel avatar switcher top-left, sidebar **Dashboard · Content · Analytics · Comments · Customisation · Audio**, dashboard cards (latest content performance, analytics, notifications), Content table identical in column order to YT Studio. Sources: [YT dashboard](https://support.google.com/youtube/answer/2673341), [YT Content columns](https://ppc.land/youtube-studios-content-tab-gets-a-notices-column-and-estimated-revenue-view/).

```
┌ [avatar] Quote Quarry ▾ ┬──────────────────────────────────────────────┐
│ Dashboard               │ Channel dashboard                             │
│ Content                 │ ┌ Latest content ──┐┌ Channel analytics ────┐ │
│ Analytics               │ │ [thumb] Toxic…   ││ Subs 219   +3 (28d)   │ │
│ Automation              │ │ 1.2K views · 48h ││ Views 81K             │ │
│ Thumbnails              │ │ CTR — · AVD 86%  ││ Top: Marcus Aurelius… │ │
│ Settings                │ └──────────────────┘└───────────────────────┘ │
│                         │ ┌ Important notifications ─────────────────┐  │
│                         │ │ Script brain failing (Groq 429)          │  │
└─────────────────────────┴──────────────────────────────────────────────┘
```

**Pros:** zero learning curve. The owner can transfer what they know straight from YouTube. Easy to explain to staff and clients (the client role already sees one channel, which matches this model).
**Cons:** YouTube Studio is built for **one** channel at a time; the portfolio view (all 30 at once) is an afterthought. Automation (runs, approvals, pause-everything), which is this product's actual value, gets pushed into one "Automation" item. Copying too closely invites "why not just use YouTube Studio?"
**Effort:** about 2–3 weeks (mostly re-skinning existing pages, plus a channel switcher).

### Direction C: "Calm automation cockpit" (recommended)

**Principles**
1. **Exception-first.** Home answers one question: *"Is the machine fine, and does anything need me?"* Green is quiet; only exceptions get colour and space ([Calm Technology, principle 1](https://www.caseorganic.com/post/principles-of-calm-technology); Stripe Home surfacing disputes).
2. **Pages named after jobs:** Today · Inbox · Schedule · Videos · Analytics · Runs · Channels · (Make) · Settings.
3. **One scope switcher** ("All channels ▾") filters every page (Metricool / vidIQ / Buffer All Channels).
4. **Runs are a list, not a diagram** (GitHub Actions / Vercel). The diagram lives inside a run's detail page.
5. **YouTube vocabulary and layouts** for Videos and Analytics, borrowed from Direction B. ⌘K stays as an accelerator, borrowed from Direction A.
6. **Every widget has 3 honest states** (loading skeleton / error with retry / "No X yet" + reason + next step) (Stripe).

**Home wireframe (desktop 1440):**
```
┌ Quarry Studio ──────┬─────────────────────────────────────────────────────────────┐
│ [All channels ▾]    │ Good evening, Muzzamil          [● 2 need you]  [⌘K] [+Make]│
│                     ├─────────────────────────────────────────────────────────────┤
│ ◉ Today             │ ┌ NEEDS YOU (2) ───────────────────────────────────────────┐│
│ ✉ Inbox        3    │ │ ✗ Script brain is failing (Groq rate limit). MR short     ││
│ ▦ Schedule          │ │   skipped tonight.            [See run]  [Use fallback]   ││
│ ▶ Videos            │ │ ◐ 3 scripts waiting for approval. Nothing publishes until ││
│ ↗ Analytics         │ │   you approve.                          [Review now →]    ││
│ ⚙ Runs         1✗   │ └───────────────────────────────────────────────────────────┘│
│ ◎ Channels          │ ┌ TONIGHT'S LINE-UP (UTC→local) ─────────────────────────────┐│
│ ── Make ──          │ │ [av] Quote Quarry      Short ✓ ready   22:35 · Doc Tue      ││
│   Create video      │ │ [av] Investor's Comp.  Short ✓ ready   23:35                ││
│   Thumbnails        │ │ [av] Money Rulebook    Short ✓ ready   00:05                ││
│   Templates         │ │ [av] Old Money Code    Short ✓ ready   00:35                ││
│   Music             │ │ [av] YT-Bot            Paused — finish setup  [Finish →]    ││
│ ──────────          │ └────────────────────────────────────────────────────────────┘│
│ ⚙ Settings          │ ┌ LAST 24H ─────────────┐ ┌ LATEST UPLOAD ──────────────────┐ │
│                     │ │ Runs  ✓✓✓✓✗ 4/5       │ │ [thumb] The Toxic Trap of False │ │
│                     │ │ Published 2 · Held 3  │ │ Hope · QQ · 19:30 · 412 views   │ │
│                     │ │ Views 28d 90K ▁▃▅▃▆   │ │ AVD 86% (goal 70%)  [Open →]    │ │
│                     │ └───────────────────────┘ └─────────────────────────────────┘ │
│ ● All good · 02:33  │                                                               │
└─────────────────────┴───────────────────────────────────────────────────────────────┘
```
When nothing needs attention, the red/amber box collapses to a single green line: **"All 5 channels on track. Next upload: Quote Quarry at 22:35 (in 3 h)."**

**Runs page wireframe:**
```
Runs                                   [All channels ▾] [Status: All ▾] [Pause everything]
──────────────────────────────────────────────────────────────────────────────────────────
✗  Money Rulebook   Daily short     02:33  4m12s  Failed at Script brain (Groq 429)  [Log]
✓  Quote Quarry     Daily short     02:33  6m03s  Uploaded · scheduled 22:35          [Log]
✓  Investor's Comp. Weekly episode  02:33  18m40s Uploaded · scheduled Wed            [Log]
◐  Old Money Code   Daily short     02:41  running… Render (3/5)                      [Log]
```

**At 30 channels:** "Tonight's line-up" becomes a grouped list (failed → held → ready → paused) with "show 24 on-track channels" collapsed. Channels becomes a Metricool-style table (avatar · name · status · subs · 28d views · last run · next slot) instead of 2-up cards.

**Pros:** built around what this product actually does (automation plus approvals); quiet when things are fine; scales by collapsing on-track channels; reuses YouTube vocabulary where the owner already knows it.
**Cons:** needs a real health model first (BM-01), which is backend work, not just re-skinning. It also moves pages around, so old bookmarks need redirects (`ALL_NAV_ITEMS` already keeps legacy paths, `nav.js:47`).
**Effort:** about 3 weeks in 3 phases. Phase 1 (≈4 days): health model + Today home + honest states. Phase 2 (≈6 days): Runs list + Inbox (merge Review, Topics, Drafts, Warnings) + scope switcher. Phase 3 (≈5 days): Videos table in YT columns + Channels table + Settings index.

### Side-by-side

| | A: Linear-dense | B: YouTube-familiar | **C: Calm cockpit** |
|---|---|---|---|
| Learning curve for this owner | High | Lowest | Low |
| Answers "is anything wrong?" | Yes (inbox) | Partly (notifications card) | **Yes, first thing** |
| Works at 30 channels | Best | Weak (one channel at a time) | Good (collapse on-track) |
| Shows automation runs | Good | Weak | **Best** |
| Mobile glance | Weak | Good | Good |
| Effort | 3–4 wk | 2–3 wk | ~3 wk, phased |

---

## 5. Recommended direction and why

**Pick C, the calm automation cockpit, borrowing B's YouTube vocabulary for Videos and Analytics and keeping A's ⌘K as an accelerator.**

Why it fits this owner:
1. **The owner checks in; the robots do the work.** Their job is to approve, unblock and glance. A cockpit that is silent when green and specific when red matches that job ([Calm Tech principle 1](https://www.caseorganic.com/post/principles-of-calm-technology); [Linear Priority inbox](https://linear.app/docs/inbox)). The current home does the opposite: 2,000 px of always-on data and a "nothing needs attention" box that is wrong (BM-01).
2. **It scales from 5 to 30 without a redesign.** It uses a scope switcher and tables instead of per-channel cards (BM-07). This matches the owner's own-portfolio-30 scope and their no-static-maps rule: everything is driven by `/api/brands`.
3. **It keeps what's already good.** ⌘K palette, Pause everything, the fail-closed explanations, and the thumbnail editor's numbered steps all survive. They just move to job-named pages.
4. **Trust comes first.** Several findings (BM-01, 04, 05, 09, 10, 14) are cases of the UI saying something untrue or stale. Fixing honesty is cheaper than any visual polish, and it's what makes a panel feel "world-class".

---

## 6. Quick wins (each ≤ 1 day)

1. **Fix the breadcrumb** (BM-08): resolve the page title from `ALL_NAV_ITEMS` with prefix match. `components/shell/AppShell.js:280-281`. About 1 hour.
2. **Add Analytics to the sidebar** under Command (`components/shell/nav.js:29-35`). About 15 minutes.
3. **Make review states exclusive** (BM-04): `app/review/page.js:157-163`. If `err`, render an error card with Retry and no spinner. About 2 hours.
4. **"Channels (16)" → live count** (`app/network/page.js:12`). About 30 minutes.
5. **Copy sweep** (BM-09): remove "Phase 4 S4", "(#120)", "A1 session upgrade", "on Oct 1", "Dreams UI", "smoking gun". About half a day.
6. **Drop the "real data" chip and blank chart when all values are 0** (BM-10), `app/page.js:154-162`. About 2 hours.
7. **Feed Integrations `failing`/`attention` into the home "Needs attention" card** as a first slice of BM-01. About 1 day.
8. **One display name per channel** from the brand registry on Videos, Network and Add Channel (BM-05, first slice). About 1 day.

## 7. Bigger bets (multi-day, high impact)

1. **Health model + Today home** (BM-01, BM-14). One server endpoint combines warnings, integrations, failed runs and API errors. It drives the topbar pill, the bell, the sidebar badges and the Needs-you card. About 4 days.
2. **Runs page** (BM-03): GitHub Actions run list per channel with status, duration and log link; filters in the URL; step diagram on the detail page. About 4 days.
3. **Unified Inbox** (BM-02/BM-07): Review scripts + Topic desk + Drafts Inbox + Warnings in one prioritised list with Approve / Reject / Snooze. About 4 days.
4. **Global channel scope switcher + Channels table** (BM-07): replaces 2-up cards at scale. About 3 days.
5. **Videos table in YouTube Studio columns** with thumbnails, views and a Notices column (duplicates, held, failed) (BM-06). About 3 days.
6. **Schedule (calendar week view)** of all channels' slots in the owner's local time, following the Buffer pattern (benchmark row 5). About 3–4 days.
7. **Decide on thumbnail A/B** vs YouTube's native Test & compare (BM-12). This is an owner product decision, then about 1 day of copy and UI work.

---

### Sources

- YouTube Studio dashboard: https://support.google.com/youtube/answer/2673341
- YouTube Content tab Notices column: https://ppc.land/youtube-studios-content-tab-gets-a-notices-column-and-estimated-revenue-view/ · https://support.google.com/youtube/answer/9668091
- YouTube Test & compare: https://support.google.com/youtube/answer/13861714 · https://support.google.com/youtube/answer/16391400
- Linear: https://linear.app/changelog/2024-03-20-new-linear-ui · https://linear.app/changelog/2019-10-07-contextual-command-menu · https://linear.app/changelog/2019-12-18-new-command-menu · https://linear.app/docs/inbox · https://linear.app/changelog/2026-09-03-priority-inbox · https://linear.app/docs/triage
- Vercel: https://vercel.com/blog/dashboard-redesign · https://vercel.com/changelog/redesigned-deployments-list · https://vercel.com/changelog/deployment-filters-for-project-dashboard
- GitHub Actions: https://docs.github.com/en/actions/how-tos/monitor-workflows/use-the-visualization-graph
- Stripe: https://docs.stripe.com/dashboard/basics · https://docs.stripe.com/stripe-apps/patterns/empty-state · https://edge-docs.stripe.com/stripe-apps/patterns/waiting-screens
- Buffer: https://support.buffer.com/articles/how-to-use-buffers-calendar-feature-FSSKbH32DN · https://support.buffer.com/en-us/articles/setting-up-your-timezones-and-posting-schedules-P4iSag90Fl
- Metricool: https://help.metricool.com/whats-a-brand-in-metricool-and-how-does-it-work-5l78b
- vidIQ: https://support.vidiq.com/en/articles/9820526-navigating-your-new-dashboard · https://vidiq.com/blog/post/manage-multiple-youtube-channels/
- Calm Technology: https://www.caseorganic.com/post/principles-of-calm-technology · https://oreilly.com/content/principles-calm-technology-we-are-not-bad-at-technology-technology-is-bad-at-us
- Linear density caveat (third-party): https://www.buildmvpfast.com/blog/linear-aesthetic-tokens-density-keyboard-first-ux-2026

*Caveat:* TubeBuddy's multi-channel and A/B plan details conflict across third-party reviews, so I didn't use them as a benchmark. The Vercel denser-list changelog was confirmed only through search summaries. Mobile and tablet screenshots were outside this lens and are left to the responsive report.
