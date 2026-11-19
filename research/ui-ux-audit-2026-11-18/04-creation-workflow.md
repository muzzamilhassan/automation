# 04 — Creation workflow audit (Studio hub: Review · Topics · Create · Thumbnails · Templates)

Lens: creative-tools UX (Canva / Descript / Adobe Express / YouTube Studio class).
Evidence base: `shots-full/page-{studio,review,topics,create,thumbs,templates}--{desktop,tablet,mobile}.png`, their `popup-*.png`, `_errors-by-page.md`, and the code under `studio/app/{studio,review,topics,create,thumbs,templates}/page.js`, `studio/components/shell/AppShell.js`, `studio/components/shell/nav.js`, `studio/lib/templates-catalog.js`, `studio/app/api/**`. Read-only audit, 2026-11-18.

---

## 1. Plain-English summary for the owner

- **You can't see a video's journey anywhere.** A video goes idea → topic → script → approval → render → upload → thumbnail, but those steps live on 6 different screens across 3 menu sections, and nothing links them. Once you approve a topic it disappears; you can't click it later and see "this became that script, which became this video".
- **The Review screen, the most important safety gate, is broken when the database is down — and still shows a fake "3".** It says "db unavailable" in small red text *and* spins "Loading queue…" forever. The orange "3" on the Studio menu item and tab is typed into the code. It is not a real count.
- **Two buttons don't do what they say.** "Use Style" on Video Templates opens Create Video and silently drops the style you picked. The "100+ engines" headline sits above 6 cards. "Drafts Inbox (14 Full Stories · 4 Chapters)" is also a typed-in number.
- **The Thumbnail editor has every feature but no clear layout.** Its steps are numbered 1, 2, 3, 4, 5, but step 3 is hidden inside step 2. Channel-wide settings (face library, brand defaults) are mixed into the per-video editor. The video picker shows grey boxes instead of the current thumbnails. "Attach thumbnail" and "Bulk redesign" change live YouTube videos with one click, with no confirm step and no undo.
- **Fix order:** (1) make failures and counts honest, (2) make Review fast and safe, (3) build one "Production board" that shows every video's stage, (4) re-lay out Thumbnails as a real 3-panel editor, (5) merge the three template catalogs into one gallery with real previews.

---

## 2. Findings

Severity: **P0** broken · **P1** major · **P2** polish · **P3** nice.

