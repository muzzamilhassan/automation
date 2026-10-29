# Phase 4 Spec — Pipeline Hardening + Admin Completeness (v1)

Status: **v2 — all 7 owner questions answered (2026-10-30, see Resolved Decisions); pending spec review passes before approval. Supersedes nothing.** Per master plan `docs/superpowers/plans/2026-10-25-platform-own30-master.md` Phase 4 (§3, lines 150–158) and the §1.2 admin-panel flows table (lines 68–83). Ground truth verified against the repo on 2026-10-30; every file/table/endpoint named below exists today unless marked NEW. One master-plan conflict found (slice 6 — sessions already exist; owner-confirmed shrink, OQ-1).

## Problem Statement

Six things hurt today:

1. **Duplicate uploads are one crash away.** YouTube's `videos.insert` has no idempotency key (platform-youtube-api-oauth research row 3): if a job dies between YouTube accepting the upload and the state file being written, the video exists but the system doesn't know it — the next run can make it again. This already happened: the old cron caused 8 duplicate longform uploads; "First $10,000" published 4×, "Stop Begging For Respect" 3× (`research/project-full-audit-2026-10-09.md` §2.3). Today's defenses are title-fuzzy gates (`lib/dup-gate.mjs`) and an artifactId ledger for the weekly longform lane — neither survives that crash.
2. **A run has no memory of itself.** `channel-pipeline.mjs` runs each step as a child process and keeps no structured record — the code says so itself (line 160: "the pipeline keeps no structured run record of its own"). A job killed mid-render restarts from zero next day, re-spending research + script + TTS money on steps that already succeeded.
3. **Warnings are lost in push notifications.** Everything alarming — dead tokens, quota gate, failed verification, blocked preflight — is an ntfy push (`lib/ntfy-alert.mjs`, plus inline fetches in `channel-pipeline.mjs`). If you miss the phone notification, the event never existed. The policy research (`research/platform-youtube-policy-compliance-2026-10-24.md` §4) defines a 5-severity ladder and a hard-block list; nothing implements it.
4. **Nothing a human reviews before upload.** Scripts go research → generate → render → upload with no person in the loop. Finance templates already declare `review_required: ['finance']` (`studio/lib/template-registry.data.js`) and Phase 3 enforces a fail-closed dedupe gate for them — but there is no place to actually READ a script, see its claims against its sources, or answer a disclosure checklist. The script JSON doesn't even carry sources/claims today (`youtube-engine.mjs:829` returns hook/points/closing only).
5. **No analytics loop.** `/api/analytics` (`studio/app/api/analytics/route.js`) pulls a live 28-day window with a 1-hour cache and stores nothing; the Daily Excel (`daily-excel-report.mjs`) lands in git (`state/report-stats.json`, `logs/posts-log.json`). Snapshots are never persisted, so there is no channel leaderboard, no template/topic win rates, and no data for the Phase 6 keep/kill review.
6. **Session revocation is close but not complete.** The opaque `sessions` table with instant revocation already exists (`studio/lib/session-db.js`, the Oct-09 A1 hardening) — but only self-service: a user can sign out their own devices. The owner cannot revoke someone else's session from the admin panel.

## Solution

Six slices. Each gets one paragraph here, decisions (D) and acceptance criteria (AC) below.

**S1 — State machine + artifact store.** Every channel run becomes a recorded job with one row per step (research, script, TTS, render, upload, verify…), and every file a step produces is indexed by a fingerprint of its contents — like a library where each book is shelved under its own fingerprint, so a finished step is provably finished and never redone. A killed job re-enters at the failed step instead of starting over.

**S2 — Upload intent + orphan reconciliation.** Before touching YouTube, every upload writes a note: "I am about to upload X for channel C, slot date D." The resumable upload's session URI — the parking ticket for a half-finished upload — is saved on that note. If a run dies after YouTube accepted the video but before the system recorded it, the next run finds the note, checks YouTube's uploads playlist, and claims the existing video instead of uploading again. A nightly diff of playlist vs. ledger catches anything that slips through. This kills the duplicate-upload class at the root.

