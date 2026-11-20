# Live website test — 2026-11-20

Real-user testing of https://quarry-studio.vercel.app (production), owner session, desktop 1440×900 + phone 390×844.
Five testers: T1 sign-in/shell · T2 data pages · T3 channels + drawers · T4 Add Channel wizard · T5 templates/create/settings/team.
Evidence (scripts, JSON, screenshots): `%LOCALAPPDATA%/Temp/studio-ui-audit/e2e/t*/`.

**Safety record:** no save/approve/run/pause/publish/delete on the 5 real channels (T3/T4 ran a write-blocking guard; the blocked-mutation log stayed empty). No test channel could be created (the wizard requires a real Google connect). Team list checked after testing: owner only. The engine's own registry file (`yt-mcp/studio-channels.json` on origin) was verified healthy: all 4 channels active, token saved, crons intact.

**Caveat:** the test machine's internet was very slow at times (~57 KB/s). Slowness findings were re-checked with direct requests where noted.

---

## Highest priority (fix first)

| # | Problem | Where | Testers |
|---|---|---|---|
| P1 | Studio intermittently shows all 4 real channels as inactive, no token, no start time. Likely cause: the repo-file read fails and `repoChannelsForOverlay()` falls back to `[]`. Healthy again on re-probe at 15:25 UTC. The engine file was NOT affected. | `studio/lib/channels-registry.js` `repoChannelsForOverlay` | T4-01 |
| P2 | Open redirect: `/login?next=//example.com` sends the user off-site after a correct password (phishing risk). | `app/login/page.js` | T1-01 |
| P3 | Bell shows "?" but its list says "Nothing needs attention" when the alerts check fails: a false all-clear. | `AppShell.js`: Notifications not given status/retry | T1-02 |
| P4 | "Edit setup" on a real channel pre-fills empty slots/tags/description (reads registry `slots`, not `kit.slots`). Pressing Save would wipe them. | `/channels/add?edit=<slug>` | T4-02 |
| P5 | Debt-Free Doctrine shows the wrong upload times on the card, overview and page (00:35/01:30 UTC vs the real 21:20/20:20). `/api/overview` reads static `studio/lib/brands.json` instead of the registry kit. | `/api/overview` | T3-01 |
| P6 | "Last run" / Topics show Oct 20–24 for every producing channel. `state.lastRunDate` is never updated by the clips lane. | overview drawer, channel page, home "not run today", /client | T3-02, T1-09 |
| P7 | 36 of 40 templates share the name "Documentary Master Frames" (catalog name), in the wizard and the drawer. The assigned template is unidentifiable. | `/api/templates` naming | T4-03, T3-13 |
| P8 | Template preview videos never start (readyState 0). The media proxy is very slow and opens a new DB connection per request. **Re-check on a normal connection before fixing.** | `/api/template-previews/media` | T3-03 |
| P9 | "Draft with AI" always fails in production: Groq returns 400, so it silently falls back to the template. | `/api/channels/kit` | T4-04 |
| P10 | AI routing → "Workspace default": reorder/add saves instantly for ALL channels, with no Save and no confirm. | `ProviderRoutingPanel` | T3-11 |

| P11 | Today is wrong about every channel. It says "not run today" for channels that ran and succeeded (QQ, IC), and DFD's FAILED run (44656112937) is not on Today and raises no alert. Same root as P6: `todayVideos` comes from the frozen `state.lastRunDate`. | `/api/overview` | T2-01 |
| P12 | "Needs you" count differs everywhere: verdict 5, bell 6, /tasks 6, /warnings 11, overview API 191. Stale alerts are open for scripts already consumed or rejected/skipped (5115ad32, 9d62f68f, 878cf931, the skipped slots 14/17/18). | warnings lifecycle | T2-02, T2-03, T1-08 |
| P13 | During a GitHub 403 window the panel showed fake zeros (Subscribers 0, Views 0, Videos 0, "Total 1.") instead of "unavailable". `/api/overview` returned 200 with nulls. | `/api/overview`, Analytics | T2-04 |

