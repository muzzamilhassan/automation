import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRegistryMeta, loadRegistryTemplates, resolveAssignment, validateAssignment, channelConfigFromRegistryEntry, formatsForAspectRatios } from '../studio/lib/template-registry.js';
import { REGISTRY_META } from '../studio/lib/template-registry.data.js';
import { TEMPLATES_DATA } from '../studio/lib/templates-catalog.js';
import { CANONICAL_NICHES, NICHE_MAP, NICHE_CATALOG } from '../studio/lib/niches.js';

const valid = {
  version: '1.0.0',
  niches: ['History stories'],
  formats: ['short'],
  renderer: 'remotion',
  required_capabilities: ['script-gen', 'tts', 'captions'],
  variation_rules: ['distinct storyline per video', 'no repeated hook across last 5'],
  safety: { required_sources: true, review_required: [] },
  deprecated: false,
  changelog: [{ version: '1.0.0', date: '2026-10-26', note: 'initial' }],
};

test('valid metadata passes', () => {
  assert.deepEqual(validateRegistryMeta(valid), { ok: true });
});
test('bad semver fails with named error', () => {
  const r = validateRegistryMeta({ ...valid, version: '1.0' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('version')));
});
test('unknown capability fails', () => {
  const r = validateRegistryMeta({ ...valid, required_capabilities: ['script-gen', 'teleport'] });
  assert.equal(r.ok, false);
});
test('deprecated without date fails', () => {
  const r = validateRegistryMeta({ ...valid, deprecated: true });
  assert.equal(r.ok, false);
});
test('empty variation_rules fails', () => {
  const r = validateRegistryMeta({ ...valid, variation_rules: [] });
  assert.equal(r.ok, false);
});

// ---- Task 2: registry loader over catalog families (fail-closed) ----

function makeValidMeta(version = '1.0.0') {
  return {
    version,
    niches: ['History stories'],
    formats: ['short'],
    renderer: 'remotion',
    required_capabilities: ['script-gen', 'tts', 'captions'],
    variation_rules: ['distinct storyline per video'],
    safety: { required_sources: true, review_required: [] },
    deprecated: false,
    changelog: [{ version, date: '2026-10-26', note: 'initial' }],
  };
}

const catalogFamilies = [
  { id: 'documentary-frames', name: 'Documentary Master Frames', family: 'documentary-frames', aspectRatios: ['16:9', '9:16'] },
  { id: 'kinetic-quotes', name: 'Kinetic Quote Cards', family: 'kinetic-quotes', aspectRatios: ['9:16'] },
  { id: 'podcast-waves', name: 'Podcast Waveforms', family: 'podcast-waves', aspectRatios: ['16:9'] },
];

// 2 metadata blocks: one valid, one invalid. The third family has no metadata.
const metaData = {
  'documentary-frames': makeValidMeta(),
  'kinetic-quotes': { ...makeValidMeta('2.0.0'), version: 'not-semver' },
};

test('loader returns templates for valid families, merging catalog + registry', () => {
  const { templates, invalid } = loadRegistryTemplates(catalogFamilies, metaData);
  assert.equal(templates.length, 1);
  assert.equal(templates[0].familyId, 'documentary-frames');
  assert.equal(templates[0].name, 'Documentary Master Frames');
  assert.deepEqual(templates[0].catalog.aspectRatios, ['16:9', '9:16']);
  assert.equal(templates[0].registry.version, '1.0.0');
});

test('loader excludes AND reports invalid metadata blocks (AC-1)', () => {
  const { templates, invalid } = loadRegistryTemplates(catalogFamilies, metaData);
  assert.equal(templates.some(t => t.familyId === 'kinetic-quotes'), false);
  assert.equal(invalid.length, 1);
  assert.equal(invalid[0].familyId, 'kinetic-quotes');
  assert.ok(Array.isArray(invalid[0].errors) && invalid[0].errors.length > 0);
  assert.ok(invalid[0].errors.some(e => e.includes('version')));
});

test('loader simply omits families without metadata', () => {
  const { templates, invalid } = loadRegistryTemplates(catalogFamilies, metaData);
  assert.equal(templates.some(t => t.familyId === 'podcast-waves'), false);
  assert.equal(invalid.some(i => i.familyId === 'podcast-waves'), false);
});

test('loader never throws on invalid metadata', () => {
  const hostile = {
    'documentary-frames': 'a string, not an object',
    'kinetic-quotes': { ...makeValidMeta(), safety: null, changelog: 'nope', niches: 42 },
    'podcast-waves': null, // null block == no metadata -> absent, not invalid
  };
  const { templates, invalid } = loadRegistryTemplates(catalogFamilies, hostile);
  assert.equal(templates.length, 0);
  assert.equal(invalid.length, 2);
  assert.deepEqual(invalid.map(i => i.familyId).sort(), ['documentary-frames', 'kinetic-quotes']);
});

