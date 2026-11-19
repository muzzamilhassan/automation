# 11 — States, popups, feedback & error handling

Lens: every popup / modal / dropdown / drawer / toast, and every loading / empty / error / partial / success state.
Auditor role: interaction designer (UI states and feedback).
Evidence: 83 `popup-*.png` and 25 `page-*--desktop.png` in `C:\Users\Revnix\AppData\Local\Temp\studio-ui-audit\shots-full\`, plus code under `studio/`.

> **Note on what the crawl captured.** All 58 desktop popup screenshots (`popup-<page>--desktop--*`) were taken over the **same backdrop**, `/studio?tab=create`, whatever page name they carry. For example, `popup-logs--desktop--1-Search-or-run-K.png` shows Studio Desk, and 25 of the "light theme" shots fall into 9 hash groups that all show one Create Video screen. So the crawler captured only three popup types: the ⌘K palette, the theme-toggle tooltip, and the mobile nav drawer (25 shots, which are correct per page). It never opened the **bell, the account menu, any SlideoutDrawer, or any confirm dialog**. I judged those from code (`AppShell.js`, `SlideoutDrawer.js`, `window.confirm` call sites). A follow-up crawl should click those triggers.

---

## 1. Plain-English summary for the owner

- **When the database is down, the panel says "all is well", which is the most dangerous thing it can say.** The Tasks page, the bell, and the home "Needs attention" card all show "Nothing needs attention — all probes quiet" in the same run where the Warnings and Review pages say `db unavailable`. Nothing is actually being watched at that moment.
- **Several numbers are typed into the code, not counted.** The red "1" next to Operations, the "3" next to Studio and on the Review Queue tab, "Engine live", "Engine connected", "Channels (16)" and "Drafts Inbox (14 Full Stories · 4 Chapters)" never change, whatever is really happening. The same screen can show "3 waiting" in the sidebar and "0 awaiting approval" on Tasks.
- **Errors appear in programmer language, or not at all.** You see things like `db unavailable`, `database not configured on this server`, `DATABASE_URL missing / db not ready — cannot construct routing layer`, `HTTP 503` and `@undefined`. In other places a failure quietly turns into "No sessions recorded" or "No views recorded", which reads like real news when it is really a broken connection.
- **Buttons that start real production jobs give weak or no feedback.** The ⌘K palette runs "Run Quote Quarry Shorts now" with no "are you sure?". It never checks whether the run actually started, and then jumps you to the logs page. On the Production page a run button says "Started ✓" and stays that way, so it never tells you whether the video was actually made.
- **Every popup is built differently.** There are four overlay styles. The bell and account menus can't be closed with Esc. Confirmations use the browser's plain grey `confirm()` box. There is no toast or notification system at all. One shared set of state components would fix all of these together.

---

## 2. Findings table

Severity: **P0** broken or misleading · **P1** major · **P2** polish · **P3** nice to have.

| ID | Sev | Page / component | Evidence (screenshot + file:line) | Problem | Recommendation |
|---|---|---|---|---|---|
| S-01 | **P0** | Tasks, bell, Home "Needs attention" | `page-tasks--desktop.png` ("0 open items… Nothing unresolved — all probes quiet… Review queue is clear") vs `page-warnings--desktop.png` and `page-review--desktop.png` (`db unavailable`). `api/warnings/route.js:25` and `api/review/route.js:84` return **HTTP 200** `{open:[], error:'db unavailable'}`. `use-open-warnings.js:13-16` sets `canSee: Boolean(d.open)`, which is `true` for `[]`. `tasks/page.js:22-29` ignores `d.error`. `AppShell.js:89-92` and `app/page.js:240-245` then render "Nothing needs attention". | **False all-clear.** A database outage looks exactly like a quiet, healthy system. This is the worst state-design failure possible on an ops console. | API: on failure return 503 `{ok:false, code:'DB_DOWN'}`, never 200 with empty arrays. Clients: three-way state `unknown / clear / has-items`. When unknown, show "Can't check warnings right now" with Retry, never "quiet". |
| S-02 | **P0** | Sidebar badges, Studio tab, Templates, Network tab | Sidebar "Studio 3" and "Operations 1" in every screenshot, e.g. `page-tasks--desktop.png` (which says 0 warnings and 0 approvals). Hardcoded at `AppShell.js:149-158` (`3`, `1`), `studio/page.js:14` (`badge: '3'`), `templates/page.js:64` ("Drafts Inbox (14 Full Stories · 4 Chapters)"), `network/page.js:12` ("Channels (16)") while the same page says "5 live channels" (`page-network--desktop.png`). | Fake counters break trust in every *real* counter. This also breaks the #126 rule "never a fake number". | Feed every badge from the same live hook that Tasks uses. If the count is unknown, hide the badge. Never show a constant. |
| S-03 | **P0** | Topbar "Engine live", sidebar footer "Engine connected" | Both are green and pulsing in every screenshot, including `page-studio--desktop.png` where the page says `db unavailable`. Hardcoded at `AppShell.js:289-293` and `AppShell.js:370-372`. | The main health signal is decoration. When the engine *is* down, the panel still says live. | Derive it from a `/api/health` ping covering DB, GitHub dispatch and last successful run. Use states `Live` / `Degraded (DB offline)` / `Offline`, each with a tooltip explaining why. Show it once, in the topbar, and delete the duplicate footer copy. |
| S-04 | **P0** | ⌘K palette: "Run <channel> Shorts now", "Run FB reels cross-post"… | `CommandPalette.js:82-89` and `118-125`: `await fetch('/api/action')` with no `r.ok` check, no catch and no confirmation, then `router.push('/operations?tab=logs')`. Palette items are visible in `popup-home--desktop--1-Search.png`. | One Enter key starts a real production and publishing job. If the dispatch fails, the user still lands on the logs page and believes it started. | A run item opens a ConfirmDialog ("Start a Shorts run for Quote Quarry now? It will publish at its next slot.") and then shows a toast: `Starting…` → `Run started — we'll notify you when it finishes` or `Couldn't start the run: <plain reason>` with Retry. Don't navigate away on its own. |
| S-05 | **P1** | Review Desk, Warnings (also Studio > Review tab) | `page-studio--desktop.png`, `page-review--desktop.png` and `page-warnings--desktop.png` show red `db unavailable` **and** a "Loading queue…" / "Loading warnings…" spinner that never stops. `review/page.js:65` sets `err` but never sets `pending`, so `:162-163` spins forever. Same at `warnings/page.js:110,153`. | Error and loading states show at the same time. The spinner suggests "wait" while the text says "it failed". | Treat status as one value (`loading`, `error`, `empty` or `ready`) and render exactly one state view. |
| S-06 | **P1** | All error copy | `db unavailable` (`review/page.js:159`, `warnings/page.js`, `sessions/page.js:133`), `database not configured on this server` in **monospace** (`usage/page.js:125`, `page-usage--desktop.png`), `Routing store unavailable (provider routing: DATABASE_URL missing / db not ready — cannot construct routing layer)` (`page-providers--desktop.png`, routing panel), "The /api/overview endpoint did not answer" (`app/page.js:81-85`), `HTTP ${r.status}` (`create/page.js:48`), raw OAuth `?error=` and `not compatible: …` (`channels/add/page.js:169,186`). There are 44 raw `{err}` / `d.error ||` renders across `app/**/page.js`. | Technical leakage to a non-technical owner. It says nothing about the consequence ("can I still publish?") or the fix. | Add an error-code-to-plain-English map (§3.4). Raw text goes only into a collapsed "Technical details" block with a Copy button. |
| S-07 | **P1** | Thumbnails, Sessions, Analytics, sidebar channels, palette | Thumbnails: 18 `catch(() => setX([]))` (`thumbs/page.js:91,95,116,132,151,202,279,288,369,370…`). The video grid shows grey placeholder boxes, and A/B shows "No tests yet" (`page-thumbs--desktop.png`) after the logged 500s. Sessions: "No sessions recorded — devices appear here the first time they sign in" **while signed in** (`page-sessions--desktop.png`). Analytics: "real data" chip plus "No views recorded in this period" and Views·28d = 0 (`page-analytics--desktop.png`), while Home says YT VIEWS 90K. A failed brands fetch gives an empty sidebar "CHANNELS" list (`use-brands.js:25-27`, visible mid-load in `popup-logs--desktop--1-Search-or-run-K.png`). Palette channel actions vanish silently (`CommandPalette.js:73`). | Failures disguised as empty states. The user can't tell "nothing exists" from "couldn't load". | Every fetch returns a status. Empty copy is allowed only when the status is `ready` and the list is empty. Otherwise show a compact inline ErrorState ("Couldn't load your videos · Retry"). |
| S-08 | **P1** | Home | `app/page.js:59` sets `err=true` on any failed poll, and `:78-86` then replaces **the whole dashboard** with an EmptyState. This happens even on the 60 s background poll after data had loaded (`:71`). `EmptyState` has no action slot (`ui.js:227-239`), so "then retry" has no button. | One network blip wipes a working dashboard, and the user has no way to retry. | Keep stale data, add a slim "Couldn't refresh · last updated 2 min ago · Retry" banner, and add an `action` prop to EmptyState and ErrorState. |
| S-09 | **P1** | Home "Views per day" | Hardcoded "real data" chip at `app/page.js:157`. It shows while loading (`:155` sub says "Loading…") and over an empty chart (`page-home--desktop.png`: blank 170 px area, every channel "0 views · 28d"). If analytics fails, `:60` sets null, so a skeleton shows **forever** (`:186`). | Truth badge is decorative. Error becomes infinite loading. | Chip derived from status: `Live · updated 14:02` / `No data yet` / `Couldn't load`. Show an empty-chart state with copy, not blank space. |
| S-10 | **P1** | Production "Pause everything" | `production/page.js:98` calls `setNetPaused(!on)` **even when every PATCH failed**. The error copy "`${fails} channel(s) failed`" (`:99`) doesn't say which channels. | Optimistic UI without rollback. The master switch can show PAUSED while channels are still producing. | Flip only the channels that succeeded, list the failures by name ("Old Money Code didn't pause — Retry"), and reconcile from the server. |
| S-11 | **P1** | Action feedback (global) | No toast system exists (no `toast` or `sonner` anywhere outside `untitledui/theme.css`). Production buttons cycle `Starting…` → `Started ✓` (disabled until reload) → `Failed — retry`, with no reason (`production/page.js:212-231`). Outcomes are pushed to another page ("How runs report back… appear in Execution Logs", `page-production--desktop.png`). Create Video *does* poll its job list (`create/page.js:35,157`), which is the right pattern but used only there. | You can't learn whether an action worked without leaving the page. "Started ✓" goes stale. | Add a global Toast provider and a "Recent runs" tray in the bell: dispatched → running → succeeded / failed, fed by polling GitHub run status. Buttons return to idle after 3 s. |
| S-12 | **P1** | Bell popover, account menu, mobile drawer, palette (accessibility of dismissal and focus) | `AppShell.js:74-115` (bell) and `:404-422` (account) have no Esc handler, no `aria-expanded`, no `role="menu"` or `dialog`, and no focus move or return. Mobile drawer `:321-331` has no Esc, no focus trap and no body-scroll lock (SlideoutDrawer *does* lock, `SlideoutDrawer.js:28-29`). Palette `CommandPalette.js:171-204` has no `listbox`/`option` roles or `aria-activedescendant`, doesn't return focus, and doesn't scroll the selected row into view (the list is cut mid-row at "Topic Desk" in every `popup-*-Search*.png`). | Keyboard users can get stuck, and the arrow keys can move selection below the visible list. | Build all popups on react-aria `Popover`, `Menu`, `Dialog` and `Modal` (already in the stack through UntitledUI) to get Esc, focus trap, focus return and ARIA for free. |
| S-13 | **P1** | Confirmations | `window.confirm` in 7 files: `production/page.js:84,125`, `sessions/page.js:~43`, `review/page.js`, `settings/page.js`, `channels/add/page.js`, `ProviderRoutingPanel.js`, `TemplateAssignPanel.js`. | Unstyled grey browser box, inconsistent with the app. You can't highlight what is destructive or show channel names nicely. Some browsers suppress it on repeated use. | One `ConfirmDialog` (title, consequence sentence, destructive-tone button carrying the verb, e.g. "Pause 5 channels"). |
| S-14 | **P1** | Topbar hamburger and second search icon on desktop | Hamburger ☰ and a separate 🔍 icon both visible at 1440 px in every desktop shot (e.g. `page-usage--desktop.png` at x≈270 and x≈1208). Cause: unlayered `.icon-btn{display:inline-flex}` (`globals.css:308-309`) overrides Tailwind `lg:hidden` / `sm:hidden` (`AppShell.js:337,365`). The drawer itself is `lg:hidden` (`:322`). | On desktop the ☰ button **does nothing** (dead control), and there are two identical search triggers side by side. The crawler opened both ("1-Search-or-run-K" and "2-Search" give the same palette). | Move `.icon-btn` into `@layer components`, or use `max-lg:inline-flex`. Then the ☰ appears only where the drawer exists. |
| S-15 | P2 | ⌘K palette content | `CommandPalette.js:25-36`: `PAGE_ICONS` is keyed to the old routes (`/production`, `/videos`…), so every hub item (`/studio`, `/content`, `/operations`, `/network`) falls back to the same grid icon (`popup-home--desktop--1-Search.png`, where only Settings gets a gear). Descriptions leak issue numbers: "Review queue #106", "Script approvals #106" (`nav.js:31,48`). There are no group headings (Pages / Channels / Run / Appearance). The footer label "Quarry Studio command" is filler. | The palette is hard to scan, and run actions look like navigation except for a green tint. | Group with headings. Use each nav item's own `icon`. Remove `#106`. Give run items a right-aligned "Runs a job" tag, and show "Recent" first. |
| S-16 | P2 | Breadcrumb | `AppShell.js:280-281` falls back to "Quarry Studio" for every non-hub route, so the breadcrumb reads **"Quarry Studio / Quarry Studio"** (`page-usage`, `page-tasks`, `page-thumbs`, `page-warnings`, `page-sessions`, `page-users--desktop.png`). | The "where am I" signal is broken on 18 pages. | Resolve from `ALL_NAV_ITEMS` (it already has `group` and `label`): "Network / Quota Ledger". |
| S-17 | P2 | Overlay system | Four recipes: palette `bg-black/55 backdrop-blur-[3px] z-[100]` (`CommandPalette.js:145-146`); mobile drawer `bg-black/55 blur-[2px] z-50` (`AppShell.js:322-323`); SlideoutDrawer `bg-black/60 backdrop-blur-xs z-50` (`SlideoutDrawer.js:39-42`); popovers use a transparent `fixed inset-0 z-40` catcher with the panel at `z-50` (`AppShell.js:82-83,406-407`). There's no exit animation anywhere (`if (!open) return null`). | Inconsistent dimming and layering. Popups snap shut. Opening the bell while the account menu is open takes two clicks, because the first click is swallowed by the catcher. | Tokens: `--scrim: rgb(0 0 0 / .55)`, `--scrim-blur: 3px`, z-scale `popover 50 / drawer 60 / modal 70 / palette 80 / toast 90`. Add a 120 ms exit fade. Use non-modal popovers with outside-click (react-aria). |
| S-18 | P2 | Loading patterns | Five patterns: `PageSkeleton` (home, analytics, channels, channels/add, logs); `Loader2` spinner plus text (13 files); inline skeleton rows (`app/page.js:186`); subtitle text "loading live queue…" with a fake **400 ms timer** (`tasks/page.js:30,53`); nothing at all (templates cards, thumbs video grid). The sidebar channel list pops in with no placeholder, so "TikTok dashboard" jumps about 170 px (compare `popup-logs--desktop--1-Search-or-run-K.png` and `popup-home--desktop--1-Search.png`). | Inconsistent perceived speed, plus layout shift. | Skeletons that match the final layout for all content regions. Spinners only inside buttons. Five sidebar skeleton rows while brands load. |
| S-19 | P2 | Social, YouTube accounts | `page-social--desktop.png` shows "@@quotequarry302", "@@investorscompasshq" and "**@undefined**" for YT-BOT. Cause: `social/page.js:96` prefixes `@` to a handle that already has one, and to `undefined`. The same pattern is at `channels/page.js:161,164`. | Raw `undefined` leaks into the UI and the double @ looks broken. | Add a `formatHandle(h)` helper: strip a leading @, return "Not linked" when empty. |
| S-20 | P2 | Settings: Notifications switches, Integrations | `settings/page.js:269-283`: the switches only update local `useState` and never persist. There is no "Saved" feedback, and the toggles reset on reload. Integrations come from static `INTEGRATIONS` (`settings/page.js:11`), e.g. "Threads · attention · Token valid until ~Oct 29" seen on 2026-11-18 (sheet of `page-settings--desktop.png`), and the same stale line appears on Social "Platform health" (`page-social--desktop.png`). | Fake controls and stale health statuses. | Persist the switches with an inline "Saved" tick, or remove them. Derive integration status live, or label it "as of <date>". |
| S-21 | P2 | Usage page | `page-usage--desktop.png`: the 7/30/90-day and Sort controls stay active above "Usage ledger unavailable". | The controls invite actions that can't work. | Disable the filters while in error or unavailable state, or hide them. Put a "Set up usage tracking →" CTA in the error card. |
| S-22 | P2 | Add Channel: connected list | `page-channels-add--desktop.png`: four rows show a green **"key saved"** chip next to an empty `key:` value. Only YT-BOT shows `YT_TOKEN_YT_BOT`. The registry fetches 503 in the crawl log. | A success badge sits next to missing data. | Show the chip only when a key value is confirmed. When unknown, show grey "Key status unknown". |
| S-23 | P2 | Account menu | `AppShell.js:400-410`: name "Muzzamil Hassan", initials "MH" and "Studio owner · trusted 30 days" are hardcoded. | Staff and client users would see the owner's identity in their own menu. | Read from the session (`/api/me`), and show the real role and session expiry. |
| S-24 | P2 | Logout | `AppShell.js:274-277`: `catch {}` then `router.replace('/login')` regardless of result. | If logout fails, the user is shown the login page while the cookie may still be valid. | If `!r.ok`, show a toast "Couldn't sign you out — try again" and stay on the page. |
| S-25 | P3 | Theme toggle | Tooltip text "Light theme" is ambiguous (state or action?), `AppShell.js:66`. All 25 `popup-*--2/3-Switch-to-light-theme.png` still show dark UI with the moon icon after the click. That could be capture timing, but it needs a manual check. | Unclear affordance, and the toggle may not apply. | Tooltip "Switch to light theme". Verify the toggle works by hand. Give `ButtonUtility` `onPress` instead of `onClick` (react-aria convention). |
| S-26 | P3 | Mobile drawer | `popup-tasks--mobile-nav.png`: on /tasks the drawer highlights **Settings** (`isPathActive`, `AppShell.js:50-51`). The drawer has no account or log-out row, and no Esc. | A wrong "you are here" signal. On mobile the account actions sit only in the topbar avatar. | Move Tasks under Operations, or make it a top-level item. Add an account row to the drawer footer. |
| S-27 | P3 | DataTable default empty copy | `DataTable.js:9` defaults to `emptyTitle = 'Nothing here'`. | Generic, and doesn't help. | Make `emptyTitle` required, following §3.4. |
| S-28 | P3 (dev only) | Next.js dev indicator | The "N" / "1 issue" bubble covers "Engine connected" in every screenshot. | Only in local dev, not prod. | Ignore, or set `devIndicators: { position: 'bottom-right' }`. |

