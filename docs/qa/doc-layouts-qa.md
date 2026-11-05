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

## P2 — motion grammar (2026-11-05)

- R5: THEMES MAY declare `motion: { kind, step }` — spring (default math) /
  stepped (quantized "on Ns") / typewriter (hard ticker). Absent = the
  original spring byte-identically.
- R6: ENTRANCES SHALL read the profile through useMotion; the fallback math
  IS the original spring line (pinned).

| # | Req | Check | Type | Result |
|---|---|---|---|---|
| 7 | R5 profiles | history=typewriter-3, wisdom=stepped-4, science=stepped-2, vox untouched | A | **PASS** (source pins) |
| 8 | R6 fallback | useMotion's no-profile branch IS the original spring line | A | **PASS** (source pin) |
| 9 | live path | stepped render executes (wisdom versus slide at a quantized frame) | V | **PASS** — still render succeeded through the quantized path |
| 10 | regressions | full suite | A | **PASS** — 1083/1086 (3 pre-existing network flakes) |

## P4 — per-template voice + music mood (2026-11-05)

- R7: doc_presentation MAY declare `voice` (Edge-shaped, validated by
  edgeVoiceFor) and `music_mood` (a feel substring). Template wins, channel
  kit falls back, invalid voices fall to Andrew. Absent = today's behavior.
- R8: pickApprovedTrack(titles, mood) prefers tracks whose feel matches the
  mood (substring); no match = the full approved pool (fail-open).

| # | Req | Check | Type | Result |
|---|---|---|---|---|
| 11 | R7 passthrough | docPresentation carries voice/musicMood; absent = undefined | A | **PASS** |
| 12 | R7 precedence | yt-deepdive uses pres.voice || b.voice (SOURCE PIN, SB-7 updated) | A | **PASS** |
| 13 | R8 mood | preferMood filters by feel substring, fail-open (pure pins) | A | **PASS** |
| 14 | DATA | history=en-GB-Ryan/epic, wisdom=Andrew/calming, science=Emma/bright | A | **PASS** (registry pins) |
| 15 | regressions | full suite | A | **PASS** — 1084/1087 (3 pre-existing network flakes) |

## P6 — dynamic gradient from the background (2026-11-05)

- R7: THE GRADIENT SHALL be solved from the photo's text-region luminance
  (gradientForPhoto: 24×14 greyscale probe, left 55% columns) — bright
  backgrounds get a stronger, longer gradient; dark ones barely a veil
  (gradientForLum: target post-overlay luminance ~0.16, clamped 0.35–0.94,
  fade reach 0.46–0.74).
- R8: ABSENT measurement = the fixed defaults (0.9/0.42/0.62) — the overlay
  interpolates the measured values; both paths pinned.

| # | Req | Check | Type | Result |
|---|---|---|---|---|
| 11 | R7 mapping | bright→strong+long, dark→veil, mid→between, extremes clamp | A | **PASS** (5 pins) |
| 12 | R7 live | bright premium photo measured a0 0.76 / x2 0.66 → left darkened, right vivid | V | **PASS** (local still) |
| 13 | R8 default-inert | overlay interpolates grad; absent = fixed defaults (source pins) | A | **PASS** |
| 14 | regressions | full suite | A | **PASS** — storybook 91/91 |