test('data module exposes an object REGISTRY_META (seeded in a later task)', () => {
  assert.equal(typeof REGISTRY_META, 'object');
  assert.notEqual(REGISTRY_META, null);
  assert.equal(Array.isArray(REGISTRY_META), false);
});

// ---- Task 3: semver resolver — minor/patch auto-adopt, major holds ----

const familyBlocks = [
  { familyId: 'documentary-frames', version: '1.0.0' },
  { familyId: 'documentary-frames', version: '1.1.0' },
  { familyId: 'documentary-frames', version: '1.1.3' },
  { familyId: 'documentary-frames', version: '2.0.0' },
];

test('resolver: highest version within pinned major, flags higher major available', () => {
  const r = resolveAssignment({ familyId: 'documentary-frames', pinned_major: 1 }, familyBlocks);
  assert.deepEqual(r, { ok: true, resolvedVersion: '1.1.3', majorUpdateAvailable: true });
});

test('resolver: pin on the highest major resolves it, no major update available', () => {
  const r = resolveAssignment({ familyId: 'documentary-frames', pinned_major: 2 }, familyBlocks);
  assert.deepEqual(r, { ok: true, resolvedVersion: '2.0.0', majorUpdateAvailable: false });
});

test('resolver: pin with no versions in that major errors no_version_in_major', () => {
  const r = resolveAssignment({ familyId: 'documentary-frames', pinned_major: 3 }, familyBlocks);
  assert.deepEqual(r, { ok: false, errors: ['no_version_in_major'] });
});

test('resolver: only considers blocks of the assigned family', () => {
  const otherFamily = [{ familyId: 'kinetic-quotes', version: '1.5.0' }];
  const r = resolveAssignment({ familyId: 'documentary-frames', pinned_major: 1 }, otherFamily);
  assert.deepEqual(r, { ok: false, errors: ['no_version_in_major'] });
});

test('resolver: picks highest patch within same minor (numeric, not lexicographic)', () => {
  const blocks = [
    { familyId: 'f', version: '1.0.9' },
    { familyId: 'f', version: '1.0.10' },
    { familyId: 'f', version: '1.0.2' },
  ];
  const r = resolveAssignment({ familyId: 'f', pinned_major: 1 }, blocks);
  assert.equal(r.ok, true);
  assert.equal(r.resolvedVersion, '1.0.10');
});

// ---- Task 4: compatibility validator with stable reason codes ----

// Capability map that satisfies `valid` meta's required_capabilities + its renderer.
const fullCaps = { 'script-gen': true, tts: true, captions: true, remotion: true };
const matchingChannel = { formats: ['short'], niches: ['History stories'], brand_kit: true };

test('validator: compatible assignment passes', () => {
  assert.deepEqual(validateAssignment(valid, matchingChannel, fullCaps), { ok: true });
});

test('validator: unavailable required capability -> missing_capability:<cap>', () => {
  const r = validateAssignment(valid, matchingChannel, { ...fullCaps, tts: false });
  assert.equal(r.ok, false);
  // M7 fix (Task 3+4 ledgered minor): assert the real detail string, not
  // r.reasons[0].detail against itself (was a tautology).
  assert.deepEqual(r.reasons, [{
    code: 'missing_capability:tts',
    detail: 'required capability "tts" is not available (map value must be exactly true)',
  }]);
});

test('validator: capability present but not exactly true counts as unavailable', () => {
  const r = validateAssignment(valid, matchingChannel, { ...fullCaps, captions: 'yes' });
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some(reason => reason.code === 'missing_capability:captions'));
});

test('validator: no format overlap -> format_mismatch', () => {
  const r = validateAssignment(valid, { ...matchingChannel, formats: ['long'] }, fullCaps);
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some(reason => reason.code === 'format_mismatch'));
});

test('validator: no niche overlap -> niche_mismatch', () => {
  const r = validateAssignment(valid, { ...matchingChannel, niches: ['finance'] }, fullCaps);
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some(reason => reason.code === 'niche_mismatch'));
});

test('validator: renderer not available -> renderer_unavailable', () => {
  const r = validateAssignment(valid, matchingChannel, { 'script-gen': true, tts: true, captions: true });
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some(reason => reason.code === 'renderer_unavailable'));
});

test('validator: deprecated meta -> deprecated_template', () => {
  const r = validateAssignment({ ...valid, deprecated: true, deprecated_on: '2026-10-01' }, matchingChannel, fullCaps);
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some(reason => reason.code === 'deprecated_template'));
});

