# Spec + QA — External heartbeat for channel-autopilot (cron-job.org) (2026-11-15)

Source: research/deep-audit-2026-11-13.md item #10; owner chose
cron-job.org 2026-11-15. GitHub's `5,35 * * * *` heartbeat fires 3–5 of 48
ticks a day; channels miss slots and doc days (investors-compass: 18 days
without an upload). An external clock dispatches the workflow instead;
GitHub's own cron stays as a backup.

## Hazard found before wiring

A `workflow_dispatch` with no `channel` input selects **all channels**
(`chans = all`) — a clock calling it blank every 30 minutes would start every
channel 48×/day. The clock must send `inputs.heartbeat = "1"`.

## Requirements (EARS)

- R1: WHEN dispatched with `heartbeat=1` and no `channel`, THE DISCOVER STEP
  SHALL select exactly what a scheduled tick selects at that instant
  (`selectChannelsDueOrMissed`).
- R2: A blank manual dispatch SHALL still select all channels; `channel=<slug>`
  SHALL still win over `heartbeat`.
- R3: Duplicate ticks (external + GitHub backup in the same slot) SHALL NOT
  double-produce: per-channel concurrency queues the second run and the
  pipeline's produced-today guards + upload-intent mutex make it a no-op.

## cron-job.org job (owner sets up)

- URL: `https://api.github.com/repos/muzzamilhassan/automation/actions/workflows/channel-autopilot.yml/dispatches`
- Method: POST · Schedule: every hour at minutes 5 and 35 (UTC)
- Headers: `Authorization: Bearer <fine-grained token>`, `Accept: application/vnd.github+json`, `Content-Type: application/json`, `X-GitHub-Api-Version: 2022-11-28`
- Body: `{"ref":"main","inputs":{"heartbeat":"1"}}`
- Expected response: HTTP 204
- Token: fine-grained PAT, resource owner muzzamilhassan, only this repo,
  permission Actions: Read and write (nothing else)

## QA rows

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | R1 | the REAL discover script (extracted from the YAML) with heartbeat=1 returns the same channels as a schedule tick and as `selectChannelsDueOrMissed`, and fewer than all | automated | `node --test tests/autopilot-discovery.test.mjs` |
| 2 | R2 | blank dispatch → all; channel wins over heartbeat | automated | same |
| 3 | R1 | `heartbeat` input declared and wired into the discover env | automated | same |
| 4 | R1 | live: dispatch with heartbeat=1 outside every slot → discover selects only due channels; produce skipped when none | automated | `gh workflow run channel-autopilot.yml -f heartbeat=1` + run log |
| 5 | R1 | after owner setup: cron-job.org history shows 204s every :05/:35 and channel-autopilot gets a workflow_dispatch run per tick | manual | cron-job.org history + `gh run list` |
| 6 | R3 | each live channel produces once per day at its slot for 3 days; no duplicate uploads | manual | job rows + YouTube Studio |

## Regression

- Full root suite green (1187/1187); existing slot-gate and review-gate pins unchanged.
