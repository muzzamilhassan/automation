# 02 — Visual design system audit (color, type, spacing, elevation, icons, consistency)

Auditor lens: design-systems lead. Read-only audit, 2026-11-18.
Evidence: `shots-full/page-*--desktop.png` (I looked at home, analytics, channels, channels-add, settings, usage, warnings, review, logs, users, tasks, thumbs, social, music, videos, templates, providers, operations), every `popup-*-Switch-to-light-theme.png`, `studio/app/globals.css`, `studio/components/ui.js`, `studio/components/untitledui/theme.css`, plus grep counts over `studio/app` and the non-UntitledUI files in `studio/components` (103 JS files).

---

## 1. Plain-English summary for the owner

- **The app is built from three separate style kits stuck together.** Your own kit (Card/Chip), the UntitledUI kit (Button/Badge/Table), and some pages that skip both and use their own colors (Create Video and Video Templates use **sky-blue**, not your lavender). That's why buttons, tables and tabs look a little different from page to page.
- **Text sizes are out of control.** The code uses **24 different font sizes**, and 9 of them fall between 10px and 13.5px. Nobody can see that many steps, so the page just looks fussy and hard to scan. A good product uses 6–8.
- **A lot of the small grey text is too faint to read comfortably.** The "faint" grey on dark cards measures **3.85:1** contrast. The accessibility minimum is 4.5:1, and this grey is used 198 times, mostly at 10.5–11px.
- **Light theme isn't really supported.** Settings says "light is fully supported everywhere", but 13 files hard-code white-on-black colors. Create Video would show near-white text on a white page, and green/amber status pills drop to 2.2–2.5:1 contrast. The crawler never managed to show a light page either: every "Switch to light theme" capture is still dark.
- **The fix is cheap if it's done in order:** one token file, one button, one badge, one type scale, then a page-by-page sweep. Most of the visible gain comes from about 5 days of work (see Quick wins).

---

## 2. Findings table

Counts below are from grep over `studio/app` + `studio/components` (UntitledUI library folder excluded unless stated).

