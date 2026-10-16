# Own-Music Generation Research — Background Music for Faceless YouTube Channels

**Date:** 2026-10-11
**Goal:** Background music that is 100% owned by the creator — no Content ID claims possible, no attribution, safe when videos go viral. Instrumental, mood-matched (calm/cinematic/driving/luxury), 30s–3min (up to 10min possible), loopable, 128kbps+ stereo. Strategy: build a library ONCE (30–60 tracks), store, reuse.
**Constraint:** GitHub Actions CPU-only runners for CI; weak Intel laptop with 8GB RAM locally (no GPU). Heavy models must run on HuggingFace Spaces / free Colab / cheap rented GPU.

---

## 1. OPEN-SOURCE AI MUSIC GENERATION MODELS — LICENSE DEEP-DIVE

### 1.1 VERDICT TABLE (the make-or-break column is "Commercial OK")

| Model | Code license | Weights license | Commercial OK (monetized YouTube = ad revenue)? | Hardware | 60s gen time (60s clip) | Quality /10 |
|---|---|---|---|---|---|---|
| **MusicGen small (300M)** | MIT (AudioCraft) | **CC-BY-NC 4.0** | **NO** — non-commercial weights | CPU needs ~16GB RAM; any GPU | GPU: ~1–2 min. CPU: ~30–90 min (autoregressive, no official figure) | 5.5/10 |
| **MusicGen medium (1.5B)** | MIT | **CC-BY-NC 4.0** | **NO** | GPU strongly advised | GPU: ~1–3 min. CPU: hours | 6.5/10 |
| **MusicGen large (3.3B) / melody** | MIT | **CC-BY-NC 4.0** | **NO** | GPU required | GPU: ~2–4 min | 7/10 |
| **Stable Audio Open 1.0** | MIT (stable-audio-tools) | **Stability AI Community License** | **YES** if annual revenue < $1M; Enterprise needed above | ~1.2B params; GPU ~6–8GB VRAM, CPU fallback possible (float32) | GPU: ~10–20s (est.). CPU: several minutes (est.) | 7/10 (short loops/ambience only) |
| **Stable Audio Open Small** | MIT | Stability AI Community License | **YES** under $1M revenue | Designed for on-device **Arm CPU**, faster than realtime on Arm phones | ~5–10s | 5/10 (max 11s) |
| **ACE-Step v1 (3.5B)** | **Apache 2.0** | **Apache 2.0** (code AND weights) | **YES — clean, no attribution required** | 8GB VRAM min w/ `--cpu_offload`; A100/4090/3090 measured; Apple Silicon works | **~2s on A100, ~1.7s on RTX 4090, ~4.7s on RTX 3090, ~26s on MacBook M2 Max (per 1 min audio — measured, official)** | 8/10 (best open full-song model of 2025) |
| **YuE 1.x (7B)** | Apache 2.0 | **Apache 2.0** (HF model card: "The YuE model (including its weights) is now released under the Apache License, Version 2.0") but repo historically asked credit "YuE by HKUST/M-A-P" | **YES** (weights) — attribution courtesy request exists | NVIDIA 24GB VRAM for full quality; 8GB via quantized community UIs | Tens of minutes per song on 24GB GPU | 6.5/10 instrumental, 7.5/10 with vocals |
| **YuE 2** | Apache 2.0 | **CC BY-NC 4.0 "with additional creator permission"** | Personal users: free to use AND monetize outputs. Commercial use **by companies** needs license. | Linux + NVIDIA GPU w/ BF16, 24GB VRAM | Not published (agent pipeline: LLM plans score, then renders) | 7.5/10 |
| **DiffRhythm (base/full)** | **Apache 2.0** (code + DiT weights) | Apache 2.0 per README — **gray area: VAE is a fine-tune of Stable Audio Open VAE (Community License)** | **Likely yes, but the VAE component is legally murky** | 8GB VRAM min with `--chunked`; base = 1m35s, full = 4m45s songs | "Blazingly fast" — full song in seconds on GPU | 6.5/10 |
| **Jukebox (OpenAI, 2020)** | OpenAI Noncommercial Use License | Same | **NO** | Obsolete/huge | Hours per song | 4/10 — abandoned |
| **Magenta models (MusicVAE, MelodyRNN, PerformanceRNN)** | **Apache 2.0** | Apache 2.0 checkpoints | **YES** | CPU, seconds per sample | ~1–5s | 4/10 as rendered audio (excellent as MIDI for procedural pipeline) |
| **Riffusion** | 2022 original: open (spectrogram+SD trick), abandoned | Newer FUZZ / Producer.ai (2025): **closed, proprietary** | N/A — not usable | N/A | N/A | N/A |

