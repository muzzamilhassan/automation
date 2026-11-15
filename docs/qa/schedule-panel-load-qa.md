# Spec + QA — Schedule panel never saves over a failed load (2026-11-16)

Admin-panel review 2026-11-15 bug #3: when the schedule GET failed (network
error or an HTTP error body), SchedulePanel fell back to an EMPTY schedule and
Save overwrote the channel's real days in cadence.json.

- R1: THE PANEL SHALL treat a non-2xx or failed GET as a load error (no empty fallback).
- R2: WHILE a load error stands, Save SHALL be disabled and refuse to run.
- R3: THE PANEL SHALL show the error with a Retry.

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | R1 | `r.ok` checked; setLoadError; no silent empty fallback | automated | `node --test tests/schedule-panel-load.test.mjs` |
| 2 | R2 | save() guard + isDisabled includes loadError/!schedule | automated | same |
| 3 | R3 | error text + Retry button | automated | same |
| 4 | — | eslint clean (no set-state-in-effect); `next build` OK | automated | local |
| 5 | R1–R3 | owner: with the API failing, Save stays disabled and Retry recovers | manual | browser |