| ID | Sev | Page / component | Evidence | Problem | Recommendation |
|---|---|---|---|---|---|
| VDS-01 | P1 | Global type scale | 649 `text-[…]` arbitrary values. Top px sizes: `text-[11px]`×156, `[12px]`×145, `[11.5px]`×114, `[10.5px]`×86, `[12.5px]`×54, `[13px]`×40, `[10px]`×18. Plus named `text-xs`×49, `text-sm`×27… | **24 distinct rendered font sizes** (8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.25, 12.5, 13, 13.5, 14, 15, 15.75, 16, 17, 17.5, 18, 20, 21, 26, 26.25, 31.5). Nine of them sit between 10 and 13.5px, so the eye can't tell them apart. Hierarchy comes from weight and caps instead of size, which is why every page reads as uniformly dense (e.g. `page-providers--desktop.png`). | Adopt the 7-step scale in §3.2. Ban `text-[Npx]` with a lint rule. Nothing below 11px. |
| VDS-02 | P1 | Root font-size | `globals.css:96-98` `html { font-size: 14px }` | Every rem-based Tailwind unit shrinks by 12.5%, so the spacing unit becomes **3.5px** (`p-3`=10.5px, `gap-1.5`=5.25px, `py-2.5`=8.75px). Nothing lands on a 4/8 grid, and sub-pixel paddings blur edges. UntitledUI's sizes are `calc(var(--spacing)*N)` (`untitledui/theme.css:8-20`), so its `text-sm` renders at 12.25px and `text-xs` at 10.5px, not the 14/12 it was designed for. | Set `--spacing: 4px` in `@theme` (one line). That puts all spacing on a 4px grid and gives UntitledUI back its intended 12/14/16 sizes. Then handle density on purpose with the type scale, not by shrinking the root. Do it behind a screenshot diff, because every page grows about 14%. |
| VDS-03 | P1 | Two neutral palettes | `globals.css:47-91` (slate: `--ink #0f172a`, `--muted #475569`, dark `--surface #121518`) vs `untitledui/theme.css:839-854` (neutral: `#171717`, `#686868`; dark `bg-primary` = `#0f1113`) | UntitledUI components paint `bg-primary` #0f1113 while your cards paint `--surface` #121518. The difference is small but visible next to each other. The Videos/Logs table shell (`page-videos--desktop.png`) is a darker inset well inside a lighter card. The light theme pulls neutrals from two different families (blue-slate and pure grey). | Make one neutral ramp the source. Map the UntitledUI semantic vars (`--color-bg-primary`, `--color-text-tertiary`, `--color-border-secondary`…) onto the Quarry tokens, and don't keep two value sets. |
| VDS-04 | P1 | Primary button: 2 implementations, 2 colors | `.btn-primary` = `var(--accent)` (`globals.css:250`), light theme `#7c3aed` + white text. UntitledUI `<Button color="primary">` = hard-coded `#C9B7EF` + black text in **both** themes (`globals.css:548-550`). Used by `ActionButton.js`, `channels/add`, `templates` vs `page.js:125`, `channels/page.js:79`, `settings/page.js:387`, `AppShell.js:351` | In dark mode they match only because `--accent` happens to equal `#C9B7EF`. In light mode the app shows **two different primary buttons** (deep violet vs pale lavender). Pale lavender on white has a **1.83:1** edge contrast, so it barely reads as a button. | One `Button` component. Primary = `--accent` token, which changes per theme. Delete the `.bg-brand-solid` hex override and set `--color-bg-brand-solid: var(--accent)` instead. |
| VDS-05 | P1 | Three button vocabularies | UntitledUI `<Button>`×25 + `ButtonUtility`×7 imports. `.btn*` CSS classes ×71 uses. **130 raw `<button>`** elements with hand-written classes | Same action, different look. Header `Refresh` (UntitledUI secondary, radius 10px, 12.25px text) vs Logs `Refresh now` vs Operations `Produce now` / `Force Doc + Clips` (raw, `page-operations--desktop.png`) vs Templates `Use Style` (sky-blue fill, `page-templates--desktop.png`). `Pause everything` stacks its icon *above* the label (`page-operations--desktop.png`, top right). | Standardize on the UntitledUI `Button` (it has proper focus and disabled states). Give it 4 variants (primary/secondary/ghost/danger) × 3 sizes (sm 28, md 36, lg 44). Then delete `.btn*` from `globals.css:226-306`. |
| VDS-06 | P1 | Off-brand palettes | `zinc-`/`sky-` utilities: `create/page.js` 26, `channels/add` 14, `TemplateSimulator.js` 13, `templates/page.js` 13, `TemplateAssignPanel.js` 7, `templates/registry/detail` 7. **413** raw Tailwind palette utilities in total (`border-white`×71, `bg-black`×45, `text-white`×44, `bg-white`×42, `text-emerald`×26, `text-zinc`×24, `text-sky`×23…) | Create Video (`popup-*-Switch-to-light-theme.png`, which is actually the Studio › Create tab) uses **cyan** for selected style, genre pill and title icon. Video Templates (`page-templates--desktop.png`) uses sky pills, sky "Use Style" buttons, sky "Interactive Demo" links and a monospace "8 Layout Variants Included". It looks like a different product. | Replace with tokens: selected state = `accent`, links = `accent-text`, surfaces = `surface`/`surface-raised`, borders = `border`. Lint-ban `(zinc|sky|slate|gray)-\d+` and `(bg|text|border)-(white|black)` outside the sidebar. |
| VDS-07 | P0 | Undefined tokens = silently broken styling | `var(--surface-1)` in `templates/page.js:72,134`, `templates/registry/page.js:99`, `TemplateSimulator.js:35`. `var(--error)` in `usage/page.js:32,122,153`. `var(--font-jakarta)` in `settings/page.js:249,253`. None of these is defined anywhere | `--surface-1` doesn't exist, so the Templates toolbar/cards and the simulator modal get a **transparent** background. `--error` doesn't exist, so the Usage error icon renders white instead of red (`page-usage--desktop.png`, "Usage ledger unavailable") and the "Failed calls" stat/text loses its red. | Rename to `--surface` / `--bad`. Add a CI check that every `var(--x)` used in JS/CSS is declared. |
| VDS-08 | P1 | Settings › Typography lies | `page-settings--desktop.png`. `settings/page.js:249,253` render "Plus Jakarta Sans — UI + body text / Headlines + big numbers". `app/layout.js` loads only Inter + JetBrains Mono | The panel tells the owner the app uses a font it doesn't load. The sample text renders in Inter because `--font-jakarta` is undefined. The Appearance preview tiles also hard-code `accent = '#C9B7EF'` for the light preview (`settings/page.js:60-63`), but the real light accent is `#7c3aed`. | Show the real stack: "Inter: interface", "Inter Display weights: headings & numbers", "JetBrains Mono: times, IDs". Build the preview tiles from the live tokens. |
| VDS-09 | P1 | Faint text contrast | `--faint #64748b` on `--surface #121518` = **3.85:1**; on `--surface-2` = **3.60:1**. Sidebar group label `#6b7671` on `#0c0f0d` = **4.09:1** (`globals.css:563`). `text-faint` used 198×, mostly with `text-[10.5px]`/`[11px]` | Fails WCAG AA (4.5:1) for small text. Visible on Home "views · 28d" captions, Analytics card subtitles, Providers "fetched 2026-10-28" lines, sidebar "COMMAND/CHANNELS" labels. | Dark `text-tertiary` = `#8b95a5` (6.06:1 on surface, 5.66:1 on raised). Sidebar label = `#848f9c` (5.86:1). Keep `#64748b` only for disabled/placeholder. |
| VDS-10 | P0 (light) | Light-theme status colors | `--ok #10b981`, `--warn #f59e0b`, `--bad #ef4444` are identical in `:root` and `.dark` (`globals.css:61-63, 84-86`). Chips put this color as text on a 10% tint | In light theme, status chip text is **2.54:1** (green), **2.15:1** (amber), **3.76:1** (red). "connected", "attention", "queue empty", "free-with-caveats" become hard to read. | Use separate foregrounds per theme. Light: success `#047857` (5.48), warning `#b45309` (5.02), danger `#dc2626` (4.83), info `#0369a1`. Keep the bright values for dark. |
| VDS-11 | P1 | Light theme not first-class | All 25 `popup-*-Switch-to-light-theme.png` show a hover tooltip on a **dark** page, so no light capture exists. Code: `border-white/NN` ×71 in 13 files, `bg-black/NN` ×45, `text-zinc-100` (`create/page.js:57-81`) | Settings claims "light is fully supported everywhere" (`page-settings--desktop.png`). In code, `create/page.js` uses `text-zinc-100` on `bg-black/30`, so in light mode it would be near-white text on a pale wash. `templates/page.js` borders are `white/10`, which vanishes on white. | Either (a) make light first-class: token sweep, Playwright light-mode screenshots in CI, fix the crawler to *click* the toggle; or (b) honestly hide the toggle until (a) is done. I recommend (a) after the token sweep, because it comes almost free once tokens are in place. |
| VDS-12 | P1 | Page-title hierarchy: 6 variants | `<h1>` classes: `PageHeader` 26px + 44px icon tile (`ui.js:21`); Home `text-display-md` = 31.5px (UntitledUI); Users/Thumbs `text-xl` 17.5px + inline 18px icon (`users/page.js:28`, `thumbs/page.js:433`); Create `text-2xl` 21px + sky icon (`create/page.js:63`); `text-[18px]`×2; `text-[17px]` | Users (`page-users--desktop.png`) and Thumbnails (`page-thumbs--desktop.png`) titles are **smaller than the card titles on other pages**. Tab hubs stack two equal 26px headers: "Operations Hub" over "Production" (`page-operations--desktop.png`), "Studio Desk" over "Create Video". | One `PageHeader`. Inside a hub, the embedded page renders a **section header** (title-lg 20px, no icon tile) or none, because the tab label already names it. |
| VDS-13 | P1 | Same data, different badge colors | `videos/page.js:85` Kind: Episode=accent, Short=info. `logs/page.js:89` Kind: plain grey. `logs/page.js:87` Platform: YouTube=**`bad` (red)** | Compare `page-videos--desktop.png` with `page-logs--desktop.png`: the same "Short/Episode" field is colored on one page and grey on the other. Every YouTube row in Logs carries a **red error-style pill**, so 20 rows of "danger" for a healthy feed. | Status colors only mean status. Platform gets an icon + neutral text (or a `platform-youtube` token used only as the icon color). Content kind gets a neutral badge with an icon (▶ Short / ▭ Episode). |
| VDS-14 | P2 | Two badge components | `<Chip>` ×110 (`ui.js:66`) vs UntitledUI `<Badge>`/`BadgeWithIcon` (`AppShell.js:86,370`, `create/page.js:164`) | Topbar "Engine live" (UntitledUI badge, `page-home--desktop.png`) vs Settings "connected" (Chip) mean the same thing and look different (radius, padding, weight). Channels-add "key saved" pills are ~32px tall (`page-channels-add--desktop.png`) vs 20px chips elsewhere. | One `Badge` with `tone` (neutral/accent/success/warning/danger/info) × `size` (sm 20, md 24) × optional dot/icon. Re-skin `Chip` as a thin wrapper during migration, then delete it. |
| VDS-15 | P2 | Tab / filter / segmented: 5 looks | Hub tabs underline (`TabNav.js`, `page-operations--desktop.png`); `Segmented` pill group (`ui.js:174`, Analytics "All channels/QU/IN"); Templates sky pill (`page-templates--desktop.png`); Thumbs outline pills "All/Core/Photo" (`page-thumbs--desktop.png`); Create genre pills cyan | Five patterns for "pick one of N". Analytics alone shows two segmented styles stacked (channel filter + "7d/28d/90d", `page-analytics--desktop.png`). | Two patterns only: **Tabs** (navigation, underline) and **SegmentedControl** (filter, pill group). Multi-select tags use Badge-as-toggle. |
| VDS-16 | P2 | Radius scale too wide and ignored | 8 radius tokens 4–20px (`globals.css:17-24`), but CSS hard-codes `5px` on 9 classes (`btn-sm`, `icon-btn`, `nav-item`, `kbd`, `skeleton`, `qs-side-link`…). Usage: `rounded-xl`×69, `rounded-full`×60, `rounded-md`×32, `rounded-2xl`×14 | In use at once: 5, 6, 7 (UntitledUI `before:rounded-[7px]`), 8, 10, 12, 14, 16 and 999. Card 10px, UntitledUI button 10px, `.btn` 6px, icon button 5px, inset tile 8px, Segmented 12px. Nested corners don't relate to each other. | 4 radii: `sm 6` (inputs, small buttons, badges-square), `md 8` (buttons, tiles), `lg 12` (cards, modals), `full` (pills, avatars). |
| VDS-17 | P2 | Elevation undefined in dark | One `--card-shadow` (`globals.css:65,88`). UntitledUI ships 13 shadows (`theme.css:51-73`) tuned for light only. In use: `shadow-sm`×6, `shadow-lg`×4, `shadow-2xl`×4, `shadow-xl`×2… | In dark mode, depth comes only from border + 2–3% surface steps. Cards inside cards (Logs "Team activity" rows, Channels platform rows, Providers rows) all look the same height, so you can't tell what's a container and what's a row (`page-logs--desktop.png`, `page-providers--desktop.png`). | 4 elevation levels (§3.5): surface steps + border tokens in dark, shadows in light. Rule: **no card inside a card**. Inner groupings use dividers or `surface-sunken`. |
| VDS-18 | P2 | Hard-coded hex | **111** six-digit hex literals in app/component JS (63 distinct). Worst: `AppShell.js` 8, `analytics/page.js` 7, `TemplateSimulator.js` 6, `login/page.js` 6. Platform colors `#ff4444/#3b82f6/#ec4899` repeated (`page.js:146-147`, `channels/page.js:156-164`). 183 `style={{…}}` inline styles | Platform and sidebar colors can't be changed in one place. Sidebar uses `text-[#98a2a7]`×5 and `text-[#6b7671]`×3 straight in JSX (`AppShell.js:173-227`), duplicating `.qs-side-*` CSS. | Add `--platform-youtube/-facebook/-instagram/-tiktok` and `--side-*` tokens. Inline `style` only for data-driven brand accents (`BrandMark`), which is legitimate and already in brand data. |
| VDS-19 | P2 | Icon sizing chaos | lucide `size={…}`: **21 distinct values**. Top: 11×70, 14×53, 12×53, 13×52, 15×25, 16×22. Also `15.5`, `19`, `21`. strokeWidth 1.8/2/2.1/2.2/2.4/3 | Icons in the same row differ by 1px (12 vs 13). Stroke weight changes between StatCard (2.2), PageHeader (2.2), EmptyState (1.8). Channels card toolbar = 6 unlabeled 16px icons (`page-channels--desktop.png`), which can't be told apart. | 3 icon sizes: 14 (inline with 12–13px text), 16 (buttons, nav), 20 (headers, empty states). One stroke: 1.75. Icon-only buttons need a tooltip + `aria-label`; for 6 actions use a labelled overflow menu. |
| VDS-20 | P2 | Overline/uppercase overuse | `.overline` 10.5px/700/0.09em caps (`globals.css:459`), `.nav-label`, `table.data th`, StatCard labels, channel names rendered ALL-CAPS in sidebar/tables (`page-home--desktop.png` "QUOTE QUARRY") | Caps + bold + tiny size is used for labels, channel names, stat names and table headers all at once, so nothing stands out. Channel names in caps also get bigger than the page's body text. | Caps only for `overline` (section/field labels, table headers) at 11px/600. Channel names in title case. |
| VDS-21 | P2 | Monospace drift | `font-mono` for times/handles (fine) but also for "8 Layout Variants Included" (`page-templates--desktop.png`), "database not configured on this server" (`page-usage--desktop.png`), schedule lines on Operations | Mono reads as "machine output". Using it on marketing copy and error messages muddles that. | Mono only for IDs, handles, timestamps, code, keys. |
| VDS-22 | P2 | Breadcrumb shows product name twice | Topbar on Analytics, Channels, Usage, Warnings, Review, Logs, Users, Tasks, Thumbs, Social, Music, Videos, Templates, Providers: "Quarry Studio / **Quarry Studio**" | The current-page crumb falls back to the product name on most routes. (IA lens covers this more fully; noted here as a typographic-hierarchy failure.) | Crumb = hub › page (e.g. "Operations › Logs"). |
| VDS-23 | P3 | Dev overlay on sidebar status | Next.js dev "N" bubble covers "Engine connected" in every screenshot (`page-home--desktop.png` bottom-left) | Dev-only, but it hides the one status line in the sidebar footer during every review. | Move the status into the topbar (it already exists there as "Engine live") and drop the duplicate footer line. |
| VDS-24 | P3 | Empty chart areas without visual frame | Home "Views per day": ~180px of blank card with a green "real data" chip (`page-home--desktop.png`). Analytics "Who watches" is an empty card with no message (`page-analytics--desktop.png`) | A "real data" success chip on an empty plot tells the owner the opposite of what's on screen. | Empty-state token pattern: dashed `border-subtle` well + `text-secondary` message + neutral chip "no data yet". (Data-viz lens owns the details.) |

