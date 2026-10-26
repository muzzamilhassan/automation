import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRegistryMeta, loadRegistryTemplates, resolveAssignment, validateAssignment } from '../studio/lib/template-registry.js';
import { REGISTRY_META } from '../studio/lib/template-registry.data.js';

const valid = {
  version: '1.0.0',
  niches: ['history'],
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
    niches: ['history'],
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
const matchingChannel = { formats: ['short'], niches: ['history'], brand_kit: true };

test('validator: compatible assignment passes', () => {
  assert.deepEqual(validateAssignment(valid, matchingChannel, fullCaps), { ok: true });
});

test('validator: unavailable required capability -> missing_capability:<cap>', () => {
  const r = validateAssignment(valid, matchingChannel, { ...fullCaps, tts: false });
  assert.equal(r.ok, false);
  assert.deepEqual(r.reasons, [{ code: 'missing_capability:tts', detail: r.reasons[0].detail }]);
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
