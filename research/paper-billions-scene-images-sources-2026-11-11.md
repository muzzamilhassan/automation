# Rich cartoon scene IMAGES — deep research round 2 (2026-11-11)

Owner verdict on demo 3: "totally bad" — and a precise direction: the
videos should be built from **2D/3D cartoon-like IMAGES** (not vector
kits, not animations) — "simple but more users watch it, like image to
image move". That describes the reference channel's exact format: each
beat is ONE rich illustrated scene image, the camera slowly moves over
it (Ken Burns), then cuts to the next image. Our text/charts/captions
layer on top.

## The finding: Storyset does exactly this — and it automates

**Storyset (by Freepik)** — storyset.com — is a library of ~30,000+
FULL-COLOR professional cartoon SCENE illustrations in 5 consistent art
styles (Rafiki, Bro, Amico, **Pana**, **Cuate**). Each illustration is a
complete scene: characters + room + background, drawn by Freepik's
artist teams. This is the premium "explainer cartoon" look.

### Automation — LIVE-TESTED today (this is the proof)

The raw SVGs are served from an open CDN with direct URLs:

```
https://stories.freepiklabs.com/storage/<id>/<name>.svg
```

Live tests (all HTTP 200, real full-scene SVGs with the
`background-complete` group — background INCLUDED, no compositing
needed):

| Scene | Style | Bytes |
|---|---|---|
| On the office | Rafiki | 101 KB |
| Make it rain (money) | Rafiki | 60 KB |
| Company | Cuate | 368 KB |
| Newsstand | Pana | 117 KB |

So the lane becomes: curate ~60–100 scenes (finance, office, money,
data, crisis, city, meeting…) in ONE locked style → download once into
the repo → **each beat shows one scene image full-screen with our
existing Ken Burns (SceneShell already pans/zooms) + our text, charts,
boards, captions and 3D props on top**. Beat-to-beat that reads as
"image moving to image" — the owner's phrase, the reference's format.

### License

Free tier requires attribution — one line in the video description:
"Illustrations by Storyset / Freepik". No per-video fees, no account
needed for the CDN downloads. (Freepik Premium ~€15–24/mo removes the
attribution — optional, not required.)

### Why this fits better than everything else we tried

- **Open Peeps (current cast)**: beautiful but B/W line-art character
  KITS — we compose them into hand-drawn rooms. The owner rejected the
  composition look twice. Storyset scenes are complete PROFESSIONAL
  images — no composition skill required, and they carry full color.
- **3dicons**: keep as accent props (they were never the complaint).
- **Kenney / CraftPix / itch.io game packs**: rich scenes but a
  GAME-PAINTING style that clashes with clean UI overlays; licenses
  vary per pack; Storyset's style unity + license beat them.
- **unDraw**: flat corporate spot illustrations, no real scenes, no
  automated download allowed.
- **Lummi.ai** (Pablo Stanley's AI stock library): royalty-free
  AI illustrations/photos/3D with open CDN URLs
  (`assets.lummi.ai/assets/<id>?w=...`) — live-verified reachable.
  Catalog skews photo/abstract; usable as a secondary accent source,
  not the scene backbone.
- **AI generation (fal/Together ~$0.20/ep, OpenAI ~$3.80/ep,
  Cloudflare free)**: still the ONLY route to 100% Paper Billions
  parity (custom scene per beat, consistent cast). Storyset gets the
  "rich professional cartoon images" look at $0 with zero signups —
  the trade-off is scenes are generic (a trading-floor-with-specific-
  -chart image can't be curated, only generated).

## Recommendation

Rebuild the scene layer on **Storyset full-scene images** (locked to
one style — Pana for maximum color/detail), keep our text/chart/board/
caption layers and 3D props, Ken Burns every scene, Open Peeps rigs
demoted to fallback. $0, attribution line, no signups, automation
proven today.

## Verification log (2026-11-11)

- Lummi.ai homepage read live: Photos/Illustrations/3D, royalty-free,
  open asset CDN confirmed in page source.
- Storyset business category read live: 5 styles, ~40 direct SVG URLs
  harvested from the page itself.
- 4 direct CDN downloads across 3 styles: all HTTP 200, valid
  full-scene SVGs (background-complete), 60–368 KB each.
