# Spec — `market-files` P4: episode assembly (2026-11-10)

Source: research/paper-billions-cartoon-market-lane-2026-11-10.md P4. Owner
approved ("start P4"). P1 scenes + P2 script + P3 data exist; P4 turns a
staged script into a RENDERED, watchable episode — the demo video the owner
will review when all phases complete (owner directive, recorded in memory).

## EARS requirements

- R1: THE assembler SHALL re-run the Node validator on the staged script
  before any spend (a corrupted stage refuses loudly, non-zero exit).
- R2: TTS SHALL run one edge_batch per voice (voiceGroups), all with REAL
  Edge WordBoundary timings; the merged duration map SHALL cover every beat
  and each beat's audio SHALL live in its voice's own directory.
- R3: beat timings SHALL come from the shared timeBeats (the storybook
  lane's pacing: lead-in, spoken+600/3000 floor, divider/end holds, tail);
  every beat gets ms/startMs/audio/words; totalMs covers all beats.
- R4: THE doc SHALL be DocV2 with style 'market-files', chapter-count
  progress parts, and a music key from the channel's APPROVED pool when a
  track matches (silent bed stays legal — fail-soft like the storybook
  lane).
- R5: THE render SHALL use the lane's invocation (browser ensure, DocV2,
  concurrency 2 with a concurrency-1 retry) and produce episode.mp4 +
  poster.jpg + episode.srt under content/market-scripts/render/<id>/.
- R6: THE SRT SHALL be srtFromBeats (the same cues the storybook lane and
  the clips lane read).
- R7: the assembler SHALL print where the demo video lives — the owner's
  watch-and-decide gate.