**S3 — Warnings table + dashboard.** Every alert the pipeline fires today also lands in a Neon `warnings` table with the policy research's 5 severities, the verbatim official quote + link, the evidence, and a last-checked date. A new Studio page lists open warnings per channel, with acknowledge. The policy file's hard-block list (verified technical constraints only) makes the pipeline PARK a channel: an open Blocking warning (e.g. revoked token) skips that channel's production runs until the condition clears. ntfy stays as the push channel — the dashboard is the durable record.

**S4 — Review queue.** Scripts gain a structured record: full text, `sources[]`, `claims[]` (which claim cites which source), and disclosure flags. A new Studio page shows script and sources side-by-side with claim↔source links, a flagged-claims panel, and the Phase 3 dedupe verdict. Where the template's `review_required` marks the content class (finance today; medical and disclosure added), the pipeline is fail-closed: the script waits for owner approval before render/upload, and approval includes the synthetic-media disclosure checklist in YouTube's official wording. Thumbnails produce N candidates for the owner to pick on videos whose admin-panel config enables picking.

**S5 — Analytics ingestion.** A nightly GitHub Actions job writes one `analytics_snapshots` row per channel per day (Data API `videos.batchGetStats` + Analytics API reports — the same scopes the live `/api/analytics` panel already uses). Studio grows a channel leaderboard and template/topic win rates computed from snapshots, every view stamped "data through \<date\>" because Analytics numbers settle 48–72 hours late.

**S6 — Roles hardening (shrunk — owner-confirmed, OQ-1).** The sessions table exists. What's added: an owner-only view of ALL active sessions with per-session revoke (instant sign-out for any device), and cleanup of expired rows. Client role stays dormant.

## User Stories

1. As the owner, when a render job is killed mid-run, I want to re-run it and have it resume at the render step, so I never pay twice for research/script/TTS that already succeeded.
2. As the owner, I want every upload pre-recorded as an intent and reconciled against the channel's uploads playlist, so a crash can never again publish the same video twice.
3. As the owner, I want every alert stored in one dashboard with severity and the official policy quote, so a warning I missed on my phone still exists when I open the laptop.
4. As the owner, I want a channel with a revoked token automatically parked with a Blocking warning, so a dead channel can't silently burn quota or, worse, keep "succeeding" while publishing nothing.
5. As the owner, I want to read a finance/medical script next to its sources before it can upload, so a fabricated or unsourced claim never reaches my channel under my name.
6. As the owner, I want the AI-disclosure checklist presented in YouTube's official wording before I approve a script with realistic synthetic visuals, so the upload sets disclosure flags correctly the first time.
7. As the owner, I want 3 thumbnail candidates per video the admin panel configures for picking, and one click to pick, so thumbnails stop being a take-it-or-leave-it single render.
8. As the owner, I want a nightly snapshot of every channel's numbers and a leaderboard, so I can see at a glance which channels earn their render minutes (the Phase 6 keep/kill decision).
9. As the owner, I want per-template and per-topic win rates, so catalog decisions in Phase 5 come from data, not vibes.
10. As staff, I want to see the warnings dashboard and prepare script reviews, so day-to-day monitoring doesn't wait on the owner — while fail-closed approvals stay owner-only (owner-confirmed, OQ-5).
11. As the owner, I want to revoke any team member's session from the admin panel the moment they leave, so access ends in seconds, not in 30 days.
12. (Dormant) The client role gains nothing in Phase 4 — no SaaS work (scope pivot: own-portfolio-30).

## Implementation Decisions

### S1 — State machine + artifact store

