# QA: Live-fix wave A3. Today and the channel views tell the truth

*Live website test 2026-11-20 (research/live-e2e-test-2026-11-20.md), items T2-01 / T3-02 / T1-09 (P6, P11), T2-12, T3-01 (P5), T2-04 (P13), T2-15, T3-08 and T2-06. Evidence: tests/channel-activity.test.mjs, tests/wave-a3.test.mjs, the updated pins in tests/channel-overview.test.mjs, tests/phase0-truth.test.mjs, tests/home-simple.test.mjs and tests/studio-registry-surfaces.test.mjs, plus the full suite.*

**In one line:** "made today", "last made" and "today's run" now come from what the engine really did, not from a date that stopped updating in October. Upload times come from the same place the engine reads them. When a source is down, the panel shows "—" and says it is unavailable. It never shows 0.

**What "today" means:** the **UTC day**, which starts at 00:00 UTC (05:00 in Pakistan). Every date the engine writes (episode day, clip day, Shorts day) is a UTC day, and every upload slot is set in UTC, so Today uses the same day. The home list says "Channels today · UTC day", and the channel views say "Today (UTC)".

## Where the facts come from

| Fact | Source |
|---|---|
| Made today | The channel's engine state file (`yt-mcp/state/<slug>.json`): clips posted today (`clipQueue.clips[].postedAt`, else `clipLastPostDate`), episode made today (`deepdiveDate`), generated Shorts today (`lastRunDate` + `lastVideos`) |
| Last made | The newest of those signals, and what it was: Clip Short / Episode / Short |
| Today's run | The latest `channel-autopilot.yml` run today (UTC) for the channel, tagged by run name `<slug> · <event>`, using the same rules as /runs |
| Upload times | Registry slots → registry kit slots → `studio/lib/brands.json` (long slot: registry kit → brands.json). This is the same order the engine uses |

## Acceptance criteria (EARS)

