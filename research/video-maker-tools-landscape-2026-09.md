# Video Maker Tools — Full Landscape Research (2026-09-11)

**Scope:** EVERY way to make videos automatically in 2026 — programmatic engines, open-source pipelines, Python/3D/game engines, render APIs, faceless SaaS, AI editors, frontier AI video models, avatar SaaS, and open-weight local models. Programmatic or not — anything that can automate video for any niche.
**Perspective:** Solo creator, Pakistan, cloud-only (GitHub Actions) preference, $0 budget with intl card for small upgrades, existing stack = ffmpeg + SVG + Kokoro TTS + Gemini script brain + full publish/report pipeline.
**Companion doc:** `research/animated-explainer-video-research-2026-09.md` (JSM-style explainer deep dive — engine choice, voice, pipeline design).
**Status:** RESEARCH ONLY — nothing implemented.

---

## 0. TL;DR — the decisions this research answers

| Question | Answer |
|---|---|
| Best programmatic engine? | **Remotion** — free for you FOREVER (solo = ≤3-person tier, headcount-based, no revenue test). Quarry Studio use case explicitly permitted. |
| New disruptor to watch? | **HyperFrames** (by HeyGen) — Apache-2.0, ~49k stars in <1 year, HTML+GSAP, deterministic headless-Chrome rendering, built for AI agents. Pre-1.0 (v0.8.x). |
| Best open-source pipeline app? | **MoneyPrinterTurbo** — very alive (v1.3.6, Sep 2 2026), MIT, new CLI batch mode built for CI, now does generative clips (Seedance/Wan), not just stock. |
| Dead / do-not-touch | ShortGPT (dead Feb 2025) · SadTalker (dead) · editly (broken on Node 20/22) · **Sora 2 API (shuts down Sept 24, 2026)** · Crayo (ToS gray zone) · CapCut free tier (NO commercial license) · **F5-TTS / XTTS-v2 weights (non-commercial — monetized YouTube explicitly not permitted)** |
| Cheapest AI b-roll? | **Replicate Wan 2.2 i2v FAST: $0.05 per 5-sec clip → ~$36/mo for 1 min/day.** Veo 3.1 Fast ($0.10/s, audio incl.) = the quality splurge (~$90/mo at 1 min/day). |
| Cheapest real render API? | **JSON2Video Hobby $16.95/mo** (50 min, ≤1-min videos) · **Shotstack $39/mo** (200 min, best docs, no watermark) — the value pick. |
| Free render capacity | GitHub public repo = **unlimited free Actions minutes on 4 vCPU / 16 GB runners** (upgraded mid-2025 from 2-core). 6h job cap only matters for 30+ min renders. |
| Is faceless AI content still monetizable? | **Yes** — enforcement is demonetization (not strikes) aimed at mass-produced identical templates. Original scripts + per-video variation + honest AI disclosure = safe. Compilations/reused clips = highest risk. |

---

## 1. Remotion — the deep dive

**Version:** v4.0.523 (Sep 9, 2026). ~125 stable releases in 2026 — the most actively developed engine in this space. Rendering now uses Chrome Headless Shell (faster, fewer deps).

### 1.1 License (exact terms — this matters for Quarry Studio)

| Item | Term |
|---|---|
| Free tier | Individuals, for-profit orgs **up to 3 people**, non-profits. Commercial use fully allowed. |
| Paid trigger | **Headcount only (4+ people).** No revenue threshold anywhere. Contractors count. |
| "Remotion for Creators" | $25/seat/mo, no minimums — what you'd pay if the team ever grows past 3. |
| "Remotion for Automators" | $0.01/render, $100/mo minimum — for products rendering other people's content at volume. |
| Free vs paid code | Identical. No feature gates. |

**Quarry Studio clause (verified from license FAQ):** Explicitly ALLOWED — end-users creating/rendering personalized videos from *your* templates; rendering AI/LLM-generated Remotion code as a service. NOT allowed — accepting users' own uploaded Remotion projects for rendering, or reselling a Remotion derivative. **A solo operator is permanently free, including selling videos, running multi-brand channels, and letting clients order from your templates.** You'd owe $25/mo only on the day you hire a 4th person.

### 1.2 "Remotion Cloud" does not exist

Official terms: "Remotion does not offer a hosted rendering service." What exists:
- **Remotion Lambda** (AWS, self-hosted, mature): official cost examples — simple short ≈ **$0.001**; 1-min 1080p ≈ **$0.02**; **10-min HD ≈ $0.10–0.11** (~1 min wall time across 20+ lambdas); 4K 10s ≈ $0.013. Plus S3 ~$0.023/GB/mo.
- **@remotion/cloudrun** (GCP) — alpha, 1 bucket/region limit.

### 1.3 GitHub Actions reality

