# BYOK providers & credential security — platform research 2026-10-24

Read-only research round for the v2 BYOK-first platform design (templates declare required CAPABILITIES — `script-gen`, `tts`, `image-gen`, `transcription`, `search` — and the system routes tasks to user-configured providers). Builds on `byok-api-keys-2026-10-09.md` (BYOK free tiers, vault encryption, CI key-delivery patterns), `api-keys-architecture-and-competitors-2026-10.md` (18-key inventory + competitor BYOK), `free-script-brains-2026-09.md`, `open-source-tts-2026-09.md` + `human-voice-tts-paralinguistics-2026.md` (voice stack), `own-music-generation-research-2026-10-11.md` (music licensing), and `tech-stack-research-2026-10-17.md` (voice-stack verdicts). This doc re-verifies every time-sensitive fact against official pages fetched **2026-10-24** and answers the three NEW questions: the full multi-modal provider matrix (§4.1), the minimal capability-routing abstraction (§4.2), and credential-security/cost-transparency practice (§4.3/§4.4).

**Free-taxonomy discipline used throughout** (per the owner constraint): **[OSS]** = open-source *license* (code and/or weights — says nothing about cost); **[free-local]** = runs free on your own hardware (cost = electricity + render minutes); **[free-quota]** = hosted API with a free monthly/daily allowance; **[free-credits]** = hosted service with one-time or monthly credit grants; **[paid]** = no meaningful free use. A model whose source is public but whose weights are non-commercial (CC-BY-NC, CPML) is labeled **[NC-weights]** and is NOT "free" for a monetized channel.

All external claims cite primary sources fetched 2026-10-24 unless dated otherwise. Anything not confirmable from a primary source today is marked **unverified**.

---

## 0. TL;DR verdicts

| # | Question | Verdict | One line |
|---|---|---|---|
| 1 | Best free script-gen path | **Unchanged: Gemini Flash-Lite → Groq gpt-oss-120b → Cerebras → local Ollama** | Free-tier quotas survived 2026; Google still trains on free-tier prompts — surface that to users. |
| 2 | Best free TTS path | **Kokoro (Apache-2.0) local for English/Hindi; Azure/edge-tts the only real Urdu voices** | No open model has an Urdu voice; XTTS-v2's CPML now confirmed to bar commercial use of *outputs* too. |
| 3 | Best free image-gen path | **FLUX.1-schnell + Qwen-Image (both Apache-2.0) locally; Gemini image models are NOT free-tier** | FLUX.1-dev remains a non-commercial trap; SD 3.5 community license = $1M revenue line. |
| 4 | Free video-gen | **Thin and getting thinner — Veo shut down in Gemini API on 2026-10-22** | Treat video-gen as paid-only capability; don't promise a free tier. |
| 5 | Free transcription | **Local faster-whisper/whisper.cpp (MIT) = unlimited; Gemini `gemini-3.5-transcribe` is free-of-charge tier; Whisper API $0.006/min** | Transcription is the cheapest capability to guarantee free. |
| 6 | Free research/search | **Tavily 1,000 credits/mo + Serper 2,500 one-time; Google CSE closed to new customers, dies 2027-01-01; Bing retired** | Brave restructured its free plan; budget search as a paid capability per user. |
| 7 | Routing abstraction | **Capability registry + per-tenant provider config + OpenAI-compatible endpoint as the universal adapter** | Don't build model routing (LiteLLM/OpenRouter own that); build capability resolution + fallback order. |
| 8 | Credential security | **AES-256-GCM envelope encryption, write-only UI, server-side decrypt only, fail-closed on 401/403** | Matches OWASP + Vercel/Supabase/OpenRouter practice; per-tenant KMS keys NOT practical for v1. |
| 9 | Cost ledger | **One `usage_events` table; prefer provider-reported usage, fall back to price tables** | OpenAI/Gemini/Anthropic return usage; local execution costs hardware time only. |
| 10 | Biggest v2 design trap | **NC-weights "free" models (FLUX.1-dev, XTTS-v2, F5-TTS, Fish-Speech hosted ban) and ElevenLabs free tier (no commercial license)** | The vault must store a license/commercial-use flag per provider config, not just a key. |

---

## 1. Provider matrix (platform plan §4.1)

### 1.1 Text / LLM (capability: `script-gen`, plus titles, metadata, translation)

**Table A — quotas and prices (fetched 2026-10-24)**

