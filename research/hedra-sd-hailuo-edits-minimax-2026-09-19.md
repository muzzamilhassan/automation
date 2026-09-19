# Research: Hedra, Stable Diffusion, Hailuo, Edits, MiniMax

2026-09-19. Question: what are these, are they free, and how can our pipeline consume them?

---

## TL;DR table

| Tool | What it is | Free? | How we can consume it | Fit for us |
|---|---|---|---|---|
| **Hedra** | AI talking-avatar generator (image + voice → lip-synced presenter video, model "Character-3") | Free tier ~100 credits; paid $15-75/mo | Web app, or API (also hosted on fal.ai-type routers) | Experiment only — an AI "face" for a channel; ~$0.8/30s video at 720p |
| **Stable Diffusion** | Open-weights image generator (SD 3.5 Medium/Large) | Free locally; commercial use free under $1M revenue | Local (8-24 GB VRAM), or free via our existing Pollinations, or Stability API (~$0.2/img) | We already consume SD-family images free via Pollinations; local = unlimited free if GPU ≥8GB |
| **Hailuo** (MiniMax) | Text/image → video generator (Hailuo 02/03 models) | App: free daily-capped tier (watermark). API: no free tier, ~$0.08/s @768p | App (manual) or MiniMax API | Special-occasion b-roll only ($2.4 per 30s) — too pricey for daily Shorts |
| **Edits** (Meta) | Free CapCut-rival video editor app (phone) | 100% free, 4K export, no watermark | Manual only — NO API, not automatable | User's manual polishing of reels; cannot plug into our CI |
| **MiniMax** (company) | Behind Hailuo + MiniMax Audio (Speech 2.8 HD TTS, 300+ voices, 32 languages, voice cloning) + M-series LLMs | TTS web: free online tier. API: paid per token/character | API direct or via Replicate/fal.ai | Possible premium-narration upgrade later; our Kokoro/Edge TTS is already $0 |

---

## 1. Hedra (hedra.com)

**What:** Upload one image (a face/character) + audio → Character-3 generates a lip-synced talking-head video with expressions. Best-in-class lip-sync. This is how many "AI presenter" channels make a consistent host without a human.

**Pricing (2026):** Free ~100 credits (no card). Basic $15/mo. Creator $30/mo (~5,400 credits, watermark-free, voice cloning). Pro $75/mo. Credits burn by resolution: 720p ≈ 5 credits/sec → a 30s talking video ≈ 150 credits ≈ $0.83 at Creator tier. 1080p ≈ 6.25 credits/sec.

**Consuming:** Web app (manual), or API. Character-3 is also resold on AI routers (fal.ai etc.) — same model, per-second billing.

**For us:** Our Shorts/docs are faceless and already work. An AI presenter is a NEW format bet (could raise retention via a consistent "host" face), not a fix for the current 3 channels. Cost is fine for a test (a month of Creator = ~36 test videos). Verdict: park it as an experiment; don't wire into CI until a manual test proves retention gains.

## 2. Stable Diffusion (SD 3.5)

**What:** Open-weights text-to-image model family from Stability AI (Medium/Large/Large-Turbo).

**License:** Stability Community License — free INCLUDING commercial use while revenue < $1M/yr (we qualify). Above that → enterprise license.

**Hardware:** Medium runs on ~6-8 GB VRAM; Large wants 12-24 GB. Local = unlimited free images forever.

**Consuming:** (a) **Already consuming it free** — Pollinations (our existing image engine) serves SD/FLUX-family generations with no key; (b) local via ComfyUI if the GPU is ≥8 GB (D: drive install was already scoped in the 3D-models research); (c) Stability API ~$0.21/image (no reason — Pollinations is free).

**For us:** Nothing changes today. If we ever want unlimited custom images (thumbnails, scene backgrounds, branded art), local SD via ComfyUI is the free-forever path — blocked only on confirming the GPU.

## 3. Hailuo (MiniMax video)

**What:** Text-to-video / image-to-video model family (Hailuo 02/03) — one of the strongest "camera feels real" generators, strong physics, 6-10s clips, up to 2K.

**Pricing:** App (hailuoai.com): free daily-capped credits, small watermark, 768p — manual use only. API: **no free tier** — ~$0.08/second at 768p, ~$0.13/s at 2K. A 30s b-roll sequence ≈ $2.40.

**Consuming:** MiniMax API directly, or via Replicate/fal.ai.

**For us:** Our Shorts b-roll = Pixabay pool ($0, unlimited). Hailuo only makes sense where stock footage can't go — channel trailers, one-off key documentary scenes, the future feeder channel's viral-style clips. Recommendation: don't wire it in; keep as a paid option for specials.

## 4. Edits (Meta)

**What:** Meta's free CapCut competitor — phone app for editing Reels/Shorts. 4K export, no watermark, frame-accurate timeline, auto-captions, green screen, music library, direct share to Reels.

**Free?** Completely.

**Consuming:** Manual only. There is NO API — it cannot be automated or plugged into our CI pipeline.

**For us:** A personal tool for the user to hand-polish a reel before special posts. Zero pipeline impact.

## 5. MiniMax (the company)

**What:** Chinese AI lab behind Hailuo (video), MiniMax Audio (Speech 2.8 HD — top-ranked TTS, 300+ voices, 32 languages, voice cloning), and cheap M-series text LLMs (~$0.15-0.30/M input tokens).

**Free?** Audio web app has a free online tier; API is paid. Promos appear periodically (e.g., free TTS weeks via partners like Vapi).

**Consuming:** API direct, or Replicate/fal.ai (Speech-02 HD), or Pipecat for streaming.

**For us:** Our narration chain (OpenAI→Kokoro→Edge) is $0 and working. MiniMax Audio = the "premium voice" upgrade path if a channel ever needs standout narration or 32-language versions (YouTube auto-dubbing already covers multilingual free). Park it.

---

## Recommendations for our pipeline

1. **Nothing to wire in today.** Current stack ($0: Remotion + Kokoro/Edge + Pixabay + Pollinations) still wins on cost at our daily volume.
2. **Cheapest real upgrade = local Stable Diffusion** (needs GPU confirmation ≥8 GB, ComfyUI on D:) → unlimited custom images for thumbnails/backgrounds, $0.
3. **Best format experiment = Hedra** (a consistent AI host) — but test manually on the $15-30 tier for one month before any automation.
4. **Hailuo / MiniMax video = specials only** (trailers, key scenes) at ~$2.4/30s.
5. **Edits = user's phone tool**, no integration possible.
6. Revisit after the retention engine shows results — better scripts are free; new formats are not.

Sources: [hedra.com](https://www.hedra.com), [magichour.ai Hedra guide](https://magichour.ai), [fluxnote.io Hedra review](https://fluxnote.io), [meetcody.ai Hedra API specs](https://meetcody.ai), [Fello AI MiniMax pricing](https://felloai.com/ja/minimax-pricing), [Atlas Cloud Hailuo pricing](https://www.atlascloud.ai/blog/tips/hailuo-ai-pricing), [Puter MiniMax API notes](https://developer.puter.com/tutorials/minimax-api-pricing), [stability.ai SD 3.5](https://stability.ai), [Instagram Edits for Creators](https://creators.instagram.com/edits), [Meta Edits announcement](https://about.fb.com/news/2025/04/introducing-edits-streamlined-video-creation-app), [MiniMax Audio](https://www.minimax.io)
