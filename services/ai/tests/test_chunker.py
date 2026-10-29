"""Chunker tests (Phase 3, issue #105, Task 2).

Pins the chunk_text contract: doc -> scene windows + pooled, shorts ->
hook/points + pooled, corpus/research -> research windows, and the
edge rules (empty text -> [], short text -> no empty members).
"""

import pytest

from brain.chunker import (
    DOC_WINDOW_WORDS,
    OVERLAP_WORDS,
    SHORTS_HOOK_WORDS,
    chunk_text,
)


def _words(n: int, seed: str = "w") -> str:
    return " ".join(f"{seed}{i}" for i in range(n))


# ------------------------------------------------------------------ doc

def test_doc_long_text_splits_into_overlapping_scenes_plus_pooled():
    text = _words(400)
    chunks = chunk_text("doc", text)

    kinds = [c["chunk_kind"] for c in chunks]
    assert kinds == ["scene", "scene", "scene", "pooled"]

    scenes = chunks[:-1]
    for scene in scenes:
        assert len(scene["text"].split()) <= DOC_WINDOW_WORDS

    # Adjacent scenes share the overlap window.
    first_tail = scenes[0]["text"].split()[DOC_WINDOW_WORDS - OVERLAP_WORDS:]
    second_head = scenes[1]["text"].split()[:OVERLAP_WORDS]
    assert first_tail == second_head

    # Pooled carries the whole text, last.
    assert chunks[-1]["text"] == text


def test_doc_short_text_is_pooled_only():
    text = _words(100)
    chunks = chunk_text("doc", text)
    assert [c["chunk_kind"] for c in chunks] == ["pooled"]
    assert chunks[0]["text"] == text


# --------------------------------------------------------------- shorts

def test_shorts_split_into_hook_points_and_pooled():
    text = _words(200)
    chunks = chunk_text("shorts", text)

    kinds = [c["chunk_kind"] for c in chunks]
    assert kinds == ["hook", "points", "pooled"]

    assert len(chunks[0]["text"].split()) == SHORTS_HOOK_WORDS
    assert len(chunks[1]["text"].split()) == 200 - SHORTS_HOOK_WORDS
    assert chunks[2]["text"] == text


def test_shorts_short_text_is_pooled_only():
    text = _words(50)
    chunks = chunk_text("shorts", text)
    assert [c["chunk_kind"] for c in chunks] == ["pooled"]
    assert chunks[0]["text"] == text


# ------------------------------------------------------ corpus/research

def test_corpus_long_text_yields_overlapping_research_chunks_no_pooled():
    text = _words(400)
    chunks = chunk_text("corpus", text)

    assert all(c["chunk_kind"] == "research" for c in chunks)
    assert len(chunks) >= 2
    for chunk in chunks:
        assert len(chunk["text"].split()) <= DOC_WINDOW_WORDS

    tails = [c["text"].split()[DOC_WINDOW_WORDS - OVERLAP_WORDS:] for c in chunks[:-1]]
    heads = [c["text"].split()[:OVERLAP_WORDS] for c in chunks[1:]]
    assert tails == heads


def test_research_short_text_is_single_research_chunk():
    text = _words(80)
    chunks = chunk_text("research", text)
    assert [c["chunk_kind"] for c in chunks] == ["research"]
    assert chunks[0]["text"] == text


# ----------------------------------------------------------- edge cases

@pytest.mark.parametrize("kind", ["doc", "shorts", "corpus", "research"])
@pytest.mark.parametrize("text", ["", "   ", "\n\t  \n"])
def test_empty_or_whitespace_text_returns_empty_list(kind, text):
    assert chunk_text(kind, text) == []


def test_unknown_kind_raises_value_error():
    with pytest.raises(ValueError):
        chunk_text("haiku", _words(10))
