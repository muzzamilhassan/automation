"""Brain sidecar app (Phase 3, issue #105, Tasks 1+4).

FastAPI app factory. Route handlers are plain `def` (sync) functions:
FastAPI runs sync handlers in its threadpool automatically, keeping the
blocking store/model calls off the event loop without hand-rolled
run_in_threadpool plumbing (documented choice per the Task 4 brief).

Endpoints (spec D9, pinned shapes):

- GET  /health  -> {status, model_loaded, pgvector_reachable}  (AC-P3-10)
- POST /context {channel, kind, topic, k} ->
      [{id, score, performance, excerpt}]                       (AC-P3-8)
- POST /dedupe  {channel, kind, template_id, chunks[{text}], threshold?,
                 job_id?} ->
      {verdict: PASS|WARN|BLOCK, score, top_match_id, neighbors[]}
                                                       (AC-P3-4/7/12/16)
- POST /embed   {channel, kind, job_id, video_id?, chunks[{chunk_kind,
                text}], performance?, template_id?} ->
      {inserted, updated}                                (AC-P3-2/17)

Similarity convention (D9, pinned + unit-tested): vectors are stored
normalized; pgvector `<=>` returns DISTANCE = 1 - cosine similarity;
search_similar returns SIMILARITY (1 - distance); the /dedupe gate
BLOCKS when same-channel similarity >= threshold.

Failure policy here: malformed input -> 400 {"error"}; unexpected
failure -> 500 {"error"} (the Node caller owns the D6 fail-open). A
failed /dedupe verdict WRITE degrades to a log warning (AC-P3-12); a
failed /context performance join degrades to empty performance maps.
No key material exists in this service — local model + DB only.
"""

from __future__ import annotations

import hashlib
import json
import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from brain import config as brain_config
from brain import embedder
from brain.store import get_store

logger = logging.getLogger("brain.app")

EXCERPT_CHARS = 400   # D9 /context excerpt truncation
SEARCH_LIMIT = 5      # neighbors considered per chunk in /dedupe


class _BadInput(ValueError):
    """Malformed request body — surfaces as 400 {"error"}."""


class _ChunkText(BaseModel):
    """/dedupe chunk: only the text is needed for comparison."""
    text: str
    chunk_kind: str | None = None


class _Chunk(BaseModel):
    """/embed chunk: chunk_kind is part of the unique storage key."""
    chunk_kind: str
    text: str


class _ContextIn(BaseModel):
    channel: str
    kind: str
    topic: str
    k: int = 5


class _DedupeIn(BaseModel):
    channel: str
    kind: str
    template_id: str | None = None
    chunks: list[_ChunkText]
    threshold: float | None = None
    job_id: str | None = None   # additive, optional (verdict ledger AC-P3-12)


class _EmbedIn(BaseModel):
    channel: str
    kind: str
    job_id: str
    video_id: str | None = None
    chunks: list[_Chunk]
    performance: dict | None = None
    template_id: str | None = None


# ---- provider seams -------------------------------------------------------
# Module-level indirection so tests monkeypatch these names; production
# resolves lazily per call (store builds its psycopg adapter on first use;
# the embedder loads its model on first embed).

def _get_store():
    """Production store provider (lazy — no DB touched at import)."""
    return get_store()


def _embed_texts(texts: list[str]) -> list[list[float]]:
    """Production embedder provider (lazy model load inside)."""
    return embedder.embed_texts(texts)


def _model_loaded() -> bool:
    """True once the fastembed model is actually loaded (never faked)."""
    return getattr(embedder, "_model", None) is not None


def _pg_reachable(store) -> bool:
    """Real liveness probe: SELECT 1 through the store's injected client.

    BrainStore deliberately exposes no ping(); this reads the transport
    client directly for the health check only (AC-P3-10).
    """
    try:
        store._client("SELECT 1", [])
        return True
    except Exception:
        return False


