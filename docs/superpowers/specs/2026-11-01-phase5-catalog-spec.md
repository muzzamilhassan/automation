# Phase 5 Spec — Catalog Fill-Out: 30+ Video Templates + Thumbnail Registry (v1 DRAFT)

Status: **v1 DRAFT for owner review. No owner answers yet — the numbered Open Questions (§Open Questions) must be answered before the task-level plan is written.** Per master plan `docs/superpowers/plans/2026-10-25-platform-own30-master.md` Phase 5 (§3, lines 165–171) and the §1.2 admin-flows rows "Template management" and "Thumbnail templates" (lines 76–77). Ground truth verified against the repo 2026-11-01; every file, table, field and endpoint named below exists today unless marked NEW. **This phase is DATA-heavy by design: the "build" is mostly authoring the owner's content library. Code is small and named (§Data vs Code).**

## Words this spec uses (one line each)

| Term | Plain English |
|---|---|
| Video template | One assignable entry in the template registry: a niche, a story structure, safety rules, and a visual family. What the panel assigns to a channel. |
| Catalog family | The VISUAL layer in `studio/lib/templates-catalog.js` (e.g. "animated charts"). A family is the look; a template is the look + the story + the rules. |
| Registry | The governance layer (`REGISTRY_META` + Neon index + channel assignments). Only registry entries can be assigned to channels. |
| Variation rules | Per-template written rules saying what must differ from video to video (subject, hook, stat…). YouTube's monetization policy punishes "template" content; these rules are the defense. |
| Variation gate | The Phase 3 brain check that compares a new script against the channel's recent scripts and blocks near-duplicates. |
| Review class | A safety tag (`finance`, `medical`, `all`) that forces a script to wait for owner approval before upload. |
| BYOK | "Bring your own key" — the owner's AI-provider keys stored encrypted in the vault (Phase 2). |
| Sync | The command that copies registry data files into the Neon index so the panel can assign them (`node sync-template-registry.mjs`). |
| Brand kit | Per-channel data file (colors, voice, niches, posting slots, sub-niches) in `studio/lib/brands.json` / `yt-brands/brands.mjs`. |
| Thumbnail candidate | One of N preview images generated per video; candidate 1 ships automatically, the owner can swap before publish (Phase 4). |
| SRT | The subtitle file format the weekly documentary lane generates from the narration. |
| force_doc | A dispatch flag (`-f force_doc=1`) that forces the weekly documentary to render today — used in QA so no drill ever waits for a calendar day. |

## Problem Statement

Six things stand between today's catalog and the Phase 6 onboarding of 30 channels:

1. **The assignable catalog is 7 templates covering 2 niche clusters.** The visual catalog holds 18 families (`studio/lib/templates-catalog.js`: documentary-frames, editorial-headlines, timeline-history, map-journeys, photo-stories, kinetic-typography, beat-synced-type, quote-cards-premium, code-product-demos, explainer-diagrams, browser-chrome, finance-explainers, stats-counters, chart-animations, podcast-audio, vertical-safe-zones, retro-vhs, transitions), but only 7 carry registry metadata (`studio/lib/template-registry.data.js`): 4 history + 3 finance. There is **nothing to assign** in 8 of the 10 launch niches (travel, tech/AI, science, psychology, motivation, productivity, health/fitness, business). Phase 6's "adding channel = data rows, zero code" promise is unmeetable for those niches until the catalog exists.
2. **Story structure lives in the brand kit, not in templates.** The script's shape (hook rules, point count, line length, title pattern) comes from the kit's `script` block (`youtube-engine.mjs:767–789`, the `SC` fields). Assigning a different template changes governance (preflight, dedupe thresholds, review class, thumbnail picking) but **not the story the brain writes**. The monetization policy's own safe harbor — "each video has a distinct storyline, focus, or concept" (`research/platform-niche-template-system-2026-10-24.md` §1.2) — requires distinct structures to be a template property, not an accident of which kit a channel happens to wear.
3. **42 thumbnail designs exist but none of them are registry-assignable.** The v2 pattern (`studio/lib/thumb-templates-v2.js` — one parametric renderer + `studio/lib/thumb-catalog.json`, 42 entries in 12 style categories) is reachable only through the Studio gallery routes (`/api/thumbs/*`). Production thumbnail candidates are staggered video frames (`thumbFrameOffset`, `youtube-engine.mjs:875`); no template registry, no per-niche sets, no brand-token binding. Master plan §1.2 promised "expose as catalog; per-niche sets; N-candidate generation + pick" — not delivered.
4. **No template is ever DECLARED accepted.** Nothing records, per template, whether it actually generates a valid script, whether the variation gate holds on it, and whether its review class routes correctly. A catalog that fills with untested entries is a liability at 30 channels (one template bug = 30 bad videos/day — own-portfolio research §5.4).
5. **The weekly documentary lane has one hard-coded shape.** Cold open + ≥5 chapters + outro is pinned in code (`yt-deepdive.mjs:82` `validEpisode`); there is no doc-template knob, so every channel's weekly longform is structurally identical.
6. **Language-parameterized templates are blocked on an undecided voice.** Urdu has exactly two candidate paths — the open-source Piper `ur_PK` voice (quality never verified) and Azure's `ur-IN`/`ur-PK` neural voices — and no decision, no listening test, no template (research cited in S5).

