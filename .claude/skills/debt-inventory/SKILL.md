---
name: debt-inventory
description: Inventory a codebase's technical debt with evidence — dead code with verified zero references, duplication that should become one shared module, tangled hotspots (high churn × low health), TODO/FIXME census — and produce a prioritized DEBT.md ranked by risk × change-frequency. Use when the user asks for a cleanup, tech-debt audit, dead-code removal plan, or before starting refactoring work.
license: MIT
metadata:
  source: fullstack-agent-os (authored)
  category: lifecycle
---

# Debt Inventory — find it, prove it, rank it

You are auditing, not fixing. Every claim carries evidence (file paths, tool output). The deliverable is `docs/DEBT.md` — a prioritized list that `refactor-slice` executes later.

## Scans (run what fits the language; fall back to search heuristics)

1. **Dead code:** unused exports/files/deps — language tools first (knip/ts-prune for TS, vulture for Python, depcheck for node deps…). A "dead" verdict requires verified ZERO references — including dynamic/string-based usage (routes, DI, templates, reflection). Unverifiable-dynamic = "probably dead, needs human eyes", never auto-delete.
2. **Duplication:** repeated non-trivial logic (2–3+ copies) — jscpd or targeted pattern search. Each cluster becomes a **shared-module candidate**: one shared function/file per public behavior, callers migrate to it. That is the DRY paydown — not a util graveyard.
3. **Hotspots:** high churn × signs of low health — `git log` frequency × long files/functions × bug-fix-heavy history. The file that changes every sprint AND breaks every sprint is the top of the list.
4. **Census:** TODO/FIXME/HACK counts and clusters (from `docs/BASELINE.md` if `legacy-onboard` ran).

## Ranking (risk × change-frequency)

| Priority | Criteria |
|----------|----------|
| P1 | hotspot tangles — everything near them gets riskier each sprint |
| P2 | duplication on active paths — bugs fixed N times, drift between copies |
| P3 | safe dead-code batches — verified unreferenced; low-risk wins that build cleanup trust |
| P4 | duplication on quiet paths, outdated patterns |

Each entry: type (dead / duplication / tangle / census), evidence (paths + counts), why it matters, effort (S/M/L), suggested slice shape (one `refactor-slice` each — a slice is ≤ ~1 day, independently reviewable).

## Rules

- NO fixes during inventory — not even the "obvious" one-liners. The inventory is the work; fixes go through slices so they get pinned tests and review.
- DEBT.md ends with a recommended first three slices and what each would need (tests to pin, risks).
- Present the table to the user; their context re-ranks things (that "dead" module might be the client demo).
