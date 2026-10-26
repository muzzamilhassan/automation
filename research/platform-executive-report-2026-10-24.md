# Platform research program — executive report 2026-10-24

Read-only research round answering the owner's full brief: a scalable, template-driven, BYOK-first YouTube automation SaaS built on free/OSS foundations, supporting many users and many channels. No code was changed and no issues were created for this research.

**Continuity:** synthesizes ten same-day deliverables (all facts verified at primary sources on 2026-10-24 unless noted) — `platform-competitor-comparison-2026-10-24.md`, `platform-youtube-api-oauth-2026-10-24.md`, `platform-youtube-policy-compliance-2026-10-24.md`, `platform-byok-providers-2026-10-24.md`, `platform-niche-template-system-2026-10-24.md`, `platform-topic-discovery-script-qa-2026-10-24.md`, `platform-oss-video-stack-2026-10-24.md`, `platform-stock-assets-thumbnails-2026-10-24.md`, `platform-architecture-scheduling-2026-10-24.md`, `platform-zero-cost-feasibility-2026-10-24.md` — and builds on the prior corpus (`tech-stack-research-2026-10-17.md`, `python-rag-audit-2026-10-17.md`, `faceless-youtube-saas-landscape-and-studio-roadmap-2026-10-09.md`, `architecture-audit-2026-10-17.md`, and the 2026-09 research set). Per-file sources carry the URLs and fetch dates; this report cites the deliverable files by name.

**Brief-truncation note:** the owner's brief arrived truncated mid-Deliverable-3; sections 1–18 were complete. Deliverables were mapped to the section briefs; re-map if the original list differs.

---

## 0. TL;DR — the verdicts

| # | Question | Verdict | One line |
|---|---|---|---|
| 1 | Build the platform? | **GO — the gap is real and verified** | Across ~35 products re-verified today: BYOK exists nowhere (one Enterprise-tier exception), upload gates/verification/retention loops ship nowhere, and multi-channel portfolio pricing is only now being claimed from below. |
| 2 | Rewrite the existing stack? | **NO** | Every verdict lands on the current shape: GHA farm for own channels, Next.js/Vercel Studio, Neon, Remotion/FFmpeg/HyperFrames, Python AI sidecar (2026-10-17 direction). v2 is an extension, not a rebuild. |
| 3 | What is the first wall on the road to SaaS? | **ToS and quota — never money** | Vercel Hobby is non-commercial (Pro $20/mo at first tenant); YouTube caps uploads at 100/day **per OAuth project shared by all tenants** (~25 tenants × 1 short/day). Cloud Run Jobs ≈ $0.01/render when cost finally matters. |
| 4 | Scheduling engine | **pg-boss on Neon + one dedicated worker** | MIT, Postgres-only, expresses the repo's existing per-channel concurrency groups as SQL. n8n is license-BLOCKED for embedding (SUL). |
| 5 | Template system | **Hybrid: git-versioned JSON → Neon registry → code beat-primitives** | Immutable SemVer, projects pin MAJOR. And the policy text supplies the design spec: YouTube allows "same intro and outro… but the bulk of your content is different" — material variation is the monetization survival condition and must be an engine feature. |
| 6 | Launch niches | **10** | 8 validated by the owner's own 15-kit registry + history + travel-geography. Food/animals/sports parked (copyright), language-learning phase 2, storytelling parked (inauthentic-content canon). Niche #16 later = data rows, zero code. |
| 7 | BYOK architecture | **Capability registry + tenant provider configs; OpenAI-compatible as the universal adapter** | Envelope encryption (AES-256-GCM, AAD-bound per tenant), write-only UI, `usage_events` ledger with measured-vs-estimated flagging. Do NOT rebuild model routing (LiteLLM/OpenRouter exist). |
| 8 | Topic research | **Lawful per-tenant; the aggregation ban is the hard fence** | All data is API-reachable; `search.list` = 100 calls/day per project (own bucket); Developer Policies III.E.2.a forbids cross-tenant pooling; 30-day storage TTL is a design requirement, not hygiene. |
| 9 | Script QA | **RAG-grounded triage, never "AI fact-checked"** | Claims schema with source IDs; pgvector grounding (decided 2026-10-17); LLM-as-judge is triage only; medical/finance/disclosed-content get fail-closed human review. Market as "source-linked." |
| 10 | Policy warnings | **Five severities; block ONLY on verified technical constraints** | API-exposed: revoked token, quota, `uploadLimitExceeded`, suspensions, `uploadStatus=rejected`, `containsSyntheticMedia`. Indirect: name/handle diffs, monetary-403 YPP probe. Never ship an invented rule (no official channel-name change limit exists). |
| 11 | Stock & thumbnails | **Composites-only tenancy; sharp+SVG primary + one Chromium lane for Urdu** | Raw provider assets are never re-served (satisfies every license simultaneously). satori disqualified (RTL); Pillow needs a libraqm gate; pin background-removal models — rembg's default (`bria-rmbg`) requires a paid commercial agreement. |
| 12 | Zero-cost feasibility | **~$0 while owner-only; first dollar at first tenant** | GHA public farm + Vercel Hobby + Neon + BYOK + R2 free tier verified current today. Escalation ladder with named triggers in §9. |

