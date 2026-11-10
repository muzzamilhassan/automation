# Spec + QA — `market-files` P4: episode assembly (2026-11-10)

Source: docs/superpowers/specs/2026-11-10-market-files-p4-assembly-spec.md.
Plain English: P4 is the movie studio. It takes the finished script (P2) and
the scenes (P1), gives every sentence a real voice with word-by-word
timings, lays the scenes out on a timeline, adds approved music, and
renders an actual MP4 you can watch — with captions and a poster frame.
This produces the demo video the owner reviews before anything goes live.

## Requirements (EARS)

- R1: re-validate the staged script before any spend; refuse loudly.
- R2: one edge_batch per voice; merged durations cover every beat; audio
  per voice directory.
- R3: timings via the shared timeBeats; totalMs covers all beats.
- R4: DocV2 + style 'market-files' + progressParts + approved music
  (fail-soft).
- R5: render via the lane invocation; episode.mp4 + poster.jpg +
  episode.srt under content/market-scripts/render/<id>/.
- R6: SRT = srtFromBeats (shared cues).
- R7: the assembler prints the demo path.

## QA rows

| # | Req | Check | Type | Result |
|---|---|---|---|---|
| 1 | R1 | invalid script → refuse pre-spend (validate call pins the gate) | A | PASS — code pin scripts/market-render.mjs: validateMarketScript before any TTS/render spend, exit 1 with the named errors (the live drop in P3's E2E proved the same gate) |
| 2 | R2 TTS | two voice groups → two edge_batch runs; merged durations cover 100% of beats; audio path matches the beat's voice dir | A | PASS — live: en-US-AndrewNeural 21 beats + en-US-BrianNeural 4 beats, two separate lf-audio dirs, merged duration map built the full 137.5s timeline; per-beat resume cache proven (second run: all "cached") |
| 3 | R3 timings | beats carry ms/startMs/audio/words; totalMs ≥ last beat end; karaoke words non-empty on spoken beats | A | PASS — timeline log 137.5s/25 beats; SRT cues exist (155 lines) which only build from real per-beat words |
| 4 | R4 doc | doc json: style=market-files, progressParts=chapter count, music key set (or consciously absent) | A | PASS — doc carries style market-files, progressParts from the chapter count, music "Limit 70" (approved pool, fail-soft path exercised when the first attempt crashed on a wrong pool path — fixed to yt-brands root) |
| 5 | R5 render | episode.mp4 exists, size sane, duration ≈ totalMs (ffprobe); poster + srt present | A | PASS — ffprobe 139.05s vs timeline 137.5s (+1.5s tail) ✓; 39.4 MB; poster.jpg + episode.srt in content/market-scripts/render/why-stock-market-crashed-2026-11-05/ |
| 6 | R6 SRT | cue count > 0; first cue text comes from beat 0's spoken words | A | PASS — 155 lines; cue 1 = "The market just imploded 4% of the S&P" (beat 0's words) |
| 7 | R7 E2E | the staged Nov-5 script renders end-to-end; the demo path is printed | E2E | PASS — three render rounds; the frame review caught THREE real bugs, all fixed and re-verified: (1) split card rendered empty — the card read b.headline but script beats carry only text → falls back to text; (2) crash stat rendered as a GREEN CONFETTI PARTY — the word "high" ("below its recent high") falsely derived party + direction-less beats didn't inherit the episode mood → "high" removed from the party lexicon (test suite re-verified 14/14) + the assembler now enriches direction-less beats with the episode's dominant EXPLICIT mood; (3) the stat label collided with karaoke captions → label raised above the caption band. Final frames verified: dark-blue boards with real numbers (−4.4%, −5.9%, −3.4%, 24,315), red declining monitors, captions clean |
