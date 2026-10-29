"""Brain API tests (Phase 3, issue #105, Tasks 1+4).

Task 1 pinned the /health contract and 501 stubs. Task 4 replaces the
stub pins with real endpoint tests per spec D9 (pinned IN/OUT shapes):
/context, /dedupe, /embed — with store and embedder stubbed through the
app module's provider seams (monkeypatch), following the Map-stub
pattern from test_store.py: fakes implement exactly the surface the
endpoints consume, so a passing test cannot be trivially green.

Similarity convention (D9, pinned here at the gate level): pgvector
`<=>` is DISTANCE = 1 - cosine; scores are SIMILARITY; /dedupe BLOCKS
when same-channel similarity >= threshold. The exact-boundary test
below flips the whole gate if an implementer inverts the convention.
"""

import importlib
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import app as app_module
from app import create_app
from brain import config as brain_config


@pytest.fixture()
def client():
    return TestClient(create_app())


# ------------------------------------------------------------- stubs ----

class FakeStore:
    """Implements exactly the BrainStore surface the endpoints consume."""

    def __init__(self, neighbors=None, performance=None):
        self.neighbors = neighbors or []
        self.performance = performance or {}
        self.searches = []
        self.perf_queries = []
        self.verdicts = []
        self.upserts = []
        self.fail_top_performance = False
        self.fail_record_verdict = False
        self.fail_upsert = False
        self.ping_ok = True

    def _client(self, sql, params=()):  # health probe uses SELECT 1
        if not self.ping_ok:
            raise RuntimeError("db down")
        return []

    def search_similar(self, embedding, channel_id, kind=None, limit=5):
        self.searches.append({
            "embedding": embedding,
            "channel_id": channel_id,
            "kind": kind,
            "limit": limit,
        })
        return list(self.neighbors)

    def top_performance(self, ids):
        if self.fail_top_performance:
            raise RuntimeError("performance join down")
        self.perf_queries.append(list(ids))
        return {i: self.performance[i] for i in ids if i in self.performance}

    def record_verdict(self, verdict):
        if self.fail_record_verdict:
            raise RuntimeError("verdict write down")
        self.verdicts.append(verdict)

    def upsert_chunks(self, rows):
        if self.fail_upsert:
            raise RuntimeError("store down")
        self.upserts.append(list(rows))
        return {"inserted": len(rows), "updated": 0}


def neighbor(score=0.9, same=True, video="vid-1", chunk_kind="pooled",
             text="past script text", row_id=101):
    return {
        "id": row_id,  # storage row id (script_memory.id) — performance join key
        "chunk_kind": chunk_kind,
        "channel_id": "chan-a" if same else "chan-b",
        "score": score,
        "same_channel": same,
        "chunk_text": text,
        "video_id": video,
    }


@pytest.fixture()
def brain(monkeypatch):
    """App with store + embedder stubbed via the module provider seams."""
    store = FakeStore()
    monkeypatch.setattr(app_module, "_get_store", lambda: store)
    monkeypatch.setattr(
        app_module, "_embed_texts",
        lambda texts: [[1.0, 0.0] for _ in texts])
    monkeypatch.setattr(app_module, "_model_loaded", lambda: True)
    return SimpleNamespace(
        client=TestClient(app_module.create_app()),
        store=store,
        module=app_module,
    )


# ------------------------------------------------------------ /health ----

def test_health_returns_ok_with_honest_state(client):
    """AC-P3-10 shape: status + model_loaded + pgvector_reachable.

    Nothing is loaded or wired in a bare app -> both flags False (never
    faked True — CI preflight depends on this).
    """
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["model_loaded"] is False
    assert body["pgvector_reachable"] is False


def test_health_reports_loaded_model_and_reachable_db(brain):
    res = brain.client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["model_loaded"] is True
    assert body["pgvector_reachable"] is True


def test_health_reports_pg_down_honestly(brain):
    brain.store.ping_ok = False
    res = brain.client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["model_loaded"] is True
    assert body["pgvector_reachable"] is False


# ------------------------------------------------ startup warmup (fix 1) ----

