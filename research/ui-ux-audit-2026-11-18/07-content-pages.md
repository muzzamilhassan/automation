# 07 — Content pages (Content hub, Videos, Social, Audio & Music)

Auditor lens: media-library / content-management UX (YouTube Studio Content tab, Frame.io, Spotify for Artists, Buffer/Hootsuite).
Evidence base: `shots-full/page-{content,videos,social,music}--{desktop,tablet,mobile}.png`, popups, `_errors-by-page.md`, and source at `studio/app/{content,videos,social,music}/page.js`, `studio/components/DataTable.js`, `studio/app/api/overview/route.js`, `studio/lib/data.mjs`, `studio/components/shell/AppShell.js`.
Date: 2026-11-18. Read-only audit.

---

## 1. Plain-English summary for the owner

- **The Videos list works, but it isn't a library yet.** It shows only the **latest ~20 videos**: the server cuts the list off at 40 activity entries. It also has **no thumbnails, no views, and no way to filter by channel**. You can't use it to answer "how did last week's Money Rulebook episode do?" or "which video needs a new thumbnail?"
- **The same video can appear twice** ("How Marcus Aurelius Beat the Market…" and "Enron's $63B Fall…" each show up twice with the same time). Channels are labelled with internal codes like `debt-free-doctrine`, not "Old Money Code". The badge letters also look like typos ("TH" for The Money Rulebook).
- **The Music page's play buttons are invisible.** The play icon is drawn in a transparent colour, so every track shows an empty grey square. The Quote Quarry pool also lists "Gymnopedie No. 1" twice, and that duplicate is what causes the error in the browser console.
- **"Social Cross-Posts" doesn't show any cross-posts.** It shows follower counts plus hand-written notes that are now out of date. One says the Threads token is "valid until ~Oct 29", which was three weeks ago. It also shows broken handles (`@@quotequarry302`, `@undefined`). The data about which video was cross-posted where already exists, but nothing shows it.
- **Fix:** turn Content into one real library (grid or table, thumbnails, channel/status/date filters, views, and a menu on each video) and turn Social into a list of each video's cross-posts with platform badges. The worst problems (invisible play buttons, duplicates, the console error, channel names, and handles) are each under a day's work.

---

## 2. Findings table

