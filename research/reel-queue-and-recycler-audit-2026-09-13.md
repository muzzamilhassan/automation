# Audit: Missed-Reel Queue (FIFO) + Low-View Recycler — 2026-09-13

Status: RESEARCH ONLY — no code changed yet. Awaiting user approval.

## 1. How reels get skipped today (the quota problem)

Flow: `.github/workflows/channel-<brand>.yml` → `channel-pipeline.mjs` → `yt-daily.mjs`.

- 4 live channels (quotequarry, investors-compass, money-rulebook, debt-free-doctrine) × 3 slots/day = **12 Shorts/day**. Each Short needs 1 AI script.
- Script brains tried in order (`youtube-engine.mjs:516` `generateYouTubeScript`):
  Gemini flash-lite → Groq gpt-oss-120b → Cerebras → Mistral → HuggingFace Llama (2 tries).
- Only when **all** brains fail does the script come back with `source: 'fallback'`.
  `yt-daily.mjs:94` then does: `SKIP — no AI script` and `continue`.
- **The skip is permanent.** No record, no retry. The state file still marks the day
  as done (`lastRunDate = today` at `yt-daily.mjs:148`), so nothing comes back for that slot.
- Observed skips: Sep 8 + Sep 9 in local CI logs (`ci-mc.log:749`, `ci-prev.log:707`).

## 2. Finding A — FIFO missed-reel queue (feasible: SMALL)

Design:

1. New file `yt-mcp/reel-queue.json` in the repo. Each skipped reel pushes:
   `{ slug, slotHHMM, theme, queuedAt, reason }`.
2. Next run, `yt-daily.mjs` drains the queue **before** producing today's reels
   (oldest first = FIFO). Drained items get fresh scripts + renders and today's free slots.