test('validator: collects ALL blocking reasons, not first-only', () => {
  const r = validateAssignment(
    { ...valid, deprecated: true, deprecated_on: '2026-10-01' },
    { formats: ['long'], niches: ['finance'], brand_kit: false },
    { 'script-gen': true },
  );
  assert.equal(r.ok, false);
  assert.deepEqual(
    r.reasons.map(reason => reason.code).sort(),
    [
      'deprecated_template',
      'format_mismatch',
      'missing_capability:captions',
      'missing_capability:tts',
      'niche_mismatch',
      'renderer_unavailable',
    ],
  );
});

// ---- channelConfigFromRegistryEntry (Task 8 hoist of the assign route's
// verbatim channelConfig derivation — pins the validator-input contract) ----

test('channelConfig: null/absent entry and kit -> empty niches, shorts-only, no kit', () => {
  const empty = { formats: ['short'], niches: [], brand_kit: false };
  assert.deepEqual(channelConfigFromRegistryEntry(null), empty);
  assert.deepEqual(channelConfigFromRegistryEntry(undefined), empty);
  assert.deepEqual(channelConfigFromRegistryEntry({ slug: 'x' }), empty);
  assert.deepEqual(channelConfigFromRegistryEntry({ slug: 'x', kit: null }), empty);
  assert.deepEqual(channelConfigFromRegistryEntry({ slug: 'x', kit: {} }), empty);
});

test('channelConfig: main niche plus sub-niches, Set-deduped with main first', () => {
  const r = channelConfigFromRegistryEntry({ niche: 'History stories', kit: { niches: ['History stories', 'biographies', 'ancient civilizations'] } });
  assert.deepEqual(r.niches, ['History stories', 'biographies', 'ancient civilizations']);
  const r2 = channelConfigFromRegistryEntry({ niche: 'Finance explainers', kit: { niches: ['Finance explainers', 'Finance explainers'] } });
  assert.deepEqual(r2.niches, ['Finance explainers']);
});

test('channelConfig: non-string niches are dropped, not passed to the validator', () => {
  const r = channelConfigFromRegistryEntry({ niche: 'History stories', kit: { niches: ['', 42, null, 'war stories'] } });
  assert.deepEqual(r.niches, ['History stories', 'war stories']);
});

test('channelConfig: longSlot ternary drives formats (short always, long only with longSlot)', () => {
  assert.deepEqual(channelConfigFromRegistryEntry({ niche: 'n' }).formats, ['short']);
  assert.deepEqual(channelConfigFromRegistryEntry({ niche: 'n', kit: { longSlot: '18:00' } }).formats, ['short', 'long']);
  assert.deepEqual(channelConfigFromRegistryEntry({ niche: 'n', kit: { longSlot: '' } }).formats, ['short']);
  assert.deepEqual(channelConfigFromRegistryEntry({ niche: 'n', kit: { longSlot: null } }).formats, ['short']);
});

test('channelConfig: brand_kit is Boolean truthiness of a non-empty kit', () => {
  assert.equal(channelConfigFromRegistryEntry({ niche: 'n' }).brand_kit, false);
  assert.equal(channelConfigFromRegistryEntry({ niche: 'n', kit: {} }).brand_kit, false);
  assert.equal(channelConfigFromRegistryEntry({ niche: 'n', kit: { voice: 'deep' } }).brand_kit, true);
  assert.equal(channelConfigFromRegistryEntry({ niche: 'n', kit: { niches: ['sub'] } }).brand_kit, true);
});

// ---- Task 10: the six seeded registry blocks (history + finance lanes) ----
// Contract pins carried from Task 7 review:
//   P2 — seed `niches` must be VERBATIM channel-registry niche strings
//        (exact-string matching in validateAssignment; no normalization).
//   P3 — NO seed may declare `image-gen` (Phase 1 vault has no generator
//        provider; photo families draw from the stock/assets lane).
//   M1 — fold-in: the validator collects ALL errors on one broken block.

const SEED_IDS = [
  'documentary-frames',
  'timeline-history',
  'photo-stories',
  'finance-explainers',
  // stats-counters + chart-animations were REMOVED 2026-11-04 with the cloned
  // 10–15s pack (owner-approved catalog cleanup) — no longer launch seeds.
];
const FINANCE_SEED_IDS = ['finance-explainers'];
const HISTORY_SEED_IDS = ['documentary-frames', 'timeline-history', 'photo-stories'];

// Aspect-ratio -> format mapping is the lib's (formatsForAspectRatios, imported
// above) — one source of truth shared with the loader's formats ⊆ family gate.

test('seeds: REGISTRY_META contains at least the launch seed families', () => {
  // The registry grows as data (exit gate added editorial-headlines as #7) —
  // pin the surviving launch seeds as REQUIRED, not exhaustive; every additional
  // entry must still pass validateRegistryMeta (covered by the loader test).
  // Two launch seeds (stats-counters, chart-animations) were removed with the
  // cloned 10–15s pack on 2026-11-04 (owner-approved catalog cleanup).
  const keys = Object.keys(REGISTRY_META);
  for (const id of SEED_IDS) assert.ok(keys.includes(id), `missing seed ${id}`);
});