---

## 3. Redesign proposals: the state-design standard

### 3.1 One state model for every data region

Every fetch-driven region (a card, table, panel or page) resolves to **exactly one** of these states:

| State | Meaning | View |
|---|---|---|
| `loading` | first load, no data yet | `<LoadingState shape="table|cards|chart|stat">`: a skeleton in the final layout, never a spinner |
| `ready` | data present | content |
| `empty` | loaded OK, genuinely zero rows | `<EmptyState>` with a next-step action |
| `not-yet` | loaded OK, but the pipeline that fills it hasn't run yet | `<EmptyState tone="pending">`, e.g. "Fills after tonight's 05:17 UTC analytics run" |
| `refreshing` | data present and a reload is in flight | content plus a 2 px top progress bar on the card. Keep the data |
| `stale` | reload failed, old data kept | content plus `<InlineNotice tone="warn">Couldn't refresh · showing data from 14:02 · Retry</InlineNotice>` |
| `error` | first load failed | `<ErrorState>` with Retry |
| `unavailable` | feature switched off by configuration (e.g. no DB on this server) | `<ErrorState tone="neutral">` explaining what's missing and who fixes it |
| `forbidden` | role can't see it | `<EmptyState icon={Lock}>` "Only owners and staff can see this" |

Implementation: one hook, `useResource(url, {poll})`, returning `{status, data, error, updatedAt, retry}`, plus a `<DataState resource={r} loading={…} empty={…}>{(data)=>…}</DataState>` wrapper. This replaces the hand-rolled `err` / `pending` / `loaded` / `'denied'` / 400 ms-timer variants in review, warnings, tasks, sessions, usage, home and thumbs.

