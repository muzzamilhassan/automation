# Storybook doc template — the owner's wanted look (2026-11-04, screenshots + spec)

Owner verdict: the NEW red-flags-explained video (h1uhT6h5oYA) renders in the
deepdive b-roll lane (full-bleed stock video + bottom chapter bar) — **they do
NOT want that style**. They want the editorial STORYBOOK style of the reference
video BFCa-bRy-3M. The template keeps its structure/governance; the VISUALS
need a new doc render lane.

## Evidence captured

- 8 Playwright screenshots of the reference: `C:\tmp\ref-shots\t{20,90,200,363,480,600,700,740}.png`
- Owner-provided slides (2): photo-card layouts with karaoke captions.

## The style (measured)

- Canvas: warm cream/ivory paper (~#F2EDE3), generous margins
- Top-left kicker: red letterspaced caps "BUSINESS STORIES // MR"
- Top-right: dashed progress track (one dash per part; filled = done)
- Chapter DIVIDER slide: giant ghost numeral ("01", thin red outline) left of a
  vertical hairline; right: red "CHAPTER 01" kicker + big BLACK EDITORIAL SERIF
  headline (Playfair-Display-like, ~64-72px, tight leading)
- CONTENT slides: rounded-corner photo card (polaroid shadow) one side, serif
  story excerpt other side, red "PART 05" kicker; layout ALTERNATES
  photo-left / photo-right
- Karaoke captions: word-by-word at bottom-center, active word in a salmon/red
  rounded box (needs word timing from the SRT/TTS)
- Footer: "MONEY RULEBOOK" letterspaced bottom-left + hairline; circular "MR"
  badge bottom-right

## Where to build (next session)

1. FIRST check `longvideo/make-longform.mjs` — the reference's description
   format matches its emitter, and demo-video.yml ships themes
   ("investing | vox | poster"); the vox/editorial theme may ALREADY be this
   renderer. If so: build a storybook doc-lane adapter (deepdive's script/
   chapters/SRT → make-longform render) instead of a new renderer.
2. Wire from template DATA (no-static-maps): e.g. story_structure gains a
   `doc_render: 'storybook'` key; yt-deepdive branches the visual layer on it.
   Structure, review flow, disclaimers, SRT all unchanged.
3. Karaoke captions need word timing: Edge-TTS word boundaries or SRT cue
   interpolation.
4. Photos: stock lane (Pixabay photo search — key exists) matching each
   chapter's subject; portrait crops for the cards.

## Fix queue carried from today (2026-11-04)

- Captions.insert not wired in the deepdive lane (SRT ships as artifact only)
- Thumb candidates recorded with url:null (Review swap can't display them)
- Title drift: generated title missed the red-flags patterns (tighten pinning)
- All committed: 29f63c2 (force threading), 94aabeb (45-min episode bound),
  e863f2e (picker labels), ea14ce0 (brandmark diamond), 9531779 (QA close-out)

## Today's shipped proof (context)

red-flags-explained assigned to MR (owner, 19:04Z); run 41873055603 rendered
chapters 1-10/10, SRT 172 cues, 9.1 min, scheduled h1uhT6h5oYA → public
2026-11-04T22:30Z, Errors 0. QA: docs/qa/red-flags-explained-qa.md.
