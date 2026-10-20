---
name: spec-traceability
description: Build the coverage matrix between a feature's EARS acceptance criteria, its tests, its code, and its QA evidence — exposing criteria with no test, orphan tests that cover nothing in the spec, criteria with no implementation, and tests that exist but never run. Use at the end of build-feature, during converge-check, or when the user asks what is actually covered, about traceability, or coverage vs spec.
license: MIT
metadata:
  source: fullstack-agent-os (authored)
  category: meta
---

# Spec Traceability — criterion ↔ test ↔ code ↔ evidence

The audit that catches the two silent failures of every project: criteria nobody implemented, and behavior nobody asked for.

## The matrix

Write `qa/traceability-<feature>.md`:

| Criterion (short) | Test(s) — name + file | Code — file:line / module | QA evidence — row # + status |
|-------------------|------------------------|----------------------------|-------------------------------|

## How to fill it

- **Criterion → test:** find the test(s) named after the criterion (the TDD naming convention) or demonstrably containing the behavior. Multiple tests are fine — list them.
- **Test → code:** the implementation the test exercises — file:line of the decisive branch, not the whole module.
- **Evidence:** the QA file row status from the latest qa-run. Stale evidence counts for nothing — if the code changed after the last qa-run, re-run it first. Traceability trusts fresh runs only.

## Findings taxonomy

| Finding | Meaning | Action |
|---------|---------|--------|
| **No test** | criterion implemented but unverified | task: write the test, named after the criterion |
| **No code** | criterion with no implementation found | task: implement it — the spec wins |
| **Orphan test** | test that maps to no criterion | EITHER attach it to the criterion it implicitly covers (rename) OR treat as scope creep: justify, move to backlog, or delete |
| **Implicit mega-test** | one large test "covers" many criteria | recommend splitting — a criterion whose only proof is one row inside a 300-line e2e is unverified in practice |
| **Never runs** | test exists but is skipped/excluded in CI | unverified — fix the skip or delete the pretense |

## Verdict

- `TRACEABLE` only when **every** criterion has test + code + fresh evidence, and orphan count is zero (or explicitly justified).
- Otherwise: list the gap tasks for `tasks/TASKS.md` (prefix `[trace]`), report counts by finding type, and name the criteria that remain uncovered.
