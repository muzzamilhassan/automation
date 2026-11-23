# Phase 3: The Brain (RAG Memory + Semantic Variation Gate) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development with PARALLEL BATCHING (owner directive: batch disjoint-file tasks simultaneously). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the script writers memory (past scripts + performance + research corpus via Neon pgvector) and a semantic variation gate (near-duplicate = BLOCKED), all running inside CI/cloud — zero personal-machine dependency (issue #105, spec v3).

**Architecture:** A small Python FastAPI sidecar (`services/ai/`) spawned inside CI jobs (localhost) provides /health, /context, /dedupe, /embed. Embeddings via `fastembed` (ONNX, no torch, Apache-2.0) — model `all-MiniLM-L6-v2` served locally, **chunked sub-vectors** (per-chapter/hook/points + pooled — never whole-script: the model truncates at ~190 words). Storage in the EXISTING Neon database (pgvector; exact scan — no ANN at this scale). The DB becomes the **corpus of record for script text** (`chunk_text` column — Shorts script text is persisted at publish time, the only durable home it has). Generators (`yt-deepdive`, `youtube-engine`) query `/context` at prompt assembly and gate through a `/dedupe` hook inside `callScriptBrain`'s walk (BLOCKED = third retry reason, consuming an escalation walk; exhausted walks = the lane's existing fail-closed terminal). Fail-open everywhere when the brain is unavailable (one warning + ntfy), EXCEPT finance-gated templates with the brain UP and verdict BLOCK (fail-closed per template `review_required`).

**Folder structure (scalable, meaningful — owner requirement):**

```
services/
  ai/                              ← THE BRAIN (all Python, one responsibility per file)
    app.py                         # FastAPI entry: /health /context /dedupe /embed
    requirements.txt               # pinned: fastapi, uvicorn, fastembed, psycopg
    brain/
      __init__.py
      config.py                    # env, model id, dims, thresholds, defaults
      chunker.py                   # text → chunks (scene/hook/points/pooled windows)
      embedder.py                  # fastembed wrapper (model load, embed, model stamp)
      store.py                     # pgvector: script_memory + dedupe_verdicts upsert/query
      retrieve.py                  # /context assembly (top-k + performance join)
      gate.py                      # /dedupe verdict logic (thresholds, bands, finance tier)
    tests/
      conftest.py                  # fixtures: paraphrase pair, unrelated scripts, pgvector stub
      test_chunker.py
      test_embedder.py
      test_store.py
      test_gate.py
      test_api.py                  # spawns the app, round-trips all endpoints
.github/workflows/brain-backfill.yml   # workflow_dispatch: one-time corpus backfill (CI-only)
```

**Tech Stack:** Python 3.12, FastAPI + uvicorn (pinned 0.162.0/0.54.0), `fastembed` 0.9.1 (ONNX — no torch), psycopg (Neon pgvector), pytest. Node side unchanged except the wiring seams. No new npm deps.

