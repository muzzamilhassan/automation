# SETUP — Quarry Content Automation

> Rewritten 2026-10-17 (issue #85). The old n8n → Postiz → YouTube guide is
> gone: that stack was retired on 2026-09-14 and has zero code references.
> Production today runs on GitHub Actions, orchestrated by Quarry Studio.

## What this system is

An autonomous multi-brand YouTube content machine:

- **Quarry Studio** (`studio/` — Next.js on Vercel): the control plane.
  Connect channels (OAuth), pick niches/templates, BYOK keys, team roles.
- **This repo** = the worker + the state store. GitHub Actions workflows are
  the production scheduler; JSON files committed to the repo are the
  contracts and state (per-channel state, outbox queues, registries).
- **Neon Postgres** mirrors the registry/users/sessions (Studio reads DB-first).

## The daily production flow

```
Studio (Vercel)  --GitHub Contents API-->  repo JSON (yt-mcp/studio-channels.json)
GitHub Actions cron (channel-*.yml)  -->  channel-pipeline.mjs <slug>
  ├─ lib/channel-keys.mjs      BYOK decrypt -> env (dead-key -> shared fallback)
  ├─ yt-daily.mjs              script brain -> TTS -> ffmpeg render -> upload
  ├─ yt-archive.mjs            renders stored as GitHub Release assets
  ├─ fb-crosspost / ig-crosspost / zernio-tiktok   outbox drains
  └─ verify-run.mjs            proof-of-publication (API check per upload)
daily-sweeper.yml  -->  heals missing slots (yt-daily --topup=N)
ci-doctor.yml      -->  channel + workflow health, ntfy alerts
```

## Setup (fresh machine)

1. **Node 24** (LTS), Python 3.11+ for TTS, ffmpeg bundled in `ffmpeg-bin/`
   (Windows) or on PATH (CI/Linux).
2. `npm install` at the repo root. `cd studio && npm install`.
3. Copy `.env.example` to `.env` and fill it in — every key in the example is
   read by real code. Key groups: YouTube OAuth, script-brain LLM keys
   (Gemini/Groq/Cerebras/Mistral/HF), media (Pixabay/Pexels/Agnes),
   social publishers (FB/Threads/Pinterest/Zernio-TikTok), Studio
   (DATABASE_URL + STUDIO_PASSWORD + GITHUB_TOKEN), ops (GITHUB_PAT/NTFY).
4. Studio: `cd studio && node db-setup.mjs` (idempotent — creates/updates the
   Neon tables and seeds them from the JSON sources).
5. Local run: `node channel-pipeline.mjs <slug>` — one command per channel.
   CI (`.github/workflows/`) is the production master; run it by hand only
   via workflow_dispatch.
6. Tests: `npm test` (runs in CI on every push to main via tests.yml).

## Retired stacks (do not resurrect)

- **n8n + Postiz + Temporal + Ollama** (docker-compose era, deleted 09-14 /
  removed 10-17): scheduling and uploads now live in GitHub Actions.
- `ccm-*.js` were n8n Code-node bodies for that flow (removed with it).

## Where things live

- State: `yt-mcp/state/<slug>.json` (source of truth; `schedule-state.json`
  is a legacy mirror) · render archive: GitHub Releases (`archive-YYYY-MM`)
- Crosspost queues: `fb-outbox/<slug>/` (+ `longvideo/lf-inbox`, `tt-lf`,
  `hf-out` for the other lanes)
- Reports: `daily-excel-report.mjs` -> `reports/` + ntfy
- Docs for agents: `AGENTS.md`, `docs/agents/` · research notes: `research/`
