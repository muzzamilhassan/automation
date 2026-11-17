# Spec + QA — Course template, phase C1: `paper` look + teaching widgets (2026-11-17)

Source: research/cloudxberry-course-format-audit-2026-11-17.md §6/§8. Owner: "firstly create its
template, then we will see what to do". C1 = the visual system + one LOCAL demo lecture. The course
planner (C2), split render (C3), thumbnails (C4) and any channel (C5) come later, after owner review.
Everything is default-inert: plans without `style: "paper"` / `widgets` render exactly as before.

Originality rule: our own palette, type, icon set and running world (demo: the "DashBite"
food-delivery app). Nothing taken from the reference channel's identity.

## Requirements (EARS)

- P1: WHERE a plan sets `style: "paper"`, THE RENDERER SHALL draw a white page with a top-left headline
  (the scene title, *accent* words in the module colour) and a short underline bar. It SHALL show an
  optional lecture badge (`scene.badge`), the course progress pills (`plan.course.modules`, the
  current one filled), and the channel label as the logo slot.
- P2: THE MODULE COLOUR SHALL come from `scene.module` (1-based) cycling a fixed 6-colour paper
  palette. A plan can override it with `plan.course.palette`.
- W1: A scene MAY declare `widgets: [{ id, type, slot, ...props }]` with type ∈ boxes | stepper |
  code | chart | takeaway | roadmap, and slot ∈ center | left | right | top | bottom | full.
- W2: Widget cue verbs, each anchored to a spoken word like every other cue:
  `show(widget)` · `fill(widget, index, value, tone?)` · `mark(widget, index)` ·
  `step(widget, value?, text?, ok?)` · `line(widget, line, tone?)` · `plot(widget, series)` ·
  `tick(widget, index)` · `advance(widget, to)`.
- W3: IF a cue names an unknown widget, a verb the widget type does not support, or an index outside
  the widget's range, THEN validation SHALL name scene, line and cue (the same contract as nodes/edges).
- W4: Widgets are pure functions of the frame (seek-safe). A widget with no `show` cue appears at the
  scene start.
- D1: A hand-written demo lecture plan renders locally with the human voice lane: 0 unresolved cues,
  frames reviewed by the owner.

## QA rows

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | W1-W3 | widget declarations + verb/field/range validation | automated | `node --test tests/diagram-cues.test.mjs` |
| 2 | P1-P2, W4 | resolvePlan passes badge/module/widgets/course through | automated | same |
| 3 | D1 | demo lecture: resolve 0 errors, render OK | automated | `node longvideo/make-diagram-demo.mjs longvideo/diagram-demo/course-hashmap-lecture.plan.json` |
| 4 | P1-P2, W2 | frames: headline/accent/badge/pills; each widget visibly changes on its word | visual | contact sheet shown to the owner |
| 5 | regression | MR tile + glow demos unchanged; full suite green | automated | `npm test` |

## Results (2026-11-17)

- Rows 1-2: PASS — 4 new tests (valid scene, defect naming, declaration checks, pass-through). Suite 32/32 for cue+plan files.
- Row 3: PASS — `course-hashmap-lecture.plan.json` (original content: the DashBite world, our own palette/cast) → 29 lines, af_heart human voice (kokoro), 37 cues resolved, 0 errors, 116 s rendered, −17.1 LUFS.
- Row 4: PASS (pending owner eyes) — frame sheet `longvideo/out/diagram-demo/course-hashmap-lecture-frames.png`; all six widgets fire on their words; badges, module colour, progress pills, underline bar, stamps, collision card all present.
- Row 5: PASS — `npm test` 1316/1316; pytest 115 passed (3 pre-existing skips). MR tile still at frame 705 and the glow dry-run frame render byte-consistent with the pre-C1 look (regression stills checked).

Defects found by the first render, fixed: 4 of 6 widget panels got `width: 0` from the slot-panel
helper (stepper/code/chart/roadmap invisible) → `innerPanel()` fills the slot; paper headline lost
word spacing → flex-gap; the dark vignette still overlaid paper → disabled; paper stamp collided
with the top slot → moved to y320; demo scene-3 takeaway (center) collided with the chart (right)
→ plan slot change; two unspoken anchors ("catch", "step" #2) caught by the validator before render.

Known polish for later (not blockers): chart label pill font could shrink for very long labels;
takeaway rows wrap to 2 lines when items are long; module colours are fixed 6 — a course can
override via `course.palette`.
