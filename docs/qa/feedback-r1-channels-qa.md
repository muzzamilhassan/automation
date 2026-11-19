# QA — Feedback round 1: calmer channel cards + channel drawer (items D, E, H)

*Written before the code, 2026-11-19. Evidence: `tests/channel-overview.test.mjs` (10/10), `tests/channels-drawers.test.mjs` (21/21), `tests/channel-health.test.mjs` + the other pins on these files (122/122 together). Full suite: no failures in these files.*

**In one line:** channel cards stop showing warning text (a small red dot means "something is wrong, see Inbox"), "Open channel" opens a big panel instead of leaving the list, and the manage panels have shorter headers plus a new "Thumbnails" panel.

## Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| D1 | WHEN the Channels page shows a channel card, THE studio SHALL NOT show any warning sentence or health warning label on that card. |
| D2 | WHEN a channel has at least one REAL open problem (blocking, action required or warning, matched by `channel_id`), THE studio SHALL show a small red dot on its card, labelled "Has a problem — see Inbox", that links to the Inbox. |
| D3 | WHEN a channel only has quiet notes (advisory or informational), or no open problems, or the alerts can't be read, THE studio SHALL NOT show the red dot. |
| D4 | WHEN today's run for a channel has not happened yet, THE studio SHALL NOT say "Not run today" anywhere on the card, the channel panel or the channel page (whatever the time of day, including before the channel's slot). |
| D5 | WHEN the per-channel page is open, THE studio SHALL show at most one short red-dot line linking to the Inbox, and no list of warning reasons. |
| H1 | WHEN the owner clicks "Open channel" (or the channel name) on a card, THE studio SHALL open a large panel (drawer, size xl) over the Channels list, without changing the page address. |
| H2 | WHEN the channel panel is open, THE studio SHALL show the channel's status (Active/Paused, YouTube connection, red-dot line if a real problem), today (made / uploaded), and the next upload or slot plus a schedule summary. |
| H3 | WHEN the owner clicks a quick action (Schedule, Templates, Thumbnails, API keys, AI routing) in the channel panel, THE studio SHALL replace the channel panel with that manage panel, so only one panel is ever open. |
| H4 | WHEN the owner clicks "Full page ↗" in the channel panel, THE studio SHALL open `/channels/<slug>`, which keeps working. |
| E1 | WHEN any manage panel opens, THE studio SHALL show a header description of at most 5 words. |
| T1 | WHEN the owner opens Manage on a card, the channel panel, or the channel page's settings, THE studio SHALL list a "Thumbnails" entry between Templates and API keys that opens the thumbnail-design panel. |
| T2 | WHEN a client (not staff) uses the panel, THE studio SHALL NOT offer the Thumbnails manage entry (it is staff-only, like Schedule and Templates). |

## Plain-English QA checklist

| # | What to check | How we know it works | Result |
|---|---|---|---|
| D1 | Cards on /channels have no yellow/red warning sentence and no "Needs attention" / "Not uploading" label — only "Active" or "Paused" | Source-scan test: the list page no longer uses the health verdict or its reasons | PASS |
| D2 | A channel with a real open alert shows a small red dot beside its Active/Paused chip; hovering says "Has a problem — see Inbox"; clicking it opens the Inbox | Unit test for `channelHasRealProblem` + source pin on the dot's label and `/tasks` link | PASS |
| D3 | Channels with only "FYI" notes, or none, show no dot | Unit tests: advisory/informational rows, other channels' rows, empty/missing rows → no dot | PASS |
| D4 | Early in the morning (before any slot) nothing says "Not run today" | Unit test walks every hour of the day: today's wording never contains "not run today" | PASS |
| D5 | The channel page shows one red-dot line (only when there is a real problem) instead of a list of warning reasons | Source pin: no `health.reasons` list, shared red-dot line used | PASS |
| H1 | "Open channel" opens a big side panel; the address bar still says /channels | Source pin: the button opens the `overview` drawer, `size="xl"`, no link to the channel page on that button | PASS |
| H2 | The panel shows status, today, next upload/slot and the schedule | Unit tests for today's wording, uploads-today count and next-slot pick; source pin on the shared status tiles | PASS |
| H3 | Clicking "Schedule" (etc.) in the panel swaps to the Schedule panel; closing it returns to the list; never two panels at once | Source pin: quick actions call `onManage(k)`, which sets the single `drawer` state to that panel | PASS |
| H4 | "Full page ↗" opens the old channel page, which still loads | Source pin: link to `channelHref(slug)`; existing channel-page tests still pass | PASS |
| E1 | Manage panel headers are short (≤ 5 words under the title) | Test counts the words in every drawer description | PASS |
| T1 | "Thumbnails" sits between Templates and API keys in every Manage list and opens the thumbnail-design panel | Source pin on the menu order and the `ThumbnailAssignPanel` route | PASS |
| T2 | Clients don't see Thumbnails | Test: `staffOnly: true` on the entry (`drawersFor('client')` drops it) | PASS |

## What you'll see

- /channels: calm cards — name, niche, Active/Paused, voice, music, slots, accounts. A red dot only when the Inbox has a real problem for that channel. A failed YouTube read now reads "YouTube · stats unavailable" in grey (no red text).
- "Open channel": a large panel with the channel's status, today, next upload and schedule, plus buttons for Schedule / Templates / Thumbnails / API keys / AI routing and a small "Full page ↗" link.
- Manage panel headers: a title plus a few words, not a sentence.

Note: the Thumbnails panel's content is built by a parallel team (`ThumbnailAssignPanel.js`); this change only registers and opens it.
