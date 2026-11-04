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
      chip: 'SCANDALS',
      brandmark: 'MONEYRULEBOOK',
      accent_word: 'last',
      scrim_tint: '#7A1E1E',
      accent: '#F0776E',
      eyebrow: 'MONEY RULEBOOK',
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

  // ---- REMOVED 2026-11-04 (owner-approved catalog cleanup): 'quote-cards-premium'
  // retired WITH its family — the entry WAS the QQ shorts recipe bound to its own
  // family (owner call: retire the recipe with the family). QQ reverts to its
  // proven kit-less lane (the live weekly doc is kit-driven and unaffected).
};