test('seeds: every seed passes validateRegistryMeta', () => {
  for (const id of SEED_IDS) {
    assert.deepEqual(validateRegistryMeta(REGISTRY_META[id]), { ok: true }, `seed ${id} must validate`);
  }
});

test('seeds: every seeded family exists in the catalog', () => {
  const catalogIds = new Set(TEMPLATES_DATA.map((t) => t.family || t.id));
  for (const id of SEED_IDS) {
    assert.ok(catalogIds.has(id), `seed ${id} must exist in TEMPLATES_DATA`);
  }
});

test('seeds: formats declared are a subset of the family aspectRatios (loader-enforced, EVERY entry incl. v2 keys)', () => {
  // Re-pointed at the loader output in T1 round 1: the loader owns the
  // formats ⊆ family gate (it holds the joined catalogEntry), so the pin
  // covers every registry entry — family-keyed legacy AND template_id-keyed
  // v2 blocks alike — and stays green when the catalog grows.
  const { templates, invalid } = loadRegistryTemplates(TEMPLATES_DATA, REGISTRY_META);
  assert.deepEqual(invalid, [], 'every entry must pass the formats ⊆ family gate');
  for (const t of templates) {
    const supported = formatsForAspectRatios(t.catalog.aspectRatios);
    for (const f of t.registry.formats) {
      assert.ok(supported.includes(f), `${t.templateId} declares format "${f}" not supported by family ${t.family} aspectRatios [${(t.catalog.aspectRatios || []).join(', ')}]`);
    }
  }
});

test('seeds: finance seeds carry required_sources + review_required ["finance"]', () => {
  for (const id of FINANCE_SEED_IDS) {
    assert.deepEqual(REGISTRY_META[id].safety, { required_sources: true, review_required: ['finance'] }, `seed ${id}`);
  }
});

test('seeds: history seeds carry required_sources with no review_required', () => {
  for (const id of HISTORY_SEED_IDS) {
    assert.deepEqual(REGISTRY_META[id].safety, { required_sources: true, review_required: [] }, `seed ${id}`);
  }
});

test('seeds: no seed declares image-gen (pin P3 — Phase 1 vault has no generator)', () => {
  for (const id of SEED_IDS) {
    assert.equal(
      REGISTRY_META[id].required_capabilities.includes('image-gen'), false,
      `seed ${id} must not declare image-gen`,
    );
  }
});

test('seeds: version 1.0.0, not deprecated, changelog initial entry, >=2 variation rules', () => {
  for (const id of SEED_IDS) {
    const meta = REGISTRY_META[id];
    assert.equal(meta.version, '1.0.0', `seed ${id}`);
    assert.equal(meta.deprecated, false, `seed ${id}`);
    assert.equal(meta.deprecated_on, undefined, `seed ${id}`);
    assert.deepEqual(meta.changelog, [{ version: '1.0.0', date: '2026-10-26', note: 'initial registry entry' }], `seed ${id}`);
    assert.ok(meta.variation_rules.length >= 2, `seed ${id} needs >=2 variation rules`);
    assert.ok(meta.variation_rules.every((r) => typeof r === 'string' && r.length > 0), `seed ${id}`);
  }
});

test('seeds: all seeds resolve as registry-assignable (>= 6 templates, 0 invalid)', () => {
  const { templates, invalid } = loadRegistryTemplates(TEMPLATES_DATA, REGISTRY_META);
  assert.deepEqual(invalid, []);
  const ids = templates.map((t) => t.familyId);
  for (const id of SEED_IDS) assert.ok(ids.includes(id), `seed ${id} must resolve`);
  assert.ok(templates.length >= SEED_IDS.length, `expected >= ${SEED_IDS.length} templates, got ${templates.length}`);
});

