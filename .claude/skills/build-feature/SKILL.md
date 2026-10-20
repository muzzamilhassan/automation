---
name: build-feature
description: Implement ONE feature end-to-end through the inner delivery loop — load its EARS spec, write the implementation plan, generate the plain-English QA file before coding, implement test-first, run a two-axis code review, then execute the QA file with real evidence. Use when the user asks to build, add, or implement a feature, or when the new-project pipeline hands off a feature to build.
license: MIT
metadata:
  source: fullstack-agent-os (authored)
  category: pipeline
---

# Build Feature — the inner loop

One feature, fully done: specified → planned → QA'd (file first) → built test-first → reviewed → verified with evidence.

**Input:** `$ARGUMENTS` = feature id and/or name (e.g. `F-03` or `F-03-password-reset`).
**Context to load first:** `product/PRD.md`, `product/STANDARDS.md`, `specs/<feature>.md`, `tasks/TASKS.md` (feature's section), relevant `docs/adr/*.md`.

**Non-Claude agents:** where this file says "spawn a subagent" or "use a worktree", do the work inline / skip the worktree if unavailable. Everything else is identical.

## Step 0 — Spec check (hard gate)

- `specs/<feature>.md` exists? If not: create it now (user story + EARS criteria), run the clarify pass on it, and get user approval BEFORE any code. No spec, no code — ever.
- Feature depends on another feature (per TASKS.md) that is not done? Stop and say so.

## Step 1 — Plan (skip if tiny)

- Multi-file or unfamiliar work → run **`writing-plans`**: bite-sized 2–5-minute tasks, exact file paths, exact interfaces, exact tests. Save to `docs/plans/YYYY-MM-DD-<feature>.md`.
- Genuinely tiny (one file, one behavior, obvious test) → skip; note "plan skipped: trivial" in the report.

## Step 2 — Worktree (if git + parallel work)

- If other work is in flight or the user asked for isolation, create a worktree per **`using-git-worktrees`**. Otherwise work on a feature branch in place.

## Step 3 — QA file FIRST (before any code)

Run the **`qa-file-generator`** skill on the spec: it produces `qa/<feature>-qa.md` — one row per EARS criterion, typed automated/manual/visual, with exact plain-English steps and boundary probes, plus the regression section. This file is the contract for "done". Write it now — the implementation will be checked against it.

## Step 4 — Implement test-first

UI work involved? Run **`premium-frontend`** (design plan pass first) and its relevant sub-skills before writing components; verify visually with **`visual-review-loop`** before Step 6.

Follow **`tdd`**, one criterion at a time:
1. RED: write the test that proves the next criterion (name tests after the criterion).
2. GREEN: smallest code that passes. Match `product/STANDARDS.md` patterns.
3. Commit per green (`<feature>: <criterion short-name>`), so review and rollback are surgical.
4. Follow the plan from Step 1; when reality disagrees with the plan, update the plan file, note it in the report, keep moving.
5. If you spot adjacent problems: fix ONLY if they block this feature; otherwise list them in the final report and add a backlog note to `tasks/TASKS.md`.

## Step 5 — Two-axis review

Run **`code-review`** on the feature's diff:
- **Standards axis:** does the code follow `product/STANDARDS.md`? (naming, error handling, structure, no dead code, shared logic not copy-pasted)
- **Spec axis:** does the code implement exactly what `specs/<feature>.md` says — nothing missing, nothing extra?
- Spawn a fresh-context reviewer if the host supports it; otherwise self-review against the two axes in a fresh read of the diff.
- Fix every finding before Step 6. Findings that are out of scope → backlog note.

## Step 6 — Execute the QA file with evidence

Run the **`qa-run`** skill: it walks `qa/<feature>-qa.md` row by row — automated tests quoted, manual steps performed, real screenshots captured (`verification-before-completion` applies — evidence from the real running app, not imagination), every row filled with Actual + Evidence + Status. Any FAIL: fix, re-run the failed rows AND all regression rows. Loop until every row is PASS, then quote the full-suite summary line.

## Step 7 — Close out

1. Merge / close the worktree per the project's git conventions (finishing the branch: rebase or merge per STANDARDS.md; never force-push).
2. Update `tasks/TASKS.md`: feature tasks checked off, feature marked DONE with date.
3. **Update `docs/FEATURES.md`** (the project's feature index): set this feature's status ✅ and link its feature report — so a user who just says "continue" can always see what exists and where each guide lives.
4. **Update `qa/QA-REPORT.md`**: add this feature's MANUAL test cases (plain-English steps + expected + empty Result ☐) so a human QA tester always has a current test pack covering everything built so far. Include the feature in the regression section if it added cross-cutting behavior.
5. Run the project's full quality gate (`verify` script where present: typecheck + lint + tests + duplicate check) — quote the summary.
6. Report:
   - Criteria: X/X pass (list any manual rows the user should eyeball)
   - Evidence: test suite summary, screenshots taken
   - Files touched (added/changed/deleted)
   - Commits (short list)
   - Backlog notes discovered (if any)
   - Next feature in dependency order

## Step 8 — Feature report & PROPER STOP

1. Write `docs/feature-reports/<feature-id>-done.md` using the FEATURE-REPORT template — in plain English for the user:
   - **What this feature does** (the user's-eye view)
   - **How it works, step by step** (the user journey through it)
   - **How it was built** (files, key decisions, commits)
   - **QA guide in plain English** — the exact steps anyone can follow to verify it works, with expected results (mirrors `qa/<feature>-qa.md`)
   - **A mermaid diagram** of the flow
   - **Evidence** (test summary line, screenshots) and **what's next** (the next feature per TASKS.md, and anything the user could decide)
2. If the feature introduced any new tool, library, or service: explain it ON CHAT in plain English — why it was added, its free alternative, why it's the right fit. Chat only; never a new file.
3. **STOP.** Present the report summary on chat, show what comes next, and wait for the user's go. NEVER start the next feature without it.
