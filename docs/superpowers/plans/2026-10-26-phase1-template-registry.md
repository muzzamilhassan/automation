# Phase 1: Template Registry MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registry semantics over the existing Studio template catalog — versions, niche linkage, capability requirements, per-channel pinned assignments, compatibility validation, git→Neon sync — proven end-to-end on one pilot channel (Issue #102).

**Architecture:** Registry metadata lives in a NEW data module keyed by existing catalog family id (the 100+-entry catalog file is NOT edited — zero regression risk). Pure logic (validation, semver, compatibility) sits in one Studio lib module; DB access in a sibling module with an injectable client for fixture tests; a root CLI runs sync; a pipeline preflight hook enforces assignments for channels that have them and leaves every other channel's code path byte-identical.

**Tech Stack:** Node 24 ESM, `node --test` (existing suite), Neon Postgres via the existing `db.mjs` pattern, Studio route-auth patterns, existing googleapis/nodes. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-26-phase1-template-registry-spec.md` (published as issue #102). The plan argues from the spec — read both.

## Global Constraints

- Planning-first: no code beyond this plan without owner approval of the plan (granted 2026-10-26); commits reference issue #102.
- Evidence before done: every task ends with a passing test run quoted in the commit; close-out quotes E2E evidence on #102.
- CI production master untouched: no edits to any channel-*.yml trigger/matrix; pilot runs via manual dispatch only (spec D5).
- No-static-maps: after this plan, adding template #7 = one data block, zero code.
- No new npm dependencies (hand-rolled validator; `node --test`).
- Studio work: read the bundled Next docs (`studio/node_modules/next/dist/docs/`) before touching UI — this Next.js version differs from training data.
- Git identity: Muzzamil Hassan / muzzamilhassan302@gmail.com; commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Keep `npm test` under the 10-minute CI budget.

---

### Task 1: Registry metadata validator (schema v1)

**Files:**
- Create: `studio/lib/template-registry.js`
- Test: `tests/template-registry.test.mjs`

**Interfaces:**
- Produces: `validateRegistryMeta(meta) → { ok: true } | { ok: false, errors: string[] }` — pure, fail-closed; later tasks import this.

- [ ] **Step 1: Write the failing test**

```js
// tests/template-registry.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRegistryMeta } from '../studio/lib/template-registry.js';

const valid = {
  version: '1.0.0',
  niches: ['history'],
  formats: ['short'],
  renderer: 'remotion',
  required_capabilities: ['script-gen', 'tts', 'captions'],
  variation_rules: ['distinct storyline per video', 'no repeated hook across last 5'],
  safety: { required_sources: true, review_required: [] },
  deprecated: false,
  changelog: [{ version: '1.0.0', date: '2026-10-26', note: 'initial' }],
};

