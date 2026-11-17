# Living Diagram voice lane — human-feeling narration with word timings.
#
# Input : lines JSON  [{ "i": int, "text": str, "mood"?: str }]
#         text may carry Chatterbox paralinguistic tags: [laugh] [chuckle] [sigh] [gasp] ...
# Output: <outdir>/audio/line-XX.mp3 (loudness-normalised)
#         <outdir>/voice-durations.json  [{ "i", "ms", "words": [{ "w", "s", "d" }] }]
#         words are the SCRIPT words (tags removed), so cue anchors always match.
#
# Engines:
#   chatterbox  Resemble Chatterbox-Turbo (MIT) via the official HF Space; emotion tags;
#               voice cloned from --ref (our own Kokoro clip — licence-clean).
#               Timings: faster-whisper (MIT) word timestamps mapped onto the script words.
#   edge        Edge TTS; mood -> rate/pitch per line; real WordBoundary timings.
#   kokoro      Kokoro-82M ONNX (Apache-2.0); mood -> speed; faster-whisper timings.
#
# Usage: python voice_lines.py <lines.json> <outdir> --engine chatterbox --ref ref.wav
#        python voice_lines.py <lines.json> <outdir> --engine edge --voice en-US-AndrewMultilingualNeural
import argparse
import asyncio
import difflib
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_WIN_FF = os.path.join(ROOT, "ffmpeg-bin", "ffmpeg-master-latest-win64-gpl", "bin", "ffmpeg.exe")
FF = os.environ.get("EXPLAINER_FFMPEG") or (_WIN_FF if os.path.exists(_WIN_FF) else "ffmpeg")
TAG_RE = re.compile(r"\[[a-z ]+\]", re.I)

# mood -> (edge rate, edge pitch, kokoro speed, chatterbox temperature)
MOOD = {
    "calm": ("-4%", "-2Hz", 0.96, 0.7),
    "warm": ("+0%", "+0Hz", 1.0, 0.8),
    "excited": ("+7%", "+3Hz", 1.08, 0.9),
    "serious": ("-6%", "-3Hz", 0.94, 0.7),
    "tense": ("+3%", "-1Hz", 1.03, 0.85),
    "sad": ("-10%", "-4Hz", 0.9, 0.7),
    "playful": ("+5%", "+2Hz", 1.05, 0.9),
}


def clean(text):
    return re.sub(r"\s+", " ", TAG_RE.sub(" ", text)).strip()


def norm(w):
    return re.sub(r"[^a-z0-9]", "", w.lower())


def ff(*args):
    subprocess.run([FF, "-y", "-v", "error", *args], check=True)


def to_mp3(src, dst):
    # one loudness target for every engine/line so the mix is even
    ff("-i", src, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100", "-ac", "1", "-b:a", "160k", dst)


def dur_ms(path):
    import soundfile as sf
    info = sf.info(path)
    return round(info.frames / info.samplerate * 1000)


_whisper = None


def align(audio_path, script_text, tmpdir):
    """Word timings for audio whose transcript we KNOW: recognise with faster-whisper,
    then map recognised words onto the script words (difflib); unmatched script words
    are interpolated between matched neighbours by character length."""
    global _whisper
    import soundfile as sf
    from faster_whisper import WhisperModel
    if _whisper is None:
        _whisper = WhisperModel(os.environ.get("VOICE_ALIGN_MODEL", "tiny.en"), device="cpu", compute_type="int8")
    wav16 = os.path.join(tmpdir, "align16k.wav")
    ff("-i", audio_path, "-ar", "16000", "-ac", "1", wav16)
    a, _sr = sf.read(wav16, dtype="float32")
    segs, _ = _whisper.transcribe(a, word_timestamps=True, initial_prompt=script_text, vad_filter=False)
    rec = [(w.word.strip(), w.start, w.end) for s in segs for w in (s.words or []) if w.word.strip()]
    return map_to_script(script_text, rec, len(a) / 16000.0)


def synth_chatterbox(text, mood, ref, out_wav, seed):
    from gradio_client import Client, handle_file
    client = synth_chatterbox.client
    if client is None:
        client = Client(os.environ.get("CHATTERBOX_SPACE", "ResembleAI/chatterbox-turbo-demo"),
                        token=os.environ.get("HF_TOKEN") or None, verbose=False)
        synth_chatterbox.client = client
    temp = MOOD.get(mood or "warm", MOOD["warm"])[3]
    last = None
    for attempt in range(4):
        try:
            p = client.predict(text=text, audio_prompt_path=handle_file(ref), temperature=temp, seed_num=seed,
                               min_p=0.0, top_p=0.95, top_k=1000, repetition_penalty=1.2, norm_loudness=True,
                               api_name="/generate")
            shutil.copy(p, out_wav)
            return
        except Exception as e:  # quota / queue / network: back off, then give up loudly
            last = e
            print(f"  [voice] chatterbox retry {attempt + 1}: {str(e)[:160]}", flush=True)
            time.sleep(8 * (attempt + 1))
    raise RuntimeError(f"chatterbox failed: {last}")


synth_chatterbox.client = None


async def synth_edge(text, mood, voice, out_mp3):
    import edge_tts
    rate, pitch = MOOD.get(mood or "warm", MOOD["warm"])[:2]
    words = []
    comm = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch, boundary="WordBoundary")
    with open(out_mp3, "wb") as f:
        async for chunk in comm.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                words.append({"w": chunk["text"], "s": chunk["offset"] / 1e7, "d": chunk["duration"] / 1e7})
    return words