| P14 | Thumbnails studio shows Money Rulebook text ("RULES" / "MONEY HABITS") as the defaults for EVERY channel, baked into the preview and bulk redesign (hard-coded `useState`). | `/thumbs` | T5-01 |
| P15 | Sessions page never marks "this device" (`current:0`: `session-db` returns `session_id`, route-auth reads `id`), so revoking your own session gives no warning. | `/sessions` | T5-03 |

## Medium
- **T5:**
  - T5-02 /thumbs is 666px wide on phones (the grid has no mobile column rule).
  - T5-04 template poster/video proxy is not CDN-cached (`private`, MISS; ~10–14 KB/s), and every hover re-downloads (reproduced; confirms P8).
  - T5-05 "Create a video with this style" never keeps the template (no gallery id is a Create style).
  - T5-06 /create showed a phantom "tech" job spinning forever; GitHub errors become `[]` silently.
  - T5-07 session times are local in one list and unlabelled UTC in the other.
  - T5-08 "Active sign-ins" shows 20 while "Active sessions" says 40 (hidden LIMIT 20).
- **T2:**
  - T2-06 Today waits for the slow analytics call (11.8 s TTFB) before showing anything.
  - T2-07 bell grouping merges different slots/scripts under one title ("5× slot 2026-11-20 held").
  - T2-08 the review deep-link shows a hard-coded "awaiting_review" chip on an approved script and offers every action; no slot date.
  - T2-09 the "Retry from Review (Redispatch)" alert has no link.
  - T2-10 home names truncated on phones.
  - T2-11 Library: 42/50 rows have no video link, 46 no thumbnail.
  - T2-12 time zones are inconsistent and unlabelled across pages (Runs uses the PKT day, Today the UTC day).
  - T2-13 three different 28-day view totals on Analytics (733 / 866 / 799).
  - T2-14 watch hours rounded to whole hours (0.4 → 0).
  - T2-15 an analytics outage says "needs analytics access" (points to re-auth).
  - T2-16 Runs has no last-good cache during a GitHub 403.

- T1-03 Inbox (/tasks) is 980px wide on phones. T1-04 the bell popover hangs off-screen on phones (x = −34).
- T1-05 the bell and avatar menus don't close on Escape or an outside click; the outside-click layer only covers the 57px header (backdrop-filter containing block).
- T1-06 page changes show no loading sign for 5–11 s (no `loading.js`).
- T1-07 home channel names squeezed to one letter on phones.
- T1-08 Today says 5 things need you; Inbox and the bell say 6 (different counting).
- T1-10 a revoked session cookie shows a broken app frame instead of redirecting to login (proxy checks the signature only).
- T3-04 the Templates drawer sometimes hangs on "Loading…" for 90+ s.
- T3-05 Schedule, Thumbnails and Keys drawers discard unsaved edits on close with no warning.
- T3-06 the browser Back button leaves the page instead of closing the drawer.
- T3-07 the card's music mood comes from a hard-coded `MUSIC_MOODS` map (static-maps rule violation) and is wrong for DFD.
- T3-08 cards say "No accounts linked yet" when the YouTube read fails (`yt: null`).
- T3-09 the timeline: a channel's own hour becomes "taken" (shared hours QQ/IC, MR/DFD) and can't be re-picked.
- T3-10 "Recent uploads" jumps Nov→Sep and shows duplicate pairs (20-row global log).
- T3-12 the Thumbnails drawer takes ~16 s to show all 17 samples, with no skeleton.
- T4-05 the wizard can't prepare a channel without Google connect (steps 2–7 locked).
- T4-06 AI draft overwrites the user's own pillars and fields without asking.
- T4-07 drafted tags contain commas → split into 18 tags with duplicates.
- T4-08 reloading the wizard loses everything with no warning.
- T4-09 the wizard's default short time / "Add a short" lands on other channels' hours.
- T4-10 zero shorts allowed with no warning.
- T4-11 a duplicate channel name isn't warned about; `/api/brands` de-dupes labels, so a second "Quote Quarry" would vanish from the sidebar.
- T4-12 voice demo: switching voices loses the Stop button.
- T4-18 all 4 real channels show a false "key name missing — re-connect" (empty `tokenSecret`).

