# Video style catalog — popular faceless styles we can build (2026-11-09)

Question: the owner sees every draft landing as the same "vox" look with the
same chapter structure. Which popular faceless-documentary styles can this
factory reproduce, how cheaply, and where can the owner watch demos?

**Honesty note (read first):** live web search was BLOCKED in this session
(auto-mode safety check unavailable), so every link below comes from training
knowledge of these channels. Handles of major channels are stable, but
**verify each link in a browser before relying on it** — confidence is marked
per link: ✔ = major channel, handle near-certain · ? = verify, handle may
differ (search the channel name on YouTube if a link 404s).

---

## 0. How a "style" is built here (verified in code)

The engine separates LOOK from STRUCTURE, which is why most styles below are cheap:

- **A theme = ~20 tokens** in `THEMES` (explainer/remotion/longscenes2.tsx:30-113):
  bg/ink/sub/accent/accent2, furniture colors, font stacks, displayWeight, upper,
  `grain` (procedural SVG noise), `subStyle` (bar|marker), highlight color, capColor,
  and a motion grammar `{kind: spring | stepped | typewriter, step}`.
  **Cost: ~15 lines per new theme. No new code paths.** Existing: investing, vox,
  poster, history, wisdom, travel, focus, science.
- **A style pack = 5 scene renderers** (explainer/remotion/stylepacks.tsx) for a
  fundamentally different look (vox paper-collage: stepped on-2s, highlighter
  sweeps, grease-pencil circles; poster: stamped giant type). **Cost: ~150-300
  lines per pack — MEDIUM.**
- **Structure is template DATA**: `doc_layouts` rotate through 8 layouts
  (split, quote, process, versus, timeline, map, terminal, stat); beats, hooks,
  and the layout cycle live in the template JSON. **New narrative structures cost
  zero code** — they are data rows in the template.
- Local fonts already on disk: Anton, Cinzel, Inter (regular/semibold)
  (thumbnails/fonts/). Theme stacks also reference Playfair Display,
  JetBrains Mono, Archivo Black with Georgia/Arial/Consolas fallbacks.

Rating key: **EASY** = theme tokens only · **MEDIUM** = needs a style pack or
new layout renderer · **HARD** = asset/illustration-heavy, not for auto-gen.

---

## 1. The style catalog

### 1.1 Vox paper-collage investigative — **WE HAVE IT** (theme `vox` + style pack)
- Channels: **Vox** — https://www.youtube.com/@Vox ✔ · variant: **Johnny Harris** — https://www.youtube.com/@JohnnyHarris ✔
- Signature: cream paper + grain, serif headlines, yellow highlighter sweep, red
  grease-pencil circle, stepped on-2s motion, archival-photo collage.
- This is the style every draft fell back to. Keep it as ONE flavor, not the default.

### 1.2 Minimal dark essay (premium documentary) — **EASY** (new theme `midnight`)
- Channels: **LEMMiNO** — https://www.youtube.com/@LEMMiNO ✔ · **Fern** — https://www.youtube.com/@fern ? · **Barely Sociable** — https://www.youtube.com/@BarelySociable ✔
- Demo search: "LEMMiNO Cicada 3301", "Fern the diesel scandal", "Barely Sociable Bitcoin".
- Signature: near-black navy field, sparse frames, thin glowing lines, elegant
  serif + grotesk mix, long calm holds, one accent color used sparingly, slow
  spring entrances. Quiet confidence — the anti-vox.
- Build: tokens (dark bg, one cool accent, spring motion, grain off) + existing
  split/quote/stat layouts. Serves: sleep, AI, deep work, policy.

### 1.3 Cinematic stoic / dark discipline — **EASY** (new theme `stoic`)
- Channels: **Einzelgänger** — https://www.youtube.com/@Einzelgaenger ? · **Daily Stoic** — https://www.youtube.com/@DailyStoic ✔ (talking-head, style reference only)
- Demo search: "Einzelgänger Marcus Aurelius", "stoic motivation cinematic".
- Signature: near-black warm charcoal, bone/parchment ink, GOLD accents, heavy
  classical display type (Cinzel — already local), slow fades, stepped motion,
  Roman/marble motifs. The IRON WILL drafts' intended look.
- Build: tokens + Cinzel display font. Serves: iron-discipline, founders-margin,
  corner-office.

### 1.4 Old money / quiet luxury — **EASY** (new theme `legacy`)
- Channels: search "old money aesthetic channel" — e.g. **Old Money Motivation** ? ,
  **Luxury Lifestyle**-type faceless channels ? (handles unstable — search by name)
- Signature: ivory/cream field, deep navy + burgundy, Playfair/Cinzel serif,
  monogram/crest badge, generous margins, subtle grain, nothing neon.
- Build: tokens. Serves: old-money-code, escrow-estate.