def kokoro_dirs():
    # CI: the daily-sweeper caches the fp32 model in pixabay-pool; dev: ~/.cache/kokoro
    return [d for d in (os.environ.get("KOKORO_DIR"), os.path.join(ROOT, "pixabay-pool"),
                        os.path.join(os.path.expanduser("~"), ".cache", "kokoro")) if d]


def kokoro_model():
    if kokoro_model.k is None:
        from kokoro_onnx import Kokoro
        for d in kokoro_dirs():
            model = next((os.path.join(d, f) for f in ("kokoro-v1.0.onnx", "kokoro-v1.0.int8.onnx") if os.path.exists(os.path.join(d, f))), None)
            if model and os.path.exists(os.path.join(d, "voices-v1.0.bin")):
                kokoro_model.k = Kokoro(model, os.path.join(d, "voices-v1.0.bin"))
                break
        else:
            raise RuntimeError(f"kokoro model missing in {kokoro_dirs()}")
    return kokoro_model.k


kokoro_model.k = None


def synth_kokoro(text, mood, voice, out_wav):
    import soundfile as sf
    a, sr = kokoro_model().create(text, voice=voice, speed=MOOD.get(mood or "warm", MOOD["warm"])[2], lang="en-us")
    sf.write(out_wav, a, sr)


# ---------------------------------------------------------------------------
# HUMAN-FEEL narration (step 1, docs/qa/step1-mr-voice-moneyflow-qa.md V1)
# Sentence by sentence: per-sentence speed (mood x punctuation), a real pause
# after each sentence shaped by its punctuation, exact word timings from forced
# alignment of the KNOWN sentence, one loudness target. Pure core (human_tts)
# takes injected synth/aligner so tests run without any model.
# ---------------------------------------------------------------------------
PAUSE_MS = {"...": 650, "?": 430, "!": 380, ".": 340, ":": 420, ";": 300}
MIN_HEARD = 0.8   # whole-file alignment below this -> per-sentence alignment
FAIL_HEARD = 0.6  # still below this -> fail loudly (narrate.py falls back to the legacy chain)
_TRAIL = "\"')]}”’"


def split_sentences(text):
    t = clean(text)
    # end punctuation, optionally followed by ONE closing quote/bracket (kept with the sentence)
    parts = re.split(r"(?:(?<=[.!?…])|(?<=[.!?…][" + re.escape(_TRAIL) + r"]))\s+(?=\S)", t)
    return [p.strip() for p in parts if p.strip()]


def _end(sentence):
    s = sentence.rstrip(_TRAIL + " ")
    if s.endswith("...") or s.endswith("…"):
        return "..."
    return s[-1:] if s else ""


def pause_after(sentence):
    return PAUSE_MS.get(_end(sentence), 300)


