# Spec + QA — gitleaks secret scan in CI (2026-11-15)

Source: research/deep-audit-2026-11-13.md security-06 + owner request.
GitHub secret scanning on a private repo needs the paid "Secret
Protection" add-on, sold only on Team/Enterprise organization plans — not
available on this free personal account. gitleaks (MIT, v8.30.1) is the
free equivalent, run in `tests.yml`.

## History findings (not fixable in code — revoke/rotate)

Full-history scan with this config (1,034 commits): 7 findings.
- `587a2be` `.mcp.json` github-pat
- `587a2be` `check-hf.mjs`, `test-render-bg.mjs` huggingface-access-token ×2
- `07e8836` `.mcp.json` jwt (n8n key)
- `6095879` `studio/login-payload.json` (a Studio password from 2026-10-12;
  STUDIO_PASSWORD was rotated 2026-10-18)
- `96d6aa1` `.env.example` ×2 (generic rule)

None of these files is tracked any more; the values live in history only.

## Requirements (EARS)

- R1: WHEN commits are pushed to main, THE `secrets` JOB SHALL scan exactly
  the pushed range (`before..HEAD`; `HEAD~1..HEAD` for dispatch / first push)
  with values redacted in the log.
- R2: THE gitleaks binary SHALL be version-pinned and sha256-verified.
- R3: THE CONFIG SHALL use the default ruleset and silence only
  `generic-api-key` under `tests/` (fake fixtures).
- R4: WHEN a secret is found, THE JOB SHALL fail and send one ntfy alert
  with the run link.

## QA rows

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | R3 | full history: 17 findings without config → 7 with it (10 test fixtures silenced, every real leak still reported) | automated | local gitleaks 8.30.1 (checksum OK) |
| 2 | R3 | a fake `ghp_…` token under `tests/` is still detected | automated | `gitleaks dir` on a temp tree |
| 3 | R1 | `HEAD~15..HEAD` → no leaks (CI will be green today) | automated | local gitleaks |
| 4 | R1–R4 | job shape pinned (fetch-depth 0, version + sha256, range, redact, config, alert on failure) | automated | `node --test tests/secret-scan-ci.test.mjs` |
| 5 | R1 | the 🔐 job passes on this push's Actions run | automated | `bash scripts/gh-personal run view` |
| 6 | R4 | on a real hit, the owner gets "SECRET pushed to main" | manual | observe if it ever fires |

## Regression

- Full root suite green; workflow validator parses tests.yml.
