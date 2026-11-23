# YouTube Short narration with a HUMAN feel + word timestamps.
#
# Engine chain (first that works wins):
#   1. OpenAI gpt-4o-mini-tts (voice "onyx" + narrator instructions) — human
#      delivery; word timings via whisper-1 alignment.
#   2. Kokoro-82M (Apache 2.0, $0, #1 open model on TTS Arena) — human-ranked
#      fixed narrator voices; word timings estimated by word length (fine for
#      1-3-word caption cues). Voice via YT_KOKORO_VOICE (default am_michael).
#   3. Edge TTS (free fallback) with native WordBoundary events.
#
# Usage: python narrate.py <script.txt> <out.mp3> <out.words.json>
# Also writes <out.mp3>.meta.json: {"engine","audio","duration","words":[{w,s,d}]}
import asyncio
import json
import os
import re
import subprocess
import sys

VOICE = os.environ.get("YT_TTS_VOICE", "onyx")
KOKORO_VOICE = os.environ.get("YT_KOKORO_VOICE", "am_michael")
KOKORO_SPEED = float(os.environ.get("YT_KOKORO_SPEED", "1.0"))
# edge-tts voice names have the locale shape 'en-US-BrianMultilingualNeural';
# kokoro ids (am_michael/bm_daniel) do NOT and edge-tts rejects them with
# "Invalid voice ..." (run 40631681473: the deepdive edge fallback died there
# right after a successful script). Kokoro ids stay honored on the kokoro
# path (YT_KOKORO_VOICE); the edge fallback never borrows them.
EDGE_VOICE_DEFAULT = "en-US-BrianMultilingualNeural"
EDGE_VOICE_RE = re.compile(r"^[a-z]{2}-[A-Z]{2}-\w+")
NARRATOR_INSTRUCTIONS = (
    "You are a calm, confident documentary narrator with quiet intensity. "
    "Speak slightly slower than normal with deliberate short pauses between "
    "sentences. Sound like a wise mentor, not a salesman. Give the final "
    "line extra weight and conviction."
)


def run_curl(args):
    return subprocess.run(["curl", "-sS", "--fail", "--retry", "2"] + args,
                          capture_output=True, text=True, check=True)


def openai_tts(text, mp3_path, key):
    run_curl([
        "https://api.openai.com/v1/audio/speech",
        "-H", f"Authorization: Bearer {key}",
        "-F", "model=gpt-4o-mini-tts",
        "-F", f"voice={VOICE}",
        "-F", "speed=0.95",
        "-F", f"input={text}",
        "-F", f"instructions={NARRATOR_INSTRUCTIONS}",
        "-o", mp3_path,
    ])


def openai_align(mp3_path, key):
    r = run_curl([
        "https://api.openai.com/v1/audio/transcriptions",
        "-H", f"Authorization: Bearer {key}",
        "-F", f"file=@{mp3_path}",
        "-F", "model=whisper-1",
        "-F", "response_format=verbose_json",
        "-F", "timestamp_granularities[]=word",
    ])
    data = json.loads(r.stdout)
    return [{"w": w["word"].strip(), "s": round(float(w["start"]), 3),
             "d": round(float(w["end"]) - float(w["start"]), 3)}
            for w in data.get("words", []) if w.get("word", "").strip()]


def kokoro_tts(text, base_path):
    """Kokoro-82M ONNX — $0, human-ranked #1 open voice. Returns (audio_path, words, duration)."""
    import array
    import wave

    from kokoro_onnx import Kokoro

    pool = os.environ.get("KOKORO_DIR", "pixabay-pool")
    model = os.path.join(pool, "kokoro-v1.0.onnx")
    voices = os.path.join(pool, "voices-v1.0.bin")
    if not (os.path.exists(model) and os.path.exists(voices)):
        raise RuntimeError("kokoro model files missing in " + pool)
    k = Kokoro(model, voices)
    audio, sr = k.create(text, voice=KOKORO_VOICE, speed=KOKORO_SPEED, lang="en-us")
    wav_path = base_path.rsplit(".", 1)[0] + ".kokoro.wav"
    try:
        import soundfile as sf
        sf.write(wav_path, audio, sr)
    except ImportError:
        import array as _array
        import wave
        with wave.open(wav_path, "wb") as f:
            f.setnchannels(1)
            f.setsampwidth(2)
            f.setframerate(sr)
            f.writeframes(_array.array("h", (audio * 32767).astype("int16")).tobytes())
    duration = len(audio) / sr
    # word timings estimated by word length (kokoro-onnx has no alignment API)
    words = text.split()
    total = sum(len(w) + 1 for w in words)
    t, out = 0.0, []
    for w in words:
        d = duration * (len(w) + 1) / total
        out.append({"w": w.strip(".,!?;:\"'’"), "s": round(t, 3), "d": round(d, 3)})
        t += d
    return wav_path, out, duration


