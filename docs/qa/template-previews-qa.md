# Spec + QA — Phase C: template auto-previews (2026-11-05)

Source: research/template-factory-plan-2026-11-04.md Phase C. Every registry
template renders a REAL ~12s sample episode into the gallery — you see what
you assign. This is also Phase B's verification step (bot drafts → preview →
owner approval).

## Architecture (grounded in what exists)

- `lib/template-preview.mjs` (pure): `buildPreviewDoc(meta)` — a synthetic
  12s DocV2 doc built FROM THE TEMPLATE'S OWN DATA: its theme, its
  doc_presentation (voice/brand/eyebrow/badge/doc_layouts), its layout cycle,
  beats flavored by its own hook_classes/title_patterns. `previewLine(meta)`
  — the one spoken sentence (template-flavored, deterministic).
- `scripts/render-template-preview.mjs`: template_id → edge-tts the line →
  fetch one landscape photo (episode-style) → timeBeats → buildStorybookDoc →
  `npx remotion render DocV2` (720p, ~12s) → poster frame → outputs.
- `.github/workflows/template-preview.yml`: **push** on the registry data
  file → git-diff the changed template_ids → render each (parallel matrix,
  fail-soft per template) → **blob put** (mp4 + poster, the token CI now
  has) → record rows in a Neon `template_previews` table (pipeline-written,
  sanctioned artifact data).
- **Gallery**: cards fetch `/api/template-previews` (Neon read) → a template
  WITH a sample plays its real MP4 (muted loop on hover / click-to-play);
  without → today's card unchanged (default-inert).
- Manual re-render: `workflow_dispatch` with `template=<id>`.

## Requirements (EARS)

- R1: WHEN a template entry is added or changed (registry DATA push), THE
  WORKFLOW SHALL render a sample for exactly the changed template_ids.
- R2: THE SAMPLE SHALL carry the template's own look — theme palette,
  doc_presentation strings, doc_layouts cycle, voice — built by
  buildPreviewDoc from the registry meta alone (no script generation).
- R3: THE WORKFLOW SHALL store mp4 + poster in the private blob and record
  `{template_id, mp4_url, poster_url, rendered_at}` rows, replacing prior
  rows for that template.
- R4: THE GALLERY SHALL play a template's real sample when a row exists and
  render today's card unchanged when not (default-inert).
- R5: EVERY step SHALL be fail-soft per template — one broken template never
  blocks the batch or the push.
- R6: MANUAL re-render via workflow_dispatch(template=<id>) SHALL re-render
  and replace that template's rows.

## QA rows

| # | Req | Check | Type | Result |
|---|---|---|---|---|
| 1 | R2 preview doc | buildPreviewDoc carries theme/presentation/layouts from the meta (pure pins) | A | |
| 2 | R1 diff | the changed-id extraction (git diff pins) | A | |
| 3 | R3 storage | blob put + Neon rows (integration via the workflow run evidence) | A | |
| 4 | R4 gallery | card plays the sample; no row = unchanged card | A | |
| 5 | R6 manual | workflow_dispatch(template=X) re-renders X only | A | |
| 6 | fail-soft | one bad template: others render, the push succeeds | A | |
| 7 | end-to-end | a real registry push renders samples visible in the gallery | E2E | |
