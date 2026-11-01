// Thumbnail template registry — the v1 LAUNCH SET (Phase 5 T2d, spec D10).
// PURE DATA — validated against the EXISTING v2 catalog
// (studio/lib/thumb-catalog.json) by the loader in thumb-registry.mjs, which
// is what production consumes. Entries are ordered by their catalog position
// (the deterministic selection order).
//
// The v1 truth is the 17-design needsPhoto:false pool (Ruling 6 — no photo
// hunting in v1; stock-photo wiring is Phase 6). The spec's draft "18" was
// corrected against ground truth: docs/qa/phase5-catalog-qa.md Row 11 names
// the pool verbatim — blackout, whitespace, focal-cut, big-number, price-fight,
// slab-quote, serif-frame, gold-standard, terminal, bungee-sign, redact,
// ledger, screen, plinth, coinflip, marquee, pillar.
//
// Entry schema:
//   id          — the catalog design id (must exist AND be needsPhoto:false —
//                 the loader rejects anything else, fail-closed)
//   niches[]    — the niches the design serves; VERBATIM strings from the
//                 closed D17 vocabulary (studio/lib/niches.js
//                 CANONICAL_NICHES — the pin test fails a paraphrase in CI).
//                 A design may serve many niches; every launch niche binds
//                 >= 2 designs.
//   tokens      — OPTIONAL entry-level brand-token pins (D11: "a registry
//                 entry MAY pin a token"). `shade: null` = the design keeps
//                 its OWN catalog background and ignores the channel kit's
//                 `bg` (the light-canvas designs — a kit's dark bg would sink
//                 their dark type). Unpinned tokens bind from the kit.
//   perTemplate — OPTIONAL overrides keyed by VIDEO template_id (registry
//                 key), applied on top of `tokens` when a render knows its
//                 template — e.g. perTemplate: { 'myth-vs-money': { accent:
//                 '#F5E31C' } }. The launch set ships none; the mechanism is
//                 validated + unit-pinned so authored overrides can never be
//                 silently ignored-shaped.
//
// Brand tokens (accent/bg/label/eyebrow) are KIT data bound at render time —
// zero per-channel code (D11, the no-static-maps rule).

// D17 verbatim clusters — copied EXACTLY from studio/lib/niches.js
// CANONICAL_NICHES (the vocabulary pin test catches drift).
const FINANCE_CLUSTER = [
  'Investing psychology & market wisdom',
  'Personal finance rules & money habits',
  'Old money habits & quiet wealth',
  'Real estate wisdom & property',
  'Insurance explained simply',
  'Small-business tax & legal principles',
];
const BUSINESS_TRIO = [
  'Entrepreneurship & lean business',
  'Sales & negotiation psychology',
  'Leadership & management wisdom',
];

export const THUMB_REGISTRY = [
  // ---- bold-impact ----
  {
    id: 'blackout',
    niches: ['Gym & training motivation', 'Healthspan & longevity habits'],
  },
  // ---- minimal ----
  {
    id: 'whitespace',
    niches: ['Sleep & recovery science', 'Focus & productivity systems', 'Science & how things work'],
    tokens: { shade: null }, // off-white canvas — keeps its own catalog bg
  },
  {
    id: 'focal-cut',
    niches: ['Gym & training motivation', 'Healthspan & longevity habits', 'Focus & productivity systems'],
  },
  // ---- listicle ----
  {
    id: 'big-number',
    niches: BUSINESS_TRIO,
  },
  // ---- vs ----
  {
    id: 'price-fight',
    niches: [...FINANCE_CLUSTER, ...BUSINESS_TRIO],
  },
  // ---- quote ----
  {
    id: 'slab-quote',
    niches: ['Sleep & recovery science', 'Timeless wisdom, self-mastery & human psychology'],
  },
  {
    id: 'serif-frame',
    niches: ['History stories', 'Timeless wisdom, self-mastery & human psychology'],
  },
  // ---- luxury ----
  {
    id: 'gold-standard',
    niches: [...FINANCE_CLUSTER],
  },
  // ---- tech ----
  {
    id: 'terminal',
    niches: ['AI & future tech'],
  },
  // ---- retro-print ----
  {
    id: 'bungee-sign',
    niches: ['Travel & geography explained'],
  },
  // ---- curiosity ----
  {
    id: 'redact',
    niches: ['Science & how things work', 'Human psychology & social dynamics'],
  },
  // ---- doc-style ----
  {
    id: 'ledger',
    niches: [...FINANCE_CLUSTER, 'History stories', 'Travel & geography explained', ...BUSINESS_TRIO],
    tokens: { shade: null }, // paper-white ledger card — keeps its own catalog bg
  },
  // ---- tech ----
  {
    id: 'screen',
    niches: ['AI & future tech', 'Science & how things work'],
  },
  // ---- bold-impact ----
  {
    id: 'plinth',
    niches: ['History stories', 'Timeless wisdom, self-mastery & human psychology'],
  },
  // ---- listicle ----
  {
    id: 'coinflip',
    niches: [...FINANCE_CLUSTER, 'Human psychology & social dynamics'],
  },
  // ---- retro-print ----
  {
    id: 'marquee',
    niches: ['Travel & geography explained', 'Focus & productivity systems', ...BUSINESS_TRIO],
    tokens: { shade: null }, // flat yellow signboard — keeps its own catalog bg
  },
  // ---- luxury ----
  {
    id: 'pillar',
    niches: [...FINANCE_CLUSTER],
  },
];
