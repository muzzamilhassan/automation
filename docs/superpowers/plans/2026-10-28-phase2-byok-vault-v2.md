# Phase 2: BYOK Vault v2 + Usage Ledger + Cost Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The BYOK vault becomes the capability router — any provider's key in the admin panel, per-task routing with priority + fallback, per-channel overrides, and a usage ledger with a cost dashboard (issue #104).

**Architecture:** One static provider catalog (single source of truth, kills the route/preflight table drift), one resolution function (channel override → workspace default → pipeline-truth baseline), one universal OpenAI-compatible adapter + thin native adapters, one `usage_events` table written by every call, one dashboard page reading rollups. The doc chain and Shorts script brain both route through the same registry — no hand-edited chain configs remain.

**Tech Stack:** Node 24 ESM, `node --test`, Neon Postgres (existing db.mjs pattern), Studio route-auth + vault patterns, no new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-10-28-phase2-byok-vault-v2-spec.md` (published as issue #104, AC-P2-1..10). The plan argues from the spec.

## Global Constraints

1. Planning-first: owner approved this plan before coding; commits reference issue #104.
2. Evidence before done: every task ends with quoted test output; live E2E closes the phase.
3. CI production master untouched: no workflow edits in this phase.
4. No-static-maps: provider/limit changes are data edits, never code edits (D1).
5. Keys never leak: masked display, no key material in logs/responses/errors (AC-P2-9).
6. No new npm dependencies (the OpenAI-compatible adapter uses plain fetch).
7. Full suite green per task (baseline 173); `next build` exit 0 when Studio files change.
8. Git identity: Muzzamil Hassan; commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
9. Studio UI work: read bundled Next docs (`studio/node_modules/next/dist/docs/`) first.
10. Surgical git adds (the tree carries unrelated parallel-session work).

---

### Task 1: Provider catalog (single source of truth, D1)

**Files:**
- Create: `studio/lib/provider-catalog.js`
- Modify: `studio/app/api/templates/assign/route.js` (import baseline+providers projection), `lib/template-preflight.mjs` (same)
- Test: `tests/provider-catalog.test.mjs`

**Interfaces:**
- Produces: `PROVIDERS` (catalog: id → { capabilities[], envVars[], baseUrl?, models[], freeTier: {rpd?, maxOutputTokens?, fetched}, licenseClass }), `capabilityProviders(cap)` (the projection both consumers use), re-export of `CAPABILITY_BASELINE` (moves here from template-registry.js; template-registry re-exports for compatibility).

- [ ] **Step 1: Write failing tests** — catalog shape; every baseline-true capability covered by ≥1 provider; route/preflight tables deep-equal the catalog projection (drift pin, retires M31/M34); every provider entry carries fetched-date + license-class fields.
- [ ] **Step 2: Run** → FAIL · **Step 3: Implement** — populate the catalog from `research/free-doc-script-apis-2026-10-28.md` + `platform-byok-providers-2026-10-24.md` §1 (gemini, groq, cerebras, mistral, openrouter, openai, cloudflare, tavily, serper, elevenlabs, edge-tts-local, whisper-local; env-var names matching `PROVIDER_ENV` in lib/channel-keys.mjs) · **Step 4: Run** → PASS · **Step 5: Commit** `feat(#104): provider catalog — single source of truth for capability providers`

### Task 2: Vault storage v2 — MASTER_KEY + key_version (D8)

**Files:**
- Modify: `studio/lib/keys-vault.js`
- Test: extend `tests/channel-keys-vault.test.mjs`

**Interfaces:**
- Produces: key derivation from `MASTER_KEY` env (fallback to the legacy derivation with a logged deprecation warning), stored records gain `key_version`; `readKeys()` transparently re-encrypts legacy rows on read (migration-on-read, no data loss).

- [ ] **Step 1: Failing tests** — MASTER_KEY derivation used when set; legacy rows migrate on read (old key → new key_version 1, content unchanged); missing MASTER_KEY + legacy rows still readable (no lockout). · **Step 2: Run** → FAIL · **Step 3: Implement** · **Step 4: Run** → PASS · **Step 5: Commit** `feat(#104): vault MASTER_KEY + key_version with migrate-on-read`

### Task 3: Provider routing — resolution + storage (D3)

**Files:**
- Create: `studio/lib/provider-routing.js`
- Test: `tests/provider-routing.test.mjs`

**Interfaces:**
- Produces: `makeProviderRouting(dbClient, catalog)` → `ensureSchema()` (`provider_configs` table: channel_id nullable (null = workspace default), capability, provider_id, priority, active), `setRoute({channelId|null, capability, providerId, priority})`, `listRoutes(capability?)`, `resolveCapability(capability, channelId?)` → ordered provider list (channel override → default → catalog baseline order); integration with `applyChannelKeys` env output (keys still land in env by provider id).

- [ ] **Step 1: Failing tests** (injected client, Map stub style) — resolution order; channel override beats default; unknown capability → catalog order; inactive routes skipped. · **Step 2: Run** → FAIL · **Step 3: Implement** · **Step 4: Run** → PASS · **Step 5: Commit** `feat(#104): provider routing — channel override → default → baseline`

### Task 4: Vault UI v2 — providers + routing page (D2, AC-P2-1/2/3/9)

**Files:**
- Create: providers management page (extend the existing API-keys page area) + routing editor per channel (inside the existing channel panel pattern)
- Modify: `studio/app/api/templates/assign/route.js` + `lib/template-preflight.mjs` → import provider projections from the catalog (retiring the mirrored tables)
- Create: `docs/qa/phase2-vault-v2-qa.md`

**Interfaces:** consumes Task 3 routing via a small API route (`studio/app/api/providers/route.js`: GET catalog+routes, POST set-route, POST test-key using the existing test-on-save path); owner-write/staff-read per house auth.

- [ ] **Step 1: Read bundled Next docs** · **Step 2: Implement pages + route** · **Step 3: `npx next build` exit 0** · **Step 4: QA file + execute owner-verifiable rows** (add key → test ✓ → masked; set routing; staff read-only) · **Step 5: Commit** `feat(#104): vault UI v2 — providers, routing, masked keys`

### Task 5: Universal adapter + usage_events (D4, D5, AC-P2-4)

**Files:**
- Create: `lib/ai-adapter.mjs` (root)
- Modify: `lib/channel-keys.mjs` (capability-aware applier)
- Test: `tests/ai-adapter.test.mjs`

**Interfaces:**
- Produces: `routeAndCall(capability, { slug, jobId, prompt|text|... })` → resolves via Task 3 routing + Task 2 keys → calls the provider (OpenAI-compatible script-gen; native tts/transcription/search adapters) → writes `usage_events` (via injected writer) → returns `{ content, usage: { provider, model, tokens, usage_source } }`. Adapters: openai-compatible (fetch, JSON mode), elevenlabs (fetch), edge-local (spawn edge-tts), whisper-local (spawn), tavily/serper (fetch). Zero applied providers → baseline locals (Phase-1 semantics preserved).
- `usage_events` schema per spec D5 (create via ensureSchema; injected writer for tests).

- [ ] **Step 1: Failing tests** — routing honored (priority + fallback on failure), usage event written per call (measured vs estimated flagged), fallback fires on HTTP failure and logs the attempt, baseline locals used when no routes exist. · **Step 2: Run** → FAIL · **Step 3: Implement** · **Step 4: Run** → PASS · **Step 5: Commit** `feat(#104): universal AI adapter + usage_events ledger`

### Task 6: Wire the generators (user story 8 — kills chain drift)

**Files:**
- Modify: `yt-deepdive.mjs` (doc chain → routeAndCall), `youtube-engine.mjs` (Shorts script brain → routeAndCall for script-gen), `lib/template-preflight.mjs` (capability map from Task 1 catalog projection — retires the last mirrored table)
- Test: extend preflight tests

**Interfaces:** the generators lose their hard-coded provider chains; the chain is whatever routing says. Baseline locals guarantee Phase-1 behavior when no routes exist (zero-config = today's behavior).

- [ ] **Step 1: Failing test** — with a route set (fixture), the generator calls the routed provider; with none, baseline order. · **Step 2: Run** → FAIL · **Step 3: Implement** (surgical — swap the provider-selection seam, keep the prompt/JSON contract) · **Step 4: Run** → PASS · **Step 5: Commit** `feat(#104): generators route through the capability registry`

### Task 7: Cost dashboard (D6, AC-P2-5)

**Files:**
- Create: Studio cost dashboard page (rollups per channel/provider/window from usage_events; rows link to job ids)
- Create: `studio/app/api/usage/route.js` (GET rollups; owner+staff read)

**Interfaces:** consumes usage_events directly; window param (7/30/90d); no writes.

- [ ] **Step 1: Implement route + page** · **Step 2: `npx next build` exit 0** · **Step 3: QA rows** (rollup correctness against seeded fixture rows; staff read-only) · **Step 4: Commit** `feat(#104): cost dashboard — per-channel/provider rollups`

### Task 8: Quota-model-as-data (D7, AC-P2-6/7)

**Files:**
- Create: `youtube_quota_models` table + loader in `lib/quota-ledger.mjs` (data-driven branch; hardcoded values retained as the seeded default row)
- Modify: `studio/lib/schedule-projection.js` (read the model from data)
- Test: extend quota-ledger/projection tests

**Interfaces:** per-GCP-project row (search bucket, insert bucket, shared pool); projection warns at schedule time when a planned generation would exceed the stored model (advisory only, per AC-P2-6).

- [ ] **Step 1: Failing tests** (data-driven math matches the current hardcoded math on the seeded default row; advisory warning fires at threshold) · **Step 2: Run** → FAIL · **Step 3: Implement** · **Step 4: Run** → PASS · **Step 5: Commit** `feat(#104): quota model as data — projection reads per-project rows`

### Task 9: Live E2E + close-out

**Files:** none new

- [ ] **Step 1:** Push all; deploy Studio; owner sets a NON-default provider priority in the panel (e.g. Groq before Gemini for script-gen on one channel) · **Step 2:** Dispatch one documentary run → job log shows the routed provider + usage event row in Neon (AC-P2-2/4 live) · **Step 3:** Dashboard shows the rollup (AC-P2-5 live) · **Step 4:** QA file full execution; evidence comment on #104 · **Step 5:** PLAN.md tick; workspace cleanup
