# 10 · Accessibility audit (WCAG 2.2 AA) — Quarry Studio

Auditor lens: accessibility (IAAP CPACC/WAS level), 2026-11-18. Read-only review.
Evidence: clean screenshots in `C:\Users\Revnix\AppData\Local\Temp\studio-ui-audit\shots-full\`, `_errors-by-page.md`, and source under `studio/`. Contrast ratios were **computed** from the real token hex values (WCAG 2.x relative-luminance formula; alpha tints composited over their real surface). The clean crawl has no light-theme screenshot (the "Switch to light theme" popups only show the hover tooltip), so light-theme results come from the tokens, not from a screenshot.

---

## 1. Plain-English summary for the owner

- **Much of the small grey text is too faint to read comfortably.** Table headers, hints, the topbar search box, the footer and the sidebar section labels all fall below the legal minimum contrast. In the **light theme** it's worse: every green, amber, red and blue status pill fails, and some badges are white text on pale lavender (1.35:1, close to invisible).
- **Keyboard and screen-reader users get stuck in the popups.** The alerts bell, account menu, mobile menu and template preview don't close with Escape, don't move focus into themselves, and don't tell assistive tech they are open. The command palette highlights rows with colour only, so a screen reader hears nothing while you arrow through the results.
- **Some features can't be used without a mouse at all.** The "+ rot" (add to rotation) control on Thumbnails and the template preview cards on Video Templates are plain text/boxes with a click handler, so the Tab key never reaches them. Several "pick one" choices (visual style, genre, design category, thumbnail template) show which one is selected by border colour only.
- **The broken-table errors on Content, Logs and Videos are an accessibility bug.** The table never says which column names each row, so screen readers can't announce rows. The fix is one line in the shared table component.
- **Screen readers don't hear page changes.** Every page has the same browser title, so the built-in "you moved to a new page" announcement never fires. Many pages also show the wrong breadcrumb ("Quarry Studio / Quarry Studio").

---

## 2. Computed contrast results (the hard numbers)

Requirement: text **4.5:1** (1.4.3); UI component boundaries, icons and focus rings **3:1** (1.4.11). All text in this app is under 18.66px bold, so the 4.5:1 rule applies everywhere.

### Dark theme (default)
| Pair | Where used | Ratio | Result |
|---|---|---|---|
| `#98a2a7` on sidebar `#0c0f0d` | sidebar links (`globals.css:576`) | 7.40 | pass |
| `#6b7671` on `#0c0f0d` | sidebar group labels, "manage →", "TikTok dashboard", "Command Center" (`globals.css:563`, `AppShell.js:173,204,227`) | **4.09** | **FAIL** |
| `--faint #64748b` on `--bg #0b0d0e` | page-level hints | **4.09** | **FAIL** |
| `--faint` on `--surface #121518` | table `th` (`globals.css:395`), palette sub-lines (`CommandPalette.js:198`), chart axis text (`charts.js:97,113`), EmptyState sub | **3.85** | **FAIL** |
| `--faint` on `--surface-2 #181c20` | `.input::placeholder` (`globals.css:281`), `.kbd`, unselected Segmented (`ui.js:206`) | **3.60** | **FAIL** |
| `fg-quaternary #686868` on `bg-primary #0f1113` | breadcrumb (`AppShell.js:342-344`), footer (`AppShell.js:431`), "N entries" (`DataTable.js:39,43`) | **3.40** | **FAIL** |
| `fg-quaternary #686868` on `bg-tertiary #2a3138` | topbar "Search or run…" + ⌘K (`AppShell.js:358-363`) | **2.36** | **FAIL** |
| `chip-bad #ef4444` on its 10 % tint | every red Chip — **including the "YouTube" platform chip** (`logs/page.js:87`) | **4.45** | **FAIL** (marginal) |
| `text-white/40` on surface | helper text in channel wizard (`channels/add/page.js:688`) | **3.84** | **FAIL** |
| `text-white/45` on surface | voice ids (`channels/add/page.js:674`) | 4.51 | pass (barely) |
| `--muted #94a3b8` on surface / surface-2 | body sub-text | 7.15 / 6.68 | pass |
| chip-ok / warn / info on tint | status chips | 6.30 / 7.26 / 6.54 | pass |
| accent `#C9B7EF` focus ring on surface | `:focus-visible` (`globals.css:135`) | 10.0 | pass |
| `.input` border `line-strong` (16 % white) vs surface-2 | every `.input` | **1.64** | **FAIL 1.4.11** |
| `fg-quaternary` icon in ButtonUtility (bell, theme, row actions) | `button-utility.tsx` tertiary | 3.40 | pass (marginal) |