def _content_hash(chunk_kind: str, text: str) -> str:
    """Canonical fingerprint (spec D12): sha256 over canonical JSON of
    the whitespace-normalized text + chunk kind — one hash per script
    chunk no matter which path embeds it."""
    normalized = " ".join(text.split())
    canonical = json.dumps(
        {"chunk_kind": chunk_kind, "text": normalized},
        sort_keys=True, ensure_ascii=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _neighbor_out(n: dict) -> dict:
    """Trim a search_similar row to the /dedupe neighbors[] shape."""
    return {
        "chunk_kind": n.get("chunk_kind"),
        "channel_id": n.get("channel_id"),
        "video_id": n.get("video_id"),
        "score": float(n["score"]),
        "same_channel": bool(n.get("same_channel")),
    }


def create_app() -> FastAPI:
    app = FastAPI(title="brain", version="0.2.0")

    @app.exception_handler(RequestValidationError)
    def _validation_error(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=400,
            content={"error": f"malformed input: {exc.errors()[:3]}"},
        )

    # ----------------------------------------------------------- /health

    @app.get("/health")
    def health() -> dict:
        # Honest state for CI preflight (AC-P3-10): both flags are real
        # probes, never faked True. A missing DATABASE_URL or dead pool
        # simply reports False.
        model_ok = _model_loaded()
        try:
            pg_ok = _pg_reachable(_get_store())
        except Exception:
            pg_ok = False
        return {
            "status": "ok",
            "model_loaded": model_ok,
            "pgvector_reachable": pg_ok,
        }

    # ---------------------------------------------------------- /context

    @app.post("/context")
    def context(body: _ContextIn):
        try:
            if body.k <= 0:
                raise _BadInput("k must be a positive integer")
            topic_vec = _embed_texts([body.topic])[0]
            store = _get_store()
            neighbors = store.search_similar(
                topic_vec, channel_id=body.channel, kind=body.kind,
                limit=body.k)
            # Performance join keys on the STORAGE row id (search_similar
            # returns it — Task 4's disclosed gap, fixed in Task 7). The OUT
            # `id` stays the exemplar's video_id (D9 shape, unchanged).
            row_ids = [n.get("id") for n in neighbors if n.get("id") is not None]
            try:
                perf = store.top_performance(row_ids)
            except Exception:
                # Fail-open on the join only: exemplars still return
                # (AC-P3-8), performance degrades to {}.
                logger.warning(
                    "brain /context: performance join failed — "
                    "returning exemplars without performance", exc_info=True)
                perf = {}
            return [
                {
                    "id": n.get("video_id"),
                    "score": float(n["score"]),
                    "performance": perf.get(n.get("id"), {}),
                    "excerpt": (n.get("chunk_text") or "")[:EXCERPT_CHARS],
                }
                for n in neighbors
            ]
        except _BadInput as exc:
            return JSONResponse(status_code=400, content={"error": str(exc)})
        except Exception as exc:
            logger.exception("brain /context failed")
            return JSONResponse(status_code=500, content={"error": str(exc)})

    # ----------------------------------------------------------- /dedupe

    @app.post("/dedupe")
    def dedupe(body: _DedupeIn):
        try:
            if not body.chunks:
                raise _BadInput("chunks must be a non-empty list")
            threshold = (
                body.threshold
                if body.threshold is not None
                else brain_config.config.default_threshold)
            band = threshold + brain_config.config.cross_channel_band

            vectors = _embed_texts([c.text for c in body.chunks])
            store = _get_store()
            neighbors: list[dict] = []
            for vec in vectors:
                neighbors.extend(store.search_similar(
                    vec, channel_id=body.channel, kind=body.kind,
                    limit=SEARCH_LIMIT))

            same = [n for n in neighbors if n.get("same_channel")]
            cross = [n for n in neighbors if not n.get("same_channel")]
            best_same = max(same, key=lambda n: n["score"], default=None)
            best_cross = max(cross, key=lambda n: n["score"], default=None)

            # Gate (D9 pinned convention): score is SIMILARITY.
            # BLOCK: same-channel similarity >= threshold (AC-P3-4).
            # WARN: cross-channel similarity >= threshold + band (AC-P3-16).
            if best_same is not None and best_same["score"] >= threshold:
                verdict, top = "BLOCK", best_same
            elif best_cross is not None and best_cross["score"] >= band:
                verdict, top = "WARN", best_cross
            else:
                verdict = "PASS"
                top = max(
                    (n for n in (best_same, best_cross) if n is not None),
                    key=lambda n: n["score"], default=None)
            score = float(top["score"]) if top is not None else 0.0
            top_match_id = top.get("video_id") if top is not None else None

            try:
                store.record_verdict({
                    "channel_id": body.channel,
                    "script_kind": body.kind,
                    "job_id": body.job_id,
                    "verdict": verdict,
                    "top_match_id": top_match_id,
                    "score": score,
                    "threshold": threshold,
                })
            except Exception:
                # AC-P3-12: a failed verdict write degrades to one log
                # warning — never halts generation.
                logger.warning(
                    "brain /dedupe: verdict write failed — degrading "
                    "to warning (AC-P3-12)", exc_info=True)

            return {
                "verdict": verdict,
                "score": score,
                "top_match_id": top_match_id,
                "neighbors": [_neighbor_out(n) for n in neighbors],
            }
        except _BadInput as exc:
            return JSONResponse(status_code=400, content={"error": str(exc)})
        except Exception as exc:
            logger.exception("brain /dedupe failed")
            return JSONResponse(status_code=500, content={"error": str(exc)})

    # ------------------------------------------------------------ /embed

    @app.post("/embed")
    def embed(body: _EmbedIn):
        try:
            if not body.chunks:
                raise _BadInput("chunks must be a non-empty list")
            vectors = _embed_texts([c.text for c in body.chunks])
            stamp = embedder.model_stamp()
            rows = [
                {
                    "channel_id": body.channel,
                    "script_kind": body.kind,
                    "chunk_kind": c.chunk_kind,
                    "job_id": body.job_id,
                    "content_hash": _content_hash(c.chunk_kind, c.text),
                    "chunk_text": c.text,
                    "embedding": vec,
                    "performance": body.performance or {},
                    "meta": (
                        {"template_id": body.template_id}
                        if body.template_id else {}),
                    "video_id": body.video_id,
                    "model_id": stamp["model_id"],
                    "model_dim": stamp["dims"],
                }
                for c, vec in zip(body.chunks, vectors)
            ]
            # AC-P3-2: ALL chunks of one script in ONE upsert_chunks call.
            # upsert_chunks is NOT nestable (Task 3 review — a nested
            # transaction commits the outer early), so there is NO outer
            # transaction() here: upsert_chunks' own internal transaction
            # already gives the required all-or-nothing behavior.
            store = _get_store()
            result = store.upsert_chunks(rows)
            return {
                "inserted": result.get("inserted", 0),
                "updated": result.get("updated", 0),
            }
        except _BadInput as exc:
            return JSONResponse(status_code=400, content={"error": str(exc)})
        except Exception as exc:
            logger.exception("brain /embed failed")
            return JSONResponse(status_code=500, content={"error": str(exc)})

    return app


app = create_app()
