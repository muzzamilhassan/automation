# Spec + QA — Clip-feed run identity + ship-only staging (2026-11-15)

Source: research/deep-audit-2026-11-13.md item #9 (pipeline-02, pipeline-06).

## Findings (evidence)

- The doc-day feed runs `shorts-clips ensure-queue --local` inside the SAME CI
  run that uploads `lf-<slug>`, but recorded `docRunId = 'local-<ts>'`. The
  self-feed matches docs by GitHub run id, so a fed doc stayed "unclipped":
  every channel's newest doc artifact was eligible to be clipped a second
  time once its queue ran dry (all 14 recent feeds across the 4 channels were
  `local-*`; artifacts are kept 30 days).
- The self-feed scanned `runs?status=success&per_page=14`. With the external
  30-min heartbeat (48 runs/day) that window is ~7 hours — new docs would no
  longer be found at all.
- Phase 6 staged `demos/deepdive-<slug>/episode.mp4` whenever the file existed —
  a render whose upload failed, or a recovered claim (whose local render
  "belongs to no video"), could become Shorts for a doc not on YouTube.

## Requirements (EARS)

- R1: WHEN the doc-day feed runs in CI, THE QUEUE SHALL record the CI run id
  (`GITHUB_RUN_ID`); `local-<ts>` only off CI.
- R2: THE SELF-FEED SHALL find docs by artifact name
  (`actions/artifacts?name=lf-<slug>`), taking the newest unexpired one not yet
  clipped and never re-clipping one in `doneRuns`/`lastRunId`.
- R3: THE PIPELINE SHALL stage a doc for clips only WHEN this run shipped it
  (new, non-recovered `deepdiveVideo.videoId`, `deepdiveDate === today`).
- R4: Existing `local-*` feeds SHALL be mapped to their CI run ids in
  `doneRuns` (one-off backfill); `lastRunId` unchanged (the queued clips'
  Release tag `clips-<slug>-<lastRunId>` depends on it).

## Backfill (applied 2026-11-15, unique match = artifact created ≤45 min after the feed)

| channel | local feeds → CI runs added to doneRuns | newest doc run now marked clipped |
|---|---|---|
| money-rulebook | 6 → 41505187024 … 43365094869 | 43365094869 ✓ |
| quotequarry | 3 → 40656308022, 41184319023, 43537225788 | 43537225788 ✓ |
| investors-compass | 2 → 40660835260, 43724498853 | 43724498853 ✓ |
| debt-free-doctrine | 3 → 41041309840, 41222720885, 43342205832 | 43342205832 ✓ |

## QA rows

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | R1 | `localFeedRunId` uses GITHUB_RUN_ID, else local-<ts> | automated | `node --test tests/clips-archive.test.mjs` |
| 2 | R2 | `pickDocRun`: newest unclipped; done/last → null; expired skipped; empty → null | automated | same |
| 3 | R1/R2 | regression: a CI-fed doc is never re-clipped | automated | same |
| 4 | R2 | wiring: by-name artifact lookup; the 14-run scan is gone | automated | same (source pin) |
| 5 | R3 | `docShippedThisRun`: new id ✓; same id ✗; recovered ✗; not today ✗; no id ✗ | automated | `node --test tests/doc-days.test.mjs` |
| 6 | R4 | dry run mapped all 14 local feeds uniquely; applied; each newest doc run marked clipped | automated | one-off script (scratch) |
| 7 | R1/R2 | next doc-day feed records a numeric run id; next empty-queue self-feed logs "nothing new to clip (run … already clipped)" or clips a genuinely new doc | manual | autopilot logs |

## Regression

- Full root suite green (1199/1199).
