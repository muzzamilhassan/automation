# Facebook Audit — why pages have zero reach, and the growth plan

2026-09-20. Live data via Graph API (all 4 pages, last 10-30 posts each) + Meta 2025-26 policy research.

---

## 1. The numbers (live, Sep 20)

| Page (feeds YT channel) | Followers | Recent reels | Views |
|---|---|---|---|
| Silent Wealth (IC) | 7 | 10 | **1 total** |
| Strategic Silence (QQ) | 95 | 10 | **0** |
| Eon Ventures (MR) | **14,911** | 30 | **1 total** |
| The Boundaries Club (DFD) | 0 | 10 | **0** |

**Total: ~60 reels = 2 views.** This is not "low reach" — it is a complete distribution blackout.

Also found: **duplicate reels** — same video posted 2× on pages (e.g., "Trading Psychology Traps" twice on Silent Wealth, 3 videos published at the identical minute per page). This came from the backfill's FB step and actively harms page quality signals (Meta suppresses copies — even your own).

## 2. Why reach is zero — the actual mechanism

Meta's own rules match our situation exactly:

1. **"Unoriginal content" demotion.** Meta (July 2025, expanded 2026): *"Third-party content that is posted without substantial changes is considered unoriginal and will receive reduced distribution."* Our reels are YouTube Shorts uploaded via API with **zero changes** — the exact pattern Meta demotes to near-zero. Meta actioned ~500,000 spam accounts in H1-2025 and removed 20M+ impersonation accounts; the Reels AI ranker explicitly scores originality.
2. **Duplicate detection.** Even your OWN video reposted (across pages or twice) is suppressed as a copy.
3. **Cold-start pages.** 0-95 followers + zero engagement history = no seed audience for Reels recommendations. FB recommends reels that people engage with; with nobody to test on, distribution never starts.
4. **Eon Ventures' 15k followers are not an audience** — a dormant/mismatched-followers page (name doesn't match the content, audience never engaged) gives zero seeding; FB distributes to NON-followers via recommendations, and the recommendation test is failing at the content-originality layer before audience even matters.
5. **Cadence pattern:** 3 identical-format posts/day with zero engagement reads as automation spam to a cold page.

## 3. What does NOT need fixing

- Posting infrastructure works flawlessly (schedules, uploads, slots).
- YouTube cross-platform-wise: posting your own YT content on FB is allowed — the problem is only that it's **unchanged**.
- The niche posters (image posts) are already native content.

## 4. The growth plan (steps, in order)

### Step 1 — Identity fix (user, 10 minutes, manual)
Rename the 4 pages to match the channels (brand confusion confuses both the algorithm and humans):
- Silent Wealth → **Investor's Compass**
- Eon Ventures → **The Money Rulebook** (the 15k followers see the correct brand at last)
- The Boundaries Club → **Debt-Free Doctrine**
- Strategic Silence → **Quote Quarry**

### Step 2 — Content: make it NATIVE (the core fix)
Same scripts, re-rendered as an **FB-native variant**: different opening frame, page-branded intro/outro card, FB-specific caption + CTA ("Follow [Page] for daily…"), different music mix, slightly different visual treatment. That is "substantial transformation" — passes the originality scorer, and costs us almost nothing since the render engine is parameterized. *(pipeline change — awaiting "go")*

### Step 3 — Cadence: quality over pattern
During the rebuild: **1 native reel + 1 niche poster per page per day** (not 3 identical reels). Raise back to 2-3/day only per page that shows distribution (reels crossing ~100 views).

### Step 4 — Cleanup (needs "go")
Delete the duplicate reels (same video posted twice) via API — duplicates feed the "copy" classifier.

### Step 5 — Manual engagement seeding (user, 10 min/day)
This is the part automation cannot do, and it's what bootstraps cold pages:
- Share each new reel to your personal profile + 2-3 relevant Facebook groups (finance/investing/debt groups are huge on FB).
- Invite everyone who reacts to follow the page (page has a one-click "Invite" list).
- Reply to every comment within a day.
- Check **Professional Dashboard → Account Status → Content distribution** on each page: if reels are labeled "unoriginal", appeal them — this confirms the diagnosis and can restore distribution.

### Step 6 — Measurement
Watch reels weekly: distribution returning looks like non-zero views appearing on NEW reels (old ones stay dead — that's fine). Judge the new format after ~14 days. Add weekly FB reach to the report after data flows.

### Expectations (honest)
- FB is a bonus funnel; YouTube is the money platform. Even when fixed, FB growth will be slower than YT Shorts because page cold-starts are harder.
- The 15k on Eon Ventures may partially re-activate once the name matches and native reels flow — or may never. Don't count on it; treat it as a bonus.
- Realistic 30-day target after the fix: 100-1,000 view reels appearing on at least 2 of the 4 pages, followers turning positive daily.

## 5. Sources
[Meta Original Content Guidelines](https://www.facebook.com/business/help/337816449368832), [Combating unoriginal content (creators.facebook.com)](https://creators.facebook.com), [Rewarding Original Creators on Facebook (about.fb.com, Mar 2026)](https://about.fb.com), [TechCrunch July 2025 crackdown](https://techcrunch.com), [Facebook Reels AI ranking (transparency.meta.com)](https://transparency.meta.com), [FB Help: pages vs professional mode](https://www.facebook.com/help/203141666415461), [2026 FB algorithm strategies](https://chatbotx.io/blog/how-the-2026-facebook-algorithm-works-5-proven-strategies-to-dramatically-increase-your-organic-reach)
