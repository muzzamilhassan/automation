# Scalable Channel Factory — From One Gmail to a Running Channel (You = User #1)

**Date:** 2026-10-05 · **Type:** READ-ONLY deep research + design (no code changed — plan awaits "go")
**Goal in the user's words:** "Like a normal user, I have one mail. I want to add it in this flow, start creating YouTube channels with it. Videos release from my templates, and I select topics based on my research and my niche."

This is the product flow from the 10-04 blueprint, piloted on user #1 (the owner). Companion docs: `product-saas-blueprint-2026-10-04.md` (multi-tenant SaaS ladder), `upload-cadence-research-2026-10-05.md` (1 short/day, weekly docs, Sunday break).

---

## 1. What already exists (built this week)

| Piece | Where | State |
|---|---|---|
| "Add Channel" wizard (Google login → channel chooser → niche/style/voice/slots) | `studio/app/channels/add` + `/api/oauth/*` | ✅ live on Vercel; saves token to `YT_TOKEN_<SLUG>` secret + registers channel in `yt-mcp/studio-channels.json` |
| Styles gallery (templates) | `studio/app/styles` + `lib/styles-catalog.js` | ✅ live; 6 styles with real previews |
| Duplicate-title gate | `lib/dup-gate.mjs` in yt-daily + yt-deepdive | ✅ live; blocks near-dupes vs live uploads |
| Cadence (1 short/day, weekly docs, Sunday break) + pause flag | brands configs + guards | ✅ live |
| Research engine (topic sources) | `trend-research.mjs` (top viral videos in niche, 14d) + `viewer-terms.mjs` (real viewer searches) | ✅ live — but fully automatic |
| Multi-channel-on-one-mail login | Google's channel chooser inside OAuth | ✅ proven (wizard built for it) |

## 2. The five gaps between "wizard says connected" and "videos actually publish"

**Gap 1 — The engine doesn't know new channels.** `yt-daily.mjs` resolves brands ONLY from `yt-brands/brands.mjs` (`bySlug[slug]`) — 4 hardcoded legacy channels + 12 parked kits. A wizard-added channel exists in the registry but the engine has no kit for it (niches, tags, authority, hashtags, script rules, music feel) → it can't research topics or render.

**Gap 2 — One workflow file per channel.** `channel-quotequarry.yml` etc. are copy-pasted YAML (cron + env `YT_TOKEN_<SLUG>` + `node channel-pipeline.mjs <slug>`). Channel #5 today = hand-editing YAML in 5 places. Not scalable.

**Gap 3 — No human topic selection.** Topics are 100% auto-researched (fail-closed). The user wants: "I select topics based on my research and niche." Needs a Topic Desk: research proposes → user approves → producer consumes.

**Gap 4 — Templates are not wired to the wizard's style pick.** The shorts engine renders ONE proven pipeline (cinematic stock + big type; brand kit changes colors/voice/music). Other styles (paper editorial, tech, doc) are separate pipelines. For user #1: style pick maps to the cinematic pipeline + photo-poster thumbnails (the two production-proven templates); paper/tech selectable later.

**Gap 5 — Music pool for new channels.** `pickApprovedTrack(APPROVED_MUSIC[slug])` — new channels have no pool → renders without music. Brand-kit step should auto-pick 5-10 tracks matching the chosen mood from the 1,442-track catalog, flagged for the user's one-click approval.

## 3. The design — "Channel Factory"

