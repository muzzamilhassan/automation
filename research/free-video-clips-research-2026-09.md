# Free Video Clips (b-roll) — Deep Research (2026-09-12)

**Question:** can we add real video clips to the explainer/reels pipeline from totally free sources — stock platforms, open/public-domain archives, or free AI generation — without breaking the $0 budget or the full-automation rule?
**Status:** RESEARCH ONLY — nothing implemented.
**Conclusion up front:** YES. Two sources are automation-grade and 100% free today: **Pixabay Videos (key already in .env)** and **Pexels Videos (free key, 5-min signup)**. AI generation is NOT automation-grade free (commercial-use restrictions / needs GPU / paid per second).

---

## 1. Category A — Free stock video platforms (the workhorse)

| Platform | API (automatable?) | Attribution | Commercial use | Vertical clips | Quality | Verdict |
|---|---|---|---|---|---|---|
| **Pixabay Videos** | ✅ `pixabay.com/api/videos/` — **key already in .env (`PIXABAY_API_KEY`)** | ❌ not required (Content License) | ✅ | ✅ (filter by size) | HD + 4K variants per clip; `video_type` filter incl. stock_footage/animation | ⭐ **START HERE — zero setup** |
| **Pexels Videos** | ✅ free API, 200 req/h + 20k/mo — limits lifted FREE if you show attribution | expected (and it unlocks unlimited) — auto-append credits in description | ✅ | ✅ `orientation=portrait` param — perfect for reels | Best-in-class library, 4K | ⭐ **ADD — biggest quality win** |
| **Coverr** | ✅ Content API (api.coverr.co), described as agent-ready/MCP | ❌ | ✅ (verify current API terms — older docs restricted commercial API use) | ✅ | Curated, cinematic | Good extra variety source |
| **Mixkit** (Envato) | ❌ no API | ❌ | ✅ | ✅ 4K + vertical | Great | Manual batches only — not automation-grade |
| **Mazwai** | ❌ | ⚠️ per-clip (CC-BY or free) | ✅ | ✅ | Cinematic | Skip (license checking kills automation) |
| Videvo / Videezy | ❌ / mixed | ⚠️ often required | ⚠️ mixed | ⚠️ | mixed | Skip |

License gotchas (all of the above): never resell clips as standalone stock; don't imply endorsement by people/brands shown in clips; keep our narration + animated text on top (transformative = also safer for YouTube's reused-content policy).

## 2. Category B — Public-domain / open archives (topical b-roll)

| Source | API | License | Best for |
|---|---|---|---|
| **NASA Image & Video Library** | ✅ `images-api.nasa.gov` (free key or DEMO_KEY), `media_type=video` | Public domain (US government work) | Space / Earth / engineering b-roll — pairs perfectly with a "space facts" niche |
| **Internet Archive** | ✅ `advancedsearch.php` + scrape + metadata APIs, no auth (Prelinger Archives etc.) | Per-item — mostly PD/CC; verify each | Historical footage for history/business-story niches; mostly SD quality |
| **Wikimedia Commons** | ✅ MediaWiki action API (`prop=imageinfo&iiprop=url|extmetadata`) | Mixed — read `extmetadata` license field; some CC-BY need attribution | Topical clips; transcoded WebM |

These are niche/topical sources, not generic backgrounds — use when the video topic matches (space, history, companies).

## 3. Category C — AI video generation (free-ish)

### Free tiers of commercial generators (Kling, Hailuo, PixVerse, Luma, Pika, Runway, Veo)
- **Kling**: ~66 credits/day, the only major **daily-renewing** free tier. **Hailuo**: daily free credits. **PixVerse**: generous free tier. Runway/Pika/Luma: one-time or monthly dribbles.
- **The catch: almost all free tiers disallow COMMERCIAL use of outputs, and many watermark.** Monetized channel = commercial. So free-tier AI video is fine for *experiments*, not for the money channels.
- Manual web apps only (no automation-grade free APIs).

### Paid-but-cheap APIs (reference points, not free)
- Veo 3.1 Fast: ~$0.15/s · Veo 3.1 Lite (720p, no audio): ~$0.03/s · Veo 3 standard: ~$0.40/s. One 40s reel fully AI-generated ≈ $1.2–16 → not free.

### Open-source local generation (truly free, needs YOUR GPU)
| Model | License | VRAM | Notes |
|---|---|---|---|
| **Wan 2.2** (Alibaba) | **Apache 2.0 — fully commercial** | 5B: ~8-12 GB · 14B: ~24 GB (quantized less) | Best commercial-safe quality; runs in ComfyUI |
| LTX-2/2.3 (Lightricks) | Custom — free under $10M ARR | ~16-28 GB | Native audio+video, 4K; strongest tech |
| HunyuanVideo 1.5 | Tencent custom — commercial restricted | ~14 GB | Cinematic, but license strings |

Still blocked on the same old question: **your GPU's VRAM** (awaited since the 3D-models research). If ≥8 GB → Wan 2.2 5B can generate abstract/looping b-roll locally, free forever. Not GitHub-Actions-grade (no GPU runners for free) — local-only.

---

## 4. How this plugs into OUR pipeline (design sketch — not built)

1. Reel/video spec gains an optional per-beat `broll: {query, orientation}`.
2. Fetcher: Pixabay/Pexels API → download 1-3 candidates (HD/4K) → pick best duration/resolution → trim to beat length, scale+crop to 9:16 or 16:9.
3. Dark overlay (55-70%) → our animated text/numbers sit ON TOP (this is what keeps it original + readable + premium looking — the reference channels do exactly this).
4. Auto-credits appended to the video description (Pexels/Pixabay attribution — they already do CC-BY credits for incompetech music).
5. Cost: $0. Bandwidth: ~10-30 MB per video.

## 5. Recommendation (ranked)

1. **Pixabay Videos — use NOW, zero setup** (key already in .env). Works for both 16:9 explainers and 9:16 reels.
2. **Pexels Videos — add free key** (5-min signup, no card). Biggest quality/library win, portrait param for reels, show attribution → later ask for unlimited free limits.
3. **NASA + Archive.org APIs** for space/history/business-story topics (public domain, API-first).
4. **Coverr API** as a variety booster once 1-2 work.
5. **AI generation: park it.** Free tiers = non-commercial + watermarks + manual. Local Wan 2.2 = great but needs your GPU (≥8 GB VRAM) + ComfyUI. Revisit when GPU specs are known or if budget allows ~$0.03-0.15/s APIs.

## 6. Sources

- Pexels API: pexels.com/api · help.pexels.com (rate limits + free lift w/ attribution)
- Pixabay API: pixabay.com/api/docs (video endpoint, Content License)
- Coverr: coverr.co · coverr.co/developers · Mixkit: mixkit.co (license) · Mazwai license terms
- Plainly "top stock video APIs" roundup: plainlyvideos.com/blog/stock-video-api
- Free AI tiers: whichoneisreal.com/compare/best-free-ai-video (Kling 66/day) · thesecondbrain.io · mstudio.ai · pexo.ai
- Veo pricing: ai.google.dev/gemini-api/docs/pricing · costgoat.com/pricing/google-veo
- Open-source models: github.com/Wan-Video/Wan2.2 (Apache 2.0) · LTX-2 license (huggingface.co/Lightricks) · HunyuanVideo-1.5 license (github.com/Tencent-Hunyuan)
- Archives: images-api.nasa.gov · api.nasa.gov · archive.org/developers · commons.wikimedia.org/wiki/Commons:API