**API contract (fixes S-01 at the root):** a failure is never `200 + empty arrays`. Return `503 {ok:false, code:'DB_DOWN'|'NOT_CONFIGURED'|'UPSTREAM'|'FORBIDDEN', message}`. `useResource` maps `code` to state and copy.

### 3.2 Components (extend `studio/components/ui.js`)

```
EmptyState   { icon, title, sub, action?: {label, onClick|href}, tone?: 'default'|'pending' }
ErrorState   { title, sub, onRetry?, details?: string, tone?: 'error'|'neutral', compact? }
LoadingState { shape: 'table'|'cards'|'chart'|'stat'|'list', rows? }
InlineNotice { tone: 'info'|'warn'|'error'|'ok', children, action? }
Toast        via <ToastProvider>; toast.success / toast.error / toast.progress(id)
ConfirmDialog{ title, body, confirmLabel, tone: 'default'|'danger', onConfirm }  // react-aria Modal
LiveBadge    { status: 'live'|'stale'|'down'|'unknown', updatedAt }  // replaces "real data" / "Engine live"
CountBadge   { value?: number }  // renders nothing when value is undefined, never a constant
```

**ErrorState wireframe (card-level):**

```
┌──────────────────────────────────────────────────────────────┐
│  ⚠  Can't load the review queue right now                    │
│     The studio's database isn't answering. Scripts are safe  │
│     — nothing renders or uploads while approvals are held.   │
│                                                              │
│     [ Try again ]   Check system status →                    │
│                                                              │
│     ▸ Technical details            (collapsed, copy button)  │
└──────────────────────────────────────────────────────────────┘
```