---

## 3. Redesign proposals: the proposed token set

Principle: **3 layers**. (1) *Primitives*: raw ramps, never referenced by components. (2) *Semantic roles*: what components use, redefined per theme. (3) *Component tokens*: only where a component truly needs its own value. Everything lives in `globals.css`. The UntitledUI semantic vars get **aliased** onto layer 2, so both kits paint from one source.

### 3.1 Color roles

| Role | Dark | Light | Notes / contrast |
|---|---|---|---|
| `--canvas` | `#0b0d0e` | `#f8fafc` | page background |
| `--surface` | `#121518` | `#ffffff` | cards |
| `--surface-raised` | `#181c20` | `#ffffff` + shadow-2 | popovers, menus, hover row |
| `--surface-sunken` | `#0f1113` | `#f1f5f9` | inset wells, inputs, inner groups (replaces card-in-card) |
| `--border-subtle` | `rgba(255,255,255,.06)` | `#eef2f6` | row dividers |
| `--border` | `rgba(255,255,255,.10)` | `#e2e8f0` | cards, inputs |
| `--border-strong` | `rgba(255,255,255,.18)` | `#cbd5e1` | hover, focus-adjacent |
| `--text-primary` | `#f8fafc` | `#0f172a` | 17:1 / 17:1 |
| `--text-secondary` | `#a7b1bf` | `#475569` | body-secondary. ≥7:1 |
| `--text-tertiary` | `#8b95a5` | `#5b6573` | meta, captions. **6.06:1** dark on surface (was 3.85) |
| `--text-disabled` | `#64748b` | `#94a3b8` | placeholders/disabled only |
| `--accent` | `#c9b7ef` | `#6d28d9` | fills. Light value 7.1:1 vs white |
| `--accent-hover` | `#b49eea` | `#5b21b6` | |
| `--accent-subtle` | `rgba(201,183,239,.14)` | `rgba(109,40,217,.08)` | selected row/tab bg |
| `--accent-text` | `#c9b7ef` | `#6d28d9` | links, active labels |
| `--on-accent` | `#0a0a0a` | `#ffffff` | 10.8:1 / 7.1:1 |
| `--success-fg / -bg / -border` | `#34d399` / 12% / 30% | `#047857` / `#ecfdf5` / `#a7f3d0` | light fg 5.48:1 |
| `--warning-fg …` | `#fbbf24` … | `#b45309` / `#fffbeb` / `#fde68a` | light fg 5.02:1 |
| `--danger-fg …` | `#f87171` … | `#dc2626` / `#fef2f2` / `#fecaca` | dark fg 6.62:1 |
| `--info-fg …` | `#22d3ee` … | `#0369a1` / `#f0f9ff` / `#bae6fd` | |
| `--side-bg / -fg / -fg-muted / -label / -active-bg` | `#0c0f0d` / `#e8ecec` / `#98a2a7` / `#848f9c` / `rgba(201,183,239,.13)` | same (sidebar stays dark) | label 5.86:1 (was 4.09) |
| `--platform-youtube/-facebook/-instagram/-tiktok` | `#ff4444` / `#3b82f6` / `#ec4899` / `#25f4ee` | same | **icon color only**, never badge fill |
| `--chart-1…6` | defined by data-viz lens | | channel accents still come from brand data (no static maps) |

