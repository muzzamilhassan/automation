"""Backfill orchestrator tests (Phase 3, issue #105, Task 6).

RED-first suite for services/ai/scripts/backfill.py. No real Neon, no
fastembed: the store and the embedder are injected stubs — the live
workflow_dispatch run is the controller's Task 9 E2E step.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from brain.store import canonical_hash
from scripts import backfill as backfill_mod
from scripts.backfill import (
    build_rows,
    discover_doc_paths,
    discover_research_paths,
    doc_channel,
    doc_narration,
    excluded_reason,
    run_backfill,
)


# --------------------------------------------------------------- fixtures

def make_doc(path: Path, slug: str, beats: list[dict], extra: dict | None = None):
    doc = {
        "title": f"Doc {slug}",
        "brand": "TEST BRAND",
        "beats": beats,
    }
    doc.update(extra or {})
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc), encoding="utf-8")


def narration_beat(text: str) -> dict:
    return {"layout": "split", "text": text, "words": []}


class StubStore:
    """Records upsert_chunks batches; returns all-inserted like a fresh DB."""

    def __init__(self):
        self.ensure_schema_calls = 0
        self.batches: list[list[dict]] = []

    def ensure_schema(self):
        self.ensure_schema_calls += 1

    def upsert_chunks(self, rows):
        self.batches.append(list(rows))
        return {"inserted": len(rows), "updated": 0}


class MixedStore(StubStore):
    """Second+ call sees existing hashes -> counts as updates."""

    def __init__(self):
        super().__init__()
        self._seen: set[tuple[str, str]] = set()

    def upsert_chunks(self, rows):
        inserted = updated = 0
        for r in rows:
            key = (r["content_hash"], r["chunk_kind"])
            if key in self._seen:
                updated += 1
            else:
                self._seen.add(key)
                inserted += 1
        self.batches.append(list(rows))
        return {"inserted": inserted, "updated": updated}


def fake_embed(texts):
    return [[0.1, 0.2, 0.3, 0.4] for _ in texts]


def fake_stamp():
    return {"model_id": "all-MiniLM-L6-v2", "dims": 384}


@pytest.fixture
def corpus(tmp_path: Path) -> Path:
    make_doc(
        tmp_path / "explainer" / "public" / "lf-test-channel.json",
        "test-channel",
        [narration_beat("One two three."), narration_beat("Four five six.")],
    )
    # thumbnail companion files are NOT scripts — must be ignored
    (tmp_path / "explainer" / "public" / "lf-thumb-test-channel.json").write_text(
        json.dumps({"thumb": True}), encoding="utf-8"
    )
    # non-lf json in the same dir is not a doc script either
    (tmp_path / "explainer" / "public" / "qa-themes.json").write_text("{}", encoding="utf-8")
    research_dir = tmp_path / "research"
    research_dir.mkdir(parents=True, exist_ok=True)
    (research_dir / "alpha.md").write_text(
        "# Alpha\n\n" + " ".join(["research"] * 40), encoding="utf-8"
    )
    (research_dir / "beta.md").write_text("Beta body text.", encoding="utf-8")
    return tmp_path


# ------------------------------------------------------------- discovery

def test_discovery_finds_docs_excluding_thumbs_and_research_mds(corpus: Path):
    docs = discover_doc_paths(corpus)
    research = discover_research_paths(corpus)
    assert [p.name for p in docs] == ["lf-test-channel.json"]
    assert [p.name for p in research] == ["alpha.md", "beta.md"]


def test_doc_narration_joins_beat_texts_skipping_empty():
    doc = {
        "beats": [
            {"layout": "hero", "text": "First narration."},
            {"layout": "chapter", "text": None, "words": []},
            {"layout": "split", "text": "Second narration."},
            {"layout": "end", "text": "   "},
        ]
    }
    assert doc_narration(doc) == "First narration.\n\nSecond narration."


def test_doc_channel_slug_from_filename_with_docs_fallback(tmp_path: Path):
    assert doc_channel(tmp_path / "lf-investors-compass.json") == "investors-compass"
    assert doc_channel(tmp_path / "weird-name.json") == "docs"


# ------------------------------------------------------------- exclusions

@pytest.mark.parametrize(
    "extra",
    [
        {"source": "fallback"},
        {"status": "failed"},
        {"gate": "rejected"},
        {"meta": {"source": "fallback"}},
    ],
)
def test_excluded_sources_detected(extra):
    assert excluded_reason({"beats": [], **extra}) is not None


def test_clean_doc_not_excluded():
    assert excluded_reason({"beats": []}) is None


def test_excluded_sources_skipped_and_counted(corpus: Path):
    make_doc(
        corpus / "explainer" / "public" / "lf-fb.json",
        "fb",
        [narration_beat("Fallback text.")],
        extra={"source": "fallback"},
    )
    make_doc(
        corpus / "explainer" / "public" / "lf-rej.json",
        "rej",
        [narration_beat("Rejected text.")],
        extra={"gate": "rejected"},
    )
    store = StubStore()
    summary = run_backfill(corpus, store, embed_fn=fake_embed, stamp_fn=fake_stamp)
    assert summary["skipped_invalid"] == 2
    upserted = [r for batch in store.batches for r in batch]
    assert all(r["channel_id"] not in ("fb", "rej") for r in upserted)


def test_invalid_json_and_empty_narration_counted_skipped(corpus: Path):
    (corpus / "explainer" / "public" / "lf-broken.json").write_text(
        "{not json", encoding="utf-8"
    )
    make_doc(
        corpus / "explainer" / "public" / "lf-silent.json",
        "silent",
        [{"layout": "chapter", "text": None}],
    )
    store = StubStore()
    summary = run_backfill(corpus, store, embed_fn=fake_embed, stamp_fn=fake_stamp)
    assert summary["skipped_invalid"] == 2


# ------------------------------------------------------------- row build

def test_build_rows_shape_and_hash():
    chunks = [
        {"chunk_kind": "scene", "text": "scene one"},
        {"chunk_kind": "pooled", "text": "scene one"},
    ]
    vectors = [[0.0, 1.0], [0.0, 2.0]]
    rows = build_rows(
        channel_id="test-channel",
        script_kind="doc",
        chunks=chunks,
        vectors=vectors,
        job_id="backfill-X",
        source_path="explainer/public/lf-test-channel.json",
        stamp={"model_id": "m", "dims": 384},
    )
    assert len(rows) == 2
    for row, chunk, vec in zip(rows, chunks, vectors):
        assert row["channel_id"] == "test-channel"
        assert row["script_kind"] == "doc"
        assert row["chunk_kind"] == chunk["chunk_kind"]
        assert row["job_id"] == "backfill-X"
        assert row["content_hash"] == canonical_hash(
            chunk["chunk_kind"], chunk["text"])
        assert row["chunk_text"] == chunk["text"]
        assert row["embedding"] == vec
        assert row["model_id"] == "m"
        assert row["model_dim"] == 384
        assert row["meta"]["source_path"] == "explainer/public/lf-test-channel.json"


def test_canonical_hash_deterministic_idempotency_basis():
    """The key backfill rows land on — brain.store.canonical_hash, the
    exact function build_rows calls (and the one /embed uses)."""
    assert canonical_hash("pooled", "same text") == canonical_hash("pooled", "same text")
    assert canonical_hash("pooled", "a") != canonical_hash("pooled", "b")
    assert canonical_hash("hook", "same text") != canonical_hash("pooled", "same text")


def test_no_local_hash_wrapper_refork_surface():
    """Fix round 4 (re-review MINOR-3): the local content_hash wrapper is
    gone — build_rows calls brain.store.canonical_hash directly, so a
    future local fork (the round-3 incident: 14 hashes for 7 identical
    chunks) cannot silently reintroduce itself."""
    assert not hasattr(backfill_mod, "content_hash"), \
        "backfill must not grow its own hash function again"
    rows = build_rows(
        channel_id="c",
        script_kind="doc",
        chunks=[{"chunk_kind": "scene", "text": " some  text "}],
        vectors=[[0.0, 1.0]],
        job_id="j",
        source_path="explainer/public/lf-c.json",
        stamp={"model_id": "m", "dims": 384},
    )
    assert rows[0]["content_hash"] == canonical_hash("scene", "some text")


# --------------------------------------------------------------- run

def test_run_backfill_end_to_end_with_stubs(corpus: Path):
    store = StubStore()
    summary = run_backfill(
        corpus, store, embed_fn=fake_embed, stamp_fn=fake_stamp, progress_every=1
    )
    # schema ensured exactly once
    assert store.ensure_schema_calls == 1
    # 1 doc (scene+pooled chunks from the 6-word narration -> pooled only)
    assert summary["docs"] == 1
    assert summary["research_chunks"] > 0
    assert summary["inserted"] == summary["docs"] + summary["research_chunks"] - (
        summary["docs"] - 1
    ) or summary["inserted"] > 0
    assert summary["skipped_invalid"] == 0

    all_rows = [r for batch in store.batches for r in batch]
    assert all_rows, "expected upserted rows"
    doc_rows = [r for r in all_rows if r["script_kind"] == "doc"]
    research_rows = [r for r in all_rows if r["script_kind"] == "research"]
    assert len(research_rows) == summary["research_chunks"]
    assert all(r["channel_id"] == "research" for r in research_rows)
    assert all(r["chunk_kind"] == "research" for r in research_rows)
    assert doc_rows
    assert all(r["channel_id"] == "test-channel" for r in doc_rows)
    # one run == one shared job_id
    job_ids = {r["job_id"] for r in all_rows}
    assert len(job_ids) == 1
    assert job_ids.pop().startswith("backfill-")
    # embeddings came from the injected stub
    assert all(r["embedding"] == [0.1, 0.2, 0.3, 0.4] for r in all_rows)


def test_run_backfill_long_doc_yields_scene_and_pooled(corpus: Path):
    long_text = " ".join(f"word{i}" for i in range(400))
    make_doc(
        corpus / "explainer" / "public" / "lf-long.json",
        "long",
        [narration_beat(long_text)],
    )
    store = StubStore()
    summary = run_backfill(corpus, store, embed_fn=fake_embed, stamp_fn=fake_stamp)
    doc_rows = [
        r for batch in store.batches for r in batch if r["script_kind"] == "doc"
    ]
    kinds = {r["chunk_kind"] for r in doc_rows if r["channel_id"] == "long"}
    assert kinds == {"scene", "pooled"}
    assert summary["docs"] == 2  # lf-test-channel + lf-long


def test_run_backfill_aggregates_store_result_counts(corpus: Path):
    store = MixedStore()
    first = run_backfill(corpus, store, embed_fn=fake_embed, stamp_fn=fake_stamp)
    assert first["updated"] == 0
    assert first["inserted"] > 0
    second = run_backfill(
        corpus,
        store,
        embed_fn=fake_embed,
        stamp_fn=fake_stamp,
        job_id="backfill-second",
    )
    # same content -> identical hashes -> all updates, zero inserts (idempotent re-run)
    assert second["inserted"] == 0
    assert second["updated"] == first["inserted"]


def test_run_backfill_progress_logs(corpus: Path):
    lines: list[str] = []
    run_backfill(
        corpus,
        StubStore(),
        embed_fn=fake_embed,
        stamp_fn=fake_stamp,
        progress_every=1,
        log=lines.append,
    )
    assert lines
    assert any("summary" in line for line in lines[-1:])
