# Plan — admin panel control, scaling, Python/LangGraph (2026-11-16)

Owner request (2026-11-15): move every small setting from files/backend into
the Studio admin panel (dynamic, flexible); explain how the project scales;
move toward Python + LangChain/LangGraph agentic and beyond YouTube.
Inputs: 4 read-only reviews (settings inventory, admin panel, scaling with
measured Actions timings, Python/LangGraph research →
`research/python-langgraph-agentic-platform-2026-11-15.md`) plus
`research/deep-audit-2026-11-13.md`. Status: PLAN — nothing here is built
until the owner approves (planning-first).

## 0. Urgent — GitHub Actions budget is already exceeded

- Measured from 195 jobs (11-07..11-15, per-job minute rounding): ~$15.8/30d,
  + $2.9 for the 48/day external heartbeat (live since 11-15) ≈ **$18.6/mo vs
  the $12 included**. With no payment method, Actions **blocks ≈ day 19 of
  each month** — production stops until the 1st.
- Cost drivers: doc days 31–50 min each (runs 43365094869, 43537225788,
  43255523260, 43724498853, 43342205832); normal clip day 2–3 billed min;
  side lanes ~$8.5/30d (reconcile 1.86, tests 1.56, reports 1.23, sweeper
  1.08, probes 0.97, thumb-ab 0.67, ci-doctor 0.58).
- Artifacts: 1,765 MB live vs 500 MB included (153 artifacts, many stale
  September runs at 90-day retention; docs 64–272 MB × 30 days).
- Options: (a) add a payment method + spending limit (~$7–10/mo overage,
  zero work, immediate); (b) self-hosted runner for produce/discover
  (no GitHub fee; host = owner PC / Oracle Always-Free / Hetzner ~€16) —
  GitHub-hosted spend drops to ~$4–6; (c) both: (a) now, (b) as Stage 0.
- Free same-day cuts: delete stale artifacts, doc artifact retention 30 → 7
  days, move docs to Releases like clips (no size cap, outside the allowance).

## 1. Admin panel — what to fix and move

### 1a. Correctness bugs (panel can't be trusted until fixed)

| # | Finding (evidence) | Effort |
|---|---|---|
| 1 | "Save & review" switched autopilot off — **FIXED b5c8a9b** | done |
| 2 | Overview builds channels from the build-time `lib/brands.json`, not the registry; profile edits never appear (`lib/data.mjs:59-60`, `overview/route.js:62,83`) | M |
| 3 | Broken channels are hidden — a 401/zero-stats channel vanishes exactly when it needs re-auth (`overview/route.js:116`) | S |
| 4 | Schedule wipe: failed load + Save overwrites cadence (`SchedulePanel.js:74,80`, `schedule/route.js:173-180`) | S |
| 5 | Lost updates: repo-JSON read-modify-write races CI commits (`channels-registry.js:127-140`; flow, clip-queue, cadence, keys, branding) | L (fix = Neon) |
| 6 | Helpers swallow errors and return ok (`channels-registry.js:283-316`); pause toggle ignores the response and reloads 60s-cached data | S |
| 7 | "Clear broken queue" deletes ALL clips, no confirm (`clip-queue/route.js:83`) | S |
| 8 | `/api/review/thumb` has no route → review thumbnails 404 | S |
| 9 | Proxy blocks staff from schedule/clip-queue the routes allow | S |
| 10 | No confirms on Pause-all/unassign/deactivate; no audit on profile/templates/providers; no `error.js` boundaries | S–M |

### 1b. Settings that live only in code/files → panel (ranked)

