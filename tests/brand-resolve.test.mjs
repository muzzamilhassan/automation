import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBrand, registryToKit } from '../lib/brand-resolve.mjs';

test('resolveBrand resolves all 4 primary channels with required keys', async () => {
  const primarySlugs = ['quotequarry', 'investors-compass', 'money-rulebook', 'debt-free-doctrine'];

  for (const slug of primarySlugs) {
    const brand = await resolveBrand(slug);
    assert.ok(brand, `Brand should resolve for slug: ${slug}`);
    assert.equal(brand.slug, slug, `Brand slug should match: ${slug}`);
    assert.ok(brand.label, `Brand should have a label for: ${slug}`);
    assert.ok(brand.accent, `Brand should have an accent color for: ${slug}`);
    assert.ok(brand.voice, `Brand should have a voice for: ${slug}`);
    assert.ok(Array.isArray(brand.slots), `Brand should have slots array for: ${slug}`);
  }
});

test('registryToKit produces a valid engine-compatible brand kit', () => {
  const mockRegistryEntry = {
    slug: 'stoic-path',
    label: 'STOIC PATH',
    niche: 'Stoic philosophy',
    accent: '#38BDF8',
    voice: 'am_michael',
    slots: ['18:30'],
    kit: {
      theme: 'Stoicism',
      tags: ['stoicism', 'philosophy'],
      keyword: 'stoic philosophy'
    }
  };

  const kit = registryToKit(mockRegistryEntry);
  assert.equal(kit.slug, 'stoic-path');
  assert.equal(kit.label, 'STOIC PATH');
  assert.equal(kit.accent, '#38BDF8');
  assert.equal(kit.theme, 'Stoicism');
  assert.deepEqual(kit.slots, ['18:30']);
  assert.equal(kit.fromRegistry, true);
});

test('resolveBrand returns null for unknown slug (no silent substitution — issue #72)', async () => {
  const fallback = await resolveBrand('non-existent-channel-12345');
  assert.equal(fallback, undefined, 'unknown slugs must NOT silently resolve to quotequarry');
});
