# Spec — `market-files` P3: the data layer (2026-11-10)

Source: research/paper-billions-cartoon-market-lane-2026-11-10.md P3. Owner
approved ("start p3"). P2 proved the brain writes styled scripts from an
operator-supplied fact sheet. P3 removes the hand-writing: a market event
(date + symbols) becomes a REAL fact sheet automatically, from free data —
no API key, no cost (Yahoo Finance chart API, verified live 2026-11-10 in
the research phase).

FRED (macro series) stays out: it needs a free owner key — a later
add-on when an episode needs macro numbers.

## EARS requirements

- R1: MARKET DATA SHALL come from the free Yahoo Finance chart endpoint
  (query1.finance.yahoo.com/v8/finance/chart) with no API key; a failed
  fetch SHALL fail the run loudly (non-zero exit) — the pipeline never
  stages a fact sheet built from partial data.
- R2: extractFacts(charts, eventDate) SHALL derive, PER SYMBOL, from the
  chart payload only: the event-day close, the previous trading close, the
  event-day % change, the open, and the drawdown from the trailing-window
  high (the correction context). For the event day an intraday series
  SHALL also yield milestone facts (open → H:MM ET moves) for the
  minute-by-minute timeline beat.
- R3: factSheet(...) SHALL compose the fact-sheet text ONLY from the
  computed values (the composer formats numbers; it cannot invent them).
- R4: seriesOf SHALL emit chart-ready series ({symbol, points:
  [{t, close}]}) — P4's chart beats render from these, so the on-screen
  numbers are the real ones.
- R5: THE runner SHALL accept --event YYYY-MM-DD + --symbols and stage
  facts-<event>.txt + market-data-<event>.json next to the scripts; the
  script brain remains the only consumer of the fact sheet (isolation).
- R6: THE MATH SHALL be unit-tested against a FIXED chart fixture — no
  network in tests. The live fetch is exercised once as E2E evidence.
