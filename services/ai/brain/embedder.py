"""Embedder — fastembed wrapper for all-MiniLM-L6-v2 (Phase 3, issue #105, Task 2).

Lazy single-instance model load: the first embed_texts() call loads the
model (downloaded once into BRAIN_MODEL_DIR, or fastembed's default
cache — GitHub Actions cache friendly), later calls reuse it. Vectors
are deterministic for the same text under the same model version.

ImportError of fastembed surfaces as BrainUnavailableError; the
fail-open path (skip embedding, keep the pipeline alive) lives in the
endpoint callers (Tasks 4+), not here.
"""

from __future__ import annotations

import os

from brain import config as brain_config


class BrainUnavailableError(RuntimeError):
    """Raised when the embedding model cannot be loaded (e.g. fastembed missing)."""


_model = None  # cached TextEmbedding instance (lazy)


def _fastembed_model_id(model_id: str) -> str:
    """Map config's model id to fastembed's HF-qualified name.

    fastembed 0.9.1 only accepts fully-qualified ids
    ('sentence-transformers/all-MiniLM-L6-v2'), while the config default
    (and spec D2) names the bare 'all-MiniLM-L6-v2'. Bare ids are
    assumed to live in the sentence-transformers org; qualified ids pass
    through untouched.
    """
    if "/" in model_id:
        return model_id
    return f"sentence-transformers/{model_id}"


def _load_model():
    global _model
    if _model is None:
        try:
            from fastembed import TextEmbedding
        except ImportError as exc:
            raise BrainUnavailableError(
                "fastembed is not installed — brain embeddings unavailable "
                "(pip install fastembed==0.9.1); callers should fail open"
            ) from exc
        kwargs = {
            "model_name": _fastembed_model_id(brain_config.config.model_id)
        }
        model_dir = os.environ.get("BRAIN_MODEL_DIR")
        if model_dir:
            kwargs["cache_dir"] = model_dir
        _model = TextEmbedding(**kwargs)
    return _model


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed texts into dims-dim float vectors (config.dims, default 384)."""
    if not texts:
        return []
    vectors = [_normalize(vec) for vec in _load_model().embed(list(texts))]
    return vectors


def _normalize(vec) -> list[float]:
    return [float(x) for x in vec]


def model_stamp() -> dict[str, object]:
    """Identify the embedding model — stored alongside vectors in pgvector.

    Reads config through the module attribute so env changes followed by
    a config reload (see test_api's _reload_config pattern) are picked up.
    """
    cfg = brain_config.config
    return {"model_id": cfg.model_id, "dims": cfg.dims}
