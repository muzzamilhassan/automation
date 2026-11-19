# Quarry Studio: UI/UX redesign plan (consolidated)

Date: 2026-11-18 · Author: head of design (consolidation of 12 expert audits) · Mode: read-only research
Inputs: `research/ui-ux-audit-2026-11-18/01…12-*.md` (291 findings, 31 marked P0), the shared brief, the screenshots in `%TEMP%\studio-ui-audit\shots-full\`, and the **current** code under `studio/` (re-read today, after #125 live sidebar channels and #126 live bell / home alerts / tasks board).

How to read the markers:
- ✅ = I opened the file and the code says what the experts claim, as of today.
- ⚠ = the claim holds only in part. I downgraded it or corrected it. The reason is given.
- (reported) = I did not re-check it myself. It comes from the expert's report.

---

## 1. Plain-English summary for the owner

- **The panel sometimes says untrue things, and that has to be fixed before anything else.** Several numbers are typed into the code and never change: Studio "3", Operations "1", "Channels (16)", "Engine live", "100+ templates". When the database is down, the bell, Home and Tasks all say "Nothing needs attention, all probes are quiet". When YouTube Analytics fails, you see 0 views under a green "real data" badge. The first job ("Phase 0", about a week) is making every number, badge and status either real or hidden.
- **The panel can't tell you whether today's videos actually got made.** The buttons start jobs on GitHub, but nothing reads back "succeeded at 02:39" or "failed at upload". That is the most important missing feature.
- **Some buttons are unsafe or broken.** One Enter key in the search box (⌘K) starts a real production run with no "are you sure?". "Attach thumbnail" and "Redesign N" change live YouTube thumbnails with one click. The Add Channel wizard can't actually switch a channel on. "Use Style" on Templates forgets the style you picked.
- **The menu is organised the way the engine is built, not the way you work.** 19 screens are reachable at 41 web addresses under about 60 names. Clicking a channel in the sidebar doesn't open that channel. Analytics has no menu entry.
- **It looks like three different apps stitched together.** There are three button styles, two badge styles, sky-blue pages next to lavender ones, about 18 hand-picked text sizes, and small grey text that is too faint to read comfortably.
- **On a phone it's a shrunken desktop.** Three pages are wider than the screen. Approve and Reject are tiny text links. The music play buttons are invisible.
- **Recommended direction: a "calm automation cockpit".** Home shows either "all good" or "2 things need you". The menu uses your words: Today, Inbox, Channels, Runs, Library, Analytics. Each channel gets its own page. Videos and Analytics look like YouTube Studio, which you already know.
- **Order of work:** Phase 0 makes it truthful (about 1 week), then Phase 1 builds one design kit (about 2 weeks), then Phase 2 delivers the new menu, cockpit home, channel pages and run history (about 3 weeks), then Phase 3 rebuilds the library, wizard and pipeline board (about 3–4 weeks). Every phase is shippable on its own.

---

## 2. Cross-cutting themes

Duplicate findings are merged into one theme each. The numbers in brackets are the source reports.

| # | Theme | Raised by | Verified core evidence |
|---|---|---|---|
| T1 | **Hard-coded badges, counts and "all good" lights.** Studio "3", Operations "1", Review tab "3", "Channels (16)", "100+ engines", "Drafts Inbox (14 · 4)", "Engine live", "Engine connected", "live" chips, "real data" chips | 01, 02, 03, 04, 05, 06, 09, 10, 11, 12 | ✅ `AppShell.js:148-157`, `:289-293`, `:369-374`; `studio/page.js:14`; `network/page.js:12`; `templates/page.js:61,64`; `page.js:157` |
| T2 | **False all-clear when the database is down.** `/api/warnings` and `/api/review` return HTTP 200 with empty lists, so the bell, Home "Needs attention" and Tasks all show "quiet" | 06, 11, 12 (03 partly) | ✅ `api/warnings/route.js:25`, `api/review/route.js:84`, `use-open-warnings.js:13-16` (`canSee: Boolean([])` = true), `tasks/page.js:22-29`, `page.js:187-207` |
| T3 | **Errors converted to zeros or empty states.** Analytics failures become 0 under a green badge. Sessions shows "No sessions" while you are signed in. Thumbnails has 18 silent `catch → []` | 03, 07, 08, 11, 12 | ✅ `api/analytics/route.js:138-140`, `analytics/page.js:296-298` (`?? 0`), `api/sessions/route.js:24` |
| T4 | **No run results, so you can't answer "did today run?"** Dispatch-and-forget, "Started ✓" disappears after 5s, Logs is only an upload ledger, scheduled videos show "just now" | 03, 04, 06, 11, 12 | ✅ no `actions/runs` call anywhere in `studio/`; `ActionButton.js:26`; `lib/utils.js:34`; false footnote `production/page.js:298-303` |
| T5 | **Navigation sprawl.** 19 screens at 41 URLs. Dead `/network?channel=` links. No per-channel page. Breadcrumb says "Quarry Studio / Quarry Studio". Two H1s on every hub. Analytics not in the menu | 01, 02, 04, 05, 06, 07, 08, 09, 10, 11, 12 | ✅ `AppShell.js:181`, `:280-281`; `nav.js:26-66`; no `get('channel')` in any page; no page takes an `embedded` prop |
| T6 | **One channel, many names.** "OLD MONEY CODE" / "Debt-Free Doctrine" / `debt-free-doctrine` / OMC / DFD. "TH" for The Money Rulebook | 01, 03, 05, 06, 07, 12 | ✅ `lib/brands.json` label "OLD MONEY CODE" vs `yt-mcp/studio-channels.json:5` "Debt-Free Doctrine"; `short` = first 2 characters (`api/overview/route.js:99`) |
| T7 | **Static maps still in the panel** (breaks the owner's no-static-maps / real-channels-only rules): `RETENTION`, `INTEGRATIONS` (mentions FAJR OF QUR'AN), `MUSIC_MOODS`, `PIPELINES` (DFD/OMC), thumbnail defaults "MONEY HABITS / RULES", Social health notes ("valid until ~Oct 29") | 03, 04, 05, 06, 07, 08 | ✅ `lib/site-data.js:8-14, 112, 119-130`; `thumbs/page.js:39-41`; `channels/page.js:92` |
| T8 | **Three component vocabularies.** `.btn*` CSS, UntitledUI `<Button>` and about 130 raw `<button>`s. Chip vs Badge. 5 tab/filter looks. Sky/zinc off-brand pages | 02, 04, 05, 07, 10 | ✅ `.bg-brand-solid` hex override `globals.css:548-550`; sky classes in `create/`, `templates/` |
| T9 | **Broken type and spacing scale.** `html{font-size:14px}` makes the spacing unit 3.5px. 641 arbitrary `text-[Npx]` uses (18 distinct px values, plus named steps) | 02, 09, 10 | ✅ `globals.css:96-98`; grep count 641 (report said 649) |
| T10 | **Contrast.** `--faint` 3.85:1 on cards. Sidebar labels 4.09:1. In light theme every status chip fails, because the status colours are identical in both themes | 02, 09, 10 | ✅ `globals.css:57/80` (same `#64748b`), `:61-63/84-86` (same `--ok/--warn/--bad`) |
| T11 | **CSS layering bug.** `globals.css` has **zero** `@layer` blocks, so `.icon-btn` beats `lg:hidden`. The result is a dead hamburger and a duplicate search button on desktop | 01, 09, 10, 11 | ✅ `globals.css:308`, `AppShell.js:337,365` |
| T12 | **Mobile overflow and tiny targets.** Channels/Network render at 538px and Settings at 492px on a 390px phone. Approve/Reject are text links. Inputs under 16px cause iOS zoom | 05, 07, 09 | ✅ PNG widths checked; `channels/page.js:96-140` (no `flex-wrap`); `review/page.js:192` |
| T13 | **Accessibility root causes.** DataTable `isRowHeader` (64 runtime errors). Popups with no Escape, focus trap or ARIA. No skip link. One `<title>` for every page. TabNav `aria-controls` points at panels that don't exist | 06, 07, 10, 11 | ✅ `DataTable.js:23`; `AppShell.js:74-115, 395-423`; one `metadata` in `app/layout.js`; `TabNav.js:23,46` |
| T14 | **Unsafe actions.** ⌘K runs production with no confirm and no result check. Live YouTube thumbnail attach and bulk redesign with no confirm. 7 `window.confirm` call sites. No toast system | 01, 04, 05, 06, 08, 11 | ✅ `CommandPalette.js:82-89, 118-125`; `thumbs/page.js:187-209, 299-316`; 7 files with `window.confirm`; zero toast code |
| T15 | **Broken flows.** The wizard can't start autopilot (and ▶ resume skips consent). "Use Style" drops the template. Create preview loads from a private-repo raw URL | 04, 05 | ✅ `channels/add/page.js:323,824,869-881`; `api/channels/flow/route.js` (no consent write); `templates/page.js:223,250` + no `template` handling in `create/page.js`; `create/page.js:149` |
| T16 | **Developer jargon in owner copy.** "db unavailable", "Phase 4 S4", "#106", "AC-P4-15", "A1 session upgrade", "smoking gun", `DATABASE_URL missing` | 03, 04, 05, 06, 08, 11, 12 | ✅ `analytics/page.js:247,317`; `nav.js:31` |
| T17 | **Secrets and identity leaks.** ntfy topic printed on 3 pages (and in source, which matters for the planned public repo flip). Account menu hard-codes "Muzzamil Hassan · Studio owner" for every user | 06, 08 | ✅ `settings/page.js:267`, `site-data.js:129`; `AppShell.js:400-410` |

