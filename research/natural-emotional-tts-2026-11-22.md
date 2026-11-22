# Natural emotional TTS for monetised narration (free Kaggle T4): research, 2026-11-22

Read-only research. Nothing was installed or run. Every number below carries its source and date; anything I could not verify is marked **UNVERIFIED**.

## Summary

- **Demo these 3 next on the T4:**
  1. **Ming-3.0-tts-0.5B** (`inclusionAI/Ming-3.0-tts-0.5b`, MIT, released Oct 2026). Among open-weight models you can use commercially, it has the highest blind-arena score: Artificial Analysis Elo 1179 ±12, against 1060 for Kokoro. It also has 14 inline non-verbal tags (`[Laughter]`, `[Sigh]`, `[Breathing]`…), an EMOTION task and zero-shot cloning.
  2. **Maya1** (`maya-research/maya1`, Apache-2.0). It has 20 inline tags (`<laugh>`, `<laugh_harder>`, `<sigh>`, `<chuckle>`, `<exhale>`, `<whisper>`…). The voice is *designed from a text description*, so there is no cloned reference at all, synthetic or otherwise. Arena Elo is 1047 ±12, statistically about level with Kokoro.
  3. **IndexTTS-2** (`IndexTeam/IndexTTS-2`, bilibili Model Use License). It gives the best-documented *sentence-level* emotion control that keeps the speaker's timbre: an 8-dim emotion vector, an emotion reference clip, or emotion taken from the text. Commercial use is royalty-free below 100M MAU / RMB 1bn revenue. It has no laugh tags.
- **Caveat on the three picks:** no source publishes a measured T4 benchmark for any of them. All three default to bf16, and the T4 (compute capability 7.5) lacks fast bf16, so plan on fp16, with fp32 as the fallback.
- **Biggest lever is not the model:** zero-shot cloning copies the reference clip's prosody. A Kokoro reference is flat and contains no real laughs or breaths. Unsloth's docs: *"Zero-shot cloning captures tone but misses pacing and expression, often sounding robotic and unnatural."* Recording the owner's own voice is legally the cleanest option. YouTube says cloning one's own voice for voice-overs needs no AI disclosure. It is probably also the single biggest quality gain.
- **Excluded for commercial use:** F5-TTS, Spark-TTS, MaskGCT/Vevo and XTTS-v2 (non-commercial weights), Higgs Audio v3, Breeze TTS 2, Voxtral and Fish S2 Pro.
- **Excluded because it won't fit a T4:** Higgs Audio v2 (24 GB recommended) and Fish Drama 3 (about 48 GB).

---

## 0. Plan (sub-questions)

1. Which current open models lead blind naturalness arenas (TTS Arena, Artificial Analysis), and which of them allow commercial use of the output?
2. How does each model control emotion, and which non-verbals does it support?
3. Does it fit a T4 (16 GB, sm_75, no fast bf16, no FlashAttention-2)? What VRAM and speed, and what install pins clash with Kaggle's Python 3.13 image?
4. Can it keep one voice consistent across a 10-minute script?
5. Does a synthetic (Kokoro) reference cap naturalness, and what legal and ethical human-voice options exist?

---

## 1. Leaderboards (sub-question 1)

**TTS Arena V2** (`TTS-AGI/TTS-Arena-V2`): the leaderboard is rendered client-side and returned no rows to my fetcher on 2026-11-22 ("0 of 0 models"). **Rankings from TTS Arena V2 are UNVERIFIED.** I used Artificial Analysis (AA) instead. AA ranks models by blind listener votes.

**AA Speech Arena, open-weights view** (fetched 2026-11-22; Elo anchored at Zonos-v0.1 = 1000) [1]:

| Rank | Model | Elo (±) | Released | Commercial use? (see §2) | T4-viable? |
|---|---|---|---|---|---|
| 1 | Fish Audio Drama 3 | 1277 (±16) | Oct 2026 | Restricted community licence (secondary sources) | No (~48 GB FP8, secondary) |
| 2–3 | BreezeBlue TTS 2 | 1228 (±12) | Aug 2026 | **No** (research/non-commercial) | Unclear |
| 4 | **Ming-3.0-tts (Ant Group)** | **1179 (±12)** | Oct 2026 | **Yes (MIT)** | Likely (2.96 GB checkpoint) |
| 5–7 | Gradium Phonon 31M (English) | 1108 (±13) | Oct 2026 | Yes (Apache-2.0) | Yes (CPU model) |
| 5–8 | Fish Audio S2 Pro | 1101 (±11) | Mar 2026 | **No** (research licence) | n/a |
| 5–8 | StepFun Step-Audio-EditX | 1100 (±11) | Feb 2026 | **UNVERIFIED** (no weight licence file) | Tight (12 GB, bf16) |
| 6–8 | Mistral Voxtral TTS | 1094 (±11) | Mar 2026 | **No** (CC BY-NC 4.0) | n/a |
| 9–10 | NVIDIA Magpie-Multilingual 357M | 1064 (±12) | Feb 2026 | Yes, but no zero-shot cloning and emotion gated to NIM [3] | Yes |
| 9–10 | Kokoro 82M v1.0 (current) | 1060 (±11) | Jan 2025 | Yes (Apache-2.0) | Yes |
| 11–12 | **Maya1** | **1047 (±12)** | Jun 2025* | Yes (Apache-2.0) | Likely in fp16 |
| 12–13 | Higgs Audio V3 | 1035 (±12) | Jun 2026 | **No** (non-commercial) | n/a |
| 14 | Chatterbox (original) | 1019 (±11) | May 2025 | Yes (MIT) | Yes |
| 15 | Zonos-v0.1 | 1000 (anchor) | Feb 2025 | Yes (Apache-2.0) | Yes (transformer variant) |
| 16–17 | VibeVoice 1.5B | 954 (±14) | Aug 2025 | Conflicting; withdrawn by Microsoft [3] | n/a |
| 18 | XTTS v2 | 914 (±15) | Nov 2023 | **No** (CPML) | Yes |
| 19 | StyleTTS 2 | 887 (±15) | Jun 2023 | Conditional (see §2) | Yes |

