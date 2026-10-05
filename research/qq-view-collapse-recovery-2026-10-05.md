# QQ View Collapse — Diagnosis + Recovery (2026-10-05)

**Type:** diagnosis + executed recovery plan (user: "go with all 4")
**Question:** Quote Quarry was growing (3,251 views Sep 30) then "no views" for 4–5 days. Why?

## Findings (all verified via APIs on 10-05)

1. **Publishing pipeline healthy** — `channel-quotequarry.yml` succeeded 12 days straight; shorts public daily (uploads playlist checked: dates, privacy, views).
2. **ALL 4 channels cliffed the same day (Oct 1)** — QQ 3,251→444 · IC 398→24 · MR 291→94 · OMC flat-dead (Analytics daily, last-7-days query). A synchronized cliff = network-level event, not per-channel content decay.
3. **Retention did NOT collapse** — Oct 1–2 QQ shorts avgWatched 58–81% (pre-period winners 56–167%, loops >100%). Views died while retention stayed good = the Shorts feed **stopped testing the videos** (distribution shutdown), not a quality crash.
4. **Not the Oct-3 dupe deletion** — the drop began 2 days before it.
5. **The duplicate machine was still running** — "Stop Begging For Respect" ×4 in 5 days (one now private), "Conquer Yourself First" ×3 in one day (Sep 29, two same-minute = same-run dup), "5 Stoic Lessons from Musonius Rufus" + "…Rufus Exile" on back-to-back days. Root cause: there was **no title-duplicate gate at all** (only duration/garbage-title checks), and `state.lastVideos` kept only the LAST run — cross-day dupes were invisible.
6. Docs (10+ min) get 0–37 views everywhere — never had distribution (separate cold issue).

## Assessment

Leading theory: YouTube-side **network demotion** — 4 interlinked channels (featured-section funnel), same format/voices/length, mass near-duplicate titles = the exact "inauthentic/mass-produced content" signal (July-2025 policy). Secondary: normal Shorts feed volatility on small channels (QQ already showed 420→64 cooling in the Sep-19 audit — boom/bust character). API cannot see strikes/demotion notices — user must check YouTube Studio → Channel violations.

## Recovery executed 10-05 (all 4 steps, user "go")

| Step | What | Where |
|---|---|---|
| 1. Pause | `pausedUntil: 2026-10-08` in QQ state; respected by yt-daily (shorts+episode), yt-deepdive, daily-sweeper (won't heal a paused channel). Workflows disabled via API: `automation/channel-quotequarry.yml` + quarry-render "Long-form Render" + "Long-form Upload" (docs paused network-wide — they had 0 views anyway) | state + GitHub API |
| 2. Duplicate gate | NEW `lib/dup-gate.mjs`: fuzzy title match (normalize, strip "\| suffix" + stopwords, exact/containment/Jaccard ≥0.6) vs the channel's **live last-45 upload titles** + durable `titleHistory` (60 entries, was missing) + same-run dedupe. Wired into yt-daily (pre-render + pre-upload) and yt-deepdive (pre-upload). Tested on 8 real dup pairs — 8/8 correct | yt-daily / yt-deepdive |
| 3. De-clone | "More From Quarry Studios" cross-channel sections DELETED on all 4 channels (ids backed up in `yt-mcp/funnel-backup.json`, restore tool = re-add via channelSections API) | `yt-unfunnel.mjs` |
| 4. Clean test | Auto re-enable scheduled Oct 8 (~72h): workflows back on, pause flag removed, then 7 days of strictly-gated unique uploads on QQ to judge recovery | scheduled automation |

## What NOT to do (agreed)

No mass video deletions, no re-uploads, no sudden niche change — all extend demotions.

## Recovery signals to watch (Oct 8+)

- New shorts' per-video views (0–50 = still suppressed; 300+ = feed re-testing)
- Channel daily views trend on the Analytics page
- YouTube Studio notices (user checks manually)