1. Per-channel YouTube token resolution: 7 workflows hardcode `YT_TOKEN_<4 slugs>` (analytics-nightly, ci-doctor, daily-sweeper, longform-daily, longform-upload, thumb-ab, upload-reconcile) → channel #31 gets no health check/reconcile/analytics/A-B. Copy channel-autopilot's dynamic pattern; later tokens only in Neon.
2. Upload metadata per channel: AI disclosure `containsSyntheticMedia` (set NOWHERE — compliance), `categoryId` (hardcoded '27' ×6), language ('en' ×6).
3. Doc voice + rate per channel (every channel's docs fall back to `en-US-AndrewNeural`, `lib/doc-storybook.mjs:49,82`) — templated-sameness risk.
4. Music: approved pool (`yt-brands/approved-music.json`, 4 slugs only) and `musicFeels` (generated but dropped on save).
5. `longSlot`, clips per doc / per day / pick count (`shorts-clips.mjs:94,117,410`).
6. Script style (`kit.script`) and advanced wording (authority/keyword/kwShort/theme) — API already accepts, no form fields.
7. Social: per-channel × per-platform toggles replacing the global `PLATFORMS_PAUSED`; delete `FB_DESTINATIONS` (`lib/registry.mjs:21-26`) so panel destinations win.
8. Park/unpark (`active`) toggle; explicit per-channel "require review" switch.
9. Studio hardcoded lists → registry: `site-data.js BRAND_META` (~8 pages), `nav.js PINNED_CHANNELS` (stale), `thumbs/page.js DEFAULT_CHANNELS`, `terms` route, Threads handle, badges ("16", "3").
10. Real Settings page: CI Doctor stale hours, reminder hours, alert topic and toggles (today React-state only), quota model row (today "edit the DB by hand"); route TTS and clip-titling through ai-adapter so the Providers panel actually controls them.

Plus hardcoded per-channel maps to retire: `LEGACY_SLUGS` (sweeper, longform), longform-upload/make-longform maps, `yt-daily.mjs:431` off-niche regex, `fb-crosspost.mjs:23-28`, `yt-unfunnel.mjs:18`, oauth-*.mjs alias maps, `build-music-menu.mjs:44-47`, `tiktok-clips.mjs:20`, `poster-factory.mjs:63`; three duplicated kit stores (`yt-brands/brands.mjs`, `lib/brands.json`, `studio/lib/brands.json`).

### 1c. Target panel information architecture

- **Fleet** (replaces `/`, `/channels`, `/production`): one table, every registry channel incl. broken/parked — status, token health, last upload, next slot, clip queue depth, open warnings, today's quota, last run (link); bulk pause/resume/force-doc/produce/re-check.
- **Channel detail** `/channels/[slug]` tabs: Profile & kit · Voice & music · Schedule & cadence · Upload metadata & disclosure · Templates & review · Destinations (per platform) · Thumbnails · Topics · Clip queue · Runs · Audit.
- **Runs**: dispatch returns a run id; list, logs link, retry/resume.
- **Inbox**: Review + Warnings + template Drafts with live counts.
- **Quota & cost**: YouTube buckets, AI spend, Actions minutes, Neon CU-hours.
- **Settings**: team, sessions, real notification prefs, alert thresholds, integrations status from live probes.
- **Audit**: per channel/actor with before/after.

Foundation the panel depends on: **Neon as the single source of truth** for registry, per-channel kit/cadence/state and tokens; the repo feed becomes a generated read-only mirror (or disappears). Without it every panel edit races CI commits.

## 2. Scaling — walls by channel count

| Wall | Hits at | Source |
|---|---|---|
| Actions $12 allowance | **already** (≈$18.6/mo at 4); ~$42 at 10, ~$108 at 30, ~$207 at 60 GitHub-hosted | measured job timings |
| Artifact storage 500 MB | already (1.77 GB); ~1.3 GB/channel at steady state | actions/artifacts API |
| Neon Free 100 CU-h/mo (suspends compute) | ~25–35 channels (estimate) | neon.com/docs/introduction/plans |
| YouTube shared 10k units (comments 50, thumbnails 50, captions.insert 400) | **~48 channels** (captions ≈80% of a doc) | developers.google.com/youtube/v3/determine_quota_cost |
| YouTube insert bucket 100/day | ~50 (clustered doc days) – 77 | revision history 2026-06-01 |
| search.list 100/day | ~90 | trend-research stops at ≥3 hits |
| GitHub repo secrets 100 | ~64 channels | 52 used, 16 YT_TOKEN_* |
| Git state push race | regular at 30+ (single-shot push `|| true`) | channel-autopilot.yml:252-258 |
| Review gate human time | ~8 h/week at 30 gated channels | 12 MR jobs held since 11-02 |

Notes: multiple GCP projects to add quota is prohibited "sharding"; the legit
path is the free quota-extension audit (file at ~40 channels). Vercel Hobby
is non-commercial; Blob locks for 30 days at 1 GB and `deleteExpired` is never
called.

## 3. Python + LangGraph (summary of the dedicated research)

Verdict **GO as a strangler-fig migration, not a rewrite**. `services/ai`
already runs `langgraph==1.2.20` (`bot/graph.py`, draft → review → repair →
shape, no checkpointer/interrupt yet). End state: Python/LangGraph is the
control plane (content graph, agents, platform adapters, scheduling via a
Postgres queue); Node keeps the renderer (Remotion/FFmpeg — no Python
equivalent) and the Next.js Studio. Uploads, quota, idempotency, rendering and
media QC stay deterministic code — never LLM-decided (LangGraph re-runs a step
on resume). Phases: 1 content graph for MR docs in shadow mode with a Neon
checkpointer; 2 review gate as a LangGraph interrupt; 3 scheduler/queue;
4 platform-adapter layer (Meta first, Graph v25); 5 port the YouTube uploader
only behind a parity suite; 6 TikTok/Pinterest/LinkedIn/podcast/X; 7 retire
Node orchestrators lane by lane. Cost ≈ $0 for phases 1–2 (free LLM tiers);
skip paid LangGraph Platform. Platform gates to start early: TikTok audit
(posts private until approved), Pinterest Standard, Meta v25 app, LinkedIn
CMA; X now charges per post.

## 4. One combined order (each step its own approval, pilot on money-rulebook)

| Stage | What | Why first |
|---|---|---|
| A (now) | Actions budget: payment method/limit and/or self-hosted runner; artifact cleanup + docs to Releases; push retry; spread crons | production blocks ~day 19 |
| B | Panel correctness bugs 1a #2–#10 | panel must be trustworthy before it controls more |
| C | **Neon single source of truth** (registry, kit/cadence/state, tokens) + dynamic token resolution in all workflows | foundation for panel control, scaling and the Python control plane alike |
| D | Fleet table + Channel detail tabs exposing the 1b settings; Runs; real Settings | the owner's "everything from the panel" |
| E | Python content graph (shadow → switch) + review interrupt, money-rulebook first | agentic direction, $0 |
| F | Postgres job queue + runner boxes; per-bucket quota scheduler; quota audit at ~40 | 30–60 channels |
| G | Platform adapters (Meta first), then TikTok/Pinterest/LinkedIn/podcast | beyond YouTube |

## 5. Owner decisions

1. Actions budget: payment method + spending limit now, self-hosted runner, or both?
2. Approve Neon as the single source of truth (repo JSON becomes a generated mirror)?
3. Panel order: correctness bugs (B) before new screens (D)?
4. Python end state: Python control plane + Node renderer + Next.js Studio (not a Studio rewrite)?
5. Shadow-mode length before the money-rulebook switch (1 or 2 weeks)?
6. Platform order after YouTube (Meta first recommended); X at per-post pricing?
7. Start long-lead platform approvals now (TikTok audit, Pinterest Standard, Meta v25 app, LinkedIn)?
8. Doc captions (captions.insert = 400 units, 80% of a doc's quota): keep on every doc or make selective?

Correction to a review claim: the "Testing consent screen 7-day expiry" cause
of the fleet 401s is ruled out — the owner confirmed the OAuth app is already
"In production" (2026-11-15).