- No dedicated official GHA page; official guidance = `npx remotion render` in CI. 6-hour job cap is the hard wall.
- Runner upgrade: **public repos now get 4 vCPU / 16 GB ubuntu-latest** (mid-2025 upgrade from 2-core/7GB) — this materially improves the explainer doc's older render-time math.
- Community datapoints: ~0.5–2× realtime for typical caption/kinetic-type comps on 4-core (a 60s 1080p Short ≈ 10–30 min render). `npx remotion benchmark` measures your own comps.
- Long-form (60+ min) needs either matrix-split jobs (chunk `--frames` ranges → parallel matrix → ffmpeg concat; the yuvraj108c/Remotion-Matrix-Renderer repo documents the pattern but is itself dormant — treat as reference, not dependency) or Lambda (~$0.11 per 10-min video removes the problem entirely).
- 2025–26 feature history: Media Parser (May 2025) → deprecated Feb 2026 in favor of **Mediabunny** (Remotion sponsors it $1k/mo); WebCodecs integration from v4.0.229+; Studio deployable as static bundle; @remotion/player for in-app previews.

### 1.4 Template ecosystem (remotion.dev/templates — official)

- **Faceless Shorts / captions:** TikTok template (word-by-word animated captions), Audiogram (text + waveform)
- **Prompt → video:** "Prompt to Video" (story + images + VO), "Prompt to Motion Graphics SaaS Starter" (LLM → animation)
- **Explainer:** Code Hike (code animations); no dedicated diagram template — the JSM-style scene-template library from the companion doc remains custom work
- **Posters/stills:** Stills template (dynamic PNG + server)
- **Paid:** Editor Starter (undo/redo + captioning + Lambda), Watercolor Map, Timeline
- Known pain points: render throughput on complex comps (per-frame browser screenshots), webpack bundle size with large assets (import via staticFile/URL), React learning curve.

**Verdict: primary recommendation.** $0 on GitHub Actions for anything short-form; Lambda at ~$0.10/10-min-video when long-form arrives. Free at any commercial scale for a solo operator.

---

## 2. Node/TypeScript engine alternatives

| Engine | License | Status (2026-09) | Stars | Verdict |
|---|---|---|---|---|
| **HyperFrames** (heygen-com/hyperframes) | **Apache-2.0** | **Very alive** — v0.8.34 Sep 10 2026, near-daily releases, pre-1.0 | ~49k | ★ The disruptor. Composition = plain HTML file with `data-*` timing attrs; animate with GSAP/CSS/Lottie/Three.js/Anime.js; renderer seeks each frame in headless Chrome → deterministic ffmpeg MP4. Built FOR agents (HeyGen vibe-codes its own launch videos with it). One-way Remotion porting tool exists. AWS Lambda distributed render stack included. Risks: v0.8 API churn, small template ecosystem, no captions tooling yet. **Worth a spike alongside Remotion before committing.** |
| **Revideo** (midrender/revideo) | MIT | Alive but deprioritized — @revideo/core 0.11.0 Jul 10 2026; team's focus is now their Midrender editor app, changes not always upstreamed | ~4k | The "open-source Remotion" (Motion Canvas fork + headless `renderVideo()` API). Solid MIT fallback if Remotion licensing ever mattered. Ecosystem/captions far behind. |
| **Motion Canvas** | MIT | Dormant — last release Dec 2024, ~1 trivial commit in 2026 | ~19k | Best-in-class *authoring* tool for hand-crafted vector explainers, but no headless/CI render path (writes frame sequences; ffmpeg is manual). Wrong tool for unattended pipelines. |
| **editly** | MIT | Half-dead — npm stable Dec 2022; pinned `gl` dep fails to build on Node 20/22 (multiple open issues) | ~5.5k | The original "JSON → MP4" tool. Do not build on it in 2026. |
| **Etro** | **GPL-3.0** | Active (0.14.1 Aug 2026) | ~1.1k | Browser realtime compositing, not deterministic CI rendering. GPL copyleft. No. |
| **Vidstack** | MIT | Stale (Apr 2024) | ~3.7k | Player library only — not a renderer. Irrelevant here. |
| **Helios** | custom | Too small/unproven (98 stars, Aug 2025) | 98 | Watch-list only. |
| **Rendervid** | custom | Pre-1.0 (63 stars, Jan 2026); stateless JSON templates + React player + MCP — right architecture, 2-digit community | 63 | Interesting, not production-safe. |
| **Konva / Fabric + ffmpeg** | MIT | Both active | 12k/29k | DIY frame-stepping — this is essentially our current SVG+ffmpeg workflow, one abstraction up. No new capability. |
| **Lottie → video** (puppeteer-lottie or ~50-line loop) | MIT libs | Pattern-level | — | Niche: only if consuming AE-made motion assets. Both Remotion and HyperFrames consume Lottie natively anyway. |

**Scorecard for a $0 GitHub Actions machine:** Remotion (primary) → HyperFrames (challenger, Apache-2.0 removes all license math) → Revideo (MIT fallback) → everything else skip.

---

## 3. Open-source faceless-video pipeline apps

