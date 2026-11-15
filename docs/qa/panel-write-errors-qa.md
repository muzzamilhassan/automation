# Spec + QA — Panel writes report real failures (2026-11-16)

Admin-panel review 2026-11-15 bug #5: `setChannelAutopilot` / `removeChannel`
swallowed failed repo writes (`catch { }`) and returned ok; the Channels pause
toggle ignored the response and reloaded 60s-cached overview data.

- R1: A failed repo-feed write SHALL throw (the route returns 502); a failed DB mirror write SHALL be returned as a warning.
- R2: Disconnect SHALL report "revoked/deleted but registry removal failed" when that happens.
- R3: The pause toggle SHALL check the response, show success or the error, and reload fresh data.

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | R1 | no empty catch in either helper; warnings returned | automated | `node --test tests/panel-write-errors.test.mjs` |
| 2 | R2 | disconnect wraps removeChannel → 502 with detail | automated | same |
| 3 | R3 | r.ok check, setFlowMsg, `/api/overview?fresh=1` | automated | same |
| 4 | R3 | owner: pause a channel → "autopilot paused" appears and the card flips immediately | manual | browser |