def resolve_edge_voice():
    """YT_EDGE_VOICE only counts when it has the edge-tts name shape; anything
    else (unset, or a kokoro id leaking in via a shared voice env) resolves to
    a known-valid default instead of an edge-tts ValueError mid-run."""
    v = os.environ.get("YT_EDGE_VOICE", "").strip()
    if v and EDGE_VOICE_RE.match(v):
        return v
    if v:
        print(f"edge voice '{v}' is not an edge-tts name (kokoro id?) - using {EDGE_VOICE_DEFAULT}",
              file=sys.stderr)
    return EDGE_VOICE_DEFAULT


def edge_tts(text, mp3_path):
    asyncio.run(_edge(text, mp3_path))


async def _edge(text, mp3_path):
    import edge_tts

    words = []
    # The voice must be an edge-tts name (locale shape) — never a kokoro id.
    # Channel brand voices reach this lane through YT_EDGE_VOICE; kokoro ids
    # reach it through the kokoro path above. The old `or KOKORO_VOICE` here
    # crashed the fallback with "Invalid voice 'am_michael'" (run 40631681473).
    voice = resolve_edge_voice()
    print(f"edge-tts voice: {voice}", file=sys.stderr)
    communicate = edge_tts.Communicate(text, voice, rate="+2%", boundary="WordBoundary")
    with open(mp3_path, "wb") as f:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                words.append({"w": chunk["text"], "s": round(chunk["offset"] / 1e7, 3),
                              "d": round(chunk["duration"] / 1e7, 3)})
    with open(mp3_path.rsplit(".", 1)[0] + ".words.json", "w", encoding="utf-8") as f:
        json.dump(words, f)


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# Human voice as a panel setting (docs/qa/human-voice-panel-qa.md). The panel
# saves yt-mcp/studio-channels.json entry kit.voiceProfile = {human, mood, speed};
# it WINS over the static lib/brands.json voiceProfile. Mirror of
# studio/lib/human-voice.mjs resolveVoiceProfile — both are pinned to
# tests/fixtures/voice-profile-cases.json.
HUMAN_MOODS = ("calm", "warm", "excited", "serious", "tense", "sad", "playful")
HUMAN_SPEED_MIN, HUMAN_SPEED_MAX = 0.8, 1.2
KOKORO_ID_RE = re.compile(r"^[ab][fm]_[a-z]+$")
# Emotional voice (docs/qa/emotional-voice-qa.md): mirror of
# studio/lib/emotional-voice.mjs GPU_VOICE_MODELS ids + EXPRESSIONS. The doc
# lanes run the GPU engine; Shorts and the legacy doc narration here keep the
# Kokoro human voice (a ~5 min GPU setup per Short would waste the free quota).
GPU_MODELS = ("chatterbox-turbo",)
EXPRESSIONS = ("none", "light", "rich")


