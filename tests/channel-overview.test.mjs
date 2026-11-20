// Feedback round 1 (2026-11-19) — items D + H. Pure helpers behind the calm
// channel cards (red dot only for REAL problems), the channel overview drawer
// and the per-channel page. See docs/qa/feedback-r1-channels-qa.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  channelHasRealProblem, todayStatus, uploadedToday, nextSlot, scheduleSummary, INBOX_HREF, PROBLEM_LABEL,
} from '../studio/lib/channel-overview.mjs';
import { groupRealWarnings } from '../studio/lib/notify-policy.mjs';

const TODAY = '2026-11-19';
const at = (hhmm, day = TODAY) => new Date(`${day}T${hhmm}:00Z`);
const row = (over = {}) => ({
  slug: 'demo-chan', flowPaused: false, lastRun: '2026-11-18', todayVideos: 0,
  slots: ['00:05'], longSlot: '22:30', docDays: [], ...over,
});

// ---------------- D2/D3: the red dot ----------------

test('D2: a channel with a REAL open problem (grouped rows) has the red dot', () => {
  const rows = groupRealWarnings([
    { id: 1, channel_id: 'demo-chan', severity: 'warning', code: 'x', title: 'held' },
    { id: 2, channel_id: 'demo-chan', severity: 'warning', code: 'x', title: 'held' },
  ]);
  assert.equal(channelHasRealProblem(rows, 'demo-chan'), true);
  assert.equal(channelHasRealProblem([{ channel_id: 'demo-chan', severity: 'blocking' }], 'demo-chan'), true);
  assert.equal(channelHasRealProblem([{ channel_id: 'demo-chan', severity: 'action_required' }], 'demo-chan'), true);
});

test('D3: no dot for quiet notes, other channels, system rows, or missing data', () => {
  assert.equal(channelHasRealProblem([{ channel_id: 'demo-chan', severity: 'advisory' }], 'demo-chan'), false);
  assert.equal(channelHasRealProblem([{ channel_id: 'demo-chan', severity: 'informational' }], 'demo-chan'), false);
  assert.equal(channelHasRealProblem([{ channel_id: 'other-chan', severity: 'blocking' }], 'demo-chan'), false);
  assert.equal(channelHasRealProblem([{ channel_id: 'system', severity: 'blocking' }], 'demo-chan'), false);
  assert.equal(channelHasRealProblem([], 'demo-chan'), false);
  assert.equal(channelHasRealProblem(undefined, 'demo-chan'), false);
  assert.equal(channelHasRealProblem([null, {}], 'demo-chan'), false);
  assert.equal(channelHasRealProblem([{ channel_id: 'demo-chan', severity: 'blocking' }], ''), false);
});

test('D2: the dot label and the Inbox link are short and point at the Inbox page', () => {
  assert.equal(PROBLEM_LABEL, 'Has a problem — see Inbox');
  assert.equal(INBOX_HREF, '/tasks');
});

// ---------------- D4: never "Not run today" ----------------

test('D4: today\'s wording never says "not run today" at any hour (early slot, late slot, no slot)', () => {
  const shapes = [
    row(), // 00:05 slot passes long before the 03:xx run — the original bug
    row({ slots: ['22:35'], longSlot: '14:30' }),
    row({ slots: [], longSlot: null }),
    row({ slots: ['nonsense'] }),
  ];
  for (const r of shapes) {
    for (let h = 0; h < 24; h++) {
      const now = at(`${String(h).padStart(2, '0')}:30`);
      const s = todayStatus(r, now);
      assert.doesNotMatch(s.text, /not run today/i, `${JSON.stringify(r.slots)} @ ${h}:30 → ${s.text}`);
      assert.notEqual(s.tone, 'bad', 'today is a fact, never a red warning');
    }
  }
});