\*AA lists Maya1 as "Jun 2025". Pinggy says Nov 2025 [3]; the date discrepancy is unresolved.

**AA Controlled Voice board**, which compares cloned voices (fetched 2026-11-22) [2]: Ming-3.0-tts scores **1073**, statistically tied with Fish Drama 3 (1073) and ElevenLabs v3 (1078). Chatterbox scores 941 and XTTS v2 847.

**Not on either AA board:** Orpheus, Dia/Dia2, IndexTTS2, CosyVoice 3, Qwen3-TTS, VoxCPM2, Sesame CSM, F5, Spark, MaskGCT. Their naturalness has no third-party blind rank (**UNVERIFIED**).

What the arena scores do and don't tell us:
- Arena Elo measures **general naturalness on short prompts**, not how believable laughs and sighs are. No leaderboard I found rates non-verbals specifically.
- **Kokoro (1060) outscores original Chatterbox (1019) and is level with Maya1 (1047)** within the confidence intervals. So the owner's sense that Kokoro is "natural-ish" matches the crowd.
- **Ming-3.0-tts is the only commercially licensed, plausibly T4-sized model that clearly beats Kokoro** on the arena.
- Phonon 31M also beats Kokoro (1108), but it has **no documented emotion controls** [10].

---

## 2. Per-model findings (sub-questions 1–4)

### 2.1 Master comparison table

Legend: **Commercial** means commercial use of generated audio is permitted for a small YouTube operation. "T4 fit" is an estimate from published VRAM unless marked as measured. No T4 measurement exists for any model below.