## Solution

Five slices. S1–S4 build/author; S5 is a documented decision point with no build.

**S1 — The catalog authoring system.** A template gets authored as registry DATA (one new block in `studio/lib/template-registry.data.js`, optionally a visual binding to an existing catalog family), passes the existing validator, syncs via the existing CLI, and becomes panel-assignable. Schema additions (small, backward-compatible): a `template_id` separate from the visual `family`, a required-on-new `story_structure` block, and a `disclaimers` list inside `safety`. A written QUALITY BAR governs variation rules and safety blocks. A per-template QA gate defines what ACCEPTED means (generates → gate holds → review routes → candidates emit), executed with the same force_doc/no-calendar-waits discipline as Phase 4's drills.

**S2 — The 30+ catalog plan.** A per-niche map (10 launch niches) of which templates exist, which get authored, in which order — 28 video + 5 documentary entries = 33 ≥ 30. Structures come from the niche research's concept table (§2.1: 22 named concepts, each expressed as story structure × visual treatment × workflow difference). Non-YMYL niches author first; health/finance last with the full safeguard review.

**S3 — The thumbnail template registry.** The 42-design catalog is exposed as a `thumbnail_templates` registry (NEW data file + loader mirroring the video registry pattern): per-niche sets, brand-kit token binding (the renderer already accepts accent/shade/brand/face inputs), a rotation rule so consecutive uploads don't reuse a layout, and wiring into the EXISTING Phase 4 pick flow (candidates → `/review` → `thumbnails.set` swap). Candidate 1 stays today's frame thumbnail — regression-pinned.

**S4 — Documentary-lane templates.** The weekly lane's shape becomes template DATA: section plan (cold open, chapter count/minimums, outro), title pattern, review class. Five doc entries launch (one per likely doc niche), reusing the existing `validEpisode` contract and SRT captions unchanged.

**S5 — The Urdu deferral, made explicit.** No language-parameterized templates are authored. The decision point is documented with the two voice options and a 30-minute owner listening test (sample clips, blind scoring, a decision rule) that can run any day — no build until the decision lands.

## User Stories

1. As the owner, when I open the panel for a health channel, I want 2–3 assignable templates with evidence-tiered habit stories and mandatory disclaimers, so a fitness launch is a data task, not a coding session.
2. As the owner, I want every template to carry its own story structure and no-repeat rules, so two channels sharing one visual family still produce visibly different videos — the difference YouTube's reviewers can see.
3. As the owner, I want each new template to come with a filled QA row (generated? gate held? review routed?), so "in the catalog" always means "proven working", never just "present".
4. As the owner, I want thumbnail sets per niche bound to each channel's brand colors, so 30 channels get distinct looks from data and my thumbnails never repeat back-to-back.
5. As the owner, I want the weekly documentary for each niche to follow its own section plan, so the longform lane isn't one shape wearing different hats.
6. As the owner, I want a one-page Urdu decision card (two voice options, listening test, decision rule), so the language-template question is a 30-minute decision, not an open loop.
7. As staff, I want to browse the full catalog filtered by niche and prepare assignments, while fail-closed approval and template authoring stay owner-only.
8. (Dormant) The client role gains nothing in Phase 5 — no SaaS work (scope pivot: own-portfolio-30).

## Implementation Decisions

### S1 — The catalog authoring system