def test_startup_warmup_loads_model_and_health_reports_true(monkeypatch):
    """Lifespan warmup embeds a warmup text at startup (loads ONNX before
    any request), so a freshly spawned sidecar reports model_loaded: true
    from the first probe — a cold sidecar must not disarm the Task 7 gate
    (finance channels would fail closed forever)."""
    from brain import embedder as embedder_module
    calls = []

    def fake_embed(texts):
        calls.extend(texts)
        embedder_module._model = object()  # simulate the model now loaded
        return [[1.0, 0.0] for _ in texts]

    monkeypatch.setattr(app_module, "_embed_texts", fake_embed)
    monkeypatch.setattr(
        app_module, "_model_loaded",
        lambda: getattr(embedder_module, "_model", None) is not None)
    # monkeypatch restores embedder._model to None afterwards (never leaks
    # a fake loaded model into the honest-health tests).
    monkeypatch.setattr(embedder_module, "_model", None)

    with TestClient(app_module.create_app()) as client:  # ctx mgr runs lifespan
        res = client.get("/health")

    assert calls == ["brain warmup"], "startup must warm the embedder"
    assert res.status_code == 200
    assert res.json()["model_loaded"] is True


def test_startup_warmup_failure_is_non_fatal_and_health_stays_honest(monkeypatch):
    """A broken model (download failure etc.) must not crash startup —
    /health stays honest (false) and D6 tiering handles it."""
    def boom(texts):
        raise RuntimeError("model download failed")

    monkeypatch.setattr(app_module, "_embed_texts", boom)
    monkeypatch.setattr(app_module, "_model_loaded", lambda: False)

    with TestClient(app_module.create_app()) as client:
        res = client.get("/health")

    assert res.status_code == 200
    assert res.json()["status"] == "ok"
    assert res.json()["model_loaded"] is False


# ----------------------------------------------------------- /context ----

def test_context_returns_exemplars_with_performance_and_excerpt(brain):
    brain.store.neighbors = [
        neighbor(score=0.91, video="vid-1", text="x" * 600, row_id=101),
        neighbor(score=0.70, same=False, video="vid-2", text="other", row_id=102),
    ]
    # Performance is keyed by the STORAGE row id (script_memory.id) — the
    # join must key on search_similar's row id (Task 7 carry-forward fix),
    # never on the text video_id (bigint = text raised in production).
    brain.store.performance = {101: {"views": 1000}}

    res = brain.client.post("/context", json={
        "channel": "chan-a", "kind": "shorts", "topic": "debt payoff", "k": 2,
    })

    assert res.status_code == 200
    body = res.json()
    assert isinstance(body, list) and len(body) == 2
    top = body[0]
    assert set(top) == {"id", "score", "performance", "excerpt"}
    assert top["id"] == "vid-1", "OUT id stays the exemplar's video id (D9 shape)"
    assert top["score"] == pytest.approx(0.91)
    assert top["performance"] == {"views": 1000}
    assert len(top["excerpt"]) == 400, "excerpt truncated to 400 chars"
    assert body[1]["performance"] == {}
    assert brain.store.perf_queries[0] == [101, 102], \
        "the performance join must query STORAGE row ids, not video ids"
    # retrieval went through search_similar with the request's channel/kind/k
    assert brain.store.searches[0]["channel_id"] == "chan-a"
    assert brain.store.searches[0]["kind"] == "shorts"
    assert brain.store.searches[0]["limit"] == 2
    assert brain.store.searches[0]["embedding"] == [1.0, 0.0], \
        "topic must be embedded on the fly before search"


def test_context_defaults_k_to_5(brain):
    brain.store.neighbors = [neighbor()]
    res = brain.client.post("/context", json={
        "channel": "chan-a", "kind": "shorts", "topic": "topic",
    })
    assert res.status_code == 200
    assert brain.store.searches[0]["limit"] == 5


def test_context_performance_join_failure_degrades_not_500(brain):
    brain.store.neighbors = [neighbor()]
    brain.store.fail_top_performance = True
    res = brain.client.post("/context", json={
        "channel": "chan-a", "kind": "shorts", "topic": "topic",
    })
    assert res.status_code == 200
    assert res.json()[0]["performance"] == {}


def test_context_missing_fields_are_400(brain):
    for payload in (
        {"kind": "shorts", "topic": "t"},          # no channel
        {"channel": "chan-a", "topic": "t"},        # no kind
        {"channel": "chan-a", "kind": "shorts"},    # no topic
        {"channel": "chan-a", "kind": "shorts", "topic": "t", "k": 0},
    ):
        res = brain.client.post("/context", json=payload)
        assert res.status_code == 400, payload
        assert "error" in res.json()


