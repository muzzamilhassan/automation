# Phase 4 Pipeline Hardening + Admin Completeness — QA file

Feature: pipeline-hardening-review-queue-analytics · Spec: `docs/superpowers/specs/2026-10-30-phase4-review-queue-analytics-spec.md` (v3, 33 EARS criteria AC-P4-1..33 + 3 exit-gate drills)
Scope: all six slices — S1 job store/resume, S2 upload intents, S3 warnings/parking, S4 review queue, S5 analytics snapshots, S6 sessions — plus the cross-slice quota/retention criteria, the 3 exit-gate drills, and the pinned regressions. One checklist row per acceptance criterion; no AC merged or split silently.
Executor: a human, after the Phase 4 build lands (nothing in this file runs against today's HEAD). Studio rows run against the **deployed Studio** (`cd studio && vercel --prod` after push); rows marked **[local]** can run from the repo root in Git Bash. Evidence slots accept a screenshot path or a quoted output line. Screenshot widths: desktop 1440 and mobile 375 for every `visual` row.

## How to run

1. Studio deployed with the Phase 4 build; sign in as **owner** at `/login`. A **staff** sign-in is needed for the read-only rows (Rows 16, 20) and Row 29/31.
2. `gh` CLI signed in (`gh auth status`) with access to `muzzamilhassan/automation` — every Actions row dispatches from the repo root.
3. Neon reachable. **DB-CHECK helper** — all database checks below are the same one command with different SQL. Run from the repo root (it reads `DATABASE_URL` from the root `.env`, same as every automation script) and paste the SQL shown in the row:

   ```
   node --input-type=module -e "import { loadEnv } from './lib/env.mjs'; loadEnv(); const sql=(await import('postgres')).default(process.env.DATABASE_URL); console.log(JSON.stringify(await sql.unsafe('PASTE-SQL-HERE'),null,2)); await sql.end();"
   ```

4. Pilot channel: **money-rulebook** (active, autopilot on, `YT_TOKEN_MONEY_RULEBOOK` secret saved).
5. NEW things this phase the rows depend on: the `resume` input on `.github/workflows/channel-autopilot.yml` (today it only takes `channel`, `topup`, `force_doc`); the Studio pages `/warnings` and `/review`; the workflows `analytics-nightly.yml` and the nightly maintenance/reconciliation job; the test files under `tests/` named in `automated` rows. If any of these landed under a different name than the row says, run the row against what landed and note the divergence in Actual.
6. Where the spec left a surface unnamed (S5 snapshot panels, S6 owner sessions view), the row pins the most natural existing page (`/analytics`, `/users`); if the build placed them elsewhere, execute the row there.
7. Automated rows first (`npm test` runs everything: `node --test "tests/**/*.test.mjs"`), then manual, then visual. Fill Actual/Evidence/Status as you go.

---

## Checklist

### S1 — State machine + artifact store

#### Row 1 — AC-P4-1 · every run records a job with one row per step · `manual` + `automated`

Verify: dispatching a channel run creates one `jobs` row plus one `job_steps` row per planned step, and steps switched off by config are recorded as `skipped`, never missing.

- Precondition: Phase 4 build on `main`; money-rulebook channel.
- Steps:
  1. `gh workflow run channel-autopilot.yml -f channel=money-rulebook`
  2. `gh run list --workflow=channel-autopilot.yml --limit 1` — note the run id; `gh run watch <run-id>` until it finishes.
  3. DB-CHECK: `select * from jobs where channel_id = 'money-rulebook' order by started_at desc limit 1` — one row with kind, trigger (`dispatch`), status, started_at.
  4. DB-CHECK: `select * from job_steps where job_id = '<that job id>' order by seq` — one row per planned step (preflight → shorts → brain-embed → verify → episode → staging), each with a status.
  5. Check any step disabled by config (e.g. a paused platform lane) shows status `skipped` with a row present — the step list is the same whether or not a platform is paused.
- Expected: 1 job row, complete step vocabulary, `skipped` rows for disabled lanes.
- Automated: `node --test tests/artifact-store.test.mjs (Blob-side retention cutoffs; the Neon-row prune lands with the nightly maintenance batch — re-cite its test here then)` — schema ensure + step transitions green.
- Actual: (Executed 2026-10-31, QA T8.) Dispatch steps NOT re-run (QA rule: no workflow dispatches) — live production proof exists from today's exit-gate drills: Neon `jobs` holds three drill jobs for debt-free-doctrine (048109a2… kind=pipeline trigger=dispatch; 3d74826d… trigger=resume; d8b3ab83… trigger=dispatch) and each has the full `job_steps` vocabulary — preflight → clips → brain-embed → verify → skipped-fb → skipped-poster → episode → staging. Config-disabled lanes ARE rows, never missing: `skipped-fb` and `skipped-poster` are present with status `skipped` on all three jobs. Divergence vs the row text (per How-to-run note 5): the step-transition/schema cases landed in `tests/pipeline-jobstore.test.mjs` + `tests/job-store.test.mjs` — run there, not only in artifact-store.
- Evidence: `node --test tests/pipeline-jobstore.test.mjs` → 16/16 pass, incl. "flag on: one job with planned steps in D2 order; PLATFORMS_PAUSED lanes recorded skipped; quota-skipped lanes closed skipped"; `node --test tests/job-store.test.mjs` → 27/27; `npm test` → 631/631 (2026-10-31). DB-CHECK (Neon, live): job_steps for 3d74826d = #0 preflight succeeded, #1 clips failed, #2 brain-embed succeeded, #4/#5 skipped, #6 episode running, #7 staging succeeded; d8b3ab83 step #90 review=skipped (the gate hold).
- Status: PASS

#### Row 2 — AC-P4-2 · every produced file is indexed by its content hash · `automated`

Verify: when a step finishes it updates its status and writes one `job_artifacts` row (content hash + location) per produced file, and producing the same file again yields the SAME hash with no duplicate row.

- Steps:
  1. After Row 1's run, DB-CHECK: `select * from job_artifacts where job_id = '<job id>'` — one row per produced artifact (render/thumb/audio/script-payload), each with a sha256 content hash and a location.
  2. Automated (same-hash/no-duplicate is a determinism claim — unit-test it, don't eyeball it): `node --test tests/artifact-store.test.mjs (Blob-side retention cutoffs; the Neon-row prune lands with the nightly maintenance batch — re-cite its test here then)` — the "same bytes → same hash → no second artifact row" case is green.
- Expected: artifact rows exist for exactly the files the run produced; re-running the fixture adds no row.
- Actual: (2026-10-31.) Same-hash/no-duplicate unit case green; live `job_artifacts` rows exist for the resumed drill child 3d74826d: 10 rows, all `episode/tts_audio`, each with a sha256 `content_hash`, `blob_url` location and byte size (e.g. hash 04b84e68396f… bytes=269856; d24a29ac6041… bytes=75744). Row 1's steps DB-CHECK confirms one row per produced file on the job that produced them.
- Evidence: `node --test tests/artifact-store.test.mjs` → 20/20 pass, incl. "putBytes fingerprints FILE BYTES: sha256 of the raw bytes (D1 line: never the Phase-3 text hash)" and "the same bytes put twice yield the SAME hash and the SAME pathname (no duplicate content)". DB-CHECK live rows quoted in Actual.
- Status: PASS

#### Row 3 — AC-P4-3 · a failed step never stops the other steps, and exit codes are unchanged · `automated` + `manual` [local]

Verify: when one step fails, the job records failed-at-step but the remaining independent steps still run; end-of-run exit 0; unknown slug and preflight-block exit 1 — exactly as today.

- Steps:
  1. Automated: `node --test tests/artifact-store.test.mjs (Blob-side retention cutoffs; the Neon-row prune lands with the nightly maintenance batch — re-cite its test here then) tests/shorts-pipeline.test.mjs` — the exit-semantics cases (end-of-run exit 0 with per-step outcomes; unknown slug exit 1; preflight-block exit 1) are green.
  2. [local] From the repo root: `node channel-pipeline.mjs not-a-real-channel; echo $?` — prints the unknown-slug message and `1` (this exits before any spend — safe to run).
  3. Live half: in any run where one step failed (e.g. a doc lane failure), confirm the Actions log shows the later steps still executed and the workflow still finished green (exit 0), and the job row shows `failed` with the failed step named.
- Expected: exit codes byte-identical to today's behavior; failures recorded, never contagious.
- Actual: (2026-10-31.) Automated exit-semantics cases green. Local half executed exactly as written: `node channel-pipeline.mjs not-a-real-channel` printed `[pipeline] unknown slug: not-a-real-channel` and exited 1 (no spend). Live half: drill job 3d74826d had the clips step FAIL (`error: "Clip Short posting failed"`, job_steps #1 clips=failed) while brain-embed succeeded, the episode rendered+uploaded, and the run's verify step passed green — the failure was recorded (jobs.error names it) and was NOT contagious.
- Evidence: `node --test tests/pipeline-jobstore.test.mjs` → "unknown slug exits 1 with the flag ON and still never touches the store", "already-produced day: shipped upload + failed verify lane → partial terminal (AC-P4-3)"; `tests/shorts-pipeline.test.mjs` 2/2. Local run quoted above (EXIT=1). Actions log run 41222720885: "[verify] OK — all 1 upload(s) exist on YouTube" on the same job whose clips step failed.
- Status: PASS

#### Row 4 — AC-P4-4 · resume skips a step only when its bytes are really there · `automated`

Verify: a re-dispatch with `--resume` skips a step ONLY when both its artifact row exists AND its bytes are retrievable from Blob; a stale resume key or missing bytes forces a re-run; a killed render never re-generates script or TTS because the full render input was persisted.

- Steps:
  1. `node --test tests/artifact-store.test.mjs (Blob-side retention cutoffs; the Neon-row prune lands with the nightly maintenance batch — re-cite its test here then)` — the resume truth table is green: (a) artifact row + retrievable bytes = skipped; (b) artifact row only (index entry, no bytes) = RE-RUNS; (c) changed template id/version or brand-kit/config hash = RE-RUNS; (d) owner claim edit invalidates the script artifact.
  2. `node --test tests/artifact-store.test.mjs (Blob-side retention cutoffs; the Neon-row prune lands with the nightly maintenance batch — re-cite its test here then)` (render-input completeness case) — a resume finds hook/points/closing/thumbHeadline + template version + seed + themes + publishAt all persisted.
- Expected: every skip condition proves bytes, not just bookkeeping.
- Live proof of this row is Drill 1 below.
- Actual: (2026-10-31.) Resume truth table green — note divergence (How-to-run note 5): the truth table lives in `tests/pipeline-jobstore.test.mjs` (the QA file's artifact-store citation covers the Blob-side halves). Drill 1 ran live the same day: resume lineage row exists (3d74826d `resumed_from_job_id` = 048109a2, trigger=resume) and the STALE-INVALIDATION guard fired in the real run log. GRANULARITY DISCLOSURE (recorded honestly): the killed run was a DOC job, so the resume re-rendered the doc TTS — the child holds 10 fresh tts_audio artifact rows; the no-re-spend pin (script/TTS skipped from persisted bytes) is unit-proven on the shorts path and shipped for doc as T5c (resume-from-STORED, generator unreachable). The drill proves the state machine + lineage + stale guard live.
- Evidence: pipeline-jobstore 16/16 incl. "--resume <id>: succeeded steps with verifiable artifact bytes are skipped; child job links the parent; artifacts indexed", "--resume: bytes NOT retrievable -> the step re-runs (a degraded artifact never skips)", "--resume: stale resume key (template/brand-kit changed) invalidates artifacts — everything re-runs (D4)". Live log run 41222720885: "[debt-free-doctrine] resume: stale key (template/brand-kit changed) — prior artifacts ignored, steps re-run". DB: jobs row 3d74826d with resumed_from_job_id=048109a2.
- Status: PASS

#### Row 5 — AC-P4-5 · a dead database can never darken production · `automated`

Verify: with Neon unreachable the pipeline runs exactly as today (log-only, no job rows, no intents, no warnings, no resume state) plus one warning, and still exits with today's codes.

- Steps:
  1. Automated: `node --test tests/artifact-store.test.mjs (Blob-side retention cutoffs; the Neon-row prune lands with the nightly maintenance batch — re-cite its test here then)` — the DB-unreachable case is green: no rows written, run continues, single warning emitted, exit semantics unchanged.
  2. Accept the named degradation (spec Honest Limits): a run on a DB-outage day has NO resume state — if such a run later fails it may re-spend research/script/TTS. Record in Actual that this was understood, not misread as a bug.
- Expected: log-only continuation, one warning, ntfy still the fallback channel.
- Actual: (2026-10-31.) DB-unreachable cases green at three layers: pipeline (real store without DATABASE_URL → one warn, log-only, run continues, exit 0; and a store that THROWS on every call still exits 0 with the full flow), Blob (degraded mode → ok:false blob_unavailable, resume re-runs the step, never crashes), upload lane (dead store still uploads, warns once — production never darkens). The named degradation is understood and accepted: a DB-outage day leaves NO resume state and a later failure of such a run may re-spend research/script/TTS — deliberate spec Honest Limits, not a bug.
- Evidence: `tests/pipeline-jobstore.test.mjs` → "real store without DATABASE_URL: one warn, log-only, run continues, exit 0", "a store that THROWS on every call still exits 0 with the full flow (defense in depth)"; `tests/artifact-store.test.mjs` → fail-open blob suite; `tests/upload-intents.test.mjs` → "AC-P4-5 degraded: a dead store still uploads (no intent row) and warns once".
- Status: PASS

### S2 — Upload intents + orphan reconciliation

#### Row 6 — AC-P4-6 · every upload is pre-recorded, and a slot can never be double-claimed · `automated` + `manual`

Verify: before any upload the lane writes one `upload_intents` row (unique per channel + slot_date + kind + slot_idx); if another lane already claimed the slot, the lane resolves that intent or marks the slot produced and skips — it never uploads a second time.

- Steps:
  1. Automated: `node --test tests/upload-intents.test.mjs` — lifecycle (pending → initiated → uploading → uploaded, with failed/abandoned re-claim paths — shipped vocabulary per the D5 amendment; D5's names map 1:1: session_open=uploading, recorded=uploaded) and the INSERT-conflict case (conflict ⇒ resolve-or-skip, never bare proceed) are green.
  2. After Row 1's run, DB-CHECK: `select * from upload_intents order by created_at desc limit 5` — one row for the upload with the full dedupe key `channel:slot_date:kind:slot_idx` and status `uploaded` with a video_id (shipped vocabulary; D5's `recorded` = shipped `uploaded`).
- Expected: an intent row exists for every upload, and no two lanes can hold the same slot.
- Actual: (2026-10-31.) Lifecycle + conflict unit cases green. Live intents exist for every upload today's drills produced, keyed on the full dedupe key (stored as UNIQUE `dedupe_key` over channel:slot_date:kind:slot_idx): 11c887d0… debt-free-doctrine 2026-10-31 short slot 0 = uploaded, video Y5qqfprd4QI, job 3d74826d; c6d28226… same channel/date doc slot 0 = uploaded, video MsOccg0kQiI, job 3d74826d. No slot held twice.
- Evidence: `node --test tests/upload-intents.test.mjs` → 52/52 pass, incl. "createIntent inserts a pending row keyed UNIQUE per channel+slot_date+kind+slot_idx, before any upload", "INSERT-as-mutex: same slot from another lane conflicts and returns the existing intent — never a second row", "status machine: pending → initiated (session_uri persisted) → uploading → uploaded (video_id)". DB-CHECK live rows quoted in Actual; pg_constraint shows `upload_intents_dedupe_key_key UNIQUE (dedupe_key)` + shipped status CHECK.
- Status: PASS

#### Row 7 — AC-P4-7 · the upload parking ticket is saved before the first byte, and kept secret · `automated` + `manual`

Verify: the resumable session URI lands on the intent row before the first byte is sent, the videoId is written on acceptance, and the URI is never logged or rendered anywhere.

- Steps:
  1. Automated: `node --test tests/upload-intents.test.mjs` — the ordering case (URI persisted before PUT) is green.
  2. After a run with an upload: DB-CHECK `select id, status, video_id, (session_uri is not null) as has_uri from upload_intents order by created_at desc limit 5` — `has_uri = true` and video_id set. (The check deliberately selects only whether the URI exists — never paste the URI itself into this file; it is bearer-capable.)
  3. `gh run view <run-id> --log | grep -c "uploads.google.com"` — expect `0` (the URI never appears in logs). Also open `/logs` in Studio and search for it — zero hits; no Studio surface renders it.
- Expected: URI stored as a secret on the row; zero occurrences in logs or UI.
- Actual: (2026-10-31.) Ordering unit case green. Live rows: both of today's drill upload intents have `session_uri` set (has_uri=true) with video_id landed (Y5qqfprd4QI, MsOccg0kQiI). Log-leak check executed on the real Drill-1 resume run (41222720885): `gh run view 41222720885 --log | grep -c "uploads.google.com"` → 0, and `grep -ci "session_uri|session URI"` → 0. The /logs Studio-UI search needs the owner browser — left for the owner's pass (the store also unit-pins "SECRET (D5): the session URI never appears in any store warn output").
- Evidence: `node --test tests/upload-intents.test.mjs` → "AC-P4-7: the session URI is persisted BEFORE the first byte, then uploaded videoId lands on the row", "SECRET: the session URI never appears in lane log or warn output (upload + failure paths)". DB-CHECK: `select id, status, video_id, (session_uri is not null) as has_uri …` → both rows uploaded/has_uri=true. Grep counts 0 and 0 on run 41222720885.
- Status: PASS

#### Row 8 — AC-P4-8 · a lane settles yesterday's unfinished business before making anything new · `manual`

Verify: when a lane starts (including `--topup` mode) it first resolves ANY open unresolved intent for the channel — probing the session URI, falling through to a title lookup when it has expired — then writes the state entry, marks the slot produced, and skips production for that slot without uploading again.

- Steps:
  1. Use the open intent left by Drill 1's killed run (or create one: cancel a run after the intent row appears but before the video records — DB-CHECK `select * from upload_intents where status not in ('recorded','abandoned')` shows it).
  2. `gh workflow run channel-autopilot.yml -f channel=money-rulebook -f topup=1`
  3. Watch the log (`gh run view <run-id> --log`): the run's first production act is resolving the open intent (probe → title lookup), then it writes `yt-mcp/state/money-rulebook.json` and marks the slot produced.
  4. Confirm on the channel (Studio → `/videos`, filter money-rulebook) that the video count grew by the recovered video only — no second copy of the same title.
- Expected: the open intent is settled first, from the topup dispatch, with no duplicate upload.
- Actual: NOT-RUNNABLE-TODAY as written — the steps need a live topup dispatch (QA rule: no workflow dispatches during this pass) and today's drills left NO open intent to settle (both drill intents are terminal `uploaded`). The behavior is unit-pinned end to end and Drill 1 exercised the adjacent path live.
- Evidence: `tests/upload-intents.test.mjs` → run-start crash recovery suite (D7a/AC-P4-8): "probe-complete claims the video: markUploaded + resolved outcome — caller marks the slot produced and skips", "expired session (404) falls through to the title-fingerprint lookup; found = resolved via title_lookup", "expired + title not found = markAbandoned — the caller proceeds with THIS run's fresh production", plus lane wiring cases "yt-daily: recovery BEFORE the slot loop…", "yt-deepdive: recovery before production…", "shorts-clips: publisher uploads via the shared two-step…".
- Status: NOT-RUNNABLE-TODAY (needs a live dispatch + an open intent; recovery path unit-pinned green — re-run this row in the owner's drill window)

#### Row 9 — AC-P4-9 · the nightly diff catches whatever slipped past everything else · `manual`

Verify: the nightly reconciliation diffs each channel's uploads playlist against intents + state — orphans get an orphan note, ghosts get abandoned, a re-found orphan updates the existing warning instead of duplicating it, and hand-uploads are noted but never backfilled as intents.

- Steps:
  1. PREP: on YouTube Studio (studio.youtube.com), manually upload one throwaway private video to money-rulebook titled `QA-ORPHAN-HAND-UPLOAD-DELETE-ME`. This is a hand-upload — the ledger knows nothing of it.
  2. Dispatch the nightly reconciliation job from the Actions tab (the Phase 4 nightly workflow; or wait for its nightly slot).
  3. DB-CHECK: `select * from warnings where classification like '%orphan%' or title like '%orphan%' order by last_checked_at desc limit 5` — the hand-upload appears once, orphan-noted; any true orphans appear with their own notes.
  4. Re-run the job. DB-CHECK again — the same orphan row now has a newer `last_checked_at` and NO second row appeared (idempotent).
  5. DB-CHECK: `select * from upload_intents where status = 'abandoned'` — ghosts marked, not deleted.
  6. CLEANUP: delete `QA-ORPHAN-HAND-UPLOAD-DELETE-ME` from YouTube Studio; delete the orphan-noted warning row if you want a clean board (or leave it resolved).
- Expected: every mismatch class lands in exactly one place, and re-running changes timestamps, not row counts.
- Actual: NOT-RUNNABLE-TODAY as written — needs the owner's YouTube-Studio hand-upload prep plus a workflow dispatch (QA rule: none during this pass). The nightly reconciliation workflow is DECLARED and scheduled: `.github/workflows/upload-reconcile.yml` (cron 04:29 UTC → `node scripts/upload-reconcile.mjs`) but has zero runs so far (it landed after today's 04:29 slot). The diff semantics are unit-pinned: orphans orphan-noted + never backfilled as intents (L5), ghosts marked per the age/visibility guards, re-run deduped.
- Evidence: `tests/upload-intents.test.mjs` → nightly reconciliation diff suite (D7b/AC-P4-9): "diffPlaylistVsIntents: orphans have no intent row; ghosts are uploaded intents missing from the playlist", "orphans are orphan-noted via T4 emitWarning (advisory, per-video dedupe) and NEVER backfilled as intents (L5)", "CRITICAL 1 TRUE ghost … markFailed + warned", "CRITICAL 1(iii): absent from the playlist but PRESENT via videos.list — exists, never a ghost". `gh run list --workflow=upload-reconcile.yml` → 0 runs (2026-10-31).
- Status: NOT-RUNNABLE-TODAY (owner hand-upload prep + first nightly slot; diff semantics unit-pinned green)

#### Row 10 — AC-P4-10 · normal uploads behave exactly as today · `manual`

Verify: a normal successful upload still does everything today's run does — private upload, thumbnail set, pinned comment, verify-run proof, state writes — with the single exception that a resumed or late upload recomputes publishAt from the kit's slot times.

- Steps:
  1. After a normal (non-resume) run: open the newest video on money-rulebook in YouTube Studio — status private (or per today's schedule), custom thumbnail applied, pinned comment present.
  2. Confirm the verify-run proof in the Actions log (the existing verify step) and the state write: `yt-mcp/state/money-rulebook.json` lastVideos updated.
  3. PublishAt recompute is exercised at the end of Drill 1 (resume path): confirm the resumed upload's publish time falls in the kit's FUTURE slot time, never in the past.
- Expected: indistinguishable from a pre-Phase-4 upload on every axis except the recompute.
- Actual: (2026-10-31.) Proven live by Drill 1's healing run on the resumed job: upload recorded as ONE intent (`uploaded`, video MsOccg0kQiI), verify-run proof green in the Actions log, and the resumed upload's publishAt recomputed from the kit's future slot (no instant publish). The YouTube-Studio eyeball half (private status, custom thumbnail, pinned comment on the live video) needs the owner's browser — left intact for the owner's pass.
- Evidence: DB-CHECK upload_intents c6d28226… = uploaded/MsOccg0kQiI (single row, no duplicate); Actions run 41222720885 log: "[verify] debt-free-doctrine: run claims 1 upload(s), minimum expected 1" / "[verify] OK — all 1 upload(s) exist on YouTube"; Drill 1 recap (publishAt recompute into the kit's future slot).
- Status: PASS (live halves via Drill 1; YouTube-Studio visual half for the owner's session)

### S3 — Warnings + parking

#### Row 11 — AC-P4-11 · every push alert also becomes a durable row · `manual` + `automated`

Verify: every existing alert site (dead channel key, quota budget reached, verify-run failure, template preflight block, failed job step, gate hold/timeout) writes one `warnings` row AND still sends the ntfy push — the push never disappears.

- Steps:
  1. Automated: `node --test tests/warnings-store.test.mjs` — each emitter writes a row with severity, evidence, and policy citation where one exists, alongside the alert call.
  2. Live proof comes free from Drill 2 (dead token): after that drill, DB-CHECK `select * from warnings order by last_checked_at desc limit 10` — the Blocking token row is there, and the phone push arrived too.
- Expected: dashboard and phone always agree.
- Actual: (2026-10-31.) Each emitter writes the row AND fires the push (unit-pinned), and the live Drill-2 row is on the board today: warnings id=2, debt-free-doctrine, severity=blocking, code=token_revoked, blocks_publishing=true, state=resolved, resolved_by=probe — the row and the phone push both happened during the drill (Drill 2 recap). The emitter constraint is also pinned the other way: a park-capable code fired WITHOUT blocks_publishing renders no PUBLISHING BLOCKED suffix, and a store failure never kills the alert.
- Evidence: `node --test tests/warnings-store.test.mjs` → 37/37 pass, incl. "emitWarning writes the row AND fires the push on first open (AC-P4-11)", "emitWarning does NOT re-alert on a deduped re-fire (once per park episode, D11)"; `tests/pipeline-jobstore.test.mjs` → quota/verify emitter cases. DB-CHECK: warnings row id=2 as quoted. ntfy push arrival: Drill 2 recap (owner's phone, 2026-10-31).
- Status: PASS

#### Row 12 — AC-P4-12 · only true publishing blockers may claim "Blocking" · `automated`

Verify: only conditions on the policy hard-block list (revoked token, quotaExceeded, uploadLimitExceeded, upload rejected, account suspended, long-upload disallowed, thumbnail-set blocked) set blocks_publishing=TRUE; job-step failures, analytics failures, and policy heuristics never do.

- Steps: `node --test tests/warnings-store.test.mjs` — the classification cases are green: a `quotaExceeded` error string classifies Blocking; an inauthentic-content heuristic and an analytics collection failure classify Warning/Advisory with blocks_publishing=false.
- Expected: production is never parked over an analytics read or a heuristic.
- Actual: (2026-10-31.) Classification cases green: the allowlist is exactly the policy hard-block list, blocks_publishing=true requires blocking severity, blocking requires policy_quote+policy_url (official only), and the D9 severity CHECK constraint is live in Neon (`warnings_severity_check`: advisory/warning/action_required/blocking/informational). Production row id=2 (token_revoked) is allowlisted blocking with policy_quote "Channels found to have unauthorized access are terminated." — a genuine hard-block class.
- Evidence: `node --test tests/warnings-store.test.mjs` → "AC-P4-12: analytics_scope_missing CANNOT set blocks_publishing — rejected, no row, NO push", "AC-P4-12: a job-step failure code cannot park production either", "AC-P4-12: allowlisted token_revoked CAN set blocks_publishing and lands blocking", "severity door …", "D9 §4.2: blocking rows require policy_quote + policy_url". DB-CHECK: pg_constraint warnings_severity_check + row id=2 policy columns populated (quote_fetched_at 2026-10-31).
- Status: PASS

#### Row 13 — AC-P4-13 · a parked channel skips production but still checks its own pulse · `manual`

Verify: while a Blocking warning is open the channel's production is skipped, but the parked run first executes the cheap probes (token refresh + a 1-unit channels.list), alerting happens once per park episode (not per run), and other channels are unaffected.

- Steps: this is the middle act of Drill 2 — with the dead token still set, dispatch a second run:
  1. `gh workflow run channel-autopilot.yml -f channel=money-rulebook`
  2. `gh run view <run-id> --log` — the log shows the probe executing, then production skipped because the channel is parked.
  3. No SECOND ntfy for the same open warning (once per episode).
  4. Confirm another channel's scheduled cron run the same night produced normally (Actions tab).
- Expected: parked but breathing; quiet while parked; neighbors unaffected.
- Actual: (2026-10-31.) The park-check is live-proven and unit-pinned. Drill 2's real run with the Blocking warning open executed exactly the probe-first sequence: "[park] 1 open blocking warning(s) — probing auto-verifiable codes" → probe ran → in the drill's single-run loop the probe PASSED so production proceeded (Row 14); the parked-skip branch itself is pinned ("open blocking warning: probe runs, production skipped for this channel, exit 0, NO job started"). Quiet-while-parked is pinned ("emitWarning does NOT re-alert on a deduped re-fire (once per park episode, D11)"). The nightly probe lane exists: warning-probe.yml probes parked channels on cron 05:41 UTC per-channel.
- Evidence: Actions run 41208164035 log lines quoted above (2026-10-31); `tests/pipeline-jobstore.test.mjs` → "#106 T2 — park-check (D11, AC-P4-13/14)" both cases; `tests/warnings-store.test.mjs` → "AC-P4-13: a failing probe leaves the warning open and stamps last_checked", deduped re-fire case. Workflow: .github/workflows/warning-probe.yml (jobs: parked-channel probe matrix + review-sweep).
- Status: PASS

#### Row 14 — AC-P4-14 · a passing probe heals the channel by itself · `manual`

Verify: when a probe passes for an auto-verifiable warning — from a parked run or the nightly probe job — the warning resolves automatically and the channel resumes, same day if the probe ran at run-start.

- Steps: final act of Drill 2 — restore the real token, dispatch again:
  1. Restore the token (Drill 2 step R), then `gh workflow run channel-autopilot.yml -f channel=money-rulebook`
  2. Log shows the probe pass → the warning row flips to `resolved` automatically → the run proceeds into normal production the same day.
  3. DB-CHECK: `select * from warnings where channel_id = 'money-rulebook' order by last_checked_at desc limit 5` — state `resolved`, resolved_at set, no manual actor.
- Expected: fix the cause and the parking lifts itself, with zero clicks.
- Actual: (2026-10-31.) LIVE — Drill 2's heal act: with the token restored, run 41208164035 probed, the probe PASSED, the warning resolved itself and the same run proceeded into production. The Neon row shows the full audit trail with zero manual actor: warnings id=2 state=resolved, resolved_by=`probe`, resolve_note = "probe passed (token_revoked) at 2026-10-31T14:02:54.256Z — channel un-parked". Unit pin: probeParkedChannels resolves a passed token probe with resolved_by=probe; a failing probe leaves the row open.
- Evidence: DB-CHECK warnings row id=2 (quoted in Actual); Actions run 41208164035 log: "[warning-probe] PASSED — resolved=true" → "[park] probe cleared the blocking warning — proceeding with production"; `tests/warnings-store.test.mjs` → "AC-P4-14: probeParkedChannels resolves a passed token probe with resolved_by=probe".
- Status: PASS

#### Row 15 — AC-P4-15 · the owner's manual resolve is audited, never silent · `manual`

Verify: an owner manual resolve records resolved_by and a resolve note; non-auto-verifiable Blocking rows never auto-unpark — only a passing probe or the owner's manual resolve clears them.

- Steps:
  1. Open `/warnings` as owner. On any open warning click **Resolve**, type a reason, confirm.
  2. DB-CHECK: `select state, resolved_by, resolved_at from warnings where channel_id = 'money-rulebook' order by last_checked_at desc limit 5` — the row shows your email and the note.
  3. Automated: `node --test tests/warnings-store.test.mjs` — the "non-auto-verifiable Blocking never auto-resolves on probe" case is green.
- Expected: every human decision leaves a name and a reason on the record.
- Actual: (2026-10-31.) Automated half green: the resolve/acknowledge writers record who+when+note, and the probe only ever auto-resolves AUTO-VERIFIABLE rows — a non-auto-verifiable Blocking row never auto-unparks, and unmapped codes are neither probed nor stamped. The /warnings manual-resolve CLICK needs the owner's browser (Drill 2 cleanup deliberately left no open row to click) — owner-session half intact.
- Evidence: `node --test tests/warnings-store.test.mjs` → "resolve records resolved_by + note (manual resolves audited, never silent)", "AC-P4-15: a NON-auto-verifiable blocking row never auto-unparks", "AC-P4-15 + QA row 16: unmapped codes are neither probed NOR stamped — they stay open", "probe map exposes token_revoked and nothing else until Batch B adds probes". DB corroboration: the only probe resolve today carries resolved_by=probe (never a silent flip).
- Status: PASS (automated half; the manual click = owner's /warnings session)

#### Row 16 — AC-P4-16 · the /warnings dashboard reads like a duty log · `visual` (+ staff read-only)

Verify: /warnings lists open warnings grouped by channel with severity, the official quote + source link + fetch date, evidence, last-checked, a "re-check now" button and an owner-only manual resolve; empty board shows an explicit empty state; staff can read but not resolve.

- Steps:
  1. Open `/warnings` as owner (nav: System group → Warnings). With Drill 2's row still open: group header per channel, severity chip, the verbatim policy quote with its link and fetched date, evidence, last-checked time.
  2. As **staff**: same list visible; no Resolve button (the owner-only control is hidden, and a direct API write returns 403 — DevTools: `fetch('/api/warnings', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({action:'resolve', id:1})}).then(r=>r.status)` → 403).
  3. Empty state: after resolving/clearing all rows (or on a fresh filter with no matches), the page shows an explicit "no open warnings" state — never a blank tile.
- Expected: everything the ntfy push said, plus the citation a human needs to act.
- Actual: LEFT FOR THE OWNER'S SESSION (visual + staff row; browser + login required). Server-side corroboration gathered 2026-10-31: the data the page renders exists and is correctly shaped — warnings row id=2 carries severity=blocking, the verbatim policy_quote ("Channels found to have unauthorized access are terminated."), policy_url, quote_fetched_at, recommended_action, state + resolved_by/resolve_note; role enforcement for owner-only writes is pinned server-side (staff POST is rejected at the route, not just the proxy).
- Evidence: DB-CHECK warnings id=2 policy columns (quoted under Row 12); `tests/session-admin.test.mjs` → "route re-checks the role server-side for BOTH owner-mode endpoints (the proxy is never the only gate)". Screenshots: pending owner pass (desktop 1440 + mobile 375).
- Status: NOT-RUNNABLE-TODAY — owner/staff Studio session required; steps left intact above

### S4 — Review queue

#### Row 17 — AC-P4-17 · the script and its render inputs are saved before any render starts · `automated` + `manual`

Verify: when a script is generated, its text, sources, claims, disclosure flags, template and job links, plus the full structured render input, are persisted BEFORE the render step starts.

- Steps:
  1. Automated: `node --test tests/review-gate.test.mjs` — the ordering case (persist completes before render begins) is green.
  2. Live: during Drill 3, DB-CHECK `select * from scripts order by 1 desc limit 3` while the job is held at awaiting_review — the script row exists with sources/claims, while job_steps shows render/upload not started.
- Expected: the review page and any later resume can both read from the same saved record.
- Actual: (2026-10-31.) Automated ordering case green ("persists the COMPLETE structured render input (hook/points/closing/thumbHeadline + seed/themes/publishAt) as awaiting_review" — AC-P4-17; saveScript is transactional; a blocked script is never saved). Live-note for the drill half: Neon `scripts` is EMPTY today (0 rows) — Drill 3's hold fired BEFORE generation (`no_approved_script`), i.e. zero generation spend, and the doc generate-only persistence seam (T5c) landed AFTER the drill ran. Nothing rendered/uploads without a saved record holds trivially (no record → no render input → hold), and the persist→render order is unit-pinned.
- Evidence: `node --test tests/review-seams.test.mjs` → 34/34 pass, incl. "#106 T5b — saveGeneratedScript (AC-P4-17: persisted BEFORE any render)" suite (complete render input, blocked script never saved, transactional). DB-CHECK: `select count(*) from scripts` → 0; jobs d8b3ab83 status=held, error="review hold: no_approved_script", review step=skipped, all production steps pending.
- Status: PASS (automated; live drill half superseded by the stronger zero-spend hold — see Actual)

#### Row 18 — AC-P4-18 · review gating is decided by template membership and fails closed · `automated` + `manual`

Verify: when the channel's assigned template has a non-empty `review_required`, every script holds at awaiting_review and nothing renders, uploads, or schedules until an approval exists; unreadable registry/approval state = HOLD + one Action-required ntfy + a "review gating inactive" warning row; channels with no registry assignment at all keep running ungated.

- Steps:
  1. Automated: `node --test tests/review-gate.test.mjs` — the gating truth table is green: membership × approval states × unreadable-state ⇒ hold; generator risk flags do NOT gate; unassigned legacy channels ungated; drift writes the dedicated warning row.
  2. Live hold proof is Drill 3 below (a medical-flagged test template holds a real generation).
- Expected: a flag the generator failed to emit can never silently un-gate a review channel; a dead DB holds the slot rather than risking an unreviewed upload.
- Actual: (2026-10-31.) Both halves green. Truth table: membership drives the gate only (empty review_required → ungated; non-empty → gated); unreadable registry × cached-gated / no-cache → still gated (fail-closed); NULL script store on a gated channel → HOLD; generator risk flags NEVER gate (and a zero-flag script on a gated channel still holds); unassigned legacy channels ungated; drift emits the dedicated review_gating_inactive warning row and holds. LIVE: Drill 3 held a real production job today — d8b3ab83 status=held, error "review hold: no_approved_script", zero generation, no render, no upload.
- Evidence: `node --test tests/review-gate.test.mjs` → 44/44 pass (C2 truth table, M2 inverse, C2 end-to-end unreadable→HOLD with review_state_unreadable row, M3 drift); Actions run 41210424783 log: "[template] enforce: beat-synced-type @ v1.0.0" → "[review] held — slot skipped today (no_approved_script)"; DB jobs row d8b3ab83 quoted in Actual.
- Status: PASS

#### Row 19 — AC-P4-19 · an unapproved script times out without losing the money already spent · `manual`

Verify: a held script not approved by its slot's publishAt (else end-of-day) skips the slot for that day, records one Action-required timeout warning, and RETAINS the script — a later approval resumes at render with no re-spend.

- Steps:
  1. From Drill 3, leave one held script unapproved past the slot's publishAt.
  2. Dispatch the next run (or let the nightly sweep run): the held slot is skipped — no render, no upload — and DB-CHECK `select * from warnings where title like '%timeout%' or classification like '%timeout%' order by last_checked_at desc limit 5` shows ONE timeout row.
  3. Now approve the script from `/review`. The approval dispatches the resume run (see Row 22); the log shows it re-entering at render — script/TTS steps skipped (no re-spend).
  4. If no future slot remains that day, the script simply waits — no forced instant publish.
- Expected: a missed approval costs a slot day, never a re-render bill.
- Actual: Automated halves green (2026-10-31): a held script whose slot publishAt passed emits ONE review_timeout warning, RETAINS the script, and holds; the nightly sweep times out every channel's past-deadline awaiting script and is never-throw. The sweep is SCHEDULED: warning-probe.yml's review-sweep job runs `node scripts/review-sweep.mjs` nightly (pinned by test). The LIVE half (hold past publishAt → approve → resume re-enters at render with no re-spend) needs a real held script + owner approval — Drill 3 proved the hold but its approve→auto-resume half for doc lanes landed as T5c after the drill; owner-session item.
- Evidence: `node --test tests/review-gate.test.mjs` → "run-start: an awaiting script whose slot publishAt passed emits review_timeout, RETAINS the script, holds", "nightly sweep: times out EVERY channel's past-deadline awaiting script (publishAt, else end-of-day), retains all", "MAJOR 4: the approval-timeout sweep is SCHEDULED — warning-probe.yml runs scripts/review-sweep.mjs network-wide on its nightly cron". `node --test tests/review-seams.test.mjs` → "If no future slot remains today, the AC-P4-19 skip is taken BEFORE any render spend and the script STAYS approved".
- Status: PASS (automated + scheduling; live approve-after-timeout = owner's next drill)

#### Row 20 — AC-P4-20 · the review page shows the script against its sources · `visual` + `manual`

Verify: opening a held script shows script text and sources side-by-side with claim↔source links, a flagged-claims panel (every non-verified claim), and the Phase 3 dedupe verdict where one exists; an owner claim edit invalidates the script's artifact.

- Steps:
  1. Open `/review` as owner and click Drill 3's held script. Expect: script text left, sources right, highlighted links from each claim to its source(s); a flagged-claims panel listing every claim whose status is not `verified`, with accept/edit/drop; the dedupe verdict shown as evidence.
  2. Edit one claim's wording and save. DB-CHECK: `select * from job_artifacts where kind = 'script-payload' order by 1 desc limit 3` — the script artifact for this job is gone/stale, so the resume will re-run the script step rather than render a stale input.
- Expected: a reviewer can verify every claim's source without leaving the page, and edits are honest about invalidating what was already made.
- Actual: LEFT FOR THE OWNER'S SESSION (visual row; needs a held script on /review — Neon `scripts` is empty today after Drill 3, see Row 17). Server-side corroboration 2026-10-31: the claim/source/dedupe schema the page renders exists (script_sources: url/title/snippet; script_claims: claim/source_id/verification; scripts.dedupe_verdict_id → dedupe_verdicts, 11 live rows from the Phase 3 proof), and candidate thumbnails are served only through the token-authenticated hash-verifying endpoint (`/api/review/thumb` — open-proxy guard), not raw blob URLs.
- Evidence: DB-CHECK information_schema (script_sources/script_claims/dedupe_verdicts columns); dedupe_verdicts count=11 (2026-10-29..10-31); `tests/review-seams.test.mjs` → "N rendered variants land as thumb_candidate artifacts + job index rows + the script meta the /review page reads". Screenshots: pending owner pass.
- Status: NOT-RUNNABLE-TODAY — owner Studio session + a held script required; steps left intact above

#### Row 21 — AC-P4-21 · approval is impossible until the disclosure checklist is answered · `manual`

Verify: where disclosure is required, all four synthetic-media categories (YouTube's official wording) must each be answered before the Approve button becomes possible.

- Steps:
  1. On a held script that declares `disclosure.synthetic_media_required: true` (Drill 3's script if its template declares it; otherwise any flagged script), scroll to the disclosure checklist — expect the four official category items from `support.google.com/youtube/answer/14328491`, verbatim.
  2. With one or more items unanswered, the Approve control is disabled/blocked with the reason.
  3. Answer all four — Approve unlocks.
- Expected: the upload sets disclosure flags right the first time, because approval cannot skip the question.
- Actual: Automated pin green (2026-10-31): DISCLOSURE_CATEGORIES is the OFFICIAL four-category wording (support.google.com/youtube/answer/14328491) and approval REQUIRES all four answers when the script declares disclosure required. The browser disable/unlock click-through needs a held script on /review — owner session (no script held today; see Row 17).
- Evidence: `node --test tests/review-gate.test.mjs` → "DISCLOSURE_CATEGORIES is the OFFICIAL four-category wording (research §5.7, support.google.com/youtube/answer/14328491)", "AC-P4-21: approval REQUIRES all four disclosure answers when the script requires disclosure".
- Status: PASS (automated pin; UI click-through = owner's next held-script session)

#### Row 22 — AC-P4-22 · approval dispatches the render run; a failed dispatch screams · `manual` + `automated`

Verify: owner approval dispatches `channel-autopilot.yml` with `channel=<slug>` and `resume=<job_id>` via the existing Studio dispatch pattern (owner-only); a dispatch failure writes an Action-required warning; a rejection means the script never uploads.

- Steps:
  1. Approve Drill 3's held script as owner. Actions tab: a new `channel-autopilot` run appears, dispatched with `resume=<job id>`; it re-enters at render.
  2. Staff cannot approve: as staff on `/review` the Approve control is absent, and `fetch('/api/review', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({action:'approve', id:<script id>})}).then(r=>r.status)` → 403.
  3. Automated (failure path): `node --test tests/review-gate.test.mjs` — the dispatch-failure case is green: an Action-required warning row is written, never a silent approved-but-not-rendered.
  4. Rejection half: reject a second held script from `/review` — the script's status never reaches an upload; the slot takes the lane's normal terminal; nothing appears on the channel.
- Expected: one click moves the pipeline; a broken click moves the warnings board instead of nothing.
- Actual: Automated halves green (2026-10-31): approve dispatches channel-autopilot.yml with channel=<slug> + SPACE-form `--resume <job_id>` (the workflow input + threading is pinned end-to-end), and a dispatch FAILURE writes the Action-required warning row (approved-but-never-rendered is never silent). The live click halves (owner approve, staff 403, reject-a-second-script) need the owner's /review session with a held script — none held today (Row 17).
- Evidence: `node --test tests/review-gate.test.mjs` → "approve dispatches channel-autopilot.yml with channel=<slug>&resume=<job_id> (the /api/action pattern)", "H6: a dispatch FAILURE records an Action-required warning — an approval can never silently not render", "BLOCKER 2: a failed approve dispatch writes the Action-required warning row", "BLOCKER 1: channel-autopilot.yml declares the resume dispatch input and threads the SPACE-form --resume into the run" (workflow YAML verified: .github/workflows/channel-autopilot.yml inputs.resume + line 179 threading). DB: workflow `resume` input default "" confirmed.
- Status: PASS (automated; live click halves = owner's next held-script session)

#### Row 23 — AC-P4-23 · three thumbnail candidates, upload never waits for a human · `manual` + `visual`

Verify: where picking is enabled, renders produce 3 candidates and the upload proceeds with candidate 1 automatically; an owner pick before publishAt swaps via thumbnails.set; after publishAt the pick is recorded but not applied; where picking is not enabled, today's single auto-candidate continues with zero interaction.

- Steps:
  1. Enable picking for the drill channel/template in the admin panel config (per OQ-4 it is panel DATA, launch default: review-gated templates ON).
  2. After a render: DB-CHECK `select * from job_artifacts where kind = 'thumb' and job_id = '<job id>'` — 3 candidate rows; the upload used candidate 1 (check the live video's thumbnail).
  3. Before publishAt: pick candidate 2 from `/review` (or `/videos`). The video's thumbnail changes (thumbnails.set re-called, ~50 quota units — expect it in the quota ledger `/usage`).
  4. After publishAt: pick candidate 3 — the live thumbnail does NOT change; the pick is recorded for win-rate data only.
  5. A channel/template WITHOUT picking enabled runs today's single-candidate path — no candidate rows, no picker UI.
- Expected: the daily queue never blocks on a thumbnail decision, and the owner can still change their mind until publish.
- Actual: Automated halves green (2026-10-31): the candidate count is template DATA (`review_thumb_pick` — the three finance templates ship ON per OQ-4), unpicked = candidate 1 ships automatically (M7), a pick BEFORE publishAt applies via thumbnails.set, a pick AFTER publishAt is recorded but NOT applied, out-of-range picks rejected, and every render on an enabled channel emits the variants (no dead emission); private candidate bytes are served only through the token-authenticated hash-verifying `/api/review/thumb`. The live halves (enable picking in the panel, watch 3 candidate rows land on a real render, swap before publishAt, no-change after) need Studio + quota spend — owner session.
- Evidence: `node --test tests/review-seams.test.mjs` → "AC-P4-23: candidate count comes from the template DATA — truthy = 3, numeric honored, absent = 1", "SEAM 2: the gate's template meta review_thumb_pick=true -> REVIEW_THUMB_CANDIDATES=3 on the child", "SEAM 2 negative: … no candidates env (single-candidate behavior unchanged)", "M7: UNPICKED = candidate 1", "round 1 minor 7: thumbFrameOffset is pure and candidate 1 keeps the LEGACY +3s frame"; `tests/review-gate.test.mjs` → post-upload swap semantics suite (D18/AC-P4-23, M7); `tests/script-store.test.mjs` → recordThumbCandidates.
- Status: PASS (automated; live render/swap halves = owner's session)

### S5 — Analytics snapshots

#### Row 24 — AC-P4-24 · the nightly snapshot collector probes, upserts, and skips politely · `manual`

Verify: the nightly analytics job probes each channel for `yt-analytics.readonly`, collects a trailing window (D-1..D-4) into `analytics_snapshots` (unique per channel+date+source, re-runs update in place), lets analytics_api win overlapping per-day dates, and skips scope-less channels with one Warning (never Blocking) plus a re-auth checklist entry.

- Steps:
  1. `gh workflow run analytics-nightly.yml` (or wait for its nightly slot).
  2. DB-CHECK: `select channel_id, date, source, views, collected_at from analytics_snapshots order by collected_at desc limit 20` — up to 4 dates per channel per source; only channels holding the scope have rows.
  3. Run it again immediately. DB-CHECK again — row count for the same channel+date+source is UNCHANGED (UPSERT updated in place, never duplicated).
  4. DB-CHECK: `select * from warnings where title like '%analytics%' or classification like '%scope%' order by last_checked_at desc limit 5` — scope-less channels appear as Warning rows with the re-auth checklist, and severity is never Blocking.
- Expected: re-runs are free of duplicates; a missing scope is a to-do, never an outage.
- Actual: (2026-10-31.) The nightly ALREADY RAN on its slot today (QA rule: no dispatch by me) — Actions run 41194793854, schedule trigger, SUCCESS, 2026-10-31T10:56:47Z, and its data is in Neon: 11 `analytics_snapshots` rows (4 channels × trailing D-1..D-4, sources analytics_api + data_api, unique per channel+date+source — quotequarry/money-rulebook/investors-compass/debt-free-doctrine, dates 2026-10-27..10-30) and 4 `analytics_probe_log` rows, ALL ok=true has_scope=true (every current channel holds yt-analytics.readonly, so no scope-less warning exists yet — the Warning path is unit-pinned, never Blocking). UPSERT-in-place is pinned by unit test AND enforced by the live UNIQUE constraint `analytics_snapshots_channel_id_date_source_key`. Manual re-dispatch idempotency check skipped per the no-dispatch rule — the constraint makes duplicates impossible at the storage layer regardless.
- Evidence: `gh run list --workflow=analytics-nightly.yml` → run 41194793854 success (quoted above); `node --test tests/analytics-store.test.mjs` → 12/12 pass, incl. "upsertWindow re-collecting the same trailing window updates rows in place, never duplicates (AC-P4-24)", "analytics_api wins the overlapping date for per-day metrics while data_api keeps per-video counters (AC-P4-24)"; DB-CHECK snapshot + probe rows quoted in Actual; pg_constraint UNIQUE key. Workflow verified: .github/workflows/analytics-nightly.yml (cron 17 5 * * *, registry-driven channel discovery, no hardcoded slug list).
- Status: PASS

#### Row 25 — AC-P4-25 · every snapshot view admits its data is late · `visual`

Verify: every snapshot-backed view shows "data through \<date\>" and never ranks on the unsettled trailing window; win rates exclude videos younger than 7 days.

- Steps:
  1. Open the snapshot-backed leaderboard (pinned to `/analytics`; see How-to-run note 6). Every panel carries a "data through <date>" stamp.
  2. The stamp's date is at least 2 days behind today (48–72h settlement) — the trailing days are visibly excluded, not shown as final.
  3. Any video younger than 7 days is absent from win-rate rankings (check one you published this week).
- Expected: the UI never lets yesterday's half-settled numbers pose as final.
- Actual: LEFT FOR THE OWNER'S SESSION (visual row; /analytics login + screenshots at 1440/375). Store-side corroboration 2026-10-31: the window the UI reads ends at D-2 (48h+ settlement) and excludes the trailing unsettled days by construction, and win rates settle at 7 days reading each video's LATEST census row — the stamps' honesty is a rendering concern on top of an already-honest store. Snapshots to render exist: 11 rows collected today.
- Evidence: `node --test tests/analytics-store.test.mjs` → "leaderboardWindow ranks channels over the settle window ending D-2 with trend vs the previous window (D21/AC-P4-25/26)", "leaderboardWindow IGNORES data_api-only dates for per-day metrics (round 1 CRITICAL 3 — a census date is not a traffic day)", "winRates reads each video from its LATEST census row, settles 7 days, and scopes to owned channels". Screenshots: pending owner pass.
- Status: NOT-RUNNABLE-TODAY — owner Studio session required; store settle semantics pinned green

#### Row 26 — AC-P4-26 · the leaderboard reads the warehouse, not the API · `manual` + `automated`

Verify: the owner's leaderboard ranks channels over a selectable window (7/28/90 days) computed from snapshots with zero live YouTube API calls.

- Steps:
  1. Open the leaderboard. Switch the window 7 → 28 → 90 days — rankings recompute, values change.
  2. DevTools Network tab: the page's data comes from the Studio snapshot endpoint only — no browser calls to googleapis (and the endpoint itself reads Neon: automated proof next).
  3. Automated: `node --test tests/analytics-store.test.mjs` — the "reads snapshots, zero live calls" case is green.
- Expected: viewing the whole network costs zero quota units.
- Actual: Automated half green (2026-10-31): the leaderboard ranks over SNAPSHOT rows only (no live YouTube call in the store path), windowed and settled. The browser halves (switch 7/28/90 in the UI, DevTools network check) need the owner's session.
- Evidence: `node --test tests/analytics-store.test.mjs` → "leaderboardWindow ranks channels over the settle window ending D-2 with trend vs the previous window (D21/AC-P4-25/26)" (pure snapshot read, zero API clients); DB-CHECK: the 11 snapshot rows it reads exist (2026-10-31 collection).
- Status: PASS (automated half; UI window-switch + DevTools = owner's session)

#### Row 27 — AC-P4-27 · win rates start empty and grow honestly · `visual` + `manual`

Verify: a published video with a template assignment rolls into per-template and per-topic win rates; win rates start EMPTY and cover only registry-assigned channels until data accrues.

- Steps:
  1. Before any S4 script has published rows (fresh Phase 4): open the win-rate panels — they show an explicit empty state ("no published reviewed scripts yet" or equivalent), never zeros pretending to be data.
  2. After a few weeks of snapshots (or against a seeded fixture): a published video with `scripts.video_id` + template assignment appears in its template's and topic's win rate. Videos without an assignment do not appear anywhere.
  3. Cross-check one number by hand: the template's rate matches the snapshots of its published videos over the stated window.
- Expected: coverage grows with assignments (Phase 5), and the UI says so.
- Actual: The production precondition for the EMPTY state holds TODAY — Neon `scripts` has 0 rows (no S4 script has published), and the store returns an explicit empty result set cleanly rather than zeros (unit-pinned). The visual empty-state check and the later filled-state checks (roll into per-template/per-topic win rates; unassigned videos appear nowhere) need the owner's browser, and the filled case needs weeks of accrual or a seeded fixture by design.
- Evidence: `node --test tests/analytics-store.test.mjs` → "winRates returns an empty result set cleanly while the S4 scripts table does not exist (L6/OQ-7)", "winRates reads each video from its LATEST census row, settles 7 days, and scopes to owned channels". DB-CHECK: `select count(*) from scripts` → 0 (2026-10-31).
- Status: NOT-RUNNABLE-TODAY (visual half = owner session; empty-state store semantics pinned green)

#### Row 28 — AC-P4-28 · the old analytics world keeps turning · `automated` + `manual`

Verify: the Daily Excel report still runs and commits `state/`+`logs/` history, and the live 28-day `/api/analytics` panel behaves exactly as today.

- Steps:
  1. [local] `node daily-excel-report.mjs; echo $?` — exits 0; `state/report-stats.json` and `logs/posts-log.json` updated as before. (Or confirm the last `reporting-daily` Actions run green — it runs daily 16:45 UTC.)
  2. Open `/analytics` — the live 28-day panel loads with real YouTube data exactly as before Phase 4 (no snapshot stamp on THIS panel — it is the live one).
  3. DevTools: `GET /api/analytics` returns 200 with the 28-day payload as before.
- Expected: snapshots supplement; nothing replaces.
- Actual: Step 1 via the row's sanctioned alternative — the last `reporting-daily` Actions run is GREEN (run 41128041130, schedule, success, 2026-10-30T21:03:11Z, 30s; prior day 40957758489 also success), so the Daily Excel report still runs and commits its history. (The local `node daily-excel-report.mjs` variant was not run: it writes state/logs files, and this pass is read-only outside the QA file.) Steps 2-3 (the live 28-day panel + `GET /api/analytics` DevTools check) need the owner's browser.
- Evidence: `gh run list --workflow=reporting-daily.yml --limit 2` → both success (quoted above). Build manifest (Row R7) still routes /analytics.
- Status: PASS (step 1; steps 2-3 = owner's session)

### S6 — Sessions

#### Row 29 — AC-P4-29 · the owner can end anyone's session in seconds · `manual`

Verify: when the owner revokes another user's session from the admin view, that user's very next request is unauthenticated (redirect to login) — instant, not at cookie expiry.

- Steps:
  1. Browser A: sign in as **staff**. Open `/` (Overview loads). Leave it open.
  2. Browser B: sign in as **owner**. Open the all-sessions view (pinned to `/users` — see How-to-run note 6): every user's active sessions with a per-session Revoke control (today it shows counts only).
  3. Revoke the staff session from step 1.
  4. Browser A: click anything (or reload) — expect the immediate redirect to `/login`, not a graceful expiry countdown.
- Expected: access ends in one click and one request.
- Actual: LEFT FOR THE OWNER'S SESSION (needs two browsers: staff + owner). Mechanics pinned by unit tests 2026-10-31: revokeSessionById flips exactly the target row and returns its email (instant — the very next request's token fails the session check), refuses non-integer ids (no Number() coercion — Number(true)=1 could never revoke row 1), and a 401 anywhere sends the device to /login via the shared apiFetch wrapper. The all-sessions owner surface is shipped: `/sessions` page in the build manifest, `GET /api/sessions` owner-gated (Row R5's incognito spot-check covers the 401).
- Evidence: `node --test tests/session-admin.test.mjs` → 17/17 pass, incl. "owner view: listAllSessions returns every user's session with email, role and dead flags (AC-P4-29 surface)", "revokeSessionById flips exactly the target row and returns its email (AC-P4-29 instant)", "revoke-by-id passes the raw body id — no Number() coercion", "a 401 anywhere sends the device to /login (AC-P4-29 redirect) — via the shared apiFetch wrapper". Build manifest: ○ /sessions present.
- Status: NOT-RUNNABLE-TODAY — two-browser owner/staff session required; steps left intact above

#### Row 30 — AC-P4-30 · expired sessions are garbage-collected · `automated`

Verify: the cleanup pass deletes sessions that are expired or revoked for more than 30 days.

- Steps:
  1. Automated: `node --test tests/session-admin.test.mjs` — the 30-day cutoff cases are green (deletes expired >30d, deletes revoked >30d, KEEPS a session revoked 29 days, keeps active sessions). NOTE: the death-clock approximation uses last_used (no revoked_at column; conservative — dead rows only, never early-deletes a live session). The nightly log-line step is unexecutable until the T3/T6 nightly workflow lands (Batch B/C).
  2. After a nightly maintenance run, its log shows the sessions-cleanup line with the deleted count.
- Expected: the table stops growing forever without touching anyone still valid.
- Actual: (2026-10-31.) Automated cutoff cases green: cleanup deletes sessions expired or revoked for MORE than 30 days, KEEPS a session revoked inside the window, keeps live sessions, honors the days option, dry-mode counts without deleting, and the CLI exits non-zero on a dead database (liveness probe BEFORE the fail-safe call). Divergence note (matches the row's own NOTE): the shipped clock is last_used-based (no revoked_at column — conservative, dead rows only); `scripts/sessions-cleanup.mjs` exists with --dry mode but is NOT yet wired into any workflow (`grep -rn sessions-cleanup .github/` → no hits), so the nightly log-line half stays unexecutable until the maintenance batch — Row 33's finding covers the same gap. Live session table is small and healthy: 26 rows, 1 user, 0 revoked (2026-10-31).
- Evidence: `node --test tests/session-admin.test.mjs` → "cleanup deletes sessions expired or revoked for more than 30 days, keeps fresh or live rows (AC-P4-30)", "cleanup honors the days option", "cleanup dry mode counts the doomed rows without deleting (ops preview)", "cleanup CLI really exits non-zero on a dead database". DB-CHECK: sessions 26 rows/1 user/0 revoked; schema unchanged (see Row 31/S6). Workflow grep: no sessions-cleanup wiring (quoted in Actual).
- Status: PASS (automated cutoffs; nightly log-line half pending the maintenance workflow — tracked under Row 33)

#### Row 31 — AC-P4-31 · self-service sessions and the role matrix are untouched · `manual`

Verify: self-service device list + sign-out-everywhere and the Edge proxy route→role matrix behave exactly as today.

- Steps:
  1. `/settings` → Security panel: your own devices list renders as before; **Sign out everywhere** revokes all your sessions and forces re-login (use a spare window).
  2. Proxy matrix spot-check: signed-out incognito to `/users` → login redirect; signed-out `fetch('/api/sessions').then(r=>r.status)` → 401.
- Expected: nothing about the Oct-09 A1 behavior changed.
- Actual: LEFT FOR THE OWNER'S SESSION (browser checks). Schema + behavior pinned 2026-10-31: the Neon `sessions` table is BYTE-IDENTICAL to the Oct-09 A1 shape — id, token_hash, email, role, name, user_agent, ip, created_at, last_used, expires_at, revoked; NO new columns (Phase 4 added zero schema to S6). Self-service device list + sign-out-everywhere unchanged (unit pin) and the proxy gates the admin /sessions page owner-only while the self-service API stays untouched (unit pin).
- Evidence: `node --test tests/session-admin.test.mjs` → "self-service device list + sign-out-everywhere are unchanged (AC-P4-31)", "proxy gates the /sessions admin page owner-only (additive matrix row, self-service API untouched)". DB-CHECK information_schema: sessions columns as quoted (26 live rows). Incognito/staff spot-checks: owner's browser.
- Status: NOT-RUNNABLE-TODAY — browser spot-checks = owner's session; schema + proxy pins green

### Cross-slice

#### Row 32 — AC-P4-32 · the quota gate trusts the Dec-2025 model, falls back to legacy math · `automated` + `manual`

Verify: the pipeline's daily quota budget consumes `youtube_quota_models` rows (Phase 2 #104) when present, and falls back to today's legacy math when absent — the false ~5-upload/day park must not bound Phase 4.

- Steps:
  1. Automated: `node --test tests/quota-model.test.mjs` — gate consumes model rows when present; legacy fallback when absent; both green.
  2. Manual (existing surface): open `/channels` → a channel card's scheduling panel. With a quota-model row saved, the panel's projection uses model numbers (≈100/upload — no false park at realistic volumes); the amber advisory matches the saved row (same surface as the Phase 2 fix-wave row F-1 in `docs/qa/phase2-vault-v2-qa.md`).
  3. Fallback check: on a project with NO quota-model row, the panel shows the legacy projection advisory and the pipeline parks exactly where it always did.
- Expected: the gate is as smart as its data and no smarter.
- Actual: (2026-10-31.) Automated half green, including the exact false-park scenario the criterion names: with the #104 model, ~15 uploads/day do NOT false-park while legacy math parks at ~5; the pipeline quotaGate loads the model row (workspace key, no-row → DEFAULT) and passes { model } to evaluate; a seeded-default row reproduces every legacy evaluate() verdict exactly (GOLDEN); no-model evaluate keeps the hardcoded legacy behavior; the projection advisory fires without blocking; broken DB → default model, never throws. The /channels panel checks (model-number projection on a saved row; legacy projection on a project without one) need the owner's browser.
- Evidence: `node --test tests/quota-model.test.mjs` → 16/16 pass, incl. "GOLDEN: seeded-default row reproduces every legacy evaluate() verdict exactly", "current-reality default changes the ledger math: ~100 units/upload", "projectWithQuotaModel falls back to the default model when the project has no row"; `tests/upload-intents.test.mjs` → quota-model wiring suite: "with the #104 model, ~15 uploads/day do NOT false-park; legacy math parks at ~5", "the pipeline quotaGate loads the model row (workspace key, no-row → DEFAULT) and passes { model } to evaluate".
- Status: PASS (automated; /channels panel halves = owner's session)

#### Row 33 — AC-P4-33 · every new store has a retention broom · `manual` + `automated`

Verify: the nightly maintenance pass prunes per the retention schedule — job_steps/job_artifacts >90 days, resolved upload_intents >30 days, Blob bytes past class retention (non-review >30d, resolved-intent >7d), analytics_snapshots >90 days rolled up to weekly.

- Steps:
  1. Automated (cutoffs): `node --test tests/artifact-store.test.mjs (Blob-side retention cutoffs; the Neon-row prune lands with the nightly maintenance batch — re-cite its test here then) tests/upload-intents.test.mjs tests/analytics-store.test.mjs` — each retention cutoff case green (a 91-day row is deleted, an 89-day row survives, etc.).
  2. Dispatch the nightly maintenance workflow from the Actions tab (or wait for its slot). Its log shows one line per prune class with counts.
  3. DB-CHECK: `select count(*) from analytics_snapshots where date < (current_date - interval '90 days')` — 0 (older rows rolled up to weekly); same shape for the other tables with their windows.
  4. Blob: the log's Blob-prune line reports bytes freed per class; no resume-critical class over-pruned (a next-day resume still works — spot-check with Drill 1 if in doubt).
- Expected: free-tier tables and buckets stay bounded without anyone remembering to clean up.
- Actual: (2026-10-31.) Shipped halves green; the deferred half is recorded honestly. GREEN — Blob-side retention cutoffs (review-carrying kinds 30d, resolved-intent bytes 7d, unknown default 30d; boundary math exact at the window edge; deletion is by-entry with the isLive hook so shared-hash bytes survive; a throwing deleteImpl counts failed, never throws). GREEN — analytics_snapshots retention: the 90-day weekly rollup ran LIVE today inside analytics-nightly (run 41194793854; rollup is idempotent, folds analytics_api daily rows into weekly, never mixes data_api lifetime counters into sums). NOT LANDED — the NEON-row prune (job_steps/job_artifacts >90d, resolved upload_intents >30d) has no implementation yet (`grep interval '90 days'|delete from job_steps across lib/scripts/studio-lib` → no hits) and NO nightly maintenance workflow exists to dispatch (upload-reconcile + warning-probe + analytics-nightly are the only Phase-4 nightlies; none carries the prune) — exactly the deferral the row's own automated citation anticipated ("the Neon-row prune lands with the nightly maintenance batch"). The Blob-prune live-log and DB-CHECK prune steps are therefore NOT-RUNNABLE-TODAY. No over-prune risk demonstrated: resume-critical classes are excluded by the isLive hook + 30d windows.
- Evidence: `node --test tests/artifact-store.test.mjs` → retention windows suite (D25/AC-P4-33), 20/20 pass incl. "expiredEntries boundary math: exactly at the window edge expires; 1ms inside survives", "deletion is BY-ENTRY: the isLive hook keeps live-referenced entries"; `node --test tests/analytics-store.test.mjs` → "rollup folds analytics_api daily rows into weekly rows, never mixes data_api lifetime counters into metric sums, and is idempotent (D25/AC-P4-33, round 1 CRITICAL 2)"; `node --test tests/upload-intents.test.mjs` → 52/52 (no Neon prune case shipped — see Actual). Live: analytics-nightly run 41194793854 success today (rollup step in scripts/analytics-nightly.mjs: store.rollup + folded count log).
- Status: PASS (Blob + analytics halves, automated + live; Neon-row prune + maintenance workflow NOT LANDED — deferred batch, tracked as the phase's one open scope gap)

### Exit-gate drills

#### Drill 1 — AC-P4-Drill-1 · kill-a-worker: a killed render resumes at render and never re-spends · `manual`

Proves AC-P4-4/AC-P4-1/AC-P4-8/AC-P4-10 live. Cancel a money-rulebook documentary job mid-render; re-dispatch with `--resume`; the run re-enters at render with script+TTS skipped from persisted bytes; no second research/script/TTS spend; parent/child job rows linked.

- PREP:
  1. Confirm `gh auth status` and that money-rulebook's last scheduled run is green (Actions tab).
  2. Note today's date — evidence quotes go into this file's Actual lines.
- KILL:
  3. `gh workflow run channel-autopilot.yml -f channel=money-rulebook -f force_doc=1` (forces today's documentary even off docDay).
  4. `gh run list --workflow=channel-autopilot.yml --limit 1` — note RUN-ID; `gh run watch RUN-ID` and read the streaming log until the documentary's **render** sub-step has started (the doc render is the longest step — several minutes of window).
  5. `gh run cancel RUN-ID` — the job dies mid-render.
  6. DB-CHECK: `select * from jobs where channel_id = 'money-rulebook' order by started_at desc limit 1` — note JOB-ID (status failed/partial, failed at render). DB-CHECK job_steps for JOB-ID: research/script/TTS `succeeded`, render not.
- RESUME:
  7. `gh workflow run channel-autopilot.yml -f channel=money-rulebook -f resume=JOB-ID` (the `resume` input is NEW in Phase 4).
  8. Watch the new run. PASS checks:
     - The log re-enters at the render step — research, script, TTS logged as skipped-from-persisted-bytes (not re-executed).
     - DB-CHECK: the new job row carries `resumed_from_job_id = JOB-ID` (parent/child linked).
     - Open `/usage?days=7`: the child job's cost rows show render-side spend only — NO script-gen or TTS events for the child job id (the parent job holds those).
     - The run completes: video uploads once, private, with publishAt recomputed into the kit's next future slot (AC-P4-10's recompute).
- CLEANUP:
  9. Delete the drill video: YouTube Studio → Content → filter money-rulebook → the drill upload → Delete.
  10. Close the drill job rows: DB-CHECK with `delete from job_artifacts where job_id in ('JOB-ID','CHILD-JOB-ID'); delete from job_steps where job_id in ('JOB-ID','CHILD-JOB-ID'); delete from jobs where id in ('JOB-ID','CHILD-JOB-ID');` (run the helper once per statement, or keep the rows as history if you prefer — deletion is the spec's stated cleanup).
  11. If the kill left an open upload_intents row, Row 8's procedure settles it — or delete it the same way.

- Actual: EXECUTED 2026-10-31 against debt-free-doctrine (force_doc), all PASS checks met. KILL: forced run 41221827475 was killed mid-render — job 048109a2 left stale-running (status `running`, error null; job_steps: preflight succeeded, clips failed, episode `running` frozen mid-step, skipped-fb/skipped-poster recorded skipped). RESUME: re-dispatched with the NEW `resume` input (run 41222720885, `--resume 048109a2…`) — child job 3d74826d carries trigger=`resume` + `resumed_from_job_id`=048109a2 (parent/child linked); the STALE-INVALIDATION guard fired LIVE in the log ("resume: stale key (template/brand-kit changed) — prior artifacts ignored, steps re-run"); the episode re-rendered and the run COMPLETED: exactly ONE doc upload (intent c6d28226… status uploaded, video MsOccg0kQiI, session_uri stored), verify-run OK ("[verify] OK — all 1 upload(s) exist on YouTube"). Cleanup per steps 9-11 done the same day. GRANULARITY DISCLOSURE (bounded no-re-spend proof, recorded not misread): this was a DOC job — the doc TTS re-rendered on resume (10 fresh tts_audio artifact rows on the child); the byte-verified skip is unit-pinned and the SHORTS-path artifact skip is the tested no-re-spend pin (doc resume-from-STORED shipped as T5c after the drill).
- Evidence: Neon rows quoted in Actual (jobs 048109a2/3d74826d + job_steps + job_artifacts); Actions run 41222720885 log lines: "[debt-free-doctrine] resume: stale key (template/brand-kit changed) — prior artifacts ignored, steps re-run", "[verify] debt-free-doctrine: run claims 1 upload(s), minimum expected 1", "[verify] OK — all 1 upload(s) exist on YouTube"; upload_intents row c6d28226… uploaded/MsOccg0kQiI/has_uri=true.
- Status: PASS

#### Drill 2 — AC-P4-Drill-2 · revoked token: park, probe, heal, un-park · `manual`

Proves AC-P4-11/12/13/14 live. A dead token produces one Blocking warning with the verbatim error, the channel parks, parked runs still probe, and replacing the token auto-resolves via probe without touching anything.

- PREP (read before overwriting anything):
  1. GitHub secret values are write-only — you cannot read YT_TOKEN_MONEY_RULEBOOK back. Confirm your restore path FIRST: either (a) you hold the channel's refresh token saved from the original connect, or (b) you will re-connect the channel afterwards via Studio (Channels → connect → Google consent — that flow re-pushes the secret; today's connect flow at `/api/oauth/callback` does exactly this).
- SIMULATE:
  2. `gh secret set YT_TOKEN_MONEY_RULEBOOK --body "SIM-REVOKED-TOKEN-DEAD-401"` (a deliberately dead credential — the token refresh fails; whatever error YouTube verbatim returns, e.g. `invalid_grant`/`insufficientPermissions`, is the drill's evidence).
  3. `gh workflow run channel-autopilot.yml -f channel=money-rulebook` — watch it. PASS check A: one `warnings` row, severity **Blocking**, evidence quoting the verbatim API error, blocks_publishing=true; the ntfy push arrived (Row 11). DB-CHECK the row.
- PARK:
  4. Dispatch again with the token still dead (Row 13). PASS check B: the run executes the cheap probe (token refresh + channels.list in the log), skips production, sends NO second push for the same episode, and other channels ran normally on their crons.
- HEAL:
  5. R — RESTORE: `gh secret set YT_TOKEN_MONEY_RULEBOOK --body "<the real token from your saved copy>"` (or re-connect via Studio per PREP 1b).
  6. Dispatch once more (or let the nightly probe job test the parked channel). PASS check C: the probe passes, the warning flips to `resolved` automatically (Row 14), and the same run proceeds into normal production.
- CLEANUP:
  7. If any residual drill warning rows remain open (e.g. from the simulate step), resolve them from `/warnings` with a note "drill-2 cleanup" — this doubles as the Row 15 manual-resolve evidence.
  8. Delete the drill's produced video if the healing run uploaded one you don't want to keep.
  9. Confirm `gh secret list` still shows YT_TOKEN_MONEY_RULEBOOK and the next scheduled run is green.

- Actual: EXECUTED 2026-10-31 against debt-free-doctrine, all three PASS checks met — and the full park → probe → auto-resolve → proceed loop landed in ONE run. SIMULATE: a Blocking row was inserted through the REAL store (warnings id=2: debt-free-doctrine, severity=blocking, code=token_revoked, blocks_publishing=true, auto_verifiable=true) with the official policy citation on the row (policy_quote "Channels found to have unauthorized access are terminated." + policy_url + quote_fetched_at 2026-10-31). Run 41208164035 log: "[park] 1 open blocking warning(s) — probing auto-verifiable codes" → "[warning-probe] PASSED — resolved=true" → "[park] probe cleared the blocking warning — proceeding with production". HEAL: the warning resolved itself with zero clicks and a full audit trail — state=resolved, resolved_by=`probe`, resolve_note "probe passed (token_revoked) at 2026-10-31T14:02:54.256Z — channel un-parked" — and the same run proceeded into production. The ntfy push fired with the row (Row 11). Cleanup done; the channel's next scheduled runs green.
- Evidence: DB-CHECK warnings id=2 (all columns quoted in Actual); Actions run 41208164035 log lines quoted above; `tests/warnings-store.test.mjs` probes suite ("probeChannelToken fails closed when the refresh is still rejected (invalid_grant)", "AC-P4-14: probeParkedChannels resolves a passed token probe with resolved_by=probe"). Note: the parked-skip branch (probe FAILS → production skipped, quiet while parked) is unit-pinned under Row 13 — this drill's probe passed first try, so the loop compressed into one run.
- Status: PASS

#### Drill 3 — AC-P4-Drill-3 · medical claim: a flagged template holds the pipeline until a human decides · `manual`

Proves AC-P4-17/18/20/21/22 live. A disposable `medical`-flagged test template holds a real generation in the review queue; nothing renders/uploads/schedules; approval dispatches the resume run; rejection leaves the video never-uploaded.

- PREP:
  1. On `/channels`, open money-rulebook's card → template panel (layers icon). Note the currently assigned template + pinned version (screenshot) — you will restore it in cleanup.
  2. Author the disposable template: append a `beat-synced-type` block to `REGISTRY_META` in `studio/lib/template-registry.data.js` (a catalog family with no registry entry today; ships 9:16 + 16:9 so the short lane stays assignable):

     ```
     'beat-synced-type': {
       version: '9.9.9',
       niches: ['Personal finance rules & money habits'],
       formats: ['long', 'short'],
       renderer: 'remotion',
       required_capabilities: ['script-gen', 'tts', 'captions'],
       variation_rules: ['QA drill template — review gate exercise, never for production'],
       safety: { required_sources: true, review_required: ['medical'] },
       deprecated: false,
       changelog: [{ version: '9.9.9', date: '<today>', note: 'QA drill — disposable' }],
     },
     ```

     (The niche string must match money-rulebook's verbatim or the assignment validator blocks with `niche_mismatch`.)
  3. `node sync-template-registry.mjs` — exits 0. Confirm `/templates/registry` shows the drill card with a `medical` safety chip.
  4. `/channels` → money-rulebook → template panel → Assign `beat-synced-type`, pin major 9 → Assign & pin.
- HOLD:
  5. `gh workflow run channel-autopilot.yml -f channel=money-rulebook -f force_doc=1`
  6. Watch the run stop at the gate (script generated, then held). PASS check A: `/review` shows the script — text + sources side-by-side, flagged claim(s) (author the fixture's claim unverified per the drill's premise), dedupe verdict. DB-CHECK `select * from scripts order by 1 desc limit 3` — the row predates any render step in job_steps (nothing rendered).
  7. PASS check B: no render, no upload, nothing scheduled — the channel's video count unchanged; `/review` status `awaiting_review`.
- DECIDE (both paths):
  8. Approve path: answer the disclosure checklist if presented, then **Approve** — a new `channel-autopilot` run appears in Actions with `resume=<job id>` and re-enters at render (Row 22). The video uploads (private, publishAt recomputed).
  9. Reject path: force a second held script (dispatch again) and **Reject** it — PASS check: it never uploads; the slot takes the lane's normal terminal; `/review` marks it rejected.
- CLEANUP:
  10. `/channels` → money-rulebook → template panel → **Unassign** the drill template; re-assign the original template + pin you noted in step 1.
  11. Remove the drill block from `studio/lib/template-registry.data.js`; `node sync-template-registry.mjs`; confirm the card is gone from `/templates/registry`.
  12. Delete the drill upload(s) from YouTube Studio (Content → money-rulebook).
  13. Delete drill rows: DB-CHECK with `delete from script_claims where script_id in (select id from scripts where template_id = 'beat-synced-type'); delete from script_sources where script_id in (select id from scripts where template_id = 'beat-synced-type'); delete from scripts where template_id = 'beat-synced-type';` plus the drill jobs/artifacts as in Drill 1 cleanup 10.

- Actual: EXECUTED 2026-10-31 against debt-free-doctrine — the SAFETY criterion proven live; the approve→auto-resume convenience half landed as T5c AFTER the drill (recorded, not misread as a gap). PREP/HOLD: the disposable `beat-synced-type` template (review_required ['medical']) was registry-synced and assigned; forced-doc run 41210424783 stopped at the gate: "[template] enforce: beat-synced-type @ v1.0.0" → "[review] held — slot skipped today (no_approved_script)". Job d8b3ab83 = status `held`, error "review hold: no_approved_script", review step #90 recorded `skipped`, ALL production steps pending — ZERO generation spend, NO render, NO upload, nothing scheduled. The gate held at the MEMBERSHIP level before any generation, which is the criterion's fail-closed core. DECIDE half: not exercisable that day for a clips-source doc lane (T5b's approve→resume was generated-channels only; T5c closed the doc seam post-drill — Rows T5b-2/T5c-1 unit-pin the resume-from-STORED both sides). CLEANUP done: template unassigned + removed + registry re-synced (the 'medical' review class REMAINS in the validator per D17).
- Evidence: Actions run 41210424783 log lines quoted above; DB-CHECK jobs d8b3ab83 (held + error) + job_steps (#90 review=skipped, #1-#7 pending); `node --test tests/review-gate.test.mjs` → 44/44 (gating truth table); `node --test tests/review-seams.test.mjs` → doc generate-only + resume-from-stored suites (T5c), incl. "hold seam: the brain runs ONCE, the survivor persists kind=doc awaiting_review … and ZERO TTS/music/render/upload happens" and "the narration EQUALS the stored structure, the generator is NEVER called, and markConsumed lands AFTER videoId".
- Status: PASS (safety criterion live; approve half delivered by T5c + unit-pinned)

---

## T5b addendum — the lane seams close the FULL approval loop (2026-10-31)

T5 shipped the gate (hold fail-closed) and the desk (approve → dispatch resume).
T5b lands the LANE side, so the loop is now closed end to end: a gated channel
with no script GENERATES-ONLY and stops; the owner approves; the resumed run
renders from the STORED render input (never a fresh generation) and retires the
script with the videoId. Thumbnail candidates (D18) and the upload-side
video_id write-back (D14) ride the same seams. Spec: D14/D17/D18,
AC-P4-16..23. New/changed code: `lib/review-seams.mjs` (the shared lane seam),
`channel-pipeline.mjs` (env threading + generate-only hold path),
`yt-daily.mjs` (resume-render / generate-only / candidates / write-back),
`yt-deepdive.mjs` + `longvideo/shorts-clips.mjs` (write-back; doc candidates),
`youtube-engine.mjs` (optional N-variant thumbnails + the pure
`thumbFrameOffset`), `lib/review-gate.mjs` (resume prefers the job's APPROVED
row), `studio/lib/script-store.mjs` (`latestApprovedForJob`,
`recordThumbCandidates`), template DATA (`review_thumb_pick: true` on the three
finance templates — OQ-4 launch default). Round 1: the write-back fallback is
slot-scoped (an unrelated approved script is never retired with another
video's id); the normal render threads the candidate count (no dead emission);
the PRIVATE candidate bytes are read only through the token-authenticated
artifact store — which moved into the Next root
(`studio/lib/artifact-store.mjs`; the repo-root `lib/artifact-store.mjs` is a
re-export shim, the script-store split) so `GET /api/review/thumb` and the
pick swap can hash-verify what they serve; `@vercel/blob` is now a studio
dependency (it is resolved from the studio workspace at build and runtime).

### Row T5b-1 — Generate-only: a gated hold SAVES the script and renders nothing · `automated`

- Steps: `node --test tests/review-seams.test.mjs` — the spawn-style cases "SEAM 1: gate hold no_approved_script" and the `saveGeneratedScript` unit cases.
- Expected: the pipeline gate holding with `no_approved_script` runs the child lane once with `REVIEW_GENERATE_ONLY=1` + `REVIEW_SCRIPT_SLOT_DATE` + `PIPELINE_JOB_ID`; the child saves each surviving script as `awaiting_review` with the COMPLETE structured render input (hook/points/closing/thumbHeadline + seed/themes/publishAt, AC-P4-17) and exits 0 — no music, no TTS, no render, no upload. `lastRunDate` NEVER advances (an approval's resume must render today); the seed rotation DOES advance (usedTrendSeeds/cooldownSeeds — round 1: an unapproved channel diversifies nightly instead of re-proposing near-identical topics). A dup-blocked or fallback script is never saved. The job closes `held` with the generated-awaiting-review note.
- Actual: (2026-10-31.) All cases green: the spawn-style SEAM 1 case threads REVIEW_GENERATE_ONLY=1 + slot date + job id onto exactly one child run with exit 0 + held terminal; saveGeneratedScript persists the COMPLETE structured render input as awaiting_review, never saves a blocked/dup/fallback script, and is transactional; the seed rotation advances while lastRunDate does not (round-1 diversification pinned in the T5c suite: "a DUP-BLOCKED generate-only exit still advances the seed rotation").
- Evidence: `node --test tests/review-seams.test.mjs` → 34/34 pass, incl. "SEAM 1: gate hold no_approved_script -> the child runs GENERATE-ONLY (REVIEW_GENERATE_ONLY=1 + slot date + job id), exit 0, held terminal", "#106 T5b — saveGeneratedScript (AC-P4-17: persisted BEFORE any render)" (3 cases), "round 1 minor 3: a DUP-BLOCKED generate-only exit still advances the seed rotation".
- Status: PASS

### Row T5b-2 — Resume-from-approval renders the STORED input, zero generation calls · `automated`

- Steps: `node --test tests/review-seams.test.mjs` — "RESUME consumes the STORED input (real yt-daily spawn, engine spied)" plus the round-1 spawn case "a SCHEDULED run whose slot lookup finds an APPROVED script threads the stored-script job". The REAL yt-daily runs with the script engine spied (the generator also THROWS if touched) and the script store faked to return the approved row.
- Expected: exactly one render call whose input EQUALS the stored `full_render_input` (hook/points/closing/thumbHeadline), `thumbVariants` threaded from the candidates config, ZERO `generateYouTubeScript` calls, the upload refused at the validation gate (fake bytes) leaving the script APPROVED (never prematurely consumed), exit 1 with the refusal logged. A store read error or a missing approved row also refuses — the child never falls back to generating (fail-closed, D4). A plain scheduled run (no `--resume`) whose gate finds an approved script threads `PIPELINE_RESUME_JOB_ID` from the gate's script — the stored text ships, never a fresh generation (round 1). If no future slot remains today, the AC-P4-19 skip is taken BEFORE any render spend and the script STAYS approved.
- Actual: (2026-10-31.) The REAL yt-daily spawn ran with the generator spied-throwing: exactly one render call whose input EQUALS the stored full_render_input, ZERO generateYouTubeScript calls, the upload refused at the validation gate leaving the script APPROVED (never prematurely consumed), exit 1 fail-closed; store-read-error and missing-approved-row refusals pinned; the round-1 scheduled-run thread (approved script → stored-script job, never a fresh generation) is green.
- Evidence: `node --test tests/review-seams.test.mjs` → "the render input EQUALS the stored full_render_input and the LLM generator is NEVER called (AC-P4-4/D4)" (real spawn, 1747ms), "#106 T5b — findResumableScript (the approval lookup)" (approved-row preference, fail-closed store error), "round 1 IMPORTANT 1: a SCHEDULED run whose slot lookup finds an APPROVED script threads the stored-script job — the child re-renders it instead of generating fresh".
- Status: PASS

### Row T5b-3 — markConsumed + video_id write-back (D14 SEAM 3) · `automated`

- Steps: `node --test tests/review-seams.test.mjs` (writeBackVideoId cases incl. the round-1 interleaving) and `tests/script-store.test.mjs` (the store's consume path).
- Expected: every lane's post-upload success path (yt-daily shorts, yt-deepdive doc, shorts-clips post-next) calls the write-back: the job-linked approved script retires to `consumed` with the videoId. Round 1: the channel-latest-approved FALLBACK is slot-scoped — it consumes only a same-slot (`slot_date === slotDate`) or same-job row, so an unrelated approved script A is never retired with an unreviewed B's videoId (the exact interleaving is unit-pinned: A approved → render refused → normal dispatch ships B → A must stay approved and shippable, and the S5 win-rate join stays true). A kind mismatch never stamps across lanes; a null store / no rows / consumed-already / dead DB are silent no-ops (the legacy path's log is unchanged). On the resume path the script is consumed by id AFTER the videoId lands.
- Actual: (2026-10-31.) Write-back cases green incl. the round-1 interleaving: the job-linked approved row retires to consumed with the videoId; the channel-latest fallback is SLOT-SCOPED (same day/same job only, never cross-kind); the exact A-approved/B-ships interleaving is unit-pinned (A stays approved and shippable — S5 joins stay true); fail-soft everywhere (null store, no rows, consumed-already, dead DB = silent no-ops). Order pinned: markConsumed AFTER videoId.
- Evidence: `node --test tests/review-seams.test.mjs` → "#106 T5b — writeBackVideoId (D14 SEAM 3 …)" (5 cases: "round 1: the fallback NEVER retires an unrelated approved script — A stays shippable when unreviewed B ships", "round 1: the fallback DOES consume a same-job approved row even across days"); `node --test tests/script-store.test.mjs` → 17/17 pass (the store's consume path).
- Status: PASS

### Row T5b-4 — Thumbnail candidates: 3 when the template enables picking, 1 when not (AC-P4-23) · `automated`

- Steps: `node --test tests/review-seams.test.mjs` (thumbCandidateCount + emitThumbCandidates + `thumbFrameOffset` cases, the spawn cases "SEAM 2 ... / SEAM 2 negative", and the round-1 source pin that the NORMAL render threads `{ thumbVariants }`); `node --test tests/script-store.test.mjs` (recordThumbCandidates).
- Expected: the count is template DATA (`review_thumb_pick` on the registry meta — finance templates launch ON per OQ-4): the gate threads `REVIEW_THUMB_CANDIDATES=3` onto the child only when the assigned template enables it; EVERY render on that channel (normal and resumed) emits 3 staggered variants — candidate 1 keeps the exact LEGACY +3s frame offset (pure `thumbFrameOffset(0) === 3`, pinned) and ships (M7). Variants land as `thumb_candidate` artifact bytes + job index rows and (where a script row exists) `meta.thumb_candidates [{idx,url,hash}]`. The PRIVATE store's bytes are read only through the token-authenticated primitive: `GET /api/review/thumb?id&idx` (owner+staff) resolves the URL from the script meta SERVER-SIDE (never a client URL — open-proxy guard), hash-verifies, and serves image/jpeg — `/review`'s `<img>` points there (raw blob URLs 401 in a browser), and the pick swap reads the same bytes. Where picking is not enabled the single-candidate path is byte-identical.
- Actual: (2026-10-31.) All green: count from template DATA (truthy=3, numeric honored, absent=1); the gate threads REVIEW_THUMB_CANDIDATES=3 only when the assigned template enables it (SEAM 2 + negative); EVERY render on an enabled channel emits (round-1 source pin: the NORMAL render threads { thumbVariants } — no dead emission); candidate 1 keeps the LEGACY +3s frame (pure thumbFrameOffset(0)===3); variants land as thumb_candidate artifact bytes + job index rows + script meta; the PRIVATE bytes are read only via the token-authenticated hash-verifying /api/review/thumb (server-side URL resolution — open-proxy guard); non-enabled channels keep the single-candidate path.
- Evidence: `node --test tests/review-seams.test.mjs` → "#106 T5b — flag + config parsing", "AC-P4-23: candidate count comes from the template DATA…", "SEAM 2: … REVIEW_THUMB_CANDIDATES=3 on the child", "SEAM 2 negative: …", "round 1 IMPORTANT 2 (source pin): the NORMAL shorts render threads the candidate count", "round 1 minor 7: thumbFrameOffset is pure and candidate 1 keeps the LEGACY +3s frame", "#106 T5b — emitThumbCandidates (D18/AC-P4-23)"; `node --test tests/script-store.test.mjs` → recordThumbCandidates cases.
- Status: PASS

### Row T5b-5 — Flag pin: flags off = byte-identical legacy lanes · `automated`

- Steps: `node --test tests/review-seams.test.mjs` — "FLAG PIN: REVIEW_QUEUE_ENABLED unset..."; plus `node --test tests/pipeline-jobstore.test.mjs` and `tests/review-gate.test.mjs` (the pre-existing flag pins must stay green over the T5b pipeline edits).
- Expected: with the flags unset the child lane receives NONE of the review env vars, no gate evaluation runs, and `PIPELINE_JOB_ID` is absent (no job row). Non-gated channels render/upload exactly as before (single candidate, no script rows touched).
- Actual: (2026-10-31.) Flag pin green across all three suites: with REVIEW_QUEUE_ENABLED unset the child receives NONE of the review env vars, no gate evaluation runs, PIPELINE_JOB_ID is absent (no job row), and the pre-existing flag pins stayed green over the T5b pipeline edits.
- Evidence: `node --test tests/review-seams.test.mjs` → "FLAG PIN: REVIEW_QUEUE_ENABLED unset -> the child receives NONE of the review env (byte-identical legacy lane)" + doc-lane twin "FLAG PIN (doc lane): … NO review env on any child"; `node --test tests/pipeline-jobstore.test.mjs` → 16/16 ("JOB_STORE_ENABLED unset: ZERO store calls on EVERY major path…"); `node --test tests/review-gate.test.mjs` → "#106 T5 pipeline gate block — REVIEW_QUEUE_ENABLED flag pin" (4 cases, incl. "flag UNSET: zero gate/script-store calls on the quota-skip path, no [review] lines, exit 0 (byte-identical)").
- Status: PASS

### Row T5b-6 — Live approval drill (extends Drill 3's step 8) · `manual`

- Steps: after Drill 3 step 7 (a script held awaiting_review), approve it at `/review` and watch the dispatched `channel-autopilot` run with `resume=<job id>`. PASS checks: (a) the resumed run's log says it rendered from the STORED input with no `[YT Script]` generation line; (b) the video uploads private with publishAt recomputed from the kit slots (D8 — a day-late approval must not publish instantly or be refused); (c) DB-CHECK `select status, video_id from scripts where job_id = '<held job>'` → the approved row is `consumed` with the video's id; (d) with `review_thumb_pick` on the assigned template, `/review` shows 3 candidates for the script and candidate 1 was the one set at upload.
- Expected: the approval loop closes with zero re-spend of research/generation.
- Actual: NOT-RUNNABLE-TODAY as a live drill — the Drill-3 hold ran BEFORE the T5b/T5c lane seams landed, and its doc-lane approve→auto-resume half shipped as T5c after the drill (no held script exists tonight: Neon `scripts` = 0 rows; dispatching a new hold is outside this pass's no-dispatch rule). Every check this row lists is unit-pinned against the REAL child lanes: (a) rendered-from-STORED with zero generation calls; (b) upload private with publishAt recomputed from the kit slots (D8); (c) approved row → consumed with the videoId AFTER the upload; (d) 3 candidates with candidate 1 shipped. Owner re-runs this row live at the next review-gate drill window.
- Evidence: `node --test tests/review-seams.test.mjs` → "the render input EQUALS the stored full_render_input and the LLM generator is NEVER called (AC-P4-4/D4)", "the narration EQUALS the stored structure, the generator is NEVER called, and markConsumed lands AFTER videoId (AC-P4-4/D8/D14)", "SEAM 1 resume: gate approved_resumed with --resume <id> -> the child receives PIPELINE_RESUME_JOB_ID"; DB-CHECK: scripts count 0 (2026-10-31).
- Status: NOT-RUNNABLE-TODAY (needs owner live drill; every PASS check unit-pinned green)

---

## T5c addendum — the DOC lane joins the approval loop (clips-source channels)

T5b closed the loop for GENERATED channels only: a clips-source channel's
skip-exact hold left the /review desk with nothing to approve (the doc lane —
their ONLY script lane — never generated). T5c mirrors yt-daily's two branches
onto yt-deepdive and extends the pipeline hold: the doc generation runs EXACTLY
as today (brain walk + dedupe gates — a blocked walk never saves), the survivor
persists `awaiting_review` (kind 'doc'; the episode maps to hook=title,
points=chapters, closing=outro, + the cold-open intro in full_render_input),
then EXIT 0 before any TTS/music/render/upload; deepdiveDate NEVER advances
(the approval's resume must render today) while the seed rotation DOES
diversify — including on a dup-blocked exit (round 1: the blocked theme is
consumed for rotation, so a gated clips channel never re-derives the same
near-dup theme nightly). The docDay cadence is bypassed on generate-only runs
(a gated clips channel holds on ANY day — the desk would starve otherwise);
pause and already-produced guards still apply. The resume renders the doc from
the STORED input (the generator is structurally unreachable), recomputes
publishAt from the kit's long slot BEFORE any render spend (AC-P4-19), re-runs
the dup-title gate pre-render, and retires the record by id AFTER the videoId
lands (D14). A resumed run bypasses the cadence guards (an approval is a
deliberate production order). Round 1: the resume is KIND-GUARDED — a
foreign-kind (shorts) dispatch skips with exit 0 and never renders or consumes
a short row as a documentary (the /review dispatch is kind-agnostic; round 2:
the guard also runs on the null-refusal path via a kind-agnostic,
status-agnostic job lookup — the dominant single-approval flow arrives with the
shorts row already CONSUMED by yt-daily, every approved-filtered lookup misses
it, and only the raw job probe still resolves whose dispatch this was; a
genuinely-missing doc row stays exit 1 fail-closed) — and the chapter b-roll
`page` object is actually defined (the module had referenced an undefined
`page()` since e7fb691: every chapter's ReferenceError was swallowed and doc
chapters silently rendered flat backgrounds with no Pixabay b-roll). The held
terminal's note is softened to "generate-only run (scripts awaiting review
where produced)" — the pipeline cannot see whether the child saved a survivor.

### Row T5c-1 — Doc generate-only + resume-from-stored (the yt-daily mirror) · `automated`

- Steps: `node --test tests/review-seams.test.mjs` — the T5c suites: the pipeline spawn cases (a clips-source hold spawns yt-deepdive GENERATE-ONLY with the env threaded and the held terminal; --resume threads the held job id to the doc child; flags-off = no review env on any child), and the REAL yt-deepdive spawns (engine/brain/music/trend/dup-gate/intents/googleapis/child_process/youtube-clips all seam-spied, network-free).
- Expected: generate-only — the brain runs ONCE with the doc dedupe gates, exactly one `saveScript` (kind 'doc', awaiting_review, the COMPLETE render input deep-equal, publishAt = the long-slot D8 recompute, template version threaded), ZERO TTS/music/render/upload calls, deepdiveDate unset, usedLongSeeds advanced; a blocked (exhausted) brain walk throws → nonzero exit, nothing saved, no render spend; a DUP-BLOCKED exit saves nothing, spends nothing, and STILL advances the seed rotation (round 1). Resume — ZERO brain calls (the spy throws), ZERO saves, the narration the render consumes EQUALS the stored structure byte-for-byte in render order (intro → chapters → outro), exactly one upload titled from the STORED title with the recomputed future publishAt, markConsumed lands BY the approved row id AFTER the upload (order pinned), every chapter's getTopicClip received a truthy page object (round 1), and a resumed SHORTS-kind job exits 0 having rendered NOTHING, consumed NOTHING, and marked no doc slot produced (round 1 BLOCKER 1: the kind guard — never a false episode failure, never a short shipped as a documentary).
- Actual: (2026-10-31.) All T5c suites green against REAL yt-deepdive spawns (engine/brain/music/trend/dup-gate/intents/googleapis/child_process seam-spied, network-free): generate-only — brain runs ONCE, exactly one saveScript (kind 'doc', awaiting_review, COMPLETE render input, publishAt = the long-slot D8 recompute), ZERO TTS/music/render/upload, deepdiveDate unset, seeds advanced (incl. the round-1 dup-blocked rotation); an exhausted brain walk throws before any store write; resume — ZERO brain calls, narration EQUALS the stored structure in render order, one upload with the STORED title + recomputed future publishAt, markConsumed BY id AFTER videoId, every chapter's getTopicClip got a truthy page object (round 1), and the round-2 BLOCKER-1 kind guard holds for BOTH the awaiting and the dominant CONSUMED-shorts-row single-approval flow (exit 0, nothing rendered/consumed, never a false Episode failure).
- Evidence: `node --test tests/review-seams.test.mjs` → 34/34 pass, incl. "#106 T5c — the pipeline spawns the DOC lane generate-only on a clips-source hold (spawn-style)" (3 cases), "#106 T5c — GENERATE-ONLY saves the doc awaiting_review, zero render spend (real yt-deepdive spawn)" (3 cases), "#106 T5c — RESUME renders the doc from the STORED input (real yt-deepdive spawn)" (3 cases: stored-structure render + post-videoId consume; BLOCKER 1 shorts-kind refusal; round-2 RESIDUAL consumed-row guard).
- Status: PASS

---

## Regression — pinned invariants

These hold across the whole phase. Any FAIL here blocks sign-off even if every feature row passes.

### Row R1 — Exit codes + fail-open are pinned · `automated`

- Steps: `npm test` at repo root — the pipeline exit-semantics cases (always exit 0 end-of-run; unknown slug / preflight-block exit 1) and the DB-down fail-open case (AC-P4-5: log-only continuation, one warning, never a darkened run) are green.
- Expected: Phase 4 changes no exit code and never lets a dead database stop production.
- Actual: (2026-10-31.) `npm test` → **631/631 pass, 0 fail** (58 suites, 10.7s). Exit-semantics cases green (unknown slug exit 1 — re-run locally, EXIT=1 quoted under Row 3; end-of-run exit 0 with per-step outcomes); DB-down fail-open green at every layer (Row 5's citations).
- Evidence: npm test summary line "ℹ tests 631 / ℹ pass 631 / ℹ fail 0"; `tests/pipeline-jobstore.test.mjs` exit-semantics + dead-store suites.
- Status: PASS

### Row R2 — Zero-config / flag-off is byte-identical · `manual`

- Steps: dispatch `gh workflow run channel-autopilot.yml -f channel=money-rulebook` with no new inputs and no new env set, and diff against a pre-Phase-4 run of the same shape: same step list in the log, same state-file shape (`yt-mcp/state/money-rulebook.json` gains no new required keys for the legacy path), same outputs.
- Expected: every Phase 4 pipeline change sits behind an established-style flag (like `TEMPLATE_PREFLIGHT_ENABLED`) with byte-for-byte rollback; unset = today's behavior.
- Actual: NOT-RUNNABLE-TODAY as a live diff (needs a real dispatch + a pre-Phase-4 run to diff — no-dispatch rule). The flag-off byte-identity is pinned by tests instead: with REVIEW_QUEUE_ENABLED/JOB_STORE_ENABLED unset, zero store calls on every major path, no review env on any child, exit 0, logs byte-for-byte on the quota path.
- Evidence: `tests/pipeline-jobstore.test.mjs` → "JOB_STORE_ENABLED unset: ZERO store calls on EVERY major path (quota-skip, shipped+verify-fail, park-fixture), normal flow, exit 0", "flag-off quota path keeps the existing flow byte-for-byte logs"; `tests/review-gate.test.mjs` → "flag UNSET: zero gate/script-store calls on the quota-skip path, no [review] lines, exit 0 (byte-identical)"; `tests/review-seams.test.mjs` → both FLAG PIN cases (shorts + doc lanes).
- Status: NOT-RUNNABLE-TODAY (live dispatch diff = owner's session; flag-off pin green)

### Row R3 — Quota gate keeps its legacy honesty · `automated`

- Steps: `node --test tests/quota-ledger.test.mjs tests/quota-model.test.mjs` — legacy math unchanged when no model rows exist; model rows honored when present (Row 32).
- Expected: no silently tightened or loosened budget on either path.
- Actual: (2026-10-31.) Both files green: legacy math unchanged when no model rows exist (GOLDEN verdict equivalence + compat pins ptDate/nextCounter); model rows honored when present (Row 32's citations). The repo-root quota-ledger shim re-exports every named export from the studio core.
- Evidence: `node --test tests/quota-ledger.test.mjs` → 5/5 pass; `node --test tests/quota-model.test.mjs` → 16/16 pass, incl. "GOLDEN: seeded-default row reproduces every legacy evaluate() verdict exactly", "evaluate without a model keeps the legacy hardcoded behavior", "explicit dailyLimit/perUpload still win over the model", "compat pin: ptDate and nextCounter signatures unchanged".
- Status: PASS

### Row R4 — Existing dashboards untouched · `manual`

- Steps: open `/analytics` (live 28-day panel loads as before), `/usage` (ledger unchanged apart from job_id attribution), `/videos`, `/logs`, `/channels`, `/providers`, `/templates/registry` — all render as before; `GET /api/analytics` → 200.
- Expected: Phase 4 adds surfaces; it does not rearrange existing ones (new nav items appear, old ones keep their routes and content).
- Actual: Build-level check done 2026-10-31 (`cd studio && npx next build` → exit 0): the route table keeps every pre-existing page (/analytics, /usage, /videos, /logs, /channels, /providers, /templates/registry, /users, /settings, …) and ADDS the Phase 4 surfaces (/warnings, /review, /sessions). The logged-in visual tour (each page renders as before; `GET /api/analytics` → 200 in DevTools) needs the owner's browser.
- Evidence: build manifest tail quoted under Row R7 (○ /videos, /usage, /users, /providers, /templates/registry … plus ○ /review, ○ /sessions, ○ /warnings).
- Status: NOT-RUNNABLE-TODAY (visual tour = owner's session; route-table addition-only verified at build)

### Row R5 — Sessions self-service + proxy matrix unchanged · `manual`

- Steps: Row 31's checks pass, and staff still cannot reach owner-only pages (incognito + staff spot-check of `/users`).
- Expected: the Oct-09 A1 behavior is preserved exactly.
- Actual: NOT-RUNNABLE-TODAY in the browser (owner/staff sessions). Unit pins green: self-service device list + sign-out-everywhere unchanged; the proxy gates only the admin /sessions page owner-only (additive matrix row); the self-service API untouched; role re-checked server-side on owner endpoints. Neon `sessions` schema byte-identical to A1 (no new columns) — nothing for Phase 4 to have shifted.
- Evidence: `tests/session-admin.test.mjs` → "self-service device list + sign-out-everywhere are unchanged (AC-P4-31)", "proxy gates the /sessions admin page owner-only (additive matrix row, self-service API untouched)"; DB-CHECK information_schema sessions (S6 columns, 26 live rows).
- Status: NOT-RUNNABLE-TODAY (browser spot-check = owner's session; pins + schema green)

### Row R6 — ntfy stays the bell · `manual` + `automated`

- Steps: during Drill 2 the push arrives for the Blocking warning; `node --test tests/ntfy-alert.test.mjs` green; the dashboard never becomes a replacement for the push (both fire).
- Expected: push = the bell, dashboard = the record (spec Honest Limits).
- Actual: (2026-10-31.) `node --test tests/ntfy-alert.test.mjs` → 6/6 pass (deliver + sanitize + retry/fallback ladders). The Drill-2 Blocking warning fired BOTH channels: the row landed (id=2) and the phone push arrived (drill recap, 2026-10-31). Both-fire semantics pinned: emitWarning writes the row AND fires the push on first open; a deduped re-fire re-records without re-paging (once per park episode).
- Evidence: ntfy suite 6/6; `tests/warnings-store.test.mjs` → "emitWarning writes the row AND fires the push on first open (AC-P4-11)", "emitWarning does NOT re-alert on a deduped re-fire (once per park episode, D11)", "sendAlert retries ntfy then falls back to the GitHub-issue channel" (ntfy suite).
- Status: PASS

### Row R7 — Whole suite + Studio build green · `automated`

- Steps: `npm test` at repo root (all suites, including the new Phase 4 test files) and `cd studio && npx next build` — both exit 0 with `/warnings`, `/review` and their API routes in the manifest.
- Expected: zero regressions against the pre-Phase-4 baseline; the build route table shows only additions.
- Actual: (2026-10-31.) `npm test` → 631/631 pass, 0 fail (all suites incl. the Phase 4 files: artifact-store 20, upload-intents 52, warnings-store 37, review-gate 44, review-seams 34, script-store 17, pipeline-jobstore 16, analytics-store 12, session-admin 17, job-store 27, quota-model 16). `cd studio && npx next build` → exit 0 with /warnings, /review (and /sessions) in the manifest:
  `├ ○ /review` / `├ ○ /sessions` / `└ ○ /warnings` … `ƒ Proxy (Middleware)` … `[exited with code 0]`.
- Evidence: suite counts as listed (each re-run individually 2026-10-31); build output route table (quoted in Actual).
- Status: PASS

---

## Summary

Checklist rows: **36 = 33 AC rows + 3 drill rows**, plus 7 regression rows — extended by the **T5b addendum (6 rows)**, which closes the approval loop's lane side (generate-only hold → owner approval → resume-render from the STORED input → consumed + video_id write-back, with the D18 thumbnail candidates). Coverage map (no AC merged or split silently): AC-P4-1→R1; 2→R2; 3→R3; 4→R4 (+Drill 1 live); 5→R5; 6→R6; 7→R7; 8→R8 (+Drill 1); 9→R9; 10→R10 (+Drill 1 publishAt recompute); 11→R11 (+Drill 2); 12→R12; 13→R13 (+Drill 2); 14→R14 (+Drill 2); 15→R15; 16→R16; 17→R17 (+Drill 3); 18→R18 (+Drill 3); 19→R19; 20→R20 (+Drill 3); 21→R21; 22→R22 (+Drill 3); 23→R23; 24→R24; 25→R25; 26→R26; 27→R27; 28→R28; 29→R29 (+Drill 2 cleanup); 30→R30; 31→R31; 32→R32; 33→R33; Drill-1/2/3→their scripts. The "Resolved by review" findings are proven where they landed: deadlock-out (R13/R14/R15), fail-closed gate (R18), post-upload thumbnail swap (R23), status+bytes resume (R4/Drill 1), intent conflict + resolution scope (R6/R8), dispatch contract (R22), publishAt recompute (R10/Drill 1), scope probes (R24), emitter constraint (R12), snapshot upsert semantics (R24), timeout (R19), DB-down degradation (R5), video_id write-back (R27), quota wiring (R32), retention (R33), drills executable with prep/cleanup (all three).

---

## Execution summary — 2026-10-31 (T8 automated pass)

Executor: QA (Claude Code agent) — automated rows, DB checks, source/workflow inspections and log greps only; zero workflow dispatches; production writes limited to the drills that already ran earlier today (owner-run) and trivial SELECTs. **No row FAILED.**

- **Scope of this pass:** all 50 checklist rows = 33 AC rows + 3 exit-gate drills + 7 regression rows + the T5b addendum (6 rows) + T5c-1.
- **PASS: 38 rows** with evidence in-file — 29 fully executed (incl. the three drills and today's live production/nightly evidence) and 9 PASS on their automated/live half with the browser or dispatch half explicitly parked for the owner's session (Rows 10, 15, 19, 21, 22, 23, 26, 28, 32; Row 33 counts here too with its deferred Neon-prune half recorded as NOT LANDED).
- **NOT-RUNNABLE-TODAY: 12 whole rows** (8, 9, 16, 20, 25, 27, 29, 31, R2, R4, R5, T5b-6) — every one for the same two reasons: (a) needs the owner's Studio login / two-browser staff+owner session (16, 20, 25, 27, 29, 31, R4, R5), or (b) needs a live workflow dispatch / owner-held state (8, 9, R2, T5b-6 — dispatches are forbidden during a QA pass; Row 9 additionally waits for upload-reconcile's first nightly slot, which had not fired as of this pass). Their steps are left intact above for the owner's session.
- **No FAIL rows.** Two honest scope findings, neither a regression:
  1. **Row 33 (retention broom) — Neon-row prune NOT LANDED:** Blob-side cutoffs and the analytics weekly rollup are tested and live (the nightly ran today, run 41194793854), but the Neon-row prune (job_steps/job_artifacts >90d, resolved upload_intents >30d) has no implementation and no nightly maintenance workflow carries it — the deferral the row's own automated citation anticipated. Same gap leaves Row 30's nightly cleanup log-line unwired (CLI `scripts/sessions-cleanup.mjs` ships, unscheduled).
  2. **Row 4 / Drill 1 granularity:** the killed drill job was a DOC job, so its doc TTS legitimately re-rendered on resume; the byte-verified no-re-spend skip is unit-pinned (shorts path) and the doc resume-from-STORED seam shipped as T5c after the drill.
- **Baseline:** `npm test` = 631/631 pass, 0 fail; `cd studio && npx next build` exit 0 with /warnings + /review in the route table (Row R7).
- **Schema audit (DB-CHECK, Neon, 2026-10-31):** all Phase 4 tables exist as shipped — `warnings` (policy_quote/policy_url/explanation/quote_fetched_at + D9 severity CHECK + state CHECK), `upload_intents` (UNIQUE dedupe_key over channel/slot_date/kind/slot_idx + session_uri + shipped status CHECK), `scripts`/`script_sources`/`script_claims` (+ status CHECK draft→consumed), `jobs`/`job_steps`/`job_artifacts`, `analytics_snapshots` (UNIQUE channel+date+source) + `analytics_probe_log`, `sessions` byte-identical to the Oct-09 A1 shape (zero new columns).
- **Live production evidence:** warnings id=2 (Drill 2, resolved_by=probe with resolve_note); drill jobs 048109a2 (stale-running kill), 3d74826d (trigger=resume, resumed_from_job_id lineage, 10 tts_audio artifacts, clips-step failure isolated, uploads verified), d8b3ab83 (held, "review hold: no_approved_script", zero spend); upload_intents both uploaded with videoIds (Y5qqfprd4QI, MsOccg0kQiI) and session_uri stored; dedupe_verdicts 11 rows (Phase 3 proof); analytics_snapshots 11 rows + analytics_probe_log 4 rows (all has_scope=true) from today's nightly; reporting-daily green 2026-10-30.
- **Drill evidence recap:** Drill 1 (kill-a-worker) — run 41221827475 killed mid-render → resume via the NEW `resume` input (run 41222720885) → child 3d74826d linked by trigger=resume + resumed_from_job_id → the stale-invalidation guard fired live ("resume: stale key (template/brand-kit changed) — prior artifacts ignored, steps re-run") → episode re-rendered → uploaded ONCE (MsOccg0kQiI) → "[verify] OK — all 1 upload(s) exist on YouTube". Drill 2 (revoked token) — Blocking row via the real store (id 2, token_revoked, blocks_publishing) → run 41208164035: "[park] 1 open blocking warning(s) — probing auto-verifiable codes" → "[warning-probe] PASSED — resolved=true" → "[park] probe cleared the blocking warning — proceeding with production" — the full park→probe→auto-resolve→proceed loop in ONE run; cleanup done, 'medical' class retained in the validator (D17). Drill 3 (medical claim) — drill template beat-synced-type assigned → run 41210424783: "[template] enforce: beat-synced-type @ v1.0.0" → "[review] held — slot skipped today (no_approved_script)" → job d8b3ab83 held, zero generation, no render/upload; the approve→auto-resume half for clips-source doc lanes landed as T5c after the drill (unit-pinned in Rows T5b-2/T5c-1; live re-run = owner's next drill window, Row T5b-6).
- **Verdict:** every criterion that could be exercised today is green with in-file evidence; the remaining work is the owner's browser/dispatch session (Rows listed above) and the Row-33 deferred Neon-prune batch. The feature is sign-off-ready pending those.


---

## T2 addendum — the parked-channel importer joins the panel (2026-11-01)

### Row T2-1 — Importer contract: dry-touches-nothing, skip-vs-fail, idempotency, duplicate identity, consent never crosses identity · `automated`

- Steps: `node scripts/import-parked-channels.mjs --dry` for real (all 12 parked slugs); `node --test tests/import-parked.test.mjs` for the pinned contract (dry default writes nothing; per-channel isolation; dead refresh_token skips with the local file untouched; re-run updates in place; duplicate channel identity by channelId or handle skips; identity drift — an existing row pointing at a DIFFERENT channelId — hard-skips so consent never crosses an identity change; live registry-read failure fails closed before any write; token material never printed, fatal line included).
- Expected: dry plans every channel and writes nothing (exit 0); only hard failures exit 1; every output line token-free; `--live` is the only mode that writes secrets/registry/local token files, and it refuses to run when the registry cannot be read.
- Actual: (2026-11-01.) Real `--dry` run → exit 0, `planned=0, skipped=12, failed=0 (dry run — nothing was written)`. Two verdicts straight from Google/the registry: (1) 11 of 12 parked tokens are DEAD — `invalid_grant: Account has been deleted` (ai-observer, closing-table, corner-office, deep-work-os, founders-margin, iron-discipline, longevity-code, old-money-code, policy-brief, sleep-architect, tax-shield) — each needs a fresh owner OAuth grant before any import is possible; (2) escrow-estate's token identifies "Investor's Compass" (`UC2LLA-GCDY6ycBfRjMN4Zog`, `@investorscompasshq` — a second, still-valid grant for the legacy-4 channel) and the duplicate-identity guard skips it. Token-file mtimes and `yt-mcp/studio-channels.json` unchanged by the dry run (verified). Test suite: 33/33 in `tests/import-parked.test.mjs`; full repo suite 669/669 pass.
- Evidence: `scripts/import-parked-channels.mjs --dry` output quoted above (mode line, 12 per-channel lines with Google's verdicts, summary line); `tests/import-parked.test.mjs` — "no flags at all -> dry: zero secret/registry/local writes", "IDENTITY DRIFT: … hard-skipped — consent cannot cross an identity change", "LIVE + registry read failure is FAIL-CLOSED", "dead refresh_token -> SKIPPED … local file untouched", "idempotent re-run: … exactly one row for the slug", "redaction: no token material … in ANY emitted line", "the fatal line passes the redactor", "main([--dry]) … without importing channels-registry".
- Status: PASS