- **D1 — Template identity separates from visual family (schema v2, owner question OQ-1).** Today a registry entry IS a family id — 7 families registered out of 18 means at most 18 assignable templates ever, and two niches needing the same visual with different stories cannot share it. Decision: registry entries gain an optional **`template_id`** plus a **`family`** field naming the visual family (which must exist in `TEMPLATES_DATA`). Key = template_id; when absent, template_id defaults to the family id (the existing 7 keep their identity, assignments, and pinned majors untouched). The registry UI, assignment flow, preflight (`lib/template-preflight.mjs:145`), and the brain's resolution (`youtube-engine.mjs:642` `resolveTemplateId`) read template_id; `family` remains the gallery join and the format-truth source (the existing rule "formats derived from the family's aspectRatios — never declared beyond what the family ships" is kept verbatim). Alternative rejected: authoring 12+ new "families" as data-only catalog entries would reach 30 too, but it muddles look with story — every future visual tweak would touch N copy-paste entries. Adding template #31 then = one data block. Zero code per addition (no-static-maps honored).
- **D2 — `story_structure`: the template's beat plan, consumed by generation.** New required-on-new block (optional/absent for the legacy 7): for shorts, `beats[]` (ordered named beats — e.g. Myth vs Money: `belief → reversal → what-to-do`), `hook_classes[]` (allowed hook types), `title_patterns[]`, `payoff_rule`; for long/doc, `sections[]` (e.g. `cold_open, chapters:8, exhibits, outro`) with `chapter_min_words` (today's floor is 70 — `yt-deepdive.mjs:82`). **Consumption is the one meaningful code slice on the video side:** the generator already resolves the template's meta (`youtube-engine.mjs:800`); it will append a structure section to the prompt and let the template's structure OVERRIDE the kit's default structure line — while the kit keeps voice/pacing/title fields the template omits (OQ-7). Unassigned channels keep today's byte-identical prompt. Without this, "distinct story structure per template" is prose, not product.
- **D3 — The variation-rules QUALITY BAR (authoring, not parsing).** Every rule must name (a) the no-repeat OBJECT — subject, hook, stat, timeline span, dataset, tactic — (b) a lookback window ("channel's last 5 videos", "last 10 headlines"), and (c) where it is enforced: the variation gate (similarity), the title gate, the seed rotation, or the review desk. This mirrors the strongest existing entries (e.g. `timeline-history`'s "no repeated timeline span: the start/end years and milestone events differ from every prior video" — `template-registry.data.js:51-55`). Vibe words ("feels fresh", "high quality") fail authoring review. Honest limit, stated once: rules are prose read by humans and the review desk; the MACHINE-enforced parts are the per-template similarity thresholds (defaults 0.85 within-channel / 0.90 cross-channel, overridable per template — `youtube-engine.mjs:622–634`), the title dedupe, and the seed rotation. A rule the machine cannot check says so explicitly.
- **D4 — `safety` extends with `disclaimers[]`.** Vocabulary stays the validator's four classes — `['health','finance','medical','all']` (`template-registry.js:9`). Authoring rule: anything touching bodies/medicine ⇒ `medical`; anything touching money/investing ⇒ `finance`; `all` = gated for any reason; `health` remains valid but unused in v1 (OQ-6). `disclaimers[]` carries fixed closing-beat texts (health: "Education, not medical advice."; finance: "Education, not financial advice." — the tax-shield kit's "Education, not advice" pattern, `yt-brands/brands.mjs:217`). Required for every `medical`/`finance` template. Consumption rides D2's prompt slice + the `/review` desk shows the line (the reviewer already sees the full script).
- **D5 — The authoring pipeline (proposed division of labor — OQ-2).** Per template: (1) an LLM drafting pass produces the registry block from this spec's map (D7) + the niche research §2.1 concept row, following D3/D4 bars; (2) the OWNER reviews against a plain-English checklist (Does the story differ from the niche's other template? Could you tell from the rules what must never repeat? Are the disclaimers right?); (3) machine gates: `node sync-template-registry.mjs --dry` (validator, exit 1 on any bad block) + the per-template QA gate (D6); (4) sync + panel-assign. The owner never writes JSON from scratch; nothing ships owner-unreviewed.
- **D6 — The per-template QA gate: what ACCEPTED means.** A template is ACCEPTED when all rows of its checklist pass, quoted into the phase QA file: (a) dry-sync validates the block; (b) assignment validation passes against a niche-matched channel (existing codes: `niche_mismatch`/`format_mismatch`/`missing_capability`… `template-registry.js:233`); (c) ONE forced generation produces a script whose shape matches `story_structure` (spot-check in plain English); (d) the variation gate ran on it with the template's thresholds; (e) where the class is `medical`/`finance`, the script HELD at `/review` (per-CLASS live proof, not per-template — Drill B); (f) where picking is on, candidates emitted. Discipline: force_doc dispatch + state edits + test today — no drill waits for a calendar day (owner directive).

### S2 — The 30+ catalog plan

