// Calendar page (owner-approved 2026-11-23) — the pure core behind
// /api/calendar and /calendar: slot expansion over a date range, the merge of
// real items (published / scheduled / waiting) with free slots, the Monday
// month grid, and day grouping. Real data only: a free slot is shown only
// where nothing real sits, and only from now on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  expandSlots, mergeItems, monthGrid, groupByDay, scheduleFor, validateRange,
  addDays, weekDays, localDayOf, foldUntitled, viewRange, shiftAnchor, laneOf,
} from '../studio/lib/calendar-view.mjs';

const NOW = Date.parse('2026-11-23T12:00:00Z'); // a Monday

const daily = { slug: 'qq', shortSlots: ['22:35'], longSlot: '14:30', shortDays: [], docDays: ['Tue'], shortsSource: 'generated' };

/* ------------------------------- expandSlots ------------------------------- */

test('EARS: WHEN a channel has a daily short slot THEN every day in range gets one, in UTC, only after now', () => {
  const slots = expandSlots(daily, '2026-11-20', '2026-11-26', NOW).filter((s) => s.lane === 'short');
  assert.deepEqual(slots.map((s) => s.at), [
    '2026-11-23T22:35:00.000Z', '2026-11-24T22:35:00.000Z', '2026-11-25T22:35:00.000Z', '2026-11-26T22:35:00.000Z',
  ]);
  assert.ok(slots.every((s) => s.channel === 'qq' && s.date === s.at.slice(0, 10)));
});

test('EARS: a slot earlier today that already passed is not free (missed, not upcoming)', () => {
  const s = { ...daily, shortSlots: ['08:00'], docDays: [] };
  const slots = expandSlots(s, '2026-11-23', '2026-11-23', NOW);
  assert.deepEqual(slots, []);
});

test('EARS: the long-video slot appears only on the channel doc days (UTC weekday names)', () => {
  const longs = expandSlots(daily, '2026-11-23', '2026-12-06', NOW).filter((s) => s.lane === 'long');
  assert.deepEqual(longs.map((s) => s.at), ['2026-11-24T14:30:00.000Z', '2026-12-01T14:30:00.000Z']);
});

test('EARS: WHEN shortDays is set THEN shorts only fall on those days; empty shortDays = every day (engine rule)', () => {
  const s = { ...daily, shortDays: ['Mon', 'Wed'], docDays: [] };
  const dates = expandSlots(s, '2026-11-23', '2026-11-29', NOW).map((x) => x.date);
  assert.deepEqual(dates, ['2026-11-23', '2026-11-25']);
});

test('EARS: a clips-lane channel posts one Short a day — only its first slot counts', () => {
  const s = { ...daily, shortSlots: ['22:35', '23:35'], shortsSource: 'clips', docDays: [] };
  assert.equal(expandSlots(s, '2026-11-24', '2026-11-24', NOW).length, 1);
  const gen = { ...s, shortsSource: 'generated' };
  assert.equal(expandSlots(gen, '2026-11-24', '2026-11-24', NOW).length, 2);
});

test('EARS: slots expand across a month boundary and a 31-day month without drift', () => {
  const s = { ...daily, docDays: [] };
  const slots = expandSlots(s, '2026-12-01', '2027-01-31', NOW);
  assert.equal(slots.length, 62);
  assert.equal(slots[30].at, '2026-12-31T22:35:00.000Z');
  assert.equal(slots[31].at, '2027-01-01T22:35:00.000Z');
});

test('EARS: a paused channel holds no free slot up to and including its pausedUntil day', () => {
  const s = { ...daily, docDays: [], pausedUntil: '2026-11-25' };
  assert.deepEqual(expandSlots(s, '2026-11-23', '2026-11-27', NOW).map((x) => x.date), ['2026-11-26', '2026-11-27']);
});

test('expandSlots: no slots configured / bad input → nothing invented', () => {
  assert.deepEqual(expandSlots({ slug: 'x', shortSlots: [], longSlot: null, docDays: ['Mon'] }, '2026-11-23', '2026-11-30', NOW), []);
  assert.deepEqual(expandSlots(null, '2026-11-23', '2026-11-30', NOW), []);
  assert.deepEqual(expandSlots(daily, 'nope', '2026-11-30', NOW), []);
});

