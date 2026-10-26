# Competitor comparison — platform research 2026-10-24

Read-only research round for the v2 decision (scalable, template-driven, multi-tenant YouTube automation SaaS; BYOK-first, free/OSS-first). Builds on `research/faceless-youtube-saas-landscape-and-studio-roadmap-2026-10-09.md` (competitor map + gap verdicts), `research/video-maker-tools-landscape-2026-09.md` (engines/render APIs/OSS), `research/product-saas-channel-connect-2026-10-04.md` (connect rails + pricing), `research/product-saas-blueprint-2026-10-04.md` (SaaS architecture + costs), `research/video-creation-and-competitive-audit-2026.md` and `research/shorts-creation-and-competitor-audit-2026.md` (channel-level teardowns). All time-sensitive facts below were re-fetched from official pages **2026-10-24** unless flagged as carried from prior research. Sections D and E are intentionally brief — separate researchers own §10 (OSS) and dev infra.

---

## 0. TL;DR verdicts

| Category | Verdict | One line |
|---|---|---|
| A — AI video creation majors (InVideo/Pictory/Fliki/…) | **Commoditized, price war, zero channel ops** | Every major cut annual prices 30–50% in 2026 (InVideo Basic $9→$4 annual; Pictory Pro "was $59"→$35); none of the 11 majors offers multi-channel operations, BYOK, or upload verification; Fliki is the only one that added native YouTube publishing (quota-metered, 50–120/mo). |
| A — faceless autopilot shelf (AutoShorts/TaleTok/…) | **Crowded, diverging on price + volume, converging on API/MCP** | Entry floor still $13–19/mo; ceiling exploded upward (Vsub Max $499, Channel Farm $699, AITuber Enterprise $999) — the shelf now sells *compute volume*, not seats. TaleTok +~40% price hike in 6 weeks; AutoShorts' 1-series cap (its #1 complaint) is still on every plan incl. free. API/MCP went from rare to common in one quarter. |
| B — YouTube publishing platforms | **Scheduling is a $0–20/mo commodity; ops layer still empty** | vidIQ now bundles MCP on every plan incl. free; Metricool connects 50 YouTube channels at $159/mo; no scheduler documents failed-upload handling, verification, or retention loops — all `unknown`/absent. TubeBuddy still 1 channel per license (multi-channel = Enterprise sales call). |
| C — social automation | **YouTube support varies wildly — verified per tool; one trap confirmed** | n8n uploads but cannot schedule via its node; Activepieces is read-only for YouTube (no upload action at all); Windmill has no YouTube integration; Postiz/Mixpost/Blotato/Ayrshare do support YouTube. Postiz (AGPL-3.0, 37.7k★, cloud $29–99) is the existence proof that OSS-core + hosted SaaS works — our closest model template. |
| D — OSS video production | **Two monopolies forming; brief here** | MoneyPrinterTurbo (MIT, 134.8k★) is the open default; HyperFrames (Apache-2.0, 71.3k★) grew ~45% in ~6 weeks. §10 researcher owns the deep dive. |
| E — developer infrastructure | **Stable; brief here** | Shotstack re-verified unchanged ($39/250min → $499/10,000min); Remotion's ≤3-person free license + $0.01/render Automators tier remains the render-license fork in the road for a SaaS. |

**Top gaps (details in Gap analysis):** (1) BYOK exists in exactly ONE competitor feature on the whole map (ReelFarm Enterprise's "add Anthropic API key") — our BYOK vault is a real differentiator; (2) nobody publishes upload gates/verification/retention loops — still the empty seat from the Oct-09 research; (3) multi-channel portfolio pricing is arriving from below (AITuber's 1/2/4/unlimited-channel tiers) before we ship it — the window is closing; (4) API/MCP is now table stakes, day-one requirement, not roadmap.

---

## 1. Category A — AI video creation platforms

### 1a. The majors (idea/prompt/script → video)

All prices fetched 2026-10-24 from official pricing pages except where flagged.