## Low / cosmetic (summary)

- **T1:**
  - Command palette Enter picks the menu-order match, not the best one (T1-11).
  - Drafts highlights the wrong sidebar item (T1-12).
  - No phone tab highlighted on Inbox (T1-13).
  - `/login?error=` text injection (T1-14).
  - React #418 on the 404 page (T1-15).
  - TikTok dashboard link still in the sidebar (T1-16).
  - "DRILL 2" item in Recently resolved; page title "Tasks" vs "Inbox" (T1-17).
  - `/api/overview` 401 on login/public pages (T1-18).
  - /thumbs intermittently 666px wide on phones (T1-19).
  - /login shows the form when already signed in (T1-20).
  - Phone menu ignores Escape (T1-21).
  - ⌘K shown on Windows (T1-22).
  - The 404 breadcrumb shows the made-up path; "Back to overview" wording (T1-23).
  - Prettified-slug breadcrumb flash; an unknown channel returns 200 (T1-24).
  - The same tab title on every page (T1-25).
  - Footer wrap (T1-26).
  - Phone breadcrumb truncation (T1-27).
  - Mixed-case names / two-letter initials (T1-28).
  - "this window" wording; the wrong password stays in the field (T1-29).
  - A whitespace password enables the button (T1-30).
- **T3:**
  - The version select appears off-screen above the grid (T3-14).
  - 10/40 templates have no preview, including MR's assigned one (T3-15).
  - Developer "Quota advisory" text in the Schedule drawer (T3-16).
  - "Goes public" omits the long-form time (T3-17).
  - Save is enabled with no changes (T3-18).
  - The key error doesn't clear (T3-19).
  - The Story shape switch looks like tabs but saves instantly (T3-20).
  - Unlabelled local vs UTC times (T3-21).
  - "5 live channels" includes paused YT-BOT, plus its placeholder niche (T3-22).
  - Inconsistent labels (T3-23).
  - Stacked footer button icons (T3-24).
  - "yours · sh…" truncation (T3-25).
  - Card text cut off at 390px (T3-26).
  - Developer text in AI routing (T3-27).
  - yt-bot "Resume autopilot" has no confirm on the channel page (from code).
- **T4:**
  - The timeline shows taken hours as starred while loading (T4-13).
  - A bad hex is silently kept (T4-14).
  - 200-character names are accepted, while the API truncates at 60 (T4-15).
  - The eyebrow is cut mid-word and stale after a rename (T4-16).
  - Review omits the thumbnail designs and audience; "next day" wording (T4-17).
  - Mixed-case sidebar names (T4-19).
  - "Taken:" list unsorted (T4-20).

- **T2:**
  - Library "86 shown" vs 24 rows (T2-17).
  - A real 0 shows as "—", and "ID 0" in top countries (T2-18).
  - Picker shows codes (QU/IN/TH) and the leaderboard ignores the picker (T2-19).
  - The chart freshness chip claims today's date while the data ends 11-17 (T2-20).
  - Raw slugs/severity keys on /warnings, and four names for one place (T2-21).
  - Newest report is 2 months old (T2-22).
  - "Untagged" runs and "started by hand or clock" wording (T2-23).
  - Library filters break Back (T2-24).
  - Off-niche/Hindi research topics (T2-25).
  - Labels cut off; "web-message" listed as a channel; 29/129 AI calls failed on groq 400 (T2-26).

