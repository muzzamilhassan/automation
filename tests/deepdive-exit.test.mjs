// Audit 2026-11-13 improvement #6 (pipeline-01). yt-deepdive's last line was
// `await renderAndShipEpisode(...)` with no exit, and studio/lib/db.mjs's
// shared postgres pool had no idle_timeout — one query keeps Node alive
// forever (reproduced: `select 1` then a 45s timeout kill). Run 43342205832
// uploaded at 01:32, idled to the 45-minute pipeline kill and was recorded
// "Episode failed". Spec + QA: docs/qa/deepdive-exit-qa.md.
//
// yt-deepdive.mjs runs its pipeline at import (top-level side effects), so
// its tail is pinned by source scan (house pattern); db.mjs is imported for
// real (postgres.js is lazy — importing opens no connection).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { closeDb } from '../studio/lib/db.mjs';
import { shipExitCode } from '../lib/ship-exit.mjs';

test('R1: the shared pool releases idle connections (backstop for any script that forgets to close)', () => {
  const src = fs.readFileSync('studio/lib/db.mjs', 'utf8');
  assert.match(src, /postgres\(url, \{[^}]*idle_timeout: \d+/);
});

test('R2: closeDb never throws and is safe to call twice', async () => {
  await assert.doesNotReject(closeDb());
  await assert.doesNotReject(closeDb());
});

test('R3: shipExitCode maps every renderAndShipEpisode outcome', () => {
  assert.equal(shipExitCode({ ok: true, videoId: 'x' }), 0);
  assert.equal(shipExitCode({ claimed: true, videoId: 'x' }), 0);
  assert.equal(shipExitCode({ skipped: 'dup' }), 0);
  assert.equal(shipExitCode({ skipped: 'intent' }), 0);
  assert.equal(shipExitCode(undefined), 1);
  assert.equal(shipExitCode({}), 1);
  assert.equal(shipExitCode({ ok: false }), 1);
});

test('R4: yt-deepdive closes the pool and exits explicitly after shipping', () => {
  const src = fs.readFileSync('yt-deepdive.mjs', 'utf8').trimEnd();
  const tail = src.slice(src.lastIndexOf('renderAndShipEpisode(script'));
  assert.match(tail, /^renderAndShipEpisode\(script[^\n]*\n/, 'the ship call is the last statement block');
  const assign = src.lastIndexOf('const shipped = await renderAndShipEpisode(script');
  assert.ok(assign > 0, 'the ship result is captured');
  const close = src.indexOf('await closeDb()', assign);
  const exit = src.indexOf('process.exit(shipExitCode(shipped))', assign);
  assert.ok(close > assign && exit > close, 'closeDb, then process.exit(shipExitCode(shipped))');
});