| Product | Target user | Core workflow | Script gen | Visuals | Voice | Captions/edit | YouTube publishing | API/BYOK | Pricing (2026-10-24) | Key limits | Opportunities for us |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **InVideo AI** | Prompt-to-video marketers | Prompt → full video w/ stock+AI scenes | ✅ native | Stock + generative (Seedance 2.5/2.0, Nano Banana Pro) | ✅ TTS | Timeline editor, multiplayer | ❌ none on page | ❌ no dev API (MCP nav link exists — details unpublished) | Basic $4/seat/mo annual ($9 monthly, 190 cr) · Pro $15/$30 (1,000 cr + 10 free guest seats) · Ultra $40/$80 (3,000 cr + 20 guest seats) | Credits don't roll over; no free plan described; ~2.5–96 cr per image/video asset | They rent ByteDance/Google models at "original API pricing" — validates our BYO-model-credits architecture |
| **Pictory** | Blog/script repurposers | Script/blog/URL → video | ✅ (script→storyboard) | Stock footage | ✅ TTS + voice clones (Pro+) | ✅ editor, 60–180 min project cap | ❌ none on page | API sold separately ("has its own plans"); no BYOK | Starter $25/mo annual ($29 monthly, ~30 min/mo) · Professional $35/$59 (~90 min, clones+2 avatars) · Teams $119/$199 (~300 min) · Enterprise custom | 1080p max; 14-day trial is the only free path (720p, watermark); no refunds | Their "was $59 → $35" sticker shows category-wide discount pressure; brand kits (1/5/10) are the template-management model to beat |
| **Fliki** | TTS-first faceless creators | Idea/text → narrated video | ✅ | Stock + limited AI | 300–2,000+ voices; cloning 1–3 | ✅ | ✅ **NEW — native YouTube publishing: 50 pubs/mo (Standard), 120/mo (Premium)** | API on Premium only; no BYOK | Free (3 cr/mo, wm, 720p, **no commercial rights**) · Standard · Premium · Enterprise — **$ amounts redacted on page today** (prior: $21/$66; UNVERIFIED today) | Free tier forbids monetization; 5-min export cap on free | First major to ship YouTube publishing quotas — publishing is commoditizing downward; our quotas should be generous or unlimited |
| **Lumen5** | Content marketers (blog→social video) | Blog/text → branded template video | ✅ | Stock | ✅ | ✅ templates | ❌ | ❌ no API | Free plan (real free tier) · Starter $29 monthly / $19 annual · Pro $79/$59 · Team $199/$149 — **secondhand (Capterra/TrustRadius/site snippet; pricing page is JS-walled)** | 1080p from Starter; brand-template sameness is the known complaint | Template-branding is their moat — but no automation/API = not an ops competitor |
| **Steve.AI** | Laggard-first video creators | Script/prompt → animated+live video | ✅ | Stock + limited generative | ✅ (40% human-like on free) | ✅ | ❌ (Social Media Management = Enterprise paid add-on) | API Enterprise-only | Basic $10/mo (100 min, 720p) · Starter $30 (1080p) · Pro $40 (300 min, 2K) · Generative $40 (400 min) · Enterprise (4K, 6,000 min) | Annual "billed yearly" = 12× monthly (no discount); credits reset | Weak annual economics suggest low retention pressure — the majors are not healthy businesses |
| **Vyond** | L&D / corporate explainers | Template → animated character video | ✅ AI | Character animation | ✅ | ✅ full editor | ❌ export .mp4/SCORM only | ❌ no API | Starter $58/mo annual ($99 monthly, 25-min max video) · Professional $100/$199 (40 min) · Enterprise $137 (90 min) · Agency $167 (90 min) | No free plan; 100–200 downloads/mo on lower tiers; character-niche only | Out of our lane (no automation, no publishing); confirms corporate video pays $100+/mo — but for avatars, not channels |
| **Synthesia** | Corporate training / avatar video | Script → avatar presenter | ✅ | Avatars + scenes | ✅ + dubbing | ✅ | ❌ | **CHANGE: API now included at Pro (360 min/yr)** — prior research said Enterprise-only | Free 10 min/mo (wm, no download) · Starter $29 monthly/$18 annual · Pro $89/$64 · Enterprise custom (unlimited) | Studio Avatars +$1,000/yr; SCORM = Enterprise | Their API tiering shows avatar API access is unbundling — relevant only if we ever add presenter avatars |
| **HeyGen** | Avatar video / UGC ads | Prompt → avatar/agent video | ✅ | Avatar IV, Video Agent | ✅ voice clone ×1 free | ✅ | ❌ none on page | API priced separately (prior: ≈$4/min Avatar IV — not re-verified today) | Free 3 videos/mo ≤1 min wm · Creator $29 ($24 annual, 600 cr) · Pro $49–$4,300 (1,000–100,000 cr, 4K) · Business $149 + $20/seat · Enterprise | 30-min max video on Creator/Pro; wm on free | Same as Synthesia — avatar lane, not channel ops |
| **Canva (video)** | Everyone (design-first) | Template → edit → export | ❌ (Magic Design only) | Stock + AI | limited | ✅ editor | ❌ **Content Planner does NOT support YouTube** (schedules FB/IG/X/LinkedIn/Pinterest/TikTok/Threads only) | Canva Connect API = autofill/export, no JSON-timeline video render (prior research) | Free · Pro ~$12/mo per person annual ($18 monthly) · Business ~$20.83/mo (renamed from Teams) — **canva.com/pricing 403'd twice; search-verified only** | Bulk Create is manual-trigger; no scheduler for YouTube | Confirms even the biggest design platform doesn't ship YouTube publishing — the connect/upload rail remains the moat |
| **Runway** | Generative creatives | Prompt → AI video | ❌ | Frontier gen (Gen-4.5 12 cr/s; Aleph 2.0; hosts Seedance 2.0 + Nano Banana Pro) | ✅ (Seed Audio, TTS) | ✅ editing tools | ❌ | Dev platform (separate pricing) | Free 125 one-time cr · Standard $15/$12 annual (625 cr/mo) · Pro $35/$28 (2,250) · Max $95/$76 (9,500) | No watermark from Standard; credits reset except Max | A model aggregator, not a product competitor — but its multi-model credit menu is the UX our BYOK vault should copy |
| **Descript** | Podcasters / talking-head editors | Record/transcript → edit-by-text | AI "Underlord" | ❌ (your footage) | ✅ | ✅ industry-best text editing | ❌ drafts YouTube *descriptions*, no publishing | API + MCP listed ("edit video through code") — tier not specified on pricing page | Free 60 min/mo (720p wm, 100 one-time AI cr) · Hobbyist $16 annual/$24 monthly (10 hrs) · Creator $24/$35 (30 hrs, 4K) · Business $50/$65 (40 hrs) | Free plan AI credits never refresh; stock limited to 5 results | Their API+MCP move (Apr 2026) is the editor-world echo of the same trend: everything becomes agent-callable |

