# Channel Growth Audit — IC, MR, DFD (QQ as benchmark)

2026-09-19. Data: YouTube Data API live pull (last ~30 uploads/channel), competitor outlier scan per niche. READ-ONLY research — no pipeline changes made.

---

## 1. The numbers (last ~30 uploads per channel)

| Channel | Subs | Total views | Shorts median | Shorts avg | Best short | Dead shorts (≤2 views) |
|---|---|---|---|---|---|---|
| QuoteQuarry | 114 | 49,315 | 64 | 395 | 1,363 v | 7/24 recent |
| Investor's Compass | 7 | 2,531 | 5 | 11 | 90 v | 11/30 |
| Money Rulebook | 4 | 908 | 5 | 14 | 125 v | 9/25 |
| Debt-Free Doctrine | 0 | 740 | 2 | 5 | 49 v | 16/27 |

**Long-form documentaries:** 0-3 views on ALL channels so far — expected (no channel authority yet). Do not judge the docs program for months.

## 2. Trajectory check (is anyone accelerating?)

| Channel | Median views: shorts 7d+ old | Median: last 7 days | Trend |
|---|---|---|---|
| QQ | 420 | 64 | ⚠️ cooling (age-bias inflates old numbers, but dead-rate also rose 1/20 → 7/24) |
| IC | 6 | 5 | flat |
| MR | 4 | 5 | flat |
| DFD | 3 | 2 | flat |

QQ is NOT accelerating either — its hit-rate is falling (was 1 dead in 20, now 7 in 24). The whole channel network needs format refreshes, not just the small 3.

## 3. Root-cause analysis

**Why QQ leads:** (a) 290 videos = more lottery tickets + accumulated channel authority; (b) stoicism niche = enormous global demand with weaker English competition; (c) its hits are emotional/social-pain topics: "Stop Caring About This" (1.4k), "Phrases Fake Friends Use" (1.2k), "Defeat Manipulators Without Fighting" (1.2k) — relationships, status, manipulation = universally felt.

**Why the other 3 stay flat:**
1. **37-59% of their Shorts are dead on arrival** (≤2 views) — the Shorts feed tested them and viewers swiped, or they were never distributed. With ~5 median views, the feedback loop barely exists.
2. **Topic selection is generic advice, not niche-proven patterns** (see §4).
3. **Finance is a harder pool than stoicism** — huge incumbent channels, higher CPM competition, US-English Shorts is the most competitive arena on YouTube.
4. Each channel has ~1 outlier (IC: "Buffett's Unbreakable Rules" 90v; MR: "Money Rules Rich Never Break" 125v) — those outliers ARE the signals. Nobody is doubling down on them.

## 4. What wins in each niche right now (competitor outlier scan, search-ordered by views, last ~6 weeks)

**IC niche (investing):** "The #1 Mistake The Average Investor Makes, According To Warren Buffett" (107k) — authority-attribution + mistake framing. Candlestick/trading-education hooks (437k, 56k). IC's own best short is Buffett-rules — the niche signal matches.

**MR niche (personal finance):** the numbered-habits listicle dominates hard: "7 Powerful Money Habits" (458k), "7 Smart Money Habits That Will Make You Rich" (260k), "6 Powerful Money Habits of Successful People" (503k), "7 Money Habits Every Parent Should Teach" (300k). Concrete-number goals also work ("How to Make First 1 Crore" 174k ≈ "your first $100K").

**DFD niche (debt):** the winners are TRANSFORMATION STORIES, not advice: "Paid Off House in 22 Months!" (2.5M), "Paying off ALL my debt" (598k), "Would you pay off her debt?" (533k), "Student Loans Crushing Americans — $400,000 in debt" (855k). Generic tips ("banks hate this") are invisible in this niche.

**QQ niche (stoicism):** global-language winners all = emotional self-control moments ("when someone insults you, don't react" 423k). Matches QQ's own hits.

## 5. Growth levers — prioritized per channel

### Investor's Compass
1. **Make Buffett the flagship series**: "Rule #1… Rule #2…" numbered series, consistent thumbnails (the new thumbnail engine already supports this), every 2nd-3rd short = Buffett/munger attribution ("According to Warren Buffett…" title pattern).
2. **Market-story hooks over advice**: "The Day the Market Lost $1 Trillion", "The Trader Who Blew Up $100M in One Day" — story-first, lesson-second.
3. Retire generic listicles ("5 Steps To Successful Trading" = dead).

### Money Rulebook
1. **Adopt the numbered-habits format**: every title carries a number ("7 Money Habits That Quietly Make You Rich", "6 Rules of the First $10,000"). This is THE proven format of the niche.
2. Concrete money amounts in titles ($10K, $100K, $1M) — goal-driven curiosity.
3. "Rich vs middle-class" psychology framing (proven at 185k by competitors).

### Debt-Free Doctrine (weakest — biggest change needed)
1. **Shift from tips to transformation**: frame as journeys and stakes ("The $30,000 Mistake", "Paid Off $10K With One Rule", "Week 1 of the Debt Snowball"). The niche rewards stories people see themselves in.
2. Second-person fear/relief framing: "What Debt Collectors Can Actually Do To You" beats "Collectors Hate This Secret".
3. Consider a recurring "journey" series so viewers follow progress (series = return viewers = subscribers).

### All 3 + QQ
1. **Title rewrite rules (network-wide)**: number or dollar figure in title; curiosity gap in first 3 words; 2nd person ("you/your"); drop "Stop/Don't X" monotony (IC/DFD overuse it; QQ's flops are also "Stop X" ones).
2. **Hook engineering in the script brain** (needs a small prompt tweak later — NOT done now): first sentence must be a question or stake, never a definition. First 2 seconds decide the swipe.
3. **Enable YouTube Analytics** (user one-click) → then pull per-video retention + traffic sources; verify viewed-vs-swiped >70% target; retune themes on data instead of guesses.
4. **Funnel the one existing audience**: QQ has 114 subs = the only live audience in the network. Add "featured channels" on QQ pointing at IC/MR/DFD (+ pinned comment on QQ hits) — costs nothing.
5. **Double down on outliers**: whenever a short beats the channel median 3×, produce 2 follow-ups on the same theme within 48h (the theme bank rotation currently moves on).
6. Keep the 3/day cadence + Sep 20 slot fix; do NOT increase frequency (dead shorts increase, quality dilutes).

## 6. Data gaps (next step, needs user)

1. YouTube Analytics API not enabled on Google project 853097802842 → enable at console.developers.google.com (project must be selected) → unlocks averageViewPercentage (retention) + traffic sources per short. THE metric for Shorts is viewed-vs-swiped; everything above is inference until this is on.
2. Facebook/IG reel views were not audited here (separate scope).

## 7. What was NOT done (per user instruction)

No code changes, no prompt changes, no pushes. This file is local-only until the user says push.
