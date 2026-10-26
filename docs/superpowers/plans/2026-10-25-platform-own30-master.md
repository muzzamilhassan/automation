# Platform "Own-30" Master Implementation Plan

> **For agentic workers:** This is the MASTER plan — it fixes architecture, phasing, and the execution workflow. It is NOT a task-level plan. Each phase below must get its own spec (EARS) + task-level plan (bite-sized, per `writing-plans`) + plain-English QA file, **approved by the owner**, before any code is written for that phase.

**Goal:** Turn the existing repo into the internal factory platform for ~30 own channels: everything managed from the Studio admin panel (roles, BYOK, niches, templates, schedules, warnings, costs, analytics), a catalog of 30+ video templates and matching thumbnail templates, and a pgvector RAG brain — with no external tenants.

**Architecture:** Extend, don't rewrite. Studio (Next.js/Vercel, existing admin panel) gains the management surfaces; Neon Postgres gains the registry/ledger tables; a small Python FastAPI sidecar (`services/ai/`) adds RAG + the duplicate/variation gate on Neon pgvector; GitHub Actions stays the render farm (render step migrates to Cloud Run Jobs at ~25–30 channels). All facts sourced from `research/platform-*-2026-10-24.md`, `research/own-portfolio-30-channels-2026-10-25.md`, `research/python-rag-audit-2026-10-17.md`.

**Tech Stack:** Next.js + Vercel (Studio), Neon Postgres (postgres.js; pgvector; Drizzle when schema grows), Node 24 `.mjs` pipelines, GitHub Actions cron (public→private reality handled), Python 3.12 + FastAPI + pgvector for the sidecar, Remotion/HyperFrames/FFmpeg rendering, sharp+SVG thumbnail rendering (Pillow retained where already used), ntfy alerts.

**Spec sources (the research this plan argues from):**
- `research/platform-executive-report-2026-10-24.md` (synthesis + roadmap §9)
- `research/own-portfolio-30-channels-2026-10-25.md` (capacity math; keep/cut table §3; niche allocation §4)
- `research/platform-youtube-api-oauth-2026-10-24.md` (scopes, quotas, upload reliability)
- `research/platform-youtube-policy-compliance-2026-10-24.md` (warning architecture §4)
- `research/platform-byok-providers-2026-10-24.md` (provider matrix, capability routing, security §3, usage ledger §4)
- `research/platform-niche-template-system-2026-10-24.md` (template model §3–5, sub-niches §6, thumbnails §7)
- `research/platform-topic-discovery-script-qa-2026-10-24.md` (script JSON contract §4, safeguards §5)
- `research/platform-architecture-scheduling-2026-10-24.md` (state machine §3, artifacts)
- `research/python-rag-audit-2026-10-17.md` (RAG design §3 — adopted as-is)

## Global Constraints (from AGENTS.md + owner directives — every task inherits these)

1. Planning-first: no code and no issues before the owner approves the phase spec. One feature at a time; small commits referencing the phase/slice ID.
2. Evidence before "done": every slice closes with quoted test/QA output. Plain-English QA files, run row-by-row.
3. Never break the CI production master: channel-*.yml workflows are production. Pipeline changes ship behind flags or in new lanes first.
4. No-static-maps: adding a channel = data rows + template JSON + brand kit + one cron line. Any change that requires editing code to add a channel is a defect.
5. PLAN.md is add-only: only the owner deletes lines. Implementation lines get added there only after phase approval.
6. Git identity: `muzzamilhassan` only, commits end with the Claude co-author line. Deploy Studio after every push: `cd studio && vercel --prod`.
7. EARS specs before code (repo non-negotiable). Specs live beside the plans.
8. Evidence dates: all quota/policy numbers in specs cite the 2026-10-24/25 research; re-verify any that look stale at implementation time.
9. Free/OSS-first: Apache/MIT-licensed weights only where the platform touches them; no paid services unless this plan names them (Cloud Run Jobs ~$0.01/render is the only planned paid item).
10. BYOK stays BYO: provider keys are the owner's; vault stores them encrypted (AES-256-GCM envelope, MASTER_KEY + key_version, AAD-bound), never in logs, never to the browser beyond masked display.

---

## 1. How things will work (runtime flows — the target state)

### 1.1 Content flow (per channel, daily)

