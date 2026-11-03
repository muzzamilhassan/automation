# Spec — `red-flags-explained` video template + the left-stack doc-thumb design

Owner directive 2026-11-03: replicate the Money-Rulebook reference video
"7 Red Flags That Led to Bernie Madoff Ponzi Explained"
(https://www.youtube.com/watch?v=BFCa-bRy-3M) as a selectable template —
same story structure, same captions, same thumbnail design — visible and
selectable in the Studio admin panel, assigned to money-rulebook.

## Ground truth (measured, not assumed)

- The reference video is pipeline-native: its description (`CHAPTERS:` +
  subscribe line) is emitted by `longvideo/make-longform.mjs`; captions are
  uploaded as YouTube CC at publish (`longvideo/longform-upload.mjs:253`).
- Reference structure: cold-open question hook ("people still type … into
  Google"), 10 numbered chapters (~70–80 s each ≈ 170–190 words), red-flag
  enumeration, closing lesson. 12:30 runtime.
- Reference thumbnail anatomy: full-bleed episode frame + red-tinted scrim;
  top-left chip (dot + "SCANDALS", letterspaced caps, bordered pill);
  left-aligned salmon eyebrow "MONEY RULEBOOK"; 3-line left-anchored Anton
  headline (white) with the LAST word in salmon; bottom-right brand mark
  "◆ MONEYRULEBOOK".
- The doc lane already renders photo thumbnails from a mid-episode frame via
  `renderYouTubeThumbnail` (youtube-engine.mjs:267) — center layout, no chip,
  no brand mark, longest-word accent, neutral scrim.

## Requirements (EARS)

- R1: WHEN the registry data file declares `red-flags-explained`, THE SYSTEM
  SHALL list it in the Studio template gallery and the channel template
  picker (registry-driven surfaces; no new UI code).
- R2: WHEN `red-flags-explained` is the active template on a channel with a
  doc slot, THE SYSTEM SHALL render the episode with exactly 10 chapters of
  at least 170 words, section plan `cold_open -> exhibits -> outro` around
  the chapter block (docStoryPlan clamps to the immutable ≥5-chapter floor).
- R3: WHEN `red-flags-explained` is active, THE SYSTEM SHALL require cited
  sources, the finance review class, and append
  "Education, not financial advice." to the upload description (existing
  governance paths; declared as data).
- R4: WHEN the active doc template declares a `thumb_design` block, THE DOC
  LANE SHALL render its thumbnail (and staggered candidates) with that
  design: `layout: 'left-stack'`, chip text, brand-mark text, accent on the
  LAST headline word, scrim tint, accent + eyebrow colors — overriding the
  kit accent per the T6 precedence (declared registry values win).
- R5: WHEN no `thumb_design` is declared (any template, any channel), THE
  DOC LANE SHALL render thumbnails byte-identical to today's output
  (default-inert renderer; the new SVG elements never appear).
- R6: WHEN `red-flags-explained` is assigned to money-rulebook, THE SYSTEM
  SHALL leave exactly one active assignment row (swap semantics) + one audit
  row, through the front door only (data file → validator → sync CLI →
  assign API; never hand-DB edits).
- R7: THE LANE SHALL continue uploading the episode SRT as YouTube closed
  captions at publish (regression guard — the reference video's subtitles).
- R8: WHEN the Shorts lane runs under this template, THE SYSTEM SHALL keep
  the immutable shorts skeleton with the template's red-flag beat slots and
  numbered-listicle title patterns (beats are required by the validator).

## Non-goals

- No new Remotion family; the template binds the proven doc/shorts renderers
  (structure-faithful retrofit, same rule as `myth-vs-money`).
- No shorts-lane visual change: `thumb_design` scopes the DOC thumbnail
  renderer only; shorts keep kit tokens.
- No needsPhoto catalog work: the photo IS the episode frame (as it was in
  the reference). The thumb-catalog photo designs stay Phase 6.
- Niches stay pilot-scoped to MR's exact string (the myth-vs-money
  precedent); widening is a later DATA edit.

## Acceptance criteria

- AC-1: registry validator accepts the entry; existing suites stay green
  (template-registry, doc-template, doc-visual-layer, review-seams tests).
- AC-2: `docStoryPlan` on the entry returns `{chapters: 10, chapterMinWords:
  170}` and the plan line renders sections verbatim.
- AC-3: with `thumb_design` set, the rendered SVG contains the chip text,
  brand-mark text, last-word accent tspan, and scrim tint rect; with it
  unset, none of those elements appear (byte-stability pin).
- AC-4: the sync CLI imports the entry; the assign API swap on money-rulebook
  leaves one active row + audit row (DB-check SELECT evidence).
- AC-5: the Studio gallery + picker list the template after deploy (panel
  evidence); MR's next doc render (QA: forced same-day run) ships the
  left-stack thumbnail and a 10-chapter episode.
