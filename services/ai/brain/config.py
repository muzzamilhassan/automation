"""Env-driven brain configuration (Phase 3, issue #105, Task 1).

Env comes from the process environment at runtime — the Node side owns
`.env` via lib/env.mjs (loadEnv()); this sidecar never parses dotfiles.
Every value the later brain tasks need is declared here so there is one
place to look for the knobs.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

DEFAULT_MODEL_ID = "all-MiniLM-L6-v2"  # served via fastembed (spec D1)
DEFAULT_DIMS = 384
DEFAULT_THRESHOLD = 0.85
DEFAULT_CROSS_CHANNEL_BAND = 0.05
DEFAULT_READINESS_BUDGET_SECONDS = 30.0


@dataclass(frozen=True)
class BrainConfig:
    database_url: str | None
    model_id: str
    dims: int
    default_threshold: float
    cross_channel_band: float
    readiness_budget_seconds: float

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> "BrainConfig":
        env = os.environ if env is None else env
        return cls(
            database_url=env.get("DATABASE_URL") or None,
            model_id=env.get("BRAIN_MODEL_ID") or DEFAULT_MODEL_ID,
            dims=int(env.get("BRAIN_DIMS") or DEFAULT_DIMS),
            default_threshold=float(
                env.get("BRAIN_DEFAULT_THRESHOLD") or DEFAULT_THRESHOLD
            ),
            cross_channel_band=float(
                env.get("BRAIN_CROSS_CHANNEL_BAND") or DEFAULT_CROSS_CHANNEL_BAND
            ),
            readiness_budget_seconds=float(
                env.get("BRAIN_READINESS_BUDGET")
                or DEFAULT_READINESS_BUDGET_SECONDS
            ),
        )


config = BrainConfig.from_env()
