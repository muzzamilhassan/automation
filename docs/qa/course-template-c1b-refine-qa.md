# Spec + QA — Course template C1b: refine to the reference grammar + add to the template section (2026-11-20)

Owner (2026-11-20): "the template created was not similar — look again, refine it, and add it to the
template section". Fresh reference frames (16 × 720p from LJ_HY0AKZnM) compared side by side with ours.
Originality rule unchanged: same lesson GRAMMAR, our own palette, logo, cast and world.

## Gap found (reference vs C1)

| # | Reference | C1 (ours) |
|---|---|---|
| 1 | headline changes every 10–20 s (one idea per beat) | one headline per lecture |
| 2 | elements sit naked on the page, centred, large | every widget boxed in a panel in a fixed slot; big empty areas |
| 3 | one focal visual per beat, stacked centrally (e.g. box row, then LEFT card + check card) | 3–4 panels at once in corners |
| 4 | pure white page | cream page |
| 5 | filled box = solid colour + white digit; empty = outline; orange pointer; ✓/✗ circle in a note card; small dark logo square | text-coloured fills, no pointer, panel stepper, letter-spaced label |

## Requirements (EARS)

- R1: WHERE style is "paper", THE PAGE SHALL be pure white, and widgets SHALL render without panels
  (except code, which is a window by nature), auto-laid-out: rows stacked and centred in the stage;
  a consecutive left+right pair shares one row. Explicit pixel slots are no longer needed.
- R2: THE BOXES widget SHALL show tag pills above (labels), outlined empty cells, solid accent cells
  for `tone: good`, solid red for `bad`, ink digits for plain fills, and an orange pointer under the
  marked cell.
- R3: THE STEPPER SHALL render as a small labelled number card plus a note card with the check text
  and a ✓/✗ circle.
- R4: THE TAKEAWAY SHALL render as up to 3 horizontal cards (number, checkbox, text).
- R5: A lecture SHALL be planned as 2–5 BEATS (scenes); each beat has its own short headline with an
  accent word; only the first beat carries the lecture badge; the last beat is the takeaway.
- R6: THE DOC LANE SHALL plan "paper" templates with widgets + beats over the APPROVED chapter
  sentences (words verbatim, the same contract as the diagram lane); chapters become modules
  (colour + progress pills).
- R7: A registry template "lecture-notes-paper" SHALL be approved into the registry and carry a real
  preview (poster + MP4) in the template gallery.

## QA rows

| # | Req | Check | Type |
|---|---|---|---|
| 1 | R1-R4 | refined demo lecture rendered; side-by-side sheet vs reference frames | visual (owner) |
| 2 | R1 | tile + glow looks unchanged | visual regression stills |
| 3 | R5 | `tests/course-plan-gen.test.mjs`: beats assembled, badge on beat 1 only, takeaway in last beat | automated |
| 4 | R6 | `tests/diagram-plan.test.mjs`: paper planner splits approved sentences into beats verbatim | automated |
| 5 | R7 | validateDraft ok; registry loads; template_previews row present; gallery shows it | automated + visual |
| 6 | all | `npm test` + pytest green | automated |

## Results (2026-11-20)

- R1-R4 (row 1): refined demo `course-hashmap-lecture` — 9 beats of 9-23 s (headline changes at the
  reference pace), 29 lines, af_heart Kokoro (fp32 loaded), 44 cues resolved 0 errors, 120 s. Side-by-side
  3×3 sheet vs 9 reference frames: white page, beat headline + accent + underline, naked centred visuals,
  solid accent fills, orange pointer, counter card + ✓/✕ check card, horizontal takeaway cards. One
  scale pass (+15 % code/chart/takeaway/stepper) after the first sheet.
- R5 (row 3): `tests/course-plan-gen.test.mjs` 10/10 — beats assembled, badge on beat 1 only, last beat =
  takeaway with spread ticks, accent word required, 2-5 beats, 6-16 sentences.
- R6 (row 4): `lib/paper-plan.mjs` + `tests/paper-plan.test.mjs` 7/7 — approved sentences split into
  consecutive beats verbatim; gaps/overlaps/short coverage named; broken cues repaired; chapters → modules.
  `lib/diagram-episode.mjs` routes `doc_presentation.style: "paper"` to it (tile/glow unchanged).
- R7 (row 5): `lecture-notes-paper` validateDraft ok → approved via the keyed CLI path → registry loads
  (41) → `sync-template-registry` wrote it to Neon. Preview stored via `scripts/store-template-preview.mjs`.
- Row 6: `npm test` 1776/1777 — the one failure is T4b reportChannels (pre-existing, unrelated); pytest 116.
