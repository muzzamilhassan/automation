"""Brain skeleton API tests (Phase 3, issue #105, Task 1).

Pins the /health contract and the 501 Not Implemented stubs for
/context, /dedupe and /embed. Real model/DB behavior lands in Tasks 2-6;
these tests pin the shape later tasks must keep.
"""

import importlib

import pytest
from fastapi.testclient import TestClient

from app import create_app
from brain import config as brain_config


@pytest.fixture()
def client():
    return TestClient(create_app())


# ---------------------------------------------------------------- /health

def test_health_returns_ok_with_honest_state(client):
    """AC-P3-10 shape: status + model_loaded + pgvector_reachable.

    Skeleton honesty: no model is loaded yet (Task 2) and no DB pool
    exists yet (Task 3), so both flags must be False, not faked True.
    """
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["model_loaded"] is False
    assert body["pgvector_reachable"] is False


# ------------------------------------------------- 501 stubs (Tasks 4-6)

@pytest.mark.parametrize("method,path", [
    ("post", "/context"),
    ("post", "/dedupe"),
    ("post", "/embed"),
])
def test_unimplemented_endpoints_are_501(client, method, path):
    res = getattr(client, method)(path, json={})
    assert res.status_code == 501
    assert "not implemented" in res.json()["detail"].lower()


# ------------------------------------------------- config (env-driven)

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
