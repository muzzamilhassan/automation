# Spec + QA — Phase B: the template bot (2026-11-05, retuned 2026-11-09)

Source: research/template-factory-plan-2026-11-04.md Phase B. The bot drafts
registry template entries with an LLM, validates them, renders previews, and
STAGES them for owner approval — the registry never sees an unapproved draft.

## Architecture (as built — the brain moved to the Python sidecar)

- `services/ai/bot/graph.py` (the BRAIN, served by the FastAPI sidecar at
  POST `/bot/draft`, key-gated on GROQ_API_KEY): a LangGraph state machine
  — draft → self-review (LLM critique) → repair WHEN the critique list is
  non-empty (an empty-critique rewrite can only drift the drafts) →
  deterministic `shape_draft` (pools/counts/slug/niche normalization; the
  owner's premium bar: per-draft palette, voice, music mood, layout cycle,
  niche-shaped beats/hooks/titles, honest disclaimer). Graph-tested with a
  scripted fake model (`services/ai/tests/test_bot_graph.py`).
- `lib/template-bot.mjs` (the GATES): `canonicalNicheOrThrow` (R1 — only
  canonical niche strings reach the brain) and `validateDraft` (R2 — the
  registry loader's own judgment before anything stages). The Node-side
  shaper/prompt trio was REMOVED: re-shaping the sidecar's already-shaped
  output read top-level keys against a nested payload and clobbered the
  creative fields with fallbacks (generic titles/beats, default vox palette,
  and an `"undefined"` disclaimer leak). ONE shaper, graph-tested.
- `scripts/template-bot.mjs`: `--niche "..." --count N [--theme X] [--dry]` —
  POST {niche, count, theme_hint} to /bot/draft → validate (R2) → STAGE the
  shaped entry VERBATIM to `studio/lib/template-bot-drafts/<id>.json` (a
  standalone dir the registry, sync CLI, and gallery NEVER read) → render
  each draft's preview via render-template-preview `--draft <file>` →
  previews rows keyed `draft-<id>`. `--approve <draft-file>` = the front
  door: append the entry to template-registry.data.js + sync. `--dry`
  prints the payload that would POST (the drafting prompt lives in the
  brain, not here).
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
- R5: THE BOT SHALL require an LLM (the sidecar's Groq call); no silent
  deterministic fallback — a missing key 503s /bot/draft and the runner
  exits non-zero.
- R6 (tuning bar): EVERY staged draft SHALL carry the LLM's creative
  content end-to-end — creative title exemplars (never a restatement of
  the niche name), a palette matching the niche mood (not a vox default),
  concrete niche beats, and one honest niche disclaimer (never placeholder
  text, never `undefined`).

## QA rows

| # | Req | Check | Type | Result |
|---|---|---|---|---|
| 1 | R1 niche gate | paraphrase → rejected pre-LLM | A | PASS — 2026-11-10 in-process probe (node, no sidecar): paraphrase "money habits" → throws `not a canonical string` listing the canonical vocabulary; wrong casing "PERSONAL FINANCE RULES & MONEY HABITS" accepted and returned VERBATIM as "Personal finance rules & money habits" (R1 casing rule); canonical "Healthspan & longevity habits" passes untouched. Pre-LLM pin: the gate runs at scripts/template-bot.mjs:54, BEFORE the /bot/draft fetch at :71 — a rejected niche can never reach the LLM |
| 2 | shape | the sidecar's shape_draft normalizes id/pools/counts; graph tests green | A | PASS — pytest 101 passed / 3 skipped (2026-11-09, owner-run terminal paste; includes the new shape-gate regression test `test_graph_shape_gate_loops_repair_on_fallback_fields` and the brand-added fixture) |
| 3 | R2 validator gate | an invalid draft is dropped pre-stage | A | PASS — 2026-11-10 in-process probe: a deliberately invalid draft (fake family "health-storybook", non-canonical niche, unknown theme, kokoro voice, no pools/beats/titles) → `ok:false, assignable:false` with the named registry error (`family does not exist in the template catalog (D1)`); control: real staged drafts cashflow-challenge-storybook + no-spend-30day-storybook pass the SAME gate (ok:true, assignable:true) — the gate rejects junk, not the catalog. Runner drop pin: scripts/template-bot.mjs:95-98 (validator-fail → dropped, never staged) |
| 4 | R3 isolation | registry/sync/gallery never read the drafts dir (source pins) | A | PASS — repo-wide grep "template-bot-drafts" (2026-11-09): 3 hits only — scripts/template-bot.mjs (staging writes), .github/workflows/template-bot.yml (CI artifact upload), this doc; registry data, sync CLI, gallery: 0 hits |
| 5 | R5 LLM required | no key → 503, runner exits non-zero, no staging | A | PASS — code pin services/ai/app.py:188-190: missing GROQ_API_KEY → 503 {"error":"bot key missing…"} before any graph build; runner catches !r.ok → exit(1) pre-stage; observed live in the 2026-11-09 session (re-test pending in the verification re-run) |
| 6 | R4 approve | the staged entry lands in the registry data verbatim | A | PASS (source pins + live state, 2026-11-10) — scripts/template-bot.mjs:30-42: the approve path parses the staged file and appends it VERBATIM (`JSON.stringify(draft)` of the staged json, re-indented) above the preserved cleanup marker; guards: already-present id → no-op exit 0 (:35), missing marker → hard exit without writing (:38). Marker verified present in the live registry (grep count = 1, 2026-11-10). No live approve executed yet — the first real approve is the owner's click and completes row 10 |
| 7 | previews | drafts render sample + previews rows keyed draft-<id> | A | PASS — 2026-11-09 live run: draft-cashflow-challenge-storybook + draft-no-spend-30day-storybook both rendered (sample.mp4 + poster, blob SET, Neon template_previews rows keyed draft-<id>) via the bot runner's per-draft preview step |
| 8 | review loop | empty critiques skip repair; critiques route through repair (≤2 attempts) | A | PASS (graph-level) — same 101-passed run proves all three routes: `test_graph_happy_path_skips_repair_when_review_signs_off` (empty → skip, attempts 1), `test_graph_repair_loop_runs_on_critique` (critique → repair, attempts 2), `test_graph_shape_gate_loops_repair_on_fallback_fields` (shape-found fallbacks → repair, attempts 2). LIVE-model re-check still rides the sidecar verification run |
| 9 | R6 ride-through | the staged draft keeps the LLM's titles/beats/theme/mood/disclaimer verbatim | A | PASS — after the `_one_str` scalar fix (2026-11-09): staged cashflow-challenge (theme brief, brand IRON SAVER/IS, "FINANCE HABITS // IS", honest niche disclaimer) and no-spend-30day (theme stoic, brand CASH CITADEL/CC, "MONEY HABITS // CC", honest niche disclaimer) — invented brands + niche-honest disclaimers staged verbatim, no fallback soup. Root cause the fix closed: shape_draft's array-only clamp dropped the model's SCALAR brand/disclaimer/eyebrow/badge and silently staged fallbacks while the gate read the raw scalars |
| 10 | end-to-end | a real niche drafts, previews, approves into the registry | E2E | pending — the only unexecuted leg is the owner's approve click on a staged draft (Drafts Inbox or `--approve`); drafting + validation + staging + previews were all proven live 2026-11-09 (row 7), and the approve path is pin-verified (row 6) |
