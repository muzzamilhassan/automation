# Product Research — Turning the Automation Project Into a Product (YouTube Side First)

**Date:** 2026-09-30 · **Type:** READ-ONLY deep research (no code changed)
**Question:** How do we convert this self-use automation project into a product other creators pay for — starting with YouTube only?

---

## 1. What we already own (the productizable asset inventory)

This is the rare part: the product is 80% BUILT. Nothing on the market at the prices below does all of this.

| Layer | What exists | Product-grade? |
|---|---|---|
| Script engine | 5-layer LLM chain (Gemini flash-lite → Groq → Cerebras → Mistral → HF), per-niche theme banks (48 themes, LRU dedupe), hook/title rules, daily trend scan | Yes — but free tiers are dev-only; a product needs paid keys (pennies/script) |
| Renderer | Remotion on GitHub Actions (public quarry-render repo): shorts (cinematic/photo styles) + 10+ min doc-style longform 1080p/24fps | Yes — proven daily on 4 channels |
| Music | music-engine.mjs: 1,442-track incompetech catalog, per-brand moods, CC BY auto-credit | Yes — commercially clean |
| Voice | Kokoro + Edge + OpenAI chain, per-brand voices | Yes (Kokoro Apache-2.0) |
| Upload engine | Validation gates (duration/title/duplicate, fail-closed), ET-prime scheduling, publication verification → alerts, sweeper/heal, archive to Releases, add-yt-channel.mjs onboarding | Yes — this is the differentiator; SaaS rivals stop at "download the video" |
| SEO | Ranking-tag pipeline, authority titles, in-pipeline US keyword checker (proven 09-27) | Yes |
| Retention loop | Daily avg-watched % tracking, retention sheets, under-1K detection, competitor scan | Yes — nobody at $19–99/mo has this |
| Cockpit | Quarry Studio on Vercel (analytics, production, social, tasks, dispatch, music picker, logs) | Yes — becomes the product UI |
| Cross-post | FB/IG/TikTok(Zernio)/Threads | Later — YouTube-only for product v1 per user decision |

**Unit economics per client channel (estimate):** LLM ~$0–1/mo · Actions minutes free today, ~$7/mo paid (90 renders × ~$0.08) · music/images $0 · Studio $0 (Vercel hobby) · ntfy $0 → **~95% gross margin at $99/mo.**

## 2. Market: what people already pay for (Sep 2026 prices)

| Competitor | Price | What they actually do | Weakness we exploit |
|---|---|---|---|
| AutoShorts.ai | $19–69/mo | Auto-generate + auto-post shorts | Per-series pricing (2 niches = 2×), template sameness, traffic declining (-18.8% MoM Aug 2026) |
| Revid.ai | $29–199/mo | Credit-based video generator | Credits run out; no channel management |
| faceless.video / .so | $29–39/mo | ~25–50 faceless videos/mo | No validation, no retention loop, no SEO |
| VidRush | $99/mo | Long-form AI videos | No upload/ops layer |
| Done-for-you agencies | $500–2,000/mo per channel | Humans run the channel | Slow, expensive, no dashboard |

**The gap:** everyone sells *video generation*. Nobody sells *the whole channel run daily with proof* (topic → script → render → SEO → upload → verify → retention report → fix). That's exactly what our pipeline does for our own 4 channels, with receipts (Studio, ntfy reports, retention sheets).

**Positioning line:** "Not another video generator. We run your YouTube channel — daily videos, SEO, thumbnails, scheduling, and a weekly retention report that shows it's working."

## 3. The rulebook (all three rule-makers checked)

### 3.1 YouTube content policy — GOOD news, with one condition
- Faceless channels are **NOT banned**. The July 15, 2025 rename of "repetitious content" to **"inauthentic content"** targets mass-produced, templated, zero-value uploads.
- Safe = original scripting, storytelling, niche value — literally our retention-engine approach (per-niche banks, hook rules, dupes protection).
- Disclose AI only where content is realistically synthetic (synthetic voice on sensitive topics etc.).
- **Product implication:** sell "safe automation" (quality gates, dedupe, retention score) — not "spam 100 videos/day." That protects customers from demotion and protects our reputation.