def test_context_store_failure_is_500_with_error_shape(brain, monkeypatch):
    def boom():
        raise RuntimeError("db unreachable")
    monkeypatch.setattr(brain.module, "_get_store", boom)
    res = brain.client.post("/context", json={
        "channel": "chan-a", "kind": "shorts", "topic": "t",
    })
    assert res.status_code == 500
    assert "error" in res.json()


# ------------------------------------------------------------ /dedupe ----

def test_dedupe_blocks_at_exact_threshold_pins_similarity_convention(brain):
    """THE convention pin (spec D9): score is SIMILARITY (1 - pgvector
    distance); the gate is `similarity >= threshold` -> BLOCK. A score
    exactly AT the threshold must block — inverting the convention
    (distance >= threshold) silently flips this test and the gate."""
    brain.store.neighbors = [neighbor(score=0.85)]
    res = brain.client.post("/dedupe", json={
        "channel": "chan-a", "kind": "shorts", "template_id": "tmpl",
        "chunks": [{"chunk_kind": "pooled", "text": "new script"}],
        "threshold": 0.85,
    })
    assert res.status_code == 200
    body = res.json()
    assert set(body) == {"verdict", "score", "top_match_id", "neighbors"}
    assert body["verdict"] == "BLOCK"
    assert body["score"] == pytest.approx(0.85)
    assert body["top_match_id"] == "vid-1"


def test_dedupe_just_below_threshold_passes(brain):
    brain.store.neighbors = [neighbor(score=0.8499)]
    res = brain.client.post("/dedupe", json={
        "channel": "chan-a", "kind": "shorts", "template_id": "tmpl",
        "chunks": [{"chunk_kind": "pooled", "text": "new script"}],
        "threshold": 0.85,
    })
    assert res.json()["verdict"] == "PASS"


def test_dedupe_warns_when_cross_channel_band_exceeded(brain):
    brain.store.neighbors = [
        neighbor(score=0.60, same=True, video="vid-own"),
        neighbor(score=0.91, same=False, video="vid-cross"),
    ]
    res = brain.client.post("/dedupe", json={
        "channel": "chan-a", "kind": "shorts", "template_id": "tmpl",
        "chunks": [{"chunk_kind": "pooled", "text": "new script"}],
        "threshold": 0.85,
    })
    body = res.json()
    assert body["verdict"] == "WARN"
    assert body["score"] == pytest.approx(0.91)
    assert body["top_match_id"] == "vid-cross"


def test_dedupe_cross_channel_below_band_passes(brain):
    brain.store.neighbors = [neighbor(score=0.89, same=False)]
    res = brain.client.post("/dedupe", json={
        "channel": "chan-a", "kind": "shorts", "template_id": "tmpl",
        "chunks": [{"chunk_kind": "pooled", "text": "new script"}],
        "threshold": 0.85,
    })
    assert res.json()["verdict"] == "PASS"  # band = 0.85 + 0.05 = 0.90


def test_dedupe_warns_at_exact_band_boundary(brain):
    """The WARN band boundary at EXACTLY threshold + band = 0.85 + 0.05 = 0.90:
    a cross-channel match sitting precisely on the band must WARN (inclusive
    >=), not PASS. Task 4's report claimed this was already pinned at exactly
    0.90 — it was not (the nearest pins were 0.89 PASS / 0.91 WARN); this test
    is the corrected pin (Task 7 carry-forward)."""
    brain.store.neighbors = [neighbor(score=0.90, same=False, video="vid-cross")]
    res = brain.client.post("/dedupe", json={
        "channel": "chan-a", "kind": "shorts", "template_id": "tmpl",
        "chunks": [{"chunk_kind": "pooled", "text": "new script"}],
        "threshold": 0.85,
    })
    assert res.status_code == 200
    body = res.json()
    assert body["verdict"] == "WARN"
    assert body["score"] == pytest.approx(0.90)
    assert body["top_match_id"] == "vid-cross"


