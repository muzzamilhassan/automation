# OSS video production stack — platform research 2026-10-24

Read-only research round for the v2 multi-tenant SaaS design. Builds on `tech-stack-research-2026-10-17.md`, `open-source-tts-2026-09.md`, `video-maker-tools-landscape-2026-09.md`, `animated-explainer-video-research-2026-09.md`, `combined-vox-diagram-best-solutions-2026-09.md`, `free-video-clips-research-2026-09.md`, and `shorts-creation-and-competitor-audit-2026.md` — those set the direction (keep Node orchestration + Python AI sidecar, Neon pgvector RAG, no rewrite); this doc **re-verifies every candidate from primary sources on 2026-10-24** and ranks an OSS stack per capability: rendering, TTS, STT, image gen, animation, auto-clipping, plus a GitHub discovery sweep. Repo facts (stars, pushed_at, license SPDX) come from the GitHub REST API fetched 2026-10-24; licenses from LICENSE files or official docs; anything I could not confirm today is marked **UNVERIFIED**. No code changed.

---

## 0. TL;DR verdicts

| Category | Pick | Runner-up | One line |
|---|---|---|---|
| Rendering / composition | **KEEP FFmpeg 8.1 + Remotion** (existing) | HyperFrames (in-house, already owned) | Remotion terms unchanged (free ≤3 people; Automators $0.01/render, $100/mo min); Cloud Run renderer still "Alpha... not actively being developed" — Lambda is the scaling path. MoviePy still not worth it. |
| TTS — English workhorse | **KEEP Kokoro-82M** (Apache-2.0 weights) | Chatterbox (MIT code; expressive, GPU) | Kokoro is still the only permissive-weights, CPU-fast, word-timestamp TTS in our stack. |
| TTS — multilingual/cloning (Hindi) | **STUDY VoxCPM2** (Apache-2.0 code + weights, 30 langs incl. Hindi, ~8GB VRAM, CPU GGUF path) | Chatterbox Multilingual V3 (23+ langs; weights license gated/UNVERIFIED) | Biggest new finding: VoxCPM2 (2B, Apache-2.0, optional word timestamps) is the first commercial-safe multilingual cloning model worth a spike. |
| TTS — Urdu | **No good option.** Piper has an `ur_PK` voice (only permissive one found) — quality UNVERIFIED | Commercial API (out of OSS scope) | XTTS-v2 (no Urdu + NC), F5 (no Urdu + NC), Kokoro/VoxCPM2/MeloTTS/Chatterbox: no Urdu. Honest gap. |
| STT / subtitles | **KEEP faster-whisper; ADD WhisperX** when word timestamps + diarization needed | whisper.cpp (CPU-only edge) | Whisper tokenizer confirms `ur` + `hi` among 99 languages; WhisperX adds wav2vec2-aligned word timestamps and pyannote diarization (CC-BY-4.0 community model + HF token). |
| Image gen — commercial-safe default | **FLUX.1 schnell** (Apache-2.0, 12B) | Qwen-Image (Apache-2.0, 20B, best text rendering) | Policy correction: FLUX.1 dev/Krea weights are non-commercial BUT the license explicitly permits commercial use of generated outputs; the multi-tenant SaaS should still standardize on schnell/Qwen-Image. |
| Animation / motion graphics | **KEEP Remotion + GSAP + SVG/CSS** (existing) | Manim CE (MIT) for math/science niche | Blender-GPL is safe as a subprocess ("the output of a program is not... covered by the copyright on the code" — GNU FAQ), but CI cost makes it a niche tool. Lottie/Rive need authored assets — still no generative authoring path. |
| Auto-clipping | **STUDY openshorts** (MIT, 7.05k★, pushed today) + **FunClip** (MIT, 6.4k★, pushed Oct 8) | autoclip (tiny but exactly local-first Whisper+Ollama) | The genuinely maintained 2026 clippers are openshorts, FunClip, Anil-matcha/AI-Youtube-Shorts-Generator. ShortGPT confirmed dead (20 months). Our clips-first lane (#95) stays the backbone. |
| Biggest corrections vs prior research | Fish Speech license CHANGED (now FACL v1.0: commercial allowed **<$500k annual revenue**, else NC; S2-Pro weights research-only) · Subtitle Edit is now **MIT** (was GPL-3.0) · rhasspy/piper **archived** → successor OHF-Voice/piper1-gpl is **GPL-3.0** · ComfyUI moved to Comfy-Org | | |

---

## 1. Rendering & composition

### 1.1 Candidate verification (all facts fetched 2026-10-24)

| Project | Repo | License | Last activity | Stars (2026-10-24) | Language | Maintenance read |
|---|---|---|---|---|---|---|
| FFmpeg | github.com/FFmpeg/FFmpeg (mirror) | **LGPL-2.1-or-later core; GPL-2.0+ components** if built `--enable-gpl` | 8.1 "Hoare" released **2026-03-16**; repo pushed today | 65,650 | C | Very active upstream; 8.0 "Huffman" (2025-08-22) called "one of the largest releases" |
| Remotion | github.com/remotion-dev/remotion | **Custom source-available** ("NOASSERTION") — free ≤3-person org; paid above | v4.0.538 **2026-10-22**; pushed today | 67,022 | TypeScript | ~weekly releases; most active engine in this space |
| MoviePy | github.com/Zulko/moviepy | MIT | pushed **2026-08-26**; last release v2.2.1 **2025-05-21** (17 months) | 15,022 | Python | Slowing: no release in 17 months |
| Manim CE | github.com/ManimCommunity/manim | MIT | pushed **today** | 41,825 | Python | The actively maintained Manim |
| ManimGL (3b1b) | github.com/3b1b/manim | MIT | pushed **2026-09-09** | 95,614 | Python | Grant Sanderson's personal OpenGL variant; slower cadence, driven by 3Blue1Brown videos |
| OpenCV | github.com/opencv/opencv | Apache-2.0 | pushed **today** | 91,316 | C++ | Very active; the substrate under scene-detect/face-detect tools |
| GStreamer | github.com/GStreamer/gstreamer | Mixed LGPL/GPL ("NOASSERTION" SPDX) | pushed **today** | 3,348 | C | Active but wrong abstraction for us |

### 1.2 Remotion license + pricing (re-verified 2026-10-24 — the load-bearing terms)

From `LICENSE.md` on `main` (raw.githubusercontent.com/remotion-dev/remotion/main/LICENSE.md): Free License covers "an individual", "a for-profit organization with up to 3 employees", non-profits, and evaluators. Trigger: "You are required to obtain a Company License to use Remotion if you are not within the group of entities eligible for a Free License." Restriction is narrow: no copying/modifying Remotion code "for the purpose of selling, renting, licensing, relicensing, or sublicensing" a derivative. **The note persists verbatim: "In Remotion 5.0, the license will slightly change."**

Pricing (remotion.dev/docs/license/faq, fetched 2026-10-24): Creators — "$25/month per person who writes Remotion code themselves or using agentic coding tools"; Automators — "$0.01 per render, with a minimum spend of $100/month"; Enterprise — "$500 (instead of $100)" minimum. A render = "the successful generation of a video, audio, GIF, still image or image sequence"; Studio/Player previews don't count; image sequences count once regardless of frames.

Cloud Run (remotion.dev/docs/cloudrun, fetched 2026-10-24): still **"Cloud Run is in Alpha status and not actively being developed."** Max 8 vCPU / 32 GB / 60-min timeout. Verdict unchanged: **Lambda is the scaling path; don't build SaaS rendering on Cloud Run.**

**SaaS implication (RECOMMENDATION):** at ≤3 employees the free license holds; the moment headcount hits 4 or a client-facing render meter is needed, the Automators plan is $0.01/render/$100-mo — at dozens of renders/day this is material and is the business case for keeping the MIT-licensed HyperFrames engine viable as the second browser engine.

### 1.3 Capability comparison

| Capability | FFmpeg 8.1 | Remotion 4.0.538 | MoviePy 2.2.1 | Manim CE | OpenCV | GStreamer |
|---|---|---|---|---|---|---|
| Subtitles/captions | `subtitles`/`ass` filter — burned-in ASS/SRT (our current backbone) | @remotion/captions package exists ("caption utilities"; API details on /docs/captions/api) | TextClip only — no ASS pipeline | No (draw text manually) | No | Mature subtitle muxing, no styling engine |
| Audio mixing | filter_graph (amix/sidechaincompress/loudnorm) — best in class | OffthreadAudio + volume/sequence — good | Basic AudioFile compositing | Weak | No | Good (pipeline graph) |
| Transitions | xfade/fades — manual graph building | React components — arbitrary CSS/JS transitions | Manual cuts/fades | Weak | No | Manual |
| Animation | None (frames in, video out) | Full React/CSS/GSAP animation | Minimal | **Best math/science animation** | No | None |
| Template reuse | Filter-graph templates (our brand-pad) | React components + props — strongest template model | Weak | Scene classes (code) | No | Weak |
| Vertical + long-form | Both, trivially | Both; 6h GHA job cap for long-form, Lambda for scale | Both in principle; slow | Both; CPU render | N/A | Both |
| Containerization | Static binary / ubuntu image | Node + Chrome Headless Shell image | pip | pip + LaTeX optional | lib | lib |
| Server-side/parallel | Linear per-stream; concurrent processes scale | Remotion Lambda (distributed) | No | Linear | N/A | Pipeline-parallel possible |
| Memory | Streaming; low | Chrome per frame — heavy but bounded | numpy-bound: whole clips in RAM | High for complex scenes | N/A | Moderate |

### 1.4 Verdicts (§10.1)

| Project | Verdict | Why |
|---|---|---|
| FFmpeg | **KEEP (core)** | 8.1 current; license is a build-time choice: plain builds are LGPL-2.1+, `--enable-gpl` builds are GPL — as a subprocess neither touches our output (GNU GPL FAQ: output "is not, in general, covered by the copyright on the code"); "FFmpeg is not available under any other licensing terms... not even in exchange for payment" (ffmpeg.org/legal.html) |
| Remotion | **KEEP** (confined to `explainer/`) | License terms re-verified unchanged; watch the 5.0 "slightly change" note and the 4-employee trigger |
| MoviePy | **REJECT** | Prior audit stands (numpy-bound, "slower than using ffmpeg directly"); now also 17 months without a release — maintenance risk added to performance risk |
| Manim CE | **INTEGRATE (niche)** | MIT, very active; the only serious OSS engine for formula/math animation; separate Python render path fits the sidecar shape. ManimGL = study-only (interactive OpenGL, not CI-shaped) |
| OpenCV | **INTEGRATE** | Apache-2.0; needed as the dependency underneath reframing/face-tracking work (§6) |
| GStreamer | **REJECT** | Duplicate capability of FFmpeg with a worse fit for filter-graph batch rendering; LGPL/GPL mix adds nothing here |

---

## 2. TTS & narration

### 2.1 Candidate verification (fetched 2026-10-24)

| Project | Repo / card | Code license | Weights license | Last push | Stars | Params / hardware |
|---|---|---|---|---|---|---|
| Piper (original) | github.com/rhasspy/piper | MIT | MIT (voices under permissive terms) | **2025-08-26 — ARCHIVED** (`archived: true`) | 11,307 | x_low 5-7M → high 28-32M; CPU-only |
| Piper 1 (successor) | github.com/OHF-Voice/piper1-gpl | **GPL-3.0** | voice models unchanged (HF `rhasspy/piper-voices`) | **2026-10-23** | 5,988 | same models; "embeds espeak-ng for phonemization"; Open Home Foundation, "looking for maintainers" |
| Kokoro-82M | hf.co/hexgrad/Kokoro-82M + github.com/hexgrad/kokoro (Apache-2.0) | Apache-2.0 (repo) | **Apache-2.0** ("license: apache-2.0" on card; "With Apache-licensed weights, Kokoro can be deployed anywhere") | 2025-08-06 (repo; stable) | 9,638 | 82M; CPU 3-5× realtime, <2GB RAM (prior research) |
| kokoro-onnx | github.com/thewh1teagle/kokoro-onnx | **MIT** ("kokoro-onnx: MIT") | model: Apache 2.0 (README) | **2026-09-01** | 2,807 | ~300MB full, ~80MB quantized; ONNX Runtime ≥1.20.1; CPU+GPU |
| Coqui TTS | github.com/coqui-ai/TTS | MPL-2.0 | per-model | **2024-08-16 — stale 2+ years**; company dead; `coqui.ai/cpml` now **404** | 46,135 | varies |
| Coqui TTS (maintained fork) | github.com/idiap/coqui-ai-TTS | MPL-2.0 | per-model | **2026-10-19** | 2,341 | the living continuation of the toolkit |
| XTTS-v2 | hf.co/coqui/XTTS-v2 | n/a (model) | **Coqui Public Model License** (non-commercial); license page dead | n/a | — | GPT-style, 17 languages |
| F5-TTS | github.com/SWivid/F5-TTS | **MIT** ("Our code is released under MIT License") | **CC-BY-NC** ("The pre-trained models are licensed under the CC-BY-NC license due to the training data Emilia") | **2026-10-23** | 15,446 | ~336M; GPU-preferred |
| Fish Speech / Drama 3 | github.com/fishaudio/fish-speech | **FACL v1.0** ("This codebase and its associated model weights are released under FISH AUDIO COMMUNITY LICENSE") | same FACL v1.0; **S2-Pro weights under "Fish Audio Research License"** | **2026-10-14** | 33,386 | Drama 3 **35B-A3B**; S2-Pro 4B "consumer GPU", RTF 0.195 on H200 |
| Chatterbox | github.com/resemble-ai/chatterbox | **MIT** (LICENSE file: "MIT License, Copyright (c) 2025 Resemble AI") | per-model **UNVERIFIED** — HF cards gated (HTTP 401), README model zoo has **no license column** | **2026-07-21** | 27,187 | Chatterbox 500M EN; Turbo 350M EN; **Nano 110M "Runs on CPU (3x realtime on 8 cores)"**; Multilingual V3 500M, 23+ languages |
| MeloTTS | github.com/myshell-ai/MeloTTS | **MIT** ("free for both commercial and non-commercial use" — README) | MIT per README | **2024-12-24 — stale 22 months** | 7,681 | "Fast enough for CPU real-time inference"; EN(5 accents)/ES/FR/ZH/JA/KO |
| VoxCPM2 | github.com/OpenBMB/VoxCPM | **Apache-2.0** ("VoxCPM model weights and code are open-sourced under the Apache-2.0 license") | **Apache-2.0** | **2026-10-08** | 40,507 | 2B (MiniCPM-4 base); ~8GB VRAM; GGUF CPU/Metal path RTF ~1.76 (M4 Pro, Q8_0); optional word timestamps (`voxcpm[timestamps]`) |
| OpenVoice V2 | github.com/myshell-ai/OpenVoice | **MIT** ("Starting from April 2024, both V2 and V1 are released under MIT License. Free for commercial use") | MIT per README | 2025-04-19 — slow | 38,056 | V2 EN/ES/FR/ZH/JA/KO; tone-color cloning |
| Web Speech API | MDN Web APIs | n/a — browser standard | n/a | n/a | — | Browser-only |

### 2.2 Language coverage — direct evidence only (English / Hindi / Urdu)

| Model | English | Hindi | Urdu | Evidence |
|---|---|---|---|---|
| Kokoro-82M | Yes (a/b voices) | **Yes** (`'h' => Hindi hi`) | **No** | lang_code list in hexgrad/kokoro README: 8 langs — en-US, en-GB, es, fr, **hi**, it, ja, pt-br, zh |
| kokoro-onnx | Yes | Yes (same voices) | No | defers to hexgrad/Kokoro-82M VOICES.md |
| Piper / piper1-gpl | Yes (~dozens of en voices) | **Yes** (`hi` folder, "rohan" voice) | **Yes — `ur_PK` exists** | HF tree rhasspy/piper-voices: `ur/ur_PK` folder, 127 MB, 3 commits, latest "Regenerate sample" ~3 months ago. Quality: **UNVERIFIED — needs a listening test before any recommendation** |
| VoxCPM2 | Yes | **Yes** (in the 30-language list) | **No** | README lists 30 languages incl. Arabic, Hindi, Swahili, Thai...; no Urdu; 9 Chinese dialects extra |
| Chatterbox Multilingual V3 | Yes | **Yes** (23-lang list includes Hindi; Hindi also a dedicated finetune) | **No** | README language list: Arabic, Danish, German, Greek, English, Spanish, Finnish, French, Hebrew, Hindi, Italian, Japanese, Korean, Malay, Dutch, Norwegian, Polish, Portuguese, Russian, Swedish, Swahili, Turkish, Chinese |
| XTTS-v2 | Yes | **Yes** (17-language list includes Hindi) | **No** | HF model card |
| F5-TTS | Yes | No (EN/ZH base on Emilia) | No | README |
| MeloTTS | Yes (5 accents) | No | No | README language list |
| OpenVoice V2 | Yes | No | No | README |

**Urdu honest verdict (RECOMMENDATION):** as of 2026-10-24 there is **no permissively-licensed, evidence-backed high-quality open Urdu TTS**. The only OSS candidate with an actual published Urdu voice is Piper (`ur_PK`, `ur/ur_PK` on HF) — quality unproven; every modern neural model we checked (Kokoro, VoxCPM2, Chatterbox, XTTS-v2, MeloTTS, F5) omits Urdu, and the multilingual models that publish "~100 languages" claims (Fish S2-Pro) do not publish per-language lists or Urdu samples. For a paying Urdu market: fine-tune a permissive model on Urdu data (weeks of work, needs corpus) or buy a commercial API — do **not** ship Piper Urdu or any NC model blind.

### 2.3 Verdicts (§10.3)

| Project | Verdict | Why |
|---|---|---|
| Kokoro-82M + kokoro-onnx | **KEEP** (current default) | Apache-2.0 weights, MIT wrapper, CPU-fast, word-timestamp path already in repo; stable (14-month-old repo is fine — model is frozen, wrapper active) |
| Piper → piper1-gpl | **INTEGRATE (niche)** | Only Urdu option; license changed MIT → **GPL-3.0** — fine as a subprocess (never linked into a distributed product); "Open Home Foundation is looking for maintainers" is a watch-item; test `ur_PK` quality first |
| idiap/coqui-ai-TTS | **STUDY** | The maintained MPL-2.0 fork of the dead upstream (pushed Oct 19) — useful if we ever need VITS-style models per language |
| XTTS-v2 | **REJECT** (monetized) | CPML is non-commercial and the license page (`coqui.ai/cpml`) now 404s — legal limbo on top of the NC terms |
| F5-TTS | **REJECT** (monetized) | Code MIT but "pre-trained models... CC-BY-NC... due to the training data Emilia" — unchanged from Sept verdict |
| Fish Speech / Drama 3 | **REJECT → watch** | License tightened into FACL v1.0: grant is "for any Research or Non-Commercial Purpose"; commercial license "only while Your Annual Revenue is less than USD 500,000"; hosted services need "a separate written license"; plus enforcement language ("will take action against any violation"). Under $500k revenue it is technically usable, but the custom license + revocability is exactly the wrong contract shape for a SaaS |
| Chatterbox | **STUDY** (expressive fallback) | MIT code; Nano runs CPU 3× realtime; Multilingual V3 covers Hindi. **But per-model weights licenses are gated/UNVERIFIED today — resolve that before any production use.** Also 3 months since last push |
| MeloTTS | **DEFER** | MIT + CPU-realtime, but 22 months stale and no Hindi/Urdu — Kokoro covers its use case better |
| OpenVoice V2 | **DEFER** | MIT cloning, but stale (Apr 2025) and 6-language; VoxCPM2 supersedes it functionally |
| VoxCPM2 | **STUDY — top new candidate** | Apache-2.0 code+weights, 30 languages incl. Hindi, true cloning, ~8GB VRAM or CPU GGUF, optional word timestamps — first serious commercial-safe upgrade path beyond Kokoro |
| Web Speech API | **REJECT** (server pipeline) | "Implemented by the `Window` object" — browser-only, platform-provided voices, no server automation path (MDN) |

---

## 3. STT & subtitles

### 3.1 Candidate verification (fetched 2026-10-24)

| Project | Repo | License | Last push | Stars | Language | Key facts (verbatim from docs) |
|---|---|---|---|---|---|---|
| openai/whisper | github.com/openai/whisper | MIT (code); large-v3 weights card: **Apache-2.0** | 2026-08-31 | 111,189 | Python | Reference implementation; 99 languages (`num_languages: int = 99`) |
| faster-whisper | github.com/SYSTRAN/faster-whisper | MIT | **2026-10-23** | 26,108 | Python | "up to 4 times faster than openai/whisper for the same accuracy while using less memory"; int8 CPU / int8_float16 GPU; Distil-Whisper + `turbo` compatible |
| whisper.cpp | github.com/ggml-org/whisper.cpp | MIT | **2026-10-19** | 54,623 | C/C++ | Runtime mem: tiny ~273MB → large ~3.9GB; Q5_0 quantize; runs macOS/iOS/Android/**WebAssembly**/Raspberry Pi; large-v3-turbo supported |
| WhisperX | github.com/m-bain/whisperX | **BSD-2-Clause** | **2026-10-22** | 24,820 | Python | "Accurate word-level timestamps using wav2vec2 alignment"; "70x realtime with large-v2" (batched); diarization via pyannote — README now cites **speaker-diarization-community-1 (CC-BY-4.0, needs HF token)**; "faster-whisper backend, requires <8GB gpu memory for large-v2 with beam_size=5" |
| Subtitle Edit | github.com/SubtitleEdit/subtitleedit | **MIT** (LICENSE file: "MIT License, Copyright (c) 2026 Nikolaj Olsson" — **changed from the historic GPL-3.0**) | **today** | 14,701 | C# | Desktop GUI editor; not a pipeline component |
| pyannote/speaker-diarization-3.1 | hf.co/pyannote/speaker-diarization-3.1 | **MIT** ("this pipeline uses MIT license and will always remain open-source") | n/a | — | — | **Gated**: must accept conditions for segmentation-3.0 + diarization-3.1 and pass an HF token |

### 3.2 Language coverage evidence

- Whisper tokenizer (`whisper/tokenizer.py` on main): `"ur": "urdu"` and `"hi": "hindi"` both present; ~99 entries, `num_languages: int = 99`. Every CTranslate2/whisper.cpp model inherits this language set.
- Published Urdu WER: **none found on primary cards today** — the large-v3 HF card shows a Hindi WER (Vaani-Benchmark-V1.0: **26.8**) and mean 7.44 on the open-asr-leaderboard, but no Urdu row. Urdu is in-scope but low-resource: expect materially worse accuracy than English. **(UNVERIFIED beyond tokenizer inclusion; validate with our own audio before promising Urdu subtitles.)**
- Formats: all four engines emit SRT/VTT/ASS-convertible segments; the ASS styling work stays ours (FFmpeg `subtitles` filter / libass).

### 3.3 Verdicts (§10.4)

| Project | Verdict | Why |
|---|---|---|
| faster-whisper | **KEEP** (default STT; already in docker-compose) | MIT, active, 4× speed claim, int8 CPU fits free CI runners |
| WhisperX | **INTEGRATE** (word timestamps + diarization) | BSD-2-Clause; solves the repo's estimated-timestamp subtitle drift (narrate.py flaw 3) properly; note the two runtime gates: HF token for gated pyannote, CC-BY-4.0 community model — attribution obligation, fine for video use |
| whisper.cpp | **STUDY** (edge/CPU-only lanes) | MIT; the only option for WASM/RPi; not needed while faster-whisper serves |
| openai/whisper | **KEEP as reference only** | Slowest implementation; Apache-2.0 large-v3 weights are the ones everyone else serves |
| Subtitle Edit | **TOOL, not dependency** | Now MIT (notable license flip); useful as a human-QA desktop app for the review gate, not in CI |

---

## 4. Image generation — open weights

### 4.1 Model card verification (fetched 2026-10-24)

| Model | HF card | Weight license | Commercial? | Params / VRAM | Text rendering / notes |
|---|---|---|---|---|---|
| FLUX.1 schnell | hf.co/black-forest-labs/FLUX.1-schnell | **Apache-2.0** ("can be used for personal, scientific, and commercial purposes") | **Yes** | 12B rectified flow transformer (BF16) | 4-step distilled; VRAM not stated on card; community practice ~12-16GB BF16, less quantized (UNVERIFIED) |
| FLUX.1 dev | hf.co/black-forest-labs/FLUX.1-dev | **FLUX.1 [dev] Non-Commercial License** | Weights: **no**. **Outputs: yes** — "Generated outputs can be used for personal, scientific, and commercial purposes"; deployment "requires content filters or manual review" | 12B | Flagship quality |
| FLUX.1 Krea dev | hf.co/black-forest-labs/FLUX.1-Krea-dev | **flux-1-dev-non-commercial-license** ("This model falls under the FLUX.1 [dev] Non-Commercial License") | Same split as dev (outputs yes) | 12B | BFL+Krea joint release; aesthetic "opinionated" tuning |
| SDXL base 1.0 | hf.co/stabilityai/stable-diffusion-xl-base-1.0 | **CreativeML Open RAIL++-M** | Yes, with use-based restrictions | 3B | Aging quality; huge fine-tune ecosystem; ~8-10GB BF16 (community figure, UNVERIFIED) |
| SD 3.5 Large | hf.co/stabilityai/stable-diffusion-3.5-large | **Stability Community License** | "Free for research, non-commercial, and commercial use for organizations or individuals with less than $1M in total annual revenue"; above → Enterprise License | 8B (BF16); 4-bit NF4 path documented to "Reduce your VRAM usage" | Strong prompt adherence |
| Qwen-Image | hf.co/Qwen/Qwen-Image | **Apache 2.0** ("Qwen-Image is licensed under Apache 2.0") | **Yes** | 20B (BF16); VRAM not stated on card (needs high-end or quantized — UNVERIFIED) | "exceptional performance in text rendering, especially for Chinese"; precise image editing — the thumbnail-text use case |
| PixArt-Σ | hf.co/PixArt-alpha/PixArt-Sigma-XL-2-1024-MS | Open RAIL++-M | Yes, with use restrictions | 0.6B DiT (+T5 encoder) | Repo **stale: last push 2024-10-31**; card admits "Cannot render legible text" — disqualified for our thumbnail/diagram text needs |
| ComfyUI | github.com/Comfy-Org/ComfyUI (moved from comfyanonymous) | **GPL-3.0** | Yes as a local tool (subprocess/app; GPL matters only if we link or redistribute its code) | n/a | 142,567★; pushed **today**; the de-facto runner for all of the above |

### 4.2 The license nuance that changes the repo policy question (FACT)

The task framed "monetized-YouTube output requires a commercially-licensed model." **The FLUX.1 dev license itself contradicts the strict form of that rule**: the model card states "Generated outputs can be used for personal, scientific, and commercial purposes as described in the FLUX.1 [dev] Non-Commercial License." So under the license text, monetized YouTube images *generated by* FLUX.1 dev/Krea are permitted. What is NOT permitted: commercial use of the **weights** (hosting them as part of a paid product/service) — and the license adds deployment obligations ("content filters or manual review").

**RECOMMENDATION (policy):** keep the correction in mind for owned-channel thumbnails (dev/Krea outputs are licensable), but for the **multi-tenant SaaS** standardize on **Apache-2.0 weights only (FLUX.1 schnell, Qwen-Image)** — because when clients pay us to run generation, the weights are arguably part of a commercial service, and an Apache-2.0 stack removes the argument entirely. Mark this as a policy decision for the owner, not settled law: nobody has tested the "SaaS running NC weights to produce client outputs" reading in court, and BFL's docs don't address multi-tenant hosting explicitly (**UNVERIFIED interpretation**).

### 4.3 Verdicts (§10.5)

| Model | Verdict | Why |
|---|---|---|
| FLUX.1 schnell | **ADOPT as SaaS default** | Apache-2.0, 12B, 4-step speed — the only fast+permissive flagship-class option |
| Qwen-Image | **ADOPT (quality tier, GPU-gated)** | Apache-2.0 + best-in-class text rendering = the thumbnail generator we wish Pillow was; needs serious VRAM at BF16 |
| SD 3.5 Large | **STUDY** | Community License free <$1M revenue — fine for us now, becomes a contract above it; 8B |
| FLUX.1 dev / Krea | **CONDITIONAL** (owned channels only) | Outputs commercial OK per license; weights NC + deployment obligations — document the split in the image pipeline |
| SDXL | **DEFER** | Open RAIL++-M is fine commercially, but quality is superseded by schnell/Qwen-Image; only relevant for existing LoRA ecosystems |
| PixArt-Σ | **REJECT** | Stale repo (Oct 2024) + "Cannot render legible text" — fails our core use case |
| ComfyUI | **INTEGRATE** (local runner) | GPL-3.0 is fine as an app we invoke; never import/embed its code in Studio; 142k★ activity makes it the safe hub for all these models |

---

## 5. Animation & motion graphics

### 5.1 Candidates (fetched 2026-10-24)

| Project | License | Last activity | Stars | What it actually is |
|---|---|---|---|---|
| Manim CE | MIT | pushed **today** | 41,825 | Python framework for math animation (deterministic CPU render, CI-friendly) |
| Blender | **GPL-2.0-or-later** (code; Cycles under Apache-2.0; "GPL Version 3 or later applies to binary distributions") | blender.org/about/license/ (fetched 2026-10-24) | — | Full 3D suite; `blender -b` headless render |
| Lottie / lottie-web | MIT | pushed **2025-09-01** (13 months quiet) | 32,270 | AE-authored JSON player for the browser |
| rlottie (Samsung) | "NOASSERTION" SPDX (mixed/custom) | pushed 2026-09-30, low cadence | 1,444 | C++ Lottie player — irrelevant to our HTML pipeline |
| SVG SMIL / CSS animation | Web standards (no license) | — | — | What HyperFrames/GSAP already drive |
| Remotion motion graphics | Remotion custom license (see §1.2) | v4.0.538, 2026-10-22 | 67,022 | React timeline; GSAP free incl. all pro plugins since 3.13 (prior research, css-tricks.com) |
| Rive | Runtimes **MIT** ("MIT-licensed runtimes. No royalties, no revenue share, no runtime fees" — rive.app); **editor is proprietary SaaS** | rive-runtime pushed **today** (1,239★) | — | Authored interactive motion; free account required to push files; **tier limits UNVERIFIED** (pricing page is JS-rendered) |

### 5.2 The GPL question, answered precisely (FACT + citation)

- Blender's own compliance page: "What you create with Blender is your sole property," covering "images, movies, and .blend files," and Blender "can be used commercially by artists, by studios to make animation films or VFX."
- GNU GPL FAQ (gnu.org/licenses/gpl-faq.en.html#GPLOutput, fetched 2026-10-24): "The output of a program is not, in general, covered by the copyright on the code of the program... the license of the code of the program does not apply to the output" — whether saved to a file, screenshotted, or recorded to video. Exception: output that *embeds* program-owned text/art.
- One real obligation: Blender's page notes "the GPL requires that such scripts (if published) are being shared under a GPL compliant license" — so any bpy scripts **we publish** (e.g., in this public repo) must be GPL-compatible; scripts kept private are not distributed and this doesn't trigger.
- **Net:** invoking `blender -b scene.blend -a` as a subprocess in CI is license-safe for the SaaS; the constraints are operational (Cycles CPU-slow on CI, EEVEE needs GPU/xvfb), not legal.

### 5.3 Suitability per use (RECOMMENDATION, from verified facts above + prior research)

| Use | Best OSS fit | Note |
|---|---|---|
| Educational explainers ( Vox/JSM style) | Remotion + GSAP (owned) | Template-library pattern remains the differentiator (animated-explainer research §3.3) |
| Finance diagrams / chart races | Vizzu + D3 in Remotion (prior research; Apache-2.0 / ISC) | Unchanged |
| Timelines / animated text | GSAP SplitText/ScrambleText (free since 3.13) + CSS | Unchanged |
| Science / math animation | **Manim CE** (MIT, active today) | LLM-writes-scene-with-retry pattern is mature; separate Python render path fits the sidecar |
| 3D / data-viz b-roll | Blender headless (GPL-safe as subprocess) | Only if a niche demands 3D; CI cost first |
| Character stories | Rive/Lottie need authored assets — **no generative authoring path exists**; defer | Prior verdict holds |
| Shorts motion graphics | Existing HyperFrames + GSAP stack | A HyperFrames template ecosystem is visibly forming (§7: hyperkuy, tareabox, hyperframes-motion) |

---

## 6. Auto-clipping / repurposing

### 6.1 Verified candidates (fetched 2026-10-24)

| Project | Repo | License | Last push | Stars | Language | What it is (from README/source) | AI models it needs |
|---|---|---|---|---|---|---|---|
| **openshorts** | github.com/mutonby/openshorts | MIT | **today** | 7,050 | Python | "Open source AI clip generator: turns long videos into viral 9:16 shorts with AI moment detection," face tracking, subtitles/dubbing, Docker self-host, **MCP server + API**. NOTE: repo is a fork of kamilstanuch/Autocrop-vertical (YOLOv8 + FFmpeg vertical crop) | LLM for moment detection + face model (YOLOv8 lineage) |
| **FunClip** | github.com/modelscope/FunClip | MIT (code); models "Paraformer-Large, SeCo-Paraformer, and CAM++ currently list Apache License 2.0" (README) | **2026-10-08** | 6,448 | Python | "fully open-source, locally deployed automated video clipping tool" — FunASR transcription, text/speaker selection, LLM "AI clipping", Gradio UI, SRT for segments | Paraformer-Large (Chinese-first; `-l en` for English), CAM++ speaker ID, optional SenseVoice/Fun-ASR-Nano, LLM |
| **MoneyPrinterTurbo** | github.com/harry0703/MoneyPrinterTurbo | MIT | **today** | 134,796 | Python | Full faceless-video generator (script → TTS → footage → subtitles → upload), Agent/WebUI/API/CLI modes; TTS: Edge/Azure/Kokoro/Chatterbox/VoxCPM/Fish...; subtitles via TTS timestamps or faster-whisper; sources: Pexels/Pixabay/Coverr + AI T2V; auto-upload TikTok/IG/YT. Min: 4-core CPU, 4GB RAM, no GPU | Any LLM (11 providers); TTS engines above; optional faster-whisper |
| **AI-Youtube-Shorts-Generator** | github.com/Anil-matcha/AI-Youtube-Shorts-Generator | MIT | **today** | 5,583 | Python | "Open-source alternative to Opus Clip... LLM highlight detection, Whisper transcription, auto vertical cropping" | Whisper + LLM |
| **autoclip** | github.com/artbyjazi/autoclip | MIT | **2026-08-01** | 200 | Python | "local-first AI video clipper. Long video in, caption-burned speaker-tracked 9:16 clips out... Fully offline with Whisper + Ollama" | Whisper + Ollama LLM + mediapipe |
| **ViralCutter** | github.com/RafaelGodoyEbert/ViralCutter | **GPL-3.0** | 2026-09-10 | 433 | Python | YT → TikTok/IG clips with transcription + 9:16 editing | GPT + transcription |
| short-video-maker | github.com/gyoridavid/short-video-maker | MIT | **2025-06-21 — 16 months stale** | 1,428 | TypeScript | Remotion-based shorts via MCP/REST | Whisper + Kokoro lineage |
| ShortGPT | github.com/RayVentura/ShortGPT | MIT | **2025-02-10 — DEAD 20 months** | 8,066 | Python | Influential scene/timeline framework | — |
| krishpathak/clip-gen | github.com/krishpathak/clip-gen | — | — | **404 — does not exist** | — | Mentioned in assignment; not found on GitHub | — |
| "Merucio" | — | — | — | **not found** | — | No GitHub project by this name located | — |

### 6.2 Feature decomposition — what to reuse vs build (RECOMMENDATION)

Our clips-first Shorts lane (#95-#101) is the backbone; OSS clippers are for **gap-fill**, not replacement:

| Capability | Best verified OSS | License | Reuse shape |
|---|---|---|---|
| Scene detection | PySceneDetect (github.com/Breakthrough/PySceneDetect, BSD-3-Clause, pushed 2026-10-22, 5,286★) | BSD-3 | pip dependency in a Python sidecar |
| Speech segmentation + words | faster-whisper / WhisperX (§3) | MIT / BSD-2 | already in stack |
| Highlight selection | LLM (we own the script brain) — openshorts/FunClip's LLM-picking is the same pattern | — | ours already |
| Reframing / face tracking | mediapipe (google-ai-edge/mediapipe, Apache-2.0, 37,390★, pushed today) or YuNet via opencv_zoo (Apache-2.0, 1,101★, pushed 2026-10-20); YOLOv8 lineage inside openshorts | Apache-2.0 | port the crop logic into our vertical brand-pad step |
| Speaker diarization | WhisperX + pyannote (MIT pipeline; CC-BY-4.0 community model; HF token) | MIT/CC-BY | via WhisperX |
| Human review gate | ours (Studio) | — | none of the OSS tools ship a real review UI worth adopting |

### 6.3 Verdicts (§10.7)

| Project | Verdict | Why |
|---|---|---|
| openshorts | **STUDY (top pick)** | Genuinely maintained (pushed today), MIT, 7k★, MCP/API surface, face tracking + moment detection — closest maintained "Opus Clip OSS" |
| FunClip | **INTEGRATE (ideas + code)** | MIT, active, Apache-2.0 ASR weights; Chinese-first ASR makes it a poor English clipper, but its transcript-driven clipping model and CAM++ speaker logic are reference-grade |
| MoneyPrinterTurbo | **KEEP AS REFERENCE** (not a dependency) | MIT, very alive, 134.8k★; its architecture (manifest-driven CLI batch, TTS-timestamp subtitles) validates our pipeline shape; adopting it wholesale would orphan our 15k-line stack |
| AI-Youtube-Shorts-Generator | **STUDY** | Active today, MIT, simple Whisper+LLM highlight → crop; good reference for the highlight-picking prompt |
| autoclip | **STUDY (small)** | Exactly the local-first Whisper+Ollama shape; 200★ — treat as code to read, not a platform |
| ViralCutter | **DEFER** | GPL-3.0 (safe as subprocess, contaminating as vendored code), modest activity |
| short-video-maker | **REJECT** | Stale 16 months despite the neat Remotion+MCP idea |
| ShortGPT | **REJECT (confirmed dead)** | Last push 2025-02-10; matches the Sept verdict with 2026 evidence |

---

## 7. GitHub topics & discovery sweep (protocol §11)

Method: github.com topic pages fetched 2026-10-24 (youtube-automation, faceless, text-to-video, shorts, tts, ai-video, thumbnail-generation, video-templates); every new candidate above verified via the GitHub API before ranking. Rank = maintenance × capability × license, not stars.

### 7.1 youtube-automation / faceless

| Rank | Tool | Stars | License | Pushed | Verdict |
|---|---|---|---|---|---|
| 1 | **darkzOGx/youtube-automation-agent** | 4,578 | MIT | 2026-10-20 | **STUDY** — self-hosted agent running a channel end-to-end (research→script→narrate→SEO→publish-with-signoff, Gemini/OpenAI/OpenRouter/DeepSeek). Closest open analog of our whole stack; mine for patterns (sign-off gate!), don't adopt |
| 2 | jub0t/Concat | 11,269 | **AGPL-3.0** | today | **STUDY** — Rust "local-first CapCut replacement" with JSON-RPC + MCP scripting. AGPL means: fine as a local editor tool, **contaminating if embedded in the SaaS** (network-use clause). Watch, don't vendor |
| 3 | naqashafzal/AI-Content-Studio | 869 | unknown (UNVERIFIED) | 2026-10-12 | Skip — overlaps what we own |
| 4 | IgorShadurin/app.yumcut.com | ~895 | UNVERIFIED | recent | Skip — SaaS frontend |
| 5 | heyncth/youtube-auto-dub | 306 | UNVERIFIED | 2026-10-20 | **Watch** — Whisper+translate+Edge-TTS dubbing pipeline; relevant if Urdu/Hindi dubbing lane opens (license unverified) |

### 7.2 text-to-video / ai-video (generative + agentic)

| Rank | Tool | Stars | License | Verdict |
|---|---|---|---|---|
| 1 | CogVideo (zai-org) / LTX-Video (Lightricks) / HunyuanVideo-1.5 (Tencent) | 13.1k / 11.2k / 4.6k | various (LTX community <$10M; Hunyuan restricted — prior research) | **DEFER** — open-weight video gen still GPU-gated; Wan 2.2 Apache-2.0 remains the commercial-safe pick from Sept research |
| 2 | calesthio/OpenMontage | 71,486 | **AGPL-3.0** | **Flag, don't adopt** — "agentic video production system, 12 pipelines, 700+ agent skills" for Claude/Codex IDEs; it's a skill/prompt pack, not an engine; AGPL + star-velocity pattern warrants a skepticism pass before believing capability claims |
| 3 | hypit-ai/hypit | 25,330 | **NOASSERTION** | **REJECT** — "clone any viral video... swap the face, the words" is both a license unknown and a YouTube-policy landmine (inauthentic content) |
| 4 | Anil-matcha/Open-Generative-AI | 31,403 | MIT | **Skip** — aggregator wrapping paid APIs (fal/MuAPI etc.); we already have BYOK vault pattern |
| 5 | dramaclaw | 6,435 | UNVERIFIED | **Watch** — script→film AIGC engine; verify license before any use |
| 6 | The 2026 "agent-skills" wave: video-shotcraft (13.4k), lemo-opuscar (6.5k), drama-skills (MIT, 3.3k), anything2explainer (2.7k), stickman-video-director (2.9k) | — | mostly UNVERIFIED per-repo | **Trend to monitor** — skill packs riding Claude Code/Codex; validate licenses individually before importing any into this repo |

### 7.3 shorts / clipping — see §6 (openshorts ranked 1; short-video-maker and ShortGPT ranked out as stale/dead)

Also noted on the shorts topic: ViralCutter (GPL-3.0), Clip-Anything (SamurAIGPT, 309★ — demo-grade), jiang-clips (331★), reels-clips-automator (232★) — all below the maintenance bar.

### 7.4 tts — see §2. New topic-page finds worth recording:

| Tool | Stars | License | Verdict |
|---|---|---|---|
| OpenBMB/VoxCPM2 | 40,507 | Apache-2.0 (code+weights) | §2 verdict: STUDY/ADOPT-candidate |
| OpenVoice (myshell-ai) | 38,056 | MIT | DEFER (stale) |
| index-tts | 24.7k | previously NC weights (Sept research) | REJECT for monetized unless license changed — UNVERIFIED today |
| debpalash/VoiceStudio | ~84.5k (topic page) | UNVERIFIED | **Flag** — "646 languages" claim is extraordinary; verify code/weights/licenses before believing anything |
| ChatTTS (2noise) | 39.9k | CC-BY-NC + stale (Sept research) | REJECT |
| GPT-SoVITS (RVC-Boss) | 63.6k | MIT code; weights ambiguous (Sept research) | Fine-tune-from-own-audio only |

### 7.5 thumbnail-generation / video-templates

- `thumbnail-generation` topic is a **dead end** (6 repos, top one 6★) — no OSS worth ranking; our Pillow/sharp pipeline has no OSS competitor worth adopting.
- `video-templates` topic is tiny in stars but strategically interesting: a **HyperFrames-compatible template economy is forming** — hyperkuy ("66 named 9:16 design templates for HyperFrames"), tareabox ("100+ HyperFrames video blocks"), hyperframes-motion ("AE-style motion graphics in plain HTML + GSAP"), hyperframes-templates, Reelcn (Remotion components via shadcn CLI). All 1-36★ (too small to rank) — **watch**: if HyperFrames is becoming a standard, our in-house engine gains a template ecosystem for free.

### 7.6 Overlapping tools to avoid (duplicate-capability map)

- **Three Anil-matcha repos overlap** (AI-Youtube-Shorts-Generator, Clip-Anything, Open-Generative-AI) — same author flooding adjacent niches; pick one (the Shorts generator) if referencing.
- **Concat vs MoneyPrinterTurbo vs our stack**: editor (AGPL) vs generator (MIT) vs ours — do not stack all three; ours + one reference is enough.
- **OpenMontage vs our repo**: it packages the same idea (LLM-driven pipelines) as IDE skills; adopting it would couple our pipeline to a specific agent toolchain under AGPL.
- **Kokoro vs VoxCPM2 vs Chatterbox**: keep exactly one CPU default (Kokoro) + one upgrade path (VoxCPM2); Chatterbox only if emotion control proves necessary.

---

## 8. Risks & gaps

1. **Urdu is an unserved gap** in OSS: only Piper `ur_PK` (quality UNVERIFIED) exists under a permissive license; every modern model omits it. Any Urdu channel launch needs a quality spike or a commercial API decision.
2. **Chatterbox weights licensing is unverifiable from public sources today** (gated HF cards 401, no per-model license in README) — resolve before any production use despite the MIT repo.
3. **Custom-license drift is the pattern of 2026**: Fish Speech (FACL v1.0, $500k threshold, revocable), SD 3.5 ($1M), Remotion (headcount + "5.0 will slightly change"), LTX (<$10M). For the SaaS, prefer Apache-2.0/MIT weights wherever quality allows; that now covers rendering (HyperFrames), STT (whisper family), TTS default (Kokoro), image (schnell/Qwen-Image) — the stack can be fully permissive except Remotion.
4. **AGPL entering the ecosystem** (Concat, OpenMontage): safe as local tools, unsafe vendored into a network service. Add an AGPL check to the dependency-review habit.
5. **Piper's stewardship**: original repo archived; successor is GPL-3.0 and the Open Home Foundation is "looking for maintainers" — a maintenance bet, not a platform.
6. **WhisperX runtime gates**: HF token + gated pyannote models are CI-secrets work; CC-BY-4.0 model requires attribution in our outputs' description template.
7. **Maintenance-risk stands**: MoviePy (17 mo no release), MeloTTS (22 mo), short-video-maker (16 mo), PixArt-Σ (2 years) — all now formally rejected/deferred above, closing the "which of these can rot under us" question.
8. **Trend risk/opportunity**: the agent-skills wave (OpenMontage, video-shotcraft...) is racing ahead on licenses nobody reads. Our moat is the owned, deterministic pipeline + review gates; the skills wave validates the direction but importing unvetted skill packs is a supply-chain risk.

## 9. Open questions

1. Piper `ur_PK` listening test — is it usable at Shorts narration quality, or Urdu stays commercial-API-only?
2. Chatterbox per-model weights licenses (Turbo/Multilingual V3) — gated cards; needs an HF account with accepted terms to read them.
3. VoxCPM2 spike: English/Hindi quality vs Kokoro at equal voices, and GGUF-CPU RTF inside a GHA runner (README claims ~1.76× RTF on M4 Pro Q8_0 — untested here).
4. Remotion 5.0 license text — "will slightly change"; re-check the trigger terms before the explainer package grows.
5. SaaS + FLUX.1 dev outputs: acceptable for client work under the outputs carve-out, or standardize Apache-only? (Owner policy decision; §4.2.)
6. VoiceStudio (84.5k★, "646 languages") — real project or star-inflated wrapper? Verify before the next TTS round.
7. Does the HyperFrames template ecosystem (hyperkuy, tareabox) mature enough to source templates instead of authoring all in-house?

## Sources

Fetched 2026-10-24 unless noted. One line each on what it supported.

1. api.github.com/repos/remotion-dev/remotion (+ /releases/latest) — 67,022★, pushed 2026-10-24, custom license, v4.0.538 (2026-10-22).
2. raw.githubusercontent.com/remotion-dev/remotion/main/LICENSE.md — free ≤3-person org; Company License trigger; "In Remotion 5.0, the license will slightly change."
3. remotion.dev/docs/license/faq — Creators $25/mo per coder; Automators $0.01/render $100/mo min; Enterprise $500 min; render definition.
4. remotion.dev/docs/cloudrun — "Alpha status and not actively being developed"; 8 vCPU/32GB/60min.
5. remotion.dev/docs/captions — @remotion/captions caption utilities exist.
6. ffmpeg.org — FFmpeg 8.1 "Hoare" (2026-03-16); 8.0 "Huffman" (2025-08-22).
7. ffmpeg.org/legal.html — LGPL-2.1-or-later; `--enable-gpl` build choice; "not available under any other licensing terms."
8. api.github.com/repos/Zulko/moviepy (+ releases/latest) — MIT, 15,022★, pushed 2026-08-26, v2.2.1 (2025-05-21).
9. api.github.com/repos/ManimCommunity/manim — MIT, 41,825★, pushed 2026-10-24.
10. api.github.com/repos/3b1b/manim — MIT, 95,614★, pushed 2026-09-09 (ManimGL).
11. api.github.com/repos/opencv/opencv — Apache-2.0, 91,316★, pushed 2026-10-24.
12. api.github.com/repos/GStreamer/gstreamer — mixed license (NOASSERTION), 3,348★, active.
13. api.github.com/repos/rhasspy/piper — MIT, 11,307★, **archived: true**, last push 2025-08-26.
14. api.github.com/repos/OHF-Voice/piper1-gpl + README — GPL-3.0 successor, 5,988★, pushed 2026-10-23; espeak-ng phonemizer; OHF "looking for maintainers."
15. huggingface.co/rhasspy/piper-voices/tree/main (+ /ur) — language folders incl. `hi` (rohan) and **`ur/ur_PK` (127MB, recent commits)**.
16. huggingface.co/hexgrad/Kokoro-82M — Apache-2.0 weights, 82M params, 54 voices v1.0.
17. raw.githubusercontent.com/hexgrad/kokoro/main/README.md — 8-language lang_code list incl. `'h' => Hindi hi`; no Urdu.
18. api.github.com/repos/thewh1teagle/kokoro-onnx + README — MIT wrapper / Apache-2.0 model, 2,807★, pushed 2026-09-01, ~300MB/~80MB.
19. api.github.com/repos/coqui-ai/TTS — MPL-2.0, 46,135★, pushed 2024-08-16 (dead upstream).
20. api.github.com/repos/idiap/coqui-ai-TTS — MPL-2.0 maintained fork, 2,341★, pushed 2026-10-19.
21. huggingface.co/coqui/XTTS-v2 — CPML (non-commercial), 17 languages incl. Hindi, no Urdu; 6-second cloning.
22. coqui.ai/cpml — HTTP 404 (license page dead) as of 2026-10-24.
23. raw.githubusercontent.com/SWivid/F5-TTS/main/LICENSE + README — code MIT; "pre-trained models are licensed under the CC-BY-NC license due to the training data Emilia."
24. api.github.com/repos/fishaudio/fish-speech + LICENSE + README — FACL v1.0: research/non-commercial grant; commercial "only while Your Annual Revenue is less than USD 500,000"; hosted service needs separate license; Drama 3 35B-A3B; S2-Pro under Research License; ~100-language claim, no per-language list.
25. api.github.com/repos/resemble-ai/chatterbox + LICENSE + README — MIT ("Copyright (c) 2025 Resemble AI"), 27,187★, pushed 2026-07-21; model zoo: Turbo 350M EN, Nano 110M CPU 3× realtime (8 cores), Multilingual V3 500M 23+ langs incl. Hindi; no per-model license column; HF cards gated (401) — weights licenses UNVERIFIED.
26. api.github.com/repos/myshell-ai/MeloTTS + README — MIT, CPU realtime claim, EN(5)/ES/FR/ZH/JA/KO; pushed 2024-12-24 (stale).
27. api.github.com/repos/OpenBMB/VoxCPM + README — Apache-2.0 code+weights, 40,507★, pushed 2026-10-08; 30 languages incl. Hindi (no Urdu); 2B; ~8GB VRAM; GGUF CPU RTF ~1.76 M4 Pro; optional word timestamps.
28. api.github.com/repos/myshell-ai/OpenVoice + README — MIT since Apr 2024, pushed 2025-04-19, V2 six languages.
29. developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API — browser-only synthesis via `window.speechSynthesis`, device voices.
30. api.github.com/repos/openai/whisper + whisper/tokenizer.py — MIT, 111,189★; LANGUAGES: `"ur": "urdu"`, `"hi": "hindi"`, 99 total.
31. huggingface.co/openai/whisper-large-v3 — Apache-2.0 weights, 99 languages, Hindi WER 26.8 (Vaani), mean 7.44 leaderboard.
32. api.github.com/repos/SYSTRAN/faster-whisper + README — MIT, 26,108★, pushed 2026-10-23; "up to 4 times faster... same accuracy"; int8 CPU.
33. api.github.com/repos/ggml-org/whisper.cpp + README — MIT, 54,623★; memory table 273MB-3.9GB; Q5_0; WASM/RPi; large-v3-turbo.
34. api.github.com/repos/m-bain/whisperX + README — BSD-2-Clause, 24,820★, pushed 2026-10-22; wav2vec2 word timestamps; 70× realtime large-v2; pyannote speaker-diarization-community-1 (CC-BY-4.0, HF token); faster-whisper backend <8GB GPU.
35. huggingface.co/pyannote/speaker-diarization-3.1 — MIT pipeline; gated (accept segmentation-3.0 + diarization-3.1, HF token).
36. api.github.com/repos/SubtitleEdit/subtitleedit + LICENSE — MIT ("Copyright (c) 2026 Nikolaj Olsson"), 14,701★, pushed 2026-10-24.
37. huggingface.co/black-forest-labs/FLUX.1-schnell — Apache-2.0, 12B, commercial OK.
38. huggingface.co/black-forest-labs/FLUX.1-dev — Non-Commercial License; "Generated outputs can be used for personal, scientific, and commercial purposes"; content filters/manual review on deployment; 12B.
39. huggingface.co/black-forest-labs/FLUX.1-Krea-dev — flux-1-dev-non-commercial-license; BFL+Krea; outputs commercial OK.
40. huggingface.co/stabilityai/stable-diffusion-xl-base-1.0 — CreativeML Open RAIL++-M; 3B.
41. huggingface.co/stabilityai/stable-diffusion-3.5-large — Stability Community License; free commercial <$1M annual revenue; 8B; NF4 quant path.
42. huggingface.co/Qwen/Qwen-Image — Apache-2.0; 20B; text-rendering claims (Chinese+English).
43. huggingface.co/PixArt-alpha/PixArt-Sigma-XL-2-1024-MS + api.github.com/repos/PixArt-alpha/PixArt-sigma — Open RAIL++-M weights; 0.6B; "Cannot render legible text"; repo last push 2024-10-31.
44. api.github.com/repos/Comfy-Org/ComfyUI — GPL-3.0, 142,567★, pushed 2026-10-24 (org moved from comfyanonymous).
45. blender.org/about/license/ — GPL ("Version 2 or later", Cycles Apache-2.0); "What you create with Blender is your sole property"; published bpy scripts must be GPL-compliant.
46. gnu.org/licenses/gpl-faq.en.html#GPLOutput — "The output of a program is not, in general, covered by the copyright on the code of the program."
47. api.github.com/repos/airbnb/lottie-web — MIT, 32,270★, pushed 2025-09-01.
48. api.github.com/repos/Samsung/rlottie — NOASSERTION, 1,444★, pushed 2026-09-30.
49. rive.app + api.github.com/repos/rive-app/rive-runtime — "MIT-licensed runtimes. No royalties, no revenue share, no runtime fees"; editor SaaS w/ free account; pricing tiers not readable (JS page) — UNVERIFIED.
50. api.github.com/repos/modelscope/FunClip + README — MIT, 6,448★, pushed 2026-10-08; Paraformer (Apache-2.0 weights), CAM++ speakers, `-l en`, LLM clipping, Gradio.
51. api.github.com/repos/harry0703/MoneyPrinterTurbo + README — MIT, 134,796★, pushed 2026-10-24; Agent/WebUI/API/CLI; TTS incl. Edge/Kokoro/Chatterbox/VoxCPM; faster-whisper subtitles; Pexels/Pixabay/Coverr; 4GB RAM min.
52. api.github.com/repos/RayVentura/ShortGPT — MIT, 8,066★, last push 2025-02-10 (dead).
53. api.github.com/repos/Anil-matcha/AI-Youtube-Shorts-Generator — MIT, 5,583★, pushed 2026-10-24; Whisper+LLM highlight → 9:16.
54. api.github.com/repos/mutonby/openshorts — MIT, 7,050★, pushed 2026-10-24; fork of kamilstanuch/Autocrop-vertical; MCP+API, face tracking, Docker.
55. api.github.com/repos/gyoridavid/short-video-maker — MIT, 1,428★, pushed 2025-06-21 (stale); Remotion+MCP.
56. api.github.com/repos/artbyjazi/autoclip — MIT, 200★, pushed 2026-08-01; Whisper+Ollama local-first; mediapipe.
57. api.github.com/repos/RafaelGodoyEbert/ViralCutter — GPL-3.0, 433★, pushed 2026-09-10.
58. api.github.com/repos/Breakthrough/PySceneDetect — BSD-3-Clause, 5,286★, pushed 2026-10-22.
59. api.github.com/repos/google-ai-edge/mediapipe — Apache-2.0, 37,390★, pushed 2026-10-24.
60. api.github.com/repos/opencv/opencv_zoo — Apache-2.0, 1,101★, pushed 2026-10-20 (YuNet home).
61. github.com/topics/ {youtube-automation, faceless, text-to-video, shorts, tts, ai-video, thumbnail-generation, video-templates} — discovery sweep (top repos, star counts, recency).
62. api.github.com/repos/ {jub0t/Concat, calesthio/OpenMontage, darkzOGx/youtube-automation-agent, Anil-matcha/Open-Generative-AI, hypit-ai/hypit} — licenses and activity for discovery finds (Concat AGPL-3.0 11,269★; OpenMontage AGPL-3.0 71,486★; youtube-automation-agent MIT 4,578★; Open-Generative-AI MIT 31,403★; hypit NOASSERTION 25,330★).
63. api.github.com/repos/krishpathak/clip-gen — HTTP 404 (does not exist).

**Uncertainties carried forward:** Piper ur_PK quality (needs listening test); Chatterbox per-model weights licenses (gated); FLUX/SDXL/Qwen VRAM figures are community practice, not card-documented (UNVERIFIED); Rive free-tier limits (JS pricing page); Whisper Urdu WER (no published number found today); VoiceStudio reality check; SaaS-vs-outputs license interpretation for NC weights (policy, not law).