**Toast placement and behaviour:** bottom-right on desktop, top-centre on mobile, stacked up to 3, z-90.
- Success: auto-dismiss after 4 s.
- Error: stays until dismissed and always has an action.
- Progress toast for runs:

```
┌───────────────────────────────────────────────┐
│ ◌  Starting Quote Quarry Shorts…              │   → on dispatch
│ ●  Run started · usually takes ~12 min   View │   → on 200 + started
│ ✓  Quote Quarry Short ready · queued 22:35   │   → poll sees success (also lands in bell "Recent runs")
│ ✕  Run failed at Render step  [Open log] [Retry] │
└───────────────────────────────────────────────┘
```

**Bell redesign (two tabs, live, honest):**

```
┌ Alerts ─────────────── [Open 2] [Recent runs] ┐
│ ● Facebook reels blackout        bad · FB  2h │
│ ● Threads token expires soon     warn     1d  │
├───────────────────────────────────────────────┤
│ if the warnings can't be loaded:              │
│ ⚠ Can't check alerts right now · Retry        │
│   (bell icon shows a grey "?" dot, not 0)     │
└───────────────────────────── Open triage → ───┘
```

### 3.3 Popup / overlay standard

| Layer | z | Scrim | Dismiss | Focus | Built on |
|---|---|---|---|---|---|
| Tooltip | 30 | none | hover out / Esc | none | RAC `Tooltip` |
| Popover / menu (bell, account, row "…") | 50 | none | outside click, Esc, select | moves into the menu, returns to trigger | RAC `Popover` + `Menu` |
| Drawer (mobile nav, SlideoutDrawer) | 60 | `--scrim` + 3 px blur | scrim click, Esc, ✕ | trapped, returns to trigger | RAC `Modal` |
| Modal / ConfirmDialog | 70 | `--scrim` | Esc, Cancel. Scrim click doesn't dismiss destructive dialogs | trapped, initial focus on Cancel for danger | RAC `Modal` + `Dialog` |
| Command palette | 80 | `--scrim` + 3 px blur | Esc, scrim, select | trapped, `combobox` + `listbox`, `scrollIntoView` on the active option | RAC `ComboBox` / `Autocomplete` |
| Toast | 90 | none | timer, ✕, swipe | not stolen, `aria-live="polite"` (errors use `assertive`) | custom |