- **D7 — The per-niche map (33 entries: 7 existing + 21 new video + 5 doc).** Niche strings are VERBATIM channel-kit niche strings — assignment matching is exact (`template-registry.js:212` feeds `entry.niche` + `kit.niches`; the finance seeds already carry three exact kit strings). New canonical strings are fixed NOW so future kits and templates agree (D15). Structure sources: niche research §2.1 rows named per template.

  | # | template_id | Niche string(s) | Fmt | Visual family | Story structure (research §2.1) | Review class | Status |
  |---|---|---|---|---|---|---|---|
  | 1 | documentary-frames | History stories | S+L | documentary-frames | archival narrative (event forensic) | — | EXISTS |
  | 2 | timeline-history | History stories | L | timeline-history | era timeline spine | — | EXISTS |
  | 3 | photo-stories | History stories | S+L | photo-stories | figure/portrait parallax | — | EXISTS |
  | 4 | editorial-headlines | History stories | S+L | editorial-headlines | investigation + exhibits | — | EXISTS |
  | 5 | finance-explainers | Investing psychology & market wisdom / Personal finance rules & money habits / Old money habits & quiet wealth | L | finance-explainers | concept model | finance | EXISTS |
  | 6 | stats-counters | (same 3) | S+L | stats-counters | milestone tick | finance | EXISTS |
  | 7 | chart-animations | (same 3) | L | chart-animations | dataset chart | finance | EXISTS |
  | 8 | myth-vs-money | (same 3) | S | stats-counters | belief → reversal → what-to-do | finance | NEW |
  | 9 | habit-protocol | Healthspan & longevity habits / Sleep & recovery science / Gym & training motivation | S+L | photo-stories | habit → mechanism (evidence tier) → routine → risks | medical | NEW |
  | 10 | myth-vs-science | (same 3) | S | stats-counters | health myth → what studies show → safe takeaway | medical | NEW |
  | 11 | sleep-ritual | Sleep & recovery science | S+L | photo-stories | evening timeline → 3 interventions → tomorrow's payoff | medical | NEW |
  | 12 | shift-explainer | AI & future tech | S+L | explainer-diagrams | what changed → why it matters → who's affected → what to do | — | NEW |
  | 13 | tool-teardown | AI & future tech | S+L | browser-chrome | tool → 3 capabilities → honest limitation → verdict | — | NEW |
  | 14 | explain-it-diagram | Science & how things work | S | explainer-diagrams | question → mechanism in 3 steps → implication | — | NEW |
  | 15 | science-fact-stacks | Science & how things work | S | stats-counters | 3 facts, one mechanism each, tick-up | — | NEW |
  | 16 | paper-editorial | Science & how things work | L | editorial-headlines | essay argument → evidence exhibits | — | NEW |
  | 17 | dark-psychology-defense | Human psychology & social dynamics | S | photo-stories | tactic → how it works → defense move | — | NEW |
  | 18 | social-rule | Human psychology & social dynamics | S | beat-synced-type | observation → why humans do this → use/counter | — | NEW |
  | 19 | quote-principle | Timeless wisdom, self-mastery & human psychology | S | quote-cards-premium | quote → principle → challenge | — | NEW |
  | 20 | stoic-case-study | Timeless wisdom, self-mastery & human psychology | L | photo-stories | figure → adversity → decision → lesson | — | NEW |
  | 21 | deep-work-rule | Focus & productivity systems | S+L | beat-synced-type | system → daily practice → payoff | — | NEW |
  | 22 | focus-ritual | Focus & productivity systems | S+L | kinetic-typography | routine timeline → 3 moves → tomorrow | — | NEW |
  | 23 | founder-autopsy | Entrepreneurship & lean business / Sales & negotiation psychology / Leadership & management wisdom | L+S | documentary-frames | failure → the mistake → transferable rule | — | NEW |
  | 24 | pricing-principle | (same 3) | S | stats-counters | counterintuitive pricing idea → example numbers → rule | — | NEW |
  | 25 | deal-move | Sales & negotiation psychology | S | beat-synced-type | scenario → the move → why it works → script line | — | NEW |
  | 26 | map-strategy | Travel & geography explained | S+L | map-journeys | why is this place/line like this → answer → implication | — | NEW |
  | 27 | country-ledger | Travel & geography explained | S | map-journeys | country → 3 structural facts → what it means | — | NEW |
  | 28 | doc-history-rise-fall | History stories | Doc | documentary-frames | origin → peak → fatal flaw → collapse → lesson | — | NEW (doc) |
  | 29 | doc-money-weekly | (finance trio) | Doc | finance-explainers | weekly ledger: one principle, sourced numbers, chart chapters | finance | NEW (doc) |
  | 30 | doc-shift-briefing | AI & future tech | Doc | explainer-diagrams | week in AI: what shipped → why it matters → what to watch | — | NEW (doc) |
  | 31 | doc-science-explained | Science & how things work | Doc | explainer-diagrams | one mechanism, deep chapters | — | NEW (doc) |
  | 32 | doc-evidence-review | (health trio) | Doc | photo-stories | one claim, the evidence tiers, safe takeaway | medical | NEW (doc) |

  33 ≥ 30. Every entry: `variation_rules` per D3, `safety` per D4, niches exact per D15. Family bindings are authoring data — changeable without code; the only hard rule is formats ⊆ the family's aspectRatios. Niches at target counts: history 4+1doc, finance 3+1+1doc, health 3+1doc, tech 2+1doc, science 3+1doc, psychology 2, motivation 2, productivity 2, business 3, travel 2.
- **D8 — Authoring order (risk-descending).** Batch 1 (zero safety surface): travel ×2, tech ×2, science ×3. Batch 2: psychology ×2, productivity ×2, motivation ×2, business ×3, finance myth-vs-money. Batch 3 (heaviest review): health ×3 — full §2.2 safeguard pack: claim allowlist, prohibited-claims list, source requirements, disclaimers, review gate `medical`, disclosure default. Batch 4: the 5 doc entries. Batch 5: retrofit assignments on the 4 active channels (OQ-8).
- **D9 — The consumers are real.** The owner's 4 active channels (`yt-mcp/studio-channels.json`, each with cron/docDay/destinations), the 12 parked brands (kit niche strings already fixed in `studio/lib/brands.json` — AI & future tech, Focus & productivity systems, the three health strings, the three business strings…), and the panel wizard's existing template picker (`studio/app/channels/add/page.js:402`).

### S3 — The thumbnail template registry

