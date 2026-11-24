// docs/qa/wizard-upload-days-qa.md — the wizard edits the channel's saved upload days.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dayList, daysText, toggleDay, formDays, daysDirty, daysBody, weekdayFor, daysIssue, daysSentence } from '../studio/lib/wizard-days.mjs';
import { EMPTY_FORM, stepIssues, reviewSummary, draftSnapshot, parseDraft } from '../studio/lib/wizard-steps.mjs';

const page = fs.readFileSync(new URL('../studio/app/channels/add/page.js', import.meta.url), 'utf8');
const YT = { docDays: ['Sat'], shortDays: ['Mon', 'Tue', 'Wed', 'Thu'], shortsSource: 'clips' };

test('lists keep week order and drop unknown names; toggle adds and removes', () => {
  assert.deepEqual(dayList('Fri, Wed, Nope'), ['Wed', 'Fri']);
  assert.equal(toggleDay('Wed', 'Fri'), 'Wed, Fri');
  assert.equal(toggleDay('Wed, Fri', 'Wed'), 'Fri');
});

test('D1/D2: saved days fill the form; none saved → the weekly day, no Shorts days', () => {
  assert.deepEqual(formDays(YT, 'Tue'), { docDays: 'Sat', shortDays: 'Mon, Tue, Wed, Thu' });
  assert.deepEqual(formDays({ docDays: [], shortDays: ['Mon'] }, 'Tue'), { docDays: '', shortDays: 'Mon' });
  assert.deepEqual(formDays({}, 'Tue'), { docDays: 'Tue', shortDays: '' });
});

test('D6/D7: only changed days are sent and the Shorts source is kept', () => {
  assert.equal(daysDirty(YT, { docDays: 'Sat', shortDays: 'Thu, Mon, Tue, Wed' }), false, 'order is not a change');
  assert.equal(daysDirty(YT, { docDays: 'Tue', shortDays: 'Wed, Fri' }), true);
  assert.equal(daysDirty(null, { docDays: 'Tue' }), false, 'an unread schedule is never dirty');
  assert.deepEqual(daysBody('yt-bot', YT, { docDays: 'Tue', shortDays: 'Wed, Fri' }), { slug: 'yt-bot', docDays: ['Tue'], shortDays: ['Wed', 'Fri'], shortsSource: 'clips' });
});

test('the legacy weekday follows the picked days and stays Mon–Fri', () => {
  assert.equal(weekdayFor('Sat, Tue', 'Wed'), 'Tue');
  assert.equal(weekdayFor('Tue, Wed', 'Wed'), 'Wed');
  assert.equal(weekdayFor('Sat, Sun', 'Tue'), 'Tue');
});

test('D8: no day at all blocks the step, but only once the schedule has loaded', () => {
  const form = { ...EMPTY_FORM, slots: '16:35' };
  assert.deepEqual(stepIssues('schedule', { form, daysReady: false }), []);
  assert.deepEqual(stepIssues('schedule', { form, daysReady: true }), ['Pick at least one upload day.']);
  assert.deepEqual(stepIssues('schedule', { form: { ...form, shortDays: 'Wed' }, daysReady: true }), []);
  assert.equal(daysIssue({ docDays: 'Tue' }), '');
});

test('D9/D10: days survive the draft; review and the saved message name them', () => {
  const form = { ...EMPTY_FORM, docDays: 'Tue', shortDays: 'Wed, Fri' };
  const d = parseDraft(JSON.stringify(draftSnapshot(form)));
  assert.equal(d.form.shortDays, 'Wed, Fri');
  const rows = reviewSummary(form).find((s) => s.step === 'schedule').rows;
  assert.deepEqual(rows.slice(-2), [['Long video days', 'Tue'], ['Shorts days', 'Wed, Fri']]);
  assert.equal(daysSentence(form), 'shorts on Wed, Fri and a long video on Tue');
  assert.equal(daysText(''), '');
});

test('D3/D4/D5: days POST comes before the profile POST, stops on error, and needs a read schedule', () => {
  const save = page.slice(page.indexOf('const saveProfile'), page.indexOf('const ctx ='));
  const days = save.indexOf("fetch('/api/channels/schedule'");
  assert.ok(days > 0 && days < save.indexOf("fetch('/api/channels/profile'"));
  assert.match(save, /sched\.status === 'ready' && daysDirty\(sched\.saved, form\)/);
  assert.match(save, /if \(!rs\.ok\) throw new Error/);
  assert.match(page, /\.catch\(\(\) => setSched\(\{ status: 'error', saved: null \}\)\)/);
});
