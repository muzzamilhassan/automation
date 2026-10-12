# 🎵 Own Music Library — "Quarry Studio Originals"

Your own background music, generated with **ACE-Step (Apache 2.0)** — claim-proof on YouTube, no attribution, monetization-safe. Full research: `research/own-music-generation-research-2026-10-11.md`.

## How it works

1. **Generate (one time, ~90 min):** Open `colab/OwnMusicBatch.ipynb` in Google Colab (free T4 GPU) → Runtime → Change runtime type → T4 → run all cells. You get 48 mood-tagged instrumental tracks.
2. **Upload:** Easiest = cell 6 in the notebook (paste a GitHub PAT with repo scope — it creates release `own-music-v1` and uploads everything). Manual alternative: download the zip, then
   ```bash
   cd own-music-library && gh release create own-music-v1 manifest.json calm/*.mp3 epic/*.mp3 driving/*.mp3 bright/*.mp3 luxury/*.mp3 dark/*.mp3 --title "Quarry Originals" --notes "Self-produced ACE-Step instrumentals (Apache 2.0)"
   ```
3. **Done.** The music engine checks the library automatically and always prefers YOUR tracks over Kevin MacLeod. Credits change to *"Quarry Studio Original (self-produced, royalty-free)"*.

## Files

- `manifest.json` — library manifest (tracks + moods). Lives as a release asset on `own-music-v1`.
- `colab/OwnMusicBatch.ipynb` — the generator notebook (48-track plan: calm/epic/driving/bright/luxury/dark).

## Engine behavior (music-engine.mjs)

- `pickMusicTrack` and `pickApprovedTrack` try the own library FIRST (mood-matched to the brand's feels), fall back to MacLeod only when the library is empty or a download fails.
- Kill switch: `OWN_MUSIC_DISABLE=1` env (or remove the release).
- Tracks cache into `.music-cache/` exactly like MacLeod downloads — no repeated downloads.

## Regenerate / extend

Rerun the notebook with a modified `MOOD_PLAN` (new seeds/tags) and re-run cell 6 — existing assets are skipped, new ones upload. Bump the release tag (own-music-v2) only if you want a clean re-upload.
