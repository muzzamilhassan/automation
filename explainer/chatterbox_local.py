# Chatterbox (Resemble AI, MIT) on CPU — batch helper for voice_lines.py.
# Runs inside the interpreter that has chatterbox-tts + torch (locally an
# isolated venv: CHATTERBOX_PYTHON; on CI the runner's python). Loads the model
# ONCE, clones the voice from --ref ONCE, then renders every job.
#
# jobs.json: [{ "i": int, "text": str (may contain [sigh] [chuckle] ...), "temperature": float, "out": path.wav }]
# Usage: python chatterbox_local.py jobs.json --ref ref.wav [--model nano|turbo] [--ckpt DIR]
import argparse
import json
import os
import time

import soundfile as sf
import torch


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("jobs")
    ap.add_argument("--ref", required=True)
    ap.add_argument("--model", default=os.environ.get("CHATTERBOX_MODEL", "nano"), choices=["nano", "turbo"])
    ap.add_argument("--ckpt", default=os.environ.get("CHATTERBOX_CKPT", os.path.join(os.path.expanduser("~"), ".cache", "chatterbox-cpu")))
    args = ap.parse_args()

    torch.set_num_threads(max(1, os.cpu_count() or 1))
    from chatterbox.tts_turbo import ChatterboxTurboTTS

    t = time.time()
    model = ChatterboxTurboTTS.from_local(args.ckpt, device="cpu", nano=args.model == "nano")
    # norm_loudness=True hands float64 audio to the S3 tokenizer, which expects
    # float32 ("expected scalar type Double but found Float"). Our ref clip is
    # already loudness-normalised by voice_lines.to_mp3, so skip it.
    model.prepare_conditionals(args.ref, norm_loudness=False)
    print(f"  [chatterbox] {args.model} loaded + voice cloned in {time.time() - t:.0f}s ({torch.get_num_threads()} threads)", flush=True)

    jobs = json.load(open(args.jobs, encoding="utf8"))
    total_audio = total_wall = 0.0
    for j in jobs:
        torch.manual_seed(1000 + j["i"])  # reproducible takes per line
        t = time.time()
        wav = model.generate(j["text"], temperature=j.get("temperature", 0.8))
        # torchaudio>=2.9 routes save() through torchcodec; soundfile needs nothing extra
        sf.write(j["out"], wav.squeeze(0).numpy(), model.sr)
        secs = wav.shape[-1] / model.sr
        wall = time.time() - t
        total_audio += secs
        total_wall += wall
        print(f"  [chatterbox] line {j['i']:02d}: {secs:.1f}s audio in {wall:.1f}s (x{secs / max(wall, 1e-6):.2f} realtime)", flush=True)
    if jobs:
        print(f"  [chatterbox] TOTAL {total_audio:.1f}s audio in {total_wall:.1f}s = x{total_audio / max(total_wall, 1e-6):.2f} realtime", flush=True)


if __name__ == "__main__":
    main()