| Project | License | Stars | Status (2026-09) | What it is |
|---|---|---|---|---|
| **MoneyPrinterTurbo** (harry0703) | MIT | ~122k | **Very alive** — v1.3.6 Sep 2, 2026 | The winner. New since mid-2025: AI-generated clips from script segments (Seedance via Volcano Ark), OFox multi-model T2V router, MiniMax H3 T2V, OpenAI-compatible image source, OpenRouter LLMs, **auto-publish via Upload-Post**, **CLI batch manifest mode (inherits WebUI settings — built for CI)**, ElevenLabs + self-hosted Chatterbox TTS, narration timed from actual audio. WebUI + CLI + Docker. Verdict: **keep it**; it now does generative clips, and CLI batch mode is Actions-friendly. Notable fork: MoneyPrinterTurbo-Extended (karaoke word-highlight subs). |
| **OpenCreator** (krillinai, ex-KrillinAI/KlicStudio) | Apache-2.0 | ~11.4k | Very alive, pivoted | The classic Klic features survive as a **Video Translation workspace**: Whisper + LLM subtitle segmentation/translation, bilingual subs, dubbing, vertical/horizontal reformatting. But pivoted into a local "AI creator workspace" requiring **Node 22 + logged-in OpenAI Codex CLI** as agent brain — awkward for pure cloud CI. Best open tool for translate/dub/reformat of existing footage (e.g., Urdu market expansion). |
| **FunClip** (modelscope) | MIT | ~6.2k | Alive (slow), v2.1.0 | Transcript-driven auto-clipping (FunASR/SenseVoice + LLM segment picker), local Gradio. Best ASR is Chinese-oriented. |
| **AI-Youtube-Shorts-Generator** (Anil-matcha) | MIT | ~4.9k | Very alive (Sep 10, 2026) | The open Opus Clip: LLM highlight detection + Whisper + 9:16 crop. More active English-centric clipper than FunClip. |
| **MoneyPrinterV2** (FujiwaraChoki) | **AGPL-3.0** | ~31.9k | Fading (Jun 2026 push) | AGPL license caution; original MoneyPrinter (MIT) is legacy. |
| **ShortGPT** (RayVentura) | MIT | ~7.9k | **DEAD** — last push Feb 2025 (19 months), 86 open issues | Influential scene/timeline framework; do not build on it. |
| **AI-Faceless-Video-Generator** (SamurAIGPT) | MIT | ~500 | Minor | Small demo-grade. |
| **n8n faceless-video workflows** | — | — | Active community pattern | Official n8n horror-shorts template (OpenAI TTS + Replicate video + YT upload); popular Sora-based n8n flow on Reddit. Idea mines for our n8n-legacy setup; they wrap paid video APIs. |

---

## 4. Python / 3D / game-engine automation

- **MoviePy 2.x** (MIT, 14.9k★, active; v2.2.1 May 2025): v1→v2 is breaking (`moviepy.editor` removed, `set_start`→`with_start`, `subclip`→`subclipped`). Pipelines have died on this upgrade. Verdict: pin `moviepy==2.2.1` if used at all — fixed-structure assembly is still faster and more robust as **raw ffmpeg commands** (our current backbone).
- **Manim CE** (MIT, 40.8k★, very active): best tool for automated math/code explainers — deterministic, CPU-only, headless, CI-friendly. The LLM-writes-`scene.py`-with-retry loop is mature enough to bolt onto our Gemini brain (manimator arXiv paper, manimAnimationAgent, generative-manim exist but none is load-bearing — call Manim directly). Look = "3Blue1Brown", a distinct niche.
- **Blender headless** (GPL tool; rendered videos are yours): the only $0 path to 3D explainers/data-viz animation. `blender -b scene.blend -F FFMPEG -a`, fully scriptable via `bpy` (procedural scene-from-JSON pairs with an LLM). Docker images exist (BlenderKit headless-blender). Gotchas: Cycles = clean but CPU-slow on CI (minutes per second of animation); EEVEE needs GPU/xvfb. No polished GitHub Action — compose from Docker images.
- **nexrender** (MIT, 1.9k★, alive-slow): the standard for After Effects template automation (JSON jobs → aerender). **Adobe terms require a valid AE license on every render machine** — nexrender doesn't remove that (~$23/mo per worker). Fails the $0 constraint unless you already own AE templates/assets.
- **Unity/Unreal headless:** confirmed dead end — Unity batchmode disables rendering; Unreal Movie Render Queue is production-grade but needs GPU workers + huge install. Skip.

---

## 5. Open-weight AI video generation models (local)

| Model | License | Commercial? | VRAM | I2V (animating posters)? |
|---|---|---|---|---|
| **Wan 2.2** (Alibaba, 17.5k★) | **Apache-2.0** | ✅ clean | 1.3B: ~4–6GB · 5B TI2V: 6–12GB (official 8GB-card support) · 14B FP8/GGUF: ~6–24GB | ✅ |
| **LTX-2 / 2.3 / 2.5** (Lightricks, 9.4k★) | LTX Community ⚠️ | ✅ if revenue <$10M; no reselling/hosting-as-API | 8GB min / 16GB comfortable / 24GB+ for high tiers | ✅ image→10s |
| **HunyuanVideo 1.5** (Tencent, 8.3B) | Community ⚠️ (non-OSI) | ✅ <100M MAU; **territory excludes EU/UK/S.Korea (PK/US fine)**; no training-on-outputs | ~14GB @720p (official, offload); ~6GB via WanGP | ✅ |
| **FramePack** (lllyasviel) | MIT (code) | ✅ | **~6GB constant regardless of length**, up to 120s@30fps | ✅ core use case |
| CogVideoX / Mochi 1 / Open-Sora 2 | various | ⚠️/✅ | low-mid | Superseded — legacy |

