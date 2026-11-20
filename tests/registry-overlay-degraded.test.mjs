// Live fix wave A2 — T4-01 / P1 (2026-11-20 live test): Studio intermittently
// read all 4 real channels as inactive, no key, no start time. Cause: the
// 60s overlay memo returned [] whenever the repo-file read failed (GitHub 403
// / timeout), so overlayRepoFlags had nothing to lay over the token-less Neon
// rows. Fix: serve the last good copy (stale is fine), retry with a short
// backoff, fall back to the Neon feed mirror on a cold start, and say
// "degraded" out loud when nothing is known. A degraded read must never reach
// the engine file (yt-mcp/studio-channels.json).
// Spec + QA: docs/qa/live-fix-wave-a2-qa.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createOverlayMemo,
  overlayRepoFlags,
  mergeRegistrySync,
  feedMirrorChannels,
  activeRegistryChannels,
} from '../studio/lib/channels-registry.js';

const REPO = [
  { slug: 'quotequarry', active: true, tokenSecretSaved: true, cron: '13 2 * * *', kit: { slots: ['22:35'] } },
  { slug: 'money-rulebook', active: true, tokenSecretSaved: true, cron: '21 3 * * *', kit: { slots: ['00:05'] } },
];

// a controllable clock + reader
function rig({ ttlMs = 60_000, backoffMs = 15_000 } = {}) {
  let t = 1_000_000;
  const calls = { n: 0 };
  const warnings = [];
  let next = () => ({ channels: REPO });
  const memo = createOverlayMemo({
    read: async () => { calls.n += 1; return next(); },
    now: () => t,
    ttlMs,
    backoffMs,
    warn: (m) => warnings.push(m),
  });
  return {
    memo, calls, warnings,
    tick: (ms) => { t += ms; },
    willReturn: (fn) => { next = fn; },
  };
}

test('R1 when the repo read succeeds, the overlay memo serves it and reuses it for 60s', async () => {
  const r = rig();
  assert.deepEqual(await r.memo.get(), REPO);
  r.tick(30_000);
  assert.deepEqual(await r.memo.get(), REPO);
  assert.equal(r.calls.n, 1, 'one GitHub read per 60s');
});

test('R2 when a refresh fails, the memo serves the LAST GOOD copy (stale) and logs a warning', async () => {
  const r = rig();
  await r.memo.get();
  r.tick(61_000);
  r.willReturn(() => { throw new Error('github 403 reading registry'); });
  assert.deepEqual(await r.memo.get(), REPO, 'stale copy, never []');
  assert.equal(r.calls.n, 2, 'the refresh was attempted');
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /last good copy/);
  assert.match(r.warnings[0], /403/);
});

test('R3 a failure is never cached: after the backoff the next call retries, and a success replaces the stale copy', async () => {
  const r = rig();
  await r.memo.get();
  r.tick(61_000);
  r.willReturn(() => { throw new Error('timeout'); });
  await r.memo.get();
  r.tick(5_000); // inside the 15s backoff → no hammering
  await r.memo.get();
  assert.equal(r.calls.n, 2, 'no retry inside the backoff window');
  r.tick(11_000); // past the backoff
  const fresh = [{ slug: 'quotequarry', active: true, tokenSecretSaved: true, cron: '5 2 * * *' }];
  r.willReturn(() => ({ channels: fresh }));
  assert.deepEqual(await r.memo.get(), fresh);
  assert.equal(r.calls.n, 3);
});

test('R4 an empty channel list from the repo counts as a failed refresh, never as the truth', async () => {
  const r = rig();
  await r.memo.get();
  r.tick(61_000);
  r.willReturn(() => ({ channels: [] }));
  assert.deepEqual(await r.memo.get(), REPO);
  r.willReturn(() => null);
  r.tick(16_000);
  assert.deepEqual(await r.memo.get(), REPO);
});

test('R5 cold start + failed read: the Neon feed mirror is used if present, else null (= degraded)', async () => {
  const r = rig();
  r.willReturn(() => { throw new Error('github 403 reading registry'); });
  assert.equal(await r.memo.get(), null, 'nothing known → degraded marker, not []');
  assert.match(r.warnings[0], /DEGRADED/);
  r.memo.setFallback(REPO);
  r.tick(16_000);
  assert.deepEqual(await r.memo.get(), REPO, 'feed mirror stands in');
  assert.match(r.warnings[1], /feed mirror/);
});

test('R6 concurrent callers share one in-flight read', async () => {
  const r = rig();
  const [a, b] = await Promise.all([r.memo.get(), r.memo.get()]);
  assert.deepEqual(a, REPO);
  assert.deepEqual(b, REPO);
  assert.equal(r.calls.n, 1);
});

test('R7 the feed mirror is read from the Neon rows (jsonb object or text); bad rows are skipped', () => {
  const rows = [
    { slug: 'b', feed_entry: JSON.stringify({ slug: 'b', active: true }) },
    { slug: 'a', feed_entry: { slug: 'a', active: true, cron: '1 2 * * *' } },
    { slug: 'c', feed_entry: null },
    { slug: 'd', feed_entry: '{not json' },
  ];
  assert.deepEqual(feedMirrorChannels(rows).map((c) => c.slug), ['a', 'b']);
  assert.deepEqual(feedMirrorChannels(undefined), []);
});