```
GHA cron (per channel, staggered, existing)
  → trend research: free pre-screen (Trends RSS / GDELT / GNews / autocomplete)
      then ≤2 search.list calls per channel (search-bucket discipline)
  → topic selection: 10-signal scorecard → provenance-chip record in Neon
  → RAG context: script brain calls sidecar /context
      (past scripts for this channel, past performance, niche corpus excerpts)
  → script generation → structured script JSON (scenes, narration, sources[],
      claims[], disclosure flags) — contract per topic-discovery research §4
  → variation gate: sidecar /dedupe — embedding similarity vs channel's last N
      scripts + cross-channel same-template similarity → PASS / RETRY / BLOCK
  → review gate (configurable): script lands in Studio review queue;
      medical/finance/disclosure content is fail-closed (must be approved)
  → TTS (Kokoro local; edge-tts fallback) → beats JSON (existing contract)
  → render (Remotion/HyperFrames/FFmpeg per template's renderer field)
      [Phase 6+: render step on Cloud Run Jobs]
  → QC checks (duration, loudness, captions present) → artifact stored
  → thumbnails: template × brand kit → N candidates (sharp/SVG; Chromium lane
      only for Urdu/Nastaliq templates) → owner picks in admin panel
  → schedule: private upload + publishAt (privacy re-assert rule respected)
  → upload: intent row → resumable PUT → persist video id on 201 →
      processing poll → publication verify (existing verify-run pattern)
  → analytics collect (nightly): Data API stats + Analytics API into Neon
```

Every step writes a content-addressed artifact (Phase 4). A failed step retries alone; completed steps are never regenerated.

### 1.2 Admin-panel flows (Studio — "handle everything from admin panel")

