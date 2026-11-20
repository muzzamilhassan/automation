// The brain-reply check shared by the doc lane (yt-deepdive.mjs) and the dry run.
// Bug 2026-11-20: the doc lane accepted only { nodes, lines }, so every paper
// (Lecture Notes) reply { beats } was rejected → silent storybook fallback.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isDiagramPlanReply } from '../lib/diagram-episode.mjs';

test('node-planner replies (tile/glow) pass', () => {
  assert.equal(isDiagramPlanReply({ nodes: [], lines: [] }), true);
});

test('paper-planner replies { beats } pass', () => {
  assert.equal(isDiagramPlanReply({ beats: [{ title: 'A *b*', from: 1, to: 2 }] }), true);
});

test('junk is rejected', () => {
  for (const p of [null, undefined, 'x', 3, {}, { nodes: [] }, { lines: [] }, { beats: 'no' }]) {
    assert.equal(isDiagramPlanReply(p), false, JSON.stringify(p));
  }
});

test('the doc lane and the dry run both use the shared check (no inline nodes-only check left)', () => {
  for (const f of ['yt-deepdive.mjs', 'longvideo/diagram-episode-dryrun.mjs']) {
    const src = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.match(src, /isValidJson: isDiagramPlanReply/, f);
    assert.doesNotMatch(src, /isValidJson: \(p\) => [^\n]*p\.nodes/, f);
  }
});
