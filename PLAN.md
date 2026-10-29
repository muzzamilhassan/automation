# QUARRY MASTER PLAN SHEET

> **RULES (permanent — do not edit this block):**
> 1. The assistant (ZCode) may ONLY ADD lines to this sheet, or tick checkboxes / mark DONE dates.
> 2. The assistant must NEVER delete or rewrite a line. Only the owner (Muzzamil) deletes lines manually.
> 3. Every finished task gets ✅ + date. Everything wanted in the future goes under TODO, even if far away.
> 4. This sheet is the single source of truth for project goals. Keep it in mind every session.

---

## ✅ DONE (completed — historical record, never delete)

- [x] 2026-10-29 — P30 Phase 2 (BYOK vault v2 + capability registry + cost dashboard) COMPLETE: issue #104 closed with full evidence. 9 tasks + fix rounds, 291/291 suite, Studio deployed. Proven live: owner's routing clicks → Neon + audit; production run 40754677165 routed script-gen to Groq (1,757 tok measured) → usage_events row → doc rendered → clips → Short published (trlFeAIJD0o). Final whole-branch review: CLOSE AFTER FIXES → fix wave 637fd21 verified. AC-P2-1..10 closed (AC-P2-6 literal-mapping + 3 inherited deviations recorded in #104 close-out). Phase 3 (RAG brain) spec ready to draft on owner go.
- [x] 2026-10-28 — P30 Phase 1 (template registry MVP) COMPLETE: registry live in Neon (7 families), Studio catalog/assign UI deployed, enforce-mode preflight proven in production runs 40513702449/40633443960, validator gates verified live, exit gate passed (template #7 added data-only, sync 1-of-7). Evidence: issue #102 close-out comment. Pending: AC-13 render artifact via Oct 29 00:05 UTC cron (automatic follow-up comment).
- [x] 2026-08/09 — 4 brand channels LIVE (Quote Quarry, Investor's Compass, Money Rulebook, Debt-Free Doctrine), 3 Shorts/day each via CI
- [x] 2026-09-07 — Script brain 5-layer chain (Gemini flash-lite → Groq → Cerebras → Mistral → HuggingFace)
- [x] 2026-09-08 — Music engine LIVE (incompetech rotation, per-brand moods, credits auto-appended)
- [x] 2026-09-08 — NTFY phone alerts (reports + healing + recycle-needed pushes)
- [x] 2026-09-12 — Competitor scan applied (ranking tags + authority titles + psychology theme bank)
- [x] 2026-09-12 — Long-video documentary script engine tested (8-12 min, Paulson case study)
- [x] 2026-09-13 — Daily Excel report with ALL channels + Video Views sheet (under-1K in red), sent to phone
- [x] 2026-09-13 — Sweeper rewritten for the 4 live channels (heals missing reels + token identity guard)
- [x] 2026-09-13 — All 4 channel tokens renewed after Sep-12 breakage; secrets re-pushed; all green
- [x] 2026-09-13 — Recycler built: quota-skip slot re-uploads the channel's oldest under-1K Short as-is (same file/title/description/tags/thumbnail)
- [x] 2026-09-13 — First real recycle cycle completed (Money Rulebook: old 6-view copy hidden → deleted by sweeper)
- [x] 2026-09-14 — ARCHIVE PLAN: every new render stored as GitHub Release asset (archive-YYYY-MM) — recycler downloads from GitHub, never YouTube (CI proven)
- [x] 2026-09-14 — Archive seeded: 52 old under-1K Shorts stored (all 4 channels)
- [x] 2026-09-14 — 7-day minimum age rule for recycles (fresh videos get time to grow)
- [x] 2026-09-14 — Safe re-run guard: max 1 recycle per channel per day
- [x] 2026-09-14 — Double production FIXED: local 2pm automation disabled; run-all-channels.mjs is a topup helper only (git pull first); CI is the only production master
- [x] 2026-09-14 — Legacy 5-brand stack deleted (content-machine, self-heal, run-content-machine, old PDF reporting, wf-*.json)
- [x] 2026-09-14 — Deep roadmap research saved (research/roadmap-2026-09-14.md)

## 🔄 IN PROGRESS

- [~] TikTok "Quarry Studio" own-app approval (multi-brand publishing product; site + audit kit ready)
- [~] Archive keeps growing automatically (every new render is stored; no action needed)
- [~] 2026-10-26 — P30-0 Platform Own-30 Phase 0 (stabilize): ✅ consent screen → In production (2026-10-26); ✅ main-channel YOUTUBE_REFRESH_TOKEN re-authed (QuoteQuarry @quotequarry302, secret set + token verified live 2026-10-26; final confirmation = next sweeper run's long-form check passes). Remaining: MCP-server credential rotation workbox (deferred); #101 rollout (in-flight lane). F2/F5 already fixed by #41-#73 wave; youtube.readonly already in OAuth wizard (verified 2026-10-26)

## 📌 TODO (agreed future work — pick by number when ready)

- [ ] P30 — Platform Own-30 build (owner approved 2026-10-26, max 30 channels, scale-ready): master plan at docs/superpowers/plans/2026-10-25-platform-own30-master.md — Phase 1 template registry → Phase 2 BYOK vault v2 + usage ledger → Phase 3 RAG sidecar (pgvector /context + variation gate) → Phase 4 pipeline hardening + admin completeness → Phase 5 catalog to 30+ templates + thumbnails → Phase 6 scale-out to 30 channels + Cloud Run render. Each phase: EARS spec → owner approval → task plan → build → QA evidence. Research basis: research/platform-*-2026-10-24.md + research/own-portfolio-30-channels-2026-10-25.md

- [ ] T1 — Fix FB photo bug: execFileSync not imported in yt-daily.mjs (FB frame-post feature is silently dead) — 10 min
- [ ] T2 — ⭐ LONG-FORM documentaries: 1 per week per finance brand (IC/MR/DFD) using the existing long-video engine — finance RPM $4-20 vs Shorts $0.01-0.07 — ~1 day
- [ ] T3 — Telegram funnel: free bot API, auto-post each Reel + poster per brand; doubles as backup alerts — ~half day
- [ ] T4 — Community posts: 1 auto post/day per channel (reuse FB posters as quote cards); Communities now open to all channels — ~half day
- [ ] T5 — Auto-dubbing ON: verify in Studio settings for all 4 channels (free international reach) — 15 min
- [ ] T6 — "Hype this 🚀" line added to pinned comments (all channels qualify, under 500K subs) — 10 min
- [ ] T7 — CI caching: Kokoro model + node_modules (saves ~4 min per channel run) — ~half day
- [ ] T8 — NTFY action buttons (e.g. "Run recycle" button on the phone push) — ~half day
- [ ] T9 — Excel report: add Recycle/Heal log sheet + weekly per-channel growth sheet — ~half day
- [ ] T10 — Playlist SEO: auto-create per-theme playlists per channel — ~half day
- [ ] T11 — Trend-triggered slot: if trend research shows a spike, swap that day's slot-3 theme — ~half day
- [ ] T12 — Music: lock pool to your approved picks (waiting for your menu selections) + no track twice in one day — 30 min after picks
- [ ] T13 — Weekly archive top-up: auto-seed 5 oldest under-1K per channel every Sunday — ~half day
- [ ] T14 — Title A/B on recycles: recycled copy gets a title variant (not identical) — ~half day
- [ ] T15 — Re-enable daily long-form compilation workflow (currently disabled in GitHub UI — confirm wanted) — 5 min
- [ ] T16 — Split schedule-state.json into per-channel files (ends merge conflicts) — ~half day
- [ ] T17 — Monthly competitor scan re-run with auto theme-bank refresh — ~half day
- [ ] T18 — Quarry Studio dashboard deployed to the cloud (currently localhost only) — ~1 day

## 🔒 BLOCKED (waiting on you or a third party)

- [!] B1 — Affiliate links on uploads (needs: your Payoneer KYC + ClickBank/Digistore24 signups)
- [!] B2 — Pinterest auto-posting (needs: your Connect-app OAuth, code already wired)
- [!] B3 — TikTok posting (needs: Google Play "Quarry Studio" app approval)
- [!] B4 — Blog + AdSense (needs: domain purchase ~$10/yr with international card)
- [!] B5 — IC channel re-auth for the long-video engine (browser consent step)

## 💡 IDEAS (researched, not yet agreed — nothing here is promised)

- [ ] I1 — 15-channel expansion: wire 2-3 dummy channels (1 slot/day each) after a clean production week; put new channels on separate Google accounts (single-email risk)
- [ ] I2 — Episode/documentary series per brand (deeper than T2 weekly format)
- [ ] I3 — YouTube "Hype" paid promotion experiments when it opens fully in 2026
- [ ] I4 — Comment auto-features (auto-heart, template replies) — needs advanced-features unlock
- [ ] I5 — Digital product (e-book/course) sold via the finance brands' link slots
- [ ] I6 — A/B titles on new uploads (not just recycles) if YouTube Test & Compare exposes an API

---

*Last updated: 2026-09-14. Append-only per RULES. Owner: Muzzamil.*
> 5. A companion PLAN.xlsx is generated from this file by `node plan-sheet.mjs` — regenerate it after every PLAN.md update. Never hand-edit the xlsx.
