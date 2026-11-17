#!/usr/bin/env python3
"""Regenerate the wizard's voice-demo MP3s (issue #111).

One short demo per production Kokoro voice, the SAME sentence for all, so the
owner can compare voices side by side before picking one in the Add Channel
wizard. Synthesis + loudness + encode go through the production human lane
(explainer/voice_lines.human_tts_to_mp3) — byte-for-byte the same treatment a
real channel narration gets. Fully local: kokoro-onnx + faster-whisper +
ffmpeg, no API keys.

Run from the repo root:
    python scripts/generate-voice-demos.py            # all voices
    python scripts/generate-voice-demos.py am_michael # just one

Output: studio/public/voices/<voice>.mp3
Labels live in studio/lib/voices.js (kept in sync by the pin-test
tests/wizard-voice-demos.test.mjs, which also fails if any MP3 is missing).
"""

import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "explainer"))
import voice_lines  # noqa: E402

# The Kokoro voices production actually uses (lib/brands.json voiceProfile.voice,
# deduplicated). Pin-test enforces this list stays a superset of brands.json.
VOICES = [
    "am_michael",
    "bm_george",
    "bm_daniel",
    "am_fenrir",
    "am_adam",
    "af_heart",
    "am_onyx",
]

# Same sentence for every voice so comparison is honest; ~8s at speed 1.0.
DEMO_SENTENCE = (
    "Hi, I'm the voice of this channel. Every week I break down one big idea "
    "into simple steps you can actually use."
)


def main():
    only = set(sys.argv[1:])
    outdir = os.path.join(ROOT, "studio", "public", "voices")
    os.makedirs(outdir, exist_ok=True)
    missing = [v for v in only if v not in VOICES]
    if missing:
        sys.exit(f"unknown voice(s): {', '.join(missing)}; known: {', '.join(VOICES)}")

    for voice in [v for v in VOICES if not only or v in only]:
        out = os.path.join(outdir, f"{voice}.mp3")
        tmp = tempfile.mkdtemp(prefix=f"vdemo-{voice}-")
        try:
            try:
                _words, ms, _matched, _total = voice_lines.human_tts_to_mp3(
                    DEMO_SENTENCE, voice, 1.0, None, out, tmp)
            except RuntimeError as e:
                # ctranslate2's MKL allocator sometimes fails transiently and
                # only recovers in a fresh process — re-exec for this voice.
                if "mkl_malloc" not in str(e):
                    raise
                print(f"{voice}: transient MKL alloc failure; retrying in a fresh process", flush=True)
                if subprocess.run([sys.executable, os.path.abspath(__file__), voice]).returncode != 0:
                    raise
                continue
            kb = os.path.getsize(out) // 1024
            print(f"{voice}: {ms / 1000:.1f}s, {kb} KB -> {os.path.relpath(out, ROOT)}")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    print(f"done -> {outdir}")


if __name__ == "__main__":
    main()
