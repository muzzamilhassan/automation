"""Backfill orchestrator — seed the brain's corpus of record (Phase 3, #105, Task 6).

Corpus selection per spec D4 / AC-P3-15 — published AI-generated material only:

- `explainer/public/lf-*.json` documentary scripts (narration = the beats'
  ``text`` fields joined). ``lf-thumb-*.json`` thumbnail companions and any
  non-``lf-`` json are NOT scripts and never discovered. The channel id is
  the filename slug (``lf-investors-compass.json`` -> ``investors-compass``),
  falling back to the shared ``docs`` channel when the name carries no slug.
- `research/*.md` — the research corpus (globbed, never a hardcoded count;
  the corpus grows without code changes). channel ``research``.
- Shorts scripts join later via the publish-time /embed path (Task 5) — the
  backfill intentionally does not fabricate them.

EXCLUSIONS (AC-P3-15), enforced defensively even though the current sources
should not contain them: any doc carrying ``source: 'fallback'`` (template
script), ``status: 'failed'`` (failed-run output) or ``gate: 'rejected'``
(gate-rejected) is counted into ``skipped_invalid`` and never embedded.
Malformed JSON and narration-less docs land in the same bucket.

Idempotency: rows are keyed by the D12 canonical fingerprint
(``content_hash`` -> ``brain.store.canonical_hash``: chunk_kind +
whitespace-normalized text, sha256 of canonical JSON) — the SAME hash the
write-time /embed path computes, so a backfill re-run (or a re-embed of
already-backfilled text) UPDATEs in place and never duplicates vectors.
(Fix round 3: this used to be a raw sha256(text), which forked from
/embed's scheme and produced duplicate rows for byte-identical chunks.)

Run (documented invocation — direct script from the repo root):

    python services/ai/scripts/backfill.py

``python -m`` is NOT supported: the sidecar's package layout (services/ai on
sys.path via conftest, no services/__init__.py) makes the direct path the
single canonical entry point, which is what brain-backfill.yml calls.

The production path (main()) wires the real store (get_store — fails closed
without DATABASE_URL) and the real fastembed embedder; tests inject stubs for
both, so no test ever touches Neon or the model (live dispatch = Task 9 E2E).
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

# Direct-script bootstrap: make `brain.*` importable regardless of cwd,
# mirroring what tests/conftest.py does for the pytest suite.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from brain.chunker import chunk_text  # noqa: E402
from brain.store import canonical_hash  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[3]

DOC_GLOB = "explainer/public/lf-*.json"
THUMB_PREFIX = "lf-thumb-"
RESEARCH_GLOB = "research/*.md"
DOCS_FALLBACK_CHANNEL = "docs"
RESEARCH_CHANNEL = "research"

# AC-P3-15 exclusion markers (defensive — asserted in code, tested in CI).
_EXCLUDED_KEYS = ("source", "status", "gate")
_EXCLUDED_VALUES = {"source": {"fallback"}, "status": {"failed"}, "gate": {"rejected"}}


def content_hash(chunk_kind: str, text: str) -> str:
    """D12 canonical content fingerprint — the idempotency key for
    upsert_chunks. Delegates to brain.store.canonical_hash: ONE shared
    definition with the write-time /embed path (fix round 3 — a local
    raw sha256(text) fork duplicated byte-identical chunks)."""
    return canonical_hash(chunk_kind, text)


def excluded_reason(doc: dict) -> str | None:
    """Return the AC-P3-15 exclusion marker hit, or None for a clean doc."""
    for key in _EXCLUDED_KEYS:
        value = doc.get(key)
        if isinstance(value, str) and value.strip().lower() in _EXCLUDED_VALUES[key]:
            return f"{key}={value}"
        nested = doc.get("meta")
        if isinstance(nested, dict):
            value = nested.get(key)
            if isinstance(value, str) and value.strip().lower() in _EXCLUDED_VALUES[key]:
                return f"meta.{key}={value}"
    return None


def discover_doc_paths(root: Path) -> list[Path]:
    """Documentary scripts: lf-*.json, thumbnail companions excluded."""
    return sorted(
        p
        for p in root.glob(DOC_GLOB)
        if p.name.startswith("lf-") and not p.name.startswith(THUMB_PREFIX)
    )


def discover_research_paths(root: Path) -> list[Path]:
    """Research corpus: every research/*.md today, globbed fresh each run."""
    return sorted(root.glob(RESEARCH_GLOB))


def doc_narration(doc: dict) -> str:
    """The narration text: beats' `text` fields, blanks dropped, \\n\\n-joined."""
    beats = doc.get("beats") or []
    texts = [
        str(beat.get("text")).strip()
        for beat in beats
        if isinstance(beat, dict)
        and isinstance(beat.get("text"), str)
        and beat.get("text").strip()
    ]
    return "\n\n".join(texts)


def doc_channel(path: Path) -> str:
    """lf-<slug>.json -> <slug>; unslugged names share the `docs` channel."""
    name = path.stem
    if name.startswith("lf-") and len(name) > len("lf-"):
        return name[len("lf-"):]
    return DOCS_FALLBACK_CHANNEL


def build_rows(
    channel_id: str,
    script_kind: str,
    chunks: list[dict],
    vectors: list[list[float]],
    job_id: str,
    source_path: str,
    stamp: dict,
) -> list[dict]:
    """Chunk + vector pairs into upsert_chunks-shaped rows."""
    if len(chunks) != len(vectors):
        raise ValueError(
            f"backfill: {len(chunks)} chunks but {len(vectors)} vectors "
            f"for {source_path} — refusing to write misaligned rows"
        )
    return [
        {
            "channel_id": channel_id,
            "script_kind": script_kind,
            "chunk_kind": chunk["chunk_kind"],
            "job_id": job_id,
            "content_hash": content_hash(chunk["chunk_kind"], chunk["text"]),
            "chunk_text": chunk["text"],
            "embedding": vector,
            "performance": {},
            "meta": {"source_path": source_path},
            "model_id": stamp.get("model_id"),
            "model_dim": stamp.get("dims"),
        }
        for chunk, vector in zip(chunks, vectors)
    ]


def _index_source(
    *,
    root: Path,
    path: Path,
    kind: str,
    job_id: str,
    embed_fn,
    stamp: dict,
    store,
    counter_key: str,
    summary: dict,
    log,
) -> None:
    """One source file -> narration -> chunks -> embed -> upsert (its own
    transaction; upsert_chunks is deliberately NOT nestable, so never wrap
    this in an outer transaction)."""
    if kind == "doc":
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            summary["skipped_invalid"] += 1
            log(f"skip (malformed json: {exc}): {path.name}")
            return
        if not isinstance(doc, dict):
            summary["skipped_invalid"] += 1
            log(f"skip (not a script object): {path.name}")
            return
        reason = excluded_reason(doc)
        if reason:
            summary["skipped_invalid"] += 1
            log(f"skip (excluded: {reason}): {path.name}")
            return
        text = doc_narration(doc)
        channel_id = doc_channel(path)
    else:
        text = path.read_text(encoding="utf-8")
        channel_id = RESEARCH_CHANNEL

    chunks = chunk_text(kind, text)
    if not chunks:
        summary["skipped_invalid"] += 1
        log(f"skip (empty narration): {path.name}")
        return

    vectors = embed_fn([chunk["text"] for chunk in chunks])
    rows = build_rows(
        channel_id=channel_id,
        script_kind=kind,
        chunks=chunks,
        vectors=vectors,
        job_id=job_id,
        source_path=str(path.relative_to(root)).replace("\\", "/"),
        stamp=stamp,
    )
    result = store.upsert_chunks(rows)
    summary[counter_key] += 1
    summary["inserted"] += result["inserted"]
    summary["updated"] += result["updated"]
    log(
        f"indexed {path.name}: {len(rows)} chunks "
        f"(+{result['inserted']} new, ={result['updated']} updated)"
    )


def run_backfill(
    root: Path,
    store,
    embed_fn=None,
    stamp_fn=None,
    log=None,
    progress_every: int = 10,
    job_id: str | None = None,
) -> dict:
    """Discover the corpus, embed, upsert. Returns the final summary.

    store: BrainStore-compatible (ensure_schema + upsert_chunks). embed_fn /
    stamp_fn default to the real fastembed embedder + model stamp; tests
    inject fakes. log defaults to print; progress logs every `progress_every`
    indexed sources.
    """
    if embed_fn is None:
        from brain.embedder import embed_texts as embed_fn  # noqa: PLC0415
    if stamp_fn is None:
        from brain.embedder import model_stamp as stamp_fn  # noqa: PLC0415
    if log is None:
        log = print
    job_id = job_id or f"backfill-{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}"
    stamp = stamp_fn()

    summary = {
        "docs": 0,
        "research_chunks": 0,
        "inserted": 0,
        "updated": 0,
        "skipped_invalid": 0,
    }
    store.ensure_schema()

    indexed = 0
    sources: list[tuple[Path, str, str]] = [
        (path, "doc", "docs") for path in discover_doc_paths(root)
    ] + [
        (path, "research", "research_chunks")
        for path in discover_research_paths(root)
    ]
    for path, kind, counter_key in sources:
        _index_source(
            root=root,
            path=path,
            kind=kind,
            job_id=job_id,
            embed_fn=embed_fn,
            stamp=stamp,
            store=store,
            counter_key=counter_key,
            summary=summary,
            log=log,
        )
        if kind == "doc" or counter_key == "research_chunks":
            indexed += 1
        if indexed % progress_every == 0:
            log(f"progress: {indexed} sources seen, summary so far {summary}")

    log(f"backfill summary {summary} (job {job_id})")
    return summary


def main() -> int:
    """Production wiring: real store (fail-closed on DATABASE_URL), real
    fastembed embedder. The live dispatch against Neon is Task 9's E2E step."""
    from brain.store import get_store  # noqa: PLC0415 — lazy, fail-closed

    root = REPO_ROOT
    store = get_store()
    summary = run_backfill(root, store)
    if summary["skipped_invalid"]:
        print(f"warning: {summary['skipped_invalid']} source(s) skipped as invalid/excluded")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
