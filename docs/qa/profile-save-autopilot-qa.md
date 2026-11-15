# Spec + QA — Profile save never switches autopilot off (2026-11-15)

Source: admin-panel review 2026-11-15 (finding #1), verified in code:
`studio/app/channels/add/page.js:493` called `saveProfile(false)` → body
`startAutopilot:false` → `api/channels/profile/route.js:116-117` set
`entry.autopilot = false` → `lib/schedule-slot.mjs:65` drops the channel from
discovery. The panel kept showing ACTIVE (it reads `pausedUntil`). Not yet
triggered: the 4 live channels still had `autopilot: true` on 2026-11-15.

## Requirements (EARS)

- R1: WHEN the owner saves a channel profile, THE PANEL SHALL NOT send
  `startAutopilot` unless the owner explicitly starts the autopilot.
- R2: THE ROUTE SHALL leave `autopilot` unchanged when the field is absent;
  an explicit API `false` still stops it.

## QA rows

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | R1 | no `saveProfile(false)`; no `start = false` default; body spreads startAutopilot only when `start === true` | automated | `node --test tests/profile-save-autopilot.test.mjs` |
| 2 | R2 | route branches unchanged (true → on, false → off, absent → untouched) | automated | same |
| 3 | R1 | owner: edit a live channel's profile, Save → registry `autopilot` stays `true` | manual | git show on the registry commit |
