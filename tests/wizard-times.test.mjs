// docs/qa/wizard-upload-days-qa.md round 2 — exact times on the wizard's Schedule step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startFromCron, cronFromStart, formTimes, timesBody, timesMissed, leadMinutes, nextPublic, dateText, leadWarning } from '../studio/lib/wizard-times.mjs';
import { EMPTY_FORM, reviewSummary, draftSnapshot, parseDraft } from '../studio/lib/wizard-steps.mjs';

const read = (f) => fs.readFileSync(new URL(`../studio/${f}`, import.meta.url), 'utf8');
const page = read('app/channels/add/page.js');
const picker = read('components/wizard/SchedulePicker.js');

test('T1: the saved start and long time load; junk loads as unset', () => {
  assert.deepEqual(formTimes({ publish: { long: '17:00' }, gateCron: '0 5 * * *' }), { longSlot: '17:00', startAt: '05:00' });
  assert.deepEqual(formTimes({ publish: { long: null }, gateCron: '*/5 * * * *' }), { longSlot: '', startAt: '' });
  assert.equal(startFromCron('99 5 * * *'), '');
  assert.equal(cronFromStart('05:07'), '7 5 * * *');
  assert.equal(cronFromStart(''), '');
});

test('T4: only changed, filled times are sent; an unread schedule sends nothing', () => {
  const saved = { longSlot: '', startAt: '15:00' };
  assert.deepEqual(timesBody(saved, { longSlot: '17:07', startAt: '05:00' }), { longSlot: '17:07', gateCron: '0 5 * * *' });
  assert.deepEqual(timesBody(saved, { longSlot: '', startAt: '15:00' }), {});
  assert.deepEqual(timesBody(null, { longSlot: '17:00', startAt: '05:00' }), {});
});

test('T5: a sent time the server did not store is named', () => {
  const sent = { longSlot: '17:00', gateCron: '0 5 * * *' };
  assert.equal(timesMissed(sent, { publishSaved: { longSlot: '17:00' }, gateCron: '0 5 * * *' }), '');
  assert.match(timesMissed(sent, { gateCron: '0 15 * * *' }), /long-video time and the autopilot start time did not save/);
});

test('T3: the next public date, rolled a day when the time is before the start', () => {
  const now = new Date('2026-11-25T03:00:00Z'); // Wednesday
  assert.equal(nextPublic('Thu', '17:00', '05:00', now).toISOString(), '2026-11-26T17:00:00.000Z');
  assert.equal(nextPublic('Wed, Fri', '16:35', '05:00', now).toISOString(), '2026-11-25T16:35:00.000Z');
  assert.equal(nextPublic('Thu', '14:00', '15:00', now).toISOString(), '2026-11-27T14:00:00.000Z', 'goes public the day after the run');
  assert.equal(nextPublic('Tue', '02:00', '15:00', new Date('2026-11-25T01:00:00Z')).toISOString(), '2026-11-25T02:00:00.000Z', "yesterday's run is still ahead");
  assert.equal(nextPublic('', '17:00', '05:00', now), null);
  assert.equal(nextPublic('Thu', '', '05:00', now), null);
  assert.equal(dateText(new Date('2026-11-26T17:07:00Z'), 300), 'Thu 26 Nov, 10:07 pm');
  assert.equal(dateText(new Date('2026-11-26T19:30:00Z'), 300), 'Fri 27 Nov, 12:30 am');
  assert.equal(dateText(null), '');
});

test('T6: a start under 3 hours before a video goes public warns', () => {
  assert.equal(leadMinutes('05:00', '17:00'), 720);
  assert.equal(leadMinutes('23:00', '01:00'), 120);
  assert.equal(leadWarning('05:00', ['16:35', '17:00']), '');
  assert.match(leadWarning('15:00', ['16:35', '17:00']), /about 1 hour between/);
  assert.match(leadWarning('16:00', ['16:35']), /about 35 minutes/);
  assert.equal(leadWarning('', ['17:00']), '');
});

test('T2: every time is typeable, and clearing the Short box never wipes it', () => {
  for (const id of ['wizard-short-time', 'wizard-long-time', 'wizard-start-time']) assert.match(picker, new RegExp(`id="${id}"`));
  assert.match(picker, /const typeShort = \(utc\) => \{\s*if \(!utc\) return;/);
});

test('save: times travel with the days, before the profile, and a miss stops it', () => {
  const save = page.slice(page.indexOf('const saveProfile'), page.indexOf('const ctx ='));
  assert.match(save, /JSON\.stringify\(\{ \.\.\.body, \.\.\.sentTimes \}\)/);
  assert.ok(save.indexOf('if (missed) throw') < save.indexOf("fetch('/api/channels/profile'"));
});

test('review names the times and the draft keeps them', () => {
  const form = { ...EMPTY_FORM, docDays: 'Thu', longSlot: '17:00', startAt: '05:00' };
  const rows = Object.fromEntries(reviewSummary(form, { offsetMin: 300 }).find((s) => s.step === 'schedule').rows);
  assert.equal(rows['Long video time'], '10:00 pm your time (17:00 UTC)');
  assert.equal(rows['Autopilot start'], '10:00 am your time (05:00 UTC)');
  assert.equal(parseDraft(JSON.stringify(draftSnapshot(form))).form.longSlot, '17:00');
});

test('T2: a typed time reads the way people write it; anything unclear is refused', async () => {
  const { parseClock } = await import('../studio/lib/wizard-times.mjs');
  const ok = { '10:07 pm': '22:07', '10pm': '22:00', '1007PM': '22:07', '10.07 p.m.': '22:07', '22:07': '22:07', '9:35': '09:35', '12 am': '00:00', '12:30pm': '12:30', ' 7:05 AM ': '07:05', '2207': '22:07' };
  for (const [t, want] of Object.entries(ok)) assert.equal(parseClock(t), want, t);
  for (const t of ['', '10', '25:00', '13 pm', '0 am', '10:75 pm', 'ten', '10:07 xm', '10m', null]) assert.equal(parseClock(t), null, String(t));
});

test('T2: the time box is plain text, read on Enter or leaving it, and never commits unreadable text', () => {
  const src = read('components/PublishTimeInput.js');
  assert.match(src, /type="text"/);
  assert.match(src, /onBlur=\{commit\}/);
  assert.match(src, /if \(text && !at\) \{\s*setBad\(true\);\s*return;/);
});