### 1.5 Clean corporate diagram / MBA brief — **EASY** (new theme `brief`)
- Channels: **Modern MBA** — https://www.youtube.com/@ModernMBA ✔ · **How Money Works** — https://www.youtube.com/@HowMoneyWorks ?
- Demo search: "Modern MBA why Boeing failed", "How Money Works invisible tax".
- Signature: white/light slides, crisp heavy grotesk, numbered process diagrams,
  clean stat callouts, restrained blue + one alert red. Businesslike, trustworthy.
- Build: tokens — process/terminal/stat layouts already cover the diagram feel.
  Serves: money-rulebook, tax-shield, debt-free-doctrine, founders-margin.

### 1.6 Kinetic chart economics — **MEDIUM** (needs a `chart` style pack)
- Channels: **POLÒRI** — search "POLÒRI" ? (economics, kinetic data-viz) · pair with **Wendover Productions** — https://www.youtube.com/@WendoverProductions ✔
- Demo search: "POLÒRI economics", "Wendover air freight".
- Signature: animated line/bar charts drawing on, giant stat numbers, typewriter
  labels, data as the hero. Our `stat` layout approximates it; true charts need
  a chart scene renderer.
- Serves: investors-compass, money-rulebook, policy-brief. **Highest
  differentiator for the finance fleet — worth the one-time pack cost.**

### 1.7 Investigation / evidence desk — **EASY→MEDIUM** (new theme `signal`)
- Channels: **Coffeezilla** — https://www.youtube.com/@Coffeezilla ✔ · **Barely Sociable** (shared mood)
- Demo search: "Coffeezilla scam investigation".
- Signature: dark board, evidence cards, screenshot/terminal frames, red FLAG /
  green VERIFIED stamps, mono captions, marker highlights. Terminal + quote
  layouts carry most of it with tokens.
- Serves: ai-observer, closing-table, tax-shield, policy-brief.

### 1.8 Sleek tech / glitch finance — **MEDIUM** (new theme `volt` + flicker motion)
- Channels: **ColdFusion** — https://www.youtube.com/@ColdFusion ✔ · **Andrei Jikh** — https://www.youtube.com/@AndreiJikh ✔
- Demo search: "ColdFusion the rise of NVIDIA", "Andrei Jikh".
- Signature: pure black glassy field, cyan/electric accents, light-weight
  display type + mono labels, flicker/glitch entrances, scanline hints.
- Build: tokens + a `typewriter`/flicker motion variant. Serves: ai-observer,
  deep-work-os, investors-compass.

### 1.9 Business mini-movie (playful scenes) — **HARD** (defer; asset-heavy)
- Channels: **MagnatesMedia** — https://www.youtube.com/@MagnatesMedia ✔
- Signature: colorful mini-movies, cartoon props, rapid scene variety,
  costumed storytelling. Per-video custom illustration = not auto-gen-able.
- Approximation if wanted later: a playful poster-style pack variant (MEDIUM).
- Serves: founders-margin, corner-office — but only as a later experiment.

### 1.10 Broadcast news / policy desk — **EASY** (new theme `press`)
- Channels: **TLDR News** — https://www.youtube.com/@TLDRNews ? · style-adjacent: **Vox news explainers**
- Demo search: "TLDR News UK budget".
- Signature: white field, black grotesk, red masthead bar + blue secondary,
  flat info panels, ticker-like mono strips. Feels like a desk, not a doc.
- Build: tokens. Serves: policy-brief, corner-office, closing-table.

### 1.11 History archive / map room — **HAVE base (`history`) + EASY extension (`frontier`)**
- Channels: **Kings and Generals** — https://www.youtube.com/@KingsandGenerals ✔ · **Fall of Civilizations** — https://www.youtube.com/@FallOfCivilizations ✔
- Demo search: "Kings and Generals battle map", "Fall of Civilizations Assyria".
- Signature: parchment/ember palette, typewriter reveals, timeline/map layouts
  as heroes, crimson wax accents. The `history` theme exists; `frontier` is a
  darker war-room variant emphasizing map/timeline layouts.
- Serves: history lanes, quotequarry (historical quotes).

### 1.12 Clinical science — **HAVE (`science`)** — flat-vector upgrade is **HARD**
- Channels: **SciShow** — https://www.youtube.com/@SciShow ✔ · **Kurzgesagt** — https://www.youtube.com/@kurzgesagt ✔ (custom vector art = HARD, do not chase) · **Osmosis** — https://www.youtube.com/@osmosis ? (medical animation = HARD)
- Keep the clean clinical `science` theme for longevity/sleep lanes; note the
  Kurzgesagt ceiling honestly.

### 1.13 Listicle countdown — **EASY** (layout cycle only, zero code)
- Channels: **WatchMojo** — https://www.youtube.com/@WatchMojo ✔
- Signature: big counters (05, 04…), punch-ins, versus panels. Our chapter
  numbering + a countdown layout cycle (§3) delivers the structure.
- Serves: any niche as an alternate STRUCTURE — gym, quotes, finance rules.