- **D10 — NEW data file + loader, mirroring the video registry.** `studio/lib/thumb-registry.data.js` (NEW) + `studio/lib/thumb-registry.js` (NEW loader: validate + resolve per channel, fail-closed like `loadRegistryTemplates`). Schema per entry: `template_id` (must exist in `thumb-catalog.json`'s 42), `niches[]` (same verbatim vocabulary), `formats` (short/long), `required_inputs` (`photo`/`face`/`none` — the renderer's existing inputs: `photoHref`, `faceImage`, `accentWord`, `thumb-templates-v2.js:182–196`), `candidate_count` (numeric — the Phase 4 seam already honors truthy=3/numeric, QA Row T5b-4), `rotate` (true). Exit gate ≥15 entries; the launch set is 18 (table in the task plan) covering all 10 niches from the 42 designs, e.g. luxury (gold-standard, marble, pillar) → finance/old-money; doc-style (field-notes, dossier, ledger) → history/travel/business; tech (terminal, data-callout, changelog) → tech/AI; curiosity (question-economy, redact, tease-chip) → science/psychology; bold-impact (ketchup, summit) → motivation/productivity; quote (slab-quote, serif-frame) → motivation; split-verdict → finance+health myth-vs; badge-circle → productivity/business.
- **D11 — Brand-token binding is kit data, zero per-channel code.** The renderer already accepts `accent`, `shade`, `brand`, `photoHref`, `faceImage` — bound from the kit's existing fields (`accent`, `bg`, `label`, face asset), the same inputs the Studio preview/bulk routes use (`/api/thumbs/preview`, `/api/thumbs/bulk`). A registry entry MAY pin a token (e.g. a light-bg design ignores the kit's dark `bg`). Owner crisp-edges rule (no drop-shadow/blur/glow) is already enforced inside the renderer — restated as an authoring bar, never a per-template option.
- **D12 — Candidate wiring rides the Phase 4 seam.** Where a channel has a thumb registry set AND picking is enabled, render produces N candidates: **candidate 1 stays today's frame thumbnail** (regression pin — `thumbFrameOffset(0)===3` is load-bearing), candidates 2..N are registry renders (SVG → sharp → JPEG ≤2 MB, the YouTube cap). Selection rotates the channel's set so consecutive uploads never reuse a layout (last-used id recorded in the channel state file). Candidates land through the EXISTING flow: `emitThumbCandidates` (`lib/review-seams.mjs:216`) → artifact bytes + `meta.thumb_candidates [{idx,url,hash}]` → `/review` pick → `thumbnails.set` swap before publishAt (~50 quota units/swap; after publishAt recorded, not applied — Phase 4 D18 unchanged).
- **D13 — Assignment storage: kit JSONB, not a new table (OQ-3).** `channel.kit.thumbTemplates = [template_id…]` (2–3), protected by the T4d field-level kit merge (`studio/lib/channels-registry.js:211-219` — the merge exists precisely so partial kit writes never wipe stored keys), surfaced in the channel panel next to the video-template panel and browsable per-niche on `/thumbs`. A dedicated `channel_thumbnail_templates` table (master plan §2 name) is deferred until a relational join needs it; the registry index itself can later mirror into Neon by the same sync pattern if the panel needs it — not needed for 30 channels.
- **D14 — Fail-soft inputs rule.** IF a set entry requires a photo/face input the channel lacks, THEN candidate generation skips that entry and uses the next eligible one; the upload NEVER blocks on a thumbnail (same fail-soft as Phase 4's per-variant rule). WHERE no set is assigned, today's single frame-candidate path continues byte-identically.

### S4 — Documentary-lane templates

- **D15 — Doc template shape = registry entry with a doc story structure.** Formats `['long']`; `story_structure.sections[]` maps onto the EXISTING episode contract (`validEpisode` — title, intro/cold open, ≥5 chapters × ≥70 words, outro; `yt-deepdive.mjs:82`) — the validator keeps enforcing the same floor; the template declares the plan the brain writes toward (chapter count, section beats, title pattern) and the review class. SRT captions, pooled doc dedupe chunk, generate-only → approve → resume-from-stored (T5c) all continue unchanged. Doc templates count toward the 30+ (they are assignable registry entries; only channels with a docDay produce them weekly).

### S5 — The Urdu deferral

- **D16 — Documented decision point, zero build.** The two options, from verified research: **(a) Piper `ur_PK`** — the only permissive-license open voice found; quality UNVERIFIED, needs a listening test; original repo archived, GPL-3.0 successor is fine used as a subprocess (`research/platform-oss-video-stack-2026-10-24.md` lines 14/101/116, §9 Q1). **(b) Azure `ur-IN`/`ur-PK` neural voices** — the only mainstream provider shipping Urdu; free tier F0 ≈ 0.5M neural chars/month, account + subscription required; edge-tts exists as an unofficial gray-zone fallback, explicitly NOT acceptable as the default (`research/platform-byok-providers-2026-10-24.md` lines 16/73, risk 6). **Listening-test plan (30 minutes, any day, no build):** one narrator script ≈ 150 words rendered by both voices; owner blind-listens on phone speaker + earbuds; scores clarity/naturalness 1–5. Decision rule: both ≥4 → prefer Piper (no vendor, free); either <3 → Urdu waits or goes Azure-paid; record the decision + scores in `research/`. Until decided: no language-parameterized templates are authored (master plan slice 4), and any future Urdu kit blocks on this card.

### Cross-slice

- **D17 — Niche vocabulary fixed now (the exact-string footgun).** Canonical strings for the 10 launch niches: the 12 strings already living on kits and in `niches.js` where they exist ('History stories', the finance trio, 'AI & future tech', 'Focus & productivity systems', the three health strings, the three business strings, 'Timeless wisdom, self-mastery & human psychology') + two NEW canonical strings: **'Science & how things work'** and **'Travel & geography explained'**, plus one NEW standalone psychology string **'Human psychology & social dynamics'** (OQ-4 can rename before first kit — after that, renaming means editing every template that names it). Wizard catalog entries for the three new strings are data additions in `studio/lib/niches.js`. Rule restated for authors: a template's `niches[]` must copy channel niche strings EXACTLY — paraphrase = silent `niche_mismatch`.
- **D18 — No new render visuals.** Templates bind EXISTING catalog families and lane styles; no new Remotion family authoring in Phase 5 (Honest Limits). Where a niche's structure needs a visual the families can't express (e.g. true VS-splits), the structure rides the nearest family and the gap is recorded for a Phase 6+ visual pass.

## Testing Decisions

- Unit: validator extension (template_id defaulting to family id; story_structure required-on-new, optional legacy; disclaimers required when class is medical/finance; formats ⊆ family aspectRatios); thumb-registry loader (unknown catalog id rejected; fail-soft input rule; rotation never repeats back-to-back); candidate wiring (candidate 1 = legacy frame; 2..N = registry renders with kit tokens; JPEG ≤2 MB).
- Integration: `sync-template-registry.mjs --dry` over the full 33-entry catalog exits 0 with all assignable; the thumb sync listing ≥15 entries with niche coverage for all 10 launch niches.
- Regression pins (house pattern): the legacy 7 sync/assign with zero drift (template_id absent = family id); removal-refused guard intact (`template-registry-db.js:113-115`); unassigned channels byte-identical prompts; no-set channels byte-identical single-candidate path; flags-off lanes unchanged.
- Per-template QA gate rows (D6) in the phase QA file — one row per template, evidence quoted, executed with force_doc/state-edit discipline.
- No live Neon or live YouTube in unit CI (house pattern).

## Honest Limits

- **Variation rules are prose.** Humans and the review desk enforce the words; the machine enforces thresholds, title dedupe, seed rotation. A rule the machine cannot check is labeled as such — the catalog never pretends otherwise.
- **Quality bars cannot make content good.** The authoring pipeline raises the floor (structure, sources, disclaimers, gates); the owner's eyes at `/review` remain the real quality gate (Phase 4's stance, unchanged).
- **No new visuals.** 30+ templates distribute across 18 existing families + lane styles; some niches share a visual family with different stories. A dedicated motion-graphics pass is Phase 6+ if the data says a niche needs it.
- **Niche traction data doesn't exist yet.** Templates are authored from research + owner judgment; per-template win rates start accruing only after assignment (Phase 4 D20) — expect empty for weeks. The Phase 6 keep/kill review is the first data-driven catalog cull.
- **Exact-string niches are a footgun.** Matching is verbatim; the spec fixes canonical strings and the QA gate catches mismatches at authoring, but a future kit typo silently mismatches. The niche-tables refactor (master plan §2) stays out of scope.
- **Thumb renders are 1280×720 16:9 designs.** Shorts display crops; the API path for Shorts thumbnails keeps its open verification question from the niche research §9.2 — unchanged by this phase.
- **Urdu stays blocked.** No template, no kit, no TTS work until the D16 decision lands.

