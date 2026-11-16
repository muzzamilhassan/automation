# Spec + QA — B2a: no false "cited sources" claims (2026-11-16)

Owner chose option B; audit cg-01. Finance/science templates declare
disclaimers such as "Market commentary from cited sources; not financial
advice." (`studio/lib/template-registry.data.js`), but the doc generator
saves `sources: []` (yt-deepdive.mjs, "sources added at review time" — the
review desk can show sources but has no way to add them). Every upload
therefore claimed sources that did not exist.

## Requirements (EARS)

- R1: WHEN a video has no recorded sources, THE UPLOAD DESCRIPTION SHALL NOT
  claim "cited sources"; the claim is rewritten to "for general education —
  figures are illustrative, verify before acting", keeping the rest
  (e.g. "not financial advice") verbatim.
- R2: WHEN a video has sources, the declared disclaimers SHALL stay verbatim
  and a "Sources:" list (title — URL) SHALL follow them.
- R3: No declared disclaimers → description unchanged (byte-identical).
- R4: The save-time gate (stored `disclaimer_block` covers the declared texts
  verbatim) is unaffected — the rewrite happens only at upload.

## QA rows

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | R1 | honestDisclaimer rewrites the 3 declared variants; other text untouched | automated | `node --test tests/honest-disclaimers.test.mjs` |
| 2 | R1/R2 | appendDisclaimers with / without sources | automated | same |
| 3 | R3 | null / [] disclaimers → unchanged | automated | same |
| 4 | R4 | existing review-seams save-gate tests still pass | automated | full suite (1289/1289) |
| 5 | R1 | next money-rulebook upload description reads "for general education …" | manual | YouTube Studio |

## Next (B2b — needs owner approval of a design)
Real sources: the generator proposes a source per figure, an automatic check
verifies each (reachable, reputable domain, the figure appears on the page),
verified sources are stored and listed; the review desk gains "add source".