Motion: enter 160 ms `pop-in` (already exists), exit 120 ms fade plus 4 px translate. Both are already gated by `prefers-reduced-motion` (`globals.css:531`).

### 3.4 Copy guidelines (for a non-technical owner)

Write every message in three parts: **What happened** (one short sentence) → **What it means for you** (are videos still safe or publishing?) → **What to do** (a button).

Never show these in user-facing copy: `db`, `DATABASE_URL`, `Neon`, `endpoint`, `/api/...`, `HTTP 5xx`, `undefined`, `null`, `500`, stack text, env-var names. Those go only in "Technical details".

| Raw today | Plain English replacement |
|---|---|
| `db unavailable` (Review) | "Can't load the review queue right now. Held scripts are safe — nothing publishes until you approve. [Try again]" |
| `db unavailable` (Warnings) | "Can't check warnings right now, so the studio can't confirm everything is fine. [Try again]" |
| `database not configured on this server` (Usage) | "Usage tracking isn't switched on for this copy of the studio. It works on the live site. [Open live site]" |
| `Routing store unavailable (DATABASE_URL missing…)` | "Custom provider order can't be saved right now, so the studio is using its default order. Your videos still generate." |
| "The /api/overview endpoint did not answer…" | "Can't reach the studio engine. Your channels keep running on GitHub — this only affects this screen. [Try again]" |
| `HTTP 503` (Create) | "The video service is busy or offline. Your topic is kept — try again in a minute." |
| `not compatible: …` | "This template doesn't fit Quote Quarry: <reason in words>." |
| "No sessions recorded" (on error) | "Can't load sign-ins right now. [Try again]" |
| "Nothing here" | name the object and the next step, e.g. "No videos published yet — create your first one" |
| `@undefined` | "Not linked" |

