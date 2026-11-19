# 01 — Navigation & Information Architecture audit

Date: 2026-11-18 · Lens: navigation, wayfinding, sitemap · Mode: read-only
Evidence root: `C:\Users\Revnix\AppData\Local\Temp\studio-ui-audit\shots-full\` (screenshots named below), code under `studio/`.

---

## 1. Plain-English summary for the owner

- **The same screen lives at two or three addresses, under up to three different names.** 19 real screens can be reached through 41 web addresses. "Review Desk", "Review Queue" and "Studio Desk" are one screen. "Production", "Pipelines" and "Production Pipelines" are another. That is why the panel feels bigger and more confusing than it is.
- **Some numbers in the menu are made up.** The sidebar always shows "3" next to Studio and "1" next to Operations, and the Network tab always says "Channels (16)". These are typed into the code. On the same screen the home page says "0 open warnings" and "5 live channels".
- **Clicking a channel in the sidebar does nothing channel-specific.** All five channel links open the same generic Channels grid. There is no page for one channel. A channel's health is split across five places: Home, Channels, Operations, Analytics and Warnings.
- **Analytics has no menu item.** You can only reach it through a tab on the Home page, the search box, or by typing the address. The breadcrumb at the top says "Quarry Studio / Quarry Studio" on Analytics, Add Channel and every older page, so it never tells you where you are.
- **Fix:** cut the menu to 7 clear places (Today, Inbox, Create, Channels, Library, Activity, Analytics), plus Settings at the bottom. Give each channel its own page. Old addresses forward automatically, so no bookmark breaks.

---

## 2. Findings table

Severity: P0 broken · P1 major · P2 polish · P3 nice

| ID | Sev | Page / component | Evidence | Problem | Recommendation |
|---|---|---|---|---|---|
| NAV-01 | **P0** | Sidebar badges, hub tab labels | `page-home--desktop.png` (sidebar "Studio 3", "Operations 1" while the "Needs attention" card says "0 open warnings"); `AppShell.js:149-158` (literal `3` and `1`); `studio/page.js:14` (`badge: '3'`); `network/page.js:12` (`'Channels (16)'` vs "5 live channels" in `page-network--desktop.png`) | Hard-coded counts in the most visible place in the product. They contradict the live numbers right next to them. This breaks trust and goes against the owner's "real data only" rule (#125/#126). | Remove every literal. Studio badge = pending review count from the review API. Operations badge = `useOpenWarnings().rows.length`, the same source as the bell. Channels tab = `useBrands().channels.length`. Hide the badge when the count is 0 or unknown. |
| NAV-02 | **P0** | Sidebar "Channels" section, palette "Channel: X" | `AppShell.js:182` (`/network?channel=${slug}`); `CommandPalette.js:98`; `network/page.js:19` reads only `tab`, and grep shows no `get('channel')` anywhere in `app/` | All 5 channel links, and all 5 palette channel jumps, open the same unfiltered Channels grid. The `?channel=` part of the address is ignored. The sidebar also never highlights the selected channel. | Short term: scroll to and highlight the matching card. Proper fix: add a `/channels/[slug]` page (see §3.3) and point the sidebar there, with an active state. |
| NAV-03 | **P1** | Topbar breadcrumb | `AppShell.js:280-281` (matches only exact `NAV` hrefs); `page-review--desktop.png`, `page-analytics--desktop.png`, `page-channels-add--desktop.png` all show "Quarry Studio / **Quarry Studio**"; `page-studio--desktop.png` shows "Studio", not "Studio / Review Queue" | The breadcrumb is wrong on 20 of 25 routes and never shows the active tab or sub-page. Add Channel has no path back to Channels. | Build the breadcrumb from a route tree: `Section / Sub-page / Item`. Every crumb except the last is a link. Example: `Channels / Old Money Code / Keys`. |
| NAV-04 | **P1** | All 5 hubs | `page-studio--desktop.png` ("Studio Desk" H1, then "Review Desk" H1); same pattern in `page-network--desktop.png`, `page-content--desktop.png`, `page-operations--desktop.png`; `studio/page.js:28` + `review/page.js:151` | Each hub draws a full page header, then puts a whole second page inside it with its own icon, title and subtitle. The result is two H1s, about 150px of repeated header, and the real content starting halfway down the screen. | Hubs become route layouts (`app/studio/layout.js`) that own the single header and tabs. Child pages render only their content, with no `PageHeader`. |
| NAV-05 | **P1** | Duplicate routes | `nav.js:45-66` (legacy list); `AppShell.js:36-54` (hand-maintained prefix lists); the route tally below | 19 content units are reachable through 41 URLs, and the palette lists hub and child as separate entries (24 page rows). The `isPathActive` prefix lists have to be edited by hand for every new page. | Keep one canonical URL per screen (§3.2) and redirect the rest (§3.4). Work out the active state from the route tree, not from lists. |
| NAV-06 | **P1** | Naming drift | `nav.js:56` "Production Pipelines" / `operations/page.js:12` "Pipelines" / `production/page.js:151` "Production" / `page.js:125` button "Pipelines"; usage: "Quota Ledger" (`nav.js:61`) / "Quota & Costs" (`network/page.js:14`) / "Usage & cost" (usage H1); logs: "Execution Logs" / "Posting logs" (`logs/page.js:41`) / "Open logs"; users: "User Admin" / "Team & Access" / "Users"; sessions: "Sessions Admin" / "Security & Sessions" / "Sessions"; tasks: "Roadmap Tasks" / "System Roadmap" / "Tasks" | Every screen has 2–4 names, and tab ids differ from route names (`audio`↔`/music`, `team`↔`/users`, `security`↔`/sessions`, `roadmap`↔`/tasks`). The owner cannot learn one word per place. | One name per screen, used in the sidebar, tab, H1, palette and URL. See the sitemap in §3.2 for the chosen names. |
| NAV-07 | **P1** | Channel identity | `page-home--desktop.png` (sidebar "OLD MONEY CODE", Trend radar heading "debt-free-doctrine" under the OL badge); `page-operations--desktop.png` ("OMC 00:35", button "DFD Shorts"; "QQ/IC/MR" vs BrandMark "QU/IN/TH/OL"); `page-channels-add--desktop.png` ("Debt-Free Doctrine"); `page-content--desktop.png` (Channel column shows raw slugs) | One channel has 5 labels: Old Money Code, Debt-Free Doctrine, debt-free-doctrine, OMC, DFD. There are also two separate abbreviation systems. When looking for a channel, the name is the main clue, and it changes from page to page. | Always show `label` from `/api/brands` together with the `BrandMark`. Never show raw slugs or ad-hoc initials. Use one `short` code from the registry everywhere: chips, buttons, slots. |
| NAV-08 | **P1** | Analytics is orphaned | `nav.js:26-43` (not in `NAV`); `nav.js:62` (palette group "Command"); `AppShell.js:36-54` (no active match, so no sidebar item lights up in `page-analytics--desktop.png`); `page.js:33,138` (embedded as Home tab "Deep Analytics (28d)"); `page.js:327` ("Real 28-day numbers live on the Analytics page" with no link) | One of the 10 core jobs has no menu entry. It exists both as a Home tab and as a standalone route. | Make Analytics a top-level sidebar item. Remove the Home tab. Turn the `page.js:327` sentence into a link. |
| NAV-09 | **P1** | Links that escape hubs | `page.js:189,197` → `/warnings`; `production/page.js:156` → `/logs`; `templates/page.js:66,223,250` → `/create`; `tasks/page.js:82,109` → `/warnings`, `/review`; `components/ActionButton.js:49` → `/logs`; bell `AppShell.js:97,108` → `/warnings` | In-page links go to the old standalone routes. The user loses the hub tabs and lands on a "Quarry Studio / Quarry Studio" page. Clicking "Open logs" on the Pipelines tab drops the Operations tab bar. | Point every internal link at its canonical URL. Add a lint rule or a `ROUTES` constant module (`lib/routes.js`) so links can't be hand-typed. |
| NAV-10 | **P1** | Hidden routes | `find app -name page.js`: `/templates/drafts` (Drafts Inbox, reached only via a button at `templates/page.js:63`), `/templates/registry`, `/templates/registry/detail`, `/styles`, `/channels/add`. None of these are in `NAV` or the palette | The Drafts Inbox is an approval queue, the same kind of job as Review, but it is buried 3 levels deep. Add Channel cannot be found from search ("add channel" returns nothing). | Put all approvals in one Inbox (§3.2). Register every routable page in the route tree so the palette and breadcrumb know about it. |
| NAV-11 | **P1** | Command palette | `CommandPalette.js:135` (filters `label` only, so "keys", "api", "upload", "add channel" and "thumbnail A/B" find nothing); `:25-36` (`PAGE_ICONS` misses every hub, so nearly every row shows the same grid icon in `popup-studio--desktop--1-Search-or-run-K.png`); `:101-134` (flat list, no group headings, no recents); `nav.js:31,48,60` (subtitles shown to the owner include "#106" and "BYOK vault v2") | The palette is only a list of menu items, not a search. Developer jargon leaks into what the owner reads. | Match on label + description + `keywords[]`. Group results under Pages / Channels / Actions. Use each item's own icon from `nav`. Show the 5 most recent items when the box is empty. Write plain-English descriptions. |
| NAV-12 | **P1** | Palette run actions | `CommandPalette.js:76-90,112-126` | "Run QUOTE QUARRY Shorts now" fires a real GitHub Actions job on one Enter, with no confirmation. The `fetch` result is never checked, and the palette always moves to the logs page even when the job failed. A misplaced Enter on a "run" row starts a production job. | Ask for confirmation with a second Enter ("Press ↵ again to start"). Show a success or error toast from the response. Navigate only on success, to `/activity?run=<id>`. |
| NAV-13 | **P1** | Desktop shows mobile controls | Every `page-*--desktop.png`: hamburger next to the breadcrumb, plus a second magnifier button beside the search field; `AppShell.js:337,365` (`lg:hidden icon-btn`, `sm:hidden icon-btn`); `globals.css:308` (unlayered `.icon-btn{display:inline-flex}` beats Tailwind v4's layered `lg:hidden`) | On desktop, a hamburger that does nothing (the drawer itself is `lg:hidden`) and a duplicate search button. Two dead controls in the chrome of every page. | Move `.icon-btn` into `@layer components`, or wrap the buttons in a `<span className="lg:hidden">`. |
| NAV-14 | **P2** | Tabs break Back | `TabNav.js:23` (`router.replace`) | Switching tabs replaces the history entry, so the browser Back button skips every tab the owner visited. | With route-segment tabs (§3.3), use `<Link>` (a push), which makes Back behave normally. |
| NAV-15 | **P2** | Settings duplicates its own tabs | `page-settings--desktop.png` (General tab also shows "Team", "Change panel password" and "Security — active sign-ins" cards); `settings/page.js:218-466` vs `:468-469` (`team` → `<UsersPage/>`, `security` → `<SessionsAdminPage/>`) | Team and sessions each appear twice inside Settings, and a third time at `/users` and `/sessions`. | General = appearance + notifications only. Team and Security content lives only in its own tab. |
| NAV-16 | **P2** | "Create" button | `AppShell.js:350` (`/studio?tab=create`); `page-create`, via `popup-create--desktop--1-Search-or-run-K.png` | The single global primary button makes only a video. A thumbnail or a channel is not "Create". It is also hidden below 640px (`hidden sm:inline-flex`), and the mobile drawer has no Create item (`popup-home--mobile-nav.png`). | Make it a split menu: New video · New thumbnail · New channel. On mobile, add it as the first drawer item. |
| NAV-17 | **P2** | Mobile hub tabs | `page-studio--mobile.png` ("Create" tab cut off at the right edge, no fade or arrow) | 5 tabs in 390px with no sign that the row scrolls, so Thumbnails and Templates can't be found on a phone. | Show a gradient fade at the edge plus scroll-snap. Or, on screens under `sm`, show a select-style "Section ▾" dropdown. |
| NAV-18 | **P2** | Fake engine status | `AppShell.js:289-293` ("Engine connected", static green dot); `:369-373` ("Engine live" badge) | Two hard-coded "all good" signals sit in the wayfinding chrome, so they can't tell the owner that something has broken. | Base them on the latest workflow-run status (`/api/overview`). Clicking the chip opens Activity. |
| NAV-19 | **P2** | Sidebar extras | `AppShell.js:200-209` ("TikTok dashboard", external github.io link) vs `page-operations--desktop.png` ("the auto-post workflow was retired Oct 30"); `nav.js:38-41` ("Preferences" group holding one item) | A dead external link for a retired lane sits in the primary nav, and a group heading covers a single item. | Remove the TikTok link (or move it into Settings → Integrations). Drop the "Preferences" heading and pin Settings to the sidebar footer. |
| NAV-20 | **P3** | Hub tab remount cost | `operations/page.js:23-34` (re-fetches `/api/overview` on every tab change); every hub `{activeTab === … && <Page/>}` | Each tab switch unmounts and reloads a whole page, so it is slow and loses scroll and filter state. | Route-segment layouts keep the shell mounted. Cache with SWR keyed by endpoint. |

### Route tally (NAV-05 evidence)

| Content unit | URLs that render it | Names it goes by |
|---|---|---|
| Overview | `/`, `/?tab=pulse` | Overview, Pulse & Production |
| Analytics | `/analytics`, `/?tab=analytics` | Analytics, Deep Analytics (28d) |
| Script review | `/review`, `/studio`, `/studio?tab=review` | Studio, Studio Desk, Review Queue, Review Desk |
| Topics | `/topics`, `/studio?tab=topics` | Topic Desk |
| Create video | `/create`, `/studio?tab=create` (+ `?template=`) | Create, Create Video |
| Thumbnails | `/thumbs`, `/studio?tab=thumbs` | Thumbnails |
| Templates | `/templates`, `/studio?tab=templates`, + hidden `/templates/registry`, `/templates/registry/detail`, `/templates/drafts` | Video Templates, Video Templates Studio |
| Videos | `/videos`, `/content`, `/content?tab=videos` | Content, Content & Media Library, Published Videos, Videos |
| Social | `/social`, `/content?tab=social` | Social, Social Feeds, Social Cross-Posts |
| Music | `/music`, `/content?tab=audio` | Music, Audio & Music, Audio & Music Library |
| Pipelines | `/production`, `/operations`, `/operations?tab=pipelines` | Operations, Operations Hub, Pipelines, Production, Production Pipelines |
| Logs | `/logs`, `/operations?tab=logs` | Execution Logs, Posting logs |
| Warnings | `/warnings`, `/operations?tab=warnings` (+ bell, + Home card) | Warnings, Warnings & Alerts, Alerts, Needs attention |
| Channels | `/channels`, `/network`, `/network?tab=channels`, `/network?channel=<5 slugs>` | Network, Network & Infrastructure, Channels (16), Channels |
| Providers | `/providers`, `/network?tab=providers` (+ inline per-channel key panel) | AI Providers, AI Providers (BYOK), Providers |
| Usage | `/usage`, `/network?tab=usage` | Quota Ledger, Quota & Costs, Usage & cost |
| Team | `/users`, `/settings?tab=team`, + General-tab card | User Admin, Team & Access, Users, Team |
| Sessions | `/sessions`, `/settings?tab=security`, + General-tab card | Sessions Admin, Security & Sessions, Sessions |
| Roadmap | `/tasks`, `/settings?tab=roadmap` | Roadmap Tasks, System Roadmap, Tasks |

**19 units → 41 distinct URLs (counting the 5 `?channel=` variants), roughly 60 labels.**

### "Where do I go to do X?": the 10 core jobs today

| # | Job | Today's path | Verdict |
|---|---|---|---|
| 1 | Check a channel's health | The sidebar channel link opens a generic grid (NAV-02). Health is split across Home "Today's production line", the Network card, Operations "Channel runs" ("queue empty"), Analytics filter `OL` and Warnings | **Fail.** No single channel page. |
| 2 | Approve a script | Sidebar Studio (Review is the default tab) | Pass, 1 click. Badge is fake (NAV-01). |
| 3 | Make a thumbnail | Studio → Thumbnails tab | Weak. The global "Create" button doesn't offer it (NAV-16). |
| 4 | See if today's uploads ran | Home "1 queued" chips, Operations → Execution Logs, or Content → Videos "Scheduled/Published" | Weak. Three partial answers, none of which says "ran OK at 22:35". |
| 5 | Add a channel | Network → Channels → "New channel" (3 clicks), or sidebar "manage →" | Weak. Not in the palette. Add Channel's breadcrumb is lost (NAV-03). |
| 6 | Fix a warning | Bell, or the Home "triage →" link | OK, but the sidebar "1" contradicts the bell's 0. |
| 7 | Change a provider key | Network → AI Providers, or the key icon on a channel card, or the Add Channel "key saved" row | **Fail on findability.** A non-developer looks in Settings, not "Network". Three entry points. |
| 8 | See analytics | Not in the sidebar. Home tab or ⌘K only | **Fail** (NAV-08). |
| 9 | Change settings | Settings | Pass. |
| 10 | See logs | Operations → Execution Logs | Pass, but "Open logs" on Pipelines escapes the hub (NAV-09). |

---

## 3. Redesign proposals

### 3.1 Principle

The owner thinks in **verbs and channels**, not in system layers. "Studio", "Operations" and "Network" are engineering buckets: is a provider key "Network"? Are warnings "Operations"? Every sidebar label should answer either "what do I need to do?" or "how is channel X doing?".

### 3.2 Target sitemap (7 destinations + Settings)

```
/                       Today          ← one answer to "is everything OK?"
                                         KPIs · today's runs per channel (ran/failed/queued) · open alerts · inbox count