| Model (HF id) | Weights licence | Commercial | How emotion works | Non-verbals | T4 fit (published VRAM / speed) | Voice consistency | Naturalness evidence |
|---|---|---|---|---|---|---|---|
| **Ming-3.0-tts-0.5B** `inclusionAI/Ming-3.0-tts-0.5b` | MIT [4][5] | **Yes** | EMOTION task (7 emotions, conditioned on an emotion prompt WAV); FREEFORM natural-language instruction; VOICE_DESIGN [5] | 14 inline tags: `[Breathing] [Cough] [Sigh] [Laughter] [Surprise-ah] [Surprise-oh] [Dissatisfaction-hnn] [Uhm] [Confirmation-en] [Question-ei/ah/en/oh/huh]` [5] | Likely. Checkpoint 2.96 GB (1.48B BF16 params per [7]). Tested only on H800/H20. VRAM and RTF **UNVERIFIED** [5][7] | Zero-shot clone (`use_spk_emb=True`), or designed voice | AA 1179 ±12 (provider), 1073 (controlled) [1][2] |
| **Maya1** `maya-research/maya1` | Apache-2.0 [8] | **Yes** | Natural-language voice description + inline emotion tags [8] | `<angry> <appalled> <chuckle> <cry> <curious> <disappointed> <excited> <exhale> <gasp> <giggle> <gulp> <laugh> <laugh_harder> <mischievous> <sarcastic> <scream> <sigh> <sing> <snort> <whisper>` [8] | Card recommends "16 GB or more", BF16 [8]. fp16 ≈ 8–9 GB per a third-party ComfyUI guide [9]. RTF **UNVERIFIED** | No cloning. Same description each chunk; card warns to "check voice continuity" [8] | AA 1047 ±12 [1] |
| **IndexTTS-2 / 2.5** `IndexTeam/IndexTTS-2`, `IndexTeam/IndexTTS-2.5` | bilibili Model Use License [11] | **Yes, conditional**: royalty-free unless >100M MAU or >RMB 1bn revenue; outputs may not be used to improve other AI models (§3.4c) [11] | Emotion reference audio (`emo_audio_prompt`, `emo_alpha`); 8-dim vector `[happy, angry, sad, afraid, disgusted, melancholic, surprised, calm]`; or `use_emo_text` [12] | None documented as tags | fp16 for v2, bf16 for v2.5 [12]. Third-party sources say ≥8 GB, and 12 GB can be tight [13]. **UNVERIFIED on T4** | Cloned speaker; timbre is separated from the emotion source | Not on AA. Vendor-reported WER only [12] |
| **Orpheus 3B** `canopylabs/orpheus-3b-0.1-ft` (= `orpheus-tts-0.1-finetune-prod`) | HF tag Apache-2.0 [14]. Built on Llama-3.2-3B; some Canopy repos are tagged `llama3.2` [15] | **Yes** (either licence allows commercial use; if Llama terms apply, attribution and the AUP apply) | Inline tags; 8 preset voices [16] | `<laugh> <chuckle> <sigh> <cough> <sniffle> <groan> <yawn> <gasp>` [16] | 3B params. vLLM on T4 needs `dtype=half` [17]. No published T4 RTF. Repo pins `vllm==0.7.3` after a buggy release [16] | **Fixed preset voices** (tara, leah, jess, leo, dan, mia, zac, zoe) are stable; cloning Colab is "needs fix" [16] | Not on AA |
| **Dia 1.6B** `nari-labs/Dia-1.6B-0626` | Apache-2.0 [18] | Yes | Inline parenthesised tags; dialogue model | `(laughs) (clears throat) (sighs) (gasps) (coughs) (singing) (mumbles) (groans) (sniffs) (inhales) (exhales) (chuckle)…`, with a warning that some tags "might result in unexpected output" [18] | 4.4 GB fp16; 2.2× realtime on RTX 4090 with compile [18] | **Random voice per run** unless you give an audio prompt or fix the seed [18]. Clips <5 s sound unnatural; >20 s get "unnaturally fast" [18] | Not on AA |
| **Dia2** `nari-labs/Dia2-1B`, `-2B` | Apache-2.0 [19] | Yes | Not documented | Not documented [19] | Needs "CUDA 12.8+ drivers"; bf16 default [19] | Voice varies; "Use with prefix or fine-tune" [19] | Not on AA |
| **Chatterbox (original)** `ResembleAI/chatterbox` | MIT [20][21] | Yes (Perth watermark embedded) | `exaggeration` + `cfg_weight`; for dramatic speech "lower cfg ~0.3, exaggeration ~0.7+" [21] | None (tags are Turbo/Nano only) [20] | NVIDIA lists Turbo at about 2.3 GB [22]. About 1× RT on an A10G (community) [22] | Cloned reference | AA 1019; controlled 941 [1][2]. **Repo retired Aug 2026** [20] |
| Chatterbox-Turbo (already tested) | MIT [20] | Yes | Tags | `[laugh] [chuckle] [sigh] [cough] [gasp]…` | Fits | Cloned | Owner verdict: unnatural. Vendors advise using tags "sparingly", since overuse sounds theatrical [23] |
| **Zonos v0.1** `Zyphra/Zonos-v0.1-transformer` | Apache-2.0 [24] | Yes | Emotion conditioning (happiness, fear, sadness, anger…), rate, pitch [24] | None | 6 GB+; about 2× RT on 4090. **Hybrid needs RTX 3000+, so it won't run on T4** [24] | Speaker embedding from reference | AA 1000 (anchor) [1] |
| **Higgs Audio v2** `bosonai/higgs-audio-v2-generation-3B-base` | Boson Higgs Audio 2 Community License (Llama-3-derived) [25] | Yes up to 100,000 **annual active users**; above that you need a licence [25] | Automatic prosody; EmergentTTS "Emotions" 75.7% win vs gpt-4o-mini-tts (self-reported) [26] | Not documented | "At least 24GB" [26], **so it does not fit a T4**. Repo archived [26] | Cloned | Not on AA (v3 is on AA at 1035, but v3 is non-commercial [27]) |
| **Sesame CSM-1B** `sesame/csm-1b` | Apache-2.0 [28] | Yes | None documented; context-driven | None | ~1B; fits (**UNVERIFIED**) | Random voice; "sounds best when provided with context" [28] | Not on AA |
| **CosyVoice 3** `FunAudioLLM/Fun-CosyVoice3-0.5B-2512` | Apache-2.0 [29][30] | Yes | `inference_instruct2` natural-language instruction (emotion, speed, volume) [30] | `[breath]` confirmed; `[laughter]` not confirmed on the card [30] | 0.5B; VRAM **UNVERIFIED**. Python 3.10 env [29] | Cloned reference | Not on AA |
| **Qwen3-TTS** `Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice` / `-VoiceDesign` / `-Base` | Apache-2.0 [31] | Yes | Natural-language `instruct` (emotion, prosody) [31] | Not mentioned [31] | 1.7B; example uses FlashAttention-2, which **does not run on T4** (Turing), so it needs SDPA. VRAM **UNVERIFIED** | Preset speakers (Ryan, Aiden for English) or 3-s clone [31] | Not on AA |
| **VoxCPM2** `openbmb/VoxCPM2` | Apache-2.0 [32] | Yes | Parenthesised style prefix, e.g. `(slightly faster, cheerful tone)`; voice design [32] | Not mentioned [32] | ~8 GB bf16; RTF ≈0.30 on 4090 [32]. Python ≥3.10, torch ≥2.5 [32] | Clone ("ultimate cloning" with transcript) | Not on AA |
| **Step-Audio-EditX** `stepfun-ai/Step-Audio-EditX` | Code Apache-2.0. **No weight licence file on HF** [33][34] | **UNVERIFIED** (third parties disagree [3][35]) | Iterative emotion/style editing (14 emotions, many styles) [33] | `[sigh] [inhale] [laugh] [chuckle] [exhale] [breath] [cough] [uhm]…` [33] | ~12 GB (16 GB recommended), bf16, tested on L40S; Python ≥3.12, torch ≥2.9.1; clips <30 s [33] | Clone, then edit | AA 1100 [1] |
| F5-TTS | Code MIT; **weights CC-BY-NC** [36] | **No** | Reference style | None | Fits | Cloned | n/a |
| Spark-TTS `SparkAudio/Spark-TTS-0.5B` | **CC-BY-NC-SA-4.0** (changed from Apache) [37] | **No** | Gender, pitch, rate only [38] | None | Fits | Cloned | n/a |
| MaskGCT / Vevo `amphion/MaskGCT`, `amphion/Vevo` | **CC-BY-NC-4.0** [39][40] | **No** | Reference style | None | Fits | Cloned | n/a |
| StyleTTS 2 | Code MIT. Pretrained models: must "inform the listeners that the speech samples are synthesized… unless you have the permission to use the voice" [41] | Conditional | Reference style | None | Fits | Cloned | AA 887 [1] |
| XTTS-v2 `coqui/XTTS-v2` | Coqui Public Model License [42]: non-commercial use only, and revenue-generating use is excluded [43] | **No** (Coqui shut down Jan 2024, so a commercial licence can't be bought [3]) | Reference style | None | Fits | Cloned | AA 914 [1] |
| Phonon 31M `gradium/phonon-31m-en` | Apache-2.0 [10] | Yes | None documented | None | CPU model | 37 voices + clone from a "consented recording" [10] | AA 1108 [1]. Possible upgrade over Kokoro for neutral lines; no emotion controls |

### 2.2 Notes on the shortlist

**Ming-3.0-tts-0.5B (pick #1)**
- **Why #1:**
  - It is the only commercially licensed (MIT) open model with a *clear* blind-arena lead over Kokoro: 1179 ±12 vs 1060 ±11 [1].
  - On cloned voices it is statistically tied with ElevenLabs v3 (1073 vs 1078) [2].
  - It combines a cloned speaker, an EMOTION task and 14 inline non-verbal tags [5].
  - A practitioner reports it can "make it laugh, sigh…". That is anecdotal, not measured [7].
- **Risks:**
  - It is one month old.
  - It was validated only on H800/H20 datacenter GPUs [5]. No consumer-GPU VRAM or RTF figures are published [7].
  - Its environment is pinned to torch 2.6 / CUDA 12.4 / `transformers==4.46.3` [5]. Third parties set it up in a Python 3.10 environment [6].
  - Its text normaliser needs `pynini==2.1.6`, which is hard on Python 3.13; `--no_text_normalization` skips it [5]. Without it, you must spell out numbers and dates yourself.
  - EMOTION values are Chinese strings (高兴 happy, 悲伤 sad, 愤怒 angry, 恐惧 fear, 厌恶 disgust, 惊讶 surprise, 中性 neutral) [5].
  - EMOTION and the paralinguistic tags are separate task modes. They "can't be freely combined" [7].
  - Its published Elo is cross-language, with no English-only score [7].

**Maya1 (pick #2)**
- **Why #2:**
  - It has the richest English non-verbal tag set of any commercially licensed model that could fit a T4 [8].
  - Because the voice is *designed from text*, the Kokoro-reference problem disappears entirely. There is also no question of whose voice it is.
  - It shares the Orpheus/SNAC token layout, so the demo code also serves an Orpheus test.
- **Risks:**
  - Its arena Elo (1047) is not above Kokoro (1060) on neutral sentences [1].
  - The card recommends BF16-capable GPUs and 16 GB+ [8]. fp16 on a T4 is **UNVERIFIED** for numerical stability.
  - Voice drift across chunks is a known issue; the card itself tells you to check continuity [8].

**IndexTTS-2 (pick #3)**
- **Why #3:**
  - Most of a 10-minute documentary is sentence-level warmth, gravity and excitement, not laughs.
  - IndexTTS2 is designed to separate emotion from speaker identity. Its paper reports it outperforms other zero-shot TTS models on emotional fidelity (self-reported) [44].
  - It exposes an explicit per-sentence emotion vector [12], which suits a script pipeline where an LLM labels each sentence.
- **Risks:**
  - It uses a custom licence, not OSI. Commercial use is fine below the thresholds, but outputs count as "Derivative Works" and may not be used to train other models [11].
  - It has no non-verbal tags.
  - uv is "required" for a reliable install [12]. It suggests CUDA Toolkit 12.8+ [12].
  - T4 VRAM is unpublished [13].
  - Use **IndexTTS-2 (fp16), not 2.5 (bf16)**, on a T4 [12].

**Orpheus (runner-up; the long-term path)**
- Its preset voices are fixed, which gives the best out-of-the-box consistency of any tag model [16].
- **The strategic option:** Unsloth ships a free T4 Colab notebook to LoRA-fine-tune Orpheus. *"On a Colab T4 GPU, a few epochs on 3h of data may take 1-2 hours"*, and the training transcripts can include `<laugh>`/`<sigh>` tags [45].
- If the owner records about 3 h of their own narration, including **real** laughs and sighs tagged in the transcript, Orpheus would learn *their* real non-verbals. That is the most plausible route to laughs that don't sound fake.
- It was not picked for the first demo round because it has no arena score and zero-shot cloning is flagged as broken in the repo [16].

**Not shortlisted, despite good features**
- **Step-Audio-EditX:** AA 1100 and a strong tag set, but the weight licence is unresolved [33][34] and it is tight for a T4. Revisit if StepFun confirms the licence.
- **VoxCPM2:** Apache, 8 GB, style prompts [32], but it has no non-verbals and no arena score.
- **CosyVoice 3:** Apache, instruct mode [30], but `[laughter]` support is unconfirmed and it pins Python 3.10.
- **Chatterbox original:** it is already installed, so it's cheap to try `exaggeration=0.7, cfg_weight=0.3` [21]. But it ranks below Kokoro [1] and is retired [20].

---

## 3. Synthetic reference vs a real human voice (sub-question 5)

**Does cloning from a Kokoro clip limit naturalness?** Very likely yes, though no controlled study isolates the effect.
- Zero-shot cloners copy the reference's prosody and emotion along with its timbre. The cloning survey says reference-based models synthesise "with the prosody and emotion of the reference audio" [46].
- Mega-TTS 2 notes that a single prompt "is insufficient to guide the zero-shot TTS systems to imitate the voice variability of a natural person" [46].
- Unsloth says zero-shot cloning "misses pacing and expression, often sounding robotic and unnatural" [45].
- A Kokoro clip has neutral prosody and no real breaths or laughs. The model must therefore invent non-verbals for an identity it only knows as flat synthetic speech. This plausibly explains why Chatterbox-Turbo's laughs sounded pasted on. That is an inference, not measured.
- Chatterbox's own docs show the reference's speaking style changes the output (fast references need a lower cfg) [21].

**Legal and ethical options for a human reference voice:**

| Option | Legal footing | Quality | Notes |
|---|---|---|---|
| **Owner records own voice** (a 10–30 s reference for zero-shot; about 3 h with real laughs for an Orpheus LoRA) | Cleanest: owner consents. YouTube lists "Cloning one's own voice to create voice overs or dubs" as **not requiring** AI disclosure, and says disclosure alone won't affect monetisation [47] | Best: real breaths and laughs, and one consistent identity across all videos | Record in a quiet room, mono, 24 kHz+. Record emotional variants (warm, excited, sombre) so they can serve as IndexTTS2/Ming emotion prompts |
| **Hired voice actor with a written AI-voice licence** | Sound if the contract explicitly grants synthetic replication, commercial use on YouTube, term, territory and revocation | High | Right-of-publicity claims survived dismissal in *Lehrman & Sage v. Lovo* (NY), where actors' voices were cloned beyond the agreed use [48]. The contract must name AI cloning explicitly |
| **Designed voice** (Maya1 description; Ming VOICE_DESIGN; Qwen3-TTS VoiceDesign) | No identifiable person, so no publicity issue | Good; the voice may drift across chunks | Avoids the synthetic-reference problem *and* the consent problem |
| **Public-domain / CC0 speech (e.g. LibriVox)** | LibriVox: recordings are PD, and "People may use our recordings to profit… they do not need to give credit" [49]. But copyright status ≠ consent to clone the *person*. A HF forum post flags "using someone's voice without expressed consent" [50]. Publicity rights cover voice in many US states [48] | Variable (home recordings) | **Not recommended** for cloning one specific, identifiable reader as a channel's permanent voice. The law is unsettled and the ethics are poor; the volunteers never agreed to become an AI voice |
| CC-BY speech corpora (LibriTTS, VCTK, Hi-Fi TTS…) | Licence covers the recordings, not a specific speaker's voice identity (**UNVERIFIED** per-corpus consent terms) | Variable | Same consent concern; also check that NC corpora (e.g. Expresso) are excluded (**UNVERIFIED**) |

**Also note:** the YouTube disclosure rule targets realistic content that makes "a real person appear to say or do something they didn't do" [47]. Cloning a stranger from LibriVox drifts toward that. Cloning the owner does not.

---

## 4. Demo plan: exact install + generate code (T4, Kaggle)

### 4.0 Common Kaggle pattern (all three)

The caller reports the Kaggle image is Python 3.13. I did not independently verify that (**UNVERIFIED**). The three models pin older stacks, so give each one its own **uv-managed venv with its own Python**. Don't fight the base image. uv downloads standalone Pythons, which works because Kaggle internet is on.

```bash
pip install -q uv
nvidia-smi                       # confirm T4 + driver CUDA version (IndexTTS suggests 12.8+, Dia2 requires it)
```

Rules that apply to all three on a T4:
- **Never request bf16.** The T4 is compute 7.5. vLLM explicitly refuses bf16 there, and `dtype=half` is the documented fix [17].
- Load in `float16` first. If you get NaN, garbled audio or silence, fall back to `float32`. This mirrors the community advice for Chatterbox on Colab T4: "run FP32 uncompiled" [22].
- **No FlashAttention-2 on Turing.** Use the PyTorch SDPA fallback. Ming documents this fallback [5].
- After install, check that `python -c "import torch;print(torch.cuda.get_arch_list())"` contains `sm_75`. Newer CUDA wheels have dropped older architectures; whether a given wheel still includes sm_75 is **UNVERIFIED** per version.

### 4.1 Ming-3.0-tts-0.5B: `inclusionAI/Ming-3.0-tts-0.5b`

```bash
uv venv /kaggle/working/venv-ming --python 3.10
git clone https://github.com/inclusionAI/Ming-3.0-tts /kaggle/working/Ming-3.0-tts
cd /kaggle/working/Ming-3.0-tts
VIRTUAL_ENV=/kaggle/working/venv-ming uv pip install -r requirements.txt   # pins torch 2.6 / transformers==4.46.3 per README Docker
# skip pynini (conda-only pin); pass --no_text_normalization and pre-normalise numbers/dates in our script step
```

```bash
# zero-shot clone + inline non-verbals (English). Flags from README; language_id "English" per HF card.
/kaggle/working/venv-ming/bin/python infer.py \
  --model_path inclusionAI/Ming-3.0-tts-0.5b --task TTS --language_id English \
  --text "[Sigh] Most people never check this number. [Laughter] And honestly, I didn't either." \
  --prompt_wav_path /kaggle/input/ref/owner_ref.wav --prompt_text "<exact transcript of ref>" \
  --use_spk_emb --no_text_normalization --output /kaggle/working/out/ming_tags.wav
```

```python
# Python API (shape per README; verify arg names against README Quick Start before running)
from ming_tts import MingTTS
m = MingTTS("inclusionAI/Ming-3.0-tts-0.5b")
m.synthesize(task="EMOTION", language_id="English", text="This is the moment everything changed.",
             controls={"emotion": "高兴"},                     # 高兴=happy, 悲伤=sad, 惊讶=surprise, 中性=neutral
             prompt_wav_path="/kaggle/input/ref/owner_ref.wav", use_spk_emb=True,
             output_path="/kaggle/working/out/ming_emotion.wav")
```

Notes:
- The constructor exposes no dtype argument [5].
- If it loads bf16 internally and is slow or unstable on the T4, cast the model to fp16/fp32 after loading. This is **UNVERIFIED**; inspect `ming_tts` source.
- Measure peak VRAM with `torch.cuda.max_memory_allocated()` and RTF yourself. Neither is published.

### 4.2 Maya1: `maya-research/maya1` (+ SNAC `hubertsiuzdak/snac_24khz`)

```bash
uv venv /kaggle/working/venv-maya --python 3.11
VIRTUAL_ENV=/kaggle/working/venv-maya uv pip install torch transformers accelerate snac soundfile numpy
```

```python
# Adapted from the maya1 model card's transformers example. The stop id 128258 and code range
# 128266..156937 are quoted on the card [8]. The other special-token ids follow the card's example
# code / the Orpheus layout: VERIFY against the card before running.
import torch, numpy as np, soundfile as sf
from transformers import AutoModelForCausalLM, AutoTokenizer
from snac import SNAC
tok = AutoTokenizer.from_pretrained("maya-research/maya1")
model = AutoModelForCausalLM.from_pretrained("maya-research/maya1", torch_dtype=torch.float16, device_map="cuda")  # fp16 on T4, NOT bf16
snac = SNAC.from_pretrained("hubertsiuzdak/snac_24khz").eval().to("cuda")
SOH, EOH, SOA, SOS, EOT, STOP, OFF = 128259, 128260, 128261, 128257, 128009, 128258, 128266
desc = "Male, early 40s, neutral American, warm baritone, calm documentary pacing."
text = "Most people never check this number. <sigh> And honestly <chuckle> I didn't either."
prompt = tok.decode([SOH]) + tok.bos_token + f'<description="{desc}"> {text}' + tok.decode([EOT, EOH, SOA, SOS])
ids = tok(prompt, return_tensors="pt", add_special_tokens=False).input_ids.to("cuda")
torch.manual_seed(1234)  # fix the seed per chunk for consistency
out = model.generate(ids, max_new_tokens=2048, temperature=0.4, top_p=0.9, repetition_penalty=1.1,
                     do_sample=True, eos_token_id=STOP)[0, ids.shape[1]:].tolist()
codes = [t for t in out if OFF <= t <= 156937]; codes = codes[: len(codes)//7*7]
l1, l2, l3 = [], [], []
for i in range(0, len(codes), 7):
    f = [(c - OFF) % 4096 for c in codes[i:i+7]]
    l1.append(f[0]); l2 += [f[1], f[4]]; l3 += [f[2], f[3], f[5], f[6]]
z = snac.quantizer.from_codes([torch.tensor([x], device="cuda") for x in (l1, l2, l3)])
audio = snac.decoder(z)[0, 0].float().detach().cpu().numpy()
sf.write("/kaggle/working/out/maya1.wav", audio, 24000)
```

Notes:
- Keep `desc` byte-identical for every chunk.
- Generate passages, not whole scripts. The card advises "manageable passages" [8].
- If fp16 produces garbage, retry with `torch_dtype=torch.float32` (~13 GB for 3.3B params; tight but possible).
- The same decode code works for Orpheus by swapping the model to `canopylabs/orpheus-3b-0.1-ft`. Orpheus uses a `"tara: text"`-style voice prefix instead of the description; verify the prompt format in its repo.

### 4.3 IndexTTS-2: `IndexTeam/IndexTTS-2`

```bash
git clone https://github.com/index-tts/index-tts /kaggle/working/index-tts && cd /kaggle/working/index-tts
git lfs pull                                   # repo uses LFS assets
uv sync --all-extras                           # README: uv is "required"; it picks its own Python
uv run hf download IndexTeam/IndexTTS-2 --local-dir=checkpoints
```

```python
# run with: uv run python demo.py   (API per README; v2 module name infer_v2 — verify in repo)
from indextts.infer_v2 import IndexTTS2
tts = IndexTTS2(cfg_path="checkpoints/config.yaml", model_dir="checkpoints",
                use_fp16=True, use_deepspeed=False, use_cuda_kernel=False)   # fp16 for v2 on T4
# vector order: [happy, angry, sad, afraid, disgusted, melancholic, surprised, calm]
tts.infer(spk_audio_prompt="/kaggle/input/ref/owner_ref.wav",
          text="And that single decision cost him everything he had built.",
          emo_vector=[0, 0, 0.35, 0, 0, 0.3, 0, 0.2], use_random=False,
          output_path="/kaggle/working/out/index_sombre.wav", verbose=True)
tts.infer(spk_audio_prompt="/kaggle/input/ref/owner_ref.wav",
          text="Here's the part nobody tells you.", use_emo_text=True, emo_alpha=0.6,
          output_path="/kaggle/working/out/index_autoemo.wav")
```

Notes:
- The README's current example is for 2.5 (`infer_v2_5`, `use_bf16=True`) [12]. The v2 constructor flags above follow the repo's v2 usage and are **UNVERIFIED** for the current commit.
- Keep `use_random=False`. The README warns that randomness "reduces cloning fidelity" [12].

### 4.4 Suggested demo protocol (same script for all three)

1. Use a 6-sentence test script from a real MR episode: 2 neutral, 1 warm, 1 excited, 1 sombre, plus 1 line with a single laugh/sigh.
2. Run each model twice:
   - (a) with the current Kokoro reference;
   - (b) with a 20-s **owner recording**. For Maya1, use a description instead of (b).
3. That isolates "model" from "synthetic reference".
4. Log peak VRAM, wall-clock and RTF. These become the first real T4 numbers we have.
5. Owner does a blind A/B against current Kokoro output.

**GPU budget:** at an assumed ~1× realtime on a T4 (**UNVERIFIED**; no published T4 RTF for any of the three), a 10-minute narration with 2× retakes needs about 20–30 GPU-minutes. That gives roughly 60 videos/week on 30 h, before model-load overheads.

---

## 5. Risks and gaps

- **No T4 measurements exist** for any shortlisted model. Every T4 verdict is inferred from parameter counts and published VRAM on other GPUs.
- **bf16-native models on Turing:** Ming, Maya1, IndexTTS-2.5, VoxCPM2 and Step-Audio-EditX all default to bf16. fp16 can overflow in some models (cf. Gemma 3 on T4 [17]). Budget time for fp32 fallbacks.
- **Arena ≠ emotion:** AA Elo rates general naturalness. No public benchmark rates laugh and sigh realism. The owner's ears are the only valid test, so run the blind A/B.
- **Licence nuances:**
  - IndexTTS (custom licence; outputs can't train other models).
  - Higgs v2 ("annual active users" threshold; unclear how YouTube viewers count).
  - Orpheus (Apache tag vs Llama-3.2 base; both allow commercial use).
  - Step-Audio-EditX (no weight licence: do not monetise until clarified).
  - Chatterbox watermarks every output [20].
- **Maturity:** Ming-3.0 is a month old, and its technical report is "still listed as unfinished" [7]. Chatterbox is retired [20].
- **Kaggle Python 3.13:** not independently verified. Pins (torch 2.6 / transformers 4.46.3 / Python 3.10) make per-model uv venvs mandatory.
- **Leaderboard volatility:** AA numbers shift weekly. Values here are as of 2026-11-22.

## 6. Open questions

1. Will the owner record a 20–30 s reference now, and about 3 h with natural laughs and sighs later, for an Orpheus LoRA? This is the highest-leverage decision.
2. Is a *designed* voice (Maya1/Ming VOICE_DESIGN) acceptable as the channel voice instead of a cloned one?
3. For Ming: does English paralinguistic output sound as good as the Chinese demos? The arena Elo is cross-language.
4. Does StepFun publish a weight licence for Step-Audio-EditX (AA 1100)? If it is Apache, it becomes a strong #4.
5. Should Phonon 31M (AA 1108, Apache) replace Kokoro for *neutral* sentences, with an emotional model only on tagged sentences?

---

## 7. Sources

1. Artificial Analysis, Speech Arena, open-weights view: https://artificialanalysis.ai/text-to-speech/leaderboard/open-weights. Elo for all ranked open models (fetched 2026-11-22).
2. Artificial Analysis, Controlled Voice Arena: https://artificialanalysis.ai/text-to-speech/leaderboard/controlled-voice. Ming 1073, Chatterbox 941, XTTS 847 (fetched 2026-11-22).
3. Pinggy, "Best Open Source Self-Hosted TTS Models in 2026" (updated 2026-08-26): https://pinggy.io/blog/best_open_source_self_hosted_text_to_speech_models/. Licences and VRAM for Breeze, S2 Pro, Voxtral, Magpie, Maya1; XTTS/Coqui shutdown; VibeVoice withdrawn. Also Digital Applied (2026-09-24): https://www.digitalapplied.com/blog/best-text-to-speech-models-september-2026-ranked-priced. AA commercial flags.
4. Ming-3.0-tts-0.5B HF card: https://huggingface.co/inclusionAI/Ming-3.0-tts-0.5B. MIT; tasks; tested on H800/H20; SDPA fallback.
5. Ming-3.0-tts GitHub README: https://github.com/inclusionAI/Ming-3.0-tts. 14 tags, task list, pins, `--no_text_normalization`, CLI flags.
6. aireiter setup guide: https://aireiter.com/tw/blog/ming-3-0-tts-local-setup-guide. Python 3.10 environment (secondary).
7. aireiter review: https://aireiter.com/blog/ming-3-0-tts-review-local-deployment. 2.96 GB checkpoint, no consumer benchmarks, practitioner laugh/sigh note, task modes not combinable. Also kie.ai: https://kie.ai/blog/what-is-ming-3-0. Release Oct 2026, MIT, controlled-voice rank (secondary).
8. Maya1 HF card: https://huggingface.co/maya-research/maya1. Apache-2.0, 20 tags, description format, 16 GB+ BF16, continuity advice, stop token and code range.
9. ComfyUI Maya1 extension: https://comfy.icu/extension/Saganaki22__ComfyUI-Maya1_TTS. fp16 ≈ 8–9 GB (third party).
10. Gradium Phonon release blog: https://gradium.ai/blog/release-phonon-open-weight. Apache-2.0 for the 31m-en model; no emotion controls; consented cloning.
11. IndexTTS LICENSE (bilibili Model Use License): https://github.com/index-tts/index-tts/blob/main/LICENSE. 100M MAU / RMB 1bn thresholds; §3.4(c).
12. IndexTTS GitHub README: https://github.com/index-tts/index-tts. Emotion methods, vector order, fp16 for v2 / bf16 for 2.5, uv required, CUDA 12.8+.
13. ZimaSpace IndexTTS hardware page: https://shop.zimaspace.com/pages/index-tts-hardware-requirements. ≥8 GB, 12 GB tight, no official minimum (secondary).
14. Orpheus 3B ft HF card: https://huggingface.co/canopylabs/orpheus-3b-0.1-ft. Apache-2.0 tag, gated.
15. Canopy Hindi research release (llama3.2 tag): https://huggingface.co/canopylabs/3b-hi-pretrain-research_release. Licence ambiguity.
16. Orpheus GitHub README: https://github.com/canopyai/Orpheus-TTS. Tags, voices, vllm==0.7.3 pin, known issues, model ids.
17. vLLM forum, Gemma3 on T4: https://discuss.vllm.ai/t/gemma3-on-a-t4-gpu/643. T4 needs `dtype=half`; fp16 instability for some models. Also NVIDIA forum: https://forums.developer.nvidia.com/t/how-to-set-dtype-for-nvidia-nim-3-8b/352121. T4 bf16 error.
18. Dia GitHub README: https://github.com/nari-labs/dia. Apache-2.0, tag list, 4.4 GB, 4090 RTF, consistency guidance.
19. Dia2 GitHub README: https://github.com/nari-labs/dia2. Apache-2.0, CUDA 12.8+, prefix for stable voice, 2-min limit.
20. Chatterbox GitHub README: https://github.com/resemble-ai/chatterbox. MIT, retired Aug 2026, variants, tags Turbo/Nano only, Perth watermark, Python 3.11.
21. Chatterbox HF card: https://huggingface.co/ResembleAI/chatterbox. Exaggeration/cfg tips for dramatic speech.
22. NVIDIA Chatterbox model card: https://docs.nvidia.com/ace-for-games/chatterbox-tts/nvigi-chatterbox-model-card.html. VRAM. Also Reddit T4 FP32 advice (via search summary): https://redlib.hackliberty.org/r/LocalLLaMA/comments/1lfnn7b/optimized_chatterbox_tts_up_to_24x_nonbatched/myyjnqn/
23. fal.ai Chatterbox Turbo launch: https://blog.fal.ai/chatterbox-turbo-is-now-available-on-fal. "Use tags sparingly, overuse sounds theatrical".
24. Zonos GitHub README: https://github.com/Zyphra/Zonos. Apache-2.0, 6 GB+, 2× on 4090, hybrid needs RTX 3000+.
25. Higgs Audio v2 LICENSE: https://huggingface.co/bosonai/higgs-audio-v2-generation-3B-base/blob/main/LICENSE. 100,000 annual-active-user threshold.
26. Higgs Audio README_V2: https://github.com/boson-ai/higgs-audio/blob/main/README_V2.md. "At least 24GB"; EmergentTTS emotions 75.7%; archived.
27. Higgs Audio GitHub: https://github.com/boson-ai/higgs-audio. v3 non-commercial licence.
28. Sesame CSM-1B HF card: https://huggingface.co/sesame/csm-1b. Apache-2.0, no fixed voice, context needed.
29. CosyVoice GitHub: https://github.com/FunAudioLLM/CosyVoice. Apache-2.0, model ids, Python 3.10.
30. Fun-CosyVoice3 HF card: https://huggingface.co/FunAudioLLM/Fun-CosyVoice3-0.5B-2512. instruct2, `[breath]`.
31. Qwen3-TTS HF card: https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice. Apache-2.0, instruct control, presets, FA2.
32. VoxCPM2 HF card: https://huggingface.co/openbmb/VoxCPM2. Apache-2.0, ~8 GB, style prefix, RTF 0.30 on 4090.
33. Step-Audio-EditX HF card: https://huggingface.co/stepfun-ai/Step-Audio-EditX. Tags, 12 GB, L40S, Python ≥3.12/torch ≥2.9.1, code licence only.
34. Step-Audio-EditX HF file tree: https://huggingface.co/stepfun-ai/Step-Audio-EditX/tree/main. No LICENSE file, no licence tag.
35. Digital Applied (see 3). AA flags Step Audio EditX commercial "No" (conflicts with Pinggy's "Apache 2.0").
36. F5-TTS GitHub: https://github.com/SWivid/F5-TTS. Weights CC-BY-NC (Emilia).
37. Spark-TTS HF card: https://huggingface.co/SparkAudio/Spark-TTS-0.5B. CC-BY-NC-SA-4.0, changed from Apache.
38. Spark-TTS GitHub: https://github.com/SparkAudio/Spark-TTS. Control limited to gender/pitch/rate.
39. MaskGCT HF card: https://huggingface.co/amphion/MaskGCT. cc-by-nc-4.0.
40. Vevo HF card: https://huggingface.co/amphion/Vevo. cc-by-nc-4.0.
41. StyleTTS2 GitHub: https://github.com/yl4579/StyleTTS2. MIT code; listener-disclosure condition on pretrained models.
42. XTTS-v2 HF card: https://huggingface.co/coqui/XTTS-v2. Coqui Public Model License.
43. CPML text (XTTS-v1 LICENSE): https://huggingface.co/coqui/XTTS-v1/raw/main/LICENSE. Non-commercial; revenue-generating use excluded.
44. IndexTTS2 paper: https://arxiv.org/html/2506.21619v2. Emotional fidelity claims (self-reported).
45. Unsloth TTS fine-tuning docs: https://unsloth.ai/docs/basics/text-to-speech-tts-fine-tuning. T4: 3 h of data in 1–2 h; `<laugh>`/`<sigh>` tags; "zero-shot cloning… sounding robotic and unnatural".
46. Voice Cloning survey: https://arxiv.org/pdf/2505.00579. Reference prosody and emotion transfer. Also Mega-TTS 2: https://arxiv.org/pdf/2307.07218. Single-prompt insufficiency.
47. YouTube Help, "Disclosing use of altered or synthetic content": https://support.google.com/youtube/answer/14328491?hl=en. Own-voice cloning exempt; disclosure doesn't affect monetisation.
48. Skadden on *Lehrman v. Lovo*: https://www.skadden.com/insights/publications/2025/07/new-york-court-tackles-the-legality-of-ai-voice-cloning. Publicity claims survive for cloned voices.
49. LibriVox wiki, Copyright and Public Domain: https://wiki.librivox.org/index.php/Copyright_and_Public_Domain. PD, "may use our recordings to profit".
50. HF forum, LibriVox data policy: https://discuss.huggingface.co/t/policy-for-librivox-audio-data/46707. Consent concern.
51. TTS Arena V2 Space: https://huggingface.co/spaces/TTS-AGI/TTS-Arena-V2. Leaderboard did not render to the fetcher (rankings UNVERIFIED).
