import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeChannels, listChannels, getChannel, fbPageId, LEGACY_SLUGS } from '../lib/registry.mjs';

// --- pure merge logic (no I/O) ---

test('mergeChannels: legacy + wizard channels merge, legacy wins on slug collision', () => {
  const legacy = { 'quotequarry': { label: 'QUOTE QUARRY', slots: ['22:35'] } };
  const registry = [
    { slug: 'quotequarry', label: 'wizard copy', active: true },   // collision → legacy wins
    { slug: 'wizard-chan', label: 'Wizard Chan', active: true },   // new → included
    { slug: 'paused-chan', label: 'Paused', active: false },       // inactive → excluded
  ];
  const out = mergeChannels(legacy, registry);
  const slugs = out.map((c) => c.slug);
  assert.ok(slugs.includes('quotequarry'), 'legacy slug present');
  assert.ok(slugs.includes('wizard-chan'), 'active wizard channel included');
  assert.ok(!slugs.includes('paused-chan'), 'inactive wizard channel excluded');
  const qq = out.find((c) => c.slug === 'quotequarry');
  assert.equal(qq.label, 'QUOTE QUARRY', 'legacy entry wins collision');
  assert.equal(qq.source, 'legacy');
  assert.equal(out.find((c) => c.slug === 'wizard-chan').source, 'registry');
});

// --- real-file behavior ---

test('listChannels includes all four legacy slugs from lib/brands.json', () => {
  const slugs = listChannels().map((c) => c.slug);
  for (const s of LEGACY_SLUGS) assert.ok(slugs.includes(s), `missing ${s}`);
});

test('listChannels filters by source (legacy / registry / merged)', () => {
  const legacyOnly = listChannels({ source: 'legacy' });
  assert.ok(legacyOnly.every((c) => c.source === 'legacy'));
  const allMerged = listChannels({ source: 'merged' });
  assert.ok(allMerged.length >= legacyOnly.length);
});

test('getChannel returns the legacy kit for a known slug with destinations and ytAuth', () => {
  const qq = getChannel('quotequarry');
  assert.ok(qq, 'quotequarry resolves');
  assert.ok(qq.slots, 'has slots');
  assert.ok(qq.niches, 'has niches');
  assert.equal(qq.destinations.fbPageId, '114550268199751');
  assert.equal(qq.ytAuth.envName, 'YT_TOKEN_QUOTEQUARRY');
  assert.ok(qq.ytAuth.tokenFile.includes('quotequarry'));

  const ic = getChannel('investors-compass');
  assert.equal(ic.ytAuth.envName, 'YT_TOKEN_INVESTORS_COMPASS');
});

test('getChannel returns undefined for an unknown slug (no silent fallback)', () => {
  assert.equal(getChannel('quptequarry'), undefined, 'typo must NOT resolve to a real channel');
});

// --- FB page destinations (regression: #38 yt-daily posted QQ frames to the retired page) ---

test('fbPageId: canonical page ids for all four legacy channels (09-20 page swap)', () => {
  // Reliq North replaced Strategic Silence as QQ's page on 09-20 — 114550268199751 is canonical.
  assert.equal(fbPageId('quotequarry'), '114550268199751');
  assert.equal(fbPageId('investors-compass'), '116157974886564');
  assert.equal(fbPageId('money-rulebook'), '1077306835630491');
  assert.equal(fbPageId('debt-free-doctrine'), '106473735839651');
});

test('fbPageId: wizard channel without a destination and unknown slugs return undefined', () => {
  assert.equal(fbPageId('definitely-not-a-channel'), undefined);
});

// ---------------------------------------------------------------------------
// Phase 5 T1 — the registryThresholds identity truth table (AC-P5-5 / D8 /
// D19). The brain gate resolves thresholds + the review signal from
// REGISTRY_META[templateId] — the SAME string the assignment row stores (the
// registry key). Declared values win; absent values fall to the documented
// defaults; a v2 template resolves by ITS key, never its family's block.
// ---------------------------------------------------------------------------

import { registryThresholds } from '../youtube-engine.mjs';
import { REGISTRY_META as REGISTRY_DATA } from '../studio/lib/template-registry.data.js';

test('registryThresholds: declared values win, defaults fill the rest (truth table)', () => {
  // finance-explainers declares 0.85/0.90 explicitly (Phase 3 pin, re-run)
  const fin = registryThresholds('finance-explainers');
  assert.equal(fin.variation, 0.85);
  assert.equal(fin.crossChannel, 0.90);
  assert.deepEqual(fin.reviewRequired, ['finance']);
  assert.equal(fin.financeGated, true);
  assert.equal(fin.gatedReview, true);

  // a template with no declared values inherits the documented defaults
  const plain = registryThresholds('documentary-frames');
  assert.equal(plain.variation, 0.85);
  assert.equal(plain.crossChannel, 0.90);
  assert.deepEqual(plain.reviewRequired, []);
  assert.equal(plain.financeGated, false);
  assert.equal(plain.gatedReview, false);

  // unknown / template-less ids: defaults, never a throw, never gated
  assert.equal(registryThresholds('not-a-template').financeGated, false);
  assert.equal(registryThresholds('not-a-template').gatedReview, false);
  assert.equal(registryThresholds('not-a-template').variation, 0.85);
  assert.equal(registryThresholds(null).variation, 0.85);
  assert.equal(registryThresholds(null).financeGated, false);
  assert.equal(registryThresholds(null).gatedReview, false);
});

test('registryThresholds: a schema v2 template resolves by ITS key, never the family block (identity)', () => {
  const key = 'qa-identity-v2';
  const prev = REGISTRY_DATA[key];
  REGISTRY_DATA[key] = {
    variation_threshold: 0.78,
    cross_channel_threshold: 0.84,
    safety: { review_required: ['medical'] },
  };
  try {
    const t = registryThresholds(key);
    assert.equal(t.variation, 0.78, 'the v2 template\'s declared threshold wins');
    assert.equal(t.crossChannel, 0.84);
    assert.deepEqual(t.reviewRequired, ['medical'], 'the template\'s own review signal, not the family\'s');
    assert.equal(t.financeGated, false);
    assert.equal(t.gatedReview, true, 'ANY non-empty review_required arms the T2b fail-closed tiering (D3/AC-P5-6)');
  } finally {
    if (prev === undefined) delete REGISTRY_DATA[key];
    else REGISTRY_DATA[key] = prev;
  }
});