/inbox                  Inbox  (n)     ← EVERYTHING waiting on the owner
  /inbox?type=scripts                    script approvals      (was /review)
  /inbox?type=topics                     topic approvals       (was /topics)
  /inbox?type=templates                  template drafts       (was /templates/drafts)
  /inbox?type=alerts                     open warnings         (was /warnings)
/create                 Create         ← making things by hand
  /create/video                          (was /create)
  /create/thumbnail                      (was /thumbs)
  /create/templates                      (was /templates, /templates/registry[/detail])
/channels               Channels       ← portfolio grid (was /channels, /network)
  /channels/new                          (was /channels/add)
  /channels/[slug]                       ONE channel: health, today's runs, recent videos, analytics, alerts
  /channels/[slug]/settings              niche, template, schedule, voice, music, keys, routing
/library                Library        ← everything already made
  /library/videos                        (was /videos)
  /library/social                        (was /social)
  /library/music                         (was /music)
/activity               Activity       ← what the machine did and is doing
  /activity/runs                         pipelines + master switch (was /production)
  /activity/logs                         (was /logs)
/analytics              Analytics      (was /analytics, /?tab=analytics)
── sidebar footer ──
/settings               Settings
  /settings/general                      appearance, notifications
  /settings/team                         (was /users)
  /settings/security                     sessions + password (was /sessions)
  /settings/providers                    AI keys & routing (was /providers)
  /settings/usage                        quota & costs (was /usage)
  /settings/integrations                 the integrations card, now live
  /settings/roadmap                      (was /tasks), owner-only, or move to the repo
