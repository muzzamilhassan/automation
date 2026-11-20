// J2 (2026-11-20): every uploaded Short keeps its YouTube id in titleHistory
// (v), so the Library can link all of them — not only the newest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rowsFromState } from '../studio/lib/library-view.mjs';

test('all four titleHistory writers record the videoId as v', () => {
  const daily = fs.readFileSync('yt-daily.mjs', 'utf8');
  const clips = fs.readFileSync('longvideo/shorts-clips.mjs', 'utf8');
  assert.match(daily, /\{ t: meta\.title, at: publishAt, v: videoId \|\| undefined \}/);
  assert.match(daily, /\(\{ t: r\.title, at: r\.publishAt, v: r\.videoId \}\)/);
  assert.match(clips, /\{ t: clip\.title, at: publishAt, v: videoId \|\| undefined \}/);
  assert.match(clips, /at: rp, v: o\.videoId \|\| undefined \}/);
});

test('the Library links titleHistory rows that carry v; old rows stay unlinked', () => {
  const rows = rowsFromState({ qq: { titleHistory: [{ t: 'New one', at: '2026-11-20T22:35:00Z', v: 'abcDEF12345' }, { t: 'Old one', at: '2026-10-01T22:35:00Z' }] } });
  assert.equal(rows.find((r) => r.title === 'New one').videoId, 'abcDEF12345');
  assert.equal(rows.find((r) => r.title === 'Old one').videoId, null);
});
