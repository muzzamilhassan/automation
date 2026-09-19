# Automation Structure Audit — what's missing, what's next

2026-09-20. Scope: the whole machine (reliability, growth loops, SEO, new capabilities). Evidence-based: every gap below was observed in real incidents this month, not theorized.

---

## 1. What exists today (snapshot)

- **Production:** 4 YT channels × 3 Shorts/day (script brain → TTS → render → upload) + 1 long-form doc/day/channel (quarry-render) + FB reels + IG slot poster + FB niche posters + Threads.
- **Brains:** 5-layer free script brain (Gemini→Groq→Cerebras→Mistral→HF), new retention engine (per-brand hook/pacing/title rules), niche theme banks.
- **Safety:** upload validation gates (duration/title/duplicate), idempotent long-form uploader, sweeper that self-heals missing Shorts slots (topup) + drains FB.
- **Ops:** daily/weekly/monthly Excel reports + ntfy push + new Retention sheet; CI Doctor; Quarry Studio dashboard (localhost).
- **Cost:** $0/month running (public-repo minutes + free tiers).

## 2. Reliability gaps (fix first — each one already caused a real incident)

### 2.1 The "success lie" — no proof-of-publication (highest priority)
Incident: QQ's dead-token day. The pipeline printed "✓ Shorts queued / Errors: 0" while **nothing was uploaded** — upload failures happen inside yt-daily's "never crash" handlers and are invisible to the pipeline and the sweeper. The sweeper then trusts the same state and heals nothing.
**Fix:** add a **verification step** at the end of every channel run: for each videoId the run claims, call videos.list via the API; if any is missing → hard failure + ntfy alert to the phone. ~30 lines. This one change would have caught both this month's outages on day one.

### 2.2 Single state file = lost writes (proven 09-19)
`yt-mcp/schedule-state.json` is written by 5 scripts and CI commits; 4 parallel runs raced and 3 of 4 state writes were lost (only MR's survived) — I had to patch by hand.
**Fix:** one state file per channel (`yt-mcp/state/<slug>.json`). No shared file → no race. ~20 lines + read-path change.

### 2.3 CI Doctor doesn't validate workflows (proposal open, needs "go")
The Sep 18 YAML outage ran silently for a day; CI Doctor reported green while every schedule was being dropped.
**Fix:** CI Doctor step 1 = parse every `.github/workflows/*.yml` + alert via ntfy on parse failure. ~15 lines.

### 2.4 The Oct 1 clock (minutes burn returns)
On Oct 1 the repo goes private again and the ~2000 min/month burn resumes (dies again ~Oct 18-20).
**Fix options (pick ONE before Oct 1):**
- (a) Move the 4 Shorts pipelines to public quarry-render permanently (same pattern as long-form; the topup/verification work makes this trivial) — $0 forever. Recommended.
- (b) Stay private and trim minutes (pip/npm caching, shorter renders) — fragile.
- Note: the repo can stay public-as-backup only until Oct 1 per your instruction.

## 3. Growth loops (turn the machine from "produce" into "learn")

### 3.1 Auto-double-down on outliers (the learning loop)
Rule from the audit: when a Short beats the channel median 3×, make 2 follow-ups on the same theme within 48h. Today nobody does this. **Fix:** weekly job: pull per-short views → find outliers → push their themes to the FRONT of the bank + schedule 2 follow-up slots. Fully automatable with existing tools.

### 3.2 Weekly retention verdicts (shipped today) → auto-retune later
The new Retention sheet gives the verdict per channel each week. Phase 2 (later): the report flags the WORST-performing themes, and the theme bank swaps them out automatically (keep human approval at first).

## 4. SEO (mostly untapped, cheap wins)

### 4.1 Auto-playlist placement (offered before, needs "go")
New uploads auto-added to the 15 SEO playlists (per-channel, keyword-matched) — today it's manual and won't happen for backfill. ~15 lines in the uploader/pipeline.

### 4.2 Description upgrades
Current descriptions are formulaic. Add: first line = a natural sentence containing the main search phrase + a playlist link + a related-video link. Search reads the first 150 chars hardest.

### 4.3 Channel-level SEO packages (delivered Sep 18 — status unknown)
Titles (Title Case), handles (@InvestorsCompassHQ / @TheMoneyRulebookHQ), descriptions, keywords, trailers — handed over but not yet confirmed applied. 15 minutes of Studio work per channel; the handles get uglier by the day if unclaimed.

### 4.4 Docs are the search play — optimize for questions
Shorts = feed game (retention). Docs = search game. Doc titles should match real search questions ("Why did Lehman Brothers collapse?") — the script engine can be given a "search question" title pattern per doc. Cheap change inside quarry-render's title step.

## 5. New capabilities (what's genuinely missing)

| Capability | Status | Path |
|---|---|---|
| **TikTok** | biggest missing platform | "Quarry Studio" own-app repositioning (audit kit ready, ~1-day dashboard build) or keep Zernio drafts |
| **Community posts** | none | No API (restricted) — manual ritual on QQ hits |
| **Pinned CTA comments** | blocked | YouTube API audit required; featured-channels funnel shipped instead |
| **Multilingual channels** | none | YouTube auto-dubbing already ON (free); dedicated ES/HI channels = later decision |
| **Affiliate/blog money** | blocked on Payoneer/domain | unchanged |
| **AI presenter (Hedra)** | research only | manual $15-30/mo test before any automation |
| **Local SD images** | dead | Intel UHD 620, no GPU — Pollinations stays |

## 6. Recommended order

1. **Proof-of-publication + alert** (2.1) — catches every silent failure forever. (S)
2. **Per-channel state files** (2.2) — kills the race class. (S)
3. **CI Doctor YAML check** (2.3) — needs your "go". (S)
4. **Decide Oct 1 plan** (2.4a recommended: Shorts → public repo). (M)
5. **Auto-playlist + description SEO** (4.1, 4.2). (S)
6. **Auto-double-down loop** (3.1). (M)
7. **TikTok decision** (5). (M, user-heavy)
(S = small ≤1h, M = medium)

*Everything above is analysis only — nothing changed in this pass except this file.*