// M1 fold-in (Task 1+2 ledgered minor): pin the collect-all-errors contract —
// one block with several broken fields yields >=2 named errors, not first-only.
test('validator: collects >=2 errors on a single multi-broken block (not first-only)', () => {
  const r = validateRegistryMeta({
    ...valid,
    version: 'not-semver',        // error 1: version
    formats: ['vertical'],        // error 2: formats
    renderer: '',                 // error 3: renderer
    changelog: [{ version: 'x', date: 'tomorrow', note: '' }], // errors 4-6
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.length >= 2, `expected >=2 collected errors, got ${r.errors.length}: ${JSON.stringify(r.errors)}`);
  assert.ok(r.errors.some((e) => e.includes('version')));
  assert.ok(r.errors.some((e) => e.includes('formats')));
});

// ---- Phase 5 T1: schema v2 — the template_id/family identity split (D1) ----
// One string, four homes (D19 invariant): assignment id == registry key ==
// brain-gate id == review-gate meta id. The registry KEY is the identity; a
// block's `template_id` must equal its key; `family` names the VISUAL family
// for the gallery/aspect-ratio join and may be shared by many templates.

const V2_TEMPLATE_ID = 'myth-vs-money';
const V2_FAMILY_ID = 'stats-counters';

// A schema-valid story_structure per D2 (point-slot constraints over the
// immutable shorts skeleton: hook + points + closing never changes).
const STORY_STRUCTURE = {
  beats: [
    'slot 1 is the popular money belief',
    'slot 2 reverses it with evidence',
    'slot 3 doubles the reversal with a second proof',
    'slot 4 is the what-to-do payoff',
  ],
  hook_classes: ['myth-buster', 'question-hook'],
  title_patterns: ['$-figure numbered money listicle'],
  payoff_rule: 'the last point hands the viewer one rule to apply today',
};

function makeV2Meta(over = {}) {
  return {
    ...makeValidMeta(),
    template_id: V2_TEMPLATE_ID,
    family: V2_FAMILY_ID,
    niches: ['Personal finance rules & money habits'],
    story_structure: { ...STORY_STRUCTURE, beats: [...STORY_STRUCTURE.beats] },
    ...over,
  };
}

test('validator v2: template_id must be a non-empty string when present', () => {
  for (const bad of ['', null, 42]) {
    const r = validateRegistryMeta({ ...makeValidMeta(), template_id: bad });
    assert.equal(r.ok, false, `template_id ${JSON.stringify(bad)} must fail`);
    assert.ok(r.errors.some((e) => e.includes('template_id')), `named error for ${JSON.stringify(bad)}: ${JSON.stringify(r.errors)}`);
  }
});

test('validator v2: family must be a non-empty string when present', () => {
  for (const bad of ['', null, 42]) {
    const r = validateRegistryMeta({ ...makeValidMeta(), family: bad });
    assert.equal(r.ok, false, `family ${JSON.stringify(bad)} must fail`);
    assert.ok(r.errors.some((e) => e.includes('family')), `named error for ${JSON.stringify(bad)}: ${JSON.stringify(r.errors)}`);
  }
});

test('validator v2: a schema v2 entry (family declared) without template_id is rejected with a named error', () => {
  const { template_id, ...familyOnly } = makeV2Meta();
  assert.equal(familyOnly.family, V2_FAMILY_ID, 'fixture sanity: family present, template_id absent');
  const r = validateRegistryMeta(familyOnly);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('template_id') && e.includes('required')), JSON.stringify(r.errors));
});

test('validator v2: legacy blocks (no template_id, no family) keep validating unchanged (AC-P5-2)', () => {
  assert.deepEqual(validateRegistryMeta(valid), { ok: true });
});

test('validator v2 (D17): a niche string outside the closed vocabulary is rejected with a named error', () => {
  const r = validateRegistryMeta({ ...makeValidMeta(), niches: ['Personal finance rulez & money habits'] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('vocabulary') && e.includes('Personal finance rulez')), JSON.stringify(r.errors));
});

test('validator v2 (D17): every canonical vocabulary string passes the niches check', () => {
  for (const n of CANONICAL_NICHES) {
    const r = validateRegistryMeta({ ...makeValidMeta(), niches: [n] });
    assert.deepEqual(r, { ok: true }, `canonical string "${n}" must validate`);
  }
});

// ---- Phase 5 T1 round 1: the D2/D4 authoring rules (QA Row 2's named
// rejections). New entries must carry the story plan and the gated classes
// must carry their fixed disclaimers; the legacy 7 are exempt. ----

test('validator v2 (D2): omitting story_structure on a NEW entry is a named rejection (QA Row 2 case 1)', () => {
  const { story_structure, ...noStory } = makeV2Meta();
  assert.equal(noStory.family, V2_FAMILY_ID, 'fixture sanity: family declared, story_structure absent');
  const r = validateRegistryMeta(noStory);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('story_structure')), JSON.stringify(r.errors));
});

test('validator v2 (D2): a complete story_structure validates', () => {
  assert.deepEqual(validateRegistryMeta(makeV2Meta()), { ok: true });
});

test('validator v2 (D2): beats must be 1-5 non-empty strings (the immutable shorts skeleton)', () => {
  const empty = validateRegistryMeta(makeV2Meta({ story_structure: { ...STORY_STRUCTURE, beats: [] } }));
  assert.equal(empty.ok, false);
  assert.ok(empty.errors.some((e) => e.includes('beats')), JSON.stringify(empty.errors));
  const six = validateRegistryMeta(makeV2Meta({ story_structure: { ...STORY_STRUCTURE, beats: ['1', '2', '3', '4', '5', '6'] } }));
  assert.equal(six.ok, false);
  assert.ok(six.errors.some((e) => e.includes('beats')), JSON.stringify(six.errors));
  const notString = validateRegistryMeta(makeV2Meta({ story_structure: { ...STORY_STRUCTURE, beats: ['slot 1', 42] } }));
  assert.equal(notString.ok, false);
  assert.ok(notString.errors.some((e) => e.includes('beats')), JSON.stringify(notString.errors));
  for (const n of [1, 5]) {
    const okN = validateRegistryMeta(makeV2Meta({ story_structure: { ...STORY_STRUCTURE, beats: Array.from({ length: n }, (_, i) => `slot ${i + 1}`) } }));
    assert.deepEqual(okN, { ok: true }, `${n} beats must validate`);
  }
});

