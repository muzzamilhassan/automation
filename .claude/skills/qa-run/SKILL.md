---
name: qa-run
description: Execute a feature's QA file row by row with real evidence — run the automated tests and quote their output, perform the manual steps in the real app, capture screenshots for visual rows, fill Actual/Evidence/Status for every row, and report honest pass/fail findings. Use after implementation, before feature sign-off, or when the user asks to verify, test, or QA a feature.
license: MIT
metadata:
  source: fullstack-agent-os (authored)
  category: quality
---

# QA Run — execute the QA file with evidence

Walk `qa/<feature>-qa.md` top to bottom. Evidence or it did not happen. You are finding truth, not defending the code — **you do NOT fix code here**; findings go back to the implementer, and you re-verify after they claim a fix.

## Preparation

- Load the spec and the QA file. If criteria changed after generation, regenerate the affected rows first (`qa-file-generator`) and note it — the file must mirror the CURRENT spec.
- Get the app running. If you cannot start it, that is finding #1, severity blocker.

## Execution

1. **Automated rows first** (batch them): run each named test individually and quote name + result line. A named test that does not exist = FAIL "test missing". Then run the FULL suite once and quote the summary line.
2. **Manual rows:** follow the steps exactly in the real browser/app, with fresh state per row unless the file says a row continues from an earlier one. If a step cannot be followed as written, that is itself a finding — record what the step SHOULD have said.
3. **Visual rows:** real screenshots — full page, desktop 1440 + mobile 375 (+RTL if supported), saved under `qa/screenshots/<feature>/`. Compare against Expected; note clipping, overflow, misalignment, and missing states (loading/empty/error) even when the feature "works".
4. **Boundary probes:** for every WHEN row, also try the edge from its Boundary probe column. The criterion must survive its boundary; what happens at the edge goes in Actual.
5. **Fill as you go:** Actual, Evidence (test name + result / screenshot path / quoted log line), Status (PASS / FAIL / BLOCKED). "Looks fine" is not evidence. Browser automation (Playwright MCP or scripts) is allowed for driving flows and capturing screenshots — the evidence rules do not change.

## FAIL protocol

- Classify each FAIL: **blocker** (criterion unmet) · **major** (criterion met, edge case broken) · **minor** (cosmetic).
- Each FAIL gets: exact repro steps + what actually happened.
- Hand the list to the implementer. After fixes: re-run the failed rows AND all regression rows. Only a fully green file plus a fresh full-suite summary line closes the feature — partial re-verification is how regressions ship.

## Report

- Pass count / total, then blocker/major/minor lists with repro steps.
- Screenshots taken (paths).
- The full-suite summary line.
- Rows the user should eyeball themselves (subjective visual calls) — listed, not assumed.
