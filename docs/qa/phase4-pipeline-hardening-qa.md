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
- Actual:
- Evidence (screenshot/output path):
- Status:

#### Row 2 — AC-P4-2 · every produced file is indexed by its content hash · `automated`

Verify: when a step finishes it updates its status and writes one `job_artifacts` row (content hash + location) per produced file, and producing the same file again yields the SAME hash with no duplicate row.

- Steps:
  1. After Row 1's run, DB-CHECK: `select * from job_artifacts where job_id = '<job id>'` — one row per produced artifact (render/thumb/audio/script-payload), each with a sha256 content hash and a location.
  2. Automated (same-hash/no-duplicate is a determinism claim — unit-test it, don't eyeball it): `node --test tests/artifact-store.test.mjs (Blob-side retention cutoffs; the Neon-row prune lands with the nightly maintenance batch — re-cite its test here then)` — the "same bytes → same hash → no second artifact row" case is green.
- Expected: artifact rows exist for exactly the files the run produced; re-running the fixture adds no row.
- Actual:
- Evidence (screenshot/output path):
- Status:

#### Row 3 — AC-P4-3 · a failed step never stops the other steps, and exit codes are unchanged · `automated` + `manual` [local]

Verify: when one step fails, the job records failed-at-step but the remaining independent steps still run; end-of-run exit 0; unknown slug and preflight-block exit 1 — exactly as today.

- Steps:
  1. Automated: `node --test tests/artifact-store.test.mjs (Blob-side retention cutoffs; the Neon-row prune lands with the nightly maintenance batch — re-cite its test here then) tests/shorts-pipeline.test.mjs` — the exit-semantics cases (end-of-run exit 0 with per-step outcomes; unknown slug exit 1; preflight-block exit 1) are green.
  2. [local] From the repo root: `node channel-pipeline.mjs not-a-real-channel; echo $?` — prints the unknown-slug message and `1` (this exits before any spend — safe to run).
  3. Live half: in any run where one step failed (e.g. a doc lane failure), confirm the Actions log shows the later steps still executed and the workflow still finished green (exit 0), and the job row shows `failed` with the failed step named.
- Expected: exit codes byte-identical to today's behavior; failures recorded, never contagious.
- Actual:
- Evidence (screenshot/output path):
- Status:

#### Row 4 — AC-P4-4 · resume skips a step only when its bytes are really there · `automated`

Verify: a re-dispatch with `--resume` skips a step ONLY when both its artifact row exists AND its bytes are retrievable from Blob; a stale resume key or missing bytes forces a re-run; a killed render never re-generates script or TTS because the full render input was persisted.

- Steps:
  1. `node --test tests/artifact-store.test.mjs (Blob-side retention cutoffs; the Neon-row prune lands with the nightly maintenance batch — re-cite its test here then)` — the resume truth table is green: (a) artifact row + retrievable bytes = skipped; (b) artifact row only (index entry, no bytes) = RE-RUNS; (c) changed template id/version or brand-kit/config hash = RE-RUNS; (d) owner claim edit invalidates the script artifact.
  2. `node --test tests/artifact-store.test.mjs (Blob-side retention cutoffs; the Neon-row prune lands with the nightly maintenance batch — re-cite its test here then)` (render-input completeness case) — a resume finds hook/points/closing/thumbHeadline + template version + seed + themes + publishAt all persisted.
- Expected: every skip condition proves bytes, not just bookkeeping.
- Live proof of this row is Drill 1 below.
- Actual:
- Evidence (screenshot/output path):
- Status:

#### Row 5 — AC-P4-5 · a dead database can never darken production · `automated`

Verify: with Neon unreachable the pipeline runs exactly as today (log-only, no job rows, no intents, no warnings, no resume state) plus one warning, and still exits with today's codes.

- Steps:
  1. Automated: `node --test tests/artifact-store.test.mjs (Blob-side retention cutoffs; the Neon-row prune lands with the nightly maintenance batch — re-cite its test here then)` — the DB-unreachable case is green: no rows written, run continues, single warning emitted, exit semantics unchanged.
  2. Accept the named degradation (spec Honest Limits): a run on a DB-outage day has NO resume state — if such a run later fails it may re-spend research/script/TTS. Record in Actual that this was understood, not misread as a bug.
- Expected: log-only continuation, one warning, ntfy still the fallback channel.
- Actual:
- Evidence (screenshot/output path):
- Status:

### S2 — Upload intents + orphan reconciliation

#### Row 6 — AC-P4-6 · every upload is pre-recorded, and a slot can never be double-claimed · `automated` + `manual`

Verify: before any upload the lane writes one `upload_intents` row (unique per channel + slot_date + kind + slot_idx); if another lane already claimed the slot, the lane resolves that intent or marks the slot produced and skips — it never uploads a second time.

- Steps:
  1. Automated: `node --test tests/upload-intents.test.mjs` — lifecycle (initiated → session_open → uploaded → recorded) and the INSERT-conflict case (conflict ⇒ resolve-or-skip, never bare proceed) are green.
  2. After Row 1's run, DB-CHECK: `select * from upload_intents order by created_at desc limit 5` — one row for the upload with the full dedupe key `channel:slot_date:kind:slot_idx` and status `recorded` with a video_id.
- Expected: an intent row exists for every upload, and no two lanes can hold the same slot.
- Actual:
- Evidence (screenshot/output path):
- Status:

#### Row 7 — AC-P4-7 · the upload parking ticket is saved before the first byte, and kept secret · `automated` + `manual`

Verify: the resumable session URI lands on the intent row before the first byte is sent, the videoId is written on acceptance, and the URI is never logged or rendered anywhere.

- Steps:
  1. Automated: `node --test tests/upload-intents.test.mjs` — the ordering case (URI persisted before PUT) is green.
  2. After a run with an upload: DB-CHECK `select id, status, video_id, (session_uri is not null) as has_uri from upload_intents order by created_at desc limit 5` — `has_uri = true` and video_id set. (The check deliberately selects only whether the URI exists — never paste the URI itself into this file; it is bearer-capable.)
  3. `gh run view <run-id> --log | grep -c "uploads.google.com"` — expect `0` (the URI never appears in logs). Also open `/logs` in Studio and search for it — zero hits; no Studio surface renders it.
- Expected: URI stored as a secret on the row; zero occurrences in logs or UI.
- Actual:
- Evidence (screenshot/output path):
- Status:

#### Row 8 — AC-P4-8 · a lane settles yesterday's unfinished business before making anything new · `manual`

Verify: when a lane starts (including `--topup` mode) it first resolves ANY open unresolved intent for the channel — probing the session URI, falling through to a title lookup when it has expired — then writes the state entry, marks the slot produced, and skips production for that slot without uploading again.

- Steps:
  1. Use the open intent left by Drill 1's killed run (or create one: cancel a run after the intent row appears but before the video records — DB-CHECK `select * from upload_intents where status not in ('recorded','abandoned')` shows it).
  2. `gh workflow run channel-autopilot.yml -f channel=money-rulebook -f topup=1`
  3. Watch the log (`gh run view <run-id> --log`): the run's first production act is resolving the open intent (probe → title lookup), then it writes `yt-mcp/state/money-rulebook.json` and marks the slot produced.
  4. Confirm on the channel (Studio → `/videos`, filter money-rulebook) that the video count grew by the recovered video only — no second copy of the same title.
- Expected: the open intent is settled first, from the topup dispatch, with no duplicate upload.
- Actual:
- Evidence (screenshot/output path):
- Status:

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
- Actual:
- Evidence (screenshot/output path):
- Status:

#### Row 10 — AC-P4-10 · normal uploads behave exactly as today · `manual`

Verify: a normal successful upload still does everything today's run does — private upload, thumbnail set, pinned comment, verify-run proof, state writes — with the single exception that a resumed or late upload recomputes publishAt from the kit's slot times.

- Steps:
  1. After a normal (non-resume) run: open the newest video on money-rulebook in YouTube Studio — status private (or per today's schedule), custom thumbnail applied, pinned comment present.
  2. Confirm the verify-run proof in the Actions log (the existing verify step) and the state write: `yt-mcp/state/money-rulebook.json` lastVideos updated.
  3. PublishAt recompute is exercised at the end of Drill 1 (resume path): confirm the resumed upload's publish time falls in the kit's FUTURE slot time, never in the past.
- Expected: indistinguishable from a pre-Phase-4 upload on every axis except the recompute.
- Actual:
- Evidence (screenshot/output path):
- Status:

### S3 — Warnings + parking

#### Row 11 — AC-P4-11 · every push alert also becomes a durable row · `manual` + `automated`

Verify: every existing alert site (dead channel key, quota budget reached, verify-run failure, template preflight block, failed job step, gate hold/timeout) writes one `warnings` row AND still sends the ntfy push — the push never disappears.

- Steps:
  1. Automated: `node --test tests/warnings-store.test.mjs` — each emitter writes a row with severity, evidence, and policy citation where one exists, alongside the alert call.
  2. Live proof comes free from Drill 2 (dead token): after that drill, DB-CHECK `select * from warnings order by last_checked_at desc limit 10` — the Blocking token row is there, and the phone push arrived too.
- Expected: dashboard and phone always agree.
- Actual:
- Evidence (screenshot/output path):
- Status:

#### Row 12 — AC-P4-12 · only true publishing blockers may claim "Blocking" · `automated`

Verify: only conditions on the policy hard-block list (revoked token, quotaExceeded, uploadLimitExceeded, upload rejected, account suspended, long-upload disallowed, thumbnail-set blocked) set blocks_publishing=TRUE; job-step failures, analytics failures, and policy heuristics never do.

- Steps: `node --test tests/warnings-store.test.mjs` — the classification cases are green: a `quotaExceeded` error string classifies Blocking; an inauthentic-content heuristic and an analytics collection failure classify Warning/Advisory with blocks_publishing=false.
- Expected: production is never parked over an analytics read or a heuristic.
- Actual:
- Evidence (screenshot/output path):
- Status:

#### Row 13 — AC-P4-13 · a parked channel skips production but still checks its own pulse · `manual`

Verify: while a Blocking warning is open the channel's production is skipped, but the parked run first executes the cheap probes (token refresh + a 1-unit channels.list), alerting happens once per park episode (not per run), and other channels are unaffected.

- Steps: this is the middle act of Drill 2 — with the dead token still set, dispatch a second run:
  1. `gh workflow run channel-autopilot.yml -f channel=money-rulebook`
  2. `gh run view <run-id> --log` — the log shows the probe executing, then production skipped because the channel is parked.
  3. No SECOND ntfy for the same open warning (once per episode).
  4. Confirm another channel's scheduled cron run the same night produced normally (Actions tab).
- Expected: parked but breathing; quiet while parked; neighbors unaffected.
- Actual:
- Evidence (screenshot/output path):
- Status:

#### Row 14 — AC-P4-14 · a passing probe heals the channel by itself · `manual`

Verify: when a probe passes for an auto-verifiable warning — from a parked run or the nightly probe job — the warning resolves automatically and the channel resumes, same day if the probe ran at run-start.

- Steps: final act of Drill 2 — restore the real token, dispatch again:
  1. Restore the token (Drill 2 step R), then `gh workflow run channel-autopilot.yml -f channel=money-rulebook`
  2. Log shows the probe pass → the warning row flips to `resolved` automatically → the run proceeds into normal production the same day.
  3. DB-CHECK: `select * from warnings where channel_id = 'money-rulebook' order by last_checked_at desc limit 5` — state `resolved`, resolved_at set, no manual actor.
- Expected: fix the cause and the parking lifts itself, with zero clicks.
- Actual:
- Evidence (screenshot/output path):
- Status:

#### Row 15 — AC-P4-15 · the owner's manual resolve is audited, never silent · `manual`

Verify: an owner manual resolve records resolved_by and a resolve note; non-auto-verifiable Blocking rows never auto-unpark — only a passing probe or the owner's manual resolve clears them.

- Steps:
  1. Open `/warnings` as owner. On any open warning click **Resolve**, type a reason, confirm.
  2. DB-CHECK: `select state, resolved_by, resolved_at from warnings where channel_id = 'money-rulebook' order by last_checked_at desc limit 5` — the row shows your email and the note.
  3. Automated: `node --test tests/warnings-store.test.mjs` — the "non-auto-verifiable Blocking never auto-resolves on probe" case is green.
- Expected: every human decision leaves a name and a reason on the record.
- Actual:
- Evidence (screenshot/output path):
- Status:

#### Row 16 — AC-P4-16 · the /warnings dashboard reads like a duty log · `visual` (+ staff read-only)

Verify: /warnings lists open warnings grouped by channel with severity, the official quote + source link + fetch date, evidence, last-checked, a "re-check now" button and an owner-only manual resolve; empty board shows an explicit empty state; staff can read but not resolve.

- Steps:
  1. Open `/warnings` as owner (nav: System group → Warnings). With Drill 2's row still open: group header per channel, severity chip, the verbatim policy quote with its link and fetched date, evidence, last-checked time.
  2. As **staff**: same list visible; no Resolve button (the owner-only control is hidden, and a direct API write returns 403 — DevTools: `fetch('/api/warnings', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({action:'resolve', id:1})}).then(r=>r.status)` → 403).
  3. Empty state: after resolving/clearing all rows (or on a fresh filter with no matches), the page shows an explicit "no open warnings" state — never a blank tile.
- Expected: everything the ntfy push said, plus the citation a human needs to act.
- Actual:
- Evidence (screenshot/output path):
- Status:

### S4 — Review queue

#### Row 17 — AC-P4-17 · the script and its render inputs are saved before any render starts · `automated` + `manual`

Verify: when a script is generated, its text, sources, claims, disclosure flags, template and job links, plus the full structured render input, are persisted BEFORE the render step starts.

- Steps:
  1. Automated: `node --test tests/review-gate.test.mjs` — the ordering case (persist completes before render begins) is green.
  2. Live: during Drill 3, DB-CHECK `select * from scripts order by 1 desc limit 3` while the job is held at awaiting_review — the script row exists with sources/claims, while job_steps shows render/upload not started.
- Expected: the review page and any later resume can both read from the same saved record.
- Actual:
- Evidence (screenshot/output path):
- Status:

#### Row 18 — AC-P4-18 · review gating is decided by template membership and fails closed · `automated` + `manual`

Verify: when the channel's assigned template has a non-empty `review_required`, every script holds at awaiting_review and nothing renders, uploads, or schedules until an approval exists; unreadable registry/approval state = HOLD + one Action-required ntfy + a "review gating inactive" warning row; channels with no registry assignment at all keep running ungated.

- Steps:
  1. Automated: `node --test tests/review-gate.test.mjs` — the gating truth table is green: membership × approval states × unreadable-state ⇒ hold; generator risk flags do NOT gate; unassigned legacy channels ungated; drift writes the dedicated warning row.
  2. Live hold proof is Drill 3 below (a medical-flagged test template holds a real generation).
- Expected: a flag the generator failed to emit can never silently un-gate a review channel; a dead DB holds the slot rather than risking an unreviewed upload.
- Actual:
- Evidence (screenshot/output path):
- Status:

#### Row 19 — AC-P4-19 · an unapproved script times out without losing the money already spent · `manual`

Verify: a held script not approved by its slot's publishAt (else end-of-day) skips the slot for that day, records one Action-required timeout warning, and RETAINS the script — a later approval resumes at render with no re-spend.

- Steps:
  1. From Drill 3, leave one held script unapproved past the slot's publishAt.
  2. Dispatch the next run (or let the nightly sweep run): the held slot is skipped — no render, no upload — and DB-CHECK `select * from warnings where title like '%timeout%' or classification like '%timeout%' order by last_checked_at desc limit 5` shows ONE timeout row.
  3. Now approve the script from `/review`. The approval dispatches the resume run (see Row 22); the log shows it re-entering at render — script/TTS steps skipped (no re-spend).
  4. If no future slot remains that day, the script simply waits — no forced instant publish.
- Expected: a missed approval costs a slot day, never a re-render bill.
- Actual:
- Evidence (screenshot/output path):
- Status:

#### Row 20 — AC-P4-20 · the review page shows the script against its sources · `visual` + `manual`

Verify: opening a held script shows script text and sources side-by-side with claim↔source links, a flagged-claims panel (every non-verified claim), and the Phase 3 dedupe verdict where one exists; an owner claim edit invalidates the script's artifact.

- Steps:
  1. Open `/review` as owner and click Drill 3's held script. Expect: script text left, sources right, highlighted links from each claim to its source(s); a flagged-claims panel listing every claim whose status is not `verified`, with accept/edit/drop; the dedupe verdict shown as evidence.
  2. Edit one claim's wording and save. DB-CHECK: `select * from job_artifacts where kind = 'script-payload' order by 1 desc limit 3` — the script artifact for this job is gone/stale, so the resume will re-run the script step rather than render a stale input.
- Expected: a reviewer can verify every claim's source without leaving the page, and edits are honest about invalidating what was already made.
- Actual:
- Evidence (screenshot/output path):
- Status:

#### Row 21 — AC-P4-21 · approval is impossible until the disclosure checklist is answered · `manual`

Verify: where disclosure is required, all four synthetic-media categories (YouTube's official wording) must each be answered before the Approve button becomes possible.

- Steps:
  1. On a held script that declares `disclosure.synthetic_media_required: true` (Drill 3's script if its template declares it; otherwise any flagged script), scroll to the disclosure checklist — expect the four official category items from `support.google.com/youtube/answer/14328491`, verbatim.
  2. With one or more items unanswered, the Approve control is disabled/blocked with the reason.
  3. Answer all four — Approve unlocks.
- Expected: the upload sets disclosure flags right the first time, because approval cannot skip the question.
- Actual:
- Evidence (screenshot/output path):
- Status:

#### Row 22 — AC-P4-22 · approval dispatches the render run; a failed dispatch screams · `manual` + `automated`

Verify: owner approval dispatches `channel-autopilot.yml` with `channel=<slug>` and `resume=<job_id>` via the existing Studio dispatch pattern (owner-only); a dispatch failure writes an Action-required warning; a rejection means the script never uploads.

- Steps:
  1. Approve Drill 3's held script as owner. Actions tab: a new `channel-autopilot` run appears, dispatched with `resume=<job id>`; it re-enters at render.
  2. Staff cannot approve: as staff on `/review` the Approve control is absent, and `fetch('/api/review', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({action:'approve', id:<script id>})}).then(r=>r.status)` → 403.
  3. Automated (failure path): `node --test tests/review-gate.test.mjs` — the dispatch-failure case is green: an Action-required warning row is written, never a silent approved-but-not-rendered.
  4. Rejection half: reject a second held script from `/review` — the script's status never reaches an upload; the slot takes the lane's normal terminal; nothing appears on the channel.
- Expected: one click moves the pipeline; a broken click moves the warnings board instead of nothing.
- Actual:
- Evidence (screenshot/output path):
- Status:

#### Row 23 — AC-P4-23 · three thumbnail candidates, upload never waits for a human · `manual` + `visual`

Verify: where picking is enabled, renders produce 3 candidates and the upload proceeds with candidate 1 automatically; an owner pick before publishAt swaps via thumbnails.set; after publishAt the pick is recorded but not applied; where picking is not enabled, today's single auto-candidate continues with zero interaction.

- Steps:
  1. Enable picking for the drill channel/template in the admin panel config (per OQ-4 it is panel DATA, launch default: review-gated templates ON).
  2. After a render: DB-CHECK `select * from job_artifacts where kind = 'thumb' and job_id = '<job id>'` — 3 candidate rows; the upload used candidate 1 (check the live video's thumbnail).
  3. Before publishAt: pick candidate 2 from `/review` (or `/videos`). The video's thumbnail changes (thumbnails.set re-called, ~50 quota units — expect it in the quota ledger `/usage`).
  4. After publishAt: pick candidate 3 — the live thumbnail does NOT change; the pick is recorded for win-rate data only.
  5. A channel/template WITHOUT picking enabled runs today's single-candidate path — no candidate rows, no picker UI.
- Expected: the daily queue never blocks on a thumbnail decision, and the owner can still change their mind until publish.
- Actual:
- Evidence (screenshot/output path):
- Status:

### S5 — Analytics snapshots

#### Row 24 — AC-P4-24 · the nightly snapshot collector probes, upserts, and skips politely · `manual`

Verify: the nightly analytics job probes each channel for `yt-analytics.readonly`, collects a trailing window (D-1..D-4) into `analytics_snapshots` (unique per channel+date+source, re-runs update in place), lets analytics_api win overlapping per-day dates, and skips scope-less channels with one Warning (never Blocking) plus a re-auth checklist entry.

- Steps:
  1. `gh workflow run analytics-nightly.yml` (or wait for its nightly slot).
  2. DB-CHECK: `select channel_id, date, source, views, collected_at from analytics_snapshots order by collected_at desc limit 20` — up to 4 dates per channel per source; only channels holding the scope have rows.
  3. Run it again immediately. DB-CHECK again — row count for the same channel+date+source is UNCHANGED (UPSERT updated in place, never duplicated).
  4. DB-CHECK: `select * from warnings where title like '%analytics%' or classification like '%scope%' order by last_checked_at desc limit 5` — scope-less channels appear as Warning rows with the re-auth checklist, and severity is never Blocking.
- Expected: re-runs are free of duplicates; a missing scope is a to-do, never an outage.
- Actual:
- Evidence (screenshot/output path):
- Status:

#### Row 25 — AC-P4-25 · every snapshot view admits its data is late · `visual`

Verify: every snapshot-backed view shows "data through \<date\>" and never ranks on the unsettled trailing window; win rates exclude videos younger than 7 days.

- Steps:
  1. Open the snapshot-backed leaderboard (pinned to `/analytics`; see How-to-run note 6). Every panel carries a "data through <date>" stamp.
  2. The stamp's date is at least 2 days behind today (48–72h settlement) — the trailing days are visibly excluded, not shown as final.
  3. Any video younger than 7 days is absent from win-rate rankings (check one you published this week).
- Expected: the UI never lets yesterday's half-settled numbers pose as final.
- Actual:
- Evidence (screenshot/output path):
- Status:

#### Row 26 — AC-P4-26 · the leaderboard reads the warehouse, not the API · `manual` + `automated`

Verify: the owner's leaderboard ranks channels over a selectable window (7/28/90 days) computed from snapshots with zero live YouTube API calls.

- Steps:
  1. Open the leaderboard. Switch the window 7 → 28 → 90 days — rankings recompute, values change.
  2. DevTools Network tab: the page's data comes from the Studio snapshot endpoint only — no browser calls to googleapis (and the endpoint itself reads Neon: automated proof next).
  3. Automated: `node --test tests/analytics-store.test.mjs` — the "reads snapshots, zero live calls" case is green.
- Expected: viewing the whole network costs zero quota units.
- Actual:
- Evidence (screenshot/output path):
- Status:

#### Row 27 — AC-P4-27 · win rates start empty and grow honestly · `visual` + `manual`

Verify: a published video with a template assignment rolls into per-template and per-topic win rates; win rates start EMPTY and cover only registry-assigned channels until data accrues.

- Steps:
  1. Before any S4 script has published rows (fresh Phase 4): open the win-rate panels — they show an explicit empty state ("no published reviewed scripts yet" or equivalent), never zeros pretending to be data.
  2. After a few weeks of snapshots (or against a seeded fixture): a published video with `scripts.video_id` + template assignment appears in its template's and topic's win rate. Videos without an assignment do not appear anywhere.
  3. Cross-check one number by hand: the template's rate matches the snapshots of its published videos over the stated window.
- Expected: coverage grows with assignments (Phase 5), and the UI says so.
- Actual:
- Evidence (screenshot/output path):
- Status:

#### Row 28 — AC-P4-28 · the old analytics world keeps turning · `automated` + `manual`

Verify: the Daily Excel report still runs and commits `state/`+`logs/` history, and the live 28-day `/api/analytics` panel behaves exactly as today.

- Steps:
  1. [local] `node daily-excel-report.mjs; echo $?` — exits 0; `state/report-stats.json` and `logs/posts-log.json` updated as before. (Or confirm the last `reporting-daily` Actions run green — it runs daily 16:45 UTC.)
  2. Open `/analytics` — the live 28-day panel loads with real YouTube data exactly as before Phase 4 (no snapshot stamp on THIS panel — it is the live one).
  3. DevTools: `GET /api/analytics` returns 200 with the 28-day payload as before.
- Expected: snapshots supplement; nothing replaces.
- Actual:
- Evidence (screenshot/output path):
- Status:

### S6 — Sessions

#### Row 29 — AC-P4-29 · the owner can end anyone's session in seconds · `manual`

Verify: when the owner revokes another user's session from the admin view, that user's very next request is unauthenticated (redirect to login) — instant, not at cookie expiry.

- Steps:
  1. Browser A: sign in as **staff**. Open `/` (Overview loads). Leave it open.
  2. Browser B: sign in as **owner**. Open the all-sessions view (pinned to `/users` — see How-to-run note 6): every user's active sessions with a per-session Revoke control (today it shows counts only).
  3. Revoke the staff session from step 1.
  4. Browser A: click anything (or reload) — expect the immediate redirect to `/login`, not a graceful expiry countdown.
- Expected: access ends in one click and one request.
- Actual:
- Evidence (screenshot/output path):
- Status:

#### Row 30 — AC-P4-30 · expired sessions are garbage-collected · `automated`

Verify: the cleanup pass deletes sessions that are expired or revoked for more than 30 days.

- Steps:
  1. Automated: `node --test tests/session-admin.test.mjs` — the 30-day cutoff cases are green (deletes expired >30d, deletes revoked >30d, KEEPS a session revoked 29 days, keeps active sessions). NOTE: the death-clock approximation uses last_used (no revoked_at column; conservative — dead rows only, never early-deletes a live session). The nightly log-line step is unexecutable until the T3/T6 nightly workflow lands (Batch B/C).
  2. After a nightly maintenance run, its log shows the sessions-cleanup line with the deleted count.
- Expected: the table stops growing forever without touching anyone still valid.
- Actual:
- Evidence (screenshot/output path):
- Status:

#### Row 31 — AC-P4-31 · self-service sessions and the role matrix are untouched · `manual`

Verify: self-service device list + sign-out-everywhere and the Edge proxy route→role matrix behave exactly as today.

- Steps:
  1. `/settings` → Security panel: your own devices list renders as before; **Sign out everywhere** revokes all your sessions and forces re-login (use a spare window).
  2. Proxy matrix spot-check: signed-out incognito to `/users` → login redirect; signed-out `fetch('/api/sessions').then(r=>r.status)` → 401.
- Expected: nothing about the Oct-09 A1 behavior changed.
- Actual:
- Evidence (screenshot/output path):
- Status:

### Cross-slice

#### Row 32 — AC-P4-32 · the quota gate trusts the Dec-2025 model, falls back to legacy math · `automated` + `manual`

Verify: the pipeline's daily quota budget consumes `youtube_quota_models` rows (Phase 2 #104) when present, and falls back to today's legacy math when absent — the false ~5-upload/day park must not bound Phase 4.

- Steps:
  1. Automated: `node --test tests/quota-model.test.mjs` — gate consumes model rows when present; legacy fallback when absent; both green.
  2. Manual (existing surface): open `/channels` → a channel card's scheduling panel. With a quota-model row saved, the panel's projection uses model numbers (≈100/upload — no false park at realistic volumes); the amber advisory matches the saved row (same surface as the Phase 2 fix-wave row F-1 in `docs/qa/phase2-vault-v2-qa.md`).
  3. Fallback check: on a project with NO quota-model row, the panel shows the legacy projection advisory and the pipeline parks exactly where it always did.
- Expected: the gate is as smart as its data and no smarter.
- Actual:
- Evidence (screenshot/output path):
- Status:

#### Row 33 — AC-P4-33 · every new store has a retention broom · `manual` + `automated`

Verify: the nightly maintenance pass prunes per the retention schedule — job_steps/job_artifacts >90 days, resolved upload_intents >30 days, Blob bytes past class retention (non-review >30d, resolved-intent >7d), analytics_snapshots >90 days rolled up to weekly.

- Steps:
  1. Automated (cutoffs): `node --test tests/artifact-store.test.mjs (Blob-side retention cutoffs; the Neon-row prune lands with the nightly maintenance batch — re-cite its test here then) tests/upload-intents.test.mjs tests/analytics-store.test.mjs` — each retention cutoff case green (a 91-day row is deleted, an 89-day row survives, etc.).
  2. Dispatch the nightly maintenance workflow from the Actions tab (or wait for its slot). Its log shows one line per prune class with counts.
  3. DB-CHECK: `select count(*) from analytics_snapshots where date < (current_date - interval '90 days')` — 0 (older rows rolled up to weekly); same shape for the other tables with their windows.
  4. Blob: the log's Blob-prune line reports bytes freed per class; no resume-critical class over-pruned (a next-day resume still works — spot-check with Drill 1 if in doubt).
- Expected: free-tier tables and buckets stay bounded without anyone remembering to clean up.
- Actual:
- Evidence (screenshot/output path):
- Status:

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

- Actual:
- Evidence (quoted log/output):
- Status:

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

- Actual:
- Evidence (quoted log/output):
- Status:

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

- Actual:
- Evidence (quoted log/output):
- Status:

---

## Regression — pinned invariants

These hold across the whole phase. Any FAIL here blocks sign-off even if every feature row passes.

### Row R1 — Exit codes + fail-open are pinned · `automated`

- Steps: `npm test` at repo root — the pipeline exit-semantics cases (always exit 0 end-of-run; unknown slug / preflight-block exit 1) and the DB-down fail-open case (AC-P4-5: log-only continuation, one warning, never a darkened run) are green.
- Expected: Phase 4 changes no exit code and never lets a dead database stop production.
- Actual: — Evidence: — Status:

### Row R2 — Zero-config / flag-off is byte-identical · `manual`

- Steps: dispatch `gh workflow run channel-autopilot.yml -f channel=money-rulebook` with no new inputs and no new env set, and diff against a pre-Phase-4 run of the same shape: same step list in the log, same state-file shape (`yt-mcp/state/money-rulebook.json` gains no new required keys for the legacy path), same outputs.
- Expected: every Phase 4 pipeline change sits behind an established-style flag (like `TEMPLATE_PREFLIGHT_ENABLED`) with byte-for-byte rollback; unset = today's behavior.
- Actual: — Evidence: — Status:

### Row R3 — Quota gate keeps its legacy honesty · `automated`

- Steps: `node --test tests/quota-ledger.test.mjs tests/quota-model.test.mjs` — legacy math unchanged when no model rows exist; model rows honored when present (Row 32).
- Expected: no silently tightened or loosened budget on either path.
- Actual: — Evidence: — Status:

### Row R4 — Existing dashboards untouched · `manual`

- Steps: open `/analytics` (live 28-day panel loads as before), `/usage` (ledger unchanged apart from job_id attribution), `/videos`, `/logs`, `/channels`, `/providers`, `/templates/registry` — all render as before; `GET /api/analytics` → 200.
- Expected: Phase 4 adds surfaces; it does not rearrange existing ones (new nav items appear, old ones keep their routes and content).
- Actual: — Evidence: — Status:

### Row R5 — Sessions self-service + proxy matrix unchanged · `manual`

- Steps: Row 31's checks pass, and staff still cannot reach owner-only pages (incognito + staff spot-check of `/users`).
- Expected: the Oct-09 A1 behavior is preserved exactly.
- Actual: — Evidence: — Status:

### Row R6 — ntfy stays the bell · `manual` + `automated`

- Steps: during Drill 2 the push arrives for the Blocking warning; `node --test tests/ntfy-alert.test.mjs` green; the dashboard never becomes a replacement for the push (both fire).
- Expected: push = the bell, dashboard = the record (spec Honest Limits).
- Actual: — Evidence: — Status:

### Row R7 — Whole suite + Studio build green · `automated`

- Steps: `npm test` at repo root (all suites, including the new Phase 4 test files) and `cd studio && npx next build` — both exit 0 with `/warnings`, `/review` and their API routes in the manifest.
- Expected: zero regressions against the pre-Phase-4 baseline; the build route table shows only additions.
- Actual: — Evidence: — Status:

---

## Summary

Checklist rows: **36 = 33 AC rows + 3 drill rows**, plus 7 regression rows. Coverage map (no AC merged or split silently): AC-P4-1→R1; 2→R2; 3→R3; 4→R4 (+Drill 1 live); 5→R5; 6→R6; 7→R7; 8→R8 (+Drill 1); 9→R9; 10→R10 (+Drill 1 publishAt recompute); 11→R11 (+Drill 2); 12→R12; 13→R13 (+Drill 2); 14→R14 (+Drill 2); 15→R15; 16→R16; 17→R17 (+Drill 3); 18→R18 (+Drill 3); 19→R19; 20→R20 (+Drill 3); 21→R21; 22→R22 (+Drill 3); 23→R23; 24→R24; 25→R25; 26→R26; 27→R27; 28→R28; 29→R29 (+Drill 2 cleanup); 30→R30; 31→R31; 32→R32; 33→R33; Drill-1/2/3→their scripts. The "Resolved by review" findings are proven where they landed: deadlock-out (R13/R14/R15), fail-closed gate (R18), post-upload thumbnail swap (R23), status+bytes resume (R4/Drill 1), intent conflict + resolution scope (R6/R8), dispatch contract (R22), publishAt recompute (R10/Drill 1), scope probes (R24), emitter constraint (R12), snapshot upsert semantics (R24), timeout (R19), DB-down degradation (R5), video_id write-back (R27), quota wiring (R32), retention (R33), drills executable with prep/cleanup (all three).

