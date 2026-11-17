// #113 — pin-tests for the LLM brand-kit draft seam (pure parts only; the
// network call is exercised live in QA). Contracts: the prompt carries the
// niche + STRICT-JSON instruction + the allow-lists; the parser clamps
// lengths, caps list sizes, dedupes, drops non-production voice/style ids,
// tolerates missing fields, and REFUSES garbage — because the route falls
// back to the deterministic templates on any throw (EARS 3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildKitPrompt, parseKitDraft, KIT_FIELD_CAPS, ALLOWED_VOICE_IDS, ALLOWED_STYLE_IDS } from '../studio/lib/llm-kit.js';

test('#113: the prompt asks for strict JSON and ships the allow-lists', () => {
  const { system, user } = buildKitPrompt({ niche: 'personal finance', label: 'Money Rulebook', slug: 'money-rulebook' });
  assert.match(system, /STRICT JSON/);
  assert.match(system, /"subNiches"/, 'the exact JSON keys are named');
  assert.ok(system.includes('am_michael'), 'voice allow-list from lib/voices.js is in the prompt');
  assert.ok(system.includes('doc'), 'live style ids are in the prompt');
  assert.match(user, /personal finance/);
  assert.match(user, /Money Rulebook/);
  assert.match(user, /money-rulebook/);
});

test('#113: parseKitDraft clamps long fields and caps list sizes', () => {
  const d = parseKitDraft({
    eyebrow: 'X'.repeat(200),
    tagline: 'T'.repeat(200),
    description: 'D'.repeat(2000),
    tags: Array.from({ length: 30 }, (_, i) => `tag ${i}`),
    subNiches: Array.from({ length: 10 }, (_, i) => `pillar ${i}`),
    voice: 'am_michael',
    style: 'doc',
  });
  assert.equal(d.eyebrow.length, KIT_FIELD_CAPS.eyebrow);
  assert.equal(d.tagline.length, KIT_FIELD_CAPS.tagline);
  assert.equal(d.description.length, KIT_FIELD_CAPS.description);
  assert.equal(d.tags.length, KIT_FIELD_CAPS.maxTags);
  assert.equal(d.subNiches.length, KIT_FIELD_CAPS.maxSubNiches);
  assert.equal(d.voice, 'am_michael');
  assert.equal(d.style, 'doc');
});

test('#113: parseKitDraft dedupes tags case-insensitively and drops junk', () => {
  const d = parseKitDraft({ tags: ['money', 'Money', 'MONEY ', '  ', 'habits'], subNiches: ['a', 'a', 'b'] });
  assert.deepEqual(d.tags, ['money', 'habits']);
  assert.deepEqual(d.subNiches, ['a', 'b']);
});

test('#113: parseKitDraft only suggests production voice/style ids — invalid ones become null', () => {
  const ok = parseKitDraft({ voice: 'bm_george', style: 'cinematic' });
  assert.equal(ok.voice, 'bm_george');
  assert.equal(ok.style, 'cinematic');
  const bad = parseKitDraft({ voice: 'zz_fakevoice', style: 'paper', eyebrow: 'keep' });
  assert.equal(bad.voice, null, 'non-production voice dropped');
  assert.equal(bad.style, null, 'demo-only style dropped');
  assert.ok(!ALLOWED_STYLE_IDS.includes('paper') && ALLOWED_STYLE_IDS.includes('doc'));
  assert.ok(ALLOWED_VOICE_IDS.length >= 7, 'every production voice is allow-listed');
});

test('#113: parseKitDraft tolerates missing fields but refuses empty drafts', () => {
  const d = parseKitDraft({ eyebrow: 'PARTIAL DRAFT' });
  assert.deepEqual(d.tags, []);
  assert.equal(d.voice, null);
  assert.throws(() => parseKitDraft({}), { message: 'draft has no usable fields' });
});

test('#113: parseKitDraft throws on non-JSON / non-object replies (route falls back)', () => {
  assert.throws(() => parseKitDraft('I am not json at all'));
  assert.throws(() => parseKitDraft(['a', 'b']));
  assert.throws(() => parseKitDraft(null));
  assert.throws(() => parseKitDraft('{"eyebrow":'));
});
