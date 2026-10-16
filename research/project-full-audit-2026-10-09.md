# FULL PROJECT AUDIT — 2026-10-09

Scope: whole `automation` repo (features, GitHub Actions health, API/credential inventory).
Method: 3 parallel repo sweeps (workflows, APIs/env, feature structure) + live GitHub evidence (`gh run list`, `gh api`, `gh secret list`, run logs) + state-file checks. READ-ONLY — nothing pushed, nothing changed.

---

## 0. TL;DR numbers

| What | Count |
|---|---|
| GitHub Actions workflows | 16 files (15 active, 1 disabled manually) |
| External APIs/providers wired and working in production | 26 |
| APIs that exist (code+key present) but are OFF / sleeping | 9 |
| APIs that must be newly created for planned features | 0 — all planned features use existing APIs; only credentials/approvals are missing |
| GitHub secrets configured | 54 |
| Active incidents found | 4 (+1 expiring token) |
| YouTube channel tokens held | 15 brands (4 producing daily, 11 dormant, 1 wizard channel paused) |

---

## 1. ACTIVE INCIDENTS (verified with logs/state, not guesses)

### 1.1 TikTok posting — HARD DOWN, 18/18 failures (P0)
- `tiktok-post.yml` (4 slots/day) failed every run for the whole week (Oct 2–8), each dying in 30–70s.
- Root cause (from failed-run log): `longvideo/tiktok-clips.mjs` does `import ... from './zernio-tiktok-publisher.mjs'` but that file lives at repo ROOT → `ERR_MODULE_NOT_FOUND: Cannot find module '/home/runner/work/automation/automation/longvideo/zernio-tiktok-publisher.mjs' … Did you mean to import "../zernio-tiktok-publisher.mjs"?`
- Fix: one-line import path change (or move the file into longvideo/). Zernio API key itself is fine — the process never reaches the API call.
- Impact: 0 Quote Quarry TikTok posts all week; clip queue keeps growing unposted.

