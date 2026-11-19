// 2026-11-19 owner report: "I paused Quote Quarry; when I want to turn it on
// it doesn't turn on". Root cause: the DB derives `active` from token columns
// the legacy channels never carry (their keys are GitHub secrets), so in
// production they read as INACTIVE → their state files were skipped → the
// pause was invisible → no Resume button (and /api/action said 'unknown
// channel', the wizard said 'secret missing'). overlayRepoFlags fixes it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { overlayRepoFlags } from '../studio/lib/channels-registry.js';

const db = (slug, extra = {}) => ({ slug, status: '', active: false, tokenSecretSaved: false, tokenSecret: '', ...extra });

test('legacy channels: repo active + tokenSecretSaved win over token-less DB rows', () => {
  const out = overlayRepoFlags(
    [db('quotequarry'), db('yt-bot', { active: true, tokenSecretSaved: true, tokenSecret: 'YT_TOKEN_YT_BOT' })],
    [{ slug: 'quotequarry', active: true, tokenSecretSaved: true }, { slug: 'yt-bot', active: true }],
  );
  assert.equal(out[0].active, true, 'quotequarry is active (was false from the DB alone)');
  assert.equal(out[0].tokenSecretSaved, true, 'no false "secret missing"');
  assert.equal(out[1].tokenSecret, 'YT_TOKEN_YT_BOT', 'a real DB value is kept');
});

test('a DB park/pause still wins; repo active:false stays inactive; unknown slugs untouched', () => {
  const out = overlayRepoFlags(
    [db('a', { status: 'parked' }), db('b'), db('c', { active: true })],
    [{ slug: 'a', active: true }, { slug: 'b', active: false }],
  );
  assert.equal(out[0].active, false, 'parked in DB → inactive even if repo says active');
  assert.equal(out[1].active, false, 'repo says inactive → inactive');
  assert.equal(out[2].active, true, 'not in repo → DB value kept');
});

test('readRegistry applies the overlay on the DB path', () => {
  const src = fs.readFileSync('studio/lib/channels-registry.js', 'utf8');
  assert.match(src, /overlayRepoFlags\(rows\.map\(rowToEntry\), await repoChannelsForOverlay\(\)\)/);
});

test('feedback r1 F: start times survive the DB read — fresh kit.gateCron first, else the repo cron', () => {
  const out = overlayRepoFlags(
    [db('a'), db('b', { kit: { gateCron: '5 4 * * *' } }), db('c')],
    [{ slug: 'a', cron: '13 2 * * *' }, { slug: 'b', cron: '13 2 * * *' }, { slug: 'c' }],
  );
  assert.equal(out[0].cron, '13 2 * * *', 'legacy channel: repo cron (what the engine runs on)');
  assert.equal(out[1].cron, '5 4 * * *', 'a just-saved DB gate time beats the 60s-memo repo copy');
  assert.equal('cron' in out[2], false, 'no cron anywhere → no invented time');
});