**Category read:** the majors compete on generation quality and price, have all converged on credit metering, and none of the eleven offers multi-channel operations, upload verification, or retention loops. Fliki's quota-metered YouTube publishing (50–120/mo) is the only new publish-rail development. **RECOMMENDATION (labeled):** v2 should treat this entire category as *upstream suppliers* (models, voices, editors) — not competitors — and win on the ops layer none of them ship.

### 1b. The faceless-autopilot shelf (re-verified from the Oct-09 map)

| Product | Price (fetched 2026-10-24) | Channels/series | Publish | API/MCP | BYOK | Notable change vs Oct-09 research |
|---|---|---|---|---|---|---|
| **AutoShorts.ai** | Free (paused) · $19 (3/wk) · $39 (daily) · $69 (2/day) | **1 series on EVERY plan incl. free — unchanged** | TikTok + YouTube + IG | ❌ | ❌ | Free plan "temporarily paused" — cost-side stress signal |
| **faceless.video** | $20 (30 cr/15 videos, 1 account) · $35 (60 cr/30, unlimited accounts) · $59 (120 cr) · $149 (350 cr/175) | per-credit; accounts unlimited from $35 | TikTok/IG/YT (account-count model) | ❌ | ❌ | Re-tiered: $15–45 → $20–149; unused credits now roll over |
| **ReelFarm** | $49 Growth (100 slideshows, 10 formats) · $95 Scale (250) · $195 Enterprise (750) | Unlimited TikTok accounts + team on all | **TikTok-only** (manual repurpose elsewhere) | ✅ API + Skill.md (Growth+) | ⚠️ Enterprise only: "Add Anthropic API key for unlimited generations" — **the only BYOK-adjacent feature found on the whole map** | New $195 Enterprise tier; prior $19 Starter gone |
| **Crayo.ai** | $13 Hobby (250 cr) · $27 Clipper (1,000) · $55 Pro (3,000) | single-account | not stated on page | ✅ Developer API (footer) — **new** | ❌ | Still "we do not offer refunds"; still no free trial |
| **Vsub** | Long-form: $99 (27.5k cr ≈81 min) · $199 (66k ≈193) · $499 (206k ≈616) | not stated | not stated on page | ✅ API + "MCP for AI agents" — **new** | ❌ | **Pivoted to long-form volume pricing**; prior $19/$49/$149 lineup not shown today (short-form tab exists, unrendered — UNVERIFIED) |
| **AutoReels.ai** | Free (1 video) · $19 (3/wk) · $39 (daily) · $69 (2/day) | **1 series per plan — unchanged** | TikTok + YouTube + IG | ❌ | ❌ | Unchanged |
| **TaleTok.io** | $27 (400 cr) · $47 (1,200) · $77 (3,000) | multi implied at Optimum ("posts daily across several channels") | **YouTube-only auto-post** (TikTok/IG = manual download); long-form to 30 min | ❌ | ❌ | **Prices +~40% in 6 weeks** ($17/$37/$67 → $27/$47/$77); "your own watermark" now a feature; analytics included |
| **Channel Farm** | $49 (300 cr, 10-min max, ~6 vids) · $99 (750, 15 min) · $249 (2,000, 20 min) · $699 (6,000, 120 vids/1,200 min) | single-channel shaped | YouTube publishing on all plans (scripts+thumbnails+publishing) | ✅ "MCP & CLI" — **new** | ❌ | Expanded from 1 price point to a 4-rung volume ladder; Halloween 20% discount locked for subscriber life |
| **Crealix.ai** | UNVERIFIED — site returned 403 today; Oct-09 research found only a blog, no pricing | unknown | claims daily-series autopilot | unknown | unknown | Still no independent coverage found |

**Category read (updated):** the Oct-09 finding stands — 1-series caps (AutoShorts, AutoReels) and per-credit multiplication remain the norm, and nobody documents quality gates, publication verification, or retention feedback. What changed in six weeks: (a) the **ceiling moved from $69 to $499–$999** via volume tiers, (b) **API/MCP appeared on 4 more products** (Crayo, Vsub, Channel Farm, AITuber below), and (c) TaleTok's 40% hike + AutoShorts' paused free plan suggest the cheap end is financially strained.