3. Housekeeping: drop items older than 7 days (user's 1-week rule), cap queue at ~12,
   cap drain at 2/day so theme rotation stays sane.

Why repo JSON and not Actions artifacts/cache: artifacts expire (90 days) and caches get
evicted; the CI already commits `yt-mcp/schedule-state.json` back after each run, so a
queue file in the repo is durable and free. **Required wiring change:** each
`channel-*.yml` "Commit publishing state" step must `git add yt-mcp/reel-queue.json` too.

Important: the queue stores the *intent*, not the video file — CI never keeps mp4s.
The remake is a fresh render with a fresh script on the same theme/slot. This is good
(fresh content, no storage problem).

## 3. Finding B — Recycle Shorts under 1,000 views (feasible: MEDIUM)

Design — new `yt-recycler.mjs`:

1. For each of the 4 channels (token pattern `YT_TOKEN_*`, same as `yt-daily.mjs:38`
   `channelAuth` and `daily-excel-report.mjs`): list last ~200 uploads,
   `videos.list(part=snippet,statistics)` → views per video.
2. Candidates: `views < 1000` AND `published > 7 days ago` (give new videos time to grow).
3. Pick worst 1 per channel per run. Re-make it: **same theme, fresh script, fresh render,
   new title** → upload to the next free slot.
4. After the replacement is live: set old video to **private** immediately, **delete** after
   24–48h safety window. Deletion uses `videos.delete`; existing tokens already have
   `youtube.force-ssl` scope (granted at onboarding, `add-yt-channel.mjs:31`), so **no re-auth needed**.
5. Log every action to `logs/posts-log.json` so reports show it.

Scheduling: 1 replacement per channel per week (or per day at most) — new weekly workflow
or folded into a rewritten sweeper.

Safety rules:

- **Never re-upload the identical mp4** — YouTube duplicate / inauthentic-content policy
  (July 2025 rules already force format rotation). Re-make, don't re-post.
- Delete only AFTER the new video is confirmed live; private-first as a safety net.
- Deleting a <1k-view Short costs almost nothing: its views leave the 90-day Shorts
  monetization count, but that count needs millions, so the loss is noise.
- The remake writes an FB/IG outbox entry → it will cross-post as a new Reel.
  Old FB/IG copies stay (FB deletion possible later if wanted — recommend leaving them).

## 4. Other audit findings (bugs found during review)

| # | Finding | Where | Impact | Fix size |
|---|---------|-------|--------|----------|
| 1 | `execFileSync` used but never imported → FB image-from-video-frame step crashes silently on every run ("[fb-image] skipped: execFileSync is not defined"). Feature is dead code. | `yt-daily.mjs:134` vs import at `:9` | FB gets no photo posts from this path | 1 line |
| 2 | Sweeper is stale: checks ONE channel (old main OAuth token) and re-runs `run-content-machine.mjs` = the OLD 5-page flow (Silent Wealth / Strategic Silence / Eon Ventures / Reliq North / Boundaries Club). It knows nothing about the 4 current channels, can't heal their missed reels, and still runs daily at 01:15 PKT (`daily-sweeper.yml`). | `sweeper.mjs` + `daily-sweeper.yml` | False self-healing; wasted runs; missed reels never healed same-day | rewrite or retire |
| 3 | Reporting per-video stats cover only the old main channel: `collect.mjs` uses single `YOUTUBE_REFRESH_TOKEN` with `mine: true`, last 50 uploads. The 4 live channels' per-video view data is NOT in daily/weekly report deltas (the new Excel report does cover all channels). | `reporting/collect.mjs:18-66` | Reports undercount live channels | medium |
| 4 | Off-niche regeneration burns up to 2 extra script calls per Short *before* the fallback skip check — wasted quota exactly when quota is the problem. | `yt-daily.mjs:90-94` | small quota waste | small |
| 5 | FB pageId map hardcoded inside yt-daily loop (duplicated from brands config). | `yt-daily.mjs:124` | maintenance smell | small |

## 5. Proposed build order (after approval)

1. Fix bug #1 (1-line) + wire queue file into workflow commits.
2. Missed-reel queue (FIFO) in `yt-daily.mjs` — small.
3. Low-view recycler `yt-recycler.mjs` + weekly workflow — medium.
4. Sweeper: retire or rewrite for the 4 current channels (user decision).
5. Reporting scope (finding #3): separate decision, not needed for A or B.

All of it runs on existing free quotas and tokens. Cost: $0.

---

## 6. APPROVED-FOR-REVIEW DESIGN: FIFO missed-reel queue (2026-09-13)

**File:** `yt-mcp/reel-queue.json` (committed back to repo by CI, like schedule-state.json).

**Ticket shape:**
```json
{ "slug": "money-rulebook", "theme": "money rules by age 30", "queuedAt": "2026-09-13", "reason": "script-fallback" }
```
Ticket = intent only (theme + channel + date). No video files. Remake is a fresh render.

**Write path** (`yt-daily.mjs`, where `source === 'fallback'` skip happens):
- push ticket, keep going; state write unchanged; queue saved with the state file.

**Drain path** (start of `RUN_SHORTS` in `yt-daily.mjs`, before the normal slot loop):
1. Load queue, filter: keep tickets for this slug; drop `queuedAt` older than 7 days (log drops).
2. `drainN = min(2, queue.length, slots.length)` — oldest first.
3. Slots 0..drainN-1 render the queued themes (fresh script — off-niche check + regen applies).
4. Remaining slots run the normal date-rotated themes.
5. If a drained ticket's script fails AGAIN (fallback): ticket stays in queue (no render happened — fail happens before render), slot is skipped as today.
6. Produced tickets are removed from the queue; queue written back; CI commit step picks it up.

**Caps:** max 2 drained per channel per day (1 fresh theme minimum still goes out); queue trimmed to newest 6 per slug.

**Wiring:** each `channel-*.yml` "Commit publishing state" step: add `yt-mcp/reel-queue.json` to `git add`.
Channels run at staggered crons, so write races are unlikely; a lost write self-corrects (ticket re-added on next skip or lost once — acceptable).

**Interplay:**
- Sweeper `--topup` does NOT drain the queue (v1) — heal makes fresh reels; queue drains in the once-daily morning run only. Can combine later.
- Queue reels are normal yt-daily productions → FB/IG outbox + cross-post + thumbnail + pinned comment all automatic.
- `lastRunDate` guard unchanged → no double-posting; drain happens inside the normal once-daily run.

**Testing plan:**
1. Local: syntax + logic; seed a test ticket locally, confirm drain logic picks it first (no upload — test the selection function in isolation).
2. Live: seed 1 real ticket (real theme from the brand's bank) for ONE channel → trigger its workflow → confirm CI log shows "queue: draining ticket from <date>" and the ticket disappears from the committed file.
3. Rollback: empty the queue file / revert commit; production unchanged.

**Optional extras (say yes/no):**
- Daily report line: "Queue: N reels waiting" per channel.
- Ride-along 1-line fix: `execFileSync` import bug (FB photo posts currently dead).

---

## 7. RECycler BUILD STATUS (2026-09-13 ~03:30 PKT)

**Built + working locally:** `yt-recycle.mjs` (oldest-first scan → public Short <61s <1K views →
yt-dlp download → same-metadata re-upload into the missed slot → hide old → pending entry).
- Local live proof: money-rulebook cbclwL6k32U (6 views) → hM3fDm1jR0k scheduled 2026-09-13T12:35Z,
  old copy private, pending delete recorded in schedule-state.json.
- Sweeper deletes the old copy the night after the copy goes live (max 3/night); restores old
  to public if the new copy gets rejected.
- yt-daily fallback-skip path wired; recycled videos are YouTube-only (no FB/IG outbox).
- googleapis quirk: thumbnails.list missing in installed version → thumbnails now fetched from
  i.ytimg.com URLs BEFORE the old copy is hidden; thumbnails.set works.

**CI blocker (evidence: run 34722761908):** every yt-dlp attempt from GitHub's IP fails with
"Sign in to confirm you're not a bot" — YouTube's datacenter bot-wall, all player clients.
Downloads from the user's home IP work fine (proven). Options: A) cookies file secret
(throwaway Gmail recommended), B) bgutil PO-token provider sidecar, C) run recycles locally
when CI drops a ticket, D) archive new renders instead of downloading old ones.