def sentence_speed(sentence, base=1.0, mood=None):
    m = MOOD.get(mood or "warm", MOOD["warm"])[2]
    e = _end(sentence)
    f = 1.04 if e == "!" else 0.98 if e == "?" else 0.97 if e == "..." else 1.0
    return round(max(0.7, min(1.3, base * m * f)), 3)


def map_to_script(script_text, rec, total):
    """Known-transcript mapping: recognised (word, start, end) onto the SCRIPT words;
    unmatched script words are interpolated between matched neighbours by length."""
    words = script_text.split()
    sm = difflib.SequenceMatcher(a=[norm(w) for w in words], b=[norm(r[0]) for r in rec], autojunk=False)
    t0 = [None] * len(words)
    t1 = [None] * len(words)
    for blk in sm.get_matching_blocks():
        for k in range(blk.size):
            t0[blk.a + k] = rec[blk.b + k][1]
            t1[blk.a + k] = rec[blk.b + k][2]
    i = 0
    while i < len(words):
        if t0[i] is not None:
            i += 1
            continue
        j = i
        while j < len(words) and t0[j] is None:
            j += 1
        start = t1[i - 1] if i > 0 else 0.0
        end = t0[j] if j < len(words) else total
        span = max(0.05, end - start)
        lens = [len(w) + 1 for w in words[i:j]]
        acc = start
        for k, L in enumerate(lens):
            d = span * L / sum(lens)
            t0[i + k], t1[i + k] = acc, acc + d
            acc += d
        i = j
    # never let a word run backwards (whisper can overlap neighbours)
    for k in range(1, len(words)):
        if t0[k] < t0[k - 1]:
            t0[k] = t0[k - 1]
        if t1[k] < t0[k]:
            t1[k] = t0[k] + 0.02
    matched = sum(blk.size for blk in sm.get_matching_blocks())
    return [{"w": w, "s": round(t0[k], 3), "d": round(max(0.02, t1[k] - t0[k]), 3)} for k, w in enumerate(words)], matched


def human_tts(text, synth, aligner, base_speed=1.0, mood=None, lead_ms=120):
    """-> (samples float32 1-D, sample_rate, words[{w,s,d}] seconds, matched, total_words)."""
    import numpy as np
    sents = split_sentences(text)
    if not sents:
        raise ValueError("empty narration")
    chunks, sr, spans, pos = [], None, [], 0
    for k, s in enumerate(sents):
        a, rate = synth(s, sentence_speed(s, base_speed, mood))
        a = np.asarray(a, dtype=np.float32).reshape(-1)
        if sr is None:
            sr = rate
            lead = np.zeros(int(sr * lead_ms / 1000), dtype=np.float32)
            chunks.append(lead)
            pos = lead.size
        elif rate != sr:
            raise ValueError("sample rate changed between sentences")
        if a.size == 0:
            raise ValueError(f"no audio for sentence {k + 1}: {s[:60]!r}")
        chunks.append(a)
        spans.append((pos, a.size, s))
        pos += a.size
        if k < len(sents) - 1:
            gap = np.zeros(int(sr * pause_after(s) / 1000), dtype=np.float32)
            chunks.append(gap)
            pos += gap.size
    samples = np.concatenate(chunks)
    script = " ".join(sents)
    total = len(script.split())
    # ONE alignment pass over the whole narration (the aligner's fixed per-call cost
    # dominated per-sentence passes, ~2 s each); the pauses make boundaries easy and
    # the known script words are mapped, never re-spelled.
    words, matched = aligner(samples, sr, script)
    if matched < MIN_HEARD * total:
        # a weak whole-file pass (seen: base.en heard 10/40) -> the per-sentence pass:
        # slower, but each window is one short, known sentence
        words, matched = [], 0
        for start, size, s in spans:
            ws, m = aligner(samples[start:start + size], sr, s)
            matched += m
            words += [{"w": w["w"], "s": round(start / sr + w["s"], 3), "d": w["d"]} for w in ws]
    if matched < FAIL_HEARD * total:
        raise RuntimeError(f"alignment too weak: {matched}/{total} words heard")
    return samples, sr, words, matched, total


