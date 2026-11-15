import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDocDay, docDaysOf, isDocDue, mostRecentDocDay } from '../lib/doc-days.mjs';

test('docDaysOf: docDays array wins, docDay single falls back, neither means no docs', () => {
  assert.deepEqual(docDaysOf({ docDays: ['Tue', 'Fri'], docDay: 'Tue' }), ['Tue', 'Fri']);
  assert.deepEqual(docDaysOf({ docDay: 'Tue' }), ['Tue']);
  assert.deepEqual(docDaysOf({}), []);
  assert.deepEqual(docDaysOf({ docDays: [] }), []);
});

test('isDocDay matches UTC weekday names against the kit', () => {
  const tue = new Date('2026-10-20T12:00:00Z'); // a Tuesday
  const wed = new Date('2026-10-21T12:00:00Z');
  assert.equal(isDocDay({ docDays: ['Tue', 'Fri'] }, tue), true);
  assert.equal(isDocDay({ docDays: ['Tue', 'Fri'] }, wed), false);
  assert.equal(isDocDay({ docDay: 'Tue' }, tue), true, 'legacy single docDay keeps working');
  assert.equal(isDocDay({ docDay: 'Tue' }, wed), false);
  assert.equal(isDocDay({}, tue), false, 'no doc day configured = docs never scheduled here');
});

// Audit 2026-11-13 #10 (catch-up half). GitHub cron drops most ticks and the
// sweeper's heals land on the wrong UTC day, so investors-compass (doc days
// Wed/Sun) ran Thu/Fri/Sat only — the strict "today is a doc day" guard
// skipped every doc since 10-28, the clip queue ran dry, no Shorts for 18 days.
// isDocDue: a doc is due when the most recent doc day (on or before today,
// UTC) is after the last produced doc. Catches up ONCE, never a backlog.
// Spec + QA: docs/qa/doc-catch-up-qa.md.
const day = (iso) => new Date(`${iso}T12:00:00Z`);
const IC = { docDays: ['Wed', 'Sun'] };

test('mostRecentDocDay: latest doc-day date on or before today (UTC)', () => {
  assert.equal(mostRecentDocDay(IC, day('2026-11-15')), '2026-11-15', 'Sunday itself');
  assert.equal(mostRecentDocDay(IC, day('2026-11-16')), '2026-11-15', 'Monday -> last Sunday');
  assert.equal(mostRecentDocDay(IC, day('2026-11-14')), '2026-11-11', 'Saturday -> last Wednesday');
  assert.equal(mostRecentDocDay({}, day('2026-11-14')), null, 'no doc days configured');
});

test('isDocDue: on a doc day with no doc yet -> due (same as before)', () => {
  assert.equal(isDocDue(IC, '2026-11-11', day('2026-11-15')), true);
});

test('isDocDue: the day AFTER a missed doc day -> due (the catch-up)', () => {
  assert.equal(isDocDue(IC, '2026-11-11', day('2026-11-16')), true, 'Sunday missed -> Monday produces it');
  assert.equal(isDocDue(IC, '2026-10-28', day('2026-11-14')), true, 'investors-compass today: weeks behind -> due');
});

test('isDocDue: already produced for the latest doc day -> not due (no backlog, no double)', () => {
  assert.equal(isDocDue(IC, '2026-11-15', day('2026-11-15')), false, 'produced today');
  assert.equal(isDocDue(IC, '2026-11-15', day('2026-11-17')), false, 'produced Sunday -> Tue not due');
  assert.equal(isDocDue(IC, '2026-11-16', day('2026-11-17')), false, 'caught up Monday -> Tue not due');
  assert.equal(isDocDue(IC, '2026-11-16', day('2026-11-18')), true, 'next real doc day (Wed) -> due again');
});

test('isDocDue: never-produced channel is due on/after a doc day; no doc days -> never', () => {
  assert.equal(isDocDue(IC, null, day('2026-11-14')), true);
  assert.equal(isDocDue({}, null, day('2026-11-14')), false);
});

test('wiring: yt-deepdive guards on isDocDue with the channel\'s last doc date', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync('yt-deepdive.mjs', 'utf8');
  assert.match(src, /if \(!isDocDue\(b, state\[slug\]\?\.deepdiveDate\) && !FORCE && !GENERATE_ONLY\)/);
  assert.doesNotMatch(src, /if \(!isDocDay\(b\) && !FORCE/, 'the strict today-only guard is gone');
});