### 1c. New 2026 entrants (found this session)

| Product | Price (2026-10-24) | What makes it notable | Threat level |
|---|---|---|---|
| **AITuber.app** | Creator $39 (2,500 cr ≈71 shorts, **1 autopilot channel**) · Pro $69 (2 channels) · Studio $129 (4 channels) · Agency $249 (**unlimited channels**) · Business $449 · Scale $749 · Enterprise $999 (100k cr) | **Full autopilot (find ideas → script → video → auto-publish) + multi-channel tiers by count + public API + MCP server on EVERY plan + credits never expire + ElevenLabs voices + INR pricing.** This is structurally the closest competitor to our v2 thesis found to date. | **HIGH** — copied our pricing shape before we shipped it; unproven quality/traction unknown (no independent reviews found) |
| **EasyTubers** | **$15 per finished video-hour / month** (1h=$15 → 8h=$120, slider to 100h) | "AI Agent for high-retention faceless channels"; auto-upload YouTube on all plans; 1080p; no watermark; content-ownership claims | MEDIUM — novel per-output-hour pricing model worth tracking; no API; traction unknown |
| **Zebracat** | Free (5 videos lifetime) · ~$19–39 · ~$56–99 · ~$199 · Enterprise ~$599+ — **search-snippet only, UNVERIFIED** | Text-to-video social marketing; annual ≈50% off | LOW — marketing-video lane |
| **Higgsfield** | Free · Starter $19 (**personal use only**) · Plus $59/$47 (**commercial rights start here**) · Ultra $129/$99 "unlimited select models" — **search-snippet only, UNVERIFIED** | Multi-model video/image aggregator with unlimited tiers | LOW-MEDIUM — aggregator UX pressure on BYOK pricing |

---

## 2. Category B — YouTube automation / publishing platforms

Fields the brief asked about that NO product documents publicly: **failed-upload handling** (retry, verification, alerting) — absent from every scheduler's public docs (`unknown` everywhere); **workspaces** for faceless-portfolio ops — no product found (re-confirms Oct-09 section 1e).

| Product | Price (2026-10-24) | Channels | YouTube capability | Metadata/calendar | Analytics | Workspace/teams | Gap we exploit |
|---|---|---|---|---|---|---|---|
| **vidIQ** | Free (150 AI cr/mo) · Boost $19/mo or $199/yr · MAX $49/mo or $468/yr · Enterprise (3+ channels, cross-channel reporting, custom) | 1 per license; multi via Enterprise sales call | Research/SEO/ideas only — **no publishing or scheduling on any plan** | Title/description suggestions | Own-channel + competitor | Enterprise only | **MCP on EVERY plan incl. free** (for Claude/ChatGPT) — research tools are going agent-native; ideas remain disconnected from production |
| **TubeBuddy** | Pro / Legend / Enterprise — **prices JS-hidden today (prior: Pro ~$4.50/mo; UNVERIFIED)** | **"A standard license is tied to one YouTube channel"; multiple channels = Enterprise** | Bulk editing, A/B tests, **scheduled publish/update** (Legend); Thumbnail Analyzer limited on Pro | ✅ bulk metadata | Rank tracking, predictive A/B | Enterprise only | Per-license single-channel model breaks exactly where our portfolio tier starts |
| **Metricool** | Free (1 brand, 20 posts/mo, 1 YT connection) · Starter $20–36/mo annual (5–10 brands) · Advanced $53–159 (15–50 brands) · Custom | Brands = grouping unit; 50 YT connections at $159 | Connect + planner/auto-publication + comments inbox + analytics (30-day history free, unlimited paid) | ✅ calendar, best-time | ✅ incl. competitor analysis | Team seats higher tiers | **Cheapest credible multi-channel YouTube scheduler ($159/50 channels)** — the scheduling floor our price must respect; no production, no verification |
| **Buffer** | Free plan · Essentials **$5/channel/mo** annual · Team ~$10–12/channel — via Buffer's own comparison page | per-channel pricing | Schedule videos (standard support; not deep-documented today — semi-verified) | ✅ | basic | ✅ 2-tier | The per-channel pricing anchor ($5) that any portfolio tier must beat on value, not price |
| **Hootsuite** | No free plan; Standard $99/mo, Professional $199/mo — **competitor-claimed (Buffer page), not verified at source** | per-user | Scheduling + inbox | ✅ | ✅ | ✅ | Enterprise-priced legacy; irrelevant to faceless operators |
| **Agorapulse** | Standard ~$79/mo — **competitor-claimed, not verified at source** | per-user | Scheduling + inbox | ✅ | ✅ | ✅ | Same |
| **YouTube Studio (native)** | Free | 1 channel per login (Brand Accounts switchable) | Upload, **schedule**, Premieres, end screens, **Test & Compare A/B (global since Dec 4 2025)**, **free auto-dubbing 27 languages (since Feb 4 2026)** | ✅ full | ✅ native (retention, CTR) | Channel permissions | The free native baseline: any v2 feature must be "beyond Studio," and per Oct-09 G9/G10, dubbing and A/B are "automate the native feature" plays, not builds |

