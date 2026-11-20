// Phase 2 I4 — cockpit home. Behavioral tests for the pure verdict rules
// (studio/lib/cockpit-verdict.mjs) + source scans pinning the page wiring.
// Honesty rule under test: a source that failed is UNKNOWN — never zero,
// never "All good".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  deriveVerdict, channelToday, nextSlot, fmtIn, reviewStatusFromHttp,
} from '../studio/lib/cockpit-verdict.mjs';

// Fixed clock after every fixture slot (22:35 UTC): 'not run' is a real
// problem here, never the before-first-slot 'waiting' state.
const LATE = new Date('2026-11-19T23:30:00Z');
const ch = (slug, extra = {}) => ({ slug, label: slug.toUpperCase(), active: true, todayVideos: 2, slots: ['22:35'], yt: { subs: 1, error: null }, health: 'ok', ...extra });
const okWarn = { status: 'ok', rows: [] };
const okReview = { status: 'ok', count: 0 };

test('all good: every channel made today, no warnings, no approvals', () => {
  const v = deriveVerdict({ now: LATE, channels: [ch('a'), ch('b')], warnings: okWarn, review: okReview });
  assert.equal(v.kind, 'all_good');
  assert.equal(v.headline, 'All good — 2 channels ran today');
  assert.deepEqual(v.items, []);
  assert.deepEqual(v.unknown, []);
});

