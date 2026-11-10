# Spec + QA — `market-files` P2: the script brain (2026-11-10)

Source: docs/superpowers/specs/2026-11-10-market-files-p2-script-brain-spec.md.
Plain English: P1 drew the cartoon scenes. P2 teaches the bot to WRITE the
story — you give it a topic and a sheet of real facts/numbers, and it writes
a Paper-Billions-style episode (cold open, chapters, minute-by-minute
sequences, little dialogue jokes) as structured data our renderer can film.
It is never allowed to invent numbers: only the ones on your fact sheet.

## Requirements (EARS)

- R1: /bot/script is key-gated (503 without GROQ_API_KEY); no fallback.
- R2: numbers come ONLY from the operator's fact sheet; the review node
  lists suspect numbers.
- R3: staged scripts pass the Node validator first; failures drop loudly.
- R4: schema = {version, script_id, topic, voices{narrator, dialogue},
  beats[{layout, text, scene?, dialogue?}]}, all enums locked to the P1
  family's vocabulary.
- R5: buildMarketBeats converts a validated script to DocV2-ready beats
  deterministically, with per-beat voice (narrator vs dialogue).
- R6: voiceGroups returns {voice: [beatIndex,...]} for P4's per-voice TTS.
- R7: the drafting prompt embeds the Paper Billions style guide + the
  fact-discipline rule.
- R8: scripts stage to content/market-scripts/<id>.json (status draft) —
  isolation from registry/gallery/drafts.

## QA rows

| # | Req | Check | Type | Result |
|---|---|---|---|---|
| 1 | R4/R5 builder | validated script → beats with correct layouts/scene/voice per beat; same script twice → identical beats | A | PASS — tests/market-script.test.mjs 7/7 (2026-11-10): deterministic deepEqual across builds, sequential indices, narrator/dialogue voice per beat, scene verbatim, dialogue-line-as-text fallback, ticks/lines/big ride-through |
| 2 | R6 voiceGroups | narrator beats vs dialogue beats grouped exactly; every index appears once | A | PASS — the R6 test: Andrew×7 indices + Emma×1 in the fixture; flat().sort() deepEquals 0..n-1 (no index lost or doubled) |
| 3 | R3 gate | invalid script (bad layout, off-pool voice, dialogue missing speaker, empty text) → ok:false with named errors; a valid script passes | A | PASS — R3a/R3b/R3c: off-pool layout/voices/location/mood, missing speaker, empty text, hero/end structure, stat.big, timeline ticks 1-6, process lines 2-6 — every failure NAMED with the beat number |
| 4 | R1 key gate | /bot/script returns 503 without the key (code pin + live observation) | A | PASS (code pin) — services/ai/app.py /bot/script: `if not api_key: return JSONResponse(503, {"error": "bot key missing…"})` before any graph build — the exact proven /bot/draft pattern (row 5 of template-bot-qa) |
| 5 | R2 fact discipline | graph review lists numbers absent from the fact sheet (fake-model graph test) | A | PASS — test_graph_flags_off_fact_numbers_in_review: a script saying "2,500 points" (absent from FACTS) puts `2,500` into the reviewer prompt; the live run's numbers were ALL fact-sheet members ($2T, $5.4T, $700B, $63B, $400M, $175B→$170B, $358M, 65%, 4%…) |
| 6 | R7 style prompt | the draft prompt contains the style rules + the fact-discipline rule (graph test) | A | PASS — test_draft_prompt_carries_style_and_fact_rules: prompts[0] carries Cold-open hook / MINUTE-BY-MINUTE / Dialogue asides / "ONLY legal source of numbers" + the fact-sheet head |
| 7 | sidecar shape | shape_script normalizes enums/voices/slug and passes the Node validator afterwards (pytest + node cross-check) | A | PASS — services/ai/tests/test_script_graph.py 7/7 (slugify, off-pool voice→Andrew, dialogue-voice collapse fallback, unsupported layout→split, off-pool scene dropped, shape gate loops repair on structure failures and ships the repaired script); the LIVE shaped script then passed validateMarketScript (row 9) |
| 8 | R8 isolation | content/market-scripts is read by nothing else (repo grep); registry/gallery/sync 0 hits | A | PASS — studio/ + lib/ greps: 0 hits for "market-scripts"; the only writer/reader is scripts/market-bot.mjs (staging) |
| 9 | E2E | real Groq run: topic + fact sheet → styled script passes the Node gate → staged | E2E | PASS — 2026-11-10 live: gpt-oss-120b via /bot/script, topic "Why the stock market just crashed" + the 2,816-char fact sheet → **35 beats, attempts 2** (the shape gate looped repair once), Node gate PASSED, staged to content/market-scripts/why-stock-market-crashed-nov-5-2026.json (status draft). Two voices (Andrew×28 / Emma×7), 6 named characters, 26/35 beats carry scene directions, minute-by-minute timeline + analogies + kitchen-table ending all present. Free-tier hardening added during the run: high max_tokens (16k), a JSON repair pass + one strict re-ask in draft, and 429 "try again in Ns" honored up to twice (the 8k-TPM bucket crossed mid-graph on the repair call) |

## Known script-quality debt (tuning, not gates — pilot will tune)

- The live script is ~445 spoken words (≈3 min TTS) against a 14-min ask —
  the model writes compactly; the target-length enforcement is a review
  criterion to sharpen (beat-count floor per minute) in the pilot tuning.
- The review lets "fact-adjacent color" through (e.g. a "small-business
  owner in Ohio" beat whose character is narrative color, not a fact-sheet
  person). Numbers are gated; PERSONS should be too — add to the review
  prompt in pilot tuning.
- One beat title ("Why the AI bubble popped") leans beyond the facts'
  actual conclusion ("not yet") — editorial-accuracy criterion for the
  reviewer, same tuning pass.
