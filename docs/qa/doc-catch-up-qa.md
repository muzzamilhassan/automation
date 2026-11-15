# Spec + QA — Missed doc days are caught up (2026-11-15)

Source: research/deep-audit-2026-11-13.md item #10 (catch-up half), found
while diagnosing CI Doctor's STALE investors-compass (424h, no upload).

## Diagnosis (evidence)

- The token is healthy: the 11-14 23:58Z run authenticated and ran the lane.
- `post-next`: "clip queue empty AND docs stale (last 2026-10-28)" — the
  clips lane only has supply when a documentary is rendered.
- `jobs` table (since 11-12): investors-compass ran Thu, Fri, Fri, Sat, Sat —
  never on its doc days (Wed/Sun). Wed 11-11 had no run (heartbeat dropped);
  "Sunday" was a heal dispatched at 23:58 Saturday UTC.
- `yt-deepdive.mjs` skipped unless *today* (UTC) is a doc day, so every
  missed doc day was lost for good. No IC doc script exists in `scripts`.

## Requirements (EARS)

- R1: THE SYSTEM SHALL treat a doc as due WHEN the most recent doc day on or
  before today (UTC) is later than the channel's last produced doc
  (`state.deepdiveDate`), or no doc was ever produced.
- R2: Several missed doc days SHALL produce ONE catch-up doc; a doc day
  already covered SHALL never produce a second doc.
- R3: WHEN a run catches up, yt-deepdive SHALL log "catching up a missed doc
  day (<date>; last doc <date>)"; a skip SHALL log the last doc date.
- R4: `--force`, generate-only (review gate), pause and already-produced-today
  guards SHALL behave as before.

## Impact today (computed from the live state files, 2026-11-15)

| channel | doc days | last doc | due under old rule | due under new rule |
|---|---|---|---|---|
| money-rulebook | Thu/Sun | 11-13 | yes (Sunday) | yes |
| quotequarry | Sat/Wed | 11-14 | no | no |
| investors-compass | Wed/Sun | 10-28 | yes (Sunday) | yes — and still due on Monday if today's run is missed |
| debt-free-doctrine | Fri/Mon | 11-13 | no | no |

## QA rows

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | R1 | mostRecentDocDay for Sun/Mon/Sat + none configured | automated | `node --test tests/doc-days.test.mjs` |
| 2 | R1/R2 | missed Sunday → Monday due; produced Sunday → Tue not due; caught up Monday → Tue not due; next Wed due | automated | same |
| 3 | R1 | never produced → due; no doc days → never | automated | same |
| 4 | R1/R3 | yt-deepdive guard uses `isDocDue(b, state[slug]?.deepdiveDate)`; strict today-only guard gone | automated | same (source pin) |
| 5 | R1 | investors-compass produces a doc on its next run and the clip queue refills; CI Doctor sends "RECOVERED" after its next Short | manual | autopilot run log + CI Doctor |

## Regression

- Full root suite green (1181/1181).