**Category read:** unchanged from Oct-09 — this category schedules content you already made and reports on what already happened. The 2026 development is agentic: vidIQ and Metricool both now ship MCP servers, meaning the research/analytics layer is being exposed to AI agents faster than the publishing layer. No product in this table produces video, gates uploads, or verifies publication.

---

## 3. Category C — social-media automation platforms (YouTube support VERIFIED per tool, 2026-10-24)

| Tool | YouTube support (verified how) | What it can actually do for a YouTube operation | Pricing (2026-10-24) | License/Open source | BYOK/AI | Verdict for our stack |
|---|---|---|---|---|---|---|
| **n8n** | ✅ native YouTube node (official docs) | **Video: upload, update, delete, get, list. Channel: get/update/banner. Playlists full CRUD. NO schedule operation, NO thumbnail operation** (HTTP Request node with same credential = workaround for custom endpoints) | Free self-host; cloud paid tiers (not re-checked today) | Fair-code ("Sustainable Use" license — not OSI open source) | BYO LLM keys in AI nodes | Good as *our own* glue, wrong as a product backbone; its node gap (no publishAt/thumbnail) mirrors what our publisher already handles |
| **Postiz** | ✅ YouTube provider (official docs) | Connect channel via Google OAuth; **self-host requires customer's own Google Cloud app + OAuth consent + YouTube Data/Analytics/Reporting APIs enabled**; brand-account caveats; "wait at least 5 hours" propagation. Cloud includes AI clipping of long YouTube videos (60–600 min/mo by tier) | **Cloud $29 (5 channels) · $39 (10) · $49 (30) · $99 (100 channels)** — unlimited posts, API + webhooks + RSS auto-post on ALL tiers; **no free tier anymore** (7-day trial; prior research's "free 1 brand/20 posts" is gone) | **AGPL-3.0**, 37.7k★ | AI copilot/Smart Agent incl.; no BYOK found | **The model to copy**: AGPL core + hosted cloud at $29–99; 30+ platforms incl. Twitch/Kick/Whop/Skool — breadth-first, depth-thin on YouTube |
| **Activepieces** | ⚠️ piece exists (MIT) but **READ-ONLY**: search/get video/channel/playlists/comments/captions + "New Video In Channel" trigger. **NO upload, NO schedule, NO thumbnail action** (custom API call = only workaround) | Cannot run a YouTube autopilot natively — confirmed from official piece page (9 actions listed) | Free self-host; cloud paid (not re-checked) | MIT core | BYO keys pattern in pieces | Do NOT assume Activepieces for YouTube ops — the assignment's suspicion was correct |
| **Windmill** | ❌ **No YouTube integration found** on integrations page (only Discord/Slack social-ish; page notes it shows a partial list of 50+ — full catalog unchecked, but no YouTube in featured list) | Would be DIY via HTTP/script steps | Free self-host; cloud paid (not re-checked) | Source-available/agpl-ish core + enterprise (not re-verified today) | BYO everything (it's a code executor) | Irrelevant for YouTube specifically |
| **Mixpost** | ✅ but **paid tiers only**: "Schedule videos and Shorts to YouTube" — Pro & Enterprise; **Lite (free) = Facebook/X/Mastodon only** | Scheduling incl. Shorts; unlimited accounts per platform on paid | Pro **$299** · Enterprise $1,199 (per pricing page fetch) — self-host license pricing not re-verified today | Lite free (self-host); paid tiers | no BYOK found | YouTube behind the paywall; high price point leaves the self-host BYOK lane open |
| **Blotato** | ✅ YouTube among "9 platforms"; YouTube-specific MCP guide exists | Cross-post + light AI gen; API/MCP on every paid plan; scheduling/publishing don't consume credits | **$29 (1,250 cr, 20 accounts) · $97 (5,000 cr, 40) · $499 (28,000 cr)**; 7-day trial excludes API/MCP (generating a key ends trial) | closed | credits cover gen only | Unchanged anchor; the $29/20-accounts price is the cross-posting commodity floor (Oct-09 G6 confirmed) |
| **Ayrshare** | ✅ YouTube listed among "14+ networks" (publish/schedule/analytics; per-network ops not detailed on pricing page) | The enterprise posting API; white-label on Launch+; AI Agent + MCP | **$149 (1 profile) · $299 Launch (10) · $599 Business (30, then $8.99→$2.49/profile tiered) · Enterprise (300+)**; Max Pack +$300 | closed | AI post-gen | The expensive-rail anchor unchanged; $149-for-one-profile remains our anti-price-story |
| **Zernio** | ✅ (carried from Oct-04 research — not re-fetched today) | Full YouTube: 256GB/12h uploads, custom thumbnails, `publishAt` scheduling, `containsSyntheticMedia`, analytics w/ retention curve; hosted connect-link flow | First 2 accounts free → $6 → $3 → $1/account (carried) | closed | none | Our current connect rail; per-account model predates the channel-count pricing now standardizing |

**Category read:** the assignment's caution was justified — of seven tools checked, **two cannot publish to YouTube at all (Activepieces, Windmill)**, one needs the HTTP-escape hatch to schedule (n8n), and one gates YouTube behind $299 (Mixpost). Only Postiz, Blotato, Ayrshare (+ carried Zernio) are credible YouTube rails. Postiz is the strategic reference: AGPL core, 37.7k★, cloud monetization, channel-count pricing, API/webhooks everywhere — the free/OSS-first SaaS shape our owner wants already exists in adjacent software, which is both validation and a warning that the *pattern* is claimable but the *YouTube-autopilot* application is still open.

---

## 4. Category D — open-source video production systems (brief; §10 researcher owns depth)

| Project | Status re-checked 2026-10-24 | Note |
|---|---|---|
| **MoneyPrinterTurbo** (harry0703) | MIT · **134.8k★** (was ~122k Sep) · alive | Now: CLI batch manifests (100 tasks), **one-click auto-publish to YouTube Shorts/TikTok/IG**, pip-installable `mpt`, AI-agent skills, ElevenLabs/Kokoro/Fish/Gemini TTS. The open default every commercial tool is silently compared against. |
| **HyperFrames** (heygen-com) | Apache-2.0 · **71.3k★** (was ~49k on 2026-09-11 → **+45% in ~6 weeks**) | "Write HTML. Render video. Built for agents." Fastest-growing engine on the map; Apache-2.0 removes all license math for a SaaS. |
| **Postiz** | AGPL-3.0 · 37.7k★ | Counted here because it's the OSS-**business** reference (see §3). |
| ShortGPT / MoneyPrinterV2 / editly / Motion Canvas | Carried from Sep research: dead / fading-AGPL / broken / dormant — not re-checked (§10 owns) | Do-not-build-on list stands. |
| Revideo (MIT, ~4k★) | carried | MIT fallback engine. |

**Note:** commercial players are beginning to *ship* OSS surface area themselves — AITuber publishes an MCP GitHub repo, ReelFarm ships "Skill.md," Channel Farm ships MCP & CLI. The moat is shifting from "we have an API" to "our product is agent-operable."

---

## 5. Category E — developer infrastructure (brief; another researcher owns)

- **Shotstack** re-verified 2026-10-24, unchanged vs Sep: PAYG $10/50min · Starter $39/250min (1080p) · Pro $99/750min (**4K from Pro**) · Scale $199/2,000min · Volume $499/10,000min; 4K NOT on Starter; minutes roll 3 months; white-label editor under PolyForm Shield.
- **Remotion** licensing (carried from Sep research, still the decisive fact for v2): free for individuals/≤3-person orgs with commercial use allowed — **but** "Remotion for Automators" ($0.01/render, $100/mo min) is the tier a multi-tenant SaaS rendering *customers'* videos grows into. HyperFrames' Apache-2.0 has no such threshold.
- Render APIs, AI model APIs, queues (Inngest/Trigger.dev), hosting (Vercel/Neon): carried from `video-maker-tools-landscape-2026-09.md` and `product-saas-blueprint-2026-10-04.md`; owned by the infra researcher.

---

## Gap analysis — opportunities for v2, each tied to evidence

| # | Opportunity | Evidence (all fetched 2026-10-24 unless noted) | Recommendation |
|---|---|---|---|
| **G1** | **BYOK-first is a genuinely empty seat** | Across ~35 products checked, exactly one BYOK-adjacent feature exists: ReelFarm Enterprise's "Add Anthropic API key for unlimited generations." No major, no autopilot tool, no scheduler offers customer-supplied model/voice keys. Our Studio already has a BYOK vault (OpenRouter + ElevenLabs). | Lead with BYOK: cost transparency + no margin-on-tokens is a pitch nobody can copy without re-architecting their credit metering. FACT→RECOMMENDATION |
| **G2** | **API/MCP is now table stakes — ship day one** | API or MCP shipped by: AITuber (all plans), Revid (all plans), Crayo (new), Vsub (new), Channel Farm (MCP & CLI), ReelFarm (Growth+), Blotato, Ayrshare, Postiz, vidIQ (all plans incl. free), Metricool (incl. free), Descript, Runway (dev platform), InVideo (MCP link). Six of these appeared only in the last ~2 quarters. | v2 without a public API + MCP server is non-competitive at launch; price tiers should include it, not gate it (Postiz/vidIQ/AITuber all include on entry tiers) |
| **G3** | **Channel-count pricing is the emerging norm; the portfolio seat is being claimed from below** | AITuber: 1/2/4/unlimited channels by tier ($39→$249). Metricool: brand counts. Postiz: 5/10/30/100 channels. Blotato: 20/40 accounts. Meanwhile AutoShorts & AutoReels still cap 1 series/plan — the #1 complaint in the niche. | Price v2 by channel count with an unlimited tier well below AITuber's $249; the 1-series-cap complaints are the switching trigger |
| **G4** | **Nobody ships gates, verification, or retention loops — still** | Zero products across A–C document upload quality gates, publication verification, or performance-fed topic selection in public docs/pages (all `unknown`/absent on every pricing and docs page checked). Oct-09 gaps G1/G2/G4/G5 all still open. | This remains the differentiator; sell it as "the autopilot that can't get your channel purged" ahead of the Feb 2027 YPP tightening |
| **G5** | **Free/OSS-first is a proven SaaS shape — in adjacent software** | Postiz: AGPL core, 37.7k★, cloud $29–99, no free cloud tier anymore; MoneyPrinterTurbo MIT 134.8k★; HyperFrames Apache-2.0 71.3k★. OSS-core + hosted-BYOK SaaS is exactly how Postiz monetizes. | v2 thesis validated by an existing business, not just theory — but also means "open-source scheduler" is taken; our OSS claim must be the **autopilot/OSS production core**, not the scheduler |
| **G6** | **YouTube publishing is commoditizing into the generation tools** | Fliki: native YT publishing with monthly quotas (50–120). TaleTok: YT-only auto-post incl. SEO fields. EasyTubers/AITuber/Revid/Channel Farm/AutoShorts/AutoReels: all publish. Canva, Synthesia, HeyGen, Runway, Pictory, Vyond still don't. | Publishing alone is not a moat; pair it with verification (G4). Watch Fliki's quota model as the likely way incumbents meter publishing |
| **G7** | **The cheap end of the shelf is financially stressed; volume tiers are where money is** | TaleTok +~40% prices in 6 weeks; AutoShorts free plan "temporarily paused"; InVideo cut annual prices ~50% (Basic $9→$4); Pictory relabeled Pro "was $59 → $35". Meanwhile Vsub/Channel Farm/AITuber opened $499–$999 volume tiers. | Avoid the $13–19 bloodbath; enter at portfolio pricing ($49–149) with volume tiers above; the money is at $99+ where compute is metered honestly |
| **G8** | **Avatar/lane discipline** | Synthesia/HeyGen/Vyond own avatar video with APIs unbundling (Synthesia API now at Pro; HeyGen ≈$4/min carried). None touch channels. | Skip avatar generation in v2; integrate as optional provider later if a niche demands it |

**Risks / named threats:** (1) **AITuber.app** — structurally our closest competitor (multi-channel autopilot + API/MCP + ElevenLabs); unproven but priced exactly where we planned to enter; (2) **Postiz-style OSS encroachment** — an AGPL autopilot equivalent would undercut a hosted-only v2; (3) **platform dependency** — every autopilot tool depends on YouTube API quota/audit tolerance; our CASA/audit path (Oct-04 research) is unchanged; (4) **credit-meter collapse** — InVideo/Pictory price war suggests generation margins are compressing; BYOK sidesteps this but caps our revenue per compute.

---

## Re-verification ledger

**Re-verified at source 2026-10-24:** InVideo, Pictory, Fliki (features; $ redacted), Steve.AI, Vyond, Synthesia, HeyGen, Runway, Descript, AutoShorts, faceless.video, ReelFarm, Crayo, Vsub (long-form tab), AutoReels, TaleTok, Channel Farm, AITuber, EasyTubers, vidIQ, Metricool, Postiz (+ license/stars), Blotato, Ayrshare, Mixpost (platform×tier), n8n YouTube node, Activepieces YouTube piece, Windmill integrations page, Shotstack, MoneyPrinterTurbo, HyperFrames.

**Could NOT re-verify today (flags):** Canva exact prices (canva.com 403 ×2; search-only, conflicting $12 vs $15 Pro) · Canva Content Planner platform list (help-center via search snippet) · TubeBuddy numeric prices (JS-hidden) · Lumen5 prices (JS-walled; Capterra/TrustRadius/own-site snippet — secondhand) · Crealix (403; still no pricing found) · Fliki Standard/Premium dollar amounts (redacted on page) · Vsub short-form tab tiers (tab didn't render) · HeyGen API per-minute price (carried from Sep research) · Zernio pricing/features (carried from Oct-04) · Buffer/Hootsuite/Agorapulse (Buffer's own comparison page = primary for Buffer only; others competitor-claimed) · Zebracat/Higgsfield (search snippets only) · n8n/Activepieces/Windmill cloud pricing (not re-checked) · Mixpost self-host license price (not re-checked) · Descript API tier eligibility (page lists API+MCP without tiers).

---

## Open questions

1. AITuber's actual traction and output quality — no independent reviews found; needs a hands-on trial before treating it as a real threat vs a landing page.
2. Whether Fliki's YouTube-publishing quotas are a gimmick or a signal that YouTube API access is being brokered by more incumbents (affects our CASA/audit calculus).
3. Vsub's short-form tier table (didn't render) — did the $19 entry tier survive?
4. Does TaleTok's Optimum tier actually run several channels concurrently, and does its YT-only auto-post include `containsSyntheticMedia`? (Not documented publicly.)
5. HyperFrames release cadence/version (Releases section didn't render) — §10 researcher to pin.

---

## Sources (all fetched 2026-10-24 unless noted)

**Category A — majors**
1. https://invideo.io/pricing/ — InVideo credit tiers, guest seats, Seedance/Nano Banana models, no-API
2. https://pictory.ai/pricing/ — Pictory tiers, trial-only free path, API sold separately
3. https://fliki.ai/pricing — Fliki free-tier restrictions, YouTube publishing quotas, API on Premium
4. https://lumen5.com/pricing/ — JS-walled; prices via search (Capterra/TrustRadius/site snippet) — secondhand
5. https://app.steve.ai/pricing — Steve.AI tiers, Enterprise-only API, no annual discount
6. https://vyond.com/pricing/ — Vyond tiers, video-length caps, no API/publishing
7. https://www.synthesia.io/pricing — Synthesia tiers, free-plan limits, API now at Pro
8. https://www.heygen.com/pricing — HeyGen tiers, credit scaling to $4,300/mo, no publishing
9. https://www.canva.com/pricing/ + https://www.canva.com/help/content-planner — 403; plan prices + Content Planner platform list via search (YouTube NOT supported)
10. https://runway.com/pricing — Runway tiers, Gen-4.5 12 cr/s, hosted third-party models
11. https://www.descript.com/pricing — Descript tiers, API+MCP listed, no publishing

**Category A — autopilot shelf**
12. https://autoshorts.ai/ — AutoShorts tiers, 1-series cap on all plans, free paused
13. https://faceless.video/pricing — faceless.video 4 tiers, credit top-ups, rollover
14. https://reel.farm/pricing — ReelFarm tiers, TikTok-only publishing, Anthropic BYOK at Enterprise
15. https://crayo.ai/pricing — Crayo tiers, no-refund policy, Developer API
16. https://vsub.io/pricing — Vsub long-form tiers, API+MCP
17. https://autoreels.ai/pricing — AutoReels tiers, 1 series/plan, TikTok+YT+IG
18. https://taletok.io/ — TaleTok new prices, YouTube-only auto-post, credit costs
19. https://channel.farm/pricing — Channel Farm 4-tier ladder, MCP & CLI, publishing included
20. https://www.crealix.ai/ — 403; prior Oct-09 findings carried

**Category A — new entrants**
21. https://aituber.app/ — AITuber 7 tiers, channel counts, API+MCP all plans, ElevenLabs
22. https://easytubers.com/ — EasyTubers $15/hour pricing, YouTube auto-upload
23. https://www.zebracat.ai/pricing + https://higgsfield.ai/pricing — search snippets only, UNVERIFIED

**Category B**
24. https://vidiq.com/pricing/ — vidIQ tiers, MCP on all plans, no publishing
25. https://www.tubebuddy.com/pricing — TubeBuddy structure, 1-channel-per-license
26. https://metricool.com/pricing/ — Metricool brand tiers, YouTube connections/analytics
27. https://buffer.com/resources/buffer-vs-hootsuite — Buffer $5/channel; Hootsuite/Agorapulse competitor-claimed

**Category C**
28. https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.youtube/ — n8n YouTube node ops (upload ✓; no schedule/thumbnail)
29. https://docs.postiz.com/self-host/providers/youtube — Postiz YouTube provider setup requirements
30. https://postiz.com/pricing — Postiz cloud tiers $29–99, trial-only, self-host
31. https://github.com/gitroomhq/postiz-app — AGPL-3.0, 37.7k★
32. https://www.activepieces.com/pieces/youtube — Activepieces read-only YouTube actions list
33. https://www.windmill.dev/integrations — no YouTube integration found
34. https://mixpost.app/pricing — Mixpost YouTube on Pro/Enterprise only
35. https://www.blotato.com/pricing — Blotato tiers, API+MCP all paid, 9 platforms
36. https://www.ayrshare.com/pricing/ — Ayrshare tiers, per-profile pricing, YouTube listed

**Categories D/E**
37. https://github.com/harry0703/MoneyPrinterTurbo — MIT, 134.8k★, batch CLI, auto-publish
38. https://github.com/heygen-com/hyperframes — Apache-2.0, 71.3k★
39. https://shotstack.io/pricing/ — Shotstack tiers re-verified
40. Remotion license tiers — carried from `research/video-maker-tools-landscape-2026-09.md` (fetched 2026-09-11)
41. Zernio — carried from `research/product-saas-channel-connect-2026-10-04.md` (fetched 2026-10-04)

**Prior research built on:** `research/faceless-youtube-saas-landscape-and-studio-roadmap-2026-10-09.md` · `research/video-maker-tools-landscape-2026-09.md` · `research/product-saas-channel-connect-2026-10-04.md` · `research/product-saas-blueprint-2026-10-04.md` · `research/video-creation-and-competitive-audit-2026.md` · `research/shorts-creation-and-competitor-audit-2026.md`