/* ------------------------------- scheduleFor ------------------------------- */

test('scheduleFor: registry kit wins over brands.json; cadence days win; legacy docDay is the fallback', () => {
  const s = scheduleFor({
    slug: 'mr',
    staticEntry: { slots: ['00:05'], longSlot: '22:30', docDay: 'Thu' },
    reg: { slots: [], kit: { slots: ['21:20'], longSlot: '20:20' } },
    cadence: { shortDays: ['Mon'], shortsSource: 'clips' },
  });
  assert.deepEqual(s, { slug: 'mr', shortSlots: ['21:20'], longSlot: '20:20', shortDays: ['Mon'], docDays: ['Thu'], shortsSource: 'clips', pausedUntil: null, autopilotOff: false });
  const c = scheduleFor({ slug: 'mr', staticEntry: { docDay: 'Thu' }, reg: null, cadence: { docDays: ['Sun', 'Wed'] } });
  assert.deepEqual(c.docDays, ['Sun', 'Wed']);
  assert.equal(c.shortsSource, 'generated');
});

/* ------------------------------- mergeItems -------------------------------- */

test('EARS: WHEN a real item sits on a channel slot THEN that free slot is dropped (time match)', () => {
  const slots = expandSlots({ ...daily, docDays: [] }, '2026-11-24', '2026-11-25', NOW);
  const items = mergeItems({
    scheduled: [{ channel: 'qq', at: '2026-11-24T22:35:00Z', videoId: 'abcdefghijk', title: 'Stoic dawn', lane: 'short' }],
    slots,
  }, { now: NOW });
  assert.deepEqual(items.map((i) => [i.date, i.kind]), [['2026-11-24', 'scheduled'], ['2026-11-25', 'free']]);
  assert.equal(items[0].url, 'https://www.youtube.com/watch?v=abcdefghijk');
});

test('EARS: a waiting script with no publish time takes its own lane slot on its slot day', () => {
  const slots = expandSlots(daily, '2026-11-24', '2026-11-24', NOW);
  const items = mergeItems({
    waiting: [{ channel: 'qq', date: '2026-11-24', at: null, title: 'Why Rome fell', scriptId: 's-1', lane: 'long', stage: 'review' }],
    slots,
  }, { now: NOW });
  assert.deepEqual(items.map((i) => [i.kind, i.lane]), [['free', 'short'], ['waiting', 'long']]);
  const w = items.find((i) => i.kind === 'waiting');
  assert.equal(w.scriptId, 's-1');
  assert.equal(w.date, '2026-11-24');
});

test('EARS: another channel never occupies this channel slot', () => {
  const slots = expandSlots({ ...daily, docDays: [] }, '2026-11-24', '2026-11-24', NOW);
  const items = mergeItems({ scheduled: [{ channel: 'other', at: '2026-11-24T22:35:00Z', videoId: 'zzzzzzzzzzz', title: 'x' }], slots }, { now: NOW });
  assert.equal(items.filter((i) => i.kind === 'free').length, 1);
});

test('EARS: the same video from two sources shows once (dedupe by videoId; first source wins, gaps filled)', () => {
  const items = mergeItems({
    published: [
      { channel: 'qq', at: '2026-11-10T22:35:00Z', videoId: 'vid00000001', title: 'From state', lane: 'short' },
      { channel: 'qq', at: '2026-11-10T09:00:00Z', videoId: 'vid00000001', title: '', lane: 'short' },
      { channel: 'qq', at: '2026-11-11T09:00:00Z', videoId: 'vid00000002', title: '', lane: 'short' },
    ],
    scheduled: [{ channel: 'qq', at: '2026-11-11T22:35:00Z', videoId: 'vid00000002', title: 'From script' }],
  }, { now: NOW });
  assert.equal(items.length, 2);
  const a = items.find((i) => i.videoId === 'vid00000001');
  assert.equal(a.title, 'From state');
  assert.equal(a.at, '2026-11-10T22:35:00.000Z');
  const b = items.find((i) => i.videoId === 'vid00000002');
  assert.equal(b.title, 'From script', 'a title from a later source fills an empty one');
});