Key 2026 facts:
- **Wan 2.2 is the LAST open Wan.** Wan 2.5/2.6 are API-only, no public weights (live community controversy; 2.6 adds audio but is Comfy-Cloud-API-only). Wan 2.2's dual-expert 14B I2V remains the open-quality king; official ComfyUI workflows; best prompt-following + motion among open models.
- **LTX-2.x is the speed + audio story:** open weights since Jan 2026; LTX-2.5 does 10s video from an image in ~6.8s on superchip-class hardware; generates **synchronized native audio+video** (unique among open weights). Community expects it to overtake Wan.
- **Image-to-video of our SVG posters/quote cards = a solved, locally-runnable capability** (Wan 2.2 I2V / LTX-2 / FramePack all do it).
- The "AWAITING user's GPU VRAM" decision from the 3D-models research now has a default answer: **Wan 2.2 5B (6–12GB) or LTX-2 (8GB+) via ComfyUI**; FramePack if the card is small.

### Open-source avatars / lip-sync

| Project | License | VRAM | Verdict |
|---|---|---|---|
| **EchoMimicV3** (Ant Group, AAAI 2026) | **Apache-2.0** | ~12GB | Safest commercial pick — audio→talking presenter, face+body, 1.3B |
| **LatentSync 1.6** (ByteDance) | code Apache-2.0; weights Open RAIL++-M ⚠️ | ~10–12GB | Best lip-sync onto existing video (the dubbing/translation pattern) |
| LivePortrait | MIT code ⛔ depends on InsightFace (non-commercial) | ~8–12GB | Commercial only if InsightFace→MediaPipe swap |
| MuseTalk 1.5 | check repo | low (realtime) | Semi-dormant (Mar 2025) |
| Hallo3 / SadTalker / Wav2Lip | MIT / ⛔NC-mess / ⛔NC | — | Dead or abandoned — use EchoMimicV3/LatentSync instead |
| Duix.Heygem | ⛔ custom license — review before use | GPU server | Zero-training 4K avatar, but license not standard |
| OpenAvatarChat (Alibaba) | permissive repo; component models vary | varies | Realtime interactive-agent shaped, not render-farm shaped |

### ⚠️ Voice-clone TTS licensing traps (directly relevant to our stack)

- **Kokoro (ours): Apache-2.0 — safe. Chatterbox (Resemble): MIT (Turbo: Apache-2.0) — safe**, full cloning, MoneyPrinterTurbo v1.3.x supports self-hosting it.
- **⛔ F5-TTS: code MIT but official weights CC-BY-NC-4.0 — maintainers explicitly confirmed monetized YouTube use is NOT permitted.**
- **⛔ XTTS-v2: Coqui Public Model License = non-commercial**, never relicensed after Coqui's shutdown.
- GPT-SoVITS: code MIT, pretrained weights licensing ambiguous/risky — fine-tune from own audio only.

---

## 6. SaaS render APIs (programmatic video generation as a service)

| API | 2026 pricing | Free tier | Notes |
|---|---|---|---|
| **Shotstack** | PAYG $0.30/min ($75 pack, 1-yr credits) · **Subscription $0.20/min from $39/mo** (200 credits, 3× rollover) · Enterprise custom | 10 credits + permanent sandbox | Best-engineered: JSON Edit API + template studio + white-label editor SDK. 1080p max (4K = enterprise), **3-hour max render**, no watermark, Node/Python SDKs, Zapier/Make. **Overall best-value production pick.** |
| **Creatomate** | Essential **$54/mo** (2,000 credits ≈ ~143 min 720p; 14 cr/min at 25fps) · Growth $129 · Beyond $249+ | 50-credit trial | Best template editor + docs, CSV "feeds" for bulk, official n8n tutorials. Prices RAISED in 2026; ~35% pricier/min than Shotstack. |
| **JSON2Video** | **Hobby $16.95/mo** (3,000 credits = 50 render-min, **1-min max length**) · Professional $49.95 (200 min, 10-min max) · Startup $99.95 (500 min, 30-min max) · Prepaid packs never expire | 600 credits, **watermarked** | 1 credit = 1s; 4K costs 4×; TTS included; movie-style scene templates suit faceless content; **bills via Paddle (PK-card friendly)**. Cheapest credible entry. |
| Bannerbear | ~$49/mo+ (image-first pricing; video basic MP4/GIF/WebM via POST) | sandbox | Video is second-class. Use only if already using it for images. |
| Plainly | $69/mo (50 min) → $649 | 14-day trial | **After Effects-template automation** (official Adobe partner); needs an AE license to author. Overkill unless you own AE motion-graphics templates. |
| Rendi.dev | freemium | yes (small) | **FFmpeg-as-a-Service** — send raw ffmpeg commands via REST. Complement, not replacement. |
| Orshot | budget | — | "2× cheaper Bannerbear", image-first with basic video. |