- **D1 — Three NEW Neon tables: `jobs`, `job_steps`, `job_artifacts`.** `jobs`: id, channel_id, kind (shorts|doc|clips|pipeline), trigger (cron|dispatch|resume|studio), status (running|succeeded|failed|partial), resumed_from_job_id, started/finished_at. `job_steps`: job_id, step name, seq, status (pending|running|succeeded|failed|skipped), error class, started/finished_at. `job_artifacts`: job_id, step, content_hash (sha256 of bytes), kind (render|thumb|audio|doc-episode), location pointer. Schema ensured idempotent at first write, same pattern as `usage_events` (`lib/ai-adapter.mjs:355` `makeUsageWriter` — the existing "ensure-schema-on-write" house pattern). The job id flows into `usage_events.job_id` (already a TEXT column — `lib/ai-adapter.mjs:388`) so cost rows join to runs. Writer: NEW `lib/job-store.mjs` (repo-root lib, Node, callable from the pipeline and from child scripts).
- **D2 — Instrumentation point is `channel-pipeline.mjs`, not the workflows.** The pipeline already defines the step list (preflight → shorts → brain-embed → verify → episode → staging) and the independence semantics ("each step is independent: if one fails, the rest continue", line 6; "Always exit 0", line 359). Steps register with the job store; the always-exit-0 + log-everything behavior is pinned as a regression (AC-P4-5). Child scripts (yt-daily, yt-deepdive) report step completion via argv/env callback convention so the store records sub-steps where cheap (script, tts, render inside yt-daily) — sub-steps are best-effort, never fatal.
- **D3 — Artifacts are indexed by content hash; bytes live in Vercel Blob (owner decision, OQ-2).** Renders already get archived to GitHub Release assets (`yt-daily.mjs:319` `archiveUpload`); intermediates live in the ephemeral GHA workspace and `fb-outbox/`. Phase 4 ships the index (hash + location) AND persists step bytes to **Vercel Blob** (free tier) — the owner ruled out paid services (R2 dropped, master-plan Phase 6 slice 4 storage plan replaced). WHERE a blob write fails, the run records an index-only entry + one warning row and proceeds — storage failure never blocks a render (fail-open, same family as AC-P4-5).
- **D4 — Resume = re-enter at first non-succeeded step, trusting hashes.** A re-dispatch with `--resume <job_id>` (workflow_dispatch input on `channel-autopilot.yml`, which already takes `channel` + `topup` inputs) creates a new job row with `resumed_from_job_id`, skips steps whose artifact hash is already in the index for the same channel+date+kind, and starts at the first failed/pending one. Acceptance: the kill-a-worker drill (AC-P4-4).

### S2 — Upload intent + orphan reconciliation

- **D5 — NEW Neon table `upload_intents`, written BEFORE any `videos.insert`.** Columns: id, channel_id, slot_date, kind (short|doc|clip|longform), dedupe_key (UNIQUE — `channel_id:slot_date:kind`, per architecture research line 110), title, status (initiated|session_open|uploaded|recorded|abandoned), session_uri, video_id, job_id, created/updated_at. Analogy: the note you leave on the counter before carrying groceries in one trip — if you drop something, the note says what was in flight. The four upload sites to instrument: `yt-daily.mjs:297`, `yt-deepdive.mjs:362`, `longvideo/shorts-clips.mjs:345`, `longvideo/longform-upload.mjs:231`.
- **D6 — Explicit two-step resumable upload so the session URI is ours to keep.** Today the googleapis client's `videos.insert` hides the resumable session URI; the research names it "the de facto idempotency token" (platform-youtube-api-oauth §4, line 209). The daily lanes (yt-daily, yt-deepdive, shorts-clips) switch to: POST initiate → capture `Location` header → write it on the intent row → PUT bytes → persist videoId on 201. On crash, recovery probes the session URI (`bytes */N` pattern, research line 98) before ever initiating a second upload. `longform-upload.mjs` keeps its artifactId ledger (it already proves "this artifact was uploaded") and gains the intent row + playlist reconciliation. **(Owner-confirmed, OQ-3.)**
- **D7 — Orphan reconciliation, two layers.** (a) Run-start: before producing, the lane checks open intents for today; any intent without a videoId is resolved first (probe session URI → lookup by dedupe title via `videos.list` → record or abandon). (b) Nightly: a reconciliation job diffs each active channel's uploads playlist against `upload_intents` + state files (`yt-mcp/state/<slug>.json` `lastVideos`) and reports, as a Warning-severity row + ntfy: videos YouTube has that the ledger doesn't (orphans — recorded automatically with a note), and ledger entries YouTube doesn't have (ghosts — marked abandoned). This is the audit §2.3 killer: the class required BOTH a blind re-upload and no reconciliation; neither survives.
- **D8 — Upload behavior change is deliberately minimal.** Privacy (private + `publishAt`), thumbnails.set, pinned comment, verify-run — all continue exactly as today (pinned by AC-P4-10). The intent row and session-URI capture wrap the same upload; they do not change scheduling semantics.

### S3 — Warnings table + dashboard