| ID | Sev | Page / component | Evidence | Problem | Recommendation |
|---|---|---|---|---|---|
| CW-01 | P0 | Review Desk: load/error state | `page-review--desktop.png`, `page-studio--desktop.png`, `page-studio--mobile.png`; `review/page.js:62-68, 157, 162-163` | On a failed `/api/review` (503), `err` is set but `pending` stays `null`, so the page shows red "db unavailable" **and** an endless "Loading queue…" spinner at the same time. The error is a raw lowercase server string in 13px red text with no card, icon, retry or explanation. | Use one state machine: `loading → ready | error`. In error, show a full `EmptyState`-style error card: "Can't reach the review database. Nothing is approved or published while this is down, so the gate stays closed." Add a **Retry** button and a "last successful check" time. Never show a spinner after an error. |
| CW-02 | P0 | Studio badge "3" (sidebar + tab) | `page-studio--desktop.png` (sidebar "Studio 3", tab "Review Queue 3"); `AppShell.js:149-152` hard-codes `3`; `studio/page.js:14` `badge: '3'`. Same for Operations `1` at `AppShell.js:154-157` | A typed-in "3 waiting" badge shows while the review DB is unavailable. This breaks the owner's "REAL data only" directive, and the #126 bell fix missed this spot. A fake pending count on an approval gate trains the owner to ignore the badge. | Feed both badges from `/api/review` (count of `awaiting_review`). Hide the badge when the count is 0 or unknown. Show a grey "?" with tooltip "review DB unreachable" on error. Do the same for Operations, using `useOpenWarnings`. |
| CW-03 | P0 | Templates → "Use Style" | `templates/page.js:223, 250` push `/create?template=<id>`; `create/page.js` has **no** `useSearchParams` / `template` handling (grep: 0 hits) | The main call to action on every template card and in the simulator modal goes nowhere: Create Video opens with its default "Old Money Luxury" DNA, and the chosen template is silently lost. | Read `template` in Create and preselect the matching style. Better, see Bigger Bet B3: replace "Use Style" with **"Use on channel…"**, a channel picker that writes the assignment, which today lives only on `/channels` through `TemplateAssignPanel`. |
| CW-04 | P1 | End-to-end journey (no pipeline view) | Nav: `nav.js:31, 48-52`. Stages live in Topic Desk (`topics/page.js`), Review (`review/page.js`), Operations/logs, Content/Videos, Thumbnails (`thumbs/page.js`). Topic queue rows have no link to their script or video (`topics/page.js:193-205`) | There is no object called "a video in progress". Tracking one idea through to publish takes about **15 clicks across 3 hubs and 6 screens** (see §3.1), and the trail breaks at every handoff: an approved topic disappears, a review row shows a raw `channel_id`, and the Thumbnails picker shows only published videos. The owner loses context at each hop. | Add a **Production board** (Bigger Bet B1) as the Studio default tab: one card per item, columns by stage, with a drawer holding all actions. |
| CW-05 | P1 | Review Desk: approval speed | `review/page.js:131, 182, 99` (after approve, `load()` returns to the list); detail is 6 stacked cards (`:185-362`) | Approving one script = open row → scroll past Script/Sources, Claims, Flagged, Disclosure, Thumbnails → Approve → land back on the list → open the next. There is no next/previous, no keyboard shortcuts, and no queue context while reading. For 5 channels × daily slots this is the main daily chore and it is slow. | Two-pane inbox (list left, detail right, like Gmail or Linear). After any decision, auto-advance to the next script. Shortcuts: `J/K` move, `A` approve, `R` reject, `E` edit note. Sticky decision bar at the bottom of the detail pane. |
| CW-06 | P1 | Review Desk: action safety and hierarchy | `review/page.js:336-359` | Approve, Reject and Redispatch are all plain colored text (12.5px, no fill, no border). The irreversible go-live action looks like the low-risk ones. Reject asks for confirmation; Approve, which starts a render and upload, does not show a summary. "Redispatch (approved scripts)" shows on *unapproved* scripts. | Primary filled button "Approve & publish on {date, slot}". Secondary outline "Reject…" that opens a reason picker with an optional note. Show Redispatch only when `status === 'approved' && dispatch failed`. Show a one-line pre-flight summary above the bar: "Renders now · uploads private · goes public {publishAt local time} · thumbnail #1". |
| CW-07 | P1 | Review Desk: jargon | `review/page.js:154, 189-190, 146, 295, 325` | Copy shown to the owner includes "Fail-closed", "staff read + prepare", `awaiting_review`, "Slot publishAt", "Dedupe 0.83", "job —", "thumbnails.set", "dispatches channel-autopilot with resume=job", "AC-P4-21". The owner asked for plain English. | Rewrite: subtitle → "Scripts wait here until you approve them. Nothing is published without your OK." "Slot publishAt" → "Goes live". "Dedupe" → "Originality" (Unique / Similar to "{title}"). Move the job id and template version into a collapsed "Technical details" row. |
| CW-08 | P1 | Review Desk: brand identity and reading comfort | `review/page.js:137, 204, 192` | The channel column renders a raw `channel_id` slug, not the brand mark or name. The script body is a 12px monospace `<pre>` in a 420px scroll box, too small for editorial reading. `grid-cols-2` has no breakpoint, so script and sources squeeze side by side on mobile. | Use `BrandMark` + brand name from `useBrands()`. Show the script in 15px/1.6 proportional type, max 68ch wide, with numbered beats. Show claims inline as highlighted spans that reveal their source on hover, instead of a separate Claims card. Use `grid-cols-1 lg:grid-cols-[1fr_360px]`. |
| CW-09 | P1 | Topic Desk: duplicate React keys | `_errors-by-page.md` (/topics 6×, /studio 35×); `topics/page.js:127` `key={v.title}`, `:137` `key={t.term}`. `page-topics--desktop.png` rows 1 and 7 are both "THE POWER OF SOLITUDE WILL CHANGE YOUR LIFE \| Jim Rohn Motivation" | Research returns the same title from two source channels, so keys collide. React may reuse the wrong row (the "+" can approve a different item than the one shown) and the console fills with warnings. | Key by `v.videoId ?? \`${v.channel}:${v.title}\``. Also **dedupe by normalised title** in the API and show it once as "2 channels · 12.2K views". |
| CW-10 | P1 | Topic Desk: you queue competitors' titles verbatim | `page-topics--desktop.png` (queue rows 3-6: "PRIYANKA CHOPRA__ A Woman With No Friends…", "ELON MUSK … 💜🎯 #motivation #shortvideo #…", emoji strings); `topics/page.js:133` passes `text: v.title` as the topic | "+" sends another channel's clickbait title, with hashtags, emojis and a celebrity name, straight into the nightly run as the topic. A creative tool should treat it as inspiration and turn it into an angle. | When "+" is clicked, open a small inline composer prefilled with an AI-cleaned angle ("Why solitude makes you stronger, Jim Rohn style"), editable before it joins the queue. Strip hashtags and emojis by default. Keep the source as "inspired by {channel}". |
| CW-11 | P1 | Topic Desk: no added state, no reorder, no undo | `page-topics--desktop.png` (all 7 queued items still show "+" on the left); `topics/page.js:126-145, 193-205, 75, 89` (errors swallowed by `catch {}`) | Approved candidates still look unapproved, so they can be added twice. The queue says "consumed top-first" but can't be reordered. "×" removes with no confirmation and no undo. Failed add/remove calls are silent. Desktop shows "7 waiting" while tablet and mobile from the same crawl show "3 waiting" (`page-topics--tablet.png`, `--mobile.png`), so the queue changed during the crawl and nothing on screen explains why. | "+" becomes ✓ "Queued #4" and is disabled. Make the queue drag-to-reorder, with ↑/↓ for keyboard. "×" shows an undo toast for 5 seconds. Failed calls show an inline error. Add "last changed by {who} · {time}" under the queue header. |
| CW-12 | P1 | Topic Desk: noisy, irrelevant "viewer searches" | `page-topics--desktop.png` (Quote Quarry: "traps workout", "chair aerobics", "islam", "what happened to lionel richie", "funny fails", 4-14 views) | Long-tail search terms with single-digit views are shown with the same weight as proven themes. This is low-signal noise for a quotes channel. | Split into two tabs: "Proven themes" and "Viewer searches". Hide searches below a threshold (for example under 20 views or a low relevance score) behind "Show 9 low-signal searches". Show a relevance chip. |
| CW-13 | P2 | Topic Desk / Studio: cryptic channel switcher | `page-topics--desktop.png` segmented "QU IN TH OL YT"; `topics/page.js:30-33` (`slice(0,6).toUpperCase()`) | Two-letter codes are unreadable ("TH" is The Money Rulebook). Every Studio sub-page picks the channel differently: segmented codes (Topics), a `<select>` (Thumbs, `thumbs/page.js:436`), a free-text brand field (Create, `create/page.js:99-101`), and none at all (Review, Templates). | One **global channel scope** control in the Studio header ("All channels ▾" with BrandMark + full name), persisted in `WorkspaceContext` and respected by every tab. |
| CW-14 | P1 | Create Video: disconnected side lane | `page-create--desktop.png`; `create/page.js:20, 99-101, 142-175`; topbar "Create" → `/studio?tab=create` (`AppShell.js:350`) | The most prominent button in the app (purple "Create", top bar) opens a generator with no channel selection. You type the brand name by hand, and the result can only be watched or downloaded. It can't be sent to a channel, given a thumbnail, or put into review. It looks like the main way to make videos but has no link to the real pipeline. | Make the top-bar "Create" a menu: **New topic for a channel** (→ Topic composer), **Quick short (experimental)** (→ current Create), **New thumbnail**. In Create, replace "Brand name" with a channel picker that fills brand, tagline, voice and DNA from the brand kit. Done cards get "Send to review", "Make thumbnail" and "Schedule". |
| CW-15 | P1 | Create Video: preview frames load from a private repo | `create/page.js:149` `https://raw.githubusercontent.com/muzzamilhassan/automation/main/hf-out/${j.id}/frame-a.jpg` (repo is private per project memory) | Finished jobs will show a broken image tile: raw.githubusercontent returns 404 without auth. Repo owner and branch are also hard-coded. | Serve the poster through an authenticated studio route (same pattern as `/api/review?thumb=1`). Fall back to a styled placeholder showing the topic and DNA swatch. |
| CW-16 | P2 | Create Video: visual drift from the design system | `page-create--desktop.png` (sky-blue selection, centered `max-w-5xl`, custom h1); `create/page.js:57-63, 79, 91` (raw `zinc-*`/`sky-*` classes) | Create uses its own sky-blue accent, its own header and a centered narrow column, while every other Studio tab uses `PageHeader`, the purple `--accent` and full width. It feels like a different product inside a tab. Voice select is truncated ("Andrew (US, de"). | Use `PageHeader`, `--accent` tokens and `Segmented`/`Chip` for genre. Give the voice a card with a ▶ demo, reusing the wizard voice demos (#111). Validate that topic is not empty before submit. |
| CW-17 | P1 | Thumbnails: step order and information architecture | `page-thumbs--desktop.png`; `thumbs/page.js:445, 503, 608, 656-693, 700, 754` | Steps are labelled 1 Pick video → 2 Design → 3 Photo (nested *inside* the step 2 card) → 4 Preview → 5 Attach. Channel-wide settings ("Brand defaults", "Your face library") are mixed into the per-video editor, and A/B testing and Performance sit in the preview column. On mobile/tablet the preview (step 4) is ~1,400px below the controls (`page-thumbs--mobile.png`, `--tablet.png`), so you edit blind. | Re-lay out as a 3-panel editor (Proposal §3.3): **left** template rail, **centre** sticky canvas, **right** inspector (Text / Colour / Background tabs). Move Brand defaults + Face library to a "Channel thumbnail kit" drawer or the Channel settings page. Move A/B and Performance to their own "Results" sub-tab. |
| CW-18 | P1 | Thumbnails: video picker shows no thumbnails; failures hidden | `page-thumbs--desktop.png` (6 grey placeholder tiles); `_errors-by-page.md` (/thumbs 3× 500); `api/thumbs/performance/route.js:56`, `api/thumbs/abresults/route.js:56` return 500; `thumbs/page.js:369-370, 468-473, 828-843` | You choose which video to redesign without seeing its current thumbnail, which is the whole point. Two APIs return 500, and the UI shows "No tests yet" and an empty Performance card as if everything were fine. | Always show the current YouTube thumbnail (`i.ytimg.com/vi/{id}/mqdefault.jpg` needs no auth). When an API fails, show "Couldn't load A/B results, retry" in the card instead of a fake empty state. |
| CW-19 | P1 | Thumbnails: live-write actions without confirm or undo | `thumbs/page.js:299-316` (Attach), `:187-209, 457` (Bulk "Redesign N"), `:175-182` (remove face) | "Attach thumbnail" replaces the public thumbnail on a live video right away. "Redesign N" does it to N videos at once. Neither confirms, neither shows before/after, and neither keeps the old image to restore. The 10-per-day cap is mentioned only after the fact. | Attach → confirmation sheet with **Before \| After** side by side at feed size, "Uses 1 of 10 daily changes", and **Restore previous** kept for 30 days. Bulk → preview strip of all N results plus the explicit count ("Change 6 live thumbnails?"). Face removal → undo toast. |
| CW-20 | P1 | Thumbnails: wrong-brand defaults hard-coded | `thumbs/page.js:39-41` (`accentWord 'Killing'`, `chip 'RULES'`, `eyebrow 'MONEY HABITS'`), `:33, 104, 418` (`#E8C15A`), `:339` `ACCENT_ALTS` | `page-thumbs--desktop.png`: the **Quote Quarry** thumbnail is pre-filled with "MONEY HABITS" / "RULES", copy from another brand, because the defaults are hard-coded. This breaks the no-static-maps directive (brand specifics must come from kit or registry data). | Defaults come only from `/api/thumbs/branding` or the brand kit. With none set, leave the fields empty with placeholder text and a "Set this channel's thumbnail kit" nudge. Take "Give me 3 more" accent alternatives from the brand palette, not a fixed hex list. |
| CW-21 | P2 | Thumbnails: preview panel layout and contradictory guidance | `page-thumbs--desktop.png` (preview footer: "Give me 3 more" squeezed beside a 2-line "MOBILE SIZE" label and a wrapped checklist); `thumbs/page.js:714-746`; label `:581` "≤4 words clicks best" vs checklist `:737` "≤7 recommended" | The footer is a single `flex items-end` row holding a `w-full` button, the mobile preview and the checklist, so everything wraps awkwardly. The editor gives two different word limits. The "panel layout" check is always green for the poster template, even when the right half of the canvas is empty navy (desktop preview). | Footer: row 1 = feed-context mock (see §3.3); row 2 = checklist chips; row 3 = "3 more ideas" as a variant strip. Use one rule, "≤5 words", taken from one constant. Make the photo check real: warn "Right panel is empty, add a photo or pick a no-photo layout". |
| CW-22 | P2 | Thumbnails: template grid usability | `page-thumbs--desktop.png` (3rd row cut off inside a 380px inner scroll); `thumbs/page.js:512, 527, 538-543, 545` | Templates scroll inside a fixed 380px box within an already scrolling page (nested scroll; the cut-off row looks like a bug). "+ rot" is an unexplained 8.5px pill and is a `<span onClick>` inside a `<button>`, so it is invisible to keyboard and screen reader. Category badge is 8.5px, description 10px. "Thumbnail registry — 17 launch designs (read-only; per-niche candidate sets with rotation)" is developer copy. | Template rail = vertical list in the left panel with its own full-height scroll. Replace "+ rot" with a ☆ "Add to auto-rotation" toggle (real `<button>`, 24px target, tooltip). Minimum text size 11px. Remove the registry `<details>` or rename it "Recommended for this niche" and show those first. |
| CW-23 | P1 | Templates gallery: no real previews; 503 hidden | `page-templates--desktop.png` (6 cards with identical dark gradient + glow, no imagery); `_errors-by-page.md` (/templates 6× 503); `templates/page.js:33-40` (silently ignores `!r.ok`), `:138-162`; `api/template-previews/route.js:14, 22` | A video template gallery with no picture of the video. Each card is title text on a blurred blob, and "Interactive Demo" and "Open Demo" do the same thing twice on the same card. When the samples API fails (503), the page quietly falls back to gradients and nobody can tell previews exist. | Every card gets a poster frame (from `template-previews`, or a static poster checked into the repo as fallback) that plays on hover, like the YouTube and Canva template grids. Remove the "Interactive Demo" pill and keep **Preview** + **Use on channel…**. On 503, show a slim info strip: "Sample videos are offline. Showing posters only." |
| CW-24 | P1 | Templates gallery: dishonest counts and three competing catalogs | `templates/page.js:61` "Browse 100+ modular broadcast video engines" (6 cards shown, `templates-catalog.js` has 6 entries); `:64` hard-coded "Drafts Inbox (14 Full Stories · 4 Chapters)"; separate `/templates/registry` (real registry, 20 templates) and Create's 4 "visual styles" (`page-create--desktop.png`) | The owner sees three template systems (a static marketing catalog, the real registry hidden at `/templates/registry`, and the Create DNAs), plus thumbnail templates. None says how it relates to the others, and the headline count is off by more than 16×. | One **Templates** gallery backed by the real registry (`/api/templates`). Filter chips: Format (16:9 / 9:16), Niche, Status (Live / Draft). Drafts become a "Drafts (n)" filter chip with a live count instead of a separate inbox button. Header copy uses the real count: "20 templates · 3 drafts waiting". |
| CW-25 | P2 | Templates gallery: off-system styling | `page-templates--desktop.png` (sky-blue active chip and buttons vs purple app accent); `templates/page.js:81, 122, 134, 190, 224` (`bg-sky-500`, `text-sky-300`, raw `#0A0A14` gradient), header with two equal-weight outline buttons `:63-68` | Same drift as Create: a second accent colour (sky) competes with the brand purple, and the two header buttons have equal weight. "Create Custom Video" is a third entry point to Create (top bar, tab, here). | Use `--accent` and the `Segmented`/`Chip` primitives. Header: one primary action (none needed in a gallery; "Use on channel" lives on cards). Drop "Create Custom Video". |
| CW-26 | P2 | Studio hub: double headers and breadcrumbs | `page-studio--desktop.png` ("Studio Desk" header + tabs + a second "Review Desk" header with icon and subtitle); `page-review--desktop.png` breadcrumb "Quarry Studio / Quarry Studio"; `AppShell.js:280-281` (title only matches NAV hub routes) | Every tab repeats a full `PageHeader` beneath the hub header, so about 220px of chrome comes before any content. Thumbs and Create use their own header styles, making three header styles in one hub. On `/review`, `/topics` and the other legacy routes the breadcrumb reads "Quarry Studio / Quarry Studio". | Inside the hub, tabs render a **compact toolbar** (filters + actions on one 44px row), not a `PageHeader`. Use `ALL_NAV_ITEMS` for breadcrumb lookup so it reads "Studio / Review". Redirect legacy routes to `/studio?tab=…`. |
| CW-27 | P2 | Studio tabs on mobile | `page-studio--mobile.png` (tab row cut at "Create", no scroll hint) | Three of five tabs are off-screen with no fade or arrow, so they can't be discovered on a phone. | Horizontal scroll with an edge fade, or a `<select>`-style tab switcher under 640px. |
| CW-28 | P3 | Hub subtitle copy | `studio/page.js:31` "Editorial review gates, viral topic backlog, generative vertical shorts, thumbnail studio, and video engines." | A list of internal nouns, not a promise. | "Plan, approve and polish every video before it goes live." |

---

## 3. Redesign proposals

### 3.1 Today's journey, mapped

```
IDEA ─► TOPIC ──────────► SCRIPT ─────────► APPROVED ─► RENDER ─► UPLOAD ─► THUMB ──► LIVE
        Studio›Topic Desk   (nightly run,     Studio›Review   Operations›Logs   Studio›Thumbnails  Content›Videos
        pick channel code   invisible)        open row,       (to check it      pick channel again,
        click +             ─ context lost ─  scroll 6 cards, ran at all)       find video w/o image,
                                              approve, back                     design, attach
clicks: 4                   wait ~24h         4-6 per script  2-3               6-10               2
```
That is about 15-25 clicks, 6 screens and 3 hubs. Each handoff loses identity: the topic ID isn't shown on the script, the script isn't linked to the video, and the channel is chosen again on each screen. **No screen answers "where is my idea now?"**

### 3.2 Bigger Bet B1: the Production board (new default Studio tab)

A per-item pipeline. Each card is one video-in-progress with a stable ID that follows it from topic to publish.

```
Studio                                     [All channels ▾]  [+ New topic]   Search…
┌──────────────┬──────────────┬───────────────┬──────────────┬──────────────┬──────────────┐
│ IDEAS (12)   │ QUEUED (7)   │ NEEDS YOU (3) │ MAKING (2)   │ SCHEDULED (4)│ LIVE · 7d (9)│
│ research +   │ next run     │ script review │ render/upload│ goes public  │ perf + thumb │
├──────────────┼──────────────┼───────────────┼──────────────┼──────────────┼──────────────┤
│ ◉QQ Solitude │ ◉QQ #1 Learn │ ◉MR Toxic Trap│ ◉IC Bonds 101│ ◉OM Fri 19:00│ ◉QQ 2.1K/day │
│  11K · 2 ch  │  to enjoy…   │  ⚠ 2 claims   │  ▓▓▓░ render │  thumb ✓     │  thumb A/B ▶ │
│  [Queue]     │  tonight     │  [Review →]   │  ~6 min      │  [Change]    │  [Redesign]  │
│ …            │ ⋮ drag order │ …             │              │              │              │
└──────────────┴──────────────┴───────────────┴──────────────┴──────────────┴──────────────┘
Clicking a card → right slide-out (SlideoutDrawer.js) with a timeline:
  ● Topic queued 11-17 (from "Jim Rohn" research) ─ ● Script 11-18 02:10 ─ ● Approved by MH
  ─ ○ Render ─ ○ Upload (private) ─ ○ Public Fri 19:00 ─ ○ Thumbnail #1
  and stage-appropriate actions (Approve / Reject / Change thumbnail / Open on YouTube).
```
- Columns are fixed and come from DB status (no free-form kanban). "Needs you" is the only column that pulses, and its count drives the real sidebar badge (fixes CW-02).
- The mobile layout becomes a single list grouped by stage, with "Needs you" first.
- Data: topic queue rows, `scripts` status, job/dispatch status, YouTube upload status, all joined on the existing `job_id`. The board is a read model over data that already exists, so no new pipeline work is needed.
- Review, Thumbnails, Topics stay as deep-work tabs, but every entry into them carries the item ID (`/studio?tab=review&id=…`).

### 3.3 Thumbnails, before → after (3-panel editor)

**Before** (`page-thumbs--desktop.png`): one long left column (video grid → template grid with inner scroll → text fields → photo → AI → brand defaults → face library) and a right column (preview → attach → A/B → performance). 1,850px tall on desktop; the preview is far below the controls on mobile.

**After:**
```
Thumbnails  [◉ Quote Quarry ▾]  Video: [▣ The Toxic Trap of False Hope ▾  (current thumb shown)]   [Kit ⚙] [Results]
┌────────────┬─────────────────────────────────────────────────┬──────────────────────────┐
│ LAYOUTS    │                                                 │ TEXT                     │
│ ☆ Recommended│        ┌──────────────── 1280×720 ───────────┐ │ Headline  [The Toxic Trap]│
│ ▣ Bold Poster│        │                                      │ │ 4 words ✓ (≤5)           │
│ ▣ Hero Obj.  │        │         live canvas (sticky)         │ │ Highlight [Toxic ▾]      │
│ ▣ Statue     │        │                                      │ │ Label chip [RULES]       │
│ ▣ Silhouette │        └──────────────────────────────────────┘ │ Small top text [ ]       │
│ …           │  In the feed:  [▭ 168px thumb] Title… · Quote Q │ COLOUR  ● ● ● ● (kit)    │
│ (own scroll)│               [▭ 120px mobile]  ✓ readable      │ BACKGROUND               │
│ filter: All │  Ideas: [▭][▭][▭]  ↻ 3 more                    │  ( Photo | Upload | AI ) │
│ Photo Type  │                                                 │  [search Pexels……] [Go]  │
├────────────┴─────────────────────────────────────────────────┴──────────────────────────┤
│  Before [▭ current]  →  After [▭ new]     Uses 1 of 10 daily changes   [Add to A/B]  [Attach to video] │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```
- **Video picker** becomes a combobox in the toolbar that shows real current thumbnails (CW-18), with a "Select several…" mode for bulk.
- **Canvas** is sticky and always visible. Under it, a **feed mock** puts the thumbnail beside the real title and channel name at desktop-feed (≈168px) and mobile (≈120px) widths, which is how YouTube Studio's Test & Compare and Canva previews work. This replaces the floating "MOBILE SIZE" image.
- **Inspector** tabs: Text / Colour / Background. Background is one segmented control (Photo search · Upload · AI generate), which ends the "3 · Photo nested in 2" confusion.
- **Kit ⚙** opens a drawer with channel-level settings: brand defaults, face library, auto-rotation list (was "+ rot"). **Results** is a sub-view with A/B tests and the 28-day performance table.
- **Bottom action bar** is the only place that writes to YouTube: before/after, quota, confirm (CW-19).
- Tokens: all text ≥ 11px. Selection uses `ring-2 ring-[var(--accent)]`. Panels use `bg-surface` + `border-line`. Tablet: inspector collapses under the canvas. Mobile: canvas pinned at the top (40vh), inspector as a bottom sheet.

### 3.4 Video Templates, before → after

**Before** (`page-templates--desktop.png`): six text-only gradient cards, sky-blue accent, "100+" claim, duplicate demo links, Use Style that goes nowhere.

**After:**
```
Templates · 20 live · 3 drafts            [Format: All | 16:9 | 9:16]  [Niche ▾]  [Status: Live | Drafts(3)]  Search…
┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────┐
│ ▶ poster frame 16:9   │ │ ▶ (hover = plays)     │ │                       │ │  DRAFT · needs review │
│                       │ │                       │ │                       │ │                       │
├───────────────────────┤ ├───────────────────────┤ ├───────────────────────┤ ├───────────────────────┤
│ Investigative Paper   │ │ Chronological Timeline│ │ Macro Ledger Story    │ │ Money-flow Diagram    │
│ Documentary · 16:9    │ │ Documentary · 16:9    │ │ Finance · 16:9 9:16   │ │ Finance · 9:16        │
│ Used by ◉MR ◉IC       │ │ Not used yet          │ │ Used by ◉OM           │ │ [Approve] [Reject]    │
│ [Preview] [Use on ▾]  │ │ [Preview] [Use on ▾]  │ │ [Preview] [Use on ▾]  │ │ [Preview]             │
└───────────────────────┘ └───────────────────────┘ └───────────────────────┘ └───────────────────────┘
```
- Backed by the real registry (`/api/templates`), not the static `templates-catalog.js` (CW-24). The static catalog and `/templates/registry` merge into this one view; the Drafts Inbox becomes the "Drafts" status filter.
- **"Used by"** row with brand marks answers "which of my channels use this?" without a trip to `/channels`.
- **"Use on ▾"** opens a channel checklist that writes the assignment now done by `TemplateAssignPanel` (fixes CW-03 in substance).
- Preview modal (`TemplateSimulator`) keeps working but gains "Use on ▾" in its footer.
- 503 handling: if samples are offline, cards show static posters plus one info strip. If the registry itself is offline, show a full error state with Retry, never an empty grid.

### 3.5 Review Desk, before → after

**Before:** list page → full-page detail with 6 stacked cards, colored-text buttons, back to list after each decision.
**After:**
```
Review · 3 waiting                          [All channels ▾]            J/K move · A approve · R reject
┌──────────────────────────┬──────────────────────────────────────────────────────────────────┐
│ ● ◉MR The Toxic Trap…    │ ◉ Money Rulebook · goes live Fri 19:00 (in 2d)   Originality: Unique │
│   waiting 6h · ⚠2 claims │ ┌─ Script ───────────────────────────┐ ┌─ Sources (4) ─────────┐   │
│ ○ ◉QQ Learn to enjoy…    │ │ 1  Most people think hope is…[¹]   │ │ ¹ APA study 2021 ↗    │   │
│   waiting 2h             │ │ 2  But psychologists found…[²⚠]    │ │ ² ⚠ unverified        │   │
│ ○ ◉IC Bonds explained    │ │ (15px, 68ch)                       │ │                       │   │
│   waiting 40m            │ └────────────────────────────────────┘ └───────────────────────┘   │
│                          │ Thumbnail: [▭1 ✓] [▭2] [▭3]    AI disclosure: 4/4 answered ✓ (edit) │
│                          ├──────────────────────────────────────────────────────────────────┤
│                          │ Note…                       [Reject…]  [ Approve & schedule Fri ] │
└──────────────────────────┴──────────────────────────────────────────────────────────────────┘
```
- The disclosure checklist collapses to a one-line summary when the defaults are pre-answered and expands on click. This keeps the server-side gate and removes about 300px.
- Flagged claims are highlighted inline in the script, so the separate Claims and Flagged cards go away.
- The empty state is positive: "All caught up. Next script expected after tonight's run (~02:00)."

### 3.6 Topic Desk tweaks (no re-layout needed)

- Left card gets tabs "Proven themes (8)" and "Viewer searches (5 relevant)"; low-signal terms are folded away (CW-12).
- "+" opens an inline angle editor with a cleaned title (CW-10). Once queued, the row shows ✓ "Queued #4" (CW-11).
- Right card: drag handles, the position number as "Runs tonight / Fri / Sat" (dates, not just 1-7), undo toast on remove.
- Header: replace "Refresh" with "Research updated 3h ago · Refresh".

---

## 4. Quick wins (each ≤ 1 day)

1. **Kill fake numbers:** remove the hard-coded `3`/`1` in `AppShell.js:149-157` and `studio/page.js:14`, and wire them to real counts or hide them (CW-02).
2. **Fix Review error state:** one state machine plus a full error card with Retry (`review/page.js:58-69, 157-163`) (CW-01).
3. **Fix Topic Desk keys:** key by video ID or channel+title and dedupe titles (`topics/page.js:127, 137`) (CW-09).
4. **Make "Use Style" work:** read `?template=` in `create/page.js` and preselect (CW-03, stop-gap).
5. **Honest Templates copy:** derive the "100+" and "14 Full Stories · 4 Chapters" from data, or delete them (`templates/page.js:61, 64`) (CW-24).
6. **Remove hard-coded thumbnail text defaults** (`thumbs/page.js:39-41`): empty fields with placeholders unless brand defaults exist (CW-20).
7. **Show current thumbnails in the Thumbs video picker** using `i.ytimg.com` (CW-18), and surface the 500s on A/B and Performance as inline errors.
8. **Confirm before writing to YouTube:** Attach and Bulk Redesign confirm with before/after and quota (CW-19).
9. **Review button hierarchy:** filled primary Approve, outline Reject, hide Redispatch unless relevant (CW-06).
10. **Plain-English pass** on Review/Studio copy (CW-07, CW-28). Make the word-count rule agree (`thumbs/page.js:581` vs `:737`).
11. **Breadcrumb fix:** look up titles in `ALL_NAV_ITEMS` (`AppShell.js:280`) (CW-26).
12. **Create Video poster via authenticated route** instead of raw.githubusercontent (CW-15).
13. **Mark queued candidates** in Topic Desk (✓ Queued) and add an undo toast on remove (CW-11).

## 5. Bigger bets (multi-day, high impact)

| # | Bet | Why it matters | Rough size |
|---|---|---|---|
| B1 | **Production board** as the Studio home (§3.2), with item drawer + timeline and stable item IDs across topic → script → video → thumbnail | Answers "where is my idea?" in one glance. Removes about 10 clicks and 2 hub switches per video. Drives the real badges. | 4-6 days (read model joins existing tables; UI uses `SlideoutDrawer`) |
| B2 | **Review inbox** two-pane + keyboard + auto-advance + inline claims (§3.5) | The daily chore. Target: under 60s per script and zero scroll. | 2-3 days |
| B3 | **Unified Templates gallery** on the real registry with poster/hover-play, "Used by", "Use on channel", drafts as a filter (§3.4) | Ends three competing catalogs and the dead "Use Style". Makes templates assignable where they're browsed. | 3-4 days |
| B4 | **Thumbnail editor re-layout**: 3 panels, sticky canvas, feed mock, channel Kit drawer, Results sub-view, guarded attach bar (§3.3) | Turns a long settings form into an editor that matches Canva and YouTube Test & Compare. Mobile becomes usable. | 4-5 days |
| B5 | **Global channel scope** for all Studio tabs (CW-13) plus a top-bar **Create menu** (New topic / Quick short / New thumbnail) and a channel-aware Create Video whose results can be sent to review or scheduled (CW-14) | One mental model: "I'm working on channel X". The primary CTA leads into the real pipeline, not a side lane. | 2-3 days |
| B6 | **Topic composer**: AI angle rewrite of research titles, relevance scoring for search terms, a dated queue ("Runs Fri") with drag order (CW-10/11/12) | Raises the quality of what enters the pipeline, the cheapest point to fix content. | 2-3 days |
