# Videos go public only on the chosen days (2026-11-25)

Owner: days and times are set in the panel; "videos just should publish on that day".

## Spec
- **P1** A long video SHALL go public on the next long-video day at its time, whenever it was approved.
- **P2** A Short SHALL go public on a Shorts day; a passed time waits for the next Shorts day.
- **P3** Fresh-made Shorts SHALL not be produced on days that are not Shorts days.
- **P4** A long video already scheduled for a day SHALL count for that day (never two).
- **P5** A channel with no days set SHALL keep the old rule.
- **P6** The panel SHALL show the same day the engine uses.

## QA

| # | Check | Type |
|---|---|---|
| 1 | tests/publish-days.test.mjs, tests/wizard-times.test.mjs, tests/factory-plan.test.mjs | automated |
| 2 | Next approved long video lands on a chosen day | live |
