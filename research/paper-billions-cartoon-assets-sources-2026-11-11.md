# Cartoon artwork sources — deep research for the `market-files` lane (2026-11-11)

Owner verdict on the demo: "not good, totally bad video" — the art, not the
pipeline. The script, voices, timing, music, charts and captions are fine.
What failed is the **scene art**: our hand-drawn parametric SVG characters
(circle heads, stick limbs) read as a kindergarten doodle next to the
reference channel's rich illustrated scenes. This document researches every
usable source of premium cartoon artwork — 2D, 3D, libraries and AI — with
licenses, automation paths and real per-episode costs, so the owner can pick
the art engine.

## 0. What the reference actually uses (ground truth)

Paper Billions' frames (saved in `research/assets/paper-billions-ref/`) show
AI-image generation artifacts: garbled text inside posters and boards,
inconsistent character details between shots, warped hands. **The reference
channel generates every scene image with an AI image model** and overlays the
readable text (timers, tickers, captions) digitally — exactly the structure we
already have. That is why their scenes look rich (unique illustrated rooms,
crowds, perspective, lighting) while being one character that never quite
matches between shots.

Consequence for us: no static library can reach 100% reference parity —
the reference look IS AI-generated. Libraries get "clean flat explainer"
quality; AI generation gets reference parity. Both are researched below.

## 1. Route A — AI scene generation (the reference-parity route)

The pipeline slot: a new scene-image service replaces the `Room/Character`
SVG drawing inside `marketFiles.tsx` for scene beats. Everything else (text
overlays, charts, captions, karaoke, boards, kinetic beats) stays ours —
those layers are already premium and stay text-perfect, which makes our
output BETTER than the reference (their in-image text is garbled; ours never
is).

### Character/style consistency strategy (the hard part, solved)

