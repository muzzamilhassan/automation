# Spec + QA — Step 1: Money Rulebook human voice + "Money Flow" diagram template (2026-11-17)

Source: owner approved step 1 on 2026-11-17 ("yes start it with step 1"). Plan: research/
motion-storytelling-templates-2026-11-16.md + docs/qa/living-diagram-demo-qa.md (demos).
Rollout rule: MR first (money-rulebook-pilot-directive). Everything is default-inert:
channels without a `voiceProfile` / a `diagram` template behave byte-identically.

## Incident that motivates the voice half

MR episode oXAT8NGLV4Q (published 2026-11-16 22:30 UTC) shipped with **8 silent beats**
(storybook lane, job 133449579110): Edge TTS answered "No audio was received" 3× on 8 of
48 beats, including the opening hook. edge_batch.py inserts an 8 s SILENT PLACEHOLDER and
continues. The human voice lane runs Kokoro locally on the runner (no network TTS call)
and FAILS LOUDLY instead of shipping silence.

## Requirements (EARS)

Voice
- V1: WHERE a channel's brand kit has `voiceProfile` {engine:'kokoro', voice, speed?, style?},
  narrate.py SHALL synthesise sentence by sentence with that Kokoro voice, insert
  punctuation-aware pauses, loudness-normalise, and return EXACT word timings (forced
  alignment of the known words), in the same meta format callers read today.
- V2: IF the human path fails for any reason, narrate.py SHALL fall back to today's
  engine chain unchanged and log why.
- V3: WHERE the kit has `voiceProfile`, the storybook lane SHALL use the human voice
  lane (same file layout as edge_batch.py) instead of Edge; a line that fails SHALL abort
  the render. A silent placeholder never ships.
- V4: Channels without `voiceProfile` SHALL be byte-identical (no behaviour change).

Diagram template
- D1: `story_structure.doc_render: 'diagram'` SHALL route the doc lane to the Living
  Diagram renderer; `docRenderOf` returns 'diagram'.
- D2: THE PLANNER SHALL split the APPROVED script into sentences itself; the LLM only
  returns visuals (nodes/edges/cues/mood/pause) per sentence NUMBER. The spoken text is
  always the approved text verbatim.
- D3: Every scene plan SHALL pass validatePlan + "anchor word occurs in its sentence"
  + a cue-density floor; failing scenes are re-asked (bounded), with the errors fed back.
- D4: IF planning, voice, cue resolution or render fails, THE LANE SHALL alert (ntfy) and
  fall back to the storybook look for that episode. The upload is never lost to the new
  lane.
- D5: The episode SHALL carry the channel's approved music bed (ducked under the voice),
  episode.srt from the real word timings, and chapter timestamps from scene starts. Then
  shipEpisode runs unchanged.
- D6: A "money-flow-diagram" template draft SHALL pass validateDraft and be staged in
  the Drafts Inbox (owner approves in the panel; assignment stays an owner action).

## QA rows

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | V1 | sentence split + pause rules + alignment mapping | automated | `pytest youtube-flow/tests/test_voice_human.py` |
| 2 | V1 | real MR text → kokoro-human meta: words == script words, monotonic times, mp3 plays, -16 LUFS ±2 | automated | local run, printed check |
| 3 | V2 | broken Kokoro dir → falls back to the old chain, engine != kokoro-human | automated | pytest (monkeypatch) |
| 4 | V3 | storybook voice via profile writes beat-XX.mp3 + tts-durations.json; failing line exits non-zero | automated | pytest / local run |
| 5 | V4 | no profile → narrate.py path unchanged | automated | pytest |
| 6 | D1 | docRenderOf diagram/storybook/other | automated | `node --test tests/doc-storybook.test.mjs tests/diagram-plan.test.mjs` |
| 7 | D2 | assembled plan `say` text == approved sentences (LLM text ignored) | automated | tests/diagram-plan.test.mjs |
| 8 | D3 | bad scene (unknown node, absent anchor, too few cues) re-asked with errors; exhausted → throws | automated | same |
| 9 | D4 | renderDiagramVisuals throws → storybook fallback chosen + alert | automated | stubbed test |
| 10 | D5 | real MR script → plan (live LLM) → voice → render: mp4 + srt + chapters; owner watches | visual | local dry-run harness, contact sheet |
| 11 | D6 | validateDraft(money-flow-diagram) ok | automated | node one-liner / test |
| 12 | all | full root suite + pytest green | automated | `npm test`, `pytest` |

## Results (2026-11-17, local)

| # | Result | Evidence |
|---|---|---|
| 1, 3, 5 | PASS | `pytest services/ai/tests/test_voice_human.py`: 13 passed (split, pauses, speed, mapping, whole-pass, per-sentence fallback, weak fails loud, profile, fallback) |
| 2 | PASS | real MR text: `engine:kokoro-human`, 40/40 words heard, -16.6 LUFS, 18.7 s audio in 24 s (fp32 Kokoro + tiny.en single pass) |
| 4 | PASS | storybook pin tests (69 → 71) incl. the V3 branch; `--layout edge_batch` writes beat-XX.mp3 + tts-durations.json |
| 6–9, 11 | PASS | `tests/diagram-plan.test.mjs` 15/15 (D1 render key, D2 verbatim, D3 repair/re-ask/backoff, D6 validateDraft) |
| 10 | PASS (owner to watch) | real approved MR script "The Silent Money Leaks That Destroy Families" (9 ch, 1,139 words) → 11 scenes, 107-135 cues, 8.7 min, bm_daniel human voice, approved music, chapters; NOTHING uploaded |
| 12 | PASS | `npm test` 1306/1306; `pytest services/ai/tests` 115 passed, 3 skipped (pre-existing) |

Findings fixed during the dry runs:
- free LLM slips (5 nodes per column, counter without `to`, undeclared node, anchor not in its
  sentence): `repairScene` drops only the broken pieces, reflows columns, and re-asks only for
  scene-level gaps;
- clutter (15-25 boxes, old boxes piling up through `keep`): unused nodes dropped, at most 7 per
  scene (most-used first), ranks packed, and the camera clamped to the canvas;
- floating icons: a flow scene needs at least one edge, and labels name things (amounts go in values);
- Groq 429 / Gemini 503 bursts: a 6 s gap between scenes and a 20/40/60 s backoff when no provider
  answers;
- whisper base.en heard 10/40 on a whole-file pass, so tiny.en is the default, with a per-sentence
  fallback below 80% and a loud failure below 60%.

Timing (laptop, 8 threads): plan 2.3-2.4 min · voice 3.4 min · render 21.8 min for 8.7 min of
video. **CI risk:** the runner has 2 vCPU and the produce job has a 90 min timeout. The first CI run
must be a measured test run before MR's real doc day uses it.

## Out of scope (later steps)
Other channels' profiles, ai-observer reactivation, Chatterbox/Kaggle, burned-in captions
on diagram episodes.