| ID | Sev | Page / component | Evidence | Problem | Recommendation |
|---|---|---|---|---|---|
| C-01 | **P0** | Music, play buttons | `page-music--desktop.png` and `--mobile.png` (every row shows an empty square); `app/music/page.js:111` `color: isPlaying ? 'var(--accent-ink)' : 'transparent'` | The Play icon is transparent whenever a track isn't playing, so the main control on the page is invisible. The owner sees 25 blank squares and has to guess they are clickable. | Change the idle colour to `var(--fg-secondary)` (or `--ink`). Make it a 36px circular button with a visible Play glyph. Show disabled rows (no URL) with a `CloudOff` icon and "Local only" text instead of an empty dimmed box. |
| C-02 | **P0** | Videos table (react-aria) | `_errors-by-page.md`: "16x PAGEERROR A table must have at least one Column with the isRowHeader prop" on /content and /videos; `app/videos/page.js:132-154` (no column sets `rowHeader`); `components/DataTable.js:23` | The table does render (`page-videos--desktop.png`), but it throws 16 page errors on every load, and screen readers get no row name. The dev overlay ("1 Issue" red pill) covers the sidebar footer in every screenshot. | Add `rowHeader: true` to the `title` column in `videos/page.js:134`. Harden `DataTable.js`: if no column has `rowHeader`, fall back to the first column with a label (`columns.findIndex(c=>c.label)`). The same fix clears /logs. |
| C-03 | **P0** | Music, duplicate keys | `_errors-by-page.md` /music "9x Encountered two children with the same key"; `app/music/page.js:107` `key={t.title}`; `lib/music-urls.json`: quotequarry has "Gymnopedie No. 1" ×2, investors-compass has "That Zen Moment" and "Garden Music" ×2 (verified by script); visible at `page-music--desktop.png` rows 1 and 16 | Duplicate tracks in the data cause React key collisions, and the pool really does contain duplicates. That makes "25 tracks in this channel's pool" (chip) wrong: QQ actually has 24 unique tracks. | Remove the duplicates from `music-urls.json` (a data fix). Key rows by `url \|\| title + index`. Count unique tracks in the chip. |
| C-04 | **P1** | Videos, data coverage | `app/api/overview/route.js:162` `logs: visibleLogs.slice(0, 40)`; `lib/data.mjs:263-293` (shorts come only from `state.lastVideos`, a rolling window); `page-videos--desktop.png` "20 videos · 4 shorts · 16 episodes", page 2 of 2 | The "library" is a slice of the activity feed, not a catalogue. Shorts older than the `lastVideos` window disappear completely, so "Every video the machine published" (subtitle, `videos/page.js:105`) is false. | Add a dedicated `/api/videos?channel=&kind=&status=&q=&cursor=` backed by a persisted catalogue (Neon `videos` table filled at upload time, or the YouTube `playlistItems` of each uploads playlist, at 1 unit per 50 items). Page through it on the server. |
| C-05 | **P1** | Videos, duplicate rows | `page-videos--desktop.png`: "How Marcus Aurelius Beat the Market With Stoicism" ×2 at Sep 20 10:15, "Enron's $63B Fall…" ×2 at Sep 20 09:30; `videos/page.js:127` `id: \`${l.videoId \|\| l.slug}-${i}\`` | The row id adds the array index, which hides duplicate records instead of removing them. To the owner it looks like the machine uploaded the same video twice, which is alarming and possibly true. | Deduplicate by `videoId` in `allLogs()` (`data.mjs:276-280`). If two different videoIds share a title, show a ⚠ "Possible duplicate upload" chip linking to both, because that is a real problem worth surfacing. |
| C-06 | **P1** | Videos, channel identity | `page-videos--desktop.png`: Channel column shows `debt-free-doctrine` next to an "OL" mark, `money-rulebook` next to "TH"; sidebar says "OLD MONEY CODE" and "THE MONEY RULEBOOK"; `videos/page.js:135` renders `l.slug` | Internal slugs leak into the main UI. The renamed channel (debt-free-doctrine → Old Money Code) shows two different identities in one row. "TH" is the first two letters of "THE", which reads as a typo. | Render `BRAND[l.slug]?.label`, with the slug only in a tooltip. Fix the `short` derivation in `/api/brands` to skip stop-words ("The", "Of") and use initials: MR, OMC, IC, QQ. That matches the owner's own abbreviations in `social/page.js:201` ("IC / MR / DFD"). |
| C-07 | **P1** | Videos, missing library basics | `page-videos--desktop.png` (no thumbnail, views, duration, or channel filter); `videos/page.js:62-66` (only All/Shorts/Episodes) | No thumbnails in a video library. No performance numbers. No channel filter even though there are 5 channels. No sort. A 28px letter badge stands in for the thumbnail. | Thumbnails are free: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` (no API quota). Add a Channel multi-select, a Status filter, a date range, sort (Newest / Most views / Lowest CTR), and Views + "first 48h" columns. See §3. |
| C-08 | **P1** | Videos, mobile and tablet | `page-videos--mobile.png` (only badge and title visible; Kind, Status and Open are scrolled off to the right); `page-content--tablet.png` (Status and Open cut off at 768px) | The only action (Open on YouTube) and the status can't be reached on a phone without scrolling the table sideways, and nothing tells you you can scroll. | Below `md`, switch to a card list: a 96×54 thumbnail, two-line title, a "QQ · Episode · Scheduled Nov 19" meta line, and a `⋯` menu. Never scroll a primary table sideways on mobile. |
| C-09 | **P1** | Social, not a cross-post view | `page-social--desktop.png` (account follower list + static notes); `app/social/page.js:76-221`; `lib/data.mjs:285` already emits `kind: 'Cross-post (<state>)'` records, but `videos/page.js:84` filters them out; `videos/page.js:87-88` has dead `Image`/`Cross` filter branches | The tab is called "Social Cross-Posts" (`content/page.js:13`), but it never shows a single post. The outbox state for each video exists and gets thrown away, so the owner can't answer "did yesterday's Short reach FB, IG, TikTok and Threads?" | Rebuild it as a cross-post matrix: rows are source videos, columns are platforms, and each cell is a status dot (Posted / Queued / Failed / Not configured). Move the account reach list into a compact strip at the top. See §3-C. |
| C-10 | **P1** | Social, stale hard-coded facts | `social/page.js:151-161`, `:194-209` ("Valid until ~Oct 29", "restored Sep 20", "since Sep 28", "~60 reels"); `:117` hard-coded `@arzo22345`; `:172` "NIAZRA"; `:113`, `:168` hard-coded hex colours | Health notes are hand-written JSX that went stale. Today is Nov 18 and the page still says the Threads token is valid until Oct 29. That breaks the owner's no-static-maps and real-data-only directives. | Get health from live checks (token expiry from the provider, last successful post timestamp per platform) on the existing `/api/overview`. Any note that can't be computed goes in the registry with an `updatedAt`, and the UI shows "as of <date>" in a muted tone. Delete the hard-coded TikTok and Pinterest blocks. |
| C-11 | **P1** | Social, handle rendering | `page-social--desktop.png`: `@@quotequarry302`, `@@investorscompasshq`, `@undefined` (YT-BOT); `social/page.js:96` `` `@${row.handle \|\| row.username \|\| row.name}` `` | The YouTube handle already contains "@", so the code doubles it. When there's no handle it prints the literal string "undefined". | Strip leading "@" before adding one (`'@' + h.replace(/^@/, '')`). If there's no handle, show "Not connected" with a "Connect" link to `/channels`. |
| C-12 | **P2** | Social, tab bar overflow on mobile | `page-social--mobile.png`: tabs show "YouTube 241 · Facebook 23K · Instagram 3 · TikTok", and Threads/Pinterest are cut off with no scroll cue; `social/page.js:58` `overflow-x-auto` | Two platforms are hidden off-screen on phones. Platform text labels with no brand icons make the bar slow to scan. | Use icon + count chips that wrap (`flex-wrap`), or a `<select>` below `sm`. Put brand-colour platform icons on each tab. |
| C-13 | **P2** | Social, number semantics | `page-social--desktop.png`: tab says "YouTube 241" and "Instagram 3"; the YT-BOT row shows "— SUBS" | The tab count mixes a sum of subscribers with tab navigation, and nothing says what "241" means. "Instagram 3" looks like an error (3 followers across 4 accounts?). | Remove numbers from the tabs. Put a "Reach" stat strip above (Platform · Total followers · 7-day delta), each value labelled with a unit. |
| C-14 | **P1** | Content hub, double header | `page-content--desktop.png`: "Content & Media Library" H1 + tabs, then a second H1 "Videos" with its own icon and subtitle; `content/page.js:24-28`, `videos/page.js:105` | Two page titles, two icons and two subtitles stacked use about 230px before the first row. The hub embeds full pages instead of panels. Social and Music repeat the same pattern. | Give each child a `embedded` prop that suppresses its `PageHeader`. Move the child's search and filters into the hub's tab row. One H1 per page. |
| C-15 | **P2** | Breadcrumb | `page-videos--desktop.png`, `page-social--desktop.png`, `page-music--desktop.png`: "Quarry Studio / Quarry Studio"; `components/shell/AppShell.js:280-281` looks up only primary `NAV` items | On the deep routes the breadcrumb repeats the product name instead of the page. | Look up the secondary items (`nav.js:53-55`) too, and render "Content / Videos". |
| C-16 | **P2** | Videos, status semantics | `lib/data.mjs:289-292` (status is `published` if `publishAt` is in the past) | "Published" is inferred from the clock. A video that failed, is private, or was removed still shows a green "Published" chip. | Use the real `status.privacyStatus` / `uploadStatus` from the catalogue (C-04). Add statuses: Processing, Private, Failed, Removed. |
| C-17 | **P2** | Videos, columns that carry no information | `page-videos--desktop.png`: the Platform column says "YouTube" on all 12 rows; the open icon is a 12px `ArrowUpRight` with no label (`videos/page.js:149-153`) | A column that never varies wastes about 120px. The only action is a tiny grey arrow. | Remove the Platform column (it moves into the cross-post matrix). Replace the arrow with a row `⋯` menu plus a visible "Open" on hover (§3-B). Make the whole row clickable to open the detail drawer. |
| C-18 | **P2** | Videos, pagination footer | `page-videos--desktop.png`: "20 / entries" wraps onto two lines to the left of "Previous"; `DataTable.js:39` | The count wraps awkwardly and "entries" is database language. | Use `whitespace-nowrap` and the copy "Showing 1–12 of 20 videos". Add a page-size selector (12 / 24 / 48). |
| C-19 | **P2** | Music, moods panel | `page-music--desktop.png` (right column lists all 4 channels' moods as "QU / IN / TH / OL" even though QQ is selected; YT-BOT missing); `lib/site-data.js:112-117` static `MUSIC_MOODS` keyed by slug | It's a static map (owner directive violation). The selected channel's mood isn't highlighted. The two-letter names aren't readable. A new channel will never get moods. | Move moods into the brand kit and registry (`/api/brands` → `music.moods`). Show only the selected channel's moods, inline under the pool header, with an "Edit moods" link to the channel kit. |
| C-20 | **P2** | Music, hard-coded advisory card | `music/page.js:171-179` "Old Money Code pool — Its 27 tracks were picked for the old debt theme" | A permanent hard-coded card. It shows on every channel tab, not just Old Money Code. | Show it only when `slug === <that channel>`, and drive it from data (a kit flag such as `musicPoolStale: true`), or delete it. |
| C-21 | **P2** | Music, track rows | `page-music--desktop.png`: 25 identical rows reading "Kevin MacLeod · CC BY · credit added automatically" and a decorative `Volume2` on every row | The repeated credit line is noise. No duration, no "used in N videos", no BPM or mood tag. You can't tell tracks apart without playing them. | Show the licence once in the header ("All tracks: Kevin MacLeod, CC BY — credit auto-added"). Rows show title · duration · mood tags · "Used in 7 videos · last Nov 17". Add a sticky mini-player bar with a scrubber at the bottom of the card. |
| C-22 | **P3** | Music, channel selector | `page-music--mobile.png`: 5 channel pills wrap to 3 lines; `page-music--desktop.png`: ALL-CAPS labels at 11px | It takes too much space on phones, and ALL-CAPS labels are harder to read. | Use the same Channel picker component as Videos (one dropdown with brand marks). Use title case for labels. |
| C-23 | **P3** | Content hub tab labels | `page-content--desktop.png` tabs "Published Videos / Social Cross-Posts / Audio & Music Library" | The labels are long, and "Published" is wrong because the list includes Scheduled items. | Rename to "Videos · Cross-posts · Music". |

---

## 3. Redesign proposals

### 3-A. Content hub: one header, one toolbar

**Before** (`page-content--desktop.png`): Hub H1 → tabs → child H1 → child search → segmented control → table. About 330px of chrome before row 1.

**After:**
```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ Content                                                    [＋ New video]  (Create flow) │
│ Videos (20)   Cross-posts (3 failing ●)   Music                                          │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ 🔍 Search titles, IDs…        [Channel: All ▾] [Type: All ▾] [Status: All ▾] [Last 30d ▾]│
│ Sort: Newest ▾                                     ▦ Grid  ☰ Table      Showing 1–24 of 87│
└──────────────────────────────────────────────────────────────────────────────────────────┘
```
- Each tab label carries a live count or alert dot: Cross-posts shows a red dot when any post failed in the last 24 hours.
- Filters live in the URL (`/content?tab=videos&channel=money-rulebook&status=scheduled`), so they work from the command palette and the sidebar. Clicking a channel in the sidebar while on Content applies that channel's filter.
- Filter chips appear under the toolbar when active ("Channel: Money Rulebook ✕"), with "Clear all".

### 3-B. Videos: table view (default on desktop)

```
┌───┬──────────────────────┬──────────────────────────────────┬────────────┬───────────┬─────────┬────────┬─────────────┬───┐
│ ☐ │ Video                │                                  │ Channel    │ Status    │ Views   │ 48h    │ Cross-posts │   │
├───┼──────────────────────┼──────────────────────────────────┼────────────┼───────────┼─────────┼────────┼─────────────┼───┤
│ ☐ │ [▓▓▓ thumb 112×63 ▓] │ Debt Snowball: Cut $12K Debt,    │ ◼MR Money  │ ◷ Sched.  │    —    │   —    │ f ◌ ig ◌ ♪ ◌│ ⋯ │
│   │ [  0:58  SHORT     ] │ Add $1.5K to Savings             │  Rulebook  │ Nov 19    │         │        │             │   │
│   │                      │ abc123xyz · uploaded Nov 18      │            │ 05:05     │         │        │             │   │
├───┼──────────────────────┼──────────────────────────────────┼────────────┼───────────┼─────────┼────────┼─────────────┼───┤
│ ☐ │ [▓▓▓ thumb ▓▓▓▓▓▓▓▓] │ The Toxic Trap of False Hope |   │ ◼QQ Quote  │ ● Live    │  1,204  │  ▲ 812 │ f ● ig ● ♪ ✕│ ⋯ │
│   │ [ 12:41  EPISODE   ] │ Timeless Wisdom                  │  Quarry    │ Nov 18    │         │ vs avg │             │   │
└───┴──────────────────────┴──────────────────────────────────┴────────────┴───────────┴─────────┴────────┴─────────────┴───┘
  Selected: 2   [Re-thumbnail]  [Retry cross-posts]  [Copy links]                     ← 1 2 3 4 →   24 / page ▾
