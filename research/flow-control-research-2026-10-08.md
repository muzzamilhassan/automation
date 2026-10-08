# Research — Flow Control: Per-Channel ON/OFF + Network Kill Switch

**Date:** 2026-10-08 · **Type:** READ-ONLY research + design (plan awaits "go")
**Ask:** "Add something like an on/off button where we can handle the flow — stop the flow or etc." Also: the niche auto-set on FAJR OF QUR'AN wasn't a niche we're actually working on — and it exposed that a connected channel with a niche will start producing TONIGHT with no visible way to stop it from the dashboard.

---

## 1. What exists today (scattered, partially manual)

| Control | Where | Covers | Usable from dashboard? |
|---|---|---|---|
| `pausedUntil` date flag in channel state | yt-mcp/state/<slug>.json | yt-daily (shorts+episode), yt-deepdive, sweeper all skip | ❌ manual file edit (this is how QQ's recovery pause was done) |
| Workflow disable (GitHub API) | channel-*.yml workflows | everything in that workflow | ❌ needs PAT + admin |
| Registry `active` flag | yt-mcp/studio-channels.json | autopilot discovery + sweeper skip wizard channels | ❌ no UI |
| Role system (R1) | proxy + route guards | who can press buttons | ✅ live |

So the pieces exist but there's **no switch a human can flip**, and nothing shows the flow state on the dashboard.

## 2. How the pros do it (2026 patterns)

- **Buffer — "Pause your queue"** (per account): one toggle; when paused, ALL scheduled posts are held (not deleted), drafts and queue stay intact; Resume releases them. ([Buffer Help](https://support.buffer.com))
- **Hootsuite — "Suspend scheduled content"** (org-wide kill switch + explicit Resume): crisis button for all connected accounts at once. ([Hootsuite Help](https://help.hootsuite.com))
- Shared semantics in both: **pausing stops NEW delivery; it does not delete or recall anything already scheduled**, and the queue survives the pause.

## 3. The design for our machine

### The switch — per channel (Channels page card)
A real toggle on each channel card: **Autopilot ON / OFF**.
- **OFF means:** tonight's run produces nothing for that channel (no shorts, no episode, no healing, no topic consumption). Everything already scheduled on YouTube still publishes (that part lives on YouTube's side, exactly like Buffer's semantics: pause halts delivery of new items, never recalls sent ones).
- **ON means:** the next nightly run picks it up again automatically. Queue, topics, profile, key — all untouched.
- Where it's stored (one API call writes BOTH, so every layer obeys):
  1. registry `autopilot: false` → autopilot discovery + sweeper skip the channel,
  2. state `pausedUntil: "2099-12-31"` → yt-daily/yt-deepdive hard-stop even if invoked directly.
  Turning ON clears both. (The 2099 date is just how the existing date-based guard expresses "indefinite".)

### The master switch — network kill switch (Production page)
One **"Pause everything" / "Resume everything"** toggle at the top: flips all channels at once (loops the per-channel call). For sensitive moments — the exact use case Buffer and Hootsuite built theirs for.

### Status you can SEE
Each channel card gets a state chip: **RUNNING · PAUSED · NOT CONNECTED** — so "will it produce tonight?" is answered at a glance. The Production page shows the same chips per pipeline.

### What the switch does NOT do (by design)
- Does not delete or private anything on YouTube.
- Does not recall already-scheduled videos (say so in the confirm dialog).
- Does not touch the connected key (the channel stays linked).

## 4. Implementation (on "go", ~half a session)
1. `PATCH /api/channels/flow` — `{slug, on: true|false}` (owner+staff): writes registry `autopilot` + state `pausedUntil` (2099 or null), commits via the existing repo-JSON helpers.
2. Channels page: toggle on each card + state chip; Production page: network master switch.
3. Engine: zero changes needed — the guards already exist (that's the payoff of the QQ pause work).
4. FAJR OF QUR'AN note: it is currently **ON** and would produce its first short tonight. If you don't want that yet, either flip the switch after this is built, or tell me now and I'll flip it off manually in one minute.

## 5. Sources
- [Buffer Help — Pausing your queue](https://support.buffer.com)
- [Hootsuite Help — Suspend scheduled content / Resume](https://help.hootsuite.com)
- Engine guards already built: pausedUntil in yt-daily/yt-deepdive/sweeper (10-05 recovery), registry active filter in channel-autopilot.yml.
