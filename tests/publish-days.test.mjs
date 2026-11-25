// docs/qa/publish-days-qa.md — videos go public only on the days set in the panel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { nextSlotOnDays, nextFutureSlotOnDays, isPublishDay, lastLongDate } from '../lib/publish-days.mjs';
import { docScriptDue } from '../lib/doc-script-due.mjs';

const WED = new Date('2026-11-25T10:00:00Z');
const src = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('approved on another day → goes public on the next chosen day, not tonight', () => {
  assert.equal(nextSlotOnDays('17:00', ['Thu'], WED), '2026-11-26T17:00:00Z');
  assert.equal(nextSlotOnDays('22:30', ['Thu', 'Sun'], new Date('2026-11-27T01:00:00Z')), '2026-11-29T22:30:00Z');
});

test('the chosen day itself counts until 35 minutes before the time, then the next one', () => {
  assert.equal(nextSlotOnDays('17:00', ['Thu'], new Date('2026-11-26T16:20:00Z')), '2026-11-26T17:00:00Z');
  assert.equal(nextSlotOnDays('17:00', ['Thu'], new Date('2026-11-26T16:30:00Z')), '2026-12-03T17:00:00Z');
});

test('a Short whose time has passed waits for the next Shorts day', () => {
  assert.equal(nextSlotOnDays('16:35', ['Fri', 'Sat'], new Date('2026-11-28T17:00:00Z')), '2026-12-04T16:35:00Z');
  assert.equal(nextFutureSlotOnDays(['16:35', '20:00'], ['Sat'], new Date('2026-11-28T17:00:00Z')), '2026-11-28T20:00:00Z');
  assert.equal(nextFutureSlotOnDays([], ['Sat'], WED), null);
});

test('no days set keeps the old rule', () => {
  assert.equal(nextSlotOnDays('17:00', [], WED), '2026-11-25T17:00:00Z');
  assert.equal(nextSlotOnDays('09:00', undefined, WED), '2026-11-26T09:00:00Z');
  assert.equal(isPublishDay([], WED), true);
  assert.equal(isPublishDay(['Thu'], WED), false);
});

test('a video already scheduled for the next long-video day covers that day', () => {
  const state = { deepdiveDate: '2026-11-27', deepdiveVideo: { publishAt: '2026-12-03T17:00:00Z' } };
  assert.equal(lastLongDate(state), '2026-12-03');
  assert.equal(docScriptDue({ kit: { docDays: ['Thu'] }, lastDocDate: lastLongDate(state), now: new Date('2026-12-03T05:00:00Z') }).due, false);
  assert.equal(docScriptDue({ kit: { docDays: ['Thu'] }, lastDocDate: lastLongDate(state), now: new Date('2026-12-10T05:00:00Z') }).due, true);
  assert.equal(lastLongDate({}), null);
});

test('every lane uses the rule', () => {
  const deep = src('yt-deepdive.mjs');
  assert.equal((deep.match(/nextSlotOnDays\(b\.longSlot, docDaysOf\(b\)/g) || []).length, 3, 'fresh, resumed and saved-for-review');
  assert.doesNotMatch(deep, /nextFutureSlotISO\(\[b\.longSlot\]/);
  assert.match(deep, /isDocDue\(b, lastLongDate\(state\[slug\]\)\)/);
  assert.match(src('longvideo/shorts-clips.mjs'), /nextSlotOnDays\(\(b\.slots && b\.slots\[0\]\) \|\| '22:35', b\.shortDays\)/);
  const daily = src('yt-daily.mjs');
  assert.match(daily, /const publishAt = nextSlotOnDays\(b\.slots\[i\], b\.shortDays\);/);
  assert.match(daily, /nextFutureSlotOnDays\(b\.slots, b\.shortDays/);
  assert.match(daily, /!isPublishDay\(b\.shortDays\)/);
  assert.match(src('channel-pipeline.mjs'), /lastDocDate: lastLongDate\(/);
});