**Spec:** `docs/superpowers/specs/2026-10-29-phase3-rag-brain-spec.md` (v3 — published as issue #105, AC-P3-1..17 with review + verification lineage).

## Global Constraints

1. Planning-first: owner approved spec v3 + this plan before coding; commits reference issue #105.
2. Evidence before done: quoted test output per task; live E2E closes the phase.
3. CI production master untouched: no edits to channel-autopilot.yml triggers/matrix (the brain runs INSIDE the existing produce job as a spawned background process — Task 7).
4. Laptop-independence (AC-P3-6): every memory op runs in CI/cloud; the owner's machine is never a runtime dependency — enforced by design (sidecar spawned per CI job, backfill = workflow_dispatch).
5. Keys/secret hygiene: no key material in logs/events/errors; fastembed runs LOCAL (no embedding API); provider keys stay in env/vault.
6. No new npm dependencies; Python deps pinned in requirements.txt (Phase-0 hygiene lane: this file REPLACES the repo-wide unpinned Python pattern for services/ai).
7. Full suite green per task (baseline 291); `next build` exit 0 when Studio files change (none planned this phase — brain is backend-only).
8. Git identity: Muzzamil Hassan; commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
9. Surgical git adds (parallel session active — pathspec-limited adds + `git show --stat` verification MANDATORY; the shared index carries unrelated staged work).
10. Generators' prompts, JSON contracts, output files, dedupe of render/upload, and walk counts are UNTOUCHED except the precise seams Task 6 defines (context injection point; checkDup hook; BLOCKED retry reason; guidance suffix).

---

### Task 1: Brain skeleton — FastAPI app + pinned requirements + CI test lane

**Files:**
- Create: `services/ai/app.py` (FastAPI: /health reporting model-loaded + pgvector-reachable; /context, /dedupe, /embed as thin delegates to brain modules — full logic lands Tasks 2-6)
- Create: `services/ai/requirements.txt` (pinned: fastapi==0.162.0, uvicorn==0.54.0, fastembed==0.9.1, psycopg[binary], pytest)
- Create: `services/ai/brain/__init__.py`, `brain/config.py` (env: DATABASE_URL, MODEL_ID default all-MiniLM-L6-v2, DIMS 384, DEFAULT_THRESHOLD 0.85, CROSS_CHANNEL_BAND +0.05, READINESS_BUDGET 30s)
- Create: `services/ai/tests/test_api.py` (/health round-trip with stubbed brain state)
- Modify: `.github/workflows/tests.yml` (add a python job: pip install -r services/ai/requirements.txt + pytest services/ai/tests — with pip cache)

**Interfaces:**
- Produces: app factory `create_app()`; brain config module (env-driven); the test lane every later task extends.

- [ ] **Step 1: Write failing /health test** · **Step 2: Run pytest** → FAIL · **Step 3: Implement app skeleton + config** · **Step 4: pytest green + npm test 291/291 untouched** · **Step 5: CI workflow python step added** · **Step 6: Commit** `feat(#105): brain skeleton — FastAPI health + pinned python deps + CI lane`

### Task 2: Chunker + embedder (fastembed)

**Files:**
- Create: `services/ai/brain/chunker.py`, `brain/embedder.py`
- Test: `services/ai/tests/test_chunker.py`, `test_embedder.py`

**Interfaces:**
- `chunk_text(kind, text) → [{chunk_kind, text}]` — scene/hook/points/pooled windows (~200-token windows; pooled = whole text); `embed_texts(texts) → [[float]]` (fastembed, 384-dim, model stamped); `model_stamp() → {model_id, dims}`.

- [ ] **Step 1: Failing tests** (chunk windows; determinism; model stamp) · **Step 2: pytest FAIL** · **Step 3: Implement** (fastembed local model; model dir via env with actions/cache-friendly default) · **Step 4: pytest GREEN** · **Step 5: Commit** `feat(#105): chunker + fastembed embedder`

### Task 3: Store — pgvector upsert/query (injected client)

**Files:**
- Create: `services/ai/brain/store.py`
- Test: `services/ai/tests/test_store.py`

**Interfaces:**
- `makeStore(dbClient)` (injected; adaptPostgres-wrapped in production): `ensureSchema()` (script_memory + dedupe_verdicts per spec D3/AC-P3-12), `upsertChunks(rows)` (hash-keyed: insert new hashes, update performance/meta in place, no re-embed unchanged — AC-P3-1/13), `searchSimilar(embedding, channelId, kind?, limit)` (exact scan, max-chunk semantics, same-channel vs cross-channel labeling), `recordVerdict(verdict)` (AC-P3-12), `topPerformance(ids)` (performance join AC-P3-8). All-or-nothing transaction helper for multi-chunk scripts (AC-P3-2).

- [ ] **Step 1: Failing tests** (Map-stub: upsert idempotency; update-in-place; search labeling; verdict write; transaction all-or-nothing) · **Step 2: FAIL** · **Step 3: Implement** · **Step 4: GREEN** · **Step 5: Commit** `feat(#104): brain store — pgvector upsert/search/verdicts`

### Task 4: /context + /dedupe + /embed endpoints

**Files:**
- Modify: `services/ai/app.py`
- Test: extend `services/ai/tests/test_api.py`

**Interfaces:** endpoints per spec D9 (pinned request/response shapes; similarity ≥ threshold blocks; `<=>` distance convention pinned + unit-tested).

- [ ] **Step 1: Failing endpoint tests** (stubbed store/embedder) · **Step 2: FAIL** · **Step 3: Implement** · **Step 4: GREEN** · **Step 5: Commit** `feat(#105): brain endpoints — context, dedupe, embed`

### Task 5: Write-time embedding at publish (AC-P3-2/17)

**Files:**
- Modify: the publish path in `channel-pipeline.mjs` (after videoId received: call the sidecar /embed with the full script text + chunks; single transaction; ghost-script exclusion — scripts that died before upload are never embedded)
- Test: `tests/publish-embed.test.mjs` (spawn-sidecar stub or injected)

- [ ] **Step 1: Failing test** (after videoId → embed called once, transaction; pre-upload death → no embed) · **Step 2: FAIL** · **Step 3: Implement** · **Step 4: GREEN + suite** · **Step 5: Commit** `feat(#104): write-time script embedding at publish`

### Task 6: Backfill workflow (AC-P3-1, CI-only backfill)

**Files:**
- Create: `.github/workflows/brain-backfill.yml` (workflow_dispatch: installs requirements, runs the indexer over lf-*.json docs + research corpus + persisted Shorts texts; idempotent; safe to re-run)
- Create: `services/ai/scripts/backfill.py` (orchestrates: discover corpus per AC-P3-15 exclusions → embed → upsert; progress logs)

- [ ] **Step 1: Implement backfill script** · **Step 2: Workflow file** (workflow_dispatch, actions/cache on fastembed model dir, CPU-only) · **Step 3: Dispatch once against production Neon → verify row counts + idempotent re-run (0 new)** · **Step 4: Commit** `feat(#105): brain backfill workflow — corpus of record seeded`

### Task 7: Generator wiring — /context before, /dedupe gate inside the walk

**Files:**
- Modify: `youtube-engine.mjs` (callScriptBrain: /context fetch at prompt assembly injecting retrieved exemplars + performance; checkDup hook between shape validation and return — BLOCKED = third re-walk reason consuming an escalation walk, walks 2+ append guidance naming the top match; exhausted → source:'fallback' terminal unchanged)
- Modify: `yt-deepdive.mjs` (same seams for the doc lane; single callScriptBrain call)
- Modify: `lib/ai-adapter.mjs` (no change expected — routeAndCall surface already fits; only if a helper export is needed, name it)
- Test: extend `tests/generator-routing.test.mjs` + new `tests/brain-wiring.test.mjs`

**Interfaces:** consumes /context + /dedupe via injected fetch (localhost sidecar); fail-open per spec D6 (brain down → legacy behavior + one warning; finance + brain-UP-BLOCK → fail-closed per lane terminal).

- [ ] **Step 1: Failing wiring tests** (context provenance in job output; BLOCKED consumes walk; exhausted → terminal; brain-down → fail-open + one warning; finance fail-closed) · **Step 2: FAIL** · **Step 3: Implement** both generators · **Step 4: GREEN + full suite** · **Step 5: Commit** `feat(#105): generators wired to the brain — context + variation gate`

### Task 8: Live E2E + close-out

**Files:** none new (evidence on #105)

- [ ] **Step 1:** Deploy brain prerequisites (requirements cached; Neon schema ensured) · **Step 2:** Dispatch the documentary with a planted near-duplicate fixture (a script deliberately similar to a past one) → expect BLOCKED + verdict row · **Step 3:** Dispatch the real documentary → expect context provenance + routed provider + usage event + doc rendered · **Step 4:** Dashboard /usage shows the events; dedupe_verdicts shows the verdicts · **Step 5:** Evidence comment on #105; PLAN tick; phase close

## Parallel Batching (owner directive — maximum safe parallelism)

- **Batch A:** Tasks 1+2+3 can largely run as: T1 first (skeleton + config others import), then **T2 ∥ T3** (disjoint: chunker/embedder vs store)
- **Batch B:** T4 (endpoints, needs T2+T3) — solo
- **Batch C:** **T5 ∥ T7** (publish-embed in pipeline vs generator wiring — disjoint files)
- **Batch D:** T6 backfill (independent) ∥ T8 E2E prep
- Task 9 E2E closes after all land.
