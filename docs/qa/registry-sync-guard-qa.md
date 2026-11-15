# Spec + QA — Registry DB → repo sync guard (2026-11-15)

Source: research/deep-audit-2026-11-13.md, improvement #8 (scale-config-04,
data-12). `upsertChannel` (every Studio connect / profile save / importer
write) re-wrote the engine feed `yt-mcp/studio-channels.json` from
`rowToEntry` projections of every Neon row. Those projections carry no
top-level `cron`, recompute `active` from token columns, set
`tokenSecretSaved` from `token_secret`, and include `tokenEnc`.

Verified read-only on live Neon before coding (2026-11-15): 13 rows, none
with `token_secret` or `token_enc`, none with `kit.gateCron`. The repo feed
holds the 4 live channels, all active with crons. One sync would therefore
have written 13 entries with `active: false`, `tokenSecretSaved: false` and
no cron — `lib/registry-slugs.mjs` and `lib/schedule-slot.mjs` would have
dropped **all four live channels** from production. (The audit expected the
opposite symptom — 9 parked rows re-activated; the live data makes it worse.)

## Requirements (EARS)

- R1: WHEN a channel is written, THE SYNC SHALL change only that channel's
  entry in the repo feed; every other entry stays byte-identical and no other
  Neon rows are added.
- R2: FOR an existing entry, THE SYNC SHALL keep the repo's `cron` (else
  `kit.gateCron`), `active` and `tokenSecretSaved`, while DB-edited fields land.
- R3: THE SYNC SHALL never write `tokenEnc` to the repo.
- R4: WHEN the DB marks the channel parked/paused, THE SYNC SHALL set
  `active: false`; a sync SHALL never flip a repo-parked channel back on.
- R5: A brand-new channel (absent from the repo) SHALL be added from its DB
  projection (minus `tokenEnc`), sorted by slug.

## QA rows

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | R1 | other entries identical; feed length unchanged | automated | `node --test tests/channels-registry.test.mjs` |
| 2 | R2 | MR keeps cron/active/tokenSecretSaved; niche edit lands | automated | same |
| 3 | R3 | no `tokenEnc` key on existing or new entries | automated | same |
| 4 | R4 | DB parked → false; repo-parked + DB active → stays false | automated | same |
| 5 | R2 | no repo cron → `kit.gateCron` used | automated | same |
| 6 | R5 | new slug added and sorted | automated | same |
| 7 | R1 | upsertChannel passes only `entry.slug` through `mergeRegistrySync` | automated | same (source pin) |
| 8 | R1–R3 | after the next real Studio profile save, the commit to `yt-mcp/studio-channels.json` touches only that channel's entry and the 4 live channels keep `active: true` + `cron` | manual | `git show` on that commit |

## Not in scope (later roadmap)

- Making Neon the single registry writer and backfilling `kit.gateCron`
  (audit "Later": single writer + versioned migrations).

## Regression

- Full root suite green.