test('validator v2 (D2): hook_classes, title_patterns, payoff_rule are required with named errors', () => {
  for (const [field, patch] of [
    ['hook_classes', { hook_classes: [] }],
    ['hook_classes', { hook_classes: ['ok', ''] }],
    ['title_patterns', { title_patterns: [] }],
    ['title_patterns', { title_patterns: ['$ rule', 7] }],
    ['payoff_rule', { payoff_rule: '' }],
    ['payoff_rule', { payoff_rule: 42 }],
  ]) {
    const r = validateRegistryMeta(makeV2Meta({ story_structure: { ...STORY_STRUCTURE, ...patch } }));
    assert.equal(r.ok, false, `${field} case ${JSON.stringify(patch)} must fail`);
    assert.ok(r.errors.some((e) => e.includes(`story_structure.${field}`)), `${field}: ${JSON.stringify(r.errors)}`);
  }
});

test('validator v2 (D2): story_structure must be an object when present on a v2 entry', () => {
  const r = validateRegistryMeta(makeV2Meta({ story_structure: 'beats go here' }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('story_structure')), JSON.stringify(r.errors));
});

test('validator v2 (QA Row 2 step 3 probe): a legacy entry that GAINS template_id only keeps validating', () => {
  // Identity explicit, no family binding, no story_structure — still legacy-shaped.
  const r = validateRegistryMeta({ ...makeValidMeta(), template_id: 'documentary-frames' });
  assert.deepEqual(r, { ok: true }, 'the key is template_id when present; the legacy entry is exempt from the new-block rules');
});

test('validator v2 (D4): a NEW medical template without disclaimers is a named rejection (QA Row 2 case 2)', () => {
  const r = validateRegistryMeta(makeV2Meta({
    niches: ['Healthspan & longevity habits'],
    safety: { required_sources: true, review_required: ['medical'] },
  }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('disclaimers') && e.includes('medical')), JSON.stringify(r.errors));
});

test('validator v2 (D4): a NEW finance template without disclaimers is a named rejection (QA Row 2 case 3)', () => {
  const r = validateRegistryMeta(makeV2Meta({ safety: { required_sources: true, review_required: ['finance'] } }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('disclaimers') && e.includes('finance')), JSON.stringify(r.errors));
});

test('validator v2 (D4): medical/finance WITH disclaimers validate; disclaimers are legal-but-not-required on other classes', () => {
  const medical = validateRegistryMeta(makeV2Meta({
    niches: ['Healthspan & longevity habits'],
    // T2b (AC-P5-7): the YMYL authoring bar also requires the tighter brain
    // thresholds on a medical block — declared here within the caps.
    variation_threshold: 0.78,
    cross_channel_threshold: 0.84,
    safety: { required_sources: true, review_required: ['medical'], disclaimers: ['Education, not medical advice.'] },
  }));
  assert.deepEqual(medical, { ok: true });
  const finance = validateRegistryMeta(makeV2Meta({
    safety: { required_sources: true, review_required: ['finance'], disclaimers: ['Education, not financial advice.'] },
  }));
  assert.deepEqual(finance, { ok: true });
  const allClass = validateRegistryMeta(makeV2Meta({
    safety: { required_sources: true, review_required: ['all'] },
  }));
  assert.deepEqual(allClass, { ok: true }, 'an all-class template with no disclaimers is legal (the requirement is medical/finance only)');
});

test('validator v2 (D4): present-but-malformed disclaimers fail on any entry, whatever the class', () => {
  for (const bad of [[], [''], [42], 'Education, not advice.']) {
    const r = validateRegistryMeta(makeV2Meta({
      safety: { required_sources: true, review_required: [], disclaimers: bad },
    }));
    assert.equal(r.ok, false, `disclaimers ${JSON.stringify(bad)} must fail`);
    assert.ok(r.errors.some((e) => e.includes('disclaimers')), `${JSON.stringify(bad)}: ${JSON.stringify(r.errors)}`);
  }
  const legacy = validateRegistryMeta({ ...makeValidMeta(), safety: { required_sources: true, review_required: [], disclaimers: ['ok'] } });
  assert.deepEqual(legacy, { ok: true }, 'a legacy entry may add well-formed disclaimers');
});

