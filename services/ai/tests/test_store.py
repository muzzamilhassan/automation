"""Brain store tests (Phase 3, issue #105, Task 3).

Python mirror of tests/template-registry-db.test.mjs (the JS prior art):
a discriminating in-memory stub client that understands EXACTLY the SQL
shapes brain/store.py emits — nothing more — so a passing test cannot be
trivially green. The client contract is positional
(`client(sql_text, params) -> list[dict]`, $1..$n placeholders, snake_case
rows); embeddings travel as pgvector literal strings via parameters.
No live Neon, no psycopg import at store module level.
"""

import copy
import importlib
import json
import math
import re
import sys

import pytest

from brain.store import get_store, makeStore


# ---------------------------------------------------------------------------
# Stub client contract (fixture seam — no live Neon in tests).
# ---------------------------------------------------------------------------

def _param(params, placeholder):
    return params[int(placeholder[1:]) - 1]


def _as_jsonb(value):
    """pgvector DB returns jsonb as objects; we write via json.dumps string."""
    if value is None:
        return {}
    if isinstance(value, str):
        return json.loads(value)
    return value


def _parse_vector(text):
    return [float(x) for x in str(text).strip("[]").split(",") if x != ""]


def _cosine(a, b):
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    if na == 0 or nb == 0:
        return 0.0
    return sum(x * y for x, y in zip(a, b)) / (na * nb)


class StubClient:
    """Discriminating stub: unknown SQL shapes raise immediately.

    State exposed for assertions: `tables` (name -> dict key -> row) and
    `calls` (every {sql, params} executed, whitespace-normalized).
    `fail_at_call` (1-based call index) injects a failure for the
    all-or-nothing transaction tests.
    """

    def __init__(self):
        self.tables = {}
        self.calls = []
        self.fail_at_call = None
        self._snapshots = []

    def _table(self, name):
        return self.tables.setdefault(name, {})

    def __call__(self, sql, params=()):
        params = list(params)
        norm = re.sub(r"\s+", " ", str(sql)).strip()
        call_index = len(self.calls) + 1
        self.calls.append({"sql": norm, "params": params})
        if self.fail_at_call is not None and call_index == self.fail_at_call:
            raise RuntimeError(f"stub: injected failure at call #{call_index}")

        if norm == "BEGIN":
            self._snapshots.append(copy.deepcopy(self.tables))
            return []
        if norm == "COMMIT":
            if not self._snapshots:
                raise AssertionError("stub: COMMIT without BEGIN")
            self._snapshots.pop()
            return []
        if norm == "ROLLBACK":
            if not self._snapshots:
                raise AssertionError("stub: ROLLBACK without BEGIN")
            self.tables = self._snapshots.pop()
            return []

        if re.match(r"^CREATE EXTENSION IF NOT EXISTS vector$", norm, re.I):
            return []
        m = re.match(r"^CREATE TABLE IF NOT EXISTS (\w+)", norm, re.I)
        if m:
            self._table(m.group(1))
            return []

        # upsert pre-select: existing row lookup by the unique key
        m = re.match(
            r"^SELECT id, performance, meta FROM script_memory "
            r"WHERE content_hash = \$1 AND chunk_kind = \$2$", norm, re.I)
        if m:
            return [dict(r) for r in self._table("script_memory").values()
                    if r["content_hash"] == params[0]
                    and r["chunk_kind"] == params[1]]

        # new-hash insert (UNIQUE (content_hash, chunk_kind) enforced here)
        m = re.match(r"^INSERT INTO script_memory \(([^)]+)\) VALUES \(([^)]+)\)$",
                     norm, re.I)
        if m:
            cols = [c.strip() for c in m.group(1).split(",")]
            placeholders = [p.strip() for p in m.group(2).split(",")]
            row = {}
            for col, ph in zip(cols, placeholders):
                if not re.fullmatch(r"\$\d+", ph):
                    raise AssertionError(f"stub: non-positional value {ph!r}")
                row[col] = _param(params, ph)
            row["performance"] = _as_jsonb(row.get("performance"))
            row["meta"] = _as_jsonb(row.get("meta"))
            key = (row["content_hash"], row["chunk_kind"])
            table = self._table("script_memory")
            if key in table:
                raise AssertionError(
                    f"stub: UNIQUE(content_hash, chunk_kind) violation {key} "
                    "— store must pre-select and UPDATE instead")
            row["id"] = max((r["id"] for r in table.values()), default=0) + 1
            table[key] = row
            return [row]

        # existing-hash update IN PLACE: performance/meta only — if the store
        # ever tried to rewrite the embedding column this shape raises.
        m = re.match(
            r"^UPDATE script_memory SET performance = \$1, meta = \$2 "
            r"WHERE id = \$3$", norm, re.I)
        if m:
            for row in self._table("script_memory").values():
                if row["id"] == params[2]:
                    row["performance"] = _as_jsonb(params[0])
                    row["meta"] = _as_jsonb(params[1])
                    return []
            raise AssertionError(f"stub: UPDATE matched no row id={params[2]!r}")

        m = re.match(r"^INSERT INTO dedupe_verdicts \(([^)]+)\) VALUES \(([^)]+)\)$",
                     norm, re.I)
        if m:
            cols = [c.strip() for c in m.group(1).split(",")]
            placeholders = [p.strip() for p in m.group(2).split(",")]
            row = {c: _param(params, p) for c, p in zip(cols, placeholders)}
            table = self._table("dedupe_verdicts")
            row["id"] = max((r["id"] for r in table.values()), default=0) + 1
            table[row["id"]] = row
            return [row]

        # exact-scan cosine search (score = 1 - <=> distance)
        m = re.match(
            r"^SELECT id, chunk_kind, channel_id, chunk_text, video_id, "
            r"1 - \(embedding <=> \$1::vector\) AS score FROM script_memory"
            r"( WHERE script_kind = \$(\d+))?"
            r" ORDER BY embedding <=> \$1::vector LIMIT \$(\d+)$", norm, re.I)
        if m:
            query = _parse_vector(params[0])
            kind = params[int(m.group(2)) - 1] if m.group(2) else None
            limit = params[int(m.group(3)) - 1]
            rows = list(self._table("script_memory").values())
            if kind is not None:
                rows = [r for r in rows if r["script_kind"] == kind]
            scored = [{
                "id": r["id"],
                "chunk_kind": r["chunk_kind"],
                "channel_id": r["channel_id"],
                "chunk_text": r.get("chunk_text"),
                "video_id": r.get("video_id"),
                "score": _cosine(query, _parse_vector(r["embedding"])),
            } for r in rows]
            scored.sort(key=lambda x: x["score"], reverse=True)
            return scored[:limit]

        m = re.match(r"^SELECT id, performance FROM script_memory "
                     r"WHERE id = ANY\(\$1\)$", norm, re.I)
        if m:
            ids = set(params[0])
            return [{"id": r["id"], "performance": r["performance"]}
                    for r in self._table("script_memory").values()
                    if r["id"] in ids]

        raise AssertionError(f"stub client: unsupported SQL shape: {norm[:160]}")


