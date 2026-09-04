# Open-Source "Human Voice" TTS Deep Research — Global + Chinese Ecosystems

*Researched 2026-09-05 (two sourced passes). Use case: English motivational narration for YouTube Shorts, $0, GitHub Actions CPU, word timestamps for captions. Raw findings condensed from agent reports; all claims carry source URLs.*

## TL;DR verdict

1. **Kokoro-82M — the winner.** Apache 2.0, 82M params, famously hit **#1 on TTS Arena beating ElevenLabs in blind tests** (Jan 2025) and still the highest-ranked open-weight model (~Elo 1,055) through 2026 (https://huggingface.co/spaces/TTS-Arena, https://inworld.ai/resources/best-voice-ai-tts-apis-for-real-time-voice-agents-2026-benchmarks). Runs 3-5× realtime on CPU, <2GB RAM (https://www.visionstory.ai/open-source/kokoro-tts). **Native word timestamps since v1.0** (github.com/hexgrad/kokoro issue #32) — feeds our karaoke captions directly. 54 voices (am_michael, af_heart…). 150 min audio/month ≈ 30-50 CI minutes, $0.
2. **ZipVoice (K2-FSA) — if we want a cloned signature voice.** MIT, only 123M params, official ONNX runs on phones; clone one great English narrator from 10s of audio, use it forever (github.com/k2-fsa/ZipVoice).
3. **MegaTTS3 (ByteDance) — best raw English naturalness among MIT models**, 0.45B, CPU-batch-feasible; caveat: ByteDance withheld the WavVAE encoder, community forks fill the gap (gray-area dependency) (github.com/bytedance/MegaTTS3).
4. **Chatterbox (Resemble AI, MIT)** — most expressive emotion control ("exaggeration" param fits motivational content), claims CPU 3× realtime but needs heavy torch install in CI; the only legitimate alternative if Kokoro feels flat (github.com/resemble-ai/chatterbox).

## The Chinese ecosystem — powerful but mostly disqualified

| Project | Org | License | Verdict for us |
|---|---|---|---|
| IndexTTS-2/2.5 | Bilibili | weights **non-commercial** | ❌ most expressive Chinese TTS, but NC |
| Fish Speech / OpenAudio S1 | fishaudio | weights **CC-BY-NC-SA** | ❌ ElevenLabs-class, but NC |
| CosyVoice 2/3 | Alibaba | Apache 2.0 | ⚠️ GPU-first install; English a notch below Kokoro |
| GPT-SoVITS | RVC-Boss | MIT | ⚠️ great for fine-tuned cloning; heavy for CI |
| F5-TTS | SWivid | code MIT, **checkpoints CC-BY-NC** (Emilia data) | ❌ commercial trap |
| MegaTTS3 | ByteDance | MIT (WavVAE withheld) | ⚠️ runner-up, gray-area fork |
| ChatTTS | 2noise | **CC-BY-NC**, stale | ❌ |
| MaskGCT | Amphion | **CC-BY-NC**, GPU | ❌ |
| FireRedTTS | Xiaohongshu | cloning "academic only" | ❌ dialogue-focused anyway |
| VoxCPM2 | OpenBMB | Apache 2.0, 30 languages | 👀 watch — too new |
| ZipVoice | K2-FSA | MIT, 123M | ✅ best CPU cloning |

Also GPU-disqualified on speed alone: VibeVoice (Microsoft, weights pulled), Qwen3-TTS, Orpheus, Spark-TTS (research-only), Fish S2 (API-first, not fully open).

## Hosted "free API" options — rejected
HuggingFace Inference free tier ≈ 300 req/hour + shrinking monthly credits (discuss.huggingface.co/t/api-inference-limit-changed/144157) — not unlimited, fragile for CI. Local model in the runner is strictly better.

## Recommended architecture for Quote Quarry

Narration chain becomes: **OpenAI gpt-4o-mini-tts (if credits) → Kokoro-82M ONNX (new default, $0 + word timestamps + human-quality) → Edge TTS (last resort)**.

CI cost: `kokoro-onnx` pip install + ~350MB model download per run (cacheable), ~2-5s synthesis per 40s script. Fully inside GitHub Actions free minutes.
