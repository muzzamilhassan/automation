---
name: testing-advanced
description: Choose and implement advanced testing beyond unit/e2e — visual regression, contract testing, load testing, and flaky-test management — with solo-developer pragmatism (a testing type is added only when its specific pain exists). Use when UI regressions keep slipping through, APIs and clients evolve independently, a launch or traffic spike is coming, or the test suite is flaky and losing trust.
license: MIT
metadata:
  source: fullstack-agent-os (authored)
  category: quality
---

# Testing Advanced — buy coverage only when the pain exists

The default suite is unit + integration + thin e2e happy paths. Each advanced type below is a purchase. The decision rule is the PAIN, not the fashion.

## Decision table

| Pain | Buy | Skip while |
|------|-----|------------|
| UI regressions ship unnoticed; premium design work | Visual regression | UI is minor, stable, or disposable |
| API and client evolve independently, or external consumers exist | Contract testing | one solo dev shipping together (generated types + e2e suffice) |
| Launch spike, pricing change, or scale feature | Load testing | traffic is predictable and far from limits |
| The suite randomly fails; people stop trusting it | Flaky protocol | flake < ~1 per 100 CI runs (fix on sight) |

## Visual regression

- **Baselines:** full page + key components, at 375 / 768 / 1440 widths (+ RTL if supported).
- **Flake controls before anything else:** animations disabled, fonts awaited, deterministic data, fixed viewport, wait for network idle. A flaky visual suite is worse than none.
- **The flow:** change → run diff → every diff is consciously APPROVED (intentional) or FIXED (regression). Baselines update only through that decision — never a convenience re-baseline.
- **Tools:** Playwright `toHaveScreenshot` (built-in, enough for most projects). Hosted visual services only when several people must review diffs.

## Contract testing

- **Solo / small team:** the schema IS the contract — OpenAPI (or generated types) kept drift-checked in CI, client types generated from the schema, e2e against the real API for the top journeys. Do not build more.
- **Multiple independent consumers/teams:** consumer-driven contracts (Pact-style) — each consumer's expectations become provider-verified tests in the provider's CI. Only start here when independent evolution is real.

## Load testing

- **Define the SLO first** (e.g. p95 < 300 ms at 50 rps). A load test without a target measures curiosity, not capacity.
- **Test realistic journeys** (browse → act → submit), not just the homepage. Watch the DATABASE — connection pool, slow queries, locks — not just app latency.
- **Tools:** k6 for scripted journeys; autocannon for a quick HTTP hammer.
- **When:** before launch, before seasonal spikes, after any scaling-relevant change. Nightly/weekly schedules only for business-critical SLOs.

## Flaky-test protocol

- "Retry until green" is never the fix — it converts a bug into background noise.
- Check in order: timing/sleep → shared state → ordering dependence → external services → date/time → animation/race.
- Immediate: quarantine (skip + ticket + deadline). Root-cause within the week (`systematic-debugging`). A quarantined test with no ticket is a bug you decided to keep.
- **Flake budget:** >1% of runs flaky = stop adding tests until trust is restored.

## CI wiring (typical shape)

- Every push: lint + unit. PR: + integration + e2e happy paths + visual diff + contract check. Nightly / pre-release: load.
- Keep PR feedback under ~10 minutes — slow CI gets skipped, and skipped CI is worse than less CI.

## Anti-patterns

100% coverage as a goal · testing implementation details · snapshot-everything · mocking the world (test the seam, not the mock) · retry-on-flake.