// ---- Phase 5 T2b: the YMYL threshold authoring bar (D3/AC-P5-7). A
// medical/health block must pin variation_threshold ≤ 0.80 and
// cross_channel_threshold ≤ 0.85 — the documented defaults (0.85/0.90) are
// the LOOSEST allowed for non-YMYL classes; omission would silently inherit
// them. Finance and the class-less lanes are untouched. ----

test('validator v2 (AC-P5-7): a medical block at the DEFAULT thresholds (0.85/0.90) is a named rejection', () => {
  const r = validateRegistryMeta(makeV2Meta({
    niches: ['Healthspan & longevity habits'],
    variation_threshold: 0.85,
    cross_channel_threshold: 0.90,
    safety: { required_sources: true, review_required: ['medical'], disclaimers: ['Education, not medical advice.'] },
  }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('variation_threshold')), JSON.stringify(r.errors));
  assert.ok(r.errors.some((e) => e.includes('cross_channel_threshold')), JSON.stringify(r.errors));
});

test('validator v2 (AC-P5-7): a medical block pinned AT the caps (0.80/0.85) validates', () => {
  const r = validateRegistryMeta(makeV2Meta({
    niches: ['Healthspan & longevity habits'],
    variation_threshold: 0.80,
    cross_channel_threshold: 0.85,
    safety: { required_sources: true, review_required: ['medical'], disclaimers: ['Education, not medical advice.'] },
  }));
  assert.deepEqual(r, { ok: true });
});

test('validator v2 (AC-P5-7): an omitted threshold on a medical/health block is a named rejection', () => {
  const medical = validateRegistryMeta(makeV2Meta({
    niches: ['Healthspan & longevity habits'],
    safety: { required_sources: true, review_required: ['medical'], disclaimers: ['Education, not medical advice.'] },
  }));
  assert.equal(medical.ok, false);
  assert.ok(medical.errors.some((e) => e.includes('variation_threshold')), JSON.stringify(medical.errors));
  const health = validateRegistryMeta(makeV2Meta({
    niches: ['Healthspan & longevity habits'],
    safety: { required_sources: true, review_required: ['health'], disclaimers: ['Education, not medical advice.'] },
  }));
  assert.equal(health.ok, false);
  assert.ok(health.errors.some((e) => e.includes('cross_channel_threshold')), JSON.stringify(health.errors));
});

test('validator v2 (AC-P5-7): finance is untouched — the default 0.85/0.90 stays legal there', () => {
  const r = validateRegistryMeta(makeV2Meta({
    variation_threshold: 0.85,
    cross_channel_threshold: 0.90,
    safety: { required_sources: true, review_required: ['finance'], disclaimers: ['Education, not financial advice.'] },
  }));
  assert.deepEqual(r, { ok: true }, 'the YMYL caps bar only medical/health; finance keeps the documented defaults');
});

// ---- Phase 5 T1: the loader joins metadata to the catalog BY family and
// resolves identity by template_id (registry key). Fail-closed with named
// errors on identity drift. ----

const identityCatalog = [
  { id: V2_FAMILY_ID, name: 'Stats Counters', family: V2_FAMILY_ID, aspectRatios: ['16:9', '9:16'] },
];

test('loader: a schema v2 entry resolves under its template_id, joined to its visual family', () => {
  const { templates, invalid } = loadRegistryTemplates(identityCatalog, { [V2_TEMPLATE_ID]: makeV2Meta() });
  assert.deepEqual(invalid, []);
  assert.equal(templates.length, 1);
  assert.equal(templates[0].templateId, V2_TEMPLATE_ID);
  assert.equal(templates[0].familyId, V2_TEMPLATE_ID, 'familyId carries the registry KEY (the assignment identity)');
  assert.equal(templates[0].family, V2_FAMILY_ID);
  assert.equal(templates[0].catalog.id, V2_FAMILY_ID, 'the catalog join is the VISUAL family, not the key');
});

test('loader: a legacy block without template_id defaults its identity to the registry key (family fallback)', () => {
  const { templates, invalid } = loadRegistryTemplates(identityCatalog, { [V2_FAMILY_ID]: makeValidMeta() });
  assert.deepEqual(invalid, []);
  assert.equal(templates[0].templateId, V2_FAMILY_ID);
  assert.equal(templates[0].familyId, V2_FAMILY_ID);
  assert.equal(templates[0].family, V2_FAMILY_ID);
});

test('loader: template_id disagreeing with the registry key is a named invalid (the key IS the identity)', () => {
  const { templates, invalid } = loadRegistryTemplates(
    identityCatalog,
    { [V2_FAMILY_ID]: { ...makeValidMeta(), template_id: V2_TEMPLATE_ID } },
  );
  assert.equal(templates.length, 0);
  assert.equal(invalid.length, 1);
  assert.equal(invalid[0].familyId, V2_FAMILY_ID);
  assert.ok(invalid[0].errors.some((e) => e.includes('template_id')), JSON.stringify(invalid[0].errors));
});

