#!/usr/bin/env python3
"""Pre-render the panel's human-pacing PREVIEW clips (docs/qa/human-voice-panel-qa.md HV-C).

Kokoro can't run on Vercel, so the Voice section plays static clips: one fixed
sentence trio (a "...", a question, a statement; ~5-6 s) for every voice the picker
offers (studio/lib/voices.js) x the 7 moods (explainer/voice_lines.py MOOD), at
speed 1.0. Synthesis goes through the REAL human-pacing path
(voice_lines.human_tts: per-sentence speed = mood x punctuation, real pauses by
punctuation) — only the word-timing alignment is skipped (timings are for
captions, a preview has none). Same loudness target as production, encoded as
small mono MP3s; the panel applies the speed slider as playbackRate.

Run from the repo root (fully local: kokoro-onnx + ffmpeg, no API keys):
    python scripts/generate-human-voice-previews.py              # every voice x mood
    python scripts/generate-human-voice-previews.py bm_daniel    # one voice, 7 moods

Output: studio/public/voices/human/<voice>-<mood>.mp3
Pinned by tests/human-voice-panel.test.mjs (every file present, each small).
"""

import os
import re
import shutil
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "explainer"))
import voice_lines  # noqa: E402

PREVIEW_TEXT = "Here's the thing... Why does it matter? Small habits compound."
MOODS = list(voice_lines.MOOD)
OUT_DIR = os.path.join(ROOT, "studio", "public", "voices", "human")
BITRATE = "40k"  # mono speech; ~5 s per clip


def picker_voices():
    """The voice ids the panel's picker offers — read from studio/lib/voices.js (one list)."""
    with open(os.path.join(ROOT, "studio", "lib", "voices.js"), encoding="utf-8") as f:
        return re.findall(r"\{\s*id:\s*'([ab][fm]_[a-z]+)'", f.read())


def no_align(samples, sr, script):
    """A preview needs no word timings: report every word heard, so human_tts never
    runs its per-sentence or estimated-timing fallbacks."""
    return [], len(script.split())


def render_preview(text, mood, synth, speed=1.0):
    """The production human-pacing path minus alignment -> (samples, sample_rate)."""
    samples, sr, _words, _matched, _total = voice_lines.human_tts(text, synth, no_align, speed, mood)
    return samples, sr


def encode(wav, out_mp3):
    # the production loudness target (voice_lines.to_mp3), at a preview-sized bitrate
    voice_lines.ff("-i", wav, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "24000", "-ac", "1",
                   "-c:a", "libmp3lame", "-b:a", BITRATE, out_mp3)


def main():
    import soundfile as sf
    voices = picker_voices()
    only = set(sys.argv[1:])
    unknown = sorted(only - set(voices))
    if unknown:
        sys.exit(f"unknown voice(s): {', '.join(unknown)}; the picker offers: {', '.join(voices)}")
    os.makedirs(OUT_DIR, exist_ok=True)
    k = voice_lines.kokoro_model()
    total = 0
    for voice in [v for v in voices if not only or v in only]:
        def synth(sentence, speed, voice=voice):
            return k.create(sentence, voice=voice, speed=speed, lang="en-us")
        for mood in MOODS:
            out = os.path.join(OUT_DIR, f"{voice}-{mood}.mp3")
            tmp = tempfile.mkdtemp(prefix=f"hv-{voice}-{mood}-")
            try:
                samples, sr = render_preview(PREVIEW_TEXT, mood, synth)
                wav = os.path.join(tmp, "preview.wav")
                sf.write(wav, samples, sr)
                encode(wav, out)
            finally:
                shutil.rmtree(tmp, ignore_errors=True)
            size = os.path.getsize(out)
            total += size
            print(f"{voice}-{mood}: {samples.size / sr:.1f}s, {size // 1024} KB", flush=True)
    print(f"done -> {OUT_DIR} ({total // 1024} KB written)")


if __name__ == "__main__":
    main()
