"""Chunker — transcript text into chunked sub-vectors (Phase 3, issue #105, Task 2).

Word-based approximation of ~200-token windows (spec D1): one word
roughly equals 1.3 tokens, so a 150-word window with a 20-word overlap
lands inside the 200-token budget of all-MiniLM-L6-v2 (512 max seq).

Kinds:
- doc:      scene windows + one pooled chunk (whole text)
- shorts:   hook (first HOOK words) + points (the rest) + pooled
- corpus / research: research windows, no pooled chunk

Empty / whitespace text yields [] — nothing to embed, pooled omitted.
Short texts (under one window) yield a single pooled (or research)
chunk so no empty member chunks are ever emitted.
"""

from __future__ import annotations

DOC_WINDOW_WORDS = 150
OVERLAP_WORDS = 20
SHORTS_HOOK_WORDS = 60

_KNOWN_KINDS = frozenset({"doc", "shorts", "corpus", "research"})


def _windows(words: list[str], size: int, overlap: int) -> list[str]:
    """Sliding windows of `size` words with `overlap`, no empty stubs.

    The loop stops once a window reaches the end of the text, and the
    step guarantees every window carries at least `overlap + 1` fresh
    words, so no tiny or empty member chunks appear.
    """
    step = size - overlap
    out: list[str] = []
    for start in range(0, max(len(words) - overlap, 1), step):
        window = words[start : start + size]
        if window:
            out.append(" ".join(window))
        if start + size >= len(words):
            break
    return out


def chunk_text(kind: str, text: str) -> list[dict[str, str]]:
    """Split `text` into [{chunk_kind, text}] chunks for embedding."""
    if kind not in _KNOWN_KINDS:
        raise ValueError(f"unknown chunk kind: {kind!r}")

    words = text.split()
    if not words:
        return []

    if kind == "doc":
        chunks: list[dict[str, str]] = []
        if len(words) > DOC_WINDOW_WORDS:
            chunks = [
                {"chunk_kind": "scene", "text": window}
                for window in _windows(words, DOC_WINDOW_WORDS, OVERLAP_WORDS)
            ]
        chunks.append({"chunk_kind": "pooled", "text": text})
        return chunks

    if kind == "shorts":
        chunks: list[dict[str, str]] = []
        if len(words) > SHORTS_HOOK_WORDS:
            chunks.append(
                {"chunk_kind": "hook", "text": " ".join(words[:SHORTS_HOOK_WORDS])}
            )
            chunks.append(
                {"chunk_kind": "points", "text": " ".join(words[SHORTS_HOOK_WORDS:])}
            )
        chunks.append({"chunk_kind": "pooled", "text": text})
        return chunks

    # corpus / research
    return [
        {"chunk_kind": "research", "text": window}
        for window in _windows(words, DOC_WINDOW_WORDS, OVERLAP_WORDS)
    ]