---

## 3. Phase 0 — "Make it tell the truth" (must ship before any redesign)

Rule for this phase: **no new screens.** Every item removes a lie, a dead control or an unsafe one-click action. Total effort is about **5–6 developer-days**. That is 23 items, mostly S (S = under half a day, M = 1–2 days, L = 3+ days).

### 0-A. Untrue things

| # | Problem | Evidence (file:line) | Fix | Effort | Sources |
|---|---|---|---|---|---|
| P0-1 | Hard-coded counts | ✅ `AppShell.js:148-157` (`3`, `1`); ✅ `studio/page.js:14` (`badge:'3'`); ✅ `network/page.js:12` ("Channels (16)"); ✅ `templates/page.js:61` ("100+"), `:64` ("14 Full Stories · 4 Chapters") | Delete every literal. Operations badge = `useOpenWarnings().rows.length`. Studio and Review tab badge = pending count from `/api/review`. Channels tab = `useBrands().channels.length`. Templates header = real registry count. **Hide any badge whose value is 0 or unknown.** | S | 01, 03, 04, 05, 06, 09, 10, 11, 12 |
| P0-2 | False all-clear when the DB is down | ✅ `api/warnings/route.js:25` and ✅ `api/review/route.js:84` return 200 + `[]`; ✅ `use-open-warnings.js:16` (`canSee: Boolean(d.open)`); ✅ `tasks/page.js:22-29`; ✅ `page.js:187-207` and `AppShell.js:89-92` ("All probes are quiet") | GET returns `503 {ok:false, code:'DB_DOWN'}`. The hook exposes `status: ok / error / forbidden`. Bell, Home and Tasks render "Can't check warnings right now — status unknown · Retry", with a grey "?" on the bell and **never** "quiet". | S | 06, 11, 12 |
| P0-3 | Fake health lights | ✅ `AppShell.js:289-293` ("Engine connected", fixed green), ✅ `:369-374` ("Engine live"); "live" chip on every pipeline card `production/page.js:257` (reported) | Remove all three now. The real status pill arrives in Phase 2 (built from run telemetry). | S | 01, 03, 06, 11, 12 |
| P0-4 | Analytics failure shown as 0 under a green "real data" badge | ✅ `api/analytics/route.js:138-140` (catch → zero totals, no `error` on `all`); ✅ `page.js:157` (constant chip); ✅ `analytics/page.js:296-298` (`?? 0`); ✅ home skeleton forever when analytics is null (`page.js:60,155`) | API adds `coverage:{ok:[], failed:[{slug,error}]}` and `fetchedAt`, and doesn't cache an all-failed result. UI shows `—` (not 0) for failed channels. The chip becomes "YouTube · through Nov 15" (live), "3 of 5 channels" (partial) or "Unavailable · Retry" (failed). | M | 02, 03, 11, 12 |
| P0-5 | Two-month-old retention drawn as live | ✅ `lib/site-data.js:8-14` (`RETENTION`, "Sep 19"); ✅ `analytics/page.js:102,312`; "smoking gun" copy ✅ `:317` | Delete `RETENTION`. Draw only live `avgWatched`. Channels without data get a dashed "no data — needs analytics access" bar. Generate insight copy only from live values. | S | 03 |
| P0-6 | Settings shows fake controls and stale facts | ✅ notification switches are local state only (`settings/page.js:87, 269-283`); ✅ static `INTEGRATIONS` (`site-data.js:119-130`, includes "FAJR OF QUR'AN", "Threads valid until ~Oct 29", "Script brain failing"); ✅ "light is fully supported everywhere" (`:243`); ✅ "Plus Jakarta Sans" via undefined `--font-jakarta` (`:249,253`) | Replace the switches with read-only text ("Phone alerts: on — milestones + failures"). Remove the integration status chips, or label them "as of <date>, not live". Delete the Typography card. Change the light-theme sentence to "Light theme (beta)". | S | 02, 08, 11, 12 |
| P0-7 | Account menu shows the owner's identity to everyone | ✅ `AppShell.js:400` (title), `:402` ("MH"), `:409-410` ("Muzzamil Hassan · Studio owner · trusted 30 days") | Read name, email, role and sign-in method from the session (`getUser` already has them). Compute initials with one helper. | S | 08, 11 |
| P0-8 | Logs show tomorrow's uploads as "just now", and Production promises run history that doesn't exist | ✅ `lib/utils.js:34` (`Math.max(0, …)`); status computed but not rendered (`lib/data.mjs:287-291`, reported); ✅ `production/page.js:298-303` ("Run history, upload status, and failures appear in Execution Logs") | Make `timeAgo` future-aware ("in 6h"). Add a Status column (Scheduled / Published). Rewrite the footnote: "Uploads appear here. Run success/failure tracking is coming." | S | 06, 07 |
| P0-9 | A blocking alert looks like an informational one | ✅ `warnings/page.js:135` sorts by the storage ladder, so **informational sorts above blocking** (`warnings-store.mjs:51`); ✅ bell `AppShell.js:76-77`, ✅ `tasks/page.js:13`, home dot `page.js:198` key on `bad/warn/info`, but real values are `blocking/action_required/…` | One `components/severity.js` `{label, tone, icon, rank}` used by bell, Home, Tasks and Warnings. Display order: blocking > action_required > warning > advisory > informational. | S | 06 |
| P0-10 | One channel, two names; "TH"/"OL" codes | ✅ `lib/brands.json` vs ✅ `yt-mcp/studio-channels.json:5`; ✅ `api/overview/route.js:99` | **Owner decides the real name (Decision 2).** Fix the data so the wizard list and `/channels` read one registry projection. Store `short` in the registry instead of deriving it. Show the label, never the slug (`videos/page.js:135`, `logs/page.js:88`, `page.js:312`). | S (+ decision) | 01, 03, 05, 06, 07, 12 |
| P0-11 | "Shorts today: 1 queued" counts the *last* run, which may be yesterday's | ✅ `api/overview/route.js:78` (`todayVideos: lastVideos.length`, no date check) | Count only when `lastRun === today`. Change "queued" to "made". Otherwise show "not run today". | S | 03 |

