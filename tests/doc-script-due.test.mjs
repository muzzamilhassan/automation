// docs/qa/doc-script-cadence-qa.md — one documentary script per due long video.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { docScriptDue, notDueText } from '../lib/doc-script-due.mjs';

const WED = new Date('2026-11-25T05:00:00Z');
const THU = new Date('2026-11-26T05:00:00Z');
const FRI = new Date('2026-11-27T05:00:00Z');
const kit = { docDays: ['Thu'] };
const script = (created_at, kind = 'doc') => ({ kind, created_at });

test('a script is written on the long-video day, not on other days', () => {
  assert.deepEqual(docScriptDue({ kit, lastDocDate: '2026-11-19', now: WED }), { due: false, reason: 'not_due' });
  assert.deepEqual(docScriptDue({ kit, lastDocDate: '2026-11-19', now: THU }), { due: true, reason: 'due' });
});

test('the real case: Thu/Sun channel whose last video was Tuesday writes nothing on Wednesday', () => {
  const mr = { docDays: ['Thu', 'Sun'] };
  assert.equal(docScriptDue({ kit: mr, lastDocDate: '2026-11-24', now: WED }).due, false);
  assert.equal(docScriptDue({ kit: mr, lastDocDate: '2026-11-24', now: THU }).due, true);
});

test('a missed day is made up on the next run', () => {
  assert.equal(docScriptDue({ kit, lastDocDate: '2026-11-19', now: FRI }).due, true);
});

test('a script already waiting stops a second one; a Short, or one over a week old, does not', () => {
  assert.equal(docScriptDue({ kit, lastDocDate: '2026-11-19', pending: [script('2026-11-26T05:01:00Z')], now: FRI }).reason, 'already_waiting');
  assert.equal(docScriptDue({ kit, lastDocDate: '2026-11-19', pending: [script('2026-11-26T05:01:00Z', 'short')], now: FRI }).due, true);
  assert.equal(docScriptDue({ kit, lastDocDate: '2026-11-12', pending: [script('2026-11-12T05:00:00Z')], now: THU }).due, true);
});

test('a new channel starts on its own day, whatever day it was switched on', () => {
  assert.equal(docScriptDue({ kit, lastDocDate: null, now: WED }).due, false);
  assert.equal(docScriptDue({ kit, lastDocDate: null, now: THU }).due, true);
});

test('an owner order always writes; no days set writes nothing', () => {
  assert.equal(docScriptDue({ kit, lastDocDate: '2026-11-24', ordered: true, pending: [script('2026-11-25T01:00:00Z')], now: WED }).due, true);
  assert.equal(docScriptDue({ kit: {}, now: THU }).reason, 'no_doc_days');
  assert.match(notDueText('not_due', kit), /long-video days: Thu/);
});

test('the pipeline asks before writing a doc script', () => {
  const src = fs.readFileSync(new URL('../channel-pipeline.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const ask = src.indexOf('docScriptDue({');
  assert.ok(ask > 0 && ask < src.indexOf("no approved doc script — generate-only run on the DOC lane"));
});
