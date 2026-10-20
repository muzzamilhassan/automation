---
name: refactor-slice
description: Execute ONE safe, reviewable refactor slice — pin the existing behavior with characterization tests first (CONTINUE TO criteria), write a delta spec of what changes, then worktree + small expand/contract commits with the full suite green at every step, ending with two-axis review and DEBT.md update. Use when paying down debt from DEBT.md, deduplicating into a shared module, removing dead code, or any behavior-preserving change to an existing codebase.
license: MIT
metadata:
  source: fullstack-agent-os (authored; CONTINUE TO pattern from AWS Kiro EARS, expand/contract, delta-spec model from OpenSpec)
  category: lifecycle
---

# Refactor Slice — one slice, pinned, reviewed

Input: one entry from `docs/DEBT.md` (or a user-named refactor). If the candidate is bigger than ~a day or touches many callers, split it — a slice is independently reviewable by definition.

## Step 1 — Pin the behavior FIRST (hard gate)

Write characterization tests for the behavior this slice touches, as EARS regression criteria:
- `WHEN <condition> THE SYSTEM SHALL CONTINUE TO <existing behavior>`
Capture what the code DOES today (including its quirks — you are pinning reality, not intentions). Tests green BEFORE you touch anything. **If you cannot write these tests, you do not understand the behavior yet — stop and study (`systematic-debugging` mindset), or ask the user.** Architecturally risky slices (schema changes, extracting a module with many callers) → consult the `architect` agent for the slice plan first.

## Step 2 — Delta spec (one short file, `specs/refactor-<slug>.md`)

What CHANGES and what is pinned: `## ADDED` / `## MODIFIED` requirements only. Never "document the whole system" — the spec describes this slice's diff to behavior, nothing more.

## Step 3 — Execute

- Worktree (`using-git-worktrees`) if available.
- **Expand/contract** for interface changes: add the new path → migrate callers one commit at a time → delete the old path LAST, in its own commit. Every commit leaves the full suite green — a commit you cannot safely revert is too big.
- Dead-code removal: the verified-zero-references proof travels with the commit message.
- DRY payoffs: extract the shared module, migrate callers to it, delete copies — behavior identical, proven by the pinned tests.

## Step 4 — Review & close

- Two-axis `code-review` (Standards + the delta spec) + `verification-before-completion` (fresh full suite + affected QA regression rows).
- Update `docs/DEBT.md` (entry → done, date) and `tasks/TASKS.md`.
- Report: what changed, evidence (suite line, before/after for the motivating metric — e.g. copies of the logic 3 → 1, lines removed), commits, anything discovered but not touched (back to DEBT.md).