### 1.14 Flat 2D animated explainer — **HARD** (illustration-heavy)
- Channels: **The Swedish Investor** — https://www.youtube.com/@TheSwedishInvestor ? · **Practical Wisdom** — https://www.youtube.com/@PracticalWisdom ? · **Better Than Yesterday** — https://www.youtube.com/@BetterThanYesterday ✔ · **After Skool** — https://www.youtube.com/@AfterSkool ✔ (whiteboard-draw = HARD)
- Signature: friendly characters/objects drawn per scene. Not auto-gen-able
  today; the typographic approximation is just §1.5/§1.2. Do not chase now.

### 1.15 Quote / letterpress typography — **EASY** (new theme `letterpress`)
- Channels: search "quote channel typography" — e.g. **Motivation Madness** ? ,
  **Words Of Wisdom** ? (handles unstable); our QuoteQuarry lane is the target.
- Signature: paper or slate field, one monumental serif quote per frame,
  letterpress texture, small attribution caps, grain. `quote` layout + tokens.
- Serves: quotequarry, iron-discipline.

---

## 2. Prioritized build batch (owner picks; pilot on Money Rulebook first)

### 8 new themes (each ≈ 15 token lines in longscenes2.tsx THEMES)

| # | Theme | Mood / reference | Token sketch | Niches |
|---|---|---|---|---|
| 1 | `brief` | Modern MBA corporate | bg #F6F8FA · ink #10202E · accent #0F62FE + #DA1E28 · Inter 900 upper · bar · spring · grain off | money-rulebook, tax-shield, debt-free |
| 2 | `stoic` | Einzelgänger dark discipline | bg #0D0B08 · ink #E8DCC8 · accent #C9A227 · **Cinzel** display · stepped(4) · grain on | iron-discipline, founders |
| 3 | `legacy` | Old-money quiet luxury | bg #F4EFE6 · ink #1B2A4A · accent #7A1F2B · Playfair/Cinzel · marker · grain on | old-money-code, escrow-estate |
| 4 | `midnight` | LEMMiNO dark essay | bg #0A0E1A · ink #E8EAF0 · accent #4F8CFF · serif display · spring · grain off | sleep, ai, deep-work, policy |
| 5 | `signal` | Coffeezilla evidence desk | bg #101214 · ink #E6E8EA · accent #FF4747 + #37C871 · mono-heavy · typewriter(2) | ai-observer, tax-shield, closing-table |
| 6 | `volt` | ColdFusion/Jikh sleek tech | bg #050607 · ink #F5F6F7 · accent #00E5FF · Inter light + mono · typewriter(1) | ai-observer, deep-work, investors |
| 7 | `frontier` | History war-room map | bg #14100A · ink #EAD9A2 · accent #B8332A · serif · typewriter(3) · grain on · map/timeline heroes | history lanes |
| 8 | `letterpress` | monumental quote cards | bg #EFEAE2 · ink #171310 · accent #8C1D18 · Playfair 900 · marker · grain on | quotequarry, iron-discipline |

### Style packs (one-time scene-renderer cost)
1. **`chart` pack** (Polòri-class animated charts) — highest value for the
   finance fleet; a `chart` layout renderer feeding off beat data (value, label,
   series). MEDIUM, ~200 lines + tests.
2. **Playful `magnates` pack** — defer until a founder-lane pilot proves demand.

### Layout cycles (zero code — template DATA)
- `case-file` [terminal, stat, split, quote, versus, split] — investigation feel
- `countdown` [stat, versus, split, quote, stat, split] — listicle energy
- `dossier` [quote, timeline, map, process, quote, split] — archive/history feel
- `myth-bust` [versus, split, stat, versus, quote, split] — compare/debunk

This directly answers "same starting-point, chapter-wise structure": the
structure is data — vary narrative shape per template with no code changes.

---

## 3. Wiring a new theme end-to-end (one small PR per batch)

1. Add the token record to `THEMES` (explainer/remotion/longscenes2.tsx:30).
2. Add the theme name to `ALLOWED_THEMES` and the NICHE_SHAPE_RULES pool string
   (services/ai/bot/graph.py:23,29) so the bot can draft with it.
3. Update the mood-matching sentence in NICHE_SHAPE_RULES + the review prompt
   (money→investing already there; add e.g. discipline→stoic, quotes→letterpress).
4. Nothing else: previews read theme from draft JSON (render-template-preview
   reads doc_presentation.theme), staging/registry carry it as data.
5. Pilot rule: first batch rides Money Rulebook drafts (pilot directive), then
   spreads per the fleet table above.

---

## 4. Verification status

- Code claims: verified in this session by reading longscenes2.tsx,
  stylepacks.tsx, lib/doc-storybook.mjs, graph.py.
- All YouTube links: from training knowledge (live search blocked 2026-11-09);
  ✔ ≈ certain handle, ? = verify by searching the channel name.
- Follow-up when a search-capable session runs: confirm links, spot-check 2-3
  exemplar videos per shortlisted theme for exact palette pulls, and check
  POLÒRI's current handle.
