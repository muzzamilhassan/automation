# Spec + QA — "100% ready before anything publishes" (2026-11-21)

Source: owner rule, FEEDBACK.md item K. "Don't upload videos until the template
and channel have proper things added — until a channel is 100% filled with its
details and config, videos should not publish."

## The 7 checklist items

Every item counts only panel data: the registry entry and its kit
(`yt-mcp/studio-channels.json`, mirrored from Neon) and the cadence row
(`yt-mcp/cadence.json`). The static brand files never count.

| # | Item (panel label) | Done when | Fixed in |
|---|---|---|---|
| 1 | YouTube connected | `tokenSecretSaved === true` | Add channel › Connect |
| 2 | Video template picked | `kit.templateId` set (mirror of the Neon assignment) | Channel › Templates |
| 3 | Story shape chosen | `kit.hasChapters` is true/false, or `kit.storyShape === 'template'` | Channel › Templates |
| 4 | Niche, description and tags | niche (`niche` or `kit.niche`); description (`kit.description` or the channel's own `ytDescription`); ≥1 tag (`kit.tags` or usable `ytKeywords`) | Edit profile |
| 5 | Voice chosen | `voice` or `kit.voice` | Edit profile |
| 6 | Thumbnail designs (2–5) | 2–5 distinct `kit.thumbTemplates` | Channel › Thumbnails |
| 7 | Full schedule | an upload day (cadence `docDays`/`shortDays`); a Shorts time (top-level `slots`, else `kit.slots`, all valid HH:MM); `kit.longSlot`; a daily start time (`cron` or `kit.gateCron`) | Channel › Schedule |

One pure module answers it: `studio/lib/channel-readiness.mjs`.

## Requirements (EARS)

Readiness module (`studio/lib/channel-readiness.mjs`)
- R1: THE MODULE SHALL return `{ ready, done, total: 7, items }`, one item per checklist row, in checklist order. Each item has a short label, `ok`, plain fix text naming the panel place, and where it opens.
- R2: IF the entry is missing, not an object, has no slug, or anything inside throws, THE MODULE SHALL answer "not ready" (fail closed). It never throws.
- R3–R9: WHEN an item's data (table above) is missing or invalid, THAT ITEM SHALL be not done and its fix SHALL name exactly what is missing.
- R10: WHEN the registry or cadence file is unreadable, or the slug is unknown, `readinessFor` SHALL answer "not ready".
- R11: THE ENGINE LOG LINE SHALL name the channel, the score and every missing item.
- R12: THE MODULE SHALL have no imports and no channel names.

Engine gate
- G1: WHEN the discover step runs, `toDiscoverChannels` SHALL drop every switched-on channel that is not 7/7 and log one line saying what is missing. Paused, inactive and keyless channels drop quietly, as before.
- G1b: IF the cadence file is unreadable, THE DISCOVER STEP SHALL treat no channel as ready.
- G2: THE DISCOVER SCRIPT in `channel-autopilot.yml` SHALL read `yt-mcp/cadence.json` and pass it in. This covers the heartbeat, the scheduled tick, a manual dispatch for one channel, Studio run buttons, review resumes and sweeper heal dispatches.
- G3: `engineReadiness` (`lib/readiness-gate.mjs`) SHALL read the two engine files and fail closed.
- G4: WHEN `channel-pipeline.mjs` starts for a not-ready channel, IT SHALL log the readiness line and exit 0 before any key, job, quota or network work.
- G5: `sweeper.mjs` SHALL never heal a not-ready channel, neither by dispatch nor by the in-process `yt-daily` top-up.
- G6: `longvideo/longform-upload.mjs`, the manual uploader, SHALL skip a not-ready channel.

Panel writes
- W1–W2: `setChannelKitFields` SHALL patch the Neon kit, re-read the engine file fresh, and change ONLY the target entry. A failed repo read writes nothing.
- W3: WHEN a template is assigned or unassigned, THE ROUTE SHALL mirror `kit.templateId`, `templateVersion` and `templateMajor` (nulls clear them). A mirror failure SHALL come back as a plain warning and never undo the saved assignment.
- W4: WHEN the owner picks a story shape, THE PANEL SHALL save `kit.storyShape` with a matching `kit.hasChapters`. "Template default" saves `storyShape: 'template'` and `hasChapters: null`. An untouched channel shows nothing picked. The engine still reads `hasChapters` only.

Panel reads and locks
- P1: THE SCHEDULE DRAWER SHALL edit the Shorts go-public times (1–6) and the long-video go-public time. The owner picks them in local time, and UTC is shown beside each one.
- P1b: THE DRAWER SHALL send only changed times. IF a sent time is blank or invalid, IT SHALL be refused before anything is written.
- P2: THE SAVED TIMES SHALL reach the engine: `kit.longSlot` via `registryToKit` → `mergeBrand`, and Shorts times on the top level and in the kit.
- P3: `GET /api/channels/readiness` SHALL answer from the same two files. A client SHALL see only their own channels. A failed read SHALL return 502.
- P4: WHEN Resume (flow `on: true`) is asked for a not-ready channel, THE FLOW ROUTE SHALL answer 409 with the missing items. IF readiness can't be read, IT SHALL answer 503. Pausing SHALL never be checked.
- P4b: WHEN "Save & start" is pressed on a not-ready channel, THE PROFILE ROUTE SHALL save the settings, leave the autopilot as it was, and return `autopilotBlocked`.
- P5: THE CHANNEL CARDS SHALL show "Ready N/7". THE CHANNEL PAGE and THE OVERVIEW DRAWER SHALL show the checklist. Fixes open the drawer or Edit profile. Resume SHALL be locked on the page. On the card, Resume SHALL open the checklist. Bulk resume SHALL name not-ready channels.

Pre-fill (`scripts/prefill-kit-from-brands.mjs`)
- F1: THE SCRIPT SHALL copy voice, description and tags that the engine already uses into empty kit fields only. A channel without a static brand kit gets nothing.
- F2: THE SCRIPT SHALL treat channels with autopilot ON and active as running. Running channels get `storyShape: 'template'` and their active Neon template mirrored. Other channels get neither.
- F3: `--apply` SHALL abort before any write if a running channel has no Neon template. A value already in the Neon kit wins over the static file.
- F4: THE DRY RUN SHALL be the default and SHALL write nothing.

## QA rows

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | R1–R12 | module behaviour + purity | automated | `node --test tests/channel-readiness.test.mjs` |
| 2 | G1–G6 | discover filter + log, fail closed, workflow script run, pipeline run exits 0, sweeper + uploader pins | automated | `node --test tests/readiness-gate.test.mjs` |
| 3 | G1 | old discovery tests on ready fixtures | automated | `node --test tests/autopilot-discovery.test.mjs tests/schedule-slot.test.mjs` |
| 4 | W1–W4 | kit patch, writer shape, assign mirror, story shape | automated | `node --test tests/readiness-registry-writes.test.mjs` |
| 5 | P1–P6 | publish times, engine read, readiness API, 409, Save & start, panel pins | automated | `node --test tests/readiness-panel.test.mjs` |
| 6 | F1–F4 | plan, apply with fakes, real dry run | automated | `node --test tests/prefill-kit.test.mjs` |
| 7 | F4 | dry-run table | manual | `node scripts/prefill-kit-from-brands.mjs` |
| 8 | F2–F3 | lead runs `--apply` after review, then commits `yt-mcp/studio-channels.json` with the code | manual | see the script header |
| 9 | G1 | After deploy, open a heartbeat run's discover log. Each switched-on, not-ready channel prints `[readiness] <slug>: NOT READY …`. Money Rulebook is still selected in its slot. | manual | GitHub Actions log |
| 10 | P4 | Channels › a paused, not-ready channel › Manage › "Resume autopilot — not ready". The checklist opens and nothing resumes. | manual | prod |
| 11 | P5 | Open a channel. "Ready to publish: N/7" appears, and each ✗ fix opens the right drawer or Edit profile. | manual | prod |
| 12 | P1 | Schedule drawer › change "Long videos go public at" › Save. Reload: the new time shows, and `kit.longSlot` changed in the engine file. | manual | prod + `git log -p yt-mcp/studio-channels.json` |

## Order of rollout (important)

After this code is pushed, the next heartbeat drops every channel that is not
7/7. Money Rulebook is 3/7 in the engine file today (no voice, description,
tags, story shape or template in the kit). The lead must therefore run
`node scripts/prefill-kit-from-brands.mjs --apply` (needs DATABASE_URL) BEFORE
or right with the push. The resulting `yt-mcp/studio-channels.json` change is
committed in the same push, so Money Rulebook keeps running.

## Plain-English QA

1. Open Channels. Every card shows "Ready" with a number out of 7.
2. Open a channel. A list shows the 7 things it needs, with a tick or a cross.
   Each cross says what to do. Clicking it opens the right place.
3. Try to resume a channel that isn't 7/7. It won't start; it shows you the list.
4. Fill in the missing things. The number goes up, and at 7/7 Resume works.
5. In Schedule, set "Shorts go public at" and "Long videos go public at" in your
   own time. The UTC time shows next to each one. Save, reload, and the times
   are still there.
6. In Templates, pick a story shape. Even "Template default" now counts as a
   choice. A channel where nobody picked shows nothing selected.
7. Money Rulebook keeps posting as before. The other channels stay paused until
   you finish their lists.
