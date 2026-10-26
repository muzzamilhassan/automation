# Scheduling & multi-tenant architecture — platform research 2026-10-24

Read-only research round for the v2 multi-tenant SaaS design. Builds on `tech-stack-research-2026-10-17.md` (§5 scheduling verdicts), `architecture-audit-2026-10-17.md` (ADR-A/SEAMs), `flow-control-research-2026-10-08.md` (outbox/per-channel concurrency), `youtube-upload-quota-research-2026-09.md` (quota buckets), `role-based-access-research-2026-10-08.md` + `authentication-deep-dive-2026-10-09.md` (RBAC/auth), `scalable-channel-factory-2026-10-05.md` + `selling-google-login-research-2026-10-07.md` (OAuth-as-product), `project-full-audit-2026-10-09.md` (incidents). All external licenses/prices re-verified against primary sources **fetched 2026-10-24** (section 9). Repo claims cite file paths verified today. **FACT** vs **RECOMMENDATION** is labeled throughout. Owner constraint honored: no fixed daily-upload limits in the architecture — external limits (Google quota buckets, channel trust) are per-tenant data, never hardcoded caps.

---

## 0. TL;DR verdicts

| # | Question | Verdict | One line |
|---|---|---|---|
| 1 | Engine for v2 background processing | **ADOPT pg-boss on Neon** (MIT, Postgres-only) | Same one datastore the repo already runs; SKIP LOCKED + per-queue concurrency generalizes the existing per-channel serialization (`channel-autopilot.yml:83`, #63 outbox-drain) without adding Redis. |
| 2 | Trigger substrate | **Dedicated worker process** (one small always-on box/Cloud Run service); GHA stays for own channels | Vercel Cron Hobby is once-per-day and fire-and-forget (no retry, possible duplicate invokes — Vercel docs) — it can tick, but reliability must live in the DB claim loop. |
| 3 | Hosted alternative | **CONSIDER Vercel Workflow SDK + Queues** as the zero-new-vendor path | Durable execution ("use workflow"/"use step", journal-based state, sleeps to months) is now GA in Vercel's own Next.js background-jobs guidance; pricing unverified — evaluate before committing. |
| 4 | Temporal / Inngest / Trigger.dev | **WATCH** (v2-scale options, not v1) | Temporal Cloud $50/M actions is cheap at this volume but self-host is a real cluster; Inngest free tier caps 5 concurrent steps; Trigger.dev v4 is Apache-2.0 + MIT — all three re-evaluate at SaaS scale. |
| 5 | n8n | **BLOCKED as embedded engine** | Sustainable Use License: internal business use only — embedding into a customer-facing SaaS needs n8n's commercial license (LICENSE.md quotes §1.7). Internal curation only. |
| 6 | Workflow state machine | **RIGHT-SIZE the 16 states down to ~11 states + a step/artifact table** | States = human phases; audio+render+QC collapse into one `rendering` state with sub-steps; failures isolate via content-addressed artifacts per step (never regenerate completed steps). |
| 7 | Multi-tenant shape | **Modular monolith, one Neon Postgres, tenant_id + RLS as defense-in-depth** | Neon officially supports RLS (Data API `auth.user_id()`, Drizzle `crudPolicy`); storage/queues/logs isolate by prefix/queue-name/tag; per-channel concurrency cap generalizes what the repo already does. |
| 8 | Ownership graph | **Workspace-first, default personal workspace** (auto-created, invisible to solo users) | Channels belong to the workspace and are keyed by YouTube `channelId` (one Google account can own several channels — the wizard already handles the chooser; the escrow-estate token copy bug proves channels must be first-class). |
| 9 | Storage | **S3-compatible object storage from day one of tenants; BYO bucket (R2/S3) as the differentiator** | R2: 10 GB free tier, $0.015/GB-mo, zero egress (verified); ~60 MB per 1080p30 short at YouTube's recommended 8 Mbps — retention TTLs matter more than the per-GB rate. |
| 10 | Observability | **v1: Neon `jobs_metrics` table + structured logs + ntfy + healthchecks dead-man switch. v2: self-host Prometheus + Grafana + Loki** | All licenses verified permissive-compatible for self-host (Prometheus Apache-2.0, Grafana AGPL-3.0 self-host OK, ntfy Apache-2.0/GPLv2); Better Stack free tier (10 monitors + heartbeats) is the hosted-free fallback. |

---

## 1. Scheduling engines — verified facts, comparison, recommendation (§13.3)

### 1.1 Engine facts (all fetched 2026-10-24)

| Engine | License (primary source) | Infra it demands | Self-host | Pricing (hosted/commercial) | TS fit |
|---|---|---|---|---|---|
| **BullMQ** | MIT (bullmq.io: "Bull Board … Open source (MIT)"; BullMQ itself MIT) | Redis (6.2+ works; Redis 8 is tri-licensed AGPLv3/RSALv2/SSPLv1 since 2025-05-01 — using unmodified Redis does not affect your app license) | Yes (you run Redis) | OSS free; Bull Board free; Taskforce.sh dashboard from **$19.95/mo** (1 connection); BullMQ Pro ~**$95/mo** | Excellent (native Node/TS) |
| **pg-boss** | **MIT — "pg-boss is MIT licensed and always will be"** (GitHub README) | Postgres only (13+), Node 22.12+/Bun; uses SKIP LOCKED; has SQL API for non-Node runtimes | Yes — it's a library inside YOUR process | None (OSS) | Excellent (native) |
| **Temporal** | **MIT** (temporalio/temporal README: "MIT License") | Self-host = production service cluster: Docker Compose default ships **PostgreSQL + Elasticsearch** + Temporal frontend (gRPC 7233) + separate UI server binary; local dev is one binary (`temporal server start-dev`) | Yes (heavy ops) | Cloud: **from $50/M actions**, self-service down to **$25/M**; active storage **$0.042/GB-hr**, retained **$0.00105/GB-hr**; **$150 credits/90 days**, no minimums; support add-on from **$500/mo** | Excellent (TS SDK) |
| **Inngest** | Server/CLI: **SSPL v1.0 + "Grant of Future License" → Apache-2.0 on the third anniversary** of release (LICENSE.md); **SDKs Apache-2.0** (README) | Hosted: none. Self-host: single binary/Docker (`inngest start`) — supported since 1.0, no support guarantee | Yes, under SSPL until each release turns 3 years old | Free $0 (50k executions/mo, **5 concurrent steps**, 3 workers); Pro **from $99/mo** (1M exec, 100 concurrent steps, overage $0.000050→$0.000015/exec, compute $0.000011/vCPU-s + $0.000003/GB-s); Business from $499/mo | Excellent (TS SDK) |
| **Trigger.dev** | Core **Apache-2.0**, SDK **MIT** — "not fair-code or source-available"; some features gated but "the open source core is not relicensed or held back" (docs) | Self-host: Docker/K8s guides (web app + worker + its own Postgres) | Yes | Free $0 (**$5/mo credits**, 20 concurrent runs); Hobby **$10/mo**; Pro **$50/mo** ($50 credits, 200+ concurrent runs); then per-compute-second (~$0.0000169–$0.00068/s by machine) + per-run fee; extra schedules $10/mo per 1,000. Current major: **v4.x** (v4.5.11 recent; positioning now "durable AI agents") | Excellent (TS-first) |
| **n8n** | **Sustainable Use License v1.0** — see §1.7 quotes | Self-host compose/K8s | Yes (internal use) | Internal use free; **embedding/white-label into a customer-facing product = commercial (Embed/Enterprise) license** | N/A (low-code, not a TS library) |
| **Celery** | **BSD-3-Clause** ("Celery is Open Source and licensed under the BSD License") | Broker required (Redis/RabbitMQ/SQS family) | Yes | None (OSS) | Python-only — relevant to the AI sidecar, not the TS orchestration |
| **graphile-worker** | **MIT** (GitHub license badge + LICENSE.md) | Postgres only | Yes (library) | None (OSS) | Excellent (native) |
| **Vercel Workflow SDK + Queues** (new — not in prior round) | Proprietary/managed (license not verified today) | None new — runs on Vercel Functions; state in "the event log rather than in memory"; Queues give "at-least-once delivery" | No (managed) | **Pricing not verified today — UNVERIFIED**; requires Vercel platform | Excellent ("use workflow"/"use step" directives, `start()` from route handlers, sleeps "seconds to months", hooks) |

### 1.2 Semantics comparison

| Capability | BullMQ | pg-boss | Temporal | Inngest | Trigger.dev | graphile-worker | DB-table + poller |
|---|---|---|---|---|---|---|---|
| Delivery guarantee | at-least-once (acking) | at-least-once (SKIP LOCKED, lease) | effectively-once workflow semantics via deterministic replay | at-least-once steps | at-least-once | at-least-once (SKIP LOCKED) | whatever you build (lease + dedupe) |
| Retries w/ backoff | yes (exponential, configurable) | yes ("automatic retries with exponential backoff", DLQ with redrive) | yes (per-activity policies) | yes per step | yes per task | yes (attempts + backoff) | hand-built |
| Delayed jobs | yes (delayed set) | yes ("job deferral") | durable timers | sleeps | sleeps | yes (run_at) | yes (run_at column) |
| Cron/recurring | Job Schedulers (`upsertJobScheduler`); v5.16 APIs deprecated, removed in v6; scheduler creates a sentinel delayed job; "will only generate new jobs when the last job begins processing" | **Cron AND RRULE** scheduling (RRULE = RFC-5545 recurrence) | Schedules (first-class) | cron triggers | schedules (bundled) | crontab file | hand-built |
| Time zones / DST | **`tz` option** on schedulers ("use `tz: 'UTC'` in scheduler options"); cron via cron-parser | cron expression (cron-parser family); **RRULE supports native TZID** | schedule spec has timezone | cron + timezone config | timezone on schedules | crontab timezone param | you implement (use `Intl` + IANA, as the repo already does in `lib/quota-ledger.mjs:18-21`) |
| Multi-queue priorities | yes (priorities per job) | yes ("priority queues, dead letter queues… rate limiting, debouncing, and concurrency" policies) | task-queue routing + priority (Cloud feature list) | queues/concurrency keys | queues + concurrency keys | priorities (job sort) | hand-built |
| Per-key serialization (per-channel!) | yes (group/limiter patterns; Pro feature territory) | **concurrency per queue** — one queue per channel = the repo's `channel-<slug>` GHA group, in SQL | via task-queue + local activities | concurrency keys | queue-per-key concurrency | no first-class | singleton claim row |
| Observability | Bull Board (MIT free) / Taskforce.sh (paid) | `@pg-boss/dashboard` npm UI | Web UI + SDK queries | dashboard | dashboard | minimal | your own table (the repo pattern) |
| Cross-language enqueue | Redis clients (many langs) | **SQL API for non-Node runtimes** — the Python sidecar can enqueue/consume directly | SDKs: 8 languages | SDKs TS/Python/Go/Java | TS-first | SQL/Postgres functions | SQL — any language |

### 1.3 What the repo already runs (the tie-breaker evidence)

- **FACT** — scheduler is GHA cron, staggered off the hour, per-channel: `.github/workflows/channel-autopilot.yml:13-19` (02:13/02:47/03:21/03:53/02:33 UTC), dynamic matrix filtered by `autopilot !== false && active !== false && tokenSecretSaved !== false` (lines 53-60), `max-parallel: 3` + per-channel `concurrency: group: channel-${{ matrix.slug }}`, `cancel-in-progress: false` (lines 80-85).
- **FACT** — outbox drain is serialized across workflows because parallel runs corrupted state: `ig-slot-poster.yml:18-21` and `fb-now.yml:16-19` share `group: outbox-drain` ("parallel runs overwrote each other's save, resurrecting posted reels", #63) — commit b0bda8f formalized this.
- **FACT** — quota gate is already a scheduling constraint: `lib/quota-ledger.mjs` (10,000 units/day, 1,700/upload, PT-date rollover, fail-closed) and `studio/lib/schedule-projection.js` (worst-day projection, blocks saves past the pool).
- **FACT** — the real "publish" clock is YouTube's: uploads go up private with `publishAt`, so slot times govern visibility without a precision scheduler (`scalable-channel-factory-2026-10-05.md` §3 build 3).
- **FACT** — the state store is Neon via postgres.js (`studio/lib/db.mjs:14-16`, `ssl: 'require', max: 5, prepare: false`).

The repo's concurrency groups and outbox **are** a hand-rolled message queue enforced by GitHub's infrastructure. pg-boss expresses the exact same semantics (one queue per channel + concurrency policy + DLQ + retries) inside the one database already in production.

### 1.4 Neon fit for a Postgres-backed queue

- **FACT** — Neon supports RLS and the Supabase-shaped pattern (`auth.user_id()` = `auth.uid()`), and endorses Drizzle's `crudPolicy` helper (neon.com row-level-security guide).
- **FACT** — Neon LISTEN/NOTIFY is session-scoped and dies with the session: "notifications and listeners… only exist for the duration of the current session and are lost when the session ends"; the documented workaround is disabling Scale to Zero (paid plans; the Free plan suspends after 5 idle minutes) (neon.com compatibility page). **Consequence:** a pg-boss deployment on Neon should run workers that *poll* (pg-boss works polling-only) and, on a paid plan, keep a dedicated compute (or accept poll-latency wakeups). This is a latency nuance, not a blocker — this pipeline's jobs are minutes long, not milliseconds.
- **FACT** — Studio already uses the pooled URL with `prepare: false` (db.mjs) — pg-boss needs its own dedicated connection(s); that is a config split, not a conflict.

### 1.5 RECOMMENDATION — initial approach and migration path

**Phase A (now → first tenant): keep GHA cron for own channels; add the pg-boss-shaped tables to Neon.**
The scheduling model becomes data (`schedules`, `jobs`, `job_steps`, `job_events` tables with `tenant_id`, `channel_id`, `run_at`, `dedupe_key`, `state`, `attempts`) instead of cron lines in YAML + `schedule-state.json`. Studio writes schedules (the #100 panel already validates cadence + quota projection — reuse `validateSchedule`/`projection` server-side). GHA remains the worker for own channels reading due jobs — or is bypassed once a worker exists.

**Phase B (first tenant → ~100 channels): pg-boss on Neon + one dedicated worker host.**
- pg-boss (MIT, no new datastore) with one queue per channel (`tenant:<id>:ch:<channelId>`, concurrency 1 — the direct generalization of `channel-<slug>` GHA groups and the #63 lesson), a separate slow lane for longform renders, and DLQ redrive as the parking lot for permanent failures.
- The worker is ONE small always-on Node process (Hetzner-class VPS or Cloud Run service with min-instances 1) running `channel-pipeline.mjs`-shaped handlers. Renders move off GHA because tenant channels **cannot run in your public repo** (tech-stack §5, ADR-A boundary violation). ffmpeg renders (2–4 min today on GHA runners) run fine on a 2–4 vCPU worker; Cloud Run Jobs is the per-render alternative from tech-stack §5 when burst capacity is wanted.
- Vercel Cron may *tick* the poller (Pro plan invokes within the minute; Hobby is once-per-day and unusable — Vercel docs §7) — but correctness comes from the DB claim loop being idempotent and reconciliation-based, because Vercel explicitly documents cron delivery as best-effort with possible duplicate invocations and **no retry on failure**.
- The Python sidecar (RAG/voice per python-rag-audit) talks to the same queue via pg-boss's SQL API — one queue system across both languages.

**Phase C (scale triggers):**
- **→ Redis/BullMQ:** when Postgres-queue load genuinely bottlenecks (thousands of jobs/min, sub-second latency needs) — and only then, because Redis is a second state store to operate. Keep the queue abstraction (SEAM 3 `jobs`) narrow so the driver swaps.
- **→ Temporal Cloud:** when multi-day human-in-the-loop workflows with signals/queries dominate (approval gates that wait for days, customer-facing SLAs, need for durable timers around YouTube processing). At this pipeline's volume the cost is small (~30–40 actions/video → $1–2/mo at 1,000 videos/mo at $50/M) — the blocker is operating the self-hosted cluster, not the bill. Consistent with tech-stack §5: WATCH, don't adopt now.
- **→ Trigger.dev / Inngest hosted:** re-evaluate at SaaS scale if the owner prefers managed orchestration over operating the worker: Trigger.dev v4 (Apache-2.0 core, TS-first, $5 free credits) is the friendlier license; Inngest's free tier (5 concurrent steps) and SSPL self-hosted server (Apache-2.0 only 3 years per release) make it a hosted-only consideration.
- **→ Vercel Workflow SDK:** the zero-new-vendor path (durable journal, sleeps to months, at-least-once queues). Worth a spike before Phase B if the owner prefers staying Vercel-managed; its pricing is UNVERIFIED as of 2026-10-24 and it deepens Vercel lock-in — the owner's demonstrated bias (self-hosted ntfy, BYOK vault, no-static-maps) favors pg-boss.

**Why pg-boss and not BullMQ first:** BullMQ's only added capability is Redis-side performance the pipeline doesn't need at this scale; it costs a second stateful system, and Vercel-hosted Studio can't host its worker anyway. Why not hand-rolled cron-poller table alone: pg-boss *is* that table with the bugs fixed (SKIP LOCKED leasing, DLQ, backoff, RRULE, dashboards) — and the assignment's own §13.3 lists "plain cron-poller table" as the fallback, not the pick, when a hardened MIT library exists.

### 1.6 n8n — the license wall (FACT with quotes)

n8n's Sustainable Use License v1.0 (LICENSE.md, fetched 2026-10-24):
- Use is allowed "only for your own internal business purposes or for non-commercial or personal use."
- Distribution only "free of charge for non-commercial purposes."
- Enterprise Edition files require a "valid n8n Enterprise License."

**Consequence for v2:** n8n cannot be the embedded workflow engine a customer-facing SaaS runs on, and cannot be white-labeled, without n8n's commercial license. Keep it exactly where prior rounds put it: internal content curation. Same conclusion shape as the Remotion license watch in tech-stack §4.

---

## 2. Schedule semantics — requirements catalog (§13.1)

The product needs these semantics; each maps to a mechanism that exists in pg-boss/DB terms or already in the repo.

| # | Requirement | Why it's real here (evidence) | Mechanism |
|---|---|---|---|
| 1 | One-time + recurring schedules | `publishAt` private uploads (factory doc) + daily cadence | `schedules` row (cron OR RRULE OR one-shot `run_at`); engine materializes due jobs |
| 2 | Per-channel & per-template schedules | `.github/workflows/channel-autopilot.yml:53-60` — per-slug `cron` in the registry, `cadence.json` overlay per slug (`studio/app/api/channels/schedule/route.js:15`) | Schedule rows keyed by `(channel_id, kind)` where kind ∈ short/doc/clip; template choice stored with the schedule |
| 3 | Posting windows / slot times | Slots are US-ET-anchored ("money slot") — brands doc | Store `publish_at` in UTC + `tz` IANA per channel; window = window start in that tz |
| 4 | Pause / resume / cancel / reschedule | `pausedUntil` + registry `autopilot` flag (flow-control §3); Buffer/Hootsuite semantics already adopted: pause stops NEW delivery, never recalls published items | `channels.paused_until` honored at claim time; reschedule = update `run_at` on unclaimed jobs; cancel = state transition |
| 5 | Duplicate prevention across worker restarts | THE repo wound: old cron caused **8 duplicate longform uploads** (project-full-audit §2.3), "First $10,000" published 4×, "Stop Begging For Respect" 3× (§1.7.3); #63 outbox race | `dedupe_key = channel_id + slot_date + kind` unique index; job claims with lease (`locked_at`/`locked_by`); upload step checks `videos.list` for the dedupe title before `insert` |
| 6 | Retry taxonomy (transient vs permanent) | Script brain 429/403 blips ~1 channel/day (audit §2.2); quota failures; `invalid_grant` on dead tokens (audit §1.7.2, 1.7.6) | Transient (network/5xx/429) → retry w/ exponential backoff + jitter, max N; **permanent** (`quotaExceeded`, `invalid_grant`, policy gate rejects) → park to DLQ + ntfy notify, never auto-retry |
| 7 | Quota-aware scheduling | `lib/quota-ledger.mjs` fail-closed pool; projection blocks over-stack days (`schedule-projection.js:56-69`) | Book units at enqueue time; reconcile at run time; **see the model discrepancy below** |
| 8 | Token-refresh-before-publish | escrow-estate token = IC copy (audit §1.7.1); 11 dormant tokens `invalid_grant` (§1.7.6); Testing-mode tokens expire every 7 days (selling-google-login §1) | Preflight step: cheap authenticated read (`tokens.get`/`channels.list`) before spend; on `invalid_grant` → park channel + ntfy "reconnect needed" — never burn a render on a dead token |
| 9 | Manual approval gates | YouTube API Developer Policies: uploads need "prior specific and express consent" (activation-flow §1); Topic Desk exists | States `script_review` / `final_review` (§3); consent artifact `consentedAt` (activation-flow §3) |
| 10 | Delayed-processing detection | verify-run proof-of-publication exists (arch-audit §2.5) | `processing` state polls `videos.list` until processed → `published`; timeout → alert |
| 11 | DST/timezone correctness | Quota resets midnight **PT** (`quota-ledger.mjs:14-21`); slots ET | **Store UTC + IANA tz per schedule; compute local wall-clock at enqueue time** (recompute after DST transitions — store tz, not offset). RRULE TZID or `tz` options verified in §1.2 |
| 12 | "No fixed upload caps" (owner constraint) | — | External constraints (Google buckets, channel trust ramp) are per-tenant config rows consulted by the scheduler; the product adds none |

**Quota model discrepancy to reconcile (FACT + open item):** `lib/quota-ledger.mjs:1-12` models uploads at 1,700 units against the shared 10k/day pool, while `youtube-upload-quota-research-2026-09.md` documents Google's Dec 2025 restructure — uploads in their own ~100/day bucket, search in its own bucket, 10k shared for the rest. Both files are on disk; the ledger is the conservative model. **RECOMMENDATION:** encode *which* constraint model applies per Google project as data (`quota_model`, `daily_limits`) on the tenant/project record; the scheduler subtracts from whichever model is active and fail-closes. Do not hardcode either in v2.

---

## 3. Workflow lifecycle & state machine (§13.2)

### 3.1 Is the proposed 16-state model right-sized?

**RECOMMENDATION: right-sized as a UX journey, too fine-grained as a state column.** Collapse the *state machine* to ~11 states and push the fine steps into a **step/artifact table** — the state is what a customer sees; steps are what the worker resumes.

**v1 state set (video_project.state):**

| State | Meaning | Gate? |
|---|---|---|
| `draft` | created, not activated | — |
| `researching` | topic selection running (Topic Desk proposal) | — |
| `script_review` | script awaiting approval (or auto-approve if tenant consented) | **gate** |
| `rendering` | asset collection → audio → render → QC run as steps with sub-progress | — |
| `final_review` | finished video awaiting OK (YouTube-policy consent anchor) | **gate** |
| `scheduled` | uploaded/queued private with `publish_at` | — |
| `uploading` | videos.insert in flight | — |
| `processing` | YouTube-side processing, polling | — |
| `published` | live + verified | terminal |
| `failed` | parked, retryable flag | terminal-ish |
| `cancelled` | human cancel | terminal |

Proposed collapses: `topic research` + `script gen` are sub-steps under `researching`/draft work (their outputs — topics JSON, script — are artifacts, not states); **`asset collection` + `audio` + `render` + `QC` collapse into one `rendering` state** with a `job_steps` table carrying per-step status/progress (audio done 2/4, render 60%); `thumbnail` becomes a step of rendering (it already is one in `channel-pipeline.mjs`'s single process); `scheduled → uploading → processing` stay separate — they involve different failure domains (YouTube API) and the repo already distinguishes them implicitly (verify-run proof, delayed processing).

### 3.2 Failure isolation — artifact-store-per-step

- **RECOMMENDATION:** each step writes its outputs to content-addressed keys: `t/<tenant>/p/<project>/<step>/<hash>.<ext>` where hash = sha256(step inputs + recipe/engine version). A retry of `render` finds `audio.json` + `narration.mp3` already present and skips regeneration. **A failure in one step must never regenerate previous steps** — this is the test: kill the worker during `render`, restart, and the run must re-enter at `render` with byte-identical inputs.
- **Repo precedents:** the outbox contract `fb-outbox/<slug>/` (mp4+json) and `hf-out` status.json are already artifact contracts (arch-audit §2.6-2.7); the longform pipeline already reuses staged artifacts (`lf-meta-<slug>`, `tt-lf` artifacts consumed by `tiktok-clips.mjs:98` — arch-audit P2).
- **FACT (why this matters here):** `channel-pipeline.mjs` is the single per-channel orchestrator (arch-audit §2.1) — steps today are process-internal; v2 needs the same sequencing but with resumable boundaries because workers will crash mid-render at tenant scale.
- **Crisp error codes per step** (same classes as §2.6 retry taxonomy) so the state machine never guesses whether to retry.

### 3.3 Resumability after crash

Claim/lease protocol (pg-boss gives this): worker claims job → lease expires if it dies → job re-delivered → steps idempotent via `dedupe_key` + artifact presence checks → resume at the first incomplete step. The known repo failure this prevents: the GHA state push failing leaves state local to the run (`channel-autopilot.yml:178` warning) — with a DB, job state survives the worker.

### 3.4 Cancellation semantics

- `draft`…`rendering`: kill child processes (ffmpeg/subprocesses), delete tmp dir, mark `cancelled`, free quota booking.
- `scheduled` (private + `publishAt`): cancel = clear `publishAt`/delete the private video (API `videos.delete`) before `publish_at`; **the cancellation window closes at publish time** — matching the Buffer/Hootsuite semantics on file (flow-control §2: pause never recalls sent items; the pre-publish window is where we can).
- `uploading`/`processing`: attempt API delete; if it fails, park + alert — never silently claim cancelled when the video may publish.
- Render temp files: worker-owned tmp dir removed on terminate/cancel/complete (lifecycle §6.3).

---

## 4. Multi-tenant architecture (§14)

### 4.1 Modular monolith vs services — RECOMMENDATION: modular monolith (one Next app + one worker + packages/), matching prior decisions

- Studio is Next.js/Vercel (318 .tsx, 46.8k LOC — python-rag-audit §1) and the Python sidecar decision is already made and HTTP-seamed (python-rag-audit §2.3). **v1 = two deployables: Studio (Vercel) + worker (one container) + sidecar (Python FastAPI), all talking to one Neon Postgres + one object store.** That *is* the modular monolith with process seams.
- The seams worth enforcing are the five on file (arch-audit §5.2: registry, render engine, state/job store, narration, publishing adapters) plus one new: **tenant context** (`withTenant(ctx)` resolving tenant_id + RLS session var on every query).
- Splitting into services before the first paying tenant would add deployment surface without a scaling win; the repo's own history (P8 ad hoc seams) argues for few, explicit seams.

### 4.2 Tenant isolation topology

| Layer | v1 mechanism | Notes / evidence |
|---|---|---|
| **DB** | Single Neon Postgres; every table carries `tenant_id`; **Postgres RLS enabled as defense-in-depth** behind app-level filtering (app filter is primary; RLS catches bugs) | **FACT:** Neon supports RLS with the Supabase-shaped pattern — `auth.user_id()` + JWT via Data API, and endorses Drizzle `crudPolicy` (neon.com). Set `SET LOCAL app.tenant_id = $1` per transaction for non-Data-API paths |
| **Object storage** | Path-prefix per tenant: `t/<tenant_id>/...` in one bucket | Bucket-per-tenant only as an enterprise/later option (cost + management); prefixing + signed URLs is sufficient at v1 scale |
| **Queues** | Queue per channel: `t:<tenant>:ch:<channelId>` concurrency 1 + tenant-level concurrency cap on the worker pool (§4.4) | Generalizes `channel-<slug>` GHA groups (autopilot yml:83-85) and the #63 shared-outbox-lock lesson |
| **Credentials** | BYOK vault stays; topology: token/provider keys keyed `(tenant_id, channel_id)` / `(tenant_id, provider)`, encrypted with per-workspace data keys derived from the master key; vault module consolidated per arch-audit P6/#80 (single crypto seam + round-trip test) | Crypto design owned by the other researcher — this is the isolation topology only |
| **Logs** | Structured JSON lines with `tenant_id, channel_id, job_id, step` fields; v1: Vercel logs + Neon `job_events` table; v2: Loki with tenant labels (§7) | The audit log table already exists (`db.mjs` header maps audit_log) |
| **Workers** | Shared pool + two caps: per-channel serialization (always 1) and per-tenant concurrent-renders cap (config row, default small); fair-share rotation across tenants so one tenant's 50 channels can't starve another | The `max-parallel: 3` matrix cap (autopilot yml:81) is today's crude version |

### 4.3 RBAC model — verified against the repo's existing auth

- **FACT (today):** roles owner/staff/client exist via Google login + `access.json` seeded into Neon `users`; session = HMAC stateless cookie 30 days; route→role matrix in proxy + server-side re-checks; audit trail in Neon (authentication-deep-dive §1; role-based-access §4). The agreed hardening path is a DB-backed opaque `sessions` table with instant revocation, then Better Auth on Neon (auth deep-dive §§3-4).
- **RECOMMENDATION (v2 model):**

```
user ──< workspace_member (workspace_id, role) >── workspace ──< channel
platform_role (internal staff: support/impersonate, audited, separate from workspace roles)
```

Workspace roles: `owner / admin / editor / viewer`; channel-level `approver` optional (Topic Desk review rights). Customer workspaces: the paying user IS the workspace owner; staff/platform roles are your internal cross-tenant access (audited, rarely granted). This preserves the existing owner/staff/client intuition: today's "client" = member of their own workspace; today's "owner" = platform owner. The R1b `ownerEmail` channel-filter plan (role-based-access §4) becomes `WHERE workspace_id = :user_workspace` — the same enforcement point, one level up.

---

## 5. Resource ownership (§14.1)

**RECOMMENDATION — ownership graph:**

| Resource | Belongs to | Rationale / evidence |
|---|---|---|
| **User** | — | Identity from Google login (existing) |
| **Workspace** | owner user(s) | Agencies need multiple workspaces + shared channels; **default personal workspace auto-created and hidden** so solo users never see the concept (ship both without UX cost) |
| **Channel** | **workspace** (not user) | Channels are shared agency assets; key by YouTube `channelId`. **FACT:** one Google account can own multiple channels — the wizard already surfaces Google's channel chooser ("your 5 channels — pick one", scalable-channel-factory §3); the escrow-estate token accidentally being an IC copy (project-full-audit §1.7.1) is the concrete proof that channels must be first-class entities keyed by channelId, NOT per Google account. Keep the repo's per-channel token/registry model (`YT_TOKEN_<SLUG>`, registry entry + kit) — it is already channel-keyed |
| **OAuth connection** | channel (1:1), with Google-account linkage stored for UX (which Gmail authorized) | Re-auth is per channel (per-channel tokens in audit §1.7.6) |
| **AI provider configs (BYOK)** | **workspace** (with per-channel override) | Workspace = billing boundary; a team shares keys; channel override covers niche-specific models. Today providers are global env (`PROVIDERS` list, arch-audit P6) — workspace-scoping is the v2 change |
| **Niches / sub-niches** | channel (kit data), derived options catalog global | No-static-maps directive: niche behavior = registry/kit data, never hardcoded |
| **Templates** | global registry + **workspace-scoped copies** when customized | Styles catalog is global today (`studio/lib/templates-catalog.js`); customization forks a copy — keeps upstream updates possible |
| **Video project** | channel | The state machine entity (§3) |
| **Generated assets** | project (content-addressed, §3.2) | Immutable artifacts; ownership inherited from project |
| **Scheduled jobs** | channel (+ project ref when bound) | Queue rows carry tenant_id/channel_id (§4.2) |
| **Published videos** | channel (+ immutable copy of metadata + thumbnail) | Publish ledger = dedupe + audit backbone (dup-gate lineage) |
| **Analytics snapshots** | channel, time-series rows | Existing Analytics lane; snapshots per (channel, date) |

---

## 6. Storage & media lifecycle (§14.2)

### 6.1 Option comparison (prices fetched 2026-10-24)

| Option | Facts | Verdict for v2 |
|---|---|---|
| Local FS (GHA runner / Vercel serverless) | GHA runners are ephemeral single-job VMs; Vercel functions have no persistent FS — **FACT** (docs; and the repo already works around it via Release uploads) | Temp-only, inside a single step; never state |
| GitHub Releases (today's archive) | Works at own-channel volume; "tag-bound, not queryable, no published SLA" (tech-stack §8) | Keep for own channels; not multi-tenant |
| **Cloudflare R2** | **Free tier: 10 GB-month, 1M Class A, 10M Class B ops, egress always free; paid $0.015/GB-mo (standard), $4.50/M Class A, $0.36/M Class B** (developers.cloudflare.com/r2/pricing) | **Default v2 store** — S3 API, zero egress (review streams + downloads free), cheap |
| Vercel Blob | **$0.023/GB-mo, $0.40/1M simple ops, $5/1M advanced ops; Hobby 1 GB free** (vercel docs, Sep 2026) | Fine but pricier per GB and egress-billed; no multi-cloud exit flexibility vs R2/S3 API |
| Supabase Storage | S3-compatible, built on their stack — **pricing/limits NOT re-verified today — UNVERIFIED** | Skip (second vendor; auth deep-dive already rejected Supabase pairing) |
| **BYO bucket (tenant's own S3/R2/GCS)** | S3-API compatible targets are interchangeable | **RECOMMENDATION: build it day one** — the storage analog of the BYOK vault; differentiator for data-control-sensitive customers and it caps YOUR storage cost at zero for those tenants |

### 6.2 Storage-per-video math (FACT chain)

- YouTube's recommended upload bitrate for 1080p SDR at standard frame rate (24/25/30): **8 Mbps** (support.google.com/answer/1722171, fetched 2026-10-24).
- 8 Mbps = 8,000,000 bits/s ÷ 8 = 1,000,000 B/s = 60 MB/min (decimal) video + AAC ~128 kbps ≈ 0.96 MB/min audio → **≈ 61 MB per minute of finished 1080p30 vertical short**; a 60 s short ≈ **~60 MB**; a 10-min longform ≈ **~610 MB**.
- Reality check vs repo artifacts: tracked demo renders are 26.1 MB and 18.1 MB (arch-audit §4) — i.e., current renders land around **2–4 Mbps ≈ 15–30 MB/min**, well under the recommended ceiling. Budget at the recommended bitrate; measure actuals from the jobs table.
- Intermediates during render (extracted frames, raw mux passes) can transiently be 10–30× the final size — this is why tmp cleanup is a lifecycle requirement, not a nicety.
- **At tenant scale:** 100 channels × 3 shorts/day ≈ 18 GB/day of finals at recommended bitrate (~7 GB/day at observed bitrates) — the R2 free tier (10 GB) is exhausted in the first day; at $0.015/GB-mo, retaining 30 days of finals ≈ 540 GB ≈ **$8/mo** for the whole cohort. **Retention policy, not storage price, is the lever.**

### 6.3 Lifecycle policy (RECOMMENDATION)

| Artifact class | Retention | Notes |
|---|---|---|
| Render tmp (frames, raw takes, wav) | deleted at step end / job end / crash-sweep; TTL hard cap 24 h | worker-owned tmp dir; sweep on claim of same channel (the sweeper pattern generalized) |
| Intermediates kept for retry (audio, script, per-step artifacts) | TTL 72 h after terminal state | content-addressed; retry needs them only while job is retryable |
| Final MP4 (published) | default TTL 14–30 days after `published`, then optional delete (YouTube holds the copy; you keep metadata + thumbnail forever) | tenant-configurable; BYO-bucket tenants set their own |
| Thumbnail + metadata + publish proof | keep (KB-scale, the audit value) | verify-run lineage |
| Cancelled/failed project artifacts | TTL 72 h, then purge | |
| Per-tenant quota | plan-configured GB cap; soft alert at 80% (ntfy/email), hard block new renders at 100% | never a platform-wide cap — per-tenant data (owner constraint) |
| Checksums/dedup | sha256 per artifact; content-addressed keys make re-renders byte-identical dedupe cheap | |
| Signed URLs | presigned GET, 15-min TTL for review links; presigned PUT only from worker | private by default; R2/S3 presigned |
| Encryption at rest | S3/R2 SSE default; BYOK continues to govern *credentials* (tokenEnc), not media | media sensitivity < credential sensitivity |

---

## 7. Observability (§14.3)

### 7.1 v1 stack — fits GHA + Vercel + ntfy exactly (RECOMMENDATION)

1. **`job_events` / `jobs_metrics` table in Neon** — one row per step: `tenant_id, channel_id, job_id, step, status, started_at, finished_ms, attempt, error_class`. This is the cost-per-video and queue-latency source of truth; the audit-log habit (db.mjs; appendAudit) already exists.
2. **Structured logs** (JSON lines with the same fields) from worker + Studio routes — greppable in Vercel's log view, exportable to Loki later without re-instrumenting.
3. **ntfy alerts** for human-grade events (parked job, invalid_grant, quota-block, render fail ×N) — **FACT:** ntfy is dual-licensed Apache-2.0/GPLv2, self-hosting free (GitHub README); already the repo's alert channel.
4. **Dead-man switch on every cron lane:** healthchecks.io free Hobbyist = **20 monitored jobs** (≈ the repo's ~20 cron workflows; Business $20/mo for 100 jobs; free Business plan for open-source projects exists) — FACT, fetched 2026-10-24. This closes the "workflow never ran" gap that project-full-audit §1.2 flagged as an open CI Doctor gap. (Self-hosted OSS healthchecks is the unverified-but-likely alternative — verify version before adopting.)
5. **CI Doctor extended:** workflow-never-ran check + a daily jobs-table digest (runs, failures, quota used, queue latency p95) pushed via ntfy — the reporting lane already does Excel+ntfy daily.

### 7.2 v2 stack

| Component | Pick | License status (fetched 2026-10-24) |
|---|---|---|
| Metrics | **Prometheus** (self-host) | **Apache-2.0** (repo: "Apache License 2.0") |
| Dashboards | **Grafana** | **AGPL-3.0-only** ("Grafana is distributed under AGPL-3.0-only. For Apache-2.0 exceptions, see LICENSING.md") — self-hosting is fine; AGPL binds if you redistribute/serve modified Grafana itself to users, not if you just point it at your DBs |
| Logs | **Loki** | Grafana-family AGPL-3.0 (not independently re-verified today — confirm before embedding anywhere unusual) |
| Dead-man switch | healthchecks (self-host or the $20 Business tier) | verified §7.1 |
| Hosted-free fallback | **Better Stack free plan: 10 monitors & heartbeats, 1 status page, 3 GB logs/3-day retention, Slack/email alerts; Responder $29/mo** (betterstack.com/pricing) | FACT — a zero-cost substitute for §7.1.4/5 until v2 |

Metrics that matter (all derivable from `jobs_metrics` + provider logs): failed workflows (per step/error class), render perf (finished_ms by template/engine), queue latency (enqueue→claim), upload failures (per error class), quota usage (units/day vs model), OAuth failures (invalid_grant count), worker health (lease expiry/heartbeat), provider availability (per-provider 4xx/5xx rates — the script-brain chain), DB perf (Neon metrics), **cost per video/channel** (jobs_metrics durations + BYOK provider usage rows × price list — logging usage per tenant is what makes cost-per-video computable; crypto/vault details belong to the other researcher).

---

## 8. Risks, gaps, open questions

**Risks (named):**
1. **Vercel Cron is not a scheduler.** Hobby: once per day, invoked "at any point within the specified hour"; delivery best-effort with duplicate invokes possible; "Vercel will not retry an invocation if a cron job fails" (docs, fetched 2026-10-24). Using it as anything but a thin tick is a duplicate-upload bug generator — the exact class that published "First $10,000" 4×.
2. **Neon scale-to-zero kills LISTEN/NOTIFY listeners** (compatibility page) — queue wakeups must not depend on NOTIFY; keep a polling worker and consider keeping compute warm on paid plans.
3. **n8n licensing** — embedding it in the SaaS without a commercial license violates the Sustainable Use License (quoted §1.6). Any "no-code workflows" feature must not ship on OSS n8n.
4. **Inngest self-hosted server is SSPL** until each release's third anniversary — not Apache-2.0 today despite the SDK being so; don't assume "open source" from the marketing page.
5. **BullMQ v6 migration cliff** — repeatable-job APIs were deprecated in v5.16 and removed in v6 (docs); any BullMQ adoption should start on the Job Scheduler API, not tutorials' `repeat` patterns.
6. **Quota-model ambiguity** (§2 discrepancy) — scheduling against the wrong Google bucket model either wastes slots or over-runs; resolve empirically per project before tenant onboarding.

**Gaps / UNVERIFIED:**
- Vercel Workflow SDK + Queues **pricing and license terms** — not verified 2026-10-24; needed before the Phase-B spike decision.
- Supabase Storage free-tier figures — not re-verified (de-prioritized by vendor decision on file).
- Loki license not independently re-verified (AGPL family assumed).
- pg-boss exact current major version not captured in today's fetch (README facts verified; version number not shown on page).
- Self-hosted healthchecks OSS current release not verified.

**Open questions for the owner:**
1. Managed-vs-self-operated bias check: Vercel Workflow SDK spike (1 day) vs pg-boss worker (1–2 days) — pick after pricing data.
2. Where do tenant renders run first — one always-on worker box, or Cloud Run Jobs per render (matches tech-stack §5's ADOPT-at-inflection verdict)?
3. Is BYO-bucket storage (BYOK-for-storage) a launch feature or fast-follow? It changes the storage abstraction's day-one shape.
4. Tenant-level render concurrency default (noisy-neighbor cap) — needs a number once real render durations are in `jobs_metrics`.

---

## 9. Sources (all fetched 2026-10-24 unless noted)

1. https://bullmq.io/articles/guides/bull-board-vs-taskforce — BullMQ/Bull Board MIT; Taskforce.sh from $19.95/mo; BullMQ Pro ~$95/mo.
2. https://docs.bullmq.io/guide/jobs/repeatable — v5.16 deprecation → v6 removal; cron/every semantics; jobId reuse.
3. https://docs.bullmq.io/guide/job-schedulers — `upsertJobScheduler`, `tz` option, sentinel delayed job, next-job-when-last-begins.
4. https://redis.io/blog/agplv3 + https://github.com/taskforcesh/bullmq/discussions/2484 (search, 2026-10-24) — Redis 8 AGPLv3/RSALv2/SSPLv1 since 2025-05-01; BullMQ OK on Redis 6.2+.
5. https://github.com/timgit/pg-boss — MIT ("always will be"), Postgres 13+, Node 22.12+/Bun, SKIP LOCKED, cron+RRULE, backoff, priority/DLQ/rate-limit/concurrency policies, SQL API.
6. https://temporal.io/pricing — $50/M actions → $25/M; storage rates; $150 credits; support from $500/mo.
7. https://github.com/temporalio/temporal — MIT license.
8. https://docs.temporal.io/production-deployment + /self-hosted-guide/deployment.md — self-host = your own production service; compose default ships PostgreSQL + Elasticsearch + frontend gRPC 7233; two binaries; `start-dev` single binary for dev.
9. https://www.inngest.com/pricing — Free 50k exec/5 concurrent steps; Pro from $99/mo; overage + compute rates.
10. https://www.inngest.com/docs/self-hosting — self-host supported since 1.0; single binary; no support guarantee.
11. https://github.com/inngest/inngest + raw LICENSE.md — server/CLI SSPL v1.0 + Apache-2.0 on third anniversary ("effective on the third anniversary…"); SDKs Apache-2.0.
12. https://trigger.dev/docs (landing, license summary) — core Apache-2.0, SDK MIT, "not fair-code or source-available", gated features; self-host Docker/K8s.
13. https://trigger.dev/pricing (search result, 2026-10-24) — Free $5 credits/20 concurrent; Hobby $10; Pro $50; compute-second + per-run; schedules $10/mo per 1,000; v4.x current (v4.5.11).
14. https://raw.githubusercontent.com/n8n-io/n8n/master/LICENSE.md — Sustainable Use License v1.0 quotes: internal business purposes only; free non-commercial distribution; EE needs Enterprise License.
15. https://docs.celeryq.dev/en/stable/index.html — "licensed under the BSD License".
16. https://github.com/graphile/worker — MIT; "High performance Node.js/PostgreSQL job queue".
17. https://neon.com/docs/guides/row-level-security — RLS supported; `auth.user_id()`; Drizzle `crudPolicy` endorsement.
18. https://neon.com/docs/reference/compatibility — LISTEN/NOTIFY session-scoped; lost at session end; disable Scale to Zero workaround; free plan 5-min suspension.
19. https://vercel.com/docs/cron-jobs/manage-cron-jobs — Hobby once-per-day + in-hour jitter; no retry; best-effort delivery; duplicate-invocation warning; CRON_SECRET; duration = Functions maxDuration.
20. https://vercel.com/kb/guide/how-to-run-background-jobs-in-nextjs-on-vercel — Workflow SDK ("use workflow"/"use step", event-log state, sleeps, hooks); Queues at-least-once; cron-thin guidance.
21. https://vercel.com/docs/vercel-blob/usage-and-pricing (via search, dated Sep 23, 2026) — $0.023/GB-mo; $0.40/1M simple ops; Hobby 1 GB.
22. https://developers.cloudflare.com/r2/pricing/ — free tier 10 GB/1M/10M, egress free; $0.015/GB-mo; Class A/B rates.
23. https://healthchecks.io/pricing/ — Hobbyist 20 jobs free; Supporter $5; Business $20 (100 jobs); Business Plus $80; OSS free plan.
24. https://betterstack.com/pricing — free: 10 monitors & heartbeats, 1 status page, 3 GB logs/3 days; Responder $29/mo.
25. https://github.com/prometheus/prometheus — Apache-2.0.
26. https://github.com/grafana/grafana — "Grafana is distributed under AGPL-3.0-only."
27. https://github.com/binwiederhier/ntfy — dual Apache-2.0/GPLv2; self-host free.
28. https://support.google.com/youtube/answer/1722171 — recommended upload bitrates: 1080p SDR SFR 8 Mbps (HFR 12; HDR 10/15).

**Repo evidence (verified 2026-10-24):** `.github/workflows/channel-autopilot.yml:13-19,53-60,80-85`; `.github/workflows/ig-slot-poster.yml:18-21`; `.github/workflows/fb-now.yml:16-19`; `lib/quota-ledger.mjs`; `studio/lib/schedule-projection.js`; `studio/app/api/channels/schedule/route.js`; `studio/lib/db.mjs`. Prior-round docs: `research/tech-stack-research-2026-10-17.md` §5/§8; `research/architecture-audit-2026-10-17.md` §§2-5; `research/project-full-audit-2026-10-09.md` §§1-2; `research/flow-control-research-2026-10-08.md`; `research/role-based-access-research-2026-10-08.md`; `research/authentication-deep-dive-2026-10-09.md`; `research/activation-flow-research-2026-10-09.md`; `research/scalable-channel-factory-2026-10-05.md`; `research/selling-google-login-research-2026-10-07.md`; `research/youtube-upload-quota-research-2026-09.md`; `research/python-rag-audit-2026-10-17.md`.