Empty-state titles name the thing ("No open warnings"), and the subline says when it will fill or what to do. Exclamation marks and "Oops" are banned.

### 3.5 Truth signals

Counts, "live" chips and health dots must come from data, or not render at all. When status is unknown, show a grey dot with the tooltip "Couldn't check". Applies to: sidebar badges (S-02), Studio Review tab badge, Templates Drafts count, Network "Channels (N)", "Engine live", "Engine connected", "real data" chips (`app/page.js:157`, `analytics/page.js:340,461`), Settings integrations.

---

## 4. Quick wins (each ≤ 1 day)

1. **Stop the false all-clear (S-01).** `/api/warnings` and `/api/review` GET return 503 when `!dbReady`. `useOpenWarnings` exposes `status` (`ok`/`error`). The bell, home card and Tasks show "Can't check right now" on error. About 2 h.
2. **Delete the hardcoded badges and statuses (S-02, S-03).** `AppShell.js:149-158` should use `useOpenWarnings().rows.length` and a review-count hook. Remove `badge:'3'` (`studio/page.js:14`) and use the live count for "(16)" and "(14 · 4)". Until a health probe exists, have "Engine live" use `useOpenWarnings` status, or hide it. About 3 h.
3. **One state per region in Review, Warnings and Sessions (S-05).** When `err` is set, render ErrorState instead of the spinner. About 1 h.
4. **Add `action` to EmptyState and create ErrorState** (`ui.js:227`), and replace the 5 inline red `<p>{err}</p>` renders. About 3 h.
5. **Error-copy map (§3.4)** in `lib/error-copy.js`, applied in review, warnings, sessions, usage, providers routing panel, home and create. About 4 h.
6. **Palette safety (S-04).** Check `r.ok`, add a confirm step for `kind:'run'`, stay on the page and show the result inline in the palette footer until the toast system exists. Fix `PAGE_ICONS` to use `n.icon`, and remove `#106`. About 2 h.
7. **Home keeps data on a failed poll (S-08)**, and the "real data" chip becomes conditional (S-09). About 2 h.
8. **CSS layer fix for `.icon-btn` (S-14)**, which removes the dead desktop ☰ and the duplicate search icon. About 30 min.
9. **`formatHandle` helper (S-19)** and breadcrumb from `ALL_NAV_ITEMS` (S-16). About 1 h.
10. **Pause everything reconciles per channel (S-10).** About 1 h.
11. **Esc closes the bell, account menu and mobile drawer**, and the drawer locks body scroll (S-12, stop-gap). About 1 h.

