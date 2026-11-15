# Spec + QA — "Clear broken queue" removes only broken clips (2026-11-16)

Admin-panel review 2026-11-15 bug #4: the clear action set `clips: []` (every
clip, unconfirmed), and "broken" meant "no url" — but Release-archived clips
(asset + the queue's lastRunId) have no url and post-next fetches them via its
release fallback, so valid queued clips (investors-compass 2026-11-15) were
labelled broken.

- R1: ONE rule (`studio/lib/clip-queue.mjs` classifyClip) SHALL decide posted / ready / broken, matching post-next: url, existing local file, or asset + lastRunId = ready.
- R2: THE CLEAR ACTION SHALL remove only broken clips; posted/ready clips, doneRuns and lastRunId stay.
- R3: THE BUTTON SHALL ask for confirmation stating how many clips are removed.

| # | Req | Check | Type | How |
|---|---|---|---|---|
| 1 | R1 | posted/ready(url)/ready(asset+run)/broken(file gone)/broken(nothing); asset without run id = broken | automated | `node --test tests/clip-queue-broken.test.mjs` |
| 2 | R1 | summarize counts match | automated | same |
| 3 | R2 | withoutBrokenClips keeps 1,2,3; route never writes `clips: []` | automated | same |
| 4 | R3 | window.confirm on the production page | automated | same |
| 5 | R1 | owner: investors-compass shows 3 remaining, 0 broken in /production | manual | browser |
