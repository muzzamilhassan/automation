# Blueprint — Building "Quarry Studio" Into a Hosted Product Like Zernio (YouTube First)

**Date:** 2026-10-04 · **Type:** READ-ONLY deep research + build blueprint (no code changed)
**User goal, in his words:** "I will host and deploy this project. A 3rd person logs in, connects their OWN YouTube channel from their OWN Google account (not my mail), selects a niche, and videos start creating and publishing automatically."

**Verdict: YES — fully possible. Every competitor we studied (Zernio, Blotato, AutoShorts.ai, faceless.video, Ayrshare, Postiz) is exactly this: a hosted site where customers OAuth their own accounts and the platform posts on their behalf. There is no secret technology behind them. There are exactly THREE walls, all passable, and we've already climbed harder ones.**

Companion doc: `research/product-saas-channel-connect-2026-10-04.md` (Zernio mechanics, competitor pricing table, morning research).

---

## 1. The three walls between us and a live product

### Wall 1 — Google's approval (the "connect your YouTube" button)
To let a stranger click "Connect YouTube" on OUR site and have OUR app ask for permission, our Google Cloud app must be approved by Google:

| Rung | What ships | What it needs | Cost | Time |
|---|---|---|---|---|
| **0. Product login** | Customers sign up / sign in to the site | Google Sign-In with `openid`/`email`/`profile` — **non-sensitive, works day 1, no approval** | $0 | 1 day |
| **1. Connect + Analytics** | Customer links channel, sees their views/watch-time/retention in our dashboard | Sensitive-scope verification: consent screen, homepage + privacy policy on our domain, **demo video (unlisted YouTube)**, per-scope justifications. `yt-analytics.readonly` and channel-read scopes are sensitive tier — **NO paid assessment** | **$0** | official "3–5 business days", real world ~2–6 weeks |
| **2. Auto-upload** | The actual autopilot: publish videos to their channel | `youtube.upload` is a RESTRICTED scope → **CASA Tier 2 security assessment by an ADA-authorized lab**. Cheapest known: **TAC Security ~$540/yr** (Google-negotiated rate); other labs $1,200+. Self-scan option was DEPRECATED (Nov 2024). Annual revalidation | ~$540–700/yr | 1–3 weeks after app is ready |
| **3. Commercial audit + quota** | Stay compliant + raise upload quota | YouTube API Services "Audit and Quota" form in Cloud Console: demo account, screencast, data-retention answers. Required for commercial clients + any quota increase (default 10,000 units/day ≈ 6 uploads/day; `videos.insert` = 1,600 units) | $0 | review is slow: ~4–8+ weeks, quota granted incrementally |

**While unverified, testing mode is useless for customers:** 100 test users max AND refresh tokens die every 7 days (documented Google behavior). So the autopilot cannot ship to strangers before Rung 2. This is the single honest blocker of the whole plan — and it's a waiting + ~$540 problem, not an impossibility.

**The bridge (how the product looks finished during the wait):** customers connect through **Zernio's API connect-link inside our UI** — our button, our dashboard, our branding; the Google consent screen shows Zernio's approved app name during the bridge weeks (one cosmetic compromise), and every account migrates 1:1 to our own app the day CASA clears (customer re-clicks Allow once — a 10-minute email, not a rebuild). First 2 accounts free, then $6/channel while bridged.

### Wall 2 — Hosting the render farm (making the videos in OUR cloud)
Today renders run on GitHub Actions for our own channels. A product needs renders on demand, per customer:

