---
name: legacy-onboard
description: Make an existing codebase agent-ready without changing it — survey the real stack and structure, run build and tests to record baseline health, extract the conventions the code ACTUALLY follows, and write the project AGENTS.md, STANDARDS.md, GLOSSARY, and baseline health report. Use when starting work on an existing project, taking over a codebase, or when the user says "onboard", "existing project", or "figure out this codebase".
license: MIT
metadata:
  source: fullstack-agent-os (authored; discover pattern from Builder Methods Agent OS + spec-kit existing-projects guide)
  category: lifecycle
---

# Legacy Onboard — observe first, change nothing

Goal: the next session (any agent) can work correctly in this codebase from the files alone. You are a cartographer, not a renovator — **no refactoring, no fixes, no "improvements" during onboarding.** Observations that look like problems go into the debt list, not the diff.

## Steps

1. **Survey:** stack + versions (from lockfiles/manifests), folder structure and its logic, entry points, where the interesting logic lives. Prefer reading the most-changed files (git log) — that is where the real architecture is.
2. **Run everything, record results:** build, test suite, lint/typecheck — quote actual output into `docs/BASELINE.md`. This is the health baseline every future change is measured against. Broken before = known state; do not fix, do not hide.
3. **Extract real conventions** via `standards-discover` discipline (run that skill if available): dominant patterns as the code actually behaves — naming, error handling, data access, test style, git style. ≥80% adoption or it is not a standard.
4. **Write the project `AGENTS.md`** (if absent): what this project is (2 lines), commands (build/run/test verbatim, copy-pasteable), folder map, conventions pointer to STANDARDS.md, and a short NEVER list (the things that break this specific codebase).
5. **Write `docs/GLOSSARY.md`** (`GLOSSARY` template): the domain terms AS THE CODE USES THEM — including the confusing ones ("user" vs "account" vs "member" here means…).
6. **Census:** TODO/FIXME/HACK counts, obvious debt patterns seen — one paragraph each, evidence paths, into `docs/BASELINE.md`. These feed `debt-inventory` later.

## Output

`AGENTS.md` · `product/STANDARDS.md` · `docs/GLOSSARY.md` · `docs/BASELINE.md` (suite/build output, census, open questions).

## Finish

Present the map to the user — they know the skeletons you cannot see (the "don't touch module X" landmines, the forgotten staging server). Correct it with them, then write the corrections in. Onboarding is done when a stranger-agent could make a small change safely using only these files.
