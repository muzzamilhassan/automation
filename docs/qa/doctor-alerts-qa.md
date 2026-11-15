# Spec + QA — CI Doctor: alert on change, remind daily (2026-11-15)

Source: research/deep-audit-2026-11-13.md, item #7b (ci-cd-04,
ops-cost-04). Every CI Doctor run (3/day) with any non-OK channel sent an
ntfy push, commented on issue #90 and exited 1. investors-compass has been
STALE for 420h → ~50 identical pages, 72 comments, 33/33 red runs, and the
red exit skipped the "Commit report" step, so `ci-doctor-report.json`
stayed frozen at 2026-10-30 reading "0 problems".

## Requirements (EARS)

- R1: WHEN a channel becomes non-OK, or its problem changes kind, THE DOCTOR
  SHALL alert in that run.
- R2: WHILE a problem is unchanged, THE DOCTOR SHALL re-alert at most once per
  24h (daily reminder), never every run.
- R3: WHEN a previously alerted channel is OK again, THE DOCTOR SHALL announce
  the recovery once.
- R4: THE REPORT SHALL persist `alerts: {slug: {status, at}}` as the memory the
  next run diffs against; an undelivered alert SHALL NOT be remembered.
- R5: THE RUN SHALL be red only WHEN an alert was due and no channel (ntfy,
  GitHub issue) delivered it (issue #69); each non-OK channel SHALL show as a
  `::warning` annotation.
- R6: THE REPORT COMMIT SHALL run unless the job is cancelled, rebasing before
  the push.

## QA rows

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | R1 | first bad → alertNow; STALE→ERROR → alertNow; no/legacy prior report → alertNow once | automated | `node --test tests/doctor-alerts.test.mjs` |
| 2 | R2 | unchanged 8h after last page → nothing; 25h → one reminder, clock reset | automated | same |
| 3 | R3 | recovery announced once; memory cleared | automated | same |
| 4 | R5 | `doctorExitCode` red only for due && !delivered | automated | same |
| 5 | R4/R5 | ci-doctor.mjs reads prev report before writing, writes `alerts`, no unconditional `exitCode = 1` | automated | same (source pin) |
| 6 | R6 | ci-doctor.yml commit step `if: !cancelled()` + rebase | automated | same (YAML pin) |
| 7 | R1/R4/R6 | live dispatch #1: IC STALE alerts once, run GREEN, report committed with `alerts.investors-compass` | manual | `gh workflow run ci-doctor.yml` + run log + `git show` |
| 8 | R2 | live dispatch #2 right after: no ntfy push ("already paged"), run GREEN | manual | run log |

## Regression

- Full root suite green; workflow validator parses ci-doctor.yml.