| Provider | Auth | Current models | Rate limits (free) | Context | Free tier (exact) | Card needed? | Paid price |
|---|---|---|---|---|---|---|---|
| Google Gemini API | API key (AI Studio "auth keys" since May 28, 2026; unrestricted keys rejected) | gemini-3.8-flash, 3.6-flash, 3.5-flash-lite, 3.1-flash-lite, 2.5-flash/pro/flash-lite, gemini-3.5-transcribe, 3.8-flash-tts | **No longer published** — "limits depend on various factors", view per-project in AI Studio; last published table (Dec 2025 archive): 2.5 Flash 10 RPM / 250K TPM / **250 RPD**; 2.5 Flash-Lite 15 RPM / 250K TPM / **1,000 RPD** | 1M for 2.5 family (per-model 3.x pages not fetched — **unverified today**) | "Free input & output tokens" on most Flash/TTS/transcribe models; grounding 500 RPD free. **Image models (nano-banana-2.1 etc.) NOT available free** | No | 3.8-flash $0.75→$1.50 in / $3.75→$7.50 out per 1M (Jan 2027); flash-lite $0.30/$2.50 |
| OpenAI | Bearer API key | gpt-6-astra $10/$50, gpt-6.1-sol $2/$10, gpt-6-luna $0.10/$0.50, gpt-5.4-mini $0.75/$4.50, gpt-4o-mini $0.15/$0.60 | n/a | ≤272K short / long-context pricing above | **None** ("No free API tier exists"; only moderation model free) | Yes | see models column |
| Anthropic | Bearer API key (`x-api-key`) | Claude Haiku 5.5 **$0.10/$0.50**, Sonnet 5.5 $2/$10, Opus 5.5 $4/$20, Fable 5.1/Mythos 5.1 $10/$50 | Tiers (Start/Build/Scale), no free tier | 1M standard on 4.6+ ("full 1M token context window at standard pricing") | **None** — "New users receive a small amount of free credits" only | Yes | see models column |
| Groq | Bearer API key | openai/gpt-oss-120b, gpt-oss-20b, qwen/qwen3.8-27b, whisper-large-v3(-turbo), orpheus TTS | Developer-plan base: gpt-oss-120b **30 RPM / 1K RPD / 8K TPM / 200K TPD**; whisper 20 RPM / 2K RPD / 7.2K audio-sec/hr. Free-plan tab exists in console (didn't render in fetch); archived 2025 free table: llama-3.3-70b 30 RPM / 1K RPD / 100K TPD (that model now retired from lineup) | per model (gpt-oss-120b ≈131K **unverified today**) | Free plan exists with per-org limits; numbers per-model in console | No | Developer pay-per-token tier |
| Cerebras | Bearer API key | gpt-oss-120b, qwen-3.8-27b | Free Trial: **5 RPM**, 30K uncached / 90K total TPM, 1M TPH, **1M TPD** | prior observation: free-tier context capped 8,192 (2026-09-08, **stale — re-verify**) | Free Trial tier as listed | unverified | Developer 1K RPM / 1M TPM, no TPD cap |
| OpenRouter | Bearer API key | 200+ models incl. `:free` variants | `:free` models: **20 RPM**; **50 RPD** (<$10 all-time credits) / **1,000 RPD** (≥ $9–10 all-time credits) | per underlying model | Free variants as above; BYOK requests exempt from free-tier gate | No | BYOK now costs **5% of list price** (correction vs prior file's "0%") |
| Hugging Face Inference | HF token | router.huggingface.co/v1 (OpenAI-compatible) to Groq/Cerebras/etc. | none published free | per provider | **Free users: $0 monthly credits** (must buy credits or go PRO $2/mo); pass-through pricing, no HF markup | No | pay-as-you-go at provider rates |
| Ollama [OSS+free-local] | none (localhost REST, OpenAI-compatible) | any GGUF (llama, qwen, gemma…) | none — your hardware | per model | unlimited, local | No | $0 (hardware) |
| vLLM [OSS+free-local] | none (self-hosted, OpenAI-compatible server) | 200+ HF architectures | none — your hardware | per model | unlimited, local | No | $0 (GPU hardware) |
| llama.cpp [OSS+free-local] | none (llama-server) | GGUF models | none — your hardware | per model | unlimited, local | No | $0 (CPU/GPU hardware) |

**Table B — policy columns**

| Provider | Commercial use on free tier? | Training on free-tier prompts? | Regional availability | Structured output / tool-calling | Local execution |
|---|---|---|---|---|---|
| Gemini API | Yes (rate-capped) | **YES — free-tier content "Used to improve our products"; paid tier "No"** (pricing page, 2026-10-22) | Most regions; not all countries | responseSchema/JSON mode + function calling (documented; not re-fetched today) | No (Gemma via AI Studio/Gemma 4 on paid only) |
| OpenAI | n/a (no free tier) | API data not used for training by default (per platform policy; not re-fetched today) | 160+ countries (unverified today) | JSON schema + tools, mature | No |
| Anthropic | n/a | Not for training by default (unverified today) | Broad; not all regions (unverified today) | Tools + JSON, mature | No |
| Groq | Yes (free plan) | "does not train on your data by default" (Services Agreement, cited in prior file) | Global cloud; org-level quotas | JSON mode + structured outputs (prior file verified) | No |
| Cerebras | Yes (Free Trial) | unverified | Global cloud | OpenAI-compatible tool calling (unverified today) | No |
| OpenRouter | Yes on `:free` variants (model-specific licenses still apply!) | Provider-dependent per routed provider | Global | Yes — OpenAI-format normalizes this | No |
| Hugging Face | Per underlying provider | per provider | Global router | via provider | No |
| Ollama / vLLM / llama.cpp | License of the model weights governs (per-model) | No external training | Anywhere hardware runs | Ollama structured outputs verified (free-script-brains file); llama.cpp grammars; vLLM OpenAI-compatible server incl. tools | **Yes — this is the point** |

Notes:
- Google's shift to per-project quotas and "auth keys" (May 28, 2026) is the single biggest BYOK-validation constraint for `script-gen` (prior file, §1): validate-on-save must accept the new key type.
- OpenRouter's 5% BYOK fee is a **correction** to `api-keys-architecture-and-competitors-2026-10.md` §3.1 ("0% markup"): the current docs state "The cost of using custom provider keys on OpenRouter is **5%** of what the same model/provider would cost."
- Free-model stacking reality check (unchanged conclusion): one Groq free key ≈ 5–10 channels/day (TPD-bound, prior file §2); Gemini Flash-Lite 1,000 RPD remains the largest free-quota single provider.

### 1.2 TTS (capability: `tts`)

**Table A — hosted services**

| Provider | Auth | Free tier (exact) | Card needed? | Commercial use on free tier? | Notes |
|---|---|---|---|---|---|
| ElevenLabs | Bearer API key | **10,000 credits/month** shared across TTS/STT/music/SFX (TTS = 1 credit/char; STT 330/min; music 900/min) | No | **NO — commercial license starts at Starter ($6/mo)** (pricing page, fetched today) | Flash/Turbo models 0.5–1 credit/char; 74 langs; no rollover on free |
| Google Cloud TTS | GCP service account / API key | **Billing required to use at all**; Chirp 3: HD voices **1M chars free/mo** then $30/1M; legacy WaveNet+Standard 0–4M free then $4/1M; Neural2+Polyglot 0–1M free then $16/1M; Studio 0–1M free then $160/1M; **Gemini-TTS voices: no free usage limit** | **Yes** (billing account) | Yes (Google ToS) | Best breadth of free chars among big clouds |
| Azure AI Speech | API key / Entra | F0: **0.5M neural chars free/mo**; STT 5 audio-hrs free/mo | Yes (Azure account; F0 needs subscription) | Yes (F0 ToS question exists in community — surface to users) | **Only mainstream provider with Urdu voices** (see below) |
| OpenAI TTS | Bearer | **None** — tts-1 $15/1M chars, tts-1-hd $30/1M, gpt-4o-mini-tts token-priced ($0.60 in / $12 audio out per 1M) | Yes | Yes | repo already uses `gpt-4o-mini-tts` with `whisper-1` alignment |
| edge-tts | none (unofficial client of Edge's online TTS) | free (unmetered, no key) | No | **Gray/ToS-risk** — no license to the service; Microsoft blocks non-Edge SSML; prior research verdict "fallback only, never client-facing in the SaaS" (tech-stack file §7) | GPL-3.0; the free **[free-hosted]** option with an expiry date |

**Table B — open-weight TTS [OSS], license of code vs weights, and language evidence**

| Model | Code license | Weights license | Commercial OK (monetized YouTube)? | Languages (evidence) | Hardware |
|---|---|---|---|---|---|
| Kokoro-82M | (repo MIT ecosystem) | **Apache-2.0** ("deployed in numerous projects and commercial APIs") | **Yes** | v1.0: 8 langs/54 voices; **Hindi confirmed**: hf_alpha, hf_beta, hm_omega, hm_psi (VOICES.md — all grade **C** quality) | CPU realtime, <2GB (prior file) |
| Piper | **MIT**; ⚠️ **repo archived Oct 6, 2025** → successor `OHF-Voice/piper1-gpl` | MIT (voices in `rhasspy/piper-voices`) | Yes | 42 locales/37 langs; **Hindi hi_IN: pratham, priyamvada (medium)**; **NO Urdu** | CPU, Raspberry Pi class |
| XTTS-v2 (Coqui) | repo Maven-derived; card = **Coqui Public Model License** | CPML — **"allows only non-commercial use of a machine learning model and its outputs"**; payment bar: "so far as you do not receive any direct or indirect payment arising from the use of the model or its output" | **NO — outputs included** (monetized channel = disallowed) | 17 langs incl. **Hindi (hi)**; **NO Urdu** | GPU-friendly (6s cloning) |
| F5-TTS | MIT | **CC-BY-NC** (Emilia data) | **NO** | ZH+EN only (model name `F5-TTS_Emilia-ZH-EN`) | GPU; RTF 0.15 PyTorch / 0.04 TRT-LLM on L20 |
| Fish-Speech | custom | **Fish Audio Community License**: commercial OK **only while annual gross revenue < $500K**; **"no license … to offer a Hosted Service … regardless of Your purpose or Annual Revenue"** — i.e., our BYOK SaaS routing users' TTS jobs through Fish-Speech would itself need a paid license; mandatory "Built with Fish Audio" attribution | Personal/small-biz yes; **platform-hosted NO** | S2-Pro claims ~100 langs (list not enumerated) | Consumer GPU (S2-Pro 4B) |
| Chatterbox (Resemble) | MIT (repo); weights license not separately stated on repo page — **unverified** | MIT ecosystem assumed | Yes per repo framing (weights license **unverified**) | Turbo/Nano (350M/110M) **English-only**; Multilingual V3 (500M) 23+ langs incl. **Hindi**; **NO Urdu**; Turbo/Nano have native `[laugh]`/`[chuckle]` tags | Nano "3x faster than realtime on 8 CPU cores" |

**Urdu verdict (do NOT recommend anything beyond Azure without direct evidence):** the only primary-sourced Urdu TTS voices today are Microsoft's — `ur-IN-GulNeural` (F), `ur-IN-SalmanNeural` (M), `ur-PK-UzmaNeural` (F), `ur-PK-AsadNeural` (M) (Azure language-support table, fetched today). These are reachable through Azure Speech (paid/free-quota) and, unofficially, edge-tts. Kokoro's Hindi voices are grade C and Piper's Hindi is medium quality — **no open-weight Urdu voice exists in any model checked today**. Quality of Azure's Urdu voices is **unverified** (no listening tests in this research); recommend a human QA pass before promising Urdu channels.

**Recommendation:** default `tts` capability per tenant = (1) ElevenLabs if the user's key has a paid plan, (2) Kokoro local, (3) Azure free quota (0.5M chars/mo), (4) edge-tts as last-resort with a visible "unofficial" flag. Never silently route paying commercial content through ElevenLabs' free tier (license violation) or Fish-Speech hosted (license violation for the platform).

### 1.3 Image generation (capability: `image-gen` — thumbnails, B-roll art)

| Provider / model | Type | License / terms | Free? | Card? | Commercial use? | Hardware / VRAM | Evidence notes |
|---|---|---|---|---|---|---|---|
| Gemini image (nano-banana-2.1, 3.1-flash-image, 3-pro-image) | hosted | Google ToS | **NOT on free tier** ("Not available" on free) | No for API | Yes (paid) | n/a | pricing page 2026-10-22: nano-banana-2.1 $30/1M image-output tokens (~$0.113/4K image) |
| OpenAI images (gpt-image-2 / 1.5 / 1-mini) | hosted | OpenAI ToS | No free tier | Yes | Yes | n/a | token-priced: gpt-image-1-mini $2.50 in / $8.00 out per 1M |
| Stability API (SD 3.5 family, Stable Image Ultra/Core) | hosted | Stability Community + AUP | **25 free credits** new accounts; 1 credit = $0.01 | No for trial | Yes (subject to license below) | n/a | SD 3.5 Large = 6.5 credits/img; SDXL from 0.9 credits |
| Together.ai image | hosted | provider terms | Free tier = LLM-only (Ternary Bonsai 27B $0/$0); images all paid | No | Yes | n/a | SDXL $0.0019/megapixel; nano-banana-pro $0.134/img |
| **FLUX.1-schnell** | open-weight | **Apache-2.0**: "can be used for personal, scientific, and commercial purposes" | **[free-local]** | No | **Yes — clean** | 12B BF16 (~24GB naive; cpu-offload lower — derived estimate) | 1–4 inference steps; the safest quality pick |
| **FLUX.1-dev** | open-weight | **Non-Commercial License** (weights); card says "Generated outputs can be used for personal, scientific, and commercial purposes" but model use is NC-gated | [NC-weights] | No | Model use NC; outputs conditionally commercial — **do not build product defaults on it** | 12B BF16 | gateway APIs (fal/replicate) run it paid |
| **SD 3.5 Large** | open-weight | **Stability Community License**: "Free for research, non-commercial, and commercial use for organizations or individuals with less than $1M … in total annual revenue" | [free-local under $1M] | No | Yes below $1M revenue | 8B (MMDiT) — big; heavy for CPU-only CI | competing-foundational-model clause; outputs owned |
| SDXL 1.0 | open-weight | **CreativeML Open RAIL++-M** (use-based restrictions; commercial use allowed) | [free-local] | No | Yes (with use restrictions) | ~3B (UNet+encoders) | old reliable; runs on 8GB with offload [community-known] |
| **Qwen-Image** | open-weight | **Apache-2.0** ("Qwen-Image is licensed under Apache 2.0") | [free-local] | No | **Yes — clean** | 20B BF16 (≈40GB naive — derived estimate; quantized variants exist) | best-in-class text rendering (en/zh) for thumbnail typography |
| PixArt-α / PixArt-Σ | open-weight | OpenRAIL++-M tag (α card 0.6B; Σ card README empty — license **unverified beyond tag**) | [free-local] | No | Yes per OpenRAIL++ family (use restrictions) | 0.6B — smallest, weakest | only for low-end users |

**Recommendation:** `image-gen` capability defaults: (1) FLUX.1-schnell or Qwen-Image via local/OpenAI-compatible gateway, (2) Stability API credits, (3) paid Gemini/OpenAI images for users who want top quality. The capability registry must carry the license class so the platform never defaults a monetized channel onto NC weights.

### 1.4 Video generation (capability: `video-gen`) — note only

- **Veo is GONE from the Gemini API**: "The Veo 3.1 Preview in the Gemini API has been shut down" (Oct 22, 2026); Google directs to `gemini-omni-1.1-flash` for video generation (paid: $1.50 in / $9.00 text out / $17.50 video out per 1M tokens ≈ $0.10/sec at 720p — pricing page).
- Runway / Luma Dream Machine / Kling: all effectively paid; secondary 2026 sources mention thin free credit drips (Luma trial credits; Kling ~66 credits/day claims) — **unverified against official pages today**; free video-gen is too small to design a capability tier around.
- **Recommendation:** in the capability registry, mark `video-gen` as paid-only for v2; templates that require it should degrade to stock-footage lanes (Pexels/Pixabay, already BYOK'd) when the user has no video-gen provider configured.

### 1.5 Transcription / STT (capability: `transcription`)

| Provider | Free tier | Price when paid | Notes |
|---|---|---|---|
| OpenAI Whisper API | none | **$0.006/min** (`gpt-4o-transcribe` same, `gpt-4o-mini-transcribe` $0.003/min) | usage returned in response |
| Gemini `gemini-3.5-transcribe` | **"Free of charge"** on the free tier (pricing page); paid $2/1M audio tokens ($0.003/min) | yes | best free hosted option today |
| Azure STT | **5 audio-hours free/month** (F0, shared standard/custom) | per-hour after | Urdu `ur-IN`/`ur-PK` supported for fast transcription; MAI-Transcribe-2 supports `ur` |
| Groq whisper-large-v3 | Developer-base: 20 RPM / 2K RPD / 7.2K audio-sec/hour (free plan similar — tab didn't render) | paid tier | fastest hosted option |
| ElevenLabs STT | consumes shared credits: 330 credits/min (free tier = 10k credits) | plan-based | |
| faster-whisper [free-local, MIT] | unlimited | $0 | CT2 int8; "up to 4x faster than openai/whisper" (tech-stack file); already in docker-compose |
| whisper.cpp [free-local, MIT] | unlimited | $0 | CPU-only supported; memory: tiny ~273MB → large ~3.9GB (README table); Raspberry Pi class |
| WhisperX [free-local, **BSD-2-Clause**] | unlimited | $0 | word timestamps via wav2vec2 alignment; faster-whisper backend; large-v2 <8GB GPU; CPU int8 path; diarization via pyannote (HF token + model-agreement needed) |

**Recommendation:** `transcription` is the easiest capability to keep genuinely free (local). Free-quota fallback: Gemini transcribe.

### 1.6 Web search / research (capability: `search`)

| Provider | Free tier (exact, fetched today unless noted) | Card? | Notes |
|---|---|---|---|
| Tavily | **1,000 API credits/month**, no credit card; credits reset 1st of month | No | PAYG $0.008/credit; startup program 100k credits |
| Serper.dev | **2,500 free queries** on signup, "No credit card required" | No | PAYG; per-1k price not shown on fetched page (**unverified**) |
| Brave Search API | Free plan restructured: search snippet of official page says "Up to $20 in free calls every month · Prepaid credits, no subscription" (old 2,000 queries/mo free plan grandfathered for existing subscribers per secondary reports). **Official pages unreachable from this environment (DNS) — treat exact numbers unverified** | unverified | $5.00/1k search requests per secondary summary |
| Bing Web Search API | **RETIRED** — Microsoft Learn page is `is_archived: true, is_retired: true` (moved to previous-versions; doc updated 2025-08-11) | n/a | do not integrate |
| SerpAPI | **250 searches/month free**, 50/hour (was 100/mo historically — changed) | No | Starter $25/mo = 1,000 |
| Google Custom Search JSON API | **Closed to new customers**; existing customers: 100 free queries/day, $5/1k beyond, 10k/day max — **discontinues January 1, 2027** | n/a | do not integrate for new platform |
| Exa | **$10 credits at signup** ("up to 2,500 Lite searches"); free balance resets to $10 monthly (per pricing page wording) | No | /search $4–7 per 1k requests |

**Recommendation:** default `search` provider = Tavily (recurring monthly free quota fits a cron pipeline better than one-time credits). Exa as the research-depth upgrade; Serper as cheap volume. Search is the capability with the weakest free story — templates must tolerate `search` being unavailable (keyword-only mode).

### 1.7 Music / SFX — brief (prior file `own-music-generation-research-2026-10-11.md` remains the authority)

- Clean-commercial OSS: **ACE-Step v1 (Apache-2.0 code+weights)**, Magenta (Apache-2.0), Stable Audio Open (Community License, <$1M). MusicGen weights CC-BY-NC — banned for monetized channels.
- ElevenLabs Music exists on the same shared credit pool (900 credits/min) — usable as BYOK TTS-adjacent capability, but free tier has **no commercial license**.
- Lyria (Gemini API) is paid-only ($0.08/song) and not free-tier.

---

## 2. Provider abstraction (platform plan §4.2)

### 2.1 Option comparison

| Option | What it is | Pros | Cons | Verdict |
|---|---|---|---|---|
| Provider adapters | One integration module per vendor API | full fidelity per provider | N integrations × M features; every new provider = code + deploy | Necessary only for the 4–5 capability-native APIs (Gemini, ElevenLabs, Tavily) |
| Model registry | Static list of models with ids/prices | needed for cost math anyway | says nothing about *who* executes or *what task* fits | Keep as data, not as the router |
| **Capability registry** | Each provider config declares capabilities it can serve (`script-gen`, `tts`…) with constraints (langs, license class, cost class) | matches the owner's "templates declare capabilities" requirement; no-static-maps compliant (kit/registry data, never hardcoded) | needs disciplined onboarding data per provider | **ADOPT — this is the core v2 primitive** |
| Task-based routing | Router picks best provider per task from registry | enables quality/cost policy per task | overlaps with capability registry; complexity lives in policy | Fold into capability registry as per-capability priority lists |
| User-defined priorities | Tenant orders providers per capability (drag order) | gives users control, matches BYOK philosophy | users need a sane default | **ADOPT as the per-tenant override of the registry default** |
| Fallback chains | Ordered provider list; 429/401 → next | already proven in repo (script brains chain; checkChannelKeys drop-and-fallback) | silent fallback can hide dead keys | **ADOPT with the OpenRouter semantics: Prioritized (try first) vs Fallback (only after primary exhausted)** |
| Workflow-level overrides | A template/run pins a provider (e.g. "this documentary must use ElevenLabs voice X") | needed for brand consistency | escape hatch, not default | ADOPT as optional template field |

### 2.2 How the normalization platforms do it (cited)

- **LiteLLM**: "Call any LLM in OpenAI format"; "a single, unified interface to call 100+ LLM providers"; Router with "retry/fallback logic across multiple deployments"; proxy adds "virtual keys, spend tracking, guardrails, load balancing" (README, fetched today). MIT core (repo lists LICENSE; enterprise features under a commercial license).
- **one-api** (self-hosted gateway): "access all major models via the standard OpenAI API format", ~27 provider channel types, token quotas/expiry/IP allowlists per issued key, load balancing across channels, per-group billing multipliers, MIT license **with a footer-attribution condition** (README, fetched today).
- **OpenRouter**: the hosted version of the same idea, plus first-class **BYOK**: tenant keys live in "Prioritized" (tried first) or "Fallback" (tried after shared endpoints) sections, masked labels `sk-...AbCd`, 5% platform fee on BYOK traffic (docs, fetched today).
- **Hugging Face "Custom Provider Key"**: HF swaps auth server-side when routing with the user's own provider key; billing flips to the provider and HF credits don't apply (pricing doc, fetched today) — the cleanest published precedent for "platform holds user's key, provider bills user".

### 2.3 Recommendation (minimal architecture, FACT vs RECOMMENDATION separated)

1. **RECOMMENDATION — one resolver, three layers.** `capabilities` (static registry: what `script-gen`/`tts`/`image-gen`/`transcription`/`search` mean, their I/O contracts and constraint dimensions: language, license class, latency class) → `provider_registry` (static data per provider: auth type, endpoint style, capability list, license/commercial-use class, usage-reporting type — exactly the tables in §1) → `tenant_provider_configs` (user rows: provider + credential ref + per-capability priority + enabled flag). Resolution at task time = tenant's ordered configs for that capability → platform defaults → fail. This satisfies the no-static-maps directive: brands/channels never change code; configs are data.
2. **RECOMMENDATION — OpenAI-compatible as the universal adapter.** For `script-gen` (and any LLM task) implement exactly one adapter shape: OpenAI Chat Completions + `usage` object. Groq, Cerebras, OpenRouter, HF router, Ollama, vLLM, llama.cpp-server, one-api, LiteLLM gateway all speak it natively (each cited above); Gemini is reachable through OpenRouter or its own adapter. One adapter + per-provider base URL/auth = the whole LLM side of BYOK.
3. **RECOMMENDATION — capability-native adapters only where the I/O is non-text.** `tts` (ElevenLabs/Azure/edge-tts/local narrate), `image-gen` (Stability/Gemini/local diffusers gateway), `transcription` (faster-whisper local server/Groq whisper/OpenAI audio), `search` (Tavily/Serper/Exa/Brave) each need one thin adapter; keep their results in capability-normalized shapes (audio file + word timings; image file + seed; transcript + segments; ranked results).
4. **RECOMMENDATION — local models are first-class providers via the same OpenAI-compatible interface.** Ollama/vLLM/llama.cpp-server run on user hardware or a worker box and register like any provider with `auth: none, base_url: http://host:11434/v1`. For TTS, the existing `narrate.py` chain (OpenAI → Kokoro → edge) becomes a `tts` provider whose "endpoint" is the worker itself. No special-casing in the scheduler beyond a latency/availability class.
5. **RECOMMENDATION — fallback = OpenRouter semantics, made visible.** Ordered tenant configs (Prioritized) then platform default (Fallback); every demotion writes a `usage_events` row with `reason` (401/403/429/5xx) so the UI can show "ran on fallback, your Groq key returned 429". This extends the repo's current `checkChannelKeys` drop-key behavior with an audit trail.
6. **FACT** — do NOT re-implement cross-provider model routing itself (per-model retries, load balancing): LiteLLM/one-api/OpenRouter demonstrate this is a product-sized surface. Buy (self-host LiteLLM or one-api as an internal gateway) only if tenant count makes direct adapters unmaintainable; at Studio scale the resolver + OpenAI-compatible adapter is the minimal correct build.

---

## 3. BYOK credential security (platform plan §4.3)

### 3.1 Definitions (short)

- **Hashing** — one-way digest; proves knowledge/identity but cannot recover the value. Right for *verifying* secrets (e.g., OpenRouter's `allowed_api_key_hashes` SHA-256 allowlists), wrong for *storing usable* provider keys.
- **Encryption** — reversible with a key you hold; the correct primitive for BYOK keys because the platform must *use* them.
- **Tokenization** — replace the secret with a surrogate token; detokenization happens in a vault service. Conceptually what our credential-ID references do; full tokenization services (PCI-style) are overkill for v1.
- **Access control** — who/which service may call decrypt. Orthogonal to all of the above and the layer that actually stops most misuse (OWASP: "Secrets should never be retrievable by everyone and everything"; "engineers should not have access to all secrets").

### 3.2 Established practice, with citations (all fetched 2026-10-24 unless noted)

1. **Encryption at rest — envelope encryption with AEAD.** OWASP: "You should not store keys next to the secrets they encrypt"; prefer "AES-256 using GCM" or "ChaCha20 and Poly1305". Concretely: `MASTER_KEY` (or KEK) in Vercel encrypted env; per-credential random nonce; data-encryption keys wrapped by the KEK; `key_version` column for rotation. This is what the repo vault already does with AES-256-GCM (api-keys file §2.1) and what Supabase Vault does: secrets stored "using Authenticated Encryption … (based on `libsodium`)", "the encryption key is never stored in the database alongside the encrypted data" (Supabase docs).
2. **KMS vs app-managed master key.** GCP/AWS KMS gives HSM-backed KEKs, IAM-scoped decrypt, and automatic key rotation — the right upgrade at paid multi-tenant scale. For v1, app-managed `MASTER_KEY` + versioned ciphertext is acceptable and is the documented pattern of Supabase Vault (per-project root key in "secured backend systems", retrievable only via Management API) and LibreChat (`CREDS_KEY`/`CREDS_IV`). **Per-tenant user-owned KEKs (client-side encryption) are NOT practical for v1**: the pipeline must decrypt server-side to call providers, and key-recovery UX (forgot password = all keys lost) is a support sink. **RECOMMENDATION.**
3. **Tenant isolation.** Encrypt with tenant-scoped associated data (AAD = tenant/channel ID) so ciphertexts can't be replayed across tenants — Supabase documents the AAD trick ("copying an encrypted value between rows would be rejected"). Dify goes further with per-workspace RSA keypairs (prior file §3.1). At minimum: decrypt only ever queries `WHERE tenant_id = caller.tenant_id`.
4. **Access control (which services may decrypt).** One internal endpoint (`POST /internal/credentials/:id/reveal` style) authenticated by a scoped pipeline token, returning decrypted keys **only for the tenant being processed**; Studio UI never receives plaintext. This is the runtime-fetch pattern the prior file ranked #1 for CI (§3.3). OWASP least-privilege quotes apply verbatim.
5. **Masked display.** Write-only after save; show last 4 only. Verbatim precedents: Vercel "**Secret** values are write-only after saving"; OpenRouter label `sk-...AbCd`; LibreChat `apiKeyPreview`; GitHub Actions secrets API returns metadata only (prior file).
6. **Test-on-save.** One cheap live call per provider at save time (1-token completion / models-list / 1 Tavily search), rate-limited per user+IP (it's an outbound-call amplification vector). Mandatory for Google in 2026: new "auth keys" + rejected unrestricted keys mean a key can paste fine and fail at call time (prior file §1). Also validate lazily on first real use.
7. **Rotation.** Google's dance: create replacement → deploy → disable old → audit (prior file). UI "replace key" = overwrite ciphertext + bump `key_version`. OWASP/NIST position: user credentials rotate on evidence of compromise, not on a calendar ("User credentials are excluded from regular rotation" — OWASP citing NIST).
8. **Deletion.** Hard-delete ciphertext rows on tenant request; keep the audit row (event, actor, timestamp — never the secret). 
9. **Audit logging without secrets.** OWASP: secrets "Never be logged"; auditing "resilient against attempts to tamper with or delete the audit logs"; log who set/used/rotated/deleted which credential, when, from which IP, plus validation outcomes and 401/403 events. Vercel's implementation detail worth copying: when a Secret would appear in build logs it's replaced with `[REDACTED]` and an Activity Log event records key name/project/deployment "but not the value".
10. **Worker access pattern.** Server-side decrypt at the last possible moment; keys in memory only; masked env/`::add-mask::` in CI; never to the browser, never to `/tmp`. (Prior file §3.3 pattern 1 + §4.9.)
11. **Redaction in logs/errors/telemetry.** Central logger redact-list initialized from the credential value at creation (catches accidental echo in provider error bodies); error messages surface provider + status code, never headers. GitHub's warning applies: values decrypted into workflow scope are NOT auto-redacted if printed.
12. **Revoked/expired credentials — fail closed with notice.** Treat provider 401/403 as credential-dead: mark `invalid`, notify tenant (ntfy/email), **fall back only if a fallback is configured AND the tenant opted into it**; for publishing-critical flows prefer fail-closed (skip the run) over silently spending the platform's own keys — the shared-key fallback exists today but every silent fallback must be visible in usage events with its reason. (Extends prior file §4.8.)
13. **Google OAuth refresh tokens.** Google's rules (fetched today): tokens are valid until revoked — no fixed lifetime — BUT: unused 6 months → dead; password change (with Gmail scopes) → dead; **max 100 live refresh tokens per account per client ID**, oldest silently invalidated when exceeded; OAuth apps in "Testing" publishing status get 7-day tokens unless only `openid/email/profile` scopes; admin policy or Cloud session length can kill them. Required handling: encrypt at rest exactly like API keys; expect `invalid_grant` any day; on it, mark the channel `reconnect_required` and email the owner. Also never mint a second refresh token for the same channel when one is stored (burns the 100-token budget and can invalidate the old one).

### 3.3 What NOT to do (anti-patterns with receipts)

- Do not derive the master key from another credential (the current vault derives it from `YOUTUBE_CLIENT_SECRET` — api-keys file §2.1). It works while there is one deployment; it fails the moment that secret rotates (all channel keys silently undecryptable) and it couples two secret classes. **RECOMMENDATION:** dedicated `MASTER_KEY` + `key_version` at v2.
- Do not store keys in git-tracked JSON (current `yt-mcp/channel-keys.json` state) for the platform — history is forever and OWASP flags repo leakage outright (prior file §3.3 pattern 3).
- Do not log decrypted values even "temporarily for debugging" — LibreChat's CVE-2026-32625 showed master-secret exfil = total compromise of every stored third-party key (prior file §3.1).

---

## 4. Cost transparency (platform plan §4.4)

### 4.1 Usage-ledger schema (RECOMMENDATION)

```
usage_events (
  id, tenant_id, channel_id, workflow_run_id, stage,        -- 'script-gen' | 'tts' | ...
  provider, provider_credential_id, model,                  -- model or voice id
  tokens_in, tokens_out, cached_tokens, thoughts_tokens,    -- text
  audio_seconds_in, audio_seconds_out, chars,               -- tts/stt
  images, megapixels, video_seconds,                        -- image/video
  requests, retries,                                        -- call counting
  status,                                                   -- ok | rate_limited | auth_failed | error
  fallback_from,                                            -- provider demoted from, if any
  usage_source,                                             -- 'provider_reported' | 'estimated' | 'hardware_time'
  cost_provider_usd, cost_platform_usd,                     -- provider spend vs platform infra
  latency_ms, created_at
)
```
Rollups: views per workflow-run, per channel, per tenant, per capability — all derivable by grouping `usage_events`; add materialized monthly rollup only if the table grows past tens of millions of rows.

### 4.2 Which providers report usage in responses (FACT, per docs fetched today)

| Provider | What comes back | Notes |
|---|---|---|
| OpenAI-compatible (OpenAI, Groq, Cerebras, OpenRouter, Ollama, vLLM, llama.cpp server, HF router) | `usage.prompt_tokens / completion_tokens / total_tokens` (+ cached where supported) | universal adapter ⇒ one parser |
| Gemini | `usageMetadata`: `promptTokenCount`, `candidatesTokenCount`, `totalTokenCount`, `cachedContentTokenCount`, `thoughtsTokenCount`, tool-use counts (docs, fetched today) | audio/image token counts exist in modality details (page truncated — **partially verified**) |
| Anthropic | `usage` object incl. `input_tokens`, `output_tokens`, cache read/write tokens, `server_tool_use` counts (pricing page examples) | |
| ElevenLabs | character/credit accounting (1 credit/char TTS; STT 330/min; music 900/min) — quota visible per plan | no per-request usage object in docs fetched; count chars client-side |
| Azure TTS/STT | per-character / per-hour billing; no per-request usage payload (billing-side) | count chars client-side |
| Tavily / Serper / Exa / Brave | credit-based; Tavily FAQ: credits "consumed based on the type of request" | count requests client-side |
| Local (Kokoro/Piper/faster-whisper/FLUX-local) | **no API usage** — cost is hardware time only | log render seconds + `usage_source='hardware_time'` |

### 4.3 Estimating cost without provider-reported usage (RECOMMENDATION)

- Keep a `model_prices` table (input/output per 1M tokens, per-char audio, per-image, per-minute) seeded from the official pricing pages in §1 and refreshed on a schedule — prices moved this year (Gemini 3.8-flash rising to $1.50/$7.50 on Jan 1, 2027 is already scheduled). LiteLLM demonstrates this approach ("cost tracking" per token with price maps; one-api does per-group billing multipliers).
- Store both `cost_provider_usd` (estimated from price tables when not reported) and `usage_source` so invoices can distinguish measured from estimated.
- `cost_platform_usd` = platform infra (Vercel functions, GHA minutes, Neon rows, render minutes) — allocate by run duration/count, never mix into provider spend; BYOK promises users their provider spend is theirs.
- Count retries as their own rows (`retries` + status `rate_limited`) so 429 storms are visible as cost, not noise.

---

## 5. Risks, gaps, open questions

1. **Risk — NC-weights leakage into templates.** A template author picks FLUX.1-dev "because it looks better"; every tenant channel on monetized content inherits a license violation. Mitigation: license class is a first-class field in the provider registry; default resolution filters `commercial_ok = true`.
2. **Risk — ElevenLabs free tier is not free for a monetized platform**: 10k credits/mo AND no commercial license. Users must be told "free plan = evaluation only".
3. **Risk — Fish-Speech hosted-service clause**: routing tenant TTS through self-hosted Fish-Speech is exactly the "Hosted Service" its license excludes at any revenue. Don't offer it as a platform default; user-self-hosted (their own box, their own license exposure) is a different story.
4. **Gap — Groq/Cerebras free-plan numbers** are behind console tabs that didn't render in this environment; the Developer-base numbers verified today are the safe published floor. Re-verify in-console before publishing tenant-facing quota math.
5. **Gap — Brave API pricing** official pages were unreachable (DNS) from this environment; numbers are from the official-page search snippet + secondary summaries. Re-verify before integration.
6. **Gap — Urdu TTS quality**: Azure/edge-tts voices exist (4 verified names) but no quality evidence was collected; open-weight Urdu does not exist in any checked model. A listening test is required before selling Urdu channels.
7. **Gap — Gemini per-model free RPD**: Google stopped publishing; archived Dec-2025 numbers (250/1,000 RPD) may have drifted. Read the tenant's actual limits from AI Studio at validate-on-save time (API can return quota headers).
8. **Open question — paid BYOK gatekeeping**: should the platform allow tenants to register credentials for paid tiers only (e.g., refuse ElevenLabs free keys)? Recommendation: allow with a visible `license_class: evaluation_only` warning, enforced at publishing (flag the video, don't block the run).
9. **Open question — KMS adoption trigger**: move `MASTER_KEY` to GCP/AWS KMS when Studio holds credentials for >~50 external tenants or signs BAAs. Until then, versioned env-var KEK + AAD-bound ciphertext matches Supabase Vault's documented design.

---

## Sources

Fetched 2026-10-24 unless noted:

1. Gemini API rate limits (per-project statement, no published table): https://ai.google.dev/gemini-api/docs/rate-limits
2. Gemini API pricing (free-tier contents, training-on-free-tier, model lineup, Veo/image/TTS model pricing): https://ai.google.dev/gemini-api/docs/pricing
3. Gemini API video docs (Veo 3.1 preview shutdown Oct 22, 2026): https://ai.google.dev/gemini-api/docs/video
4. Gemini usageMetadata fields: https://ai.google.dev/api/generate-content
5. Gemini models overview (no per-model context published): https://ai.google.dev/gemini-api/docs/models
6. OpenAI API pricing (gpt-6 family, TTS, images, transcription, no free tier): https://developers.openai.com/api/docs/pricing (redirect target of platform.openai.com/docs/pricing)
7. Anthropic pricing (Haiku 5.5 $0.10/$0.50 etc., free-credits statement, 1M context): https://platform.claude.com/docs/en/about-claude/pricing
8. Groq rate limits (Developer-plan base table, org-level statement): https://console.groq.com/docs/rate-limits
9. Cerebras rate limits (Free Trial 5 RPM / 1M TPD): https://inference-docs.cerebras.ai/support/rate-limits
10. OpenRouter free-model limits (20 RPM; 50/1000 RPD): https://openrouter.ai/docs/api/reference/limits
11. OpenRouter BYOK (5% fee, Prioritized vs Fallback, masked labels): https://openrouter.ai/docs/use-cases/byok
12. Hugging Face Inference Providers pricing ($0 free credits; PRO $2/mo; Custom Provider Key): https://huggingface.co/docs/inference-providers/pricing
13. ElevenLabs pricing (10k free credits, commercial license from Starter): https://elevenlabs.io/pricing
14. Google Cloud TTS pricing (Chirp3 HD 1M chars free; billing required; Gemini-TTS none): https://cloud.google.com/text-to-speech/pricing
15. Azure Speech pricing (F0 0.5M neural chars free; STT 5 hrs free): https://azure.microsoft.com/en-us/pricing/details/speech
16. Azure language support (Urdu ur-IN/ur-PK voices; Hindi voices incl. MAI-Voice-2): https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support
17. Bing Web Search API retirement (archived/retired doc): https://learn.microsoft.com/en-us/previous-versions/bing/search-apis/bing-web-search/overview
18. Tavily pricing (1,000 credits/mo free): https://www.tavily.com/pricing
19. Serper.dev (2,500 free queries, no card): https://serper.dev
20. SerpAPI pricing (250 searches/mo free): https://serpapi.com/pricing
21. Google Custom Search JSON API (closed to new customers; discontinues 2027-01-01; 100/day free): https://developers.google.com/custom-search/v1/overview
22. Exa pricing ($10 signup credits; per-1k prices): https://exa.ai/pricing
23. Brave Search API (free-calls snippet; official page unreachable): https://brave.com/search/api (via search result; exact current numbers **unverified**)
24. Together.ai pricing (free LLM model; image/video/transcription prices): https://www.together.ai/pricing
25. Stability API pricing (25 free credits; credit costs per image): https://docs.stability.ai/pricing
26. Stability AI Community License ($1M threshold; outputs owned; foundational-model clause): https://stability.ai/license
27. FLUX.1-schnell model card (Apache-2.0, 12B): https://huggingface.co/black-forest-labs/FLUX.1-schnell
28. FLUX.1-dev model card (Non-Commercial License): https://huggingface.co/black-forest-labs/FLUX.1-dev
29. SD 3.5 Large model card (Community License <$1M; 8B): https://huggingface.co/stabilityai/stable-diffusion-3.5-large
30. SDXL 1.0 model card (OpenRAIL++-M; 3B): https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0
31. Qwen-Image model card (Apache-2.0; 20B): https://huggingface.co/Qwen/Qwen-Image
32. PixArt-α model card (OpenRAIL++-M; 0.6B): https://huggingface.co/PixArt-alpha/PixArt-XL-2-1024-MS
33. Kokoro-82M model card (Apache-2.0; 8 langs/54 voices v1.0): https://huggingface.co/hexgrad/Kokoro-82M + VOICES.md (Hindi hf_alpha/hf_beta/hm_omega/hm_psi): https://huggingface.co/hexgrad/Kokoro-82M/raw/main/VOICES.md
34. Piper repo (MIT; archived Oct 6, 2025; successor piper1-gpl): https://github.com/rhasspy/piper + VOICES.md (37 langs; hi_IN pratham/priyamvada; no Urdu): https://raw.githubusercontent.com/rhasspy/piper/master/VOICES.md
35. XTTS-v2 model card + LICENSE.txt (CPML: non-commercial model **and outputs**; 17 langs incl. Hindi): https://huggingface.co/coqui/XTTS-v2 (+ /raw/main/LICENSE.txt)
36. F5-TTS repo (code MIT; checkpoints CC-BY-NC; ZH+EN): https://github.com/SWivid/F5-TTS
37. Fish-Speech repo + LICENSE (Fish Audio Community License: <$500K revenue; hosted-service ban; attribution): https://github.com/fishaudio/fish-speech (+ raw LICENSE)
38. Chatterbox repo (MIT; Turbo/Nano English; Multilingual V3 23+ langs incl. Hindi; CPU claims): https://github.com/resemble-ai/chatterbox
39. whisper.cpp repo (MIT; CPU-only; memory table): https://github.com/ggml-org/whisper.cpp
40. WhisperX repo (BSD-2-Clause; wav2vec2 alignment; faster-whisper backend): https://github.com/m-bain/whisperX
41. faster-whisper (MIT; 4x claim) — verified 2026-10-17 in `tech-stack-research-2026-10-17.md` §7: https://github.com/SYSTRAN/faster-whisper
42. edge-tts (unofficial client; GPL-3.0; SSML restriction) — verified 2026-10-17 in tech-stack file §7: https://github.com/rany2/edge-tts
43. Ollama repo + FAQ + GPU docs (MIT; llama.cpp backend; CPU-only fallbacks): https://github.com/ollama/ollama , https://docs.ollama.com/faq , https://docs.ollama.com/gpu.md
44. vLLM repo (Apache-2.0; OpenAI-compatible server; GPU/CPU support): https://github.com/vllm-project/vllm
45. llama.cpp repo (MIT; GGUF; CPU-first; quantization 1.5–8-bit): https://github.com/ggml-org/llama.cpp
46. LiteLLM repo (OpenAI-format for 100+ providers; Router fallbacks; virtual keys; cost tracking): https://github.com/BerriAI/litellm
47. one-api repo (MIT + footer attribution; ~27 channels; quotas/load-balancing/billing multipliers): https://github.com/songquanpeng/one-api
48. OWASP Secrets Management Cheat Sheet (envelope encryption; AES-256-GCM/ChaCha20-Poly1305; rotation; logging redaction): https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
49. Vercel Config vs Secret env vars (write-only; build-log redaction + Activity Log): https://vercel.com/docs/environment-variables/sensitive-environment-variables
50. Supabase Vault (libsodium AEAD; root key outside DB; AAD anti-copy): https://supabase.com/docs/guides/database/vault
51. Google OAuth 2.0 (refresh-token lifetime/revocation causes; 100-token cap; testing-mode 7-day expiry; secure storage): https://developers.google.com/identity/protocols/oauth2
52. Prior research relied on for continuity (dates inside): `byok-api-keys-2026-10-09.md`, `api-keys-architecture-and-competitors-2026-10.md`, `free-script-brains-2026-09.md`, `open-source-tts-2026-09.md`, `human-voice-tts-paralinguistics-2026.md`, `own-music-generation-research-2026-10-11.md`, `tech-stack-research-2026-10-17.md` (all under `research/`).
53. Video-gen free-tier landscape (secondary; unverified): lumalabs.ai comparison pages surfaced via search (Runway/Luma/Kling figures vary) — treat as leads only.