### 1.2 Quote Quarry zero runs Oct 6–8 — ✅ CORRECTED: intentional (owner pause), NOT a bug
- CORRECTION (after owner clarified + commit evidence 33e1182, Oct 5 23:25): the Oct-1 Feed-Collapse Recovery plan (owner-approved) set `pausedUntil: 2026-10-08` in schedule-state AND **disabled the QQ workflow + quarry-render longform via GitHub API**. That is why there are zero run rows Oct 6–8. The sweeper's "not healing" was CORRECT behavior (it respects pausedUntil).
- The workflow is now re-enabled (state `active`; "7-day clean test starts auto on Oct 8"). No run has fired yet since re-enable. First expected cron window: ~13:30–15:00 PKT Oct 9 (cron 02:13 UTC + GitHub's 4–8h delay). **If nothing fires by evening Oct 9 → manual dispatch needed.**
- Residual note: CI Doctor still has no "workflow never ran" check (real gap, kept on the upgrade list).
- YouTube ground truth: QQ published 2 leftover scheduled videos during the window (Oct 6 05:15, Oct 9 00:27) — scheduled before the pause landed. Otherwise dark as intended.

### 1.3 Channel Autopilot — failed Oct 8 on fajrofquran; fix already pushed (P1, verify)
- Scheduled run Oct 8 09:23 failed in the `fajrofquran` matrix job: missing-secret guard emitted `::error::secret … is missing — connect the channel in Studio first` and GitHub rejected the env format.
- fajrofquran is registered in `yt-mcp/studio-channels.json` with `autopilot: False` (owner-paused, per the activation-consent design in 72adace) — but the Oct 8 code still scheduled it. Commit dcfc2a7 (Oct 8 23:29) says "autopilot discovery respects autopilot flag" — pushed AFTER the failure. **Next cron (02:33 UTC) should skip it; verify tomorrow.**

### 1.4 reporting-daily.yml — escaped `${{ }}` breaks Monday FB dedupe (P1)
- Lines ~58/60 contain literal backslash-escapes: `if: \${{ github.event.schedule != '' }}` and `FB_PAGE_TOKEN: \${{ secrets.FB_PAGE_TOKEN }}` (verified as real bytes via `cat -A`).
- Effect: Monday `fb-dedupe --apply` step is broken/disabled; if the env expression ever evaluated it would pass a backslash-prefixed token. Duplicate reels are not being auto-cleaned on Mondays.

### 1.5 Threads token expires ~Oct 29 (P1, time-boxed)
- `threads-daily.mjs` posts 1 QQ reel/day (inside `ig-slot-poster.yml`, 18/22 success this week). Token via `THREADS_TOKEN_JSON`, valid ~Oct 29. Refresh window is now; ~20 days left.

### 1.6 Smaller warnings
- The Oct 8 `gateRejected` entries were **Shorts** (IC 23:35, DFD 00:35 slots), rejected by the duplicate-title gate ("Warren Buffett's Unbroken Rule" ≈ "…Ultimate Rule" from Oct 5) — gate worked as designed, but nothing retried them (sweeper can't heal IC/MR — see 1.7) → IC and MR published ZERO shorts Oct 7–8.
- GitHub runners emit "Node.js 20 deprecated, forced to Node 24" warnings (actions/checkout@v4, cache@v4, setup-node@v4).
- `.env` has duplicate keys (`GEMINI_API_KEY` ×2, `TIKTOK_CLIENT_SECRET` ×2) — last entry silently wins.
- Studio session signing falls back to literal `'quarry-connect'` as HMAC key if `STUDIO_PASSWORD` and `YOUTUBE_CLIENT_SECRET` are unset (weak default; Vercel presumably sets STUDIO_PASSWORD — confirm).

### 1.7 NEW findings from the Oct 9 follow-up (cadence + "3-day stop" verification)
1. **IC handle mismatch breaks sweeper healing**: brands.mjs expects `@InvestorsCompass-c7h`, but the real channel (token-verified) is `@investorscompasshq` → sweeper refuses IC ("token points at @investorscompasshq but @InvestorsCompass-c7h expected"). Fix = 1-line handle update. Also `yt-mcp/channels/escrow-estate/token.json` is actually a COPY of the IC token (same channel returned) — needs real re-auth before activating Escrow Estate.
2. **MR sweeper auth broken**: "[money-rulebook] sweep failed: invalid authentication credentials" → sweeper cannot verify/heal MR at all (daily upload workflow still works). Needs token refresh.
3. **Live duplicate videos still public** (pre-Oct-5, before the dup gate existed): Money Rulebook has "6 Rules For Your First $10,000" published 4× (Oct 4 16:35, Oct 5 00:05, 12:35, 16:35); Quote Quarry has "Stop Begging For Respect" 3× (Oct 4 22:35, Oct 5 11:35, 22:35). Cleanup decision needed (keep-oldest delete, like the Oct-3 purge).
4. **No-music window Oct 3–7**: 1a48957 (Oct 7) reveals APPROVED_MUSIC was undefined since the Oct-3 music-lock → daily shorts rendered with NO MUSIC for ~5 days on all channels. Fixed Oct 7; the live videos from that window are silent-background.
5. **Old Money Code YouTube rename still pending**: channel title still "Debt-Free Doctrine", handle @debtfreedoctrine (API can't rename; owner manual step from the 10-03 rebrand).
6. **Dormant channels' LOCAL tokens all dead** (`invalid_grant` on all 11 kit channels in yt-mcp/channels/) — the GitHub YT_TOKEN_* secrets may still work but are untested. Re-auth needed per channel before activation.
7. **Cadence actuals (YouTube public data, Oct 6–9)**: QQ dark by design except 2 leftovers; IC zero Oct 7–8; MR zero Oct 7–8 then Oct 9 00:30; **Old Money Code never stopped** (3 videos Oct 7, 1 Oct 8). The 1/day cadence only became real with the Oct 8 runs (8030cae landed Oct 7 22:23 UTC). Weekly docs (docDay) first attempts: MR Thu Oct 9, OMC Fri Oct 10, QQ Tue Oct 13, IC Wed Oct 14 — quarry-render longform stays off by design (8030cae: yt-deepdive = sole doc producer).

---

## 2. FEATURE INVENTORY

### 2.1 LIVE — producing daily (dynamic)
| Feature | Engine | Evidence (7-day health) |
|---|---|---|
| 3 Shorts/day × IC, MR, DFD(Old Money Code) | channel-*.yml → channel-pipeline.mjs → yt-daily → youtube-engine | 7/7 success each |
| Research-led topics + viewer search terms | trend-research.mjs + viewer-terms.mjs (Analytics API) | in daily runs |
| Deep-dive long-form episodes (DocV2) | yt-deepdive.mjs, weekly docDay guard | inside daily runs (2 gate-rejections Oct 8) |
| Thumbnails (How-Dev-Works photo-poster style) | thumbnails/poster-factory | inside daily runs |
| Music (locked approved pools) | music-engine.mjs + yt-brands/approved-music.json | QQ 25 / IC 33 / MR 19 / DFD 27 tracks |
| FB Reels + FB poster images | channel-pipeline → fb-crosspost / fb-images (fb-variant = native re-render) | inside daily runs |
| IG Reels 3 slots/day (7:20/11:20/18:20 ET) | ig-slot-poster.yml → ig-crosspost.mjs | 18/22 success |
| Threads 1 QQ reel/day | threads-daily.mjs | same workflow |
| Nightly self-heal sweeper 20:15 UTC | daily-sweeper.yml → sweeper.mjs | 7/7 (but missed QQ gap — see 1.2) |
| CI Doctor 3×/day + YAML check + issue creation | ci-doctor.yml → ci-doctor.mjs | 20/21 |
| Daily/weekly/monthly Excel reports + ntfy push 16:45 UTC | reporting-daily.yml → daily-excel-report.mjs | 7/7 |
| daily.dev digest 00:45 UTC → ntfy | daily-dev-digest.yml → daily-dev-digest.mjs | 7/7 (token IS live now) |
| Upload validation gates (duration/title/duplicate, fail-closed) | lib/dup-gate.mjs etc. | working (rejected 2 episodes Oct 8) |
| Quarry Studio (Next.js on Vercel) — dashboard, GitHub-dispatch buttons, analytics, Topic Desk, Add-Channel wizard, RBAC (Google login), audit log, sessions, autopilot ON/OFF + consent step | studio/ (18 API routes) | deployed; wizard channels registry = fajrofquran only |

### 2.2 FROZEN BY DESIGN (static on purpose — working, not evolving)
- **Music**: locked to user-approved pools only (104 tracks total); longform loops one track (`-stream_loop -1`).
- **Thumbnail style**: How-Dev-Works photo-poster, locked; 34 old videos backfilled.
- **Brand set**: 15 brands defined in `yt-brands/brands.mjs`, only 4 `active: true`.
- **Slots**: US-anchored ET prime-time (slot 3 = money slot); FB mirrors YT slots.
- **Activation consent**: new wizard channels start `autopilot: false`; publishing requires explicit Review & Start consent (YouTube API policy compliance, commit 72adace).
- **Script brain order**: Gemini → Groq → Cerebras → Mistral → HF (fixed chain; known 429/403 blips ~1 channel/day — fix still awaiting go).

### 2.3 PAUSED / DORMANT (exist, not running)
| Thing | State | How to wake |
|---|---|---|
| weekly-compilation.yml (watch-hours compilations) | `disabled_manually` on GitHub | re-enable when decided |
| longform-daily.yml schedule | cron commented out (T15); upload moved to public `quarry-render` repo cron 20:30 UTC | longforms DO still publish daily via quarry-render |
| longform-upload.yml | emergency manual dispatch only (deliberate — old cron caused 8 duplicate uploads) | leave |
| **11 dormant brand tokens** — YT_TOKEN_AI_OBSERVER, CLOSING_TABLE, CORNER_OFFICE, DEEP_WORK_OS, ESCROW_ESTATE, FOUNDERS_MARGIN, IRON_DISCIPLINE, LONGEVITY_CODE, POLICY_BRIEF, SLEEP_ARCHITECT, TAX_SHIELD | secrets exist, channels onboarding-prepped, ZERO automation running on them | add to wizard registry / brand registry `active:true` + autopilot consent |
| fajrofquran (wizard channel) | connected, `autopilot: false`, owner-paused | Resume in Studio |
| Pinterest | code live (pinterest-publisher.mjs), APP_ID in .env+secrets; MISSING app secret + access token; no workflow calls it | user completes OAuth (port 3003 tunnel step) |
| TikTok direct Content Posting API | keys in .env + quarry-studio-server.mjs local server; production uses Zernio instead | wire or retire |
| Agnes AI | key in .env, demo scripts only (demos/agnes-thumbs) | decide on production use |
| Bluesky | researched, user said do NOT integrate | — |

### 2.4 MANUAL-ONLY tools (fine, but no automation)
oauth-one.mjs / oauth-reauth*.mjs (re-auth), add-yt-channel.mjs, competitor-scan.mjs (manual), plan-sheet.mjs, studio-checklist.mjs (port 3000), quarry-studio-server.mjs (port 8787 TikTok OAuth), build-music-menu.mjs + download-review-audio.mjs, yt-unfunnel.mjs (one-off done), tiktok-brand-kit.mjs, watch-runs.sh, register-fonts-windows.mjs.

### 2.5 STALE / BROKEN housekeeping
- `package.json`: `"main": run-content-machine.mjs` and scripts `start`, `text-posts` point to DELETED files → `npm start` errors.
- `PLAN.md`: last updated 09-14 — misses everything after (Studio wizard, RBAC, Topic Desk, activation consent, dup cleanup, rebrand, unfunnel, DFD→Old Money Code).
- 11 root `ccm-*.js` files (quote-card mini-pipeline) referenced by no workflow — legacy orphans.
- Untracked clutter: demos/, cloud-demos/, explainer demo artifacts, .playwright-mcp/, logs (mr-backfill.log, oauth-*.log), old-style-sw-*.mp4, zaccounts-tmp.json / zp2.json / zposts-tmp.json.
- docker-compose stack (Postiz/n8n/Ollama/faster-whisper) = legacy backup only (user is cloud-only).

### 2.6 Local-experiment folders (not production)
explainer/ (Remotion demos: psych/vox/tech/teacher), longvideo/ demos (make-demo, make3, storyboard), cloud-demos/ (v2–v7 QA iterations), demos/agnes-thumbs.

---

## 3. API / SERVICE INVENTORY (the full map)

### 3.1 WORKING in production — 26
| # | API / service | Used for | Credential | Evidence |
|---|---|---|---|---|
| 1 | YouTube Data API v3 | upload/schedule/search/thumbnails/channels | OAuth per-channel (YT_TOKEN_* / refresh token) | daily uploads all 4 |
| 2 | YouTube Analytics API | reports, studio analytics, viewer search terms | same OAuth | reports 7/7 |
| 3 | Google OAuth2 | token refresh all flows | client id/secret | daily |
| 4 | Gemini (generativelanguage) | script brain L1, captions, clip queries, longvideo scripts | GEMINI_API_KEY / LONGVIDEO_GEMINI_API_KEY | daily (403 blips known) |
| 5 | Groq | script brain L2, longvideo | GROQ_API_KEY / LONGVIDEO_GROQ_API_KEY | daily (429 bursts known) |
| 6 | Cerebras | script brain L3 | CEREBRAS_API_KEY | daily |
| 7 | Mistral | script brain L4 | MISTRAL_API_KEY | daily |
| 8 | HuggingFace router | script brain L5, image fallback | HF_TOKEN | daily |
| 9 | Edge TTS (Microsoft, no key) | main narration voice per-brand | none | daily |
| 10 | Kokoro (local ONNX, no key) | alt TTS | none | in CI installs |
| 11 | OpenAI | TTS + Whisper (weekly-compilation/narrate.py) | OPENAI_API_KEY | wired; light use (compilation disabled) |
| 12 | Pixabay | 4K footage + photos | PIXABAY_API_KEY | daily |
| 13 | Pexels | longform b-roll photos | PEXELS_API_KEY | daily (quarry-render) |
| 14 | Pollinations (no key) | AI image fallback | none | on-demand |
| 15 | Meta Graph API — Facebook | Reels, poster images, dedupe, insights | FB_PAGE_TOKEN | daily |
| 16 | Instagram Graph (via FB token) | 3 reels/day | FB_PAGE_TOKEN | 18/22 |
| 17 | Threads API (graph.threads.net) | 1 reel/day | THREADS_TOKEN_JSON (expires ~Oct 29!) | daily |
| 18 | Zernio → TikTok | QQ shorts + clips auto-post | ZERNIO_API_KEY | key OK; pipeline broken (1.1) |
| 19 | incompetech (no key) | music catalog | none | daily |
| 20 | uguu.se (no key) | temp video hosting for IG/Threads | none | daily |
| 21 | ntfy.sh | phone push alerts | NTFY_TOPIC | daily |
| 22 | daily.dev | morning tech digest | DAILY_DEV_TOKEN | 7/7 |
| 23 | GitHub REST/Upload API | sweeper, archive releases, Studio dispatch | GITHUB_TOKEN / GITHUB_PAT / SECRET_WRITER_PAT | daily |
| 24 | Vercel | Studio hosting | platform | live |
| 25 | Neon Postgres | Studio DB (users, sessions, audit log) | DATABASE_URL | live |
| 26 | Google Sign-In (studio) | RBAC login | same Google client | live |

### 3.2 EXIST but OFF / sleeping — 9
| API | What exists | What's missing to turn ON |
|---|---|---|
| Pinterest v5 | publisher code + APP_ID (env+secret) | app secret + OAuth access token + a workflow/step that calls it (user action) |
| TikTok direct Content Posting API | keys in .env + local OAuth server | decision (Zernio already covers posting) |
| Agnes AI (OpenAI-compatible text+image+video) | key in .env, working demo thumbnails | decision + wiring |
| fal.ai | FAL_KEY secret exists | no code uses it — orphan |
| SenseNova | SENSENOVA_API_KEY in .env | no code — orphan |
| OpenAI images | OPENAI_IMG_KEY in .env | no code — orphan |
| Postiz (self-host) | docker stack + keys | RETIRED path (CCM deleted) |
| n8n (self-host) | docker stack + key | legacy backup only |
| Ollama / faster-whisper (local) | docker config | legacy backup only |

### 3.3 NEEDED for planned features — 0 new APIs to invent
Every planned feature uses an API that ALREADY EXISTS somewhere; only credentials/approvals/code-wiring are missing:
| Planned feature | API needed | Status of that API |
|---|---|---|
| Pinterest auto-pins | Pinterest v5 | exists; blocked on user OAuth completion |
| Telegram funnel (T3) | Telegram Bot API | exists (free); bot token NOT yet created — user must create via @BotFather |
| Affiliate income | PayPal/Payoneer/ClickBank/Digistore24 | exist; blocked on user KYC + signups |
| Blog + AdSense (Option 4) | AdSense | exists; blocked on domain purchase (~$10/yr) |
| Scale to 15 channels | YouTube Data API | exists; Dec-2025 quota = uploads own bucket ≈100/day, so scaling is cheap; each channel needs its own YT_TOKEN_<SLUG> (pattern proven, 15 tokens already held) |
| Better thumbnails (AI) | Agnes/fal/Pollinations | exist (see 3.2) |
| LinkedIn/X/etc. | — | nothing planned |

### 3.4 Credential census
- 54 GitHub secrets. Notables: 15 × YT_TOKEN_* (4 producing + 11 dormant + fajrofquran + old-money-code alongside legacy debt-free-doctrine token), YT_DLP_COOKIES (throwaway account for recycler downloads — path removed, kept), PINTEREST_APP_ID (incomplete set), FAL_KEY (orphan).
- Local .env: 41 names — includes orphans FAL_KEY, SENSENOVA_API_KEY, OPENAI_IMG_KEY; duplicates GEMINI_API_KEY, TIKTok_CLIENT_SECRET.
- STUDIO_PASSWORD exists only as Vercel env (correct), but code fallback chain ends at literal 'quarry-connect'.

---

## 4. UPGRADE LIST (priority order)

**P0 — broken now (fix on "go")**
1. TikTok import path fix (1 line) → posting resumes next slot.
2. Quote Quarry: manual dispatch + YAML validation + watch today's/tomorrow's cron; consider sweeper fix so a silently-dead workflow is caught within 24h (sweeper checks videos, but the QQ gap slipped through — needs a "lastRunDate older than 2 days → alert" rule).
3. reporting-daily.yml un-escape the two `\${{ }}` lines (Monday dedupe).
4. Verify Autopilot skips fajrofquran on next 02:33 UTC run (fix dcfc2a7 already pushed).

**P1 — expiring / compliance**
5. Threads token refresh before ~Oct 29.
6. Confirm IC/DFD Oct 8 gate-rejected episodes — re-run or accept.

**P2 — upgrades awaiting "go" (from earlier research, unchanged)**
7. Script-brain render failures (~1 channel/day, Groq 429 + Gemini 403) — hardening plan ready.
8. Premium audio upgrade: SFX + music ducking + loudnorm (biggest quality gap).
9. TikTok scheduledFor at US ET slots (posts currently fire ~4:40 AM ET dead zone).
10. FB recovery plan (native re-render rollout + dupe cleanup + page renames/seeding).
11. Structure audit 3 fixes (proof-of-publication alert — partially exists as verify-run; per-channel state files; CI Doctor "workflow never ran" check — see 1.2).
12. 11 dormant channels: decide activate (via Studio wizard + consent) or clean up their tokens.

**P3 — housekeeping**
13. PLAN.md refresh to 10-09 reality; fix package.json (main/start/text-posts); delete or archive ccm-*.js orphans; de-dup .env keys; clean untracked debris; bump actions to Node-24-safe versions; confirm STUDIO_PASSWORD set on Vercel.

---

## 5. Resumable commands (for the P0 fixes)
```bash
# TikTok fix (one line in longvideo/tiktok-clips.mjs):
#   ./zernio-tiktok-publisher.mjs  →  ../zernio-tiktok-publisher.mjs
gh workflow run tiktok-post.yml   # then watch
gh workflow run channel-quotequarry.yml   # prove QQ pipeline alive
gh run watch $(gh run list --workflow=channel-quotequarry.yml --limit 1 --json databaseId --jq '.[0].databaseId')
```
