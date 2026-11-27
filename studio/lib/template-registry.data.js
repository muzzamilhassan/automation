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
// - `display_name` — the template's own human name, shown on every Studio
//   surface (templateDisplayName in template-registry.js). Unique across the
//   registry (tests/template-names.test.mjs). Missing → the family's name for
//   the family itself, else the id made readable.
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
    display_name: 'Documentary Master Frames',
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
    deprecated: true,
    deprecated_on: '2026-11-23',
    changelog: [{ version: '1.0.0', date: '2026-10-26', note: 'initial registry entry' }],
  },
  'timeline-history': {
    version: '1.0.0',
    template_id: 'timeline-history',
    display_name: 'Chronological Timeline Rail',
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
    deprecated: true,
    deprecated_on: '2026-11-23',
    changelog: [{ version: '1.0.0', date: '2026-10-26', note: 'initial registry entry' }],
  },
  'photo-stories': {
    version: '1.0.0',
    template_id: 'photo-stories',
    display_name: '2.5D Parallax Photo Story',
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
    deprecated: true,
    deprecated_on: '2026-11-23',
    changelog: [{ version: '1.0.0', date: '2026-10-26', note: 'initial registry entry' }],
  },

  // ---- finance lane (YMYL: every seed requires sources + finance review) ----
  'finance-explainers': {
    version: '1.0.0',
    template_id: 'finance-explainers',
    display_name: 'Macroeconomics & Ledger Story',
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
    deprecated: true,
    deprecated_on: '2026-11-23',
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
    display_name: 'Investigative Paper Headlines',
    niches: ['History stories'],
    formats: ['long'],
    renderer: 'remotion',
    required_capabilities: ['script-gen', 'tts', 'captions'],
    variation_rules: [
      'distinct storyline/focus per video — each video investigates a different event, era, or document set (no repeats)',
      'no repeated hook across the channel\'s last 5 videos',
    ],
    safety: { required_sources: true, review_required: [] },
    deprecated: true,
    deprecated_on: '2026-11-23',
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
    display_name: 'Myth vs Money',
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
    deprecated: true,
    deprecated_on: '2026-11-23',
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
    display_name: 'Red Flags Explained',
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
// ---- Template factory batch 2 (owner 2026-11-05): the 15-niche matrix —
// 10 storybook entries completing coverage (batch 1: history/wisdom/science;
// red-flags-explained: personal finance). Brand strings are KIT-driven (no
// brand/badge here — whichever channel assigns it keeps its own identity);
// palette + voice + music mood + layout cycle are template DATA.

  'cashflow-challenge-storybook': {
    "version": "1.0.0",
    "template_id": "cashflow-challenge-storybook",
    "display_name": "Cashflow Challenge Storybook",
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
      "review_required": ["all"],
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

  'money-flow-diagram': {
    "version": "1.0.0",
    "template_id": "money-flow-diagram",
    "display_name": "Money Flow Diagram",
    "family": "documentary-frames",
    "niches": [
      "Personal finance rules & money habits",
      "Investing psychology & market wisdom",
      "Old money habits & quiet wealth",
      "Real estate wisdom & property",
      "Insurance explained simply",
      "Small-business tax & legal principles",
      "Entrepreneurship & lean business"
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
    "thumb_design": {
      "layout": "left-stack",
      "accent_word": "last",
      "scrim_tint": "#0F2A22"
    },
    "doc_presentation": {
      "style": "tile",
      "music_mood": "bright"
    },
    "story_structure": {
      "doc_render": "diagram",
      "sections": [
        "cold_open",
        "chapters:10",
        "exhibits",
        "outro"
      ],
      "chapter_min_words": 120,
      "beats": [
        "slot 1 shows where the money goes today — the income, the accounts and the bills it flows through, with real dollar amounts",
        "slot 2 names the leak — the one flow that quietly drains the account, its monthly $ cost and why nobody notices it",
        "slot 3 flips the order — the rule that reroutes the money, step by step, each step a flow the viewer could draw",
        "slot 4 is the payoff — the same money after 1, 5 and 10 years, compared side by side in plain numbers"
      ],
      "hook_classes": [
        "where-did-my-money-go question",
        "shocking $ leak number",
        "same money, two outcomes"
      ],
      "title_patterns": [
        "money-flow explainer (\"Where Your Paycheck Actually Goes — Explained\")",
        "one-rule rewire (\"Pay Yourself First: The Order That Builds Wealth\")",
        "side-by-side outcome (\"Same $4,000 Salary, Two Very Different Lives\")"
      ],
      "payoff_rule": "the closing lands one before/after comparison in plain numbers plus the single rule to keep — a mic-drop, never a summary",
      "has_chapters": true,
      "narrative_format": "chapters",
      "format_label": "Money Flow (animated diagram)",
      "format_description": "Money as a living diagram on dark tiles: paycheck, bills, savings and debt are boxes joined by arrows, and money flows between them as the narrator says each word — leaks drain, savings grow, the numbers count up on screen. Name, colours and voice come from each channel's own kit."
    },
    "variation_rules": [
      "distinct money flow per video — the habit or account mechanism differs from every case in the channel's last 5 videos (enforced: the variation gate similarity + seed rotation)",
      "no recycled example set — different dollar scenarios against the last 5 videos (enforced: the variation gate similarity)",
      "no repeated hook across the channel's last 5 videos (enforced: the variation gate similarity)",
      "every figure is concrete and checkable (a stated salary, rate or period) — prose for the author and the review desk"
    ],
    "review_thumb_pick": true,
    "safety": {
      "required_sources": true,
      "review_required": [
        "finance"
      ],
      "disclaimers": [
        "Education, not financial advice."
      ]
    },
    "deprecated": false,
    "changelog": [
      {
        "version": "1.0.0",
        "date": "2026-11-17",
        "note": "step 1 (owner-approved): the Living Diagram doc look for ANY money channel — story_structure.doc_render = diagram renders the approved words as one diagram per chapter, cues fired on the spoken word; brand name/colours/voice come from each channel's kit; falls back to the storybook look on any failure (docs/qa/step1-mr-voice-moneyflow-qa.md, docs/templates/living-diagram.md)"
      }
    ]
  },

  'mr-case-files-storybook': {
    "version": "1.0.0",
    "template_id": "mr-case-files-storybook",
    "display_name": "Case Files Storybook",
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
      "style": "statement-receipt",
      "theme": "signal",
      "voice": "en-US-BrianNeural",
      "music_mood": "driving",
      "doc_layouts": [
        "quote",
        "stat",
        "quote",
        "versus",
        "quote",
        "split"
      ],
      "brand": "LEDGER PROOF",
      "badge": "LP",
      "eyebrow": "CASE FILES // LP"
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
        "Opening: A family's grocery receipt shows $412 in a normal week — the audit finds $186 of it was pure friction, not food.",
        "Evidence: The bank statement line nobody reads — the $11.99 subscription that renewed 34 times, circled in red on the exhibit.",
        "Mechanism: The receipt audit ritual: every purchase gets a category, a verdict stamp, and a rule that stops the leak.",
        "Payoff: The closed case — $2,910 redirected to savings in one year, stamped VERIFIED."
      ],
      "hook_classes": [
        "the-exhibit reveal",
        "the-leaked line",
        "the-verdict close"
      ],
      "title_patterns": [
        "The $186 Grocery Lie: What a 30-Day Receipt Audit Really Finds",
        "Exhibit A: The $11.99 Charge That Renewed 34 Times",
        "Case Closed: $2,910 Redirected to Savings in One Year"
      ],
      "payoff_rule": "the closing stamps the verdict and hands the viewer the audit rule",
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
      "review_required": ["all"],
      "disclaimers": [
        "Educational money audits with cited sources — not financial advice."
      ]
    },
    "deprecated": false,
    "changelog": [
      {
        "version": "1.0.0",
        "date": "2026-11-09",
        "note": "family F1 statement-receipt draft (MR pilot) — staged, awaiting owner approval (--approve)"
      }
    ]
  },

  'old-verses-storybook': {
    "version": "1.1.0",
    "template_id": "old-verses-storybook",
    "display_name": "Old Verses Storybook",
    "family": "documentary-frames",
    "niches": [
      "Timeless wisdom, self-mastery & human psychology"
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
      "style": "landscape-quote",
      "theme": "letterpress",
      "voice": "en-US-EmmaNeural",
      "music_mood": "mystical",
      "doc_layouts": [
        "quote",
        "split",
        "quote",
        "stat",
        "quote",
        "split"
      ],
      "brand": "OLD VERSES",
      "badge": "OV",
      "eyebrow": "TIMELESS VERSES // OV",
      "background": "broll"
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
        "Opening: Marcus Aurelius wrote to himself at dawn, never for an audience — the Meditations were private notes that survived an empire.",
        "Evidence: The letter Seneca sent at 3AM — 'every night, examine your day' — and the psychology that proves the habit works.",
        "Mechanism: Why the verses endure: they compress a rule into rhythm, and rhythm survives translation after translation.",
        "Payoff: The evening verse practice — one line, read slowly, before the lamp goes out."
      ],
      "hook_classes": [
        "the-private note",
        "the-letter",
        "the-evening practice"
      ],
      "title_patterns": [
        "Marcus Aurelius Never Meant for You to Read This",
        "The 3AM Letter That Taught Rome to Examine a Day",
        "One Verse a Night: The Oldest Evening Practice on Record"
      ],
      "payoff_rule": "the closing leaves one verse held in silence — the viewer reads it nightly",
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
      "review_required": ["all"],
      "disclaimers": [
        "Philosophy and history retold from cited sources — not psychological or medical advice."
      ]
    },
    "deprecated": false,
    "changelog": [
      {
        "version": "1.0.0",
        "date": "2026-11-09",
        "note": "family F4 landscape-quote draft — staged, awaiting owner approval (--approve)"
      },
      {
        "version": "1.1.0",
        "date": "2026-11-27",
        "note": "owner request (QQ): continuous flow — doc_presentation.background = broll puts one stock video clip per shot (~15-30 s) behind the whole runtime; the background and letterbox no longer restart each sentence"
      }
    ]
  },

  'paper-trail-storybook': {
    "version": "1.0.0",
    "template_id": "paper-trail-storybook",
    "display_name": "Paper Trail Storybook",
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
      "style": "collage-archive",
      "theme": "vox",
      "voice": "en-US-AndrewNeural",
      "music_mood": "bright",
      "doc_layouts": [
        "split",
        "quote",
        "split",
        "process",
        "quote",
        "split"
      ],
      "brand": "PAPER TRAIL",
      "badge": "PT",
      "eyebrow": "THE MONEY ARCHIVE // PT"
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
        "Opening: A shoebox of receipts from 1974 — and the price tags that explain every money argument your family still has.",
        "Evidence: The clipping from the folder: 'A dollar saved is a dollar earned' — printed in a paper that cost five cents.",
        "Mechanism: Inflation as a storyteller — how each decade rewrote the same rule in new numbers.",
        "Payoff: The archive habit — one folder, one page a month, and your own paper trail becomes the lesson."
      ],
      "hook_classes": [
        "the-shoebox reveal",
        "the-clipping",
        "the-archive habit"
      ],
      "title_patterns": [
        "The 1974 Shoebox of Receipts That Explains Every Money Argument",
        "A Dollar Saved: The Clipping That Outlived Its Newspaper",
        "Start a Paper Trail: One Folder, One Page a Month"
      ],
      "payoff_rule": "the closing files the lesson — one habit the viewer starts this month",
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
      "review_required": ["all"],
      "disclaimers": [
        "Money-history storytelling with cited sources — not financial advice."
      ]
    },
    "deprecated": false,
    "changelog": [
      {
        "version": "1.0.0",
        "date": "2026-11-09",
        "note": "family F7 collage-archive draft (MR pilot #2) — staged, awaiting owner approval (--approve)"
      }
    ]
  },

  'silicon-pulse-storybook': {
    "version": "1.0.0",
    "template_id": "silicon-pulse-storybook",
    "display_name": "Silicon Pulse Storybook",
    "family": "documentary-frames",
    "niches": [
      "AI & future tech"
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
      "style": "glass-number",
      "theme": "volt",
      "voice": "en-US-AndrewNeural",
      "music_mood": "grooving",
      "doc_layouts": [
        "split",
        "stat",
        "split",
        "terminal",
        "quote",
        "split"
      ],
      "brand": "SILICON PULSE",
      "badge": "SP",
      "eyebrow": "TECH DECODED // SP"
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
        "Opening: The counter nobody watches — a modern data center passes 10 quadrillion operations while you read this title.",
        "Evidence: The benchmark sheet: same model, same prompt, 3 different chips — the spread is wider than three generations of phones.",
        "Mechanism: What a TOPS actually measures, and why marketing floors and lab ceilings tell different stories.",
        "Payoff: The decoder ring — three numbers on any AI datasheet that predict real-world feel."
      ],
      "hook_classes": [
        "the-running counter",
        "the-benchmark spread",
        "the-decoder ring"
      ],
      "title_patterns": [
        "10 Quadrillion Operations: Watching a Data Center Breathe",
        "Same Model, 3 Chips — A Benchmark Spread Bigger Than 3 Phone Generations",
        "The 3 Numbers on an AI Datasheet That Actually Matter"
      ],
      "payoff_rule": "the closing hands the viewer the decoder ring for the next datasheet they see",
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
      "review_required": ["all"],
      "disclaimers": [
        "Technology analysis with cited sources — not investment or security advice."
      ]
    },
    "deprecated": false,
    "changelog": [
      {
        "version": "1.0.0",
        "date": "2026-11-09",
        "note": "family F5 glass-number draft — staged, awaiting owner approval (--approve)"
      }
    ]
  },

  'switchboard-storybook': {
    "version": "1.0.0",
    "template_id": "switchboard-storybook",
    "display_name": "Switchboard Storybook",
    "family": "documentary-frames",
    "niches": [
      "Focus & productivity systems"
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
      "style": "board-system",
      "theme": "volt",
      "voice": "en-US-AndrewNeural",
      "music_mood": "driving",
      "doc_layouts": [
        "process",
        "split",
        "quote",
        "stat",
        "split",
        "terminal"
      ],
      "brand": "THE SWITCHBOARD",
      "badge": "SW",
      "eyebrow": "SYSTEMS BOARD // SW"
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
        "Opening: The board flips: 4 lines in, 4 lines out — the operator connecting every call was the original single-tasker.",
        "Evidence: The logbook: operators handling 300 calls a day made fewer errors than the experiment with parallel lines.",
        "Mechanism: Context switching costs — the 23-minute refocus tax, measured, and why the board never paid it.",
        "Payoff: Your switchboard rule — one line at a time, and the checklist that keeps it that way."
      ],
      "hook_classes": [
        "the-board flips",
        "the-logbook record",
        "the-operator rule"
      ],
      "title_patterns": [
        "The 1920s Operators Who Beat Multitasking 100 Years Early",
        "300 Calls a Day, Fewer Errors: The Single-Line Logbook",
        "The 23-Minute Tax Your Brain Pays Every Time You Switch"
      ],
      "payoff_rule": "the closing sets the switchboard rule — one line, one task, one day",
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
      "review_required": ["all"],
      "disclaimers": [
        "Productivity history and research summaries from cited sources — not psychological or medical advice."
      ]
    },
    "deprecated": false,
    "changelog": [
      {
        "version": "1.0.0",
        "date": "2026-11-09",
        "note": "family F8 board-system draft — staged, awaiting owner approval (--approve)"
      }
    ]
  },

  'systems-diagram': {
    "version": "1.0.0",
    "template_id": "systems-diagram",
    "display_name": "Systems Diagram",
    "family": "documentary-frames",
    "niches": [
      "AI & future tech",
      "Science & how things work",
      "Focus & productivity systems",
      "Human psychology & social dynamics",
      "Leadership & management wisdom",
      "Sales & negotiation psychology",
      "Travel & geography explained"
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
    "thumb_design": {
      "layout": "left-stack",
      "accent_word": "last",
      "scrim_tint": "#05131F"
    },
    "doc_presentation": {
      "style": "glow",
      "music_mood": "calming"
    },
    "story_structure": {
      "doc_render": "diagram",
      "sections": [
        "cold_open",
        "chapters:10",
        "exhibits",
        "outro"
      ],
      "chapter_min_words": 120,
      "beats": [
        "slot 1 opens on the system working normally — the parts (people, apps, servers, places) and how one request or decision travels between them",
        "slot 2 is the breaking point — the moment the flow overloads, leaks or fails, with the number that shows how bad it gets",
        "slot 3 is the mechanism that fixes it — one part added or one rule changed, explained step by step as flows between the parts",
        "slot 4 is the payoff — the same system under the same load, now holding, with the one idea worth remembering"
      ],
      "hook_classes": [
        "everything-breaks-at-3am cold open",
        "one shocking number",
        "you-use-this-every-day question"
      ],
      "title_patterns": [
        "how-it-works explainer (\"How Apps Survive a Million Requests\")",
        "numbered concepts (\"5 Ideas Behind Every App You Use\")",
        "breaking-point story (\"Why One Slow Server Can Crash Everything\")"
      ],
      "payoff_rule": "the closing replays the system once more, now working, and lands one idea in a single sentence — never a summary list",
      "has_chapters": true,
      "narrative_format": "chapters",
      "format_label": "Systems Diagram (animated, neon)",
      "format_description": "How a system works, drawn live in neon on a dark grid: parts appear as glowing nodes, arrows carry requests and data between them, and each step lights up exactly when the narrator says it. Name, colours and voice come from each channel's own kit."
    },
    "variation_rules": [
      "distinct system per video — the mechanism examined differs from every one in the channel's last 5 videos (enforced: the variation gate similarity + seed rotation)",
      "no recycled example set against the last 5 videos (enforced: the variation gate similarity)",
      "no repeated hook across the channel's last 5 videos (enforced: the variation gate similarity)",
      "every number is concrete and attributable (a measured rate, a count, a date) — prose for the author and the review desk"
    ],
    "review_thumb_pick": true,
    "safety": {
      "required_sources": true,
      "review_required": ["all"]
    },
    "deprecated": false,
    "changelog": [
      {
        "version": "1.0.0",
        "date": "2026-11-17",
        "note": "the Living Diagram doc look in the glow style (owner: reusable for future channels) — same engine as money-flow-diagram (story_structure.doc_render = diagram, doc_presentation.style = glow); brand name/colours/voice come from each channel's kit; falls back to the storybook look on any failure (docs/templates/living-diagram.md)"
      }
    ]
  },

  'iron-five-storybook': {
    "version": "1.0.0",
    "template_id": "iron-five-storybook",
    "display_name": "Iron Five Storybook",
    "family": "documentary-frames",
    "niches": [
      "Gym & training motivation"
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
      "style": "rank-countdown",
      "theme": "stoic",
      "voice": "en-US-ChristopherNeural",
      "music_mood": "heroic",
      "doc_layouts": [
        "split",
        "stat",
        "split",
        "quote",
        "versus",
        "split"
      ],
      "brand": "IRON FIVE",
      "badge": "IF",
      "eyebrow": "THE RANKINGS // IF"
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
        "Opening: The criteria up front — evidence, carry-over to real strength, and staying power. Five rules made the list.",
        "Evidence at #5: progressive overload — the oldest rule in the book and still the one that decides everything.",
        "Evidence at #3: the 48-hour protein rhythm — timing beats totals in the studies that controlled for both.",
        "Payoff at #1: showing up on the days you don't want to — the only rule every champion in the record shares."
      ],
      "hook_classes": [
        "the-criteria reveal",
        "the-countdown",
        "the-number one"
      ],
      "title_patterns": [
        "Top 5 Training Rules, Ranked by Evidence — #1 Isn't a Lift",
        "The 5 Rules That Decide Whether the Gym Works",
        "Ranked: What Actually Builds Strength (5-1)"
      ],
      "payoff_rule": "the closing reveals #1 and sends the viewer to run it today",
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
      "review_required": ["all"],
      "disclaimers": [
        "Fitness education from cited sources — not medical or training advice; consult a professional before changing your program."
      ]
    },
    "deprecated": false,
    "changelog": [
      {
        "version": "1.0.0",
        "date": "2026-11-09",
        "note": "family F3 rank-countdown draft — staged, awaiting owner approval (--approve)"
      }
    ]
  },

  'night-signal-storybook': {
    "version": "1.0.0",
    "template_id": "night-signal-storybook",
    "display_name": "Night Signal Storybook",
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
      "style": "dark-doc",
      "theme": "midnight",
      "voice": "en-US-AriaNeural",
      "music_mood": "calming",
      "doc_layouts": [
        "split",
        "quote",
        "split",
        "stat",
        "split",
        "quote"
      ],
      "brand": "NIGHT SIGNAL",
      "badge": "NS",
      "eyebrow": "NIGHT SCIENCE // NS"
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
        "Opening: One glowing fact — a single night of 5-hour sleep cuts memory consolidation by 40 percent.",
        "Evidence: The lab record: two groups, one task, eight hours versus five — the gap shows by morning.",
        "Mechanism: Adenosine wash and the glymphatic rinse — the brain's cleanup crew only runs at depth.",
        "Payoff: The one change that survives every study — a fixed wake time, held for 21 nights."
      ],
      "hook_classes": [
        "the-single fact",
        "the-lab record",
        "the-one change"
      ],
      "title_patterns": [
        "5 Hours of Sleep Erases 40% of Your Memory — The Overnight Evidence",
        "The Brain's Cleanup Crew Only Runs at Depth",
        "The One Sleep Change That Survives Every Study"
      ],
      "payoff_rule": "the closing leaves ONE fact glowing — the viewer keeps a single change",
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
      "review_required": ["all"],
      "disclaimers": [
        "Sleep science education from cited sources — not medical advice; see a clinician for persistent sleep disorders."
      ]
    },
    "deprecated": false,
    "changelog": [
      {
        "version": "1.0.0",
        "date": "2026-11-09",
        "note": "family F2 dark-doc draft — staged, awaiting owner approval (--approve)"
      }
    ]
  },

  'old-banners-storybook': {
    "version": "1.0.0",
    "template_id": "old-banners-storybook",
    "display_name": "Old Banners Storybook",
    "family": "documentary-frames",
    "niches": [
      "History stories"
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
      "style": "map-atlas",
      "theme": "frontier",
      "voice": "en-US-ChristopherNeural",
      "music_mood": "epic",
      "doc_layouts": [
        "split",
        "map",
        "split",
        "stat",
        "quote",
        "split"
      ],
      "brand": "OLD BANNERS",
      "badge": "OB",
      "eyebrow": "THE ATLAS // OB"
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
        "Opening: Three routes crossed one mountain pass — whoever held the pass held three empires' trade, and everyone knew it.",
        "Evidence: The survey maps and the garrison logs: supply wagons that never arrived, dated and counted.",
        "Mechanism: The pass economics — why a single ridge could tax three kingdoms and starve a fourth.",
        "Payoff: The atlas lesson — border lines on old maps are supply lines wearing costumes."
      ],
      "hook_classes": [
        "the-pass reveal",
        "the-missing wagons",
        "the-atlas lesson"
      ],
      "title_patterns": [
        "The Mountain Pass That Taxed Three Empires at Once",
        "The Supply Wagons That Never Arrived — A Logistics Mystery, Solved",
        "Border Lines Are Supply Lines Wearing Costumes"
      ],
      "payoff_rule": "the closing zooms the atlas out — geography explains what chroniclers dramatize",
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
      "review_required": ["all"],
      "disclaimers": [
        "History retold from cited sources — interpretations vary and historians debate the details."
      ]
    },
    "deprecated": false,
    "changelog": [
      {
        "version": "1.0.0",
        "date": "2026-11-09",
        "note": "family F6 map-atlas draft — staged, awaiting owner approval (--approve)"
      }
    ]
  },

  'lecture-notes-paper': {
    "version": "1.0.0",
    "template_id": "lecture-notes-paper",
    "display_name": "Lecture Notes Paper",
    "family": "documentary-frames",
    "niches": [
      "AI & future tech",
      "Science & how things work",
      "Focus & productivity systems",
      "Human psychology & social dynamics",
      "Entrepreneurship & lean business",
      "Leadership & management wisdom",
      "Travel & geography explained"
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
    "thumb_design": {
      "layout": "left-stack",
      "accent_word": "last",
      "scrim_tint": "#14112B"
    },
    "doc_presentation": {
      "style": "paper",
      "music_mood": "calming"
    },
    "story_structure": {
      "doc_render": "diagram",
      "sections": [
        "cold_open",
        "chapters:6",
        "outro"
      ],
      "chapter_min_words": 110,
      "beats": [
        "slot 1 is the problem as a concrete moment — a real app, a real person, a real number that breaks — never an abstract definition",
        "slot 2 gives an everyday analogy for the idea (\"think of it as ...\"), one sentence, then names the real term",
        "slot 3 is the worked example step by step — one short sentence per step, each step something the viewer could draw (a box filling, a counter, a line of code)",
        "slot 4 is the takeaway — \"here's what to take away\" plus two or three plain sentences, one idea each"
      ],
      "hook_classes": [
        "it-works-on-my-laptop-then-breaks cold open",
        "one shocking number",
        "you-use-this-every-day question"
      ],
      "title_patterns": [
        "lesson explainer (\"How a Hash Map Finds Anything in One Step\")",
        "full-course promise (\"Computer Science Basics in 1 Hour - Full Course\")",
        "concept clarity (\"Big O Finally Makes Sense After This Video\")"
      ],
      "payoff_rule": "every chapter ends on its takeaway sentences; the episode closes on one idea in a single sentence plus one small homework step — never a summary list",
      "has_chapters": true,
      "narrative_format": "chapters",
      "format_label": "Lecture Notes (paper lesson look)",
      "format_description": "A course-style lesson on a clean white page: every chapter is a numbered lecture split into short beats, each with its own headline and one large teaching visual — boxes that fill, a counter with a check card, code with the current line lit, growth curves, takeaway cards — all moving on the spoken word. Name, colours and voice come from each channel's own kit."
    },
    "variation_rules": [
      "distinct concept per video — the idea taught differs from every one in the channel's last 5 videos (enforced: the variation gate similarity + seed rotation)",
      "no recycled worked example against the last 5 videos (enforced: the variation gate similarity)",
      "no repeated hook across the channel's last 5 videos (enforced: the variation gate similarity)",
      "every number in the narration is concrete and checkable (a count, a size, a time) — prose for the author and the review desk"
    ],
    "review_thumb_pick": true,
    "safety": {
      "required_sources": true,
      "review_required": ["all"]
    },
    "deprecated": false,
    "changelog": [
      {
        "version": "1.0.0",
        "date": "2026-11-20",
        "note": "Course template C1b (owner: 'refine it and add it to the template section'): the paper lesson look — white page, beat headlines with an accent word, lecture badge, naked centred teaching widgets (boxes, stepper + check card, code, growth chart, takeaway cards, roadmap) moving on the spoken word; the doc lane plans each approved chapter into lesson beats with the words verbatim; falls back to the storybook look on any failure (docs/qa/course-template-c1b-refine-qa.md)"
      }
    ]
  },

  // ---- REMOVED 2026-11-04 (owner-approved catalog cleanup): 'quote-cards-premium'
  // retired WITH its family — the entry WAS the QQ shorts recipe bound to its own
  // family (owner call: retire the recipe with the family). QQ reverts to its
  // proven kit-less lane (the live weekly doc is kit-driven and unaffected).
};

