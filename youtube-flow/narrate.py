# YouTube Short narration with a HUMAN feel + exact word timestamps.
#
# Engine chain:
#   1. OpenAI gpt-4o-mini-tts (voice "onyx" + narrator instructions) — human-
#      sounding delivery; word timings recovered by whisper-1 word-level
#      alignment (both cost ~$0.02/min of audio).
#   2. Fallback: Edge TTS (free) with native WordBoundary events.
#
# Usage: python narrate.py <script.txt> <out.mp3> <out.words.json>
# Output JSON: [{"w": "word", "s": 0.42, "d": 0.31}, ...]
import asyncio
import json
import os
import re
import subprocess
import sys

VOICE = os.environ.get("YT_TTS_VOICE", "onyx")
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


def openai_align(mp3_path, words_path, key):
    r = run_curl([
        "https://api.openai.com/v1/audio/transcriptions",
        "-H", f"Authorization: Bearer {key}",
        "-F", f"file=@{mp3_path}",
        "-F", "model=whisper-1",
        "-F", "response_format=verbose_json",
        "-F", "timestamp_granularities[]=word",
    ])
    data = json.loads(r.stdout)
    words = [{"w": w["word"].strip(), "s": round(float(w["start"]), 3),
              "d": round(float(w["end"]) - float(w["start"]), 3)}
             for w in data.get("words", []) if w.get("word", "").strip()]
    with open(words_path, "w", encoding="utf-8") as f:
        json.dump(words, f)
    return words


def edge_tts(text, mp3_path, words_path):
    asyncio.run(_edge(text, mp3_path, words_path))


async def _edge(text, mp3_path, words_path):
    import edge_tts

    words = []
    communicate = edge_tts.Communicate(text, "en-US-ChristopherNeural",
                                       rate="+2%", boundary="WordBoundary")
    with open(mp3_path, "wb") as f:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                words.append({"w": chunk["text"], "s": round(chunk["offset"] / 1e7, 3),
                              "d": round(chunk["duration"] / 1e7, 3)})
    with open(words_path, "w", encoding="utf-8") as f:
        json.dump(words, f)


def main():
    txt_path, mp3_path, words_path = sys.argv[1:4]
    with open(txt_path, encoding="utf-8") as f:
        text = " ".join(f.read().split())

    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if key:
        try:
            openai_tts(text, mp3_path, key)
            words = openai_align(mp3_path, words_path, key)
            if words:
                print("engine:openai")
                return
        except (subprocess.CalledProcessError, json.JSONDecodeError, KeyError) as e:
            print(f"openai failed ({e}); falling back to edge-tts", file=sys.stderr)
    edge_tts(text, mp3_path, words_path)
    print("engine:edge")


if __name__ == "__main__":
    main()