def _read_json(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _kit_settings(own):
    """{human, mood, speed} from a kit.voiceProfile value, or None when unreadable."""
    if not isinstance(own, dict) or not isinstance(own.get("human"), bool):
        return None
    mood = own.get("mood", "warm")
    if mood not in HUMAN_MOODS:
        return None
    speed = own.get("speed", 1)
    if isinstance(speed, bool) or not isinstance(speed, (int, float)) or speed != speed or speed in (float("inf"), float("-inf")):
        return None
    speed = round(min(HUMAN_SPEED_MAX, max(HUMAN_SPEED_MIN, speed)), 2)
    if speed == int(speed):
        speed = int(speed)
    out = {"human": own["human"], "mood": mood, "speed": speed}
    # the emotional keys ride along only when the value carries them
    if any(k in own for k in ("emotional", "expression", "model")):
        emotional = own.get("emotional", False)
        expression = own.get("expression", "none")
        model = own.get("model", GPU_MODELS[0])
        if not isinstance(emotional, bool) or expression not in EXPRESSIONS or model not in GPU_MODELS:
            return None
        out.update(emotional=emotional, expression=expression, model=model)
    return out


def voice_profile(slug=None, brands_path=None, registry_path=None):
    """The channel's human-voice profile from DATA (no-static-maps):
    1. the registry kit.voiceProfile (the panel) wins — human false = None (the
       normal voice chain); human true = {engine:'kokoro', voice: the channel
       voice, speed, mood} (None when that voice is not a Kokoro voice), plus
       emotional: {model, expression} when the emotional voice is on;
    2. otherwise lib/brands.json[slug].voiceProfile = {engine:'kokoro', voice, speed?, mood?}.
    None = today's engine chain, byte-identical (step 1 V4)."""
    slug = slug or os.environ.get("YT_VOICE_CHANNEL") or os.environ.get("SLUG") or ""
    if not slug:
        return None
    kits = _read_json(brands_path or os.path.join(ROOT, "lib", "brands.json"))
    kits = kits.get("brands", kits) if isinstance(kits, dict) else {}
    static_kit = kits.get(slug) if isinstance(kits.get(slug), dict) else {}
    reg = _read_json(registry_path or os.path.join(ROOT, "yt-mcp", "studio-channels.json"))
    channels = reg.get("channels") if isinstance(reg, dict) and isinstance(reg.get("channels"), list) else []
    entry = next((c for c in channels if isinstance(c, dict) and c.get("slug") == slug), None) or {}
    kit = entry.get("kit") if isinstance(entry.get("kit"), dict) else {}
    own = kit.get("voiceProfile")
    if isinstance(own, dict):
        if own.get("human") is False:
            return None
        settings = _kit_settings(own)
        if settings and settings["human"]:
            sp = static_kit.get("voiceProfile") if isinstance(static_kit.get("voiceProfile"), dict) else {}
            voice = next((str(v).strip() for v in (entry.get("voice"), kit.get("voice"), sp.get("voice"), static_kit.get("voice"))
                          if isinstance(v, str) and v.strip()), "")
            if not KOKORO_ID_RE.match(voice):
                return None
            prof = {"engine": "kokoro", "voice": voice, "speed": settings["speed"], "mood": settings["mood"]}
            if settings.get("emotional") is True:
                prof["emotional"] = {"model": settings["model"], "expression": settings["expression"]}
            return prof
    prof = static_kit.get("voiceProfile")
    if isinstance(prof, dict) and prof.get("engine") == "kokoro" and str(prof.get("voice") or "").strip():
        return prof
    return None


def try_human(text, mp3_path, prof, lane=None):
    """Step 1 V1/V2: the human-feel Kokoro path; returns the meta dict, or None after
    logging why (the caller then runs today's chain unchanged)."""
    try:
        if lane is None:
            sys.path.insert(0, os.path.join(ROOT, "explainer"))
            import voice_lines as lane
        tmp = mp3_path + ".human-tmp"
        try:
            words, ms, matched, total = lane.human_tts_to_mp3(
                text, prof["voice"], float(prof.get("speed") or 1.0), prof.get("mood"), mp3_path, tmp)
        finally:
            import shutil
            shutil.rmtree(tmp, ignore_errors=True)
        if not words:
            raise RuntimeError("no word timings")
        print(f"human voice: {prof['voice']} {ms / 1000:.1f}s, {matched}/{total} words heard", file=sys.stderr)
        return {"engine": "kokoro-human", "audio": mp3_path, "words": words,
                "duration": round(ms / 1000, 3), "voice": prof["voice"]}
    except Exception as e:
        print(f"human voice failed ({str(e)[:200]}); falling back to the legacy chain", file=sys.stderr)
        return None


def main():
    txt_path, mp3_path, words_path = sys.argv[1:4]
    with open(txt_path, encoding="utf-8") as f:
        text = " ".join(f.read().split())

    prof = voice_profile()
    if prof:
        meta = try_human(text, mp3_path, prof)
        if meta:
            with open(mp3_path + ".meta.json", "w", encoding="utf-8") as f:
                json.dump(meta, f)
            print("engine:" + meta["engine"])
            return

    meta = {"engine": "edge", "audio": mp3_path, "words": []}
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if key:
        try:
            openai_tts(text, mp3_path, key)
            words = openai_align(mp3_path, key)
            if words:
                meta = {"engine": "openai", "audio": mp3_path, "words": words}
        except (subprocess.CalledProcessError, json.JSONDecodeError, KeyError) as e:
            print(f"openai failed ({e}); trying kokoro", file=sys.stderr)
    if meta["engine"] == "edge":
        try:
            audio, words, duration = kokoro_tts(text, mp3_path)
            meta = {"engine": "kokoro", "audio": audio, "words": words,
                    "duration": round(duration, 3), "voice": KOKORO_VOICE}
        except Exception as e:
            print(f"kokoro failed ({e}); falling back to edge-tts", file=sys.stderr)
            edge_tts(text, mp3_path)

    if meta["engine"] == "edge":
        wp = mp3_path.rsplit(".", 1)[0] + ".words.json"
        with open(wp, encoding="utf-8") as f:
            meta["words"] = json.load(f)
        os.remove(wp)

    with open(mp3_path + ".meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f)
    print("engine:" + meta["engine"])


if __name__ == "__main__":
    main()