def test_dedupe_accepts_registry_cross_channel_threshold(brain):
    """D8 plumbing: the caller may transport the registry's cross_channel_threshold
    so template-specified values reach the gate. With cross_channel_threshold 0.70
    a 0.75 cross-channel match WARNs — under server-side derivation
    (0.75 + 0.05 = 0.80 band) it would PASS. Omitting the field keeps the
    derived band (second post)."""
    brain.store.neighbors = [neighbor(score=0.75, same=False, video="vid-cross")]
    body = {
        "channel": "chan-a", "kind": "shorts", "template_id": "tmpl",
        "chunks": [{"chunk_kind": "pooled", "text": "new script"}],
        "threshold": 0.85,
    }
    transported = brain.client.post("/dedupe", json={**body, "cross_channel_threshold": 0.70})
    assert transported.status_code == 200
    assert transported.json()["verdict"] == "WARN"
    derived = brain.client.post("/dedupe", json=body)
    assert derived.json()["verdict"] == "PASS", "absent field -> server derives 0.85 + 0.05"


def test_dedupe_max_chunk_semantics_blocks_on_best_match(brain):
    brain.store.neighbors = [neighbor(score=0.50, video="vid-weak"),
                             neighbor(score=0.93, video="vid-strong")]
    res = brain.client.post("/dedupe", json={
        "channel": "chan-a", "kind": "shorts", "template_id": "tmpl",
        "chunks": [{"chunk_kind": "pooled", "text": "a"},
                   {"chunk_kind": "pooled", "text": "b"}],
        "threshold": 0.85,
    })
    body = res.json()
    assert body["verdict"] == "BLOCK"
    assert body["score"] == pytest.approx(0.93)
    assert body["top_match_id"] == "vid-strong"


def test_dedupe_records_verdict_row(brain):
    brain.store.neighbors = [neighbor(score=0.91)]
    res = brain.client.post("/dedupe", json={
        "channel": "chan-a", "kind": "shorts", "template_id": "tmpl",
        "chunks": [{"chunk_kind": "pooled", "text": "new"}],
        "threshold": 0.85, "job_id": "job-42",
    })
    assert res.status_code == 200
    v = brain.store.verdicts[0]
    assert v["verdict"] == "BLOCK"
    assert v["score"] == pytest.approx(0.91)
    assert v["threshold"] == 0.85
    assert v["channel_id"] == "chan-a"
    assert v["script_kind"] == "shorts"
    assert v["job_id"] == "job-42"
    assert v["top_match_id"] == "vid-1"


def test_dedupe_verdict_write_failure_degrades_to_success(brain):
    """AC-P3-12: failed verdict write degrades to one warning, never 500."""
    brain.store.fail_record_verdict = True
    res = brain.client.post("/dedupe", json={
        "channel": "chan-a", "kind": "shorts", "template_id": "tmpl",
        "chunks": [{"chunk_kind": "pooled", "text": "new"}],
    })
    assert res.status_code == 200
    assert res.json()["verdict"] == "PASS"


def test_dedupe_embeds_every_incoming_chunk(brain, monkeypatch):
    seen = []

    def record_embed(texts):
        seen.extend(texts)
        return [[1.0, 0.0] for _ in texts]

    monkeypatch.setattr(brain.module, "_embed_texts", record_embed)
    brain.client.post("/dedupe", json={
        "channel": "chan-a", "kind": "shorts", "template_id": "tmpl",
        "chunks": [{"chunk_kind": "pooled", "text": "chunk one"},
                   {"chunk_kind": "pooled", "text": "chunk two"}],
    })
    assert seen == ["chunk one", "chunk two"]


def test_dedupe_empty_chunks_is_400(brain):
    res = brain.client.post("/dedupe", json={
        "channel": "chan-a", "kind": "shorts", "template_id": "tmpl",
        "chunks": [],
    })
    assert res.status_code == 400
    assert "error" in res.json()


def test_dedupe_missing_fields_is_400(brain):
    res = brain.client.post("/dedupe", json={"kind": "shorts", "chunks": [
        {"chunk_kind": "pooled", "text": "x"}]})
    assert res.status_code == 400
    assert "error" in res.json()


# ------------------------------------------------------------- /embed ----

def embed_request(**overrides):
    payload = {
        "channel": "chan-a",
        "kind": "shorts",
        "job_id": "job-42",
        "video_id": "vid-new",
        "chunks": [
            {"chunk_kind": "hook", "text": "hook text"},
            {"chunk_kind": "pooled", "text": "full script text"},
        ],
        "performance": {"views": 12},
    }
    payload.update(overrides)
    return payload


