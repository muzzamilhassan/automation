# Spec + QA — Creator City Phase 1: show what the factory is doing (2026-11-23)

Source: FEEDBACK.md item O. Research: `research/creator-city-agent-factory-2026-11-23.md`.
Owner decisions 2026-11-23: Phase 1 approved; dots only (no factory drawing); Calendar is its own menu item under Inbox; "Ask the factory" comes later (Phase 3). The owner also asked for parallel builders, self-review, and shipping without per-step approval.

## The 7 stations (one vocabulary: `studio/lib/stations.mjs`)
Topic · Script · You approve · Voice · Render · Thumbnail · Upload.
States: Done · Running · Needs you · Failed · Not yet · Skipped · Not tracked.

## Requirements (EARS)

Pipeline recording (`lib/station-recorder.mjs`, `yt-daily.mjs`, `channel-pipeline.mjs`)
- P1: WHEN a station starts or ends in a run, THE PIPELINE SHALL upsert the Neon `job_steps` row `station:<key>` (idx 50–56) with its status.
- P2: IF recording fails or the job store is off, THE PIPELINE SHALL carry on unchanged. Recording never throws and never changes exit codes.
- P3: WHEN a job is created in GitHub Actions, THE PIPELINE SHALL store `meta.runId = GITHUB_RUN_ID`.
- P4: IF the script is held for review, THE approval station SHALL be `skipped` with an error starting `held:`. IF the channel has no gate, it SHALL be `skipped` with `auto:`.
- P5: Failure messages SHALL be one short line with no secrets.

Station data (`studio/lib/station-read.mjs`, `/api/stations`, `/api/runs/steps`)
- S1: THE API SHALL return 7 stations per real channel for its latest job in the last 24 h.
- S2: WHEN a new job starts, states from older jobs SHALL NOT carry over (the "stale completed" lesson).
- S3: WHILE a script waits for approval, Approval SHALL be "Needs you".
- S4: Upload SHALL follow `upload_intents` (uploaded → Done, uploading → Running, failed/abandoned → Failed).
- S5: IF a finished job has no station rows (older than tracking), the stations SHALL be "Not tracked". There is never fake data.
- S6: IF the database is down, `/api/stations` SHALL answer 503 `{ok:false}`. `/api/runs/steps` SHALL answer `{ok:false, reason:'no_job'}` for runs with nothing recorded.

Today dots (`StationDots`, `app/page.js`)
- T1: Each channel row SHALL show 7 dots and one summary line. Today keeps exactly its 3 sections.
- T2: Failures SHALL NOT add banners or badges. Alerts stay only in the bell and Inbox.
- T3: IF `/api/stations` fails or is forbidden, the dots SHALL simply not show.
- T4: Clicking the dots SHALL open the run step drawer.
- T5: The row SHALL fit a 375 px phone with no sideways scroll.

Run step drawer (`RunStepsDrawer`, `app/runs/page.js`)
- R1: Clicking a run SHALL open a drawer with the big dots, the summary, and every step with its status word, duration and short error.
- R2: The drawer SHALL include a "Raw log ↗" link. An old run SHALL show a friendly "Step details start with runs after 23 Nov" message.
- R3: The drawer SHALL scroll inside itself on desktop and phone.

Calendar (`/calendar`, `/api/calendar`, `calendar-view.mjs`)
- C1: The menu SHALL show Calendar directly under Inbox (owner and staff).
- C2: THE calendar SHALL show real channels only, with ✓ published, ⏰ scheduled, 📝 waiting and ░ free slots, in the browser's timezone.
- C3: A free slot SHALL NOT show where a real item fills that channel's slot.
- C4: IF one source fails, the rest SHALL still show with a "partial" note. There is never invented data.
- C5: Clicking a day SHALL open a drawer listing that day's items with Watch ↗ or Review links. Phones default to the List view.

Accounts (`Settings › Accounts`, `/api/accounts`, `accounts-health.mjs`)
- A1: Each real channel's YouTube login SHALL show Connected, Needs re-login, Not connected, or Can't check.
- A2: An open `token_revoked` alert or a live auth error SHALL mean Needs re-login, with a Reconnect button that uses the existing OAuth flow.
- A3: Facebook/Instagram SHALL be checked live and without swallowing errors. Threads shows Can't check when it can't be read.
- A4: Responses SHALL never contain tokens or raw error bodies. Each check has a deadline (Facebook and Threads about 5 s; YouTube 12 s, because Google needs one sign-in refresh per channel in turn) and becomes "Can't check" when it runs out.
- A5: `/api/accounts` SHALL be owner-only.

## QA checklist (plain English)

| # | Check | How | Type |
|---|---|---|---|
| 1 | Unit tests pass | `node --test` on station-recorder, station-read, station-dots-view, calendar-view, accounts-health, nav-ia, fail-closed-routes, breadcrumbs | automated |
| 2 | Studio builds | `cd studio && npx next build` | automated |
| 3 | Pipeline is unchanged when the DB is off | recorder test: throwing client → no throw | automated |
| 4 | Today still has 3 sections and dots appear | prod, desktop + 375 px: count sections, dots on each row, 0 px overflow | visual |
| 5 | Dots open the drawer, and it scrolls | prod: click dots → drawer → scroll | manual |
| 6 | Runs row opens the step drawer; an old run shows the friendly note | prod | manual |
| 7 | Calendar is under Inbox, month shows real items, a day opens the drawer, phone defaults to List | prod desktop + phone | visual |
| 8 | Accounts tab lists each real channel with a status; no secrets in `/api/accounts` JSON | prod + inspect JSON for `token`/`secret` | manual |
| 9 | After the next real Money Rulebook run, its dots show real station states | prod, next autopilot run (or a dispatch) | manual |

Regression: nav order test, breadcrumbs, drawer history, fail-closed routes, Runs filters, Settings' other tabs.
