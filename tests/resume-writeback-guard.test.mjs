// 2026-11-21: a redispatched OLD approved doc must retire only ITSELF — the
// generic same-slot write-back is skipped on the resumed path (it consumed
// today's approved script, which then never rendered).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('yt-deepdive.mjs', 'utf8');

test('shipEpisode skips the generic writeBackVideoId when a reviewed script is being shipped', () => {
  assert.match(src, /if \(!reviewScript\?\.id\) try \{\s*const seams = await import\('\.\/lib\/review-seams\.mjs'\);[\s\S]{0,200}seams\.writeBackVideoId\(/);
});

test('the resumed path still retires the shipped script by id', () => {
  assert.match(src, /await store\.markConsumed\(found\.script\.id, ship\.videoId\)/);
});