**Cheapest API-driven 100 template videos/month (30–60s each):** JSON2Video Hobby $16.95 (exact fit at 30s, zero headroom at 60s) → Shotstack $39 (2× headroom, no watermark, better limits) → Creatomate $54. Free tiers are watermarked/capped = test-only.

---

## 7. Faceless-video autopilot SaaS (prompt → short → auto-post)

| Tool | Pricing 2026 | Auto-post | API | Flags |
|---|---|---|---|---|
| **AutoShorts.ai** | Free 1 video (wm) · Starter **$19/mo** (3 posts/wk) · Daily $39 (1/day) · Hardcore $69 (2/day) | TikTok/YT/IG | No | Paid = no watermark. **Hard cap: 1 series per account on EVERY plan** — one niche only. |
| **Crayo.ai** | Hobby ~$13–19/mo (50 credits) · Clipper $27 · Pro $55 | No | No | **No free trial at all. ToS grants Crayo a worldwide royalty-free license and frames use as "personal, non-commercial" — read ToS before monetizing. Gray zone: avoid.** |
| **Faceless.video** | $20/mo (30 cr) → $149 (350 cr) | TikTok/IG/YT | No | Per-series pricing multiplies with channels. |
| **Faceless.so** | $29–99/mo | **7 platforms daily** (YT/TikTok/IG/FB/X/Threads/LinkedIn) | No | Free trial no card. Preset-output sameness flagged. |
| **ReelFarm** | Starter ~$19 · **Growth $49: API access + Skill.md** · Scale $95 | TikTok-focused | **Yes (Growth+)** | Slideshow/faceless hybrid. |
| **Short.ai** | Basic **$19/mo** (1,600 cr ≈ 40 videos) · Pro $30 (90 videos) | Yes | No | Credit-based. |
| **Autopostr** | $19.99–59.99 | Yes | No | Uses Sora 2 + Veo 3.1 — note Sora 2 API dies Sept 24, 2026. |
| **Revid.ai** | Hobby **$39/mo** · Growth ~$99 · Ultra ~$199 | Auto-Mode | **Yes — public API, MCP server, CLI** | Strongest pick if you want a faceless SaaS WITH an API. |
| **Blotato** | $29 (1,250 cr, 20 accounts) · $97 · $499 | 9 platforms | **Yes + MCP** | Gen + publishing in one; 7-day trial (card required). Caution: the big "#2 ranked" review of it is written by its founder. |
| QuickReel / Klipme | ~$20–40/mo | No | No | Clippers (long→short), not generators. |

**YouTube-monetization verdict for fully-auto stock-footage shorts:** the July 15, 2025 "inauthentic content" policy (mass-produced/repetitious) is enforced **channel-wide** in 2026; same-template daily stock mashups are exactly the demonetized pattern. If using these tools: vary formats, add original scripting, keep volume 1–3/day.

**Better pattern for us:** render via API (Shotstack/JSON2Video) + upload via our own YouTube Data API scripts — no series caps, no SaaS auto-post lock-in, cheaper.

---

## 8. AI video editor / text-to-video SaaS (manual-first, for completeness)

| Tool | 2026 pricing | API/automation | Verdict |
|---|---|---|---|
| **InVideo AI** | Basic $9/seat (190 cr) · Pro $25 annual (1,000 cr) · Ultra $60 annual (3,000 cr); credits don't roll over | **No API** — export only | Best prompt-to-explainer quality per dollar; useless inside GitHub Actions except as a manual studio. |
| **Pictory** | Starter $25 annual · Professional $35 · Teams $119 | **API sold separately ~$79/mo** (annual, self-serve) | Best script/blog→video; API doubles cost — Shotstack beats it. |
| **Fliki** | **Free 5 min/mo (wm, no commercial rights)** · Basic $8 annual (120 min) · Standard $21 (180 min) · Premium $66 (API access) | API on Premium; Make integration | Cheapest paid entry in the category; TTS-first faceless narration. |
| **Lumen5** | freemium, ~$30–149 paid | No API | Marketing blog-to-video; skip. |
| **VEED.io** | Free (wm) · Lite ~$19 · Pro $49 | **No public API** | Great manual editor; not automatable. |
| **Kapwing** | Free (wm, 720p, 4-min cap) · Pro $16/member annual (4K, 120-min videos) | **No public self-serve API** | Solid manual editor; no automation path. |
| **Descript** | Free · Hobbyist $16 annual · Creator $24 · Business $50 | **API open beta since April 2026** (project creation, media import, AI "Underlord" edits, MCP) | The only mainstream editor now automatable — but it's editing/podcast tooling, not template rendering; early maturity. |
| **OpusClip** | **Free 60 credits/mo (wm)** · Starter ~$15 (no wm) · **Pro $29 (annual $174): auto-post YT/TikTok/IG** | API = request-form only | The long→shorts clipper to beat; genuinely good free tier; auto-post locked to Pro. |
| **Submagic** | Starter $19 (15 videos, 2-min max, no wm) · Pro $39 | No | Caption/zap polish for clips you already have. |
| **Captions.ai** | ~$9.99–24.99/mo tiers | Avatar API: **$0.15/s** | Same category. |
| **Canva** | Bulk Create (CSV→template fields, batches <~100, manual trigger) · Connect API (autofill/export; no JSON-timeline video rendering) | Partial | Awkward for a video machine; fine for quote-card slideshow clips. |
| **CapCut** | Free tier **does NOT include commercial-use license**; June 2025 ToS grants ByteDance broad perpetual rights to uploaded content | No API | **Avoid as backbone of a monetized pipeline.** Fine as a free manual editor for non-commercial drafts. |

