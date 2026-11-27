# Session compact — motion templates, human voice, course template

*Living handoff file. Updated before every context compaction (owner rule, 2026-11-20).
Read this first after a compaction; it replaces re-reading the whole conversation.*

**Last updated:** 2026-11-25 (see section 0 first; sections 1-5 are older)

---

## 0a. 2026-11-27: Shorts + template fixes (owner: shorts templates missing, double subtitles, QQ "old template"/restart feel)

| Commit | What |
|---|---|
| `cdcceb4` | Gallery lists 2 Shorts looks (catalog `shorts-clipped`, `shorts-fresh`); clip titles may only use numbers the clip says; DB hiccup uses kit.templateId (no silent old look); a waiting script blocks new ones only 2 days (MR/IC/DFD were stuck behind pre-fact-check scripts) |
| `4b9c127` | Edge "No audio" (3 channels voicing at once) made IC+DFD ship storybook instead of Money Flow on 11-24 -> longer backoff + one resumed rerun; fallback = panel warning `template_fallback`; clip Shorts fill 9:16 (blurred bg, title on top, captions at y=1430) |
| `5fc8e15` | Storybook continuous flow: shots of 15-30 s with one persistent crossfaded background, letterbox enters once, 180 ms beat pad; `doc_presentation.background: "broll"` on old-verses-storybook 1.1.0 (synced to Neon) = video clip per shot |
| `2e8a089` | Clips channels render `episode-clean.mp4` (DocV2 captions:false) -> artifact `lf-clean-<slug>` -> clips cut from it (no double subtitles) |

