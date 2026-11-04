# QA — storybook doc-lane adapter (`doc_render: 'storybook'`)

Spec: docs/superpowers/specs/2026-11-04-storybook-doc-lane-spec.md
Each row verifies one spec requirement. Automated rows run in
`tests/doc-storybook.test.mjs`; the render/pilot rows need real commands.

## Execution record (2026-11-04/05)

- Rows 1–9, 11–17: PASS — `node --test` over doc-storybook + doc-template +
  doc-visual-layer (85/85), review-seams (51/51), brain-wiring +
  template-preflight + generator-routing + upload-intents (126/126),
  template-registry (69/69, incl. the concurrent catalog-cleanup state).
  Combined relevant surface: 359/359.
- Row 10: PASS — local render proof through the exact lane code
  (buildStorybookBeats → ONE edge_batch call, voice en-US-AndrewNeural resolved
  from the kokoro kit id bm_daniel → portrait Pexels photo → timeBeats →
  buildStorybookDoc → `npx remotion render DocV2`): tmp-proof/episode.mp4,
  1920x1080, 24.9s / 597 frames, aac. Timeline verified per spec pacing (divider
  3.5s, spoken splits 3.0/4.4s, end 4.0s, 800ms lead-in). Frames verified
  against C:\tmp\ref-shots: hero (serif headline + YELLOW MARKER hook sub +
  salmon karaoke box), ghost-numeral divider ("01" + hairline + CHAPTER kicker),
  split slide (PART kicker + serif excerpt + rounded portrait photo card +
  karaoke box on the exact spoken word), end card (MR coin + brand + follow
  line), furniture (BUSINESS STORIES // MR kicker, MONEY RULEBOOK footer,
  MR badge circle bottom-right, per-part dashes).
- Row 18: IN PROGRESS — dispatched 2026-11-04 19:16 UTC (force_doc=1,
  channel=money-rulebook, run 41895407694, exit 0). The generate-only hold
  saved the episode script awaiting_review (id 9f6ea419-436b-41f5-a1f7-
  d11842b40726), 0 renders, 0 uploads. The storybook render fires on the
  owner's Studio > Review approval → resume.

| # | Requirement | How to verify | Type |
|---|---|---|---|
| 1 | SB-1 legacy lane untouched | Suite proves `docRenderOf` returns null for missing/other keys; source pins show the storybook branch exits early and every legacy line (b-roll gate, lower-third, segment) still present | automated |
| 2 | SB-1 storybook branch fires on the key | Suite: `docRenderOf({story_structure:{doc_render:'storybook'}})` === 'storybook'; yt-deepdive source branches on it before any legacy visual work | automated |
| 3 | SB-2 presentation: template block wins, kit falls back | Suite: template block returns its strings; block-less template falls back to kit label/eyebrow + derived initials | automated |
| 4 | SB-3 assigned template only | Suite: reader takes the passed meta; no family/channel map in the lib (grep the source in the pin) | automated |
| 5 | SB-4 beat plan shape | Suite on a 2-chapter stub script: hero first (title headline, intro narration), divider per chapter with right n, one split per sentence with full-sentence narration, end last with brand follow line | automated |
| 6 | SB-5 word mapping | Suite: `{w,s,d}` seconds → `{w,t0,t1}` ms rounding exact | automated |
| 7 | SB-6 timeline pacing | Suite: 800ms lead-in; spoken = max(spoken+600,3000); divider 3500; end 4000; total = cursor+1500; audio bound when file exists (predicate), null when not | automated |
| 8 | SB-7 one edge_batch call, edge voice | Source pin: single `edge_batch.py` spawn with EXPLAINER_VOICE from `edgeVoiceFor` (kit edge voice used; kokoro id → en-US-AndrewNeural); no narrate() in the storybook path | automated |
| 9 | SB-8 photos portrait + fail-closed gate | Suite: `storybookPhotoGate(6,0)` refuses, `(6,2)` ok; source pin: fetchPhoto/fetchPhotoPixabay with orientation portrait + pool reuse, gate THROWS before the remotion render | automated |
| 10 | SB-9 DocV2 render invocation | Real command locally: build a tiny stub doc via the lib helpers and run the same render invocation (remotion render DocV2) — mp4 produced, duration ≈ the stub timeline; check streams ffprobe 1920x1080 | manual |
| 11 | SB-10 SRT from beat words | Suite: cues offset per beat start; output parses with parseSrt; first cue ≈ first beat's first word time | automated |
| 12 | SB-11 shared tail verbatim | Full test suite green — every existing source pin (disclaimer append count = 1, docBrollGate-before-uploadWithIntent order, thumb opts, resume threading) still passes after the extraction | automated |
| 13 | SB-12 resume renders storybook | Source pin: the branch reads the template inside renderAndShipEpisode (the resume's entry point), so a resumed approved storybook script renders storybook with zero generation calls (existing resume pins cover the generation ban) | automated |
| 14 | SB-13 badge override default-inert | Suite (source pins): `badge: doc?.badge \|\| base.badge` merge; docs without badge keep base | automated |
| 15 | SB-14 furniture badge default-inert | Suite (source pins): Furniture renders the circle only when the doc set a badge (showBadge prop threaded) | automated |
| 16 | SB-15 progressParts default-inert | Suite (source pins): dash track switches on progressParts; absent = today's track | automated |
| 17 | Registry DATA on the pilot template | Suite: red-flags-explained declares doc_render storybook + presentation block; template-registry + preflight suites stay green | automated |
| 18 | End-to-end pilot on MR (owner-visible) | Dispatch channel-autopilot force_doc for money-rulebook after push: script generates → (review gate holds if clips-gated → owner approves → resume) → storybook episode renders → scheduled; artifacts episode.mp4 + episode.srt exist | manual |

## Regression section

- Full `npm test` must pass (all existing suites, incl. doc-visual-layer 16/16, review-seams, doc-template, brain-wiring pins).
- Legacy visual lane: unchanged files/lines — the branch adds, never edits, the b-roll path.
- Non-storybook templates (null/other doc_render): run the exact legacy code — pinned byte-identical.
