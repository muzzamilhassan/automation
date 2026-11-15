// Admin-panel review 2026-11-15 (panel bug #2): /api/overview kept only
// channels with live YouTube stats (`c.yt && !c.yt.error && subs/views > 0`),
// so a LIVE channel whose YouTube read failed (expired token, 401) vanished
// from /channels and /production exactly when it needed a re-login.
// selectVisibleChannels keeps every producing OR active channel and labels
// health; dormant (active:false) brands with no stats stay hidden.
// Spec + QA: docs/qa/overview-visible-qa.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { selectVisibleChannels } from '../studio/lib/overview-visible.mjs';

const live = { slug: 'investors-compass', active: true, yt: { subs: 9, views: 900, error: null } };
const broken = { slug: 'money-rulebook', active: true, yt: { error: 'token refresh failed: HTTP 400' } };
const noData = { slug: 'quotequarry', active: true, yt: null };
const dormant = { slug: 'tax-shield', active: false, yt: null };
const dormantErr = { slug: 'ai-observer', active: false, yt: { error: 'no token' } };

test('a live channel with a YouTube error stays visible, flagged youtube_error', () => {
  const out = selectVisibleChannels([live, broken]);
  assert.deepEqual(out.map((c) => c.slug), ['investors-compass', 'money-rulebook']);
  assert.equal(out.find((c) => c.slug === 'money-rulebook').health, 'youtube_error');
  assert.equal(out.find((c) => c.slug === 'investors-compass').health, 'ok');
});

test('an active channel with no YouTube data at all is shown as no_youtube_data', () => {
  assert.equal(selectVisibleChannels([noData])[0].health, 'no_youtube_data');
});

test('dormant/parked brands (active:false, no stats) stay hidden', () => {
  assert.deepEqual(selectVisibleChannels([dormant, dormantErr]), []);
});

test('a producing channel is shown even if not flagged active', () => {
  const p = { slug: 'x', active: false, yt: { subs: 1, views: 10 } };
  assert.equal(selectVisibleChannels([p]).length, 1);
});

test('wiring: the overview route uses selectVisibleChannels instead of the stats-only filter', () => {
  const src = fs.readFileSync('studio/app/api/overview/route.js', 'utf8');
  assert.match(src, /selectVisibleChannels\(channels\)/);
  assert.doesNotMatch(src, /channels\.filter\(\(c\) => c\.yt && !c\.yt\.error/);
});