// Live-fix wave A3 (2026-11-20): today's wording reads the truthful `today` /
// `todayRun` fields, never the frozen lastRun date (tests/wave-a3.test.mjs).
test('D4: today\'s wording — made, ran, not yet, paused, unknown', () => {
  const now = at('12:00');
  const today = (count) => ({ day: TODAY, basis: 'UTC', count, clips: count, episodes: 0, shorts: 0 });
  assert.deepEqual(todayStatus(row({ today: today(3) }), now), { tone: 'ok', text: 'Made 3 videos today' });
  assert.deepEqual(todayStatus(row({ today: today(1) }), now), { tone: 'ok', text: 'Made 1 video today' });
  assert.deepEqual(todayStatus(row({ today: today(0), todayRun: { status: 'succeeded' } }), now), { tone: 'ok', text: 'Ran today · nothing new' });
  assert.deepEqual(todayStatus(row(), now), { tone: 'plain', text: 'Not made yet today' });
  assert.deepEqual(todayStatus(row({ flowPaused: true }), now), { tone: 'plain', text: 'Paused — nothing new today' });
  assert.deepEqual(todayStatus(row({ today: null }), now), { tone: 'plain', text: "Can't check today right now" });
  assert.deepEqual(todayStatus(row({ lastRun: TODAY, today: today(0) }), now), { tone: 'plain', text: 'Not made yet today' }, 'the frozen lastRun field is ignored');
  assert.deepEqual(todayStatus(null, now), { tone: 'plain', text: 'Unknown' });
});

// ---------------- H2: uploads today + next slot ----------------

test('H2: uploadedToday counts only this channel\'s YouTube uploads that went live today, up to now', () => {
  const now = at('12:00');
  const logs = [
    { slug: 'demo-chan', platform: 'YouTube', at: `${TODAY}T00:05:00Z` }, // live today ✓
    { slug: 'demo-chan', platform: 'YouTube', at: `${TODAY}T11:59:00Z` }, // live today ✓
    { slug: 'demo-chan', platform: 'YouTube', at: `${TODAY}T22:30:00Z` }, // later today — still scheduled
    { slug: 'demo-chan', platform: 'YouTube', at: '2026-11-18T23:00:00Z' }, // yesterday
    { slug: 'demo-chan', platform: 'FB/IG', at: `${TODAY}T01:00:00Z` }, // not YouTube
    { slug: 'other-chan', platform: 'YouTube', at: `${TODAY}T01:00:00Z` }, // other channel
    { slug: 'demo-chan', platform: 'YouTube', at: null },
  ];
  assert.equal(uploadedToday(logs, 'demo-chan', now), 2);
  assert.equal(uploadedToday(undefined, 'demo-chan', now), 0);
});

test('H2: nextSlot picks the soonest upcoming slot, wrapping to tomorrow', () => {
  const r = row({ slots: ['00:05', '12:00'], longSlot: null });
  assert.deepEqual(nextSlot(r, at('06:00')), { hhmm: '12:00', kind: 'Short', at: at('12:00') });
  assert.deepEqual(nextSlot(r, at('13:00')), { hhmm: '00:05', kind: 'Short', at: at('00:05', '2026-11-20') });
  assert.equal(nextSlot(row({ slots: [], longSlot: null }), at('06:00')), null);
  assert.equal(nextSlot(null, at('06:00')), null);
});

test('H2: the long-form slot only counts on the channel\'s long-form days', () => {
  // 2026-11-19 is a Thursday
  const r = row({ slots: ['23:00'], longSlot: '14:30', docDays: ['Thu'] });
  assert.deepEqual(nextSlot(r, at('10:00')), { hhmm: '14:30', kind: 'Long-form', at: at('14:30') });
  const notToday = row({ slots: ['23:00'], longSlot: '14:30', docDays: ['Tue'] });
  assert.deepEqual(nextSlot(notToday, at('10:00')), { hhmm: '23:00', kind: 'Short', at: at('23:00') });
  const noDays = row({ slots: [], longSlot: '14:30', docDays: [] });
  assert.equal(nextSlot(noDays, at('10:00')), null, 'no long-form days → no long-form slot');
  const nextTue = row({ slots: [], longSlot: '14:30', docDays: ['Tue'] });
  assert.deepEqual(nextSlot(nextTue, at('10:00')), { hhmm: '14:30', kind: 'Long-form', at: at('14:30', '2026-11-24') });
});

test('H2: scheduleSummary — short plain lines, long-form only with its days', () => {
  assert.deepEqual(scheduleSummary(row({ slots: ['12:00', '00:05'], longSlot: '22:30', docDays: ['Tue', 'Fri'] })), [
    'Shorts 00:05 · 12:00 UTC',
    'Long-form 22:30 UTC · Tue · Fri',
  ]);
  assert.deepEqual(scheduleSummary(row({ slots: ['00:05'], longSlot: '22:30', docDays: [] })), ['Shorts 00:05 UTC']);
  assert.deepEqual(scheduleSummary(row({ slots: [], longSlot: null })), []);
  assert.deepEqual(scheduleSummary(null), []);
});

test('lib has relative imports only (node --test must load it)', () => {
  const src = fs.readFileSync(new URL('../studio/lib/channel-overview.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /from '@\//);
});
