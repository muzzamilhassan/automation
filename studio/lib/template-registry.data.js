// Template registry metadata — schema v2 (validated by template-registry.js).
// KEYED BY template_id — the unique registry key and THE identity string of
// the D1/D19 invariant (one string, four homes: assignment id == registry key
// == brain-gate id == review-gate meta id — every consumer indexes THIS object
// by that one string).
//
// Schema v2 fields (Phase 5, spec D1):
// - `template_id` — the unique registry key; REQUIRED on new entries. The
//   legacy 7 entries carry it explicitly = their family id (backward
//   compatible: key == template_id == family id, so existing assignments,
//   pinned majors, and DB rows keep their identity with zero data migration —
//   the `family_id` columns in Neon keep dual meaning because for every
//   pre-Phase-5 row template_id == family_id; see template-registry-db.js).
// - `family` — the VISUAL family id in studio/lib/templates-catalog.js; the
//   gallery/aspect-ratio join. Optional on the legacy 7 (their family IS the
//   key); required together with template_id on new entries, which lets many
//   templates share one visual family (e.g. myth-vs-money on stats-counters).
//
// Brain thresholds (#105 Phase 3, spec D8 / review R-1): `variation_threshold`
// and `cross_channel_threshold` are per-template DATA consumed by the
// generator wiring (youtube-engine.mjs registryThresholds). Templates WITHOUT
// explicit values inherit the documented defaults — variation 0.85 cosine,
// cross-channel 0.90 (variation + 0.05) — identical to the brain service's
// BRAIN_DEFAULT_THRESHOLD / BRAIN_CROSS_CHANNEL_BAND. Declare the fields on a
// template only to deviate from those defaults.
//
// Seed notes (issue #102 Task 10):
// - niches are VERBATIM channel-registry strings (validateAssignment does exact
//   matching AND enforces the closed D17 vocabulary — never paraphrase; the
//   canonical strings live in studio/lib/niches.js CANONICAL_NICHES):
//     'History stories'                          — niches.js + lib/brands.json (legacy-4 history lane)
//     'Investing psychology & market wisdom'     — studio/lib/brands.json:51 (investors-compass)
//     'Personal finance rules & money habits'    — studio/lib/brands.json:99 (money-rulebook)
//     'Old money habits & quiet wealth'          — studio/lib/brands.json:147 (debt-free-doctrine)
// - formats are derived from each family's catalog aspectRatios
//   (16:9 -> long, 9:16 -> short) — never declared beyond what the family ships.
// - renderer is 'remotion' for all six: every catalog family is a Remotion
//   template family shipping in-repo at explainer/remotion/families/.
// - required_capabilities never include 'image-gen': the Phase 1 key vault has
//   no generator provider (pixabay/pexels are stock search keys), so declaring
//   it would 422 every assignment. Photo-using families draw from the
//   stock/assets lane, not generation.

