---
name: deploy-planner
description: Produce this project's deploy/DEPLOY.md — one-time setup with exact click-paths, manual zero-to-running steps, the AI-agent automated deploy policy (what an agent may run alone vs what needs explicit human approval), post-deploy verification, rehearsed rollback, and the per-release update checklist. Use in new-project Phase 7, when the user asks how to deploy, or when deployment steps exist only in someone's head.
license: MIT
metadata:
  source: fullstack-agent-os (authored; gate policy from spec-kit agentic-SDLC practice)
  category: backend
---

# Deploy Planner — get it out of someone's head, onto the page

Inputs: `product/STANDARDS.md` (stack), hosting/database choices, `docs/GLOSSARY.md` for naming. If a hosting choice is genuinely open, present 2 options with trade-offs and get the pick FIRST — the guide depends on it.

Write `deploy/DEPLOY.md` from the DEPLOY template:

## 1. One-time setup

Accounts (with URLs) · exact click-paths for project/database creation · every environment variable: name, where it lives, HOW to generate its value (never the value itself) · DNS records with exact values — marked **requires explicit human approval** (an agent never changes DNS alone).

## 2. Manual deploy (zero → running)

Numbered, copy-pasteable, from a fresh clone to a working production URL — including the migration step and the "how do I know it worked" check per step. Written so the person who has never deployed this project succeeds on the first try.

## 3. AI-agent automated deploy policy (the exact allow/deny list)

**Agent may run without asking:** build, test, lint, migrations on staging/preview, deploy to preview/staging.
**Agent must get explicit user approval:** production deploys · data-touching migrations · DNS · billing/secrets changes.
**Never, no exceptions:** `git push --force` to main · deleting databases/backups · secrets in logs or commits · disabling HTTPS/auth "temporarily" · skipping the verify step because it passed last time.

## 4. Post-deploy verification

A table of checks with expected results (app loads, health endpoint 200, auth flow works, logs clean) — run after EVERY deploy, no exceptions, by whoever deployed.

## 5. Rollback — rehearsed, not theoretical

Exact steps and time estimate; database rollback strategy (forward-fix preferred; when restore-from-backup applies); the decision rule for rollback vs forward-fix. If possible, rehearse once on staging — an unrehearsed rollback is a story, not a plan.

## 6. Update checklist (every future release)

Tests green → migrations reviewed → staging verify → production → §4 checks → tag the release.

## Gate

✋ Present the guide. First deploy: walk the user through it (manual path), or run the automated path section by section if they approved it. Then the guide is amended with anything reality taught — DEPLOY.md is corrected on first contact with the truth.
