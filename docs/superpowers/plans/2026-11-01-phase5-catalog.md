# Phase 5 Implementation Plan — Catalog Fill-Out (30+ Templates + Thumbnail Registry)

Spec: `docs/superpowers/specs/2026-11-01-phase5-catalog-spec.md` (v2, owner-approved rulings folded).
QA file: `docs/qa/phase5-catalog-qa.md` (35 rows + the 25-slot per-template gate table — written at T0, before any code).
Master plan: `docs/superpowers/plans/2026-10-25-platform-own30-master.md` Phase 5 (§3, lines 165–171). This plan elaborates the spec's T1–T9 ordering contract into parallel-safe tasks.
Method: subagent-driven development — parallel batches of disjoint-file tasks, a FRESH reviewer per task, fix rounds ≤5, honest ledger `.superpowers/sdd/2026-11-01-phase5/progress.md`. Data tasks (template blocks) are reviewed by a fresh spec-conformance reviewer + the owner checklist (D5) before ACCEPTED. The phase is DATA-heavy by design: 7 code tasks, 5 authoring batches, 1 pilot.

## Decisions inherited from the spec and rulings (do not reopen)

- **Single assignment, swap semantics (D19 / Ruling 1):** one active assignment per channel; assign-over-active deactivates the prior row + audit entry; multi-template alternation is Phase 6.
- **Identity invariant (D19 / principal I7):** one string, four homes — assignment row, registry key, brain gate (`resolveTemplateId`), review-gate meta lookup — always identical.
- **MR-pilot-first (Ruling 4 + owner directive `money-rulebook-pilot-directive`):** author ONLY myth-vs-money, structure-FAITHFUL to the money-rulebook kit (4 points × 9–12 words, numbered money listicle, $-figure titles), swap onto money-rulebook (MR), one forced produce, compressed same-day soak — THEN mass authoring. Every live proof runs on MR first; other channels wait until the owner declares MR fine.
- **Immutable shorts skeleton (D2):** `hook + points[≥4] + closing` never changes; beats are point-slot constraints; prompt assembly per the D2 line-by-line spec; unassigned channels stay byte-identical.
- **Brain tiering (D3 / AC-P5-6):** fail-closed BLOCK for ANY non-empty `review_required`; `review_required: []` / absent keeps today's WARN-downgrade; medical blocks pin `variation_threshold ≤ 0.80` AND `cross_channel_threshold ≤ 0.85` (validator-enforced).
- **Disclaimers are deterministic (D4 / Ruling 5):** fixed verbatim texts machine-appended to the upload DESCRIPTION at publish time + a contains() save gate that fails the save when a finance/medical record lacks its text. Never prompt-hoped.
- **Thumbnail launch set (D10 / Ruling 6):** needsPhoto:false designs ONLY. Ground truth (QA Row 11, verified 2026-11-01): the pool is **17 designs** — `blackout, whitespace, focal-cut, big-number, price-fight, slab-quote, serif-frame, gold-standard, terminal, bungee-sign, redact, ledger, screen, plinth, coinflip, marquee, pillar` — so the launch set ships at 17 (or repeats a design under a second niche binding for 18); the ≥15 exit gate holds either way. Spec-exemplified ids that are needsPhoto:true (marble, field-notes, dossier, data-callout, changelog, question-economy, tease-chip, ketchup, summit, split-verdict, badge-circle) are OUT.
- **Doc threading before doc QA (Ruling 3 / AC-P5-15):** the `yt-deepdive.mjs` threading slice lands and proves its own QA rows BEFORE any doc template's QA gate row executes. Foreign format = loud skip.
- **Niche vocabulary closed (D17):** exact-string matching; `studio/lib/niches.js` gains the 3 NEW canonical strings ('Science & how things work', 'Travel & geography explained', 'Human psychology & social dynamics') **as a T1 gate** (QA Drill A PREP step 1 checks it); CI pin test rejects any paraphrase.
- **No new visuals (D18); Urdu is a decision card, no build (D16).** No new Remotion families; no language-parameterized templates.
- **QA standing directives:** no calendar waits (force_doc / `-f topup=N` / state-kit DATA edits reverted after / same-day checks); registry data through the front door only (data files → validator → sync CLI; never hand-DB edits to registry/assignment/audit tables — DB-CHECK is SELECT-side evidence only, plus phase-4-sanctioned drill-owned row cleanup for jobs/scripts/artifacts).

