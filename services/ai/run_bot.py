"""Local launcher for the AI sidecar (the brain, incl. POST /bot/draft).

Loads the repo-root .env INSIDE this process (the Groq key never passes
through a shell or a CLI flag) and serves the FastAPI app. No
python-dotenv dependency — a plain parser is enough for KEY=VALUE lines.

    python services/ai/run_bot.py [--port 8000]

Why not `uvicorn app:app --env-file`? That requires python-dotenv, which
is not installed locally, and env-var prefixes do not survive this
machine's shell harness.
"""
import argparse
import os
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]  # repo root
HERE = pathlib.Path(__file__).resolve().parent      # services/ai

os.chdir(HERE)
sys.path.insert(0, str(HERE))

_env = ROOT / ".env"
if _env.exists():
    for line in _env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    import uvicorn

    uvicorn.run("app:app", host="127.0.0.1", port=args.port, log_level="warning")