Delete: `--glow` (unused effect), `--accent-soft` (→ `--accent-subtle`), `--surface-3`, the `.bg-brand-solid` hex override (`globals.css:548-550`). Alias UntitledUI: `--color-bg-primary: var(--surface)`, `--color-bg-secondary: var(--surface-sunken)`, `--color-text-primary: var(--text-primary)`, `--color-text-tertiary: var(--text-tertiary)`, `--color-border-primary: var(--border)`, `--color-border-secondary: var(--border-subtle)`, `--color-bg-brand-solid: var(--accent)`, `--color-fg-brand-primary: var(--accent-text)`, `--color-focus-ring: var(--accent)`.

### 3.2 Type scale (7 steps + mono), Inter, px-defined so it doesn't depend on the root size

| Token | Size / line | Weight | Use |
|---|---|---|---|
| `display` | 28 / 34, −0.02em | 700 | Page title (one per page) |
| `title-lg` | 20 / 28, −0.015em | 600 | Section title inside a hub; modal title |
| `title` | 16 / 24 | 600 | Card title (replaces `.section-title` 15px) |
| `body` | 14 / 20 | 400 | Default copy, form values |
| `body-sm` | 13 / 18 | 400/500 | Table cells, dense lists |
| `caption` | 12 / 16 | 500 | Meta, help text, timestamps |
| `overline` | 11 / 16, +0.06em, caps | 600 | Field labels, table headers, nav group labels |
| `mono` | 12 / 16, JetBrains Mono | 500 | IDs, handles, times, keys |
| `stat` | 28 / 32, tabular | 700 | KPI numbers (same size as display, so numbers are the hero) |