## File-ownership map (the parallelism contract)

Disjoint = parallel-safe. Shared files are listed with hunk boundaries and a landing order; reviewers verify no cross-hunk drift.

| File | Owner (hunk) | Landing order |
|---|---|---|
| `studio/lib/template-registry.js` (validator) | T1 owns wholly: template_id/family defaulting, story_structure required-on-new + beats ≤ point count, disclaimers-required-when-medical/finance, D17 vocabulary pin. T2b adds ONE rule after T1: the medical ≤0.80/≤0.85 pins | T1 → T2b |
| `youtube-engine.mjs` | T1: identity hunk — `resolveTemplateId` (:642 region) + `registryThresholds` (:618–634). T2a: prompt-assembly hunk — :767–789 + template-meta consumption (:800). T2b: dedupe hunk — the BLOCK branch (:722/:731/:735), one line | T1 → T2a → T2b |
| `lib/review-seams.mjs` | T2c: save-gate hunk (contains() + `appendDisclaimers` helper). T2d: candidate-source hunk (`emitThumbCandidates` registry switch) | T2c → T2d |
| `sync-template-registry.mjs` | T1: template_id identity. T2d: `--thumbs` mode (separate flag) | T1 → T2d |
| `yt-deepdive.mjs` | T2e only (threading slice) | — |
| `yt-daily.mjs` + `longvideo/shorts-clips.mjs` | T2c only — the publish `snippet.description` append call-sites (yt-daily.mjs:239/:598 pattern; implementer confirms the longvideo site) | — |
| `studio/lib/niches.js` | T1 only (+3 strings) | — |
| `studio/lib/template-registry-db.js` | T1 only (identity migration for pre-Phase-5 rows + swap semantics) | — |
| `lib/template-preflight.mjs`, `lib/review-gate.mjs` | T1 only (kind-safe template_id reads) | — |
| NEW `studio/lib/thumb-registry.js` (loader) + NEW `studio/lib/thumb-registry.data.js` | T2d creates the loader + schema; T4 authors entries into the data file | T2d → T4 |
| `studio/lib/template-registry.data.js` | CODE tasks never author into it (tests use fixtures). P-1 authors the pilot block; γ batches append via the integrator — single writer at any moment | P-1 → γ1 → γ2 → γ3 → T6 |
| Studio surfaces (`studio/app/templates/*`, `studio/app/channels/*`, `studio/app/channels/add/page.js`, `studio/app/thumbs/page.js`) | T2f (templates gallery + wizard + panel) and T2d (thumb surfaces) — disjoint routes | deploy `cd studio && vercel --prod` per push (memory `vercel-deploy-pattern`) |
| `tests/*` | each task adds/extends its own suite files; no two tasks edit the same test file | — |

Pipeline touches stay flag-gated with byte-identical rollback (house pattern). No live Neon or live YouTube in unit CI.

## Tasks

