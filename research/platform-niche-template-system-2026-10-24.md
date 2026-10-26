# Niche & template system — platform research 2026-10-24

Read-only research round for the v2 template-driven multi-tenant SaaS (users pick niche + sub-niches + video templates + thumbnail templates + BYOK providers; ~10–15 niches at launch; adding a niche later must be a data change, never a code change — the owner's no-static-maps directive). No code was changed. Continuity: builds on `research/video-templates-architecture-and-competitors-2026.md`, `research/ready-made-video-templates-platforms-and-opensource-2026.md`, `research/youtube-thumbnail-templates-research-2026-10-18.md`, `research/thumbnail-templates-2026-research.md`, `research/thumbnail-catalog-2026-10-11.md`, `research/thumbnail-studio-plan-2026-10-10.md`, `research/scalable-channel-factory-2026-10-05.md`, `research/product-saas-blueprint-2026-10-04.md`, `research/faceless-youtube-saas-landscape-and-studio-roadmap-2026-10-09.md`. All external claims cite primary sources fetched 2026-10-24 unless noted. First-party evidence cites repo file paths. **Nothing in this document guarantees growth or profit; niche performance claims are heuristics unless explicitly marked measured.**

---

## 0. TL;DR

| Question | Verdict | One line |
|---|---|---|
| Launch niches | **10 at launch (8 validated in-house + 2 high-fit additions), 5 more on a data-only roadmap** | 8 niches are already validated by the owner's own 15-kit registry (`yt-brands/brands.mjs`); add history + travel/geography; park food, animals, sports, language learning (phase 2), storytelling (policy risk). |
| Highest-risk launch niches | **Health and finance carry mandatory safeguard packs** | Health is covered by YouTube's medical-misinformation removal policy; finance is covered by the spam/scam policy and ad-suitability scrutiny — templates in these niches ship with claim allowlists, source requirements, disclaimer beats, and a fail-closed human-review gate. |
| Template storage | **Hybrid: git-versioned declarative JSON catalog (source of truth) + Neon registry tables + code-defined Remotion beat primitives** | Templates are data (one JSON file = one template, matching the proven thumbnail v2 pattern); Neon indexes them for tenancy/analytics/bindings; beat primitives stay code. Adding a niche = taxonomy rows + template JSON; zero code. |
| Versioning | **Immutable semver versions in git; projects pin MAJOR; fork = copy-on-write with lineage** | SemVer 2.0.0: "Once a versioned package has been released, the contents of that version MUST NOT be modified" (semver.org). CI golden-sample renders gate every bump. |
| Config model | **User → Workspace → Channel → (primary + secondary niches from a global taxonomy) → Strategy → TemplateBinding → Project/Schedule** | Global niche taxonomy tables (platform data) + many-to-many channel↔niche with a `primary` role; matches the blueprint's workspace schema and supports multi-niche channels and template recommendation joins. |
| Workflow customization | **Progressive disclosure, exactly 2 levels (NN/g: "designs that go beyond 2 disclosure levels typically have low usability")** | Wizard = 7 essential decisions (mirrors AutoShorts' proven topic→voice→caption→review flow); everything else in a grouped "Advanced" tab on channel settings. |
| Thumbnail system | **First-class, JSON-spec catalog, N candidates per render, compatibility validated pre-generation** | YouTube specs re-verified today (2026-10-24): 16:9 3840×2160 recommended / 640px min / 50MB desktop / **2MB mobile** / JPG+PNG — and Shorts thumbnails are now officially specified (2160×3840 recommended, desktop-Studio-only, verified account required). |
| The existential product risk | **YouTube's inauthentic-content policy names "template" content directly** | Official text: "content that looks like it's made with a template" is ineligible for monetization; "AI-generated content made with generic or unoriginal templates giving the impression of mass production" is called out verbatim. A template platform must therefore engineer per-video material variation as a first-class feature, not an afterthought. |

---

## 1. Niche validation — the 15 candidates (§5.1)

### 1.1 First-party portfolio evidence (what the owner's own channels prove)

The repo itself is the strongest niche-validation dataset available, because every niche on the platform shortlist already exists as a brand kit in `yt-brands/brands.mjs` (15 kits; 16 channel slugs in `yt-mcp/channels/*/token.json` — `debt-free-doctrine` and `old-money-code` are one channel, rebranded in-place per the comment at `yt-brands/brands.mjs:96`: "rebranded 10-03: was DEBT-FREE DOCTRINE (0 subs — dead niche); identity = parked old-money-code").

| Niche candidate | Owner kits (file: `yt-brands/brands.mjs`) | Production status (`yt-mcp/studio-channels.json`) |
|---|---|---|
| Personal finance / investing | investors-compass, money-rulebook, debt-free-doctrine→OLD MONEY CODE, escrow-estate (real estate), policy-brief (insurance), tax-shield | **2 live + autopilot** (IC, MR); OMC rides on the active DFD slot; 3 parked (`active: false`) |
| Business / entrepreneurship | founders-margin, corner-office (leadership), closing-table (sales/negotiation) | kits ready, not in active rotation |
| Motivation / self-improvement | quotequarry (timeless wisdom, self-mastery) | **1 live + autopilot** |
| Psychology | quotequarry sub-niches ("human psychology & respect", "dark psychology defense") + closing-table ("sales psychology") | live as sub-niche, not standalone |
| Health / wellness | longevity-code, sleep-architect, iron-discipline (fitness) | kits ready, not in active rotation |
| Productivity / focus | deep-work-os | kit ready |
| Technology / AI | ai-observer | kit ready; comment in file: "$8-20 (AI/tech, fastest growth)" |
| Educational explainers | all 15 kits run explainer-style scripts; `studio/lib/styles-catalog.js` has dedicated explainer styles (tech live, paper demo) | styles live in production |
| Real estate, insurance, tax | escrow-estate, policy-brief, tax-shield | parked |
| History, travel/geography, food, animals, sports, language learning, storytelling | **no kits — unvalidated in-house** | — |

**Measured performance data in the repo is thin and must be reported honestly:** the per-channel state files (`yt-mcp/state/investors-compass.json`, `yt-mcp/state/debt-free-doctrine.json`, `yt-mcp/state/money-rulebook.json`, `yt-mcp/state/quotequarry.json`, `yt-mcp/state/fajrofquran.json`) contain `titleHistory`, `lastVideos`, `usedThemes`, and `usedTrendSeeds` but **no view/retention counts** (verified by grep for `viewCount|views|view_count` across `yt-mcp/state/` — zero matches). What *is* measured: competitor viral videos with view counts in `yt-mcp/trends-<slug>.json` (e.g. `yt-mcp/trends-investors-compass.json` top seed 415,530 views), and the documented Quote Quarry episode in `research/qq-view-collapse-recovery-2026-10-05.md`: QQ hit "3,251 views Sep 30" then lost distribution for 4–5 days while "avgWatched 58–81%" — i.e. retention was healthy and the Shorts feed stopped testing the videos; the same doc records "Docs (10+ min) get 0–37 views everywhere — never had distribution." Current production reality is in `research/production-audit-2026-10-23.md` (3-day pipeline outage found and fixed; clips lane #95–#101 in rollout).

**Portfolio verdict (RECOMMENDATION, not measured fact):** finance and motivation/wisdom are the only niches with any live production track record, and even that record is early-stage (4 active channels, one documented distribution shutdown, no YPP data in repo). The 15-kit registry validates *niche definitions, brand-kit structure, and script/title formats in production* — it does not yet validate *audience traction* by niche. Build the platform taxonomy on the kit structure (it works operationally), but do not market "proven niches" until Analytics data flows into the repo (open question, §9).

### 1.2 Policy exposure map (YouTube-official, fetched 2026-10-24)

The assignment's premise is confirmed and sharpened by the official pages:

- **Health is a removal-risk niche.** YouTube's medical misinformation policy (support.google.com/youtube/answer/13813322) removes content contradicting "local health authority (LHA) guidance" on prevention/treatment of specific conditions, including the harmful-substances list and unapproved cancer treatments; enforcement escalates "warning → strike → termination" within rolling 90-day windows. Educational/documentary/scientific context is an explicit exception — which is exactly the framing templates must enforce.
- **Finance is a scams/ad-suitability niche, not a misinformation-removal niche.** The spam policy (support.google.com/youtube/answer/2801973) bans "Promoting 'get rich quick' investment schemes, fake job offers, or sharing fake 'customer support' contact information". The advertiser-friendly guidelines (support.google.com/youtube/answer/6162278) contain **no dedicated financial-misinformation category** — finance videos are mostly scrutinized under general ad suitability, so the realistic risk is limited ads and scam-policy strikes (if a template ever generates a promise of returns), not systematic removal.
- **Both are "template-farm" magnets.** The monetization policy (support.google.com/youtube/answer/1311392, updated 2025-07-15) explicitly names the failure mode for a template platform: ineligible content includes "content that looks like it's made with a template", "Image slideshows, templated storylines, or scrolling text with minimal or no narrative", and "AI-generated content made with generic or unoriginal templates giving the impression of mass production", and "channels where content feels interchangeable from video to video are not allowed to monetize". Crucially, the same page says series formatting is allowed: "Same intro and outro for your videos, but the bulk of your content is different" and "each video has a distinct storyline, focus, or concept" — **that sentence is the design spec for the whole template system.**
- **AI disclosure is mandatory but neutral.** The synthetic-content policy (support.google.com/youtube/answer/14328491) requires disclosure when content "makes a real person appear to say or do something they didn't do", "alters footage of a real event or place", or "generates a realistic scene that didn't actually occur"; non-disclosure can bring "removal of content or suspension from YPP", while "Disclosing AI content alone won't limit a video's audience or impact its eligibility to earn money". Voice-only TTS narration of original scripts is *not* in the disclosure-required list (the page exempts "cloning your own voice for voiceovers" — third-party synthetic narrators sit closer to the edge; disclose anyway when the voice is synthetic and photorealistic-style visuals are generated).
- **Industry corroboration (operator guide, not official):** Blotato's niche guide ranks policy survivability — High: AI tools, B2B software, language learning, history recreation; Medium: personal finance, health/fitness, motivational, faith; Low: meditation/focus audio ("close to the definition of repetitive and mass-produced") — with the core line: "The line is not AI. The line is templates." (blotato.com/blog/best-faceless-ai-youtube-niches, fetched 2026-10-24).

### 1.3 The 15 candidates — evidence table

Legend: **Demand/competition/difficulty columns are heuristics** synthesized from the cited sources and the owner's kit comments — not measured data. Policy column cites official pages (Section 1.2). Verdict tiers: A = launch, B = add at launch if capacity allows, C = post-launch or park.

| # | Niche | Demand signals (heuristic unless noted) | Competition saturation | Production difficulty | Lawful visual assets | Evergreen | Shorts / long fit | Accuracy burden | Copyright exposure | Policy & monetization exposure | Automation potential | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Health / wellness | 3 owner kits target it; "huge watch time" per kit comment ($10–18 CPM heuristic) | HIGH (fitness/longevity Shorts are saturated) | LOW–MED (stock + AI backgrounds) | HIGH (Pexels/Pixabay commercial-licensed stock, fetched-license pages) | HIGH | Shorts strong; long-form needs chapters | **HIGH — removal policy applies** (LHA guidance) | LOW (original scripts) | **HIGH**: medical misinformation removal policy + "Harmful acts and unreliable content" ad category (6162278) | HIGH with safeguards | **A — safeguards mandatory** |
| 2 | Personal finance / investing | 2 of 4 live channels; "$30–50 finance #1 niche" (kit comment heuristic); "the most template-farmed niche on YouTube" (Blotato) | VERY HIGH | LOW–MED | HIGH (charts, city footage, AI) | HIGH | Shorts proven in-house; long-form docs weak so far (0–37 views, qq doc) | MED–HIGH (numbers must be sourced) | LOW | **MED–HIGH**: scams policy + ad-suitability; no dedicated misinfo removal policy; demonetization candidate if generic (Blotato) | HIGH with safeguards | **A — safeguards mandatory** |
| 3 | Motivation / self-improvement | QQ live; largest faceless category; Blotato: works "with a real voice attached" | EXTREME (the default AI-slop niche) | LOW | HIGH | HIGH | Shorts native | LOW | LOW (quotes are short/public-domain-era or licensed) | **MED**: prime inauthentic-content target (1311392 names templated storylines) | VERY HIGH — but that's the risk | **A — with variation engine** |
| 4 | Educational explainers | Whole kit library is explainer-shaped; evergreen how/why demand | MED–HIGH | MED (needs beat/diagram system — exists: video-templates doc §4) | HIGH | VERY HIGH | long-form strong, Shorts ok | MED (facts need sources) | LOW | LOW | VERY HIGH (beat system built for it) | **A** |
| 5 | Technology / AI | ai-observer kit: "fastest growth" (kit comment heuristic); Blotato survivability HIGH | HIGH and accelerating | MED (concepts need diagrams) | HIGH (terminals, code, AI b-roll) | MED (news decays, concepts persist) | both strong | MED (fast-moving facts) | LOW | LOW | VERY HIGH (Dark Tech template family already renders: `explainer/remotion/tech-explain.tsx`) | **A** |
| 6 | History | Blotato: "History Recreation… Original research is the product", survivability HIGH | MED | MED–HIGH (archival sourcing) | HIGH (public domain archives; Wikimedia/PD images) | VERY HIGH | long-form strong; Shorts ok | MED–HIGH (dates/causality) | LOW if PD/licensed archival | LOW (sensitive-events policy edge for wars — 6162278) | HIGH (Vox File / Noir Prestige families spec'd in video-templates doc §3) | **B** |
| 7 | Science / facts | adjacent to kits; evergreen curiosity demand | MED | MED | HIGH (stock + public-domain imagery, e.g. NASA) | VERY HIGH | Shorts native (fact shorts) | MED | LOW | LOW | VERY HIGH | **B (fold into educational-explainers)** |
| 8 | Psychology | validated as QQ + closing-table sub-niches | HIGH | LOW | HIGH | HIGH | Shorts native | MED (keep to behavioral/social science, not clinical claims) | LOW | MED (can drift into health claims if clinical) | HIGH | **A — scope guard** |
| 9 | Business / entrepreneurship | 3 owner kits; Blotato ranks B2B #1 by revenue per view; "$15–35 B2B" (kit comment heuristic) | MED–HIGH | LOW–MED | HIGH | HIGH | Shorts ok; long-form case studies | MED | LOW | LOW–MED | VERY HIGH (case-study + principle formats) | **A** |
| 10 | Travel / geography | map-strategy thumbnail template already catalogued (thumbnail-catalog #25); RealLifeLore-style demand | MED | MED | HIGH (stock aerials, maps, PD geography data) | HIGH | both strong | LOW–MED | LOW (map data licensing: use PD/open sources) | LOW | HIGH (map beats) | **B** |
| 11 | Food / cooking | no in-house kit | VERY HIGH | HIGH (food stock that doesn't look generic; recipes need testing) | MED (stock food b-roll ok; process shots hard) | MED–HIGH (recipes) | Shorts native (recipe shorts) but visual bar high | MED (safety: food safety is YMYL-adjacent) | LOW | LOW–MED | MED (weakest automation fit) | **C — park** |
| 12 | Animals / wildlife | no in-house kit | MED–HIGH | MED | HIGH (stock wildlife huge; PD sources) | HIGH | Shorts native (huge animal-Shorts demand, heuristic) | LOW | LOW with stock/PD | MED: "Made for Kids" COPPA classification risk drags monetization on animal content (heuristic; UNVERIFIED this session) | MED–HIGH | **C — park** |
| 13 | Sports education | no in-house kit | MED | MED | LOW–MED: highlight footage = rights-holder Content ID claims; training/tactics b-roll + original diagrams workable | MED | Shorts native for highlights (but those are the infringing part) | LOW | **HIGH** for any highlight-clip format (Content ID claims; YouTube copyright basics: none of the safe options "guarantee avoiding copyright issues") | MED (claims block monetization; 1–3 min Shorts with active claim are globally blocked per 15424877) | MED | **C — education-only, later** |
| 14 | Language learning | no in-house kit; Blotato survivability HIGH; RPM $5–12 [industry estimate via 2026 search — fluxnote.io, unverified]; global audience | HIGH (established players) | MED (+ i18n pipeline: TTS/visuals per language) | HIGH (text/animation native) | VERY HIGH | Shorts native (vocab drills); long-form courses | MED (wrong teaching = churn) | LOW | LOW | MED–HIGH (templates must be language-parameterized — the only real architectural lift) | **B-later (phase 2)** |
| 15 | Storytelling / fiction | no in-house kit; Reddit-story/AI-narration channels are the canonical inauthentic-content demonetization case (industry reports + Fliki/invideo survival guides, 2025–2026) | VERY HIGH | MED | MED (AI imagery everywhere = disclosure duty) | MED | Shorts native | LOW | MED (stories scraped from Reddit/social = copyright + ToS exposure) | **HIGH**: the policy's "templated storylines" and "characters… same situation over and over" clauses describe this niche (1311392) | HIGH — which is the problem | **C — park; the owner's doc lane (original narrative documentaries) is the compliant version** |

### 1.4 Launch shortlist (RECOMMENDATION)

**Launch with 10 niches:** (1) personal-finance-investing — with money-vertical sub-niches real-estate / insurance / tax / frugal-old-money; (2) business-entrepreneurship — sub-niches startup / leadership / sales-negotiation; (3) motivation-wisdom; (4) psychology; (5) technology-AI; (6) health-wellness — sub-niches longevity / sleep / fitness — safeguard pack required; (7) educational-explainers — sub-niches science-facts / how-things-work; (8) productivity-focus (deep-work OS kit proves it); (9) history; (10) travel-geography. **Roadmap slots (data-only additions):** language learning (needs language-parameterized templates), food, animals, sports-education, storytelling (only as original-fiction narrative). This satisfies "10–15 at launch" with the 5-phase expansion proving the no-code-change requirement.

---

## 2. Templates per niche (§5.2)

Formats below are **observation of what top channels and the owner's own production do — labeled observation, not prescription.** Every template concept is expressed as: story structure + visual treatment + workflow difference (the three axes that must differ for templates to count as "distinct" and to survive the inauthentic-content policy's material-variation test).

### 2.1 Template concept table for the launch niches

| Niche | Template concept | Story structure | Visual treatment | Workflow difference |
|---|---|---|---|---|
| Finance | **Money Rule** (proven in-house: money-rulebook `titleStyle: "numbered money listicle with a $ figure"`, `yt-brands/brands.mjs:91`) | N-rule listicle → payoff rule | Cinematic stock + numbered kinetic type (the daily shorts engine, `studio/lib/styles-catalog.js` 'cinematic') | Auto-research feeds trend seeds; numbered beats |
| Finance | **Market Wisdom** (proven: investors-compass `titleStyle: "authority + market-story"`) | Authority figure's principle → historical proof → modern application | Split-screen data cards + animated line charts + source lower-thirds ("Macro Ledger" family, video-templates doc §3.4) | Needs sourced-stat beat type; slower, calm narration preset |
| Finance | **Myth vs Money** (new) | Popular belief → why it's wrong → what to do instead | VS split + strike-through text beats | Myth library as data; policy: no specific securities, no returns promises |
| Health | **Habit Protocol** (matches longevity/sleep kits) | Habit → mechanism (evidence tier) → dosage/routine → risks | Calm stock + diagram beats; green palette kits | Evidence-tier badge beat (strong/limited/emerging); review gate ON |
| Health | **Myth vs Science** | Health myth → what studies show → safe takeaway | Two-column myth/fact cards | Claim allowlist enforced; no treatment/diagnosis claims ever |
| Health | **Sleep Ritual** (sleep-architect format) | Evening timeline → 3 interventions → tomorrow's payoff | Night-time stock, dimmed grade, timeline graphic | Time-of-day structured beats (unique to this template) |
| Motivation | **Quote Principle** (proven QQ format) | Quote → principle → challenge to viewer | Dark bg, giant type, statue/AI backdrop | Minimal; the variation engine matters most here |
| Motivation | **Stoic Case Study** | Historical figure → adversity → decision → lesson | Noir Prestige parallax (video-templates doc §3.3) | Long-form/episode length; chapter beats |
| Psychology | **Dark Psychology Defense** (QQ sub-niche, proven titles) | Manipulation tactic → how it works → defense move | Statue/figure imagery + red-accent warning beats | Tactic-library data source |
| Psychology | **Social Rule** | Observation → why humans do this → how to use/counter | Office/people stock + annotation beats | Research pulls from viewer-terms file |
| Business | **Founder Autopsy** (founders-margin format) | Company/founder failure → the mistake → the transferable rule | Noir doc treatment, archival photos | Case data must be verifiable public events |
| Business | **Pricing Principle** | Counterintuitive pricing idea → example numbers → rule | Number/stat counter beats ("Macro Ledger") | Numeric beats require sourced figures or illustrative labels |
| Sales/Negot. | **Deal Move** (closing-table format) | Scenario → the move → why it works → script line | Office stock + dialogue text-message beats | Script-line beat type (unique) |
| Tech/AI | **Shift Explainer** (ai-observer) | What changed → why it matters → who's affected → what to do | Dark Tech family: terminals, code typing, SVG flows (tech-explain.tsx live) | News-decay handling: template pairs evergreen framing with news hook |
| Tech/AI | **Tool Teardown** | Tool → 3 capabilities → honest limitation → verdict | Screen-style frames + tool-logo policy-safe renders | Requires tool-facts source step |
| Educational | **Explain-It Diagram** | Question → mechanism in 3 steps → implication | Animated SVG diagrams (Vox-style, built: vox-collage.tsx) | Diagram-first script structure (beats ask for nodes/edges) |
| Educational | **Paper Editorial** | Essay-style argument → evidence exhibits | Paper collage, washi tape, highlighter (paper style, `styles-catalog.js` status demo) | Long-form; exhibit beat type |
| History | **The File** (Vox File family) | Mystery/event → clue chain → resolution | Kraft paper, red string, newspaper stamps | Clue-chain beat sequence; PD-image sourcing step |
| History | **Rise & Fall** | Origin → peak → fatal flaw → collapse → lesson | Noir parallax + timeline beats | Chapter-heavy; episode length |
| Travel/Geo | **Map Strategy** | Why is this place/line the way it is → geography answer → implication | Dark map, glowing routes (thumbnail-catalog #25 pattern) | Map-data beat type; needs open/PD map sources |
| Travel/Geo | **Country Ledger** | Country → 3 structural facts → what it means for you | Split stat cards + aerial stock | Stat sourcing requirement |

### 2.2 Mandatory safeguard pack for high-risk niches (health, finance)

The template SPEC for any niche flagged `policyRisk: high` must include these fields, enforced at generation time (fail-closed), grounded in the official policies cited in §1.2:

1. **Claim allowlist** (`claims.allowed[]`): a per-niche list of claim *categories* the generator may assert (e.g. health: "sleep duration affects cognition — permitted, cite Sleep Foundation class sources"; finance: "pay-yourself-first is a budgeting heuristic — permitted"). Anything outside the allowlist must be rewritten to the nearest allowlisted claim or dropped.
2. **Prohibited-claims blacklist** (`claims.blocked[]`): hard bans checked in script review — health: diagnosis, treatment promises, cure language, contravention of health-authority guidance (medical-misinformation policy categories, 13813322); finance: return guarantees, price targets, "buy X", get-rich-quick framing (spam/scams policy, 2801973).
3. **Source requirements** (`sources.required`): every statistic beat must carry a source chip from an approved source list (per-niche data file — e.g. FRED/SEC/IRS for finance; WHO/NIH/CDC/Sleep Foundation for health) OR be marked `illustrative` and visually labeled as such. Unattributed numeric claims fail validation.
4. **Disclaimer beats** (`disclaimers[]`): mandatory fixed text beats — health: "Education, not medical advice" on first frame or outro; finance: "Education, not financial advice" (the tax-shield kit already ships this pattern: "Education, not advice", `yt-brands/brands.mjs:217`).
5. **Human-review gate** (`review: required`): the publish pipeline already has gates; for safeguarded niches the gate is mandatory and fail-closed — no auto-publish, exactly like the existing upload validation pattern (`research/production-audit-2026-10-23.md` documents the gate machinery culture).
6. **Disclosure flag** (`syntheticMediaDisclosure: auto`): if the visual strategy uses generated realistic scenes, the upload sets the altered-content disclosure (14328491). Policy quotes: disclosure "won't limit a video's audience"; non-disclosure risks removal/suspension — so default to disclosing.
7. **Variation requirement**: safeguarded niches must draw topics from the research loop (trends + viewer terms files already in production) so videos differ in substance, matching the allowed pattern "each video has a distinct storyline, focus, or concept" (1311392).

---

## 3. Template architecture (§5.3)

### 3.1 Storage approaches compared

| Approach | Pros | Cons | Fit to this stack (Next.js/Vercel/Neon + Node pipelines + GHA + no-static-maps) |
|---|---|---|---|
| **DB records only** (templates as Neon rows) | Tenancy joins, UI editing, per-workspace overrides trivial | No git review/diff of template changes; no portable catalog; versioning becomes hand-rolled migration; catalog authoring in a DB UI is slow and unreviewable | Weak — recreates the "registry kit" problem at catalog scale |
| **Versioned files only** (git, no DB) | Full review workflow; immutability for free; GHA can validate/render golden samples on every PR; portable | No relational joins (bindings/analytics); Studio needs a bundling/read path; per-workspace overrides need somewhere else to live | Good for the catalog, incomplete alone |
| **Declarative JSON catalog + one parametric renderer** (thumbnail v2 pattern) | "Adding a template = adding a JSON file. Zero code." (thumbnail research 2026-10-18 §6.1) — the literal no-static-maps compliance pattern; proven in-repo design | Same as "versioned files" (it is one, with a schema) — needs the DB half for tenancy | **Core of the recommendation** |
| **Code-defined plugins only** (every template a Remotion/TSX component) | Maximum per-template expressiveness | Every template/niche = a code change + deploy — violates the owner directive; not user-extensible; scales badly to 10–15 niches × multiple templates | Reject as the primary mechanism; keep for primitives |
| **Hybrid (RECOMMENDED)** | Git-versioned JSON catalog = source of truth (review, immutability, CI golden renders); Neon tables = index + bindings + per-workspace overrides + analytics; Remotion beat primitives = the code layer templates compose | Two sources must be kept consistent (mitigate: Neon rows are *derived* from the JSON catalog by a sync step; catalog is authoritative) | Proven pattern at thumbnail layer; extends to video layer |

**Recommendation (FACT-anchored):** replicate the thumbnail v2 architecture upward. The thumbnail research already established the in-repo precedent — `thumbnails/templates/*.json` consumed by one parametric renderer, with brand data in `thumbnails/brands/*.json` and template JSON referencing `brand.*` tokens (thumbnail research 2026-10-18 §6.1–6.2). Video templates take the same shape: `templates/video/<niche>/<template-slug>.v1.0.0.json` + `templates/taxonomy/niches.json` + `templates/taxonomy/subniches.json`; a GHA sync indexes the catalog into Neon (`templates`, `template_versions`, `template_niches`) on every merge; pipelines resolve a channel's binding (`template_id` + pinned `major`) through the DB, load the JSON from the repo/bundle, and render via shared beat primitives (`explainer/remotion/*`, beat schema already 80% done per video-templates doc §5).

### 3.2 Proposed field list — v1 vs later triage

| Field | v1? | Rationale |
|---|---|---|
| `id`, `slug`, `version` (semver), `status` (active/deprecated) | YES | Identity + versioning are structural (§5) |
| `nicheIds[]`, `subNicheIds[]` | YES | Joins to taxonomy; drives recommendations and compatibility validation |
| `formats[]` (short/long/explainer), `aspectRatio` (9:16/16:9), `durationBand` (e.g. 30–60s, 8–12min) | YES | Pipeline routing + render planning; Shorts cap context: 1–3 min verticals are Shorts since 2024-10-15 (15424877) |
| `languages[]` | YES (English-only list at v1) | Language-specific template matching is a launch requirement; multi-language *content* is phase-2 |
| `scriptStructure` (beat sequence spec) | YES | The heart: hook/chapter/body/payout ordering rules |
| `sceneStructure` (beat→layout mapping) | YES | Maps beats to Remotion primitives (`hero`, `chapter`, `split`, `stat`, `document`, `quote`, `diagram`, `outro` — beat types already defined, video-templates doc §4) |
| `visualStrategy` (source allowlist: stock/AI/upload + prompt presets) | YES | Licensing control + policy disclosure decisions |
| `narrationStrategy` (voice family, pace, tone tags) | YES | Existing voice chain (Kokoro/Edge/OpenAI) consumes it |
| `captionStyle` (ref to caption presets) | YES | Karaoke-highlight style is already the house standard (`styles-catalog.js`) |
| `musicStrategy` (mood tags → approved pools) | YES | `yt-brands/approved-music.json` pool pattern exists; Audio Library tracks are copyright-safe and monetizable (3376882) — but 3-min Shorts limit most songs to 90s (15424877), so the strategy must encode per-format music rules |
| `metadataRules` (title patterns, description schema, tag source) | YES | Title style/examples already live in kits (`brands.mjs` `script.titleStyle`) — move into template data |
| `safety` (claim allowlist, blacklist, disclaimers, review gate, disclosure flag) | YES for all niches (empty = low-risk default), MANDATORY content for health/finance | §2.2 |
| `defaults` (user-overridable defaults) | YES | Powers the wizard's "just works" path |
| `providerCompatibility` (required capabilities: TTS tier, image-gen, render host) | YES | BYOK vault exists (#28/#29 commits); validation prevents render-time failures |
| `userConfigurableParams` schema | MINIMAL v1 (the §4 essential set only) | Full param schema is UI work; expand later |
| `thumbnailRequirements` (link to thumbnail template ids) | v1: link-only | Thumbnail system is independent (§7); deep coupling later |
| `compatibilityRules` (explicit matrix) | LATER | Derive programmatically from niche×format×capabilities at v1 |
| Community-author fields, localization overrides, A/B-variant support | LATER | Post-launch |

---

## 4. Workflow customization (§5.4)

### 4.1 Essential vs advanced controls

**Essential (wizard, in order — mirrors the proven AutoShorts series flow "choose topic/niche → select voice → choose caption template → review → auto-post", autoshorts.ai, fetched 2026-10-24; and the owner's existing Add Channel wizard, `studio/app/channels/add`):**
1. Niche + sub-niches (multi-select)
2. Video template (visual cards, filtered by niche — recommendation-ordered)
3. Thumbnail template family (cards)
4. Voice (auditionable) + language
5. Posting cadence/slots (1/day + docDay defaults already codified, `research/upload-cadence-research-2026-10-05.md`)
6. Review mode (auto-publish vs approve-queue — the AutoShorts "Review your AI-generated video before it's posted" pattern)
7. Connect YouTube (OAuth — outside this research's scope, per blueprint Wall 1)

**Advanced (channel-settings tab, grouped collapsibles):** narration speed, caption style, visual style mix (stock vs generated), music mood/pool, intro/outro, CTA text, duration target, topic blacklist/exclusions, required sources, disclaimer text overrides, provider/model selection per capability (BYOK), tone/brand-voice fields, output format (16:9/9:16 per video), review-gate strictness (forced ON for safeguarded niches).

### 4.2 Progressive-disclosure pattern (evidence)

- NN/g (primary UX source, fetched 2026-10-24): progressive disclosure "deferr[es] advanced or rarely used features to a secondary screen", improves "learnability, efficiency, and error rate", but "designs that go beyond 2 disclosure levels typically have low usability because users often get lost", and two things must be right: "You must get the right split between initial and secondary features" and "It must be obvious how users progress from the primary to the secondary disclosure levels" (nngroup.com/articles/progressive-disclosure/).
- **RECOMMENDATION:** exactly two levels — wizard (7 essential decisions, all with recommended defaults pre-selected so a user can accept-all) and one Advanced surface (grouped, not nested). Explicit affordance: every wizard screen shows "Advanced options available after setup" (the NN/g "obvious progression" requirement).
- Competitor corroboration: AutoShorts ships the minimal 4-decision flow with review-before-post as a toggle (autoshorts.ai); faceless.video's "AI agent" one-prompt series is the zero-decision extreme that correlates with its quality complaints (faceless-youtube-saas doc §1a) — evidence that hiding *all* controls trades churn for confusion. The two-level pattern keeps the fast path without the trap.

---

## 5. Template versioning (§5.5)

### 5.1 Options compared

| Option | Behavior | Risk |
|---|---|---|
| Floating templates (render always uses "current") | Simple | Silent breakage: users' channels change look/behavior overnight; no rollback. Notably, even Creatomate's commercial docs describe a single-request "turn a template into a video" flow with no documented version-pinning mechanism (creatomate.com docs, fetched 2026-10-24) — pinning is a differentiator, not table stakes |
| Immutable versions, no scheme | Rollback possible | No meaning to version numbers; users can't judge upgrade safety |
| **Semver, immutable (RECOMMENDED)** | MAJOR = breaking (beat layout changes, required-input changes, safety-rule changes); MINOR = additive (new optional beats/params); PATCH = fixes | Requires discipline: a breaking change shipped as MINOR poisons trust (SemVer: even "tiny breaking changes warrant a major bump") |

SemVer 2.0.0 (semver.org, fetched 2026-10-24): MAJOR "you make incompatible API changes", MINOR "you add functionality in a backward compatible manner", PATCH "you make backward compatible bug fixes"; "Once a versioned package has been released, the contents of that version MUST NOT be modified".

### 5.2 Recommended strategy (RECOMMENDATION)

1. **Store in git as immutable files**: `templates/.../slug@X.Y.Z.json`. Editing = new version file + catalog pointer update, via PR. GHA validates schema + renders a **golden sample** (fixed seed topic → reference MP4 frames + thumbnail PNGs) for every version on every PR; a failed golden render blocks merge. This is the "verification before done" pattern the repo already mandates (AGENTS.md).
2. **Pinning**: a channel/project binding stores `templateId@MAJOR` only; MINOR/PATCH updates apply automatically (opt-out per binding). Users get a changelog entry in their dashboard: "Money Rule v1.3 → v1.4: added stat-card beat."
3. **Deprecation**: `status: deprecated` blocks *new* bindings, leaves existing ones running, and surfaces a migration suggestion ("v2 available; what changed"). Old versions never disappear (immutability guarantees renders reproducible forever).
4. **Fork/customize ("fork a template")**: copy-on-write — duplicating a template into the workspace creates `slug-fork@1.0.0` with `forkedFrom: templateId@X.Y.Z`; forks are workspace-private; "update from parent" merges non-conflicting MINOR changes (diff UI). This is how power users escape the sameness complaint (template sameness is THE recurring failure per faceless-youtube-saas doc).
5. **Community contributions**: PRs to the public catalog repo, gated by (a) schema validation + golden render, (b) a human review checklist including the policy screen (no claims outside niche allowlists, visual sources licensable), (c) the no-static-maps rule (a template referencing a specific channel/brand fails validation — enforce with a linter rule that greps for brand names/hex codes outside `brand.*` tokens).
6. **Incompatible-provider reporting**: templates declare `providerCompatibility.required[]` (e.g. `imageGen`, `premiumTTS`); Studio validates BEFORE generation and renders a precise message ("This template needs image generation; connect a provider in the BYOK vault or pick a stock-only template") plus a "report incompatibility" action that files a structured issue (template id, version, missing capability). This kills the classic integration-support burden before it exists.

---

## 6. Sub-niches & configuration model (§6)

### 6.1 Model alternatives compared

| Decision | Alternative A | Alternative B | Verdict |
|---|---|---|---|
| Channel ownership | channels→user directly | channels→**workspace**→user | **B.** The blueprint already specifies "users → workspaces → channels" as the multi-tenant DB shape (product-saas-blueprint §2), workspaces carry billing/seats (the $149/$399 portfolio and agency tiers depend on it — faceless-youtube-saas §2), and DFY client isolation (F8 shipped 2026-10-10) is workspace-shaped |
| Niche taxonomy | per-workspace tags | **global taxonomy tables** (+ optional workspace tags for private organization) | **Global.** Only a global taxonomy lets template recommendations join channel-niches to template-niches across the platform, powers per-niche leaderboards/SEO pages (roadmap feature #14), and keeps adding a niche a data change. Workspace tags remain as a free-form overlay |
| Niche per channel | one-niche-per-channel | **primary niche + optional secondary niches (many-to-many, `role: primary|secondary`)** | **Multi with a primary.** The owner's own kits are mixtures: DFD/OMC mixes finance + lifestyle + self-improvement tags (`yt-brands/brands.mjs:111`), QQ mixes psychology + philosophy + stoicism (`:33`). A single-niche constraint would fight real content. The `primary` role anchors recommendations, analytics rollups, and policy-safeguard inheritance |
| Sub-niches | enum inside niche | **separate `subniches` table, many-to-many to channels, many-to-many to templates** | **Table.** Sub-niches need their own weights (a channel can be 70% longevity / 30% sleep) and their own template tags |
| Strategy | global default | **per-channel strategy record** (cadence, voice, tone, sources, blacklist) | **Per-channel.** Every kit already carries per-channel slots/voice/music (brands.mjs); strategy is that, formalized |
| Template binding | per-workspace | **per-channel binding** (templateId@major + param overrides), workspace default allowed | **Per-channel with workspace default.** Channels in one workspace legitimately run different formats (QQ shorts vs IC docs) |
| Schedule | per-workspace | **per-channel** (slots, docDay, pause flag) | **Per-channel.** Already true in production (`studio-channels.json` crons; `pausedUntil` in state) |

### 6.2 Recommended model (RECOMMENDATION, aligned with everything measured in-repo)

```
User 1─n Workspace 1─n Channel
Channel n─n Niche (role: primary | secondary; policyRisk inherited from Niche)
Channel n─n SubNiche (weight 0..1; scoped under the channel's niches)
Channel 1─1 Strategy { cadence, slots, docDay, pause, language, tone, brandVoiceKitId, preferredSources[], blacklist[] }
Channel 1─n TemplateBinding { templateId@major, kind: video|thumbnail, params{}, status }
Workspace 1─n TemplateOverride { templateId, params{} }        # optional workspace defaults
Project/Run n─1 TemplateBinding; Project 1─n Schedule entries
Niche 1─n SubNiche (global taxonomy, platform-managed)
Template n─n Niche, Template n─n SubNiche, Template n[] formats/languages/capabilities
```

This directly satisfies every requirement in the assignment brief: multiple sub-niches per channel (weighted), multiple niches per channel (with primary), per-channel strategies, template recommendations from config (join `channel_niches × template_niches` ranked by primary-role + sub-niche weights + performance history), language-specific templates (`template.languages` vs `strategy.language`), exclusions/blacklists (`strategy.blacklist` consumed by the topic engine alongside existing trend/term files), preferred sources (`strategy.preferredSources` feeds the §2.2 source-requirement checks), brand voice (the 15-kit structure in `yt-brands/brands.mjs` maps 1:1 onto `brandVoiceKit` + strategy fields — the kits are the migration corpus). Adding niche #16 at any time = insert taxonomy rows + add template JSON + optionally record kits — zero code, honoring the directive.

---

## 7. Thumbnail template system (§7)

### 7.1 Official specs — re-verified today (support.google.com/youtube/answer/72431, fetched 2026-10-24)

| Rule | Current official spec (2026-10-24) | Change vs the 2026-10-18 research |
|---|---|---|
| Recommended resolution | "3840 x 2160 pixels for videos and **2160 x 3840 for Shorts**" | **NEW: Shorts thumbnails now officially specified** (the 10-18 doc had no Shorts row) |
| Minimum | "minimum width of 640 pixels for videos and a **minimum height of 640 pixels for Shorts**" | Shorts minimum added |
| Aspect ratio | 16:9 videos; **9:16 Shorts**; 1:1 podcast playlists | Shorts ratio newly documented |
| Max file size | "50MB for video, Shorts, and podcast thumbnails" (desktop); "2 MB for video thumbnails or 10 MB for podcasts" (mobile) | unchanged; the **2 MB mobile cap stays the binding constraint** for the engine (render ≤2 MB) |
| Formats | "image formats such as JPG or PNG" | unchanged |
| Shorts upload mechanics | Shorts thumbnails "can only be added in YouTube Studio on a computer" and require a **verified account** | NEW — affects the product's auto-attach path for Shorts (API path must be validated; UNVERIFIED whether `thumbnails.set` covers Shorts — flag for pipeline verification) |
| Vertical-video caveat | vertical videos with 16:9 thumbs get an auto-generated **4:5** on home/explore/subscriptions | unchanged |

Engine defaults stand: render 1280×720 for 16:9 (YouTube's own Test & Compare names 720p as its baseline and downscales sub-720p test variants to 480p — 10-18 doc §1, citing 13861714), target ≤2 MB, and add a 9:16 Shorts variant pipeline (2160×3840 upscale path optional; 640px min height floor).

### 7.2 First-class thumbnail system — spec (building on the shipped v1 + v2 plan)

The thumbnail system already has: 28 code-defined templates in `studio/lib/thumb-templates.js`, a shipped template gallery/editor/attach/A-B-swap/CTR-insights stack (thumbnail-studio-plan §3, F1–F11 shipped 2026-10-10/11), and a designed v2: **30 JSON data templates + one parametric renderer + brand-token system** (10-18 doc §6). What the v2 platform design adds:

1. **Independence + linkage**: thumbnail templates carry their own `supportedNiches[]`, `formats[]`, `requiredInputs[]`; a video template *links* to suggested thumbnail families (`thumbnailRequirements` = link-only at v1) but neither depends on the other to render.
2. **Multiple templates per channel per format**: a channel binds ≥1 thumbnail template per format (16:9 long-form, 9:16 Shorts), chosen from niche-filtered gallery.
3. **N-candidates → user picks**: generate N candidates per video (the unbuilt F4 "give me 3 more" becomes the default flow), auto-queue 2–3 into YouTube's native Test & Compare where eligible (winner decided by watch-time share, not CTR — 10-18 doc §1) and/or the shipped sequential swap-tester (F5).
4. **Per-template spec fields**: `supportedNiches[]`, `requiredInputs` (photo/none/stat/number), `textFields` (maxWords ≤5, case, treatment vocabulary: highlightBox/twoTone/underline/overline/strike/stroke — all crisp-edge, per the crisp-edges ban), `backgroundStrategy` (photo/solid/duotone/AI-prompt-preset), `fonts[]` (family+weight+italic capability; **licensing is solved**: all catalog faces are SIL OFL 1.1 or Apache 2.0, free for commercial use and redistributable with license files — full verification table in the 10-18 doc §5; repo fonts already on disk per §8 of same), `compositionRules` (safeZone inset 64px, bottom-right reserve, bans: no drop-shadow/blur/glow — owner hard rule), `branding` (all colors via `brand.*` tokens — no hardcoded channel hexes), `aspectRatios[]`, `resolution` (1280×720 base; 2160×3840 Shorts), `providerRequirements` (`deterministic` SVG/sharp default vs `imageGen` for AI-background templates), `editableParams[]`, `variants[]`.
5. **Compatibility validation BEFORE generation** (pure data check, no render cost): valid(template × format) ∧ valid(template × niche) ∧ channelProviderSatisfies(template.providerRequirements) ∧ channelBrandKitSatisfies(requiredInputs). Invalid combos are dimmed in the gallery with the reason — the same pre-flight pattern as §5's provider reporting.
6. **Deterministic vs generated**: deterministic SVG→sharp templates are the free, instant, reproducible default; AI-background templates (Agnes free gateway primary, Pollinations fallback, BYOK image keys premium — 10-11 catalog doc §Engine notes) are a per-template capability flag, never a silent dependency.

---

## 8. Risks & gaps

| # | Risk | Evidence | Mitigation direction |
|---|---|---|---|
| R1 | **Inauthentic-content policy is existential for a template platform** — the policy text names "content that looks like it's made with a template" and "AI-generated content made with generic or unoriginal templates" as ineligible (1311392); the category's enforcement wave already terminated ~16 channels/35M subs Dec 2025–Jan 2026 (faceless-youtube-saas doc §3 G2) | Official policy + industry reporting | Make material variation a first-class engine feature: per-video topic-driven beat composition, research-loop sourcing (trends + viewer terms), distinct storyline requirement per the policy's own allowed examples; sell "safe automation" (caps, gates, review) as the pitch — the market is pre-occupied with exactly this fear (Blotato guide) |
| R2 | Health/finance claim generation without safeguards | Medical misinformation removal policy (13813322); scams policy (2801973); "Health is a YMYL topic… If you can't verify what you publish, pick another niche" (Blotato) | §2.2 safeguard pack is a launch blocker for those niches, not a later feature |
| R3 | Shorts-first monetization is a hard path: full YPP needs 1,000 subs + 4,000 long-form watch hours (12mo) **or** 10M Shorts views (90d); Shorts Feed views don't count toward watch hours (72851); owner's docs got 0–37 views (qq doc — measured, first-party); reported 2027 tightening to 8,000 hours / 20M Shorts views — **UNVERIFIED** (search-summary only; verify against blog.youtube) | Official thresholds + repo doc | The clips-lane flip (#95–#101, production-audit) is the current bet; platform must not promise monetization timelines to users |
| R4 | Distribution risk independent of quality: QQ's documented Shorts-feed shutdown while retention held 58–81% (measured, first-party) | qq-view-collapse doc | Portfolio-level diversification is a feature, not just a user preference; retention alerts (roadmap #2) detect it |
| R5 | Music/claimed content in ≥1-min Shorts is globally blocked when claimed (15424877); 3-min Shorts cap most songs at 90s | Official | Template music strategies must reference Audio-Library/licensed/generated pools only (3376882); the 1,442-track approved-catalog pattern already in-repo |
| R6 | Multi-tenant render cost + GHA limits at scale | blueprint §4 cost model (Remotion Lambda ~$0.017/min; margin ~75–87% at $99/mo) | Render-host abstraction is a platform primitive; keep per-render cost visible per workspace |
| R7 | Google OAuth CASA/restricted-scope wall for customer auto-upload | blueprint Wall 1 (~$540/yr CASA, 1–3 weeks post-verification; Zernio bridge meanwhile) | Unchanged from blueprint; sequencing risk only |
| R8 | Repo lacks first-party view/retention data in state files, so "validated niches" claims would currently be marketing, not measurement | grep: zero `views` fields in `yt-mcp/state/` | Pipe Analytics snapshots into state/reporting (the reporting collector exists: `reporting/collect.mjs`) before publishing niche-performance claims |

---

## 9. Open questions

1. **2027 YPP threshold doubling** (8,000 watch hours / 20M Shorts views): reported in a 2026-08 blog-post summary via search — verify against blog.youtube before quoting anywhere customer-facing.
2. **Shorts custom thumbnails via API**: the help page says desktop-Studio-only + verified account; confirm whether `thumbnails.set` works for Shorts or whether the platform's Shorts thumbnail path needs a different mechanism.
3. **Analytics ingestion**: when should view/retention snapshots start landing in repo state (`reporting/collect.mjs` extension?) so niche validation becomes measured rather than heuristic?
4. **Multi-niche channels at v1**: support primary+secondary from day one, or primary-only with secondary later? (Recommendation: day one — the owner's own kits are already multi-niche.)
5. **Language-learning i18n**: which TTS providers clear quality bar per target language (the voice chain is English-tuned)?
6. **Niche-pack monetization**: do safeguarded niches (health/finance) carry premium template-pack pricing given their extra enforcement surface (roadmap feature #10)?

---

## Sources

**YouTube-official (all fetched 2026-10-24 unless noted)**
1. Add custom thumbnails on YouTube — https://support.google.com/youtube/answer/72431 — thumbnail specs incl. NEW Shorts specs (2160×3840 rec, 640px min height, desktop-only, verified account), 50MB/2MB caps, JPG/PNG, 4:5 vertical caveat.
2. Altered or synthetic content disclosure — https://support.google.com/youtube/answer/14328491 — disclosure triggers, exemptions (own-voice voiceover, scripts/titles/thumbnails help), label placement, penalties, "disclosure alone won't limit reach".
3. Medical misinformation policy — https://support.google.com/youtube/answer/13813322 — removal categories (LHA-contradicting prevention/treatment claims), context exceptions, 90-day warning/strike mechanics.
4. YouTube channel monetization policies (inauthentic content) — https://support.google.com/youtube/answer/1311392 — "content that looks like it's made with a template", templated-storyline examples, allowed series patterns, July 15 2025 rename.
5. YPP overview & eligibility — https://support.google.com/youtube/answer/72851 — 1,000 subs + 4,000 watch hours (12mo) or 10M Shorts views (90d); Shorts views excluded from watch-hour path; Feb 1 2027 terms update.
6. Advertiser-friendly content guidelines — https://support.google.com/youtube/answer/6162278 — category list verbatim incl. "Harmful acts and unreliable content"; no dedicated financial-misinfo category.
7. Spam & deceptive practices policy — https://support.google.com/youtube/answer/2801973 — "get rich quick" investment schemes ban.
8. YouTube Audio Library — https://support.google.com/youtube/answer/3376882 — copyright-safe, monetizable, CC attribution mechanics.
9. Understand three-minute Shorts — https://support.google.com/youtube/answer/15424877 — Oct 15 2024 cutoff; 90s music limit in 3-min Shorts; ≥1-min claimed Shorts globally blocked.
10. YouTube copyright basics — https://support.google.com/youtube/answer/2797466 — strikes/Content ID risk framing; fair-use caveats.

**Industry / operator sources (fetched 2026-10-24 unless noted)**
11. Blotato — Best faceless AI YouTube niches — https://www.blotato.com/blog/best-faceless-ai-youtube-niches — niche ranking, policy-survivability tiers, "The line is not AI. The line is templates.", health-YMYL warning.
12. AutoShorts.ai — https://autoshorts.ai — series flow (topic→voice→caption template→review→auto-post) for UX benchmarking.
13. NN/g — Progressive disclosure — https://www.nngroup.com/articles/progressive-disclosure/ — 2-level rule, split/placement guidance.
14. SemVer 2.0.0 — https://semver.org/ — immutability of released versions; MAJOR/MINOR/PATCH meanings.
15. Creatomate docs — https://creatomate.com/docs/fundamentals/getting-started/api-automation — renders-from-template model; no documented version-pinning (supports the pinning-as-differentiator argument).
16. Pexels License — https://www.pexels.com/license/ — commercial use allowed, no attribution, no unaltered resale, identifiable-people and endorsement restrictions.
17. Pixabay Content License Summary — https://pixabay.com/service/license-summary/ — same class of terms; standalone-resale and trademark prohibitions.
18. Language-learning RPM $5–12 and Shorts-CPM-low claims — 2026 search aggregation (fluxnote.io via search; **heuristic, unverified against primary**) — supports the language-niche monetization caution.
19. Reddit-story demonetization reporting (2025–2026; r/NewTubers threads + Fliki/invideo survival guides via search) — supports storytelling-niche policy risk. **Heuristic tier.**

**First-party repo evidence (read-only citations)**
20. `yt-brands/brands.mjs` — 15 brand kits: niche/sub-niche/tags/voice/slots/titleStyles per channel; CPM-tier comments (owner heuristics); DFD→OLD MONEY CODE rebrand note (line 96); "Education, not advice" disclaimer pattern (line 217).
21. `yt-mcp/studio-channels.json` — 4 active autopilot channels (quotequarry, investors-compass, money-rulebook, debt-free-doctrine).
22. `yt-mcp/channels/*/token.json` — 16 channel slugs (MCP surface).
23. `yt-mcp/state/<slug>.json` — titleHistory/lastVideos/usedThemes; **no view counts** (grep-verified 2026-10-24).
24. `yt-mcp/trends-<slug>.json` — competitor viral videos with view counts (e.g. trends-investors-compass.json top seed 415,530 views).
25. `studio/lib/styles-catalog.js` — 6 video styles, live/demo status, format coverage.
26. `studio/lib/thumb-templates.js` — 28 code-defined thumbnail templates (v1 surface for the v2 JSON catalog).
27. `research/video-templates-architecture-and-competitors-2026.md` — 4 premium template families, beat system (8 beat types), premium checklist.
28. `research/youtube-thumbnail-templates-research-2026-10-18.md` — v2 30-template JSON catalog design, font license table (OFL/Apache), crisp-edges constraint, Test & Compare mechanics.
29. `research/thumbnail-templates-2026-research.md` + `research/thumbnail-catalog-2026-10-11.md` — 30-style trend evidence, 28-template catalog v2, AI-background prompt presets.
30. `research/thumbnail-studio-plan-2026-10-10.md` — shipped F1–F11 feature state incl. A/B swap-tester, CTR insights, client access.
31. `research/scalable-channel-factory-2026-10-05.md` — registry-driven brand resolution, generic-workflow matrix, Topic Desk; the wizard gaps list.
32. `research/product-saas-blueprint-2026-10-04.md` — workspace DB shape, render-host and OAuth walls, cost/margin model.
33. `research/faceless-youtube-saas-landscape-and-studio-roadmap-2026-10-09.md` — competitor complaints (template sameness), price ladder, roadmap features, inauthentic-content enforcement wave.
34. `research/qq-view-collapse-recovery-2026-10-05.md` — measured QQ distribution shutdown; docs 0–37 views; retention 58–81%.
35. `research/production-audit-2026-10-23.md` — current production state, clips-lane status, gate/watchdog culture.
36. `research/python-rag-audit-2026-10-17.md` — corpus inventory (state/trends/terms files sizes), RAG direction; house-style reference.
