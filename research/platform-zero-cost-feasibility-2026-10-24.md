# Zero-cost feasibility — platform research 2026-10-24

**Scope:** can the v2 multi-tenant SaaS (many users, many channels) stay free/OSS-first? Four deployment approaches, a free-hosting constraint catalog, a per-stage workload cost model, unavoidable/hidden costs, a zero-cost architecture recommendation, and the BYOK-rendering parallel (tenants render on their own hardware). Builds on `tech-stack-research-2026-10-17.md`, `product-saas-blueprint-2026-10-04.md`, `scalable-channel-factory-2026-10-05.md`, `youtube-upload-quota-research-2026-09.md`, `byok-api-keys-2026-10-09.md`, `premium-upgrade-research-2026-09-20.md`, `roadmap-2026-09-14.md`.

**Method:** every free-tier number below was re-verified against the official pricing/limits page on **2026-10-24** unless explicitly marked otherwise. Prior-research facts carry their original fetch date. Cost-model numbers are labeled **[estimate]** with the math shown. FACT vs RECOMMENDATION is labeled throughout. The one assignment assumption that verification overturned (Oracle "4 OCPU/24 GB") is called out in §1c.

**Honest constraint up front:** "free" here means dev-time free and small-pilot free. There is **no configuration of free tiers that serves a paying multi-tenant SaaS indefinitely**: Vercel Hobby forbids commercial use outright, YouTube caps uploads at 100/day per project, and GHA minutes are only free while the repo is public. Every claim below is bounded by those three walls.

---

## 0. TL;DR — verdict table

| # | Question | Verdict | One line |
|---|---|---|---|
| 1 | Is the current 16-channel stack still $0? | **YES (verified 2026-10-24)** | Public repo ⇒ GHA minutes free (4 vCPU/16 GB runners); Vercel Hobby, Neon free, BYOK inference — all current and sufficient for owner-only use. |
| 2 | What breaks FIRST on the road to SaaS? | **Vercel Hobby ToS** (not usage) | "Hobby teams are restricted to non-commercial personal use only" — the first paid tenant or payment button makes Hobby non-compliant. Pro is $20/mo. |
| 3 | What is the first capacity wall? | **YouTube: 100 uploads/day per project** | All tenant uploads via our OAuth app share ONE bucket; ~25 tenants at 1 short/day hit it exactly. Free quota is the real bottleneck, not hosting dollars. |
| 4 | When does GHA stop being free? | **At the repo-privacy decision** | Private repo = 2,000 free min/mo ≈ 7–13 renders/day; also runners shrink 4 vCPU→2 vCPU. Public repo = unlimited free minutes. |
| 5 | Cheapest render-escalation path | **Cloud Run Jobs (~$0.01/render [estimate])** | Per-vCPU-second billing beats GHA private wall-minute billing ~3× at equal specs; scale-to-zero; 168-h max task timeout. |
| 6 | Oracle "4 OCPU/24 GB free"? | **NO — corrected** | Always Free = **2 OCPU / 12 GB** ARM (24/7), plus idle reclamation (<20% CPU/net/mem over 7 days). The 4/24 shape is only partial-hours on upgraded paid accounts. |
| 7 | v1 zero-cost shape | **KEEP current stack + add triggers** | GHA render farm + Vercel + Neon + BYOK stays $0 while: owner-only, no payments, repo public, ≤100 uploads/day. Escalation ladder in §5. |
| 8 | Can tenants render on their own hardware? | **YES — viable niche tier** | GHA self-hosted runners, Trigger.dev self-hosting, and n8n prove the "BYO compute" pattern; outbound-polling worker needs no NAT/tunnel. Platform absorbs orchestration only ≈ $0. |

---

## 1. Four deployment approaches

### 1a. Local dev / local execution (Windows dev box)

**FACT:** the repo already ran this way — the Sep-14 roadmap audit found a local "Quarry Pipeline — Morning Run" fighting CI cron with double-production (`roadmap-2026-09-14.md` §1.1), which is why CI was made the production master.

| Aspect | Reality |
|---|---|
| Cost | $0 (hardware + electricity already sunk) |
| Render capacity | One 60 s 1080×1920 short ≈ 1–3 min wall on a modern 8-core desktop **[estimate — pure x264 encode is 40–80 core-s, §3]**; concurrency 1–2 jobs before the machine is unusable |
| TTS | Kokoro-82M ONNX runs CPU-local ("~300 MB, quantized ~80 MB"; "Fast performance near real-time on macOS M1" is the only published speed claim — kokoro-onnx README, fetched 2026-10-24); edge-tts works from residential IPs (better than cloud IPs, per blueprint) |
| What breaks | No uptime (laptop sleep kills the daily slot — the Sep double-production bug was exactly this), no webhooks inbound (NAT), no isolation of secrets, and it cannot serve tenants at all |
| Verdict | **RECOMMENDATION:** dev-only. It is the right place for pipeline debugging, never for production or multi-tenant anything. |