test('loader: a family that does not exist in the catalog is a named invalid (D1: family must exist)', () => {
  const { templates, invalid } = loadRegistryTemplates(
    identityCatalog,
    { [V2_TEMPLATE_ID]: makeV2Meta({ family: 'no-such-family' }) },
  );
  assert.equal(templates.length, 0);
  assert.equal(invalid.length, 1);
  assert.ok(invalid[0].errors.some((e) => e.includes('family') && e.includes('no-such-family')), JSON.stringify(invalid[0].errors));
});

test('loader: formats declared beyond what the family ships are a named invalid (the only hard family rule)', () => {
  // a family with only 9:16 cannot carry a long-format template
  const verticalOnlyCatalog = [{ id: 'vertical-only', name: 'Vertical Only', family: 'vertical-only', aspectRatios: ['9:16'] }];
  const { templates, invalid } = loadRegistryTemplates(verticalOnlyCatalog, {
    'vertical-only': makeV2Meta({
      template_id: 'vertical-only',
      family: 'vertical-only',
      formats: ['long', 'short'],
    }),
  });
  assert.equal(templates.length, 0);
  assert.equal(invalid.length, 1);
  assert.equal(invalid[0].familyId, 'vertical-only');
  assert.ok(invalid[0].errors.some((e) => e.includes('formats') && e.includes('long') && e.includes('9:16')), JSON.stringify(invalid[0].errors));
});

test('loader: two templates may share one visual family (the split is the point)', () => {
  const { templates, invalid } = loadRegistryTemplates(identityCatalog, {
    [V2_FAMILY_ID]: makeValidMeta(),
    [V2_TEMPLATE_ID]: makeV2Meta(),
  });
  assert.deepEqual(invalid, []);
  assert.equal(templates.length, 2);
  assert.ok(templates.every((t) => t.family === V2_FAMILY_ID));
  assert.deepEqual(templates.map((t) => t.templateId).sort(), [V2_FAMILY_ID, V2_TEMPLATE_ID].sort());
});

// ---- Phase 5 T1: pins over the REAL data file (identity + closed vocabulary) ----

const LEGACY_IDS = [
  'documentary-frames',
  'timeline-history',
  'photo-stories',
  'finance-explainers',
  // stats-counters + chart-animations: removed 2026-11-04 with the cloned pack.
  'editorial-headlines',
];

test('seeds: the legacy 5 carry template_id equal to their family id (backward compatible, D1)', () => {
  const keys = Object.keys(REGISTRY_META);
  for (const id of LEGACY_IDS) {
    assert.ok(keys.includes(id), `missing legacy entry ${id}`);
    assert.equal(REGISTRY_META[id].template_id, id, `legacy entry ${id}: template_id defaults to (= is pinned to) the family id`);
    assert.equal(REGISTRY_META[id].family, undefined, `legacy entry ${id}: no family override — the key is the family (no data migration)`);
  }
});

test('identity pin: every REGISTRY_META key equals its template_id (the registry home of the one-string invariant)', () => {
  for (const [key, meta] of Object.entries(REGISTRY_META)) {
    assert.equal(meta.template_id, key, `registry key "${key}" must equal template_id — assignment/brain/review all index by this string`);
  }
});

test('vocabulary pin (D17): every REGISTRY_META niches[] string is a member of the closed vocabulary', () => {
  for (const [key, meta] of Object.entries(REGISTRY_META)) {
    for (const n of meta.niches) {
      assert.ok(CANONICAL_NICHES.includes(n), `${key}: niche "${n}" is not in the closed D17 vocabulary — a paraphrase must fail CI before it can niche_mismatch in production`);
    }
  }
});

test('vocabulary pin (I5): every NICHE_MAP key is a member of the closed D17 vocabulary', () => {
  for (const key of Object.keys(NICHE_MAP)) {
    assert.ok(CANONICAL_NICHES.includes(key), `wizard catalog key "${key}" paraphrases the closed vocabulary`);
  }
  assert.deepEqual(NICHE_CATALOG, Object.keys(NICHE_MAP), 'NICHE_CATALOG is derived from NICHE_MAP');
});

test('vocabulary pin (D17): the 3 NEW canonical strings exist in the wizard catalog (Drill A PREP step 1 gate)', () => {
  for (const n of ['Science & how things work', 'Travel & geography explained', 'Human psychology & social dynamics']) {
    assert.ok(CANONICAL_NICHES.includes(n), `"${n}" must be in the closed vocabulary`);
    assert.ok(NICHE_CATALOG.includes(n), `"${n}" must be offered by the wizard catalog (NICHE_MAP key)`);
  }
});
