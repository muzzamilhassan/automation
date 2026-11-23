#!/usr/bin/env python3
"""Pre-render the voice-library preview clips (docs/qa/emotional-voice-qa.md EV-L).

Every voice in studio/lib/voice-library.mjs gets two clips that say the SAME
short line (one pause, NO sound tags — the previews judge the voice itself,
owner 2026-11-22):
  studio/public/voices/library/<id>.mp3    standard Kokoro voice, human pacing (local)
  studio/public/voices/emotional/<id>.mp3  the emotional GPU engine cloning that voice
                                           (ONE Kaggle batch, kernel quarry-voice-library)

Reference clips are the engine's own recipe (explainer/kaggle_voice.REF_TEXT
through Kokoro, licence-clean), so a channel sounds like its preview. 27
references (~1.6 MB) are too big to inline in one kernel push, and uploads from
this PC to Kaggle hang (dataset create) or reset (a 500 KB push), so a tiny
CPU-only kernel (<owner>/quarry-voice-refs, no GPU quota) builds them ON Kaggle
with the same kokoro-onnx; the ONE GPU batch reads its output via
kernel_sources. A channel's own run inlines its single reference instead.

Run from the repo root. The Kaggle CLI reads KAGGLE_API_TOKEN or
~/.kaggle/access_token itself; this script never reads or prints the token.
    python scripts/generate-emotional-previews.py --standard               # local Kokoro clips
    python scripts/generate-emotional-previews.py --refs-kernel <workdir>  # CPU kernel: the 27 references
    python scripts/generate-emotional-previews.py --emotional <workdir>    # ONE GPU batch -> emotional clips
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "explainer"))
import voice_lines  # noqa: E402
sys.modules.setdefault("voice_lines", voice_lines)
import kaggle_voice  # noqa: E402

PREVIEW_TEXT = "Here's something most people never notice... The small choices you make every day quietly shape everything else."
PREVIEW_MOOD = "warm"
BITRATE = "40k"  # mono speech, ~8 s per clip
OUT = {
    "standard": os.path.join(ROOT, "studio", "public", "voices", "library"),
    "emotional": os.path.join(ROOT, "studio", "public", "voices", "emotional"),
}


def owner():
    return os.environ.get("KAGGLE_USERNAME") or kaggle_voice.DEFAULT_OWNER


def refs_kernel_id():
    return f"{owner()}/quarry-voice-refs"


def library_voices():
    """The voice ids of studio/lib/voice-library.mjs (one list)."""
    with open(os.path.join(ROOT, "studio", "lib", "voice-library.mjs"), encoding="utf-8") as f:
        return re.findall(r"^\s*v\('([ab][fm]_[a-z]+)'", f.read(), re.M)


def no_align(samples, sr, script):
    return [], len(script.split())


def encode(wav, out_mp3):
    # the production loudness target (voice_lines.to_mp3), at a preview-sized bitrate
    voice_lines.ff("-i", wav, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "24000", "-ac", "1",
                   "-c:a", "libmp3lame", "-b:a", BITRATE, out_mp3)


def write_clip(samples, sr, out_mp3):
    import soundfile as sf
    tmp = tempfile.mkdtemp(prefix="evp-")
    try:
        wav = os.path.join(tmp, "p.wav")
        sf.write(wav, samples, sr)
        encode(wav, out_mp3)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return os.path.getsize(out_mp3)


def standard(voices):
    os.makedirs(OUT["standard"], exist_ok=True)
    k = voice_lines.kokoro_model()
    total = 0
    for v in voices:
        def synth(sentence, speed, v=v):
            return k.create(sentence, voice=v, speed=speed, lang="en-us")
        samples, sr, *_ = voice_lines.human_tts(PREVIEW_TEXT, synth, no_align, 1.0, PREVIEW_MOOD)
        size = write_clip(samples, sr, os.path.join(OUT["standard"], f"{v}.mp3"))
        total += size
        print(f"standard {v}: {samples.size / sr:.1f}s, {size // 1024} KB", flush=True)
    print(f"standard done ({total // 1024} KB)")


REFS_KERNEL = r'''# Quarry voice library: the Kokoro reference clips (CPU only).
# Built by scripts/generate-emotional-previews.py - do not edit by hand.
import os, subprocess, sys, urllib.request
subprocess.run([sys.executable, "-m", "pip", "install", "-q", "kokoro-onnx==0.4.7", "soundfile"], check=True)
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro
BASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
for f in ("kokoro-v1.0.onnx", "voices-v1.0.bin"):
    urllib.request.urlretrieve(BASE + f, "/tmp/" + f)
k = Kokoro("/tmp/kokoro-v1.0.onnx", "/tmp/voices-v1.0.bin")
for v in __VOICES__:
    a, sr = k.create(__TEXT__, voice=v, speed=__SPEED__, lang="en-us")
    sf.write(f"/kaggle/working/{v}.wav", np.asarray(a, dtype="float32"), sr)
    print(v, round(len(a) / sr, 1), flush=True)
'''


def _cli_run(args, timeout=600):
    r = subprocess.run(kaggle_voice.cli() + args, capture_output=True, text=True, timeout=timeout)
    return r.returncode, f"{r.stdout or ''} {r.stderr or ''}".strip()


def refs_kernel(voices, workdir):
    """A CPU-only kernel builds the references on Kaggle (no upload from here)."""
    kdir = os.path.join(workdir, "refs-kernel")
    os.makedirs(kdir, exist_ok=True)
    src = (REFS_KERNEL.replace("__VOICES__", json.dumps(voices)).replace("__TEXT__", json.dumps(kaggle_voice.REF_TEXT))
           .replace("__SPEED__", repr(kaggle_voice.REF_SPEED)))
    open(os.path.join(kdir, "refs.py"), "w", encoding="utf-8").write(src)
    json.dump({"id": refs_kernel_id(), "title": refs_kernel_id().split("/")[1], "code_file": "refs.py", "language": "python",
               "kernel_type": "script", "is_private": True, "enable_gpu": False, "enable_internet": True,
               "dataset_sources": [], "competition_sources": [], "kernel_sources": []},
              open(os.path.join(kdir, "kernel-metadata.json"), "w"), indent=2)
    code, out = _cli_run(["kernels", "push", "-p", kdir])
    print(out[-300:], flush=True)
    if code != 0 or "successfully pushed" not in out:
        sys.exit("refs kernel push failed")
    t0 = time.time()
    time.sleep(45)
    while time.time() - t0 < 20 * 60:
        _code, out = _cli_run(["kernels", "status", refs_kernel_id()], timeout=120)
        st = kaggle_voice.parse_status(out)
        print(f"refs kernel: {st} ({(time.time() - t0) / 60:.1f} min)", flush=True)
        if st == "complete":
            return
        if st in ("error", "cancel_acknowledged", "cancel_requested"):
            _cli_run(["kernels", "output", refs_kernel_id(), "-p", kdir, "-o"])
            sys.exit(f"refs kernel {st} (log in {kdir})")
        time.sleep(30)
    sys.exit("refs kernel timed out")


def emotional(voices, workdir):
    sentences = voice_lines.split_sentences(PREVIEW_TEXT)
    temp = voice_lines.MOOD[PREVIEW_MOOD][3]
    jobs = [{"id": f"{v}-{k}", "text": s, "ref": v, "temperature": temp, "seed": 2000 + n * 10 + k}
            for n, v in enumerate(voices) for k, s in enumerate(sentences)]
    refs_ = {v: {"find": f"{v}.wav"} for v in voices}
    os.makedirs(workdir, exist_ok=True)
    res = kaggle_voice.run_batch(f"{owner()}/quarry-voice-library", "chatterbox-turbo", jobs, refs_, workdir,
                                 timeout_s=90 * 60, kernel_sources=[refs_kernel_id()])  # a one-off: room for a GPU queue
    print(f"GPU wall time: {res['gpu_seconds'] / 60:.1f} min")
    os.makedirs(OUT["emotional"], exist_ok=True)
    total = 0
    missing = []
    for v in voices:
        paths = [res["files"].get(f"{v}-{k}") for k in range(len(sentences))]
        if any(p is None for p in paths):
            missing.append(v)
            continue
        samples, sr, *_ = kaggle_voice.assemble_line(PREVIEW_TEXT, paths, no_align)
        size = write_clip(samples, sr, os.path.join(OUT["emotional"], f"{v}.mp3"))
        total += size
        print(f"emotional {v}: {samples.size / sr:.1f}s, {size // 1024} KB", flush=True)
    print(f"emotional done ({total // 1024} KB){'; missing: ' + ', '.join(missing) if missing else ''}")
    json.dump({"gpu_seconds": res["gpu_seconds"], "result": res["result"]}, open(os.path.join(workdir, "library-run.json"), "w"), indent=2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--standard", action="store_true")
    ap.add_argument("--refs-kernel", default=None)
    ap.add_argument("--emotional", default=None)
    a = ap.parse_args()
    voices = library_voices()
    if not voices:
        sys.exit("no voices in studio/lib/voice-library.mjs")
    if a.standard:
        standard(voices)
    if a.refs_kernel:
        refs_kernel(voices, a.refs_kernel)
    if a.emotional:
        emotional(voices, a.emotional)


if __name__ == "__main__":
    main()
