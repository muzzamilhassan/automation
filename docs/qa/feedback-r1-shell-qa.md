# Spec + QA — Shell: breadcrumb everywhere, warnings in 2 places (2026-11-19)

Owner feedback round 1, items C and D (shell part).

- **C.** The topbar breadcrumb was `hidden md:flex` (phones never saw it) and
  showed one level only. Wanted: a full, clickable trail on every page at
  every width, real channel names, one line on phones.
- **D.** Owner rule: real problems are shown ONLY in the **bell** (topbar,
  with its count) and on the **Inbox page** (`/warnings`). The sidebar
  "Inbox" count and the phone bar's Alerts count are removed; the bell stays
  exactly as it is and stays reachable on phones.

Pure logic: `studio/lib/breadcrumbs.mjs` (`buildBreadcrumbs`, `prettifySegment`).
Shell: `studio/components/shell/AppShell.js`, `nav.js`, `PocketBar.js`.

## EARS acceptance criteria

- **R1** WHEN any page inside the panel opens, THE studio SHALL show a breadcrumb in the topbar at every screen width (no `hidden md:` gate).
- **R2** WHEN the page is a screen that lives under a menu item (e.g. `/users`), THE studio SHALL start the trail with that menu item (`Settings › Team`).
- **R3** WHEN the URL is nested (e.g. `/templates/drafts`), THE studio SHALL show one crumb per URL level, using the short crumb label (`Create › Templates › Drafts`).
- **R4** WHEN the page is a channel (`/channels/<slug>`), THE studio SHALL show the channel's live display name (`Channels › Money Rulebook`), and WHILE the name is unknown it SHALL show the slug prettified (`money-rulebook` → `Money Rulebook`).
- **R5** THE studio SHALL make every crumb a link except the last, which SHALL be plain text marked as the current page.
- **R6** WHEN the trail is wider than the space on a phone, THE studio SHALL keep it on one line, truncate the earlier parts with "…", and never widen the page.
- **R7** WHEN the home page (`/`) is open, THE studio SHALL show the single crumb "Today".
- **R8** THE studio SHALL show NO warning count on any menu item (the sidebar "Inbox" badge is gone, and nav.js carries no badge source).
- **R9** THE phone bar SHALL show no warning count and no "status unknown" alert dot (it no longer reads open warnings at all).
- **R10** THE topbar bell SHALL keep its live count, its grey "?" when the check fails, and its alert list — unchanged.
- **R11** WHILE the screen is a phone (390px wide), THE bell SHALL be visible in the topbar and never squeezed out by the breadcrumb.

## QA checklist

| # | Req | Check (plain English) | Type | How |
|---|---|---|---|---|
| 1 | R1 | The breadcrumb is no longer hidden on small screens | automated | `node --test tests/breadcrumbs.test.mjs` |
| 2 | R2 | `/users` reads "Settings › Team"; `/warnings` reads "Inbox › Alerts" | automated | same |
| 3 | R3 | `/templates/drafts` reads "Create › Templates › Drafts"; `/templates/registry/detail` reads "Create › Templates › Registry › Detail" | automated | same |
| 4 | R4 | `/channels/money-rulebook` reads "Channels › Money Rulebook" from the live name, and from the prettified slug when names haven't loaded | automated | same |
| 5 | R5 | Every crumb except the last has a link; the last has none | automated | same |
| 6 | R6 | Breadcrumb list is one line, clipped, earlier parts truncate | automated (source pin) | same |
| 7 | R7 | `/` reads "Today" | automated | same |
| 8 | R8 | No menu item has a badge; the sidebar renders no Inbox count | automated | `node --test tests/nav-ia.test.mjs tests/phase0-truth.test.mjs` |
| 9 | R9 | Phone bar does not use the warnings hook and has no alert count or "?" | automated | `node --test tests/pocket-mode.test.mjs` |
| 10 | R10 | Bell still shows the real count / "?" / alert list | automated | `node --test tests/static-text-sweep.test.mjs` |
| 11 | R11 | Bell is not hidden at any width and cannot shrink | automated (source pin) | `node --test tests/breadcrumbs.test.mjs` |
| 12 | R1/R6 | Owner: open the panel on a phone (390px) — the trail shows on one line, nothing scrolls sideways | manual | real browser, 390px |
| 13 | R4 | Owner: open a channel page — the trail shows the channel's real name, and tapping "Channels" goes back to the list | manual | real browser |
| 14 | R11 | Owner: on a phone, tap the bell — the alert list opens | manual | real browser, 390px |