- **Style bible prompt**: one fixed prefix used for every scene ("flat 2D
  editorial cartoon illustration, thick clean outlines, muted navy/crimson
  palette, round-headed stylized trader characters, dramatic lighting...")
  written once per brand, stored in registry DATA (no-static-maps rule).
- **Reference-image conditioning**: generate ONE "character sheet" scene,
  then pass it as the reference image for all later scenes (gpt-image-1 and
  fal.ai FLUX support image-to-image / reference conditioning). This keeps
  the SAME cast face across 60 scenes.
- **Fixed seed per episode** for palette stability.
- All text, numbers, labels → rendered by Remotion on top (never asked of
  the model).

### Providers (verified facts + live-tested today)

| Provider | Cost per scene | Cost / 60-scene episode | Free tier | Status for us |
|---|---|---|---|---|
| **Cloudflare Workers AI (FLUX.1-schnell)** | ~1–4 Neurons/img | **$0** | 10,000 Neurons/day free, **no card needed** | RECOMMENDED free path — needs owner signup only |
| **Together AI / fal.ai (FLUX.1-schnell)** | ~$0.003 | **~$0.20** | trial credits | cheapest paid; fal supports reference-image; verify exact price at signup |
| **Gemini (Nano Banana / flash image)** | ~$0.039 (high) | ~$2.35 | our 2 keys are BLOCKED (429 quota / 403 billing) | owner enables billing OR fresh AI Studio project |
| **OpenAI gpt-image-1 (medium)** | $0.063 (live-tested, 1536×1024) | **$3.80** | our key: 429 `insufficient_quota` — **no credits** | owner adds ~$5–10 credits; best prompt-adherence + reference-image support |
| Pollinations | free | $0 | — | DISQUALIFIED (sana-only model + forced watermark; re-confirmed today: `models` endpoint returns `["sana"]`) |
| Local Stable Diffusion | $0 | $0 | — | IMPOSSIBLE — machine has no GPU (Intel UHD 620) |

FLUX-schnell quality note: strong flat-illustration/carto style, weak at
in-image text (irrelevant — we overlay). gpt-image-1: best instruction
following and reference consistency, priciest. Realistic plan: FLUX for the
volume (all scenes), gpt-image-1 optional for hero scenes only.

## 2. Route B — free cartoon libraries (the $0, no-signup route)

Real cartoon art we can automate-download and composite. Honest verdict up
front: these look **clean and professional but "flat corporate explainer",
not the reference's rich illustrated scenes**. Big upgrade over the SVG kit,
not 100% parity.

| Source | What it is | License | Attribution | Automation |
|---|---|---|---|---|
| **Open Peeps** (openpeeps.com, Pablo Stanley) | hand-drawn character construction kit — mix heads/hair/emotions/poses; 584k combos; busts + standing + sitting | **CC0** (verified on site) | none | ✅ **LIVE-TESTED TODAY**: their CDN serves ready-made SVGs directly (HTTP 200, clean 26 KB SVG). Curate a cast once, recolor to palette |
| **Kenney.nl** | game-style cartoon packs — **Mini Characters (3D)** for the 3D look, 2D tiny/vector packs; dozens of poses/expression sprites | **CC0** (their standard license) | none | catalog live-verified today; downloads = zip packs, one-time manual fetch → repo; site disallows AI-training crawlers (TDM) but CC0 use in videos is the intended purpose |
| **unDraw** | 3,000+ flat SVG illustrations, recolorable to any hex | free commercial (license page read today) | none | ⚠️ license EXPLICITLY prohibits automated scraping — one-time manual curation into repo is fine; no bulk downloader |
| **Storyset (by Freepik)** | rich detailed CARTOON SCENES with characters — **the closest library match to the reference's illustrated look** | free w/ attribution ("Illustrations by Storyset"), or Freepik Premium removes it (~€15–24/mo) | yes (free tier) | no official API; manual curation; SVG downloads per scene |
| **Freepik** vectors | massive cartoon character/scene library incl. AI vectors | free w/ attribution; Premium for none | yes (free tier) | manual; license tiers |
| **Pixabay** illustrations | big vector/cartoon pool | Pixabay Content License — commercial OK | none | manual curation; API exists but key-gated |
| **3dicons.co** | 1,400+ glossy **3D icons** (money bag, coins, cards, charts…) | **CC0** | none | static file downloads, one-time curation — perfect accent layer |
| **Icons8 Ouch!** | cartoon scenes + 3D | subscription for video use | n/a | paid |
| **Humaaans / Blush** | modular character illustrations | Humaaans CC0; Blush per-collection | none | manual |

How it would look in our engine: Open Peeps cast (recolored navy/crimson,
per-episode deterministic character picks) composited over richer SVG rooms +
3dicons props floating in (money bags, falling coins) + Storyset/Pixabay
scenes for chapter openers. `@remotion/lottie` adds entrance animations.

## 3. Route C — animated libraries (motion quality)

- **@remotion/lottie** — official Remotion package, verified today from their
  docs (`npm i @remotion/lottie lottie-web`, plays Lottie JSON deterministically,
  speed control, remote files OK). LottieFiles hosts free animated cartoon
  characters/props (license PER ASSET — must vet each; many free, some
  attribution).
- **@remotion/rive** — same idea for Rive .riv files (interactive-quality
  cartoon animation; community marketplace has free assets, per-asset license).
- Use as accents (animated coin flips, rising/falling chart arrows, character
  entrances), not full scenes — per-asset license vetting doesn't scale to 60
  scenes/episode.

## 4. Comparison matrix

| Route | Reference parity | Cost / episode | Owner action needed | Risk |
|---|---|---|---|---|
| A1: Cloudflare FLUX (free tier) | ✅ high | **$0** | sign up Cloudflare (no card) | daily Neuron cap (plenty for our volume); FLUX cast consistency needs the reference-image loop built |
| A2: fal/Together FLUX | ✅ high | ~$0.20 | signup (+card) | tiny; same consistency work |
| A3: OpenAI gpt-image-1 | ✅ highest | ~$3.80 | add ~$5–10 credits | none technical |
| B: libraries (Open Peeps + 3dicons + Storyset) | ❌ clean-flat, not parity | $0 (attribution) or Freepik ~€20/mo | none (curation) | style ceiling — may still disappoint |
| C: Lottie/Rive accents | n/a (layer) | $0 curated | none | license vetting per asset |

## 5. Recommendation (hybrid, staged)

1. **Primary: Route A1 — Cloudflare Workers AI FLUX, free tier.** It is the
   only route that reaches the reference's look, it costs $0, and it fits our
   architecture: an asset-fetcher step between script staging and render
   (like the photo fetcher in the fleet), cache per episode, fail-soft back
   to the current SVG kit so a render NEVER dies on a missing image.
2. **Cast consistency**: style bible in registry data + one generated
   character sheet + reference-image conditioning per scene (fal.ai
   FLUX img2img is the free-ish fallback if Cloudflare's endpoint lacks
   conditioning; then A2 at ~$0.20/episode).
3. **Keep every non-scene layer we already built** — kinetic text, real-data
   charts, glowing boards, captions, karaoke. They were the good part of the
   demo and are better than the reference's own (their text garbles; ours
   can't).
4. **Accent layer later (optional)**: 3dicons CC0 props + a small vetted
   Lottie set for entrances. Premium polish pass.
5. **OpenAI credits (~$5–10) optional**, only if the owner wants the
   highest-quality hero scenes (thumbnail/poster frames).

Cost ceiling even fully paid (A2+A3 every episode): < $4. Free plan (A1): $0.

## 6. Decisions the owner needs to make

1. **Art engine**: Cloudflare signup (free, recommended) / fal.ai+card
   (~$0.20/ep) / OpenAI credits (~$3.80/ep) / free libraries only (no AI).
2. Accept that libraries alone (Route B) will look "clean flat", not
   Paper Billions — parity requires the AI route.
3. Optional: OpenAI credits for hero scenes; Freepik Premium only if we go
   the Storyset route at scale.

Once the engine is picked, the rebuild is one phase (P1.5 "premium art
pass"): scene-image service + fetcher + `marketFiles.tsx` swaps SVG rooms for
AI stills on scene beats, storyboard review loop, re-render demo for the
owner's gate.

## Verification log (2026-11-11)

- unDraw license page read live — free commercial, no attribution, automated
  download prohibited, AI-training use prohibited.
- Open Peeps site read live — CC0 confirmed; CDN SVG live-downloaded
  (HTTP 200, 26,810 bytes, valid SVG).
- Kenney asset catalog read live (Mini Characters 3D etc.); CC0 license
  standard; site TDM/noai crawler headers noted (human-curated use unaffected).
- @remotion/lottie docs read live — package + features confirmed; @remotion/rive exists.
- Pollinations `/models` = `["sana"]` — still disqualified.
- OpenAI gpt-image-1 pricing live-tested 2026-11-10: 429 no-credits; medium
  1536×1024 = $0.063/image (their published rate).
- Gemini image endpoints: both project keys blocked (429 / 403 billing) — tested 2026-11-10.
- Together AI pricing page unreachable from this network today; $0.003/image
  FLUX-schnell rate is from knowledge (2025) — verify at signup before relying.