- **D9 — NEW Neon table `warnings`, fields per policy research §4.2.** severity (Blocking | Action-required | Warning | Advisory | Informational — the §4.1 ladder), classification, title, explanation (plain English), policy_url + policy_quote + quote_fetched_at (official sources only, never a blog), evidence (verbatim API error / field values), auto_verifiable bool, recommended_action, blocks_publishing bool (TRUE only for Blocking), state (open | acknowledged | resolved), channel_id, job_id nullable, last_checked_at, acknowledged_by/at, resolved_at. Emitters: NEW `lib/warnings.mjs` (Node) with write-and-alert — every existing alert site also writes a row: dead channel key (`channel-pipeline.mjs:62`), quota gate (`lib/quota-ledger.mjs` path), verify-run failure (`verify-run.mjs:27`), template preflight block/warning (`channel-pipeline.mjs:140-158`), S1 job step failures.
- **D10 — Hard-block list is the policy file's, verbatim (§4.3).** blocks_publishing=TRUE only for verified technical constraints: 401 revoked/expired token (`insufficientPermissions`, `youtubeSignupRequired`), 403 `quotaExceeded`, 400 `uploadLimitExceeded`, `uploadStatus=rejected`, `authenticatedUserAccountSuspended`/`channelClosed`, `longUploadsStatus=disallowed` for >15-min renders, thumbnails.set 403 when a custom thumbnail is required. **Never block on policy heuristics** — inauthentic-content risk, disclosure gaps, YPP uncertainty stay Advisory/Warning with citation. This is a developer-policy duty (don't present our judgment as YouTube's), not just a design preference.
- **D11 — Parking semantics.** WHILE a Blocking warning is open for a channel, the channel is parked: `channel-pipeline.mjs` checks open Blocking warnings first and exits that channel's run early with one log line + one ntfy. Other channels unaffected. Auto-verifiable Blocking warnings resolve when the underlying check passes (a successful token use clears a revoked-token warning); the parked channel resumes on its next scheduled run. Acknowledge records "seen" (by/at) but never unblocks by itself — a revoked token is not un-revoked by acknowledging it. **(Owner-confirmed: auto-park on Blocking only, OQ-6.)**
- **D12 — NEW Studio surface: `/warnings` page + `/api/warnings` (owner+staff), nav item under System (`studio/components/shell/nav.js`).** List open warnings newest-first, group by channel, severity chip, official quote + link + fetch date, evidence, last-checked, acknowledge button, resolved history below. The existing `/api/sessions` + `/api/users` role pattern (`studio/lib/route-auth.js` `requireRole`) is the gate template.

### S4 — Review queue

