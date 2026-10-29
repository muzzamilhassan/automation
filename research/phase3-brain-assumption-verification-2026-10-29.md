# Phase 3 Brain Spec — Assumption Verification (2026-10-29)

Read-only verification of `docs/superpowers/specs/2026-10-29-phase3-rag-brain-spec.md` load-bearing facts. All sources fetched 2026-10-29.

## Assumptions Table

| # | Spec claim | Verdict | Verified reality (source, fetched 2026-10-29) |
|---|---|---|---|
| 1a | all-MiniLM-L6-v2 is 384-dim | VERIFIED | "maps sentences & paragraphs to a 384 dimensional dense vector space" — HF model card (huggingface.co/sentence-transformers/all-MiniLM-L6-v2) |
| 1b | License MIT | **CORRECTED** | License is **apache-2.0** on the HF model card (model metadata + card). Not MIT. |
| 1c | Model ~80MB | VERIFIED (approx) | 22.7M params, fp32 safetensors ≈ ~90MB. "~80MB" is close enough for architecture; state ~90MB. |
| 1d | Whole-script embedding in one pass | **CORRECTED — CRITICAL** | Max sequence length **256 word pieces**; card states "By default, input text longer than 256 word pieces is truncated." A 1,300-word script ≈ 1,700–2,000 word pieces → **~87% of the script silently discarded**. Whole-script embedding is impossible as specified. |
| 1e | Quality adequate | VERIFIED with caveat | sbert.net: all-mpnet-base-v2 "provides the best quality", MiniLM-L6-v2 "is 5 times faster and still offers good quality" (sbert.net/docs/sentence_transformer/pretrained_models.html). MTEB avg ≈ 56 vs bge-small-en-v1.5 **62.17** (HF card). For similarity-of-style detection MiniLM is adequate; retrieval of exemplars would be better on bge. |
| 2 | CPU embedding speed in CI | VERIFIED (ballpark) | sbert.net speed table: MiniLM-L6-class ≈ **750 sentences/sec CPU** on a desktop CPU. GH-hosted runners: **ubuntu-latest private repo = 2 vCPU / 8GB** (docs.github.com/actions/reference/runners/github-hosted-runners — NOTE: the repo is private since 2026-10-24, so the 4-vCPU public spec does not apply). Conservative 50–150 short chunks/sec on 2 vCPU → ~3,000 scripts × ~6 chunks ≈ 18k chunks ≈ **2–6 min encode**. Minutes, not hours. Install (torch 539MB wheel + deps) is the bigger cost. |
| 3 | Neon pgvector available | VERIFIED | neon.com/docs/extensions/pgvector: "pgvector is available on every Neon plan with no add-on or paid tier required" (free tier included). Index types: "HNSW, IVFFLAT" both supported. `vector` indexable up to **2,000 dims** (384 fine). Latest pgvector upstream is 0.8.7; Neon typically allows latest + one version back. |
| 4 | Index choice at 1k–10k × 384 | VERIFIED (no index needed) | pgvector README (github.com/pgvector/pgvector, v0.8.7): "By default, pgvector performs exact nearest neighbor search, which provides perfect recall"; indexes trade recall for speed. At ≤10k vectors × 384 dims (~15MB of floats) exact scan is milliseconds. **Skip the index** (or add HNSW later, after data proves it's needed). Cosine = `<=>` operator, similarity = `1 - (a <=> b)`. |
| 5 | 0.85 cosine default threshold | VERIFIED (plausible) but uncalibrated | No official sbert threshold. Published practitioner guidance (agent-ci.com, Oct 2025): **~0.9 near-duplicate, ~0.8 paraphrase, ~0.7 topical**. 0.85 sits inside the paraphrase→duplicate band and is defensible as a default, BUT (a) thresholds are model-dependent (RETSim arXiv 2311.17264), (b) short-chunk vs whole-script cosine behaves differently, (c) spec already makes it configurable (D8/AC-P3-7). Ship 0.85 as default + calibrate on the corpus's own duplicate pairs. |
| 6 | sentence-transformers install footprint | CORRECTED (cost quantified) | torch 2.15.0 (PyPI, Oct 28 2026): **Linux x86-64 wheel ≈ 539MB** — no longer multi-GB CUDA-bundled on PyPI, but still ~1–2 min download + ~1 min install on a runner. Lighter path VERIFIED: **fastembed 0.9.1** (PyPI, Oct 24 2026, Apache-2.0, by Qdrant): ONNX Runtime, "don't download GBs of PyTorch dependencies", default model `BAAI/bge-small-en-v1.5` (384-dim, **512-token** seq len, MTEB avg 62.17), and it also serves `sentence-transformers/all-MiniLM-L6-v2`. fastembed is strictly better for CI (smaller + longer context + higher MTEB) unless torch is needed elsewhere. |
| 7 | FastAPI + uvicorn pinned versions | VERIFIED | fastapi **0.162.0** (PyPI, Oct 23 2026; requires Python ≥3.10); uvicorn **0.54.0** (PyPI, Sep 25 2026; Python ≥3.10; `uvicorn[standard]` adds uvloop/httptools/etc.). |
| 8 | Offline after download / CI caching | VERIFIED | sbert API docs (sbert.net/docs/package_reference/sentence_transformer/model.html): `cache_folder` (or `SENTENCE_TRANSFORMERS_HOME` env) stores downloads; `local_files_only=True` skips network. Models re-download **per job** by default → pin via `actions/cache@v6` with `path: ~/.cache/huggingface` + key on model/version (actions/cache README; 10GB repo cache limit — a ~90MB model is fine). Alternatively `model.save()`/load from a repo-committed path. |

### Spec's own numbers

- **68-doc corpus — CORRECTED (stale):** `research/` currently holds **86 .md docs** (`ls -1 research/*.md | wc -l` → 86, 2026-10-29). It grows every research run — the spec should not hardcode a count; say "all docs in research/, counted at index time."

## Sources

- https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2 (dims, apache-2.0, 22.7M params, 256-token truncation, ArguAna 50.17)
- https://sbert.net/docs/sentence_transformer/pretrained_models.html (mpnet best quality, MiniLM 5x faster; MiniLM-L6 ≈750/sec CPU class speed table)
- https://github.com/pgvector/pgvector (v0.8.7; exact search default; HNSW/IVFFlat; `<=>` cosine; 2,000-dim index limit)
- https://neon.com/docs/extensions/pgvector ("every Neon plan"; HNSW + IVFFLAT; dimension limits)
- https://docs.github.com/en/actions/reference/runners/github-hosted-runners (private ubuntu runner: 2 vCPU / 8GB / 14GB)
- https://pypi.org/project/torch/ (2.15.0, Oct 28 2026, Linux wheel ~539MB)
- https://pypi.org/project/fastembed/ (0.9.1, ONNX, no torch, bge-small-en-v1.5 default)
- https://huggingface.co/BAAI/bge-small-en-v1.5 (384-dim, 512 seq, MTEB avg 62.17 / STS 81.59)
- https://pypi.org/project/fastapi/ (0.162.0), https://pypi.org/project/uvicorn/ (0.54.0)
- https://sbert.net/docs/package_reference/sentence_transformer/model.html (cache_folder, local_files_only)
- https://github.com/actions/cache (path/key/restore-keys, 10GB limit)
- agent-ci.com/blog/2025/10/08/semantic-similarity-nuanced-not-difficult; arxiv.org/html/2311.17264v1 (threshold guidance, model-dependence)

## Implications for the spec

1. **(Highest impact — D2/D4 are architecturally wrong as written.)** MiniLM truncates at **256 word pieces**; a 1,300-word script loses ~87% of its text in the "whole-script" vector. D2/D4 must specify: **chunked sub-vectors** (e.g. ~200-token overlap windows per script, dedupe = max or mean of chunk similarities) or switch to a longer-context model (bge-small-en-v1.5 at 512 tokens still needs 3–4 chunks). Pick one before approval — it changes the table schema (chunk table vs per-script row) and the dedupe semantics.
2. **License fix:** D2 says MIT; the model is **apache-2.0**. Trivial, but the spec should be accurate since it's pinned in requirements.
3. **Consider fastembed over sentence-transformers (D2/D1):** fastembed 0.9.1 gives ONNX (no 539MB torch), 512-token context, higher MTEB (62.17 vs ~56), same 384 dims — and it can still run all-MiniLM-L6-v2. This cuts CI install minutes and reduces the chunk count in (1) by ~2x. If torch stays (for future needs), cache pip too.
4. **Drop or defer the vector index (D3):** at 1k–10k × 384, pgvector exact search is correct and fast; HNSW/IVFFlat add build cost and recall loss for nothing. Spec should state "exact search, index only if >~50k vectors."
5. **Fix the corpus count + runtime class (D4/D7):** say "all research/*.md docs at index time" (86 today, not 68), and note the CI budget honestly: private-repo runners are **2 vCPU / 8GB** — embedding 3,000 scripts is still minutes, but the spec's "CPU-fast" claim should be backed by one measured benchmark run in the QA file, not assumed.
6. **Threshold 0.85 stays, with a calibration task (D8):** keep 0.85 as configurable default (guidance band 0.8–0.9 for paraphrase→duplicate), and add a QA step that calibrates on the corpus's own near-duplicate pairs before enforcing BLOCKs in production.
