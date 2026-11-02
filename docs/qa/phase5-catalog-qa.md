# Phase 5 Catalog Fill-Out (30+ Video Templates + Thumbnail Registry) — QA file

Feature: catalog-fill-out · Spec: `docs/superpowers/specs/2026-11-01-phase5-catalog-spec.md` (v2, 20 EARS criteria AC-P5-1..20 + 3 exit-gate drills AC-P5-Drill-A/B/C)
Written: **2026-11-01, BEFORE any Phase 5 implementation** (house non-negotiable: the QA file exists at T0; nothing in this file runs against today's HEAD — the sync CLI validates only the 7 legacy entries until the build lands).

Scope: all five slices — S1 authoring system (schema v2, story_structure, tiering, disclaimers), S2 the 32-entry catalog (pilot-first), S3 the thumbnail registry, S4 doc-lane templates, S5 the Urdu decision point (no build — one research row, not a QA row) — plus the cross-slice identity/swap criteria, the 3 drills, the MR pilot, the per-template QA gates, and the pinned regressions. One checklist row per acceptance criterion; no AC merged or split silently (AC-P5-9's owner-read and title-pattern checks are its two named sub-rows, 18g/18h).

**Standing directives baked into every row:**
- **MR-pilot-first** (owner directive 2026-10-31, memory `money-rulebook-pilot-directive`: "Firstly all things should be tested with Money Book channel."): every LIVE proof — pilot assignment, template retrofit, forced produce, soak — runs on **money-rulebook** first. The 11 dead-grant re-auths, parked-brand revivals, and any other-channel live produce wait until the owner declares MR fine. Where a drill's spec text names a template a finance channel cannot legally wear (Drill B's health-class template), this file defines an MR-legal stand-in variant that proves the identical criterion — the real-template run executes at first health onboarding.
- **No calendar waits** (owner directive, memory `no-calendar-waits-directive`): no row ever waits days. Time-gated proofs use `-f force_doc=1`, `-f topup=N`, state/kit DATA edits (reverted after), and same-day log checks. Even the pilot's "soak day" is the compressed same-day soak defined in P-3.
- **Data rows through the front door only:** every template/thumb-registry row is created or changed in the registry DATA files (`studio/lib/template-registry.data.js`, NEW `studio/lib/thumb-registry.data.js`), validated by the validator, and synced by the CLI (`node sync-template-registry.mjs`, `--thumbs` when it ships). **No hand-DB edits to `template_registry_index`, `channel_template_assignments`, or their audit table — ever.** DB-CHECK is for SELECT-side evidence only (plus the drill cleanups phase 4 already sanctioned for drill-owned rows: jobs/scripts/artifacts — never registry rows).

Executor: a human, after each build step lands. Studio rows run against the **deployed Studio** (`cd studio && vercel --prod` after push — memory `vercel-deploy-pattern`); rows marked **[local]** run from the repo root in Git Bash. Evidence slots accept a quoted output line or a screenshot path (desktop 1440 / mobile 375 for `visual` rows).

## How to run

1. Sign in as **owner** at Studio `/login`. No staff-only rows exist this phase (Phase 5 adds no new roles — dormant per the scope pivot).
2. `gh` CLI signed in (`gh auth status`, account `muzzamilhassan`) — every Actions row dispatches from the repo root. Workflow dispatches are production actions; if the session's permissions block `gh workflow run`, hand the owner the exact one-line command rather than waiting (no-calendar-waits directive).
3. Neon reachable. **DB-CHECK helper** — all database checks are the same one command with different SQL. Run from the repo root (reads `DATABASE_URL` from the root `.env`) and paste the SQL shown in the row:

   ```
   node --input-type=module -e "import { loadEnv } from './lib/env.mjs'; loadEnv(); const sql=(await import('postgres')).default(process.env.DATABASE_URL); console.log(JSON.stringify(await sql.unsafe('PASTE-SQL-HERE'),null,2)); await sql.end();"
   ```

4. Pilot channel: **money-rulebook** (active, autopilot on, review-gated already via its finance assignment, `YT_TOKEN_MONEY_RULEBOOK` secret saved). PREP for any MR row: DB-CHECK `select * from channel_template_assignments where channel_id = 'money-rulebook' and active = true` and screenshot the panel — you restore this in cleanups.
5. NEW things this phase the rows depend on: the `template_id`/`family` fields and the `story_structure`/`disclaimers` blocks in `studio/lib/template-registry.data.js`; the swap semantics in the assign path; the NEW files `studio/lib/thumb-registry.data.js` + `studio/lib/thumb-registry.js`; the sync CLI's `--thumbs` mode; the doc-threading slice in `yt-deepdive.mjs`; the three new niche strings in `studio/lib/niches.js`; and the new/extended test suites under `tests/` named in `automated` rows (expected names given; per phase 4 note 5, if a case landed in a differently-named file, run it there and record the divergence in Actual).
6. Ground truth this file was verified against (2026-11-01, pre-build): 7 registry entries (`documentary-frames`, `timeline-history`, `photo-stories`, `finance-explainers`, `stats-counters`, `chart-animations`, `editorial-headlines`); validator vocabulary `['health','finance','medical','all']` (`template-registry.js:9`) and assignment codes `missing_capability:<cap>` / `format_mismatch` / `niche_mismatch` / `renderer_unavailable` / `deprecated_template`; brain defaults 0.85/0.90 with the BLOCK→WARN downgrade for non-finance (`youtube-engine.mjs:731-735`); shorts skeleton `hook + points[≥4] + closing` (`validShortsScript`, `youtube-engine.mjs:749`); episode contract title + intro + ≥5 chapters × ≥70 words + outro (`yt-deepdive.mjs:81-84`); money-rulebook kit script block `{points: 4, lineWords: '9-12', titleStyle: 'numbered money listicle with a $ figure'}` (`yt-brands/brands.mjs:91`); `thumb-catalog.json` holds 42 designs in 12 categories of which **17 are `needsPhoto:false`** (see Row 11); `channel_template_assignments` + `template_assignment_audit` tables exist; `scripts.template_id` + `dedupe_verdicts` join exist (Drill B's identity evidence); workflow inputs `channel` / `topup` / `force_doc` / `resume` on `channel-autopilot.yml`.
7. Authoring order is the spec's Ruling-4 serial spine (T1 code → T2 pilot → T3 MR swap + produce + soak → T4/T5/T6 batches → T7 thumbs → T8 doc threading then doc templates → T9 drills). Execute the rows in that order — doc-template QA (Row 16) is not executable before Row 15's threading lands, and no batch row before P-3's clean soak.
8. Automated rows first (`npm test` runs everything: `node --test "tests/**/*.test.mjs"`), then manual, then visual. Fill Actual/Evidence/Status as you go — every slot in this file is empty by design at T0.

---

## Checklist

### A — Schema + identity slice (template_id + family split, swap semantics, the identity invariant, the validator vocabulary)

#### Row 1 — AC-P5-1 · authoring validates through the dry sync; bad blocks are excluded with every error named · `automated` + `manual [local]`

Verify: a template authored as registry DATA (template_id + family bound to an existing catalog family) passes `node sync-template-registry.mjs --dry` and lists as assignable; a missing, malformed, or niche-paraphrasing block is excluded, every error named, exit 1.

- Precondition: T1 schema v2 landed; `studio/lib/template-registry.data.js` open for the pilot block.
- Steps:
  1. [local] Author the pilot block (`myth-vs-money`, D7 row 8) into `REGISTRY_META`: `template_id: 'myth-vs-money'`, `family: 'stats-counters'` (must exist in `TEMPLATES_DATA`), niches = the verbatim 6-string finance cluster (D17), `formats: ['short']`, `story_structure` per D2 (beats: slot 1 = the popular belief, slots 2–3 = reversal evidence, slot 4 = what-to-do payoff), variation_rules per the D3 bar, `safety.review_required: ['finance']`, `disclaimers` with the fixed finance text, `variation_threshold`/`cross_channel_threshold` declared per the D3 authoring bar. DATA edit only — no DB writes.
  2. [local] `node sync-template-registry.mjs --dry` — exit 0; the summary counts the new entry among registry-assignable templates; `[dry] no writes performed — database not touched`.
  3. Boundary probe (negative, in a scratch copy — revert after): omit `story_structure` on the NEW entry AND paraphrase one niche string (`'Personal finance rulez & money habits'`). `node sync-template-registry.mjs --dry` — expect exit 1, `skipped-invalid: 1`, the output naming the template AND **every** error (the validator collects all errors, never first-only), the entry absent from the assignable list.
  4. Automated: `node --test tests/template-registry.test.mjs` — plus the Phase 5 vocabulary pin test (D17): every `niches[]` string across the whole file is a member of the closed D17 vocabulary; a paraphrase fails in CI before it can `niche_mismatch` in production.
- Expected: exit 0 on the good block, exit 1 with named errors on the broken one; dry mode never touches Neon.
- Boundary probe: a string that is valid D17 vocabulary but not on the target channel still syncs fine (registry-level membership) and only refuses at ASSIGN time with `niche_mismatch` (Row 5) — the two gates are different on purpose.

#### Row 2 — AC-P5-2 · new entries require the new blocks; the legacy 7 validate unchanged · `automated`

Verify: a new template omitting `story_structure` or a `medical`/`finance` template omitting `disclaimers` is rejected with a named error; the existing 7 entries (no new fields) continue to validate exactly as today.

- Precondition: T1 validator extensions landed.
- Steps:
  1. Automated: `node --test tests/template-registry.test.mjs` — the three named-rejection cases (missing story_structure on new; missing disclaimers on medical; missing disclaimers on finance) and the legacy-acceptance case (all 7 existing blocks pass with zero new fields).
  2. [local] Live legacy acceptance, pre-authoring: `node sync-template-registry.mjs --dry` on the untouched file — exit 0, `registry-assignable families resolved: 7` (the file as of 2026-11-01 holds exactly the 7 legacy entries with no story_structure — this dry run IS the unchanged-proof).
  3. Boundary probe: a legacy entry that GAINS `template_id` keeps its own identity (the key is template_id when present — it never silently aliases to the family id), and `disclaimers` on an `all`-class template is legal-but-not-required (the requirement is medical/finance only).
- Expected: fail-closed for new, byte-tolerant for legacy.

#### Row 3 — AC-P5-17 · assigning over an active assignment is a SWAP; never two active rows · `manual` + `automated`

Verify: assigning a template to a channel that already has one deactivates the prior assignment, records the change in `template_assignment_audit`, and leaves exactly one active row. Executed for real in Pilot step P-2 — run this row's checks during P-2 (or on any swap) and cross-reference.

- Precondition: money-rulebook with its current active assignment noted (How-to-run 4).
- Steps:
  1. Automated: `node --test tests/template-registry-db.test.mjs` — the swap cases: assign-over-active deactivates the prior row + writes the audit entry; a channel can never hold two active rows (the D19 invariant).
  2. Panel: `/channels` → money-rulebook card → template panel (layers icon — "Template registry — assigned template, pinned version, assign/unassign") → assign the second template → Assign & pin.
  3. DB-CHECK: `select * from channel_template_assignments where channel_id = 'money-rulebook'` — exactly one row with `active = true`, and it is the NEW template; the prior row `active = false`.
  4. DB-CHECK: `select * from template_assignment_audit where channel_id = 'money-rulebook' order by 1 desc limit 5` — the newest audit row records the swap (actor, from/to, action).
- Expected: one active assignment, before and after; the swap is on the record, never silent.
- Boundary probe: POST `/api/templates/assign` twice in rapid succession (DevTools or curl) — still exactly one active row; the second call swaps, never stacks.

#### Row 4 — AC-P5-18 · the identity invariant: one string, four homes · `manual` + `automated`

Verify: the assignment row's template id, the registry key, the brain gate's id, and the review gate's meta lookup all resolve to the SAME string. Live proof is Drill B (executed on a template whose review class differs from its family's historical association); this row holds the criterion and the automated pin.

- Steps:
  1. Automated: `node --test tests/review-gate.test.mjs tests/template-preflight.test.mjs` — the identity cases: preflight's resolved id, the gate's meta lookup id, and `resolveTemplateId` all return the assignment's id; any join resolving a different id than the assignment is a defect (assert-level).
  2. Live (during Drill B): resolve all four homes for the drill template — (a) DB-CHECK the active assignment row's id; (b) the `/templates/registry` card id (and the `template_id` key in the data file); (c) DB-CHECK `select template_id, template_version from scripts order by created_at desc limit 1` (the brain-gate home — the script row carries the id the gate threaded); (d) the run log's `[template] enforce: <id> @ v…` line (the review-gate home).
- Expected: four identical strings; the class-differs-from-family pairing proves no home falls back to the family's historical association.
- Boundary probe: unassign the template and re-check home (c) on the NEXT run — a script generated with no assignment carries the null/legacy identity, never a stale id.

#### Row 5 — AC-P5-10 · the panel offers exact-niche matches and refuses mismatches with named codes · `manual` + `automated`

Verify: when a channel's niche string exactly matches a template's `niches[]`, the panel offers the assignment; niche, format, capability, or renderer mismatch refuses with the existing named reasons.

- Precondition: at least one batch template authored (T4+) so two different niches exist to compare.
- Steps:
  1. Panel: open a finance-cluster channel's template panel — the finance templates are offered; open the picker on a health-niche kit — the finance templates are absent/refused.
  2. Negative (boundary probe): force a mismatched assignment via the API (DevTools `fetch('/api/templates/assign', …)` with a health template id against money-rulebook) — the response names `niche_mismatch` (exact-string matching: the paraphrase-protection is Row 1's pin test; this is the runtime backstop).
  3. Automated: `node --test tests/template-registry.test.mjs` — the `validateAssignment` truth table: `niche_mismatch`, `format_mismatch`, `missing_capability:<cap>`, `renderer_unavailable`, `deprecated_template` — all five codes, reasons collected ALL-at-once, never first-only.
- Expected: assign-ability is exact-string niche membership + format overlap + capability truth; every refusal names itself.

### B — Story-structure threading (prompt assembly, beats-as-point-slots, the byte-identical pin)

#### Row 6 — AC-P5-3 · the template's beat plan rides the prompt as point-slot constraints; unassigned channels stay byte-identical · `automated` + `manual`

Verify: on a channel whose assigned template declares `story_structure`, the prompt carries the beat plan as numbered point-slot constraints over the IMMUTABLE shorts skeleton (`hook` + 4–5 points + `closing` — the JSON contract never changes), with `hook_classes`/`title_patterns` replacing the kit title line when declared (T2a Ruling: REPLACE); with no template assigned, the kit-level prompt is byte-identical to pre-Phase-5.

- Precondition: T2's prompt-assembly slice landed; the pilot template assigned to MR (P-2).
- Steps:
  1. Automated (golden pin): `node --test tests/registry-lanes.test.mjs` (or wherever the prompt-assembly cases land) — the line-by-line D2 assembly: `styleLine`/`themeLine`/`trendBlock`/`pacingRule` unchanged (kit-owned); the kit `hookRule` line stays and the template's `hook_classes[]` APPENDS one constraints line; the template's `title_patterns[]` REPLACE the kit `titleRule` line when declared, else the kit line stays [T2a Ruling: REPLACE]; `structureLine` is REPLACED by the rendered beat plan only when the template declares one, else today's kit line; the JSON-contract line untouched; the brain `/context` section appended last. Plus the byte-identity golden: an unassigned/legacy channel's prompt equals the pre-Phase-5 string exactly (record the fixture hash).
  2. Live (during P-3's forced produce): the generated script matches the beat plan in plain English — slot 1 is a popular money belief, slots 2–3 reverse it with evidence, slot 4 is the what-to-do payoff; 4 numbered points × 9–12 words (the MR kit's pacing, unchanged); the title fits `title_patterns`. Quote the script's hook + first point + title in Actual.
  3. Boundary probe (authoring bar): `beats[]` longer than the kit's point count (5 beats vs the MR kit's 4 points) is rejected at authoring time (Row 2's validator) — the skeleton's point count is kit-owned, the beats only name slots.
- Expected: the story changes, the shape never does.

#### Row 7 — AC-P5-5 · similarity thresholds come from the template's DATA, else the documented defaults · `automated`

Verify: the variation gate uses the assigned template's declared `variation_threshold`/`cross_channel_threshold` when present, else 0.85/0.90.

- Steps:
  1. Automated: `node --test tests/registry.test.mjs` (the `registryThresholds` truth table) — template-declared values win; absent values fall to the defaults; `finance-explainers`' existing explicit values keep resolving exactly as today (the Phase 3 pin, re-run).
  2. Live (during P-3): the run log's `[brain-dedupe]` line shows the gate running at the pilot template's declared threshold (quote the line; compare with the value in the data file).
- Expected: thresholds are data, never a per-channel map (the no-static-maps rule holds here too).
- Boundary probe: a template declaring a LOOSER-than-default threshold — legal data (defaults are floors of behavior, not authoring minimums) — except medical, which Row 9 pins tighter-than-default; confirm the validator accepts a loose non-medical value and rejects a loose medical one.

### C — The brain tiering extension (fail-closed for ANY review_required class; medical thresholds)

#### Row 8 — AC-P5-6 · a BLOCK holds for any review-gated class; class-less templates keep today's WARN-downgrade · `automated` + `manual`

Verify: BLOCK from `/dedupe` on a template with ANY non-empty `review_required` fails the script (retry the walk / hold / skip — never publish); on a template with no review class, BLOCK continues to downgrade to WARN and ship, exactly as today. This is the D3 one-line fix — the pre-fix behavior (medical BLOCK shipping) is the defect this row proves dead.

- Precondition: T1's tiering fix landed.
- Steps:
  1. Automated (the truth table): `node --test tests/review-gate.test.mjs tests/registry.test.mjs` (the brain-tiering suite) — all cells: BLOCK + review_required non-empty → walk consumed (fail-closed); BLOCK + review_required empty/absent → WARN + ships (today preserved); gate-down + review_required → fail-closed; gate-down + class-less → fail-open proceed (today preserved); WARN → proceed always; PASS → proceed always.
  2. Live: Drill B's near-duplicate half executes this row on a gated template (the `[brain-dedupe] verdict=BLOCK` line with NO downgrade suffix, nothing published). Cross-reference Drill B in Actual.
- Expected: gated means gated for every class; un-gated keeps today's economics.
- Boundary probe: `review_required: []` (empty array) is CLASS-LESS semantics (downgrade path), not fail-closed — assert the empty-array cell explicitly so nobody conflates present-but-empty with gated.

#### Row 9 — AC-P5-7 · every medical template pins tighter-than-default thresholds, enforced by the validator · `automated`

Verify: a `medical`-class template's block carries `variation_threshold ≤ 0.80` and `cross_channel_threshold ≤ 0.85`; a medical block omitting or loosening them is rejected with a named error.

- Steps:
  1. Automated: `node --test tests/template-registry.test.mjs` — the medical pin cases: missing → named rejection; `0.81`/`0.86` → named rejection; `0.80`/`0.85` exactly → accepted (the boundary is ≤).
  2. [local] On the authored catalog: `grep -n "variation_threshold" studio/lib/template-registry.data.js` — the health trio's blocks (habit-protocol, myth-vs-science, sleep-ritual) and doc-evidence-review each pin ≤ 0.80 / ≤ 0.85; quote the four blocks' lines.
- Expected: the whole medical lane ships tighter than the defaults, matching the doc lane's pooled whole-episode chunk semantics.
- Boundary probe: a medical template with ONLY `variation_threshold` pinned and `cross_channel_threshold` missing — rejected (both numbers are required; partial pins fail closed).

### D — Disclaimers (machine-appended description + the contains() save gate)

#### Row 10 — AC-P5-4 · the disclaimer is appended in code at publish time and its absence fails the save · `automated` + `manual`

Verify: where a template declares `disclaimers`, each fixed text is appended verbatim to the upload DESCRIPTION in code at publish time (the narration keeps creative freedom); a finance/medical script whose saved record lacks its disclaimer in the narration or the machine-appended description FAILS the save (fail-closed).

- Precondition: the disclaimer slice landed; a finance/medical template assigned (the pilot on MR).
- Steps:
  1. Automated: `node --test tests/review-seams.test.mjs` (or the suite that lands the save-gate cases) — (a) the publish-time append: the description payload ends with each fixed text verbatim; (b) the contains() gate: a finance record whose narration + description lack "Education, not financial advice." → save REFUSED, nothing persisted (same posture as "a dup-blocked script is never saved"); a record whose machine-appended description carries it → saved; (c) an `all`-class script with no disclaimers declared → unaffected.
  2. Live (during P-3): after the pilot's forced produce uploads, open the video's description (YouTube Studio or `/videos`) — the fixed text sits in the description; the narration does not contain it unless the brain chose to. Quote the description tail.
  3. Owner visual: `/review` on the held pilot script — the disclaimer line is visible in the record before approval.
- Expected: compliance lives in the DESCRIPTION (machine-written), never hoped-for in the narration.
- Boundary probe: an owner claim-edit at `/review` that deletes the text from the narration — the save still passes ONLY because the record's publish payload still carries the machine-appended description; delete BOTH (narration edit + suppressed append is impossible by construction — assert the append is unconditional in code) — and the save gate refuses. State in Actual which side the probe exercised.

### E — The thumbnail registry (loader, needsPhoto:false launch set, rotation, candidates through the Phase 4 seam)

#### Row 11 — AC-P5-11 · the thumbnail registry lists ≥15 needsPhoto:false entries covering all 10 niches, bound to brand tokens · `manual [local]` + `automated`

Verify: the NEW `studio/lib/thumb-registry.data.js` + loader land; every entry binds to an EXISTING `thumb-catalog.json` design that is `needsPhoto:false`, to the verbatim niche vocabulary, and to brand-kit tokens (accent/bg/label — the renderer's existing inputs); the sync listing exits 0 with ≥15 entries covering all 10 launch niches.

- Precondition: T7's loader + `--thumbs` sync mode landed.
- Steps:
  1. [local] Author the launch entries in `studio/lib/thumb-registry.data.js` (D10 schema: template_id, niches[], formats, required_inputs, candidate_count, rotate). **Ground-truth constraint recorded honestly (verified 2026-11-01): only 17 of the 42 designs are `needsPhoto:false`** — `blackout, whitespace, focal-cut, big-number, price-fight, slab-quote, serif-frame, gold-standard, terminal, bungee-sign, redact, ledger, screen, plinth, coinflip, marquee, pillar` — so the "planned 18" must either repeat a design under a second niche binding or land at 17; the ≥15 exit gate holds either way. Note in Actual which count shipped. Several of the spec's exemplified ids are `needsPhoto:true` (marble, field-notes, dossier, data-callout, changelog, question-economy, tease-chip, ketchup, summit, split-verdict, badge-circle) — per-design picks come from the false pool above, per D10's own rule.
  2. [local] `node sync-template-registry.mjs --thumbs --dry` (if the dry mode ships; else the real listing) — exit 0, the entry count, per-niche coverage ≥2 entries for all 10 launch niches.
  3. Automated: the thumb-registry loader suite — unknown catalog id rejected; a `needsPhoto:true` id rejected for the v1 launch set; niches[] ⊆ the closed D17 vocabulary (same pin as Row 1); brand-token binding present per entry.
  4. Panel: `/thumbs` — the registry entries browsable per niche.
- Expected: the 42-design catalog becomes assignable data; no photo hunting in v1.
- Boundary probe: a thumb entry whose niches paraphrase a canonical string — loader rejects (same closed set as the video registry, one vocabulary everywhere).

#### Row 12 — AC-P5-12 · candidates per the eligibility math through the Phase 4 seam; non-gated keeps the single frame · `manual` + `automated`

Verify: on a review-gated template with picking enabled and an assigned thumb set, renders produce candidate 1 = today's frame thumbnail (unchanged bytes logic) + candidates 2..N = registry renders wearing the channel's brand tokens; pick flow unchanged (candidates → `/review` → `thumbnails.set` before publishAt); a non-gated template keeps the single frame-candidate path (the v1 seam limitation, D12).

- Precondition: MR carries the pilot template (gated, picking on) + an assigned thumb set (kit JSONB per D13).
- Steps:
  1. Automated: the candidate suite (`node --test tests/review-seams.mjs` file) — eligibility math 0/1/≥2 → 1/2/N candidates; the SVG → sharp → JPEG ≤2 MB encode; `thumbFrameOffset(0) === 3` (candidate 1's legacy pin, re-run); SEAM 2 negative (non-gated → no candidates env, single frame) re-run green.
  2. Live: Drill C executes this row end-to-end on MR (candidates land, `/review` pick, `thumbnails.set` swap before publishAt). Cross-reference Drill C in Actual.
  3. DB-CHECK during Drill C: `select * from job_artifacts where kind like 'thumb%' and job_id = '<job id>'` — one frame row + N−1 registry-render rows.
- Expected: candidate count is registry+template DATA; the upload never waits on a human.
- Boundary probe: a registry render whose encoded bytes exceed 2 MB — re-encoded or dropped, candidate 1 still ships (Phase 4's fail-soft, unchanged).

#### Row 13 — AC-P5-13 · consecutive uploads never reuse a layout back-to-back · `automated` + `manual`

Verify: selection rotates the channel's thumb set so the same layout is not used on consecutive uploads (last-used id recorded in the channel state file).

- Steps:
  1. Automated: the rotation suite — two consecutive selections never return the same template_id; the last-used id persists via the channel state file; a single-entry set degrades to "same only choice" without error.
  2. Live: during Drill C's second render, DB-CHECK/state-check the recorded last-used id — it differs from the first pick. Quote both ids.
- Expected: 30 channels never ship the same look twice in a row.
- Boundary probe: state file missing/unreadable — rotation fails soft to "first eligible" (never blocks the upload), and the next good state restores rotation.

#### Row 14 — AC-P5-14 · missing photo/face inputs skip an entry, never block an upload; 0-eligible is byte-identical · `automated`

Verify: a set entry whose `required_inputs` the channel lacks is skipped for the next eligible one per D12's math; 0 eligible (no set, or every entry ineligible) → today's single frame candidate, byte-identical; the upload never blocks.

- Steps:
  1. Automated: the fail-soft suite — a `photo`-required entry + a channel with no photo asset → skipped, next eligible used; all ineligible → exactly the legacy single-candidate path (golden bytes); no-set channel → single frame candidate (this is also the regression pin R1's thumb half).
  2. Boundary probe: candidate_count declared on the set but the channel's active template is NOT review-gated — the v1 seam yields the single frame candidate (Row 12's limitation); assert the no-candidates-env cell so the limitation stays visible, not forgotten.
- Expected: every degradation lands on "the video still uploads".

### F — Doc-lane threading (the named slice, then doc templates)

#### Row 15 — AC-P5-15 · the doc threading slice lands and proves itself BEFORE any doc template's QA · `automated`

Verify: `yt-deepdive.mjs` resolves the channel's active template and threads its thresholds, gating signal, structure sections, and review-class derivation into the brain call and the generate-only hold — with its own QA rows green before any doc template's QA gate row is executed (Ruling 3's ordering).

- Precondition: T8's threading slice landed; at least one channel with docDay + an active template.
- Steps:
  1. Automated: `node --test tests/review-seams.test.mjs tests/doc-days.test.mjs` (plus the new threading suite wherever it lands) — the doc brain call receives the template id + thresholds (pooled chunk semantics PRESERVED — the existing `docDedupeChunks` pooled pin re-runs green); the generate-only hold derives its class from the template (not just the Phase 4 paths); structure sections thread into the doc prompt.
  2. Discipline check (record in Actual): the date Row 15 passed vs the date the first doc template's Row-16/P-gate evidence was captured — threading strictly first.
- Expected: doc templates are reachable data, not dead config.
- Boundary probe: doc channel with NO active assignment — today's behavior byte-identical (default thresholds, existing shape, no threading) — the flags-off pin's doc twin.

#### Row 16 — AC-P5-16 · a doc template drives the episode inside the unchanged contract; foreign formats skip LOUDLY · `manual` + `automated`

Verify: a doc template assigned to a channel with docDay produces an episode following the template's section plan within the existing contract (title, cold open, ≥5 chapters × ≥70 words, outro, SRT captions, pooled dedupe chunk unchanged); a declared review class keeps the generate-only → hold → approve → resume-from-stored loop; a shorts-shaped template active on doc day skips the slot with one Action-required warning + log line, producing nothing.

- Precondition: Row 15 green; a doc template authored and assigned (T8 Batch 4).
- Steps:
  1. Automated: the loud-skip suite — active template whose formats exclude doc → one Action-required warning + one log line, zero production; the `validEpisode` contract pin re-runs (≥5 chapters × ≥70 words unchanged — the template declares the plan, the validator keeps the floor); SRT generation unchanged.
  2. Live: `gh workflow run channel-autopilot.yml -f channel=<doc channel> -f force_doc=1` (no-calendar-waits: never wait for the natural docDay) — the episode follows the template's section plan (chapter count matches the plan; cold open + outro present); a gated doc template holds generate-only at `/review` and the approve → resume-from-stored loop completes it (the T5c loop, unchanged). Quote the log lines.
  3. Boundary probe: a doc template assigned to a channel WITHOUT docDay — nothing weekly (doc templates count toward the catalog; they produce only where a docDay exists).
- Expected: the longform lane gets its shape from data, keeps its contract, and refuses to render a shorts template as a documentary.

### G — The MR pilot (T2 + T3: author the pilot only, SWAP onto money-rulebook, forced produce, soak)

*Owner directive (memory `money-rulebook-pilot-directive`, 2026-10-31): the entire system is proven on money-rulebook FIRST; all other channels and re-auths wait until the owner declares MR fine. These three rows are the phase's first live proofs and the gate every batch must pass.*

#### Row P-1 — AC-P5-9 (executed for the pilot) · myth-vs-money passes the FULL per-template QA gate, structure-faithful to the MR kit · `manual` + `automated`

Verify: the pilot template's D6 gate rows (a)–(h) all pass with quoted evidence — authored structure-FAITHFUL to money-rulebook's current format (4 points × 9–12 words, numbered money listicle, $-figure titles — `yt-brands/brands.mjs:91`), so the swap carries zero content risk (A-H6).

- Precondition: T1 + T2 landed; MR's current assignment noted (restore copy).
- Steps:
  1. [local] (a) `node sync-template-registry.mjs --dry` validates the pilot block — exit 0 (Row 1's steps, executed for this block; quote the count).
  2. `node sync-template-registry.mjs` (real sync) then `/templates/registry` — the pilot card visible with niche/formats/family/class/variation rules.
  3. (b) Panel assignment validation against MR (its niche `'Personal finance rules & money habits'` ∈ the pilot's 6-string cluster) — no refusal codes.
  4. (c)+(f)+(g)+(h) — the forced produce in P-3 supplies the shape spot-check, the candidates, the OWNER'S OWN READ of the generated script (write a 3-sentence verdict in Actual: would you ship it? does it read like the channel?), and the title-pattern check (`$`-figure numbered-listicle pattern per the kit's `titleStyle`).
  5. (d) The `[brain-dedupe]` log line from P-3 shows the pilot's declared thresholds (Row 7's live half).
  6. (e) Class `finance` — per-CLASS live proof already exists (Phase 4's finance lane + Drill B's extension); cite it, do not re-run a finance hold.
- Expected: every letter (a)–(h) has quoted evidence in this file before the swap is trusted.
- Boundary probe: any (a)–(h) gap = the pilot is NOT accepted and T4+ batch authoring does not start (AC-P5-9's counting rule).

#### Row P-2 — AC-P5-17 (executed live) · the SWAP: myth-vs-money replaces finance-explainers on money-rulebook · `manual`

Verify: the swap semantics live on the pilot channel — one active assignment before and after, the audit row on the record.

- Steps:
  1. PREP: DB-CHECK + screenshot MR's current assignment (expected today: `finance-explainers`, pinned major 1 — confirm before touching).
  2. `/channels` → MR → template panel → assign `myth-vs-money`, pin major 1 → Assign & pin.
  3. DB-CHECK: `select * from channel_template_assignments where channel_id = 'money-rulebook'` — one active row, now `myth-vs-money`; finance-explainers deactivated.
  4. DB-CHECK: `select * from template_assignment_audit where channel_id = 'money-rulebook' order by 1 desc limit 3` — the swap audit row present. (This is Row 3's live execution — fill Row 3's Actual with the same evidence.)
- Expected: the swap is atomic from the panel; nothing else about MR changed.
- Boundary probe: reload the panel — it shows exactly one active template (never two selectable "active" cards).

#### Row P-3 — AC-P5-3/4/5/12 live · the forced produce end-to-end, then the compressed same-day soak · `manual` (owner dispatch) + `automated`

Verify: one forced produce runs generation → gate → candidates → upload → verify with the pilot template governing every step; then the soak proves normal runs are clean — same day, per the no-calendar-waits directive.

- Steps:
  1. `gh workflow run channel-autopilot.yml -f channel=money-rulebook` (MR is daily; add `-f topup=1` if today's slots already shipped).
  2. MR is finance-gated → the run goes generate-only and holds: `/review` shows the pilot script (sources side-by-side, dedupe verdict, the disclaimer line — Row 10 step 3). **Owner reads it (gate row g)** and checks the title against `title_patterns` (gate row h). Approve → the dispatched resume run renders from the STORED input and uploads private (the Phase 4 loop, unchanged).
  3. Evidence capture (each gets a quoted line): the run log's `[template] enforce: myth-vs-money @ v…` (Row 4, home d); the `[brain-dedupe]` line with the pilot's thresholds (Row 7); the script shape matches the beat plan (Row 6 step 2); DB-CHECK `select template_id, status, video_id from scripts order by created_at desc limit 1` (the identity home c + consumed status); the upload description carries "Education, not financial advice." (Row 10 step 2); candidate rows in `job_artifacts` (Row 12 step 3); `[verify] OK` in the log.
  4. SOAK (compressed): confirm MR's normal scheduled run(s) for TODAY completed clean with the pilot active (Actions tab), plus one more dispatch (`-f topup=1`) if the schedule already ran — a same-day soak of normal lanes. Record: no new warnings on `/warnings` for MR, state file (`yt-mcp/state/money-rulebook.json`) advancing normally. If the owner prefers the natural overnight window instead, batches wait one morning — but the default is the same-day soak.
  5. Only after P-1 through P-3 are all green: declare the pilot fine TO THE OWNER and start T4 batches (the directive's gate).
- Expected: the plumbing proof is live, content-faithful, and reversible.
- Boundary probe: CLEANUP/ROLLBACK (keep written, hopefully unused): unassign the pilot → re-assign `finance-explainers` + the pinned major from PREP; the swap machinery runs the rollback too (one active row, audit row). Delete the drill upload from YouTube Studio if it must not ship; DB-delete the drill's `scripts` row + job rows per phase 4's drill-cleanup pattern — never registry rows.

### H — Batch authoring + per-template QA gates (the catalog exit gate, the owner-read row, the title-pattern row)

#### Row 17 — AC-P5-8 · the registry lists 32 assignable templates across all 10 niches, ≥2 structures each · `manual` + `automated`

Verify: at phase close the registry lists 32 assignable video templates (27 shorts/long + 5 doc) across all 10 launch niches with ≥2 story structures in every niche, each with niche, formats, family, review class, and variation rules visible in `/templates/registry`.

- Steps:
  1. `node sync-template-registry.mjs` — exit 0, `placed/updated: 32 of 32`.
  2. DB-CHECK: `select count(*) from template_registry_index` → 32 (SELECT-side only — the count is READ from the DB, never INSERTed by hand).
  3. `/templates/registry` (visual): 32 cards; screenshot desktop 1440. Count audit in Actual: 27 video + 5 doc; per-niche totals per D7 (history 4+1doc, finance 3+1+1doc, health 3+1doc, tech 2+1doc, science 3+1doc, psychology 2, motivation 2, productivity 2, business 3, travel 2) — reconcile everywhere (the P-I1 count-drift lesson).
  4. Automated: the catalog-integrity suite — every entry validates; every niches[] string ∈ D17 (the pin re-run over the full catalog); formats ⊆ the bound family's aspectRatios.
- Expected: 32 ≥ 30; every niche assignable from the panel.
- Boundary probe: remove one template's block and re-sync — the removal-refused guard keeps an actively-assigned entry alive (R5), and a count of 31 would fail the exit gate; restore.

#### Row 18 — AC-P5-9 · "in the catalog" means every D6 gate row quoted — per template · `manual (owner) + automated`

Verify: a template counts toward the exit gate only when its full QA gate row has quoted evidence: (a) dry-sync validates; (b) assignment validation passes on a niche-matched channel; (c) one forced generation matches `story_structure` in plain English; (d) the variation gate ran at the template's thresholds; (e) medical/finance class held at `/review` (per-CLASS proof — Drill B, not per-template); (f) candidates emitted where picking is on; (g) the OWNER read the forced generation; (h) the produced title matches `title_patterns`. Discipline: force_doc + state edits + test today — no gate row waits for a calendar day.

- Steps: the gate is applied per template via the table below. Machine checks (a),(b),(d),(f) batch-run: `node sync-template-registry.mjs --dry` (exit 0, all blocks), the assignment-validator suite, the thresholds suite, the candidates suite. Live checks (c),(f),(g),(h) ride each template's forced produce (dispatch + state edits per the directive — a batch of N templates = N forced produces on eligible MR-legal channels or MR itself where the niches match; non-MR live produces wait for the directive's gate and are recorded as deferred with the criterion unit-pinned).

#### Row 18g — AC-P5-9(g) · the owner-reads-the-generation row · `manual (owner)`

Verify: for each accepted template the owner's OWN eyes passed over one real forced generation — an LLM drafted these blocks, so a human read is the quality gate (spec Honest Limits). Evidence: a dated 2–3 sentence verdict per template in the table below ("reads like the channel / would ship / fix X"), signed by having been written in this file.

- Steps: at each template's forced produce, open `/review` (or the generated script record), read the whole script, write the verdict in the template's table row BEFORE approving anything.
- Expected: no template is ACCEPTED on machine checks alone.

#### Row 18h — AC-P5-9(h) · the title-pattern row · `automated` + `manual (owner)`

Verify: the produced title matches the template's declared `title_patterns[]` (e.g. the pilot's `$`-figure numbered listicle). Evidence per template: the produced title quoted next to the pattern it matches.

- Steps: at each forced produce, quote the video's title in the table row; eyeball-match against the block's `title_patterns[]` (a `node -e` one-liner over the scripts row's title vs the registry block is welcome; the owner's confirm is the check).
- Expected: titles are template-driven data, not channel accidents.

#### Per-template QA gate table (fill at run time — one line per NEW template; the 7 legacy entries keep their Phase 1–4 evidence and are not re-gated)

| # | template_id | class | (a) dry-sync | (b) assign | (c) shape | (d) thresholds | (e) class held | (f) candidates | (g) owner read | (h) title | ACCEPTED |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 8 | myth-vs-money (PILOT) | finance | | | | | via Phase 4 | | | | |
| 9 | habit-protocol | medical | | | | | via Drill B | | | | |
| 10 | myth-vs-science | medical | | | | | via Drill B | | | | |
| 11 | sleep-ritual | medical | | | | | via Drill B | | | | |
| 12 | shift-explainer | — | | | | | n/a | | | | |
| 13 | tool-teardown | — | | | | | n/a | | | | |
| 14 | explain-it-diagram | — | | | | | n/a | | | | |
| 15 | science-fact-stacks | — | | | | | n/a | | | | |
| 16 | paper-editorial | — | | | | | n/a | | | | |
| 17 | dark-psychology-defense | — | | | | | n/a | | | | |
| 18 | social-rule | — | | | | | n/a | | | | |
| 19 | quote-principle | — | | | | | n/a | | | | |
| 20 | stoic-case-study | — | | | | | n/a | | | | |
| 21 | deep-work-rule | — | | | | | n/a | | | | |
| 22 | focus-ritual | — | | | | | n/a | | | | |
| 23 | founder-autopsy | — | | | | | n/a | | | | |
| 24 | pricing-principle | — | | | | | n/a | | | | |
| 25 | deal-move | — | | | | | n/a | | | | |
| 26 | map-strategy | — | | | | | n/a | | | | |
| 27 | country-ledger | — | | | | | n/a | | | | |
| 28 | doc-history-rise-fall | — | | | | | n/a | | | | |
| 29 | doc-money-weekly | finance | | | | | via Phase 4 | | | | |
| 30 | doc-shift-briefing | — | | | | | n/a | | | | |
| 31 | doc-science-explained | — | | | | | n/a | | | | |
| 32 | doc-evidence-review | medical | | | | | via Drill B | | | | |

### I — Cross-slice + exit gate

#### Row 19 — AC-P5-19 · zero code edits for a full per-niche channel configuration · `manual`

Verify: a channel in ANY launch niche is configured end-to-end (niche + ONE active video template via assign-or-swap + thumb set + BYOK coverage check + cadence) with no code edit at any step. Executed by Drill A (per niche, across the phase); this row holds the criterion and collects the per-niche verdicts.

- Steps: run Drill A per niche; record each niche's PASS (or its deferred-produce note per the MR directive) here:
  - travel: ____
  - tech/AI: ____
  - science: ____
  - psychology (both strings): ____
  - motivation: ____
  - productivity: ____
  - health (trio): ____
  - business (trio): ____
  - finance cluster (proven live by P-2/P-3): ____
  - wisdom/psychology live channel (QQ): ____
- Expected: every step panel-or-data; any code edit fails the drill.
- Boundary probe: the drill's own definition — a missing niche string in the wizard (D17's three NEW strings absent) is a build gap, not a drill failure; record and fix in code, re-drill.

#### Row 20 — AC-P5-20 · the legacy 7 and Phase 4 behaviors continue exactly as today · `automated` + `manual`

Verify: the legacy 7 sync, assign, pin, and gate with zero drift (template_id absent = family id); removal-refused stays; `review_thumb_pick` Phase 4 candidate behavior unchanged (Phase 5 changes only WHERE candidates 2..N come from).

- Steps:
  1. Automated: `node --test tests/template-registry.test.mjs tests/template-registry-db.test.mjs tests/review-seams.test.mjs` — the legacy-identity cases (absent template_id resolves as the family id everywhere); the removal-refused guard case; the Phase 4 candidate pins re-run (count from template DATA, candidate 1 frame, M7 unpicked-ships).
  2. [local] `node sync-template-registry.mjs --dry` pre- and post-catalog-authoring — the 7 legacy entries sync identically both times.
  3. Live: MR (or any legacy-assigned channel) — pre-pilot dispatch log shows `[template] enforce: finance-explainers @ …` exactly as Phase 4 logged it.
- Expected: Phase 5 is additive for everything that exists.
- Boundary probe: assignment created BEFORE Phase 5 (old rows) still resolve — the DB identity migration keeps old rows legible (no orphaned assignments after T1).

---

## Exit-gate drills (force_doc / state-edit / same-day discipline; evidence quoted in this file)

### Drill: MR swap pilot — executed as Rows P-1/P-2/P-3 above

The pilot is the phase's FIRST drill (Ruling 4 + the MR directive): author only myth-vs-money, swap it onto money-rulebook structure-faithfully, force one produce, soak same-day. Its step-by-step script lives in Rows P-1 → P-2 → P-3 — no separate script here, so there is exactly one place to fill. Evidence slots: P-1 (gate rows a–h), P-2 (swap + audit), P-3 (produce log lines + soak). Exit criterion: the owner declares MR fine; only then do T4+ batches start.

- Actual:
- Evidence:
- Status:

### Drill A — AC-P5-Drill-A · zero-code channel configuration, per launch niche · `manual`

Proves AC-P5-19. Configure a channel fully from data — kit niche string (D17) → assign ONE video template (swap where one is active) + a thumb set in the panel → BYOK capability check passes → cadence saved (gate cron re-derived per the existing T4a flow) → one forced produce publishes (or holds correctly if the template is gated). PASS = every step in the panel or in data files; any code edit FAILS the drill.

- MR-directive adaptation (baked in, cited): the spec recommends travel (a niche with no live channel). The CONFIG walkthrough (steps 1–6) runs data-only on the travel niche — no token, no spend, no revival rollout. The forced-produce half (step 7) runs on **money-rulebook only** for the phase's first pass (it is P-3 — cross-reference; a finance-legal template on MR), and a niche's own produce half executes only when that niche's channel is actually onboarded (or the owner explicitly orders it, declaring MR fine). A per-niche PASS with steps 1–6 green + step 7 cross-referenced to P-3 is a full Drill-A PASS for the finance cluster; other niches record "config proven, produce deferred per the MR-pilot directive" until onboarding.
- PREP:
  1. Confirm T1 landed (the three NEW niche strings in `studio/lib/niches.js` — `node -e "console.log(require('./studio/lib/niches.js').NICHE_CATALOG)"` shows 'Science & how things work', 'Travel & geography explained', 'Human psychology & social dynamics').
  2. Note today's date; screenshot slots go into Actual.
- CONFIG (data only, zero code):
  3. Panel `/channels/add` wizard → pick the niche string EXACTLY ('Travel & geography explained') — the wizard catalog offers it verbatim (evidence: screenshot of the picker).
  4. Template panel → assign ONE template (map-strategy first) → Assign & pin. DB-CHECK the active row (one row, `active = true`).
  5. Thumb set: channel kit `thumbTemplates` set to 2–3 ids from Row 11's launch set via the channel panel (T4d kit merge protects the other keys — DB-CHECK the kit JSONB afterwards: `thumbTemplates` present, `destinations`/`gateCron` intact).
  6. BYOK coverage check: `/providers` — the channel's required capabilities (script-gen/tts/captions baseline + any vault refinement) covered; the assign path's capability map already passed in step 4 (it would have refused otherwise).
  7. Cadence: scheduling panel → slots/docDay saved; DB-CHECK the kit's cadence keys + the derived gate cron (the existing T4a re-derivation).
- PRODUCE:
  8. Finance cluster pass: this is P-3 (already executed) — cross-reference. Other niches: record DEFERRED per the directive, or dispatch `gh workflow run channel-autopilot.yml -f channel=<slug>` when the owner orders onboarding — expect publish (un-gated template) or a clean generate-only hold (gated template).
- PASS checks (per niche): every step's evidence is a screenshot, a DB-CHECK row, or a data-file diff; `git diff` on the repo during the drill shows ONLY the QA file/registry data changing — any `.mjs`/route change = FAIL.
- CLEANUP: for a data-only drill, keep the configured channel (it is the Phase 6 onboarding seed) or tear it down via the panel (unassign + clear kit keys) — panel actions only.

- Actual:
- Evidence:
- Status:

### Drill B — AC-P5-Drill-B · per-class routing + identity-invariant pin (myth-vs-science) + fail-closed tiering live · `manual` + `automated`

Proves AC-P5-6/AC-P5-18/AC-P5-9(e) live. Part 1: on the real catalog template **myth-vs-science** (medical class on the finance-associated `stats-counters` family — class DIFFERS from family, principal I7), a forced generation with an unverified fixture claim holds at `/review`, nothing renders/uploads, and all four identity homes resolve to `myth-vs-science`. Part 2: a forced near-duplicate on a template with explicit thresholds BLOCKs fail-closed (the D3/AC-P5-6 fix proven live, not the old WARN-downgrade). Finance is already live-proven (Phase 4); `all` gets one hold proof.

- MR-directive adaptation (baked in, cited): no health channel holds a live token today (the health kits are parked with dead grants — Phase 4's importer QA), and the directive forbids re-auths until MR is declared fine. Two legal variants prove the identical criterion:
  - **Variant 1 (spec-literal, runs at first health onboarding):** as written below, on a live health-niche channel wearing myth-vs-science.
  - **Variant 2 (MR-legal stand-in, runs this phase):** a DISPOSABLE drill template — `template_id: 'qa-drill-medical'`, `family: 'stats-counters'`, niches = one finance-cluster string (MR-legal), `review_required: ['medical']`, thresholds ≤ 0.80/0.85, one fixture claim authored unverified — synced and swapped onto MR. The class-differs-from-family invariant holds identically (medical on the finance-associated family). Phase 4's Drill 3 precedent. Delete after, per cleanup.
- PREP (Variant 2 written out; Variant 1 substitutes the template + channel):
  1. Author the drill block per the above into `REGISTRY_META` (DATA edit); `node sync-template-registry.mjs`; confirm the card on `/templates/registry` with its `medical` chip.
  2. Note MR's current template (post-pilot: myth-vs-money) for restore.
  3. Swap `qa-drill-medical` onto MR (P-2's procedure — this is ALSO a second live swap for Row 3's evidence).
- HOLD (identity + class proof):
  4. Author the fixture claim unverified (the block's variation rules say "QA drill — claims are fixtures, never ship"; the script's claim panel must show a non-verified claim).
  5. `gh workflow run channel-autopilot.yml -f channel=money-rulebook` → generate-only hold. PASS check A: `/review` shows the script with its flagged claim; DB-CHECK `select template_id, status from scripts order by created_at desc limit 1` → `qa-drill-medical`, `awaiting_review`; nothing rendered, nothing uploaded, video count unchanged.
  6. PASS check B (identity, four homes): (a) assignment row id; (b) `/templates/registry` card id; (c) the scripts row's `template_id` (step 5); (d) the run log's `[template] enforce: qa-drill-medical @ v…` — all four strings identical. THE INVARIANT: a medical class arrived through the finance-associated stats-counters family with zero drift.
  7. Approve path: approve → resume renders → upload → delete the drill video (cleanup). Reject path (second dispatch): reject → it never uploads.
- TIERING (Part 2, fail-closed near-dup):
  8. Force a near-duplicate: dispatch twice the same day (topup=1) so the second generation meets the first's fresh embedding — or, if the seed rotation (by design) picks a different theme, temporarily restore the first run's topic directive in the state DATA (directive-sanctioned state edit; revert after) so walk 1 meets it.
  9. PASS check C: the log shows `[brain-dedupe] … verdict=BLOCK` with NO "(BLOCK downgraded…)" suffix (the old non-finance downgrade is gone for gated classes), the walk retries with vary-guidance, and on exhaustion the lane holds/skips — NOTHING published. DB-CHECK: no new uploaded script row for the drill template beyond the approved one.
- `all`-class proof:
  10. One more disposable block with `review_required: ['all']` (or flip the drill block's class) → one forced generation holds → PASS check D. Revert.
- CLEANUP:
  11. Unassign the drill template; restore myth-vs-money (P-2's swap procedure — audit row again).
  12. Remove the drill block(s) from the data file; `node sync-template-registry.mjs`; card gone from `/templates/registry`. The `medical`/`all` classes REMAIN in the validator (D17).
  13. Delete drill uploads (YouTube Studio) and drill rows: `delete from script_claims where script_id in (select id from scripts where template_id like 'qa-drill%'); delete from script_sources where script_id in (select id from scripts where template_id like 'qa-drill%'); delete from scripts where template_id like 'qa-drill%';` + the drill jobs/artifacts (phase 4 cleanup pattern). Never registry rows.
- Automated companions: `node --test tests/review-gate.test.mjs` (tiering truth table, Row 8) and the identity suite (Row 4) — run the same day; the drill is their live witness.

- Actual:
- Evidence:
- Status:

### Drill C — AC-P5-Drill-C · thumbnail candidates from the registry, end-to-end · `manual` + `automated`

Proves AC-P5-12/13/14 live. On an enabled gated channel with an assigned needsPhoto:false set: one forced render produces candidate 1 (frame) + registry candidates wearing kit tokens; a `/review` pick before publishAt swaps via `thumbnails.set`; a rotation check confirms no back-to-back layout repeat; a 0-eligible fallback check confirms the single frame path.

- MR-directive fit: the enabled gated channel IS money-rulebook (pilot template is finance-gated; finance templates ship `review_thumb_pick: true` — verify the pilot block carries it too, or enable picking in the panel per OQ-4's launch default).
- PREP:
  1. MR's kit `thumbTemplates` = 2–3 launch-set ids covering finance (e.g. from the luxury/doc-style/quote false-pool entries) — set via the panel (Drill A step 5's procedure); DB-CHECK the kit JSONB.
  2. Note MR's next publishAt (kit slots) — the pick must land BEFORE it to apply.
- RENDER:
  3. Dispatch the produce (reuse P-3's or Drill B's forced run if same-day — one spend, two drills). DB-CHECK: `select kind, count(*) from job_artifacts where job_id = '<job id>' and kind like 'thumb%' group by kind` — frame rows + N−1 registry renders. PASS check A: candidate 1 is the frame (hash differs from the registry renders); the registry renders carry the kit's accent/bg tokens (eyeball via `/review`'s candidate strip — token-authenticated `/api/review/thumb` images).
- PICK:
  4. Before publishAt: pick candidate 2 at `/review` → `thumbnails.set` fires (~50 quota units — see `/usage`). PASS check B: the live video's thumbnail changes to the picked render. (After publishAt, a pick is recorded-not-applied — Phase 4 D18; only if a second drill window exists.)
- ROTATION:
  5. Second forced render (same day): PASS check C — the new pick's layout id ≠ the previous pick's (state-file last-used id + the two ids quoted).
- FALLBACK:
  6. 0-eligible check (no re-dispatch needed if unit-green): clear `thumbTemplates` (panel) and confirm the NEXT render ships the single frame candidate byte-identical — or cite the automated golden (Row 14) as the live-equivalent evidence and restore the set. Restore `thumbTemplates`.
- CLEANUP: restore the pre-drill thumbnail via `/review`/thumbnails.set if the picked look must not ship; delete the drill video if it was a throwaway; state edits reverted.

- Actual:
- Evidence:
- Status:

---

### Row P5-fix-1 — the doc generate-only save tolerates sources-less records (live MR pilot, run 41482343689) · `automated`

- Steps: `node --test tests/script-store.test.mjs tests/review-seams.test.mjs` — the store pins (a sources-less record and a malformed non-array sources field both SAVE with zero source/claim rows, never a throw; a real sources/claims record still lands all its rows) and the doc generate-only spawn whose store wraps the REAL makeScriptStore over a fake db (the pilot's exact crash surface: the real saveScript persists the sources-less doc record, ok:true, 0 sources, 0 claims).
- Expected: the desk is never empty because a doc lane's honest sources-less record crashed the save after validation had already tolerated the shape; the write is as tolerant as the validation, and the /review desk's flagged-claims panel surfaces required-sources docs as unsourced until the owner attaches sources.
- Actual:
- Evidence (quoted log/output):
- Status:

---

## Regression — pinned invariants

These hold across the whole phase. Any FAIL here blocks sign-off even if every feature row passes.

### Row R1 — the unassigned-channel byte-identity pin (AC-P5-3's ELSE branch) · `automated`

- Steps: `node --test tests/registry-lanes.test.mjs` (or the prompt golden's home) — an unassigned channel's prompt is byte-identical to the pre-Phase-5 golden (record the fixture hash at T1 and re-run at every later task); the legacy-template path (assignment present, no `story_structure`) keeps today's kit `structureLine` byte-for-byte. Thumb twin: a no-thumb-set channel keeps the single frame candidate (Row 14's golden).
- Expected: template-less lanes cannot drift by accident while the catalog grows.
- Boundary probe: assign a template with an EMPTY `story_structure` object (authoring edge — validator rejects on new, but assert the code's absent-vs-empty handling) — treat absent and empty identically (kit line), never as "template declared, render an empty beat plan".

### Row R2 — the legacy-4 channels' lanes unchanged · `automated` + `manual`

- Steps: the four active channels (quotequarry, investors-compass, money-rulebook, debt-free-doctrine) keep today's behavior: `node --test tests/pipeline-jobstore.test.mjs tests/review-gate.test.mjs` (the flags-off/legacy pins re-run green over the Phase 5 edits); their existing assignments (the finance/wisdom templates) still enforce, hold, and produce identically except where a deliberate swap happened (MR's pilot — audit-trailed). Live: each channel's next scheduled run completes green (Actions tab) — MR's per P-3's soak, the other three on their normal crons the same day.
- Expected: Phase 5 changes nothing for a channel until its owner action changes data.
- Boundary probe: a legacy-4 channel with a PRE-Phase-5 assignment row (old schema) resolves cleanly through the new identity path (Row 20's migration probe covers it; quote the row here too).

### Row R3 — finance tiering unchanged · `automated`

- Steps: `node --test tests/review-gate.test.mjs tests/registry.test.mjs` — the finance cells of the tiering truth table produce byte-identical verdicts pre/post T1: BLOCK+finance → retry/hold (fail-closed), gate-down+finance → fail-closed, finance templates' explicit thresholds (finance-explainers/stats-counters/chart-animations) resolve exactly as Phase 3 shipped.
- Expected: the D3 fix EXTENDS fail-closed to other classes; it never LOOSENS finance.
- Boundary probe: `financeGated` remains derived from `review_required` containing 'finance' — a template with BOTH 'finance' and 'medical' takes the same fail-closed path (union semantics, not override).

### Row R4 — the review-class vocabulary is closed and stable · `automated`

- Steps: `node --test tests/template-registry.test.mjs` — `ALLOWED_REVIEW_REQUIRED` is exactly `['health','finance','medical','all']` (`template-registry.js:9`); 'health' remains valid-but-unused in v1 (OQ-6 — assert no catalog entry ships it, and that the validator would still accept one); an unknown class ('ymyl') is rejected with the named vocabulary error.
- Expected: adding a class later is a one-line vocabulary change with this pin guarding the meaning.
- Boundary probe: Drill B's cleanup leaves `medical`/`all` in the validator even after the drill blocks are deleted — the vocabulary is code, drill templates are data (Phase 4's D17 precedent).

### Row R5 — the sync validation vocabulary + removal-refused guard · `automated` + `manual [local]`

- Steps: `node --test tests/template-registry.test.mjs tests/template-registry-db.test.mjs` — the named-error vocabulary (semver, date, formats, capabilities, review classes, all-errors-collected) unchanged; `removal-refused` keeps refusing to delete an actively assigned entry (sync exit 1, entry alive). [local] Live: with the full 32-entry catalog, remove one actively-assigned block in a scratch copy → `node sync-template-registry.mjs --dry` still exits 0 (dry resolves input only), the REAL sync exits 1 with `removal-refused: 1` naming it; revert.
- Expected: the registry's guard rails survive the 4.5x catalog growth.
- Boundary probe: an entry deactivated-but-assigned (deprecated flag) — deprecation refuses NEW assignments (`deprecated_template`) but never triggers removal-refusal for still-active assignment rows.

### Row R6 — the Phase 4 candidate seam unchanged · `automated`

- Steps: `node --test tests/review-seams.test.mjs tests/script-store.test.mjs` — the Phase 4 pins re-run green over the Phase 5 wiring: candidate count from template DATA (truthy=3, numeric honored, absent=1); `thumbFrameOffset(0)===3`; M7 unpicked-candidate-1-ships; before/after-publishAt swap semantics; private bytes only via the token-authenticated hash-verifying endpoint. Phase 5's change is confined to WHERE candidates 2..N come from (registry renders) — assert the source-switch cell (picking on + registry set → registry renders; picking on + no registry set → today's staggered frames).
- Expected: Drill C exercises a superset of Phase 4's behavior; nothing Phase 4 shipped regresses.
- Boundary probe: a template with `review_thumb_pick` ON but NO registry set — today's 3 staggered FRAME variants, not 1 (the count comes from the template data; the SOURCE is the only change).

### Row R7 — whole suite + Studio build green · `automated`

- Steps: `npm test` at repo root (all suites incl. the new Phase 5 files) and `cd studio && npx next build` — both exit 0; the route table keeps every pre-existing page and shows only additions.
- Expected: zero regressions against the pre-Phase-5 baseline (post-Phase-4 baseline: 631/631 at 2026-10-31; re-baseline at T1).
- Boundary probe: the vocabulary pin test runs inside `npm test` — a paraphrase slipped into any registry block fails the WHOLE suite, not just one file.

---

## Summary

Checklist rows: **35 = 20 AC rows + 2 named AC-P5-9 sub-rows (18g owner-read, 18h title-pattern) + 3 MR-pilot rows (P-1/P-2/P-3) + 3 drill rows (A/B/C) + 7 regression rows**, plus the per-template QA gate table (25 NEW-template slots; the 7 legacy entries are not re-gated). Coverage map (no AC merged or split silently): AC-P5-1→R1; 2→R2; 17→R3 (+P-2 live, Drill B step 3); 18→R4 (+Drill B); 10→R5; 3→R6 (+P-3 live, R1 pin); 5→R7 (+P-3 log); 6→R8 (+Drill B part 2); 7→R9; 4→R10 (+P-3 live); 11→R11 (+Drill C); 12→R12 (+Drill C); 13→R13 (+Drill C); 14→R14 (+Drill C fallback); 15→R15; 16→R16; 8→R17; 9→R18 (+18g/18h + the pilot's P-1 execution); 19→R19 (+Drill A); 20→R20; Drill-A/B/C→their scripts; P-1/P-2/P-3→the pilot. The "Resolved by review" findings land where proven: swap-not-stack (R3/Drill A), medical fail-closed (R8/Drill B), doc threading before doc QA (R15→R16 ordering discipline), MR structure-faithful pilot (P-1), deterministic disclaimers (R10), gated-template picking limitation (R12/R14 probes), needsPhoto:false ground truth (R11's 17-design note), counts reconciled to 32 (R17's audit), immutable skeleton + line-by-line assembly (R6), finance cluster niches (R1/R17), vocabulary pin (R1/R4/R17), owner-read + title-pattern rows (18g/18h), identity invariant on a class-differs-from-family pairing (R4/Drill B), psychology dual strings (R17's per-niche audit), minor sweep folded throughout.

---

## Execution summary — (fill at run time)

Executor: ____
Date(s): ____

- **Scope of this pass:** ____ rows executed (of 35 + the 25-slot table).
- **PASS: ____** (fully executed ____ / automated-or-half with the owner half parked: rows ____, per the MR directive's deferral list).
- **NOT-RUNNABLE-TODAY: ____** — each with its reason (owner session / dispatch permissions / deferred per the MR-pilot directive / waiting on a build task): ____
- **FAIL rows: ____** (none expected; any FAIL blocks sign-off).
- **Build-order discipline record:** T1 regressions green before authoring? ____ / P-1..P-3 green before T4? ____ / R15 before any doc-template QA? ____ (dates).
- **Counts audit:** registry 32 (27 video + 5 doc) — DB-CHECK quoted ____; thumb registry ≥15 (17-design pool note) — ____; per-niche ≥2 structures — ____.
- **Drill evidence recap:** P (MR swap + produce + soak) — ____; Drill A per niche — ____; Drill B (identity four-homes + fail-closed BLOCK + `all` hold) — ____; Drill C (candidates + pick + rotation + fallback) — ____.
- **Deferred per the MR-pilot directive:** other-channel live produces + re-auths — listed with their unit-pin substitutes: ____
- **Baseline:** `npm test` = ____; `cd studio && npx next build` = ____.
- **Verdict:** ____