def test_embed_upserts_full_chunk_set_in_one_call(brain):
    res = brain.client.post("/embed", json=embed_request())
    assert res.status_code == 200
    assert res.json() == {"inserted": 2, "updated": 0}
    # AC-P3-2: ALL chunks of one script in ONE upsert_chunks call —
    # the endpoint must NOT wrap it in an outer transaction() (Task 3
    # review: nested transactions commit the outer early; FakeStore has
    # no transaction() at all, so an outer wrap would 500 this test).
    assert len(brain.store.upserts) == 1
    rows = brain.store.upserts[0]
    assert len(rows) == 2
    hook = next(r for r in rows if r["chunk_kind"] == "hook")
    assert hook["channel_id"] == "chan-a"
    assert hook["script_kind"] == "shorts"
    assert hook["job_id"] == "job-42"
    assert hook["video_id"] == "vid-new"
    assert hook["chunk_text"] == "hook text"
    assert hook["embedding"] == [1.0, 0.0]
    assert hook["performance"] == {"views": 12}
    assert len(hook["content_hash"]) == 64, "sha256 hex fingerprint"
    assert hook["model_id"] == brain_config.config.model_id
    assert hook["model_dim"] == brain_config.config.dims


def test_embed_content_hash_is_canonical_and_whitespace_insensitive(brain):
    """D12: the canonical fingerprint normalizes text — the same script
    through any path lands on one hash (no duplicate vectors)."""
    brain.client.post("/embed", json=embed_request())
    brain.client.post("/embed", json=embed_request(chunks=[
        {"chunk_kind": "hook", "text": "hook   text"},  # same words, more ws
    ]))
    h1 = brain.store.upserts[0][0]["content_hash"]
    h2 = brain.store.upserts[1][0]["content_hash"]
    assert h1 == h2
    different = brain.client.post("/embed", json=embed_request(chunks=[
        {"chunk_kind": "hook", "text": "different text"},
    ]))
    assert different.status_code == 200
    assert brain.store.upserts[2][0]["content_hash"] != h1


def test_embed_missing_fields_is_400(brain):
    bad = embed_request()
    del bad["job_id"]
    res = brain.client.post("/embed", json=bad)
    assert res.status_code == 400
    assert "error" in res.json()


def test_embed_chunk_without_chunk_kind_is_400(brain):
    res = brain.client.post("/embed", json=embed_request(chunks=[
        {"text": "no kind"}]))
    assert res.status_code == 400
    assert "error" in res.json()


def test_embed_empty_chunks_is_400(brain):
    res = brain.client.post("/embed", json=embed_request(chunks=[]))
    assert res.status_code == 400
    assert "error" in res.json()


def test_embed_store_failure_is_500_with_error_shape(brain):
    brain.store.fail_upsert = True
    res = brain.client.post("/embed", json=embed_request())
    assert res.status_code == 500
    assert "error" in res.json()


# ------------------------------------------------- config (env-driven) ----

def _reload_config(monkeypatch, **env):
    for key, value in {
        "DATABASE_URL": None,
        "BRAIN_MODEL_ID": None,
        "BRAIN_DIMS": None,
        "BRAIN_DEFAULT_THRESHOLD": None,
        "BRAIN_CROSS_CHANNEL_BAND": None,
        "BRAIN_READINESS_BUDGET": None,
    }.items():
        monkeypatch.delenv(key, raising=False)
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    importlib.reload(brain_config)
    return brain_config.BrainConfig.from_env()


def test_config_defaults(monkeypatch):
    cfg = _reload_config(monkeypatch)
    assert cfg.database_url is None
    assert cfg.model_id == "all-MiniLM-L6-v2"
    assert cfg.dims == 384
    assert cfg.default_threshold == 0.85
    assert cfg.cross_channel_band == 0.05
    assert cfg.readiness_budget_seconds == 30.0


def test_config_reads_env(monkeypatch):
    cfg = _reload_config(
        monkeypatch,
        DATABASE_URL="postgres://user:pw@host/db",
        BRAIN_MODEL_ID="other-model",
        BRAIN_DIMS="768",
        BRAIN_DEFAULT_THRESHOLD="0.9",
        BRAIN_CROSS_CHANNEL_BAND="0.08",
        BRAIN_READINESS_BUDGET="15",
    )
    assert cfg.database_url == "postgres://user:pw@host/db"
    assert cfg.model_id == "other-model"
    assert cfg.dims == 768
    assert cfg.default_threshold == 0.9
    assert cfg.cross_channel_band == 0.08
    assert cfg.readiness_budget_seconds == 15.0
