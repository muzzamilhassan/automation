# Spec + QA — `market-files` P1.7: Storyset scene images (2026-11-11)

Source: docs/superpowers/specs/2026-11-11-market-files-p1.7-storyset-scenes-spec.md.
Plain English: every scene beat now shows a real professional cartoon
IMAGE (Storyset, Pana style) filling the frame, the camera drifts over
it, and our text/numbers/captions sit on top. This is the "image to
image" look the owner asked for. No animations — just images that move.

## Requirements (EARS)

- R1: 30 curated Pana scenes in the manifest, downloaded idempotently
  into explainer/public/assets/market/scenes/, every URL HEAD-verified.
- R2: scene beats render the image as the dominant visual with all
  overlays preserved (headline, chips, clock, boards, props, captions).
- R3: mood-matched deterministic pick, no immediate repeats.
- R4: attribution recorded (Storyset / Freepik line in CREDITS + demo
  note).
- R5: missing assets → P1.5 fallback; other families byte-identical.
- R6: scrim on text-heavy beats; captions stay white-outlined.
- R7: episode re-rendered, frames reviewed, demo delivered.

## QA rows

| # | Req | Check | Type | Result |
|---|---|---|---|---|
| 1 | R1 | manifest scenes=30; fetcher downloads all; second run all cached | A | PASS — 30 Pana scenes harvested (at-the-office skipped: no Pana variant), every URL HEAD-verified 200 before manifesting; fetcher downloaded all 30 (2.0 MB); mood tags on every entry |
| 2 | R2 | frames: scene images dominate, overlays clean | V | PASS — hero: full finance illustration (analyst + piggy bank + charts) on indigo with clean headline/captions; stat: split layout (board left, payments scene right) after the first-round fix (board was covering the scene); chapter: analytics scene dimmed under the chapter number |
| 3 | R3 | consecutive beats pick different scenes; mood filter respected | A | PASS — pickScene filters by the beat's mood tags first (crash→business-decisions/questions/time-flies pool, data→analytics/server/programming pool, party→coins/revenue/team pools), deterministic Knuth-hash rotation with an anti-repeat step when the previous beat's pick collides |
| 4 | R4 | CREDITS.md Storyset line present | A | PASS — fetcher regenerates CREDITS.md with the Storyset attribution requirement ("Illustrations by Storyset / Freepik" in every video description) |
| 5 | R5 | suites green; kit only used by marketFiles; fallback intact | A | PASS — 21/21 market tests green; SceneImage/pickScene live in cartoonKit (market-only); every scene keeps the P1.5 Room+Peeps fallback when scenes are missing; chapter-title bug FIXED in lib/market-script.mjs (titles lived in `text`, cards showed only the number since P1 — verified all 6 titles flow) |
| 6 | R6 | text-heavy frames legible (scrim); captions white | V | PASS — dims per beat kind (chapter 0.34, stat 0.12-split, quote 0.22, timeline 0.3, process 0.3, end 0.4); captions already white-outlined from round 2 |
| 7 | R7 | episode re-rendered + demo delivered | V | PASS — episode re-rendered (137s, 53.4 MB, "Burn The World Waltz" tense track confirmed in the log); video frames verified: hero = full finance illustration with clean headline/captions, stat = board-left/scene-right split, chapter card = "01 / The Top" over the dimmed analytics scene (the chapter-title fix proven in motion); thumbnail re-rendered (149 KB). Demo delivered in chat |

## Regression

- market suites green; P2–P5 layers untouched; P1.5 fallback intact.