## Out of Scope

Language-parameterized templates and the Urdu build (S5 is a decision card); new Remotion/visual family authoring; fork-to-customize and community templates (Phase 1 out-of-scope list, unchanged); niches/channel-niches taxonomy tables and sub-niche weighting; thumbnail Test & Compare auto-entry; new TTS providers; per-channel explicit formats field (`template-registry.js` PHASE-2 UPGRADE note); the Neon `channel_thumbnail_templates` table (D13 defers it); win-rate dashboards (exist from Phase 4); SaaS anything; client role.

## Acceptance Criteria (EARS)

### S1 — Authoring system

- AC-P5-1: WHEN a template entry is authored with `template_id` and `family`, the sync dry run shall validate it and list it as assignable; IF any required block is missing, malformed, or paraphrases a niche string, THEN the sync shall exclude the entry, name every error, and exit 1.
- AC-P5-2: WHEN a new template omits `story_structure`, or a `medical`/`finance` template omits `disclaimers`, THEN the validator shall reject it with a named error; WHEN a legacy entry (the existing 7) lacks the new fields, THEN the validator SHALL CONTINUE TO accept it unchanged.
- AC-P5-3: WHEN a generation runs on a channel whose assigned template declares `story_structure`, the prompt shall include the template's structure spec and the produced script's shape shall match it (plain-English spot-check); WHEN no template is assigned, the kit-level structure line SHALL CONTINUE byte-identical.
- AC-P5-4: WHEN a template declares `disclaimers`, the generated script shall contain each fixed disclaimer text where the structure places it, and `/review` shall show it in the script body.
- AC-P5-5: WHEN the variation gate runs for an assigned template, the similarity thresholds shall come from that template's DATA when declared, else the documented defaults (0.85 / 0.90).