test('valid metadata passes', () => {
  assert.deepEqual(validateRegistryMeta(valid), { ok: true });
});
test('bad semver fails with named error', () => {
  const r = validateRegistryMeta({ ...valid, version: '1.0' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('version')));
});
test('unknown capability fails', () => {
  const r = validateRegistryMeta({ ...valid, required_capabilities: ['script-gen', 'teleport'] });
  assert.equal(r.ok, false);
});
test('deprecated without date fails', () => {
  const r = validateRegistryMeta({ ...valid, deprecated: true });
  assert.equal(r.ok, false);
});
test('empty variation_rules fails', () => {
  const r = validateRegistryMeta({ ...valid, variation_rules: [] });
  assert.equal(r.ok, false);
});
```

- [ ] **Step 2: Run to verify failure** — `npm test` → FAIL (module not found)
- [ ] **Step 3: Implement** — `validateRegistryMeta` checks: semver `^\d+\.\d+\.\d+$`; `niches` non-empty strings; `formats` ⊆ {short,long} non-empty; `renderer` non-empty; `required_capabilities` ⊆ {script-gen,tts,captions,image-gen}; `variation_rules` non-empty strings; `safety.required_sources` boolean, `safety.review_required` ⊆ {health,finance,all}; `deprecated` boolean + `deprecated_on` (YYYY-MM-DD) required when deprecated; `changelog` entries {version,date,note}. Collect all errors (not first-only).
- [ ] **Step 4: Run tests** — `npm test` → all PASS
- [ ] **Step 5: Commit** — `feat(#102): registry metadata schema v1 validator`

### Task 2: Registry data module + fail-closed loader

**Files:**
- Create: `studio/lib/template-registry.data.js`
- Modify: `studio/lib/template-registry.js` (add loader)
- Test: `tests/template-registry.test.mjs` (extend)

**Interfaces:**
- Produces: `REGISTRY_META` (object: catalog family id → metadata block) in the data module; `loadRegistryTemplates(catalogFamilies, metaData) → { templates: [{familyId, name, catalog, registry}], invalid: [{familyId, errors}] }` — families without metadata are not registry-assignable; invalid blocks are excluded and reported (AC-1).

- [ ] **Step 1: Failing test** — fixture catalog array (3 families) + fixture meta (2 valid, 1 invalid) → loader returns 1 template, 1 invalid with errors, third absent.
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** — data module starts as `export const REGISTRY_META = {};` (seeded in Task 10); loader validates each block via Task 1, merges with catalog entry (name/aspectRatios pass through), never throws on invalid — reports.
- [ ] **Step 4: Run** → PASS · **Step 5: Commit** — `feat(#102): registry loader over catalog families (fail-closed)`

### Task 3: Semver resolver (adoption rules, spec D2)

**Files:**
- Modify: `studio/lib/template-registry.js`
- Test: extend `tests/template-registry.test.mjs`

**Interfaces:**
- Produces: `resolveAssignment(assignment, registryBlocks) → { ok, resolvedVersion?, majorUpdateAvailable?, errors? }` where `assignment = { familyId, pinned_major }`; "highest within pinned major"; `majorUpdateAvailable` true when a higher major exists.

- [ ] **Step 1: Failing tests** — blocks {1.0.0, 1.1.0, 1.1.3, 2.0.0}: pin 1 → resolves 1.1.3, majorUpdateAvailable true; pin 2 → 2.0.0, false; pin 3 → error `no_version_in_major`.
- [ ] **Step 2: Run** → FAIL · **Step 3: Implement** pure resolver · **Step 4: Run** → PASS
- [ ] **Step 5: Commit** — `feat(#102): semver resolver — minor/patch auto-adopt, major holds`

### Task 4: Compatibility validator (spec D4)

**Files:**
- Modify: `studio/lib/template-registry.js`
- Test: extend `tests/template-registry.test.mjs`

**Interfaces:**
- Consumes: Task 1 meta, `channelConfig = { formats: ['short'], niches: ['history'], brand_kit: true }`, `capabilityMap = { 'script-gen': true, tts: false }`
- Produces: `validateAssignment(meta, channelConfig, capabilityMap) → { ok } | { ok:false, reasons:[{code, detail}] }` with stable codes `missing_capability:<cap>`, `format_mismatch`, `niche_mismatch`, `renderer_unavailable`, `deprecated_template` — all blocking, all reasons collected.

- [ ] **Step 1: Failing tests** — one per reason code + ok path + all-reasons-collected path.
- [ ] **Step 2: Run** → FAIL · **Step 3: Implement** · **Step 4: Run** → PASS
- [ ] **Step 5: Commit** — `feat(#102): compatibility validator with stable reason codes`

### Task 5: Neon DB layer + sync core (injected-client seam)

**Files:**
- Create: `studio/lib/template-registry-db.js`
- Test: `tests/template-registry-db.test.mjs`

**Interfaces:**
- Produces: `makeRegistryDb(dbClient)` — all functions take the client via factory (fixture seam; default export wraps the real `db.mjs` client):
  - `ensureSchema()` — CREATE TABLE IF NOT EXISTS `template_registry_index` (family_id PK, version, major, meta_hash, meta_json, deprecated bool, synced_at), `channel_template_assignments` (channel_id, family_id, pinned_major, pinned_version, assigned_by, assigned_at, active bool, PK(channel_id, family_id)), `template_assignment_audit` (id, at, actor, channel_id, family_id, from_major, to_major, action)
  - `syncRegistry(families)` — hash upsert; **refuse removal** when active assignments exist (returns `{ removedRefused: [familyId] , ok:false }`); invalid blocks skipped+reported; idempotent (same input → zero writes)
  - `assignTemplate(channelId, familyId, pinnedMajor, actor)` / `unassignTemplate(...)` / `listAssignments(channelId)` / `listUsage(familyId)` / `getActiveAssignment(channelId)` — audit row on every change
- Test fixtures: in-memory client stub (Map-backed) proving upsert idempotency, removal-refusal, invalid-skip, audit rows. (No live Neon in tests — matches keys-vault fixture style.)

- [ ] **Step 1: Failing tests** per behavior · **Step 2: Run** → FAIL · **Step 3: Implement** · **Step 4: Run** → PASS
- [ ] **Step 5: Commit** — `feat(#102): registry DB layer — sync/assign/audit with injected client`

### Task 6: Sync CLI

**Files:**
- Create: `sync-template-registry.mjs` (repo root, sibling of sweeper.mjs)

**Interfaces:**
- Consumes: Task 2 loader + Task 5 `syncRegistry` with the real DB client
- Produces: `node sync-template-registry.mjs` → prints placed/updated/skipped-invalid/removal-refused summary; exit 0 clean, exit 1 on any invalid/refusal (CI-visible per AC-12). `--dry` flag prints without writing.

- [ ] **Step 1: Implement** (thin CLI over tested core) · **Step 2:** run `node sync-template-registry.mjs --dry` → prints summary with 0 registered (data empty until Task 10) and exit 0 · **Step 3: Commit** — `feat(#102): registry sync CLI`

### Task 7: Studio API routes (thin, auth'd)

**Files:**
- Create: `studio/app/api/templates/route.js` (GET: registry view — templates + assignments for a channel)
- Create: `studio/app/api/templates/assign/route.js` (POST assign incl. validator gate + audit; DELETE unassign)

**Interfaces:** follow existing route-auth patterns (owner writes, staff read-only — AC-9); routes stay thin: parse → call Task 4/5 functions → JSON. **Read the bundled Next docs for route conventions before writing.**

- [ ] **Step 1: Implement routes** · **Step 2:** `cd studio && npx next build` (or repo verify command) → compiles clean · **Step 3: Commit** — `feat(#102): registry API — list/assign/unassign with validator gate`
- (Route behavior verified by QA file + E2E; lib logic already unit-tested.)

### Task 8: Studio UI — catalog browser, assignment panel, template detail

**Files:**
- Create: catalog browse page + channel-templates assignment panel + template detail (usage list, major-update banner) under the existing Studio page tree
- Create: `docs/qa/phase1-template-registry-qa.md` (via qa-file-generator pattern)

**Interfaces:** consumes Task 7 routes; niche-first ordering in the picker (AC-10); read-only rendering for staff (AC-9); deprecation notice; "major update available" banner with explicit re-pin action (AC-5 UI half).

- [ ] **Step 1: Read bundled Next docs** (studio AGENTS.md requirement) · **Step 2: Implement pages** · **Step 3:** `cd studio && npx next build` → clean; `cd studio && vercel --prod` deploy per repo pattern · **Step 4: Generate QA file** and execute row-by-row with screenshots (AC-1,2,3,4,5,6,9,10 UI halves) · **Step 5: Commit** — `feat(#102): registry UI — browse/assign/detail with QA file`

### Task 9: Generation preflight (observe/enforce, spec D5)

**Files:**
- Create: `lib/template-preflight.mjs` (root lib, pipeline side)
- Modify: `channel-pipeline.mjs` (single insertion: call preflight before script generation)
- Test: `tests/template-preflight.test.mjs`

**Interfaces:**
- `runPreflight({ channelId, registryDb, catalog })` → `{ mode: 'legacy'|'enforce', verdict }`. No active assignment → `{ mode:'legacy' }` and the pipeline proceeds exactly as today (zero behavior change). Active assignment → resolve (Task 3) + validate (Task 4) → ok: enrich run record with `template_id`, `resolved_version`, and a registry-meta summary (`variation_rules`, `safety`) per AC-7/AC-13; not-ok: write job event + ntfy alert + fail the run (AC-8).
- Test fixtures: assignment absent → legacy; assignment present + ok verdict → enrich; present + blocked → throw with reason codes.

- [ ] **Step 1: Failing tests** · **Step 2: Run** → FAIL · **Step 3: Implement** module + the one-line pipeline insertion behind a constant (`TEMPLATE_PREFLIGHT_ENABLED = true` — removing the line is the rollback) · **Step 4: Run `npm test`** → PASS (full suite — proves legacy paths untouched) · **Step 5: Commit** — `feat(#102): generation preflight — enforce only for assigned channels`

### Task 10: Seed metadata — 6 families

**Files:**
- Modify: `studio/lib/template-registry.data.js` (fill REGISTRY_META)
- Test: `tests/template-registry.test.mjs` (extend: all 6 seeds validate + are 9:16-capable)

**Interfaces:** seeds (from the existing catalog, verified ids):
- history: `documentary-frames`, `timeline-history`, `photo-stories`
- finance: `finance-explainers`, `stats-counters`, `chart-animations`
Each block: version `1.0.0`; niches mapped; formats `['short']` (+ long where the family supports 16:9 — verify each family's `aspectRatios` at build; only declare what's true); renderer per family; capabilities `['script-gen','tts','captions']` (+`image-gen` where the family uses photos); variation_rules ≥2 concrete rules; safety: finance seeds `review_required:['finance']`, `required_sources:true`; changelog initial entry.

- [ ] **Step 1: Verify each family's aspectRatios in the catalog** (only declare supported formats) · **Step 2: Write the 6 metadata blocks** · **Step 3: Extend test** — each seed passes `validateRegistryMeta`, exists in catalog with 9:16, finance seeds carry review_required · **Step 4: Run** → PASS · **Step 5:** `node sync-template-registry.mjs` → exit 0, 6 rows synced (evidence quoted) · **Step 6: Commit** — `feat(#102): seed 6 template families into the registry`

### Task 11: Pilot E2E + close-out

**Files:** none new (evidence on issue #102 + PLAN.md line)

**Interfaces:** consumes everything. **Pilot channel: `ai-observer`** (owner may substitute before this task — say the word). Requires: studio deployed (Task 8), Neon reachable, BYOK capability for script-gen/tts/captions configured (validator will name anything missing — that is the feature).

- [ ] **Step 1:** Sync registry against real Neon → evidence line · **Step 2:** In Studio, assign the `documentary-frames` seed (ai-observer's storytelling lane, per the Task 10 niche mapping)… pinned 1.0.0 → audit event evidence · **Step 3:** Dispatch one produce run for the pilot (manual, not cron) → job record shows `template_id` + `resolved_version`; artifact exists; no duplicate upload (AC-13) · **Step 4:** Execute the QA file fully; quote results · **Step 5:** Prove "template #7 is data-only": add a 7th block for any family, sync, see it assignable — zero code changed (exit-gate evidence) · **Step 6:** Comment evidence on #102; update the PLAN.md P30 line (add-only); commit any doc changes — `docs(#102): phase 1 close-out evidence`