- **D13 — Script contract extension: `sources[]` and `claims[]` become real.** Today's script shape is hook/points/closing only (`youtube-engine.mjs:829`); the target contract is topic-discovery research §4.1: `sources[] { id, url, title, publisher, access_date, quote_or_note }`, `claims[] { id, text, source_ids[], status: unverified|verified|conflicting|flagged }`, `disclosure { synthetic_media_required, reason, categories[] }`. Phase 4 adds these as generator output fields (prompt asks for them; validator tolerates absence for legacy templates — old shape keeps working). Claims are LLM-self-flagged with source sufficiency checks — this is triage, not fact-checking (Honest Limits).
- **D14 — NEW Neon tables `scripts`, `script_sources`, `script_claims`** (master plan §2 names). Persisted at generation time, BEFORE render, linked to job_id + channel + template id + dedupe verdict id (`dedupe_verdicts` from Phase 3 — `services/ai/brain/store.py:123`; the Phase 3 spec's out-of-scope note says this table was designed for the review queue's query pattern). `script_memory` stays the embedding corpus (Phase 3 D3: the corpus of record for script TEXT); `scripts` is the record of record for review STATE. The two join at video_id at publish.
- **D15 — Fail-closed classes come from template DATA (no-static-maps).** The vocabulary of `safety.review_required` (`studio/lib/template-registry.data.js` — currently `[]` or `['finance']`) extends to `'medical'` and `'disclosure'`. A script enters the fail-closed path when its risk flags (from claims status + disclosure + template class) intersect the assigned template's `review_required` list — assignment resolved via `channel_template_assignments` (`studio/lib/template-registry-db.js`). No channel names, no niche maps in code.
- **D16 — NEW Studio surface: `/review` page + `/api/review` routes (owner approves; staff read — owner-confirmed, OQ-5).** Layout per topic-discovery research §6: script text left, `sources[]` right, claim↔source links highlighted; flagged-claims panel (every non-verified claim: status + why + accept/edit/drop); the Phase 3 dedupe verdict (verdict, top match, score) shown as evidence; final checklist — sources verified, disclosure answered, copyright cleared. WHERE disclosure is required, the checklist presents the four official synthetic-media disclosure categories verbatim from `support.google.com/youtube/answer/14328491` (research §5.7) and approval is impossible until each is answered.
- **D17 — Fail-closed gating in the pipeline.** After generation, a review-gated script stops before render: status awaiting_review, one Action-required ntfy, slot held. Owner approves → run resumes at render (via S1 resume, step = render). Owner rejects → script never uploads; the slot takes the lane's existing terminal (Shorts slot skipped; doc exits for retry next doc day — same terminals Phase 3 D5 pinned). IF the approval window passes without action THEN the slot is skipped for the day (a missing video is free — the 09-18 recycle-removal rule) and a warning row records the timeout. Simulated drill: AC-P4-Drill-3.
- **D18 — Thumbnail N-candidate pick, wired from the admin panel (owner decision, OQ-4).** Thumbnail v2 infrastructure exists (`studio/lib/thumb-templates-v2.js`, the 30-JSON template pattern, `/thumbs` pages). WHERE the admin-panel config enables picking for a channel/template (registry/kit DATA — no-static-maps respected), its renders produce N=3 candidates (count from template DATA), stored via the S1 artifact index; the review page shows them; the owner's pick is the one `thumbnails.set` uploads. WHERE picking is not enabled, today's single auto-candidate continues unchanged (pinned by AC-P4-23). Launch default config: review-gated templates have picking ON (daily throughput stays human-scale); the owner flips any channel from the panel — no code change (the no-static-maps rule).

### S5 — Analytics ingestion

- **D19 — NEW Neon table `analytics_snapshots`** (master plan §2 shape): channel_id, date, views, engaged_views, watch_minutes, subs_delta, impressions nullable, ctr nullable, per-video stats jsonb, source (data_api|analytics_api), collected_at. Writer: NEW `lib/analytics-collect.mjs` + NEW `analytics-nightly.yml` workflow (pattern: `reporting-daily.yml` — 16:45 UTC slot, per-channel `YT_TOKEN_<SLUG>` secrets, token resolution via the existing `accessToken()` approach in `studio/app/api/analytics/route.js`). Data side: `videos.batchGetStats` (1 unit, own bucket — API research line 72) for per-video numbers + Analytics API v2 reports (channel/day metrics — the exact calls the live panel already makes). Idempotent by (channel_id, date, source): re-run updates in place, never duplicates.
- **D20 — Leaderboard + win rates read snapshots, not live calls.** `/api/analytics` (live, 1h cache) stays for the 28-day panel; NEW snapshot-backed endpoints serve: channel leaderboard (7/28/90-day windows), template win rates (join snapshots × `scripts.template_id` × `channel_template_assignments`), topic win rates (join via script record). Views across the network with one query — no 30-channel live-pull storm.
- **D21 — Lag stamps are mandatory UI.** Analytics numbers settle 48–72 hours late; every snapshot-backed view displays "data through \<date\>" and never presents the trailing 2–3 days as final. Win rates exclude videos younger than 7 days (too unsettled to rank).

### S6 — Roles hardening

- **D22 — What exists (verified):** `sessions` table (token_hash, email, role, revoked, expires_at, last_used — `studio/db-setup.mjs:72`, `studio/lib/session-db.js`), instant revocation on every request (`route-auth.js` → `userByToken`), self-service list + sign-out-everywhere (`studio/app/api/sessions/route.js`), brute-force throttle (`login_attempts`), Edge proxy route→role matrix (`studio/proxy.js`). **Master-plan conflict:** slice 6 reads as if the table must be built; it shipped Oct-09 (A1 hardening). **(Owner-confirmed: shrink, OQ-1.)**
- **D23 — What's NEW:** (a) owner-only all-sessions view + per-session revoke (`/api/sessions` gains owner-mode list across users + revoke-by-id; `revokeAllForEmail` already exists as the primitive); (b) cleanup pass deleting expired/revoked rows older than 30 days (same nightly family as D7/D19); (c) the drills (AC-P4-Drill-2 exercises revocation end-to-end). Client role untouched; no RLS, no tenant work (scope pivot).

