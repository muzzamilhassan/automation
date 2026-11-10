# Spec — `market-files` P1.5: the library art pass (Route B+C) (2026-11-11)

Owner decision 2026-11-11: SKIP the AI route; rebuild scene art from FREE
CARTOON LIBRARIES (Route B) + ANIMATED ACCENTS (Route C, @remotion/lottie).
Research: research/paper-billions-cartoon-assets-sources-2026-11-11.md.
Known trade-off the owner accepted: clean professional flat-cartoon look,
not 100% Paper Billions parity. $0 forever, no accounts needed.

## Art sources (all verified in the research doc)

- **Open Peeps** (CC0) — the recurring CHARACTER CAST: hand-drawn
  business-casual people, direct CDN SVG downloads (live-tested HTTP 200).
- **Kenney** (CC0) — 3D Mini Characters / prop packs as secondary accents.
- **3dicons.co** (CC0) — glossy 3D props (money bag, coins, arrows, cards).
- **Storyset** (free w/ attribution line in the upload description) — rich
  cartoon room backdrops for chapter/hero scenes if direct SVG URLs exist.
- **Lottie accents** (@remotion/lottie) — small vetted set of free-license
  animations (crash arrow, rally arrow, coin, spark) with a license manifest.

## Requirements (EARS)

- R1: THE asset fetcher (scripts/market-art.mjs) SHALL download assets from
  a curated DATA manifest into explainer/public/assets/market/, skip files
  already present (idempotent), and fail loudly on HTTP failures.
- R2: asset sources + licenses SHALL be recorded in a CREDITS manifest next
  to the assets (CC0 items need nothing; Storyset items get an attribution
  string the uploader includes in the video description).
- R3: THE cartoon kit SHALL render the recurring cast as recolored Open
  Peeps (fill-mapped to the episode palette), with entrance/bob animation
  and per-mood treatment, replacing the parametric stick-figure rig.
- R4: scene rooms SHALL use the enriched backdrop set (library backdrops or
  upgraded SVG rooms) keyed by the existing location field — no new beat
  fields; default-inert for other families.
- R5: stat/board beats SHALL float 3D icon props (money, coins, arrows)
  scaled by mood (crash → falling red arrow, rally → rising green arrow).
- R6: THE Lottie accents SHALL play on key beats through @remotion/lottie
  with a fail-soft loader (missing file → skip the accent, never fail the
  render).
- R7: other families and non-market docs SHALL render byte-identical to
  before (default-inert control).
- R8: THE phase ends with the Nov-5 episode re-rendered + storyboard stills
  reviewed against the reference frames + a fresh demo video for the owner's
  gate.

## Non-goals

- No AI image generation (owner skipped Route A; Cloudflare not set up).
- No per-limb character rigging — library characters animate as a whole.
- No new TTS/music/caption changes — P2–P5 layers stay untouched.

## Acceptance

- Fetcher runs clean from an empty assets dir; second run skips everything.
- CREDITS manifest lists every asset with license + source.
- Suite passes incl. a default-inert control pair.
- Re-rendered demo reviewed frame-by-frame; owner gets the new demo.