Floor = 11px. That kills the 8.5, 9, 9.5, 10, 10.5, 11.5, 12.25, 12.5, 13.5, 15, 15.75, 17, 17.5, 18, 21, 26.25 and 31.5 steps. Weights: 400/500/600/700 only (drop `extrabold`×3, `black`×3).

### 3.3 Spacing: 4px base

`--spacing: 4px` → `1`=4, `2`=8, `3`=12, `4`=16, `5`=20, `6`=24, `8`=32, `10`=40, `12`=48.
Ban half steps (`0.5`, `1.5`, `2.5`, `3.5`) except `0.5` for hairline badge padding. Layout rules: card padding 20 (`p-5`); card header→body 12; grid gutter 16 (24 at ≥1280px); section gap 32; page side padding 24 desktop / 16 mobile; form field gap 16; label→input 6 → round to 8.

### 3.4 Radius

`--radius-sm: 6px` (badge-square, kbd, small button, input) · `--radius-md: 8px` (button, tile, segmented item) · `--radius-lg: 12px` (card, modal, drawer, segmented track) · `--radius-full` (pill badge, avatar, switch). Nested rule: inner radius = outer − padding (a 12px card with 4px padding holds 8px items).

### 3.5 Elevation (4 levels)

| Level | Dark | Light | Use |
|---|---|---|---|
| 0 flat | `canvas` | `canvas` | page |
| 1 card | `surface` + `border` | `surface` + `border` + `0 1px 2px rgba(15,23,42,.05)` | cards |
| 2 raised | `surface-raised` + `border-strong` + `0 8px 24px rgba(0,0,0,.45)` | `0 8px 24px rgba(15,23,42,.10)` | popovers, menus, toasts |
| 3 overlay | `surface-raised` + `0 24px 48px rgba(0,0,0,.6)` + scrim `rgba(0,0,0,.6)` | scrim `rgba(15,23,42,.4)` | modals, drawers, command palette |

