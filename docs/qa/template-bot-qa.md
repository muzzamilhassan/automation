# Spec + QA — Phase B: the template bot (2026-11-05)

Source: research/template-factory-plan-2026-11-04.md Phase B. The bot drafts
registry template entries with an LLM, validates them, renders previews, and
STAGES them for owner approval — the registry never sees an unapproved draft.

## Architecture

- `lib/template-bot.mjs` (pure): `draftPrompt({ niche, count, exemplar })`
  (the drafting contract: the canonical niche, ONE batch exemplar as the
  shape model, the allowed theme/voice/mood/layout pools, JSON-in-JSON-out),
  `parseDrafts(content)` (tolerant JSON extraction), `shapeDraft(raw, niche)`
  (normalizes: id slug + `-storybook` suffix, exact canonical niche string,
  theme/voice/mood from the ALLOWED pools, layout names from the engine's
  eleven, 4 beats / 3 hooks / 3 titles, disclaimers present), and
  `validateDraft(draft)` (the registry loader — assignable or the errors).
- `scripts/template-bot.mjs`: `--niche "..." --count N [--theme X] [--dry]` —
  routeAndCall('script-gen') → parse → shape → validate → STAGE drafts to
  `studio/lib/template-bot-drafts/<id>.json` (a standalone dir the registry,
  sync CLI, and gallery NEVER read) → render each draft's preview via
  render-template-preview `--draft <file>` → previews rows keyed
  `draft-<id>`. `--approve <draft-file>` = the front door: append the entry
  to template-registry.data.js + sync.
- `template-bot.yml`: dispatch(niche, count, theme) — drafts + previews in
  CI; approval stays with the owner in the repo.

## Requirements (EARS)

- R1: THE BOT SHALL only draft for CANONICAL niche strings (verbatim from
  studio/lib/niches.js — a paraphrase is rejected before the LLM call).
- R2: EVERY draft SHALL pass the registry validator (assignable, 0 errors)
  BEFORE staging; a failing draft is dropped with its errors logged.
- R3: THE REGISTRY DATA, sync CLI, and gallery SHALL never read the drafts
  directory (isolation — nothing unapproved is assignable or visible).
- R4: APPROVAL (`--approve`) SHALL append the staged entry to the registry
  data (the front door), leaving all other entries untouched.
- R5: THE BOT SHALL require an LLM (routeAndCall script-gen); no silent
  deterministic fallback — a failed call exits non-zero with the error.

## QA rows

| # | Req | Check | Type | Result |
|---|---|---|---|---|
| 1 | R1 niche gate | paraphrase → rejected pre-LLM | A | |
| 2 | shape | shapeDraft normalizes id/pools/counts; validator-green drafts | A | |
| 3 | R2 validator gate | an invalid draft is dropped pre-stage | A | |
| 4 | R3 isolation | registry/sync/gallery never read the drafts dir (source pins) | A | |
| 5 | R5 LLM required | no key → non-zero exit, no staging | A | |
| 6 | R4 approve | the staged entry lands in the registry data verbatim | A | |
| 7 | previews | drafts render sample + previews rows keyed draft-<id> | A | |
| 8 | end-to-end | a real niche drafts, previews, approves into the registry | E2E | |
