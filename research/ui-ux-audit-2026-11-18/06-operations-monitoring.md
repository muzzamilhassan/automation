# 06 — Operations & Monitoring audit (Quarry Studio, 2026-11-18)

Lens: operations / observability. Pages: `/operations` hub, `/production`, `/logs`, `/warnings`, `/tasks`, the topbar bell, plus the status chrome (sidebar badges, "Engine live").
Evidence: `C:\Users\Revnix\AppData\Local\Temp\studio-ui-audit\shots-full\` (`page-operations|production|logs|warnings|tasks|home--*.png`) and code under `studio/`.
Method: read-only. Every finding cites a screenshot or `file:line`.

---

## 1. Plain-English summary for the owner

- **The panel can't tell you yet whether today's automation ran.** The buttons start jobs on GitHub, but nothing reads back what happened. The best the screen can say is "Started ✓", and that disappears after 5 seconds. No page shows a GitHub run's success or failure, how long it took, or a link to it (`production/page.js:117`, `ActionButton.js:21-26`, and no `actions/runs` call anywhere in `studio/`).
- **Several status lights are fake or give false all-clears.** The red "1" on Operations and the "3" on Studio in the sidebar are typed into the code. "Engine live" and "Engine connected" are always green. When the warnings database is down, the bell, the Tasks page and the Home page all say "All probes are quiet", while the Warnings page itself says "db unavailable" (`page-tasks--desktop.png` next to `page-warnings--desktop.png`).
- **The "logs" page isn't a log of runs.** It's a list of uploads, with your topic-approval clicks stacked on top. Failed runs never show up there. Videos scheduled for tomorrow are labelled "just now", so they look like they've already been posted (`page-logs--desktop.png`, rows "Nov 19, 05:05 · just now").
- **The run buttons repeat each other and some labels are wrong.** For each channel, "Produce now", "QQ Shorts" and "QQ episode" all start exactly the same job (`api/action/route.js:20-21`). The cards also offer "DFD Shorts/DFD episode" for a channel the sidebar calls "Old Money Code", and YT-BOT has no card button at all (`lib/site-data.js:16-47`). Nothing tells you each click is a paid GitHub run, or that you're capped at 10 per hour and 30 per day.
- **The fix:** turn Operations into one "Today" screen. Show one row per channel with the time it ran, whether it worked, what it produced, a link to the logs and a Retry button. Make every status indicator either real or hidden.

---

## 2. Findings table

| ID | Sev | Page / component | Evidence | Problem | Recommendation |
|---|---|---|---|---|---|
| OPS-01 | **P0** | Production run buttons, ActionButton | `production/page.js:107-121`, `components/ActionButton.js:11-27`, `app/api/action/route.js:95-96`; no `actions/runs` / `workflow_runs` reference anywhere in `studio/` | Dispatch returns `{started:true}` on GitHub's 204 and the UI stops there. The panel never finds out the result. ActionButton resets to its idle label after 5 s (`ActionButton.js:26`), so even "Started" is lost. The owner's main question, "did it work?", has no answer anywhere in the product. | Add `GET /api/runs?since=24h`, which reads `GET /repos/{repo}/actions/workflows/channel-autopilot.yml/runs` plus `/runs/{id}/jobs`. After a dispatch, poll for the matching run (event=`workflow_dispatch`, `created >= clickTime-5s`, actor = token) and move the button state through **Queued → Running (2m 10s) → Succeeded / Failed**, with a "View run" link to `html_url`. Add `run-name: ${{ inputs.channel || 'heartbeat' }} · ${{ github.event_name }}` to `.github/workflows/channel-autopilot.yml` (it has no `run-name` today, so every run is titled "🏭 Channel Autopilot — all channels" and you can't tell which channel it was). |
| OPS-02 | **P0** | Sidebar badges | `components/shell/AppShell.js:148-157` (literal `3` and `1`); visible in every screenshot, e.g. `page-warnings--desktop.png` (Operations **1** while the page says "db unavailable") | Hardcoded counters. The red "1" on Operations means "something failed" to any operator, and it never changes. This is the same fake-signal class #126 just removed from the bell. | Delete both literals now. Later, wire Operations to `failedRunsToday + openBlockingWarnings` and Studio to the review-queue length, and hide the badge when the count is 0 or unknown. |
| OPS-03 | **P0** | Bell, Tasks, Home "Needs attention" | `app/api/warnings/route.js:25` returns **HTTP 200** `{open:[], error:'db unavailable'}`; `components/use-open-warnings.js:13-16` and `tasks/page.js:22-24` ignore `error`; `page-tasks--desktop.png` shows "Nothing unresolved — all probes quiet" while `page-warnings--desktop.png` shows "db unavailable" | A false all-clear. When the alert store is down, three surfaces report green. In monitoring, "unknown" must never be drawn as "OK". | Have the route return 503 when the DB isn't ready, matching POST at line 40. In every consumer, use a three-state model `ok / empty / unknown`. For unknown, show a grey "?" badge and the copy "Can't reach the alert store — status unknown". |
| OPS-04 | **P0** | Logs table: future posts | `lib/utils.js:34` (`Math.max(0, …)` clamps future times to "just now"); `lib/data.mjs:287-291` computes `status: 'scheduled' \| 'published'` but `logs/page.js` never renders it; `page-logs--desktop.png` rows 1-4 ("Nov 19, 05:05 · just now", captured Nov 18 ~22:30) | Four scheduled-for-tomorrow uploads read as "posted just now". The owner gets a false picture of what is public. | Add a **Status** column: `Scheduled · in 6h` (blue clock chip) or `Published · 3h ago` (green). Make `timeAgo` future-aware ("in 6h"). Sort scheduled rows into a separate "Up next" group above history. |
| OPS-05 | **P1** | Production / Daily Shorts / Weekly episode cards | `app/api/action/route.js:20-22` (`yt-daily`, `deepdive` → the same `channel-autopilot.yml {channel}`); `lib/site-data.js:24-46`; `page-production--desktop.png` | Three buttons per channel for one job. "QQ episode" doesn't make an episode unless today is that channel's doc day (the route comment at line 21 says so). The owner will click it, see "Started", and get no episode. | Keep **one** run control per channel, in the channel row (see §3). Replace the "episode" buttons with "Force episode today", which maps to `force-doc`. Delete the `actions` arrays from `PIPELINES`; the cards become a read-only "How the pipeline works" explainer. |
| OPS-06 | **P1** | PIPELINES static map | `lib/site-data.js:23-45` hardcodes QQ/IC/MR/**DFD** slugs and "QQ 22:35 · … · OMC 00:35"; `studio/lib/brands.json`: `debt-free-doctrine → "OLD MONEY CODE"`; `page-production--desktop.png` (button "DFD Shorts", schedule "OMC") | The same channel appears as "DFD" on buttons, "OMC" in the schedule, "OLD MONEY CODE" in the sidebar and `debt-free-doctrine` in Logs. YT-BOT has no card buttons. This also breaks the owner's no-static-maps rule: a 6th channel would need a code change. | Build the schedule and buttons from `/api/overview` channels (they already carry `docDays` and slots). Everywhere a channel is shown, use `label` plus a BrandMark, never the slug. |
| OPS-07 | **P1** | Run cost and rate limit invisible | `app/api/action/route.js:47-53` (10/hour, 30/day "billable GitHub Actions run"); `production/page.js:214` shows only "Failed — retry" on any non-OK response | The owner can't see that a click costs Actions minutes or how many dispatches are left. A 429 from the limiter shows up as a generic "Failed — retry", which invites the clicks that make it worse. | Add a header meter: "Manual runs today: 4 / 30 · this hour 1 / 10 · each run ≈ 6–12 Actions minutes". Show the route's `error` text on failure, e.g. "Hourly limit reached — try at 23:00". Ask for confirmation only on bulk actions or when fewer than 3 runs remain. |
| OPS-08 | **P1** | "Engine live" / "Engine connected" | `AppShell.js:370-372` (topbar), `AppShell.js:289-293` (sidebar foot, hardcoded green `#17b26a` pulse) | A permanent green pulse with no data behind it. It also sits next to the Next dev "N" badge, which covers "Engine connected" in every desktop shot (`page-operations--desktop.png`, bottom-left). | Bind it to a real heartbeat: the age of the last successful `channel-autopilot` run. Green if under 2 h, amber "Last run 5h ago", red "No run in 24h", grey "unknown". Clicking it opens Operations. |
| OPS-09 | **P1** | Warnings: severity sort | `warnings/page.js:17,135` and `lib/warnings-store.mjs:51` (ladder `[advisory, warning, action_required, blocking, informational]`, "low → high") | Sorting high-to-low puts **informational above blocking**. The least important rows land at the top of triage. | Order the display separately: `blocking > action_required > warning > advisory > informational`. Use a `SEVERITY_RANK` map in the UI, and don't reuse the storage enum order. |
| OPS-10 | **P1** | Severity colours mismatch (bell + Tasks) | `AppShell.js:76-77` keys `bad/warn/info`; `tasks/page.js:13` `sevTone = {bad,warn,info}`; real values are `blocking/action_required/…` | Every bell and Tasks row falls through to the grey Info icon or plain chip. A **blocking** alert looks identical to an advisory one. | Add one shared `components/severity.js` with `{label, tone, icon}` per severity. The bell, Tasks, Warnings and Home must all import it. |
| OPS-11 | **P1** | Warnings: error and loading at the same time | `warnings/page.js:150-153`; `page-warnings--desktop.png` ("db unavailable" in red **and** a spinning "Loading warnings…") | An endless spinner under an error. Raw developer text ("db unavailable"). No retry. | Use an error card: "Couldn't load warnings — the alert database isn't reachable. Status unknown, not all-clear." plus [Try again]. Never render the spinner once `err` is set. |
| OPS-12 | **P1** | Warnings: jargon and weak actions | `warnings/page.js:54` (`channel_id · code · job`), `:60` tooltip "never unblocks (D11)", `:95` "(AC-P4-15)", `:205` card sub "resolved_by + note (AC-P4-15)", chip text `action_required` | Spec IDs and snake_case reach the owner. Acknowledge, Re-check and Resolve are 11.5px muted text links with no button styling. The owner can't tell what each one does or whether it changes publishing. `isOwner` is always true (`:191`), so staff see a Resolve control that returns 403. | Rename the actions with consequence copy: **"Mark as seen"** ("doesn't unblock publishing"), **"Check again now"** ("runs the probe; result in ~1 min"), **"Close with note"** (owner only, hidden for staff). Show the channel label, not `channel_id`, and put the code behind a "details" disclosure. Strip all `ACxx/Dxx` strings from visible copy and tooltips. |
| OPS-13 | **P1** | Warnings: re-check gives no feedback | `warnings/page.js:117-133` (POST returns 202 async, then an immediate `load()`) | "Re-check" spins for a moment and then nothing visibly changes. The probe result arrives later and the page never refreshes. | Show an inline state, "Checking… (started 23:04)", and poll every 10 s for up to 2 min. Then show "Still failing · checked 23:05" or move the row to Resolved with a toast. |
| OPS-14 | **P1** | Logs is an upload ledger, not "Execution Logs" | Tab label `operations/page.js:13` "Execution Logs" vs page title "Posting logs" (`logs/page.js:41`); data from `allLogs()` = successful uploads only (`lib/data.mjs:263-294`) | Failed, skipped and no-op runs never appear, so a night where nothing ran looks the same as a quiet night. The copy "Run history, upload status, and failures appear in Execution Logs" (`production/page.js:299-304`) is false. | Split into **Runs** (the GitHub run timeline, OPS-01) and **Uploads** (this table). Fix the Production footnote. |
| OPS-15 | **P1** | Logs: Team activity block | `logs/page.js:51-69`; `page-logs--desktop.png` (12 near-identical "topic-approve → quotequarry" rows push the posts table below the fold) | The audit trail takes up the top half of a "Posting logs" page. Emails are truncated ("muzzamilhassan302@g…") and repeated clicks aren't collapsed. | Move it to its own "Activity" tab or collapse it to one line: "You approved 8 and removed 4 QuoteQuarry topics · 3m ago". Show initials or "You" instead of the email. |
| OPS-16 | **P1** | DataTable a11y error (32× on /logs) | `components/DataTable.js:23` (`isRowHeader={Boolean(c.rowHeader)}`); `logs/page.js:79-96` sets no `rowHeader`; `_errors-by-page.md` (/logs 32×, /content, /videos 16×) | React-aria throws on every render. The table still draws in `page-logs--desktop.png`, but screen readers get no row header and the console fills up. | Default `rowHeader` to the first column with a non-empty label when no column sets it (`DataTable.js:23`), and set `rowHeader: true` on `title` in logs. That fixes all three pages at once. |
| OPS-17 | **P2** | Logs: duplicate rows | `page-logs--desktop.png` (Sep 20 10:15 "How Marcus Aurelius…" ×2, Sep 20 09:30 "Enron's $63B…" ×2); `logs/page.js:74` forces unique ids with `-${i}`, which hides the duplication | The same video is listed twice, which inflates counts and looks broken. | Dedupe by `videoId` in `allLogs()` (`lib/data.mjs:269-283`, where `lastVideos` and `longformUploads` overlap). Drop the index suffix so duplicates surface in development. |
| OPS-18 | **P2** | Mixed time zones | Production schedule "(UTC)" (`site-data.js:23`), Home "SLOTS (UTC)" (`page-home--desktop.png`), Logs local `toLocaleString` (`utils.js:27`), Warnings raw ISO slice = UTC with no label (`warnings/page.js:19`) | Four time conventions across one workflow. "Did the 22:35 run happen?" can't be checked against a log that shows local time. | Pick one: the owner's local time with a TZ suffix ("22:35 PKT"), with UTC in a tooltip. Use the same `when()` everywhere and drop the per-page copies. |
| OPS-19 | **P2** | Logs: Episodes open as Shorts | `logs/page.js:92` (`youtube.com/shorts/${videoId}` for every row, including Kind=Episode) | 10-minute documentaries open in the Shorts player. | Use `watch?v=` for `kind === 'Episode'`. |
| OPS-20 | **P2** | Logs: stale help cards | `logs/page.js:100-114` "Every manual job writes to `studio-logs/`" (directory doesn't exist: `ls studio-logs` → not found); the ntfy topic is printed in clear text | A dead pointer and a leaked notification topic (anyone with the topic name can subscribe). | Delete the `studio-logs` card. Replace the ntfy card with "Phone alerts: on (ntfy)" and a "Send test alert" button, without showing the topic. |
| OPS-21 | **P2** | Breadcrumb says "Quarry Studio / Quarry Studio" | `AppShell.js:271-272` looks up only `NAV`, not `ALL_NAV_ITEMS`; `page-production|logs|warnings|tasks--desktop.png` | Deep pages lose their title. /tasks also lights up **Settings** in the sidebar (`page-tasks--desktop.png`) and is still called "Roadmap Tasks · Project roadmap" in the palette (`nav.js:63`). | Resolve the title from `ALL_NAV_ITEMS` and show "Operations / Production". Rename /tasks to "Inbox" (desc "Warnings + approvals waiting on you") and map it to the Operations group. |
| OPS-22 | **P2** | Nested double header | `operations/page.js:48-52` and `production/page.js:151-157`; `page-operations--desktop.png` ("Operations Hub" H1 and then "Production" H1 with the same ⚡ icon) | Two page titles, two icon tiles and two descriptions before any content. "Open logs" links to `/logs` (`production/page.js:156`), which kicks you out of the hub. | When embedded, child pages render no PageHeader (pass `embedded` prop). Move "Open logs" to `?tab=logs`. |
| OPS-23 | **P2** | Mobile: channel names truncated, table hides key columns | `page-production--mobile.png` ("QUOT…", "INVES…", "THE M…"); `page-logs--mobile.png` (Channel/Title columns cut off, horizontal scroll) | On a phone, the two most important facts, which channel and which video, are what get cut. | Under `sm`, stack channel rows (name on line 1, chips on line 2, buttons full width). Render logs as cards: "BrandMark · Title / Scheduled in 6h · Short". |
| OPS-24 | **P2** | "live" chips on static cards | `production/page.js:257` (`<Chip tone="ok" dot>live</Chip>` on every PIPELINES card, including retired TikTok workflow) | A green "live" dot with no data behind it. The TikTok card says the workflow was "retired Oct 30" and still shows "live". | Remove it, or derive it from the last run of that pipeline. |
| OPS-25 | **P2** | "Pause everything" mechanics | `production/page.js:82-102` (sequential PATCH per channel; on a partial failure the UI still sets `netPaused` to the target state, `:98`); `page-production--desktop.png` (the Pause icon wraps above its label) | A partial failure shows "ALL CHANNELS PAUSED" while some channels are still live. That is the riskiest control on the page. | After the loop, set the state only from `loadOverview()`, which already runs. Show "3 of 5 paused — 2 failed [Retry]". Put the icon inline (`iconLeading`). |
| OPS-26 | **P3** | Bell fetches once | `use-open-warnings.js:10-25` (empty deps, AppShell persists across routes) | The bell goes stale for the whole session. | Revalidate on window focus and every 60 s, plus a `qs:warnings-changed` event fired after ack/resolve. |

---

## 3. Redesign proposals

### 3.1 Operations → "Today" (replaces the Pipelines tab as the default)

The goal is to answer "Did today's automation run, what failed, what do I do?" in one screen, without scrolling at 1440×900.

```
Operations                                   [⏸ Pause all]  Manual runs 4/30 today · 1/10 this hr
────────────────────────────────────────────────────────────────────────────────────────────────────
 ● 3 succeeded   ✕ 1 failed   ◷ 1 scheduled   — 0 skipped          Last heartbeat 12 min ago ●
────────────────────────────────────────────────────────────────────────────────────────────────────
 TODAY  (Wed 18 Nov, times in PKT)       00   04   08   12   16   20   24
 QU Quote Quarry       ✓ 03:37 · 6m      ·····▮························ ◇22:35   Short ✓ scheduled 03:35 ▸ [Logs] [⋯]
 IN Investor's Compass ✓ 04:36 · 7m      ······▮······················· ◇23:35   Short ✓ · Episode ✓   [Logs] [⋯]
 TH Money Rulebook     ✕ 05:06 · 2m      ·······▮✕····················· ◇00:05   Upload failed: token_revoked
                                                                                 [Reconnect channel] [Retry run] [Logs]
 OL Old Money Code     ◷ next 00:35                                      ◇00:35   clips: queue empty ⚠ [Top up]
 YT YT-Bot             ⏸ paused since 16 Nov                                       [Resume]
────────────────────────────────────────────────────────────────────────────────────────────────────
 Needs you (2)                                                   Up next (4 scheduled uploads)
 ⛔ Blocking · Money Rulebook — upload token revoked   [Fix]      Nov 19 03:35  QU Short  "Musashi's Journaling…"
 ✎ 1 script awaiting approval                          [Review]  Nov 19 04:35  IN Short  "Beat the 'Risk-Free'…"
```

Row anatomy:
- **Left:** BrandMark and the channel label, from the live registry. No slugs and no "legacy/wizard" chips; move those to a hover card.
- **Status cell:** an icon and a word, not colour alone. ✓ Succeeded (green), ✕ Failed (red), ⟳ Running (blue, with elapsed time), ◷ Scheduled (grey with the next time), — Skipped (grey: "already done today" or "Sunday break"), ⏸ Paused (amber). Duration in mono.
- **Mini timeline:** a 24h strip with one tick per real run (no-op heartbeat runs hidden; `channel-autopilot.yml` fires every 30 min per `.github/workflows/channel-autopilot.yml:25`, so unfiltered there would be 48 ticks a day of noise) and ◇ for the scheduled slot.
- **Result:** what the run produced (Short ✓, Episode ✓, Poster —), taken from the run's job steps or state, with the failing step's plain-English reason when it failed.
- **Actions:** `[Logs]` opens a SlideoutDrawer (`components/SlideoutDrawer.js`) with the step list (Research ✓ → Script ✓ → Voice ✓ → Render ✓ → Upload ✕) and "Open on GitHub". The `[⋯]` menu holds **Run again now**, **Force episode today** and **Pause this channel**. Retry appears inline only on failed rows. Each menu item shows "uses 1 of your 30 daily runs".
- **Failure rows** expand by default and lead with the fix ("Reconnect channel"), not the stack trace.

Data: `/api/runs` (new; GitHub runs API filtered by `run-name` channel) merged with `/api/overview` (slots, docDays, clipQueue, flowPaused) and `/api/warnings`. Refresh every 30 s while any row is Running, otherwise every 60 s and on window focus.

Tabs become: **Today** · **Run history** (the same rows, 14 days, filter by channel/status) · **Uploads** (today's Logs table, with a Status column) · **Warnings** · **Activity** (the audit trail). The static PIPELINES cards move into a collapsible "How the pipeline works" footer, or to Settings.

### 3.2 Run button contract (any button that starts a GitHub run)

| State | Label | Visual | Duration |
|---|---|---|---|
| idle | "Run now" | secondary button; sub-caption "1 of 26 runs left today" | — |
| dispatching | "Starting…" | spinner | until the API returns |
| queued | "Queued on GitHub" | blue dot | until the run appears (poll 5 s, give up after 60 s → "Started, but run not found — open GitHub") |
| running | "Running · 2m 14s" | blue pulse and a "View" link | live |
| succeeded | "Done · Short scheduled 03:35" | green check | **persists** (the row status replaces it) |
| failed | "Failed at Upload — token revoked" | red; [Retry] [Logs] | persists until acknowledged |
| refused | the server's `error` verbatim, translated ("Hourly limit reached — next slot 23:00") | amber | persists |

Never reset to idle on a timer (that's today's `ActionButton.js:26`).

### 3.3 Warnings triage redesign

```
Warnings        [Blocking 1] [Action needed 0] [Warning 2] [Advisory 0]  ☐ show informational
───────────────────────────────────────────────────────────────────────────────
⛔ BLOCKING · publishing stopped                                The Money Rulebook
   Upload token was revoked by Google
   What it means: new videos can't upload until you reconnect.
   Fix: [Reconnect channel]      opened 2h ago · last checked 4 min ago ✓
   ▸ Evidence & policy citation          [Check again]  [Mark as seen]  [Close with note…]
```

- Group by **severity first**, then channel; blocking rows get a 3px `--bad` left border.
- One primary action per row, the fix from `recommended_action` turned into a button where there's a route for it. Secondary actions are labelled by consequence.
- "Mark as seen" turns the row's dot from filled to hollow. The badge counts **unseen blocking + action_required** only.
- Close-with-note opens a small dialog (textarea plus "This will be recorded in the audit log"), not a 160px inline input.

### 3.4 Alert and notification design rules (adopt as a standard)

1. **No signal without data.** Every badge, dot, pulse and "live" chip binds to a fetched value. If the value is unknown, show grey "?" and never green. (Kills OPS-02, 03, 08, 24.)
2. **Three states, always:** `ok`, `problem` and `unknown`. A failed fetch is `unknown` and must say so in words.
3. **Badges count only what needs action:** unseen `blocking + action_required` warnings plus failed runs today. Informational never increments a badge. Cap the display at "9+".
4. **Severity is one shared module** (`components/severity.js`): blocking = red ⛔ "Publishing stopped"; action_required = amber ! "Needs you"; warning = yellow ▲ "Watch"; advisory = grey i "FYI"; informational = no chip (history only). Icon and text always come with the colour (WCAG 1.4.1).
5. **Every alert answers three questions in plain English:** what happened, what it affects ("publishing stopped / not affected") and what to do (a button).
6. **The bell is an inbox, not a feed.** Rows are unseen actionable items, newest first; clicking deep-links to the exact row (`/operations?tab=warnings#w-123`). Show "Mark all seen" and a footer with "Last checked 23:04".
7. **Dedupe and roll up:** the same code + channel within 24h is one row with "×3". Five topic approvals is one activity line.
8. **Freshness is always visible:** each status shows its age ("checked 4 min ago"). Data older than 2× its refresh interval turns amber.
9. **One time zone everywhere** (owner local, with the TZ label), and relative times handle the future ("in 6h").
10. **Phone (ntfy) gets only blocking and failed-run alerts,** each with a deep link. Advisory stays in the panel.
11. **Destructive or billable actions state their cost** on the control ("uses 1 of 30 daily runs"). They confirm only when the action is bulk or near the limit, so you don't learn to click through dialogs.

### 3.5 Tasks → "Inbox"

Keep the three-column board (it's clean in `page-tasks--desktop.png`), but:
- Fix the false-green (OPS-03) and the chip mapping (OPS-10).
- Add a fourth column, **Failed runs (24h)**, from `/api/runs`.
- Header copy: "2 things need you" or, when it really is zero and data is fresh, "You're all caught up · checked 23:04".
- Each item gets its primary action inline (Approve / Fix / Retry), not just "full triage →".

---

## 4. Quick wins (each ≤ 1 day)

1. Delete the hardcoded sidebar badges `1` and `3` (`AppShell.js:148-157`). Five minutes.
2. Make `/api/warnings` GET return 503 when the DB isn't ready (`route.js:25`). Make `useOpenWarnings`, Tasks and Home treat any `error` as **unknown**, never "quiet".
3. Fix the Warnings page error state: no spinner after an error, plain copy and a Retry button (`warnings/page.js:150-153`).
4. Add one shared severity map and use it in the bell, Tasks and Warnings, with the display sort blocking-first (OPS-09, OPS-10).
5. Logs: add the Status column (scheduled/published from the existing `l.status`), a future-aware `timeAgo`, `watch?v=` for episodes, and dedupe by `videoId`.
6. DataTable: default `isRowHeader` to the first labelled column. That clears 64 console errors across /logs, /content and /videos.
7. Remove the duplicate `actions` from `PIPELINES`. One run control per channel row, and rename "Force Doc + Clips" to "Force episode today".
8. Show the server's error text on failed dispatches, and add the "Manual runs: n / 30 today" meter (the limiter data is already per actor).
9. Breadcrumb from `ALL_NAV_ITEMS`. Rename /tasks to "Inbox" and fix its active nav group.
10. Remove the static "live" chips, the stale `studio-logs/` card and the printed ntfy topic. Rename "Engine live" to "Last run 12m ago", or hide it until it's wired.
11. Strip `AC-P4-15`, `D11`, snake_case chips and `channel_id` from visible Warnings copy and use channel labels.
12. When embedded in the hub, hide child PageHeaders and point "Open logs" at `?tab=logs`.

## 5. Bigger bets (multi-day, high impact)

1. **Run telemetry (2–3 days).** `/api/runs` on the GitHub runs/jobs API, a `run-name` on `channel-autopilot.yml`, correlating each dispatch to its run, a Neon cache of runs (so the panel doesn't spend GitHub API calls on every view), and the button state contract in §3.2. Everything else in this report builds on it.
2. **Operations "Today" screen (3–4 days).** §3.1: channel rows with status, result, mini-timeline, a Logs drawer with per-step status, inline Retry/Fix and an "Up next" upload rail. Retire the static PIPELINES cards.
3. **Unified alert pipeline (2–3 days).** Failed runs automatically open a `warnings` row (code `run_failed`, `job_id` = run id), so the bell, Inbox, ntfy and Operations all read one source. Add the dedupe/roll-up and freshness rules from §3.4.
4. **Real engine heartbeat (1–2 days).** Replace "Engine live" with heartbeat health (last successful run age per channel, plus a missed-slot detector: "MR's 00:05 slot passed with no run"). This alarm catches GitHub cron drops, which the workflow comments say are common (`channel-autopilot.yml:44`).
5. **Mobile ops view (2 days).** A card layout for Today and Uploads at under 640px, so the owner can answer "did it run?" from a phone after an ntfy push.
