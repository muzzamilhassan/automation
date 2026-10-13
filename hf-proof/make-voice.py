# Phase-1 proof: synthesize one mp3 per beat + durations.json
import asyncio, json, os, subprocess, sys

VOICE = os.environ.get("HF_VOICE", "en-US-AndrewNeural")
RATE = os.environ.get("HF_RATE", "-4%")
HERE = os.path.dirname(os.path.abspath(__file__))
FFPROBE = os.environ.get("HF_FFPROBE", "ffprobe")

BEATS = [
    "The rich don't work for money.",
    "They buy time, and time buys everything else.",
    "One rule. No noise. Just quiet, compounding wealth.",
]

async def synth(edge_tts, text, path):
    for attempt in range(5):
        try:
            communicate = edge_tts.Communicate(text, VOICE, rate=RATE)
            with open(path, "wb") as f:
                async for chunk in communicate.stream():
                    if chunk["type"] == "audio":
                        f.write(chunk["data"])
            if os.path.getsize(path) > 1000:
                return
        except Exception as e:
            print(f"  retry {attempt + 1}: {e}")
            await asyncio.sleep(2 + attempt * 2)
    raise RuntimeError(f"TTS failed after retries: {text[:40]}")

async def main():
    import edge_tts
    out = []
    t = 0.0
    for i, text in enumerate(BEATS):
        p = os.path.join(HERE, "voice", f"beat-{i:02d}.mp3")
        await synth(edge_tts, text, p)
        r = subprocess.run([FFPROBE, "-v", "quiet", "-show_entries", "format=duration",
                            "-of", "csv=p=0", p], capture_output=True, text=True)
        d = float(r.stdout.strip())
        out.append({"i": i, "text": text, "start": round(t, 3), "dur": round(d, 3)})
        t += d + 0.55  # beat gap
    total = round(t, 3)
    json.dump({"beats": out, "total": total}, open(os.path.join(HERE, "voice", "durations.json"), "w"), indent=1)
    print("total", total, "s across", len(out), "beats")

asyncio.run(main())
