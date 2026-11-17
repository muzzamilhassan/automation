// NICHE & SUB-NICHE CATALOG: researched, proven lanes for the wizard.
// Free text still wins — the catalog provides one-tap shortcuts and smart sub-niche defaults.
//
// D17 (Phase 5 spec, 2026-11-01): the niche vocabulary is CLOSED. Assignment
// matching is exact-string, so a paraphrase can silently `niche_mismatch` in
// production — every NICHE_MAP key and every registry `niches[]` entry must be
// a member of CANONICAL_NICHES (pin-tested in tests/template-registry.test.mjs;
// the validator rejects paraphrasing registry blocks at sync time). The wizard
// keys are aligned to the channel-kit niche strings (studio/lib/brands.json):
// legacy paraphrase keys were renamed to their canonical strings
// ('Stoicism & daily motivation' -> 'Timeless wisdom, self-mastery & human
// psychology', 'Old money habits & quiet luxury' -> 'Old money habits &
// quiet wealth', 'Deep work & productivity' -> 'Focus & productivity systems',
// 'Health & fitness habits' -> the health trio, 'Tech & AI explained' ->
// 'AI & future tech', 'Entrepreneurship lessons' -> 'Entrepreneurship & lean
// business'), the three strings with no launch-niche counterpart were removed,
// and the three NEW launch niches gain their one-tap entries.

// The closed D17 vocabulary — the 10 launch niches' verbatim kit strings plus
// the three NEW canonical strings. One list, shared by the wizard catalog, the
// video template registry, and (later) the thumbnail registry.
export const CANONICAL_NICHES = [
  // history
  'History stories',
  // finance cluster (6 strings — the whole money vertical)
  'Investing psychology & market wisdom',
  'Personal finance rules & money habits',
  'Old money habits & quiet wealth',
  'Real estate wisdom & property',
  'Insurance explained simply',
  'Small-business tax & legal principles',
  // business trio
  'Entrepreneurship & lean business',
  'Sales & negotiation psychology',
  'Leadership & management wisdom',
  // wisdom / tech / productivity
  'Timeless wisdom, self-mastery & human psychology',
  'AI & future tech',
  'Focus & productivity systems',
  // health trio
  'Healthspan & longevity habits',
  'Sleep & recovery science',
  'Gym & training motivation',
  // the three NEW canonical strings (Phase 5 D17)
  'Science & how things work',
  'Travel & geography explained',
  'Human psychology & social dynamics',
];

export const NICHE_MAP = {
  'Timeless wisdom, self-mastery & human psychology': [
    'human psychology & respect',
    'power of silence & solitude',
    'dark psychology defense',
    'samurai mindset & musashi',
    'emotional detachment',
    'carl jung shadow work'
  ],
  'Investing psychology & market wisdom': [
    'warren buffett rules',
    'market crashes & history',
    'compounding secrets',
    'investing psychology',
    'risk management',
    'value investing'
  ],
  'Personal finance rules & money habits': [
    'silent money habits',
    'frugal living rules',
    'debt snowball stories',
    'budgeting psychology',
    'first $100k blueprint',
    'assets vs liabilities'
  ],
  'Old money habits & quiet wealth': [
    'silent wealth standards',
    'stealth wealth etiquette',
    'generational wealth rules',
    'taste over flash',
    'quiet confidence habits'
  ],
  'Entrepreneurship & lean business': [
    'founder mistakes to avoid',
    'scaling a business from zero',
    'pricing psychology',
    'hiring & culture rules',
    'ruthless business execution'
  ],
  'History stories': [
    'unbelievable battlefield tactics',
    'forgotten historical figures',
    'ancient empire downfalls',
    'dark history facts',
    'unsolved historical mysteries'
  ],
  'AI & future tech': [
    'ai tools replacing jobs',
    'future tech predictions',
    'cybersecurity warnings',
    'breakthrough inventions',
    'how algorithms control you'
  ],
  'Focus & productivity systems': [
    'dopamine detox',
    'focus without distraction',
    'morning routine rules',
    'monk mode blueprint',
    'time blocking habits'
  ],
  'Healthspan & longevity habits': [
    'longevity habits',
    'daily health habits',
    'nutrition rules',
    'fat loss psychology',
    'healthy aging'
  ],
  'Sleep & recovery science': [
    'sleep architecture',
    'deep sleep routines',
    'recovery habits',
    'evening journaling prompts',
    'circadian rhythm'
  ],
  'Gym & training motivation': [
    'strength & discipline',
    'gym motivation',
    'training discipline',
    'no excuses fitness'
  ],
  // the three NEW canonical strings (Phase 5 D17) — one-tap wizard entries
  'Science & how things work': [
    'how things work',
    'science facts explained',
    'breakthrough science',
    'myth vs science',
    'mechanisms explained'
  ],
  'Travel & geography explained': [
    'why borders look like this',
    'geography explained',
    'country deep dives',
    'maps that explain the world',
    'travel facts'
  ],
  'Human psychology & social dynamics': [
    'dark psychology defense',
    'social rules explained',
    'why humans do this',
    'persuasion & influence',
    'human behavior'
  ],
};

