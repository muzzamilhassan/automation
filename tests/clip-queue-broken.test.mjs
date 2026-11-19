// Admin-panel review 2026-11-15 (panel bug #4): "Clear broken queue" set
// clips: [] — deleting EVERY clip, unconfirmed. And "broken" meant "no url",
// but Release-archived clips (asset + the queue's lastRunId) have no url and
// post-next fetches them via its release fallback — so valid queued clips
// (investors-compass, 2026-11-15) were labelled broken. classifyClip is the one
// rule; clear removes only truly broken clips. Spec + QA: docs/qa/clip-queue-broken-qa.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classifyClip, summarizeClips, withoutBrokenClips } from '../studio/lib/clip-queue.mjs';

const q = { lastRunId: 'local-1794755374545', clips: [
  { part: 1, asset: 'clip-01.mp4', postedAt: '2026-11-15T15:15:30Z' },
  { part: 2, asset: 'clip-02.mp4' },
  { part: 3, url: 'https://api.github.com/repos/x/releases/assets/1' },
  { part: 4, file: '/home/runner/gone.mp4' },
  { part: 5 },
] };

test('classifyClip: posted / ready (url, or asset + lastRunId release fallback) / broken', () => {
  assert.deepEqual(q.clips.map((c) => classifyClip(c, q)), ['posted', 'ready', 'ready', 'broken', 'broken']);
  assert.equal(classifyClip({ part: 9, asset: 'clip-09.mp4' }, { clips: [] }), 'broken', 'asset without a run id cannot be looked up');
  assert.equal(classifyClip({ part: 9, file: 'x.mp4' }, q, { fileExists: () => true }), 'ready', 'a local file that exists is ready (local mode)');
});

test('summarizeClips counts remaining vs broken the same way post-next sees them', () => {
  assert.deepEqual(summarizeClips(q), { total: 5, remaining: 2, broken: 2 });
});

test('withoutBrokenClips keeps posted and ready clips, drops only broken ones', () => {
  assert.deepEqual(withoutBrokenClips(q).map((c) => c.part), [1, 2, 3]);
});

test('wiring: overview + clip-queue route use the shared rule; clear keeps good clips; the button confirms', () => {
  const ov = fs.readFileSync('studio/app/api/overview/route.js', 'utf8');
  assert.match(ov, /summarizeClips\(q\)/);
  const route = fs.readFileSync('studio/app/api/channels/clip-queue/route.js', 'utf8');
  assert.match(route, /withoutBrokenClips\(/);
  assert.doesNotMatch(route, /clips: \[\] \}/, 'never wipe the whole queue');
  const page = fs.readFileSync('studio/app/production/page.js', 'utf8');
  assert.match(page, /window\.confirm\(|await confirm\(/);
});