## 5. Bigger bets (multi-day, high impact)

1. **`useResource` + `<DataState>` everywhere (§3.1)**, with the 503 `{ok:false, code}` API contract on all routes. Migrate the 20+ hand-rolled pages and the 18 silent catches in Thumbnails. This is the single change that makes every loading, empty and error state honest and consistent. About 3–4 days.
2. **Toast provider + "Recent runs" tray** that polls GitHub Actions run status for every dispatch (Production buttons, palette runs, Create Video, Review approve). The owner gets started → running → done/failed without opening Execution Logs. This generalizes the pattern Create Video already uses (`create/page.js:35`). About 3 days.
3. **Overlay system on react-aria (§3.3).** Rebuild the bell, account menu, mobile drawer, SlideoutDrawer and palette (as a RAC Autocomplete) on shared `Popover`/`Modal` primitives, with scrim and z tokens and exit motion. Replace all 7 `window.confirm` calls with `ConfirmDialog`. About 2–3 days.
4. **Health model and LiveBadge.** Add `/api/health`, which pings DB, the GitHub dispatch token and the last successful run per channel. Drive the topbar status, sidebar footer, every "live/real data" chip and the Settings integrations list from it. Remove `INTEGRATIONS` static data. About 2 days.
5. **Re-crawl with real popups.** Extend the crawler to reset to each page before opening popups (the current run captured everything over `/studio?tab=create`). It should also click the bell, the avatar, the row "…" menus, the SlideoutDrawers, and a forced-failure mode for each API (e.g. `?simulate=db_down`). That way every state in §3.1 gets a screenshot regression test. About 1–2 days.