---

## 9. Frontier AI video generation (API) — 2026 price sheet

| Model | Price | Audio | Notes |
|---|---|---|---|
| **Veo 3.1 Lite** (Gemini API) | **$0.05/s** (720p) · $0.08/s (1080p) | ✅ | Cheapest frontier; 4K n/a |
| **Veo 3.1 Fast** | $0.10/s (720p) · $0.12/s (1080p) · $0.30/s (4K) | ✅ | The realistic quality splurge |
| **Veo 3.1 Standard** | $0.40/s · $0.60/s 4K | ✅ | Premium |
| **Sora 2 (OpenAI)** | was $0.10/s (720p), $0.30/s Pro | ✅ | **☠️ API DISCONTINUED SEPT 24, 2026** (web app died Apr 26, 2026). DO NOT INTEGRATE. No Sora 3 announced. |
| **Kling 2.5 Turbo** | $0.112/s official · **$0.07/s on fal.ai** (Turbo Pro) | +$0.03/s native | Half price via fal |
| **Runway Gen-4 / 4.5** | $0.12/s · Gen-4 Turbo **$0.05/s** · Aleph 2.0 $0.44/s | — | Credits at $0.01 each |
| **Luma Ray3 / 3.2** | consumer $30–300/mo; API ≈ $0.06–0.12/s via resellers | — | Full-control API on Ray3.2 |
| **Hailuo 02 (MiniMax)** | **$0.28 per 6s 768p** ($0.047/s) · $0.49/6s 1080p | — | Cheapest official PAYG |
| **Pika** | ~$8–76/mo plans; API ~$0.09/s | — | Alive, pivoted to "Pika Agent" |
| **Wan 2.5** (API-only, no weights) | **$0.05/s on fal** | ✅ | Open-weight line stopped at 2.2 |
| **HunyuanVideo 1.5 hosted** | $0.075/s on fal | — | |
| **Seedance 2.5** (ByteDance) | ~$0.11/s at 480p launch | — | |

Market range 2026: **$0.04–$1.00/s** ($2.40–$60/min).

**Verdict — 1 min/day of generated b-roll:**
- **Replicate Wan 2.2 i2v FAST: $0.05 per 5-sec 480p clip → ~$0.60/min → ~$36/mo** ← the budget answer
- Veo 3.1 Lite 720p: ~$90/mo · Kling/Wan 2.5 on fal: ~$90–126/mo · Veo 3.1 Standard: ~$720/mo (no)
- Frontier-every-day is a $90–150/mo habit. Sensible split: Veo 3.1 Fast for hero shots, open-weight Wan/Hailuo for filler.
- API outputs: no visible watermark (SynthID invisible, stays in all Google outputs, cannot be legitimately removed); commercial rights included on paid tiers.

---

## 10. Avatar / talking-head SaaS

| Tool | Pricing | API | Notes |
|---|---|---|---|
| **HeyGen** | Free 3 videos/mo (≤1 min) · Creator $29/mo (~10–30 min of Avatar IV) · Business ~$149 | **Avatar IV 1080p ≈ $4/min ($0.067/s)**, prepaid PAYG from $5 | Best quality-at-tier with a real REST API |
| Synthesia | Free ~10 min/mo (wm) · Creator ~$64–89 | **API = Enterprise only** | Dealbreaker for automation |
| D-ID | Build ~$14.40/mo · Launch ~$35 · Scale ~$138+ (annual) | ✅ | ~20 credits/min; known complaint: billed for failed renders |
| Tavus | Starter $39–59 · Growth ~$375 | ✅ | Real-time conversational focus; $0.32–0.37/min, 30s minimum charge |
| Captions.ai | Mirage Avatar X API | ✅ **$0.15/s** (6s increments) | |
| VEED Fabric 1.0 | — | ✅ **$0.08/s @ 480p** | Cheapest per-second avatar API found |

**Cheapest credible 30 min/month of avatar video via API: HeyGen ≈ $120/mo** (best quality), VEED Fabric 480p ≈ $144/mo, Captions ≈ $270/mo. For a $0 operator: skip avatars, or EchoMimicV3 (Apache-2.0) locally when a GPU is available.

---

## 11. Hosted inference for open-weight video models

