import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRegistryMeta } from '../studio/lib/template-registry.js';

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