# ---- fixtures ----

def row(content_hash, embedding, *, channel="chan-a", script_kind="shorts",
        chunk_kind="pooled", job="job-1", text="hook line", performance=None,
        meta=None, video=None, model_id=None, model_dim=None):
    return {
        "channel_id": channel,
        "script_kind": script_kind,
        "chunk_kind": chunk_kind,
        "job_id": job,
        "content_hash": content_hash,
        "chunk_text": text,
        "embedding": embedding,
        "performance": performance,
        "meta": meta,
        "video_id": video,
        "model_id": model_id,
        "model_dim": model_dim,
    }


def upsert_call(stub):
    return next(c for c in stub.calls if c["sql"].startswith("INSERT INTO script_memory"))


# ---------------------------------------------------------------- ensureSchema

def test_ensure_schema_creates_both_tables_with_vector_and_uniqueness():
    stub = StubClient()
    store = makeStore(stub)
    store.ensure_schema()
    creates = [c["sql"] for c in stub.calls if c["sql"].upper().startswith("CREATE TABLE")]
    assert len(creates) == 2, "must emit exactly two CREATE TABLE statements"
    joined = "\n".join(creates)
    for t in ("script_memory", "dedupe_verdicts"):
        assert f"CREATE TABLE IF NOT EXISTS {t}" in joined
    assert "vector(384)" in creates[0], "embedding column must be vector(384)"
    assert "UNIQUE (content_hash, chunk_kind)" in creates[0].replace("UNIQUE  ", "UNIQUE ")
    assert any("CREATE EXTENSION IF NOT EXISTS vector" in c["sql"] for c in stub.calls), \
        "fresh databases need the pgvector extension before vector(384) exists"


# ---------------------------------------------------------------- upsertChunks

def test_upsert_chunks_inserts_new_hashes_and_returns_counts():
    stub = StubClient()
    store = makeStore(stub)
    result = store.upsert_chunks([
        row("hash-1", [1.0, 0.0], video="vid-1"),
        row("hash-2", [0.0, 1.0], chunk_kind="hook", performance={"views": 100}),
    ])
    assert result == {"inserted": 2, "updated": 0}
    table = stub.tables["script_memory"]
    assert len(table) == 2
    r1 = table[("hash-1", "pooled")]
    assert r1["channel_id"] == "chan-a"
    assert r1["video_id"] == "vid-1"
    assert r1["chunk_text"] == "hook line"
    assert table[("hash-2", "hook")]["performance"] == {"views": 100}


