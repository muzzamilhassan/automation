"""Brain sidecar app skeleton (Phase 3, issue #105, Task 1).

FastAPI app factory with an honest /health and 501 stubs for the three
memory operations. Later tasks extend this skeleton in place:

- Task 2: fastembed model load -> /health model_loaded becomes a real check
- Task 3: Neon pgvector pool -> /health pgvector_reachable becomes a real check
- Task 4: /context implementation
- Task 5: /dedupe implementation (similarity >= threshold blocks)
- Task 6: /embed implementation
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from brain import config as brain_config

_NOT_IMPLEMENTED = {
    "context": "TODO(Task 4): retrieve top-k memory rows from pgvector",
    "dedupe": "TODO(Task 5): semantic variation gate — similarity >= threshold blocks",
    "embed": "TODO(Task 6): embed text chunks via fastembed model",
}


def create_app() -> FastAPI:
    app = FastAPI(title="brain", version="0.1.0")

    @app.get("/health")
    def health() -> dict:
        # Skeleton honesty: no model has been loaded and no DB pool exists
        # yet, so both flags report False until Tasks 2-3 wire real checks
        # (AC-P3-10). Never fake True — CI preflight depends on this.
        return {
            "status": "ok",
            "model_loaded": False,
            "pgvector_reachable": False,
        }

    for name, todo in _NOT_IMPLEMENTED.items():

        def _stub(todo: str = todo) -> JSONResponse:
            return JSONResponse(
                status_code=501,
                content={"detail": f"Not implemented: {todo}"},
            )

        app.add_api_route(f"/{name}", _stub, methods=["POST"], name=name)

    return app


app = create_app()