---

## 1. What the market offers, what competitors do well, where opportunities exist

From `platform-competitor-comparison-2026-10-24.md` (~35 products, official pages fetched 2026-10-24):

- **AI video creation (A-majors)** — InVideo/Pictory/Fliki/Lumen5/Steve.AI/Vyond/Synthesia/HeyGen/Canva/Runway/Descript: commoditized price war (InVideo Basic $9→$4 annual; Pictory Pro "was $59"→$35), all credit-metered. What they do well: polished single-video UX, template breadth, brand kits. What none do: multi-channel operations, BYOK, upload verification. Only Fliki has native YouTube publishing (quota-metered 50–120/mo).
- **The autopilot shelf** (AutoShorts, faceless.video, ReelFarm, Crayo, Vsub, AutoReels, TaleTok, Channel Farm, Crealix + new entrants): $17–69/mo, series-capped, template-sameness complaints unchanged. TaleTok raised prices ~40% in six weeks; Channel Farm expanded to $49–$699; Vsub pivoted to long-form + API. **AITuber.app** ($39–$999, 1/2/4/unlimited channels, API+MCP on every plan) is the closest structural copy of our thesis found — traction unproven.
- **Publishing/scheduling (B)** — a $0–20/mo commodity. vidIQ bundles MCP on all plans; Metricool $159/mo for 50 YT connections; TubeBuddy still 1 channel/license. No scheduler documents failed-upload handling or verification loops (unknown/absent everywhere).
- **Social automation (C)** — verified per tool: n8n uploads but its node lacks schedule/thumbnail ops; Activepieces YouTube piece is READ-ONLY; Windmill has none; Postiz/Blotato/Ayrshare support YouTube. **Postiz is the business-model precedent**: AGPL-3.0 core, cloud $29–$99 by channel count. n8n's Sustainable Use License blocks embedding in a SaaS.
- **Infra (E)** — Shotstack unchanged; Remotion free ≤3-person org then $0.01/render min $100/mo (re-verified unchanged; v5.0 will "slightly change" the license — watch it).

**The five open gaps (all evidence-tied in the competitor file):** (1) BYOK-first is an empty seat; (2) API/MCP is now table stakes — 14 products ship it, ship day one; (3) channel-count pricing is the emerging norm — the window for portfolio positioning is closing; (4) gates/verification/retention loops still ship nowhere — ahead of the Feb 2027 YPP tightening this remains the core differentiator; (5) the cheap end is stressed — money is moving to $99–$999 compute-volume tiers, which BYOK sidesteps (caps revenue per compute, adds margin transparency).

## 2. What is feasible free/OSS vs what needs external services

From `platform-zero-cost-feasibility-2026-10-24.md` + `platform-oss-video-stack-2026-10-24.md`:

**Feasible at $0 (verified today):** script generation (BYOK), TTS (Kokoro-82M, Apache-2.0 weights; Hindi voices confirmed), transcription (faster-whisper/whisper.cpp/WhisperX local), thumbnails (Pillow/sharp + OFL fonts), rendering (GHA public-repo runners: 4 vCPU/16 GB, free), storage (R2 10 GB free, egress free), DB (Neon free), app hosting (Vercel Hobby, owner-only), stock (Pexels/Pixabay/Unsplash/Wikimedia/NASA/Coverr — commercial use in monetized videos, per license pages).

