# Hermes Agent — Deep Fit Audit for the YouTube Automation Project

**Date:** 2026-09-30 · **Type:** READ-ONLY audit + research (no code changed, nothing committed)
**Question asked:** Where, why, when, and how should Hermes be used in this project?

---

## 1. What Hermes Agent is

Open-source, self-hosted AI agent by Nous Research ("the agent that grows with you"). It lives on
your own machine, remembers what it learns (persistent memory), creates its own skills, runs cron
jobs, and bridges to messaging apps (WhatsApp, Telegram, ntfy and more) so you can talk to it from
your phone. It can also register MCP tool servers (e.g. the yutu YouTube MCP with 74 tools).

- Repo: https://github.com/nousresearch/hermes-agent
- Docs: https://hermes-agent.nousresearch.com/
- Releases: https://github.com/NousResearch/hermes-agent/releases
- **Latest upstream: v0.21.5 (v2026.9.24)**, pushed ~Sep 24. v0.21.4 alone rolled up ~1,800 PRs.
  The project moves extremely fast (214k GitHub stars in 6 months).

## 2. Current state of OUR install (probed 2026-09-30, WSL Ubuntu)

| Item | State |
|---|---|
| Version | v0.21.0 (2026.8.31 build), git method, `/home/revnix/.hermes/hermes-agent` |
| Behind upstream | **7,819 commits** on main; latest tag v0.21.5 (Sep 24) — never ran `hermes update` |
| Gateway | **RUNNING right now** (started 21:11 PKT today, pid in `~/.hermes/gateway.pid`) |
| WhatsApp | Pairing was ATTEMPTED (session dir + allowed user 923055779207) but **LOGGED OUT** — bridge.log says "Delete session and restart to re-authenticate". Stays out on purpose: user rejected WhatsApp 09-08 (PK SMS fees + data-leak grounds) |
| ntfy bridge | **PAIRED + ACTIVE** — `channel_directory.json` (updated 09-28) has two ntfy DM channels (`hermes`, `hermes-muzzee-0995a62a`); real chat sessions Sep 27 (22:14) → Sep 28 (01:56). The user already talks to Hermes from the ntfy phone app |
| Cron jobs | **ZERO** — nothing automated inside Hermes yet |
| Skills | Only default bundled packs (devops, research, media, social-media, …). No custom quarry skills |
| MCP / yutu | No `mcp` section found in config.yaml — yutu NOT registered yet (re-check config key names after update) |
| gh CLI | **NOT installed in WSL** — needed for run-status / re-dispatch jobs |
| Node in WSL | v26.8.1 present |
| Brain | glm-5.3 via provider `zai` (user's own Z.ai key — same family as this session's model) |
| Backups of config | config.yaml.bak.20260907 / .bak.billing / .bak.fix-thinking exist |

## 3. What changed since the 09-07 proposal (why the old plan is now mostly obsolete)

The 09-07 proposal was: Hermes = ops cockpit + supervisor + human-in-the-loop (4 steps: update+pair
WhatsApp → CI watchdog → morning digest + yutu → FB approval gate). Three weeks later:

1. **Quarry Studio is LIVE on Vercel (09-29)** — analytics, channels, logs, music, production,
   settings, social, tasks, videos pages + dispatch API. The "cockpit" role is TAKEN.
2. **ntfy reporting pipeline is LIVE** — verify-run.mjs (publication proof → ntfy alert + exit 1),
   sweeper.mjs (daily-sweeper.yml), channel-pipeline.mjs, daily-excel-report.mjs (daily Excel to
   ntfy), daily-dev-digest.mjs, longvideo scripts. The "alert + digest" role is TAKEN — and it runs
   on GitHub Actions, i.e. 24/7 regardless of the laptop.
3. **WhatsApp was rejected (09-08)** — Hermes' best-known bridge is off the table by user decision.
   The user later paired the ntfy bridge themselves (09-27/28), which is the right substitute.
4. **Cloud-only rule stands** — everything critical must run on GitHub Actions. Hermes is
   laptop-local: laptop off = Hermes off. So it can never own a money-critical path.

**Net:** Hermes' original jobs got built better elsewhere. What remains is the part nothing else
does: **two-way conversation** (alerts talk AT you, Hermes answers BACK), natural-language
analytics, and the approval gate.

## 4. Where / why / when / how Hermes fits TODAY (ranked)

### Fit 1 — Phone command center via ntfy (two-way) ⭐ best fit
- **Where:** your phone's ntfy app ↔ Hermes in WSL.
- **Why:** Studio needs a browser and shows fixed pages; ntfy pipeline alerts are one-way broadcast.
  Hermes is the only piece that answers questions and takes commands in plain English.
- **When:** any time, laptop on (this is the honest limitation — say it plainly).
- **How:** you send "did today's videos go out?" / "re-run MR" / "TikTok queue status" → Hermes runs
  `gh run list` / `gh workflow run` (needs gh CLI + PAT in WSL) / reads state files → replies.
  Optional later: custom skills `quarry-status`, `quarry-run <brand>`.

### Fit 2 — Plain-English YouTube analytics (yutu MCP, 74 tools)
- **Where:** same ntfy chat.
- **Why:** retention is THE metric of the growth plan (QQ 86% vs IC 52/MR 54/DFD 35). Studio
  analytics shows dashboards; Hermes answers "which short kept viewers best this week?" with real
  numbers from the YouTube API.
