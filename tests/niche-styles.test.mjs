// #110 — pin-tests for the Add Channel wizard's per-niche template
// recommendation. The recommendation is DATA (studio/lib/niches.js), the same
// class as NICHE_MAP: the D17 niche vocabulary is closed, so every key must be
// a canonical niche string, every style id must exist in the catalog, and only
// 'live' styles may ever be recommended (a demo template is not a
// recommendation a new channel should get).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_NICHES,
  NICHE_MAP,
  NICHE_CATALOG,
  NICHE_RECOMMENDED,
  recommendedStyleFor,
} from '../studio/lib/niches.js';
import { STYLE_CATALOG, STYLE_BY_ID } from '../studio/lib/styles-catalog.js';

const LIVE_IDS = new Set(STYLE_CATALOG.filter((s) => s.status === 'live').map((s) => s.id));

test('#110: every canonical niche has a recommendation (closed vocabulary, full coverage)', () => {
  for (const n of CANONICAL_NICHES) {
    assert.ok(NICHE_RECOMMENDED[n], `missing recommendation for canonical niche: ${n}`);
  }
});

test('#110: no unknown or paraphrased niche keys (D17 closed vocabulary = CANONICAL_NICHES)', () => {
  for (const k of Object.keys(NICHE_RECOMMENDED)) {
    assert.ok(CANONICAL_NICHES.includes(k), `NICHE_RECOMMENDED key is not a canonical niche: ${k}`);
  }
});

test('#110: every recommended style exists and is live (demo templates never recommended)', () => {
  for (const [k, v] of Object.entries(NICHE_RECOMMENDED)) {
    assert.ok(STYLE_BY_ID[v.style], `unknown style id in recommendation for ${k}: ${v.style}`);
    assert.ok(LIVE_IDS.has(v.style), `non-live style recommended for ${k}: ${v.style}`);
  }
});

test('#110: every reason is a real sentence (shown verbatim in the wizard)', () => {
  for (const [k, v] of Object.entries(NICHE_RECOMMENDED)) {
    assert.equal(typeof v.reason, 'string', `reason missing for ${k}`);
    assert.ok(v.reason.trim().length > 10, `reason too short for ${k}`);
  }
});

test('#110: recommendedStyleFor — exact match, case-insensitive', () => {
  const r = recommendedStyleFor('History stories');
  assert.equal(r.style, 'doc');
  const ci = recommendedStyleFor('  HISTORY STORIES  ');
  assert.equal(ci.style, 'doc');
  assert.equal(ci.matched, 'History stories');
});

test('#110: recommendedStyleFor — fuzzy substring match, either direction', () => {
  assert.equal(recommendedStyleFor('history').style, 'doc');
  assert.equal(recommendedStyleFor('ai & future tech').style, 'tech');
  assert.equal(recommendedStyleFor('old money habits').style, 'cinematic');
});

test('#110: recommendedStyleFor — blank, null, or unknown free text returns null', () => {
  assert.equal(recommendedStyleFor(''), null);
  assert.equal(recommendedStyleFor('   '), null);
  assert.equal(recommendedStyleFor('quantum underwater basket weaving'), null);
  assert.equal(recommendedStyleFor(null), null);
  assert.equal(recommendedStyleFor(undefined), null);
});

test('#110: NICHE_MAP untouched — values stay string arrays (kit route + wizard rely on it)', () => {
  for (const [k, v] of Object.entries(NICHE_MAP)) {
    assert.ok(Array.isArray(v), k);
    assert.ok(v.every((s) => typeof s === 'string'), k);
  }
});
