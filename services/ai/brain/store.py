"""Brain vector store (Phase 3, issue #105, Task 3).

pgvector persistence for `script_memory` (the durable corpus of record for
script TEXT, spec D3/AC-P3-17) and `dedupe_verdicts` (the variation-evidence
ledger, AC-P3-12).

The DB client is INJECTED via makeStore(dbClient) so unit tests run against
an in-memory stub — the Python mirror of studio/lib/template-registry-db.js
(the JS prior art). Client contract (MIXED placeholder style):

    client(sql_text, params) -> list[dict rows]   # snake_case columns

Values travel in `params` — never string-interpolated (SQL-injection safe by
construction). Placeholders are psycopg3 pyformat (the JS `$n` style is NOT
valid psycopg — found by the live backfill run against real Neon):
- scalar/write paths use positional `%s` with a list of params;
- search_similar repeats the embedding placeholder twice, and pyformat does
  not support positional reuse — it uses NAMED `%(vec)s`-style placeholders
  with params as a DICT.
Embeddings are passed as pgvector literal strings '[0.1,0.2,...]' via
parameters and cast with `%s::vector` / `%(vec)s::vector`.

Production wiring is lazy: get_store() builds a psycopg adapter from
DATABASE_URL — importing THIS module never imports psycopg nor touches the
network (non-Neon machines and unit tests stay safe until it is called).
"""

from __future__ import annotations

import contextlib
import hashlib
import json

__all__ = [
    "makeStore",
    "make_store",
    "get_store",
    "adapt_postgres",
    "BrainStore",
    "canonical_hash",
]


def _vector_literal(embedding) -> str:
    """Serialize a vector to the pgvector text literal '[0.1,0.2,...]'."""
    if isinstance(embedding, str):
        return embedding
    return "[" + ",".join(str(float(x)) for x in embedding) + "]"


def _jsonb(value) -> str:
    """Canonical JSON for jsonb columns (sorted keys -> stable writes)."""
    return json.dumps(value or {}, sort_keys=True)