### T1 — S-A foundation: identity split + swap semantics + validator v2 + niche vocabulary (Batch α — everything gates on this)
- NEW schema v2: registry entries gain optional `template_id` + `family` (must exist in `TEMPLATES_DATA`); key = template_id, absent ⇒ defaults to family id — the legacy 7 keep identity, assignments, pinned majors untouched (D1).
- `studio/lib/template-registry.js`: the validator extensions — template_id/family; `story_structure` required-on-new with `beats[] ≤` kit/lane point count; `disclaimers` required when class is medical/finance; **D17 pin test** (every `niches[]` string ∈ the closed vocabulary).
- `studio/lib/template-registry-db.js`: assignment identity switches to template_id; **swap semantics** — assign-over-active deactivates the prior row + writes `template_assignment_audit`; never two active rows (D19); migration keeps PRE-Phase-5 assignment rows legible (Row 20 probe: no orphaned assignments).
- `sync-template-registry.mjs`: template_id-aware resolution; all-errors-collected output preserved.
- `lib/template-preflight.mjs` (:145) + `lib/review-gate.mjs`: kind-safe reads by template_id (meta lookup never falls back to the family's historical association).
- `youtube-engine.mjs` identity hunk only: `resolveTemplateId`/`registryThresholds` resolve the assignment's id.
- `studio/lib/niches.js`: +3 canonical strings (the T1 gate).
- Tests: `tests/template-registry.test.mjs` (named rejections, legacy acceptance, vocabulary pin, medical-pin readiness), `tests/template-registry-db.test.mjs` (swap, never-two-active, migration), `tests/review-gate.test.mjs` + `tests/template-preflight.test.mjs` (identity cases), `tests/registry.test.mjs` (`registryThresholds` truth table).
- Spec: D1, D2 (validator half), D4 (validator half), D17, D19, AC-P5-1/2/17/18/20. **QA rows: 2, 3 (auto), 4 (auto), 20, R2/R3/R4/R5 pins; re-baselines R7.** Feeds: Drill A PREP (niches strings), Drill B (identity companions), every later task.
- Review: fresh code-reviewer subagent. **The gate every other task waits on.**

### T2a — S-B story_structure threading (needs T1)
- `youtube-engine.mjs` prompt hunk ONLY, per the D2 line-by-line contract: `styleLine`/`themeLine`/`trendBlock`/`pacingRule` unchanged (kit-owned); kit `hookRule` stays, `hook_classes[]` APPENDS one constraints line; kit `titleRule` replaced by the template's `title_patterns[]` when declared, else stays [T2a Ruling: REPLACE]; `structureLine` REPLACED by the rendered numbered beat plan only when the template declares one, else today's kit line; JSON-contract line untouched; brain `/context` appended last. Absent and empty `story_structure` treated identically (kit line).
- Tests: `tests/registry-lanes.test.mjs` — the line-by-line assembly cases + the **byte-identity golden** (unassigned/legacy prompt equals the pre-Phase-5 string; record the fixture hash at this task and re-run it at every later task — Row R1).
- Spec: D2, AC-P5-3. **QA rows: 6 (auto golden + boundary), R1.** Feeds: P-3 live half, Drill A, every γ batch's shape checks.
- Review: fresh code-reviewer subagent.

### T2b — S-C brain tiering + medical threshold pins (needs T1 validator + T2a engine commit)
- `youtube-engine.mjs` dedupe hunk ONLY — the D3 one-liner: fail-closed extends from `financeGated` to ANY non-empty `review_required` (`:722` gate-down cell, `:731` downgrade condition, `:735` BLOCK branch); class-less (including `review_required: []`) keeps the WARN-downgrade exactly as today.
- `studio/lib/template-registry.js` (after T1): medical blocks must pin `variation_threshold ≤ 0.80` AND `cross_channel_threshold ≤ 0.85` — missing, loose, or partial pins rejected with named errors.
- Tests: `tests/review-gate.test.mjs` + `tests/registry.test.mjs` (Row 8's full truth table incl. the empty-array cell and gate-down cells), `tests/template-registry.test.mjs` (Row 9's boundary cases: 0.81/0.86 rejected, 0.80/0.85 accepted, partial pin rejected).
- Spec: D3, AC-P5-6/7. **QA rows: 8, 9, R3.** Feeds: Drill B part 2 (fail-closed live), γ3 (medical authoring bar).
- Review: fresh code-reviewer subagent.

### T2c — S-D disclaimers (parallel-safe with T2a; must land before P-3)
- `appendDisclaimers` helper (template's `safety.disclaimers[]` appended verbatim) + wire at the publish `snippet.description` sites (`yt-daily.mjs:239/:598` pattern + the `longvideo/shorts-clips.mjs` upload block — implementer confirms the exact site; append is UNCONDITIONAL in code for declaring templates).
- `lib/review-seams.mjs` save-gate hunk: contains() check at script save — a finance/medical record lacking its fixed text in narration or the machine-appended description FAILS the save (fail-closed); `all`-class with no disclaimers unaffected.
- Tests: `tests/review-seams.test.mjs` (publish-time append, contains() refusal + acceptance, unaffected-cell) per QA Row 10's expectation.
- Spec: D4, AC-P5-4. **QA rows: 10 (auto halves).** Feeds: P-3 live half (description tail + `/review` line), Drill B cleanup hygiene.
- Review: fresh code-reviewer subagent.

### T2d — S-E thumbnail registry: loader + Phase 4 seam wiring + surfaces + `--thumbs` (needs T1; review-seams hunk lands after T2c)
- NEW `studio/lib/thumb-registry.js`: loader mirroring `loadRegistryTemplates` — validate + resolve per channel, fail-closed; rejects unknown catalog ids, `needsPhoto:true` ids in the v1 set, niche paraphrases (same closed D17 vocabulary).
- NEW `studio/lib/thumb-registry.data.js`: created with the D10 schema (`template_id`, `niches[]`, `formats`, `required_inputs`, `candidate_count`, `rotate: true`) — entries authored at T4.
- `lib/review-seams.mjs` candidate-source hunk (after T2c): the eligibility math (≥2 eligible → frame + N−1 registry renders; 1 → two; 0 → today's single frame candidate byte-identical); candidate 1 stays `thumbFrameOffset(0)===3`; SVG → sharp → JPEG ≤2 MB; per-variant fail-soft — the upload never blocks (D12/D14).
- Rotation: last-used layout id recorded in the channel state file; consecutive selections never repeat back-to-back; missing state fails soft to first-eligible (D12/AC-P5-13).
- `sync-template-registry.mjs`: `--thumbs` listing mode (after T1).
- Kit storage: `channel.kit.thumbTemplates` JSONB per D13 — the T4d field-level merge already protects it (`studio/lib/channels-registry.js:211-219`): **verify only, no code**.
- Studio surfaces: `/thumbs` per-niche registry browse + the channel-panel thumbTemplates editor (2–3 ids) next to the video-template panel.
- Tests: loader suite + eligibility suite + rotation suite + fail-soft suite + Row R6 pins (Phase 4 candidate seam unchanged; source-switch cell asserted).
- Spec: D10–D14, AC-P5-11/12/13/14. **QA rows: 11 (step 3), 12/13/14 (auto halves), R6.** Feeds: Drill C end-to-end, T4 (its data must pass this loader), Drill A step 5.
- Review: fresh code-reviewer subagent.

### T2e — S-F doc-lane threading (parallel-safe; gates T6)
- `yt-deepdive.mjs`: resolveTemplateId + thresholds/gating threaded into the brain dedupe call (**pooled whole-episode chunk semantics PRESERVED — `docDedupeChunks` pin re-runs**); structure sections threaded into the doc prompt; review-class derivation for the generate-only hold (beyond the Phase 4/T5c paths); **foreign-format loud skip** — active template whose formats exclude doc ⇒ one Action-required warning + one log line, zero production.
- No assignment ⇒ today's behavior byte-identical (Row 15's flags-off doc twin).
- Tests: `tests/doc-days.test.mjs`, `tests/review-seams.test.mjs` (+ the new threading suite wherever it lands).
- Spec: D15, Ruling 3, AC-P5-15/16. **QA rows: 15 (incl. the discipline check: Row 15's pass date recorded before any Row-16 evidence).** Feeds: T6 (hard gate), Drill A doc legs.
- Review: fresh code-reviewer subagent.

### T2f — S-G panel surfaces: templates gallery with the identity split (+ two verify-only items; needs T1)
- `/templates/registry` browser cards show template_id + family + class + variation rules; the channel panel's template picker performs the SWAP (assign-over-active UI backed by T1's semantics); the wizard picker (`studio/app/channels/add/page.js`) offers the 3 new niche strings.
- **Verify-only (landed in Phase 4 — no Phase 5 code):** destinations editor (T4c, commit b61f664) and schedule/gate-cron writes (T4a) — smoke-checked in the ledger, cited by Drill A steps 5–7.
- Tests: `tests/studio-registry-surfaces.test.mjs` extensions.
- Spec: D1 (studio half), D17, D19, AC-P5-10. **QA rows: 3/5 (panel halves), 11 (step 4), 17 (step 3 visual).** Feeds: P-2 (swap button), Drill A steps 3–7 (zero-code walkthrough), Row 19.
- Review: fresh code-reviewer subagent.

### T3 — THE MR PILOT (scripted phase; runs when T1+T2a+T2b+T2c are green — concurrent with T2d/T2e/T2f)
**Freeze rule: no further merges to `youtube-engine.mjs` / `yt-daily.mjs` until P-3's soak is green.**

- **P-1 — author the pilot ONLY (QA Row P-1, gate rows a–h):** the `myth-vs-money` block into `studio/lib/template-registry.data.js` (D7 row 8): `family: 'stats-counters'`, niches = the verbatim 6-string finance cluster (D17), `formats: ['short']`, beats per D2 (slot 1 = the popular belief, slots 2–3 = reversal evidence, slot 4 = what-to-do payoff), variation_rules per the D3 bar, `safety.review_required: ['finance']`, finance `disclaimers` fixed text, declared thresholds, `title_patterns` = $-figure numbered listicle, **`review_thumb_pick: true`** (binding — Drill C expects it on the pilot). Structure-FAITHFUL to MR's kit — zero content risk (A-H6). Gates: dry-sync (a), panel assign-validation against MR (b), then (c)(f)(g)(h) ride P-3; (d) the `[brain-dedupe]` line; (e) cites Phase 4's finance evidence — never re-run.
- **P-2 — the SWAP (QA Row P-2; Row 3's live execution):** PREP = DB-CHECK + screenshot MR's current assignment (`finance-explainers`, pinned major — restore copy). Panel (or `/api/templates/assign` if T2f is still in flight): assign myth-vs-money, pin major 1, Assign & pin. DB-CHECKs: one active row (the new template), the audit row. Boundary probe: rapid double-assign still leaves one active row.
- **P-3 — forced produce + compressed same-day soak (QA Row P-3):** `gh workflow run channel-autopilot.yml -f channel=money-rulebook` (or `-f topup=1`); generate-only hold → **owner reads the script (gate row g)** + title-pattern check (h) → approve → resume-from-stored renders → upload private → verify. Evidence lines quoted: `[template] enforce: myth-vs-money @ v…` (Row 4 home d), `[brain-dedupe]` at the pilot's thresholds (Row 7), script shape matches the beat plan (Row 6 step 2), the scripts row's `template_id` (home c), the description tail carries "Education, not financial advice." (Row 10), candidate rows in `job_artifacts` (Row 12 step 3), `[verify] OK`. SOAK: MR's normal run(s) today complete clean + one more `-f topup=1` dispatch if the schedule already ran; no new `/warnings` rows for MR; state file advancing.
- **CLEANUP/ROLLBACK kept written, hopefully unused:** unassign → re-assign `finance-explainers` + pinned major (the swap machinery runs the rollback); delete the drill upload + drill script/job rows per the phase-4 pattern — never registry rows.
- **GATE: only after P-1..P-3 are green does the owner declare MR fine and γ integration start** (QA How-to-run 7: no batch row before the clean soak). Feeds: Rows 1, 3, 6, 7, 10, 12 live halves; Drill C may reuse P-3's run same-day (one spend, two drills).
- Review: owner (the human read IS gate row g) + fresh reviewer on the block's spec-conformance.

### T4 — Thumbnail launch-set data — the 17 needsPhoto:false designs (needs T2d; parallel with the pilot and all γ batches)
- Author `studio/lib/thumb-registry.data.js`: ≥15 entries (plan 17) from the needsPhoto:false pool ONLY (see Decisions), covering all 10 launch niches ≥2 each, brand-token bindings per entry (`accent`/`bg`/`label`/face from the kit — D11), `required_inputs` honest per design, `candidate_count` numeric, `rotate: true`.
- Machine gates: `node sync-template-registry.mjs --thumbs` exit 0 with per-niche coverage; the loader suite green; paraphrase probe rejected.
- Note in QA Row 11's Actual which count shipped (17 or 18-via-repeat) — the disclosure is binding.
- Spec: D10/D11, AC-P5-11. **QA rows: 11 (authoring + listing + boundary probe).** Feeds: Drill C PREP, Drill A step 5.
- Review: fresh spec-conformance reviewer (D10 bar) + loader suite.

### T5a — γ1 Batch 1: travel ×2 ∥ tech ×2 ∥ science ×3 — 7 templates (spec T4; integration gated on P-3)
- map-strategy (26), country-ledger (27) · shift-explainer (12), tool-teardown (13) · explain-it-diagram (14), science-fact-stacks (15), paper-editorial (16). All class `—`.
- **Parallel drafting: 3 agents** (travel / tech-AI / science), one fragment per template in `.superpowers/sdd/2026-11-01-phase5/drafts/<template_id>.block.json`. Drafting may start during the pilot (read-only research + scratch files); integration into the data file waits for P-3's green.
- Integrator applies fragments serially → `node sync-template-registry.mjs --dry` exit 0 → owner checklist (D5 step 2: differs from the niche's other template? never-repeat objects/windows/enforcers named? disclaimers right?) → machine gates → sync → panel-assignable.
- Per-template gate rows (QA Row 18 + 18g/18h): machine checks batch-run; live (c)(f)(g)(h) ride MR forced produces where niche-legal — these are non-finance niches, so per the QA Row 18 protocol they are **deferred with the criterion unit-pinned** until onboarding (the MR directive's gate), except any template whose niches include a finance-cluster string.
- Spec: D5–D8 (D7 rows 12–16, 26–27), structures from `research/platform-niche-template-system-2026-10-24.md` §2.1. **QA rows: 18 table rows, 18g/18h where produced, Row 5 (two-niche compare), contributions to 17.** Feeds: Drill A travel/tech/science config legs.
- Review: fresh spec-conformance reviewer per niche agent's output (D3 vibe-word sweep, D17 exact strings, beats ≤ points) + owner checklist.

### T5b — γ2 Batch 2: psychology ×2 ∥ wisdom ×2 ∥ productivity ×2 ∥ business ×3 — 9 templates (spec T5; integration gated on P-3)
- dark-psychology-defense (17), social-rule (18 — **both psychology strings** per N2) · quote-principle (19), stoic-case-study (20) · deep-work-rule (21), focus-ritual (22) · founder-autopsy (23), pricing-principle (24), deal-move (25 — the 3 business strings). All class `—`.
- **Parallel drafting: 4 agents** (psychology / wisdom-self-mastery / productivity / business), same fragment protocol as T5a; may run concurrently with T5a's drafting (disjoint agents, shared integrator serializes application).
- Same gates as T5a. Spec: D5–D8 (D7 rows 17–25). **QA rows: 18 table rows + 18g/18h where produced; contributions to 17/19.** Feeds: Drill A psychology/motivation/productivity/business legs.
- Review: fresh spec-conformance reviewer per agent + owner checklist.

### T5c — γ3 Batch 3: health ×3 — the medical batch (spec T6; integration AFTER γ1/γ2 blocks validated — risk order, health last)
- habit-protocol (9), myth-vs-science (10), sleep-ritual (11) — class `medical` on the 3 health strings; **full safeguard review with the owner** (claim allowlist, prohibited claims, source requirements, disclaimers, gate, disclosure default — `research/platform-niche-template-system-2026-10-24.md` §2.2). myth-vs-science is Drill B's identity pin target — its block must be exactly per D7 (stats-counters family, medical class).
- Every block pins `variation_threshold ≤ 0.80` / `cross_channel_threshold ≤ 0.85` (T2b's validator enforces; Row 9's grep over the 4 medical blocks incl. doc-evidence-review at T6).
- **Parallel drafting: 3 agents** (one per template) with the safeguard pack in every brief.
- Spec: D3 authoring bar, D7 rows 9–11, AC-P5-7. **QA rows: 18 table rows, 18g/18h where produced, 9 (grep half).** Feeds: Drill B Variant 1 (first health onboarding), Drill A health config leg.
- Review: fresh spec-conformance reviewer + OWNER safeguard sign-off (hard gate).

### T6 — Batch 4: the 5 doc templates (spec T8's data half; HARD GATE: T2e landed + Row 15 green first — Ruling 3)
- doc-history-rise-fall (28), doc-money-weekly (29, finance, MR-produceable), doc-shift-briefing (30), doc-science-explained (31), doc-evidence-review (32, medical — pins ≤0.80/0.85, joins Row 9's grep).
- Sections per D2's long/doc shape (`sections[]`, `chapter_min_words` — today's floor 70 stays the validator's floor; the template declares the plan, `validEpisode` keeps enforcing).
- **Parallel drafting: 1 agent** (the 5 blocks share the doc sections schema) started any time after the spec map is stable; integration + QA gated on Row 15.
- Live proof: `gh workflow run channel-autopilot.yml -f channel=<doc channel> -f force_doc=1` — section plan followed inside the unchanged contract, SRT unchanged, gated class holds via generate-only → approve → resume-from-stored; loud-skip probe for a shorts-shaped template on doc day.
- Spec: D15/D2, AC-P5-16. **QA rows: 16, 18 table rows, 9 (grep completion).** Feeds: Row 19's doc-day notes.
- Review: fresh spec-conformance reviewer + owner checklist.

### T7 — Finals: drills + counts audit + Urdu decision card (spec T9)
- **Drill A** (AC-P5-19) per launch niche — zero-code config walkthrough; finance-cluster leg cross-references P-2/P-3; other niches record "config proven, produce deferred per the MR directive" until onboarding. `git diff` during the drill must show only QA/registry-data changes.
- **Drill B** (AC-P5-6/18 + 9e) — Variant 2 (MR-legal disposable `qa-drill-medical` on the stats-counters family: class-differs-from-family identity proof, four homes, fail-closed near-dup BLOCK, the `all`-class hold) executed this phase; Variant 1 (myth-vs-science on a live health channel) executes at first health onboarding. Full cleanup per the QA script; drill rows deleted, registry rows never touched.
- **Drill C** (AC-P5-12/13/14) on MR — candidates (frame + registry renders wearing kit tokens) → `/review` pick before publishAt → `thumbnails.set` swap → rotation second-render check → 0-eligible fallback (unit-green citation acceptable per the QA).
- **Counts audit** (Row 17): sync `placed/updated: 32 of 32`; DB-CHECK count = 32 (27 video + 5 doc); per-niche totals per D7 (history 4+1doc, finance 3+1+1doc, health 3+1doc, tech 2+1doc, science 3+1doc, psychology 2, motivation 2, productivity 2, business 3, travel 2) reconciled everywhere (the P-I1 lesson); thumb registry ≥15 with ≥2 per niche; removal-refused probe.
- **Regression sweep** (Row R7): full `npm test` + `cd studio && npx next build` green; R1's prompt golden re-run one last time.
- **Urdu decision card** (D16): the 30-minute owner listening test (Piper `ur_PK` vs Azure `ur-IN/ur-PK`, blind scores 1–5, the decision rule) → decision + scores recorded in `research/`. One research row, not a QA row.
- **Feeds:** Rows 17, 19, 20 final halves; every drill row; the QA Execution summary block.
- Review: owner executes; fresh reviewer audits the evidence completeness against the QA file's coverage map.

## Batching (maximum parallelism, honest gates)

- **Batch α (now):** **T1** — alone; everything gates on it.
- **Batch β wave 1 (4 parallel, disjoint files):** **T2a ∥ T2c ∥ T2e ∥ T2f**.
- **Batch β wave 2 (2 parallel, rebase-ordered on shared files):** **T2b** (after T2a's engine commit + T1's validator) ∥ **T2d** (after T2c's review-seams commit).
- **Pilot window:** **T3 (P-1 → P-2 → P-3)** starts when T1+T2a+T2b+T2c are green — CONCURRENT with T2d/T2e/T2f finishing (freeze rule above). T4's drafting can also start here (loader schema is fixed by D10; loader lands in β2).
- **Authoring batches γ (drafting parallel, gating in the spec's risk order):** γ drafting agents (T5a ×3 ∥ T5b ×4 ∥ T5c ×3 ∥ T6 ×1 = **9 concurrent drafting agents** at peak) pre-stage fragments during β/the pilot; **integration + owner checklist + machine gates start only after P-3's clean soak**, then run γ1 ∥ γ2 → γ3 (health last, owner safeguard gate) → T6 (hard gate: Row 15 green). One integrator owns `template-registry.data.js` at any moment (the file is the only serial point; application is mechanical minutes, not hours).
- **Finals:** **T7** — drills, counts audit, Urdu card.
- Per task: fresh reviewer subagent, fix rounds ≤5; ledger `.superpowers/sdd/2026-11-01-phase5/progress.md` updated per landing. Owner actions mid-build: `cd studio && vercel --prod` after each studio push; the P-3 owner read + the declare-MR-fine gate; per-batch D5 checklists; γ3 safeguard review; the Urdu listening test.

## Exit gate

QA file green (35 rows + the 25-slot table) + all 3 drills + counts audit + the owner's panel tour. AC → task → evidence map:

| AC | Task | QA evidence |
|---|---|---|
| AC-P5-1 | T1 + P-1(a) | Row 1 |
| AC-P5-2 | T1 | Row 2 |
| AC-P5-3 | T2a (+ P-3 live) | Row 6, R1 |
| AC-P5-4 | T2c (+ P-3 live) | Row 10 |
| AC-P5-5 | T1 (thresholds resolver) + P-3 log | Row 7 |
| AC-P5-6 | T2b (+ Drill B part 2) | Row 8, R3 |
| AC-P5-7 | T2b + γ3/T6 blocks | Row 9 |
| AC-P5-8 | T5a+T5b+T5c+T6 | Row 17 |
| AC-P5-9 | P-1 + every γ batch | Rows 18, 18g, 18h, P-1 |
| AC-P5-10 | T1 + T2f | Row 5 |
| AC-P5-11 | T2d + T4 | Row 11 |
| AC-P5-12 | T2d (+ Drill C) | Row 12, R6 |
| AC-P5-13 | T2d (+ Drill C) | Row 13 |
| AC-P5-14 | T2d (+ Drill C) | Row 14 |
| AC-P5-15 | T2e | Row 15 |
| AC-P5-16 | T6 | Row 16 |
| AC-P5-17 | T1 (+ P-2 live) | Row 3 |
| AC-P5-18 | T1 (+ Drill B four homes) | Row 4 |
| AC-P5-19 | T2f + γ batches (+ Drill A per niche) | Row 19 |
| AC-P5-20 | T1 (+ R2/R3/R6 pins) | Row 20 |
| Drill A / B / C | T7 (+ batch legs) | their QA scripts |

**Critical path:** T1 → T2a → T2b → T3 (P-1 → P-2 → P-3 soak) → γ integration gates (γ1 ∥ γ2 → γ3 → T6) → T7. T2c is on a parallel branch that must land before P-3 (it does — same wave); T2d, T2e, T2f, T4, and ALL γ drafting are off the critical path. The one serial data point is the integrator's hand on `template-registry.data.js`.