test('needs you: mixed reasons are each listed and counted, linking to the right place', () => {
  const v = deriveVerdict({ now: LATE,
    channels: [
      ch('made'),
      ch('idle', { todayVideos: 0 }),
      ch('paused', { flowPaused: true, todayVideos: 0 }),
      ch('broken', { health: 'youtube_error', yt: { error: 'invalid_grant' } }),
    ],
    warnings: { status: 'ok', rows: [{ id: 1, severity: 'blocking' }, { id: 2, severity: 'action_required' }] },
    review: { status: 'ok', count: 3 },
  });
  assert.equal(v.kind, 'needs_you');
  assert.equal(v.headline, '5 things need you');
  assert.equal(v.tone, 'bad');
  const byKey = Object.fromEntries(v.items.map((i) => [i.key, i]));
  assert.match(byKey['run:idle'].text, /IDLE didn't run today/);
  assert.equal(byKey['run:idle'].href, '/channels/idle');
  assert.match(byKey['pause:paused'].text, /paused/);
  assert.match(byKey['yt:broken'].text, /can't reach YouTube/);
  assert.equal(byKey['yt:broken'].tone, 'bad');
  assert.match(byKey.warnings.text, /^2 real problems/);
  assert.equal(byKey.warnings.href, '/warnings');
  assert.match(byKey.review.text, /^3 scripts waiting for your approval/);
  assert.equal(byKey.review.href, '/review');
  assert.equal(v.ran, 1);
});

test('one item reads in the singular', () => {
  const v = deriveVerdict({ now: LATE, channels: [ch('a')], warnings: okWarn, review: { status: 'ok', count: 1 } });
  assert.equal(v.headline, '1 thing needs you');
  assert.match(v.items[0].text, /^1 script waiting/);
});

test('unknown: warnings status error is never all-good', () => {
  const v = deriveVerdict({ now: LATE, channels: [ch('a')], warnings: { status: 'error', rows: [] }, review: okReview });
  assert.equal(v.kind, 'unknown');
  assert.equal(v.headline, "Can't check right now — status unknown");
  assert.match(v.sub, /warnings/);
  assert.match(v.sub, /not an all-clear/);
  assert.deepEqual(v.unknown, ['warnings']);
});

test('unknown: review 503 is unknown, not zero', () => {
  assert.equal(reviewStatusFromHttp(503), 'error');
  const v = deriveVerdict({ now: LATE, channels: [ch('a')], warnings: okWarn, review: { status: reviewStatusFromHttp(503), count: null } });
  assert.equal(v.kind, 'unknown');
  assert.deepEqual(v.unknown, ['approvals']);
});

test('unknown: review 401 for an owner/staff session is unknown; a client being refused is expected', () => {
  assert.equal(reviewStatusFromHttp(401), 'forbidden');
  const owner = deriveVerdict({ now: LATE, channels: [ch('a')], warnings: okWarn, review: { status: 'forbidden', count: null } });
  assert.equal(owner.kind, 'unknown');
  const client = deriveVerdict({ now: LATE, channels: [ch('a')], warnings: { status: 'forbidden', rows: [] }, review: { status: 'forbidden', count: null } });
  assert.equal(client.kind, 'all_good');
});

test('real problems still show when another source is unknown — with the unknown named', () => {
  const v = deriveVerdict({ now: LATE, channels: [ch('a', { todayVideos: 0 })], warnings: { status: 'error', rows: [] }, review: { status: 'ok', count: 2 } });
  assert.equal(v.kind, 'needs_you');
  assert.equal(v.count, 2);
  assert.match(v.sub, /Can't check warnings right now — status unknown/);
  // live fix wave A4: a channel row alone is not counted, so an unknown source wins
  const chOnly = deriveVerdict({ now: LATE, channels: [ch('a', { todayVideos: 0 })], warnings: { status: 'error', rows: [] }, review: okReview });
  assert.equal(chOnly.kind, 'unknown');
  assert.equal(chOnly.items.length, 1, 'the channel row is still listed');
});

test('loading: nothing claimed until the sources answer; missing overview is unknown', () => {
  assert.equal(deriveVerdict({ now: LATE, channels: [ch('a')], warnings: { status: 'loading', rows: [] }, review: okReview }).kind, 'loading');
  assert.equal(deriveVerdict({ now: LATE, channels: [ch('a')], warnings: okWarn, review: { status: 'loading' } }).kind, 'loading');
  assert.equal(deriveVerdict({ now: LATE, channels: null, warnings: okWarn, review: okReview }).kind, 'unknown');
  assert.equal(deriveVerdict({ now: LATE, channels: [], warnings: okWarn, review: okReview }).kind, 'empty');
});

test('channelToday precedence + nextSlot math (UTC)', () => {
  assert.equal(channelToday(ch('a', { flowPaused: true, health: 'youtube_error' }), LATE).state, 'yt_error');
  assert.equal(channelToday(ch('a', { flowPaused: true }), LATE).state, 'paused');
  assert.equal(channelToday(ch('a', { todayVideos: 0 }), LATE).state, 'not_run');
  assert.equal(channelToday(ch('a'), LATE).label, '2 made today');
  const now = new Date('2026-11-19T21:00:00Z');
  assert.deepEqual(nextSlot(['22:35'], '14:30', now), { time: '22:35', inMin: 95 });
  assert.deepEqual(nextSlot(['00:05'], null, now), { time: '00:05', inMin: 185 }); // rolls to tomorrow
  assert.equal(nextSlot([], null, now), null);
  assert.equal(fmtIn(95), 'in 1h 35m');
  assert.equal(fmtIn(120), 'in 2h');
  assert.equal(fmtIn(5), 'in 5m');
});

// ---- source scans: the page wiring (anchored to code shapes, not comments)
const page = fs.readFileSync('studio/app/page.js', 'utf8');
const code = page.replace(/\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

// feedback r1 (2026-11-19): home = verdict line → channel rows → views chart;
// the tabs and lifetime tiles moved off home (tests/home-simple.test.mjs)
test('page: the verdict line is rendered first, before the channel rows and the chart', () => {
  assert.match(code, /from '@\/lib\/cockpit-verdict\.mjs'/);
  assert.match(code, /const verdict = deriveVerdict\(\{/);
  const banner = code.indexOf('<VerdictLine verdict={verdict}');
  assert.ok(banner > 0, 'verdict rendered');
  assert.ok(banner < code.indexOf('<TodayList'), 'verdict above the channel rows');
  assert.ok(code.indexOf('<TodayList') < code.indexOf('title="Views per day"'), 'channel rows above the chart');
  assert.doesNotMatch(code, /<TabNav\b|label="YT subs"/, 'no tabs or lifetime tiles on home');
  assert.match(code, /href=\{`\/channels\/\$\{c\.slug\}`\}/, 'channel rows open the channel page');
});

test('page: the verdict + review state hooks live inside OverviewContent (not the wrapper)', () => {
  const start = code.indexOf('function OverviewContent()');
  const end = code.indexOf('export default function Overview()');
  assert.ok(start > 0 && end > start);
  const inner = code.slice(start, end);
  const wrapper = code.slice(end);
  for (const re of [/useBrands\(\)/, /useOpenWarnings\(\)/, /useState\(\{ status: 'loading', count: null \}\)/, /deriveVerdict\(/]) {
    assert.match(inner, re);
    assert.doesNotMatch(wrapper, re);
  }
  assert.match(inner, /warnings: \{ status: warnStatus, rows: openWarningRows \}/);
  assert.match(inner, /fetch\('\/api\/review'\)/);
  assert.match(inner, /reviewStatusFromHttp\(r\.status\)/);
});

test('page: Phase 0 honesty retained — coverage chip, unavailable chart, unknown verdict + Retry', () => {
  assert.match(code, /analyticsCoverage\.failed\?\.length === 0 \? <Chip tone="ok">/);
  assert.match(code, /YouTube unavailable · <button/);
  assert.match(code, />— · unavailable</);
  // feedback r1: the warnings error card is gone; an error makes the verdict
  // "unknown" (never all-clear) and the line offers Retry
  assert.match(code, /verdict\.unknown\.length \? \(/);
  assert.match(code, /this is not an all-clear/);
  assert.doesNotMatch(code, /Chip tone="ok">real data</);
});

// Integration (2026-11-19): no morning false alarm — before a channel's first
// slot of the day, "not run yet" is waiting, not a problem.
test('channelToday: before the first slot a channel is waiting, after it it is not_run', async () => {
  const { channelToday, deriveVerdict } = await import('../studio/lib/cockpit-verdict.mjs');
  const c = { slug: 'a', label: 'A', slots: ['14:30', '22:35'], todayVideos: 0 };
  const morning = new Date('2026-11-19T09:00:00Z');
  const evening = new Date('2026-11-19T15:00:00Z');
  assert.equal(channelToday(c, morning).state, 'waiting');
  assert.equal(channelToday(c, evening).state, 'not_run');
  const v = deriveVerdict({ now: LATE, channels: [c], warnings: { status: 'ok', rows: [] }, review: { status: 'ok', count: 0 }, now: morning });
  assert.equal((v.items || []).length, 0, 'a waiting channel is not a thing that needs you');
  const noSlots = { slug: 'b', label: 'B', slots: [], todayVideos: 0 };
  assert.equal(channelToday(noSlots, morning).state, 'not_run', 'no slots set → cannot know it is waiting');
});