### 0-B. Broken, dead or unsafe

| # | Problem | Evidence | Fix | Effort | Sources |
|---|---|---|---|---|---|
| P0-12 | Error and an endless spinner at the same time | ✅ `review/page.js:62-68` + `:157-163`; ✅ `warnings/page.js:105-113` + `:150-153` | One status value per region. On error, show an error card: "Can't load the review queue. Held scripts are safe, nothing publishes until you approve. [Try again]". Never show a spinner after an error. | S | 04, 06, 09, 11, 12 |
| P0-13 | ⌘K starts a production run on one Enter with no result check | ✅ `CommandPalette.js:82-89, 118-125` (no confirm, no `r.ok`, always navigates) | Second-Enter confirm ("Press ↵ again to start Quote Quarry Shorts — uses 1 of 30 daily runs"). Show the server's result inline. Navigate only on success. | S | 01, 11 |
| P0-14 | Live YouTube thumbnails change with one click | ✅ `thumbs/page.js:299-316` (attach), ✅ `:187-209` (bulk), no confirm | Confirmation sheet with before/after at feed size, "uses 1 of 10 daily changes", and the count for bulk ("Change 6 live thumbnails?"). Keep the previous image so it can be restored (later). | M | 04 |
| P0-15 | Wizard can't start autopilot, and ▶ resume skips the consent record | ✅ `channels/add/page.js:823-824` (only `saveProfile()`), `:869-881` (unreachable "Autopilot started"), `:880` (wrong "pencil → Resume" copy); ✅ `api/channels/flow/route.js` has no consent write (consent exists only in `profile/route.js:113-118`) | Add a final step: consent checkbox plus **Start autopilot** (`saveProfile(true)`) or **Save, keep paused**. ▶ on a channel without `consentedAt` opens the same consent sheet. Fix the Done copy. | M | 05 |
| P0-16 | "Use Style" silently drops the chosen template | ✅ `templates/page.js:223,250` push `/create?template=`; ✅ `create/page.js` never reads it | Read `template` with `useSearchParams` and preselect it (stop-gap; the real fix is "Use on channel…" in Phase 3). | S | 04 |
| P0-17 | Sidebar and ⌘K channel links ignore the channel | ✅ `AppShell.js:181`, `CommandPalette.js:98`; no page reads `?channel=` | Stop-gap: `/channels#<slug>` scrolls to and highlights the card, and the sidebar row gets an active state. The real channel page comes in Phase 2. | S | 01 |
| P0-18 | DataTable throws 64 errors and rows have no accessible name | ✅ `DataTable.js:23` (`isRowHeader={Boolean(c.rowHeader)}`, no caller sets it) | Fall back to the first labelled column. Mark `title` as `rowHeader` in logs and videos. Give blank headers sr-only labels. | S | 06, 07, 10 |
| P0-19 | Music play buttons are invisible | ✅ `music/page.js:111` (`color: … 'transparent'`) | Use the muted ink colour. 40px touch target. | S | 07, 09 |
| P0-20 | Undefined CSS tokens silently break styling | ✅ `--surface-1` (`templates/page.js:72,134`, `templates/registry/page.js:99`, `TemplateSimulator.js:35`), ✅ `--error` (`usage/page.js:32,122,153`): neither is defined anywhere | Rename to `--surface` / `--bad`. Add a CI grep that fails on any undeclared `var(--x)`. | S | 02 |
| P0-21 | Dead hamburger and duplicate search button on desktop | ✅ `globals.css:308` unlayered `.icon-btn` (the file has **0** `@layer`); `AppShell.js:337,365` | Wrap the component classes in `@layer components {}`. | S | 01, 09, 10, 11 |
| P0-22 | Three pages are wider than a phone | ✅ PNG widths: channels 538, network 538, settings 492; ✅ `channels/page.js:96-140` (name + chip + 6 icon buttons, no wrap) | `flex-wrap min-w-0`, actions on a second row. `min-w-0` + `break-all` on Settings key/value rows. | S | 05, 09 |
| P0-23 | ntfy alert topic printed in the UI and in source | ✅ `settings/page.js:267`, ✅ `site-data.js:129`, `logs/page.js:112` (reported) | Mask it in the UI, move it to an env var, and **rotate it before the planned public-repo flip**. It is already visible in today's screenshots. | S | 06, 08 |

**Phase 0 exit test:** with `DATABASE_URL` unset locally, no page shows "quiet", "0 views", "real data", a constant badge, a green engine light or a spinner next to an error. Run the crawler once in that mode and once against production.

---

## 4. Quick wins (each ≤ 1 day; do alongside or right after Phase 0)