const dbRow = (slug, extra = {}) => ({ slug, status: '', active: false, tokenSecretSaved: false, tokenSecret: '', kit: {}, ...extra });

test('R8 a degraded overlay (null) flags every entry and leaves the DB values as they are', () => {
  const out = overlayRepoFlags([dbRow('quotequarry'), dbRow('yt-bot', { active: true, tokenSecretSaved: true, tokenSecret: 'YT_TOKEN_YT_BOT' })], null);
  assert.equal(out.every((e) => e.overlayDegraded === true), true);
  assert.equal(out[1].tokenSecret, 'YT_TOKEN_YT_BOT');
  assert.equal(out[0].active, false, 'the DB value is not invented away');
  const healthy = overlayRepoFlags([dbRow('quotequarry')], REPO);
  assert.equal('overlayDegraded' in healthy[0], false, 'a healthy read carries no flag');
});

test('R9 while degraded, the live channel list still includes un-parked channels (Resume / actions keep working)', () => {
  const degraded = overlayRepoFlags([dbRow('quotequarry'), dbRow('parked-one', { status: 'parked' })], null);
  assert.deepEqual(activeRegistryChannels(degraded).map((c) => c.slug), ['quotequarry']);
  // healthy reads keep the old rule exactly
  const healthy = overlayRepoFlags([dbRow('quotequarry'), dbRow('off-one')], [{ slug: 'quotequarry', active: true }, { slug: 'off-one', active: false }]);
  assert.deepEqual(activeRegistryChannels(healthy).map((c) => c.slug), ['quotequarry']);
});

test('R10 a degraded DB entry synced into the engine feed keeps active, the key flag, the key name and cron', () => {
  const repo = [
    { slug: 'quotequarry', label: 'Quote Quarry', active: true, autopilot: true, tokenSecretSaved: true, cron: '13 2 * * *', kit: { slots: ['22:35'] } },
    { slug: 'yt-bot', label: 'YT-BOT', active: true, tokenSecretSaved: true, tokenSecret: 'YT_TOKEN_YT_BOT', slots: [], kit: {} },
  ];
  const [qq, bot] = overlayRepoFlags([dbRow('quotequarry', { label: 'Quote Quarry', kit: { slots: ['22:35'] } }), dbRow('yt-bot', { label: 'YT-BOT' })], null);
  let feed = mergeRegistrySync(repo, qq);
  feed = mergeRegistrySync(feed, bot);
  const file = JSON.stringify({ channels: feed }, null, 2);
  const outQ = feed.find((c) => c.slug === 'quotequarry');
  const outB = feed.find((c) => c.slug === 'yt-bot');
  assert.equal(outQ.active, true);
  assert.equal(outQ.tokenSecretSaved, true);
  assert.equal(outQ.cron, '13 2 * * *');
  assert.equal(outB.tokenSecret, 'YT_TOKEN_YT_BOT', 'an empty DB key name never blanks the repo one');
  assert.equal(outB.active, true);
  assert.doesNotMatch(file, /overlayDegraded/, 'the degraded flag never reaches the engine file');
  assert.doesNotMatch(file, /"active": false/);
});

test('R11 a brand-new channel synced during a degraded read keeps its honest DB flags', () => {
  const [fresh] = overlayRepoFlags([dbRow('new-one', { active: true, tokenSecretSaved: true, tokenSecret: 'YT_TOKEN_NEW_ONE' })], null);
  const out = mergeRegistrySync(REPO, fresh).find((c) => c.slug === 'new-one');
  assert.equal(out.active, true);
  assert.equal('overlayDegraded' in out, false);
});

const SRC = fs.readFileSync('studio/lib/channels-registry.js', 'utf8');
const body = (start, end) => SRC.slice(SRC.indexOf(start), SRC.indexOf(end));

test('R12 wiring: readRegistry feeds the Neon mirror to the memo and reports overlayDegraded to callers', () => {
  const rr = body('export async function readRegistry', '// Audit 2026-11-13 #8');
  assert.match(rr, /overlayMemo\.setFallback\(feedMirrorChannels\(rows\)\)/);
  assert.match(rr, /overlayDegraded: true/);
  assert.match(SRC, /const overlayMemo = createOverlayMemo\(\{ read: readRegistryRepo \}\)/);
});

test('R13 wiring: the DB → repo sync always rebuilds from a FRESH repo read, never the overlay memo', () => {
  const sync = body('async function syncRegistryRepo', 'export async function registryChannels');
  assert.match(sync, /const repo = await readRegistryRepo\(\);/);
  assert.doesNotMatch(sync, /repoChannelsForOverlay|overlayMemo/);
  assert.match(sync, /mergeRegistrySync\(/);
});

test('R14 wiring: the DB-down repo fallback keeps the engine-owned flags too', () => {
  const fb = body('// repo fallback (original logic)', '// Admin-panel review #5');
  assert.match(fb, /engineFlags\(/);
  assert.match(fb, /delete repoEntry\.overlayDegraded;/);
});

test('R15 registryChannels uses the degraded-aware filter', () => {
  const rc = body('export async function registryChannels', 'export async function upsertChannel');
  assert.match(rc, /activeRegistryChannels\(/);
});