### 1b. Self-hosted on the user's own machine ("run your own node")

**FACT (precedents):** GitHub officially supports free self-hosted runners — "GitHub Actions usage is free for self-hosted runners" (docs.github.com billing, fetched 2026-10-24); runners are stateful ("Don't need to have a clean instance for every job execution", cited in tech-stack-research 2026-10-17). Trigger.dev supports self-hosting as "a set of containers running on your own infrastructure" split webapp/worker, with auto-scaling/warm-starts cloud-only and "You assume all responsibility and risk for your deployment" (trigger.dev/docs/open-source-self-hosting, fetched 2026-10-24). n8n's Sustainable Use License permits free self-hosting for internal business use but prohibits offering hosted n8n to third parties without an Enterprise license (community.n8n.io + secondary corroboration, fetched 2026-10-24 — **[secondary sources; license text not directly fetched today]**).

**How it would work here (RECOMMENDATION sketch):** outbound-only worker — tenant machine runs a pinned Docker image (ffmpeg + fonts + node) that **polls** our queue API (Neon-backed) for jobs, renders locally, uploads with the tenant's own YouTube tokens, reports status. Polling means **no NAT/firewall/tunnel work at all** — this is exactly the GHA-runner architecture (outbound long-poll), which is why it works behind home routers.

**Realistic user count:** single digits to low tens. It demands Docker literacy, leaves the machine on at slot times, and every user's ffmpeg/font/driver drift is our support ticket. **FACT:** n8n's SUL also means we cannot bundle n8n itself into a paid hosted tier without their enterprise license — our own pipeline code (self-owned) has no such constraint.

| Aspect | Reality |
|---|---|
| Platform cost | $0 (orchestration only: Neon + Vercel ≈ free tier) |
| What breaks | Tenant-side reliability (sleep, updates, IP changes), no SLA, abuse surface (fake "rendered" reports), code IP (moot while OSS-first) |
| Verdict | Viable as a **"BYO compute" power-user tier** (§6), not the default consumer path. |

### 1c. Self-hosted on an existing server (VPS / Oracle free ARM)

**Oracle Cloud Always Free — verified 2026-10-24 (docs.oracle.com Always_Free_Resources):**
- **CORRECTION of the assignment's assumption:** the free ARM shape is **2 OCPUs / 12 GB**, not 4/24. Verbatim: "All tenancies get the first 1,500 OCPU hours and 9,000 GB hours per month for free… For Always Free tenancies, this is equivalent to **2 OCPUs and 12 GB of memory**." A 4 OCPU/24 GB instance only stays inside the same 1,500-hour allotment if it runs ≤ ~375 h/month (partial hours) on an upgraded account — it is not a 24/7 free shape.
- Also included: 2× AMD E2.1.Micro VMs ("1/8th of an OCPU… 1 GB", 50 Mbps), **200 GB** block volume total, 20 GB object storage, "**10 TB per month** of outbound data."
- **Idle reclamation (FACT):** instances are reclaimable "if, during a 7-day period: CPU utilization for the 95th percentile is less than 20%; Network utilization is less than 20%; Memory utilization is less than 20%" — an idle render node will be reclaimed; keep-alive load or state on the box is required.
- **Availability caveat (FACT):** "out of host capacity" errors are a documented, ongoing problem for free A1 shapes; home-region only.
- **Verdict:** the best genuinely-free always-on VM, but 2 ARM cores ≈ 20–60 renders/day sustained **[estimate]** and reclamation risk makes it an **escalation target, not v1** — exactly as the assignment frames it.

**Paid VPS price points — fetched 2026-10-24:**

| Provider / plan | vCPU | RAM | Disk | Price | Note |
|---|---|---|---|---|---|
| Contabo Cloud VPS 4 | 4 | 8 GB | 100 GB SSD | **€4.40/mo** | price "for the first 24 months" (renews higher); unlimited traffic, fair-use |
| Contabo Cloud VPS 6 | 6 | 12 GB | 200 GB SSD / 100 NVMe | €6.00/mo | same renewal caveat |
| Hetzner CPX02 (EU) | 1 | 1 GB | 20 GB | €6.49/mo excl. VAT | current entry SKU |
| Hetzner CPX22 (EU) | 2 | 4 GB | 80 GB | €19.99/mo excl. VAT | |
| Oracle A1 Always Free | 2 ARM | 12 GB | ≤200 GB | **$0** | idle-reclaim + capacity caveats |

**FACT:** Hetzner's lineup has restructured — the widely-quoted legacy CX22 (~€3.79) SKUs are not on today's cloud page; the shared-vCPU line now starts at €6.49 (Cost-Optimized line is listed "Currently not available"). Prices fetched 2026-10-24 from hetzner.com.

