# Architecture + tech-stack audit — 2026-10-17 (round 2)

Round 2 of the audit series (round 1 = `bug-audit-2026-10-17.md`, issues #33–#74). Focus: architecture, folder structure, languages/tech, scaling, cleanup. Method: 3 parallel agents (architecture map, tech-stack research against primary sources, dead-file cleanup) + orchestrator verification. Companion docs: `tech-stack-research-2026-10-17.md` (per-question verdicts with citations, same folder).

---

## 1. What the system actually is

**The repo itself is the database and the message queue.** Studio (Next.js on Vercel) is the control plane committing state via the GitHub Contents API (`studio/lib/channels-registry.js:89-117`, `studio/lib/hf-jobs.mjs:1-4`); GitHub Actions is both scheduler and compute (20 workflows, ~1,756 lines); JSON files in the repo are both the contracts and the persistent state. Neon Postgres is being layered on but every DB table mirrors a JSON file (`lib/db.mjs` header) and the JSON remains the fallback truth.

Production Shorts path: Studio → registry JSON → channel-*.yml cron → `channel-pipeline.mjs` → keys injection → `yt-daily.mjs` (script brain → narrate.py TTS → ffmpeg render → upload → Release archive → outbox) → `fb-crosspost`/`ig-crosspost`/TikTok lanes → `verify-run.mjs` proof-of-publication → `sweeper.mjs` self-heal → `ci-doctor.mjs` watchdog → Excel/ntfy reporting.

**This design is sound for the current scale ($0/month, one operator) and battle-tested against real incidents.** The debt is not the design — it is identity duplication, workflow copy-paste, generation archaeology, and unguarded seams.

## 2. What is GOOD (explicitly keep)

1. `channel-pipeline.mjs` as single per-channel orchestrator — exactly the right seam for CI.
2. `channel-autopilot.yml` registry-driven matrix (dynamic discovery + dynamic secret names) — the model the legacy workflows should converge into.
3. Per-channel state files (`lib/state.mjs`) — documented fix for the 09-19 write race.
4. BYOK with dead-key fallback + ntfy — production-grade resilience thinking.
5. Proof-of-publication (`verify-run.mjs`) and CI Doctor YAML validation — reliability lessons encoded in code.
6. Outbox pattern (`fb-outbox/<slug>/` mp4+json contracts) — decouples production from crossposting.
7. Release-asset archive for renders — clever zero-cost storage.
8. Repo-as-database — commits are a robust audit log; control plane and worker share storage with zero infra. Formalize, don't rip out (ADR-A).
9. `lib/` shared-module habit + 6 test files — the seed of the packages layout.

## 3. Structural problems (ranked, evidence-backed)

### P0 — The channel/brand concept is defined in 5+ places with proven drift (highest debt)
`lib/brands.json` (16 brands) vs `yt-brands/brands.mjs` (15; `old-money-code` missing) vs `studio/lib/brands.json` (16) vs `yt-mcp/studio-channels.json` (registry) vs Neon `channels` table. Consequences already live:
- FB page maps duplicated 3× and diverged: `yt-daily.mjs:277` says quotequarry→`108044922375174`; `fb-crosspost.mjs` + `daily-excel-report.mjs` say `114550268199751` (= filed bug #38).
- The 4-legacy-slug list is hardcoded in ≥8 code locations + workflow matrices (`ci-doctor.mjs:10`, `sweeper.mjs:19`, `longvideo/longform-upload.mjs:26-27,90`, `longvideo/make-longform.mjs:55`, `studio/lib/data.mjs:76,154`, longform-daily.yml matrix).

### P1 — Root script sprawl + generation archaeology
51 root JS files (~7,343 LOC) mix five generations: 16 CI entry points, 4 spawned children, 9 shared libs, 13 local operator tools, and a **dead generation-1 stack** (12 `ccm-*.js` n8n node bodies, `docker-compose.yml` Postiz/n8n stack, `n8n.Dockerfile`). The repo's front-door docs describe the dead stack: `SETUP.md` ("Google Sheet → n8n → Postiz") and `.env.example` (first ~20 keys are Postiz/n8n).

### P2 — Copy-paste workflow fleet with real divergence
Five near-clone `channel-*.yml` (591 lines total). Only `channel-quotequarry.yml` carries the "Stage doc render for TikTok clips" block (verified: zero `tt-lf`/`lf-meta` matches in the other three) — and `tiktok-clips.mjs:98` consumes `lf-meta-<slug>` artifacts, with the whole TikTok lane named "TikTok Post (QuoteQuarry)". Net: MR/IC/DFD docs never reach TikTok, and the capability lives in YAML instead of the orchestrator. Same steps repeated verbatim across workflows: image-tools daemon start (×4-5), font installs, edge-tts/kokoro installs (×6), ffmpeg/Remotion system libs (×4).

### P3 — Tests exist; CI never runs them (already filed as #70)
6 test files + fixtures; zero `npm test` in any of 20 workflows.

### P4 — Monorepo tooling absence
No `workspaces` in root package.json; studio/explainer/image-tools each carry own package.json + node_modules + lockfile; `sharp` triplicated (root 0.33.5, studio 0.33.5, thumbnails); no root lint/tsconfig; Python has no venv/requirements (ambient pip installs duplicated across 6 workflows).

### P5 — Windows-local assumptions baked into pipelines
`ffmpeg-bin/ffmpeg-master-latest-win64-gpl/bin/…` hardcoded in 12+ files (cinematic-engine.mjs:14-15, explainer/build.mjs:8-9, build-reel.mjs:10, tts.mjs:36, make-vox-demo.mjs:17-18, make-psych-demo.mjs:50, broll-fetch.mjs:88, longvideo/make3v2.mjs:13, longvideo/stage-docv2.mjs:11…). Some have `'ffmpeg'` fallback; `make3v2.mjs:13` and `stage-docv2.mjs:11` have **none** — Linux-unrunnable by accident.

### P6 — Crypto seam kept in sync by comment
`lib/channel-keys.mjs:2-4` and `studio/lib/keys-vault.js:1-3` both say "keep the crypto in sync" (identical derivation); no test imports both sides; `PROVIDER_ENV`/`PROVIDERS` duplicate the provider list.

### P7 — Two staging generations for the same longform product
`stage-docv2.mjs` (97 LOC) vs `make3v2.mjs` (176 LOC) duplicate beats-building + text helpers + ffprobe path; `storyboard.mjs`/`make-longform.mjs` are a third generation; 15+ committed `.log` files remain in `longvideo/`.

### P8 — Language/seam inventory (unmanaged)
ESM .mjs pipelines + dead CJS n8n nodes + TS/TSX studio (+ `studio/lib/*.mjs` ESM mixed into the Next app) + Python TTS/Colab + bash. The real seams are process boundaries and they are ad hoc: `spawnSync('node', [script])` strings, `execFileSync('python', ['youtube-flow/narrate.py'])` ×3, localhost HTTP (image-tools, quarry-studio-server), Contents API. **TTS exists in 4+ implementations** (narrate.py, tts.mjs/edge_batch.py, hyperframes inline, kokoro per-workflow installs).

### P9 — Config truth scattered
Truth lives in `.env` (real), `.env.example` (gen-1 fiction), per-workflow `env:` blocks (~10 secrets ×5 workflows), 3 brand files + registry + DB, `yt-mcp/*.json` caches, root `z*.json` tmp dumps, legacy root token files. `.mcp.json` registers 16 `yt-*` MCP servers — a fifth copy of the fleet definition.

## 4. Runtime/ops facts (verified this audit)

- **Repo is PUBLIC** (`isPrivate: false`): Actions minutes currently free (public-repo billing), but round-1 secrets findings (#57) are world-readable **right now**.
- **Scheduler load**: 165 runs in 7 days (~23.5/day); channel pipelines 3–4 min, sweeper 10 min → ~1,800–2,100 min/month if the repo ever goes private (Sept-20 audit predicted exhaustion ~Oct 18-20 on private). The "public-as-backup vs private + trim" decision is still pending.
- **Node 20 pins**: 17 of 20 workflows pin `node-version: 20`; Node 20 EOL'd 2026-04-30 and GitHub removed Node 20 from Actions runners 2026-09-23 (changelog) — the "forced to Node 24" deprecation warning is already visible in this repo's CI logs (CI Doctor run 39014442329). 3 workflows pin 22 (Maintenance LTS).
- **`.git` is 2.2 GB**; tracked media includes 42.6MB + 26.1MB demo MP4s (`demos/hf-demos/`), 18.1MB `hf-out/tech/.../video.mp4`, ~10MB × 8 music MP3s in `image-tools/audio/`, plus history-buried binaries. `ci-doctor-report.json` (regenerated artifact) and `old-style-sw-*.mp4` are tracked.
- **js-yaml v5.0.0 (2026-06-20) "reorganized the public API around flat named exports"** — confirmed root cause of the round-1 all-workflows-BROKEN_WORKFLOW false-alarm incident (fix already local; see #33).
- **Remotion licensing**: free for individuals and ≤3-employee orgs; beyond that Automators plan ($0.01/render, $100/mo min per LICENSE.md/FAQ). Keep Remotion confined to `explainer/` until a license decision is needed. Remotion Lambda is the scaling path (Cloud Run support is alpha).
- **Scheduled workflows in public repos auto-disable after 60 days without repo activity** — this repo commits daily (ci-doctor reports) so it is currently safe, but a keepalive or awareness note is cheap insurance.
- **edge-tts** is an unofficial GPL-3.0 client of Microsoft's Edge service with no legality grant — fine as free fallback, never client-facing in a SaaS. Kokoro-82M is Apache-2.0 (commercial-safe). Voice chain (gpt-4o-mini-tts + whisper alignment → Kokoro → edge) is correct as-is; faster-whisper already in compose.

## 5. Target architecture

### 5.1 Proposed layout (staged, CI-safe — full plan in migration section)
```
apps/studio/            # moved verbatim (Vercel root-dir update)
services/image-tools/
packages/               # registry, keys-vault, state-store, narration, render, publish
pipelines/              # shorts/, longform/, crosspost/, reporting/, hyperframes/, thumbnails/, explainer/, render-engines/
tools/                  # local operator CLIs
integrations/n8n-ccm/   # gen-1 reference material
ops/                    # docker-compose (gen-1) — or delete
lib/                    # stays at root during migration (CI touches it)
```

### 5.2 The five seams worth building (deep-module framing)
1. **Channel Registry** — `getChannel(slug) → {identity, cadence, destinations:{fbPageId,…}, ytAuth}` merging `lib/brands.json` + `yt-mcp/studio-channels.json`. Kills the 8+ hardcoded slug lists, 3 FB page maps, 5 brand copies. Pure data access, JSON fallback — no CI contract change.
2. **Render engine interface** — `render({engine, composition, brand, voice, music, outDir})`; near-term deliverable is the small part: one `resolveFfmpeg()` + one env-load helper replacing 12 hardcoded paths and the copy-pasted `.env` loader in nearly every script.
3. **State & job store** — `schedule` (exists as lib/state.mjs), `outbox` (fb-outbox contract formalized), `jobs` (hf-out status.json contract). Storage stays JSON-in-git (ADR-A).
4. **Narration adapter** — `synthesize({text, voice, outBase}) → {audioPath, words[]}`; converges the 4 TTS implementations; edge-tts stays fallback-only.
5. **Publishing adapters** — `publish({platform, channel, asset})`; lower urgency (per-platform scripts already importable; page-id problem is SEAM 1's).

### 5.3 ADRs
- **ADR-A — keep GitHub Actions as scheduler, with an explicit exit ramp.** Free at current scale; precondition to extract = SEAM 1 + SEAM 3 (token resolution + explicit job claiming). Trigger to revisit: minutes burn on going private, >~20 active channels, or first paying tenant (client channels cannot run in your public repo — boundary violation). Render scaling path at that point: Cloud Run Jobs (or Remotion Lambda for explainer). Compose-stack Temporal belongs to the dead Postiz/n8n gen — do not build on it.
- **ADR-B — staged monorepo restructure, not big-bang.** Workspaces first → move dead/local code → consolidate workflows → move CI-referenced paths with the workflow edit in the same commit. Keeps CI green at every commit.
- **ADR-C — render engines: interface + adapters, not one engine.** Four engines each have a reason (browser-capture shorts hardened, Remotion deterministic React, HyperFrames LLM-authored HTML with check-gate, sharp posters). Real deliverable: SEAM 2 small parts + retiring one longvideo staging generation + standardizing NEW templates on one browser engine. Studio's create-video route is becoming the first runtime engine-chooser (currently hardwired to HyperFrames via hf-jobs.mjs).

### 5.4 Migration plan (stages)
- **Stage 0 (zero-risk):** add `workspaces: ["explainer","studio","image-tools"]`; add a `tests.yml` CI lane; retire gen-1 (ccm-* → `integrations/n8n-ccm/`, compose → `ops/` or delete, rewrite SETUP.md + .env.example for the current system); untrack media/artifacts (see cleanup issue); move 13 local-only tools → `tools/`.
- **Stage 1 (kill duplication):** consolidate 4 legacy `channel-{slug}.yml` into `channel-autopilot.yml` (registry entries preserve cron windows; port the TikTok staging block into `channel-pipeline.mjs` — fixes the 3-channel divergence); extract composite actions (fonts+TTS+kokoro install, image-tools daemon, ffmpeg libs) shared by ~8 workflows.
- **Stage 2 (move CI code, one workflow-PR at a time):** crosspost → `pipelines/crosspost/` (update fb-now/reporting/ig-slot/tiktok-post + spawnSync names); yt-daily/yt-deepdive → `pipelines/shorts/`; reporting scripts → `pipelines/reporting/`; image-tools → `services/`; longvideo → `pipelines/longform/` (keep the buildPoster grep marker stable); hyperframes/thumbnails → `pipelines/`.
- **Stage 3 (seams):** SEAM 1 registry (consumers switch file-by-file) → keys-vault single module + round-trip test → state-store → ffmpeg/env/narration helpers.

**Explicitly NOT proposed:** moving state off git, merging render engines, rewriting Studio (it is the most modern part), touching the working shorts sequencing.

## 6. Tech-stack verdicts (full citations in tech-stack-research-2026-10-17.md)

| Area | Verdict | Key fact |
|---|---|---|
| Node runtime | **MIGRATE 20→24 now** | Node 20 EOL 2026-04-30; removed from Actions runners 2026-09-23; 17/20 workflows still pin 20 |
| Bun | WATCH | sharp supports it; googleapis compat unverified; batch cron gains nothing |
| TypeScript | **ADOPT incrementally** | JSDoc+checkJs on `lib/` now; `strict` in studio + convert db.mjs first; Node 24 runs .ts natively; stay on TS 6 (TS 7 has no JS API yet) |
| Monorepo | **ADOPT npm workspaces**; WATCH Turborepo | one-line change; Turborepo only when build times hurt |
| Rendering | KEEP 4 engines; WATCH Remotion license | free ≤3 employees; Automators $0.01/render + $100/mo after; Lambda = scaling path; keep Remotion in explainer/ |
| Scheduling | KEEP GHA (public = free); ADOPT Cloud Run Jobs at SaaS inflection | public repos: 60-day inactivity auto-disable (keepalive); client channels can't run in your repo |
| DB/ORM | KEEP postgres.js; ADOPT Drizzle when schema grows | Neon supports both; drizzle-kit needs direct URL |
| Voice | KEEP chain; edge-tts fallback-only | edge-tts = unofficial GPL client, no legality grant; Kokoro Apache-2.0 |
| Deps | WATCH | js-yaml v5 flat-exports breakage (bit us); googleapis near-daily majors — smoke-test uploads after umbrella bumps |

## 7. Issue mapping (filed 2026-10-17)

Umbrella index: **#88**. Round-2 issues:

| Finding (this doc) | Issue |
|---|---|
| §4 Node 20 pins (17 workflows) | #75 |
| §5.2 SEAM 1 channel registry (P0) | #76 |
| §3 P2 workflow consolidation + TikTok staging gap | #77 |
| ADR-B staged monorepo restructure (P1/P4) | #78 |
| §3 P5 ffmpeg/env helpers | #79 |
| §3 P6 keys-vault single module | #80 |
| §4 + ADR-A visibility/scheduler decision | #81 |
| §6 TS + dependency hygiene | #82 |
| §3 P7/P8 SEAM 3/4 + staging retirement | #83 |
| Cleanup inverse finding: poster-factory untracked | #84 |
| Cleanup Table B: tracked orphans + docs rewrite | #85 |
| Cleanup Tables A/C/D: local junk, gitignore, relocations | #86 |
| Cleanup Task 6: compose decommission decision | #87 |

Cleanup appendix (from the third agent, integrated):

### Inverse findings — untracked files tracked CI needs (commit, don't delete)
1. `lib/workflow-validator.mjs` — untracked; `ci-doctor.mjs:13` imports it; CI Doctor crashes on fresh checkouts (= #33).
2. `thumbnails/poster-factory.mjs` + `thumbnails/fonts/hdw/` + `thumbnails/photos/` — untracked; tracked `longvideo/longform-upload.mjs:94` spawns poster-factory and throws on failure; `longform-upload.yml:38,54` runs it in CI (= #84). poster-factory exits 1 ("FAIL: no photos") without the photos dir.

### Local-delete table (≈1.7 GB unconditional; ≈9 GB with caches)
cloud-demos 745MB · explainer/out 733MB (gitignored) · hf-proof remainder ~20MB · frames-demo 18MB · demos/agnes-thumbs ~70MB · audit/ 20MB (copyrighted refs, conclusions captured) · thumbnails/demos 9.8MB · shots-dreams 1.9MB · root *.log set (keep colab-run.log until #50 closes) · __pycache__ ×2 · .playwright-mcp · or-models.json 752KB (zero refs) · sn-models.json · shot-analytics.mjs (one-off, hardcoded personal cookie path) · download-review-audio.mjs (purpose served) · demos/fb-img-money-rulebook.jpg · state/dup-cleanup-log*.json + dup-plan.json · empty tt-tmp/ · state/avatar-*.jpg (VERIFY vs yt-brands/avatars). Caches (re-download cost): pixabay-pool 6.2GB · explainer/public lf-*/audio pools ~52MB (active WIP — VERIFY). Owner-gated: music-review 3.8GB (PLAN T12 still open). DO NOT delete: hf-out/ (workflow-managed), hyperframes/longvideo/explainer WIP files (commit-or-ignore is an owner call).

### Git-tracked orphans (git rm; ≈230 MB)
10 × ccm-*.js (53KB, gen-1 n8n nodes, stack deleted 09-14) · old-style-sw-*.mp4 12.5MB · demos/hf-demos demo1-5.mp4 83.8MB (Release first if portfolio) · hf-out/{IronDaily-mv6zat2w,studio-test-3} 6.8MB · studio/render-test 28 jpgs + 2 render jpgs 4.3MB · studio/tmp-*.cjs|mjs · preview-posters.html · own-music/tracks/*.mp3 38.2MB (byte-duplicates of own-music-v1 Release assets — music-engine.mjs:98 downloads from the release) · hf-proof/assets/luxury-pad-01.mp3 2.9MB (byte-identical duplicate) · thumbnails/tests jpgs. Tracked media verified IN USE (keep): image-tools/audio 144MB (fallback pool), image-tools/fonts (copied by autopilot yml:99), yt-brands assets, explainer fonts+music, studio style previews.

### Gitignore gaps
Add: `__pycache__/ *.pyc .playwright-mcp/ longvideo/lf-inbox/ longvideo/out/ fb-outbox/ proofs/ shots-dreams/ demos/agnes-thumbs/ thumbnails/demos/ tt-tmp/ state/dup-cleanup-log*.json state/dup-plan.json or-models.json sn-models.json *.tsbuildinfo` (+ explainer/.gitignore: public/lf-*, teacher-audio, tech-audio, vox-collage, tl). **`proofs/` contains live session cookies (qs-cookies.txt, cookie-flat.txt) — urgent.** Do NOT ignore hf-out/, thumbnails/{fonts,photos,assets}, colab/.

### Relocations (media → Release assets, 09-14 archive pattern)
image-tools/audio/*.mp3 144MB → `macleod-pool-v1` release + manifest (cinematic-engine already has the own-music download-cache flow to reuse) · hf-out/tech/cb-… 19MB → change codeberry-video.yml to Release-upload (workflow-design change, not plain rm) · music-review 3.8GB → zip to release if preserving T12 material.

### docker-compose verdicts
spotlight: dead weight, delete · n8n+faster-whisper: VERIFY (no current code path; SETUP.md-era) · postiz/temporal groups: VERIFY-NOT-DELETE as a group (Postiz only consumer; CI owns scheduling) · image-tools+tunnel compose services: gen-1 (CI runs the server directly). Repo directory image-tools/ is essential. → #87.

### research/ trim candidates (conservative — keep by default)
3 overlapping VOX docs · automation-structure-audit-2026-09-20 / channel-growth-audit-2026-09-19 / roadmap-2026-09-14 (superseded by project-full-audit-2026-10-09 + PLAN) · recycler + keyword-ranking point-in-time audits · 3 landscape scans.
