# Spec + QA — Course template, phase C2: the course planner (2026-11-17)

Source: research/cloudxberry-course-format-audit-2026-11-17.md §6/§8; owner approved C1 and
"will create new channel when template created". C2 turns an OUTLINE into a render-ready paper
plan automatically. C3 (split render), C4 (thumbnail) and C5 (channel) follow later.

## The flow C2 delivers

```
outline.json (owner: topic, audience, world, modules → lectures, brand)
   │  longvideo/generate-course-plan.mjs  (script brain, 1 call per lecture, bounded re-asks)
   ▼
<slug>.plan.json  (paper style; scenes = lecture sections; say-lines + widget cues)
   │  owner reviews the plan JSON (the words they will ship)
   ▼  make-diagram-demo.mjs (unchanged: voice → cue resolve → render)
demo MP4
```

## Requirements (EARS)

- G1: THE GENERATOR SHALL make one script-brain call per lecture with: the course title,
  audience, world (cast/setting from outline data), the lecture title + point, the lecture
  rhythm (problem → analogy → worked example → "here's what to take away"), the widget
  vocabulary with slot rules, the anchor rules, and the module number/badge.
- G2: EVERY generated scene SHALL pass validatePlan plus course-level checks (C1 widget rules
  included). Failing lectures SHALL be re-asked with the named errors, bounded (default 3),
  then the generator SHALL fail loudly naming the lecture.
- G3: COURSE CHECKS SHALL enforce, per lecture scene: the lecture badge equals the lecture
  number (zero-padded); 6–16 lines; cue density ≥ half the lines; the final scene of the
  lecture contains a takeaway widget with ≥ 2 items and ≥ 2 tick cues; mood on every line.
- G4: THE OUTPUT PLAN SHALL be byte-compatible with make-diagram-demo input: slug, brand,
  title, style "paper", voice, course{modules, palette?}, scenes.
- G5: A plan generated from a fresh outline SHALL pass cue resolution against its own TTS
  (0 errors) and render locally.
- G6: World, palette and voice SHALL come from outline/brand DATA (no channel code).

## QA rows

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | G1 | prompt carries outline, world, rhythm, widgets, anchors, badge/module | automated | `node --test tests/course-plan-gen.test.mjs` |
| 2 | G3 | courseChecks: badge mismatch / short lecture / low density / missing takeaway+ticks named | automated | same |
| 3 | G2 | re-ask with errors, bounded, then loud failure | automated | same |
| 4 | G4 | assembled plan shape (style/voice/course/scenes) | automated | same |
| 5 | G5/G6 | live: fresh outline → generated plan (brain) → 0 resolve errors → local render → owner watches | automated + visual | `node longvideo/generate-course-plan.mjs …` then `make-diagram-demo` |

## Results (2026-11-17)

- Rows 1-4: PASS — `tests/course-plan-gen.test.mjs` 8/8 (prompt content incl. worked example +
  number-fields rule; courseChecks naming badge/module/length/density/takeaway/tick-spread;
  bounded re-ask with fed-back errors + loud failure naming the lecture; plan shape).
- Quality rules added after the first live runs (free model slips): tick cues must spread over
  distinct takeaway sentences; number fields must be integers (a clear "must be a NUMBER" error
  names the widget); prompt carries a compact worked-example answer (few-shot) — this took
  lecture convergence from 3 failed attempts (run 1: never converged) to 0.4 min for 2 lectures.
- Row 5: PASS — fresh outline `web-message-outline.json` (world: LAPPY/SHELF/DNS BOOK/POSTMAN) →
  brain plan in 0.4 min → 0 resolve errors → 99.9 s render (`web-message.mp4`, Ava Edge voice,
  −17.0 LUFS). Lecture 1 drives the roadmap through its 5 stops; lecture 2 ticks takeaways while
  the handshake stepper counts up. Owner review pending.
- Fixes made during the live runs: plan voice must use `edgeVoice` for Edge plans (builder now
  accepts a plan Edge voice); anchors must match the TTS engine's tokenization ("take away" is two
  words for Edge — the validator caught both); Kokoro fp32 can fail to LOAD under memory pressure
  ("bad allocation") → the voice lane smoke-tests at load and falls back to int8 automatically.
- Polish queue (C2.5, non-blockers): roadmap stop circles clip at the panel edges
  (preserveAspectRatio); two widgets can share overlapping slots; brain sometimes declares boxes
  it never fills.