- **Replicate:** Wan 2.2 FAST (Pruna-optimized): **i2v 480p $0.05/video**, t2v 720p $0.10/video (~5s clips) — vs non-optimized i2v $0.40–1.00. LTX-2.5 Fast $0.03/s (720p), LTX-2.3 Pro $0.08/s (1080p). Community models: per-GPU-second (T4 $0.000225/s → A100 $0.0014/s + cold starts).
- **fal.ai:** Wan 2.5 $0.05/s (audio incl.) · Kling 2.5 Turbo Pro $0.07/s · HunyuanVideo 1.5 $0.075/s · Hailuo-02 Pro $0.08/s · LTX-2.3 $0.08/s 1080p → $0.32/s 4K · dedicated H100 from $1.89/hr.
- **Hugging Face Inference Providers:** video catalog thin; free = $0.10/mo credits, PRO $9/mo = $2 credits. Not viable for video volume.

**Bottom line:** animating a static poster/quote image via hosted open models = **~$0.01/s (Replicate Wan 2.2 i2v FAST)** — 4–8× cheaper than any frontier model, and the actual budget answer for daily generated motion.

---

## 12. Rendering infrastructure (2026 facts)

- **GitHub-hosted runners (public repos): ubuntu-latest = 4 vCPU / 16 GB** (upgraded mid-2025 from 2-core/7GB); windows same; macOS 3 vCPU/7GB. Private repos still 2 vCPU/8GB.
- **Public repos: free unlimited standard-runner minutes.** Private: 2,000 min/mo free (Linux 1× multiplier).
- Hard limits: 6 h/job, 256 jobs/matrix, 100 pending runs per concurrency group, 1,000 API calls/hour.
- Hosted-runner prices cut up to 39% on Jan 1, 2026. A planned $0.002/min self-hosted-runner fee was announced then **walked back** (Dec 2025) after backlash. Self-hosted runner apps < v2.329.0 blocked from Mar 16, 2026.
- **Oracle Always Free was HALVED (~June 15–21, 2026): now 2 OCPU / 12 GB** (was 4/24). Old tutorials are wrong. Usable as a secondary encode box; ARM ffmpeg/Node fine; watch idle-reclamation (keep CPU >20%) and "out of host capacity" in popular regions.

---

## 13. YouTube policy — where faceless/AI content stands in 2026

- The **July 15, 2025 "inauthentic content"** rule (mass-produced/repetitious) carried forward; a July 2026 Tubefilter report adds an "unsatisfying or off-putting content" category. Enforcement = **demonetization / YPP ineligibility, not strikes** — channels can fix videos and reapply.
- **AI/faceless is NOT banned.** AI voiceovers explicitly allowed when content is original and adds value. The kill-list is templated, near-identical uploads with minimal transformation ("cash cow" setups).
- **AI disclosure:** "Altered or synthetic content" tick required for *realistic* AI people/places/events (news/elections/health = strikes risk). 2026: label moved to a more prominent watch-page position; a **May 2026 rollout of automatic detection + forced labeling** for photorealistic AI content — treat auto-labeling as likely regardless. Clearly-animated/stylized content (our whole catalog) is **exempt** from the badge requirement.
- Risk ladder: original script + AI voice + original visuals (low) → quote videos with licensed visuals (low-medium; repetition is the risk) → stock-footage mashups with minimal editing (**high**) → compilations of others' clips (**highest**) → volume "slop" farms (very high).
- Our formats (own SVG/cinematic compositions, own scripts, per-brand voices, 3/day spread across formats) sit in the low-risk tier; the weekly-compilation flow should stay **own-content compilations only** (it already is).

---

## 14. What this means for OUR machine (fit matrix + roadmap)

Our current stack (ffmpeg + SVG typography + Kokoro + Gemini brain + GHA publish) is confirmed near-optimal for $0. The landscape adds these upgrade paths:

| Niche / capability | Best tool | Cost |
|---|---|---|
| Animated diagram/kinetic-type explainers (JSM-style) | **Remotion** + scene-template library (companion doc) | $0 (GHA) → ~$0.11/10-min render (Lambda when long-form) |
| Same, but license-anxiety-free / agent-authored | **HyperFrames** (Apache-2.0) — spike first, pre-1.0 | $0 |
| More faceless shorts volume / AI-image b-roll pipeline | **MoneyPrinterTurbo CLI batch mode** (local, already installed) | $0 + optional API keys |
| Animating our existing posters/quote cards (I2V) | **Replicate Wan 2.2 i2v FAST** | **$0.05/clip → ~$36/mo for 1 min/day** |
| Hero-shot AI b-roll | Veo 3.1 Fast (audio incl., no visible watermark) | ~$3/min |
| Offload rendering entirely (no CI juggling) | Shotstack $39/mo or JSON2Video Hobby $16.95/mo | paid |
| Zero-code niche autopilot (one niche, set-and-forget) | AutoShorts.ai $19/mo — but 1-series cap makes it wrong for 15 channels | paid |
| Faceless SaaS WITH an API (if ever wanted) | Revid.ai $39/mo (API+MCP) or ReelFarm Growth $49/mo | paid |
| Talking presenter / avatar | EchoMimicV3 local (Apache-2.0) when GPU known; HeyGen API ~$4/min if hosted needed | $0–$120/mo |
| Math/code explainers (3B1B-style) | Manim CE + LLM-writes-scene.py-with-retry | $0 |
| 3D data-viz / logo stings | Blender headless via Docker on GHA (Cycles CPU = slow but $0) | $0 |
| Urdu/regional market expansion | OpenCreator (translate/dub/reformat) — local, needs Codex CLI | $0 |
| Voice cloning (licensed) | **Chatterbox (MIT)** — never F5-TTS/XTTS-v2 weights | $0 |