### 3.2 YouTube Data API — the service model is the compliant shape
- Uploads must be made **on behalf of the authenticated user** (the client OAuths their own channel — exactly what add-yt-channel.mjs already does).
- YouTube can audit API clients; a public self-serve SaaS eventually needs compliance documentation (privacy policy, data handling, required delete functionality) and possibly a quota/audit review. Post-Dec-2025 restructure: uploads have their own bucket ≈100/day per API project — enough for dozens of client channels at 1–3 videos/day.
- **Product implication:** the done-for-you service (we operate client channels with their OAuth permission) is the same compliance shape as running our own 4 channels today. A self-serve SaaS needs real compliance work first — one more reason service-first.

### 3.3 GitHub Actions — fine for CI/CD, not a free backend
- Public-repo Actions usage is free/unlimited **for the software project's own production, testing, deployment, publication**. Prohibited: unrelated compute, long-running servers, burdening GitHub.
- Running our pipeline = CI producing our project's output: current use is defensible. Running a commercial product's customer workloads at scale on free public-repo minutes is against the spirit (and leaks customer metadata in a public repo).
- **Product implication:** pilots fine as-is; the moment real money starts, move client renders to **paid Actions minutes (~$0.008/min Linux → ~$0.08 per 10-min render)** in a private repo. Pennies, and it also fixes the privacy leak (public quarry-render shows the whole pipeline).

### 3.4 Getting paid from Pakistan — SOLVED
- Stripe is unavailable in PK. Use a **merchant of record**: **Paddle** (explicitly supports Pakistani businesses) or **Lemon Squeezy** (simplest for solo micro-SaaS; all-in-one checkout + tax). They handle VAT/sales tax worldwide.
- Payouts land in **Payoneer** → local PK bank. **Key synergy: Payoneer KYC is ALSO the blocker for the affiliate roadmap (B1) — one signup unblocks two money paths.** Payoneer KYC remains the single pending user action.
- Later, if volume justifies it: US LLC + Mercury/Stripe (not needed for pilots).

## 4. The three product shapes (with honest tradeoffs)