test('EARS: published vs scheduled comes from the clock, never the source label', () => {
  const items = mergeItems({
    published: [{ channel: 'qq', at: '2026-11-30T22:35:00Z', videoId: 'futurevideo', title: 'Later' }],
    scheduled: [{ channel: 'qq', at: '2026-11-01T22:35:00Z', videoId: 'pastvideo01', title: 'Earlier' }],
  }, { now: NOW });
  assert.equal(items.find((i) => i.videoId === 'futurevideo').kind, 'scheduled');
  assert.equal(items.find((i) => i.videoId === 'pastvideo01').kind, 'published');
});

test('EARS: waiting scripts dedupe by scriptId; items sort by time with undated rows last in their day', () => {
  const items = mergeItems({
    waiting: [
      { channel: 'qq', date: '2026-11-24', at: null, title: 'A', scriptId: 's1' },
      { channel: 'qq', date: '2026-11-24', at: null, title: 'A again', scriptId: 's1' },
      { channel: 'qq', date: '2026-11-24', at: '2026-11-24T05:00:00Z', title: 'B', scriptId: 's2' },
    ],
  }, { now: NOW });
  assert.deepEqual(items.map((i) => i.scriptId), ['s2', 's1']);
});

test('foldUntitled: a linked-but-untitled upload and a titled-but-unlinked one within the publish window are one video', () => {
  const rows = foldUntitled([
    // intent: uploaded at run time, link known, title not stored
    { channel: 'mr', at: '2026-11-10T10:00:00Z', videoId: 'linkonly001', title: '', lane: 'short', untitledUpload: true },
    { channel: 'mr', at: '2026-11-11T10:00:00Z', videoId: 'linkonly002', title: '', lane: 'short', untitledUpload: true },
    // title history: publish time + title, no link
    { channel: 'mr', at: '2026-11-11T00:05:00Z', videoId: null, title: 'Day one', lane: 'short' },
    { channel: 'mr', at: '2026-11-12T00:05:00Z', videoId: null, title: 'Day two', lane: 'short' },
  ]);
  assert.equal(rows.length, 2);
  const one = rows.find((r) => r.videoId === 'linkonly001');
  assert.equal(one.title, 'Day one');
  assert.equal(one.at, '2026-11-11T00:05:00Z', 'the publish time wins over the upload time');
  assert.equal(rows.find((r) => r.videoId === 'linkonly002').title, 'Day two', 'never folds backwards in time');
});

/* -------------------------------- monthGrid -------------------------------- */

test('monthGrid: Monday-start weeks covering the month — Nov 2026 spans 6 weeks from Oct 26', () => {
  const g = monthGrid(2026, 11);
  assert.equal(g.length, 6);
  assert.equal(g[0][0].date, '2026-10-26');
  assert.equal(g[0][0].inMonth, false);
  assert.equal(g[0][6].date, '2026-11-01');
  assert.equal(g[5][0].date, '2026-11-30');
  assert.equal(g[5][6].date, '2026-12-06');
  assert.ok(g.every((w) => w.length === 7));
});

test('monthGrid: a month that starts on Monday with 28 days is exactly 4 weeks (Feb 2027)', () => {
  const g = monthGrid(2027, 2);
  assert.equal(g.length, 4);
  assert.equal(g[0][0].date, '2027-02-01');
  assert.equal(g[3][6].date, '2027-02-28');
  assert.ok(g.flat().every((d) => d.inMonth));
});

test('monthGrid: leap February and year rollover', () => {
  const feb = monthGrid(2028, 2).flat().filter((d) => d.inMonth);
  assert.equal(feb.length, 29);
  const dec = monthGrid(2026, 12);
  assert.equal(dec.at(-1).at(-1).date, '2027-01-03');
});

/* ------------------------------ groupByDay etc ----------------------------- */

test('groupByDay: buckets by item date (or a supplied day function), each day sorted by time', () => {
  const items = [
    { date: '2026-11-24', at: '2026-11-24T22:00:00Z', kind: 'free' },
    { date: '2026-11-24', at: '2026-11-24T01:00:00Z', kind: 'published' },
    { date: '2026-11-25', at: null, kind: 'waiting' },
  ];
  const g = groupByDay(items);
  assert.deepEqual(Object.keys(g).sort(), ['2026-11-24', '2026-11-25']);
  assert.deepEqual(g['2026-11-24'].map((i) => i.kind), ['published', 'free']);
  const local = groupByDay(items, (it) => (it.at ? localDayOf(it.at, -300) : it.date));
  assert.deepEqual(local['2026-11-23'].map((i) => i.kind), ['published'], 'UTC 01:00 is the previous evening at UTC-5');
});