export const NICHE_CATALOG = Object.keys(NICHE_MAP);

// #110 — per-niche template recommendation for the wizard's template cards.
// DATA, same class as NICHE_MAP (closed D17 vocabulary; brand specifics stay
// in kit/registry data — this is product-level guidance, not a brand map).
// Only 'live' styles may appear here — a demo template is never recommended
// to a new channel (pin-tested in tests/niche-styles.test.mjs).
export const NICHE_RECOMMENDED = {
  'History stories': { style: 'doc', reason: 'chaptered documentary storytelling fits multi-part history narratives' },
  'Investing psychology & market wisdom': { style: 'doc', reason: 'market stories and crashes read best as 10-minute documentary episodes' },
  'Personal finance rules & money habits': { style: 'doc', reason: 'the rules-plus-stories format the engine already renders daily' },
  'Old money habits & quiet wealth': { style: 'cinematic', reason: 'luxury b-roll with giant captions matches the aesthetic' },
  'Real estate wisdom & property': { style: 'cinematic', reason: 'property footage carries these shorts' },
  'Insurance explained simply': { style: 'doc', reason: 'explainer depth builds trust on a dry topic' },
  'Small-business tax & legal principles': { style: 'doc', reason: 'an authority format for rules and fine print' },
  'Entrepreneurship & lean business': { style: 'doc', reason: 'founder stories and lessons as chaptered episodes' },
  'Sales & negotiation psychology': { style: 'cinematic', reason: 'punchy numbered-list shorts fit persuasion tactics' },
  'Leadership & management wisdom': { style: 'doc', reason: 'wisdom and rules suit longer episodes' },
  'Timeless wisdom, self-mastery & human psychology': { style: 'cinematic', reason: 'stoic stock-footage shorts — the proven daily lane' },
  'AI & future tech': { style: 'tech', reason: 'the dark minimalist explainer built for dev and AI topics' },
  'Focus & productivity systems': { style: 'cinematic', reason: 'habit-rules shorts with strong captions' },
  'Healthspan & longevity habits': { style: 'cinematic', reason: 'daily habit shorts with b-roll' },
  'Sleep & recovery science': { style: 'cinematic', reason: 'calm visual shorts match the niche mood' },
  'Gym & training motivation': { style: 'cinematic', reason: 'high-energy footage shorts' },
  'Science & how things work': { style: 'doc', reason: 'mechanisms explained chapter by chapter' },
  'Travel & geography explained': { style: 'cinematic', reason: 'visual footage is the content here' },
  'Human psychology & social dynamics': { style: 'cinematic', reason: 'dark-psychology shorts with bold captions' },
};

// Best-effort lookup for the wizard badge: exact key match first, then the
// same bidirectional lowercase-substring rule the kit generator uses (first
// hit in catalog order). Never throws, never guesses a style outside the
// data — no match returns null and the wizard shows no badge.
export function recommendedStyleFor(niche) {
  const low = String(niche || '').trim().toLowerCase();
  if (!low) return null;
  const keys = Object.keys(NICHE_RECOMMENDED);
  const exact = keys.find((k) => k.toLowerCase() === low);
  if (exact) return { ...NICHE_RECOMMENDED[exact], matched: exact };
  const fuzzy = keys.find((k) => low.includes(k.toLowerCase()) || k.toLowerCase().includes(low));
  return fuzzy ? { ...NICHE_RECOMMENDED[fuzzy], matched: fuzzy } : null;
}
