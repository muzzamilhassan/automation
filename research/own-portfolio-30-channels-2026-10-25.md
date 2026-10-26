# Own-portfolio capacity research — 30+ channels, no external users — 2026-10-25

Scope change from the owner: the platform's beginning is **NOT a public SaaS** — it is an internal factory for the owner's **own channels, target ~30, across different niches**. This note answers one question with numbers: **how many own channels can the current architecture support, what breaks first, and what does that mean for the product scope?** It is a scoped follow-up to the 11-file program of 2026-10-24 (`platform-executive-report-2026-10-24.md` + 10 deliverables); every verified fact cites those files rather than re-fetching. New ground truth gathered today: live GitHub Actions run durations (2026-10-25, via `gh run list`). The repo went private 2026-10-24 (#81), which changes the minutes math — treated as current reality here. Read-only; no code changed.

---

## 0. TL;DR verdicts

| # | Question | Verdict | One line |
|---|---|---|---|
| 1 | Can we run 30 own channels? | **YES — comfortably** | Every YouTube quota ceiling fits 30 with room to spare; the only ceiling that actually moves is render minutes (≈$10–25/mo, see §2). |
| 2 | How many channels CAN we go to on this architecture? | **~50 without design changes; ~90 on YouTube quota alone** | Uploads bucket (100/day) supports 90 channels at 1/day; the search bucket (100/day) is the first wall — manageable to ~50 with research discipline, then a second GCP project for research. |
| 3 | What breaks first at 30? | **GHA minutes on the now-private repo** | 2,000 free min/mo ≈ already tight at 16; at 30 the produce lane alone is ~2,700–3,600 min/mo → ~$10–25/mo overage or a Cloud Run render lane (~$9–18/mo, also faster). |
| 4 | Does the SaaS architecture change for own-only? | **A LOT gets cut** | Workspaces/RBAC/RLS, tenant isolation, BYOK-for-others UI, billing, OAuth audit, CASA — none of it needed. The platform for now = template registry + variation gate + warning engine + artifact-based pipeline + analytics ingestion, all inside the current repo. |
| 5 | Biggest risk at portfolio scale | **Inauthentic-content exposure scales with channel count** | 30 template-fed channels = 30× the surface for one "mass-produced" ruling. The material-variation gate is more important at 30 than any quota. Feb 2027 terms must be accepted on every channel by Jan 31, 2027. |

---

## 1. Ground truth: what a channel actually costs in run time (measured today)

From live `gh run list` on `muzzamilhassan/automation` (2026-10-25, private-repo 2-core runners):

| Lane | Observed wall time | Notes |
|---|---|---|
| Channel autopilot produce run (per channel dispatch) | **2 min 32 s – 3 min 32 s** (4 runs sampled Oct 24: 2:32, 3:13, 3:32, 3:19) | The full produce lane: research → script → TTS → render → upload path |
| Longform/doc lane | 10–14 min (last runs Sep 16; now driven per-channel on doc cadence) | Weekly-per-channel, not daily |
| CI Doctor | 28 s | Daily |
| Reports workflow | 41 s | Daily |
| Thumbnail A/B Swapper | 14–20 s × several/day | Shorts-lane support |
| Test Suite (dev pushes) | 15–30 s × many/day | Counts against private minutes — dev activity is a real line item |

**Per-channel daily produce cost: ≈ 3–4 min** (render on 2-core is already reflected in these numbers — they ran post-#81). Estimates below use 3.5 min + 15% overhead, labeled **estimate**.

## 2. The four ceilings, with math (the direct answer to "how many channels")

Ceilings are per the verified quota model (`platform-youtube-api-oauth-2026-10-24.md` §0-1, §1.2–1.3: 100 `videos.insert` calls/day + 100 `search.list` calls/day per project, each own-bucket; 10,000 units/day shared pool for everything else; midnight PT reset).

### Ceiling A — YouTube uploads bucket: supports ~90 channels at 1/day

30 channels × 1 short/day + ~5 weekly docs spread across the week ≈ **31–35 uploads on the peak day vs 100 allowed**. Headroom: ~90 channels at 1/day each before the bucket fills. Per-channel daily caps (~100, `uploadLimitExceeded`) are irrelevant at 1/day. **Not a constraint until ~90 channels.**

### Ceiling B — YouTube search bucket (trend research): the first real wall, at ~30–50 channels

Current `trend-research.mjs` does a seed-variant search loop until ≥3 results: **1–4 searches/channel/day** (repo-verified behavior, `platform-topic-discovery` §3). At 16 channels: 16–64/day — fits in 100. At 30 channels: **30–120/day — over the bucket on bad days.** Mitigations, in order of preference:

1. **Search fewer times**: pre-screen topics with zero-cost sources (Google Trends RSS + GDELT + GNews + autocomplete, all verified in `platform-topic-discovery` §1), and only spend a search call on topics that pass the cheap filter → ~1–2 searches/channel/day.
2. **Deduplicate seeds**: channels in the same niche share a research pass; per-channel variation comes from the template + brand kit, not from separate searches.
3. **Second GCP project for research-only** (search quota is per project; a research-only project runs no OAuth app, so it adds no audit surface). This is the ~50-channel answer.

With mitigation 1+2, **30 channels fit with ~40–60% headroom**. At 50+, open project #2. **Constraint is real but fully manageable.**

### Ceiling C — the shared 10k-units pool: supports 90+ channels

Worst case at 30 channels/day: thumbnails.set 50u × 30 = 1,500; videos.list + batchGetStats polling ≈ 100–150; playlistItems ≈ 50; captions on docs ≈ 400–500 occasional; metadata updates ≈ 100 → **~2,000–2,500 units ≈ 20–25% of pool**. Headroom: fine to ~90+ channels. **Not a constraint.**

### Ceiling D — render minutes (the one that costs money): the binding constraint at 30

| Channels | Produce min/mo (est.) | + misc lanes ≈ | Total vs 2,000 free (private repo) | Overage cost @ $0.006/min (verified rate, zero-cost file) |
|---|---|---|---|---|
| 16 (today) | ~1,680 | ~400 | **~2,080 — right at the cliff** | ~$0.50/mo |
| 24 | ~2,520 | ~450 | ~2,970 | ~$6/mo |
| **30** | **~3,150** | **~500** | **~3,650** | **~$10/mo** |
| 40 | ~4,200 | ~600 | ~4,800 | ~$17/mo |
| 50 | ~5,250 | ~700 | ~5,950 | ~$24/mo |

(GitHub Pro plan at $4/mo includes 3,000 min — halves the overage at 30–40 channels.)

**The alternative that also buys speed:** move only the render step to **Cloud Run Jobs** (≈$0.01/render, 4 vCPU — renders roughly 2× faster than the 2-core private runner): 30 channels × 30 days = 900 renders ≈ **$9–18/mo total**, kills the minutes cliff entirely, removes the 60-day-auto-disable and dropped-job caveats, and frees GHA for cheap orchestration lanes. The tech-stack file's trigger for this move was ">60 render-min/day sustained" — 30 channels ≈ 100–120 render-min/day, **so the trigger fires right at the 30-channel mark.** Recommendation: stay GHA through ~20–24 channels, migrate the render lane at ~25–30.

### Ceiling E (non-quota) — channel trust and Google account structure

- 100 refresh tokens per Google account per OAuth client (verified, API file §1.4): 30 channels across a few Google accounts = fine.
- New channels have lower daily upload limits by trust — irrelevant at 1/day.
- 30 per-channel MCP servers is an operator burden, not a limit — consider whether every future channel actually needs one.

**Verdict: the architecture supports 30 own channels today; ~50 with the research mitigations + render migration; ~90 is YouTube's upload ceiling. Nothing about 30 requires the SaaS design.**

---

## 3. What "the product, for now, for my own 30 channels" means — keep vs cut

This scope change collapses most of the Phase 1–3 SaaS roadmap (`platform-executive-report-2026-10-24.md` §9). The platform for now is an **internal template-driven factory**, not a multi-tenant app:

| Component (from the 10-24 program) | Own-30 verdict | Why |
|---|---|---|
| Template registry (git JSON → Neon index → code primitives) | **KEEP — still the core** | 30 channels × niches = exactly what it solves; niche #31 = data rows, zero code |
| Material-variation gate | **KEEP — now MORE important** | 30 template-fed channels is 30× the inauthentic-content surface; this is the survival feature (policy file §1.2) |
| BYOK vault | **KEEP, simplified** | Own keys only; no per-tenant UI, no license-class warning UX, no write-only browser flow needed (keys never leave server) |
| Envelope encryption + MASTER_KEY versioning | **KEEP** (still the right shape) | Cheap to do right from the start; de-couple from YOUTUBE_CLIENT_SECRET (Phase-0 item) |
| `usage_events` ledger | **KEEP** | Cost-per-channel is how you decide which of 30 channels to keep/kill |
| Policy warning engine | **KEEP, simplified** | Warnings for own channels: token death, quota, upload rejections, disclosure flags, Feb-2027 terms deadline. No severity-UX for strangers |
| 11-state workflow + content-addressed artifacts | **KEEP** | Retry-isolation pays off at 30 lanes × daily runs; the duplicate-upload class (audit §2.3) dies here |
| pg-boss + dedicated worker | **DEFER** | GHA cron at 3.5 min/channel is fine through ~24 channels; move the RENDER step to Cloud Run at ~25–30 (§2D). pg-boss returns only if scheduling precision demands it or the SaaS revives |
| Composites-only stock layer + `asset_registry` | **KEEP** | Same monetization exposure as any SaaS — your channels are monetized |
| Thumbnail template system (sharp+SVG, Chromium lane for Urdu) | **KEEP** | 30 channels need distinct looks precisely because they share templates |
| Topic pipeline (3 modes, 10-signal scorecard, search discipline) | **KEEP, with §2B mitigations** | The search bucket is your first wall; the mitigations are cheap |
| Script QA (claims/sources JSON, RAG grounding, review gates) | **KEEP** | Health/finance channels at portfolio scale = the safeguard pack is what keeps all 30 monetizable |
| **Workspaces / RBAC / RLS / tenant isolation** | **CUT** | One user. No isolation problem exists |
| **BYOK-for-clients UI, OAuth-for-others, consent screen for tenants** | **CUT** | Your own tokens only; the Testing-status fix is still wanted (7-day token deaths hurt you too) |
| **Billing, plans, Vercel Pro, audit forms, CASA** | **CUT/DEFER** | No paying tenant → Hobby ToS is satisfied (own use); no quota raise needed until ~90 uploads/day |
| **API + MCP for customers** | **DEFER** | The competitor file says table stakes for a SaaS — irrelevant while internal; your MCP servers are already your "API" |
| Analytics ingestion (`reporting/collect.mjs` + Neon snapshots) | **KEEP — elevated priority** | The R8 gap (zero view counts in state) matters more at 30: portfolio decisions (keep/kill/retune a channel) need measured data, and 30 channels of your own data is the asset that makes any future SaaS credible |

**Bottom line: the "beginning product" is the existing repo + template registry + variation gate + QA/warning layers + analytics ingestion. Everything tenant-shaped moves to a later phase if/when the SaaS decision returns.**

## 4. Niche allocation for 30 channels

From the validated niche table (`platform-niche-template-system` §1: 10 launch niches — 8 owner-validated, + history, + travel-geography). Current 16 kits: finance×6, business×3, motivation×2, health×2, tech×1, productivity×1, policy/news×1. One concrete path to 30 (**allocation is a recommendation, not a rule**):

| Niche | Now | + New | New-channel angles (sub-niche/style variation is the point) |
|---|---|---|---|
| Finance/investing | 6 | +1 | e.g. credit & debt recovery (distinct from debt-free-doctrine's angle) |
| Business/entrepreneurship | 3 | +1 | e.g. solo/creator-economy operations |
| Motivation/wisdom | 2 | +1 | e.g. stoicism-vs-discipline split formalized |
| Psychology | (in QQ mix) | +1 | Standalone human-behavior channel |
| Tech/AI | 1 | +2 | AI tools lane; tech-explainer lane |
| Health/wellness | 2 | +1 | Fitness-education split from longevity/sleep |
| Productivity | 1 | +1 | Deep-work systems vs tools angle |
| Education/science | (in explainers) | +2 | Science facts; how-things-work explainers |
| History | 0 | +2 | Event timelines; figure profiles |
| Travel/geography | 0 | +2 | Geography explainers; travel-data stories |
| **Total** | **16** | **+14 = 30** | |

Notes: language-learning stays phase-2 (needs language-parameterized templates + the Urdu/Hindi TTS decision); storytelling/food/animals/sports stay parked (copyright/policy). Finance at 7/30 is concentration — the new one should be a genuinely different sub-niche, and the variation gate should treat cross-channel sameness inside a niche as its hardest case.

## 5. Portfolio-scale risks specific to "30 of my own channels"

1. **Inauthentic-content exposure × 30.** One enforcement pass against a template pattern touches every channel running it. Mitigations: the variation gate (cross-channel too — not just within-channel), distinct visual identities per channel (thumbnail system), and the already-different niche mix. Diversification across 11 niches is genuinely protective: it prevents any single review from seeing "a network of identical channels."
2. **Feb 1, 2027 YPP terms** — every channel must accept updated terms by **Jan 31, 2027** (policy file §1.1); a checklist/lane for 30 channels beats remembering 30 times. Shorts-only channels face the 10M/90d revenue gate post-Feb-2027: **new unmonetized channels should keep the weekly longform/doc lane alive** — watch-hours remains the realistic monetization path (ceiling A shows the upload cost is trivial).
3. **Credential churn × 30.** The `invalid_grant` class (production-audit F3) scales linearly. The 30-day reconfirm sweep + park-and-notify design (API file §4.6, scheduling file §2) becomes mandatory bookkeeping at 30, not optional hygiene.
4. **One template bug = 30 bad videos/day.** The P0 regression of Oct 21–23 (3 dark days × 16 channels) at 30 channels is 90 lost videos. The verification/watchdog layer (CI Doctor + ntfy + verify-run — proven during that incident) plus the artifact store are what keep this survivable.
5. **Search-bucket saturation on batch days** (§2B) — schedule research with the pre-screen discipline before adding channel #25+.

## 6. Cost table at 30 channels (everything included, **estimate** unless marked)

| Item | Cost | Basis |
|---|---|---|
| YouTube API | $0 | Quota fits (§2A–C) |
| GHA produce lanes | ~$10/mo overage — or $0 if render moves | §2D, $0.006/min verified rate |
| **→ Recommended: render lane on Cloud Run Jobs** | **~$9–18/mo** | ~900 renders × $0.01–0.02 (zero-cost file estimate; re-verify against bill) |
| Vercel Hobby | $0 | Own use = allowed |
| Neon | $0 (free tier) | 100 CU-hrs/project; watch autosuspend for Studio UX, not pipelines |
| R2 storage | $0 → ~$1–2/mo | 30 ch × ~60 MB × 14–30 day retention ≈ 25–55 GB vs 10 GB free (zero-cost file math) |
| AI inference (scripts, TTS fallback, images) | ~$0 BYOK + edge-tts/Kokoro | Own keys; Groq/Cerebras free tiers for overflow |
| Stock/thumbnails | $0 | Free-license sources + sharp/Pillow |
| **Total at 30 channels** | **≈ $10–20/mo** | The entire marginal cost of the portfolio |

## 7. Recommended sequence for getting to 30 (each step owner-approved)

1. **Now → 20 channels:** add within validated niches; adopt the search pre-screen before channel ~20; fix Phase-0 hygiene (consent screen → production, `youtube.readonly`, quota-model-as-data, rembg pin) since 30 channels inherit every credential bug.
2. **~25 channels:** template registry + variation gate land (the survival feature); analytics ingestion lands so channels 21–30 launch **measured** from day one.
3. **~30 channels:** migrate the render lane to Cloud Run Jobs; open GCP research-project #2 if the search bucket logs >90 calls/day; run the keep/kill review using `usage_events` + analytics (30 channels should not all live forever — the ledger decides).
4. **Standing rule:** any new channel = niche rows + template JSON + brand kit + one cron line. If adding a channel needs code, that's a bug against the no-static-maps directive.

## 8. Sources & method

- Verified quotas/buckets, token rules, policy texts, licenses: the 2026-10-24 program files (each with its own dated source list) — re-cited, not re-fetched; nothing quota-bearing changed in the intervening day.
- Measured today (2026-10-25): `gh run list` durations for channel-autopilot (4 runs), longform-daily, Test Suite, CI Doctor, Reports, Thumbnail A/B Swapper; repo-private status per #81 (2026-10-24).
- Estimates (labeled): minutes extrapolations (§2D table — ±30% band), Cloud Run per-render cost, R2 growth. GitHub Actions billing actuals require the `user` API scope (not granted; deliberately not escalated) — first month's private-repo bill replaces the §2D estimates.