def test_upsert_chunks_passes_embedding_as_pgvector_literal_string():
    stub = StubClient()
    makeStore(stub).upsert_chunks([row("hash-1", [0.25, -0.75])])
    params = upsert_call(stub)["params"]
    emb = params[6]  # 7th column: embedding
    assert isinstance(emb, str), "embedding must travel as a pgvector literal string"
    assert emb.startswith("[") and emb.endswith("]")
    assert json.loads(emb) == pytest.approx([0.25, -0.75])
    # jsonb columns likewise travel as JSON strings via parameters
    assert params[7] == "{}" and params[8] == "{}"


def test_upsert_chunks_is_idempotent_and_updates_in_place_without_reembed():
    stub = StubClient()
    store = makeStore(stub)
    store.upsert_chunks([row("hash-1", [1.0, 0.0], performance={"views": 10})])
    before = stub.tables["script_memory"][("hash-1", "pooled")]

    result = store.upsert_chunks([row("hash-1", [1.0, 0.0], performance={"views": 99})])

    assert result == {"inserted": 0, "updated": 1}
    table = stub.tables["script_memory"]
    assert len(table) == 1, "existing hash must never create a duplicate row"
    after = table[("hash-1", "pooled")]
    assert after["performance"] == {"views": 99}, "performance refreshed in place"
    assert after["id"] == before["id"]
    assert after["embedding"] == before["embedding"], "embedding must not be re-embed/rewritten"
    assert after["chunk_text"] == before["chunk_text"]
    updates = [c for c in stub.calls if c["sql"].startswith("UPDATE script_memory")]
    assert len(updates) == 1
    assert "embedding" not in updates[0]["sql"], "UPDATE must touch performance/meta only"


def test_upsert_chunks_mixed_batch_reports_inserts_and_updates():
    stub = StubClient()
    store = makeStore(stub)
    store.upsert_chunks([row("hash-1", [1.0, 0.0])])
    result = store.upsert_chunks([
        row("hash-1", [1.0, 0.0], performance={"views": 5}),   # existing -> update
        row("hash-3", [0.5, 0.5], channel="chan-b"),           # new -> insert
    ])
    assert result == {"inserted": 1, "updated": 1}
    assert len(stub.tables["script_memory"]) == 2


def test_upsert_chunks_requires_hash_and_chunk_kind():
    store = makeStore(StubClient())
    with pytest.raises(TypeError):
        store.upsert_chunks([{"channel_id": "chan-a", "chunk_text": "no hash"}])


def test_upsert_chunks_is_all_or_nothing_by_default():
    stub = StubClient()
    store = makeStore(stub)
    # call plan: BEGIN, SELECT(hash-1), SELECT(hash-2), INSERT(1), INSERT(2)
    stub.fail_at_call = 5
    with pytest.raises(RuntimeError):
        store.upsert_chunks([row("hash-1", [1.0, 0.0]), row("hash-2", [0.0, 1.0])])
    assert len(stub.tables.get("script_memory", {})) == 0, "no partial chunk sets may survive"
    assert any(c["sql"] == "ROLLBACK" for c in stub.calls), "must roll back, not commit"


# ---------------------------------------------------------------- searchSimilar

def test_search_similar_scores_orders_and_labels_same_vs_cross_channel():
    stub = StubClient()
    store = makeStore(stub)
    store.upsert_chunks([
        row("h-own", [1.0, 0.0], video="vid-own", text="own text"),
        row("h-cross", [0.0, 1.0], channel="chan-b", text="cross text"),
        row("h-mid", [0.7071067811865476, 0.7071067811865476], video="vid-mid"),
    ])
    results = store.search_similar([1.0, 0.0], "chan-a", limit=3)

    assert len(results) == 3
    assert results[0]["channel_id"] == "chan-a"
    assert results[0]["same_channel"] is True
    assert results[0]["score"] == pytest.approx(1.0)
    assert results[0]["video_id"] == "vid-own"
    assert results[0]["chunk_text"] == "own text"
    # results span channels (dedupe needs cross-channel matches) — labeled, not filtered
    by_channel = {r["channel_id"]: r for r in results}
    assert by_channel["chan-b"]["same_channel"] is False
    assert by_channel["chan-b"]["score"] == pytest.approx(0.0)
    scores = [r["score"] for r in results]
    assert scores == sorted(scores, reverse=True), "results must be best-first"
    assert all(set(r) >= {"chunk_kind", "channel_id", "score", "same_channel"} for r in results)


