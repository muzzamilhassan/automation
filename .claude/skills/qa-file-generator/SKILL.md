---
name: qa-file-generator
description: Generate a feature's plain-English QA file (qa/<feature>-qa.md) from its EARS spec BEFORE implementation — one checklist row per acceptance criterion with exact verification steps, typed automated/manual/visual, plus a regression section. Use after a feature spec is approved and before coding starts, or when the user asks for the QA checklist, test plan, or QA file for a feature.
license: MIT
metadata:
  source: fullstack-agent-os (authored)
  category: quality
---

# QA File Generator — the contract for "done"

Turn `specs/<feature>.md` into `qa/<feature>-qa.md` (QA-FILE template). Written BEFORE code: it defines what "done" means while it is still cheap to argue about. Someone who has never seen the project must be able to execute every row.

## Hard rules

- **One row per criterion, quoted verbatim.** Never merge two criteria into one row — merged rows are how criteria silently stop being tested.
- **Generate from the spec, never from the code.** If code already exists, the file still describes what the SPEC demands, not what the code happens to do.
- **Steps are concrete:** exact URLs, button labels, values to type, commands to run. "Test the validation" is not a step. "Open /login, enter `not-an-email`, press Sign in, expect the red message `Enter a valid email`" is.

## Row construction (per criterion)

1. **Type** — choose per behavior:
   - `automated` — pure logic, data, permissions, calculations. A test will prove it; pre-write the test's NAME in the row, named after the criterion (`<feature>-<criterion-slug>`), so implementation TDD fills it in.
   - `manual` — a real user flow through UI/CLI where automation adds nothing yet.
   - `visual` — layout, spacing, states, appearance. Screenshot proof at desktop (1440) + mobile (375) widths; RTL too if the app supports it.
   - A criterion with logic AND UI gets both rows (one automated, one visual/manual).
2. **Steps** — numbered, plain English, executable by a stranger.
3. **Expected** — the criterion restated concretely for this row: exact error message text (if the spec defines one), exact redirect target, exact visible state.
4. **Boundary probe** — the edge value to also try: empty, 0, max length, max+1, whitespace-only, double-submit, back-button after the action. Filled in now; exercised during qa-run and recorded in Actual.

## Regression section

- One row per `CONTINUE TO` criterion (verbatim from the spec).
- One smoke walk per adjacent feature this one touches: its happy path in ≤5 steps.
- These protect the feature's surroundings — most QA escapes are in the neighborhood, not the feature.

## Finish

- Leave Actual / Evidence / Status empty — they belong to qa-run, not to you.
- Report: total rows by type; any criterion you could not turn into a sensible row (→ almost always a spec gap — raise it before coding, not after); the file path written.
