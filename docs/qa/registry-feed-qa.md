# Spec + QA — C1a: engine feed + cadence in Neon, shadow week (2026-11-16)

Design: docs/superpowers/specs/2026-11-16-neon-single-source-of-truth-design.md §C1.
Owner decisions: approach yes; the committed files win when seeding; 1-week
shadow before switching.

Before seeding, Neon had drifted from production: debt-free-doctrine labelled
"OLD MONEY CODE" with slot 00:35 (production 21:20), no gate crons for any of
the 4, 9 parked brands marked active. The seed copies the committed files.

## Requirements (EARS)

- R1: `channels.feed_entry` (jsonb) SHALL hold exactly the engine-feed object
  of each channel in `yt-mcp/studio-channels.json`; NULL = not in the feed.
  `channels.cadence` (jsonb) SHALL hold its `yt-mcp/cadence.json` entry.
- R2: `export-registry --seed` SHALL dry-run by default and, with `--apply`,
  copy the committed files into Neon (files win); a feed slug without a
  channels row SHALL be reported, never created.
- R3: `export-registry --check` SHALL rebuild both files from Neon and compare
  them as data (key/channel order ignored), print the differences, record
  the result in `registry_shadow_checks` with `--record`, and always exit 0.
- R4: WHILE in the shadow week, every Studio write of the feed or cadence
  file SHALL be mirrored into Neon (best-effort; the repo file stays the truth).
- R5: EVERY produce run SHALL record a shadow check before the pipeline,
  without the possibility of failing the run.
- R6: C1b (switch) SHALL NOT start until the shadow checks stay OK for a week.

## QA rows

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | R1/R3 | canonicalJson, buildFeed (feed-only, sorted), buildCadence, diffFeeds/diffCadence (order-insensitive, names field, missing/extra) | automated | `node --test tests/registry-feed.test.mjs` |
| 2 | R2 | seedPlan (files win, others cleared, missing rows reported); applySeed adds columns idempotently | automated | same |
| 3 | R3 | recordShadowCheck creates the table and inserts run/ok/diff | automated | same |
| 4 | R4 | one mirror per feed write (+ both writeRegistry paths); cadence mirrored after its write | automated | same (source pin) |
| 5 | R5 | autopilot produce step: after npm install, before the pipeline, continue-on-error, `--check --record` | automated | same (YAML pin) |
| 6 | R1/R2 | live: before seed → 8 diffs (4 feed + 4 cadence missing); `--seed --apply` → 13 rows; `--check --record` → OK | automated | local run 2026-11-16 |
| 7 | R6 | `SELECT ok, count(*) FROM registry_shadow_checks GROUP BY ok` over 7 days shows only OK (or every diff explained) | manual | after a week |

## Note for the owner
During the shadow week, edit channel settings in the Studio, not by hand in
the JSON files — hand edits are still allowed (the repo file is the truth) but
show up as a diff; `node scripts/export-registry.mjs --seed --apply` resyncs.
From C1b on, hand edits to those files will be ignored.