def test_search_similar_returns_row_id_for_performance_join():
    """Task 4 carry-forward (fixed in Task 7): search rows carry the STORAGE
    row id so /context's performance join — top_performance matches
    script_memory.id (bigserial) — can key on it instead of the text video_id
    (which raised bigint = text in production and degraded every join to {})."""
    stub = StubClient()
    store = makeStore(stub)
    store.upsert_chunks([
        row("h-1", [1.0, 0.0], video="vid-1", performance={"views": 7}),
        row("h-2", [0.0, 1.0], video="vid-2", performance={"views": 3}),
    ])
    results = store.search_similar([1.0, 0.0], "chan-a", limit=2)

    ids = [r["id"] for r in results]
    assert ids == sorted(r["id"] for r in stub.tables["script_memory"].values()), \
        "rows must carry the storage row id"
    perf = store.top_performance(ids)
    assert perf[ids[0]] == {"views": 7}, "row ids must join into top_performance"


def test_search_similar_kind_filter_and_limit():
    stub = StubClient()
    store = makeStore(stub)
    store.upsert_chunks([
        row("h-s1", [1.0, 0.0], script_kind="shorts"),
        row("h-s2", [0.9, 0.1], script_kind="shorts"),
        row("h-doc", [0.99, 0.01], script_kind="doc"),
    ])
    results = store.search_similar([1.0, 0.0], "chan-a", kind="shorts", limit=1)
    assert len(results) == 1
    assert results[0]["chunk_kind"] == "pooled"
    # the doc row (higher raw score) must be excluded by the kind filter
    stub_call = next(c for c in stub.calls if "ORDER BY embedding" in c["sql"])
    assert "WHERE script_kind" in stub_call["sql"]


# ---------------------------------------------------------------- recordVerdict

def test_record_verdict_writes_full_row():
    stub = StubClient()
    makeStore(stub).record_verdict({
        "channel_id": "chan-a",
        "script_kind": "shorts",
        "job_id": "job-42",
        "verdict": "WARN",
        "top_match_id": "17",
        "score": 0.91,
        "threshold": 0.85,
    })
    verdicts = list(stub.tables["dedupe_verdicts"].values())
    assert len(verdicts) == 1
    assert verdicts[0]["verdict"] == "WARN"
    assert verdicts[0]["top_match_id"] == "17"
    assert verdicts[0]["score"] == 0.91
    assert verdicts[0]["threshold"] == 0.85
    assert verdicts[0]["channel_id"] == "chan-a"
    assert verdicts[0]["job_id"] == "job-42"


# ---------------------------------------------------------------- transaction

def test_transaction_rolls_back_everything_on_failure():
    stub = StubClient()
    store = makeStore(stub)
    store.upsert_chunks([row("keep", [1.0, 0.0])])

    with pytest.raises(RuntimeError):
        with store.transaction():
            store.upsert_chunks([row("doomed", [0.0, 1.0])])
            stub.fail_at_call = len(stub.calls) + 1
            stub("SELECT id, performance, meta FROM script_memory "
                 "WHERE content_hash = $1 AND chunk_kind = $2", ["x", "y"])

    assert sorted(k[0] for k in stub.tables["script_memory"]) == ["keep"], \
        "failed transaction must leave the store exactly as before"
    assert "ROLLBACK" in [c["sql"] for c in stub.calls]


def test_transaction_commits_on_success():
    stub = StubClient()
    store = makeStore(stub)
    with store.transaction():
        store.upsert_chunks([row("committed", [1.0, 0.0])])
    assert "committed" in [k[0] for k in stub.tables["script_memory"]]
    ops = [c["sql"] for c in stub.calls]
    assert ops[-1] == "COMMIT"


# ---------------------------------------------------------------- topPerformance

def test_top_performance_returns_performance_by_id():
    stub = StubClient()
    store = makeStore(stub)
    store.upsert_chunks([
        row("h-1", [1.0, 0.0], performance={"views": 1000}),
        row("h-2", [0.0, 1.0], performance={"views": 5}),
    ])
    ids = sorted(r["id"] for r in stub.tables["script_memory"].values())
    perf = store.top_performance(ids)
    assert perf[ids[0]] == {"views": 1000}
    assert perf[ids[1]] == {"views": 5}


# ---------------------------------------------------------------- get_store

def test_get_store_fails_closed_without_database_url(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    import brain.config as brain_config
    importlib.reload(brain_config)
    try:
        with pytest.raises(RuntimeError):
            get_store()
    finally:
        importlib.reload(brain_config)


def test_store_module_import_never_imports_psycopg():
    import brain.store  # noqa: F401
    assert "psycopg" not in sys.modules, \
        "store must lazy-import psycopg inside get_store, never at module level"