```
- **Thumbnail column:** `i.ytimg.com/vi/{id}/mqdefault.jpg`, 112×63, `rounded-md`, with a duration and type pill in the bottom-right (Short in `--info`, Episode in `--accent`). This replaces the separate Kind column and the BrandMark column. For scheduled or private videos where YouTube serves a grey placeholder, fall back to the local thumbnail candidate from the review pipeline.
- **Title cell:** two-line clamp (`line-clamp-2`), then `videoId · uploaded <date>` in `text-fg-quaternary` mono 11px. This is the `rowHeader` column (fixes C-02).
- **Channel:** BrandMark at 20px plus the human channel name. Never the slug.
- **Status:** one dot-chip (Scheduled / Live / Processing / Private / Failed) with the date below. "Live" replaces "Published" because it's clearer.
- **Views and 48h:** right-aligned tabular numbers. 48h shows a delta against the channel's median ("▲ 812 vs avg"), green or red. That alone answers "is this one doing well?"
- **Cross-posts:** compact platform glyphs with a state dot. Clicking one opens the Cross-posts tab filtered to that video.
- **Row `⋯` menu (YouTube Studio pattern):**
  ```
  ┌─────────────────────────────┐
  │ ↗ Open on YouTube           │
  │ ✎ Edit in YouTube Studio    │  (studio.youtube.com/video/{id}/edit)
  │ 🖼 Re-thumbnail…            │  → /thumbs?video={id}
  │ 📈 View analytics           │  → /analytics?video={id}
  │ ⟳ Retry cross-posts         │
  │ ⧉ Copy link                 │
  └─────────────────────────────┘
  ```
- **Row click** opens a **right-side detail drawer** (reuse `SlideoutDrawer.js`): a large thumbnail, the title and description, a 7-day views sparkline (`charts.js` Sparkline), the track used (linking to the Music tab), a cross-post status list, and the action buttons above. The owner never has to leave the page to act on a video.
- **Sorting:** click a column header (Newest, Views, 48h). The react-aria Table supports `sortDescriptor`, so wire `allowsSorting` on the Views, 48h and Status columns.

### 3-C. Videos: grid view (default under 1024px, toggle on desktop)

```
┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
│ ▓▓▓▓ 16:9 thumb ▓▓▓ │ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
│ ◷ Nov 19     SHORT  │ │ ● Live     EPISODE  │ │ ✕ Failed   SHORT    │ │ ● Live     EPISODE  │
├─────────────────────┤ ├─────────────────────┤ ├─────────────────────┤ ├─────────────────────┤
│ Debt Snowball: Cut  │ │ The Toxic Trap of   │ │ …                   │ │ …                   │
│ $12K Debt, Add $1.5K│ │ False Hope | Time…  │ │                     │ │                     │
│ ◼MR · —  views    ⋯ │ │ ◼QQ · 1.2K · ▲812 ⋯ │ │                     │ │                     │
└─────────────────────┘ └─────────────────────┘ └─────────────────────┘ └─────────────────────┘
```
- Grid: `grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4`. Status and type pills overlay the thumbnail on a `bg-black/60` backdrop-blur. Hovering a card on desktop reveals "Open" and "Re-thumbnail" icon buttons over the thumbnail.
- Shorts in the grid use a 9:16 crop (`object-cover`, letterboxed into the 16:9 card), so a channel's Shorts wall reads like the YouTube Shorts shelf.
- Mobile (390px): one-column list rows. Thumbnail 96×54 on the left, then two-line title, then meta "QQ · Episode · Live · 1.2K views", and `⋯` on the right with a 44px tap target (fixes C-08).
- The view toggle persists per viewer in `localStorage`, wrapped in try/catch.

### 3-D. Cross-posts tab (replaces Social)

```
Reach   YouTube 241 subs (+6 7d) · Facebook 23K · Instagram 3 · TikTok — · Threads ⚠ token expired · Pinterest ○ not set up
──────────────────────────────────────────────────────────────────────────────────────────────────────
[Channel ▾] [Platform ▾] [State: Failed ▾]                                       Last 14 days ▾
┌──────────────────────────────────────┬──────┬──────┬────────┬─────────┬──────────┐
│ Source video                         │ FB   │ IG   │ TikTok │ Threads │ Pinterest│
├──────────────────────────────────────┼──────┼──────┼────────┼─────────┼──────────┤
│ [thumb] Debt Snowball… · MR · Nov 19 │ ◷ 7:20│ ◷   │ ◌ n/a  │ ◌ n/a   │ ○        │
│ [thumb] Toxic Trap… · QQ · Nov 18    │ ● 2 v │ ● 41│ ✕ Retry│ ● 12 v  │ ○        │
└──────────────────────────────────────┴──────┴──────┴────────┴─────────┴──────────┘
Legend: ● posted (views)   ◷ queued (time)   ✕ failed (hover = error, click = retry)   ◌ not configured for channel   ○ platform not connected
```
- Source: the `outbox()` records already emitted by `lib/data.mjs:285`, grouped by source title or videoId.
- The "Platform health" notes become **computed alerts** above the matrix, only when true: "Threads token expired 20 days ago → Reconnect", or "Facebook: 60 reels, 2 views in 14 days → Review fix plan". Each has a date and a CTA. A static note never appears.
- The "Funnel platforms" chip (`social/page.js:73`) goes away. That's strategy, not status. Put it in the channel kit or the docs.
- "Timing strategy" (`social/page.js:212-220`) goes away too. If the posting slots are data, show them as small "next slot" times in the queued cells.

### 3-E. Music tab

```
[Channel: ◼QQ Quote Quarry ▾]   Moods: Epic · Inspiring · Heroic   [Edit in kit →]
24 tracks · 2 local-only · All: Kevin MacLeod, CC BY (credit auto-added)       🔍 Filter tracks
┌────┬────────────────────────────┬────────┬──────────────┬───────────────────┐
│ ▶  │ Gymnopedie No. 1           │ 3:05   │ Calm · Piano │ Used in 9 · Nov 17│
│ ▶  │ Skye Cuillin               │ 4:12   │ Epic         │ Used in 4 · Nov 12│
│ ☁✕ │ Spirit of Fire  Local only │ 2:48   │ Heroic       │ Used in 2 · Oct 30│
└────┴────────────────────────────┴────────┴──────────────┴───────────────────┘
╞══ ▶ Skye Cuillin ───●────────────── 1:12 / 4:12   🔊 ▬▬▬  ✕ ══╡   ← sticky mini-player
```
- The play button is visible at rest (fixes C-01) and the currently playing row is highlighted with `--accent` at 8%.
- "Used in N videos · last date" comes from the render logs. It shows overused or dead tracks at a glance, which is the real management task for a music pool.
- Moods come from the kit, shown for the selected channel only (fixes C-19).

### 3-F. Tokens and components to add or change
- `DataTable`: add `rowHeader` fallback, `sortDescriptor`, `selectionMode="multiple"`, a `rowActions(row)` slot, `onRowAction` (opens the drawer), and `density` ("comfortable" 72px rows with thumbnails, "compact" 44px).
- A new shared `ChannelPicker` (used by Videos, Cross-posts and Music) built on `useBrands().channels`.
- A new `StatusChip` with one source of truth: `scheduled→info`, `live→ok`, `processing→warn`, `private→plain`, `failed→bad`.
- A new `PlatformGlyph` for platform icons, coloured through tokens (`--brand-youtube`, `--brand-facebook`, …) declared in `globals.css`. This replaces the hex literals at `social/page.js:89,113,168`.

---

## 4. Quick wins (each ≤ 1 day)

1. **Make the play buttons visible:** `music/page.js:111` `'transparent'` → `'var(--fg-secondary)'` (C-01). About 5 minutes.
2. **Add `rowHeader: true`** to the Videos title column, plus the first-column fallback in `DataTable.js` (C-02). This clears 16 errors per load on /content and /videos, plus /logs.
3. **Remove duplicates from `music-urls.json`** and key rows by `url` (C-03).
4. **Deduplicate videos by `videoId`** in `allLogs()` and drop the `-${i}` key suffix (C-05).
5. **Show channel names, not slugs,** in the Videos Channel column, and fix the initials for "The …" brands (C-06).
6. **Thumbnails from `i.ytimg.com`** in the Videos table at zero quota cost (part of C-07).
7. **Add a Channel filter** to Videos using the existing `useBrands().channels` and a `?channel=` param (part of C-07).
8. **Fix handles:** strip the double "@" and replace "@undefined" with a "Not connected" link (C-11).
9. **Remove the stale hard-coded notes** in Social (Threads "Oct 29", TikTok and Pinterest blocks), or label them "as of <date>" until they're live-computed (C-10).
10. **Suppress the child `PageHeader`** when a page is embedded in the Content hub (C-14), and fix the breadcrumb lookup for secondary routes (C-15).
11. **Remove the Platform column,** turn the arrow into a labelled "Open ↗" button, and tidy the footer copy to "Showing 1–12 of 20 videos" (C-17, C-18).

## 5. Bigger bets (multi-day)

1. **A real video catalogue (C-04, C-16):** a Neon `videos` table filled at upload time and backfilled once from each channel's uploads playlist (1 quota unit per 50 videos). A nightly stats refresh writes views, likes and the real `privacyStatus`. Add a paginated `/api/videos` endpoint. Without this, everything in §3-B is decoration on 20 rows.
2. **Library UI (§3-A to 3-C):** grid/table toggle, URL-synced filters, sort, multi-select bulk actions, row `⋯` menu, and the detail drawer with sparkline and actions. Estimate: 3–4 days on top of bet 1.
3. **Cross-post matrix (§3-D, C-09/C-10):** group the outbox records by source video, compute platform health (token expiry, last success) in the API, add per-cell retry. Turns "Social" from a brochure into an operations surface.
4. **Music pool management (§3-E):** move moods into the kit, add usage counts from render logs, a sticky mini-player, add/remove track in the pool (written through the same audited GitHub-commit path as the Drafts Inbox).
5. **Performance-led prompts in the library:** flag videos whose 48h views are below 50% of the channel median with a "Re-thumbnail?" chip that deep-links to `/thumbs?video=`. That closes the loop between the library and the thumbnail tooling, which is the main reason an owner opens a content library at all.
