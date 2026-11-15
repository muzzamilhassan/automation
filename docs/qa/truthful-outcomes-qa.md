# Spec + QA — Truthful clip-lane outcomes (2026-11-15)

Source: research/deep-audit-2026-11-13.md, improvement #7 (pipeline-05,
ops-cost-03/04). `shorts-clips post-next` exited 0 on every "posted
nothing" path (off day, empty queue, exhausted queue, quota block) and
`channel-pipeline` logged "✓ Clip Short processed" — autopilot runs were
green 40/40 while investors-compass posted nothing for ~15 days. A
verify-run killed by its 300s timeout (`status === null`) also exited 0
via `v.status || 0`. Child failures logged no status, signal or duration.

## Constraint kept

AC-P4-3 (docs/superpowers/specs/2026-10-30-phase4-review-queue-analytics-spec.md):
"exit semantics shall stay exactly as today — end-of-run exit 0". The
PIPELINE's exit code is unchanged; truthfulness comes from the recorded
outcome, the job terminal and a run-page annotation.

## Requirements (EARS)

- R1: `post-next` SHALL exit 0 when a Short shipped (or was already shipped
  today / recovered), 3 (NOTHING_DUE) on an off day or a consumed queue with
  fresh docs, 4 (NO_CLIP) when a Short was due but none could be posted
  (empty queue + stale docs, exhausted queue, quota).
- R2: WHEN verify-run ends without an exit status (killed / timed out),
  `post-next` SHALL exit 1 and log why.
- R3: WHEN post-next exits 3, THE PIPELINE SHALL log "no Short due today",
  close the step `skipped: nothing due today`, show `Shorts: – nothing due`,
  and close the job `succeeded` when no lane failed.
- R4: WHEN post-next exits 4, THE PIPELINE SHALL record the error "Shorts
  skipped — no clip available…", close the step `skipped`, and close the job
  `failed` (same terminal as today's quota skip).
- R5: WHEN a run publishes no Short and none was "nothing due", THE PIPELINE
  SHALL emit a `::warning title=<slug>: no Short published::` annotation.
- R6: WHEN any child lane exits non-zero, THE PIPELINE SHALL log its status,
  signal, elapsed seconds and TIMEOUT when the spawn timed out.
- R7: The pipeline exit code SHALL stay 0 at end of run (AC-P4-3).

## QA rows

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | R1 | exit codes pinned at each post-next path; `CLIP_EXIT` export equals the pipeline constants | automated | `node --test tests/clips-archive.test.mjs` |
| 2 | R2 | `v.status ?? 1` replaces `v.status \|\| 0` | automated | same |
| 3 | R3/R7 | sandboxed pipeline, stub child exit 3 → no ✓, "nothing due", step skipped, job succeeded, exit 0 | automated | `node --test tests/pipeline-jobstore.test.mjs` |
| 4 | R4/R5/R7 | stub exit 4 → error recorded, job failed, `::warning` annotation, exit 0 | automated | same |
| 5 | R6 | stub exit 7 → `exited status=7 signal=none after Ns`, ✗, job failed | automated | same |
| 6 | — | stub exit 0 → ✓, succeeded (no regression) | automated | same |
| 6b | R1 | REAL run of `post-next` on an off day (sandbox, no network) exits 3 — added after live run 43724498853 exited 1: `CLIP_EXIT` sat below the top-level `await postNext()` dispatch (TDZ ReferenceError); source pins could not see it | automated | `node --test tests/clips-archive.test.mjs` |
| 7 | R3/R5 | next natural autopilot run that posts nothing shows the annotation on the Actions run page and the job row reads skipped/failed, not succeeded | manual | Actions run page + Studio jobs |

## Out of scope (item 7b, next)

- CI Doctor alerts only on an OK→BAD state change; its commit step runs
  `if: always()`.

## Regression

- Full root suite green (1160/1160); existing AC-P4-3 exit-0 pins unchanged.
