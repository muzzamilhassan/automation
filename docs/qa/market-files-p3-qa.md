# Spec + QA — `market-files` P3: the data layer (2026-11-10)

Source: docs/superpowers/specs/2026-11-10-market-files-p3-data-layer-spec.md.
Plain English: you tell the bot "the crash was on this day, these are the
symbols" and it fetches the real market numbers itself and writes the fact
sheet the writer-bot eats. No hand-writing, no API key, no cost — and the
pipeline refuses to run on partial data (a fact sheet with holes is worse
than no fact sheet).

## Requirements (EARS)

- R1: Yahoo chart endpoint, no key; failed fetches fail the run loudly.
- R2: per-symbol derived facts (event close, prev close, % change, open,
  drawdown from window high) + event-day intraday milestones.
- R3: the fact-sheet composer formats computed numbers only.
- R4: chart-ready series for P4.
- R5: runner stages facts-<event>.txt + market-data-<event>.json.
- R6: math unit-tested from a fixed fixture; network exercised once, live.

## QA rows

| # | Req | Check | Type | Result |
|---|---|---|---|---|
| 1 | R2 math | fixture chart → exact prevClose/close/%chg/open/drawdown per symbol; null closes skipped; event date bar found across a weekend-shifted window | A | PASS — tests/market-data.test.mjs 8/8: R2a exact math (−4.7% / −12.3% on the fixture), R2b null bars skipped (prev close = last REAL close), R2c missing event bar → no row (loud absence) |
| 2 | R2 intraday | fixture intraday series → milestone facts (open, H:MM ET, % from open) | A | PASS — R2d: open anchor = 0%, ET clock labels; R2e: the two-day fetch spill is filtered to the event day AND the arc caps at 6 (open + 4 biggest moves + last) — a live bug the fixture caught (the first real sheet carried Nov 6 bars) |
| 3 | R3 composer | fact sheet text contains ONLY derived numbers (assert the exact expected lines from the fixture) | A | PASS — R3 asserts close/prevClose/% lines verbatim from the fixture and asserts an ABSENT number never appears; live sheet shows Yahoo float junk rounded to cents (7353.73, not 7353.7299…) |
| 4 | R4 series | seriesOf shape {symbol, points[{t, close}]} from the fixture; nulls dropped | A | PASS — R4 exact point shape + null drop |
| 5 | R1 loud failure | a symbol fetch that returns no chart result → runner exits non-zero, nothing staged (code pin + live probe) | A | PASS — scripts/market-bot.mjs auto-facts block: any fetchChart throw → "refusing to stage a fact sheet from partial data" → exit 1; fetchChart itself throws on HTTP ≠ 200 AND on empty/missing chart.result |
| 6 | R5 staging | --event/--symbols path writes facts-<event>.txt + market-data-<event>.json before drafting | A | PASS — live run staged content/market-scripts/facts-2026-11-05.txt + market-data-2026-11-05.json (4 symbol rows incl. the series for P4 chart beats); the staged script's meta carries data_file |
| 7 | E2E live | the Nov 5 2026 crash fact sheet built automatically; numbers cross-checked against the hand-written P2 sheet | E2E | PASS — ONE command (--event 2026-11-05 --symbols "^GSPC,^DJI,^IXIC,NVDA") produced the real sheet: S&P −4.4% (7353.73 from 7688.62), Dow −3.4%, Nasdaq −5.5% (in correction, −11.9% from high), NVDA −9.3% (181.60, −24.1% from high) — every figure agrees with the hand-written P2 sheet's reported numbers (">4%", "5.5%", "more than 9%"). Full chain then drafted live: 25-beat script staged (attempts 2) whose numbers ARE these values |

## Gate catches during the live runs (2026-11-10) — the system working as designed

1. A live draft shipped a stat beat WITHOUT its big board number → the Node
   gate dropped it (R3 loud) and the shape gate now catches it pre-Node
   (script_graph shape_node fix) so repair fixes it.
2. A live draft shipped with the hero buried mid-list and the end card
   early → shaper now deterministically REORDERS (hero to front, ONE end to
   the close — dedupe extra end beats; normalization, never authoring; new
   pytest test_shape_script_reorders_hero_and_signs_off… covers it).
3. After both fixes: the full chain staged cleanly (25 beats, attempts 2).

Sidecar suite after P3: 110 passed / 3 skipped (the 3 = the pre-existing
fleet-reopen channels tests, untouched). Node market suites: 21/21.