```

Why this shape:
- **Inbox** brings together the 4 approval queues that are currently spread across Studio, Templates and Operations. One badge, one number, and the number is real.
- **Channels/[slug]** is the missing hub. With 5 channels today and about 30 planned (portfolio scope), per-channel drill-down is the main way the owner thinks.
- **Provider keys and usage move into Settings**, which is where a non-developer expects keys and bills. The per-channel key override stays on `/channels/[slug]/settings`.
- **Activity** replaces "Operations". Warnings move to Inbox, because a warning is something to act on, not a log.

### 3.3 Shell, before → after

```
BEFORE (page-studio--desktop.png)               AFTER
┌──────────┬──────────────────────────────┐     ┌──────────┬──────────────────────────────────┐
│COMMAND   │☰ Quarry Studio / Studio      │     │ Today    │ Inbox / Scripts            ⌘K  🔔 │
│ Overview │                              │     │ Inbox  4 │──────────────────────────────────│
│ Studio  3│ ✦ Studio Desk                │     │ Create   │ Inbox                             │
│ Content  │   Editorial review gates…    │     │ Channels │ Scripts 3 · Topics · Drafts 1 ·   │
│ Operat. 1│ Review|Topic|Create|Thumbs|… │     │ Library  │ Alerts 0                          │
│ Network  │                              │     │ Activity │ ───────────────────────────────── │
│PREFEREN. │ ▤ Review Desk                │     │ Analytics│ [content starts here]             │
│ Settings │   Fail-closed script…        │     │──────────│                                   │
│CHANNELS  │ db unavailable               │     │ CHANNELS │                                   │
│ QU …     │ Loading queue…               │     │ ● QU Quote Quarry       ✓ ran     │
│ …        │                              │     │ ● IN Investor's Compass ✓ ran     │
│ TikTok ↗ │                              │     │ ● OL Old Money Code     ! 1 alert │
└──────────┴──────────────────────────────┘     │ + Add channel                     │
                                                │──────────│                                   │
                                                │ ⚙ Settings · ● Engine: last run 22:35 ✓ │
                                                └──────────┴──────────────────────────────────┘