### 1.2 Per-model details with primary sources

**Meta MusicGen / AudioCraft** — Code MIT, **weights CC-BY-NC 4.0**. The official HF model card states verbatim: "License: Code is released under MIT, model weights are released under CC-BY-NC 4.0."
- Source: https://huggingface.co/facebook/musicgen-medium (same for small/large/melody)
- Sizes: 300M / 1.5B / 3.3B parameters (same card). Monetized YouTube (ad revenue) = commercial use → **MusicGen weights are off-limits** for the user's channel.
- Compute: musicgen-small card notes ~16GB RAM for CPU inference, memory grows with clip length; architecture generates "only 50 auto-regressive steps per second of audio" (so a 60s clip = ~3,000 AR steps). https://huggingface.co/facebook/musicgen-small
- A community benchmark even measured ~3x real-time on an A100 with default settings: https://github.com/rsxdalv/musicgen-prompts/issues/3
- **Fine-tunes do not help**: fine-tuning MusicGen produces derivative weights that inherit CC-BY-NC (fine-tuning code exists, e.g. https://github.com/ylacombe/musicgen-dreamboothing, but the license travels with the weights). No notable commercial-friendly MusicGen fine-tune exists on HF.

**Stable Audio Open 1.0 (Stability AI)** — Weights under the **Stability AI Community License**. Model card: "License: [Stability AI Community License]. Commercial License: to use this model commercially, please refer to https://stability.ai/license."
- https://huggingface.co/stabilityai/stable-audio-open-1.0
- The Community License page (primary): **"You only need a paid Enterprise license if your yearly revenues exceed USD$1M and you use Stability AI models in commercial products or services"** — a solo YouTuber is far below this, so commercial use including monetized videos is **free**. You own the outputs (subject to their Acceptable Use Policy); no attribution required for outputs. Fine-tunes/LoRAs allowed; only *competing foundational models* are forbidden.
- Source: https://stability.ai/license
- Limits: variable-length **stereo 44.1kHz up to 47s** per generation — perfect for loopable background beds, NOT for 3–10min tracks (loop them in the player instead). ~1.2B params, diffusers example falls back to CPU. https://huggingface.co/stabilityai/stable-audio-open-1.0
- **Stable Audio Open Small** (Stability + Arm): same Community License, max **11 seconds**, optimized to run faster than realtime on Arm CPUs (i.e., genuinely CPU-viable). Sources: https://huggingface.co/stabilityai/stable-audio-open-small and https://stability.ai/news-updates/stability-ai-and-arm-release-stable-audio-open-small-enabling-real-world-deployment-for-on-device-audio-control
- CPU pitfall: load in float32 on CPU (float16 conv1d decoder is pathologically slow): https://huggingface.co/stabilityai/stable-audio-open-small/discussions (community "Problems running on CPU" thread, May 2025)

**ACE-Step v1 (ACE Studio + StepFun, May 2025)** — **The winner for this use case.** GitHub README: "This project is licensed under Apache License 2.0." HF model card tagged `apache-2.0`, "License: Apache 2.0" (weights included).
- Code: https://github.com/ace-step/ACE-Step | Weights: https://huggingface.co/ACE-Step/ACE-Step-v1-3.5B (3.5B params)
- **Everything permissive: commercial use, modification, distribution — no attribution obligation, no revenue cap, outputs fully yours.**
- Hardware (official README): min **8GB VRAM** via `--cpu_offload true --overlapped_decode true`; supported inference speeds **per 1 minute of audio**: RTX 4090 ~1.74s, A100 ~2.20s, RTX 3090 ~4.70s, MacBook M2 Max (CPU/Apple Silicon path) ~26.43s. "Synthesizes up to 4 minutes of music in just 20 seconds on an A100."
- Instrumental-only: **yes** — README explicitly supports "various instrumental music generation across different genres and styles" plus a Text2Samples LoRA for instrumental loops/samples. Max duration 4 minutes per generation. (A newer ACE-Step 1.5 exists at https://github.com/ace-step/ACE-Step-1 but wants ≥12GB VRAM.)

**YuE (HKUST / M-A-P)** — Two generations, different licenses:
- **YuE 1.x weights are Apache 2.0**: HF card for `m-a-p/YuE-s1-7B-anneal-en-cot` states "The YuE model (including its weights) is now released under the Apache License, Version 2.0." https://huggingface.co/m-a-p/YuE-s1-7B-anneal-en-cot (the repo historically also asked for credit "YuE by HKUST/M-A-P" — Apache 2.0 permits courtesy attribution requests, and the user wants zero attribution)
- **YuE 2** (current repo README): "Code, agent skill, and documentation: Apache 2.0. **Model weights: CC BY-NC 4.0 with additional creator permission.**" — personal users are "Free to use YuE2 and monetize generated outputs," but company commercial use requires a license. Hardware: "Linux · Python 3.12 · NVIDIA GPU with BF16 support and 24 GB VRAM." Instrumental-only generation is supported (Sep 2025 agent-skill update; example prompt "gentle piano instrumental music for reading, with no vocals"). https://github.com/multimodal-art-projection/YuE
- Verdict: works for a solo creator on paper, but 24GB VRAM requirement + attribution request + YuE2's NC weights make it strictly worse than ACE-Step here.

**DiffRhythm (ASLP-lab, NWPU)** — README: "DiffRhythm (code and DiT weights) is released under the Apache License 2.0." base model min 8GB VRAM with `--chunked`; base generates up to 1m35s, `-full` models up to 4m45s; **Instrumental Mode** added March 2025; runs on Linux/Windows/macOS. https://github.com/ASLP-lab/DiffRhythm
- **Gray area**: community discussions (Hugging Face issues; deeplearning.ai forum) flagged that DiffRhythm's VAE is a fine-tune of **Stable Audio Open's VAE**, which carries the Stability Community License — the README's Apache grant only covers "code and DiT weights," not the VAE. Usable for a <$1M-revenue creator either way, but ACE-Step is cleaner.

**Riffusion** — Original 2022 spectrogram-diffusion hack was open and hobbyist-grade; abandoned. The company pivoted to a closed product: FUZZ (2025) and Producer.ai / FUZZ-2.0 (July 2025) — **no open weights, no usable license for self-hosting**. Source: https://aibrews.substack.com/p/mistral-small-3-open-music-foundation and riffusion.com/producer.ai.

**Jukebox (OpenAI, April 2020)** — Code + weights released, but under **OpenAI's Noncommercial Use License**; project abandoned (frozen since 2020, enormous compute needs: hours per song). https://github.com/openai/jukebox — dead end, both legally and technically.

**Magenta (Google)** — **Apache-2.0**, includes MusicVAE, MelodyRNN, PerformanceRNN, Piano Genie checkpoints. Small LSTM/VAE models run on **CPU in seconds** and output MIDI (render via a soundfont). **Repository archived Jan 6, 2026 (read-only)** — "This repository is currently inactive (archived, read only)... The team has transitioned to using individual repositories for new projects." Still fully usable; license unchanged. https://github.com/magenta/magenta

**MAGNeT** (Meta's other audio model) — same AudioCraft repo / LICENSE_weights situation → CC-BY-NC. Same conclusion as MusicGen.

### 1.3 Legal bottom line for Section 1
- **Fully clean for monetized YouTube (no attribution, no revenue cap): ACE-Step v1** (Apache 2.0 code + weights) and **Magenta procedural models** (Apache 2.0). Stable Audio Open 1.0/Small are commercial-OK under the Community License while revenue < $1M (fine for a solo channel), with a 47s/11s duration ceiling.
- **MusicGen in any size is legally unusable** for this channel (CC-BY-NC 4.0; monetized views = commercial).
- NonCommercial (CC-BY-NC) is not ambiguous here: a monetized channel generating ad revenue is commercial use.

---

## 2. PROCEDURAL / ALGORITHMIC MUSIC — THE ZERO-LICENSE-RISK PATH

### 2.1 Composition engines
- **Magenta (Apache-2.0)** — MusicVAE / MelodyRNN generate melodies/midis on CPU in seconds; usable headlessly in Python for batch loop generation. Quality as *rendered audio* is modest; the value is procedural MIDI + your own rendering. Repo (archived but usable): https://github.com/magenta/magenta
- **music21 (BSD 3-clause)** — MIT-grade permissive toolkit from MIT/NEH-funded research: "Music21 is Open-Source Software released under the BSD (3-clause) license." Perfect for rule-based chord-progressions, ambient arpeggios, etc. https://github.com/cuthbertLab/music21
- **Abundant-Music (Per Nyblom / WaveBots)** — browser-based procedural song structure generator (chord progressions, melodies, drums per genre), exports MIDI/MP3. GitHub repos are open source (check the LICENSE file of the fork you use; the generator's output MIDI is yours to use). https://pernyblom.github.io/abundant-music/
- **Strudel (AGPL-3.0), TidalCycles (GPL-3.0), Sonic Pi (GPL-3.0)** — live-coding environments. **Key legal point:** copyleft of these tools applies to the *tool's code*, not to the music you compose with them (the FSF's position on output of GPL programs) — your rendered tracks are yours. Fine for one-time batch work; avoid embedding their code in your repo unless you accept AGPL obligations. Sources: https://github.com/tidalcycles/strudel (AGPL-3.0), https://github.com/tidalcycles/Tidal (GPL-3.0), https://github.com/sonic-pi-net/sonic-pi (GPL-3.0)

### 2.2 Soundfonts (the "instrument" layer)
| Soundfont | License | Commercial use for YOUR music | Attribution needed |
|---|---|---|---|
| **FluidR3_GM** | **MIT** | Yes, unrestricted | No |
| **GeneralUser GS** (S. Christian Collins) | Own permissive license: "You may use GeneralUser GS without restriction for your own music creation, private or commercial." | Yes | No (redistribution of the bank itself is the only restricted act) |
| **Salamander Grand Piano v3** | CC-BY 3.0 (author noted relicensing to public domain in 2022, but distributions still carry CC-BY) | Yes | **Yes** (credit line) — avoid if you want zero attribution; some derivative packs are CC-BY-NC, check per pack |
| **Spitfire LABS** | Free but proprietary EULA | Yes — allowed when sounds are used "as part of a musical performance, live or recorded" (covers monetized YouTube); raw samples may not be redistributed standalone | No, but DAW/VST-only (not a headless render path) |

Sources: FluidR3 MIT per distribution packaging (openSUSE package spec; abcjs-soundfonts GitHub distribution) — original Fluid R3 release is MIT. GeneralUser GS: https://www.schristiancollins.com/generaluser and license text mirrored at https://scancode-licensedb.aboutcode.org/generaluser-gs-2.0.LICENSE. Salamander: repo README states "This work is licensed under a Creative Commons Attribution 3.0 Unported License." Spitfire EULA: https://www.spitfireaudio.com/en-us/pages (LABS instruments governed by Spitfire EULA).

### 2.3 Realistic quality verdict
- Procedural piano/pads/strings rendered from FluidR3_GM or GeneralUser GS sound like clean "library background music" — the exact tier of music used under countless documentary/finance voiceovers. At -18 to -22dB under a voiceover with reverb + low-pass + sidechain-style ducking, 95% of viewers never notice it isn't licensed library music.
- Where it fails: virtuosic performance, realistic ensemble swells, organic drum realism, anything foregrounded. For 30s–3min loopable ambient beds (the user's niche), it passes.
- Precedent of claims: **no known Content ID claims on procedurally generated music rendered from permissive soundfonts** — the failure mode is not "the algorithm claims you," it's "you accidentally reproduce a famous chord/melody" (trivially avoidable) or the soundfont itself being registered (never the case for FluidR3/GeneralUser).
- Legal chain: MIT/BSD algorithm + procedurally generated composition + MIT soundfont = **output fully owned, zero attribution**. One nuance: purely machine-generated works may not even be copyrightable in the US (human-authorship doctrine), which cuts *both* ways — you may not be able to stop others from copying your loops, but equally nobody can claim yours, and nobody has standing to Content ID it. For background music this asymmetry is harmless.

---

## 3. FREE GENERATION SERVICES (no install)

**HuggingFace Spaces + gradio_client** — Yes, Spaces expose a programmatic API:
```python
from gradio_client import Client
client = Client("stabilityai/stable-audio-open", hf_token="hf_...")  # pass token!
result = client.predict(...)
```
- Guide: https://www.gradio.app/guides/getting-started-with-the-python-client
- **Quotas**: ZeroGPU Spaces meter GPU-seconds per caller — anonymous < logged-in free < PRO. Exceeding returns "GPU quota exceeded" (time-based reset). Always pass `hf_token=` so you get logged-in quota. Long batch jobs (40–60 generations) are fragile: expect quota walls and retries. Workarounds: `Client.duplicate()` onto paid hardware, or HF PRO (~$9/mo) for bigger ZeroGPU quota.
- **Output terms**: HF does not claim rights over Space outputs; **the applicable license is the underlying model's license**. So: Stable Audio Open Space outputs → Community License → commercial OK <$1M. MusicGen Space outputs → **CC-BY-NC → NOT allowed on a monetized channel**. ACE-Step Space outputs → Apache 2.0 → fully free. Pick spaces by model license, not by "free."
- For a one-time 40–60 track batch, Spaces are the least reliable free option. Better free options: **Google Colab free T4 (16GB)** or **Kaggle notebooks (free P100/T4×2, ~30 GPU-hrs/week)** running the ACE-Step notebook — one afternoon, $0, Apache 2.0 outputs.
- **Pollinations**: image/text generation only — **no audio/music API** as of this research.

---

## 4. PAID AI MUSIC (comparison only)

| Service | Price | What you actually get | Full exclusive ownership? |
|---|---|---|---|
| **Suno** (current models v6/v6-wild) | Free $0 (no downloads, **no commercial rights**); Pro **$8/mo** (2,500 credits, 20 downloads/mo, commercial rights); Premier $24/mo | Paid ToS: "Suno hereby assigns to you all of its right, title and interest in and to any Output" — but "no representation or warranty... that any copyright will vest," rights only via **approved-channel downloads**, must not strip watermarks/metadata; free-tier outputs stay non-commercial forever (no retroactive license) | **No exclusivity**: another user prompting similarly can get a near-identical song; not exclusive |
| **Udio** | ~$10/mo standard tier | Post-settlement licensed platform (see below); paid-tier ownership of downloads, terms being reworked under UMG deal | No |
| **Mubert** | Creator ~$14/mo, Pro ~$39/mo | **Subscription license only — ownership stays with Mubert**; rights end if you cancel | No |
| **Soundraw** | Creator ~$16.99/mo; Artist plans ~$19–40/mo | License for background music in videos (monetization OK); **ownership stays with SOUNDRAW**; Artist plans add distribution rights | No |
| **AIVA** | Free; Standard **€11/mo** (annual) — monetization but must credit "Music by AIVA"; **Pro ~€49/mo — "own the full copyright of your compositions, forever"** (incl. pre-subscription works per AIVA helpdesk) | Closest to true ownership among SaaS | **Yes on Pro** — full copyright of *your* compositions (still no exclusivity vs. similar generations by others) |
| **Beatoven.ai** | Creator ~$6/mo, Visionary ~$20/mo | Royalty-free license for monetized content; **not ownership**; claims fully-licensed training (Musical AI partnership, Dec 2024) | No |

Sources: Suno pricing https://suno.com/pricing ; Suno ToS https://suno.com/terms-of-use (ownership assignment / approved downloads / watermark clauses quoted above) ; AIVA https://www.aiva.ai ; Mubert license page https://mubert.com ; Soundraw https://soundraw.io (plan summaries per Aug 2026 review) ; Beatoven https://beatoven.ai + Musicweek Dec 6 2024 (Musical AI partnership).

**Litigation status (2026):**
- RIAA major labels sued Suno and Udio June 2024 (statutory damages up to $150k/work).
- **Warner Music settled with Suno Nov 25, 2025** and signed a licensing deal (Suno's only major-label deal as of mid-2026). **UMG settled + licensed Udio Oct 29, 2025** (staged rollout through 2026; Warner and Merlin and Kobalt also licensed Udio). **UMG and Sony suits vs. Suno still unresolved as of mid-2026.** **Suno lost a copyright lawsuit to GEMA (German collecting society) — Aug 2026** (adverse ruling).
- Practical risk for the user: even with paid Suno, (a) rights are contract-based and revocable/reworkable as lawsuits settle (Udio is already changing terms under the UMG deal), (b) outputs are watermarked/fingerprinted by the vendor, (c) no exclusivity vs. other users' generations. Sources: https://www.universalmusic.com (UMG-Udio announcement, Oct 29 2025); Forbes Aug 5 2026 (GEMA loss; Warner-Suno settlement Nov 2025); https://news.bloomberglaw.com/ip-law (Oct 3 2025, Suno opposes added piracy claim).

---

## 5. CONTENT ID RISK ANALYSIS FOR AI MUSIC

**Yes, AI-generated music gets Content ID claims. Documented vectors:**
1. **Collision via distribution**: AI generators can emit near-identical output for similar prompts; when other users distribute their generations via DistroKid etc., those tracks enter Content ID and can claim *your* video. Common reports in r/SunoAI, r/DistroKid, r/PartneredYoutube. **UMG sued DistroKid (Sept 2026)** over "bad actors" mass-uploading AI tracks — the collision problem is being litigated, not solved.
2. **Sound-alike claims**: outputs resembling existing catalog songs get claimed by rights holders (auto fingerprint matching + manual claims on famous melodies).
3. **Vendor fingerprinting**: Suno embeds watermarks/metadata; stripping them violates their ToS, and their outputs are permanently tethered to their legal situation (unresolved UMG/Sony suits, GEMA loss).
4. **Not a risk**: music generated *locally by you* (open weights), **never uploaded to any DSP/Content ID registry by anyone**. Nobody can hold a fingerprint of audio that was never published as a release. This is why the "own library" strategy is structurally immune, not just "low risk."

**What makes AI music SAFE from claims** (in order of importance):
1. Generated locally/self-hosted from open weights (no vendor registry, no watermark).
2. Never distributed to Spotify/Apple/Content ID by you or anyone else.
3. Not a derivative of MusicGen-style NC weights (legal hygiene).
4. Light post-processing (tempo/key tweak, fades, layering) moves you further from any hypothetical sound-alike.

**YouTube synthetic-content disclosure (the "AI label")** — official rule: https://support.google.com/youtube/answer/14328491
- Disclosure **is required** for: realistic AI speech ("makes a real person appear to say or do something they didn't"), altered footage of real events/places, realistic scenes that didn't occur, and — relevant here — **"AI generated music" when it "is the main focus of the video."**
- Disclosure **is NOT required** for: aesthetic edits, unrealistic/fantastical content, production assistance, and background music in a video whose focus is something else. A faceless finance/stoicism documentary with background music is **not required to carry the AI-music disclosure** — music is never "the main focus." (Voiceover TTS of *your own* cloned voice is also exempt.)
- Penalties apply for undisclosed realistic synthetic media, not for background music.

---

## 6. RECOMMENDATION FIT — CONCRETE PIPELINES

### Pipeline A (RECOMMENDED): One-time batch library via ACE-Step on free cloud GPU
1. **Generation (one afternoon, $0):** Open Google Colab free T4 (16GB — exceeds ACE-Step's 8GB VRAM minimum with offload; Kaggle P100 as backup). Run ACE-Step with `--cpu_offload true`, instrumental mode. Write 40–60 prompts mapped to moods: `calm piano ambient, slow, no drums` / `cinematic strings documentary bed, warm` / `driving minimal beat, confident` / `luxury lo-fi, jazzy, smooth`. Durations 60–180s each (ACE-Step max 4 min; for "10 min" tracks, loop two 3–4 min takes). ~2s of GPU time per minute of audio → 60 tracks ≈ under 30 GPU-minutes even with retries.
2. **Post-process on the 8GB laptop (no GPU needed):** ffmpeg only — trim silence, add 2–5s fade in/out for clean looping, loudness-normalize to ~-14 LUFS, export MP3 192kbps stereo (well above the 128kbps floor).
3. **Storage:** push MP3s to a GitHub repo (or GitHub Releases — 2GB/file limit is irrelevant) alongside a `library.json` manifest with mood tags, BPM, duration. The existing automation music engine reads the manifest and picks mood-matched tracks — **no per-video generation, ever**.
4. **License result:** Apache 2.0 — zero attribution, zero revenue cap, nobody can claim, videos can go viral safely. Add a line in the repo noting "music generated with ACE-Step (Apache 2.0)" for your own records.
- **Cost:** $0 (Colab free) – ~$5 (one-time rented GPU on vast.ai/runpod if Colab is flaky). **Time:** one afternoon + re-batch quarterly if wanted. **Quality:** 7–8/10 for background use. **Risk:** essentially zero.

### Pipeline B: Per-video generation in CI (NOT recommended for neural models)
- GitHub Actions standard ubuntu runners = 2 vCPU / 7GB RAM. MusicGen-small wants ~16GB RAM for CPU inference and takes tens of minutes per 30s clip → times out/wastes the 6h job ceiling; and it's CC-BY-NC anyway. **Neural per-video in CI is dead on arrival.**
- **Viable variant:** procedural per-video generation in CI — music21 (BSD) or Magenta MelodyRNN (Apache) → MIDI → FluidSynth + FluidR3_GM/GeneralUser GS → MP3. Runs in seconds on CPU, $0, fully owned. **Quality:** 4–5/10 (MIDI-ish character), acceptable as ambient bed at low volume, weaker than Pipeline A.

### Pipeline C: Hybrid (best long-term)
- Core = Pipeline A library (40–60 ACE-Step tracks, mood-tagged).
- Filler generator = Pipeline B's procedural MIDI+soundfont script committed to the repo, so CI can mint extra unique loops on demand (e.g., 15s transition stingers) without any GPU.
- Keep Stable Audio Open (Community License, <$1M OK) in the toolbox for tighter 47s loops via HuggingFace Space or Colab when a specific texture is missing.
- Re-run the batch quarterly (~30 min) to expand the library; retire tracks on rotation to avoid channel-wide repetition.

### Fit with current stack
- Replaces third-party-fetched Kevin MacLeod MP3s entirely: same "fetch an MP3 file" interface, but from your own repo — no attribution block in descriptions, no CC-BY bookkeeping, no Content ID exposure.
- Fallback if ACE-Step quality disappoints on a given mood: DiffRhythm instrumental mode (Apache DiT, 8GB VRAM, `--chunked`) from the same Colab session — but prefer ACE-Step (clean Apache across the whole stack).

---

## SOURCES

1. MusicGen medium model card (MIT code / CC-BY-NC 4.0 weights, sizes, architecture): https://huggingface.co/facebook/musicgen-medium
2. MusicGen small model card (300M, ~16GB RAM CPU inference): https://huggingface.co/facebook/musicgen-small
3. MusicGen fine-tuning code (license stays with base weights): https://github.com/ylacombe/musicgen-dreamboothing
4. MusicGen speed datapoint (~3x realtime on A100 default settings): https://github.com/rsxdalv/musicgen-prompts/issues/3
5. Stability AI Community License ($1M revenue threshold, no attribution for outputs): https://stability.ai/license
6. Stable Audio Open 1.0 model card (Community License, 47s stereo 44.1kHz, ~1.2B): https://huggingface.co/stabilityai/stable-audio-open-1.0
7. Stable Audio Open Small (Community License, 11s, Arm CPU realtime): https://huggingface.co/stabilityai/stable-audio-open-small and https://stability.ai/news-updates/stability-ai-and-arm-release-stable-audio-open-small-enabling-real-world-deployment-for-on-device-audio-control
8. ACE-Step repo (Apache 2.0; 8GB VRAM min; measured inference speeds; instrumental; 4-min max): https://github.com/ace-step/ACE-Step
9. ACE-Step v1-3.5B weights card (apache-2.0 tag): https://huggingface.co/ACE-Step/ACE-Step-v1-3.5B
10. ACE-Step 1.5 (≥12GB VRAM): https://github.com/ace-step/ACE-Step-1
11. YuE repo — YuE 2 (code Apache 2.0; weights CC BY-NC 4.0 w/ permission; 24GB VRAM; instrumental mode): https://github.com/multimodal-art-projection/YuE
12. YuE 1.x weights card ("released under the Apache License, Version 2.0"): https://huggingface.co/m-a-p/YuE-s1-7B-anneal-en-cot
13. DiffRhythm repo (Apache 2.0 code + DiT weights; 8GB VRAM chunked; 1m35/4m45; Instrumental Mode): https://github.com/ASLP-lab/DiffRhythm (VAE/Stable Audio Open lineage flagged in community discussions: https://huggingface.co/ASLP-lab/DiffRhythm/discussions)
14. Jukebox (2020, noncommercial, abandoned): https://github.com/openai/jukebox
15. Magenta (Apache-2.0; archived Jan 6, 2026): https://github.com/magenta/magenta
16. music21 (BSD 3-clause): https://github.com/cuthbertLab/music21
17. Abundant-Music: https://pernyblom.github.io/abundant-music/
18. Strudel (AGPL-3.0): https://github.com/tidalcycles/strudel ; TidalCycles (GPL-3.0): https://github.com/tidalcycles/Tidal ; Sonic Pi (GPL-3.0): https://github.com/sonic-pi-net/sonic-pi
19. GeneralUser GS license ("without restriction for your own music creation, private or commercial"): https://www.schristiancollins.com/generaluser and https://scancode-licensedb.aboutcode.org/generaluser-gs-2.0.LICENSE
20. FluidR3_GM (MIT) per distribution packaging: openSUSE package spec and abcjs-soundfonts GitHub distribution (original Fluid R3 release MIT)
21. Salamander Grand Piano v3 (CC-BY 3.0): https://archive.org/details/SalamanderGrandPiano
22. Spitfire Audio LABS EULA (commercial use as part of a musical performance; no raw-sample redistribution): https://www.spitfireaudio.com/en-us/pages
23. Gradio Python client guide: https://www.gradio.app/guides/getting-started-with-the-python-client ; ZeroGPU quota behavior: https://discuss.huggingface.co (ZeroGPU quota threads; anonymous < logged-in < PRO)
24. Suno pricing (Free/Pro $8/Premier $24; downloads; commercial rights): https://suno.com/pricing
25. Suno Terms of Use (ownership assignment, approved downloads, watermark clause, free tier non-commercial): https://suno.com/terms-of-use
26. UMG–Udio settlement + licensing (Oct 29, 2025): https://www.universalmusic.com
27. Suno v. labels docket + piracy-claim opposition (Oct 3, 2025): https://news.bloomberglaw.com/ip-law ; Suno loses GEMA case + Warner settlement (Forbes, Aug 5, 2026): https://www.forbes.com/business/media/
28. UMG sues DistroKid over AI uploads (Sept 2026): https://ground.news
29. YouTube AI disclosure rules (music disclosure only when "main focus of the video"): https://support.google.com/youtube/answer/14328491
30. AIVA (Standard €11/mo w/ credit; Pro = full copyright forever): https://www.aiva.ai
31. Soundraw (license-only, ownership retained; Creator ~$16.99/mo): https://soundraw.io (plan summary per https://sonilo.com Aug 2026 review)
32. Mubert (subscription license; ownership retained): https://mubert.com
33. Beatoven.ai (Creator ~$6/mo; Musical AI licensed-training partnership, Dec 2024): https://beatoven.ai and https://www.musicweek.com
34. Riffusion / Producer.ai closed pivot: https://aibrews.substack.com/p/mistral-small-3-open-music-foundation

*License/pricing claims above are sourced from the primary pages listed; timing figures marked "est." are extrapolations from documented architecture/steps-per-second and community reports, not official benchmarks.*