Inner groupings never get level 1. They get `surface-sunken` or a `border-subtle` divider.

### 3.6 Iconography

lucide only. Sizes 14 / 16 / 20 (24 only for empty states). Stroke 1.75. Icons inherit `currentColor`. A color comes only from a status or platform token.

### 3.7 Component consolidation (before → after)

```
BEFORE                                         AFTER
Buttons:  .btn* (71) + UUI Button (25)          <Button variant=primary|secondary|ghost|danger
          + 130 raw <button>                             size=sm|md|lg iconLeading/iconOnly+tooltip>
Badges:   <Chip> (110) + UUI Badge (3)          <Badge tone=neutral|accent|success|warning|danger|info
          + ad-hoc pills (key saved, sky)                size=sm|md dot icon>
Tabs:     TabNav + Segmented + 3 ad-hoc         <Tabs> (navigation)  +  <SegmentedControl> (filters)
Cards:    .card (88 <Card>) + 144 hand-rolled   <Card> + <Card.Header title sub icon actions>
          rounded-xl border divs                       + <Inset> (sunken group) — no card-in-card
Headers:  6 h1 variants                         <PageHeader> (display) / <SectionHeader> (title-lg)
Tables:   table.data (Home) + UUI Table         one <DataTable> on UUI Table, row height 44 (body-sm),
          (Videos/Logs, 63–70px rows)                  header = overline, zebra off, hover = surface-raised
```

