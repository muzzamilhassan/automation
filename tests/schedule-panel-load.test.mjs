// Admin-panel review 2026-11-15 (panel bug #3): if the schedule GET failed
// (network error OR an HTTP error body), SchedulePanel fell back to an EMPTY
// schedule and Save then overwrote the channel's real days in cadence.json.
// Now a failed load is remembered, shown, and Save is disabled until a
// successful (re)load. Spec + QA: docs/qa/schedule-panel-load-qa.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('studio/components/SchedulePanel.js', 'utf8');

test('the load checks r.ok and records a load error instead of faking an empty schedule', () => {
  assert.match(src, /if \(!r\.ok\) throw new Error/);
  assert.match(src, /setLoadError\(/);
  assert.doesNotMatch(src, /\.catch\(\(\) => setSchedule\(\{ docDays: \[\], shortDays: \[\]/, 'no silent empty fallback on error');
});

test('save refuses while the schedule failed to load; the button is disabled', () => {
  assert.match(src, /if \(loadError \|\| !schedule\) return;/);
  assert.match(src, /isDisabled=\{saving \|\| Boolean\(loadError\) \|\| !schedule \|\| proj\.blocked \|\| !cronState\.valid \|\| !dirty\}/);
});

test('the error is shown with a retry', () => {
  assert.match(src, /Couldn(?:'|&apos;)t load this channel(?:'|&apos;)s schedule/);
  assert.match(src, /onClick=\{retry\}/);
});