- **Remotion Lambda** is the industry-standard answer — our renderer is ALREADY Remotion, so compositions port over; only the host changes.
- Cost: ~**$0.017 per minute of video** (1-min render ≈ $0.017 compute; simple 30s ≈ fractions of a cent; a 10-min HD doc ≈ $0.10–0.50). At 2 shorts/day/client: **pennies per client per month**.
- License: Remotion is free for individuals and companies ≤3 people (we're solo). AWS account + S3 needed.
- Fallbacks: paid GitHub Actions minutes (~$0.08/10-min render) or a small worker — but Lambda is the right shape.

### Wall 3 — Running the daily autopilot per customer (the "select niche → it just runs" machine)
Today the engine is cron workflows hard-wired for 4 channels. A product needs a per-customer job queue:

- **Inngest** (Next.js-native, on Vercel): free tier ~100k executions/month (≈ 20–30 client channels), Pro $99/mo later. Alternative: Trigger.dev from $10/mo.
- Each customer channel = one daily flow: `research topic → script (LLM chain) → TTS → render (Remotion Lambda) → thumbnail → SEO → upload → verify-published → report`. Every one of these steps ALREADY EXISTS as working code — the work is re-shaping them into queue steps with a DB instead of JSON state files.

---

## 2. What we already own vs what to build (honest map)

| Product piece | Status | Work |
|---|---|---|
| Script brain (5-layer LLM chain, hook rules, dedupe) | ✅ built, proven daily | Wrap as queue step; switch to paid keys (pennies) |
| TTS voices | ✅ Kokoro/Edge/OpenAI chain | Edge TTS unreliable from cloud IPs → use paid OpenAI TTS (~$0.02–0.05/short) or Kokoro worker container |
| Renderer (shorts + 10-min docs) | ✅ Remotion on Actions | Port compositions to Remotion Lambda (same code, new host) |
| Thumbnails (photo-poster style) | ✅ built + live | Wrap as function; needs image-gen API access per render |
| SEO (titles, tags, US keyword checker) | ✅ built + proven | Wrap as step |
| Upload + validation gates + publication verification | ✅ built, fail-closed | Swap auth source: our stored tokens → customer token from DB |
| Retention loop + weekly report | ✅ built for us | Re-point reports at customer channels; email via Resend |
| Music engine (approved pools, CC clean) | ✅ built | Per-customer pool picker |
| Dashboard UI (analytics, production, videos, logs, music) | ✅ Studio live on Vercel | Add: customer accounts, per-customer workspaces, **niche-picker wizard**, **Connect YouTube button**, billing |
| Multi-tenant DB | ❌ JSON state files today | Postgres (Neon/Supabase free tier): users → workspaces → channels(niche, voice, schedule, encrypted token) → videos → runs → reports |
| Customer auth | ❌ password page today | Clerk (free 10k MAU) or Supabase auth; Google Sign-In non-sensitive day 1 |
| Job queue | ❌ GitHub cron today | Inngest flows per channel |
| Cloud renders | ❌ Actions today | Remotion Lambda |
| OAuth app ladder | ❌ personal-use project today | New product Google project + Rungs 1–3 above |
| Billing | ❌ | Lemon Squeezy or Paddle (merchant of record — both work from Pakistan; ~5% + $0.50/sale) |
| Token security | n/a | AES-GCM encrypt refresh tokens at rest; key in Vercel encrypted env |

**The product is roughly 70% built. The new 30% is: multi-tenancy (DB + auth), the wizard + connect button, the queue host, the cloud render host, billing — plus the Google approval clock.**

---

## 3. The customer experience (what you described, made real)

1. Customer lands on our site → **Sign in with Google** (non-sensitive, instant).
2. Wizard: **pick a niche** (catalog built from our theme banks + niche research: old money, money rules, tech explainers, calm motivation, …), pick a voice, pick a posting schedule, pick video style (our existing render styles as previews).
3. **Connect YouTube** button → Google login on their OWN account → Allow → channel card appears ("Autopilot: ON").
4. Within hours the first video is researched, scripted, voiced, rendered, thumbnailed, SEO-tagged, and **published** (quality gates + AI-disclosure flag set honestly). They never see any of it — just their channel filling up and a weekly report email.
5. Dashboard: upcoming queue, published videos, views/watch-time/retention charts, "pause autopilot" switch. Weekly retention report email.

**Safety rails we build in (protects customers AND our Google app's reputation — if one customer spams, OUR app gets flagged):**
- Hard caps: ≤3–5 uploads/day/channel enforced in code, no "mass post" tiers, ever.
- ToS: right to suspend abusive channels; duplicate/quality gates stay mandatory and non-optional.
- AI disclosure (`containsSyntheticMedia`) set per YouTube policy; niche catalog excludes banned/medical/finance-advice danger zones.
- Per-customer content = their niche theme bank with LRU dedupe (already our design).

---

## 4. Money model

### Cost per month at scale (estimates)

| Item | 10 customers | 50 customers | 200 customers |
|---|---|---|---|
| Vercel (dashboard) | $0–20 | $20 | $20 |
| Inngest (queue) | $0 (free tier) | $99 (or Trigger.dev ~$20) | $99 |
| Postgres (Neon/Supabase) | $0 | $25 | $25–69 |
| Auth (Clerk/Supabase) | $0 | $0–25 | $25+ |
| Remotion Lambda renders | ~$25 | ~$120 | ~$500 |
| LLM + TTS | ~$25 | ~$125 | ~$500 |
| R2 storage | ~$2 | ~$10 | ~$40 |
| Zernio bridge (temporary, until CASA) | $0–60 (first 2 free, then $6/ch) | drops to $0 | $0 |
| CASA (amortized /12) | ~$45 | ~$45 | ~$45 |
| MoR fees (~6%) | ~$60 | ~$300 | ~$1,200 |
| **Total** | **~$160–260** | **~$770** | **~$2,500** |
| Revenue @ $99/mo | $990 | $4,950 | $19,800 |
| **Margin** | **~75–85%** | **~85%** | **~87%** |

Price ladder per market norms (from competitor table): self-serve tiers $29/$49/$99 by videos-per-day and features; DFY white-glove at $149–299. Intro pilot price $99 holds.

### One-time / annual
- Domain + privacy pages: ~$10–15/yr.
- CASA Tier 2: **~$540/yr** (TAC Security) — pay only at Rung 2, gate it behind "3+ paying bridge customers".
- Google verification + YouTube audit: $0 (time only).
- Payoneer KYC: $0 (user action — STILL the blocker for getting paid; also unblocks affiliate plan).

---

## 5. Build order (the "how", sequenced)

**Week 1 (day 1 = paperwork that runs in background):**
1. Buy product domain; put homepage + privacy policy + terms live (verification requires them).
2. Create product Google Cloud project; OAuth consent screen; add scopes; record demo video; **submit sensitive-scope verification (Rung 1)**. Start the clock — everything else happens while Google reviews.
3. Clerk/Supabase auth + Postgres schema + "Sign in with Google" in Studio.

**Weeks 2–3:**
4. Niche-picker wizard + per-workspace channel model.
5. **Connect button via Zernio bridge** (profiles + `/v1/connect/youtube` + redirect back) — product feels complete for pilots while Rungs 2–3 are pending.
6. Lemon Squeezy/Paddle checkout wired to workspace activation.
7. Recruit 2–5 pilot customers (own network, FB groups, creator communities) at $49–99 intro. Pilots run on the bridge. **This is the first revenue of the actual product.**

**Weeks 3–6 (parallel):**
8. Engine refactor: JSON state → Postgres; channel-pipeline steps → Inngest flow; renders → Remotion Lambda; TTS → paid API.
9. Client weekly report email (Resend free tier) from retention endpoints.
10. When Rung 1 verification clears: swap analytics reads to direct YouTube Analytics API (kills the 2–3 day Zernio delay).

**Weeks 6–10:**
11. Rung 2: pay CASA (~$540, TAC Security), fix whatever the lab flags, pass. Add `youtube.upload` to app. Rung 3: submit Audit & Quota form (demo account = a pilot channel we operate).
12. **Swap bridge → own app:** customers re-click Allow once. Zernio dependency gone. True self-serve launch (ProductHunt, r/SideProject, creator communities).

**Realistic total: 8–12 weeks part-time with AI-assisted coding; first bridge-pilot revenue possible in ~3–4 weeks.**

---

## 6. Risks (honest)

| Risk | Reality | Mitigation |
|---|---|---|
| Google verification rejected/delayed | Common; plan 1 rejection cycle | Demo video done RIGHT the first time (show every scope in use); bridge keeps revenue flowing meanwhile |
| CASA lab back-and-forth | Labs flag missing security hygiene | TAC Security is cheapest + used to Google apps; encryption/token scope minimization from day 1 |
| One spammy customer gets OUR app flagged | Real platform risk | Hard upload caps, mandatory quality gates, ToS right-to-suspend, abuse monitoring (uploads/day alerts) |
| Building multi-tenancy = biggest coding lift | True | AI-assisted, and the engine steps all exist; only the wrapper is new |
| Zernio bridge dependency | Weeks, not months | Migration path proven (1:1 re-consent); Zernio already proven by our own TikTok use |
| Solo support burden | Real | Cap pilots at 5; weekly report answers most questions; in-app docs page |
| Content demotion ("inauthentic") | Medium if sold as spam | Sell "safe automation": caps + gates + retention reports are the pitch |
| Payments from PK | Solved shape | Paddle/LemonSqueezy MoR → Payoneer → PK bank; **Payoneer KYC still pending on user** |

---

## 7. What I need from you (decisions only — no code until you say go)

1. **GO / NO-GO** on this blueprint.
2. **Product name + domain** (~$10–15/yr) — needed to even start Google's clock. Quarry Studio brand already exists; a product-facing name/domain choice is yours.
3. **Pilot price** — my recommendation: $99/mo intro for the first 5, bridge included, lock forever for them.
4. **Budget OK for:** CASA ~$540 when we reach Rung 2 (gated behind 3+ paying pilots), ~$20–50/mo infra at pilot stage, AWS pay-per-render pennies.
5. **Payoneer KYC** — finish it; nothing can pay you until this exists.

---

## 8. Sources

- Google OAuth verification (sensitive vs restricted, demo video, homepage/privacy requirements): https://support.google.com/cloud/answer/9110914
- CASA Tier 2 process + self-scan deprecated (Nov 2024): https://appdefensealliance.dev/casa/tier-2/tier2-overview
- CASA lab pricing: TAC Security ~$540–855 (tacsecurity.com; Google-negotiated rate reported on r/androiddev); Switch Labs $1,200+; DeepStrike cost overview
- Testing mode: 100 test users + 7-day refresh-token expiry: GitHub community + connector docs (Prismatic/Appmixer) + Google Developer Discuss (2025–2026)
- Unverified production block on restricted scopes: https://discuss.google.dev (Sep 2026) + aiemaily.com CASA explainer (Aug 2026)
- YouTube API audit + quota extension (Audit and Quota form, 4–8+ week reviews, incremental grants): dev.to quota guide (Feb 2026), discuss.google.dev audit threads, TubePress community guide
- Remotion Lambda pricing (~$0.017/min; fractions of a cent per short): AWS Lambda pricing + arceapps.com / blog2video.app render-cost comparisons (2026); Remotion license free ≤3 people: remotion.dev/license
- Inngest free ~100k executions (Vercel Marketplace, Sep 2026), Pro $99/mo: inngest.com + Vercel marketplace listing
- Zernio connect API, pricing, YouTube platform guide: zernio.com + docs.zernio.com (fetched 10-04)
- Competitor pricing: plugkit.co (Blotato Sep 14 2026; Ayrshare Sep 11 2026), autoshorts.ai, revid.ai, faceless.so (from 09-30 doc)
- Pakistan payments: paddle.com (supports PK), lemonsqueezy.com MoR; Payoneer payouts (from 09-30 doc)