### Light theme
| Pair | Where | Ratio | Result |
|---|---|---|---|
| `chip-ok #10b981` on tint | "1 queued", "ACTIVE" | **2.31** | **FAIL** |
| `chip-warn #f59e0b` on tint | "not run today", "PAUSED" | **1.99** | **FAIL** |
| `chip-bad #ef4444` on tint | errors, YouTube chip | **3.29** | **FAIL** |
| `chip-info #0284c7` on tint | "Short", info chips | **3.62** | **FAIL** |
| TabNav selected badge `text-accent-ink`(#fff) on `accent/20` | `TabNav.js:75` | **1.35** | **FAIL — near invisible** |
| TabNav warn badge `#f59e0b` on `warn/15` | Studio "Review Queue 3" (`studio/page.js:14`) | **1.91** | **FAIL** |
| Sidebar Studio badge `#7c3aed` on `accent/20` over always-dark sidebar | `AppShell.js:150` | **2.93** | **FAIL** (sidebar stays dark, accent flips to dark violet) |
| `fg-quaternary #8e959c` on white | breadcrumb, footer, entries | **3.03** | **FAIL** |
| `fg-quaternary` on `bg-tertiary #f0f1f3` | topbar search | **2.68** | **FAIL** |
| UUI `text-quaternary #737b84` table head on white / `#f9f9f9` | `table.tsx:203` | **4.29 / ≈4.0** | **FAIL** |
| UUI "Engine live" success badge `#00a63e` on green-50 | topbar | **3.08** | **FAIL** |
| `--faint` on `--bg-soft #f1f5f9` | thumbs inputs `bg-bg-soft` | **4.34** | **FAIL** |
| `--faint` on white / surface-2 | general | 4.76 / 4.55 | pass (barely) |
| Input border `#cbd5e1` vs `#f8fafc`; icon-btn border `#e2e8f0` vs white | all inputs / icon buttons | **1.42 / 1.23** | **FAIL 1.4.11** |
| Hard-coded dark-only text (`text-zinc-100`, `text-white/xx`, `border-white/10`) on light surfaces | `create/page.js` (8 uses), `channels/add` (8), `templates` (8), `templates/drafts` (8), `TemplateSimulator.js` (8) | **≈1.1** | **FAIL — text disappears in light theme** |

Scale of the problem: `text-faint` is used **198×**, `text-fg-quaternary` **17×**, toned Chips **77×**, and sub-11px text (`text-[8–10px]`) **22×**. Fix the tokens, not the call sites.

---

## 3. Findings table

| ID | Sev | Page / component | Evidence | Problem (WCAG SC) | Recommendation |
|---|---|---|---|---|---|
| A11Y-01 | **P0** | DataTable → /content, /logs, /videos | `_errors-by-page.md` (16×/32×/16× "must have at least one Column with isRowHeader"); `DataTable.js:23`; `logs/page.js:79-95`, `videos/page.js:82-100` pass no `rowHeader` | No row header → rows have no accessible name, and react-aria throws in dev. **1.3.1, 4.1.2** | In `DataTable.js`: `const rh = columns.find(c=>c.rowHeader)?.key ?? columns.find(c=>c.label)?.key;` then `isRowHeader={c.key===rh}`. Also mark `title` as `rowHeader: true` in logs/videos. See §4.1. |
| A11Y-02 | **P0** | Tables, logs/videos | `logs/page.js:80,91`, `videos/page.js:82,98` (`label: ''`) | Empty column headers (brand mark, "open" column). **1.3.1** | Give every column a real label and render it visually hidden: add a `hideLabel` column flag → `<span className="sr-only">Open on YouTube</span>`. |
| A11Y-03 | **P1** | Tokens `--faint` (dark), `fg-quaternary` (both themes), sidebar `#6b7671` | §2 table; `globals.css:80,377,395,563`; `theme.css:320,677` | Secondary text fails 4.5:1 in dozens of places (2.36–4.09). **1.4.3** | Dark: `--faint: #7d8a9c` (≥4.6 on surface-2); sidebar labels `#8a948f`; remap `fg-quaternary` → `neutral-500 #737b84`(dark) / `neutral-600 #686868`(light) for **text**; keep the old value only for decorative icons. |
| A11Y-04 | **P1** | Chips & badges, light theme | §2; `globals.css:198-222`; `TabNav.js:70-77`; `AppShell.js:150` | Every toned chip fails in light (1.99–3.62); TabNav selected badge is 1.35. **1.4.3** | Add per-theme `--ok-ink/--warn-ink/--bad-ink/--info-ink` text tokens (light: `#047857`, `#b45309`, `#b91c1c`, `#0369a1` ≈ 5.0–6.5:1); chips use `color: var(--x-ink)`. TabNav: use `text-accent` in both themes (drop `text-accent-ink`). Sidebar badges: use the hardcoded lavender `#c9b7ef` like `.qs-side-link.active svg` does. |
| A11Y-05 | **P1** | Create, Channel wizard, Templates, Drafts, TemplateSimulator | `create/page.js:57,63,67,79`; `channels/add/page.js:668,674,688`; `templates/page.js:122,135`; screenshot `popup-studio--desktop--3-Switch-to-light-theme.png` (Create page uses its own sky/zinc palette) | Hard-coded dark-only colours (`text-zinc-100`, `bg-white/[0.03]`, `border-white/10`) → ~1.1:1 in light theme. **1.4.3, 1.4.11** | Replace with tokens (`text-ink`, `bg-surface`, `border-line`, `text-muted`). Add a lint rule banning `text-white/`, `text-zinc-*`, `border-white/` outside `AppShell` sidebar. |
| A11Y-06 | **P1** | Command palette | `CommandPalette.js:153-203`; screenshot `popup-logs--desktop--1-Search-or-run-K.png` | Arrow keys move a **visual-only** highlight; focus stays in the input, so screen readers announce nothing. No combobox/listbox roles, no focus trap, focus not returned to trigger on close. **4.1.2, 2.4.3** | Input: `role="combobox" aria-expanded aria-controls="cmdk-list" aria-activedescendant={'cmdk-'+items[idx]?.id}`; list `role="listbox"`; rows `role="option" id aria-selected`, `tabIndex={-1}`. Better: rebuild on react-aria `ComboBox`/`Autocomplete` (already a dependency). Save `document.activeElement` on open, restore on close. |
| A11Y-07 | **P1** | Alerts bell + account menu | `AppShell.js:74-115, 375-423` | Click-toggled popovers: no `aria-expanded`/`aria-haspopup`, no Escape, focus not moved in, click-catcher `<div onClick>` overlay; bell name "Alerts" omits the count (badge is a sibling span). **4.1.2, 2.1.1, 2.4.3** | Use UUI `dropdown` (react-aria `MenuTrigger`/`DialogTrigger` + `Popover`) — Escape, focus and ARIA states come free. Bell: `aria-label={\`Alerts, ${n} open\`}`. |
| A11Y-08 | **P1** | Mobile nav drawer (also used by **desktop users zoomed ≥ ~180 %**, since 1440 px at 200 % = 720 CSS px < `lg`) | `AppShell.js:321-331`; `popup-home--mobile-nav.png` | No `role="dialog"`/`aria-modal`, no Escape, focus not moved into drawer, page behind stays in tab order. **2.4.3, 4.1.2, 1.3.2** | Move to UUI `slideout-menus` (react-aria `ModalOverlay`) or add: `role="dialog" aria-modal="true" aria-label="Main menu"`, focus the close button on open, `inert` on `<main>`/`<header>` while open, Escape closes, restore focus to "Open menu". |
| A11Y-09 | **P1** | Templates preview modal | `templates/page.js:242-255` | Full-screen overlay without `role="dialog"`, no Escape, no focus move/trap. **2.1.2-risk, 2.4.3, 4.1.2** | Wrap `TemplateSimulator` in UUI `modals` (react-aria `Modal`) — same component should serve `templates/drafts/page.js:435` (which has role+Escape but no trap/restore). `SlideoutDrawer.js` is imported **nowhere** — delete it or make it the one shared drawer (it also lacks focus trap/restore and hardcodes `id="drawer-title"`). |
| A11Y-10 | **P1** | Thumbnails "+ rot" | `thumbs/page.js:538-543`; screenshot `page-thumbs--desktop.png` (tiny "+ rot" in each design card) | A `<span onClick>` **inside a `<button>`**: not focusable, not a button, nested interactive, 8.5 px text. Keyboard users cannot add to rotation at all. **2.1.1, 4.1.2, 2.5.8** | Move it out of the card button: a sibling `<button aria-label={\`Add ${t.label} to rotation\`}>` ≥ 24×24 px, 11 px+ text. |
| A11Y-11 | **P1** | Video Templates cards | `templates/page.js:138-145` | Preview opened by a `<div onClick>` — no keyboard access. **2.1.1, 4.1.2** | Make the banner a `<button type="button" aria-label={\`Preview ${t.name}\`}>`. |
| A11Y-12 | **P1** | Templates / Drafts / Channel wizard autoplay video | `templates/page.js:148-156` (`autoPlay loop muted`), `templates/drafts/page.js:511`, `channels/add/page.js:984` | Many looping videos start automatically with no pause control and ignore reduced-motion (CSS media query can't stop `<video>`). **2.2.2 Pause, Stop, Hide** | Poster by default; play on hover/focus only; `if (matchMedia('(prefers-reduced-motion: reduce)').matches) don't autoplay`; add a visible pause toggle where a video plays > 5 s. |
| A11Y-13 | **P1** | Selection state conveyed by colour only | `create/page.js:77-92` (style + genre), `thumbs/page.js:503-506` (category pills), `:513-515` (template cards), `:624-626` (photo picks), `channels/page.js` none | Selected item only differs by border/background colour; no `aria-pressed`/radio semantics. **1.4.1, 4.1.2** | Single-choice groups → UUI `radio-buttons` or `role="radiogroup"` + `role="radio" aria-checked`; filters → `aria-pressed`. Add a non-colour cue (check icon, already done for template cards — reuse it). |
| A11Y-14 | **P1** | Page titles & route announcements | `layout.js:15-18` only metadata in app; 33 `'use client'` pages; `node_modules/next/dist/client/components/app-router-announcer.js:52-65` | Every page has the same `<title>`, so Next's route announcer (announces only when the title **changes**) stays silent on every navigation; tabs/history all read "Quarry Studio — Command Center". **2.4.2** | Add a `layout.js` with `export const metadata = { title: 'Logs · Quarry Studio' }` per route folder (server layouts work even when `page.js` is a client component), or a tiny `useDocumentTitle()` set from `PageHeader`. Use `title.template: '%s · Quarry Studio'` in the root. |
| A11Y-15 | **P1** | Breadcrumb | `AppShell.js:280-281, 341-346`; screenshots `page-logs--desktop.png`, `page-channels--desktop.png`, `page-thumbs--desktop.png` all show "Quarry Studio / **Quarry Studio**" | `pageTitle` only matches top-level `NAV` hrefs, so sub-pages lie about where you are; no `nav aria-label="Breadcrumb"`, no `aria-current`. **2.4.8 (AAA, but basic orientation), 1.3.1** | Derive the title from `ALL_NAV_ITEMS` + hub-tab map; `<nav aria-label="Breadcrumb">` with `aria-current="page"` on the last crumb. |
| A11Y-16 | **P1** | Skip link / landmarks | no match for "skip" anywhere; `AppShell.js:313-435` | ~20 tab stops (13 sidebar links + 5 channel links + topbar) before the content on every page; no skip link; `<footer>` sits **inside** `<main>` (no contentinfo landmark); two unlabeled `<nav>`s when the drawer is open. **2.4.1** | First child of `<body>`: `<a href="#main" class="sr-only focus:not-sr-only …">Skip to content</a>`; `<main id="main" tabIndex={-1}>`; move footer out of main; `<nav aria-label="Main">`, channel list `aria-label="Channels"`. |
| A11Y-17 | **P1** | Status messages | only 3 live regions in the app (`SchedulePanel.js:152`, `error.js:14`, `channels/page.js:84`) vs 60+ `setMsg/setError/setStatus` calls (`TemplateAssignPanel.js` 16, `channels/add` 14, `templates/drafts` 10…); `create/page.js:122-123`; `login/page.js:98`; `settings/page.js:404`; `thumbs/page.js:497` | Success/error results (generate video, approve/reject draft, login error, password rotation, bulk redesign) appear silently. **4.1.3** | One shared `<StatusMessage tone>` with `role="status"` (ok) / `role="alert"` (error); on the login error also `aria-invalid` + `aria-describedby` on the input. |
| A11Y-18 | **P1** | Form labels | `create/page.js:69-70,99-106,111-120` (`<label>` with no `htmlFor`, input not nested); `settings/page.js:408-410` (placeholder-only password fields); `thumbs/page.js:436` (channel select, no label), `:608-612` (photo search, span not a label), `:644` (AI prompt) | Inputs have no programmatic label → screen reader says "edit text". **1.3.1, 3.3.2, 4.1.2** | Wrap inputs inside `<label>` (the thumbs form already does this at `:580-603`) or use `useId()` + `htmlFor`. Password fields: visible labels. |
| A11Y-19 | **P1** | Desktop "Open menu" + mobile-only "Search" buttons show at 1440 px | `page-home--desktop.png` (≡ left of breadcrumb, magnifier right of search box); `AppShell.js:337, 365`; `globals.css:308-323` | `.icon-btn { display:inline-flex }` is **unlayered** CSS, so it beats Tailwind's layered `lg:hidden`/`sm:hidden`. The desktop hamburger opens a drawer that is itself `lg:hidden` → **a focusable button that does nothing**; plus a duplicate Search button. **4.1.2 (misleading control), 2.4.3** | Put the component classes in `@layer components { … }` in `globals.css` (fixes this whole class of override bugs), or switch these two to `ButtonUtility`. |
| A11Y-20 | **P1** | TabNav (Studio / Content / Operations / Network / Settings hubs) | `TabNav.js:30-48`; `studio/page.js:38-44` | `aria-controls="tabpanel-<id>"` points at IDs that **don't exist** (no `role="tabpanel"` anywhere); no arrow-key roving focus, every tab is a Tab stop; hub renders **two `<h1>`** (hub "Studio Desk" + embedded page "Create Video", `create/page.js:63`; screenshot `popup-studio--desktop--3-…png`). Hardcoded fake badge `'3'` (`studio/page.js:14`) is announced as real data. **1.3.1, 4.1.2, 2.4.6** | Use UUI `tabs` (react-aria `Tabs/TabList/TabPanel` — arrow keys + panel wiring built in). Embedded pages take an `embedded` prop that renders their title as `<h2>`. Remove or wire the badge to real data. |
| A11Y-21 | **P2** | Segmented filter | `ui.js:190-215`; `page-logs--desktop.png` (All / YouTube / FB+IG / Facebook) | A filter presented as `role="tablist"` with no tab panels and no arrow-key support. Unselected text `text-faint` = 3.85:1. **4.1.2, 1.4.3** | Use `role="radiogroup"` + `role="radio" aria-checked`, or UUI `button-group` with `aria-pressed`; unselected text → `text-muted`. |
| A11Y-22 | **P2** | Nested interactive elements | `logs/page.js:92-94`, `videos/page.js:~99-101` (`<a>` wrapping `ButtonUtility` button, name on the `<a>` only); `channels/page.js:138-140` (`<Link title>` wrapping an **unnamed** button); `channels/add/page.js:663-685` (`div role=button` containing a `<button>`) | Double tab stop, unnamed inner button, invalid nesting. **4.1.2** | Use `ButtonUtility href=… tooltip="Open on YouTube"` (it already supports the link variant via `AriaLink`). Voice picker: make the row a `role="radio"` and keep play as a sibling, not a child; Space handler must `preventDefault()`. |
| A11Y-23 | **P2** | Charts | `charts.js:86` (`aria-label="views chart"`), `:76-81` (mouse-move tooltip), `:182`; `page-home--desktop.png` (blank chart area with 0s) | Generic label, data only on mouse hover (not keyboard), series told apart by colour only, axis text 3.85:1; an all-zero chart shows as an empty box with no text. **1.1.1, 2.1.1, 1.4.1, 1.4.3** | `aria-label` with a one-sentence summary ("Views per day, last 14 days, total 0"); visually-hidden `<table>` of the data; direct line labels or dashed/dotted patterns per series; "No views in this window" text when sum = 0. |
| A11Y-24 | **P2** | Sidebar | `AppShell.js:138-161` | Active link has no `aria-current="page"`; the badges "3" and "1" are **hardcoded** (`:150-157`) and read as "Studio 3" with no meaning; collapsed rail links rely on `title`. **1.3.1, 4.1.2** | `aria-current={active ? 'page' : undefined}`; badges real or removed, with `<span className="sr-only">, 3 drafts to review</span>`; collapsed rail: `aria-label={i.label}`. |
| A11Y-25 | **P2** | Input / control boundaries | §2 (1.64 dark, 1.42 light, icon-btn 1.23) | Text fields and icon buttons are hard to find. **1.4.11** | `--line-strong`: dark `rgba(255,255,255,.28)` (≈3.0:1), light `#94a3b8` (≈3.0:1 vs surface-2), used for input/icon-btn borders only. |
| A11Y-26 | **P2** | Focus not obscured | `AppShell.js:335` (sticky 58 px header, `z-40`) | Shift+Tab to an element near the top scrolls it **under** the sticky header. **2.4.11 (new in 2.2, AA)** | `html { scroll-padding-top: 72px; }` in `globals.css`. |
| A11Y-27 | **P2** | Target size | `thumbs/page.js:556` (rotation "×", ≈14 px, text-only "×"), `:686-687` (face remove 20×20, `title="remove"`), `thumbs/page.js:538` (+ rot), `AppShell.js:173` ("manage →" 10 px) | Below 24×24 px and named "times"/"remove". **2.5.8, 4.1.2** | 24×24 min hit area (`::after` inset like `.icon-btn`); `aria-label={\`Remove ${label} from rotation\`}` / `\`Remove face ${i+1}\``. |
| A11Y-28 | **P2** | Motion in JS | `ui.js:79-99` (`useCountUp` rAF), `charts.js:520` draw-line OK via CSS; `globals.css:531-539` covers CSS only | Count-up runs regardless of reduced motion (the CSS media query can't stop JS). **2.3.3 (AAA) / best practice** | `if (matchMedia('(prefers-reduced-motion: reduce)').matches) return target;` in `useCountUp`; the same check for autoplay video (A11Y-12). |
| A11Y-29 | **P2** | Login | `login/page.js:87-95, 98` | No `autoComplete="current-password"` (Settings has it, login doesn't); error not announced or tied to the field. **1.3.5, 3.3.1, 3.3.8** | Add `autoComplete="current-password"`, `aria-invalid`, `aria-describedby="login-error"`, `role="alert"` on the error. |
| A11Y-30 | **P3** | `:focus-visible` rule | `globals.css:135-139` | `border-radius: 5px` on every focused element squares off round controls (avatar "MH", pills). Visual only. | Remove `border-radius` from the rule (outline follows the element's own radius in modern browsers). |
| A11Y-31 | **P3** | Language of parts | `page-home--desktop.png` (Hindi topic titles in "Today's researched topics") | Devanagari text read with an English voice. **3.1.2** | Wrap fetched titles in `<span lang={/[\u0900-\u097F]/.test(t) ? 'hi' : undefined}>`. |
| A11Y-32 | **P3** | Root font size | `globals.css:96-98` (`html { font-size: 14px }`) | A fixed px root ignores the user's browser font-size setting. Zoom still works, so this passes 1.4.4, but low-vision users who raise the default size get nothing. Combined with 22 uses of 8–10 px text. | `html { font-size: 87.5%; }` (same 14 px by default, respects user setting); floor all text at 11 px. |
| A11Y-33 | **P3** | Red "YouTube" chip | `logs/page.js:87`; `page-logs--desktop.png` (every row red) | Uses the **error** tone for a platform name. Not a WCAG failure (the text is present), but it trains users to ignore red, which hurts how fast real errors get noticed. | Neutral or brand-neutral chip for platform; reserve `bad` for failures. |

---

## 4. Redesign proposals (before → after)

### 4.1 DataTable that cannot ship inaccessible tables (fixes A11Y-01/02)
Before (`DataTable.js:22-24`):
```js
<Table.Head key={c.key} id={c.key} label={c.label} isRowHeader={Boolean(c.rowHeader)} />
```
After:
```js
const rowHeaderKey = (columns.find((c) => c.rowHeader) || columns.find((c) => c.label && !c.hideLabel) || columns[0]).key;
// …
<Table.Head key={c.key} id={c.key} isRowHeader={c.key === rowHeaderKey}
  label={c.hideLabel ? undefined : c.label}>
  {c.hideLabel ? <span className="sr-only">{c.label}</span> : null}
</Table.Head>
```
Then in logs/videos: `{ key:'brand', label:'Channel mark', hideLabel:true }`, `{ key:'open', label:'Open on YouTube', hideLabel:true }`, `{ key:'title', label:'Title', rowHeader:true }`. **Why this matters:** react-aria uses the row-header cell as each row's accessible name, so a screen reader says "Debt Snowball: Cut $12K Debt…, row 2" instead of "row 2". This removes all 64 page errors on /content, /logs and /videos.

### 4.2 One overlay system instead of five hand-rolled ones (A11Y-06/07/08/09)
Today: `Notifications` popover, user menu, mobile drawer, `CommandPalette`, templates modal, drafts modal and an unused `SlideoutDrawer` each do their own (partial) thing. The repo already ships react-aria-based UUI `modals/`, `slideout-menus/`, `base/dropdown/` and `tabs/`.

```
Trigger (aria-expanded, aria-haspopup)
   └─ react-aria Overlay  ── focus moves in ─► first item / close button
         • Escape closes            • Tab/Shift+Tab trapped (modal) or closes (popover)
         • page behind = inert      • focus returns to trigger on close
         • role=dialog|menu + accessible name
```
Rule for the codebase: **no `fixed inset-0` div outside `components/overlays/`.** Today there are 6 (`grep "fixed inset-0"`).

### 4.3 Contrast-safe token set (A11Y-03/04/25)
```css
/* dark */
--faint: #7d8a9c;          /* 3.60 → ≥4.6 on surface-2 */
--line-strong: rgba(255,255,255,.28);   /* input borders ≥3:1 */
/* light */
--ok-ink:#047857; --warn-ink:#b45309; --bad-ink:#b91c1c; --info-ink:#0369a1;
--line-strong:#94a3b8;
/* sidebar (both themes) */
.qs-side-group, .qs-side-collapse { color:#8a948f; }   /* 4.09 → ~5.6 */
```
Map UUI `--color-fg-quaternary` (**text** uses only) to `neutral-500` in dark and `neutral-600` in light. Add a Playwright + axe-core check in CI that runs `color-contrast` in **both** themes on the 25 crawled routes. The crawler already exists (`studio-ui-audit/crawl-full.cjs`), so this is mostly configuration.

### 4.4 Shell skeleton (A11Y-14/15/16/19/24/26)
```
<body>
  <a href="#main" class="skip">Skip to content</a>          ← new
  <aside>  <nav aria-label="Main"> …aria-current="page"… </nav>
           <nav aria-label="Channels"> … </nav> </aside>
  <header> <nav aria-label="Breadcrumb"> Studio / <b aria-current="page">Thumbnails</b> </nav>
           [Create] [Search ⌘K] [Alerts, 2 open ▾] [Theme] [Account ▾] </header>
  <main id="main" tabindex="-1"> <h1>Thumbnails</h1> … </main>
  <footer> … </footer>                                     ← moved out of main
</body>
<title>Thumbnails · Studio · Quarry Studio</title>          ← per route
```

### 4.5 "Pick one" controls (A11Y-13, A11Y-21)
Before: `<button className={selected ? 'border-sky-500' : 'border-white/10'}>` (`create/page.js:78`).
After: UUI `RadioGroup` card variant. `role="radio" aria-checked`, arrow keys move between options, plus a check icon on the selected card (copy the existing `CheckCircle2` badge from `thumbs/page.js:530-533`). Filters (thumb categories, log platforms) become `aria-pressed` toggle buttons. Neither of those is a tablist.

---

## 5. The 10 fixes that remove the most risk (in order)

1. **DataTable row header + hidden column labels** (§4.1). This removes all 64 runtime errors and gives every table row a name. About 30 minutes.
2. **Contrast token pass** (§4.3: `--faint`, `fg-quaternary` for text, sidebar `#6b7671`, chip `*-ink` tokens, TabNav badge). Fixes most 1.4.3 failures across ~290 call sites without touching pages.
3. **Replace hard-coded dark-only colours** in Create, Channel wizard, Templates, Drafts and TemplateSimulator with tokens (A11Y-05). Otherwise the light theme isn't usable on those pages.
4. **Move globals.css component classes into `@layer components`** (A11Y-19). Kills the dead desktop "Open menu" button, the duplicate Search button, and every future case where Tailwind utilities lose to unlayered CSS.
5. **Overlays on react-aria** (§4.2): bell, account menu, mobile drawer, templates modal, drafts modal. Gives Escape, focus trap/restore and ARIA state. This matters for zoomed desktop users too.
6. **Command palette as a real combobox/listbox** (A11Y-06), with `aria-activedescendant` and focus restored on close.
7. **Make mouse-only features keyboard-reachable**: "+ rot" (A11Y-10), template preview cards (A11Y-11), nested buttons in links (A11Y-22). Name the "×" buttons (A11Y-27).
8. **Per-route `<title>` + correct breadcrumb + skip link + `aria-current`** (A11Y-14/15/16/24). Brings back screen-reader route announcements and orientation.
9. **Shared `StatusMessage` with `role=status/alert`**, plus programmatic labels on Create/Settings/Thumbs inputs and `autocomplete` on login (A11Y-17/18/29).
10. **Real tabs + radio semantics**: TabNav → UUI Tabs with tabpanels and one `<h1>` per hub; picker groups → RadioGroup; Segmented → radiogroup (A11Y-13/20/21). Add a reduced-motion guard to autoplay video and `useCountUp` (A11Y-12/28).

---

## 6. Quick wins (each ≤ 1 day)
- Fixes #1, #2, #4 and #8 above. Each one is a single file or close to it.
- `html { scroll-padding-top: 72px }` (A11Y-26) and remove `border-radius` from `:focus-visible` (A11Y-30).
- Bell `aria-label` includes the count; sidebar `aria-current`; delete or wire the hardcoded "3"/"1" badges (A11Y-24).
- `autoComplete="current-password"` + `role="alert"` on login (A11Y-29).
- Give the 4 unnamed/nested row-action buttons real names (logs, videos, channels edit pen, thumbs upload/×).
- Stop autoplay under `prefers-reduced-motion`; poster-first on the templates grid (A11Y-12).
- `lang="hi"` auto-tagging for Devanagari titles (A11Y-31).

## 7. Bigger bets (multi-day, high impact)
- **One overlay + one tabs + one radio-group primitive**, built on the UUI/react-aria components already in the repo, and migrate all hand-rolled overlays (§4.2, A11Y-06–09, A11Y-20). About 2–3 days. Most of the keyboard and screen-reader risk goes away with it.
- **Theme-safe design tokens with an automated gate**: the token pass, a lint rule banning raw `text-white/`, `zinc-*` and `border-white/` in pages, and an axe-core sweep in CI over the 25 crawled routes × 2 themes, so contrast regressions get caught before deploy. About 2 days.
- **Accessible charts**: a summary label, a hidden data table, keyboard-focusable points with the same tooltip, pattern-coded series, and an honest "no data" state (A11Y-23). About 1–2 days.
- **Embedded-page contract for tab hubs**: every page used inside a hub accepts `embedded`, demotes its header to `<h2>`, and never renders a second page chrome. This fixes the duplicate h1s here and removes the visual double-header the other audits flagged. About 1 day.
