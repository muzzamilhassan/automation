// Option B1 (owner 2026-11-16) — YouTube AI disclosure. The review desk asks
// the four official synthetic-media questions (studio/lib/review-actions.mjs
// DISCLOSURE_CATEGORIES) but the answers were DROPPED and no upload ever set
// status.containsSyntheticMedia. Per https://support.google.com/youtube/answer/14328491
// only REALISTIC synthetic content must be disclosed (real person made to
// say/do, altered real footage, realistic scene that didn't occur, AI music as
// the focus); AI help with script/thumbnail/title/captions does not. So:
// any "yes" answer -> true; else the channel's kit.syntheticMedia; default false.
// Spec + QA: docs/qa/synthetic-media-qa.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { containsSyntheticMediaFor, scriptDisclosureAnswers } from '../lib/synthetic-media.mjs';
import { makeScriptStore } from '../studio/lib/script-store.mjs';

const ALL_NO = {
  "Makes a real person appear to say or do something they didn't do": false,
  'Alters footage of a real event or place': false,
  "Generates a realistic scene that didn't actually occur": false,
  "Creates music that's the main focus of the video": false,
};

test('any yes answer declares synthetic media', () => {
  assert.equal(containsSyntheticMediaFor({ answers: { ...ALL_NO, 'Alters footage of a real event or place': true } }), true);
});

test('all-no answers declare false even if the channel default is false', () => {
  assert.equal(containsSyntheticMediaFor({ answers: ALL_NO, kit: {} }), false);
});

test('no answers (unreviewed lane) -> the channel setting, default false', () => {
  assert.equal(containsSyntheticMediaFor({ kit: {} }), false);
  assert.equal(containsSyntheticMediaFor({ kit: { syntheticMedia: true } }), true);
  assert.equal(containsSyntheticMediaFor({}), false);
});

test('a channel flagged synthetic stays true even when a script answered all-no', () => {
  assert.equal(containsSyntheticMediaFor({ answers: ALL_NO, kit: { syntheticMedia: true } }), true);
});

test('scriptDisclosureAnswers reads meta as object or JSON string', () => {
  assert.deepEqual(scriptDisclosureAnswers({ meta: { disclosure_answers: ALL_NO } }), ALL_NO);
  assert.deepEqual(scriptDisclosureAnswers({ meta: JSON.stringify({ disclosure_answers: ALL_NO }) }), ALL_NO);
  assert.equal(scriptDisclosureAnswers({ meta: null }), null);
  assert.equal(scriptDisclosureAnswers(null), null);
});

test('approve() stores the disclosure answers on the script (no longer dropped)', async () => {
  const calls = [];
  const client = async (text, params) => {
    const s = text.replace(/\s+/g, ' ').trim();
    calls.push({ s, params });
    if (s.startsWith('SELECT status FROM scripts')) return [{ status: 'awaiting_review' }];
    if (s.startsWith("UPDATE scripts SET status = 'approved'")) return [{ id: params[0] }];
    return [];
  };
  const store = makeScriptStore({ dbClient: client, now: () => '2026-11-16T00:00:00Z', warn: () => {} });
  const r = await store.approve('s1', { by: 'owner@x', disclosure: ALL_NO });
  assert.equal(r.ok, true, JSON.stringify(r));
  const meta = calls.find((c) => c.s.startsWith("UPDATE scripts SET meta = COALESCE(meta, '{}'::jsonb) ||"));
  assert.ok(meta, `meta merge issued; calls: ${calls.map((c) => c.s.slice(0, 50)).join(' | ')}`);
  assert.deepEqual(JSON.parse(meta.params[1]).disclosure_answers, ALL_NO);
});

test('every upload declares containsSyntheticMedia; reviewed lanes use the stored answers', () => {
  const sites = {
    'yt-deepdive.mjs': /containsSyntheticMedia: containsSyntheticMediaFor\(\{ answers: scriptDisclosureAnswers\(reviewScript\), kit: b \}\)/,
    'yt-daily.mjs': /containsSyntheticMedia: containsSyntheticMediaFor\(/,
    'longvideo/shorts-clips.mjs': /containsSyntheticMedia: containsSyntheticMediaFor\(\{ kit: b \}\)/,
  };
  for (const [f, re] of Object.entries(sites)) {
    const s = fs.readFileSync(f, 'utf8');
    const statuses = s.match(/status: \{ privacyStatus: 'private'[^}]*\}/g) || [];
    assert.ok(statuses.length > 0, f);
    for (const st of statuses) assert.match(st, /containsSyntheticMedia:/, `${f}: ${st.slice(0, 80)}`);
    assert.match(s, re, f);
  }
  const daily = fs.readFileSync('yt-daily.mjs', 'utf8');
  assert.match(daily, /scriptDisclosureAnswers\(found\.script\)/, 'the Shorts resume path uses the approved answers');
});

test('the channel setting flows from the registry kit (declared-only)', async () => {
  const { registryToKit, mergeBrand } = await import('../lib/brand-resolve.mjs');
  assert.equal(registryToKit({ slug: 'x', kit: { syntheticMedia: true } }).syntheticMedia, true);
  assert.equal(registryToKit({ slug: 'x', kit: {} }).syntheticMedia, undefined);
  assert.equal(mergeBrand({ slug: 'x' }, registryToKit({ slug: 'x', kit: { syntheticMedia: true } })).syntheticMedia, true);
});