- **A3-0** THE studio SHALL use one day for "today": the UTC day. It SHALL label it "UTC" wherever it shows today's state.
- **A3-1** WHEN a clip Short was posted today, THE overview SHALL count it as made today, even though the old `lastRunDate` is frozen.
- **A3-2** WHEN the episode was made today, THE overview SHALL count it. Generated Shorts SHALL count only when their date is today.
- **A3-3** THE overview SHALL report each channel's newest real production signal and what it was (Clip Short / Episode / Short).
- **A3-4** WHEN the engine state can't be read, THE overview SHALL report today as unknown (`null`), never 0.
- **A3-5** WHEN the latest autopilot run today failed, THE overview SHALL report it as failed. A later successful run SHALL replace an earlier failure. A run in progress SHALL read "running". No run SHALL read "none". WHEN run history can't be read, the run SHALL read "unknown", never "none".
- **A3-6** THE overview SHALL read today's autopilot runs with a single GitHub call limited to today (UTC). WHEN that call fails, it SHALL report the failure honestly.
- **A3-7** THE overview SHALL take upload slots and the long-form slot from the registry first (the engine's order), so Debt-Free Doctrine shows 21:20 / 20:20 instead of the stale 00:35 / 01:30.
- **A3-8** WHEN YouTube or Facebook doesn't answer, THE overview SHALL return `null` totals and list the source in `degraded`, never 0. WHEN only some channels answer, it SHALL add up those channels and say how many it covers.
- **A3-9** WHEN a channel's latest run today failed, THE home row SHALL show "run failed" in red. A run in progress SHALL read "running now" and SHALL NOT count as a missed day. A successful run that made nothing new SHALL read "ran · nothing new". WHEN nothing can be checked, the row SHALL read "can't check today" and SHALL never count as "ran".
- **A3-10** THE home row SHALL show a "clip ✓" mark when a clip went up today, next to the existing poster and episode marks.
- **A3-11** THE overview drawer, the full channel page, the channel cards and /client SHALL show today (UTC), today's run and the last thing made, in short plain words.
- **A3-12** THE channel views SHALL NOT read the frozen `lastRun` date anywhere. The Topics card SHALL show the day each pick was made instead of "From the last run (2026-10-20)".
- **A3-13** THE home list SHALL be labelled "Channels today · UTC day".
- **A3-14** WHEN a connected channel's YouTube read fails (`yt` is null), THE channel card SHALL say "YouTube · stats unavailable", never "No accounts linked yet".
- **A3-15** THE Analytics tiles and the Audience split SHALL show "—" with an "unavailable right now" note for unknown values, never 0. The split SHALL NOT print a made-up "Total 1."
- **A3-16** WHEN YouTube Analytics doesn't answer, THE Analytics page SHALL say "Unavailable right now", never "needs analytics access". A channel whose read failed SHALL be listed as unavailable.
- **A3-17** THE home page SHALL show the verdict and the channel rows as soon as the overview and approvals arrive. The views chart SHALL load on its own, with its own skeleton. WHEN it fails, it SHALL say "unavailable" with a Retry button.

## Plain-English QA checklist

| # | What to check | How to check it | Result |
|---|---|---|---|
| A3-0/13 | Today says which day it means | Open Today. The list header reads "Channels today · UTC day". The drawer tile reads "Today (UTC)" | |
| A3-1 | A clip posted today counts | On a day a channel posted its clip (e.g. QQ or IC at about 02:00 UTC), its home row says "1 made today" with a "clip ✓" mark. It no longer says "not run today" | |
| A3-2 | An episode made today counts | On a long-form day, the row shows "episode ✓" and the made count includes it | |
| A3-3/11 | "Last made" is real | Open a channel (drawer or full page). The Today tile's small line reads "Last made: Clip Short · 2026-11-20" (or Episode). It never shows an October date for a channel that posted this week | |
| A3-5/9 | A failed run shows as failed | When a channel's autopilot run failed today (e.g. DFD run 44656112937), its home row shows a red "run failed" chip. The drawer's Autopilot tile reads "Run failed 01:47 UTC" in red | |
| A3-9 | A running run is not a problem | While a channel's run is going, its row says "running now" (blue) and is not counted as a miss | |
| A3-7 | Debt-Free Doctrine times are right | Channel cards, drawer and full page show Shorts 21:20 UTC and long-form 20:20 UTC (not 00:35 / 01:30). Home's "next" time matches | |
| A3-12 | No October dates | The full channel page's Topics card shows "Long-form episode · picked <date>" and "Shorts topics · picked <date>". There is no "From the last run (2026-10-20)" | |
| A3-11 | /client is truthful | Sign in as a client. The card reads "Today (UTC): …" plus "Last made: …", not "Last production run: 2026-10-20" | |
| A3-4/8/15 | No fake zeros in an outage | Remove the GitHub token or block YouTube. Home shows "Unavailable right now: GitHub, YouTube stats…". Analytics tiles show "—" with a short "unavailable right now" note. The Audience split shows "—" and "Total unavailable right now." Nothing shows 0 or "Total 1." | |
| A3-14 | Cards don't say "No accounts linked" | With YouTube unreachable, every channel card's Accounts line reads "YouTube · stats unavailable" | |
| A3-16 | Analytics outage wording | Block /api/analytics. "Average watched" reads "Unavailable right now — YouTube Analytics didn't answer…", not "needs analytics access" | |
| A3-17 | Today doesn't wait for the chart | Load Today on a slow connection. The verdict line and the channel rows appear first. The chart keeps its own grey skeleton until analytics arrives (about 12 s). If analytics fails, the chart says "unavailable" with Retry, and the rest of the page is unaffected | |

## Known gaps (reported, not changed here)

- **/runs still uses your computer's time zone** for its "today" (PKT for the owner). That page belongs to another team. The one-line fix is to pass `timeZone: 'UTC'` to `todaySummary` in `studio/app/runs/page.js` and label it "UTC day".
- The verdict count is wave A4's. A failed or unknown channel currently falls into A4's `run:` bucket, which says "didn't run today". A4 may want to word those two states separately.
