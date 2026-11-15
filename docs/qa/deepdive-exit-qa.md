# Spec + QA — yt-deepdive exits deterministically after shipping (2026-11-15)

Source: research/deep-audit-2026-11-13.md, improvement #6 (pipeline-01).
`yt-deepdive.mjs` ended with `await renderAndShipEpisode(...)` and no exit;
the shared postgres pool in `studio/lib/db.mjs` had no `idle_timeout`.
Any DB query left a pooled connection that kept Node alive indefinitely.
Run 43342205832 uploaded at 01:32, idled until channel-pipeline's 45-minute
kill, and the job was recorded "Episode failed" for a successful upload.

Reproduced locally before the fix: one `select 1` through `db.mjs`, then
the process never exited (killed by `timeout 45`, exit 124).

## Requirements (EARS)

- R1: THE SHARED POOL SHALL close idle connections (`idle_timeout: 20`).
- R2: `closeDb()` SHALL end the pool gracefully, never throw, and be safe to
  call twice.
- R3: `shipExitCode` SHALL map `{ok}` / `{claimed}` / `{skipped}` to 0 and
  anything else to 1 (failures already throw → Node exits 1).
- R4: WHEN renderAndShipEpisode resolves, yt-deepdive SHALL close the pool
  and call `process.exit(shipExitCode(result))`.

## QA rows

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | R1 | db.mjs passes `idle_timeout` | automated | `node --test tests/deepdive-exit.test.mjs` |
| 2 | R2 | closeDb twice, no throw | automated | same |
| 3 | R3 | every outcome shape → exit code | automated | same |
| 4 | R4 | yt-deepdive tail: capture → closeDb → process.exit(shipExitCode) | automated | same (source pin; the script runs at import) |
| 5 | R1/R2 | real Neon: one query then `closeDb()` → exit 0 in 4s; no close → exit 0 in 23s (idle_timeout backstop); before the fix → hung (killed at 45s) | automated | scratch repro script against live DATABASE_URL |
| 6 | R4 | next money-rulebook doc that ships: the yt-deepdive step ends within seconds of the upload line and the job is recorded succeeded | manual | autopilot run log |

## Regression

- Full root suite green; Studio routes keep working with the idle timeout
  (postgres.js reconnects transparently).