**Verdict:** a 4 vCPU/8 GB Contabo box could run ~700–900 renders/day **[estimate — 24/7 × 4 cores ÷ ~1.5 core-min/render]** for €4.40 — the cheapest $-per-render of any option — but it is a single point of failure we operate. **ESCALATION, not v1**, matching the assignment's framing.

### 1d. Free-tier cloud (all numbers fetched from official pages 2026-10-24)

| Platform | Still free in 2026? | What works free | What breaks |
|---|---|---|---|
| **GitHub Actions (public repo)** | **YES** — "GitHub Actions usage is free for self-hosted runners and for public repositories that use standard GitHub-hosted runners" | 4 vCPU / 16 GB Linux runners, unlimited minutes, 10 GB cache/repo; 20 cron workflows today | Repo must stay **public** (SaaS code + client config can't), scheduled-workflow 60-day auto-disable, high-load cron drops (docs quotes in §4) |
| **GitHub Actions (private repo)** | Partially | 2,000 min/mo (Free plan), runners shrink to **2 vCPU / 8 GB** | ≈ 7–13 renders/day before paid minutes ($0.006/min Linux 2-core) |
| **Vercel Hobby** | **YES but non-commercial only** | 100 GB transfer, 1M function invocations, 4 hrs Active CPU, 300 s / 2 GB functions, 100 cron jobs **once per day ±59 min**, 100 deployments/day | **"restricted to non-commercial personal use only. All commercial usage… requires either a Pro or Enterprise plan"** — any payment/tenant makes Hobby non-compliant; no sub-daily cron; no Git-org repos |
| **Neon free** | **YES** | 100 projects, 1 GB/project (20 GB account), 100 CU-hrs/project, 2 CU max | **Autosuspend after 5 min, "cannot be turned off"**; out of CU-hrs/egress ⇒ suspended till next period; storage cap ⇒ writes blocked |
| **Cloudflare R2** | **YES** | 10 GB-month, **egress free** ("no charges for egress bandwidth for any storage class"), 1M Class A + 10M Class B ops/mo | 10 GB ≈ 110–160 archived 60 s masters **[estimate — 60–90 MB at 8–12 Mbps]**; overage $0.015/GB-mo |
| **Cloudflare Workers free** | YES | 100k req/day, 5 cron triggers, 15-min cron duration | **10 ms CPU per request** — orchestration/glue only, zero media work |
| **Render free** | Partially | Free web services exist but "spin down… after 15 minutes" no traffic (~1 min cold start) | Free Postgres **expires after 30 days**; 2026: free bandwidth cut to 5 GB **[secondary — Code Capsules comparison, June 2026]**; spin-down kills any scheduler use |
| **Railway** | **YES — changed** | Now has a real Free plan: $0/mo with **$1 usage credits** (1 vCPU/0.5 GB, 1 replica); Trial = $5 one-time/30 days | $1/mo ≈ 2-3 render-days total; Hobby $5/mo incl. $5 credits is the real floor |
| **Fly.io** | **NO** | — | "No free tier for new users"; smallest VM $2.19/mo; legacy free allowances gone from the pricing page (fetched 2026-10-24) |
| **Supabase free** | YES | 2 projects, 500 MB DB, 1 GB storage, 5 GB egress, 500k edge functions, 50k MAU | **"Free projects are paused after 1 week of inactivity"** — unusable for a headless pipeline that only touches the DB via cron |
| **Google Cloud Run** | **YES (services) / metered (jobs)** | Services free tier: 2M requests + 180k vCPU-s + 360k GiB-s/mo. **Jobs**: $0.000024/vCPU-s + $0.0000025/GiB-s (Tier 1) ⇒ **≈ $0.01 per short render [estimate, §3]**; task timeout default 10 min, **max 168 h (7 d)** | Pricing page is JS-rendered — rates corroborated via Google's own indexed page text + 3 secondary sources (**flag: re-verify line-level before invoicing**); whether the vCPU/memory free tier formally applies to Jobs is corroborated but not line-verified (**UNVERIFIED**) |
| **Colab free** | **Degraded & ToS-risky** | Sessions "at most 12 hours"; repo already uses it for music jobs | "Colab does not publish these limits"; prohibits "file hosting, media serving, or other web service offerings"; **"Users in our free of charge tier commonly experience runtime terminations when attempting to bypass the notebook UI… for content generation"**; GPUs "heavily restricted"; no distributed setups. Batch music/TTS automation sits in the gray zone the FAQ names — treat as best-effort, never client-facing |

---

## 2. Free-hosting constraint catalog

Only current verified numbers (all official pages fetched **2026-10-24**; sources §Sources row numbers).

| Platform | CPU | RAM | Disk | Exec-time cap | Background/cron jobs | Persistent storage | Sleep/suspend | Bandwidth | DB quota | Concurrent workloads |
|---|---|---|---|---|---|---|---|---|---|---|
| GHA runner, **public** repo | 4 vCPU | 16 GB | 14 GB SSD | 6 h/job default (multiplier-removable) **[prior-verified 2026-10-17]** | cron ≥5-min interval; delays/drops at peak; **60-day-inactivity auto-disable** | 10 GB cache, 500 MB artifacts (Free plan) | none (ephemeral VM per job) | unmetered | n/a | matrix jobs; undocumented shared-limits on public repos **[UNVERIFIED]** |
| GHA runner, **private** repo | 2 vCPU | 8 GB | 14 GB SSD | same | same | same | none | unmetered | n/a | 2,000 min/mo ≈ 7–13 render-jobs/day |
| Vercel Hobby | 1 vCPU | 2 GB | serverless (no disk) | **300 s** default and max | 100 cron jobs, **1×/day ±59 min** | none (Blob/R2 separate) | scale-to-zero | 100 GB fast transfer, 10 GB origin | none | 1M invocations/mo; 4 hrs Active CPU |
| Neon free | 2 CU max shared | 8 GB @2CU | 1 GB/project (20 GB acct) | n/a | — | — | **autosuspend 5 min, non-disableable** | 5 GB egress/project | — | 100 CU-hrs/project/mo |
| Cloudflare R2 | n/a (storage) | — | **10 GB-month** | — | — | yes (object) | none | **egress free**; 1M/10M ops | — | — |
| Cloudflare Workers free | **10 ms CPU/req** | 128 MB | — | no wall limit (HTTP); 15 min (cron) | 5 cron triggers/account | — | none (per-request) | unmetered | — | 100k req/day |
| Render free | shared | 512 MB **[prior-published; re-verify]** | — | — | no (web service spins down) | ephemeral | **15-min idle spin-down** | 5 GB **[secondary]** | free PG **expires 30 d** | — |
| Railway Free | 1 vCPU/service | 0.5 GB/service | volumes paid | — | yes (long-running allowed, billed) | volumes ~$0.15/GB-mo | none | $0.05/GB | — | **$1/mo credit ≈ 0.1 vCPU-month** |
| Fly.io | — | — | — | — | — | — | — | — | — | **no free tier** (new users) |
| Supabase free | shared, 500 MB RAM | 500 MB | **500 MB DB / 1 GB files** | — | edge functions 500k/mo | yes | **paused after 1 wk inactivity** | 5 GB egress | — | 2 projects |
| Cloud Run **Jobs** | up to 8 vCPU/task (Gen1) | up to 32 GiB | ephemeral + mounted | **default 10 min, max 168 h** (1 h GPU) | event-driven (not cron-native) | ephemeral | scale-to-zero | normal GCP egress rates | — | billed per vCPU-s/GiB-s (≈$0.01/short [estimate]) |
| Oracle A1 Always Free | **2 ARM OCPU** | **12 GB** | ≤200 GB block | unlimited (your VM) | full VM (cron/any) | yes (block) | none — **but idle-reclaim after 7 idle days** | **10 TB/mo egress** | — | 1–2 instances |
| Colab free | variable, never guaranteed | ~12 GB **[unpublished]** | ephemeral | **≤12 h/session** | **interactive-use expected; automation gets terminated** | none | idle timeouts (unpublished) | unpublished | — | 1 session-ish (limits unpublished) |

---

## 3. Workload cost model

### 3.1 Per-stage resources per 60 s 1080×1920 short (math shown)

| Stage | Resource consumed | Derivation | Platform $ (BYOK) |
|---|---|---|---|
| Script gen | ~8 LLM calls/day/channel, ~20K tokens/day/channel | byok-api-keys-2026-10-09 §2 (padded planning figure) | **$0** — user's OpenRouter/Gemini/Groq key |
| TTS (voice) | 60–90 s audio ≈ **30–90 core-s** | Kokoro ONNX ~300 MB model; only published speed claim "near real-time on M1" ⇒ assume 0.7–2× realtime on x86 cores **[estimate]**; edge-tts = $0 unofficial cloud API; OpenAI TTS ≈ $0.02–0.05/short (blueprint §2) | $0 (Kokoro/edge) or BYOK |
| Music | file pick from vendored 1,442-track catalog | zero compute | $0 |
| Stock footage | 1–3 Pixabay/Pexels API calls | Pixabay 100 req/60 s; Pexels 200/h, 20k/mo (byok §1, primary-verified 2026-10-09) | $0 — user keys |
| **Video render** | **40–80 core-s** pure encode+filters ≈ **2–4 min wall on 4 vCPU** | 1,800 frames @30 fps; x264 veryfast ≈ 1.5–3× realtime/core ⇒ 20–40 core-s encode, ×1.5–2 for scale/overlay/captions ⇒ 40–80 core-s **[estimate]**; anchor: repo-observed full pipeline job "~2–4 min Actions" per short (scalable-channel-factory §6, 2026-10-05) | GHA public: **$0** · GHA private: ~$0.03/render (5 min × $0.006) · **Cloud Run ≈ $0.01** (2 vCPU×180 s×$0.000024 = $0.00864 + 4 GiB×180 s×$0.0000025 = $0.0018) **[estimates]** |
| Thumbnail | Pillow/sharp ≈ **<5 core-s** | single still + text + shadow (youtube-engine thumb path) **[estimate]** | $0 |
| Upload | **1 of the 100/day upload bucket** + ~50–100 units of the 10,000-unit pool | determine_quota_cost fetched 2026-10-24: 100 `videos.insert`/day, 1 quota each; writes ≈50 units each (upload-quota-research 2026-09) | $0 but **scarce** |
| Weekly 8–12 min doc | ≈ 10–30 min wall ≈ 30–90 core-min **[estimate — scale of short ×10]** | per-channel docDay cadence (#96/#97 artifacts) | same multipliers |

**Concurrency reality on free GHA (FACT-anchored estimate):** 16 channels × 1 short/day staggered off-hour ⇒ ~16 jobs ≈ 56 wall-min/day ≈ **1,700 min/mo — $0 on the public repo today.** The same minutes on a private repo would cost $10.20/mo and run at half speed (2 vCPU runners).

### 3.2 Scale table — which tier breaks first (4 channels + 1 weekly doc per tenant, 1 short/day/channel)

| Tenants | Channels | Renders/day | GHA min/day | GHA public $ | GHA private $/mo | Cloud Run Jobs $/mo | Oracle 2-OCPU free | YouTube uploads/day | First wall hit |
|---|---|---|---|---|---|---|---|---|---|
| 1 (owner) | 16 | 16 | ~56 | **$0** | — | — | overkill | 16 ✓ | none (60-day-rule watch) |
| 5 | 20 | 20 | ~70 | $0 (if still public) | 2,100 min ⇒ just over 2,000 free | ~$2 | fits | 20 ✓ | **repo privacy decision + Vercel Hobby ToS if paid** |
| 25 | 100 | 100 | ~350 | code can't stay public | ~$51 (8,500 paid min × $0.006) | **~$10** | CPU fits (~150–400 core-min/day vs 2,880 available) **[estimate]** | **100 = exactly at ceiling** | **YouTube upload quota** |
| 100 | 400 | 400 | ~1,400 | — | ~$240 | ~$40 | overflows as sole node | **400 ≫ 100 ✗** | YouTube quota + support + email |

**Reading the table (RECOMMENDATION):** money is never the first wall — **YouTube quota is** (25 tenants ≈ 100 uploads/day exactly), **ToS is** (Vercel Hobby dies at the first payment), and the **repo-privacy decision** quietly doubles render cost and halves runner speed. Cloud Run Jobs at ~$0.01/render is 3–5× cheaper than GHA private wall-minutes at equal specs because it bills provisioned vCPU-seconds, not job wall-minutes at a 4-vCPU tax.

---

## 4. Unavoidable + hidden costs

| Cost | Reality (source) | Free workaround / trigger to pay |
|---|---|---|
| Domain | ~$10–15/yr (blueprint §4) | none — needed for Google verification (Rung 1 requires homepage + privacy policy) |
| Email sending | Resend free = **3,000 emails/mo but 100/day** (resend.com, fetched 2026-10-24); Pro $20/mo | weekly reports batch fine ≤100/day; daily digests to >100 tenants break ⇒ $20/mo |
| Secrets manager | GitHub Actions secrets + Vercel env vars = $0, 64 KB env cap (Vercel docs, fetched 2026-10-24) | env-var workaround fine at v1; the real cost is **rotation toil** — production-audit-2026-10-23 found a dead channel token (invalid_grant) + dead FB token in one audit |
| Monitoring | ntfy.sh free 250 msgs/day (byok §1); CI Doctor pattern already proven in production (production-audit §F6) | $0 to ~50 tenants; UptimeRobot-class free monitors for Vercel endpoints **[secondary]** |
| Backups / storage overage | R2 $0.015/GB-mo past 10 GB; Neon $0.35/GB-mo; GHA artifacts 500 MB free | today's archive = GitHub Releases — "no published SLA" (tech-stack §8); move masters to R2 when tenants arrive |
| **YouTube API quota** | **Free but scarce: 100 uploads/day per project** (determine_quota_cost, fetched 2026-10-24). Per-tenant relief requires each tenant's own audited project, or our project passing the audit/quota form (weeks–months, discretionary — upload-quota-research §Option A) | the REAL bottleneck; unverified post-2020 projects get videos locked PRIVATE until audit (upload-quota §Option B) |
| **OAuth verification** | Rung 1 (sensitive scopes) $0 but ~2–6 weeks real-world; Rung 2 (`youtube.upload`) = **CASA Tier 2 ≈ $540/yr** (TAC Security, Google-negotiated rate) — blueprint §1 Wall 1; testing mode = 100 users + 7-day refresh tokens | unavoidable real money at multi-tenant upload |
| GHA private-minutes cliff | 2,000 min/mo ≈ **7–13 renders/day**; runners also drop to 2 vCPU (billing + runner pages, fetched 2026-10-24) | stay public, or move renders to Cloud Run (~$0.01/render) |
| GHA scheduled-workflow fragility | verbatim (fetched 2026-10-24): "In a public repository, scheduled workflows are automatically disabled when no repository activity has occurred in 60 days"; "some queued jobs may be dropped" under load | keepalive activity + off-hour crons (already the repo's pattern); NOT solvable by paying |
| **Vercel Hobby commercial restriction** | verbatim: "Hobby teams are restricted to non-commercial personal use only. All commercial usage of the platform requires either a Pro or Enterprise plan" — commercial = "financial gain of **anyone** involved in **any part of the production**" (fair-use guidelines, fetched 2026-10-24) | $20/mo Pro (1 seat + $20 usage credit) at first payment — cheap, mandatory |
| Neon autosuspend for user-facing SaaS | 5-min suspend, non-disableable (fetched 2026-10-24); first query after idle pays a cold connect (tech-stack cites Prisma's P1001 guidance) | pooled URL + connect_timeout; acceptable for dashboard traffic; pay Launch ($0.106/CU-hr) when tenants complain |
| Legal entity / payment rails | Paddle/Lemon Squeezy MoR ~5% + $0.50/sale works from Pakistan; **Payoneer KYC still the human blocker** (blueprint §4/§6) | one-time effort; nothing can pay the owner until it's done |
| Support toil | blueprint risk table: "Cap pilots at 5" for a solo operator | weekly reports + in-app docs; production-audit shows watchdogs already pay off |

---

## 5. Zero-cost architecture recommendation

### Options compared

| Option | Platform $ at v1 | Platform $ at 25 tenants | Who bears compute | Main risk |
|---|---|---|---|---|
| **BYOK-hosted providers** (current) | **$0** | $0 inference | tenant (their keys) | key-validation churn (Gemini auth-key changes, byok §1) |
| Local open-weight models (platform pays) | $0 (GHA public) | $10–50/mo compute | **platform** — violates "compute stays off our books" | GHA minutes cliff; quality ceiling |
| Self-hosted rendering (platform VPS) | $0 (Oracle) / €4.40 | €4.40–20/mo + ops burden | platform | single-node ops; idle-reclaim (Oracle); renewal pricing (Contabo) |
| BYO storage (tenant R2/S3 keys) | $0 | $0 | tenant | UX friction; creds handling |
| Free-tier services only | $0 | **impossible** — Vercel ToS + YT quota + GHA privacy cliff | mixed | ToS violations disguised as "free" |
| **Hybrid (RECOMMENDED)** | **$0** | ~$20–30 (Vercel Pro) + renders per §3 | tenant (inference + optionally render) | none structural; triggers below |

### v1 shape (RECOMMENDATION — "keep, with named triggers")

**Keep:** GHA public-repo render farm (cron, matrix) · Vercel Hobby Studio (while owner-only, no payments) · Neon free · BYOK for all inference · Kokoro/edge-tts · ntfy monitoring · R2 (10 GB) for artifacts when tenants arrive; BYO-storage optional later.

**This stays honestly $0 only while ALL of:** repo public (or render lane split out), no payment rails on Hobby, ≤100 uploads/day through our project, ≤~100 renders/day, repo activity within 60 days. Write these as budget alerts, not hopes.

### Escalation ladder with triggers

| Step | Move | Cost | Trigger |
|---|---|---|---|
| 0 | Repo-activity keepalive for GHA 60-day auto-disable | $0 | now (tech-stack action list already says this) |
| 1 | Vercel Hobby → **Pro** | $20/mo | **first payment button, first paying tenant, >100 GB transfer, or sub-daily Studio cron needed** (ToS cliff, not a usage cliff) |
| 2 | Split render lane: private repo allowed | $0 → watch | Studio/multi-tenant code must leave the public repo; render workflows stay public OR move per step 3 (client-owned channels cannot run in our repo — tech-stack §5 trigger) |
| 3 | GHA renders → **Cloud Run Jobs** | ~$0.01/render | private repo, **>60 render-min/day sustained** (2,000-min cliff ≈ 7–13 jobs/day), client-owned channels, or >6 concurrent renders needed |
| 4 | **Oracle A1 / Contabo VPS** render node | $0 / €4.40 | steady **>50 renders/day** with predictable queue shape (VPS beats per-second pricing at sustained utilization); keep Cloud Run for burst/overflow |
| 5 | **BYO-compute tier** (§6) for heavy tenants | $0 platform | any tenant >20 renders/day willing to run the worker container |
| 6 | YouTube quota ladder | $0 + CASA $540/yr | approach **100 uploads/day** ⇒ audit/quota form ~1 month ahead (upload-quota §Recommended plan); Rung 2 CASA is already required for `youtube.upload` on tenant channels — budget it as the cost of the SaaS, not an infra line |

---

## 6. BYOK rendering parallel (bonus) — can tenants render?

**FACT — precedents that prove the pattern:**
1. **Self-hosted GHA runners** — officially free, outbound-connected, stateful; used by every major OSS project for expensive builds (docs.github.com, fetched 2026-10-24; tech-stack §5). Security note from same docs: runners are stateful and self-managed — that's why the *repo owner* must trust the machine.
2. **Trigger.dev self-hosting** — "a set of containers running on your own infrastructure," webapp + worker split, worker executes tasks (fetched 2026-10-24). Exactly the "your machine does the heavy thing, our queue orchestrates" shape.
3. **n8n** — free self-host for internal use; SUL prohibits re-hosting it for others without an Enterprise license (community-corroborated 2026-10-24). Lesson: if we bundle someone else's runtime, their license gates our SaaS — our own pipeline code doesn't have this problem.
4. **Postiz self-hosted** (already in the repo's docker-compose) — uploads via *your own* Google OAuth app ⇒ same quota; proof that BYO-identity already lives in this stack (upload-quota §Option D).

**RECOMMENDATION — design:** `worker.mjs` container (pinned ffmpeg + fonts + node version), outbound **poll** of the Studio queue API (no webhooks, no NAT/tunnel), renders with tenant-local assets, uploads with tenant tokens (their 100/day bucket!), reports artifacts to R2/tenant storage. Platform cost: Neon + Vercel ≈ $0.

**Honest verdict:** viable and precedented as a **"BYO compute" tier for heavy/technical tenants** — the platform absorbs orchestration only, so a free-tier SaaS with absorbed-orchestration-only economics is genuinely possible. It is **not** the default consumer path (tenants who won't paste an API key won't run Docker), and it adds a support matrix (OS/ffmpeg drift), a no-SLA reality, and an abuse surface (fake completion reports — mitigate with artifact verification, which the repo already does for uploads).

---

## Risks / gaps

- **Cloud Run Jobs dollar figures** are corroborated (Google's own page text via search index + 3 secondary sources) but the live page is JS-rendered and I could not line-quote it today — re-verify at cloud.google.com/run/pricing before any invoice math. Same for whether the vCPU/memory free tier formally applies to **Jobs** (UNVERIFIED).
- **Render free-tier bandwidth (5 GB) and RAM spec** come from a secondary comparison, not Render's page (render.com fetch failed repeatedly today — ECONNRESET).
- **n8n SUL clauses** were corroborated via community/secondary pages; the license text itself was not fetched (docs URL moved).
- **GHA public-repo shared concurrency limits** for public repos are not published — matrix fan-out beyond ~20 jobs is empirically fine here but undocumented.
- Hetzner's new lineup prices are much higher than legacy CX pricing folklore; if a quote depends on it, fetch the current configurator at order time.
- Colab free-tier quotas are explicitly unpublished by Google; any music-job SLA is fictional by construction.

## Open questions

1. Do tenant uploads go through **our** audited project (shared 100/day) or through a per-tenant "connect-link" provider (Zernio bridge pattern, blueprint Wall 1) until our own CASA clears? This decision, not infra, sets the real 25-tenant ceiling.
2. Should the render workflows be split into a public `engine` repo + private `studio` repo now (keeps $0 minutes through step 2) or fold into the Cloud Run move (step 3)?
3. Does the music lane migrate off Colab to Kokoro-local entirely (removes the only ToS-gray dependency)?

## Sources (all fetched 2026-10-24 unless dated)

1. https://docs.github.com/en/billing/concepts/product-billing/github-actions — GHA free-for-public/self-hosted quote; 2,000/3,000/50,000 min private tiers; $0.006 Linux 2-core, $0.002 slim, $0.010 Windows, $0.062 macOS; 500 MB artifacts / 10 GB cache.
2. https://docs.github.com/en/actions/reference/runners/github-hosted-runners — public 4 vCPU/16 GB vs private 2 vCPU/8 GB; ubuntu-slim 1 vCPU/5 GB.
3. https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows — 5-min min interval; high-load delay/drop quotes; 60-day public-repo auto-disable quote.
4. https://vercel.com/docs/limits — Hobby function 300 s/2 GB/1 vCPU; cron 100/project; 100 deploys/day; 1 concurrent build; logs 1 h; no Git-org repos.
5. https://vercel.com/docs/limits/fair-use-guidelines — **non-commercial-only quote**; 100 GB transfer / 1M invocations / 4 hrs Active CPU / 360 GB-hrs / 10 GB origin.
6. https://vercel.com/docs/cron-jobs/usage-and-pricing — Hobby cron "once per day", ±59 min precision, failing expressions quote.
7. https://vercel.com/pricing — Pro $20/mo (1 seat + $20 credit); Hobby $0.
8. https://neon.com/pricing — Free: 100 projects, 1 GB/project, 20 GB acct, 100 CU-hrs, autosuspend 5 min non-disableable, 2 CU, 5 GB egress; Launch $0.106/CU-hr.
9. https://developers.cloudflare.com/r2/pricing/ — 10 GB-month, free-egress quote, 1M/10M ops, $0.015/GB-mo.
10. https://developers.cloudflare.com/workers/platform/limits/ — 100k req/day, 10 ms CPU, 128 MB, 5 crons, 15-min cron duration, Error 1027.
11. https://cloud.google.com/run/pricing — JS page; Tier-1 $0.000024/vCPU-s + $0.0000025/GiB-s + $0.40/M requests corroborated via Google's indexed page text + https://cloudchipr.com/blog/cloud-run-pricing + https://www.capterra.com/p/268691/Google-Cloud-Run/pricing + https://www.cloudzero.com/blog/google-cloud-functions (**line-level re-verify flagged**).
12. https://docs.cloud.google.com/run/docs/configuring/task-timeout — jobs task timeout "maximum of 10 minutes" default, "up to 168 hours (7 days)", GPU 1 h.
13. https://render.com/docs/free — spin-down quote (via search snippet: spins down after 15 min no traffic, ~1-min cold start); free PG 30-day expiry corroborated; 5 GB bandwidth **[secondary: codecapsules.com June 2026 comparison]**.
14. https://railway.com/pricing — Free plan $0 + $1 credits; Trial $5/30 days; Hobby $5; Pro $20; ~$10/GB-mo RAM, ~$20/vCPU-mo, $0.05/GB egress.
15. https://fly.io/pricing/ — no free tier; shared-cpu-1x 256 MB $2.19/mo; egress $0.02/GB NA/EU.
16. https://supabase.com/pricing — 2 projects, 500 MB DB, 1 GB files, 5 GB egress, 50k MAU, 500k functions, 1-week pause quote; Pro $25.
17. https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm — A1 "1,500 OCPU hours / 9,000 GB hours"; **Always Free = 2 OCPU/12 GB**; 2× E2.1.Micro; 200 GB block; 20 GB object; 10 TB egress; idle-reclaim quote; capacity-error quote.
18. https://www.hetzner.com/cloud/ + https://www.hetzner.com/cloud/regular-performance/ — CPX02 €6.49, CPX12 €11.99, CPX22 €19.99 (EU, excl. VAT); Cost-Optimized "currently not available".
19. https://contabo.com/en/vps/ — VPS 4 (4 vCPU/8 GB/100 GB) €4.40 "first 24 months"; VPS 6 €6.00; VPS 8 €11.20.
20. https://developers.google.com/youtube/v3/determine_quota_cost — "default quota allocation of 100 search.list calls, 100 videos.insert calls… 10,000 units per day combined"; 1 quota per insert; midnight-PT reset.
21. https://research.google.com/colaboratory/faq.html — 12-h session cap; unpublished limits; media-serving prohibition; content-generation termination quote; GPUs restricted.
22. https://resend.com/pricing — free 3,000 emails/mo, 100/day; Pro $20/mo.
23. https://trigger.dev/docs/open-source-self-hosting — containers/webapp+worker quotes; cloud-only features; responsibility quote.
24. https://community.n8n.io/t/does-my-business-model-violate-the-n8n-faircode-license/253894 + nordflux.de SUL guides — n8n internal-use-free / third-party-hosting-needs-Enterprise **[secondary corroboration]**.
25. https://github.com/thewh1teagle/kokoro-onnx — "~300MB (quantized: ~80MB)"; "near real-time on macOS M1" (only speed claim).
26. Prior research (dates = their fetch dates): `research/tech-stack-research-2026-10-17.md` (GHA caveats, self-hosted runner statefulness, Remotion license $0 ≤3 employees / $0.01-render-$100-mo-min Automators, Remotion Lambda vs Cloud Run Alpha) · `research/product-saas-blueprint-2026-10-04.md` (OAuth ladder, CASA ~$540/yr, Remotion Lambda ~$0.017/min, Inngest/Clerk, Paddle/LS MoR, Payoneer) · `research/scalable-channel-factory-2026-10-05.md` ("~2–4 min Actions" per short; private-minutes estimate) · `research/youtube-upload-quota-research-2026-09.md` (post-Dec-2025 bucket math, audit form, private-lock rule) · `research/byok-api-keys-2026-10-09.md` (per-provider BYOK limits, ~8 calls/20K tokens/day/channel, Pixabay/Pexels/ntfy limits) · `research/roadmap-2026-09-14.md` (local-vs-CI double production; caching "cuts ~3–5 min per channel run") · `research/premium-upgrade-research-2026-09-20.md` (ElevenLabs free = non-commercial; Kokoro Apache-2.0) · `research/production-audit-2026-10-23.md` (dead-token toil, watchdogs validated).
