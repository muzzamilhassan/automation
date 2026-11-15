# Spec + QA — Broken live channels stay visible (2026-11-16)

Admin-panel review 2026-11-15 bug #2: `/api/overview` kept only channels with
live YouTube stats, so an ACTIVE channel whose YouTube read failed (expired or
revoked token) vanished from /channels and /production when it needed re-login.

- R1: THE OVERVIEW SHALL show every channel that has stats OR is flagged active.
- R2: EACH shown channel SHALL carry `health`: ok | youtube_error | no_youtube_data.
- R3: Dormant/parked brands (active:false, no stats) SHALL stay hidden.

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | R1/R2 | live + broken shown, broken = youtube_error | automated | `node --test tests/overview-visible.test.mjs` |
| 2 | R2 | active with no data = no_youtube_data | automated | same |
| 3 | R3 | dormant hidden; producing shown even if not flagged | automated | same |
| 4 | R1 | route uses selectVisibleChannels (stats-only filter gone) | automated | same |
| 5 | R1 | owner: a channel with a failing token shows a YouTube error row in /channels | manual | browser |