| Flow | What exists today | What gets built |
|---|---|---|
| Roles | owner/staff/client via Google login + access.json→Neon users, HMAC sessions, proxy matrix + server re-checks | Keep as-is for owner+staff; client role stays dormant (no tenant work). Hardening slice: opaque `sessions` table with instant revocation |
| Connect channel | OAuth wizard exists | Add: `youtube.readonly` scope; post-consent-screen-production re-auth check; warning banners per policy file §4 severities |
| Channel dashboard | Partial (recent uploads, schedule state) | Full field inventory per API research §2 (endpoint, cache TTL, fallback per field); sync status + last-sync badge |
| Niche config | Brand-kit data exists | Niche/sub-niche assignment UI (global taxonomy, primary+secondary per channel); drives template filtering |
| Template management | — | Browse catalog, filter by niche/format, assign per channel (2–5), pin versions, fork-to-customize |
| Thumbnail templates | Thumbnail v2 pattern exists (30 JSON + parametric renderer) | Expose as catalog; N-candidate generation + pick UI |
| BYOK | Vault exists for OpenRouter + ElevenLabs (#28/#29) | Vault v2: all providers from the matrix, per-capability routing (script-gen / tts / image / search / transcription), test-on-save, masked keys, priority + fallback order |
| Schedules | Cadence UI + projection exist (#100) | Extend: per-template schedules, pause/resume, quota-model-aware projection |
| Warnings | ntfy alerts only | Warnings dashboard: 5 severities, official-citation links, last-checked dates, acknowledge action; hard-block list per policy file §4.3 |
| Review queue | Topic Desk partial | Script review (script + sources side-by-side, claim↔source links, flagged-claims panel, disclosure checklist in official wording); thumbnail pick; final-approve gate |
| Usage & cost | quota ledger partial | `usage_events` rollups: per channel / template / provider; BYOK spend vs platform infra separated |
| Analytics | Daily Excel + ntfy exists | Neon analytics snapshots; channel leaderboard; template/topic/thumbnail win rates; "data through <date-2>" stamps (48–72h Analytics lag) |

### 1.3 Adding channel #17…#30 (the no-code path)

1. Create brand-account channel; OAuth connect in admin panel (chooser picks channel, token keyed by channelId).
2. Admin panel: pick niche + sub-niches → compatible templates listed → assign 2–5 video + 2–3 thumbnail templates → set cadence → confirm BYOK capability coverage (validation names anything missing).
3. Data rows: channel registry entry + brand kit + cron matrix entry. **If any step needs a code edit, that's a defect against the no-static-maps directive.**

---

## 2. Data model additions (Neon; exact tables per slice's spec)

- `templates` (registry index: id, semver, niche_ids[], format, renderer, capabilities[], status, source_path) — git JSON stays source of truth
- `channel_templates` (channel_id, template_id, pinned_version, role: primary|secondary)
- `niches` / `channel_niches` (global taxonomy; primary+secondary per channel)
- `thumbnail_templates` + `channel_thumbnail_templates` (same pattern)
- `providers` (static capability matrix data) / `provider_configs` (owner's keys, capability, priority, fallback, encrypted, masked_last4, status, tested_at)
- `usage_events` (job_id, channel_id, provider, model, capability, tokens/audio_s/images/requests, usage_source: measured|estimated, cost_provider_usd, cost_platform_usd, created_at)
- `schedules` (channel_id, kind, cron|rrule|run_at, tz, paused_until, dedupe_key)
- `jobs` / `job_steps` / `job_events` (state machine + per-step artifacts index; artifact keys content-addressed)
- `warnings` (channel_id, severity, classification, code, policy_url, policy_quote, evidence, last_checked_at, acknowledged_at, resolved_at)
- `scripts` / `script_sources` / `script_claims` (script JSON persisted relationally enough for the review UI + RAG)
- `analytics_snapshots` (channel_id, date, views, engaged_views, watch_minutes, subs_delta, impressions?, ctr?, source: data_api|analytics_api, collected_at)
- `asset_registry` (provider, license, license_snapshot_hash, attribution, content_hash, composite_keys[], ttl_refetch_at)
- pgvector tables (sidecar-owned): `script_embeddings`, `corpus_chunks`

## 3. Phases (execution order — each gate = owner approves spec, then plan, then QA results)

### Phase 0 — Stabilize the floor (no platform code; known fixes, one at a time)
Slices (each: tiny diff + evidence):
1. Sweeper F2 one-liner (ENV_PATH dead ref) — unblocks self-healing (production-audit-2026-10-23 F2)
2. Sweeper F5 dead-ref cleanup (`pendingDeleted`)
3. Credential re-auths: the `invalid_grant` channel + FB page token (F3/F4) — owner does the browser re-auths; agent prepares the checklist
4. OAuth consent screen → **In production** (kills the 7-day-token class; zero cost)
5. Verify Studio onboarding scopes include `youtube.readonly` (reports.query requirement)
6. Finish #101 (shorts-lane flip + 7-day proof) — already in flight
7. GHA minutes watch: enable the billing-check habit (owner grants `user` scope to gh OR reads the web UI weekly); decide "render→Cloud Run" date from real numbers
**Exit gate:** two clean cron days post-#101; consent screen live; checklist of Phase-0 hygiene from the 10-24 research (rembg pin if used, quota-model-as-data comes with Phase 2's usage ledger).

### Phase 1 — Template registry MVP (the foundation everything else hangs on)
EARS spec first. Slices:
1. Template JSON schema v1 (`templates/schema/v1.json`): id, name, niches[], formats (short|long), duration target, renderer (remotion|hyperframes|ffmpeg), beats contract ref, capabilities[] (script-gen, tts, captions…), params (voice, tone, duration, scenes, caption style…), variation_rules (min per-video distinct signals), safety (required_sources, disclaimer_beats, review_required), version, compatibility
2. Neon `templates` + `channel_templates` + `niches` tables + git-JSON→DB sync script (GHA, add-only)
3. Compatibility validator: template × format × channel-config checks **before** generation (capability coverage vs BYOK configs; niche mismatch; renderer availability)
4. Studio pages: catalog browse (filter niche/format) → assign to channel (pin version) → list assigned
5. **6 seed video templates** (2 niches × 3 distinct structures, from the niche research §2 lists — e.g. health: evidence-explainer / myth-vs-fact / habit-routine; finance: concept-visual / principle-explainer / mistake-analysis) — as JSON data + renderer mappings reusing existing beat primitives
**Exit gate:** one channel runs end-to-end on an assigned, pinned, registry-loaded template; adding template #7 needs zero code.

### Phase 2 — BYOK vault v2 + usage ledger (admin panel)
Slices:
1. `providers` capability matrix as data (from BYOK research §1: Gemini, OpenAI, Anthropic, Groq, Cerebras, OpenRouter, HF, Ollama/vLLM via OpenAI-compatible URL, ElevenLabs, edge-tts-local, Kokoro-local, Tavily/Serper, Gemini-transcribe, FLUX-schnell endpoint…) with license_class + usage_reporting fields
2. `provider_configs` UI: add key (masked, test-on-save), per-capability assignment, priority + fallback order; encryption per Global Constraint 10; de-couple key derivation from YOUTUBE_CLIENT_SECRET (MASTER_KEY + key_version)
3. Universal adapter: OpenAI-compatible Chat Completions client for script-gen; thin capability adapters for tts/transcription/search; local models first-class
4. `usage_events` recording at every provider call + Studio cost dashboard (per channel/template/provider; measured vs estimated flagged)
5. Quota-model-as-data: replace hardcoded 1,700/upload ledger assumption with per-project quota config rows (10-24 research Phase-0 item)
**Exit gate:** script brain runs a generation using a non-default provider chosen in the UI; usage event visible in dashboard; killing the provider's key triggers fallback per configured order (test with a fake key).

### Phase 3 — RAG sidecar (python-rag-audit §3 phases 0–2, adopted)
Slices:
1. **Phase 0 hygiene (from the RAG audit):** `services/ai/requirements.txt` pinned + `setup-python` replacing the ad-hoc `pip install` blocks (fixes the unpinned-deps failure class repo-wide)
2. FastAPI skeleton (`services/ai/app.py`): `/health`, `/context`, `/dedupe`; Node callers via HTTP (localhost in CI, spawnSync for TTS path per the audit's seam style)
3. `indexer.py`: embed into Neon pgvector — channel script history (yt-mcp/state titleHistory + scripts table once Phase 4 lands), trends files, the research corpus; GHA-cronable; idempotent by content hash
4. `/context` wired into `generateYouTubeScript` (replaces trends-JSON-only input; audit §3.1 verified gap)
5. `/dedupe` = the **variation gate**: within-channel similarity vs last N + cross-channel same-template check; RETRY/BLOCK semantics; wired before review queue; dashboard shows gate verdicts
6. Python-sidecar deploy: runs in the same GHA job (spawn) for now; no new infra
**Exit gate:** a script cites retrieved context (visible in the script record's provenance); a near-duplicate script is BLOCKed by the gate with an evidence row; requirements.txt pinned, zero `pip install || true` in workflows.

### Phase 4 — Pipeline hardening + admin completeness
Slices:
1. State machine + artifact store: `jobs`/`job_steps`/`job_events` tables; content-addressed artifacts per step; retry-resumes-at-failed-step (acceptance test: kill mid-render, restart, re-enter at render)
2. Upload intent row + session-URI persistence + orphan reconciliation via uploads-playlist diff (kills the duplicate-upload class, audit §2.3)
3. `warnings` table + dashboard (5 severities; hard-block = verified technical constraints only; official quotes + dates; acknowledge action)
4. Review queue: script review UI (sources side-by-side, claim↔source links, disclosure checklist in official wording from answer/14328491); fail-closed for medical/finance/disclosure-required; thumbnail N-candidate pick
5. Analytics ingestion: nightly `analytics_snapshots` via Data API (`batchGetStats`) + Analytics API reports (yt-analytics.readonly + youtube.readonly); dashboard: channel leaderboard, template/topic win rates, 48–72h lag stamps
6. Roles hardening: opaque `sessions` table (instant revocation) behind existing owner/staff roles; client role untouched
**Exit gate:** kill-a-worker drill passes; a simulated revoked token shows as Blocking warning and parks the channel; a script with an unverified medical claim cannot reach scheduling without owner approval.

### Phase 5 — Catalog fill-out to 30+ video templates + thumbnail system
Slices (data-heavy, code-light by design):
1. Author remaining video templates to **30+ total catalog** (2–3 per niche × 10 launch niches + longform variants), each with distinct story structure + visual treatment per the niche research §2; every template carries variation_rules + safety blocks; niche map from own-portfolio research §4 (history ×2, travel ×2, tech/AI ×2, science ×2, psychology, productivity, health-fitness, +1 finance/business/motivation)
2. Thumbnail template catalog: expose the existing 30-JSON thumbnail pattern as the `thumbnail_templates` registry; per-niche sets; brand-kit tokens; N-candidate generation + pick wired in Phase 4 slice 4
3. Longform/doc templates for the weekly lane (SRT cadence per #96 pattern)
4. Language-parameterized templates **deferred** until the Urdu TTS decision (Piper ur_PK listening test vs Azure ur-* voices)
**Exit gate:** catalog shows 30+ assignable video templates + ≥15 thumbnail templates; a channel in every launch niche can be fully configured (templates × BYOK × schedule) with zero code.

### Phase 6 — Scale-out to 30 channels + render migration
Slices:
1. Onboarding runbook + checklist automation for channels #17–30 (each: connect → configure → data rows → first produce)
2. Search-bucket discipline live (pre-screen before search; ≤2 searches/channel/day) + monitoring counter
3. **Render lane → Cloud Run Jobs** (trigger: ~25–30 channels or sustained >60 render-min/day — own-portfolio research §2D): render step only; GHA keeps orchestration; est. $9–18/mo
4. R2 composites archive + `asset_registry` (raw stock never re-served)
5. Keep/kill review #1: analytics-driven (usage_events + snapshots) — prune weakest channels before adding past #30
**Exit gate:** 30 channels producing daily with <2% failed-job rate over 14 days; search bucket never exhausted 7 days straight; render minutes on Cloud Run verified against the $0.01–0.02 estimate.

## 4. RAG implementation detail (how, concretely)

Adopted from `python-rag-audit-2026-10-17.md` §2.3/§3 verbatim in shape:

- **No framework.** Plain Python + Neon pgvector (LangChain/LlamaIndex/Haystack all rejected by the audit — framework churn > benefit at this scale). Exact/NN scan in Postgres is plenty for tens of thousands of vectors.
- **Sidecar:** `services/ai/` — FastAPI, pinned requirements.txt, three endpoints: `/health`, `/context` (assembles: brand kit + retrieved exemplar scripts + performance rows + corpus excerpts into the script-brain prompt block), `/dedupe` (embeds candidate script, cosine vs channel history + same-template cross-channel set, returns verdict + nearest neighbors as evidence).
- **What gets embedded (indexer.py, idempotent by content hash):** channel title/script history (`yt-mcp/state/*.json` + `scripts` table), trends JSON, the 68-doc research corpus, approved template beat examples. Chunking: script = one vector per scene + one whole-script vector.
- **Who calls it:** `youtube-engine.mjs` `generateYouTubeScript` (HTTP to `/context` — audit §3.1 documents the current input gap), channel pipeline before review (HTTP to `/dedupe`), Studio review UI (evidence display).
- **Failure policy:** sidecar down → script brain degrades to today's inputs (trends JSON only) and the variation gate fails **closed** for medical/finance channels, **open with warning** elsewhere (never silently).
- **Explicitly deferred (audit Phase 4):** corpus chat endpoint in Studio — not in this plan.

## 5. Explicitly deferred (from the own-30 scope decision — do not build now)

Workspaces/RBAC beyond owner+staff, tenant isolation/RLS, BYOK-for-clients UI, billing/plans, OAuth consent for third parties, YouTube quota-audit application, API/MCP for customers, customer-facing onboarding, public template marketplace, community template review.

## 6. Open questions to settle before Phase 1 spec (answer inline or at review)

1. **"30+ templates for each channel"** — plan assumes you mean a **catalog of 30+** with each channel assigning 2–5. If you literally want ~30 assignable per channel, the registry supports it; confirm which you meant (affects Phase 5 sizing only, not architecture).
2. Staff roles: how many team members get admin-panel access, and which of the four flows (approve scripts / pick thumbnails / edit schedules / manage keys) can staff do vs owner-only?
3. Urdu/Hindi channels in the 30? (Decides the TTS spike and the Chromium thumbnail lane timing.)
4. Phase 0 items 3–4 need owner browser actions (re-auths, consent screen publish) — do them this week so Phase 1 starts clean.
5. Cloud Run approval-in-principle now (budget ~$10–20/mo from ~25 channels) or re-decide at the trigger?

## 7. Per-slice execution workflow (how every slice runs)

1. Owner approves this master plan's phase order.
2. For the phase: agent writes the EARS spec → owner approves.
3. Agent writes the task-level plan (`writing-plans` format: bite-sized steps, exact files, test code, commit points) → owner approves.
4. Implementation via `build-feature`/`subagent-driven-development`; TDD where testable; CI production lanes untouched (flags/new lanes first).
5. QA file (plain English) executed row-by-row with quoted evidence; `verification-before-completion` before any "done".
6. Studio changes deploy: `cd studio && vercel --prod`; pipeline changes land as small commits referencing the slice ID.
7. Phase exit gate checked with evidence; only then does the next phase's spec get written.