**Needs external services or hardware:** Urdu TTS quality (only candidate: Piper `ur_PK` voices — contested existence, untested quality; else Azure ur-IN/ur-PK voices, paid), image-gen at scale (FLUX.1-schnell/Qwen-Image Apache-2.0 locally need GPU; BYOK hosted APIs otherwise), >100 uploads/day (YouTube quota audit), hosted video-gen (paid-only; Veo was shut down in the Gemini API on 2026-10-22 — templates should degrade to stock-footage lanes), always-on worker (~$5–20/mo VPS or Cloud Run when tenants arrive).

**Honest quota ceiling:** YouTube is free but scarce — 100 uploads/day + 100 searches/day per project shared by all tenants. "Many channels" is supported; "unlimited free production" is not (per the brief's own constraint, documented with math in the zero-cost file §3).

## 3. Recommended initial direction

Synthesis of the ten files into one coherent v1 shape (every element sourced from its deliverable; this section is RECOMMENDATION pending owner review — planning-first rules apply):

**Data plane:** one Neon Postgres — tenant_id everywhere, RLS as defense-in-depth behind app filtering (`platform-architecture-scheduling` §4). `asset_registry` with license snapshots + `usage_events` + `job_events` + publish ledger as first-class tables. Object storage: R2, composites only, path-prefix tenancy; BYO-bucket (tenant's own S3/R2) as the storage analog of BYOK.

**Compute:** Studio (Vercel) + one dedicated worker container (pg-boss poller + render lane) + Python AI sidecar (RAG/voice consolidation, per the 2026-10-17 decision). GHA stays the render farm for OWN channels; tenant rendering moves to the worker/Cloud Run Jobs (never inside the public repo — ADR-A boundary).

**Templates:** git-versioned declarative JSON (`templates/**@semver.json`) as source of truth → Neon registry index (tenancy, bindings, analytics) → code-defined Remotion beat primitives. Capabilities declared (`script-gen`, `tts`, `image-gen`, `transcription`, `search`); resolved via tenant provider configs → platform defaults → fail with audit row. Material-variation enforcement (per-video distinct storyline/insight) as a template validation gate — this is the inauthentic-content countermeasure, not a nicety.

**Provider layer:** expand the BYOK vault from OpenRouter+ElevenLabs to the capability matrix in `platform-byok-providers` §1 (Groq/Cerebras free tiers, Gemini with its free-tier-trains-on-prompts caveat, ElevenLabs free = no commercial license — surfaced in UI). AES-256-GCM envelope encryption, MASTER_KEY + key_version (replace the YOUTUBE_CLIENT_SECRET-derived key — coupling two secret classes breaks rotation), AAD-bound tenant isolation, single worker reveal endpoint, write-only UI with last-4.

**Policy engine:** five severities; hard-block only on the verified constraint list (revoked token, `quotaExceeded`, `uploadLimitExceeded`, account suspension, `uploadStatus=rejected`); advisory warnings carry official policy quotes + fetch dates; checks wired at auth/sync/template/generation/scheduling/upload/post-publication (`platform-youtube-policy-compliance` §4).

**Publishing:** ~11-state machine; content-addressed artifacts per step (retry reuses completed work; the test: kill the worker mid-render, restart, re-enter at render byte-identical); upload-intent row before initiate, session-URI as de-facto idempotency token, 201-write, orphan reconciliation via uploads-playlist diff (`platform-youtube-api-oauth` §4); `publishAt` handling with the private-assertion rule; dedupe keys on `(channel, slot, kind)`.

**Topic pipeline:** three modes (trend suggestions / user topic / scheduled research calendar), 10-signal scorecard with provenance chips (measured/proxy/heuristic labeled), four freshness tiers, raw-API-payload 30-day TTL vs persistent own-derivatives (`platform-topic-discovery`).

**Scope discipline:** API + MCP access in v1 (table stakes); no fixed upload caps; no hardcoded per-channel maps; no auto-dubbing or thumbnail-A/B products (YouTube gave both away — integrate, per the 2026-10-09 landscape file).

## 4. Major risks (ranked)

| # | Risk | Evidence | Mitigation posture |
|---|---|---|---|
| R1 | **Inauthentic-content enforcement wave** — "AI-generated content made with generic or unoriginal templates giving the impression of mass production" is barred by name; ~16 large channels terminated Dec 2025–Jan 2026 (secondary) | policy file §1.2 | Material variation as an engine gate; per-video distinct storylines; human review ramps; disclosure automation via `containsSyntheticMedia` |
| R2 | **YouTube quota/audit dependency** — all tenants share one project's 100-uploads/100-searches buckets | API file §0-1, §1.2 | Quota model as per-project data; multiple audited projects posture; audit form ~1 month before the wall; per-channel serialization + global upload semaphore |
| R3 | **Feb 2027 YPP tightening** — new entry 8,000 hrs/365d or 20M Shorts views/90d; Shorts revenue gate 10M/90d; terms acceptance deadline Jan 31, 2027 | policy file §1.1 (primary, blog 2026-08-10) | Educational warnings + terms-deadline alert; don't hardcode post-2027 entry thresholds (subscriber minimum unresolved) |
| R4 | **Credential churn** — the recurring `invalid_grant` class (production-audit F3); Testing-status consent = 7-day tokens; 100-token cap per client | API file §0-6 | Consent screen → In production (zero-cost fix, launch blocker); 30-day reconfirm sweep; park+notify on `invalid_grant` |
| R5 | **License drift** — 2026's custom licenses: Fish Speech (FACL $500k + hosted-service ban), SD3.5 ($1M), Remotion (headcount), rembg default = paid | OSS + BYOK + stock files | Apache-2.0/MIT weights everywhere the SaaS touches; license snapshot hashes in `asset_registry`; license-class surfaced per provider |
| R6 | **Template sameness** — the dominant competitor complaint AND the policy trigger | competitor + policy files | Same mitigation as R1; template diversity metric on the dashboard |
| R7 | **Competitor window closing** — AITuber.app structurally identical; channel-count pricing normalizing | competitor file §gaps | Ship the differentiators (BYOK + gates + verification) ahead of the Feb 2027 deadline |
| R8 | **No first-party measurement** — repo state holds zero view counts; niche validation is heuristic-only | niches file §first-party | Analytics ingestion (`reporting/collect.mjs` extension) before scaling niche claims |
| R9 | **Colab music lane is ToS-gray** — Google prohibits bypassing the notebook UI for content generation | zero-cost file §key numbers | Best-effort labeling; plan an owned-music fallback (own-music-generation research exists) |
| R10 | **Vercel Hobby commercial-use violation** the day a paying tenant exists | zero-cost file §0-2 | Budget Pro $20/mo at first tenant; it is a ToS requirement, not an upgrade |

## 5. Consolidated integration matrix

| Capability | Pick | License | Role | Notes |
|---|---|---|---|---|
| Rendering | FFmpeg 8.1 + Remotion + HyperFrames | FFmpeg LGPL/GPL components; Remotion custom (free ≤3-person); HyperFrames in-house Apache-2.0 | keep (own channels) | Tenant renders exit the public repo |
| TTS (EN/HI) | Kokoro-82M | Apache-2.0 (code+weights) | integrate (local) | Hindi voices confirmed; `grade C` evidence noted |
| TTS (multilingual study) | VoxCPM2 | Apache-2.0 (code+weights) | study | 30 langs incl. Hindi; ~8 GB VRAM; GGUF CPU path |
| TTS (Urdu) | Piper `ur_PK` / Azure ur-* | GPL-3.0 successor repo / paid | open decision | Existence contested (see §8); quality untested |
| STT | faster-whisper + WhisperX | MIT + BSD-2-Clause | integrate | WhisperX needs HF token + gated pyannote (CC-BY-4.0) |
| Image gen | FLUX.1-schnell / Qwen-Image | Apache-2.0 | integrate (local, GPU) | FLUX-dev outputs are commercially usable per license — owner policy call for client work |
| Background removal | BiRefNet / MODNet via rembg engine | MIT / Apache-2.0 | integrate | Ban `bria-rmbg` (paid commercial agreement) |
| Thumbnails | sharp+SVG primary; Chromium lane (Urdu) | Apache-2.0 (sharp); MIT (@sparticuz/chromium) | integrate | satori rejected (RTL); Pillow needs libraqm gate |
| Clipping | PySceneDetect + WhisperX + mediapipe/YuNet | BSD-3 / BSD-2 / Apache-2.0 (+MIT YuNet weights) | integrate into #95 lane | openshorts as reference only (identity unconfirmed, §8); FunClip MIT reference |
| Queue/schedule | pg-boss | MIT | integrate (Phase B) | Queue-per-channel = existing GHA groups in SQL |
| Animation (math/science niche) | Manim CE | MIT | defer | Only if that niche launches |
| Music | YouTube Audio Library | copyright-safe, YPP-monetizable | integrate | Only Audio-Library/licensed/generated sources (≥1-min claimed Shorts rule) |

**Reject list (with reasons):** n8n embedding (SUL), satori/@vercel/og for thumbnails (RTL broken), XTTS-v2 outputs (CPML non-commercial, license page now 404s), F5-TTS checkpoints (CC-BY-NC), MoviePy (17 months without release + slow), ImageMagick (serverless security-policy friction), NewsAPI free tier (dev-only), Google CSE (closed to new customers, dies 2027-01-01), Bing Web Search (retired), Reddit free API for commercial use (non-commercial terms), hypit (no-license face-swap — policy landmine), AGPL editors embedded in SaaS (Concat, OpenMontage — reference only).

## 6. Dashboard journey — twelve stages (§17)

Per-stage: UI → backend → error handling → APIs (synthesized from the deliverables; detail lives in them).

1. **Register/authenticate** — Studio Google login (existing: HMAC sessions 30d, access.json→Neon users); hardening path on file: opaque `sessions` table + revocation, then Better Auth on Neon (auth deep-dive). Default personal workspace auto-created, invisible to solo users.
2. **Connect YouTube channel** — OAuth consent (`youtube.force-ssl` + `youtube.readonly` + `yt-analytics.readonly`; monetary scope only for YPP clients); channels keyed by `channelId` via Google's account chooser — one Google account may own several channels (escrow-estate bug is the precedent). UI states: connected / needs-reauth (`invalid_grant` → park + ntfy "reconnect") / sync-required / sync-failed / publish-blocked (verified constraints only) / ready / policy-warning. Consent screen MUST be "In production" (Testing = 7-day tokens).
3. **Channel dashboard** — field inventory per `platform-youtube-api-oauth` §2 (endpoint/scope/caching/cadence/fallback per field); subscriber counts labeled "rounded"; "live" tiles from Data API `videos.list`/`batchGetStats`, trend panels from Analytics with "data through <date-2>" stamps; fields not API-editable deep-link to Studio (title, handle, monetization).
4. **Configure niche** — global taxonomy; primary + secondary niches per channel (own kits are already mixtures); compatible templates surface from the registry; topic blacklists, exclusions, preferred sources, brand voice live in channel kit data (no-static-maps).
5. **Select video templates** — multiple bindings per channel; compatibility validated pre-bind (format × niche × capability coverage); MAJOR pinned; fork-on-customize with lineage.
6. **Select thumbnail templates** — independent catalog, linked optionally to video templates; generate N candidates → user picks; spec + compatibility rules per `platform-niche-template-system` §7.
7. **Configure BYOK** — provider rows per capability with priority + fallback; test-on-save; license-class warnings (e.g. ElevenLabs free = no commercial use) surfaced at save, enforced as publish-flag warnings not run-blocks; missing-capability explanation names the blocker.
8. **Choose topics** — Mode A (suggestions with "why this topic" provenance chips), Mode B (own topic), Mode C (scheduled research → reviewable calendar); quota-aware (search bucket per project).
9. **Generate** — template pipeline: research → script (claims/sources JSON) → review gate (script_review) → assets → audio → render → QC as sub-steps of one `rendering` state; inspect script + sources side-by-side with claim↔source links; provenance on every number.
10. **Review & schedule** — final_review gate; disclosure checklist in official wording when `synthetic_media_required`; AI-use confirmation maps to Developer-Policies consent (III.I.2); title/description/visibility/time; schedule projection (existing `validateSchedule` pattern) with per-project quota model.
11. **Upload & monitor** — upload-intent row → resumable PUT → persist video id on 201 → poll processing (t+2/10/30min then hourly) → handle `uploadLimitExceeded`/`quotaExceeded`/thumbnail 403/429 with backoff → published-state verification (verify-run pattern); crash recovery per §3 publishing design.
12. **Learn** — Analytics ingestion (§7 below) feeds topic scoring (own-channel signal), template comparison, schedule tuning; per-video cost from `usage_events` + `job_events`.

## 7. Analytics and the improvement loop (§16)

**Metric inventory (verified, from the API file §3):** views/`engagedViews`, estimatedMinutesWatched, averageViewDuration/Percentage, audienceWatchRatio (video-scoped, `elapsedVideoTimeRatio`), subscribersGained/Lost, traffic sources (`insightTrafficSourceType` + detail; 50k videos×days cap), thumbnail impressions/CTR (**bulk Reporting API only**, added Jan 2026), revenue metrics (monetary scope + YPP; 403 otherwise — also the YPP probe). Freshness: 48–72h documented delay; day-dimension truncation; `engagedViews` as the methodology-stable series.

**The loop (RECOMMENDATION):** nightly ingestion → attribute outcomes to (template, topic, thumbnail-variant, slot) → scorecard updates: topic scoring's own-channel signal, template leaderboard, thumbnail-style win rates, freshness-tier calibration → surfaced as dashboard recommendations with provenance labels. Experimentation discipline: change one variable per batch; thumbnails A/B via YouTube's native Test & Compare (no API to start tests — Studio-native flow); never promise algorithm behavior or virality — the loop is measurement-driven, not prediction-driven. This closes R8 and converts the niche table from heuristic to measured over time.

## 8. Verification ledger & discrepancies

**My post-report spot-checks (GitHub API, 2026-10-24):**
- **Piper Urdu — CONTESTED.** The OSS file claims `rhasspy/piper-voices` (HF) hosts `ur/ur_PK` voices; the BYOK file says Piper has no Urdu. GitHub API returned Not Found for the `ur` path (root listing also failed — tool inconclusive). Status: existence unconfirmed, quality untested either way. The decision item stands regardless: Urdu listening-test spike vs commercial Azure voices.
- **openshorts — IDENTITY UNCONFIRMED.** Claimed "MIT, 7,050★, pushed today, fork of kamilstanuch/Autocrop-vertical." Five `openshorts`-named repos found; none matches those stats. The named upstream `kamilstanuch/Autocrop-vertical` is real (YOLOv8+FFmpeg 9:16 converter, pushed 2026-02-15); `jnMetaCode/openshorts` (local-first script→footage→TTS→captions pipeline, pushed 2026-10-01) is the most plausible candidate. Treat openshorts as reference-only until re-identified; the decomposed components (PySceneDetect/WhisperX/YuNet) remain the solid recommendation.
- **Feb 2027 YPP doubling — VERIFIED, not unverified.** The niches file flagged it unverified; the policy file verified it at the primary source (blog.youtube, published 2026-08-10). The policy file governs. Cross-file reconciliations that agree: quota buckets (3 files), Remotion terms (2 files), thumbnail size specs (2 MB mobile web / 50 MB desktop & API — consistent surfaces).

**Agent-flagged UNVERIFIED items, consolidated:** Analytics API quota number (console-only); resumable session "~1 week" (absent from current docs); private-video visibility in owner's uploads playlist; `auditDetails` scope viability for persistent SaaS use (MCN-flow wording; prototype first); monetary-403 scope-vs-YPP ambiguity; Vercel Workflow SDK pricing/license; Inngest/Brave/Groq/Cerebras exact current free numbers (console re-check); Openverse numeric rate limits; Mixkit license full text; Freepik AI/API terms (403); U-2-Net weights license; `videos.list` 50-id cap; Reddit data-API exact clause text; Gemini per-model RPD drift risk; `containsSyntheticMedia` read-back round-trip. None blocks planning; each is listed in its file with what would resolve it.

## 9. Roadmap (RECOMMENDATION — every phase gated on owner review; planning-first applies)

**Phase 0 — hygiene findings from this research (candidate fixes, no code until approved):**
1. Publish the OAuth consent screen to "In production" (kills the 7-day-token class behind the recurring `invalid_grant`).
2. Verify Studio onboarding requests `youtube.readonly` alongside `yt-analytics.readonly` (reports.query requirement).
3. Pin background-removal model away from rembg's default `bria-rmbg` wherever used.
4. Encode the YouTube quota model as per-project data (ledger currently assumes the pre-Dec-2025 model).
5. GHA 60-day keepalive + the sweeper/P1 items already queued in production-audit-2026-10-23.
6. Decide the Colab music lane (keep best-effort vs owned-music fallback).

**Phase 1 — Spec & design (EARS specs, plain-English QA files, ADRs; owner approves each boundary):** template JSON schema + registry + variation gate; capability/provider registry + BYOK vault expansion + `usage_events`; policy warning engine (severity ladder + verified-constraint blocklist); 11-state workflow + pg-boss tables + artifact store; composites-only asset layer + `asset_registry`; dashboard field model per the API inventory; analytics ingestion schema.

**Phase 2 — Vertical slice:** one niche, two templates, one tenant channel end-to-end (connect → topic → script → review → render → schedule → publish → verify → analytics), BYOK only, zero-cost tiers only.

**Phase 3 — Multi-tenant hardening:** RLS + tenant seams, per-channel queues + per-tenant concurrency caps, policy warning engine live, observability v1 (`job_events` + ntfy + healthchecks dead-man switch), storage lifecycle + quotas.

**Phase 4 — Expansion (triggers from the zero-cost file):** Vercel Pro at first payment; repo split when SaaS code goes private; Cloud Run Jobs at >60 render-min/day or client-owned channels; BYO-bucket tier; YouTube quota-audit application ~1 month before the 100-uploads wall; BYO-compute tier evaluation for heavy tenants.

## 10. Open questions for the owner

1. Urdu TTS: listening-test spike on Piper `ur_PK` (existence contested, §8) vs Azure ur-* voices?
2. FLUX.1-dev generated outputs for client work (license permits commercial outputs) — allow, or Apache-weights-only policy?
3. Trends API alpha application now, or stay on RSS/pytrends-proxy?
4. Reddit data: license-or-drop for niche research?
5. BYO-bucket storage: launch feature or fast-follow?
6. pg-boss worker vs Vercel Workflow SDK spike (pending Vercel pricing verification)?
7. Primary-only vs primary+secondary niches at v1 (research recommends day-one multi-niche)?
8. `auditDetails` good-standing booleans: worth a prototype spike given the MCN-flow caveat?
9. Evaluation-only BYOK keys allowed (recommendation: allow + license-class publish warning)?
10. Colab music lane keep/fallback decision (Phase-0 item 6)?

## 11. Deliverable index

| File | Sections covered |
|---|---|
| `platform-competitor-comparison-2026-10-24.md` | §2 market, categories A–E, gap analysis (Deliverable 2) |
| `platform-youtube-api-oauth-2026-10-24.md` | §3.1–3.2, §13.4, §16 API facts |
| `platform-youtube-policy-compliance-2026-10-24.md` | §3.3–3.4, §15 policies + warning architecture |
| `platform-byok-providers-2026-10-24.md` | §4 providers, abstraction, security, cost tracking |
| `platform-niche-template-system-2026-10-24.md` | §5–7 niches, templates, sub-niches, thumbnail templates |
| `platform-topic-discovery-script-qa-2026-10-24.md` | §8–9 topic modes, scoring, script QA |
| `platform-oss-video-stack-2026-10-24.md` | §10.1/10.3–10.7, §11 repo rankings |
| `platform-stock-assets-thumbnails-2026-10-24.md` | §10.2, 10.8 stock licensing, thumbnail rendering |
| `platform-architecture-scheduling-2026-10-24.md` | §13.1–13.3, §14 multi-tenant, storage, observability |
| `platform-zero-cost-feasibility-2026-10-24.md` | §12 deployment, quotas, cost model, escalation |
| `platform-executive-report-2026-10-24.md` (this file) | §1 Deliverable 1, §6–7 journey + analytics, §9 roadmap |
