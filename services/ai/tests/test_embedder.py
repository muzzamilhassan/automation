"""Embedder tests (Phase 3, issue #105, Task 2).

Pins the model_stamp shape, the empty-input passthrough and the
BrainUnavailableError path. Live-model tests (real fastembed load +
determinism) are gated behind BRAIN_EMBEDDER_LIVE so local runs with
no model download skip honestly; CI sets the flag.
"""

import importlib
import os
import sys

import pytest

from brain import config as brain_config
from brain.embedder import BrainUnavailableError, embed_texts, model_stamp

_BRAIN_ENV_KEYS = (
    "DATABASE_URL",
    "BRAIN_MODEL_ID",
    "BRAIN_DIMS",
    "BRAIN_DEFAULT_THRESHOLD",
    "BRAIN_CROSS_CHANNEL_BAND",
    "BRAIN_READINESS_BUDGET",
    "BRAIN_MODEL_DIR",
)


@pytest.fixture(autouse=True)
def _fresh_model_and_config(monkeypatch):
    """Hermetic baseline: no cached model, default config.

    test_api's _reload_config helper reloads brain.config with test env
    and never reloads it back after monkeypatch restores os.environ, so
    without this reset brain_config.config would leak `other-model`/768
    into these tests depending on run order.
    """
    import brain.embedder as embedder

    embedder._model = None
    for key in _BRAIN_ENV_KEYS:
        monkeypatch.delenv(key, raising=False)
    importlib.reload(brain_config)
    yield
    embedder._model = None


# ------------------------------------------------------- no model needed

def test_model_stamp_shape():
    stamp = model_stamp()
    assert stamp == {
        "model_id": brain_config.config.model_id,
        "dims": brain_config.config.dims,
    }
    assert stamp["dims"] == 384


def test_embed_texts_empty_list_returns_empty_without_loading_model():
    assert embed_texts([]) == []


def test_embed_texts_raises_brain_unavailable_without_fastembed(monkeypatch):
    monkeypatch.setitem(sys.modules, "fastembed", None)  # import -> ImportError
    with pytest.raises(BrainUnavailableError):
        embed_texts(["hello world"])


# --------------------------------------------------- live model (gated)

requires_live_model = pytest.mark.skipif(
    not os.environ.get("BRAIN_EMBEDDER_LIVE"),
    reason="BRAIN_EMBEDDER_LIVE not set; live-model tests skip locally",
)


@requires_live_model
def test_embed_texts_returns_configured_dims():
    vectors = embed_texts(["hello world"])
    assert len(vectors) == 1
    assert len(vectors[0]) == brain_config.config.dims == 384


@requires_live_model
def test_embed_texts_is_deterministic_for_same_text():
    first = embed_texts(["the quick brown fox jumps over the lazy dog"])
    second = embed_texts(["the quick brown fox jumps over the lazy dog"])
    assert first == second


@requires_live_model
def test_embed_texts_different_texts_give_different_vectors():
    a, b = embed_texts(["debt snowball method explained", "latest rocket launch news"])
    assert a != b