1. **Breadcrumb** from `ALL_NAV_ITEMS` with longest-prefix match, plus the hub tab label ("Operations / Logs"). `AppShell.js:280-281`. (01, 02, 04, 05, 06, 07, 08, 09, 10, 11, 12)
2. **Add Analytics to the sidebar.** Remove the Home "Deep Analytics" tab. Link "Real 28-day numbers live on the Analytics page". (01, 03, 12)
3. **One header per hub:** an `embedded` prop on child pages hides their `PageHeader` and renders an `<h2>`. "Open logs" links to `?tab=logs`. (01, 02, 04, 05, 06, 07, 08, 09, 10)
4. **Plain-English copy sweep:** remove "Phase 4 S4", "#106", "#120", "AC-P4-15", "D11", "A1 session upgrade", "smoking gun", "Dreams UI", and the "Oct 1" / "Oct 29" stale dates. Add a `lib/error-copy.js` map for `db unavailable`, `DATABASE_URL…` and `HTTP 503`. (03, 04, 05, 06, 08, 11, 12)
5. **Contrast patch:** dark `--faint` → `#8b95a5` (chosen over 10's `#7d8a9c` for more margin). Sidebar labels `#6b7671` → `#848f9c`. Light-only status foregrounds `#047857 / #b45309 / #dc2626 / #0369a1`. (02, 10)
6. **`html { font-size: 87.5% }`** instead of `14px`. Zero visual change, and it respects the user's browser font setting. (10)
7. **Touch rules:** `@media (pointer:coarse)` with 16px inputs (stops iOS zoom), 44px `.qs-side-link` / `.icon-btn` / ButtonUtility. (09)
8. **Review:** `grid md:grid-cols-2` (`review/page.js:192`). Filled primary "Approve" and outline "Reject". Hide "Redispatch" unless it's relevant. (04, 09)
9. **Logs/Videos hygiene:** dedupe by `videoId` (`lib/data.mjs` `allLogs`) and drop the `-${i}` key suffix. `watch?v=` for episodes (`logs/page.js:92`). Neutral platform chip instead of red `bad` for YouTube (`logs/page.js:87` ✅). (06, 07, 10)
10. **`formatHandle`** helper: no "@@", and "Not linked" instead of "@undefined" (`social/page.js:96` ✅, `channels/page.js:161,164`). (07, 09, 11)
11. **Thumbnails in the Videos table** from `i.ytimg.com/vi/{id}/mqdefault.jpg` (no quota), plus a channel filter using `useBrands()`. (07, 12)
12. **Remove static defaults:** thumbnail "MONEY HABITS / RULES / Killing" (`thumbs/page.js:39-41` ✅) → empty fields with placeholders. `MUSIC_MOODS` → kit data. (04, 05, 07)
13. **Duplicate keys and duplicate data:** topics key by `videoId` (`topics/page.js:127,137`). Remove the music duplicates in `lib/music-urls.json`. (04, 07)
14. **Escape closes** the bell, account menu and mobile drawer. Bell `aria-label="Alerts, N open"`. `aria-current` on the sidebar. Skip link. Per-route `<title>` via route `layout.js` metadata. `scroll-padding-top: 72px`. (10, 11)
15. **TabNav:** edge fade + scroll the active tab into view. Short phone labels. `grid-cols-2 sm:grid-cols-3` stat grids on Users, Sessions and Warnings. (08, 09)
16. **Settings de-dupe:** move the Team invite card to Team, and the password and sign-ins cards to Security. Add a password-login banner explaining why no devices are listed. (01, 08)
17. **Sidebar clean-up:** remove the retired TikTok dashboard link and the one-item "Preferences" heading. Hide "Parked brands" when it's empty. (01, 05)
18. **Operations:** one run control per channel ("Produce now" and "QQ Shorts" and "QQ episode" all dispatch the same workflow, ✅ `api/action/route.js:20-21`). Rename the episode button to "Force episode today" (`force-doc`). Show the server's error text plus a "Manual runs today n/30" meter. (06)
19. **Create Video poster** through an authenticated route instead of `raw.githubusercontent.com` (private repo, ✅ `create/page.js:149`). (04)
20. **Login:** map `?error=` codes to a fixed dictionary (anti-phishing). `autoComplete="current-password"`. `role="alert"`. (08, 10)

---

## 5. Recommended redesign direction

### 5.1 Testing report 12's candidate against the other eleven

Report 12 recommends **Direction C, the "calm automation cockpit"**: exception-first home, job-named pages, one channel scope, runs as a list, YouTube vocabulary for Videos and Analytics, ⌘K kept, and three honest states per widget.

| Report | Fits C? | What it changes in the final direction |
|---|---|---|
| 01 IA | Yes | 01's 7-destination sitemap and per-channel page are better specified than 12's. **Adopted.** I keep 12's "Runs" label instead of 01's "Activity" because it is concrete and answers "did it run?". |
| 02 Design system | Neutral (it's the foundation) | C is unbuildable without one kit. Phase 1 is non-negotiable. |
| 03 Dashboard | Yes | Its "morning questions" home (status strip → needs you → channels today → growth) **is** the cockpit. Its wireframe is merged below. |
| 04 Creation | Partly | Its kanban "Production board" competes with Inbox + Runs. **Decision:** Inbox + Runs + channel page first (Phase 2). The board is a Phase 3 view over the same data, built only if the owner still asks "where is my idea?". The two-pane Review is adopted inside Inbox. |
| 05 Onboarding | Yes | Its `channelHealth(slug)` is the same health model C needs. Its card pattern becomes the channel page header. Stepped wizard in Phase 3. |
| 06 Ops | Yes, strongly | Run telemetry (`/api/runs` + `run-name` on `channel-autopilot.yml`) is the **backend prerequisite** for C. Its alert rules (3 states, no signal without data) become design principles. |
| 07 Content | Yes | YouTube-Studio Content columns plus the cross-post matrix become "Library". |
| 08 Settings | Yes | Left-rail Settings with sub-routes (Stripe/GitHub pattern). |
| 09 Mobile | Yes | Pocket mode = the cockpit on a phone. 09's four tabs (Today · Approve · Alerts · More) collapse to **Today · Inbox · Channels · More**, because Inbox already merges approvals and alerts. |
| 10 A11y | Neutral | Requires react-aria overlays and tabs, so it sets the kit choice. |
| 11 States | Yes | Its `useResource` + `<DataState>` standard and 503 API contract implement C's "three honest states" principle. |

**Where 12 is wrong or optimistic:**
1. Its quick win #7 ("feed Integrations failing/attention into Needs attention") would spread **static** strings into the home page, because `INTEGRATIONS` is hard-coded (✅ `site-data.js:119-130`). **Dropped.**
2. Its sitemap has no per-channel page (01 shows this is the main gap at 30 channels). **Added.**
3. Its "Schedule" calendar is deferred to Phase 3. An "Up next" rail on Runs and on each channel page covers the need first.
4. Its "~3 weeks" ignores Phase 0 and Phase 1. Realistic total is **8–10 weeks** of one developer, shippable in slices.

### 5.2 Final direction

**Calm automation cockpit, built on one design kit, with YouTube Studio vocabulary for content and analytics.**

Principles (each one is testable):
1. **No signal without data.** Every badge, dot, count and chip binds to a fetched value. Unknown means a grey "?" plus words, never green, never 0.
2. **Exception-first.** Home is quiet when things are fine (one green line). Colour and space go only to what needs the owner.
3. **Every region has exactly one state:** loading (skeleton) / ready / empty (with reason + next step) / not-yet (with date) / stale (keep data + banner) / error (Retry) / unavailable / forbidden.
4. **Pages are named after jobs, one name per screen,** used in the sidebar, H1, breadcrumb, ⌘K and URL.
5. **Channels are first-class:** one name, one mark, one page, one health state, computed server-side and reused by sidebar dot, card, bell and Today.
6. **Anything that touches YouTube or spends a run states its cost.** Live writes and bulk or remote-triggered runs confirm. Single in-page runs show "uses 1 of 30 today" instead of a dialog (avoids click-through fatigue).
7. **One time zone:** the owner's local time with a TZ label, UTC on hover.
8. **One kit:** one Button, Badge, Tabs, SegmentedControl, Card/Inset, PageHeader/SectionHeader, DataTable, Overlay, Toast and ConfirmDialog. Nothing hand-rolled outside it.

### 5.3 Target sitemap (from 01 §3.2, adjusted)

```
SIDEBAR                         URL                               replaces
Today                           /                                 /, /?tab=pulse, /tasks (Tasks board is Inbox v0)
Inbox (n)                       /inbox                            —
  Scripts                       /inbox/scripts                    /review, /studio, /studio?tab=review
  Topics                        /inbox/topics                     /topics, /studio?tab=topics
  Template drafts               /inbox/drafts                     /templates/drafts
  Alerts                        /inbox/alerts                     /warnings, /operations?tab=warnings
Channels                        /channels                         /network, /channels, /network?tab=channels
  (one channel)                 /channels/[slug]                  /network?channel=X  (NEW page)
  (its settings)                /channels/[slug]/settings         /channels/add?edit=X, card inline panels
  Add channel                   /channels/new                     /channels/add
Runs                            /runs                             /operations, /production, /logs
  Today | History | Uploads     /runs, /runs/history, /runs/uploads
Library                         /library/videos                   /content, /videos
                                /library/cross-posts              /social
                                /library/music                    /music
Analytics                       /analytics                        /analytics, /?tab=analytics
── Create ──
  Video                         /create/video                     /create, /studio?tab=create
  Thumbnail                     /create/thumbnail                 /thumbs, /studio?tab=thumbs
  Templates                     /create/templates                 /templates, /templates/registry[/detail], /styles
── CHANNELS (live list, status dot, links to /channels/[slug]) ──
── footer ── Settings           /settings/{profile,appearance,notifications,team,
                                 security,ai-services,usage,integrations,audit}
                                                                  /users, /sessions, /providers, /usage, /settings?tab=*
```
Redirects use the table in 01 §3.4, remapped to these paths. Ship them as 307 for a week, then 308. `/login`, `/proof` and `/client` stay untouched. One `lib/routes.js` registry `{id, path, label, icon, parent, keywords, badgeSource, roles}` drives the sidebar, tabs, breadcrumb, ⌘K and active state. That deletes the hand lists at `AppShell.js:36-54` and `nav.js:45-66`.

### 5.4 Home "cockpit" wireframe (merging 03 §3.1, 06 §3.1, 12 §4C)

```
┌ [All channels ▾] ──┬──────────────────────────────────────────────────────────────────────┐
│ ◉ Today            │ Wed 18 Nov · 23:40 PKT            [● 2 need you]  [⌘K]  [+ Create ▾]   │
│ ✉ Inbox        2   ├──────────────────────────────────────────────────────────────────────┤
│ ◎ Channels         │ TODAY  ✓ 4 of 5 Shorts made   ✗ 1 not run (YT-BOT)   Last run 21:35 ✓  │
│ ⚙ Runs        1✗   │                                                                      │
│ ▶ Library          │ NEEDS YOU (2)                         (collapses to "✓ All on track")│
│ ↗ Analytics        │ ✗ YT-BOT didn't run today · last run Nov 16     [Run now] [Open run] │
│ ── Create ──       │ ◐ 3 scripts waiting. Nothing publishes until you approve. [Review →]│
│   Video            │                                                                      │
│   Thumbnail        │ CHANNELS TODAY                                                       │
│   Templates        │ Channel            Today's Short        Episode        Next upload 7d│
│ ── Channels ──     │ (QQ) Quote Quarry  ✓ Published 03:35    ✓ Today        19:30·20h ▲18%│
│ ● QQ Quote Quarry  │ (MR) Money Rulebk  ◷ Scheduled 05:05    Nov 16 (2d)    05:05·5h  ▼9% │
│ ● IC Investor's C. │ (YT) YT-BOT        ✗ Not run            —              —         n/a │
│ ▲ YT YT-BOT        │                                                                      │
│ + Add channel      │ GROWTH · 7 settled days (through Nov 15) vs previous 7 [7d|28d|90d]  │
│                    │ Views 4.1K ▲12%   Watch hrs 61 ▲5%   Subs +38   Uploads 26/28        │
│                    │ [stacked daily bars, last 3 days hatched "still processing"]          │
│                    │                                                                      │
│ ⚙ Settings         │ ▸ Today's topics (4)  ▸ Trend radar     Lifetime: 241 subs · 90K views │
│ ● Last run 21:35 ✓ │ every number carries its source + age; failed sources show "—"       │
└────────────────────┴──────────────────────────────────────────────────────────────────────┘
```
At 30 channels, "Channels today" groups as failed → needs you → on track (collapsed: "show 24 on-track channels"). Data comes from one new `/api/today`, which joins `/api/overview`, `/api/runs`, `/api/warnings`, the review count and analytics `coverage`.

### 5.5 Per-channel page `/channels/[slug]` (01 §3.2 + 05 §3.2 + 06 row anatomy)

```
Channels / Quote Quarry                                    [⏸ Pause]  [Run now ▾]  [⋯]
┌───────────────────────────────────────────────────────────────────────────────────┐
│ (avatar) Quote Quarry   ● Healthy      Stoicism · @quotequarry302 · 219 subs      │
│ Next upload  Today 19:30 (in 3h) Short   Last upload ✓ 03:35 "Silence is power"   │
│ Google connection ✓ connected            Manual runs left today 26/30              │
└───────────────────────────────────────────────────────────────────────────────────┘
 Overview | Runs | Videos | Analytics | Settings
 OVERVIEW
 ┌ Needs you (0) ✓ nothing waiting ┐ ┌ Last 14 days runs ✓✓✓✓✓✗✓✓… [open] ┐
 ┌ Recent videos (thumbnails, status, views, 48h vs median) ───────── [all →] ┐
 ┌ 28-day analytics: views · watch hrs · subs · retention vs 70% goal ────────┐
 SETTINGS tab (replaces the 6 unlabeled card icons + edit-in-wizard):
   Schedule (local time, quota bar) · Video style · Voice & brand · AI keys ·
   Advanced (routing, cron) · Danger zone (Pause / Disconnect, type-to-confirm)
```
Health pill (one server function `channelHealth(slug)` feeding page, card, sidebar dot, bell and Today): Not uploading (red) → Setup incomplete (grey) → Needs attention (amber) → Paused (slate) → Healthy (green). Each non-green state has exactly **one** next-action button ("Re-connect Google", "Continue setup", …).

### 5.6 Mobile "pocket mode" (09 §4, adapted)

- Below `md`, show a bottom tab bar: **Today · Inbox (n) · Channels · More**. 64px tall plus safe-area inset. `viewport-fit=cover`.
- **Today** = status strip + "Needs you" + one card per channel ("QQ · Short ✓ 03:35 · next 19:30") + a 48px "Pause everything" with a confirm sheet. No empty charts.
- **Inbox** script detail: full-width 16px script, swipeable thumbnail candidates, sticky 48px **Reject / Approve** bar. ntfy pushes deep-link to `/inbox/scripts?id=…` (two taps from notification to approval).
- Every DataTable gets `columns[].mobile: primary|meta|hide` and renders as a card list below `md`. Never scroll a primary table sideways.
- Tablet (768): show the 56px icon rail from `md` instead of the hamburger.
- Editing screens (Thumbnails, Templates, AI services, wizard) remain reachable on phones but are not optimised for them.

### 5.7 Design-system plan (02 §3, with 09/10 resolved)

1. **Tokens, in 3 layers:** primitives → semantic roles (redefined per theme) → component tokens. Roles: `canvas, surface, surface-raised, surface-sunken, border-subtle/border/border-strong, text-primary/secondary/tertiary/disabled, accent/-hover/-subtle/-text, on-accent, success/warning/danger/info-{fg,bg,border}` with **different light foregrounds**, `side-*`, `platform-*` (icon colour only), `series-1..8`, `scrim`, z-scale (popover 50 / drawer 60 / modal 70 / palette 80 / toast 90). **Alias UntitledUI's variables onto these**, so there is one neutral ramp. Delete the `.bg-brand-solid` hex override.
2. **Type scale (px-defined, floor 11px):** display 28 · title-lg 20 · title 16 · body 14 · body-sm 13 · caption 12 · overline 11 caps · mono 12 · stat 28 tabular. Weights 400/500/600/700 only. Codemod the 641 `text-[Npx]` uses. Lint-ban new ones.
3. **Spacing:** `--spacing: 4px` in `@theme`, so spacing no longer depends on the root size. Root becomes 87.5% first (quick win), then 100% once no rem-based text remains. Gate both changes on a full screenshot diff. Disagreement resolved: 02 wants to fix spacing, 10 wants the root to respect user settings. Both are done, in that order.
4. **Radius** sm 6 / md 8 / lg 12 / full. **Elevation** 4 levels. No card inside a card (use `Inset`).
5. **ONE component kit on UntitledUI/react-aria:** `Button` (primary / secondary / ghost / danger × sm 28 / md 36 / lg 44), `Badge` (tone × size × dot/icon) + `CountBadge` (renders nothing when undefined), `Tabs` (navigation) + `SegmentedControl` (filters, radiogroup), `Card` / `Inset`, `PageHeader` / `SectionHeader`, `DataTable` (rowHeader fallback, sort, selection, row actions, density, mobile card mode, built-in states), `Overlay` (Popover / Menu / Drawer / Modal on react-aria), `ConfirmDialog` (3 tiers from 08 §3.3), `Toast`, `DataSource` freshness badge, `ChannelPicker`, `StatusChip` (03 §3.2 status grammar: glyph + word + colour). **Correction:** several reports say "reuse `SlideoutDrawer.js`, already in the kit", but it is imported nowhere (✅) and has no focus trap. Build the drawer on UntitledUI `slideout-menus` instead and delete the old file.
6. **Guardrails:** `@layer components` for all custom CSS. ESLint/grep CI bans `text-[\d`, hex in JSX, `(zinc|sky|slate|gray)-\d`, `(bg|text|border)-(white|black)` outside the sidebar, and `fixed inset-0` outside `components/overlays/`. Undeclared-`var()` check. axe-core contrast run on all routes in **both** themes. An owner-only `/design` living style page.

---

## 6. Phased roadmap

Each line is one candidate GitHub issue. Follow the project's own rule: one feature at a time, EARS spec + QA file before code.

### Phase 0 — Truth (≈1 week)
- **Goals:** nothing on screen is false, nothing dead is clickable, nothing touches YouTube or production without a confirm.
- **Deliverables (issues):**
  - P0a: remove hard-coded badges/counts/engine lights; live counts or hidden (P0-1, P0-3)
  - P0b: 503 contract for warnings/review + tri-state hook; no false all-clear (P0-2)
  - P0c: analytics `coverage`/`fetchedAt` + honest chips + "—" for failed (P0-4)
  - P0d: delete `RETENTION`, fake Settings switches/Integrations/Typography, light-theme claim (P0-5, P0-6)
  - P0e: account menu from the session (P0-7)
  - P0f: logs future-aware time + status column + honest footnote; "Shorts today" date check (P0-8, P0-11)
  - P0g: shared severity module + correct sort (P0-9)
  - P0h: channel identity data fix + stored `short` + labels not slugs (P0-10, needs Decision 2)
  - P0i: single-state Review/Warnings error cards (P0-12)
  - P0j: ⌘K run confirm + result; thumbnail attach/bulk confirm sheet (P0-13, P0-14)
  - P0k: wizard "Start autopilot" + consent on ▶ resume (P0-15)
  - P0l: small breakages: Use Style param, channel link stop-gap, DataTable row header, music play, undefined tokens, `@layer`, phone overflow (P0-16 to P0-22)
  - P0m: mask, move and rotate the ntfy topic (P0-23)
- **Effort:** 5–6 dev-days. **Dependencies:** Decision 2 (channel name). **Risks:** the 503 contract changes every consumer of `/api/warnings` and `/api/review`, so grep all callers. P0k touches the consent/compliance path and needs its own QA file.

### Phase 1 — Foundations (≈2 weeks)
- **Goals:** one look, one kit, one state model, AA contrast in both themes, so later phases are assembly work, not invention.
- **Deliverables:**
  - F1: token layer + UntitledUI aliasing + light/dark semantic roles (02 §3.1, 10 §4.3)
  - F2: `--spacing:4px` + type-scale codemod + root size change behind a screenshot diff
  - F3: Button/Badge/CountBadge/Tabs/SegmentedControl/Card/Inset/PageHeader/SectionHeader; delete `.btn*`, `Chip`, `Segmented`
  - F4: Overlay system on react-aria (bell, account menu, mobile drawer, templates modal, drafts modal, palette as combobox) + ConfirmDialog (replace 7 `window.confirm`) + Toast provider
  - F5: `useResource` + `<DataState>` + error-copy map; migrate review, warnings, tasks, sessions, usage, home, thumbs (18 silent catches)
  - F6: DataTable v2 (sort, selection, row actions, density, mobile card mode)
  - F7: one chart set (`TimeSeries`/`BarList`/`Spark`) with empty/partial/error states, settled vs processing days, accessible summaries; delete the broken MultiChart (✅ y-max bug `charts.js:61`, unused) and Donut
  - F8: de-sky Create/Templates/wizard panels (zinc/sky/white-alpha → tokens)
  - F9: shell a11y: skip link, landmarks, per-route titles, `aria-current`, breadcrumb from the registry
  - F10: CI guardrails (lint bans, undeclared vars, axe contrast × 2 themes) + `/design` page
  - F11 (backend track, can run in parallel): `/api/runs` on the GitHub runs/jobs API + `run-name` on `channel-autopilot.yml` + Neon run cache (06 OPS-01)
- **Effort:** 10–12 dev-days (+3 for F11). **Dependencies:** Phase 0 done. Second crawl (§8) before F1 to get light-theme baselines. **Risks:** F2 touches every page visually, so ship it alone with a full diff. F4 changes keyboard behaviour everywhere.

### Phase 2 — IA + cockpit + channel page + run timeline (≈3 weeks)
- **Goals:** the owner answers "is everything OK, did it run, what needs me, how is channel X" in under 10 seconds, on desktop or phone.
- **Deliverables:**
  - I1: `lib/routes.js` registry + route-segment layouts (no `?tab=`, tabs as links so Back works) + sidebar per §5.3
  - I2: redirect table (307 → 308 after one week of owner use), then delete the legacy page shells
  - I3: health model: `channelHealth(slug)` + `/api/today`; topbar pill and sidebar dots from it
  - I4: Today cockpit home (§5.4); topics and trend radar move to Inbox → Topics
  - I5: `/channels/[slug]` page + settings tab (§5.5); channel cards → health card; Channels table mode at more than 12 channels
  - I6: Runs page: Today rows with status, duration, result, logs drawer, inline Retry; History; Uploads; run-button state contract (06 §3.2)
  - I7: Unified Inbox (scripts two-pane with keyboard + auto-advance, topics, template drafts, alerts; failed runs auto-open an alert)
  - I8: global channel scope switcher ("All channels ▾", `?ch=` in the URL)
  - I9: pocket mode (bottom tab bar, Today/Inbox cards, sticky decision bar, ntfy deep links) + tablet rail
  - I10: Settings left rail + sub-routes (profile, appearance, notifications, team, security, ai-services, usage, integrations, audit)
- **Effort:** 14–16 dev-days. **Dependencies:** F3–F6, F11 (runs), I3 before I4/I5. **Risks:** bookmarks (mitigated by redirects); GitHub API rate use (mitigated by caching runs in Neon); the 30-channel scale has never been tested (seed fake rows in a preview only, never in production data, per the real-channels directive).

### Phase 3 — Pipeline board, content library, wizard rebuild (≈3–4 weeks)
- **Goals:** depth: every video's journey visible, a real library, onboarding that ends with a live channel.
- **Deliverables:**
  - L1: video catalogue (Neon `videos` table filled at upload time + one-time backfill from uploads playlists) + `/api/videos`
  - L2: Library Videos (YouTube-Studio columns, thumbnails, views, 48h vs median, Notices column, grid/table, detail drawer)
  - L3: Cross-posts matrix (video × platform status, per-cell retry, computed platform health)
  - L4: Music pool (moods from the kit, usage counts, sticky player)
  - L5: stepped Add-Channel wizard with server drafts (6 steps, local-time schedule component, consent at go-live) + unified Publishing schedule component
  - L6: Unified Templates gallery on the real registry ("Used by", "Use on channel…", drafts as a filter; retire static `templates-catalog.js`)
  - L7: Thumbnail editor 3-panel re-layout + channel Kit drawer + Results view + restore-previous
  - L8: Production board (stage columns over topic → script → render → upload → live), only if Inbox + Runs leave a gap
  - L9: AI services page (what's in use, grouped catalogue, one Add-key sheet with all-channels scope)
  - L10: Schedule week view (all slots in local time)
- **Effort:** 16–20 dev-days. **Dependencies:** Phase 2 IA; L1 before L2/L3; Decision 7 before L6. **Risks:** L1 spends YouTube quota on the backfill (1 unit per 50 items, small); L5 changes the consent flow again and needs a compliance re-check.

---

## 7. Decisions the owner must make

1. **Direction:** adopt the "calm automation cockpit" (§5.2)? **Default: yes.**
2. **The `debt-free-doctrine` channel's real name:** "OLD MONEY CODE" (registry) or "Debt-Free Doctrine" (wizard file)? **Default: whatever the YouTube channel is titled today; the registry label follows it.**
3. **Menu names:** Today · Inbox · Channels · Runs · Library · Analytics · Create · Settings? **Default: yes.**
4. **Light theme:** label it "beta" now and make it first-class in Phase 1, or hide the toggle until then? **Default: label "beta" now, first-class in Phase 1.**
5. **Notification switches:** remove now, or build real saved preferences (≈1.5 days)? **Default: remove now (Phase 0), build in Phase 2 (I10).**
6. **Confirmation policy:** always confirm live YouTube writes, bulk actions and ⌘K runs. Single in-page "Run now" shows its cost instead of a dialog. **Default: yes.**
7. **Templates:** merge the static style catalogue, the registry and Create's styles into one "Video style" list? **Default: yes; the static catalogue retires.**
8. **Thumbnail A/B:** keep the custom 48h swap tester, or point long videos to YouTube's native Test & compare? **Default: keep ours for Shorts and batch tests, and show a note recommending native for long videos.**
9. **Times:** show everything in your local time (PKT) with UTC on hover? **Default: yes.**
10. **Old URLs:** redirect temporarily for a week, then permanently? **Default: yes.**
11. **Production kanban board:** build it in Phase 3, or skip if Inbox + Runs are enough? **Default: decide after 2 weeks of using Phase 2.**
12. **Pocket mode timing:** in Phase 2 alongside the cockpit, or later? **Default: Phase 2 (I9), since approve-from-phone is the top mobile job.**
13. **Roadmap tab in Settings:** delete it (the live Tasks board becomes the Inbox)? **Default: yes.**
14. **Second crawl before Phase 1 visual work** (§8)? **Default: yes, about 1–2 days.**

---

## 8. Evidence gaps (be careful with these)

- **No light-theme screenshots exist.** All 25 "Switch to light theme" captures show the hover tooltip over a still-dark page. Every light-theme contrast number (02, 10) is computed from tokens, not seen. 11 also flags that the toggle *might* not apply (S-25, unverified).
- **Popup coverage was weak.** Per report 11, all 58 desktop popup shots were taken over the same `/studio?tab=create` backdrop. The crawler captured only the ⌘K palette, the theme tooltip and the mobile drawer. **The bell, account menu, row menus, confirm dialogs, template simulator and drafts modal were judged from code only.** So was the phone bell-popover off-screen claim (09 M-10, downgraded until seen).
- **Local dev server, not production.** Several DB-only APIs returned 503/500 (`/studio`, `/thumbs`, `/templates`, `/channels/add`; 502 on `/usage`). The *failure UX* findings are valid. But "0 views", "db unavailable" and empty panels may look different on Vercel with Neon attached. The Next dev overlay ("N" / "1 issue") also covers the sidebar footer in every shot.
- **The wizard's step 2 and Done screens and the login form were never rendered** (no Google login in the crawl). Those findings come from code.
- **Today's #125/#126 changes:** I judged the current code. The live bell, home card and tasks board exist, but they inherit the false all-clear from the API (P0-2). The sidebar channel list is live, but its links still go to `/network?channel=`, which nothing reads (P0-17).
- **Recommended targeted second crawl (1–2 days):**
  1. Reset to each page before opening its popups.
  2. Click the bell, avatar, row "⋯" menus, the channel-card icons, the ConfirmDialogs and the template preview.
  3. Toggle the theme by setting `.dark` off directly, then capture all 25 pages in light.
  4. Add a `?simulate=db_down` mode and capture every error state.
  5. Run once against production (read-only, owner session).
  6. Fail the run if `scrollWidth > innerWidth` (09 quick win 14).
  7. Add an axe-core pass in both themes.

### Verification ledger (what I re-checked today)

**44 claims verified ✅** against current code or PNG headers. Main ones: the hard-coded badges and lights; the warnings/review 200-on-DB-down + hook + tasks + home + bell chain; the review and warnings error+spinner; the severity sort and key mismatch; DataTable `isRowHeader`; ⌘K runs and label-only filter; `?channel=` unread; Use Style / create param; "100+" and "14 · 4"; wizard `saveProfile()` + flow-route consent; music `transparent`; thumbs defaults, attach and bulk without confirm; settings switches, ntfy topic, "fully supported", Jakarta; account-menu literals; `timeAgo` clamp; analytics catch→0 and `?? 0`; `RETENTION`; "real data" chip; zero `@layer`; 14px root; undefined `--surface-1`/`--error`; identical status colours across themes; `.bg-brand-solid` override; breadcrumb `NAV`-only; no runs API + ActionButton 5s reset; 7 `window.confirm` files; no toast, no skip link, a single `metadata`; channels header no-wrap + 538/538/492px widths; logs red YouTube chip + shorts URL; social `@@`; private raw URL; TabNav `replace` + dangling `aria-controls`; brands.json vs studio-channels.json name clash; first-2-char `short`; `MUSIC_MOODS`; same workflow for three buttons; `todayVideos` not date-checked; sessions `[]` guard; MultiChart y-max bug; `studio-logs/` missing; static `INTEGRATIONS`; `SlideoutDrawer` unused; the production footnote; the font-size count (641 occurrences, 18 arbitrary px values).

**7 claims dropped or downgraded ⚠:**
1. **S-10 / OPS-25** "Pause everything shows ALL PAUSED while channels are live" (P1 → P2). `loadOverview()` immediately re-derives the state from the server (`production/page.js:62-77`), and a bulk confirm already exists (`:84`). What's left is a brief flicker and a failure count that doesn't name the channels.
2. **12 quick win #7 / BM-01 evidence:** dropped. "Script brain failing" and "Threads attention" are static strings (`site-data.js:119-130`), not live problems. Feeding them into Home would add fake data.
3. **"Reuse SlideoutDrawer, already in the kit"** (04, 05, 06, 07, 08): corrected. It is imported nowhere and lacks a focus trap.
4. **12 / BM-02** "Analytics, Tasks, Users reachable only via ⌘K": downgraded. Tasks and Users are Settings tabs. Only Analytics lacks a sidebar entry (and it's a Home tab).
5. **09 M-10** phone bell popover off-screen (P1 → P2): inferred from code, never captured.
6. **11 S-08** Home wipes the dashboard on a blip (P1 → P2). Real, but it self-heals on the next 60s poll (`page.js:59,71`). The missing Retry button stands.
7. **02 VDS-10** light-theme status colours "P0 (light)" → P1, handled in Phase 1. Dark is the default and light was never seen rendered. Phase 0 only removes the "fully supported" claim.

---

## 9. Appendix: the 12 reports

| # | File | Lens | One-line summary | Findings (P0) |
|---|---|---|---|---|
| 01 | `01-navigation-ia.md` | Navigation & IA | 19 screens at 41 URLs, fake badges, dead channel links, no channel page; proposes a 7-destination sitemap + redirect table | 20 (2) |
| 02 | `02-visual-design-system.md` | Visual design system | Three kits, 24 rendered font sizes, 3.5px spacing unit, undefined tokens, faint contrast; full token/type/radius/elevation spec | 24 (2) |
| 03 | `03-dashboard-dataviz.md` | Dashboard & data-viz | "Real data" badge over blank charts and failure-zeros, stale retention, wrong KPI deltas; "morning questions" home | 24 (5) |
| 04 | `04-creation-workflow.md` | Creation workflow | No video journey view, broken Review state, dead Use Style, unsafe live thumbnail writes; Production board + 3-panel thumbnail editor | 28 (3) |
| 05 | `05-channel-onboarding.md` | Onboarding & channels | Wizard can't go live, consent bypass, false "key saved", 19-field step; 6-step wizard + channel health card | 26 (1) |
| 06 | `06-operations-monitoring.md` | Operations & monitoring | No run telemetry, false all-clear, logs not runs, severity mis-sort; Operations "Today" + alert design rules | 26 (4) |
| 07 | `07-content-pages.md` | Content pages | Library is a 20-row activity slice, invisible play buttons, duplicates, Social shows no cross-posts; YT-Studio library + cross-post matrix | 23 (3) |
| 08 | `08-settings-admin.md` | Settings & admin | Decorative notification switches, hard-coded account identity, misplaced tabs, browser confirms; left-rail Settings + danger-action tiers | 21 (2) |
| 09 | `09-mobile-responsive.md` | Mobile & tablet | Three overflowing pages, tiny targets, iOS zoom, sideways tables (mobile avg 2.5/5); "pocket mode" bottom bar | 24 (3) |
| 10 | `10-accessibility.md` | Accessibility (WCAG 2.2 AA) | Computed contrast failures, DataTable row header, popups without focus management, no skip link or titles | 33 (2) |
| 11 | `11-states-popups-errors.md` | States, popups & errors | False all-clear, failures disguised as empty, jargon errors, no toasts; `useResource`/`DataState` standard + overlay z-scale | 28 (4) |
| 12 | `12-benchmark-direction.md` | Benchmark & direction | Compared to YT Studio / Linear / Stripe / Vercel / Buffer / Metricool; recommends the calm automation cockpit | 14 (0) |
| | | | **Total** | **291 (31)** |