- Live assignments (Neon) 11-27: QQ old-verses-storybook, MR red-flags-explained, IC+DFD money-flow-diagram, yt-bot systems-diagram.
- Local tokens for QQ/IC/DFD in yt-mcp/channels/*/token.json are expired (engine uses Neon/secrets) - only MR works locally.
- **Gotcha:** agent worktrees junction node_modules — `rmdir` the junction BEFORE removing the worktree (2026-11-27 a forced remove wiped main node_modules; fixed by npm ci).
- Not yet seen live: first clean-copy render + new clip layout on a real doc day; fresh-Shorts gallery preview is only a dark still.

## 0. Latest (2026-11-25): facts first, 2-hour auto-approve, publish days

| Commit | What |
|---|---|
| `88c7af0` | Doc scripts are written only when a long video is due |
| `ec64e76` | Every active template waits for approval (owner yes) |
| `36d85b4` | Videos go public only on the days set in the panel (`lib/publish-days.mjs`) |
| facts-first + auto-approve (this commit) | Scripts use only sourced numbers/names/quotes; unanswered + fully sourced = approved after 2 h (`docs/qa/facts-first-qa.md`) |

- **Owner decisions 2026-11-25:** facts first then auto-approve after 2 h; add approval to the 8 templates; days/counts stay per channel in the panel.
- **Auto-approve:** rules `studio/lib/auto-approve.mjs`; runner `scripts/auto-approve.mjs` (job `auto-approve` in channel-autopilot.yml, scheduler ticks only); setting `kit.autoApproveHours` (Schedule drawer, 0 = wait for me, default 2). Scripts without a saved factCheck are never approved. `DRY_RUN=1` only prints.
- **yt-bot = "Behind The AI Bill":** PAUSED by owner (pausedUntil 2099-12-31), 7/7 ready. Long Thu 17:00 UTC, Shorts Fri/Sat 16:35 UTC, start 05:00 UTC, Systems Diagram.
- **Owner still to do:** reject 3 old waiting scripts (MR Green Energy, DFD Quiet Wealth, IC Gold); decide Quote Quarry video zrcoRuSHJ3s (made unapproved, public 2026-11-25 14:30Z); change "reviewed by a person" wording; approve music for yt-bot; answer: should the gate STOP if the approval system itself crashes?
- **Known limits:** a false statement with no number/name/quote can pass; paper planner has no on-screen number check; GDELT returns 429 from some IPs.
- **Deploy Studio only from a clean worktree of origin/main** (other session may have uncommitted studio edits). The Bash tool collapses backslashes: write patch scripts with the Write tool.

---

## 1. What this session built (newest first)

| Commit | What | Where |
|---|---|---|
| `e0b1705` | Templates show under their **own names** everywhere (wizard/drawer listed 3 new ones as "Documentary Master Frames"); honest Money Flow / Systems descriptions; paper planner repairs a silent beat (CI failed 4/4 on a short outro); dry-run `pipefail`; **assignment plan** `docs/plans/2026-11-20-template-assignment-plan.md` (B1-B5 await owner) | `studio/lib/template-registry.js`, `studio/lib/template-registry.data.js`, `lib/paper-plan.mjs` |
| `3b34444` | **Doc lane rejected every Lecture Notes (paper) brain reply** (`isValidJson` wanted nodes/lines) → shared `isDiagramPlanReply`; dry run takes registry ids + `--label`; tech test script | `lib/diagram-episode.mjs`, `yt-deepdive.mjs`, `longvideo/diagram-episode-dryrun.mjs`, `.github/workflows/diagram-dryrun.yml` |
| `5718182` | **"Lecture Notes" paper template** refined to the reference lesson grammar and added to the template section (registry + Neon + gallery preview) | `explainer/remotion/diagram/Widgets.tsx`, `LivingDiagram.tsx`, `lib/paper-plan.mjs`, `lib/course-plan.mjs`, `scripts/store-template-preview.mjs`, `docs/qa/course-template-c1b-refine-qa.md` |
| `f85c954` | Course planner C2: outline → render-ready plan (one brain call per lecture) | `lib/course-plan.mjs`, `longvideo/generate-course-plan.mjs` |
| `d2a8115` | Course template C1: paper look + 6 teaching widgets | `explainer/remotion/diagram/Widgets.tsx` |
| `fad7283` | Registry repair: Drafts-Inbox approvals wrote BARE objects → registry was a SyntaxError; approvals now keyed + 409-race retry | `studio/lib/template-approvals.mjs`, `tests/template-approvals-race.test.mjs` |
| `8057c48` | Audio guide | `docs/audio/how-audio-works.md` |
| `6efe37b` | Step 1: Money Rulebook human voice + Living Diagram doc lane + money-flow/systems templates + CI dry-run workflow | `explainer/voice_lines.py`, `youtube-flow/narrate.py`, `lib/diagram-*.mjs`, `.github/workflows/diagram-dryrun.yml` |

Research: `research/motion-storytelling-templates-2026-11-16.md`,
`research/cloudxberry-course-format-audit-2026-11-17.md` (Cloud X Berry, LJ_HY0AKZnM).

## 2. Current state

- **Assignment (see plan doc):** one active template per channel; assigning SWAPS. Only MR has one (Red Flags Explained). Money Flow fits MR/IC/DFD; Systems + Lecture Notes fit no channel yet (need niche "AI & future tech" — yt-bot will be the AI channel, owner: "not ready yet", do NOT set its niche). No UI edits an existing channel's niche (plan B1).
- **Prod Studio deployed from a CLEAN worktree of origin/main** (another session has uncommitted auth edits in studio/) — keep doing that while their WIP exists.
- **Templates live in Studio (41):** all 20 inbox drafts approved; `money-flow-diagram` (tile), `systems-diagram`
  (glow), `lecture-notes-paper` (paper, gallery preview stored). Each takes name/colours/voice from the channel kit.
- **Lecture Notes look:** white page; headline changes every 9-23 s (one idea per beat, one *accent* word, underline
  bar); lecture badge on a lecture's first beat; widgets naked + centred (boxes with tag pills + orange pointer,
  counter card + ✓/✕ check card, code window with lit line, growth curve, takeaway cards, roadmap); uniform 1.36× scale.
  Demo: `longvideo/out/diagram-demo/course-hashmap-lecture.mp4` (2:00, 9 beats). Side-by-side vs reference:
  `longvideo/out/diagram-demo/course-vs-reference.png`.
- **Doc lane:** template `story_structure.doc_render: "diagram"` → Living Diagram; `doc_presentation.style`
  `tile|glow` → node planner, `paper` → `lib/paper-plan.mjs` (approved chapter sentences → lesson beats, words
  verbatim). Any failure → storybook fallback + ntfy. Upload tail unchanged.
- **Voice:** Money Rulebook has `voiceProfile` (Kokoro `bm_daniel`, 0.95, calm) in `lib/brands.json`; others use the
  old paths. Toggle: `node scripts/enable-human-voice.mjs <slug> [--off]`.
- **Channels:** there is NO ai-observer channel (planning leftover). The owner will **create a new tech channel**
  for the Lecture Notes / course format. Only real channels count (owner directive).
- **Tests:** `npm test` 1776/1777 (T4b reportChannels = pre-existing, never chase); pytest 116.

## 3. Open decisions / next steps (owner)

1. Create the new tech channel → assign `lecture-notes-paper` (or `systems-diagram`) → first doc day.
2. Course phases still to build: **C3** split render (long courses: one GitHub job per module + stitch;
   3.5 h ≈ 9 h single-job render > 6 h limit), **C4** course thumbnail + module/lecture timestamps, **C5** pilot.
3. Optional: Chatterbox-Turbo emotional voice via Kaggle free GPU (needs owner Kaggle account + token).

## 4. How to resume / verify

```
node --test tests/course-plan-gen.test.mjs tests/paper-plan.test.mjs tests/diagram-cues.test.mjs tests/diagram-plan.test.mjs
node longvideo/make-diagram-demo.mjs longvideo/diagram-demo/course-hashmap-lecture.plan.json      # local render
node longvideo/generate-course-plan.mjs <outline.json> <out.plan.json>                          # AI course plan
node scripts/store-template-preview.mjs <template_id> <sample.mp4> [poster.jpg] --clip 40        # gallery preview
node sync-template-registry.mjs                                                                  # registry -> Neon
cd studio && vercel --prod                                                                       # deploy panel
```
Cloud dry run (no upload): `bash scripts/gh-personal workflow run diagram-dryrun.yml --ref main -f slug=money-rulebook -f template=<registry id> -f script=<script.json> [-f label="Brand"]` → artifact `diagram-dryrun-<slug>-<run id>`. Runs 2026-11-20: money-flow 44776619003, systems 44776634466, lecture 44781012713 (first lecture run 44776647947 failed → fixed e0b1705).

## 5. Gotchas learned (do not relearn)

- **Parallel sessions share this tree:** stage named files only; if `pull --rebase` is blocked by their edits, check
  overlap with incoming commits, then `git pull --rebase --autostash` (restores their edits). Never `git add -A`.
- **Registry entries must be KEYED** (`'id': {...}`); approved drafts must leave `studio/lib/template-bot-drafts/` (#124).
- **Anchors must match the TTS tokenisation**: Edge splits "takeaway" vs "take away"; the validator catches it.
- **Kokoro fp32 can fail to load under RAM pressure** → voice lane falls back to int8; int8 + af_heart can align weakly
  → use Edge Ava for demos then. Weak alignment fails loudly (never ships silence).
- **Remotion `--port` collisions** after a killed render → use a fresh port per render.
- **Disk:** C: hit 100 % twice; Docker data disk (16.3 GB) deleted 2026-11-20 (n8n workflows gone, owner accepted).
  Keep `~/.venvs/chatterbox` (owner: keep). Clear npm/pip caches + `studio/.next` first when low.
- **The DocV2 preview renderer cannot render diagram/paper templates** → use `scripts/store-template-preview.mjs`.
- **Free LLMs** (Groq gpt-oss / Gemini) slip on details → few-shot example in prompts + safe repair + bounded re-asks;
  429/503 bursts → scene gap + backoff.

---

## Parallel lane — panel live-test fixes + "nothing auto" (2026-11-20/21, other session)

| Commit | What |
|---|---|
| `ae4495b` `badffc1` `45a4d5e` `1a22f9e` | Live-test fixes waves A/B/C (115 findings, research/live-e2e-test-2026-11-20.md), each verified live |
| `c092e6f` | J1 multi-line token secrets → GITHUB_ENV heredoc (report job green again); Reports card lists Actions artifacts + Download; J2 titleHistory keeps videoId (v) |
| `676223a` | Redispatched OLD approved doc no longer consumes TODAY's approved script (same-slot write-back skipped on resumed path) |

**State (2026-11-21 08:40 UTC):**
- **Owner directive:** NOTHING automatic. A channel publishes only when it is 7/7 ready, configured in the panel: YouTube, template, story shape, niche/desc/tags, voice, thumbs 2–5, schedule.
- **Paused via panel API:** QQ, IC and DFD (registry autopilot=false). MR keeps running; yt-bot is off. weekly-compilation.yml is disabled.
- **Made private, publishAt cleared:** QQ `ngSmqaEVV38` and `5ZUrGZzWy1s`, IC `Aqhi1SiX_nk`.
- **"Debt Decoded":** MR script `6776ad78…` restored to approved (it never rendered), audited.
- **SHIPPED 249f60e (live, verified):** readiness gate in `studio/lib/channel-readiness.mjs`.
  - Engine: discover + pipeline refuse not-ready channels.
  - Panel: N/7 checklist; Resume blocked; flow API returns 409.
  - Editable long-video and Shorts go-public times.
  - `scripts/prefill-kit-from-brands.mjs`, to be run by the lead after review so MR stays 7/7.
- **Gotchas:**
  - The local gh CLI is logged in as `muzzamil-rx`; use `bash scripts/gh-personal`.
  - The yt-* MCP tools return 401; use local `yt-mcp/channels/<slug>/token.json` + googleapis.
  - Clearing a schedule needs `status.publishAt: null`.
- **Live 2026-11-21:**
  - MR 7/7, QQ 4/7, IC 5/7, DFD 5/7, yt-bot 2/7; discover picks only MR.
  - The prefill was applied to Neon + the registry.
  - quarry-render TikTok Post (QuoteQuarry) workflows are disabled.
- **`aafed7c` #117 SHIPPED + verified live (2026-11-23):**
  - The legacy qs_key cookie is refused (401, even with the correct hash); password login mints only qs_session.
  - The auth files that sat uncommitted for days are now committed.
- **Working-tree cleanup (2026-11-23):**
  - 51 → 2 items.
  - The unneeded files were moved to Documents/youtube-automation-cleanup-2026-11-23, not deleted.
  - The security audit report moved to Documents/youtube-automation-private (keep it out of the public repo).
  - The 2 remaining research files belong to other sessions.
- **PARKED 2026-11-23 (owner):**
  - The emotional voice is parked: no free GPU voice was natural enough (Ming natural was best). ElevenLabs comes later.
  - Code is saved on branch `wip/emotional-voice-gpu` (GPU engine + fallback + 27-voice Kokoro library).
  - Removed: the Kaggle kernels, the KAGGLE_* GitHub secrets, ~/.kaggle, ~/.modal.toml, the chatterbox venv + cache, and the kaggle/modal CLIs.
  - The owner must revoke the Modal token pasted in chat.
- **Kaggle connected (2026-11-22, now removed):**
  - Token is in ~/.kaggle/access_token (outside the repo); GitHub secrets KAGGLE_API_TOKEN + KAGGLE_USERNAME.
  - Private kernel muzzamilhassan/quarry-voice-demo: Chatterbox-Turbo on a T4 at 2.28× realtime, ~5 min setup (it pins torch 2.6, so torchvision must be uninstalled).
  - A/B mp3s are on the owner's Desktop › Voice demo; waiting for the owner's listen.
- **`9a09aab` human voice is a panel setting:**
  - `kit.voiceProfile` {human, mood, speed}; the panel kit wins over lib/brands.json.
  - Manage → Voice drawer; 49 preview mp3s in studio/public/voices/human.
  - The MR migration is applied, with an identical resolved profile.
  - Option 2 (Chatterbox/Kaggle) waits on the owner's Kaggle account.
- **`2a98920` template dedupe:** 41 → 19 registry entries (14 unique + 5 base). The 22 colour-only copies were removed, along with their Neon index + preview rows.