def whisper_aligner():
    import numpy as np
    from faster_whisper import WhisperModel
    global _whisper
    if _whisper is None:
        # tiny.en: measured 40/40 words on the whole-file pass where base.en heard 10/40,
        # and ~3x faster; the transcript is KNOWN, so recognition quality matters less
        _whisper = WhisperModel(os.environ.get("VOICE_ALIGN_MODEL", "tiny.en"), device="cpu", compute_type="int8")

    def run(a, sr, sentence):
        a16 = a if sr == 16000 else np.interp(np.arange(0, a.size * 16000 / sr) * sr / 16000, np.arange(a.size), a).astype(np.float32)
        segs, _ = _whisper.transcribe(a16, word_timestamps=True, initial_prompt=sentence[:600], vad_filter=False,
                                      beam_size=1, condition_on_previous_text=False)
        rec = [(w.word.strip(), w.start, w.end) for s in segs for w in (s.words or []) if w.word.strip()]
        return map_to_script(sentence, rec, a.size / sr)
    return run


def human_tts_to_mp3(text, voice, base_speed, mood, out_mp3, tmpdir):
    """Kokoro voice, human pacing, exact timings -> loudness-normalised mp3. Returns (words, ms, matched, total)."""
    import soundfile as sf
    os.makedirs(tmpdir, exist_ok=True)
    k = kokoro_model()

    def synth(s, speed):
        return k.create(s, voice=voice, speed=speed, lang="en-us")
    samples, sr, words, matched, total = human_tts(text, synth, whisper_aligner(), base_speed, mood)
    wav = os.path.join(tmpdir, "human.wav")
    sf.write(wav, samples, sr)
    to_mp3(wav, out_mp3)
    return words, round(samples.size / sr * 1000), matched, total


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("lines")
    ap.add_argument("outdir")
    ap.add_argument("--engine", default="chatterbox", choices=["chatterbox", "chatterbox-local", "edge", "kokoro"])
    ap.add_argument("--voice", default="en-US-AndrewMultilingualNeural")
    ap.add_argument("--ref", default=None)
    ap.add_argument("--speed", type=float, default=1.0, help="kokoro base speed (the channel voiceProfile)")
    ap.add_argument("--mood", default=None, help="default mood for lines without one (the channel voiceProfile)")
    ap.add_argument("--layout", default="lines", choices=["lines", "edge_batch"],
                    help="edge_batch = audio/beat-XX.mp3 + tts-durations.json (drop-in for edge_batch.py)")
    args = ap.parse_args()
    stem, durs_name = ("beat", "tts-durations.json") if args.layout == "edge_batch" else ("line", "voice-durations.json")

    lines = json.load(open(args.lines, encoding="utf8"))
    adir = os.path.join(args.outdir, "audio")
    tmp = os.path.join(args.outdir, "tmp")
    os.makedirs(adir, exist_ok=True)
    os.makedirs(tmp, exist_ok=True)
    cache_path = os.path.join(args.outdir, "voice-cache.json")
    cache = json.load(open(cache_path, encoding="utf8")) if os.path.exists(cache_path) else {}
    ref_hash = hashlib.sha256(open(args.ref, "rb").read()).hexdigest()[:12] if args.ref else ""
    if args.engine.startswith("chatterbox") and not args.ref:
        sys.exit("chatterbox needs --ref <reference.wav>")

    def key_of(ln):
        return hashlib.sha256(json.dumps([args.engine, args.voice, ref_hash, ln["text"], ln.get("mood"), args.speed]).encode()).hexdigest()[:16]

    # chatterbox-local: render every uncached line in ONE helper run (model loads once)
    if args.engine == "chatterbox-local":
        jobs = []
        for ln in lines:
            hit = cache.get(str(ln["i"]))
            if hit and hit.get("key") == key_of(ln) and os.path.exists(os.path.join(adir, f"{stem}-{ln['i']:02d}.mp3")):
                continue
            jobs.append({"i": ln["i"], "text": ln["text"], "temperature": MOOD.get(ln.get("mood") or "warm", MOOD["warm"])[3],
                         "out": os.path.join(tmp, f"cb-{ln['i']:02d}.wav")})
        if jobs:
            jobs_path = os.path.join(tmp, "cb-jobs.json")
            json.dump(jobs, open(jobs_path, "w", encoding="utf8"))
            # decoding an MP3 reference inside chatterbox crashes natively on Windows
            # (0xC0000005); hand it a 24 kHz PCM WAV instead
            ref_wav = os.path.join(tmp, "ref.wav")
            ff("-i", args.ref, "-ar", "24000", "-ac", "1", "-c:a", "pcm_s16le", ref_wav)
            py = os.environ.get("CHATTERBOX_PYTHON", sys.executable)
            helper = os.path.join(os.path.dirname(os.path.abspath(__file__)), "chatterbox_local.py")
            for attempt in range(3):  # torch on Windows occasionally dies natively (0xC0000005) at start-up
                rc = subprocess.run([py, helper, jobs_path, "--ref", ref_wav]).returncode
                if rc == 0:
                    break
                print(f"  [voice] chatterbox helper exit {rc}, retry {attempt + 1}", flush=True)
                # keep finished lines: drop jobs whose wav already exists
                jobs = [j for j in jobs if not os.path.exists(j["out"])]
                json.dump(jobs, open(jobs_path, "w", encoding="utf8"))
            else:
                sys.exit("chatterbox helper failed 3 times")

    results = []
    for ln in lines:
        i, raw, mood = ln["i"], ln["text"], ln.get("mood") or args.mood
        script = clean(raw)
        key = key_of(ln)
        mp3 = os.path.join(adir, f"{stem}-{i:02d}.mp3")
        hit = cache.get(str(i))
        if hit and hit.get("key") == key and os.path.exists(mp3):
            results.append({"i": i, "ms": hit["ms"], "words": hit["words"]})
            print(f"  [voice] line {i:02d}: cached", flush=True)
            continue
        t = time.time()
        if args.engine == "edge":
            raw_mp3 = os.path.join(tmp, "edge.mp3")
            words = None
            for attempt in range(4):  # Edge intermittently answers "No audio was received"
                try:
                    words = asyncio.run(synth_edge(script, mood, args.voice, raw_mp3))
                    break
                except Exception as e:
                    print(f"  [voice] edge retry {attempt + 1}: {str(e)[:120]}", flush=True)
                    time.sleep(3 * (attempt + 1))
            if words is None:
                sys.exit(f"edge failed on line {i} after 4 attempts")
            to_mp3(raw_mp3, mp3)
            matched = len(words)
        elif args.engine == "kokoro":
            # human-feel path: sentence pacing + pauses + exact timings (fails loudly)
            words, _ms, matched, _tot = human_tts_to_mp3(script, args.voice, args.speed, mood, mp3, tmp)
        else:
            wav = os.path.join(tmp, "line.wav")
            if args.engine == "chatterbox-local":
                wav = os.path.join(tmp, f"cb-{i:02d}.wav")
            else:
                synth_chatterbox(raw, mood, args.ref, wav, seed=1000 + i)
            to_mp3(wav, mp3)
            words, matched = align(mp3, script, tmp)
        ms = dur_ms(mp3) if mp3.endswith(".wav") else None
        if ms is None:
            out = subprocess.run([FF.replace("ffmpeg", "ffprobe") if os.path.exists(FF.replace("ffmpeg", "ffprobe")) else "ffprobe",
                                  "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp3],
                                 capture_output=True, text=True)
            ms = round(float(out.stdout.strip()) * 1000)
        cache[str(i)] = {"key": key, "ms": ms, "words": words}
        json.dump(cache, open(cache_path, "w", encoding="utf8"))
        results.append({"i": i, "ms": ms, "words": words})
        print(f"  [voice] line {i:02d}: {ms / 1000:.1f}s, {len(words)} words ({matched} heard) in {time.time() - t:.0f}s", flush=True)

    json.dump(results, open(os.path.join(args.outdir, durs_name), "w", encoding="utf8"))
    shutil.rmtree(tmp, ignore_errors=True)
    print("[voice] done", flush=True)


if __name__ == "__main__":
    main()