Hub page before → after (Operations, `page-operations--desktop.png`):

```
BEFORE                                   AFTER
[⚡] Operations Hub  (26px + tile)       [⚡] Operations                        (display 28)
     Master flow autopilot …                 Pipelines · Logs · Warnings       (Tabs)
 Pipelines | Execution Logs | Warnings   ───────────────────────────────────
[⚡] Production       (26px + tile)       Pipelines                [Open logs] (title-lg 20, no tile)
     Every pipeline that makes …             Every pipeline that makes …       (body, text-secondary)
```

---

## 4. Quick wins (each ≤ 1 day)

1. **Fix undefined tokens** (VDS-07): `--surface-1`→`--surface`, `--error`→`--bad`, remove the `--font-jakarta` claim. About 10 lines. Restores the Templates backgrounds and the Usage error red.
2. **Contrast patch** (VDS-09): dark `--faint` → `#8b95a5`. Sidebar label `#6b7671` → `#848f9c`. Two lines, about 200 call sites fixed.
3. **Light-theme status colors** (VDS-10): add light-only `--ok/--warn/--bad/--info` foregrounds in `:root`.
4. **One primary color** (VDS-04): replace `globals.css:548-550` with `--color-bg-brand-solid: var(--accent)` and the hover token.
5. **Logs/Videos badge semantics** (VDS-13): YouTube pill → platform icon + neutral text. Kind badge identical on both pages.
6. **Settings truth** (VDS-08): typography card shows Inter / JetBrains Mono. Appearance previews read live tokens.
7. **Lint guardrails**: ESLint `no-restricted-syntax` (or a grep CI step) failing on `text-\[\d`, `#[0-9a-f]{6}` in JSX, `(zinc|sky|slate|gray)-\d`, `(border|bg|text)-(white|black)` outside `components/shell`. Run in warn mode first and log the count (baseline today: 649 / 111 / 413).
8. **Users + Thumbs + Create headers** (VDS-12): switch to `<PageHeader>`.

