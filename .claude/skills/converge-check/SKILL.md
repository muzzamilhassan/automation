---
name: converge-check
description: Whole-project convergence audit — verify every EARS criterion across ALL features maps to green tests, fresh QA evidence, and implementation; append every gap as a visible task and loop until the coverage table is clean. Use after building all features or a milestone, before calling a release done, or when the user asks "are we actually done / what's left".
license: MIT
metadata:
  source: fullstack-agent-os (authored; converge pattern from github/spec-kit)
  category: pipeline
---

# Converge Check — the project-level definition of done

After features ship, drift happens: criteria added late, tasks half-done, evidence gone stale, extras smuggled in. This skill makes the project converge on its own specs — in the open, with a table anyone can read.

## Inputs

All `specs/*.md`, `tasks/TASKS.md`, the test suite, and the `qa/*.md` evidence files.

## The loop

1. **Fresh evidence first.** Run the FULL test suite now and quote the summary line. QA files older than the last code change to their feature are stale — re-run `qa-run` for those features before trusting anything.
2. **Build the table** in `qa/CONVERGENCE.md`: per feature — criteria count · tests green? · evidence PASS? · traceability verdict (run `spec-traceability` per feature; spot-check at minimum for anything risky: auth, payments, data deletion, permissions).
3. **Every gap becomes a visible task.** Missing test → `[converge]` task · missing implementation → task · orphan behavior → justify or move to backlog · stale evidence → qa-run task. Append to `tasks/TASKS.md` with a `[converge YYYY-MM-DD]` prefix. Nothing is silently dropped — a decision to NOT fix is written down with its reason.
4. **Execute the tasks** one at a time with the build-feature discipline, then rebuild the table.
5. Repeat until: every criterion covered + full suite green + zero unprocessed gaps. That state is **Converged** — record it in CONVERGENCE.md with the timestamp and the suite summary line.

## TASKS.md hygiene (checked in step 3)

- An unchecked task with no `[converge]`/`[trace]` marker and no backlog entry is drift → resolve it: do it, schedule it, or move it to the backlog section with a reason.
- Backlog items are NOT convergence failures — the project converges on its specs, not on its backlog.

## Report

The final table, the suite summary line, what was appended this round, and — if not converged — exactly which features remain and why. Do not soften it: "Converged" and "not converged" are the only two honest states.
