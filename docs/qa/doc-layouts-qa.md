# Spec + QA — P1: six new DocV2 slide layouts (2026-11-05)

Source: research/fifteen-distinct-templates-2026-11-05.md P1 — the layout axis
of template differentiation. Six self-contained slide compositions added to
the DocV2 dispatcher; beats carry `layout` per beat, so template DATA can
compose visibly different episodes from one maintained engine.

## The six layouts (all theme-styled, safe-zone compliant, default-inert)

| layout | Beat fields used | Composition |
|---|---|---|
| `quote` | headline (quote), sub (attribution) | full-bleed serif quote, ghost quotation mark, spring reveal |
| `process` | steps[] (strings), headline? | numbered step chain, steps appear sequentially |
| `versus` | leftTitle, leftPoints[], rightTitle, rightPoints[] | two columns + VS divider |
| `timeline` | ticks[] ({year, label}), headline? | horizontal era rail, year ticks step in |
| `map` | from, to, headline? | stylized dotted-route card between two point labels |
| `terminal` | lines[] (strings) | dark console window, lines type in on 2s |

## Requirements (EARS)

- R1: WHEN a beat's `layout` names one of the six, THE ENGINE SHALL render
  that composition inside the same Content/theme/safe-zone contract as the
  built-in layouts.
- R2: WHEN a beat uses a built-in layout (or an unknown name), rendering
  SHALL be byte-identical to today (default-inert — the dispatcher only
  ADDS branches).
- R3: WHEN story DATA declares `doc_layouts` (array of layout names), THE
  BEAT BUILDER SHALL rotate the sentence slides through that cycle
  (photo-carrying `split` stays available inside the cycle); absent =
  every sentence slide is a plain split, byte-identical.
- R4: THE NEW LAYOUTS SHALL never enter the top (0–110) or bottom (900+)
  furniture bands.

## QA rows

| # | Req | Check | Type | Result |
|---|---|---|---|---|
| 1 | R1 dispatcher | all six names resolve in DocV2's beat dispatch | A | **PASS** (dispatcher branches added; V2Beat union widened) |
| 2 | R2 default-inert | built-in dispatch branches untouched (source pins) | A | **PASS** |
| 3 | R3 builder cycle | doc_layouts rotates sentence slides; absent = all splits | A | **PASS** (+ docPresentation seam: theme/docLayouts ride through — a step-3 gap found and fixed: theme never reached the lane before) |
| 4 | R4 safe zones | layouts use the Content/top-band contract (source pins) | A | **PASS** |
| 5 | visual | still-render proof: terminal (science) + versus (wisdom) | V | **PASS** — both frames rendered clean |
| 6 | regressions | full suite green | A | **PASS** — 1081/1084 (3 pre-existing network flakes) |
