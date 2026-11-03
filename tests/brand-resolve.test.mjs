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

test('#101 IC authority: registry niche fabricates the authority now that the mirror carries real kit data', async () => {
  // DEPENDENCY: reads the live mirror yt-mcp/studio-channels.json (resolveBrand
  // has no fixture seam). d72c495 (E2E prep) gave investors-compass a real
  // niche + kit.niches, so the row is no longer the connect-first skeleton the
  // original assertion assumed: registryToKit now legitimately fabricates
  // "<niche> Wisdom" and the merge (registry wins) makes it the authority —
  // replacing the legacy kit's 'Market Wisdom'. The skeleton fall-through half
  // of the original #101 intent is covered by the pure-fixture test below
  // (registryToKit fabricates authority only from a real niche/theme) —
  // immune to future real-data backfills.
  const ic = await resolveBrand('investors-compass');
  assert.equal(ic.authority, 'Investing psychology & market wisdom Wisdom', `mirror niche must fabricate the authority, got "${ic.authority}"`);
});

test('#101 registryToKit fabricates authority only from a real niche/theme', () => {
  const skeleton = registryToKit({ slug: 'skeleton', label: 'SKELETON' });
  assert.equal(skeleton.authority, undefined, 'no niche/theme -> no fabricated authority (merge falls through to legacy)');
  const withNiche = registryToKit({ slug: 'niched', label: 'NICHED', niche: 'Value investing' });
  assert.equal(withNiche.authority, 'Value investing Wisdom', 'real niche still fabricates the authority as before');
});

// ---------------------------------------------------------------------------
// P5-T6 — the accent clobber (audit 2026-11-03): every registry row lacked an
// accent, so registryToKit fabricated '#38BDF8' and the merge's
// `regEntry.accent || legacy.accent` let the fabricated default beat each
// legacy channel's hand-tuned accent in EVERY engine-side render. D1 carries
// the legacy accents in the registry rows; C1 is the defense — the fallback
// prefers the legacy kit accent over the fabricated default (the Studio wizard
// can rewrite a row without the accent field at any time, so the fix must not
// depend on the data edit staying put).
// ---------------------------------------------------------------------------

test('P5-T6 C1 pin: the four legacy channels resolve their factory accents (the #38BDF8 clobber is dead)', async () => {
  const FACTORY = {
    quotequarry: '#F5E31C',
    'investors-compass': '#E8C15A',
    'money-rulebook': '#3DDC97',
    'debt-free-doctrine': '#D9C7A7',
  };
  for (const [slug, accent] of Object.entries(FACTORY)) {
    const brand = await resolveBrand(slug);
    assert.equal(brand.accent, accent, `${slug} must keep its hand-tuned legacy accent, got ${brand.accent}`);
  }
});

test('P5-T6 C1 defense: a legacy-slug registry row with no accent falls through to the kit accent, never the fabricated default', () => {
  const bare = registryToKit({ slug: 'money-rulebook', label: 'THE MONEY RULEBOOK' });
  assert.equal(bare.accent, '#3DDC97', 'the legacy kit accent wins over the fabricated #38BDF8');
  const noLegacy = registryToKit({ slug: 'stoic-path', label: 'STOIC PATH' });
  assert.equal(noLegacy.accent, '#38BDF8', 'no legacy kit -> the fabricated default still applies');
});
