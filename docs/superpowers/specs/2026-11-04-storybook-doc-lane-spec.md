# Storybook doc-lane adapter — `doc_render: 'storybook'` (spec, 2026-11-04)

Owner verdict (research/storybook-doc-template-2026-11-04.md + C:\tmp\ref-shots): the
deepdive b-roll lane (full-bleed stock video + lower-thirds) is NOT the wanted look.
The wanted look is the editorial STORYBOOK style — and `DocV2`'s `vox` theme in
`explainer/remotion/longscenes2.tsx` already renders it (verified frame-by-frame
against the reference: cream paper + grain, red letterspaced kicker, dashed progress
track, ghost-numeral chapter dividers with hairline, alternating rounded photo cards
with serif excerpts, salmon-box karaoke captions with real word timings, yellow
marker hook sub on the hero). So this is an ADAPTER, not a new renderer: the doc
lane's script/chapters feed the existing DocV2 engine when — and only when — the
assigned template's DATA asks for it.

## Scope

IN: the template DATA key + presentation block; pure lib helpers; the yt-deepdive
visual-layer branch + a verbatim extraction of the shared upload tail; three
default-inert DocV2 additions (badge, furniture badge, per-part progress); tests; QA.
OUT (queued elsewhere): the 13-family catalog cleanup (awaits owner GO);
Captions.insert wiring; thumb url:null fix; title drift pinning; a catalog family
entry (that is Phase A of the template-factory plan).

## Requirements (EARS)

### Template DATA

- SB-1: WHEN a registry template's `story_structure` carries `doc_render:
  'storybook'`, THE system (yt-deepdive) SHALL render that episode's visuals through
  the DocV2 storybook engine (`vox` theme); WHEN the key is absent or any other
  value, THE system SHALL render the legacy b-roll lane with its code path,
  artifacts, and log lines byte-identical to today.
- SB-2: WHEN the template declares `doc_presentation { brand, eyebrow, badge }`, THE
  doc json SHALL carry those strings; OTHERWISE it SHALL fall back to the kit's
  label/eyebrow and the initials derived from the label. (The reference values —
  "MONEY RULEBOOK" / "BUSINESS STORIES // MR" / "MR" — live in the red-flags-explained
  template DATA, never in code.)
- SB-3: THE doc-render and presentation reads SHALL use the ASSIGNED template's own
  block only (D19 — no family fallback), so any channel whose template declares the
  key gets the lane with zero code changes (no-static-maps).

### Beat plan (pure, lib/doc-storybook.mjs)

- SB-4: WHEN a script `{title, intro, chapters[], outro}` is planned, THE beats SHALL
  be: one hero (headline = title, sub = first intro sentence, narration = full
  intro), then per chapter one divider beat (ghost numeral, no narration) followed by
  one split slide PER SENTENCE (display headline = fitted sentence, narration = the
  full sentence), then one end beat (narration = outro, headline = brand follow
  line). Sentences split on `. ! ?` boundaries.
- SB-5: WHEN Edge-TTS word timings arrive (`{w, s, d}` seconds per beat), THE beats
  SHALL carry DocV2 caption words `{w, t0, t1}` in milliseconds (beat-relative).
- SB-6: THE timeline SHALL use make-longform's proven pacing: 800 ms lead-in; spoken
  beats `max(spoken + 600, 3000)` ms; dividers 3500 ms; end 4000 ms; 1500 ms tail;
  each spoken beat bound to `lf-audio/<slug>/audio/beat-XX.mp3` when that file exists
  and is > 2 KB.

### Assets

- SB-7: WHEN TTS runs, THE lane SHALL synthesize ALL beats in ONE `edge_batch.py`
  invocation with a real Edge-TTS voice — the kit voice when it is Edge-shaped
  (`xx-XXXX-*Neural`), else `en-US-AndrewNeural`. The per-call Kokoro lane
  (`narrate.py`) SHALL NOT be used for this visual layer (it reloads the model per
  call and only estimates word timings — karaoke needs real WordBoundary events).
- SB-8: WHEN photos are fetched, THE lane SHALL use the Pexels→Pixabay photo lane
  with `orientation: portrait` per split slide (query: chapter title + rotating
  niche words, pool reuse on failures); WHEN zero slides carry a photo, THE lane
  SHALL refuse before render spend (same fail-closed doctrine as the #106 b-roll
  gate — zero coverage is systemic, and the script stays approved for a fixed
  re-dispatch); partial coverage SHALL degrade to text-only slides and ship.

### Render + SRT

- SB-9: THE lane SHALL render with `npx remotion render DocV2` inside `explainer/`
  (deps installed when `node_modules/remotion` is missing; `remotion browser ensure`
  first; concurrency 2 with a concurrency-1 retry), 1920x1080 @ 24 fps, writing
  `demos/deepdive-<slug>/episode.mp4` so the pipeline's tt-lf artifact steps are
  unchanged.
- SB-10: THE episode SRT SHALL be built from the beat word timings through
  `cuesFromWords` + `toSrt` into `demos/deepdive-<slug>/episode.srt` — the same
  standard-SRT format the clips-first lane already parses.

### Shared ship tail

- SB-11: THE upload tail (frame thumbnail under the template's thumb_design,
  review thumb candidates, publishAt slot, disclaimer machine-append, duplicate-title
  gate, upload intent, video_id write-back, state writes, FB/IG outbox, cleanup)
  SHALL be ONE function shared verbatim by BOTH visual layers — moved, not rewritten;
  every existing source pin (disclaimer append count, b-roll-gate-before-upload
  order, thumb opts) holds.
- SB-12: WHEN the review-resume renders an approved script whose template declares
  storybook, THE resume SHALL render the storybook visual layer from the STORED
  input with zero generation calls (the existing resume contract unchanged).

### DocV2 engine (default-inert)

- SB-13: WHEN the doc json carries `badge`, THE theme badge (end card) SHALL use it;
  docs without it keep today's badge byte-identical (vox "QX" etc.).
- SB-14: WHEN the doc json carries `badge`, THE furniture SHALL render the circular
  badge bottom-right per the reference; otherwise no badge is added (today's
  furniture).
- SB-15: WHEN the doc json carries `progressParts`, THE progress dashes SHALL show
  one dash per part (capped at 16) filled by the current beat's chapter progress;
  docs without it keep today's beat-count track.

## Non-goals preserved

Structure (5+ chapters x 70+ words contract), the review generate-only gate and
resume-from-stored-input flow, disclaimers, the episode contract floors, dedupe,
quota ledger, upload intents — all unchanged. The lane changes ONLY the pixels.
