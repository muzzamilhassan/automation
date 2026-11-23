# Python migration + RAG research — 2026-10-17

Read-only research round. Builds on `architecture-audit-2026-10-17.md` (#88), `bug-audit-2026-10-17.md` (#74), `tech-stack-research-2026-10-17.md`, and `project-full-audit-2026-10-09.md` — those found the bugs and the architecture verdicts; this doc answers the two NEW questions: **"how would we move this project to the Python side?"** and **"should we add a RAG system, with which framework, and what does it improve?"** No code was changed for this research. External claims cite primary sources fetched 2026-10-17 (section 7).

---

## 0. TL;DR verdicts

| Question | Verdict | One line |
|---|---|---|
| Full Python rewrite of the repo | **NO** | Remotion is Node-only, Studio is Next.js (Node), and ~90% of the codebase by LOC is JS/TS — a port rewrites ~15k lines of working pipeline for zero new capability. |
| Python as an **AI sidecar service** | **YES** | One small FastAPI service (`services/ai/`) for RAG + voice consolidation; Node pipelines keep orchestration and rendering. |
| RAG system | **YES — high leverage here** | The script brain today gets brand kit + trends JSON only. Zero retrieval of past scripts, past performance, or the 68-doc research corpus. RAG is the missing half. |
| RAG framework | **None — plain Python + pgvector SQL** | Neon already runs pgvector on every plan; LangChain 1.0 is stable but unnecessary at this scale; LlamaIndex still 0.x; Haystack now 3.x. Framework churn > benefit. |
| Vector DB | **Neon pgvector only** | Tens of thousands of vectors — exact/HNSW scan in Postgres is plenty. Qdrant/Chroma/LanceDB (all Apache-2.0) only if scale ever demands. |
| Biggest structural win | **Semantic duplicate gate** | The title dup gate is currently dead ×3 (bug #36: no `title` in engine return path, fail-open on API error, `titleHistory` has zero other readers). Embeddings fix the whole class. |

---

## 1. Where the code stands (language inventory, verified)

Source files, excluding `node_modules` and build output:

| Language | Files | Lines | What it is |
|---|---|---|---|
| .tsx | 318 | 46,821 | Studio (Next.js) UI |
| .mjs | 99 | 15,327 | All pipelines, engines, publishers, libs |
| .js | 86 | 12,454 | Studio API routes/libs + engine remnants |
| .py | 25 | 3,138 | TTS/voice, Colab music drivers, thumbnail PIL renderer |
| .ts | 11 | 592 | Studio bits |
| .sh | 5 | 354 | Glue |

**Python today is small and unmanaged:** 25 files / 3,138 lines, **no requirements.txt, no venv, no pyproject anywhere**. CI installs 4 packages ad hoc: `edge-tts` in **11 workflows**, `kokoro-onnx` in 7, `soundfile` in 5, `pillow` ×1 — every install is `pip install --quiet ... || true` (silent failure = the colab unpinned-deps bug class, X3/#50). Every .py is invoked by a Node script spawning it (`youtube-engine.mjs:113` → narrate.py, `longvideo/*` → edge_batch.py ×7 call sites, `longform-upload.mjs:165` → gen-doc-thumbnail.py).

This is the honest baseline for "move to Python": Python is already the AI/voice layer, it's just unversioned, duplicated (4+ TTS implementations, arch-audit P8), and installed by hope.

## 2. The Python question — the honest answer

### 2.1 What physically cannot move to Python
- **Studio** — Next.js/Vercel is Node by construction (318 .tsx files, the largest LOC block in the repo). Rewriting it means a Django/FastAPI SPA rewrite of a working multi-tenant app. Not proposed.
- **Remotion explainer** — Remotion's engine "is built with Node.JS" (remotion.dev/docs/ssr); compositions are React components. The Python package `remotion-lambda` exists but **only triggers Lambda renders** — no Python composition or local-render runtime exists. A Node project on disk stays mandatory.
- **HyperFrames** — in-house Node engine + skill system.

So "move the project to Python" can, at most, mean the **pipeline scripts** (the 15k lines of .mjs) and the **AI/voice layer**. Studio/Remotion/HyperFrames stay Node permanently.

### 2.2 What moving pipeline scripts to Python would actually cost
- `channel-pipeline.mjs`, `yt-daily.mjs`, `youtube-engine.mjs`, `lib/*`, all publishers — ~15k lines of battle-tested code that survived 40+ filed bugs this week precisely because they're being audited, not rewritten.
- FFmpeg rendering is subprocess-spawning — identical work in either language. Python buys nothing there (`ffmpeg-python`/MoviePy actively add risk: MoviePy re-encodes via numpy and is "slower than using ffmpeg directly", own README; ffmpeg-python has no releases and 479 open issues).
- The GitHub Actions scheduling layer (arch-audit ADR-A: keep GHA) is language-neutral.
- Net: a port is **months of regression risk for zero capability gain**. The Oct-09 and Oct-17 audits exist because this code is complex; rewriting it resets that clock.

### 2.3 The recommended shape: Python as the AI sidecar (staged)
```
services/ai/                 # NEW — the Python side
  requirements.txt           # pinned (fixes the no-venv/no-pin problem repo-wide)
  app.py                     # FastAPI: /context, /dedupe, /health
  indexer.py                 # embeds corpus → Neon pgvector (cron-able via GHA)
  narrate/                   # consolidated voice: narrate.py + edge_batch.py + vox-tts.py merged
```
- Node callers talk to it one way: **HTTP** (localhost in CI, or direct `spawnSync` for the TTS path — matching today's seam style).
- **Phase 0 — hygiene (do regardless):** one pinned `requirements.txt` + a `setup-python` step replacing the 11 ad-hoc `pip install` blocks. Removes the X3 unpinned-deps failure class repo-wide. ~1 hour.
- **Phase 1 — RAG MVP** (section 3). ~1 focused day.
- **Phase 2 — semantic dup gate** replacing the dead title gate. Small.
- **Phase 3 — voice consolidation**: merge the 4 TTS implementations into one `narrate/` module behind `synthesize({text, voice, outBase}) → {audioPath, words[]}` (arch-audit SEAM 4, now in Python where the engines already live).
- **Phase 4 (optional):** strategy-corpus chat endpoint surfaced in Studio.

### 2.4 If you ever insisted on full-Python
It exists and is coherent: FastAPI (0.143.x, MIT — the de facto standard for small ML services per its own docs/testimonials) + APScheduler **v3** (v4 is explicitly "do NOT use in production") or Huey-on-Postgres for jobs (Celery requires RabbitMQ/Redis and doesn't support Windows; arq is "maintenance only mode") + ffmpeg subprocess + dropping Remotion or keeping one Node microservice for it + Studio stays Node anyway. You'd end up with a **polyglot repo regardless** — which is exactly why the sidecar shape is the right first move.

---

## 3. RAG system design for THIS repo

### 3.1 Why RAG helps here specifically (grounded, not generic)
Verified today: `generateYouTubeScript` (youtube-engine.mjs:476-607) feeds the LLM **only** the brand kit, a 5-title trend block + 12 hot keywords (trends-<slug>.json), and viewer search terms via the topic directive. **No past scripts, no past performance (views/retention/CTR), no examples, ever** — recent titles are used strictly post-hoc as a dup gate (and that gate is dead, #36). Meanwhile the repo already owns a real corpus:

| Corpus asset | Location | Size | Status |
|---|---|---|---|
| Title/topic history per channel | `yt-mcp/state/<slug>.json` `titleHistory` (cap 60) + `lastVideos` | 5 files, ~14K | git-tracked, CI-updated daily |
| Trend seeds + viral videos w/ views | `yt-mcp/trends-<slug>.json` (10 videos × views) | ×4, ~2.1K each | git-tracked, refreshed daily |
| Viewer search terms w/ counts | `yt-mcp/terms-<slug>.json` | ×4 | git-tracked |
| **Research/strategy corpus** | `research/*.md` | **68 docs / 9,471 lines** | git-tracked |
| Full past script beats | `explainer/public/lf-investors-compass.json` (87K), storyboards, reel scripts | 194 tracked files | git-tracked |
| Post log + performance snapshots | `reporting/logs/posts-log.json` (cap 3,000), `state/report-stats.json` | small | tracked |
| Word-level transcripts | `hyperframes/work/**/beat-NN.words.json` (86 files) | 170M local | **not tracked** (local/CI-only) |
| Brand voice/style kits | `yt-brands/brands.mjs` (15 kits: niches, authority, tags, voice) + ONBOARDING.md | small | git-tracked |

The single highest-value gap: **the pipeline never learns from what already worked.** RAG closes exactly that.

### 3.2 Architecture (minimal, no new infrastructure)
**Store:** Neon pgvector — "available on every Neon plan with no add-on" (neon.com/docs/extensions/pgvector), HNSW + halfvec supported. At tens of thousands of vectors, this is plenty; a dedicated vector DB (Qdrant/Chroma/LanceDB — all Apache-2.0 if ever needed) is not warranted. Note: Neon **removed** ParadeDB `pg_search` (2026-09-21); hybrid text search = built-in `tsvector`, optionally their `lakebase_text` BM25 replacement.

**Schema (one table to start):**
```sql
CREATE TABLE documents (
  id TEXT PRIMARY KEY,            -- e.g. "title:quotequarry:2026-10-17:vid123"
  source TEXT NOT NULL,           -- titles | scripts | research | trends | terms | postlog
  channel TEXT,                   -- slug or NULL for global docs
  text TEXT NOT NULL,             -- the chunk
  context TEXT DEFAULT '',        -- Anthropic-style contextual prefix (see 3.3)
  embedding vector(1536),         -- text-embedding-3-small
  tsv tsvector,                   -- generated column, for hybrid
  meta JSONB DEFAULT '{}',        -- views, publishAt, retentionPct, videoId…
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON documents USING gin (tsv);
```

**Embeddings:** `text-embedding-3-small` — $0.02/1M tokens, 1536 dims, 8,192-token input (OpenAI pricing docs). At this corpus size (~a few MB of text) that's **pennies per month**, with near-zero cost to re-embed daily state. (Alternative: voyage-4-lite, $0.02/1M + 200M free tokens. Avoid Gemini embeddings for this — 2,048-token input cap and a hard "you must re-embed all of your existing data" on model switch per their docs.)

**Retrieval:** hybrid — cosine top-20 + tsvector top-20 fused via Reciprocal Rank Fusion, then optional rerank. Rerankers if/when needed: Voyage rerank-3-lite ($0.02/1M) or self-hosted BGE-reranker-v2-m3 (Apache-2.0, free). For English-only short text, the $0.02 embedding tier is the right buy; don't pay for 3072-dim/multimodal tiers.

**Indexer:** `indexer.py` run as a GHA step after state commits (they already commit daily) — diff-embeds changed titles/scripts/docs. Idempotent by `id`.

**Server:** the FastAPI sidecar exposes `GET /context?channel=slug&topic=...&kind=script` returning the fused, reranked chunks; `yt-daily.mjs` injects the result block into the existing prompt at youtube-engine.mjs:506-511 (a ~20-line change on the Node side, behind an env flag so it degrades to today's behavior if the service is down).

### 3.3 The one technique worth copying: Anthropic contextual retrieval
Prepend a Claude/LLM-generated 50–100-token chunk-context before embedding AND before BM25 indexing, then rank-fuse (anthropic.com/news/contextual-retrieval). Documented failure-rate reduction at recall@20: contextual embeddings alone **−35%** (5.7%→3.7%); + contextual BM25 **−49%** (→2.9%); + reranking **−67%** (→1.9%); one-time cost ≈ $1.02/1M doc tokens with prompt caching. This matters here because most chunks (a bare title, a trend row) have no self-contained meaning — "Warren Buffett's Unbroken Rule" is useless without "Money Rulebook, Oct 12, 84% avg retention, 41k views/14d".

**Skip:** GraphRAG and LightRAG — entity-graph pipelines with LLM-per-chunk indexing cost; designed for corpus-wide synthesis questions, not for grounding daily script generation on a small corpus. Revisit only if you want "what themes across ALL 16 channels perform best" corpus-analytics.

**Eval:** Ragas 0.4.3 (Apache-2.0; Faithfulness / Context Precision / Context Recall) on a held-out set of ~50 past scripts before trusting any uplift. Caveat: the repo has moved to a new org (vibrantlabsai) — pin the exact package.

### 3.4 RAG frameworks — verdict per option
| Option | State (Oct 2026) | Verdict |
|---|---|---|
| **None (plain Python + SDK + pgvector SQL)** | — | **USE THIS.** ~150 lines. Anthropic's own contextual-retrieval reference pipeline uses no framework. |
| LangChain / LangGraph | 1.0 GA Oct 2025, explicit "no breaking changes until 2.0" | Acceptable if you want agents later; unnecessary for retrieval-only. |
| LlamaIndex | core still **0.14.x** (Sept 2026) | API-stability risk; its strength (data connectors for PDFs/slide decks) is irrelevant — your data is already JSON/MD. |
| Haystack | now **3.x** (2.x archived) | Fine library; a major-version migration already happened — churn evidence. |
| txtai | v9.14, Apache-2.0 | All-in-one but redundant once pgvector holds the data. |

### 3.5 RAG use cases, ranked by expected impact
1. **Semantic duplicate gate** (P2, Phase 2) — embed candidate title (+ contextual prefix) vs corpus; cosine threshold replaces/augments Jaccard-0.6. Structurally fixes #36's dead gate, catches paraphrase dups ("37 billion" vs "thirty-seven billion") the string gate can't see, and doesn't fail open when the YouTube API errors (state titles + trends already in Neon are the fallback corpus).
2. **Performance-grounded topic selection** (P1) — retrieve top-K past own titles/viral seeds **with views+retention in meta**, plus this niche's current trends, into the topic directive. Today the prompt sees trends but not own-history performance.
3. **Script few-shot examples** (P1) — retrieve the 2–3 best-performing past scripts (from `lf-*.json` beats + posts-log) per brand as style exemplars in the prompt.
4. **Strategy-corpus Q&A** (P4, optional) — the 68 research docs + YouTube-policy notes become askable ("what did we decide about TikTok slots?"), surfaced as a Studio route.
5. **Thumbnail/caption variant grounding** — retrieve past winning title patterns per niche for fb-images.mjs / poster text.

### 3.6 What RAG will NOT fix
The 50+ open tracker issues (#33–#88) are code bugs — dup-gate return path, state races, secrets custody, CI reliability. RAG is additive intelligence; the bug backlog still needs the normal fix loop. Also honest: **no vendor has published measured gains for RAG-grounded marketing/script generation specifically** (section 7, item 7) — the closest technique (contextual retrieval) is proven for retrieval accuracy, not copy quality. Validate with Ragas + your own retention/CTR numbers before believing any uplift claim.

---

## 4. Impact assessment — what actually improves, and how

| # | Improvement | Mechanism | Evidence base | Expected effect |
|---|---|---|---|---|
| 1 | Duplicate videos stop | Semantic gate replaces dead title gate | #36 (gate dead ×3, verified); live dup incidents Oct 1–5 (3–4× same video) | Structural fix of a proven money-losing failure mode |
| 2 | Scripts learn from winners | Own performance data enters the prompt for the first time | §3.1 inventory: zero retrieval today | Topic-script fit; the only lever in the stack currently untouched |
| 3 | Brand-voice consistency | Few-shot past scripts per brand + style kit grounding | 15 kits already defined but only loosely used | Less template-drift across the 5-provider LLM chain |
| 4 | Research corpus becomes usable | 9,471 lines of strategy docs become retrievable + askable | Currently read by humans only | Operator speed; decisions encoded once, reused forever |
| 5 | Python layer stops being fragile | One pinned requirements.txt replaces 24 ad-hoc installs across 11 workflows | X3/#50 (unpinned deps killed 4/5 Colab runs) | Direct reliability fix, independent of RAG |
| 6 | TTS deduplication | 4 implementations → 1 `synthesize()` module | arch-audit P8 + #41/#44 (edge_batch bugs) | Fewer per-engine bugs like the retry-overwrite silence bug |
| 7 | Cheaper ops | pgvector on existing Neon = $0 new infra; embedding cost ~cents/mo | §3.2 | No new vendor, no new bill |

**Costs / risks (honest):**
- One more service to keep alive in CI (mitigate: degrade-to-old-behavior flag on the Node side).
- The Node↔Python seam is a real interface — define it as HTTP + pinned JSON schemas, not spawn-string soup (arch-audit P8's lesson).
- Neon's running pgvector version isn't documented by Neon — verify `hnsw.iterative_scan` after `CREATE EXTENSION` before relying on it.
- Switching embedding models later = full re-embed (Gemini docs state this explicitly; true of all providers) — pick the boring one first.
- Framework gravity: adding LangChain "because RAG" adds dependency churn without capability at this scale.

## 5. Decision matrix

| Option | Capability gained | Risk | Effort | Verdict |
|---|---|---|---|---|
| Stay as-is, no Python growth | none | none | 0 | Leaves the two proven gaps (dup gate, no retrieval) open |
| **Hybrid: Python AI sidecar + RAG on Neon pgvector** | semantic dedupe, performance-grounded scripts, corpus Q&A, pinned voice layer | low (degradable, no new infra) | Phase 0: hours; Phase 1–2: ~2 days | **DO THIS** |
| Full pipeline port to Python | none beyond above | high (rewrites working code; Studio/Remotion stay Node anyway) | months | No |
| RAG with LangChain/LlamaIndex + dedicated vector DB | same as hybrid | framework/vendor churn | more | Only if you later need multi-tenant vector ops |

## 6. Phased plan (when you say "go")

1. **Phase 0 — Python hygiene** (~1h): `services/ai/requirements.txt` (edge-tts, kokoro-onnx, soundfile, pillow, openai, asyncpg/pgvector-python, fastapi, uvicorn — version-pinned); one setup-python step per workflow replacing the inline pip installs.
2. **Phase 1 — RAG MVP** (~1 day): `documents` table on Neon → `indexer.py` (titles+state first, then research/*.md with contextual prefixes) → `/context` endpoint → inject into `generateYouTubeScript` behind `AI_CONTEXT_URL` env flag.
3. **Phase 2 — semantic dup gate** (~half day): embed candidate titles at gate time; cosine ≥ threshold against channel corpus; keep the string gate as a fast pre-filter; never fail open (fall back to Neon corpus, not `[]`).
4. **Phase 3 — voice consolidation**: merge narrate.py + edge_batch.py + vox-tts.py behind one `synthesize()`.
5. **Phase 4 — Studio surface** (optional): `/api/strategy-chat` proxying the RAG endpoint for owner/staff roles only (respecting the #60 authz pattern).
6. **Evaluate**: Ragas faithfulness/context metrics on 50 past scripts + track retention/CTR delta for 2 weeks before/after enabling context injection.

## 7. Source register (fetched 2026-10-17)

- Neon pgvector: https://neon.com/docs/extensions/pgvector (every plan, HNSW, halfvec) · pg_search removal: https://neon.com/docs/extensions/pg_search · pgvector upstream: https://github.com/pgvector/pgvector (0.8.0 iterative scans, v0.8.7)
- Contextual retrieval: https://www.anthropic.com/news/contextual-retrieval (−35%/−49%/−67%, $1.02/1M)
- Embeddings/pricing: https://developers.openai.com/api/docs/pricing (3-large $0.13/1M 3072d, 3-small $0.02/1M 1536d) · https://docs.voyageai.com/docs/pricing (voyage-4-lite $0.02/1M, rerank-3-lite $0.02/1M) · https://cohere.com/blog/embed-5 (GA Sep 30 2026) · https://huggingface.co/BAAI/bge-m3 (MIT, 1024d) · https://ai.google.dev/gemini-api/docs/embeddings (2,048-token cap, re-embed warning)
- Frameworks: https://www.langchain.com/blog/langchain-langgraph-1dot0 (1.0 GA, stability commitment) · https://github.com/run-llama/llama_index/releases (0.14.x) · https://docs.haystack.deepset.ai/docs/intro (3.x) · https://github.com/neuml/txtai/releases (v9.14)
- Vector DB licenses: Qdrant Apache-2.0 (github.com/qdrant/qdrant) · Chroma Apache-2.0 (github.com/chroma-core/chroma) · LanceDB Apache-2.0 (github.com/lancedb/lancedb) · Weaviate BSD-3 + commercial wl/ (github.com/weaviate/weaviate)
- Rerankers: Voyage (docs.voyageai.com) · Cohere Rerank 4.0 (docs.cohere.com — per-search PAYG no longer on pricing page, uncertain) · BGE-reranker-v2-m3 Apache-2.0 (huggingface.co/BAAI/bge-reranker-v2-m3)
- GraphRAG: https://microsoft.github.io/graphrag (MIT) · LightRAG: https://github.com/HKUDS/LightRAG (MIT, EMNLP2025)
- Eval: https://pypi.org/project/ragas (0.4.3, Apache-2.0; repo moved to vibrantlabsai org) · https://docs.ragas.io (faithfulness/context metrics)
- Python ecosystem: https://www.remotion.dev/docs/ssr + /docs/lambda/python (Node-only engine; pip pkg = Lambda trigger only) · https://fastapi.tiangolo.com + PyPI (0.143.3) · https://docs.celeryq.dev (broker required, no Windows) · https://github.com/python-arq/arq (maintenance-only) · https://github.com/agronholm/apscheduler (v4 pre-release warning) · https://github.com/coleifer/huey (Postgres backend) · https://github.com/kkroening/ffmpeg-python + https://github.com/Zulko/moviepy (wrapper verdicts) · https://github.com/yt-dlp/yt-dlp (Unlicense, monthly releases)

**Uncertainties carried from research:** Neon's live pgvector version/iterative-scan availability undocumented; Voyage dims/context not on pricing page; Cohere per-search rerank PAYG and gemini-embedding-001 per-token price absent from today's pricing pages; LanceDB cloud free tier unconfirmed; Ragas ownership move — pin the package; no primary source documents RAG gains for marketing-copy generation specifically.
