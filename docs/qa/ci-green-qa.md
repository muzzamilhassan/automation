# Spec + QA — CI green again + failure alert (2026-11-15)

Source: research/deep-audit-2026-11-13.md, improvement #3 (ci-cd-03,
tests-qa-01, studio-arch-03, crossplatform-debt-01). `tests.yml` installs
root dependencies only; `studio/lib/thumb-templates.js` imports
`opentype.js`, which only `studio/package.json` declared. Locally it
resolved from `studio/node_modules`; in CI it did not, so
`tests/thumbs-studio.test.mjs` failed at load and main was red for 6+
pushes with nobody alerted.

## Requirements (EARS)

- R1: THE ROOT package.json SHALL declare every bare package reachable from
  the test suite (static and dynamic imports, following relative imports).
- R2: THE TEST WORKFLOW SHALL install with `npm ci` (lockfile-exact) and
  cache npm downloads.
- R3: WHEN the unit-test job fails, THE WORKFLOW SHALL send one ntfy alert
  carrying the commit subject and the run URL.
- R4: main SHALL be green on the next push.

## QA rows

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | R1 | guard fails before the fix naming `opentype.js`, passes after | automated | `node --test tests/root-manifest-imports.test.mjs` |
| 2 | R1 | walker self-check finds `opentype.js` through `thumb-templates.js` | automated | same |
| 3 | R2 | `npm ci --dry-run` succeeds (lock in sync); tests.yml parses and has `cache: npm` + `npm ci` | automated | local commands |
| 4 | R3 | alert step script runs with the real `lib/ntfy-alert.mjs` (no topic → graceful skip) | automated | local dry-run of the step's node command |
| 5 | R4 | 🧪 Test Suite run for this push is green | automated | `bash scripts/gh-personal run list --workflow tests.yml --limit 1` |
| 6 | R3 | owner receives a "CI tests failed on main" push on the next red run | manual | observe on the next real failure |

## Regression

- Full root suite green locally.
