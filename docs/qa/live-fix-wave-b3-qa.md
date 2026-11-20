# QA — Live fix wave B3 (shell, phone and everyday comfort)

*Built 2026-11-20 from the live test report (research/live-e2e-test-2026-11-20.md). Plain-English QA. The "Evidence" column is filled by tests run here; the live rows are for the lead to check after deploy.*

## What changed, in one line each

- **T1-05**: The bell and avatar menus now close when you press **Escape** or click anywhere outside them. Escape also puts focus back on the button you opened them with.
- **T1-04**: On a phone the bell list now fits on screen. It used to start 34px off the left edge.
- **T1-21**: On a phone, **Escape** closes the menu drawer and focus goes back to ☰.
- **T1-06**: A thin bar at the top of the screen shows the moment you change page, and finishes when the new page appears. The heaviest pages also show a grey placeholder layout while they load.
- **T1-03 / T2-05**: The Inbox (`/tasks`) fits a 360–390px phone. Long alert titles wrap instead of stretching the page to 980px.
- **T1-07 / T2-10**: On phones, each channel name on Today gets its own line ("Q." is gone). The status and next upload sit under it.
- **Google sign-in**: "Sign in with Google" now goes straight to Google. It shows "Opening Google…" while it works and a plain message if it can't. You no longer see raw JSON.
- **T1-11**: In the command palette, Enter opens the best match. "Team" opens Team, and "Templates" opens Templates.
- **T1-22**: The search box shows **Ctrl K** on Windows and Linux and **⌘K** on a Mac.
- **T1-13**: On a phone, the **Alerts** tab is highlighted on the Inbox page.

## EARS rules

