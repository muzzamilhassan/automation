import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRegistryMeta, loadRegistryTemplates } from '../studio/lib/template-registry.js';
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
