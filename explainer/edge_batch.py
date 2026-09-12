# Batch Edge-TTS synthesis for the explainer pipeline.
# Input:  beats JSON path  [{ "i": int, "text": str }, ...]
# Output: durations JSON   [{ "i": int, "ms": float, "words": [{"s","d","w"}] }]
# Audio written next to the beats json as audio/beat-XX.mp3
import asyncio
import json
import os
import sys

VOICE = os.environ.get("EXPLAINER_VOICE", "en-US-AndrewNeural")
RATE = os.environ.get("EXPLAINER_RATE", "-2%")


async def synth_one(edge_tts, text, mp3_path):
    words = []
    for attempt in range(3):
        try:
            communicate = edge_tts.Communicate(text, VOICE, rate=RATE, boundary="WordBoundary")
            with open(mp3_path, "wb") as f:
                async for chunk in communicate.stream():
                    if chunk["type"] == "audio":
                        f.write(chunk["data"])
                    elif chunk["type"] == "WordBoundary":
                        words.append({"s": chunk["offset"] / 1e7,
                                      "d": chunk["duration"] / 1e7,
                                      "w": chunk["text"]})
            return words
        except Exception as e:
            if attempt == 2:
                raise
            print(f"  [tts] retry {attempt + 1}: {str(e)[:100]}", flush=True)
            await asyncio.sleep(2 * (attempt + 1))
    return words


async def main():
    import edge_tts

    beats_path = sys.argv[1]
    with open(beats_path, encoding="utf-8") as f:
        beats = json.load(f)

    out_dir = os.path.join(os.path.dirname(os.path.abspath(beats_path)), "audio")
    os.makedirs(out_dir, exist_ok=True)

    results = []
    for b in beats:
        mp3 = os.path.join(out_dir, f"beat-{b['i']:02d}.mp3")
        words = await synth_one(edge_tts, b["text"], mp3)
        dur = (words[-1]["s"] + words[-1]["d"]) if words else 3.0
        # real file can be slightly longer than last word boundary — probe it
        try:
            from mutagen.mp3 import MP3  # noqa
        except ImportError:
            pass
        results.append({"i": b["i"], "ms": round(dur * 1000), "words": words})
        print(f"  [tts] beat {b['i']:02d}: {len(words)} words, {dur:.1f}s", flush=True)

    with open(os.path.join(os.path.dirname(os.path.abspath(beats_path)), "tts-durations.json"), "w", encoding="utf-8") as f:
        json.dump(results, f)
    print("[tts] all beats synthesized", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