| ID | Rule |
|---|---|
| B3-1 | WHEN the bell or avatar menu is open AND the user clicks anywhere outside it, the menu SHALL close. |
| B3-2 | WHEN the bell or avatar menu is open AND the user presses Escape, the menu SHALL close AND focus SHALL return to its trigger button. |
| B3-3 | The bell and avatar menus SHALL stay inside the viewport with an 8px margin at every width from 280px to 1920px. On wide screens they SHALL right-align to their trigger. |
| B3-4 | WHEN the phone menu drawer is open AND the user presses Escape, the drawer SHALL close AND focus SHALL return to ☰ (or to the control that opened it, such as the pocket bar's More). |
| B3-5 | WHEN an in-app page change starts (a same-site link to a different path or query, or a command-palette jump), a top progress bar SHALL appear. It SHALL creep toward 90% and SHALL finish when the new route renders or the URL changes. It SHALL give up after 20s. |
| B3-6 | New-tab clicks (Ctrl/⌘/Shift/Alt, middle button, `target=_blank`), downloads, other sites, `mailto:` and same-page or hash-only links SHALL NOT start the bar. |
| B3-7 | WHILE the user prefers reduced motion, the bar and the loading placeholders SHALL show without animation. |
| B3-8 | `/`, `/channels`, `/channels/[slug]`, `/analytics`, `/runs`, `/videos`, `/warnings` and `/tasks` SHALL show a placeholder layout (with a hidden "Loading…" status) while the page loads. |
| B3-9 | `/tasks` SHALL NOT be wider than the screen at 360–390px. Titles in every card SHALL wrap. |
| B3-10 | On Today, below the `sm` width, each channel row SHALL give the name the first line beside its mark. Status and next slot SHALL stack beneath it. From `sm` up the row SHALL stay one line. |
| B3-11 | WHEN "Sign in with Google" is pressed, the page SHALL fetch `/api/auth/google/start` and go to the returned Google URL. WHILE it waits, the button SHALL say "Opening Google…" and be disabled. IF the call fails or returns no Google URL, a plain message SHALL show and the button SHALL work again. |
| B3-12 | WHEN the palette query matches items, results SHALL be ordered exact label → label starts with → label contains → keyword → description, keeping menu order within a tier. Enter runs the first one. |
| B3-13 | The topbar search hint SHALL read "⌘K" on Apple devices and "Ctrl K" everywhere else. |
| B3-14 | WHILE on `/tasks` or `/warnings`, the phone bar's Alerts tab SHALL be highlighted. |

## QA rows

| # | What to do | What should happen | Evidence |
|---|---|---|---|
| 1 | `node --test tests/palette-rank.test.mjs` | Ranking + shortcut label tests pass | PASS: 7/7 |
| 2 | `node --test tests/wave-b3.test.mjs` | All wave B3 pins and pure-logic tests pass | PASS: 19/19 |
| 3 | Full suite `node --test tests/*.test.mjs` | Only T4b (and flaky T4c), plus other teams' in-flight files, may fail | See the B3 report |
| 4 | Live, desktop: open the bell, then click in the middle of the page | The list closes | Lead, after deploy |
| 5 | Live, desktop: open the bell, press Escape | The list closes and the bell button has the focus ring | Lead, after deploy |
| 6 | Live, desktop: same for the avatar menu | Closes on outside click and on Escape; focus on the avatar | Lead, after deploy |
| 7 | Live, 390px phone: open the bell | The list's left edge is on screen (x ≥ 8) and its right edge is too | Lead, after deploy |
| 8 | Live, phone: open ☰, press Escape (a hardware keyboard or DevTools) | The drawer closes; focus is on ☰ | Lead, after deploy |
| 9 | Live: click Channels in the sidebar | A thin accent bar runs across the very top until Channels shows | Lead, after deploy |
| 10 | Live: Ctrl K → type "Runs" → Enter | The bar shows, then Runs opens | Lead, after deploy |
| 11 | Live: Ctrl-click a sidebar link | It opens in a new tab and **no** bar shows on this tab | Lead, after deploy |
| 12 | Live, DevTools → Rendering → emulate `prefers-reduced-motion: reduce`, then change page | The bar shows without sliding; the placeholders don't shimmer | Lead, after deploy |
| 13 | Live, 360px and 390px: open `/tasks` | No sideways scrolling; long titles wrap | Lead, after deploy |
| 14 | Live, 390px: open Today | Channel names show in full; status and next slot sit under each name | Lead, after deploy |
| 15 | Live, signed out: press "Sign in with Google" | The button says "Opening Google…", then Google's account picker opens (no JSON page) | Lead, after deploy |
| 16 | Live: Ctrl K → "Team" → Enter; Ctrl K → "Templates" → Enter | Team opens; Templates opens | Lead, after deploy |
| 17 | Live, Windows: look at the search box | It says "Ctrl K" | Lead, after deploy |
| 18 | Live, phone: tap More → Inbox | The Alerts tab at the bottom is highlighted | Lead, after deploy |

## Files

- `studio/components/shell/AppShell.js`: `HeaderPopover` (portal on `document.body`, full-screen click-away layer, Escape returns focus, clamped placement); bell + avatar use it; the `Notifications` content is unchanged. Also the phone drawer's Escape + focus return, `<NavProgress />` mounted in the frame, and the `ShortcutHint` label.
- `studio/components/shell/NavProgress.js` (new): the top progress bar + `startNavProgress(href)`.
- `studio/components/shell/RouteLoading.js` (new): the shared loading placeholder.
- `studio/app/loading.js`, `studio/app/channels/loading.js`, `studio/app/channels/[slug]/loading.js`, `studio/app/analytics/loading.js`, `studio/app/runs/loading.js`, `studio/app/videos/loading.js`, `studio/app/warnings/loading.js`, `studio/app/tasks/loading.js` (all new).
- `studio/lib/palette-rank.mjs` (new): `rankPaletteItems`, `paletteScore`, `shortcutLabel`.
- `studio/lib/popover-place.mjs` (new): `placePopover`.
- `studio/lib/nav-progress.mjs` (new): `isTrackableNav`, `trickle`.
- `studio/components/shell/CommandPalette.js`: ranked results; page and channel jumps start the bar.
- `studio/components/shell/PocketBar.js`: the Alerts tab is also active on `/tasks`.
- `studio/app/tasks/page.js`: `min-w-0` cards, wrapping titles.
- `studio/app/warnings/page.js`: the FYI and resolved rows can wrap (layout classes only).
- `studio/app/page.js`: the channel-row layout on phones (layout classes only).
- `studio/app/login/page.js`: the Google button fetches, then navigates. `/api/auth/google/start` is unchanged.
- Tests: `tests/palette-rank.test.mjs`, `tests/wave-b3.test.mjs` (new). Pin updated in `tests/breadcrumbs.test.mjs` R11 (the bell wrapper now carries `ref={bellRef}`).

## Known limits (honest)

- The progress bar starts on link clicks anywhere and on command-palette jumps. A bare `router.push` in another page's code (not a link) shows only that route's `loading.js` placeholder, not the top bar. To add the bar, call `startNavProgress(href)` from `components/shell/NavProgress.js` before the push.
- Browser Back/Forward doesn't start the bar. The `loading.js` placeholders still show.
- `app/loading.js` sits at the root, so bare pages (`/login`, `/proof`, `/client`) can briefly show the placeholder on a slow load.
- No browser was run here (`next build` / `next dev` are off-limits for this wave). Every live row above is still to do.