## Testing Decisions

- Unit: job-store schema ensure + step transitions; artifact hash idempotency; intent-row lifecycle (initiated→session_open→uploaded→recorded); session-URI probe mock (crash simulation: 201 received, state write lost → reconciliation records, never re-uploads); warnings severity/blocking classification per §4.1/§4.3 (a `quotaExceeded` string must classify Blocking; an inauthentic-content heuristic must NEVER classify Blocking); review gating truth table (review_required × risk flags × approval states); analytics snapshot idempotency by (channel, date, source); win-rate joins on fixtures.
- Integration: one CI job running the pipeline against a disposable Neon branch with a fake-YouTube mode (mock `videos.insert` succeeding then the process dying before the state write).
- Live drills: the three exit-gate drills below, executed against one pilot channel with quoted output in the QA file.
- No live Neon or live YouTube in unit CI (house pattern — Phase 2/3 test suites).

## Honest Limits

- **Analytics are late by design.** 48–72h settlement means "yesterday" is never final; win rates need ~2 weeks of snapshots before they mean anything. Phase 4 ships the pipeline; the insight matures in Phase 5/6.
- **No historical backfill.** Snapshots start the first night they run. There is no replaying 2025 — the Analytics API only serves what YouTube still serves.
- **The review queue triages; it does not fact-check.** Claim statuses are generator-self-flagged + source-sufficiency heuristics. No external fact-check API (topic-discovery research §5 defers Copyleaks et al.). The owner's eyes remain the real gate.
- **Artifact BYTES stay ephemeral in Phase 4.** The index proves what happened; only GitHub Release finals persist. A killed intermediate (e.g. a half-done render) is re-rendered, not resumed byte-wise — resume is at STEP granularity, not byte granularity.
- **ntfy stays.** The dashboard is the record; the phone push stays the bell. Nothing in Phase 4 replaces ntfy.
- **Client role stays dormant.** No tenant surfaces, no RLS, no client-facing review UI.
- **Warnings are pipeline-verifiable facts only.** Strike counts, monetization status, inauthentic-content review outcomes are Studio/email-only on YouTube's side (policy research §3.1) — the dashboard will never show them and must not pretend to.
- **Daily Excel stays.** `daily-excel-report.mjs` + git-committed stats continue unchanged; snapshots supplement, not replace (AC-P4-28).

## Out of Scope