### S2 — The catalog

- AC-P5-6: WHEN the phase closes, the registry shall list ≥30 assignable video templates across all 10 launch niches (≥2 story structures in every niche), each with niche, formats, family, review class, and variation rules visible in `/templates/registry`.
- AC-P5-7: WHEN a template's QA gate row is checked, "in the catalog" shall mean every D6 row has quoted evidence; a template without its QA row shall not be counted toward the exit gate.
- AC-P5-8: WHEN a channel's niche string exactly matches a template's `niches[]`, the panel shall offer the assignment; IF niche, format, capability, or renderer mismatch, THEN the validator SHALL CONTINUE TO refuse with its named reasons.

### S3 — Thumbnail registry

- AC-P5-9: WHEN the phase closes, the thumbnail registry shall list ≥15 entries covering all 10 launch niches, each bound to an existing thumb-catalog design and to brand-kit tokens.
- AC-P5-10: WHEN a channel with an assigned thumb set renders with picking enabled, the render shall produce N candidates of which candidate 1 is today's frame thumbnail (unchanged bytes logic) and candidates 2..N are registry renders wearing the channel's brand tokens; the pick flow SHALL CONTINUE TO be candidates → `/review` → `thumbnails.set` swap before publishAt.
- AC-P5-11: WHEN consecutive uploads select registry renders, the same layout shall not be used back-to-back (rotation via the channel state file).
- AC-P5-12: IF a set entry requires a photo or face input the channel lacks, THEN candidate generation shall skip it and use the next eligible entry, and the upload shall never block; WHERE no set is assigned, the single frame-candidate path SHALL CONTINUE unchanged.

### S4 — Doc lane

- AC-P5-13: WHEN a doc template is assigned to a channel with a docDay, the weekly episode shall follow the template's section plan within the existing episode contract (title, cold open, ≥5 chapters × ≥70 words, outro) with SRT captions and the pooled dedupe chunk unchanged; IF a doc template declares a review class, THEN the doc lane's existing generate-only → hold → approve → resume-from-stored loop SHALL CONTINUE to govern it.

### Cross-slice + exit gate

- AC-P5-14: WHEN a channel in ANY launch niche is configured end-to-end (niche + 2–5 video templates + thumb set + BYOK coverage check + cadence), no code edit shall be required at any step — the walkthrough drill (Drill A) proves it per niche.
- AC-P5-15: The legacy 7 templates SHALL CONTINUE TO sync, assign, pin, and gate exactly as today (template_id absent = family id); the removal-refused guard SHALL CONTINUE to refuse deleting an actively assigned entry.
- AC-P5-16: WHERE review_thumb_pick is enabled on a template, its candidate behavior SHALL CONTINUE exactly as Phase 4 shipped; Phase 5 changes only WHERE candidates 2..N come from.

### Exit-gate drills (master plan line 171 — force_doc/state-edit discipline, evidence quoted in the QA file)