### Shape A — Done-For-You service ("we run your channel") ⭐ RECOMMENDED FIRST
- **Offer:** client connects their YouTube channel (OAuth via our onboarding script), picks a niche; our machine runs it daily — 1–3 shorts/day, optional weekly long-form doc, SEO, thumbnails, ET-prime scheduling, verification, weekly retention report. Client approves topics weekly (or full autopilot).
- **Price:** $99–149/mo per channel intro (anchor: tools that do LESS charge $19–99 self-serve; agencies charge $500+). Long-form doc add-on $49–99/mo (finance niche RPM $4–20 makes this an easy ROI story: 30k doc views/mo = $120–600 for the client).
- **Build needed (~1–2 weeks part-time):** landing page, LemonSqueezy/Paddle checkout, per-client secrets pattern (exists — we already manage 4 channels' tokens), client weekly report (daily-excel-report repointed), Studio gets a client selector, simple service agreement + refund rule.
- **Why first:** near-zero new code, revenue in weeks, every client = retention case study for the SaaS. Risks: support burden, client OAuth trust (mitigate: privacy page, revocable tokens), niche conflicts (don't run a client in the exact same niche as IC/MR/DFD).

### Shape B — Self-serve SaaS ("connect your channel, autopilot") — PHASE 2, NOT NOW
- Requires: multi-tenant Studio (per-user auth + isolated secrets), self-serve OAuth onboarding, tiered billing, compliance docs (YouTube API audit prep, privacy/ToS pages), paid Actions minutes, paid LLM keys, support system.
- Build: 4–8+ weeks focused work. Only worth starting after 5–10 paying service clients prove demand and price.
- **TikTok "Quarry Studio" own-app angle (already in progress per PLAN.md):** the own-app approval story gets STRONGER as a real product ("multi-brand publishing product") — keep it aligned.

### Shape C — Open-core (publish the engine, sell hosted) — OPTIONAL side door
- quarry-render is already public. Publish the pipeline as open-source → trust + audience → sell hosted Quarry Studio + managed service. Medium effort; slower money; strong long-term moat. Decide after 3 pilot clients.

## 5. Recommended staged plan (YouTube side only)

**Phase 0 — Decision week ($0):**
1. Pick offer + price: "Channel Autopilot — $99/mo intro per channel, YouTube only, weekly retention report." (Numbers can change; the shape matters.)
2. One user action that unblocks money: **finish Payoneer KYC** (needed for affiliate plan B1 too).
3. Pick pilot clients: 2–3 from creator communities / FB groups / existing followers. Do NOT run them in IC/MR/DFD's exact niches.

**Phase 1 — Sell the first pilot (~1–2 weeks build, code-light):**
4. Landing page + Lemon Squeezy checkout (or Paddle) — service, not SaaS.
5. Client onboarding runbook: OAuth via add-yt-channel.mjs → client secrets namespace → niche pick → topic bank seeded.
6. Studio client selector + per-client weekly retention report (reuse daily-excel-report).
7. First client live: daily shorts + weekly report to THEM (email/WhatsApp), not just ntfy.

**Phase 2 — Prove it (30 days):**
8. 3–5 paying pilots. Weekly report = the sales artifact. Collect testimonials + retention numbers.
9. Fix whatever support teaches us. Raise price for client #4+ ($149+).

**Phase 3 — SaaS-ify only if demand is real (later):**
10. Multi-tenant Studio, self-serve billing tiers, YouTube API compliance docs, paid Actions minutes in private repo, paid LLM keys. This is when "Quarry Studio" becomes a real product, and the TikTok own-app story aligns with it.

## 6. Risk register (honest)

| Risk | Likelihood | Mitigation |
|---|---|---|
| Client channel hit by "inauthentic content" demotion | Medium if sold as spam; LOW sold as safe automation | Quality gates as features; no mass-post tiers; disclosure guidance |
| Support burden (single person) | High at scale | Service capped at ~5 clients until Phase 3; weekly report answers 80% of questions |
| Free LLM tiers used commercially | Policy risk | Switch to paid keys (pennies) once first client pays |
| GitHub Actions ToS at scale | Low now, real later | Paid minutes + private client repo at first revenue |
| Payoneer KYC delay | Open today | User action; unblocks B1 affiliate too |
| Trust: clients hand OAuth to a stranger | Real | Landing page + privacy policy + testimonial #1 fixes most of it; tokens revocable any time |
| Niche collision with our own 4 channels | Real | Client intake: exclude finance-quote niches; different theme banks |

## 7. Verdict

The project is a product wearing an automation costume. The fastest honest path: **sell the run, not the tool** — a done-for-you YouTube channel service at $99–149/mo using the exact machine that already runs 4 channels daily with proof — then let paying customers pull us into building the SaaS. No new infrastructure is required for the first dollar.

Sources: [AutoShorts review](https://autotube.pro) · [Revid pricing](https://www.revid.ai) · [faceless.so plans](https://faceless.so) · [YouTube channel monetization policies](https://support.google.com/youtube/answer/1311392) · [inauthentic content explainer](https://invideo.io/blog/youtube-kills-ai-faceless-channels/) · [faceless channels not banned](https://aituber.app/blog/faceless-youtube-channels-demonetized-2026/) · [GitHub Actions billing](https://docs.github.com) · [Actions usage limits / prohibited uses](https://docs.github.com/actions/learn-github-actions/usage-limits-billing-and-billing) · [Paddle for Pakistan](https://www.paddle.com) · [YouTube API Services ToS](https://developers.google.com/youtube/terms)
