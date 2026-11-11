# Spec — `market-files` P1.7: Storyset scene images (2026-11-11)

Owner decision (demo 3 feedback + ask): the videos must read as rich
2D cartoon IMAGES moving image-to-image — not vector kits, not
animations. Direction chosen: **Storyset full-scene illustrations**
(one locked style: Pana) as the scene layer, our text/charts/boards/
captions/props stay on top. Research:
research/paper-billions-scene-images-sources-2026-11-11.md (automation
live-proven: direct CDN SVGs, HTTP 200, free license with an
attribution line).

## Requirements (EARS)

- R1: THE manifest SHALL gain a `scenes` group: 30 curated Pana-style
  finance-relevant illustrations (slugs harvested from Storyset
  category/style pages; every URL HEAD-verified 200), each tagged with
  moods; the fetcher SHALL download them into
  explainer/public/assets/market/scenes/ idempotently.
- R2: scene beats SHALL render a curated scene image as the dominant
  visual (mood-colored Room backdrop behind it, Ken Burns motion via
  the existing SceneShell, mood/beat-deterministic pick with no
  immediate repeats), with ALL existing overlays preserved: headline,
  chips, clock, BigBoard, props, 3D accents, white outlined captions.
- R3: a mood-mismatch SHALL be impossible: the scene pick filters by
  the beat's mood tags first, then rotates deterministically.
- R4: THE attribution SHALL be recorded: CREDITS.md gains the Storyset
  line ("Illustrations by Storyset / Freepik" — required per video
  description on upload).
- R5: missing scene assets SHALL fall back to the P1.5 Room+Peeps
  rendering (fail-soft, never fail a render); other families stay
  byte-identical (default-inert).
- R6: text legibility on colorful scenes: text-heavy beats get a soft
  dark scrim between scene and text (hero/chapter/timeline/quote);
  captions stay white-outlined (already fixed in round 2).
- R7: THE phase ends with the Nov-5 episode re-rendered, frames
  reviewed, and a fresh demo for the owner's gate.

## Non-goals

- No AI generation this pass (Storyset first; AI stays the documented
  upgrade path for reference-parity custom scenes).
- No Storyset style mixing: Pana only (at-the-office skipped — no Pana
  variant exists).
- No per-limb character animation; the only motion is Ken Burns on
  images (the owner explicitly: "I don't want animations").

## Acceptance

- Fetcher downloads 30 scenes; idempotent second run.
- Episode frames show full-color scene images with clean text on top;
  captions legible; no repeats back-to-back.
- Suites green; commit local; demo delivered.
