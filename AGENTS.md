# AGENTS.md

## Agent skills

### GitHub & Account Identity (Strictly Personal)

- **Owner & Personal Account**: `muzzamilhassan` (Email: `muzzamilhassan302@gmail.com`).
- **Remote Origin**: `muzzamilhassan/automation` (`git@github-personal:muzzamilhassan/automation.git` using personal SSH key `~/.ssh/id_ed25519_github_personal`).
- **NEVER use work account**: This repository must NEVER be associated with, pushed to, or operated under the work account `muzzamil-rx`.
- **GitHub CLI (`gh`)**: Always ensure active account is `muzzamilhassan` (`gh auth switch --user muzzamilhassan`).
- **Git Author**: Commits must always use `user.name = "Muzzamil Hassan"` and `user.email = "muzzamilhassan302@gmail.com"`.

### Issue tracker

GitHub issues (repo `muzzamilhassan/automation` via `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical 5-role triage vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context (`GLOSSARY.md` + `docs/adr/` at the repository root). See `docs/agents/domain.md`.

---

## FullStack Agent OS (installed 2026-10-20)

The FullStack Agent OS pipeline is installed in `.agents/skills/` + `.claude/skills/` (74 skills) and `.claude/agents/` (7 role agents). It works WITH the conventions above — it does not replace them.

### Routing — what to run when

| Task | Skill |
|---|---|
| Fix any bug (incl. issue #91) | `systematic-debugging` |
| Work a `ready-for-agent` issue | read issue → plan (`writing-plans`) → implement (TDD where testable) → `verification-before-completion` → close with evidence |
| Refactor / dedupe | `refactor-slice` + `code-simplification` |
| New feature (from issue or PLAN TODO) | spec first (`to-spec`), then `build-feature` loop |
| Before closing ANY issue | `verification-before-completion` — running evidence required |

### Non-negotiables (OS layer)

1. Evidence before "done" — quote test/output in the issue close comment.
2. One issue at a time; small commits referencing the issue number.
3. Never break the CI production master (channel-*.yml workflows are production).
4. This repo's PLAN.md rules (add-only) and the OS rules both apply; where they conflict, PLAN.md wins.
5. Personal account only: Always verify GitHub operations and git commits use personal account `muzzamilhassan` (`muzzamilhassan302@gmail.com`), never work account `muzzamil-rx`.

### Where things live

- OS repo (upstream): `github.com/muzzamilhassan/fullstack-agent-os` — update = `git pull` there, re-run `install/install.sh` here.
- Quality gate: `pnpm verify` pattern applies to the `studio/` workspace.
