import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveBrand, registryToKit } from '../lib/brand-resolve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
// the legacy accents in the registry rows; C1 round 1 fixes the PRECEDENCE:
// declared registry accent (the Studio accent editor must win) -> legacy kit
// accent (a bare re-saved row falls back to the hand-tuned value) ->
// undefined (registryToKit never fabricates — the '#38BDF8' default survives
// ONLY in resolveBrand's pure-registry branch, so it can never beat a
// declared or legacy accent for genuinely new channels).
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

test('P5-T6 C1 round 1: a DECLARED registry accent beats the legacy kit accent (the Studio accent editor lives)', () => {
  const declared = registryToKit({ slug: 'money-rulebook', label: 'THE MONEY RULEBOOK', accent: '#C1272D' });
  assert.equal(declared.accent, '#C1272D', `the declared registry accent must win, got ${declared.accent}`);
});

test('P5-T6 C1 round 1: bare rows fall back to the legacy accent, and the fabricated default is LAST (registryToKit never fabricates)', () => {
  const bare = registryToKit({ slug: 'money-rulebook', label: 'THE MONEY RULEBOOK' });
  assert.equal(bare.accent, '#3DDC97', 'no declared accent -> the legacy kit accent (never the fabricated default)');
  const noLegacy = registryToKit({ slug: 'stoic-path', label: 'STOIC PATH' });
  assert.equal(noLegacy.accent, undefined, 'no legacy kit -> registryToKit returns undefined (it does not fabricate)');
  // the default moves to resolveBrand's pure-registry branch (no fixture seam —
  // resolveBrand reads the live mirror — so this is a source pin, house style)
  const src = fs.readFileSync(path.join(ROOT, 'lib/brand-resolve.mjs'), 'utf8');
  assert.match(src, /accent: regEntry\.accent \|\| '#38BDF8'/, 'the pure-registry branch keeps the #38BDF8 default for genuinely new channels');
});