```

Implementation shape:
- **One route registry** (`lib/routes.js`): `{ id, path, label, icon, parent, keywords, badgeSource, roles }`. Sidebar, tabs, breadcrumb, palette and `isPathActive` all derive from it. This removes the hand lists at `AppShell.js:36-54` and `nav.js:45-66`.
- **Route-segment layouts** (`app/inbox/layout.js` etc.) render the section H1 and the tabs once. Tabs are `<Link>` elements to real paths. That removes `?tab=`, the double headers (NAV-04) and the broken Back button (NAV-14).
- **Sidebar channel rows** show a status dot computed from today's run plus open alerts, link to `/channels/[slug]`, and get an active state. At 30 channels, collapse to "Pinned (5) · All channels →" with a filter box.
- **Breadcrumb**: `Section / Sub-page / Item`, all linked. On mobile it collapses to "← Section".
- **⌘K palette**: groups Pages · Channels · Actions; empty-state recents; keyword matching; run actions need a second Enter and report the API result.

### 3.4 Redirect plan (legacy → canonical)

Put these in `next.config.mjs` `redirects()`, next to the existing `/keys` rule (`next.config.mjs:16-18`). Ship them as `permanent: false` (307) for one week while the owner checks bookmarks, then flip to `permanent: true` (308). Query-string tab URLs need `has: [{ type: 'query', key: 'tab', value: '…' }]` entries.

| Legacy | → Canonical |
|---|---|
| `/review`, `/studio`, `/studio?tab=review` | `/inbox?type=scripts` |
| `/topics`, `/studio?tab=topics` | `/inbox?type=topics` |
| `/templates/drafts` | `/inbox?type=templates` |
| `/warnings`, `/operations?tab=warnings` | `/inbox?type=alerts` |
| `/studio?tab=create` (and `/create?template=X` → `/create/video?template=X`) | `/create/video` |
| `/thumbs`, `/studio?tab=thumbs` | `/create/thumbnail` |
| `/templates`, `/studio?tab=templates`, `/templates/registry` | `/create/templates` |
| `/templates/registry/detail?template=X` | `/create/templates/X` |
| `/content`, `/videos`, `/content?tab=videos` | `/library/videos` |
| `/social`, `/content?tab=social` | `/library/social` |
| `/music`, `/content?tab=audio` | `/library/music` |
| `/operations`, `/production`, `/operations?tab=pipelines` | `/activity/runs` |
| `/logs`, `/operations?tab=logs` | `/activity/logs` |
| `/network`, `/network?tab=channels` | `/channels` |
| `/network?channel=X` | `/channels/X` |
| `/channels/add` (and `?edit=X`) | `/channels/new` (and `/channels/X/settings`) |
| `/providers`, `/network?tab=providers` | `/settings/providers` |
| `/usage`, `/network?tab=usage` | `/settings/usage` |
| `/users`, `/settings?tab=team` | `/settings/team` |
| `/sessions`, `/settings?tab=security` | `/settings/security` |
| `/tasks`, `/settings?tab=roadmap` | `/settings/roadmap` |
| `/?tab=analytics` | `/analytics` |
| `/styles` | `/create/templates?view=styles` (or delete if unused) |

Leave `/client`, `/proof` and `/login` untouched (they have their own chrome, `AppShell.js:270`). Check that `proxy.js` auth still runs before these redirects, since its matcher covers all paths (`proxy.js:54`).

---

## 4. Quick wins (each ≤ 1 day)

1. **Remove the fake badges and counts** (NAV-01): `AppShell.js:149-158`, `studio/page.js:14`, `network/page.js:12`. Wire up real sources or hide them.
2. **Fix the desktop hamburger and duplicate search** (NAV-13): put `.icon-btn` in `@layer components` in `globals.css:308`.
3. **Breadcrumb fallback** (NAV-03): extend the `current` lookup to `ALL_NAV_ITEMS`, add the hub parent, and append the active `?tab` label. Even before the route registry, this ends "Quarry Studio / Quarry Studio".
4. **Add Analytics to the sidebar** (NAV-08) and link the `page.js:327` sentence.
5. **Point every internal link at its hub URL** (NAV-09): about 10 call sites listed in the table.
6. **Palette** (NAV-11/12): match `desc` too; use `ALL_NAV_ITEMS[i].icon`; add "Add channel", "Drafts inbox" and "Template registry" entries; add a second-Enter confirmation plus a toast for run actions.
7. **Settings General de-dupe** (NAV-15): delete the Team, Password and Sessions cards from the General tab.
8. **Remove the TikTok dashboard link and the "Preferences" heading** (NAV-19).
9. **Show the channel label everywhere** (NAV-07), starting with the Videos table Channel column and the Home Trend radar headings.

## 5. Bigger bets (multi-day)

1. **Route registry + segment layouts** (§3.3). This is the base that fixes NAV-03/04/05/06/14/20 in one move. About 3 days.
2. **Per-channel page `/channels/[slug]`** (§3.2). Brings health, today's runs, recent videos, 28-day analytics, alerts and settings together for one channel. It becomes the default target for the sidebar, palette and Home rows. It also scales to the planned ~30 channels. About 3–4 days.
3. **Unified Inbox** with one real badge, covering scripts, topics, template drafts and alerts. One list sorted by urgency, with approve/reject inline. About 2–3 days.
4. **Redirect rollout** (§3.4). Start with 307s, switch to 308s after a week of owner use, then delete the legacy `app/<route>/page.js` shells. About 1 day plus a week of soak time.
5. **Live engine status chip** (NAV-18) from the latest workflow run, linking to Activity. About 1 day.