### The user journey (what YOU will do, as user #1)
1. Studio → Channels → **New channel** → Connect with Google → pick your Gmail → **YouTube channel chooser shows your 5 channels — pick one** (or create a fresh channel on that Gmail first).
2. Wizard step 2 (today): niche, style, voice, accent, slots.
3. **NEW — Brand-kit preview (step 3):** from your niche, the machine drafts the full identity: eyebrow ("DAILY WISDOM // …"), tagline, 10-15 SEO tags, authority line, description, script rules (hook style, length), music mood. You approve or tweak → saved as a **registry kit** (`yt-mcp/studio-channels.json` entry becomes a full kit; legacy 4 channels keep their hand-made kits untouched).
4. **NEW — Topic Desk (Studio page):** for the new channel, research runs and shows 8-12 candidate topics (viral videos in your niche + your viewers' real search words). You tick the ones you want (or press Autopilot). Approved topics queue in `yt-mcp/topics-<slug>.json`.
5. The nightly engine picks the channel up automatically: consumes approved topics first, auto-researches when the queue is empty, renders with the chosen template, passes the dup gate, publishes at your slot (1/day, Sunday break — all the safety rails apply to registry channels too).

### Architecture changes (the 4 builds)
1. **Registry-driven brand resolution** — `yt-daily`/`yt-deepdive` resolve the brand as: legacy `bySlug` kit → else registry kit from `yt-mcp/studio-channels.json`. Registry kits get the same fields, so zero code changes per channel. (`lib/dup-gate.mjs`, pause flag, cadence already work for any slug.)
2. **Brand-kit generator** — wizard step 3: one LLM call drafts the kit from niche + handle + chosen style/mood; user edits in the form; stored in the registry. Plus auto-picked music pool pending approval.
3. **ONE generic workflow** — `channel-autopilot.yml`: cron reads the registry (jq) → matrix over all active registry slugs (the `fromJSON` matrix pattern already proven in longform-daily.yml) → `node channel-pipeline.mjs ${{ matrix.slug }}`. New channels start producing with ZERO new YAML. Per-channel cron times are unnecessary — uploads are scheduled private + `publishAt`, so the slot times keep controlling when each video goes public. The 4 legacy workflows keep running until we cut them over deliberately.
4. **Topic Desk** — `/topics` Studio page + `/api/topics` (GET candidates from the cached trend + terms files; POST approved list → `yt-mcp/topics-<slug>.json`) + `yt-daily` consumes the queue before auto-research.

### Templates (honest mapping for v1)
| Wizard pick | What renders |
|---|---|
| Cinematic Stock Shorts | existing shorts engine (proven daily) + photo-poster thumbnail |
| Market Documentary | weekly episode path (docDay) |
| Paper Editorial / Tech | marked "coming" — pipelines exist as demos, wired later |

## 4. Phases

- **Phase A — factory core (est. 1-2 sessions):** registry-driven brand resolution + brand-kit generator in wizard + `channel-autopilot.yml` + music pool auto-pick. After A: any channel you connect through the wizard runs itself.
- **Phase B — Topic Desk (est. 1 session):** Studio page + queue + producer consumption. After B: "I select topics from my research" is a 30-second daily click.
- **Phase C — pilot on yourself:** connect 1 fresh channel from your Gmail through the wizard end-to-end → first video within 24h of approval → 10-video judge window on the new cadence.
- **Phase D (later):** more templates selectable in the wizard; then the outside-customer ladder (Google verification, from the blueprint doc).

## 5. Safety that carries over automatically
Dup gate vs live uploads + title history · 1 short/day + docDay + Sunday break · pausedUntil flag · identity guard in sweeper (token handle must match kit handle — registry kits include the handle) · upload validation gates · publication verification.

## 6. Risks / notes
- Registry file is committed to the repo — kits contain NO secrets (token lives in the secret) ✓. Handle + channelId public-safe.
- The wizard currently runs on Vercel; the registry commit needs the GITHUB_TOKEN (already used by /api/action) — same permission as workflow dispatch; if it lacks contents:write the wizard falls back to "copy this JSON" + local commit.
- Google OAuth app is in Testing mode: fine for user #1 (owner) — the 100-user/7-day-token walls only matter for outside customers (blueprint ladder already covers that).
- Compute: each new channel ≈ 1 short render/day (~2-4 min Actions) + weekly doc — a few hundred private-repo minutes/month at the new cadence; fine now, paid minutes at scale per blueprint.