- **When:** weekly review, or ad-hoc after a video underperforms.
- **How:** register the yutu MCP server in Hermes config (key name to confirm post-update), test
  with one real question. Uses existing YouTube OAuth, no new tokens.

### Fit 3 — FB poster approval gate (human-in-the-loop)
- **Where:** Hermes ntfy DM with image attachments; your reply = the approval.
- **Why:** HARD RULE `fb-post-approval-required` — no generated image posts without user approval;
  today this is fully manual. ntfy carries images, so no WhatsApp needed.
- **When:** daily at poster time (or batch weekly).
- **How:** Hermes cron fetches the day's posters from fb-outbox → sends as ntfy images → you reply
  "1 and 3 ok" → only those get posted. Token hygiene: Hermes should hold as few live page tokens
  as possible; ideally it only *selects* and calls the existing posting path.

### Fit 4 — Local glue jobs (on demand, not 24/7)
- Pinterest OAuth tunnel (localhost:3003 callback) when that pending step happens.
- Keeping Studio dev server (`cd studio && npm run dev`) alive during editing sessions.
- Small browser-automation chores (Chrome AXPress tricks live on this laptop anyway).
- **Why here:** these genuinely need a local machine; GitHub Actions cannot receive an OAuth
  callback on your laptop.

## 5. Where Hermes must NEVER be used

1. **NEVER the publishing engine.** No uploads, no posts, no scheduling owned by Hermes. Laptop
   off = silent channel death; GitHub Actions stays the source of truth (cloud-only rule).
2. **NEVER the primary alert channel.** Actions → ntfy already works with the laptop off. Hermes
   watchdogs are at most a *second* layer for when the laptop happens to be on.
3. **Don't let it hoard tokens.** Treat like n8n was treated: minimal live page tokens, tight
   posting guardrails (same lesson as the 08-30 token-rotation incident).

## 6. Gaps Hermes could watch — but that should be fixed in Actions first

These failures are currently quiet or under-reported; the right fix is at the source (GitHub
Actions owns 24/7), Hermes only as optional backup:

- CI Doctor writes a report commit but **pushes no ntfy alert** → health issues stay silent.
- IG crosspost run **exits 0 even when all posts fail** (known verify gap).
- Render script-brain failing ~1 channel/day (Groq 429 + Gemini 403) — fix already awaiting "go".
- Proof-of-publication / per-channel state-file fixes from the 09-20 structure audit — awaiting go.

## 7. Cost

- Hermes brain = glm-5.3 on the user's existing Z.ai key: **$0 new subscriptions**.
- Script-only cron jobs (status checks, digests) skip the LLM entirely = **$0 per run**.
- Conversational turns consume normal Z.ai usage (same as chatting with this assistant).
- No new SaaS. Contrast: Knock.app (the old alternative) was free 10k msgs/mo but $250/mo paid tier.

## 8. Recommended setup plan (awaiting user "go" — no code touched yet)

1. **Update Hermes** — `hermes update` inside WSL. 7,819 commits behind; config backups already
   exist; expect 10–20 min and a possible config-format migration note. Re-probe channels after.
2. **Install gh CLI in WSL + auth** with the existing GITHUB_PAT (~5 min). Enables run status,
   re-dispatch, logs — the backbone of Fit 1.
3. **Register yutu MCP** (74 YouTube tools) in Hermes config; test one real analytics question (~15 min).
4. **First cron — evening digest ~8:30 PM PKT, script-only ($0):** today's 4 channel runs + longform
   + TikTok queue + any failed runs → one ntfy message. Note: repo flips back to PRIVATE Oct 1 —
   gh calls then need the PAT (step 2 covers this).
5. **(Separate "go" later) FB approval gate** via ntfy images (Fit 3).

Total setup: ~45–60 min, all on the laptop, $0 recurring. Everything critical stays on GitHub
Actions; Hermes stays optional — if the laptop is off, nothing breaks, you just lose the chat.

## 9. Gotchas / cautions

- **Oct 1 (tomorrow):** automation repo flips back to PRIVATE (scheduled task). Local `gh` without
  auth will start failing — do step 2 with the PAT, not anonymous.
- WhatsApp session dir still exists in `~/.hermes/whatsapp/` — leave it logged out per the 09-08
  decision; if it ever re-pairs by accident, the allowed number is the user's own PK number.
- `hermes update` on a +1 carried-commit install: the carried local commit may conflict — check
  `git stash`/rebase guidance in its updater before running.
- The ntfy topic Hermes listens on is separate from `quarry-x7f2k-reports` (one-way broadcast).
  Keep them separate: reports topic = pipeline output; Hermes topic = conversation.
- Skills dir shows default packs only — any `quarry-*` skills we build should live in Hermes'
  skills folder and be version-controlled in this repo (copy into WSL) so they survive updates.

## 10. Verdict

**Use Hermes as an optional, local, two-way assistant — never as infrastructure.** The project's
critical paths (production, uploads, alerts, reports) already live on GitHub Actions + Studio +
ntfy and work with the laptop off. Hermes' remaining unique value = asking questions and giving
approvals from the phone, plus local one-shot jobs. Worth ~1 hour of setup if the user wants that
convenience; skip it entirely with zero harm to the pipeline if not.