Cloud Run render migration, composites archive consolidation on Vercel Blob + `asset_registry` (Phase 6; R2 dropped per owner's no-paid-services ruling, OQ-2); 30+ catalog authoring (Phase 5); search-bucket discipline automation (Phase 6); corpus chat UI; multi-tenant anything; YouTube quota-audit application; SaaS billing/plans; auto-approve of low-risk scripts ("tenant opt-in auto-schedule" from the research — an owner decision for a later phase).

## Acceptance Criteria (EARS)

### S1 — State machine + artifacts

- AC-P4-1: WHEN a channel pipeline run starts, the system shall create one `jobs` row and one `job_steps` row per planned step, with channel, kind, trigger, and started_at.
- AC-P4-2: WHEN a step finishes (any outcome), the system shall update that step's status (succeeded|failed|skipped) and, for produced files, write one `job_artifacts` row with the content hash and location — the same file re-produced later yields the SAME hash and no duplicate artifact row.
- AC-P4-3: WHEN a step fails, the job row shall record failed-at-step and the pipeline SHALL CONTINUE TO run the remaining independent steps and exit 0 (today's semantics, unchanged).
- AC-P4-4: WHEN a job is re-dispatched with `--resume` after a failed or killed run, the system shall skip steps whose artifact hash is already indexed for the same channel+date+kind and re-enter at the first failed/pending step — killed mid-render means TTS and script are NOT regenerated.
- AC-P4-5: IF the Neon connection is unavailable, THEN the pipeline SHALL CONTINUE TO run exactly as today (log-only, no job rows) with one warning — a dead database can never darken production.

### S2 — Upload intents + orphans

- AC-P4-6: WHEN any upload lane is about to upload, the system shall first persist one `upload_intents` row with a dedupe key unique per channel+slot_date+kind — two uploads of the same slot in one day is an unrepresentable state.
- AC-P4-7: WHEN the resumable upload session opens, the system shall persist the session URI on the intent row BEFORE the first byte is sent, and shall persist the returned videoId on the same row when the upload is accepted.
- AC-P4-8: WHEN a run starts and an open intent exists from a previous crashed run, the system shall resolve it first (probe the session URI, else look the dedupe title up on YouTube) and record the existing video WITHOUT uploading again.
- AC-P4-9: WHEN the nightly reconciliation runs, the system shall diff each active channel's uploads playlist against intents + state and produce: orphans (YouTube has it, ledger didn't — recorded with a note) and ghosts (ledger has it, YouTube doesn't — marked abandoned), each surfaced as a Warning-severity row + one ntfy.
- AC-P4-10: WHEN uploads succeed normally, the system SHALL CONTINUE TO behave exactly as today — private upload with publishAt, thumbnail set, verify-run proof, state writes — with no scheduling-semantics change.

### S3 — Warnings

- AC-P4-11: WHEN any existing alert site fires (dead channel key, quota budget reached, verify-run failure, template preflight block, failed job step), the system shall write one `warnings` row (severity, evidence, policy citation where one exists) AND send the existing ntfy alert — the push never disappears.
- AC-P4-12: WHEN a condition on the policy §4.3 hard-block list is detected, the system shall set blocks_publishing=TRUE; WHEN a policy heuristic (e.g. template-similarity risk, disclosure gap) is detected, the system shall record severity Warning or Advisory and blocks_publishing=FALSE — heuristics can never block.
- AC-P4-13: WHILE a Blocking warning is open for a channel, the system shall skip that channel's production runs (parked), logging + alerting once per park event; other channels run unaffected.
- AC-P4-14: WHEN the underlying check of an auto-verifiable warning passes again, the system shall resolve the warning automatically and the parked channel resumes at its next scheduled run.
- AC-P4-15: WHEN the owner acknowledges a warning, the system shall record who and when; acknowledging a Blocking warning SHALL NOT unpark the channel — only the condition clearing does.
- AC-P4-16: WHEN the owner opens /warnings, the system shall list open warnings grouped by channel with severity, official quote + source link + fetch date, evidence, and last-checked; IF there are none, THEN an explicit empty state.

### S4 — Review queue

- AC-P4-17: WHEN a script is generated, the system shall persist it (text, sources[], claims[], disclosure flags, template, job) BEFORE any render starts.
- AC-P4-18: WHEN the assigned template's `review_required` intersects the script's risk classes (finance | medical | disclosure), the system shall hold the script at awaiting_review and SHALL NOT render, upload, or schedule it until an approval row exists.
- AC-P4-19: IF a held script passes its scheduling window without approval, THEN the system shall skip the slot for that day (fail-closed) and record one Action-required warning — no video is never a wrong video.
- AC-P4-20: WHEN the reviewer opens a script, the system shall show script text and sources side-by-side with claim↔source links, a flagged-claims panel (every non-verified claim), and the Phase 3 dedupe verdict where one exists.
- AC-P4-21: WHERE disclosure is required, the system SHALL require every item of the four-category synthetic-media checklist (official wording, `support.google.com/youtube/answer/14328491`) to be answered before approval is possible.
- AC-P4-22: WHEN the owner approves, the run resumes at render (S1 resume); WHEN the owner rejects, the script never uploads and the slot takes the lane's existing terminal.
- AC-P4-23: WHERE the admin-panel config enables thumbnail picking for the video's channel/template, the system shall produce 3 thumbnail candidates (template-data count) and upload only the picked one; WHERE picking is not enabled, the system SHALL CONTINUE TO auto-use today's single candidate with zero interaction.

### S5 — Analytics

- AC-P4-24: WHEN the nightly analytics job runs, the system shall write one `analytics_snapshots` row per active channel per day (views, watch minutes, subs delta, per-video stats; source + collected_at stamped) and a re-run for the same channel+date shall update in place, never duplicate.
- AC-P4-25: WHEN any snapshot-backed view renders, the system shall display "data through \<date\>" and exclude the trailing unsettled window (48–72h) from rankings; win rates exclude videos younger than 7 days.
- AC-P4-26: WHEN the owner opens the leaderboard, the system shall rank channels over a selectable window (7/28/90 days) from snapshots with zero live API calls.
- AC-P4-27: WHEN a published video has a template assignment, its snapshot performance shall roll into per-template and per-topic win rates visible in Studio.
- AC-P4-28: The system SHALL CONTINUE TO produce the Daily Excel report, commit `state/`+`logs/` history, and serve the live 28-day /api/analytics panel exactly as today.

### S6 — Sessions

- AC-P4-29: WHEN the owner revokes another user's session from the admin view, that user's next request shall be unauthenticated (redirect to login) — instant, not at cookie expiry.
- AC-P4-30: WHEN the cleanup pass runs, the system shall delete sessions that are expired or revoked for more than 30 days.
- AC-P4-31: The system SHALL CONTINUE TO support self-service device list + sign-out-everywhere and the proxy route→role matrix unchanged.

### Exit-gate drills (master plan line 158 — each closes Phase 4 with quoted evidence)

- AC-P4-Drill-1 (kill-a-worker): WHEN a pipeline job is cancelled during the render step and then re-dispatched with resume, the system shall re-enter at render with script+TTS steps marked succeeded from the first attempt — no second research/script/TTS spend, and the job history shows the parent/child link.
- AC-P4-Drill-2 (revoked token): WHEN a channel's token is revoked (simulated 401 `insufficientPermissions`), the system shall write one Blocking warning carrying the verbatim error, park the channel on its next run, and auto-resolve + unpark after the token is replaced and a check passes.
- AC-P4-Drill-3 (medical claim): WHEN a script for a template whose `review_required` includes 'medical' contains an unverified claim, the system shall hold it in the review queue and no render/upload/schedule shall occur until owner approval; a rejected script shall never upload.

## Resolved Decisions (owner answers, 2026-10-30)

| # | Question | Owner answer |
|---|---|---|
| OQ-1 | Shrink slice 6 (sessions half-exist)? | **Default: YES — shrink** to all-sessions view + per-session revoke + cleanup + drill |
| OQ-2 | Artifact bytes storage | **No paid services — Vercel Blob** (free tier), replacing the R2/Phase-6 storage plan; see D3 |
| OQ-3 | Explicit two-step resumable upload for the three daily lanes | **Default: YES** — see D6 |
| OQ-4 | Thumbnail pick coverage | **Wired from the admin panel** — per-channel/template config set in the panel; launch default: review-gated templates ON; see D18 |
| OQ-5 | Who approves fail-closed scripts | **Default: owner-only** (staff read + prepare) |
| OQ-6 | Auto-park on Blocking warnings | **Default: YES — Blocking only** |
| OQ-7 | Win-rate denominator | **Default: published videos only** (attempts visible in job history) |

## Suggested Build Order

Serial spine: **S1 → S2** (intents reference job ids; resume needs the state machine) **→ S4** (review queue needs jobs + resume + the scripts contract).
Parallel-safe from day one: **S5** (independent: new workflow + snapshots + read-only dashboards) and **S3** (warnings table + emitters, then the dashboard once S1's job ids exist — start with the table, add job_id columns nullable).
**S6** is small; slot it anywhere after S1 (uses the same nightly-cleanup pattern).
Every slice ships behind the established flags: pipeline changes gated (like `TEMPLATE_PREFLIGHT_ENABLED`, `channel-pipeline.mjs:101`) with byte-for-byte rollback; Studio changes deploy via `cd studio && vercel --prod`. CI production lanes untouched — new lanes and dispatch inputs only. Detailed task-level plan comes later via the planning skill, per the master plan's per-slice workflow.

---
*Revision history: v1 draft, 2026-10-30 — authored from the master plan (Phase 4, lines 150–158) against verified repo ground truth (all paths/tables/endpoints read, not assumed); known master-plan conflict (slice 6 sessions) flagged as OQ-1. v2, 2026-10-30 — all 7 owner questions answered (OQ-2: Vercel Blob replaces R2, no paid services; OQ-4: thumbnail pick wired from admin panel); D3/D18 rewrites; AC-P4-23 + story 7 + out-of-scope updated; pending spec review passes before approval.*