def canonical_hash(chunk_kind: str, text: str) -> str:
    """THE D12 canonical content fingerprint — one shared hash for BOTH
    write paths (backfill and /embed), so byte-identical chunk text
    always lands on the same (content_hash, chunk_kind) key: re-runs
    UPDATE in place, never duplicate vectors.

    Scheme: sha256 hex over canonical JSON {"chunk_kind", "text":
    whitespace-normalized}. Pinned by a known-vector test in
    test_store.py. Fix round 3: the backfill forked this with raw
    sha256(text) and produced 14 distinct hashes for 7 byte-identical
    chunks in production Neon — this module-level definition is now the
    single source both callers import."""
    normalized = " ".join(text.split())
    canonical = json.dumps(
        {"chunk_kind": chunk_kind, "text": normalized},
        sort_keys=True, ensure_ascii=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class BrainStore:
    """Store operations over an injected DB client.

    Client contract is MIXED: list params with positional `%s` placeholders
    on scalar/write paths; dict params with repeatable named `%(name)s`
    placeholders on search_similar (its embedding placeholder appears twice,
    which pyformat cannot express positionally)."""

    def __init__(self, db_client):
        if not callable(db_client):
            raise TypeError(
                "makeStore: db_client must be a callable "
                "(sql_text, params) -> list[dict rows]")
        self._client = db_client

    # ------------------------------------------------------------- schema

    def ensure_schema(self):
        """CREATE TABLE IF NOT EXISTS for both tables (spec D3). Idempotent.

        Runs in ONE transaction: psycopg3 transactions are implicit, and
        bare DDL would ride the open transaction and roll back when the
        sidecar process exits (fix round 2 — same root cause as the lost
        dedupe verdicts; schema previously only persisted because a later
        transaction() flushed it)."""
        with self.transaction():
            self._client("CREATE EXTENSION IF NOT EXISTS vector", [])
            self._client(
                """CREATE TABLE IF NOT EXISTS script_memory (
                  id bigserial PRIMARY KEY,
                  channel_id text,
                  script_kind text,
                  chunk_kind text,
                  job_id text,
                  content_hash text,
                  chunk_text text,
                  embedding vector(384),
                  performance jsonb DEFAULT '{}',
                  meta jsonb DEFAULT '{}',
                  model_id text,
                  model_dim int,
                  video_id text,
                  created_at timestamptz DEFAULT now(),
                  UNIQUE (content_hash, chunk_kind)
                )""",
                [],
            )
            self._client(
                """CREATE TABLE IF NOT EXISTS dedupe_verdicts (
                  id bigserial PRIMARY KEY,
                  channel_id text,
                  script_kind text,
                  job_id text,
                  verdict text,
                  top_match_id text,
                  score real,
                  threshold real,
                  created_at timestamptz DEFAULT now()
                )""",
                [],
            )

    # ---------------------------------------------------------- write path

    @contextlib.contextmanager
    def transaction(self):
        """All-or-nothing scope for multi-chunk writes (AC-P3-2).

        Emitting BEGIN/COMMIT/ROLLBACK through the injected client keeps the
        store transport-agnostic; the production adapter maps them onto the
        psycopg connection's commit()/rollback().
        """
        self._client("BEGIN", [])
        try:
            yield self
        except BaseException:
            self._client("ROLLBACK", [])
            raise
        self._client("COMMIT", [])

    def upsert_chunks(self, rows):
        """Hash-keyed upsert of chunk rows (AC-P3-1/13).

        rows: [{channel_id, script_kind, chunk_kind, job_id, content_hash,
        chunk_text, embedding, performance?, meta?, video_id?,
        model_id?, model_dim?}].

        Existing (content_hash, chunk_kind) -> UPDATE performance/meta IN
        PLACE only — never a duplicate row, never a rewritten embedding (no
        re-embed of unchanged content). New hash -> INSERT. The whole batch
        runs in ONE transaction: a failure mid-batch leaves nothing behind
        (no partial chunk sets, AC-P3-2). Returns {inserted, updated}.
        """
        if not isinstance(rows, list):
            raise TypeError("upsert_chunks: rows must be a list of dicts")
        inserted = updated = 0
        with self.transaction():
            for r in rows:
                if not r.get("content_hash") or not r.get("chunk_kind"):
                    raise TypeError(
                        "upsert_chunks: every row requires content_hash and chunk_kind")
                existing = self._client(
                    "SELECT id, performance, meta FROM script_memory "
                    "WHERE content_hash = %s AND chunk_kind = %s",
                    [r["content_hash"], r["chunk_kind"]],
                )
                if existing:
                    self._client(
                        "UPDATE script_memory SET performance = %s, meta = %s "
                        "WHERE id = %s",
                        [_jsonb(r.get("performance")), _jsonb(r.get("meta")),
                         existing[0]["id"]],
                    )
                    updated += 1
                else:
                    self._client(
                        """INSERT INTO script_memory
                          (channel_id, script_kind, chunk_kind, job_id,
                           content_hash, chunk_text, embedding, performance,
                           meta, model_id, model_dim, video_id)
                        VALUES (%s, %s, %s, %s, %s, %s, %s::vector, %s, %s, %s, %s, %s)""",
                        [
                            r.get("channel_id"),
                            r.get("script_kind"),
                            r["chunk_kind"],
                            r.get("job_id"),
                            r["content_hash"],
                            r.get("chunk_text"),
                            _vector_literal(r["embedding"]),
                            _jsonb(r.get("performance")),
                            _jsonb(r.get("meta")),
                            r.get("model_id"),
                            r.get("model_dim"),
                            r.get("video_id"),
                        ],
                    )
                    inserted += 1
        return {"inserted": inserted, "updated": updated}

    # ---------------------------------------------------------- read path

    def search_similar(self, embedding, channel_id, kind=None, limit=5):
        """Exact-scan cosine nearest neighbors (spec D3 — no ANN at this scale).

        Vectors are stored normalized; `1 - (embedding <=> %s::vector)` is
        cosine similarity (the pinned D9 convention: the /dedupe gate is
        `score >= threshold` blocks). Results span ALL channels — dedupe
        needs cross-channel matches — each row labeled `same_channel` by
        channel equality. `kind` optionally narrows to one script_kind.
        Rows carry the storage `id` so /context's performance join
        (top_performance matches script_memory.id) can key on it.
        """
        literal = _vector_literal(embedding)
        # Named placeholders (%(vec)s), NOT %s: the embedding literal appears
        # TWICE per query (score expression + ORDER BY), and psycopg3 pyformat
        # does not support positional %s reuse — named placeholders are
        # repeatable (round-2 fix; re-review finding).
        if kind is None:
            rows = self._client(
                """SELECT id, chunk_kind, channel_id, chunk_text, video_id,
                          1 - (embedding <=> %(vec)s::vector) AS score
                   FROM script_memory
                   ORDER BY embedding <=> %(vec)s::vector
                   LIMIT %(lim)s""",
                {"vec": literal, "lim": limit},
            )
        else:
            rows = self._client(
                """SELECT id, chunk_kind, channel_id, chunk_text, video_id,
                          1 - (embedding <=> %(vec)s::vector) AS score
                   FROM script_memory
                   WHERE script_kind = %(kind)s
                   ORDER BY embedding <=> %(vec)s::vector
                   LIMIT %(lim)s""",
                {"vec": literal, "kind": kind, "lim": limit},
            )
        return [
            {
                "id": r.get("id"),
                "chunk_kind": r["chunk_kind"],
                "channel_id": r["channel_id"],
                "score": float(r["score"]),
                "same_channel": r["channel_id"] == channel_id,
                "chunk_text": r.get("chunk_text"),
                "video_id": r.get("video_id"),
            }
            for r in rows
        ]

    def top_performance(self, ids):
        """Performance map for exemplar ids (AC-P3-8: retrieval attaches
        views/retention so the writer can weight what worked)."""
        ids = list(ids)
        if not ids:
            return {}
        rows = self._client(
            "SELECT id, performance FROM script_memory WHERE id = ANY(%s)",
            [ids],
        )
        return {r["id"]: r["performance"] for r in rows}

    # --------------------------------------------------------- verdict log

    def record_verdict(self, verdict):
        """One row per /dedupe verdict (PASS/WARN/BLOCK) — AC-P3-12's
        variation-evidence ledger. Callers own the fail-open policy: a failed
        write here raises, and the endpoint layer degrades to one warning.

        The INSERT runs inside transaction(): psycopg3 transactions are
        implicit, so a bare INSERT rides the open transaction and ROLLS
        BACK when the sidecar process dies (CI always) — the live proof
        found verdicts silently lost (fix round 2). COMMIT here makes the
        verdict durable before the HTTP response returns."""
        with self.transaction():
            self._client(
                """INSERT INTO dedupe_verdicts
                  (channel_id, script_kind, job_id, verdict, top_match_id,
                   score, threshold)
                VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                [
                    verdict.get("channel_id"),
                    verdict.get("script_kind"),
                    verdict.get("job_id"),
                    verdict.get("verdict"),
                    verdict.get("top_match_id"),
                    verdict.get("score"),
                    verdict.get("threshold"),
                ],
            )


def makeStore(db_client) -> BrainStore:
    """Factory: build a BrainStore over an injected client (mixed contract —
    see the module docstring: %s lists on scalar paths, %(name)s dicts on
    search)."""
    return BrainStore(db_client)


# camelCase spelling used by the task brief / JS prior art; snake_case alias.
make_store = makeStore


def adapt_postgres(conn):
    """Bridge a psycopg3 connection to the store's mixed client contract.

    BEGIN/COMMIT/ROLLBACK are transaction(), not SQL: psycopg3 manages its
    transaction implicitly, so they map to connection methods. Everything
    else executes and returns dict rows. Params pass through by shape:
    DICT params go to execute UNCHANGED (psycopg3 binds %(name)s queries
    natively; tuple(dict) would collapse the dict to its KEYS and fail);
    list/tuple params are tupled for the %s positional paths.
    """
    def client(sql_text, params=()):
        cmd = str(sql_text).strip().upper()
        if cmd == "BEGIN":
            return []  # psycopg3 opens its transaction implicitly
        if cmd == "COMMIT":
            conn.commit()
            return []
        if cmd == "ROLLBACK":
            conn.rollback()
            return []
        with conn.cursor() as cur:
            cur.execute(
                sql_text,
                params if isinstance(params, dict) else tuple(params),
            )
            if cur.description is None:
                return []
            cols = [d.name for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]

    return client


def get_store() -> BrainStore:
    """Production entry point. Fail-closed on missing DATABASE_URL; psycopg
    is imported only here, never at module level (unit tests / non-Neon
    machines stay safe until this is actually called)."""
    from brain.config import config

    if not config.database_url:
        raise RuntimeError(
            "brain store: DATABASE_URL missing — cannot construct store (fail-closed)")
    import psycopg  # noqa: PLC0415 — deliberate lazy import

    return makeStore(adapt_postgres(psycopg.connect(config.database_url)))