**Do-NOT-touch list (with reasons):** Sora 2 API (dies Sept 24, 2026) · Crayo (ToS = personal/non-commercial framing) · CapCut free (no commercial license) · ShortGPT/SadTalker/Wav2Lip (dead) · Motion Canvas for CI (no headless path) · editly (broken on Node 20/22) · F5-TTS/XTTS-v2 weights (non-commercial) · nexrender without an AE license · Etro (GPL + browser-bound).

**Phased roadmap (consistent with the explainer doc):**
1. **Phase 0 (now, $0):** nothing to buy. Optional: run `npx remotion benchmark` + a HyperFrames hello-world spike to compare DX on our runners.
2. **Phase 1 (explainer pilot):** 3 Remotion templates + 8-min video on GHA (4-core public runners changed the render math for the better vs the older 2-core estimate).
3. **Phase 2 (motion upgrade):** Replicate Wan 2.2 i2v on selected posters (~$0.05/clip) as a new "animated quote card" format — reuses everything we own.
4. **Phase 3 (paid convenience, only if revenue):** Shotstack $39/mo OR Remotion Lambda (~$0.11/10-min) to end CI time-juggling; Veo 3.1 Fast hero shots per video (~$3/min).

---

## 15. Sources (primary)

- Remotion: remotion.dev/docs/license/pricing · LICENSE.md + FAQ · remotion.dev/docs/lambda/cost-example · remotion.dev/docs/cloudrun · remotion.dev/templates · remotion.dev/blog/mediabunny · github.com/remotion-dev/remotion (issue #4783) · news.ycombinator.com/item?id=40650337
- Engines: github.com/heygen-com/hyperframes · github.com/midrender/revideo · github.com/motion-canvas/motion-canvas · github.com/mifi/editly (+ issues #332/#286) · github.com/etro-js/etro · github.com/QualityUnit/rendervid · leanylabs.com/blog/node-videos-konva
- Pipelines: github.com/harry0703/MoneyPrinterTurbo (v1.3.6) · github.com/krillinai/OpenCreator · github.com/RayVentura/ShortGPT · github.com/modelscope/FunClip · github.com/Anil-matcha/AI-Youtube-Shorts-Generator · n8n.io/workflows/10103
- Python/3D: zulko.github.io/moviepy (v2 migration) · github.com/ManimCommunity/manim · docs.blender.org (CLI render) · github.com/BlenderKit/headless-blender-container · nexrender.com · dev.epicgames.com (Unreal MRQ)
- Open models: github.com/Wan-Video/Wan2.2 · docs.comfy.org (Wan 2.2) · github.com/Tencent-Hunyuan/HunyuanVideo-1.5 + LICENSE · github.com/Lightricks/LTX-2 · venturebeat.com (LTX-2.5) · wavespeed.ai (LTX license analysis) · github.com/lllyasviel/FramePack · github.com/antgroup/echomimic_v3 · github.com/bytedance/LatentSync
- TTS licensing: huggingface.co/SWivid/F5-TTS/discussions/18 · dograh.com (OSS TTS comparison) · github.com/resemble-ai/chatterbox
- Render APIs: shotstack.io/pricing · creatomate.com/pricing (+ docs) · json2video.com/pricing · plainlyvideos.com/pricing · rendi.dev
- Faceless SaaS: autoshorts.ai · crayo.ai/pricing + /tos · faceless.video · reel.farm · short.ai · revid.ai/pricing + /docs · blotato.com · argil.ai (AutoShorts review)
- Editors: invideo.io/pricing · pictory.ai/pricing + API pricing · fliki.ai/pricing · veed.io/pricing · kapwing.com/pricing · descript.com/pricing + docs.descriptapi.com · opus.pro/pricing · submagic.co · canva.dev · capcut.com/clause/material-license-agreement + isabokelaw.com analysis
- Frontier: ai.google.dev/gemini-api/docs/pricing (Veo 3.1) · help.openai.com (Sora discontinuation) · kling.ai/dev/pricing · fal.ai/pricing · docs.dev.runwayml.com/guides/pricing · platform.minimax.io · pika.art/api · replicate.com/blog/wan-22 + pricing
- Avatars: heygen.com/api-pricing + help center · synthesia.io/pricing · d-id.com/pricing/api · tavus.io · captions.ai/help/docs/api/pricing · veed.io/learn/best-avatar-apis
- Infra: docs.github.com/en/actions/reference/runners/github-hosted-runners · docs.github.com/en/actions/reference/limits · github.blog changelog (pricing cut, self-hosted fee walk-back, runner version enforcement) · infoq.com + docs.oracle.com (Oracle free tier halved)
- Policy: support.google.com/youtube/answer/1311392 · support.google.com/youtube/answer/14328491 · blog.youtube (AI labels) · tubefilter.com (Jul 2026 enforcement report)