test('localDayOf / addDays / weekDays: plain date maths on YYYY-MM-DD', () => {
  assert.equal(localDayOf('2026-11-24T22:00:00Z', 300), '2026-11-25');
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.deepEqual(weekDays('2026-11-26'), ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']);
});

test('validateRange: real dates, from ≤ to, at most 62 days', () => {
  assert.deepEqual(validateRange('2026-11-01', '2026-12-31'), { ok: true, from: '2026-11-01', to: '2026-12-31' });
  assert.equal(validateRange('2026-11-01', '2027-01-02').ok, false, '63 days is too many');
  assert.equal(validateRange('2026-11-05', '2026-11-01').ok, false);
  assert.equal(validateRange('2026-02-30', '2026-03-01').ok, false, 'no such day');
  assert.equal(validateRange('2026-11-01', null).ok, false);
});

test('viewRange: what each view shows, fetched with one day of padding each side (time zones), always ≤ 62 days', () => {
  const m = viewRange('month', '2026-11-23');
  assert.equal(m.days[0], '2026-10-26');
  assert.equal(m.days.at(-1), '2026-12-06');
  assert.deepEqual([m.from, m.to], ['2026-10-25', '2026-12-07']);
  assert.equal(validateRange(m.from, m.to).ok, true);
  const w = viewRange('week', '2026-11-26');
  assert.deepEqual([w.days[0], w.days.at(-1), w.from, w.to], ['2026-11-23', '2026-11-29', '2026-11-22', '2026-11-30']);
  const l = viewRange('list', '2026-11-23');
  assert.equal(l.days.length, 14);
  assert.deepEqual([l.days.at(-1), l.from, l.to], ['2026-12-06', '2026-11-22', '2026-12-07']);
});

test('shiftAnchor: ‹ › move a month (to the 1st), a week, or the 14-day agenda', () => {
  assert.equal(shiftAnchor('month', '2026-01-31', 1), '2026-02-01');
  assert.equal(shiftAnchor('month', '2026-01-15', -1), '2025-12-01');
  assert.equal(shiftAnchor('week', '2026-11-23', 1), '2026-11-30');
  assert.equal(shiftAnchor('list', '2026-11-23', -1), '2026-11-09');
});

test('EARS: WHEN a registry channel has autopilot off THEN it holds no free slot (overview flowPaused rule)', () => {
  const reg = { slots: ['22:35'], kit: { longSlot: '14:30' }, docDay: 'Tue', autopilot: false };
  const off = scheduleFor({ slug: 'w', reg, cadence: null });
  assert.equal(off.autopilotOff, true);
  assert.deepEqual(expandSlots(off, '2026-11-23', '2026-11-30', NOW), []);
  const on = scheduleFor({ slug: 'w', reg: { ...reg, autopilot: true }, cadence: null });
  assert.equal(on.autopilotOff, false);
  assert.ok(expandSlots(on, '2026-11-23', '2026-11-30', NOW).length > 0);
  assert.equal(scheduleFor({ slug: 'legacy', staticEntry: { slots: ['22:35'] } }).autopilotOff, false, 'no registry row → not off');
});

test('EARS: every upload_intents kind maps to a lane — a longform upload never takes a Short slot', () => {
  assert.deepEqual(['short', 'doc', 'longform'].map(laneOf), ['short', 'long', 'long']);
  assert.equal(laneOf('long'), 'long');
  assert.equal(laneOf('other'), null);
  assert.equal(laneOf(undefined), null);
  const slots = expandSlots({ ...daily, docDays: [] }, '2026-11-24', '2026-11-24', NOW); // one short slot, no long slot
  const items = mergeItems({
    published: [{ channel: 'qq', at: '2026-11-24T12:00:00Z', videoId: 'longform001', title: 'Episode', lane: laneOf('longform') }],
    slots,
  }, { now: NOW });
  assert.deepEqual(items.map((i) => i.kind), ['scheduled', 'free'], 'the Short slot stays free');
});
