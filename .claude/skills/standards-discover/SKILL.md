---
name: standards-discover
description: Extract a codebase's REAL conventions — the patterns the code actually follows in the majority of places — into product/STANDARDS.md, plus command lists and a NEVER list. Rules are only written when ≥80% of the code follows them; aspirational or invented standards are explicitly forbidden. Use during legacy-onboard, before writing code in an unfamiliar codebase, or when the user asks to capture/document the project's standards.
license: MIT
metadata:
  source: fullstack-agent-os (authored; discipline from github/spec-kit "do not invent standards" + Builder Methods Agent OS Discover)
  category: meta
---

# Standards Discover — write down what is true, nothing else

The output steers every future session in this codebase. A wrong "standard" is worse than none — it makes correct code look non-compliant. **Do not invent standards merely to fill the template.**

## Method

1. **Sample representatively:** the most-changed files (git log) + the core domain files + 2–3 tests + CI config. Recent changes show current intent; old files show history.
2. **Identify dominant patterns** per area, counting actual adoption:
   - naming (files, functions, variables, branches)
   - error handling (exceptions vs result types vs codes; what gets logged where)
   - data access & state patterns (how queries/fetching/state are actually done)
   - component/module structure and folder logic
   - test style (runner, file placement, naming, what gets tested)
   - git style (commit format from the log, branch naming, merge vs rebase — from history, not hopes)
3. **The 80% rule:** write it as a standard only if ≥80% of real cases follow it. Below that, it is an option — note it as "two patterns coexist: A (newer, preferred), B (legacy — do not copy, migrate on touch)".
4. **Commands verbatim:** build / run / test / lint exactly as the project defines them (package scripts, Makefile…), copy-pasteable.
5. **The NEVER list:** the specific things that break THIS codebase (generated-code folders never hand-edited, the ORM that must not be bypassed, the env var that must exist…). Sourced from CI rules, configs, and the user's corrections during `legacy-onboard`.

## Output

`product/STANDARDS.md` — areas above, each rule with a one-line example from the real code (file reference). Close with the open questions where the code is genuinely inconsistent (those become ADRs or user decisions, not invented rules).

## After

Every future feature and review in this project checks against this file (`code-review` Standards axis). When a rule proves wrong, amend it there — the file is the living constitution, not a one-time report.
