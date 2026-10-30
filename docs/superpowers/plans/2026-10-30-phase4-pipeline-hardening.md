# Phase 4 Implementation Plan — Pipeline Hardening + Admin Completeness

Spec: `docs/superpowers/specs/2026-10-30-phase4-review-queue-analytics-spec.md` (v3, owner-approved 2026-10-30).
Tracking issue: #106. QA file: `qa/phase4-pipeline-hardening-qa.md` (generated Task 0, before code).
Method: subagent-driven development — parallel batches of disjoint-file tasks, fresh reviewer per task, fix rounds ≤5, honest ledger `.superpowers/sdd/2026-10-30-phase4/progress.md`.

## Decisions inherited from the spec (do not reopen)

- Own-portfolio only; no SaaS shapes. Client role dormant.
- Blob = Vercel Blob, SCOPED to resume/approval-critical bytes only (script payloads, TTS audio, review-gated renders, thumbnail candidates); full renders stay GitHub-Release-finals. Retention: non-review bytes 30d, resolved-intent bytes 7d (D3/D25). Fail-open on blob errors (index-only + warning).
- Gating is template-MEMBERSHIP-driven (review_required non-empty); generator flags enrich UI only. Unreadable gate state = HOLD (D15/M2).
- Only publishing-path emitters may set blocks_publishing (H9). Auto-park on Blocking only; parked runs run cheap probes; nightly probe job; owner manual resolve (D11).
- Resume is step-STATUS-based; skip requires artifact row AND retrievable bytes; stale invalidation via template version + brand-kit hash; full render input persisted pre-render (D4/M1/H1).
- upload_intents: dedupe_key (channel, slot_date, kind, slotIdx); INSERT-as-mutex; resolution → slot produced → skip production (D5/H3/H4).
- publishAt recomputed on late approval; approval→dispatch via the /api/action pattern (D17/H6/H7).
- Snapshots: trailing D-1..D-4 UPSERT UNIQUE(channel_id,date,source); analytics_api wins overlaps (D19/M1).
- Quota-model wiring dependency lands with S2 (D24). Drills executable with cleanup (M8).

## Tasks

### T0 — QA file (parallel-safe, no code)
Generate `qa/phase4-pipeline-hardening-qa.md` from the spec's 34 ACs + 3 drills — one row per AC, exact verification steps, typed automated/manual/visual, regression section. Owner-readable plain English.

### T1 — S1a: job store + artifact index + Blob client (foundation)
- NEW `lib/job-store.mjs`: jobs/job_steps/job_artifacts tables (ensure-schema-on-write, the makeUsageWriter house pattern); job + step recording API (start/step/finish/artifact-index).
- NEW `lib/artifact-store.mjs`: content-hash index + Vercel Blob client wrapper (@vercel/blob, lazy import, BLOB_READ_WRITE_TOKEN from env, fail-open → index-only + warning), retention/prune helpers (D25 windows).
- Tests: schema-on-write, step lifecycle, hash indexing, blob fail-open, retention windows. Flag: `JOB_STORE_ENABLED` (default off → byte-identical pipeline).
- Files: lib/job-store.mjs, lib/artifact-store.mjs, tests/job-store.test.mjs, tests/artifact-store.test.mjs. No pipeline edits.

