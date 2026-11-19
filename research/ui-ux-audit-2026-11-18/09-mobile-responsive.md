# 09 — Mobile (390px) and tablet (768px) audit

**Lens:** responsive and mobile web, covering all 25 pages.
**Evidence:** every `page-*--mobile.png` and `page-*--tablet.png` and every `popup-*--mobile-nav.png` in `%TEMP%\studio-ui-audit\shots-full\`, the real PNG widths (checked from the file headers), and the code at `studio/app/globals.css`, `studio/components/shell/AppShell.js`, `studio/components/DataTable.js`, `TabNav.js`, `ui.js` and the individual page files.

**How to read the widths.** A full-page screenshot comes out wider than the viewport when the page scrolls sideways. The mobile viewport is 390px. Three pages captured wider than that:

| Screenshot | Captured width | Sideways scroll |
|---|---|---|
| `page-channels--mobile.png` | **538px** | 148px |
| `page-network--mobile.png` | **538px** | 148px (it embeds Channels) |
| `page-settings--mobile.png` | **492px** | 102px |

Every other page captured at 390px.

---

## 1. Plain-English summary for the owner

- **On a phone, the panel is a shrunk desktop. It was not designed for phones.** `globals.css` has **no phone or tablet layout rules at all**: its only media query is reduced-motion, at line 531. 11 of the 28 page files have zero responsive classes. Three pages (Channels, Network, Settings) are wider than the phone, so you have to pan sideways.
- **The jobs you would actually do on a phone are the worst ones.**
  - Approving a script and acknowledging a warning both use tiny text links about 16px tall (`review/page.js:336-358`, `warnings/page.js:60`).
  - The review detail is forced into two columns, about 150px each on a phone (`review/page.js:192`).
  - In the screenshots, both pages show "db unavailable" and an endless "Loading…" spinner at the same time.
- **Lists that matter turn into sideways-scrolling tables.**
  - On Videos and Logs you see a brand badge and half a title. The status, date and views columns are off-screen, and nothing hints that you can scroll.
  - Even on a tablet, the Logs table cuts off the Title column, which is the most useful one.
- **Some badges and buttons are wrong at every size.**
  - The "3" (Studio) and "1" (Operations) badges in the menu are hardcoded, as is the "3" on the Review Queue tab (`AppShell.js:149-158`, `studio/page.js:14`). Your phone tells you three scripts are waiting when Tasks says 0.
  - A CSS ordering bug makes the "phone-only" menu and search buttons show up on the desktop as well (`globals.css:308`).
- **The fix is a "pocket mode", not a second app.** Add a bottom tab bar on phones with four tabs: **Today · Approve · Alerts · More**. Make the cards thumb-sized with 48px buttons and a sticky Approve/Reject bar. The Tasks page (`page-tasks--mobile.png`) is already 80% of what "Today" should look like.

---

## 2. Per-page scorecard

Scores run from 1 (unusable) to 5 (good).

| Page | Tablet | Mobile | Worst problem | Evidence |
|---|---|---|---|---|
| home | 4 | 3 | The production-line table scrolls inside its card, so Episode and Slots are hidden. The "Views per day" chart is an empty block of about 300px. | `page-home--mobile.png`, `app/page.js:217` |
| studio (hub) | 3 | 2 | Two page headers stacked (Studio Desk, then Review Desk) take about 330px before any content. The tab bar is cut off at "Create". | `page-studio--mobile.png` |
| content (hub) | 3 | 2 | Double header. The third tab shows only an icon. The video table shows the brand badge and a cut-off title. | `page-content--mobile.png` |
| operations (hub) | 4 | 2 | Channel names are cut to "QUOT…", "INVES…", "THE M…". "Produce now" and "Force Doc + Clips" sit side by side, about 6px apart. | `page-operations--mobile.png`, `production/page.js:197-207` |
| network (hub) | 3 | **1** | Sideways overflow (538px). The tab says "Channels (16)" when there are 5. The third tab is cut off at "Qu…". | `page-network--mobile.png`, `network/page.js:12` |
| settings | 4 | 2 | Sideways overflow (492px). The tab bar is cut off. The "Security — active sign-ins" text column is about 90px wide. | `page-settings--mobile.png` |
| review | 2 | **1** | The red "db unavailable" and the "Loading queue…" spinner show together and stay. In code, the detail view is fixed at 2 columns and Approve/Reject are 12.5px text links. | `page-review--mobile.png`, `review/page.js:157-163, 192, 336-358` |
| topics | 4 | 3 | The +/× actions are about 28px icon buttons with no visible frame. The "Your own topic" placeholder is cut off. | `page-topics--mobile.png`, `topics/page.js:133,143,203` |
| create | 4 | 4 | The Voice select is cut off ("Andrew (US, deep r"). Otherwise it stacks well. | `page-create--mobile.png` |
| thumbs | 3 | 3 | The video picker tiles are empty placeholders. The template grid is cut off under the registry row on tablet. The 2,943px page mixes 4 steps. | `page-thumbs--mobile.png`, `page-thumbs--tablet.png` |
| templates | 4 | 4 | Cards stack cleanly. The only issue is two ~44px full-width buttons per card, which makes a long scroll. | `page-templates--mobile.png` |
| videos | 3 | 2 | The table shows a 90px brand-badge column plus a cut-off title. Kind, Published and Views are off-screen. | `page-videos--mobile.png`, `DataTable.js:19` |
| social | 4 | 4 | The layout is fine. Copy bugs: "@@quotequarry302" and "@undefined". | `page-social--mobile.png` |
| music | 3 | 2 | **The play icon is invisible.** Its colour is `transparent` when not playing (`music/page.js:111`), so each row shows an empty 28px square. | `page-music--mobile.png` |
| production | 4 | 2 | Same as Operations: names cut off and the two dispatch buttons crammed together. | `page-production--tablet.png`, `page-operations--mobile.png` |
| logs | 3 | 2 | The table shows only When and Platform. Title is off-screen, even on tablet. "Team activity" repeats the cut-off "muzzamilhassan302@g…" 12 times. | `page-logs--mobile.png`, `page-logs--tablet.png` |
| warnings | 2 | **1** | Stuck spinner plus error. In code, Acknowledge is an 11.5px link and the Resolve note is an 11.5px input 160px wide (iOS zooms on focus). | `page-warnings--mobile.png`, `warnings/page.js:60,83` |
| channels | 3 | **1** | Sideways overflow (538px). Each card header has 6 unlabelled ~28px icon buttons in a row that cannot wrap. | `page-channels--mobile.png`, `channels/page.js:100-141` |
| channels-add | 4 | 3 | Channel names and handles are cut off ("Debt-Free Doct…"). A 220-word help paragraph sits above the main button. | `page-channels-add--mobile.png` |
| providers | 3 | 2 | **5,111px** of scrolling: 13 provider cards, each with an essay of notes. The key inputs are 14px, so iOS zooms on focus. | `page-providers--mobile.png` |
| usage | 3 | 3 | The error state is clear. The page is otherwise empty. | `page-usage--mobile.png` |
| analytics | 3 | 3 | KPI labels are cut off ("WATCH TIME · …", "SUBS GAINED · …"). Six stacked empty-state cards, each about 150–200px. | `page-analytics--mobile.png`, `analytics/page.js:295` |
| tasks | 4 | **4** | The best phone page: three clear cards and plain language. It is the model for "Today". | `page-tasks--mobile.png` |
| users | 4 | 3 | The 3-column KPI row wraps "CLIENT CHANNELS BOUND" onto 3 lines. Its header style differs from every other page. | `page-users--mobile.png`, `users/page.js:38` |
| sessions | 4 | 3 | The 3-column KPI row cuts labels to "ACTI…", "USER…", "EXPI…". | `page-sessions--mobile.png`, `sessions/page.js:138` |

**Averages:** tablet 3.4, mobile 2.5. Tablet is "usable with friction". Phone is "not a product".

---

## 3. Findings table

| ID | Sev | Page / component | Evidence | Problem | Recommendation |
|---|---|---|---|---|---|
| M-01 | **P0** | Channels, Network | `page-channels--mobile.png` (538px wide), `page-network--mobile.png`; `channels/page.js:100` | The title row is `flex items-center gap-2` with **no `flex-wrap`**. It holds the name, the status chip and 6 `ButtonUtility` buttons, which forces the card wider than 390px and makes the whole page pan sideways. | Split the row in two. Row 1: name + chip + subs. Row 2: the actions. On phones, replace the 6 icons with one "Manage ▾" button that opens a bottom sheet listing Pause / Schedule / Template / Keys / Routing / Edit **with text labels**. |
| M-02 | **P0** | Review (approve on phone) | `review/page.js:192` `grid grid-cols-2`; `:336-358` text-link buttons at `text-[12.5px]` | The single most important phone action is a ~18px-tall coloured text link, 12px from "Reject". The detail view is two columns at every width. | Use `grid md:grid-cols-2`. Add a sticky bottom decision bar on phones: `[Reject]` (secondary, 48px) and `[Approve + resume]` (primary, 48px), with the note field above it. |
| M-03 | **P0** | Review, Warnings, Studio hub | `page-review--mobile.png`, `page-warnings--mobile.png`, `page-studio--mobile.png`; `review/page.js:157-163`, `warnings/page.js:150-153` | When the request fails, `err` is set, but the spinner condition (`!detail && !pending`) is still true. You see "db unavailable" in red **and** "Loading queue…" forever. | When `err` is set, render an error card ("Can't reach the review database — Retry") and never the spinner. Reuse the clean pattern from `page-usage--mobile.png` ("Usage ledger unavailable"). |
| M-04 | **P1** | Global shell (all sizes) | Desktop topbar crop of `page-home--desktop.png` shows a hamburger **and** a second search button next to the search pill; `globals.css:308-322`; `AppShell.js:337,365` | `.icon-btn { display:inline-flex }` is unlayered CSS. In Tailwind v4, unlayered CSS beats `@layer utilities`, so `lg:hidden` and `sm:hidden` lose. The desktop shows a dead hamburger (the drawer itself is `lg:hidden`) and a duplicate search icon. Tablet shows the duplicate search too. | Wrap all custom component classes in `globals.css` (`.icon-btn`, `.btn-*`, `.card`, `.qs-*`…) in `@layer components { … }`. One edit fixes it everywhere. |
| M-05 | **P1** | Settings | `page-settings--mobile.png` (492px wide) | The page is wider than the phone. The Engine key/value rows (`quarry-studio.vercel.app`, `yt-mcp/ · fb-outbox/`) run to the right edge. The likely cause is grid/flex children without `min-w-0`, so non-wrapping text widens the track (confirm in DevTools). | Add `min-w-0` to grid children. Let values break (`break-all` on mono values) or stack label above value below 640px. |
| M-06 | **P1** | DataTable (Videos, Logs, Content, Review queue, Analytics search terms) | `DataTable.js:19` (only `overflow-x-auto`); `page-videos--mobile.png`, `page-logs--mobile.png`, `page-logs--tablet.png` | No responsive mode. The columns have no priority, so on phones the first visible column is a 90px brand badge and the useful data is off-screen with no scroll cue. | Add `columns[].mobile: 'primary' \| 'meta' \| 'hide'`. Below `md`, render a **card list**: badge + title (2 lines), then a meta line (date · kind · views) with chips on the right. Keep the table at `md` and up, and put Title second, not last. |
| M-07 | **P1** | Operations / Production channel runs | `page-operations--mobile.png`; `production/page.js:197-207` | The name is `truncate` inside `flex-1`, while the two buttons are `shrink-0`, so the name is squashed to "QUOT…". "Produce now" and "Force Doc + Clips" are side by side and both start a real GitHub run, so a mis-tap is likely. | On phones, stack the full name and chips on top, then one full-width "Produce now" button. Move "Force Doc + Clips" into a "⋯" menu with a confirm sheet. |
| M-08 | **P1** | Music | `page-music--mobile.png` (empty squares); `music/page.js:110-111` | The play icon colour is `'transparent'` when not playing, so the button looks like a blank checkbox. The button is `w-8 h-8` = **28px** (14px root). | Use `color: var(--muted)` and size it 40px on touch. |
| M-09 | **P1** | Inputs everywhere | `untitledui/base/input/input.*:83` (`text-md`); `--text-md` = `calc(var(--spacing)*4)` = 1rem = **14px** (root is 14px, `globals.css:97`); `warnings/page.js:83` `text-[11.5px]` | iOS Safari zooms the page whenever you focus an input under 16px. That covers every key field on Providers, Topics "Your own topic", Resolve note, Settings password and Team email. | Add a touch rule: `@media (pointer:coarse){ input, select, textarea { font-size:16px } }`. |
| M-10 | **P1** | Bell popover (phone) | `AppShell.js:83` `absolute right-0 w-[340px]`; bell at x≈285 in `page-home--mobile.png` | This is inferred from code. The panel is right-aligned to the bell, which sits about 90px from the right edge, so 340px puts its left edge at about −40px (off-screen). | Below `sm`, use `fixed inset-x-3 top-[64px]`; above that, keep it as a dropdown. Better still, make Alerts a bottom tab (section 4). |
| M-11 | **P1** | Fake counts on phone chrome | `AppShell.js:149-158` (hardcoded `3`, `1`); `studio/page.js:14` (`badge:'3'`); `network/page.js:12` (`'Channels (16)'`); `popup-home--mobile-nav.png` | On a phone the badges are the whole status story, and these are made up. Tasks says "0 awaiting approval" (`page-tasks--mobile.png`). | Feed them from `useOpenWarnings()` plus a review-count hook. Hide a badge at 0. Change the tab label to plain "Channels". |
| M-12 | **P1** | Hub pages: Studio, Content, Operations, Network, Settings | `page-studio--mobile.png`, `page-content--mobile.png`, `page-operations--mobile.png`, `page-network--mobile.png` | The hub `PageHeader` plus the embedded page's `PageHeader` stack two 26px titles, two icons and two descriptions: about 330px of a 844px screen before any content. | When embedded, pass `embedded` to child pages to suppress their `PageHeader`, or show only the hub header and a one-line description on phones. |
| M-13 | **P1** | TabNav (all hubs) | `TabNav.js:34` `overflow-x-auto no-scrollbar`; `page-content--mobile.png` (3rd tab = icon only), `page-network--mobile.png` ("Qu…") | The tabs scroll with the scrollbar hidden and no fade, so the cut-off tab looks broken. | Add a right-edge fade mask and `scrollIntoView({inline:'center'})` on the active tab. Use short labels on phones: Videos / Social / Audio, Pipelines / Logs / Warnings, Channels / Providers / Quota. |
| M-14 | **P2** | KPI grids | `sessions/page.js:138`, `warnings/page.js:156`, `users/page.js:38` (`grid-cols-3`); `analytics/page.js:295` | Three tiles at 390px gives about 110px per tile, so labels are cut off or wrap onto 3 lines. | Use `grid-cols-2 sm:grid-cols-3` with short labels (Active / Users / Expired), or a single horizontal "stat strip" at 12px. |
| M-15 | **P2** | Tap targets | `globals.css:571` (`.qs-side-link` 34px); `button-utility` `p-1.5` + `size-5` ≈ 28px (+3.5px pseudo halo); `.icon-btn` 36px (`globals.css:314`); `warnings/page.js:60` | The 14px root shrinks every Tailwind size to 87.5%. Nearly every icon action is 28–36px, against a 44px guideline. | Add `@media (pointer:coarse)` overrides: `.qs-side-link{height:44px}`, `.icon-btn{width:44px;height:44px}`, and a ButtonUtility `min-w-11 min-h-11`. |
| M-16 | **P2** | Tiny text | `rg 'text-\[(9\|10\|10.5\|11\|11.5)px\]'` = **376** occurrences in `app/` and `components/`; root 14px makes `text-xs` 10.5px | On a phone, the 10.5–11px grey text on dark is hard to read (e.g. integration notes, "views · 28d", footers). | Below `md`: body copy at least 13px, meta text at least 12px, overline at least 11px. Replace the arbitrary px values with two tokens, `--text-meta` and `--text-overline`. |
| M-17 | **P2** | Mobile topbar | `AppShell.js:341` breadcrumb `hidden md:flex`; `:392` ThemeToggle | Phones show no page title at all. When you scroll, you don't know where you are. The theme toggle takes a prime slot. | On phones show `[≡] Page title ……… [🔔] [MH]`. Move search into the drawer/palette and the theme toggle into the account menu. |
| M-18 | **P2** | Tablet topbar | `page-home--tablet.png` crop ("Quarry / Studio" on 2 lines, "Over…"); `AppShell.js:280` | `pageTitle` uses an exact `href` match, so most sub-routes fall back to "Quarry Studio", which is then cut to "Quarry …" (`page-logs--tablet.png`, `page-production--tablet.png`). The root crumb wraps. | Resolve the title with `isPathActive` plus the sub-route label. Add `whitespace-nowrap` to the root crumb, or hide it below `lg`. |
| M-19 | **P2** | Tablet sidebar | `AppShell.js:313-314` `hidden lg:flex` | At 768px you get no sidebar at all, just a hamburger, even though a 56px rail mode already exists. | Show the collapsed rail from `md` (`hidden md:flex`, forced collapsed below `lg`). Tablet then gets one-tap navigation. |
| M-20 | **P2** | Providers | `page-providers--mobile.png` (5,111px) | 13 always-expanded cards, each with model strings, notes, a channel select, a key input and Save & test. | Collapse each card to a 56px row (name · class chip · "key ✓ / not set"). Tap to expand. Group them into "Configured" and "Available". |
| M-21 | **P2** | Home | `page-home--mobile.png` | The empty "Views per day" chart still reserves about 300px. The production-line table scrolls inside its card. | When there is no data, collapse to a single line ("No views yet in 28 days"). Turn the production line into per-channel cards (see M-06). |
| M-22 | **P3** | Footer | `AppShell.js:431` | `justify-between` with no wrap, so on phones "v4.0 · Dreams UI" breaks onto 2 lines under the tagline (every mobile shot). | Use `flex-col sm:flex-row` with gap-1, or hide the version on phones. |
| M-23 | **P3** | Social | `page-social--mobile.png` | "@@quotequarry302" (double @) and "@undefined" for YT-BOT. | Strip a leading @ before prefixing it. Show "—" when the handle is missing. |
| M-24 | **P3** | Mobile drawer | `popup-*--mobile-nav.png`; `AppShell.js:324` | A 250px drawer at 34px rows is fine for now. The issues are the hardcoded badges (M-11), channel links at about 30px, and "TikTok dashboard" as an 11.5px text link. Note: the Next dev "N/Issues" pill overlaps the footer, but that is dev-only. | Make rows 44px and the drawer `w-[min(300px,85vw)]`. Once the bottom bar exists, the drawer only needs to serve "More". |

---

## 4. Redesign proposal: "Pocket mode"

### What the owner realistically does on a phone

From the screens and the product brief, these are the jobs, ranked by how often and how urgent:

1. **"Is everything OK?"** Engine running, today's uploads queued or posted, any failures. (Today Home + Tasks + Production line.)
2. **Approve or reject a held script** before its slot. (Review.)
3. **Acknowledge or resolve a warning** after an ntfy push. (Warnings.)
4. **Approve research topics** for tonight. (Topics.)
5. **Emergency stop:** "Pause everything". (Production master flow.)

None of the editing pages (Thumbs, Create, Templates, Providers, Channels config) are phone jobs. They should remain *reachable but not optimised* on phones.

### Bottom tab bar (phones only, `md:hidden`)

```
┌──────────────────────────────────────┐
│ ≡  Today                    🔔3  MH │  ← 56px topbar with page title (M-17)
├──────────────────────────────────────┤
│ ● Engine running · 4 queued today    │  ← status strip (green/amber/red)
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ ⚠ 2 need you                     │ │  ← "Needs you" card: the only hero
│ │  • 1 script awaiting approval  › │ │
│ │  • 1 warning: FB token expiring › │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ Today's uploads                  │ │  ← one row per channel (card list,
│ │ QU Quote Quarry  ● queued 22:35  │ │     NOT a scrolling table)
│ │ IN Investor's…   ● queued 23:35  │ │
│ │ TH Money Rule…   ✓ posted 00:05  │ │
│ │ YT YT-BOT        ⏸ paused        │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ Last 24h  241 subs · 1.2K views  │ │  ← compact stat strip, no empty charts
│ └──────────────────────────────────┘ │
│ [ ⏸  Pause everything ]  (danger,    │  ← kill switch with confirm sheet
│                            48px)     │
├──────────────────────────────────────┤
│  ⌂ Today   ✓ Approve·1  🔔 Alerts·1  ⋯ More │ ← 64px + safe-area inset
└──────────────────────────────────────┘
```

- **Today** combines `/tasks`, home KPIs and the production line, laid out as cards.
- **Approve** is a single queue that merges **held scripts** (Review) and **research topics** (Topics), each a swipeable or tappable card.
- **Alerts** lists open warnings with large `Acknowledge` and `Re-check` buttons. `Resolve` opens a bottom sheet with a required note.
- **More** opens the existing drawer: Content, Analytics, Channels, Settings…
- Badges come from live hooks only (M-11).

### Approve flow (script detail on a phone)

```
┌──────────────────────────────────────┐
│ ←  Quote Quarry · Short · 22:35 slot │
├──────────────────────────────────────┤
│ "The Toxic Trap of False Hope"       │
│ ┌ Script ──────────────────────────┐ │
│ │ 16px readable text, full width   │ │
│ │ (collapsible "show full script") │ │
│ └──────────────────────────────────┘ │
│ ┌ Thumbnail ───────────────────────┐ │
│ │ [ cand 1 ][ cand 2 ]  ← swipe    │ │
│ └──────────────────────────────────┘ │
│ Disclosure: ☐ AI voice  ☐ …  (44px)  │
│ Note (16px input) ________________   │
├──────────────────────────────────────┤  ← sticky, safe-area padded
│ [  Reject  ]   [ ✓ Approve + run  ]  │  ← 48px, 12px gap, primary right
└──────────────────────────────────────┘
```

Deep-link ntfy pushes straight here (`/review?id=…`), so "approve from the notification" takes two taps.

### Implementation sketch

- `AppShell.js`: add `<MobileTabBar/>` (`md:hidden fixed inset-x-0 bottom-0 h-16 pb-[env(safe-area-inset-bottom)]`) and give `main` `pb-24 md:pb-7`.
- Export `viewport = { viewportFit: 'cover' }` from `app/layout.js` so the safe-area insets work.
- Today = `/` on phones (render `<PocketToday/>` below `md`), or a dedicated `/m` route. The responsive same-route approach is preferred, since no extra URLs need maintaining.
- Reuse the `useOpenWarnings()` hook and add a `useReviewCount()` hook. Both feed the tab badges and the drawer.

### Tablet (768px) proposal

- Show the 56px icon rail (M-19) instead of the hamburger.
- Two-column card grids already work (Templates, Production at 768px are 4/5). The main tablet wins are DataTable column priority (Title second, M-06), the breadcrumb (M-18), and the duplicate search icon (M-04).

---

## 5. Quick wins (each ≤ 1 day)

1. **Layer fix:** wrap the custom classes in `globals.css` in `@layer components`. This kills the desktop hamburger and duplicate search icon (M-04).
2. **Channels overflow:** `flex-wrap` plus a two-row header in `channels/page.js:96-141`. This fixes Channels and Network sideways scroll (M-01).
3. **Settings overflow:** `min-w-0` on grid children and stacked key/value rows below 640px (M-05).
4. **Error-not-spinner** on Review and Warnings (M-03).
5. **Live badges:** delete the hardcoded `3`, `1`, `'3'` and `'Channels (16)'` (M-11).
6. **Music play icon colour** (M-08). This is a one-line fix.
7. **16px inputs on touch** (M-09). One CSS rule.
8. **Coarse-pointer tap sizes** for `.qs-side-link`, `.icon-btn` and ButtonUtility (M-15). One media block.
9. **KPI grids** to `grid-cols-2 sm:grid-cols-3` on Sessions, Warnings and Users (M-14).
10. **TabNav** edge fade, scroll active tab into view, short labels (M-13).
11. **Review detail** `grid md:grid-cols-2` and real 44px+ Approve/Reject buttons (M-02, minimal version).
12. **Bell popover** `fixed inset-x-3` below `sm` (M-10).
13. **Topbar title** on phones, plus `isPathActive` title resolution on tablet (M-17, M-18).
14. **Overflow guard in the crawler:** have the screenshot script fail when `document.documentElement.scrollWidth > innerWidth`, so a regression like M-01 can never ship silently again.

## 6. Bigger bets (multi-day)

1. **Pocket mode** (section 4): bottom tab bar, Today, a unified Approve queue, Alerts, and a sticky decision bar. About 3–4 days. Highest owner value: it turns the phone into the "approve and ack" remote control.
2. **Responsive DataTable**: a `mobile` column role and a card-list renderer below `md`, rolled out to Videos, Logs, Review queue, Content and Analytics search terms (M-06). About 2 days.
3. **Tablet rail plus a breakpoint system:** rail from `md`, and a documented breakpoint contract (phone under 640, tablet 640–1023, desktop 1024 and up) in `globals.css`, with a `@custom-variant touch (@media (pointer:coarse))` for touch sizing. About 1–2 days.
4. **Type scale reset:** retire the 376 arbitrary 9–11.5px sizes for 3 tokens, and reconsider the 14px root (`globals.css:97`), which silently shrinks every Tailwind size including tap targets. About 2 days plus a visual regression pass.
5. **Progressive disclosure for config pages** (Providers, Channels, Thumbs): collapsed rows, bottom-sheet editors on phones, and on Thumbs one step per screen with a step indicator. About 3 days.
6. **Hub de-duplication:** one header per screen through an `embedded` prop on child pages (M-12). This also helps desktop. About 1 day.
