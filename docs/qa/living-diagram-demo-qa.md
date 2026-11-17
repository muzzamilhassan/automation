# Spec + QA — Living Diagram, local demo (Lane A, phase A1-demo) (2026-11-16)

Source: research/motion-storytelling-templates-2026-11-16.md §2. Owner approved
2026-11-16: "start with recommendation, make its demo locally and show me here
instead of moving it to live". $0 per video. Remotion only (HyperFrames frozen, not
deleted).

Scope: a LOCAL demo only. One Money Rulebook episode rendered on this machine.
Nothing is wired into channel-pipeline, the autopilot, the template registry or
DocV2. Every file is new; no existing file is edited.

## The idea in one line

The narration *drives* one persistent diagram: a plan lists what is on stage
(nodes, edges per scene) and, per spoken line, which **word** triggers which
change (`{"on": "rent", "do": "flow", "edge": "c-rent"}`). A fixed renderer
animates it on that word's real TTS timestamp.

## Requirements (EARS)

- R1: THE PLANNER SHALL resolve every cue's anchor word to the real Edge-TTS
  WordBoundary time of that word in that line (nth occurrence supported).
- R2: IF a cue's anchor word is not spoken in its line, OR it names an unknown
  verb, node or edge, OR it is missing a required field, THEN THE PLANNER SHALL
  reject the plan with a readable error naming the scene, line and cue. No video is
  rendered from an invalid plan.
- R3: THE LAYOUT SHALL be computed from `rank` (column) and order (row) only.
  Nodes never overlap and stay inside the 1920×1080 safe area. The plan never
  carries pixel positions.
- R4: WHEN a node appears in consecutive scenes with `keep: true`, THE RENDERER
  SHALL move it smoothly from its old position to its new one (no cut).
- R5: THE RENDERER SHALL be a pure function of the frame (seek-safe): rendering
  frame N alone gives the same image as reaching it by playing.
- R6: Brand colours and label SHALL come from `lib/brands.json` (no hardcoded
  per-channel values; no-static-maps rule).
- R7: THE DEMO SHALL NOT edit any existing file or touch the live pipeline.

## Verb vocabulary (v1)

appear(node) · flow(edge, label?, forMs?) · block(edge) · counter(node, from,
to, prefix?) · tone(node, good|bad|neutral) · fail(node) · stamp(text with
*accent* words) · focus(node, zoom?) · wide

## QA rows

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | R1 | anchors resolve to the right word time, nth occurrence, punctuation/$/commas ignored | automated | `node --test tests/diagram-cues.test.mjs` |
| 2 | R2 | unknown node / edge / verb / unspoken anchor / missing field each produce a named error | automated | same |
| 3 | R3 | layout: no two nodes closer than one tile; all inside the safe area; deterministic | automated | same |
| 4 | R1 | the real demo plan resolves with 0 errors against the real TTS output | automated | `node longvideo/make-diagram-demo.mjs` prints `0 errors` |
| 5 | R4/R5 | rendered MP4 plays; frames sampled at cue times show the change on the spoken word; the reorder in scene 2 is a glide, not a cut | visual | contact sheet of the render, shown to the owner |
| 6 | R6 | MR green accent and dark bg are visible; changing brands.json values would change them (no literal in the renderer) | automated + visual | grep renderer for hex literals of MR colours = 0 |
| 7 | R7 | `git status` shows only new files from this lane | automated | `git status --short` |

## v2 — tech look + human voice (owner, 2026-11-16)

Owner asks: a tech-channel version modelled on Visualcoders (studied: 5 top videos,
all 0 hard cuts) and a voice that feels human (emotion, laughs, sighs, pauses).
Production must run with the laptop OFF (GitHub Actions), so the local Space/CPU
runs here are demo-only.

- R8: THE RENDERER SHALL offer a `glow` look (duotone glowing icons, marching dashed
  curves, category colours, burst floods, badges, centred statements, side cards,
  hub layout) WHILE `tile` stays the default (MR demo unchanged).
- R9: THE VOICE LANE SHALL take per-line `mood` and `pauseMs`, and Chatterbox
  paralinguistic tags (`[sigh] [chuckle] [gasp] [laugh]`) inside `say`. Tags are
  never shown or used as anchors.
- R10: WHEN an engine has no native word timings (Chatterbox, Kokoro), THE LANE
  SHALL align the KNOWN script words onto faster-whisper timestamps (difflib +
  interpolation), so every anchor still resolves.
- R11: Engine failures (Edge "No audio", Space quota) SHALL fail loudly after retries.
  No silent placeholder reaches a render.

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 8 | R8 | 6 glow frames: flood, crash, statement, 429 card, bucket burst, hub | visual | stills sheet |
| 9 | R9 | tags removed from words; moods change edge rate/pitch | automated | voice-durations.json words contain no `[` |
| 10 | R10 | Chatterbox chapter: 14 cues resolve, 0 errors | automated | builder output |
| 11 | R11 | Space quota exhaustion stops the run with the quota message | automated | observed 2026-11-16 (line 07) |

## Voice benchmark (2026-11-16, local, laptop 8 threads, torch 2.15 CPU)

| Engine | Speed | Quality finding |
|---|---|---|
| Chatterbox-Turbo via HF Space (ZeroGPU) | ~15 s per line | all words spoken; free quota ran out after 7 lines |
| Chatterbox-**Nano** local CPU | x0.33 realtime (68 s audio in 206 s) | **dropped words on 7/21 lines** (e.g. 6 of 14 words heard) → rejected |
| Edge Ava/Andrew Multilingual | ~6 s per line (network) | all words, real WordBoundary timings; moods via rate/pitch only |

Windows gotchas fixed in the lane: an MP3 reference crashes chatterbox natively
(0xC0000005), so we pass a 24 kHz WAV. `norm_loudness=True` feeds float64 to the
tokenizer, so it is disabled (our ref is pre-normalised). torchaudio>=2.9 save
needs torchcodec, so we write with soundfile. PyPI chatterbox-tts 0.1.7 lacks
`nano=`, so it is installed from GitHub master. Helper start-up crashes are retried
with resume.

Laptop-off production candidates for the emotional voice: Turbo on a Kaggle GPU
kernel (about 30 free GPU h/week, API `enable_gpu`) driven from Actions. GitHub
Actions CPU (2 vCPU) would be about x0.1 realtime, too slow.

## Regression

- Full root suite unchanged apart from the new test file (`npm test`).
