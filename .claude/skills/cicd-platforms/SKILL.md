---
name: cicd-platforms
description: Build the CI/CD pipeline in the right order — push-time CI, PR gates, preview/staging auto-deploys, approved production deploys — with GitHub Actions structure, caching, secrets handling, and per-platform deploy patterns (Vercel/Netlify, containers, VPS). Use when setting up continuous integration, automating deploys, fixing a broken pipeline, or when the user asks for CI/CD, GitHub Actions, or build automation.
license: MIT
metadata:
  source: fullstack-agent-os (authored; order-of-adoption and deterministic-pipeline principle from github/spec-kit agentic-SDLC guide)
  category: backend
---

# CI/CD — pipelines run builds and releases; agents interpret evidence

The pipeline is DETERMINISTIC on purpose: builds, tests, releases run by machines; judgment by humans (and agents review evidence, they do not own the deploy button).

## Adoption order — do not skip steps

1. **CI on every push:** lint + typecheck + unit tests. The feedback loop everything else trusts.
2. **PR gates:** build + integration + e2e happy paths (`testing-advanced` adds visual/contract/load when their pains exist). PRs cannot merge red.
3. **Preview/staging auto-deploy:** every PR or merge to main deploys to a disposable/staging environment — the place to break things.
4. **Production deploy:** human-approved (button or tag-triggered). Agents may PREPARE the release; a person cuts it, until the team decides otherwise explicitly.
5. **Advanced:** nightly load/visual runs — only after 1–4 are boring.

## GitHub Actions structure

- One workflow per concern (ci.yml, deploy.yml) — not a god-workflow.
- Cache dependencies and builds; `concurrency` with cancel-in-progress on PRs; `permissions: least-privilege` per job; pin third-party actions to versions.
- Secrets: repo/host environment secrets only — never echoed, never in logs, never in artifacts. A secret that appears in a build log is rotated, not deleted from the log.
- Keep PR feedback under ~10 minutes (`testing-advanced`) — slow CI is skipped CI.

## Platform patterns

| Target | Pattern |
|--------|---------|
| Vercel/Netlify | git-push deploys, preview envs per PR — the fastest honest pipeline; env vars in dashboard, migration step explicit |
| Containers | slim multi-stage image, non-root user, HEALTHCHECK, image to registry, deploy = roll new tag |
| VPS | systemd units + nginx/caddy, or a PaaS layer (Coolify/Dokku) for one-command deploys; SSH deploy keys, not passwords |

## Deploys & migrations together

Backward-compatible migrations FIRST (`database-design` expand/contract) so app-rollout and schema-rollout are independent events. Deploy strategy: simple redeploy until rollback pain is real; blue-green when a rollback takes minutes you don't have. **Rollback is documented and REHEARSED** (`deploy/DEPLOY.md` §5) — an untested rollback plan is fiction.

## Agent guardrails

Agents may: run CI checks, prepare release notes, deploy to preview/staging where configured. Agents must NOT: cut production releases, run data-touching migrations, or touch DNS/billing without explicit human approval (`deploy-planner` encodes the exact allow/deny list).