## 5. Bigger bets (multi-day, high impact)

1. **Token foundation + UntitledUI aliasing** (2 days). Write §3.1–3.5 into `globals.css` and alias the UntitledUI semantic vars. Delete the duplicate neutral ramp. Gate on a before/after screenshot diff of all 25 pages.
2. **`--spacing: 4px` + type scale migration** (3–4 days). Flip the spacing unit. Codemod `text-[10px|10.5px|11px]`→`overline`/`caption`, `text-[11.5px|12px|12.5px]`→`caption`/`body-sm`, `text-[13px|13.5px]`→`body-sm`/`body`. That codemod handles about 600 of 649 sites mechanically. Then a hand pass on headers and KPI numbers.
3. **Component consolidation** (4–5 days). One `Button`, `Badge`, `Tabs`/`SegmentedControl`, `Card`/`Inset`, `PageHeader`/`SectionHeader`, `DataTable`. Replace the 130 raw buttons and 144 hand-rolled boxes page by page (one PR per hub: Studio, Content, Operations, Network, Settings). Delete `.btn*`, `.chip*`, `Chip`, `Segmented` at the end.
4. **De-sky the Templates/Create lane** (1–2 days). `create/page.js`, `templates/**`, `TemplateSimulator.js`, `TemplateAssignPanel.js`, `channels/add`: zinc/sky/white-alpha → tokens. This is the biggest "different product" seam the owner sees.
5. **Make light theme first-class** (2 days after 1–4). Fix the crawler to actually toggle `.dark` off and capture all pages in light. Add those captures to the visual-review loop. Only then keep the "light is fully supported" sentence in Settings.
6. **Living style page** (1 day). A `/design` route (owner-only) rendering every token, type step, button/badge/table state in both themes. It's the single place to review any future visual change, and it stops the drift that produced 24 font sizes.

**Migration order:** quick wins 1–4 → bet 1 → bet 2 → bet 4 → bet 3 → bet 5 → bet 6. Tokens first, so every later sweep is a mechanical rename and doesn't need design decisions along the way.
