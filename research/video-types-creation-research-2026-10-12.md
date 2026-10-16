# Video Types & Creation Pipeline Research — Quarry Studio Expansion
**Research date: 2026-10-12** | Scope: all video types Quarry Studio could support, tool-layer comparison (free vs paid), YouTube performance data, quality expectations, and what users will pay for DFY video creation.

---

## 1. VIDEO TYPES — Format, Pipeline, Feasibility, Examples

### 1.1 Documentaries (current Quarry Studio type)
- **Look:** 10–15 min rise-and-fall narrative; dramatic voiceover over stock footage, motion graphics, archival-style images, music beds. MagnatesMedia's public formula: write a 10–15 min script, record dramatic VO, layer stock footage + motion graphics + music ([faceless.my](https://faceless.my/youtube/top-faceless-youtube-channels)).
- **Pipeline:** script LLM → TTS → stock footage fetch → ffmpeg/Remotion assembly → music → captions. Exactly the current Quarry pipeline.
- **Free:** Edge TTS + Pexels + ffmpeg (current). **Paid:** ElevenLabs Creator ($22/mo) + Envato Elements ($15–16/mo) ([elevenlabs.io/pricing](https://elevenlabs.io/pricing), [elements.envato.com](https://elements.envato.com/learn/envato-vs-storyblocks)).
- **GitHub Actions CPU:** YES — fully feasible (current setup proves it).
- **Examples:** MagnatesMedia, ColdFusion, LEMMiNO, RealLifeLore (~7.9M subs), Wendover Productions, PolyMatter, Economics Explained, Barely Sociable, Bobby Broccoli, Fredrik Knudsen ([faceless.my](https://faceless.my/youtube/top-faceless-youtube-channels), [Reddit r/LEMMiNO curated list](https://www.reddit.com/r/LEMMiNO/comments/11wc56d/a_curated_list_of_channels_which_make_videos)).

### 1.2 Social media fun / entertainment (Shorts, brainrot, memes)
- **Look:** 15–60s vertical videos; AI character voices over Minecraft-parkour/Subway-Surfers backdrops, Reddit-story readings, "Italian brainrot" character memes, chaotic captions. This is a dominant 2026 short-form genre with dedicated generator tools ([viggle.ai brainrot generator](https://viggle.ai/tools/brainrot-video-generator), [Opus brainrot workflow](https://www.opus.pro/agent/workflows/ai-brainrot-video-generator), [brainrotshorts.com](https://www.brainrotshorts.com/blog), [media.io guide](https://www.media.io/ai/explore/zone/italian-brainrot-ai-story-video-generator)).
- **Pipeline:** hook script → expressive TTS (ElevenLabs/Kokoro) → looping gameplay/still backdrop → word-level burned captions (Whisper timestamps) → ffmpeg crop to 9:16.
- **Free:** Kokoro TTS + ffmpeg + free gameplay loops. **Paid:** ElevenLabs + auto-caption APIs.
- **GitHub Actions CPU:** YES.
- **Caveat:** Shorts RPM is $0.03–$0.07 per 1,000 views vs $2–5 long-form ([air.io study](https://air.io/en/air-data-findings/youtube-shorts-rpm-vs-long-form-how-much-do-shorts-earn-in-2026)) — best used as a discovery funnel, not the revenue engine.

### 1.3 Tech educational / tutorials
- **Look:** 8–15 min; animated system diagrams, whiteboard-style hand-drawn explanations, screen recordings, slides with narration ([async.com whiteboard explainers](https://async.com/blog/faceless-youtube-channel-ideas), [Reddit r/FacelessVideos](https://www.reddit.com/r/FacelessVideos/comments/1u1zx8m/not_sure_how_to_make_faceless_educational_videos), [teleprompter.com](https://www.teleprompter.com/blog/faceless-video-ideas)).
- **Pipeline:** LLM script + mermaid/diagram generation (SVG — already have SVG rendering) → Remotion animated diagrams → TTS. Screen-recording steps require a real recording source (manual or headless browser Playwright recording, which CAN run on CPU).
- **Free:** SVG/Remotion diagrams + Edge TTS. **Paid:** ElevenLabs + Storyblocks b-roll.
- **GitHub Actions CPU:** YES (headless browser screen capture with Playwright/puppeteer works CPU-only; true GUI tutorials need a human).
- **Examples:** ByteByteGo-style format; tech/AI tutorials are repeatedly listed among top faceless niches with strong CPM ([vidIQ niche recs](https://vidiq.com/blog/post/start-youtube-automation-channel), [OutlierKit niches](https://outlierkit.com/resources/faceless-youtube-channels)).

### 1.4 Motivational
- **Look:** 5–10 min (and Shorts); inspirational speech audio + cinematic drone/nature stock footage + epic music, no host.
- **Examples:** Ben Lionel Scott (~3.38M subs, [benlionelscott.com](https://benlionelscott.com)); Motivation Madness (~3.83M subs, [tubeleader](https://www.tubeleader.com/youtube-channel/motivationmadness)); RedFrost Motivation (~1.96M); Business Motiversity (cited in [faceless.my motivation guide](https://faceless.my/niches/faceless-motivation-channel)).
- **Pipeline:** speech sourcing (licensed/public-domain clips) → TTS intros/outros → stock b-roll matching → music ducking under speech.
- **Free:** Pexels/Pixabay footage + ACE-Step underscores. **Paid:** Artgrid cinematic footage + Epidemic Sound.
- **GitHub Actions CPU:** YES.
- **Risk:** using copyrighted speech clips triggers claims; original-AI-written motivational scripts avoid this.

### 1.5 Product reviews
- **Look:** 8–12 min; VO over gadget b-roll, screen recordings, "Top 5" listicle structure, spec-table overlays; monetization heavily from Amazon affiliate links ([flarecut tech review guide](https://flarecut.com/blog/faceless-tech-review-channels), [vexub gadget reviews](https://vexub.com/blog/tech-gadget-reviews-faceless-youtube-ai), [fluxnote](https://fluxnote.io/guides/how-to-make-faceless-tech-review-videos)).
- **Pipeline:** LLM research script → product b-roll (stock or supplied assets) → spec graphics (Remotion/SVG) → TTS → affiliate links in description.
- **Free:** stock footage + SVG graphics. **Paid:** Storyblocks + ElevenLabs.
- **GitHub Actions CPU:** YES for review-style/listicle reviews; hands-on unboxings require supplied footage.
- **Examples:** faceless gadget channels documented in the guides above + Reddit case study ([r/juststart](https://www.reddit.com/r/juststart/comments/utnmdu/faceless_tech_youtube_channel_month_1)).

### 1.6 News / recap
- **Look:** daily/weekly 5–10 min recaps; anchor-less VO over event clips/graphics; needs fast turnaround (hours).
- **Legal core risk:** fair use covers commentary/criticism/news reporting but is a defense, not a shield — heavy unedited footage triggers Content ID claims and demonetization ([Google fair use support](https://support.google.com/youtube/answer/9783148), [Subscribr AI news guide](https://subscribr.ai/youtube-strategy/ai-news-channel-youtube-growth-copyright), [vidIQ avoid-claims](https://vidiq.com/blog/post/youtube-automation-avoid-copyright-claims), [Reddit movie-recap discussion](https://www.reddit.com/r/movies/comments/1dsr585/are_movie_recap_channels_on_youtube_copyright)).
- **Pipeline:** RSS/news APIs → LLM summary + commentary → graphics (charts, headline cards) → TTS. Prefer original graphics over clips.
- **Free:** RSS + SVG graphics + Edge TTS. **Paid:** Envato (broadcast-style templates).
- **GitHub Actions CPU:** YES — and Actions' scheduled workflows (cron) are a natural fit for daily cadence.

### 1.7 Story / narrative (horror, creepypasta, drama)
- **Look:** 15–60 min bingeable narrations over atmospheric footage.
- **Examples:** Mr. Nightmare (7.1M), Chills (6.2M), MrCreepyPasta (1.7M) — all faceless narration channels ([vidpros list](https://vidpros.com/top-faceless-youtube-channels)).
- **Pipeline:** LLM original stories (avoids copyright) → atmospheric VO → dark stock footage loops → suspense music.
- **Free/paid:** same as documentary stack. **GitHub Actions CPU:** YES.

### 1.8 Listicles
- **Look:** "Top 10…" countdowns, 8–15 min; numbered on-screen cards + per-item b-roll.
- **Examples:** WatchMojo (25.8M subs), BRIGHT SIDE (44.5M), Chills countdowns ([vidpros](https://vidpros.com/top-faceless-youtube-channels)).
- **Pipeline:** most templatable type — list structure maps 1:1 to a Remotion template. **Free:** fully automatable. **GitHub Actions CPU:** YES (easiest type after documentaries).

### 1.9 Interviews (simulated)
- **Look:** two-host AI podcast discussion; NotebookLM "Audio Overviews" turned documents into a two-host fake podcast (Sept 2024) and went viral ([Google blog](https://blog.google/innovation-and-ai/products/notebooklm-audio-overviews), [PCMag](https://www.pcmag.com/news/google-ai-turns-your-notes-into-a-lively-podcast-with-2-fake-hosts)); Dec 2024 added live "join the conversation" ([ZDNet](https://www.zdnet.com/article/you-can-talk-to-the-ai-hosts-of-your-notebooklm-podcast-now)). Creators convert the audio to video with waveforms, captions, and AI host avatars ([Flowjin](https://www.flowjin.com/tools/notebooklm-podcast-video-maker), [hotelemarketer step-by-step](https://hotelemarketer.com/2024/10/20/from-google-notebooklm-audio-to-video-podcasts-step-by-step-guide)).
- **Pipeline:** LLM generates dialogue → two distinct TTS voices → waveform/avatar visualization (Remotion) → optional HeyGen avatars for premium.
- **Free:** two Edge-TTS/Kokoro voices + waveform video. **Paid:** ElevenLabs multi-voice + HeyGen API.
- **GitHub Actions CPU:** YES (waveform/avatar version). Avatar-video version needs API (still CPU on your side).

### 1.10 Kids / education
- **Look:** 3D-animated nursery rhymes / lessons; Cocomelon is the archetype — 3rd most-subscribed channel on YouTube, 200M+ subs, 220B+ views ([Wikipedia](https://en.wikipedia.org/wiki/Cocomelon)). A tooling ecosystem now automates the Cocomelon style ([atlabs.ai](https://www.atlabs.ai/blog/best-5-ai-tools-to-make-cocomelon-style-videos-in-2026), [autodraft tutorial](https://autodraft.in/blog/cocomelon-youtube-songs-videos-for-kids), [autopilotshorts](https://autopilotshorts.com/cocomelon-shorts-generator)).
- **Monetization trap:** content marked "Made for Kids" gets NO personalized ads (COPPA) — RPM typically $1–3 vs $5–15 general; no comments, end screens, playlists, or notifications; repeat low-quality kids content risks YPP suspension ([gyre.pro](https://gyre.pro/blog/how-to-monetize-a-youtube-kids-channel), [YouTube monetization policies](https://support.google.com/youtube/answer/1311392), [air.io MFK explainer](https://air.io/en/youtube-glossary/what-does-made-for-kids-mean-on-youtube), [Reddit NewTubers](https://www.reddit.com/r/NewTubers/comments/1fuabdl/youtube_channel_made_for_kids_and_monetization)). COPPA fines can reach ~$42K/violation ([post-bridge guide](https://www.post-bridge.com/blog/how-to-start-a-youtube-channel-for-kids)).
- **GitHub Actions CPU:** YES for 2D/SVG animation style; 3D character animation is a major pipeline lift.

### 1.11 Gaming
- **Look:** gameplay + voice commentary, no face cam. Proof it works: Dream (tens of millions of subs pre-face-reveal), Technoblade (pig avatar, never showed face), plus Rust creators Frost, Willjum, Stevie, Glock9 ([awisee/vidiq roundups](https://awisee.com), [Reddit r/youtubegaming](https://www.reddit.com/r/youtubegaming/comments/1hxek3z/is_a_faceless_gaming_channel_even_feasible), [Reddit r/Technoblade](https://www.reddit.com/r/Technoblade/comments/vseyw9/are_there_any_other_youtubers_that_are_even)).
- **Pipeline constraint for automation:** capturing modern gameplay requires a GPU game capture — NOT feasible CPU-only on GitHub Actions. Automatable variants: retro/emulated gameplay, Minecraft-parkour backdrop loops for shorts, or supplied footage.
- **Monetization:** gaming CPM $2–8 ([virvid](https://virvid.ai/blog/faceless-youtube-channel-ideas-20-profitable-niches-2026)).

### 1.12 Health / fitness
- **Look:** demo footage + VO narration (Fitness Blender style), stick-figure exercise animations, whiteboard explainers, motivational compilation formats ([facelesslist fitness](https://facelesslist.com/categories/fitness), [Feedspot workout channels](https://videos.feedspot.com/workout_youtube_channels), [Healthline list](https://www.healthline.com/health/fitness/free-youtube-fitness-channels)).
- **Pipeline:** exercise DB → LLM routines → stock fitness b-roll or animated figure SVGs → TTS.
- **Risk:** medical claims → YPP scrutiny; add disclaimers.
- **GitHub Actions CPU:** YES (stock/animated variants).

### 1.13 Travel
- **Look:** destination guides (Touropia-style), 4K walking tours, drone compilations; $4–12 CPM ([flowshorts travel guide](https://flowshorts.app/how-to-start-a-faceless-youtube-channel/travel)).
- **Examples:** Touropia, HP Walking Tours, Nomadic Ambience, Island Hopper TV, Beautiful Destinations ([Reddit r/TravelTubers](https://www.reddit.com/r/TravelTubers/comments/1ozl54n/are_there_any_faceless_youtube_channels_here_if), [fluxnote travel ideas](https://fluxnote.io/guides/faceless-youtube-channel-ideas-travel)).
- **Pipeline:** city data → LLM guide script → stock footage per location → maps/labels overlay → TTS.
- **GitHub Actions CPU:** YES. Stock-library depth is the differentiator (Pexels coverage of smaller destinations is thin → premium = Storyblocks/Envato).

### 1.14 Cooking
- **Look:** recipe shorts (15–60s) and 5–10 min recipe videos; food niche CPM $6–18 ([Reddit faceless recipe guide](https://www.reddit.com/r/AIToolsTipsNews/comments/1wsawms/build_a_faceless_recipe_channel_with_ai_in_2026), [fluxnote cooking guide](https://fluxnote.io/guides/faceless-cooking-recipes-youtube-channel-2026)).
- **Pipeline:** recipe DB → script → food b-roll (stock) or AI food clips (text-to-video) → step cards → TTS.
- **Constraint:** authentic cooking footage is hard to fake with stock; AI video gen (Kling ~$0.083/s) can produce stylized food shots ([pixo.video comparison](https://pixo.video/blog/best-ai-video-generators)). Fully free tier = stylized recipe-card animations.
- **GitHub Actions CPU:** YES for recipe-card/stock variants.

### 1.15 Other high-automation types (bonus)
- **Ambient/white noise & lofi:** Relaxing White Noise (4.5M), Lofi Girl (15.8M), asmr zeitgeist (3.1M) — loop + static/animated art + ACE-Step music = near-zero marginal cost ([vidpros](https://vidpros.com/top-faceless-youtube-channels)).
- **DIY/crafts hands-only:** Kuti Bari (4.0M) — needs supplied footage, not automatable end-to-end ([vidpros](https://vidpros.com/top-faceless-youtube-channels)).
- **Comedy stick-figure animation:** Casually Explained (4.2M) — automatable with SVG character rigs ([vidpros](https://vidpros.com/top-faceless-youtube-channels)).

---

## 2. TEXT-TO-VIDEO AI (2026)

| Model | Access / Price | Quality notes | CPU-only GitHub Actions? |
|---|---|---|---|
| **Sora 2 (OpenAI API)** | Was $0.10/sec @720p; Pro $0.30–$0.70/sec. **API SHUT DOWN Sept 24, 2026** ([OpenAI model docs](https://developers.openai.com/api/docs/models/sora-2)) | Top-tier; consumer access via ChatGPT Plus/Pro subscriptions | N/A (dead for API pipelines) |
| **Runway Gen-4** | 125 one-time free credits; ~12 credits per generated second of paid video ([pixo.video comparison](https://pixo.video/blog/best-ai-video-generators)) | Premium camera control | No (use API) |
| **Kling 2.6** | Standard ~$10/mo, Pro ~$37/mo (~3,000 credits); free monthly credits; API ~$0.083/sec @720p ([pixo.video](https://pixo.video/blog/best-ai-video-generators), [crazyrouter](https://crazyrouter.com/en/blog/ai-video-generation-api-pricing-may-2026-comparison)) | Best budget commercial; strong motion | No (use API) |
| **Veo 3 (Google)** | ~$0.13–0.15/sec @720p with native audio ([crazyrouter](https://crazyrouter.com/en/blog/ai-video-generation-api-pricing-may-2026-comparison)) | Best native audio sync | No (use API) |
| **Pika** | Free 80 credits/mo (480p); Standard $8–10/mo (700 credits ≈50 videos); Pro $28/mo; Fancy $76/mo; 60 credits = $1 ([pika.art/pricing](https://pika.art/pricing)) | Effects/stylization | No (use API) |
| **Luma Dream Machine (Ray3)** | 20 credits per 5-sec T2V; Lite $7.99–10/mo (~3,200 credits), Plus $30, Pro $90, Ultra $300 ([lumalabs.ai/pricing](https://lumalabs.ai/pricing)) | Good image-to-video | No (use API) |
| **LTX-2 (Lightricks)** | **Open weights since Jan 6, 2026** — free self-host; 4K @50fps, synchronized audio+video, 10-sec sequences ([GitHub Lightricks/ltx-video](https://github.com/Lightricks/ltx-video)) | First production-ready open A/V model | **No** — diffusion model needs GPU |
| **Wan 2.2 (Alibaba)** | Apache 2.0. TI2V-5B: 720p@24fps on 24GB VRAM (5-sec clip <9 min on RTX 4090); A14B models: 80GB VRAM ([GitHub Wan-Video/Wan2.2](https://github.com/Wan-Video/Wan2.2)) | Best open suite; T2V/I2V/S2V/animate modes | **No** |
| **HunyuanVideo (Tencent)** | Open; 13B; officially 45–60GB VRAM; ~14GB with offloading (v1.5); ~24GB FP8 ([GitHub](https://github.com/Tencent-Hunyuan/HunyuanVideo), [thundercompute](https://www.thundercompute.com/blog/best-open-source-ai-video-generation-models)) | Strong open quality | **No** |
| **Mochi (Genmo)** | Open; ~24–28GB full precision, ~8GB quantized @720p ([thundercompute](https://www.thundercompute.com/blog/best-open-source-ai-video-generation-models), [forasoft self-host guide](https://www.forasoft.com/learn/ai-for-video-engineering/articles-ai/self-hosting-hunyuanvideo-cogvideox-mochi-ltx)) | Lightweight open option | **No** |
| **CogVideoX** | Open; ~16GB+ typical, lighter than peers ([thundercompute](https://www.thundercompute.com/blog/best-open-source-ai-video-generation-models)) | Good for short clips | **No** (borderline; too slow on CPU) |

**Key takeaways for Quarry Studio:**
1. No open text-to-video model runs acceptably on a CPU-only GitHub Actions runner — all need GPU ([thundercompute](https://www.thundercompute.com/blog/best-open-source-ai-video-generation-models)).
2. The realistic free path stays stock footage; AI video is a **premium b-roll insert** (5–10s hero shots) via Kling/Pika APIs at ~$0.08–0.10/sec.
3. Premium upgrade path without leaving Actions: GitHub offers **GPU-hosted runners** (4 vCPU + NVIDIA T4), GA since July 2024, per-minute billed ([GitHub changelog](https://github.blog/changelog/2024-07-08-github-actions-gpu-hosted-runners-are-now-generally-available), [runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing)); third-party RunsOn supplies H100/H200 runners for Actions ([runs-on.com](https://runs-on.com/docs/runners/platforms/gpu)).

---

## 3. TEXT-TO-SPEECH

| Tool | Free | Paid | Quality tier | Notes |
|---|---|---|---|---|
| **Edge TTS** (current) | 100% free, no API key ([GitHub rany2/edge-tts](https://github.com/rany2/edge-tts)) | — | Good (neural MS voices) | Unofficial Microsoft endpoint — could be restricted anytime; library is GPL-3.0 (verify SaaS-linking implications) |
| **Kokoro-82M** | Apache-2.0 weights, local, 24kHz, 9 languages ([GitHub hexgrad/kokoro](https://github.com/hexgrad/kokoro)) | — | Comparable to larger models per README; runs on CPU/MPS | Best fully-owned free option; drops Edge TTS dependency risk |
| **ElevenLabs** | 10k credits (~10 min)/mo ([elevenlabs.io/pricing](https://elevenlabs.io/pricing)) | Starter $6/30k; Creator $22/121k; Pro $99/990k; Scale $299 | Best-in-class emotional/clone | Creator plan ≈2 hrs audio/mo |
| **OpenAI TTS** | — | gpt-4o-mini-tts $12/1M audio output tokens; tts-1 $15/1M chars; tts-1-hd $30/1M chars ([OpenAI pricing](https://developers.openai.com/api/docs/pricing)) | Very good, simple API | ~$0.60–0.75 per 10-min video (mini-tts est.) |
| **Murf** | Free: 15 min VO, 60+ voices ([murf.ai/pricing](https://murf.ai/pricing)) | Creator ~$19/mo annual (~$29 monthly); Business ~$66–99 ([murf.ai](https://murf.ai/pricing), [Elegant Themes review](https://www.elegantthemes.com/blog/business/murf-ai-review)) | Good studio-style VO | Some complaint volatility on plan changes ([Trustpilot](https://www.trustpilot.com/review/murf.ai)) |
| **Play.ht** | Free tier exists | Premium tiers (pricing page not retrievable this session — verify at play.ht) | Good | Voice-cloning focused |

**Best free:** Kokoro (owned, Apache-2.0) with Edge TTS as zero-cost fallback. **Best paid:** ElevenLabs Creator $22/mo.

---

## 4. VIDEO EDITING / RENDER APIs

| Tool | Pricing | Model | vs. current (Remotion+ffmpeg) |
|---|---|---|---|
| **Remotion** (current) | Free for individuals/companies ≤3 people incl. commercial; Company $25/seat/mo; **Automators $0.01/render with $100/mo minimum**; Enterprise $500/mo min ([remotion.dev terms](https://www.remotion.dev/docs/terms), [license pricing](https://www.remotion.dev/docs/license/pricing), [LICENSE.md](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md)) | Source-available, code-first | Quarry Studio likely crosses the Automators threshold when operating as a 4+-person for-profit SaaS rendering programmatically — budget $100/mo or stay ≤3 people |
| **Shotstack** | ~$0.30 per rendered output minute ([shotstack comparison](https://shotstack.io/vs/creatomate-alternatives)) | Usage-based hosted API | 10-min video ≈ $3/render — expensive at volume ([verygoodffmpeg](https://verygoodffmpeg.com/blog/best-video-editing-api-concatenate-resize-trim-clips-2026)) |
| **Creatomate** | From ~$49–54/mo for ~143 min 720p ([json2video comparison](https://json2video.com/how-to/creatomate-alternative), [plainlyvideos](https://www.plainlyvideos.com/blog/creatomate-vs-shotstack)) | Template-driven with visual editor | Good for non-dev template flows |
| **Bannerbear** | Automate $49/mo (1,000 API credits); Scale $149/mo; Enterprise $299/mo; video tools cost 1–4 credits/step, animation 2 credits/sec, 60fps doubles cost ([bannerbear.com/pricing](https://www.bannerbear.com/pricing/)) | API + workflows | Image-first, video capable; pricey per second |
| **Editframe** | Video API competitor (pricing not verified this session) | API | — |

**Verdict:** Self-hosted Remotion on Actions remains cheapest per video; per-minute hosted APIs (Shotstack/Creatomate) only win when you need their managed infra.

---

## 5. STOCK FOOTAGE

| Source | Cost | Depth / fit | Source |
|---|---|---|---|
| **Pexels / Pixabay** (current) | Free | Solid for generic b-roll; thin in niche (small-town travel, gadgets, food process shots) | Current pipeline |
| **Envato Elements** | ~$14.85–16.50/mo annual, unlimited downloads incl. footage+music+templates | Best value all-in-one | [elements.envato.com](https://elements.envato.com/learn/envato-vs-storyblocks) |
| **Storyblocks** | ~2x Envato price (community consensus) | Deepest video-first library | [Reddit r/editors](https://www.reddit.com/r/editors/comments/166dhjr/envato_artlist_or_storyblocks) |
| **Artgrid** | Premium (similar to Storyblocks) | Cinematic film-look footage | [Reddit r/editors](https://www.reddit.com/r/editors/comments/166dhjr/envato_artlist_or_storyblocks), [storyblocks blog](https://www.storyblocks.com/resources/blog/artlist-vs-storyblocks-which-one-is-right-for-you) |

---

## 6. AI AVATARS

| Tool | Price | API / automation | Quality |
|---|---|---|---|
| **HeyGen** | Creator ~$24–29/mo (600 credits ≈150 min standard); API $0.0167–$0.0667/sec by model | Full API, per-second billing — best for automated pipelines | Best price-per-minute; Avatar V top quality ([synthesia alternatives analysis](https://www.synthesia.io/post/best-d-id-alternatives)) |
| **D-ID** | From ~$4.7–5.9/mo; API per video-second | API on standard plans; fastest render, cheapest | Lip-sync/realism trails HeyGen/Tavus ([synthesia.io](https://www.synthesia.io/post/best-d-id-alternatives)) |
| **Synthesia** | Free basic; Starter $19/mo ($14 annual); Creator $89/mo ($59 annual); enterprise-gated API | API enterprise-oriented | Enterprise favorite, training-video polish ([synthesia.io](https://www.synthesia.io/post/best-d-id-alternatives)) |

**Automation verdict:** Yes — HeyGen API slots into an Actions workflow for a "talking presenter" premium tier (interviews, tutorials, news anchor style).

---

## 7. SUBTITLES / CAPTIONS

| Tool | Free | Paid | Source |
|---|---|---|---|
| **Whisper (local)** | Free, open-source ([GitHub openai/whisper](https://github.com/openai/whisper)) | API $0.006/min ([OpenAI pricing](https://developers.openai.com/api/docs/pricing)) | Local CPU inference works on Actions (slow for long audio; faster-whisper helps) |
| **Deepgram** | $200 free credit (~43k min) | Nova-3 pre-recorded $0.0043/min PAYG ($0.26/hr); Growth $4k/yr prepay ([deepgram.com/pricing](https://deepgram.com/pricing)) | Cheapest hosted per-hour |
| **AssemblyAI** | $50 free credits | Universal-2 $0.15/hr; Universal-3.5 Pro $0.21/hr; add-ons +$0.01–0.15/hr ([assemblyai.com/pricing](https://www.assemblyai.com/pricing)) | Rich add-ons (chapters, sentiment) |
| **Rev** | 45 AI min/mo free | Essentials $29.99/seat/mo (5,000 AI min); human captions $1.99/min ([rev.com/pricing](https://www.rev.com/pricing)) | Human accuracy tier |

---

## 8. MUSIC

| Source | Free | Paid / licensing | Source |
|---|---|---|---|
| **ACE-Step** (current) | Apache 2.0, own your output; v1.5 Jan 2026; 3.5B; ~8GB VRAM w/ offload; 1-min track in ~1.7–4.7s on RTX GPUs, ~26s on M2 Max | — | [GitHub ace-step/ACE-Step](https://github.com/ace-step/ACE-Step) |
| **Suno** | Free tier = personal non-commercial only | Pro $10/mo ($8 annual): 2,500 credits (~500 songs), commercial rights on downloads; Premier $30/mo ([suno.com/pricing](https://suno.com/pricing), [undetectr rights guide](https://undetectr.com/blog/suno-commercial-use)) | Commercial rights only while on paid plan |
| **Udio** | 10 credits/day, 100/mo | Standard $10/mo: 2,400 credits; Pro $30/mo: 6,000 ([udio.com/pricing](https://www.udio.com/pricing)) | — |
| **Epidemic Sound** | Trial | Creator $9.99/mo (annual); Pro $16.99/mo annual / $39.99 monthly; **canceling can trigger claims on already-published videos** ([Reddit r/videography comparison](https://www.reddit.com/r/videography/comments/1s1u4tc/epidemic_artlist_musicbed_in_2026_who_actually)) | Subscription-locked licensing |
| **Artlist** | — | ~$199/yr (~$16.58/mo) unlimited; license survives cancellation ([Reddit r/videography](https://www.reddit.com/r/videography/comments/1s1u4tc/epidemic_artlist_musicbed_in_2026_who_actually)) | Cleanest licensing for client work |
| **Musicbed** | — | $29.99–$109.98/mo tiers; premium artist quality ([Reddit r/videography](https://www.reddit.com/r/videography/comments/1s1u4tc/epidemic_artlist_musicbed_in_2026_who_actually)) | Highest cost |

**ACE-Step advantage:** Apache-2.0 + ownership means zero recurring cost and no license-claim risk — a genuine differentiator vs Suno/Epidemic for a SaaS. Caveat: music diffusion on CPU is slow but workable for background beds (already proven in current pipeline).

---

## 9. WHAT PERFORMS BEST ON YOUTUBE (2026 data)

### RPM by niche (faceless-relevant)
| Niche | RPM / CPM | Source |
|---|---|---|
| Finance / personal finance | $10–25 RPM; $15–25 CPM | [virvid](https://virvid.ai/blog/faceless-youtube-channel-ideas-20-profitable-niches-2026), [OutlierKit](https://outlierkit.com/resources/faceless-youtube-channels) |
| Tech / AI / software | High (top-tier group with finance) | [vidIQ](https://vidiq.com/blog/post/start-youtube-automation-channel) |
| Food | $6–18 CPM | [Reddit faceless recipe guide](https://www.reddit.com/r/AIToolsTipsNews/comments/1wsawms/build_a_faceless_recipe_channel_with_ai_in_2026) |
| Travel | $4–12 CPM | [flowshorts](https://flowshorts.app/how-to-start-a-faceless-youtube-channel/travel) |
| Gaming | $2–8 CPM | [virvid](https://virvid.ai/blog/faceless-youtube-channel-ideas-20-profitable-niches-2026) |
| Broad entertainment | $2–6 RPM (lowest) | [virvid](https://virvid.ai/blog/faceless-youtube-channel-ideas-20-profitable-niches-2026) |
| Kids ("Made for Kids") | $1–3 RPM (no personalized ads, COPPA) | [gyre.pro](https://gyre.pro/blog/how-to-monetize-a-youtube-kids-channel) |

### By format
- **Shorts vs long-form:** Shorts RPM $0.03–0.07/1,000 views; long-form $2–5 average (range $1.61–29.30). Shorts earn 3–14% of long-form RPM — need ~11k–34k Shorts views to equal 1,000 long-form views ([air.io data study](https://air.io/en/air-data-findings/youtube-shorts-rpm-vs-long-form-how-much-do-shorts-earn-in-2026), [virvid](https://virvid.ai/blog/shorts-vs-long-form-revenue-reality-2026), [fluxnote](https://fluxnote.io/guides/youtube-shorts-vs-long-form-rpm)). Mid-rolls (8+ min videos) are a major RPM driver in finance/tech ([air.io](https://air.io/en/air-data-findings/youtube-shorts-rpm-vs-long-form-how-much-do-shorts-earn-in-2026)).
- **CTR benchmarks:** half of videos sit between 2–10% impressions CTR (YouTube official); average ~3–4%; 5–7% is strong; education/tutorial ~4% is solid ([ThumbMagic benchmarks](https://www.thumbmagic.co/blog/youtube-thumbnail-ctr-benchmarks), [YouTube Help](https://support.google.com/youtube/answer/2015965)).
- **Length:** average YouTube video length ~11–12 min across studies ([globalmediainsight](https://www.globalmediainsight.com/blog/youtube-users-statistics), [Business of Apps](https://www.businessofapps.com/data/youtube-statistics), [Wyzowl](https://wyzowl.com/youtube-stats)); 8+ minutes unlocks mid-roll ads.
- **Reality check:** faceless "automation-style" videos outperform 10x only ~3.1% of the time, and quality/editorial effort separates winners ([OutlierKit](https://outlierkit.com/resources/faceless-youtube-channels)); one creator running 12 faceless channels had 3 demonetized in 4 days (Medium case study, via [search summary](https://medium.com/the-youtube-playbook/261-000-subscribers-in-5-months-with-20-videos-faceless-youtube-channel-case-study-406823801bcc)). A successful counter-example: 261k subs in 5 months from just 20 well-edited videos ([same Medium case study](https://medium.com/the-youtube-playbook/261-000-subscribers-in-5-months-with-20-videos-faceless-youtube-channel-case-study-406823801bcc)).

**Strategic ranking for Quarry Studio (revenue-first):**
1. Finance/old-money documentaries (current) — top RPM, already proven
2. Tech/AI explainers — high RPM + automatable diagrams
3. Long-form listicles/story — mid RPM, highest template reuse
4. Motivational — easy production, moderate RPM, stock-heavy
5. Travel/food/cooking guides — good CPM, stock-dependent
6. Shorts (any niche) — growth funnel only, not revenue
7. Kids/gaming — high volume but weak RPM or automation blockers

---

## 10. QUALITY EXPECTATIONS & WHAT USERS WILL PAY

### Equipment/quality bar (2026)
- **1080p is sufficient** for monetization and performance; YPP has no resolution requirement. 4K helps perceived quality/TV viewing but costs 25–35 Mbps upload and heavy rendering ([Reddit r/youtubers](https://www.reddit.com/r/youtubers/comments/12kzl3o/do_you_really_need_to_upload_in_4k_or_is_1080p), [Provideocoalition](https://www.provideocoalition.com/uploading-to-youtube-is-4k-worth-it), [Telycam](https://telycam.com/4k-vs-1080p-which-is-right-for-your-production-workflow.html)).
- What actually differentiates faceless channels: **audio quality, retention editing, hooks, thumbnails** — not resolution ([Reddit r/youtubers](https://www.reddit.com/r/youtubers/comments/12kzl3o/do_you_really_need_to_upload_in_4k_or_is_1080p)). This validates investing premium budget in TTS (ElevenLabs) + thumbnails (CTR 5–7%+ target) before 4K.

### Competitor pricing (self-serve AI video SaaS)
| Competitor | Entry | Mid | Top | Source |
|---|---|---|---|---|
| AutoShorts.ai | $19/mo (3 posts/wk) | $39/mo daily | $69/mo 2x daily | [blotato comparison](https://www.blotato.com/blog/faceless-video-generators), [frameloop comparison](https://frameloop.ai/blog/ai-video-generator-pricing-compared) |
| faceless.video | $20/mo (15 videos) | $35/mo (30 videos) | $149/mo unlimited | [faceless.video/pricing](https://faceless.video/pricing) |
| Pictory | $19/mo annual ($25 monthly) | higher tiers by minutes | — | [pictory.ai comparison](https://pictory.ai/blog/pictory-vs-invideo) |
| InVideo AI | ~$25/mo Plus (2,000 credits) | Max 5,000 credits | — | [invideo.io/pricing](https://invideo.io/pricing) |
| Blotato (example alternative) | Free 3 videos/mo | $29 Creator | $49 Pro (4K) | [blotato](https://www.blotato.com/blog/faceless-video-generators) |

### DFY (done-for-you) market rates
- **DFY Dave (agency):** ~$695–$2,295 one-time build tiers ([dfydave.com](https://www.dfydave.com), [Trustpilot](https://www.trustpilot.com/review/dfydave.com)).
- **Outsourced production:** $100–$500 per video (vidIQ), $100–$300/video freelancers ([vidIQ guide](https://vidiq.com/blog/post/start-youtube-automation-channel), [fluxnote cost breakdown](https://fluxnote.io/guides/youtube-automation-cost-breakdown)).
- **Full managed AI pipelines:** $800–$1,800/mo ([makeaivideo guide](https://makeaivideo.ai/blog/youtube-automation)).
- **DIY AI-tool stack:** $35–$80/mo + $9–$39 credits ([makeaivideo](https://makeaivideo.ai/blog/youtube-automation), [vidIQ](https://vidiq.com/blog/post/start-youtube-automation-channel)).

### Does $99–149/mo DFY work for Quarry Studio?
**Yes — with positioning.** $99–149/mo sits in the dead zone between $20–39 self-serve tools and $800–1,800 managed agencies. It is defensible when the pitch is:
1. **Niche + type variety competitors lack** — most competitors do shorts-only (AutoShorts, faceless.video); long-form finance/tech/documentary + 14 other types is a differentiator.
2. **Premium TTS tier** — ElevenLabs Creator $22/mo covers ~2 hrs/mo (~12–24 long-form videos), keeping COGS ~$25–40/mo per active customer ([elevenlabs.io/pricing](https://elevenlabs.io/pricing)).
3. **A human-QA pass** — the #1 differentiator vs $20 tools, justified by the 3.1% outlier stat (quality is what wins) ([OutlierKit](https://outlierkit.com/resources/faceless-youtube-channels)).
4. **Justified premium upsells:** AI b-roll via Kling API (~$0.083/s ≈ $5–10/video of hero shots) ([pixo.video](https://pixo.video/blog/best-ai-video-generators)); HeyGen avatar segments for tutorials/interviews ($0.0167–0.0667/s) ([synthesia comparison](https://www.synthesia.io/post/best-d-id-alternatives)); Storyblocks/Envato ($15–30/mo shared) ([elements.envato.com](https://elements.envato.com/learn/envato-vs-storyblocks)).
5. **Video types that justify $99–149:** long-form documentaries, finance, tech explainers, news recap (value = speed), and daily-posting plans. Types that DON'T justify it: gaming (capture-blocked), kids (RPM trap), pure shorts (RPM too low to show client ROI).

**Unit economics snapshot (long-form doc, premium tier):** ElevenLabs ~$2/video + Envato amortized ~$1 + ACE-Step $0 + compute ~$0.05–0.20 (Actions Linux 2-core at $0.002/min; [GitHub pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing)) ≈ **$3–5 COGS per video** → at $99/mo for 12–15 videos, gross margin >90% before support labor.

---

## RECOMMENDED PIPELINE PER VIDEO TYPE

| Video type | TTS | Visuals | Editing | Music | Total cost/video (free tier) | GitHub Actions CPU feasible? | Premium upgrade |
|---|---|---|---|---|---|---|---|
| Documentary | Edge TTS / Kokoro | Pexels + SVG maps/cards | ffmpeg+Remotion (current) | ACE-Step | ~$0 | YES | ElevenLabs + Envato + Kling b-roll (~$5–8) |
| Social/entertainment Shorts | Kokoro (expressive) | Gameplay loops, stills, meme art | ffmpeg 9:16 + Whisper captions | ACE-Step | ~$0 | YES | ElevenLabs voices + Brainrot-style AI chars via API |
| Tech tutorial/explainer | Edge/Kokoro | SVG diagrams (Remotion-animated) + headless screen capture | Remotion | ACE-Step (subtle) | ~$0 | YES | ElevenLabs + hand-animated diagram templates |
| Motivational | Edge TTS | Pexels cinematic + slow-mo | ffmpeg (crossfades, LUTs) | ACE-Step epic bed | ~$0 | YES | Artgrid footage + licensed speeches + Epidemic |
| Product review | Edge/Kokoro | Stock gadget b-roll + spec SVG cards | Remotion list template | ACE-Step | ~$0 | YES | Storyblocks + affiliate-page overlay automation |
| News/recap | Edge TTS (fast) | RSS→SVG headline cards, charts | Remotion (cron-triggered) | ACE-Step news bed | ~$0 | YES (cron native) | Deepgram quick-turn captions + HeyGen anchor |
| Story/narrative | Edge TTS (or ElevenLabs) | Dark atmospheric stock loops | ffmpeg long-form | ACE-Step suspense | ~$0 | YES | ElevenLabs + original commissioned covers |
| Listicle | Edge TTS | Per-item stock + numbered SVG cards | Remotion template (easiest) | ACE-Step | ~$0 | YES | Envato templates + ElevenLabs |
| Simulated interview | 2× different TTS voices | Waveform + AI host avatars (SVG/Remotion) | Remotion podcast layout | — | ~$0 | YES | HeyGen API avatar hosts (~$1–4/min) |
| Kids/education | Edge TTS (child-friendly voices) | 2D SVG character animation | Remotion | ACE-Step songs | ~$0 | YES | Atlabs/Autodraft-style 3D tools; warn MFK RPM trap |
| Gaming | Kokoro | *Supplied footage* or retro/emulated capture | ffmpeg | ACE-Step | ~$0 | PARTIAL (capture needs GPU) | GPU runner + supplied VOD imports |
| Health/fitness | Edge TTS | Stock workout b-roll + exercise SVG figures | Remotion | ACE-Step upbeat | ~$0 | YES | Storyblocks + ElevenLabs + disclaimers |
| Travel | Edge TTS | Stock/drone per destination + map overlays | Remotion | ACE-Step ambient | ~$0 | YES | Storyblocks destination depth + ElevenLabs |
| Cooking | Edge TTS | Stock food shots + step cards; Kling AI food clips | Remotion/ffmpeg | ACE-Step | ~$0 | YES | Kling food b-roll (~$5–10/video) + ElevenLabs |
| Ambient/lofi (bonus) | — | Animated SVG loops | ffmpeg loop encode | **ACE-Step is the product** | ~$0 | YES (long renders; consider self-hosted runner) | Custom album drops |

---

## SOURCES

**Video types & examples**
- https://faceless.my/youtube/top-faceless-youtube-channels
- https://www.reddit.com/r/LEMMiNO/comments/11wc56d/a_curated_list_of_channels_which_make_videos
- https://vidpros.com/top-faceless-youtube-channels
- https://medium.com/the-youtube-playbook/261-000-subscribers-in-5-months-with-20-videos-faceless-youtube-channel-case-study-406823801bcc
- https://outlierkit.com/resources/faceless-youtube-channels
- https://benlionelscott.com
- https://www.tubeleader.com/youtube-channel/motivationmadness
- https://faceless.my/niches/faceless-motivation-channel
- https://flarecut.com/blog/faceless-tech-review-channels
- https://vexub.com/blog/tech-gadget-reviews-faceless-youtube-ai
- https://fluxnote.io/guides/how-to-make-faceless-tech-review-videos
- https://www.reddit.com/r/juststart/comments/utnmdu/faceless_tech_youtube_channel_month_1
- https://support.google.com/youtube/answer/9783148
- https://subscribr.ai/youtube-strategy/ai-news-channel-youtube-growth-copyright
- https://vidiq.com/blog/post/youtube-automation-avoid-copyright-claims
- https://www.reddit.com/r/movies/comments/1dsr585/are_movie_recap_channels_on_youtube_copyright
- https://blog.google/innovation-and-ai/products/notebooklm-audio-overviews
- https://www.pcmag.com/news/google-ai-turns-your-notes-into-a-lively-podcast-with-2-fake-hosts
- https://www.zdnet.com/article/you-can-talk-to-the-ai-hosts-of-your-notebooklm-podcast-now
- https://www.flowjin.com/tools/notebooklm-podcast-video-maker
- https://hotelemarketer.com/2024/10/20/from-google-notebooklm-audio-to-video-podcasts-step-by-step-guide
- https://en.wikipedia.org/wiki/Cocomelon
- https://www.atlabs.ai/blog/best-5-ai-tools-to-make-cocomelon-style-videos-in-2026
- https://autodraft.in/blog/cocomelon-youtube-songs-videos-for-kids
- https://autopilotshorts.com/cocomelon-shorts-generator
- https://www.reddit.com/r/youtubegaming/comments/1hxek3z/is_a_faceless_gaming_channel_even_feasible
- https://www.reddit.com/r/Technoblade/comments/vseyw9/are_there_any_other_youtubers_that_are_even
- https://facelesslist.com/categories/fitness
- https://videos.feedspot.com/workout_youtube_channels
- https://www.healthline.com/health/fitness/free-youtube-fitness-channels
- https://www.reddit.com/r/TravelTubers/comments/1ozl54n/are_there_any_faceless_youtube_channels_here_if
- https://fluxnote.io/guides/faceless-youtube-channel-ideas-travel
- https://flowshorts.app/how-to-start-a-faceless-youtube-channel/travel
- https://www.reddit.com/r/AIToolsTipsNews/comments/1wsawms/build_a_faceless_recipe_channel_with_ai_in_2026
- https://fluxnote.io/guides/faceless-cooking-recipes-youtube-channel-2026
- https://viggle.ai/tools/brainrot-video-generator
- https://www.opus.pro/agent/workflows/ai-brainrot-video-generator
- https://www.brainrotshorts.com/blog
- https://www.media.io/ai/explore/zone/italian-brainrot-ai-story-video-generator
- https://async.com/blog/faceless-youtube-channel-ideas
- https://www.reddit.com/r/FacelessVideos/comments/1u1zx8m/not_sure_how_to_make_faceless_educational_videos
- https://www.teleprompter.com/blog/faceless-video-ideas

**Text-to-video**
- https://developers.openai.com/api/docs/models/sora-2
- https://pixo.video/blog/best-ai-video-generators
- https://crazyrouter.com/en/blog/ai-video-generation-api-pricing-may-2026-comparison
- https://pika.art/pricing
- https://lumalabs.ai/pricing
- https://github.com/Lightricks/ltx-video
- https://github.com/Wan-Video/Wan2.2
- https://github.com/Tencent-Hunyuan/HunyuanVideo
- https://www.thundercompute.com/blog/best-open-source-ai-video-generation-models
- https://www.forasoft.com/learn/ai-for-video-engineering/articles-ai/self-hosting-hunyuanvideo-cogvideox-mochi-ltx
- https://github.blog/changelog/2024-07-08-github-actions-gpu-hosted-runners-are-now-generally-available
- https://docs.github.com/en/billing/reference/actions-runner-pricing
- https://runs-on.com/docs/runners/platforms/gpu

**TTS**
- https://github.com/rany2/edge-tts
- https://github.com/hexgrad/kokoro
- https://elevenlabs.io/pricing
- https://developers.openai.com/api/docs/pricing
- https://murf.ai/pricing
- https://www.elegantthemes.com/blog/business/murf-ai-review
- https://www.trustpilot.com/review/murf.ai

**Editing APIs**
- https://www.remotion.dev/docs/terms
- https://www.remotion.dev/docs/license/pricing
- https://github.com/remotion-dev/remotion/blob/main/LICENSE.md
- https://shotstack.io/vs/creatomate-alternatives
- https://json2video.com/how-to/creatomate-alternative
- https://www.plainlyvideos.com/blog/creatomate-vs-shotstack
- https://verygoodffmpeg.com/blog/best-video-editing-api-concatenate-resize-trim-clips-2026
- https://www.bannerbear.com/pricing/

**Stock footage**
- https://elements.envato.com/learn/envato-vs-storyblocks
- https://www.reddit.com/r/editors/comments/166dhjr/envato_artlist_or_storyblocks
- https://www.storyblocks.com/resources/blog/artlist-vs-storyblocks-which-one-is-right-for-you

**Avatars**
- https://www.synthesia.io/post/best-d-id-alternatives

**Subtitles**
- https://github.com/openai/whisper
- https://deepgram.com/pricing
- https://www.assemblyai.com/pricing
- https://www.rev.com/pricing

**Music**
- https://github.com/ace-step/ACE-Step
- https://suno.com/pricing
- https://undetectr.com/blog/suno-commercial-use
- https://www.udio.com/pricing
- https://www.reddit.com/r/videography/comments/1s1u4tc/epidemic_artlist_musicbed_in_2026_who_actually

**Performance / monetization**
- https://virvid.ai/blog/faceless-youtube-channel-ideas-20-profitable-niches-2026
- https://air.io/en/air-data-findings/youtube-shorts-rpm-vs-long-form-how-much-do-shorts-earn-in-2026
- https://virvid.ai/blog/shorts-vs-long-form-revenue-reality-2026
- https://fluxnote.io/guides/youtube-shorts-vs-long-form-rpm
- https://www.thumbmagic.co/blog/youtube-thumbnail-ctr-benchmarks
- https://support.google.com/youtube/answer/2015965
- https://www.globalmediainsight.com/blog/youtube-users-statistics
- https://www.businessofapps.com/data/youtube-statistics
- https://wyzowl.com/youtube-stats
- https://gyre.pro/blog/how-to-monetize-a-youtube-kids-channel
- https://support.google.com/youtube/answer/1311392
- https://air.io/en/youtube-glossary/what-does-made-for-kids-mean-on-youtube
- https://www.reddit.com/r/NewTubers/comments/1fuabdl/youtube_channel_made_for_kids_and_monetization
- https://www.post-bridge.com/blog/how-to-start-a-youtube-channel-for-kids
- https://vidiq.com/blog/post/start-youtube-automation-channel

**Quality & pricing/market**
- https://www.reddit.com/r/youtubers/comments/12kzl3o/do_you_really_need_to_upload_in_4k_or_is_1080p
- https://www.provideocoalition.com/uploading-to-youtube-is-4k-worth-it
- https://telycam.com/4k-vs-1080p-which-is-right-for-your-production-workflow.html
- https://www.blotato.com/blog/faceless-video-generators
- https://frameloop.ai/blog/ai-video-generator-pricing-compared
- https://faceless.video/pricing
- https://pictory.ai/blog/pictory-vs-invideo
- https://invideo.io/pricing
- https://www.dfydave.com
- https://www.trustpilot.com/review/dfydave.com
- https://fluxnote.io/guides/youtube-automation-cost-breakdown
- https://makeaivideo.ai/blog/youtube-automation