- **T5:**
  - Team has no name field or role change, and the "edit the invite file" help text is wrong (Neon first) (T5-09).
  - The 300-character name is echoed but 60 stored (T5-10).
  - Accounts count stale until reload (T5-11).
  - /users counts and keys facts wrong (T5-12).
  - /usage has no YouTube quota or $ despite the menu promise (T5-13).
  - Thumbs keeps the previous channel's headline after switching (T5-14).
  - Auto-generated template names ("NO Spend 30day Storybook") (T5-15).
  - "≤4 words" vs "≤7" headline guidance (T5-16).
  - Registry detail shows `""` with no param (T5-17).
  - 5 orphan `draft-*` preview rows remain while the Drafts inbox is empty.

## Recommended fix order (proposal — needs owner approval)

1. **Trust & safety (first, small and contained):**
   - P1: registry overlay keeps the last good repo copy, never `[]`.
   - P2: open redirect + `?error=` injection.
   - P3: bell error state.
   - P4: "Edit setup" pre-fills from `kit.slots`/tags, so a save can't wipe a live channel.
   - P10: the workspace-wide AI routing needs Save/confirm.
   - P15: sessions "this device".
   - T1-10: revoked cookie → login.
2. **A truthful Today:**
   - P6/P11: "made today / last run" from real sources (`clipLastPostDate`, `uploadsToday`, runs), and a failed run raises an alert.
   - P5: slots from the registry kit, not static `brands.json`.
   - P12: stale alerts auto-close when their script is consumed/rejected/skipped, and ONE "needs you" count everywhere.
   - P13: fake zeros → "unavailable".
   - T3-08: "No accounts linked" on a failed YouTube read.
3. **Templates & media:**
   - P7: unique human template names.
   - P8/T5-04: CDN-cache preview media, no re-download per hover.
   - P9: fix the Groq 400 in "Draft with AI".
   - T5-05: Create style mapping.
   - P14: thumbs defaults per channel.
4. **Phone & everyday UX:**
   - Overflow on /tasks and /thumbs.
   - Bell popover position.
   - Home names on phones.
   - Menus close on Escape/outside click.
   - A loading bar on page change.
   - Unsaved-changes warning in drawers.
   - Back closes the drawer.
   - Wizard reload/draft safety.
   - Timeline own-hour re-pick.
5. **Low/cosmetic sweep:** the remaining T1–T5 low and cosmetic items.

## Checked and working (highlights)

- **Auth:**
  - The logged-out lock works: all protected pages redirect, and APIs return 401/403.
  - Login, wrong-password messaging and the throttle work.
  - Logout revokes the session server-side.
- **Navigation:** the 8 menu links, the 5 channel links, sidebar collapse, the breadcrumbs, the command palette and the theme toggle all work; no internal link 404s across 46 routes.
- **Channels:**
  - Red dots match real warnings exactly.
  - Drawers open/close/swap correctly, the focus trap and focus return work, and Save is reachable at 1440/1366/390.
  - Schedule taken hours match real starts.
  - The thumbnail picker limits (0/1/5/6) work.
  - Keys are masked.
- **Templates/settings:**
  - Gallery counts and filters, the drawer and the registry work.
  - Team invite, duplicate refusal and remove work.
  - Every key is masked; no plain-text secret in 15 API responses.
  - Create validation works; Settings tabs work.
- **Data pages:**
  - Honest error states for overview, warnings, runs and library 5xx; skeletons under a slow network.
  - Analytics per-channel numbers add up to the totals; Refresh works.
  - Runs filters, Library search/filters and the /warnings sort and FYI fold all work.
- **Wizard:**
  - Validation, Back/Next keep entries, double-click Save sends 1 request.
  - Weird names (emoji, Arabic, `<script>`) render safely.
  - The slug comes from Google, so a real channel can never be overwritten by name.
  - The Google consent page opens correctly.