### T2 — S1b: pipeline instrumentation + resume (needs T1)
- channel-pipeline.mjs: record job + steps around the existing step blocks (wrap, don't rewrite); PLATFORMS_PAUSED steps recorded as skipped; artifact index for script payload + TTS audio (+ review-gated renders in S4); `--resume <job_id>` re-enters at first failed/pending step with byte verification + stale invalidation (template version + brand-kit hash).
- always-exit-0 + fail-open-on-DB-down pinned as regressions (AC-P4-3/5); drift tests.
- Files: channel-pipeline.mjs, tests/pipeline-jobstore.test.mjs. DISJOINT from T3's lane files.

### T3 — S2: upload intents + resumable upload + reconciliation (needs T1 for job ids)
- NEW `lib/upload-intents.mjs`: upload_intents table (dedupe_key channel:slot_date:kind:slotIdx, status machine, session_uri column marked SECRET — never logged), INSERT-as-mutex, resolve-or-skip contract, slot-produced state write.
- The 3 lanes (yt-daily.mjs, yt-deepdive.mjs, longvideo/shorts-clips.mjs): replace one-shot videos.insert with explicit initiate → capture Location → persist → PUT → videoId-on-201; crash recovery probes the session URI (404 → title-dedupe fallback); resolution = slot produced → skip production, never bare proceed.
- Nightly reconciliation workflow (uploads-playlist diff; orphans noted-not-backfilled; idempotent — no repeat warning rows) + quota-model wiring (D24: the pipeline gate loads youtube_quota_models/#104 default).
- Files: lib/upload-intents.mjs, yt-daily.mjs, yt-deepdive.mjs, longvideo/shorts-clips.mjs (upload sites ONLY — coordinate: land after T2's pipeline commit or rebase), tests/upload-intents.test.mjs, .github/workflows/upload-reconcile.yml.

### T4 — S3: warnings store + emitters + parking (parallel-safe from day one)
- NEW `lib/warnings-store.mjs`: warnings table (severity ladder §4.1-4.3, hard-block list = verified technical constraints ONLY, acknowledge/resolve audit fields, dedupe idempotency — same orphan never re-rows nightly).
- Emitters at the existing alert sites (verify-run, token failures, preflight) with the emitter→severity constraint (publishing-path only may block).
- Parking: channel-pipeline checks open Blocking first; parked runs still execute the 1-unit probes (token refresh + channels.list) before exiting; nightly probe job re-tests parked channels; auto-resolve on probe pass.
- Files: lib/warnings-store.mjs, channel-pipeline.mjs (park-check block ONLY — coordinate with T2, land after), tests/warnings-store.test.mjs, .github/workflows/warning-probe.yml. /warnings dashboard ships with T5's Studio batch.

### T5 — S4: review queue (needs T1 jobs + T3 intents + T4 warnings table)
- scripts/script_sources/script_claims tables (D14: full structured render input persisted pre-render; video_id written back by the upload sites).
- Pipeline gate (D17): template-membership-driven; unreadable state = HOLD via last-known-assignment cache; approval window (slot publishAt else end-of-day; timeout = slot skipped + warning row; retain-and-resume).
- Studio: /review page (script↔sources side-by-side, claim links, flagged-claims panel, dedupe verdict evidence, disclosure checklist in official wording), /api/review approve/reject (owner-only; dispatch via the /api/action pattern with resume=<job_id>), publishAt recompute, thumbnail post-upload swap (candidate 1 auto-set; pick replaces before publishAt; panel-wired N).
- /warnings Studio surface (S3's dashboard: severity rows, official quotes, acknowledge + resolve, parked badges).
- Files: lib/script-store.mjs, channel-pipeline.mjs (gate block), studio/app/review/*, studio/app/api/review/*, studio/app/warnings/*, studio/app/api/warnings/*, tests/*.

### T6 — S5: analytics snapshots + dashboards (parallel-safe from day one)
- NEW `.github/workflows/analytics-nightly.yml`: per-channel scope probe (yt-analytics.readonly; scope-less = Warning skip, never Blocking), trailing-window collection (D-1..D-4) with UPSERT UNIQUE(channel_id,date,source), analytics_api wins, per_video jsonb bounded, retention 90d-then-weekly rollup (D25).
- Studio: channel leaderboard + template/topic win rates (published-only denominator; reads snapshots, not live calls; "data through <date>" stamps); owner re-auth checklist page for scope-less channels.
- Files: lib/analytics-store.mjs, .github/workflows/analytics-nightly.yml, studio/app/analytics/*, studio/app/api/analytics/*, tests/analytics-store.test.mjs.

### T7 — S6: sessions admin surface (small; post-T1 anytime)
- Owner-only all-sessions view + per-session revoke (revokeAllForEmail primitive exists; add revoke-by-id), nightly cleanup of expired/revoked rows >30d, Drill-2 support.
- Files: studio/app/sessions/* (extend), studio/app/api/sessions/*, studio/lib/session-db.js (one query), tests.

### T8 — QA execution + the three exit-gate drills (last)
- Run qa/phase4-…-qa.md row by row with evidence; the 3 drills: kill-a-worker (kill mid-render, restart, resume at render), revoked-token (Blocking warning → park → probe/re-auth → unpark), medical-claim (disposable test template authored + assigned + rolled back; claim cannot reach scheduling without owner approval). Each drill with cleanup steps.

## Batching

- **Batch A (now, parallel, disjoint):** T0 (qa file) ∥ T1 (job+artifact store) ∥ T4 (warnings store) ∥ T6 (analytics) ∥ T7 (sessions)
- **Batch B (after T1):** T2 (pipeline instrumentation) → then T3 (upload intents; rebases on T2)
- **Batch C (after T1+T3+T4):** T5 (review queue — the heart)
- **Batch D:** T8 (QA execution + drills)

Reviewer per task (fresh), scoped re-reviews per fix round. Owner actions needed mid-build: BLOB_READ_WRITE_TOKEN secret (Vercel dashboard → project Blob store → add to repo secrets) before any live Blob proof; re-auth checklist sign-off for scope-less channels (T6).

## Exit gate

qa file green + the three drills pass + Studio surfaces reviewed by the owner in the browser (providers-style QA tour).