export const REGISTRY_META = {
  // ---- history lane ----
  'documentary-frames': {
    version: '1.0.0',
    template_id: 'documentary-frames',
    niches: ['History stories'],
    formats: ['long', 'short'],
    renderer: 'remotion',
    required_capabilities: ['script-gen', 'tts', 'captions'],
    variation_rules: [
      'distinct storyline/focus per video — no two videos cover the same subject or arc',
      'no repeated hook across the channel\'s last 5 videos',
      'rotate opening variants (documentary-open / chapter-card / reconstruction-card) so consecutive videos do not open with the same frame style',
    ],
    safety: { required_sources: true, review_required: [] },
    deprecated: false,
    changelog: [{ version: '1.0.0', date: '2026-10-26', note: 'initial registry entry' }],
  },
  'timeline-history': {
    version: '1.0.0',
    template_id: 'timeline-history',
    niches: ['History stories'],
    formats: ['long'],
    renderer: 'remotion',
    required_capabilities: ['script-gen', 'tts', 'captions'],
    variation_rules: [
      'distinct storyline/focus per video — each video\'s timeline spine covers a different era or conflict',
      'no repeated hook across the channel\'s last 5 videos',
      'no repeated timeline span: the start/end years and milestone events differ from every prior video on the channel',
    ],
    safety: { required_sources: true, review_required: [] },
    deprecated: false,
    changelog: [{ version: '1.0.0', date: '2026-10-26', note: 'initial registry entry' }],
  },
  'photo-stories': {
    version: '1.0.0',
    template_id: 'photo-stories',
    niches: ['History stories'],
    formats: ['long', 'short'],
    renderer: 'remotion',
    required_capabilities: ['script-gen', 'tts', 'captions'],
    variation_rules: [
      'distinct storyline/focus per video — each video portraits a different subject from stock/archival photo sets (no image generation)',
      'no repeated hook across the channel\'s last 5 videos',
      'no reused photo set: each video draws a different subject, year, and caption context',
    ],
    safety: { required_sources: true, review_required: [] },
    deprecated: false,
    changelog: [{ version: '1.0.0', date: '2026-10-26', note: 'initial registry entry' }],
  },

  // ---- finance lane (YMYL: every seed requires sources + finance review) ----
  'finance-explainers': {
    version: '1.0.0',
    template_id: 'finance-explainers',
    niches: [
      'Investing psychology & market wisdom',
      'Personal finance rules & money habits',
      'Old money habits & quiet wealth',
    ],
    formats: ['long'],
    renderer: 'remotion',
    required_capabilities: ['script-gen', 'tts', 'captions'],
    variation_rules: [
      'distinct storyline/focus per video — each video models a different economic concept (compound growth, debt paydown, market cycle, unit economics — no repeats)',
      'no repeated hook across the channel\'s last 5 videos',
      'each video\'s numbers come from cited sources; no recycled figures from prior videos',
    ],
    // #105 Phase 3 (D8/R-1): finance is the YMYL lane — the brain's variation
    // gate thresholds are pinned explicitly here rather than inherited.
    variation_threshold: 0.85,
    cross_channel_threshold: 0.90,
    // #106 T5b (D18/OQ-4): thumbnail picking is template DATA — review-gated
    // templates launch ON (3 candidates per render; candidate 1 ships; the
    // owner swaps at Studio > Review). The T5 gate reads THIS key.
    review_thumb_pick: true,
    safety: { required_sources: true, review_required: ['finance'] },
    deprecated: false,
    changelog: [{ version: '1.0.0', date: '2026-10-26', note: 'initial registry entry' }],
  },
  'editorial-headlines': {
    // T1 formats gate (D1: the family is the format-truth source): this family
    // ships aspectRatios ['16:9'] only, so 'short' was declared beyond what it
    // ships — entry #7 was added before the loader enforced the rule. Corrected
    // to ['long'] (the entry is unassigned, zero live drift). If the lane is
    // meant to run shorts (D7 marks it S+L), the catalog family must gain a
    // 9:16 variant FIRST; then this declaration may add 'short' again.
    version: '1.0.1',
    template_id: 'editorial-headlines',
    niches: ['History stories'],
    formats: ['long'],
    renderer: 'remotion',
    required_capabilities: ['script-gen', 'tts', 'captions'],
    variation_rules: [
      'distinct storyline/focus per video — each video investigates a different event, era, or document set (no repeats)',
      'no repeated hook across the channel\'s last 5 videos',
    ],
    safety: { required_sources: true, review_required: [] },
    deprecated: false,
    changelog: [
      { version: '1.0.0', date: '2026-10-27', note: 'registry entry #7 — exit-gate proof: data-only addition' },
      { version: '1.0.1', date: '2026-11-01', note: 'formats corrected to [long]: the family ships only 16:9 — short was declared beyond what the family ships (T1 formats gate)' },
    ],
  },

  // ---- Phase 5 PILOT (QA Row P-1 · spec D7 row 8 · review A-H6): myth-vs-money —
  // the STRUCTURE-FAITHFUL money-rulebook retrofit. Zero content risk: the beat
  // slots mirror MR's proven 4-point × 9–12-word numbered money listicle (the
  // kit's script block, yt-brands/brands.mjs), so the P-2 swap changes the
  // GOVERNANCE (review class, disclaimers, beat-plan prompt, thumb picking),
  // never the story the brain writes. Pilot-scope decisions (controller
  // dispatch a9a9f454, ledgered 2026-11-02):
  // - niches carry MR's EXACT kit niche string (money-rulebook, brands.mjs:71)
  //   — the pilot is assignable only where the MR-pilot directive allows; D7
  //   row 8's full 6-string finance cluster widens at γ integration (DATA
  //   edit, zero code).
  // - family: documentary-frames since the 2026-11-04 catalog cleanup (owner
  //   call) — beat-synced-type was removed with the cloned 10–15s pack and
  //   documentary-frames is the interim 9:16-capable kept family; the spec/
  //   QA/plan text says stats-counters — controller reconciles the docs.
  // - NO explicit variation_threshold/cross_channel_threshold: MR's proven
  //   0.85/0.90 ARE the documented defaults, and the brain-wiring pin holds
  //   "only finance-explainers declares the fields" — declare only to deviate
  //   (header note above). Resolves identically to a declared 0.85/0.90.
  'myth-vs-money': {
    version: '1.0.1',
    template_id: 'myth-vs-money',
    family: 'documentary-frames',
    niches: ['Personal finance rules & money habits'],
    formats: ['short', 'long'],
    renderer: 'remotion',
    required_capabilities: ['script-gen', 'tts', 'captions'],
    // D2: point-slot constraints over the IMMUTABLE shorts skeleton — beats[4]
    // == the MR kit's 4-point numbered money listicle (points: 4, lineWords
    // '9-12', kit-owned). Each beat names what numbered point i must BE.
    // P-3 (D2 long/doc form): sections[] drive the DOC lane — 6 chapters,
    // min 90 words (the shorts beats drive the SHORTS lane).
    story_structure: {
      sections: ['cold_open', 'chapters:6', 'exhibits', 'outro'],
      chapter_min_words: 90,
      beats: [
        'slot 1 states the popular money myth and the $ figure that belief promises or costs — the listicle\'s opening point',
        'slot 2 reverses the myth with the counter-$ evidence — what the real number is, per the cited source',
        'slot 3 explains the mechanism — why the myth fails and the money rule the real number obeys (the reversal\'s second proof)',
        'slot 4 is the what-to-do payoff — one actionable money rule with its actionable $ step',
      ],
      // MR's proven hook shapes: the kit hookRule's trio (question / shocking
      // number / you-stake) spoken in money, plus the myth call-out the story
      // turns on.
      hook_classes: ['shocking $ number', 'money myth call-out', 'you-stake money question'],
      // REPLACE the kit title line (T2a Ruling): the $-figure numbered money
      // listicle — MR's proven titleStyle + its literal titleExamples.
      title_patterns: [
        'numbered money-habit listicle ("7 Money Habits That Quietly Make You Rich")',
        'numbered rules-to-a-$-milestone listicle ("6 Rules for Your First $10,000")',
        'numbered myth-buster listicle with the $-cost figure ("5 Money Myths That Cost You $10,000")',
      ],
      payoff_rule: 'the closing lands the what-to-do payoff — ONE money rule with its $ step, a mic-drop challenge never a summary',
    },
    // D3 bar: every rule names the no-repeat OBJECT, the lookback window, and
    // the enforcement site. Rule 4 is the story-shape prose — labeled
    // unenforceable per the spec's Honest Limits convention.
    variation_rules: [
      'distinct money myth per video — the belief reversed in slot 1 differs from every myth used in the channel\'s last 5 videos (enforced: the variation gate similarity + seed rotation)',
      'no recycled dollar figures — every $ amount in the script and title is new against the channel\'s last 5 videos (enforced: the variation gate similarity + the review desk\'s source check)',
      'no repeated hook across the channel\'s last 5 videos (enforced: the variation gate similarity)',
      'the story is always myth-vs-money — slot 1 states a belief the video then reverses (prose for the author and the review desk, NOT machine-enforced — spec Honest Limits)',
    ],
    // #106 T5b (D18/OQ-4): review-gated template — picking ON from launch so
    // Drill C runs on MR (the QA's binding note: the pilot MUST carry it).
    review_thumb_pick: true,
    // D4: the fixed finance text machine-appended to the upload DESCRIPTION at
    // publish (the tax-shield kit's "Education, not advice" pattern); the
    // contains() save gate refuses a finance record without it.
    safety: { required_sources: true, review_required: ['finance'], disclaimers: ['Education, not financial advice.'] },
    deprecated: false,
    changelog: [
      { version: '1.0.0', date: '2026-11-02', note: 'Phase 5 pilot — structure-faithful to the money-rulebook kit format' },
      { version: '1.0.1', date: '2026-11-04', note: 'family re-bound beat-synced-type -> documentary-frames: beat-synced-type removed with the cloned 10–15s pack (owner-approved catalog cleanup); documentary-frames is the interim kept 9:16-capable family' },
    ],
  },

  // ---- Phase 5 MR-2 (owner directive 2026-11-03): red-flags-explained —
  // the STRUCTURE-FAITHFUL retrofit of MR's proven reference video "7 Red
  // Flags That Led to Bernie Madoff Ponzi Explained" (BFCa-bRy-3M, 12:30,
  // 10 chapters): cold-open question hook, numbered red-flag enumeration
  // with $ evidence, collapse + aftermath, closing lesson checklist. Same
  // zero-content-risk rule as the pilot: beats mirror MR's numbered-listicle
  // shorts skeleton with red-flag slot semantics; sections[] drive the DOC
  // lane (10 chapters x >=170 words ≈ the reference's 12:30 runtime).
  // thumb_design carries the reference video's THUMBNAIL (the left-stack
  // look): full-bleed episode frame + red-tinted scrim, top-left chip
  // (dot + SCANDALS), salmon eyebrow, left-anchored Anton headline with the
  // LAST word accented, bottom-right brand mark. The doc lane's frame
  // renderer switches on THIS DATA (spec R4); entries without the block
  // render byte-identical to today (R5, default-inert). Template values win
  // over the kit accent per the T6 precedence.
  'red-flags-explained': {
    version: '1.2.0',
    template_id: 'red-flags-explained',
    family: 'documentary-frames',
    niches: ['Personal finance rules & money habits'],
    formats: ['long', 'short'],
    renderer: 'remotion',
    required_capabilities: ['script-gen', 'tts', 'captions'],
    thumb_design: {
      layout: 'left-stack',
      // chip + eyebrow removed (owner directive 2026-11-05): the number/name
      // chips carry the identity now; the eyebrow row cluttered the top band.
      brandmark: 'MONEYRULEBOOK',
      accent_word: 'last',
      scrim_tint: '#7A1E1E',
      accent: '#F0776E',
    },
    // STORYBOOK DOC LANE (spec docs/superpowers/specs/2026-11-04-storybook-doc-lane-spec.md,
    // owner research storybook-doc-template-2026-11-04.md): story_structure.doc_render
    // flips the doc lane's VISUAL layer to the DocV2 vox engine — the reference
    // video's editorial storybook look (cream paper, red kicker, ghost-numeral
    // chapter dividers, alternating photo cards, salmon karaoke captions).
    // Structure, review flow, disclaimers, SRT: all unchanged — only the pixels.
    // doc_presentation carries the reference's brand strings (DATA, never code —
    // any channel's template can declare its own and opt in with zero changes).
    doc_presentation: {
      brand: 'MONEY RULEBOOK',
      eyebrow: 'BUSINESS STORIES // MR',
      badge: 'MR',
    },
    story_structure: {
      doc_render: 'storybook',
      sections: ['cold_open', 'chapters:10', 'exhibits', 'outro'],
      chapter_min_words: 170,
      beats: [
        'slot 1 opens the red-flag listicle — the scheme or habit and the $ figure it promises, stated as the hook',
        'slot 2 names the first red flag with its $ evidence — the number insiders ignored',
        'slot 3 names the middle red flag — the mechanism that kept the scheme alive and who it drained',
        'slot 4 is the payoff — the red-flag checklist the viewer can run on any opportunity, one rule to keep',
      ],
      // The reference video's hook shapes: the google-search call-out it
      // literally opens with ("people still type ... into Google"), plus the
      // kit's proven money hooks.
      hook_classes: ['google-search question call-out', 'shocking $ number', 'you-stake money question'],
      title_patterns: [
        'numbered red-flags-to-a-collapse explainer ("7 Red Flags That Led to Bernie Madoff Ponzi Explained")',
        'numbered warning-signs listicle with the $-stake ("6 Warning Signs Your Fund Is a Scam")',
        'anatomy-of-a-collapse explainer ("The Fraud That Fooled Wall Street — Explained")',
      ],
      payoff_rule: 'the closing lands the red-flag checklist — the flags recapped as ONE auditable list plus the single rule to keep, a mic-drop never a summary',
    },
    variation_rules: [
      "distinct collapse/case per video — the scheme examined differs from every case in the channel's last 5 videos (enforced: the variation gate similarity + seed rotation)",
      'no recycled red-flag set — each video enumerates different flags against the last 5 videos (enforced: the variation gate similarity)',
      'no repeated hook across the channel\'s last 5 videos (enforced: the variation gate similarity)',
      'every figure is a cited case number sourced to the named collapse (prose for the author and the review desk — spec Honest Limits)',
    ],
    review_thumb_pick: true,
    safety: { required_sources: true, review_required: ['finance'], disclaimers: ['Education, not financial advice.'] },
    deprecated: false,
    changelog: [
      { version: '1.0.0', date: '2026-11-03', note: 'owner-directed structure-faithful retrofit of the MR reference video (BFCa-bRy-3M) + the left-stack doc-thumb design' },
      { version: '1.1.0', date: '2026-11-04', note: 'the doc lane renders this template\'s episodes in the reference\'s STORYBOOK look (story_structure.doc_render = storybook -> DocV2 vox engine; doc_presentation carries the reference brand strings). Structure/review/disclaimers/SRT unchanged.' },
      { version: '1.2.0', date: '2026-11-04', note: 'family re-bound beat-synced-type -> documentary-frames: beat-synced-type removed with the cloned 10–15s pack (owner-approved catalog cleanup); the storybook doc look rides story_structure.doc_render DATA (D19 — family-independent)' },
    ],
  },

  // ---- Template factory batch 1 (owner "build step 2", 2026-11-05): the
  // storybook look as PICKABLE templates. Same proven engine DATA shape as
  // red-flags-explained (story_structure.doc_render = storybook -> DocV2 vox
  // engine; doc_presentation brand strings with kit fallback) — no new
  // renderer code. Each variant serves ONE canonical niche with niche-shaped
  // beats/hooks/titles. Palette stays the engine's vox (cream/red/Playfair);
  // per-theme palettes are a later engine follow-up. doc_presentation values
  // are DEFAULTS — the channel kit's brand strings win at render time
  // (doc-storybook.mjs docPresentation(meta, kit)).
  'history-storybook': {
    version: '1.0.0',
    template_id: 'history-storybook',
    family: 'documentary-frames',
    niches: ['History stories'],
    formats: ['long', 'short'],
    renderer: 'remotion',
    required_capabilities: ['script-gen', 'tts', 'captions'],
    doc_presentation: { theme: 'history', voice: 'en-GB-RyanNeural', music_mood: 'epic', brand: 'HISTORY VAULT', eyebrow: 'HISTORY STORIES // HV', badge: 'HV', doc_layouts: ['split', 'timeline', 'split', 'quote', 'split', 'map'] },
    story_structure: {
      doc_render: 'storybook',
      sections: ['cold_open', 'chapters:10', 'exhibits', 'outro'],
      chapter_min_words: 170,
      beats: [
        'slot 1 drops the reader into the era — the world as it was, and the crack nobody noticed',
        'slot 2 names the decision or figure that set the arc in motion, with its dated evidence',
        'slot 3 traces the turning point — what changed hands, who resisted, what it cost',
        'slot 4 is the payoff — the aftermath the record actually shows and the lesson the era leaves',
      ],
      hook_classes: ['dated document call-out', 'empire-scale number', 'you-were-there question'],
      title_patterns: [
        'the-history-you-were-not-told explainer ("The Deal That Redrew Europe — Explained")',
        'numbered turning-points listicle ("5 Decisions That Ended an Empire")',
        'rise-and-collapse arc ("How One City Ruled the World — Then Lost It")',
      ],
      payoff_rule: 'the closing lands the era\'s verdict — what the record shows, one sentence of lesson, never a summary',
    },
    variation_rules: [
      "distinct era/case per video — the arc examined differs from every case in the channel's last 5 videos (enforced: the variation gate similarity + seed rotation)",
      'no recycled turning-point set — each video enumerates different decision points against the last 5 videos (enforced: the variation gate similarity)',
      'no repeated hook across the channel\'s last 5 videos (enforced: the variation gate similarity)',
      'every date and figure is a cited record sourced to the named era (prose for the author and the review desk — spec Honest Limits)',
    ],
    review_thumb_pick: true,
    safety: { required_sources: true, review_required: [], disclaimers: ['History retold from cited records; dates summarized.'] },
    deprecated: false,
    changelog: [{ version: '1.0.0', date: '2026-11-05', note: 'template factory batch 1 — storybook look as a pickable history-lane template' }],
  },

  'wisdom-storybook': {
    version: '1.0.0',
    template_id: 'wisdom-storybook',
    family: 'documentary-frames',
    niches: ['Timeless wisdom, self-mastery & human psychology', 'Human psychology & social dynamics', 'Leadership & management wisdom'],
    formats: ['long', 'short'],
    renderer: 'remotion',
    required_capabilities: ['script-gen', 'tts', 'captions'],
    doc_presentation: { theme: 'wisdom', voice: 'en-US-AndrewNeural', music_mood: 'calming', brand: 'TIMELESS WISDOM', eyebrow: 'WISDOM STORIES // TW', badge: 'TW', doc_layouts: ['split', 'quote', 'split', 'process', 'split', 'versus'] },
    story_structure: {
      doc_render: 'storybook',
      sections: ['cold_open', 'chapters:10', 'exhibits', 'outro'],
      chapter_min_words: 170,
      beats: [
        'slot 1 names the modern ache — the feeling the viewer knows, stated plainly',
        'slot 2 brings the timeless lens — the Stoic/Eastern/psychological principle that names it first',
        'slot 3 works the principle on the ache — one practice, one reframe, with the psychology behind it',
        'slot 4 is the payoff — the daily rule the viewer keeps, one sentence they can repeat',
      ],
      hook_classes: ['the-feeling call-out', 'the-old-book line', 'you-stake question'],
      title_patterns: [
        'the-timeless-lens explainer ("What Marcus Aurelius Knew About Your Worst Days")',
        'numbered principles listicle ("7 Stoic Rules for a Loud World")',
        'the-psychology-behind explainer ("The Psychology of Why You Feel Behind — Explained")',
      ],
      payoff_rule: 'the closing lands ONE repeatable rule — the practice stated so plainly the viewer can start tonight',
    },
    variation_rules: [
      "distinct ache/principle pairing per video — the pairing differs from every one in the channel's last 5 videos (enforced: the variation gate similarity + seed rotation)",
      'no recycled principle set — each video draws different Stoic/Eastern/psychological sources against the last 5 videos (enforced: the variation gate similarity)',
      'no repeated hook across the channel\'s last 5 videos (enforced: the variation gate similarity)',
      'attribution stays honest — a principle named for its source, paraphrase never put in a dead man\'s mouth (prose for the author and the review desk — spec Honest Limits)',
    ],
    review_thumb_pick: true,
    safety: { required_sources: true, review_required: [], disclaimers: ['Reflections on published philosophy; not personal advice.'] },
    deprecated: false,
    changelog: [{ version: '1.0.0', date: '2026-11-05', note: 'template factory batch 1 — storybook look as a pickable wisdom/psychology template' }],
  },

  'science-storybook': {
    version: '1.0.0',
    template_id: 'science-storybook',
    family: 'documentary-frames',
    niches: ['Science & how things work'],
    formats: ['long', 'short'],
    renderer: 'remotion',
    required_capabilities: ['script-gen', 'tts', 'captions'],
    doc_presentation: { theme: 'science', voice: 'en-US-EmmaNeural', music_mood: 'bright', brand: 'SCIENCE EXPLAINED', eyebrow: 'SCIENCE STORIES // SE', badge: 'SE', doc_layouts: ['split', 'terminal', 'split', 'process', 'split', 'stat'] },
    story_structure: {
      doc_render: 'storybook',
      sections: ['cold_open', 'chapters:10', 'exhibits', 'outro'],
      chapter_min_words: 170,
      beats: [
        'slot 1 opens the everyday mystery — the thing the viewer touches daily and never questions',
        'slot 2 names the mechanism — the one physical rule or discovery that explains it, with its source',
        'slot 3 follows the chain — how the mechanism scales from lab to the thing in their hand',
        'slot 4 is the payoff — what to now SEE in the everyday world, one wonder to keep',
      ],
      hook_classes: ['everyday-object call-out', 'the-scale number (nano to cosmic)', 'you-use-it question'],
      title_patterns: [
        'the-hidden-mechanism explainer ("The Hidden Physics Inside Your Phone — Explained")',
        'numbered mechanisms listicle ("5 Engineering Tricks That Hold Up the World")',
        'from-lab-to-life arc ("How a 1905 Idea Became Your GPS")',
      ],
      payoff_rule: 'the closing lands the wonder — the mechanism recapped as ONE chain the viewer can now trace themselves',
    },
    variation_rules: [
      "distinct mechanism/object pairing per video — the pairing differs from every one in the channel's last 5 videos (enforced: the variation gate similarity + seed rotation)",
      'no recycled mechanism set — each video explains different physical rules against the last 5 videos (enforced: the variation gate similarity)',
      'no repeated hook across the channel\'s last 5 videos (enforced: the variation gate similarity)',
      'the science stays sourced — every mechanism tied to its discovery or measurement (prose for the author and the review desk — spec Honest Limits)',
    ],
    review_thumb_pick: true,
    safety: { required_sources: true, review_required: [], disclaimers: ['Science summarized from cited sources.'] },
    deprecated: false,
    changelog: [{ version: '1.0.0', date: '2026-11-05', note: 'template factory batch 1 — storybook look as a pickable science template' }],
  },

// ---- Template factory batch 2 (owner 2026-11-05): the 15-niche matrix —
// 10 storybook entries completing coverage (batch 1: history/wisdom/science;
// red-flags-explained: personal finance). Brand strings are KIT-driven (no
// brand/badge here — whichever channel assigns it keeps its own identity);
// palette + voice + music mood + layout cycle are template DATA.

  'investing-psychology-storybook': {
    version: '1.0.0',
    template_id: 'investing-psychology-storybook',
    family: 'documentary-frames',
    niches: ['Investing psychology & market wisdom'],
    formats: ['long', 'short'],
    renderer: 'remotion',
    required_capabilities: ['script-gen', 'tts', 'captions'],
    doc_presentation: { theme: 'investing', voice: 'en-US-BrianNeural', music_mood: 'mystical', doc_layouts: ['split', 'stat', 'split', 'versus', 'split', 'quote'] },
    story_structure: {
      doc_render: 'storybook',
      sections: ['cold_open', 'chapters:10', 'exhibits', 'outro'],
      chapter_min_words: 170,
      beats: ['the beat names the market emotion or myth investors act on, with the price it costs', 'the beat brings the cited evidence against it — the data the crowd ignores', 'the beat explains the mechanism — why the crowd gets it wrong and what disciplined investors do', 'the beat lands the disciplined stance — one rule with its evidence'],
      hook_classes: ['the-crowd-is-wrong call-out', 'shocking market number', 'you-stake investing question'],
      title_patterns: ['the-market-psychology explainer ("The Market Psychology Everyone Gets Backwards — Explained")', 'numbered investor-biases listicle ("5 Investor Biases That Cost You Real Money")', 'the-crowd-versus-data arc ("Why the Crowd Buys High and Sells Low — Explained")'],
      payoff_rule: 'the closing lands the disciplined stance — ONE rule with its evidence, never a summary',
    },
    variation_rules: [
      'distinct subject/arc per video — differs from every one in the channel\'s last 5 videos (enforced: the variation gate similarity + seed rotation)',
      'no recycled example set against the last 5 videos (enforced: the variation gate similarity)',
      'no repeated hook across the channel\'s last 5 videos (enforced: the variation gate similarity)',
      'every figure and fact is a cited source (prose for the author and the review desk — spec Honest Limits)'
    ],
    review_thumb_pick: true,
    safety: { required_sources: true, review_required: [], disclaimers: ['Market commentary from cited sources; not financial advice.'] },
    deprecated: false,
    changelog: [{ version: '1.0.0', date: '2026-11-05', note: 'template factory batch 2 — 15-niche matrix coverage' }],
  },

  'oldmoney-storybook': {
    version: '1.0.0',
    template_id: 'oldmoney-storybook',
    family: 'documentary-frames',
    niches: ['Old money habits & quiet wealth'],
    formats: ['long', 'short'],
    renderer: 'remotion',
    required_capabilities: ['script-gen', 'tts', 'captions'],
    doc_presentation: { theme: 'history', voice: 'en-US-AndrewNeural', music_mood: 'calming', doc_layouts: ['split', 'quote', 'split', 'timeline', 'split'] },
    story_structure: {
      doc_render: 'storybook',
      sections: ['cold_open', 'chapters:10', 'exhibits', 'outro'],
      chapter_min_words: 170,
      beats: ['the beat names the quiet habit old money never abandons, with its cost contrast', 'the beat brings its origin — the family or institution and the record', 'the beat explains the mechanism — why it compounds quietly while noise spends', 'the beat lands the payoff — adopt it small, keep it decades'],
      hook_classes: ['quiet-wealth contrast', 'old-family record call-out', 'generational question'],
      title_patterns: ['the-quiet-habits explainer ("The Quiet Habits of Old Money — Explained")', 'numbered old-money rules listicle ("5 Old-Money Rules That Never Appear on Instagram")', 'the-silent-compounding arc ("Why Real Wealth Stays Silent — Explained")'],
      payoff_rule: 'the closing lands the habit restated as one quiet rule the viewer can start tonight',
    },
    variation_rules: [
      'distinct subject/arc per video — differs from every one in the channel\'s last 5 videos (enforced: the variation gate similarity + seed rotation)',
      'no recycled example set against the last 5 videos (enforced: the variation gate similarity)',
      'no repeated hook across the channel\'s last 5 videos (enforced: the variation gate similarity)',
      'every figure and fact is a cited source (prose for the author and the review desk — spec Honest Limits)'
    ],
    review_thumb_pick: true,
    safety: { required_sources: true, review_required: [], disclaimers: ['Old-money practices retold from cited records; not financial advice.'] },
    deprecated: false,
    changelog: [{ version: '1.0.0', date: '2026-11-05', note: 'template factory batch 2 — 15-niche matrix coverage' }],
  },

  'realestate-storybook': {
    version: '1.0.0',
    template_id: 'realestate-storybook',
    family: 'documentary-frames',
    niches: ['Real estate wisdom & property'],
    formats: ['long', 'short'],
    renderer: 'remotion',
    required_capabilities: ['script-gen', 'tts', 'captions'],
    doc_presentation: { theme: 'science', voice: 'en-US-BrianNeural', music_mood: 'bright', doc_layouts: ['split', 'stat', 'split', 'process', 'split'] },
    story_structure: {
      doc_render: 'storybook',
      sections: ['cold_open', 'chapters:10', 'exhibits', 'outro'],
      chapter_min_words: 170,
      beats: ['the beat opens the property decision everyone faces — rent, buy, or wait', 'the beat brings the numbers that actually decide it — cited, not listed', 'the beat explains the mechanism — location, leverage, and the cycle', 'the beat lands the payoff — the checklist before any deed is signed'],
      hook_classes: ['the-deed question', 'shaking market number', 'rent-versus-own stake'],
      title_patterns: ['the-property-math explainer ("The Math Behind Every Smart Property Buy — Explained")', 'numbered listing red-flags listicle ("5 Red Flags Hiding in a Perfect Listing")', 'rent-buy-or-wait arc ("Rent, Buy, or Wait — the Numbers Decide")'],
      payoff_rule: 'the closing lands the checklist — the numbers restated so the viewer can run them on any listing',
    },
    variation_rules: [
      'distinct subject/arc per video — differs from every one in the channel\'s last 5 videos (enforced: the variation gate similarity + seed rotation)',
      'no recycled example set against the last 5 videos (enforced: the variation gate similarity)',
      'no repeated hook across the channel\'s last 5 videos (enforced: the variation gate similarity)',
      'every figure and fact is a cited source (prose for the author and the review desk — spec Honest Limits)'
    ],
    review_thumb_pick: true,
    safety: { required_sources: true, review_required: [], disclaimers: ['Property commentary from cited sources; not financial advice.'] },
    deprecated: false,
    changelog: [{ version: '1.0.0', date: '2026-11-05', note: 'template factory batch 2 — 15-niche matrix coverage' }],
  },

  'insurance-storybook': {
    version: '1.0.0',
    template_id: 'insurance-storybook',
    family: 'documentary-frames',
    niches: ['Insurance explained simply'],
    formats: ['long', 'short'],
    renderer: 'remotion',
    required_capabilities: ['script-gen', 'tts', 'captions'],
    doc_presentation: { theme: 'investing', voice: 'en-US-AriaNeural', music_mood: 'calming', doc_layouts: ['split', 'process', 'split', 'stat'] },
    story_structure: {
      doc_render: 'storybook',
      sections: ['cold_open', 'chapters:10', 'exhibits', 'outro'],
      chapter_min_words: 170,
      beats: ['the beat opens the risk everyone carries and rarely names', 'the beat translates what the policy really promises — the clause in plain words', 'the beat explains the mechanism — how pooled premiums pay, and when they refuse', 'the beat lands the payoff — the coverage checklist in plain words'],
      hook_classes: ['the-fine-print call-out', 'the-payout number', 'are-you-covered question'],
      title_patterns: ['the-clause explainer ("The Insurance Clause Everyone Misreads — Explained")', 'numbered exclusions listicle ("5 Exclusions That Empty a Policy")', 'how-it-really-pays arc ("How Insurance Really Pays — Explained Simply")'],
      payoff_rule: 'the closing lands the coverage checklist — the viewer knows exactly what their policy does and refuses',
    },
    variation_rules: [
      'distinct subject/arc per video — differs from every one in the channel\'s last 5 videos (enforced: the variation gate similarity + seed rotation)',
      'no recycled example set against the last 5 videos (enforced: the variation gate similarity)',
      'no repeated hook across the channel\'s last 5 videos (enforced: the variation gate similarity)',
      'every figure and fact is a cited source (prose for the author and the review desk — spec Honest Limits)'
    ],
    review_thumb_pick: true,
    safety: { required_sources: true, review_required: [], disclaimers: ['Insurance explained from cited policy language; not advice.'] },
    deprecated: false,
    changelog: [{ version: '1.0.0', date: '2026-11-05', note: 'template factory batch 2 — 15-niche matrix coverage' }],
  },

  'tax-storybook': {
    version: '1.0.0',
    template_id: 'tax-storybook',
    family: 'documentary-frames',
    niches: ['Small-business tax & legal principles'],
    formats: ['long', 'short'],
    renderer: 'remotion',
    required_capabilities: ['script-gen', 'tts', 'captions'],
    doc_presentation: { theme: 'science', voice: 'en-US-ChristopherNeural', music_mood: 'driving', doc_layouts: ['split', 'process', 'split', 'versus', 'split'] },
    story_structure: {
      doc_render: 'storybook',
      sections: ['cold_open', 'chapters:10', 'exhibits', 'outro'],
      chapter_min_words: 170,
      beats: ['the beat opens the tax surprise that sinks otherwise good businesses', 'the beat brings the preventing principle — the code or ruling in plain words', 'the beat explains the mechanism — structure, timing, and the records that hold up', 'the beat lands the payoff — the legal checklist to run this quarter'],
      hook_classes: ['the-agency-letter call-out', 'the-bill number', 'is-your-structure question'],
      title_patterns: ['the-tax-moves explainer ("The Tax Moves Every Small Business Misses — Explained")', 'numbered legal-slips listicle ("5 Legal Slips That Sink a Small Business")', 'the-structure showdown ("LLC or S-Corp — the Numbers Decide")'],
      payoff_rule: 'the closing lands the legal checklist — the quarter ends with every box ticked, never a scramble',
    },
    variation_rules: [
      'distinct subject/arc per video — differs from every one in the channel\'s last 5 videos (enforced: the variation gate similarity + seed rotation)',
      'no recycled example set against the last 5 videos (enforced: the variation gate similarity)',
      'no repeated hook across the channel\'s last 5 videos (enforced: the variation gate similarity)',
      'every figure and fact is a cited source (prose for the author and the review desk — spec Honest Limits)'
    ],
    review_thumb_pick: true,
    safety: { required_sources: true, review_required: [], disclaimers: ['Tax and legal principles from cited code and rulings; not legal or tax advice.'] },
    deprecated: false,
    changelog: [{ version: '1.0.0', date: '2026-11-05', note: 'template factory batch 2 — 15-niche matrix coverage' }],
  },

  'business-storybook': {
    version: '1.0.0',
    template_id: 'business-storybook',
    family: 'documentary-frames',
    niches: ['Entrepreneurship & lean business'],
    formats: ['long', 'short'],
    renderer: 'remotion',
    required_capabilities: ['script-gen', 'tts', 'captions'],
    doc_presentation: { theme: 'poster', voice: 'en-US-BrianNeural', music_mood: 'driving', doc_layouts: ['split', 'process', 'split', 'stat', 'split'] },
    story_structure: {
      doc_render: 'storybook',
      sections: ['cold_open', 'chapters:10', 'exhibits', 'outro'],
      chapter_min_words: 170,
      beats: ['the beat opens the venture myth — build it and they will come', 'the beat counters with the lean truth — the first paying customer beats the perfect plan', 'the beat explains the mechanism — build-measure-learn loops that cut burn', 'the beat lands the payoff — the lean checklist to run this week'],
      hook_classes: ['the-failure-rate number', 'the-garage-origin call-out', 'would-you-pay question'],
      title_patterns: ['the-lean-loop explainer ("The Lean Loop That Builds Businesses — Explained")', 'numbered startup-rules listicle ("5 Startup Rules Investors Actually Check")', 'the-failed-launch arc ("Why Most Launches Fail Before the Product Exists")'],
      payoff_rule: 'the closing lands the lean checklist — one loop the viewer runs before writing another line of plan',
    },
    variation_rules: [
      'distinct subject/arc per video — differs from every one in the channel\'s last 5 videos (enforced: the variation gate similarity + seed rotation)',
      'no recycled example set against the last 5 videos (enforced: the variation gate similarity)',
      'no repeated hook across the channel\'s last 5 videos (enforced: the variation gate similarity)',
      'every figure and fact is a cited source (prose for the author and the review desk — spec Honest Limits)'
    ],
    review_thumb_pick: true,
    safety: { required_sources: true, review_required: [], disclaimers: ['Business commentary; not legal or financial advice.'] },
    deprecated: false,
    changelog: [{ version: '1.0.0', date: '2026-11-05', note: 'template factory batch 2 — 15-niche matrix coverage' }],
  },

  'sales-storybook': {
    version: '1.0.0',
    template_id: 'sales-storybook',
    family: 'documentary-frames',
    niches: ['Sales & negotiation psychology'],
    formats: ['long', 'short'],
    renderer: 'remotion',
    required_capabilities: ['script-gen', 'tts', 'captions'],
    doc_presentation: { theme: 'poster', voice: 'en-US-AriaNeural', music_mood: 'uplifting', doc_layouts: ['split', 'versus', 'split', 'quote', 'split'] },
    story_structure: {
      doc_render: 'storybook',
      sections: ['cold_open', 'chapters:10', 'exhibits', 'outro'],
      chapter_min_words: 170,
      beats: ['the beat opens the negotiation moment everyone fears — the price conversation', 'the beat brings the psychology — anchoring, loss aversion, the silence that closes', 'the beat explains the mechanism — why price is a story before it is a number', 'the beat lands the payoff — the opening move for the next difficult call'],
      hook_classes: ['the-handshake myth', 'the-discount number', 'walk-away question'],
      title_patterns: ['the-psychology-of-yes explainer ("The Psychology of Every Yes — Explained")', 'numbered negotiation-moves listicle ("5 Negotiation Moves That Beat Any Discount")', 'the-anchoring explainer ("Anchoring: Why the First Number Wins — Explained")'],
      payoff_rule: 'the closing lands the opening move — one anchor the viewer sets in the next conversation',
    },
    variation_rules: [
      'distinct subject/arc per video — differs from every one in the channel\'s last 5 videos (enforced: the variation gate similarity + seed rotation)',
      'no recycled example set against the last 5 videos (enforced: the variation gate similarity)',
      'no repeated hook across the channel\'s last 5 videos (enforced: the variation gate similarity)',
      'every figure and fact is a cited source (prose for the author and the review desk — spec Honest Limits)'
    ],
    review_thumb_pick: true,
    safety: { required_sources: true, review_required: [], disclaimers: ['Negotiation commentary; results vary by deal.'] },
    deprecated: false,
    changelog: [{ version: '1.0.0', date: '2026-11-05', note: 'template factory batch 2 — 15-niche matrix coverage' }],
  },

  'travel-storybook': {
    version: '1.0.0',
    template_id: 'travel-storybook',
    family: 'documentary-frames',
    niches: ['Travel & geography explained'],
    formats: ['long', 'short'],
    renderer: 'remotion',
    required_capabilities: ['script-gen', 'tts', 'captions'],
    doc_presentation: { theme: 'travel', voice: 'en-US-AriaNeural', music_mood: 'bright', doc_layouts: ['split', 'map', 'split', 'timeline', 'split'] },
    story_structure: {
      doc_render: 'storybook',
      sections: ['cold_open', 'chapters:10', 'exhibits', 'outro'],
      chapter_min_words: 170,
      beats: ['the beat opens the place and the question — why here, why a border bends there', 'the beat brings the geography that shaped it — routes, resources, rivers', 'the beat explains the turning chapter — the event that redrew the map', 'the beat lands the payoff — what the map teaches about every journey since'],
      hook_classes: ['the-border question', 'the-distance number', 'hidden-place call-out'],
      title_patterns: ['the-border explainer ("Why This Border Makes No Sense — Explained")', 'numbered maps listicle ("5 Maps That Redrew the World")', 'the-route arc ("The Route That Built a Nation — Explained")'],
      payoff_rule: 'the closing lands the map lesson — the route restated so the viewer traces it on any map',
    },
    variation_rules: [
      'distinct subject/arc per video — differs from every one in the channel\'s last 5 videos (enforced: the variation gate similarity + seed rotation)',
      'no recycled example set against the last 5 videos (enforced: the variation gate similarity)',
      'no repeated hook across the channel\'s last 5 videos (enforced: the variation gate similarity)',
      'every figure and fact is a cited source (prose for the author and the review desk — spec Honest Limits)'
    ],
    review_thumb_pick: true,
    safety: { required_sources: true, review_required: [], disclaimers: ['Geography and history retold from cited sources.'] },
    deprecated: false,
    changelog: [{ version: '1.0.0', date: '2026-11-05', note: 'template factory batch 2 — 15-niche matrix coverage' }],
  },

  'ai-storybook': {
    version: '1.0.0',
    template_id: 'ai-storybook',
    family: 'documentary-frames',
    niches: ['AI & future tech'],
    formats: ['long', 'short'],
    renderer: 'remotion',
    required_capabilities: ['script-gen', 'tts', 'captions'],
    doc_presentation: { theme: 'poster', voice: 'en-US-BrianNeural', music_mood: 'driving', doc_layouts: ['split', 'terminal', 'split', 'stat', 'split'] },
    story_structure: {
      doc_render: 'storybook',
      sections: ['cold_open', 'chapters:10', 'exhibits', 'outro'],
      chapter_min_words: 170,
      beats: ['the beat opens the machine everyone uses and few understand', 'the beat names the mechanism — the one idea under the model or chip, sourced', 'the beat follows the chain — how the capability escapes the lab into their pocket', 'the beat lands the payoff — what to now expect, and the one limit to respect'],
      hook_classes: ['the-everyday-machine call-out', 'the-parameter number', 'the-capability question'],
      title_patterns: ['the-hidden-mechanism explainer ("Inside the Model That Writes Back — Explained")', 'numbered capability listicle ("5 AI Capabilities That Quietly Crossed the Line")', 'the-lab-to-life arc ("How a Research Paper Became Your Pocket — Explained")'],
      payoff_rule: 'the closing lands the expectation — the capability restated as one chain with its honest limit',
    },
    variation_rules: [
      'distinct subject/arc per video — differs from every one in the channel\'s last 5 videos (enforced: the variation gate similarity + seed rotation)',
      'no recycled example set against the last 5 videos (enforced: the variation gate similarity)',
      'no repeated hook across the channel\'s last 5 videos (enforced: the variation gate similarity)',
      'every figure and fact is a cited source (prose for the author and the review desk — spec Honest Limits)'
    ],
    review_thumb_pick: true,
    safety: { required_sources: true, review_required: [], disclaimers: ['AI capability explained from cited papers and releases.'] },
    deprecated: false,
    changelog: [{ version: '1.0.0', date: '2026-11-05', note: 'template factory batch 2 — 15-niche matrix coverage' }],
  },

  'focus-storybook': {
    version: '1.0.0',
    template_id: 'focus-storybook',
    family: 'documentary-frames',
    niches: ['Focus & productivity systems'],
    formats: ['long', 'short'],
    renderer: 'remotion',
    required_capabilities: ['script-gen', 'tts', 'captions'],
    doc_presentation: { theme: 'focus', voice: 'en-US-AvaNeural', music_mood: 'calming', doc_layouts: ['split', 'process', 'split', 'stat', 'split'] },
    story_structure: {
      doc_render: 'storybook',
      sections: ['cold_open', 'chapters:10', 'exhibits', 'outro'],
      chapter_min_words: 170,
      beats: ['the beat opens the distraction everyone loses to — named plainly', 'the beat brings the system that beats it — one principle from the research', 'the beat explains the mechanism — attention economics: why willpower loses to design', 'the beat lands the payoff — the next morning\'s one protected block, planned now'],
      hook_classes: ['the-tab-count call-out', 'the-hours number', 'deep-work question'],
      title_patterns: ['the-focus-system explainer ("The Focus System That Beats Every App — Explained")', 'numbered rules listicle ("5 Rules for Work That Actually Counts")', 'the-willpower arc ("Why Willpower Always Loses to Design — Explained")'],
      payoff_rule: 'the closing lands the system — the viewer plans tomorrow\'s one protected block before the video ends',
    },
    variation_rules: [
      'distinct subject/arc per video — differs from every one in the channel\'s last 5 videos (enforced: the variation gate similarity + seed rotation)',
      'no recycled example set against the last 5 videos (enforced: the variation gate similarity)',
      'no repeated hook across the channel\'s last 5 videos (enforced: the variation gate similarity)',
      'every figure and fact is a cited source (prose for the author and the review desk — spec Honest Limits)'
    ],
    review_thumb_pick: true,
    safety: { required_sources: true, review_required: [], disclaimers: ['Productivity research summarized from cited studies.'] },
    deprecated: false,
    changelog: [{ version: '1.0.0', date: '2026-11-05', note: 'template factory batch 2 — 15-niche matrix coverage' }],
  },

  {
    "version": "1.0.0",
    "template_id": "cashflow-challenge-storybook",
    "family": "documentary-frames",
    "niches": [
      "Personal finance rules & money habits"
    ],
    "formats": [
      "long",
      "short"
    ],
    "renderer": "remotion",
    "required_capabilities": [
      "script-gen",
      "tts",
      "captions"
    ],
    "doc_presentation": {
      "theme": "brief",
      "voice": "en-US-AndrewNeural",
      "music_mood": "bright",
      "doc_layouts": [
        "split",
        "quote",
        "process",
        "timeline",
        "map",
        "split"
      ],
      "brand": "IRON SAVER",
      "badge": "IS",
      "eyebrow": "FINANCE HABITS // IS"
    },
    "story_structure": {
      "doc_render": "storybook",
      "sections": [
        "cold_open",
        "hook_escalation",
        "deep_investigation",
        "verdict_payoff",
        "outro"
      ],
      "chapter_min_words": 170,
      "beats": [
        "Show a screenshot of the budgeting app (e.g., YNAB) with a $2,000 emergency-fund category highlighted.",
        "Walk through the payroll-split automation that routes 15% of each paycheck into a high-yield savings account.",
        "Demonstrate the envelope-style budgeting sheet with color-coded categories for needs, wants, and savings.",
        "Reveal a before-and-after net-worth chart illustrating a $5,000 boost after one year of the habit stack."
      ],
      "hook_classes": [
        "shocking stat",
        "personal story",
        "what-if scenario"
      ],
      "title_patterns": [
        "\"The $2,000 Emergency Fund Hack That Turned Into $8,000 in 90 Days\"",
        "\"How I Automated a $500 Monthly Surplus Using Envelope Apps\"",
        "\"From $2K to $8K: The 3-Month Cash-Flow Stack That Works\""
      ],
      "payoff_rule": "Never spend more than you earn; automate the surplus and watch it compound.",
      "has_chapters": false,
      "narrative_format": "full_story",
      "format_label": "Full Story (Continuous Narrative)",
      "format_description": "Full continuous narrative documentary arc — seamless story progression with zero chapter dividers."
    },
    "variation_rules": [
      "distinct subject/arc per video — differs from every one in the channel's last 5 videos (enforced: the variation gate similarity + seed rotation)",
      "no recycled example set against the last 5 videos (enforced: the variation gate similarity)",
      "no repeated hook across the channel's last 5 videos (enforced: the variation gate similarity)",
      "every figure and fact is a cited source (prose for the author and the review desk — spec Honest Limits)"
    ],
    "review_thumb_pick": true,
    "safety": {
      "required_sources": true,
      "review_required": [],
      "disclaimers": [
        "The strategies shown focus on personal finance habits and are not a substitute for professional financial advice."
      ]
    },
    "deprecated": false,
    "changelog": [
      {
        "version": "1.0.0",
        "date": "2026-11-05",
        "note": "template bot draft — staged, awaiting owner approval (--approve)"
      }
    ]
  },

  {
    "version": "1.0.0",
    "template_id": "deep-reset-storybook",
    "family": "documentary-frames",
    "niches": [
      "Sleep & recovery science"
    ],
    "formats": [
      "long",
      "short"
    ],
    "renderer": "remotion",
    "required_capabilities": [
      "script-gen",
      "tts",
      "captions"
    ],
    "doc_presentation": {
      "theme": "midnight",
      "voice": "en-US-AriaNeural",
      "music_mood": "calming",
      "doc_layouts": [
        "split",
        "stat",
        "quote",
        "split",
        "process",
        "split"
      ],
      "brand": "DEEP RESET",
      "badge": "DR",
      "eyebrow": "SLEEP & RECOVERY // DR"
    },
    "story_structure": {
      "doc_render": "storybook",
      "sections": [
        "cold_open",
        "hook_escalation",
        "deep_investigation",
        "verdict_payoff",
        "outro"
      ],
      "chapter_min_words": 170,
      "beats": [
        "Opening: Your brain runs its cleaning crew at 3AM — the glymphatic system flushes the day's waste while you sleep.",
        "Evidence: A shift worker rebuilds her sleep in 30 days with one change: fixed wake time, every day, no exceptions.",
        "Mechanism: The 90-minute cycle explained — why waking mid-cycle wrecks the day and how to time your alarm.",
        "Payoff: The wind-down stack: light, temperature, and the paper list that closes tomorrow's loops tonight."
      ],
      "hook_classes": [
        "the-hidden mechanism",
        "the-case rebuild",
        "the-ritual promise"
      ],
      "title_patterns": [
        "The 90-Minute Rule That Fixes Broken Sleep",
        "Your Brain Cleans Itself at 3AM — The Glymphatic Story",
        "How One Shift Worker Rebuilt Her Sleep in 30 Days"
      ],
      "payoff_rule": "the closing sets ONE change for tonight — the viewer starts the protocol in hours, not weeks",
      "narrative_format": "full_story",
      "has_chapters": false,
      "format_label": "Full Story (Continuous Narrative)",
      "format_description": "Full continuous narrative documentary arc — seamless story progression with zero chapter dividers."
    },
    "variation_rules": [
      "distinct subject/arc per video — differs from every one in the channel's last 5 videos (enforced: the variation gate similarity + seed rotation)",
      "no recycled example set against the last 5 videos (enforced: the variation gate similarity)",
      "no repeated hook across the channel's last 5 videos (enforced: the variation gate similarity)",
      "every figure and fact is a cited source (prose for the author and the review desk — spec Honest Limits)"
    ],
    "review_thumb_pick": true,
    "safety": {
      "required_sources": true,
      "review_required": [],
      "disclaimers": [
        "Sleep science education from cited sources — not medical advice; consult a clinician for persistent sleep disorders."
      ]
    },
    "deprecated": false,
    "changelog": [
      {
        "version": "1.0.0",
        "date": "2026-11-09",
        "note": "style-catalog batch draft (theme: midnight) — staged, awaiting owner approval (--approve)"
      }
    ]
  },

  // ---- REMOVED 2026-11-04 (owner-approved catalog cleanup): 'quote-cards-premium'
  // retired WITH its family — the entry WAS the QQ shorts recipe bound to its own
  // family (owner call: retire the recipe with the family). QQ reverts to its
  // proven kit-less lane (the live weekly doc is kit-driven and unaffected).
};

