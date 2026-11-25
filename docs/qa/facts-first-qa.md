# Facts first, then 2-hour auto-approve — QA (2026-11-25)

Owner decision 2026-11-25: write scripts only from real sources; if the owner does not answer in
2 hours AND every checked claim has a source, approve it; otherwise wait and alert the phone.

## Facts (F) — `lib/fact-pack.mjs`, `lib/claim-check.mjs`, `lib/grounded-script.mjs`

| # | WHEN … THE SYSTEM SHALL … | Type | Evidence |
|---|---|---|---|
| F1 | a script is written → first collect facts word for word from Wikipedia + news (dead sources skipped) | automated | `tests/facts-first.test.mjs` buildFactPack |
| F2 | a sentence has a number (digits or words), money, percent or year not in a source → refuse it | automated | "invented numbers", "spelled-out" |
| F3 | a sentence has a name or quote not in the sources → refuse it | automated | "invented names and quotes" |
| F4 | a sentence gives advice or predicts a market → refuse it, also in the title | automated | "advice and market predictions" |
| F5 | problems are found → ask the writer again with the named sentences (3 tries), then drop bad sentences only if enough text is left | automated | "repair", "groundedScript" |
| F6 | a channel without review has a failed check → stop, no video | automated | `yt-deepdive.mjs` |
| F7 | a script is saved → its sources, claims and verdict are saved with it | automated | `tests/review-seams.test.mjs` |

## Numbers on screen (S) — `lib/shown-numbers.mjs`

| # | WHEN … THE SYSTEM SHALL … | Type | Evidence |
|---|---|---|---|
| S1 | a diagram shows a number the narration does not say → remove it | automated | `tests/shown-numbers.test.mjs` |
| S2 | a counter shows 0.24 → show 0.24, not 0 | automated | `LivingDiagram.tsx` |

## Auto-approve (A) — `studio/lib/auto-approve.mjs`, `scripts/auto-approve.mjs`

| # | WHEN … THE SYSTEM SHALL … | Type | Evidence |
|---|---|---|---|
| A1 | a checked long-video script is unanswered for 2 h → approve it with the same action as the button | automated | `tests/auto-approve.test.mjs` |
| A2 | facts failed, no sources, or the script is older than the check → never approve; failed/no sources sends one alert | automated | same |
| A3 | the channel is paused, off, or set to "Wait for me" → never approve | automated | same |
| A4 | the script is older than 48 h → never approve | automated | same |
| A5 | an approved video of the channel is still being made → wait | automated | same |
| A6 | the Review page opens a script → say what happens if it is not answered | manual | live page |
| A7 | the Schedule drawer's choice is saved → stored in the channel kit | automated + manual | parse test + live page |
| A9 | staff (not the owner) tries to change the setting -> refuse (403), nothing is saved | automated | `tests/auto-approve.test.mjs` |
| A8 | a manual run → approve nothing (scheduler ticks only) | automated | workflow test |

## Known limits (honest)

- A false statement with no number, name or quote can still pass.
- Sources are Wikipedia and news pages; a wrong source gives a wrong fact.
- The paper (Lecture Notes) planner does not have the on-screen number check yet.
- Disclosure answers are "no" for the doc lane (drawn diagrams, stock footage, synthetic voice; no AI images). If a doc template ever uses AI images, this must change.
