// Live-test fixes (2026-11-20): two paths that could rewrite the ENGINE's
// registry from a bad read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const reg = fs.readFileSync('studio/lib/channels-registry.js', 'utf8');
const sched = fs.readFileSync('studio/app/api/channels/schedule/route.js', 'utf8');

test('a registry 404 from GitHub throws — never an empty registry a sync could write back', () => {
  assert.match(reg, /res\.status === 404\) throw new Error\(/);
  assert.ok(!/res\.status === 404\) return \{ channels: \[\] \}/.test(reg), 'the old empty-registry return is gone');
});

test('schedule save never auto-derives a gate cron while the repo overlay is degraded', () => {
  assert.match(sched, /!oldCron && !reg\.overlayDegraded && entry\?\.slots\?\.length/);
});
