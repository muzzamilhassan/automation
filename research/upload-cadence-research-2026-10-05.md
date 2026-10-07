# Upload Cadence Research — How Many Videos (Shorts + Long) Are Best, and Should There Be a Break Day?

**Date:** 2026-10-05 · **Type:** READ-ONLY deep research (no config changed — plan awaits "go")
**Question:** How many shorts and long videos per day are best for channel health, SEO, and the algorithm? Should the machine take a break day each week? Goal: professional, long-term work — not chasing subscribers with bursts.

---

## 1. What our own channels say (strongest evidence — 30 days of real data)

Measured 10-05 via the Analytics API (videos published in the last 30 days; "dead" = under 50 views, "zombie" = under 10 views):

| Channel | Videos in 30d | Dead (<50v) | Zombies (<10v) | Top 10% of videos' share of views |
|---|---|---|---|---|
| Quote Quarry | **189** (6.3/day!) | 45% | 39% | 35% |
| Investor's Compass | 140 | **94%** | 59% | 69% |
| Money Rulebook | 124 | **85%** | 48% | 53% |
| Old Money Code | 116 | **97%** | 74% | 60% |
| **Network total** | **~569** | **~83%** | — | — |

Reading:
- We produced **~19 videos/day across the network** (more than the planned 16 — the double-producer periods show up too). 83% of that output earned under 50 views.
- On IC and OMC, ~95 of every 100 videos were dead weight. This is the exact "mass-produced, repetitive" fingerprint YouTube's policy names.
- On every channel, a small top slice carries the views (top 10% of videos = 35–69% of all views). **Output volume is not finding winners — quality per video is.**
- Every dead video still cost: Actions render minutes, a doc render = 40+ min for 0–37 views, subscriber-feed flooding, and one more "template" fingerprint on the channel.

## 2. What the research says (Oct 2026)

### Shorts frequency
- Common sweet spot cited: **1–3/day is the UPPER bound** (StoryClips, FlowShorts); for solo creators / small teams: **3–7 per week** is the sustainable recommendation; many strategists now advise **one high-quality Short per day** so each video gets a real chance (Subscribr, Epidemic Sound).
- The Shorts algorithm ranks **per-video quality signals** (watch-through, hook, engagement) — more rushed videos do not lift the channel, they dilute it.
- Shorts discovery is **feed-driven, not subscriber-schedule-driven**: viewers get Shorts from the feed, not from an upload calendar. → a skipped day costs almost nothing; there is no streak bonus.

### Missing days / breaks
- **No algorithm penalty for missing a day** — per-video performance (CTR, watch time) drives everything; "upload streaks" are a community-debunked myth (r/youtubers, YTtalk, creator guidance). Long breaks slow momentum/habit, they don't punish.
- Google's own YouTube guidance asks creators: **is your frequency sustainable long-term?** — not "upload as much as possible."

### Long-form / documentaries
- Professional baseline: **1/week per channel** (vidIQ: channels at 4–7 uploads/month ≈ healthy growth; "start with one video a week if you can sustain it"). Team5pm: weekly/bi-weekly suits depth-and-quality formats. **Daily documentaries are beyond even big studios** and ours get 0–37 views.
- Long-form wins on **retention + watch time**, never upload count. Publish late morning UTC so it indexes before US prime evening.

### Days of week
- Buffer (1.8M videos): **Friday best for Shorts**, then Saturday, Thursday. Adobe: Thursday top, ~4 PM. Broad prime: **7–9 PM viewer local (our ET slots are right)**. Our own Analytics "when viewers are on YouTube" beats all studies.

### The policy ceiling
- July 15, 2025: "repetitious content" renamed **"inauthentic content"** — explicitly covers **mass-produced, template, repetitive** uploads (demonetization/demotion risk). Daily 3× same-format shorts + daily docs across 4 cloned channels sits directly on this line — which is what the Oct-1 collapse looked like.

---

## 3. The professional cadence (recommendation)

Per channel:

| Type | Now | Recommended | Why |
|---|---|---|---|
| Shorts | 3/day, 7 days | **1/day, 6 days (Sunday off)** | Every slot gets full quality effort; feed doesn't reward volume; best slot only (keep the ET prime slot, drop the other two) |
| Documentary | 1/day, 7 days | **1/week, fixed day + fixed ET prime slot** | Professional norm; depth > count; each doc becomes an event ("appointment viewing") |
| Break day | none | **Sunday = no new renders, network-wide** | Buffer building + weekly review (retention sheet, hook fixes, audio upgrades). Zero algorithm cost — proven above |

Network result: **16+ videos/day → ~10/week per channel, ~40/week total** (from ~130/week). Freed compute goes to the things that actually move numbers: better hooks (retention engine), audio polish (SFX/ducking/loudnorm gaps), keyword-checked topics (SEO pack), thumbnails.

**SEO note (asked directly):** video SEO is per-video — keywords in title/description/tags + CTR + watch time. Uploading more never improves "channel SEO"; dead videos contribute nothing while template volume actively raises the inauthentic-content risk. Fewer, keyword-aimed, retention-strong videos IS the SEO strategy.

**Sustainability note:** the freed day is where long-term quality comes from — batch production, 2–3 video buffer (the pro standard so a bad day never breaks the schedule), weekly retention review. Long-term beats daily bursts exactly as the user said.

## 4. Implementation plan (on "go")

1. `lib/brands.json` + `yt-brands/brands.mjs`: slots 3 → 1 per channel (keep each channel's strongest ET-prime slot; verify against Analytics "when viewers are on YouTube").
2. Docs → weekly: fixed weekday per channel (e.g., QQ Sat · IC Sun · MR Mon · OMC Tue), 20:30–21:30 ET slots kept.
3. Sunday off: add a weekday guard in yt-daily/deepdive/sweeper (no new renders on Sunday UTC = Sunday ET too), OR cron-level skip. Buffer first, then strict.
4. Judge by the existing rule: no format verdicts before ~10 videos on the new cadence; weekly retention sheet is the scoreboard.

---

## 5. Sources

- Shorts frequency: StoryClips / FlowShorts / Subscribr / Epidemic Sound guides (2025–2026); r/NewTubers 30–50k-view Shorts thread
- Breaks/streaks: [r/youtubers — is skipping an upload really that bad?](https://www.reddit.com/r/youtubers/comments/ihmld1/question_is_skipping_an_upload_really_that_bad) · [YTtalk — first missed upload](https://yttalk.com) · [YouTube Creators — optimize & evolve](https://www.youtube.com/creators/grow/optimize-your-content/)
- Long-form weekly baseline: vidIQ upload-schedule analysis · Team5pm · QuickFrame timing · [Google YouTube Help — upload schedule](https://support.google.com/youtube/answer/1311392)
- Day-of-week: [Buffer — best time to post (1.8M videos)](https://buffer.com) · Adobe 2025 study · Hopper HQ 2026
- Policy: [YouTube channel monetization policies — inauthentic content, July 15 2025](https://support.google.com/youtube/answer/1311392) · Social Media Today · The Hindu (Rene Ritchie clarifications)
- Own data: YouTube Analytics API queries run 2026-10-05 (dead-rate script output in session)