- **AC-P5-Drill-A (zero-code channel config, per launch niche):** for one niche lacking any live channel (recommend travel; the drill repeats per niche across the phase), configure a channel fully from data: kit niche string per D17 → assign 2 video templates + a thumb set in the panel → BYOK capability check passes → cadence saved (gate cron re-derived per the existing T4a flow) → one forced produce publishes (or holds correctly if the template is gated). PASS = every step in the panel or in data files; any code edit FAILS the drill.
- **AC-P5-Drill-B (variation gate + review routing per class):** on a real catalog template carrying `medical`, run a forced generation with an unverified fixture claim — PASS = script holds at `/review`, nothing renders/uploads (extends Phase 4's Drill-3 proof from a disposable template to a real catalog entry); on a template with explicit thresholds, force a near-duplicate — PASS = the gate BLOCKs with the evidence row. The `finance` class is already live-proven (Phase 4); the `all` class gets one hold proof.
- **AC-P5-Drill-C (thumbnail candidates from the registry):** on an enabled channel with an assigned set, one forced render produces candidate 1 (frame) + registry candidates wearing kit tokens; a `/review` pick before publishAt swaps via `thumbnails.set`; a rotation check confirms no back-to-back layout repeat.

## Open Questions (owner review required — each with a recommendation and default)

1. **Template identity vs visual family (D1).** Split them (`template_id` + `family`, ~6 small code touches) so 30+ distinct templates can share 18 looks — or author 30+ family entries (zero code, muddier data, every visual tweak touches N entries)? **Recommendation: split. Default: proceed with template_id; OQ-1 answer gates the task-level plan.**
2. **Who authors the templates (D5).** Recommendation: LLM drafting pass (from this spec's map + the research concept rows) → owner review per template against the plain-English checklist → machine gates → sync. Alternatives: owner authors raw (slow) or agent ships unreviewed (rejected — this phase IS the content library). **Default: the proposed pipeline.**
3. **Thumbnail assignment storage (D13).** Kit JSONB (recommended — the T4d field-level merge already protects it; zero new tables) vs the master-plan `channel_thumbnail_templates` table (relational parity, more plumbing). **Default: kit JSONB.**
4. **Thumbnail set sizing per niche (D10).** 2 per niche (~20 entries) vs the ≥15 exit floor. **Recommendation: 2 per niche minimum, 18 at launch; grow from win-rate data. Default: 18-entry launch set.**
5. **Parked-brand revivals in v1.** The catalog covers all 10 niches, but do the 12 parked brands get revival kits + assignments in Phase 5, or does kit authoring wait for Phase 6 onboarding? **Recommendation: catalog for all 10 niches; kits/assignments only where a revival is planned next (health/tech/productivity/business kits exist already); parked revivals are Phase 6 work. Default: as recommended.**
6. **Health review class naming (D4).** One class `medical` for everything body/health-adjacent (recommended — matches the validator comment and Phase 4's Drill-3 precedent) vs splitting `health` (habits) from `medical` (clinical). **Default: single `medical`; `health` stays valid but unused.**
7. **Structure strictness (D2).** Template structure OVERRIDES the kit's structure line when declared (recommended — deterministic distinct structures are the policy safe harbor) vs advisory-only. Kit keeps voice/pacing/title fields the template omits. **Default: override.**
8. **Retrofit the 4 active channels (D8 Batch 5).** Assign 1–2 new catalog templates to each active channel now (multi-template assignment proof; win-rate denominator grows) or leave the legacy 4 untouched until Phase 6? **Recommendation: retrofit. Default: retrofit, one channel first as the pilot.**
9. **Urdu timing (D16).** Run the 30-minute listening test right after Phase 5 QA with the decision recorded, build deferred — or defer the whole decision card? **Recommendation: test at phase wrap-up. Default: test at wrap-up, no build either way.**

## Fixed by the master plan (not questions)

The 30+ / ≥15 exit numbers; the 10 launch niches and the channel allocation (own-portfolio §4); "data-heavy, code-light"; the Urdu build deferral until the TTS decision; no-static-maps (adding template #31 = data only); planning-first (this spec → owner approval → task-level plan → authoring).

## Data vs Code (the phase ledger)

- **DATA (the actual deliverable — authoring):** all 26 new registry blocks (`studio/lib/template-registry.data.js`) incl. story structures, variation rules, safety blocks, disclaimers; thumbnail registry entries (NEW `studio/lib/thumb-registry.data.js`); 3 new canonical niche strings (`studio/lib/niches.js`); per-template QA-gate rows (phase QA file); kit/thumb-set assignments on the panel; the Urdu decision card (research file).
- **CODE (small, named):** (1) template_id + family support through validator → sync → DB → panel → preflight → brain join; (2) story_structure + disclaimers prompt threading (`youtube-engine.mjs` — the template meta is already resolved there); (3) thumb-registry loader + candidate-source wiring + SVG→sharp→JPEG encode; (4) panel surfaces: registry browser thumb tab + channel thumb-set picker; (5) `sync-template-registry.mjs --thumbs` mode. Everything else in this phase is writing and reviewing data.

## Suggested Build Order

Serial spine: **T1 schema v2 code** (D1/D2/D4 validator+sync+prompt threading — everything else authors against it) → **T2 Batch 1 authoring** (travel/tech/science, 7 templates + QA rows) → **T3 Batch 2** (psychology/productivity/motivation/business/finance ×8) → **T4 Batch 3** (health ×3, safeguard review with the owner) → **T5 thumbnail registry** (loader + wiring + panel, code) then the 18 entries (data) → **T6 Batch 4** (5 doc templates) → **T7 retrofit + drills** (active-channel pilot assignment; Drills A/B/C; per-niche zero-code walkthroughs) → **Urdu listening test session** (30 min, decision recorded). T5's code can start any time after T1 (independent seam); every authoring batch ends with its QA rows quoted. Studio changes deploy `cd studio && vercel --prod` per push; pipeline touches stay flag-gated with byte-identical rollback. Task-level plan per the master plan workflow after owner answers.

---
*Revision history: v1 draft, 2026-11-01 — authored from the master plan Phase 5 (lines 165–171) against verified repo ground truth: 18 catalog families / 7 registry entries (`studio/lib/templates-catalog.js`, `studio/lib/template-registry.data.js`), the validator vocabulary (`studio/lib/template-registry.js:9`), sync + removal-refused (`sync-template-registry.mjs`, `studio/lib/template-registry-db.js`), brain thresholds (`youtube-engine.mjs:622`), kit-driven structure lines (`youtube-engine.mjs:767-789`), the 42-design thumb catalog + parametric renderer (`studio/lib/thumb-catalog.json`, `studio/lib/thumb-templates-v2.js`), the Phase 4 candidate/review seams (`lib/review-seams.mjs:216`, QA rows T5b-1..T5c-1), the doc lane contract (`yt-deepdive.mjs:82`), the 15 kits / 4 active channels / 12 parked (`studio/lib/brands.json`, `yt-mcp/studio-channels.json`, QA T2 addendum), the niche concept table (platform-niche-template-system §2.1), the safeguard pack (§2.2), the Urdu inputs (platform-oss-video-stack §2.2/§9; platform-byok-providers TL;DR-2/risk 6). Nine owner questions flagged; awaiting answers before the task-level plan.*
