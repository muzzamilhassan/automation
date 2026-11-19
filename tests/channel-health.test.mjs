// Phase 2 (I5) — the per-channel page /channels/[slug] and its health verdict.
// Behavioral tests for studio/lib/channel-health.mjs + source scans pinning the
// page's wiring (useParams, honest unknown/404/not-linked states, no hardcoded slugs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  channelHealth, todayProduction, youtubeConnection, resolveChannelView, realUploads,
  channelUploads, nextScheduled, validSlots, isValidSlug, levelTone, editHref,
} from '../studio/lib/channel-health.mjs';

// 2026-11-19 15:00 UTC — after a 14:30 slot, before a 22:35 slot
const NOW = new Date('2026-11-19T15:00:00Z');
const TODAY = '2026-11-19';
const healthy = {
  slug: 'demo-chan', label: 'Demo', active: true, flowPaused: false,
  yt: { title: 'Demo', handle: '@demo', subs: 10, views: 100, videos: 3, error: null },
  lastRun: TODAY, todayVideos: 2, slots: ['14:30'], docDays: ['Thu'], clipQueue: null,
};

test('a connected, active channel that ran today is Healthy with no next action', () => {
  const h = channelHealth(healthy, { now: NOW });
  assert.equal(h.level, 'ok');
  assert.equal(h.label, 'Healthy');
  assert.deepEqual(h.reasons, []);
  assert.equal(h.nextAction, null);
});

test('a YouTube error is bad and the one next action is Re-connect Google', () => {
  const h = channelHealth({ ...healthy, yt: { error: 'token refresh failed: HTTP 400' } }, { now: NOW });
  assert.equal(h.level, 'bad');
  assert.equal(h.label, 'Not uploading');
  assert.match(h.reasons[0], /re-connect/i);
  assert.equal(h.nextAction.label, 'Re-connect Google');
  assert.equal(h.nextAction.href, '/channels/add');
});

test('clients cannot start the Google login — they are told to ask the owner', () => {
  const h = channelHealth({ ...healthy, yt: { error: 'x' } }, { now: NOW, canReconnect: false });
  assert.equal(h.nextAction.href, null);
  assert.match(h.nextAction.label, /owner/i);
});

test('the YouTube error outranks a pause (worst problem first)', () => {
  const h = channelHealth({ ...healthy, yt: { error: 'x' }, flowPaused: true }, { now: NOW });
  assert.equal(h.level, 'bad');
  assert.equal(h.reasons.length, 2);
  assert.equal(h.nextAction.label, 'Re-connect Google');
});

test('paused reads "Paused" with a Resume action', () => {
  const h = channelHealth({ ...healthy, flowPaused: true, lastRun: '2026-11-18' }, { now: NOW });
  assert.equal(h.level, 'warn');
  assert.equal(h.label, 'Paused');
  assert.match(h.reasons[0], /Autopilot paused/);
  assert.equal(h.nextAction.action, 'resume');
  assert.match(h.nextAction.label, /Resume/);
});

test('not run today after the first slot passed → warn "Not run today"', () => {
  const h = channelHealth({ ...healthy, lastRun: '2026-11-18', todayVideos: 0 }, { now: NOW });
  assert.equal(h.level, 'warn');
  assert.match(h.reasons.join(' '), /Not run today/);
  assert.equal(todayProduction({ ...healthy, lastRun: '2026-11-18' }, NOW).state, 'missed');
});

test('before the first slot, a run from yesterday is pending, not late', () => {
  const row = { ...healthy, lastRun: '2026-11-18', slots: ['22:35'] };
  assert.equal(todayProduction(row, NOW).state, 'pending');
  assert.equal(channelHealth(row, { now: NOW }).level, 'ok');
});

test('several days without a run is late whatever the clock says', () => {
  const row = { ...healthy, lastRun: '2026-11-12', slots: ['22:35'] };
  assert.equal(todayProduction(row, NOW).state, 'stale');
  const h = channelHealth(row, { now: NOW });
  assert.equal(h.level, 'warn');
  assert.match(h.reasons.join(' '), /7 days/);
});

test('missing YouTube data is unknown — never ok', () => {
  const h = channelHealth({ ...healthy, yt: null }, { now: NOW });
  assert.equal(h.level, 'unknown');
  assert.equal(h.label, 'Status unknown');
  assert.equal(youtubeConnection({ yt: null }).state, 'unknown');
});

test('no row / garbage row → unknown, never ok', () => {
  for (const r of [null, undefined, {}, { slug: 'Bad Slug!' }, 'x']) {
    const h = channelHealth(r, { now: NOW });
    assert.equal(h.level, 'unknown');
    assert.ok(h.reasons.length > 0);
  }
});

test('no slot set and not run today → unknown (no deadline to judge by), not ok', () => {
  const h = channelHealth({ ...healthy, lastRun: '2026-11-18', slots: [] }, { now: NOW });
  assert.equal(h.level, 'unknown');
});

test('never run → warn with Finish setup into the wizard edit form', () => {
  const h = channelHealth({ ...healthy, lastRun: null }, { now: NOW });
  assert.equal(h.level, 'warn');
  assert.equal(h.nextAction.href, editHref('demo-chan'));
  assert.equal(editHref('demo-chan'), '/channels/add?edit=demo-chan');
});

test('broken clips in the Shorts queue are surfaced', () => {
  const h = channelHealth({ ...healthy, clipQueue: { total: 5, remaining: 3, broken: 2 } }, { now: NOW });
  assert.equal(h.level, 'warn');
  assert.match(h.reasons.join(' '), /2 clips/);
});

test('today production counts only a run from today', () => {
  assert.match(todayProduction(healthy, NOW).text, /2 videos made/);
  assert.equal(todayProduction({ ...healthy, flowPaused: true, lastRun: '2026-11-18' }, NOW).state, 'paused');
  assert.equal(todayProduction(null, NOW).state, 'unknown');
});

test('validSlots drops malformed times instead of guessing', () => {
  assert.deepEqual(validSlots(['22:35', 'noon', '7:5', '14:30', null]), ['14:30', '22:35']);
  assert.deepEqual(validSlots(undefined), []);
});

test('resolveChannelView: found / parked / not-linked / not-found / error / invalid', () => {
  const ov = { channels: [healthy], controlChannels: [{ slug: 'demo-chan' }, { slug: 'sleepy' }] };
  assert.equal(resolveChannelView('demo-chan', ov, 'owner').kind, 'found');
  assert.equal(resolveChannelView('sleepy', ov, 'owner').kind, 'parked');
  assert.equal(resolveChannelView('nope', ov, 'client').kind, 'not-linked');
  assert.equal(resolveChannelView('nope', ov, 'owner').kind, 'not-found');
  assert.equal(resolveChannelView('demo-chan', { error: true }, 'owner').kind, 'error');
  assert.equal(resolveChannelView('demo-chan', null, 'owner').kind, 'error');
  assert.equal(resolveChannelView('../etc', ov, 'owner').kind, 'invalid');
  assert.equal(isValidSlug('money-rulebook'), true);
  assert.equal(isValidSlug('Money Rulebook'), false);
});

test('realUploads drops the placeholder videos /api/thumbs/videos invents on failure', () => {
  const vids = [
    { videoId: 'dQw4w9WgXcQ', title: 'Real one' },
    { videoId: 'demo-chan-sample-1', title: 'Why Your Budget Is Secretly Killing Your Wealth' },
    { videoId: 'demo-chan-doc-latest', title: 'Doc' },
    { videoId: 'demo-chan-x', title: 'Eleven-char fake with slug prefix' },
    { videoId: 'abcdefghijk', title: '' },
  ];
  assert.deepEqual(realUploads(vids, 'demo-chan').map((v) => v.videoId), ['dQw4w9WgXcQ']);
  assert.deepEqual(realUploads(null, 'demo-chan'), []);
});

test('channelUploads / nextScheduled read only this channel from the overview log', () => {
  const logs = [
    { platform: 'YouTube', slug: 'demo-chan', title: 'Later', at: '2026-11-20T10:00:00Z', status: 'scheduled' },
    { platform: 'YouTube', slug: 'demo-chan', title: 'Sooner', at: '2026-11-19T18:00:00Z', status: 'scheduled' },
    { platform: 'YouTube', slug: 'other', title: 'Other', at: '2026-11-19T16:00:00Z', status: 'scheduled' },
    { platform: 'FB/IG', slug: 'demo-chan', title: 'Cross', at: '2026-11-19T17:00:00Z' },
    { platform: 'YouTube', slug: 'demo-chan', title: 'Old', at: '2026-11-18T10:00:00Z', status: 'published' },
  ];
  assert.deepEqual(channelUploads(logs, 'demo-chan').map((l) => l.title), ['Later', 'Sooner', 'Old']);
  assert.equal(nextScheduled(logs, 'demo-chan', NOW).title, 'Sooner'); // cross-posts are not uploads
  assert.equal(nextScheduled([], 'demo-chan', NOW), null);
  assert.equal(nextScheduled(undefined, 'demo-chan', NOW), null);
});

test('levelTone maps unknown to a neutral chip, never green', () => {
  assert.equal(levelTone('ok'), 'ok');
  assert.equal(levelTone('unknown'), 'plain');
  assert.equal(levelTone('bad'), 'bad');
});

// ---------------- source scans: the page wiring ----------------
const PAGE = fs.readFileSync(new URL('../studio/app/channels/[slug]/page.js', import.meta.url), 'utf8');
const LIB = fs.readFileSync(new URL('../studio/lib/channel-health.mjs', import.meta.url), 'utf8');

test('page is a client page that reads the slug from useParams', () => {
  assert.match(PAGE, /^'use client';/);
  assert.match(PAGE, /import \{[^}]*\buseParams\b[^}]*\} from 'next\/navigation'/);
  assert.match(PAGE, /const params = useParams\(\)/);
});

test('page uses useSearchParams only inside Suspense (it does not use it at all today)', () => {
  if (/\buseSearchParams\s*\(/.test(PAGE)) assert.match(PAGE, /<Suspense\b/);
});

test('page renders honest error / not-linked / not-found / parked states', () => {
  assert.match(PAGE, /view\.kind === 'error'/);
  assert.match(PAGE, /view\.kind === 'not-linked'/);
  assert.match(PAGE, /view\.kind === 'not-found'/);
  assert.match(PAGE, /view\.kind === 'parked'/);
  assert.match(PAGE, /isn't linked to your account/);
  assert.match(PAGE, /Channel not found/);
  assert.match(PAGE, /href="\/channels"/);
});

test('page reads real data sources and the shared health verdict', () => {
  assert.match(PAGE, /fetch\(fresh \? '\/api\/overview\?fresh=1' : '\/api\/overview'\)/);
  assert.match(PAGE, /fetch\('\/api\/me'\)/);
  assert.match(PAGE, /channelHealth\(c, \{ now, canReconnect: role === 'owner' \}\)/);
  assert.match(PAGE, /resolveChannelView\(slug, data, role\)/);
});

test('the rate-limited live upload list is fetched only on request, at most once', () => {
  assert.match(PAGE, /\/api\/thumbs\/videos\?slug=\$\{encodeURIComponent\(slug\)\}/);
  assert.match(PAGE, /if \(asked\.current\) return;/);
  assert.match(PAGE, /realUploads\(d\.videos, slug\)/);
  assert.match(PAGE, /r\.status === 429/);
});

test('no hardcoded channel slugs, hex colours or one-off pixel text sizes in the page or lib', () => {
  for (const src of [PAGE, LIB]) {
    assert.doesNotMatch(src, /['"`](money-rulebook|quotequarry|investors-compass|debt-free-doctrine|old-money-code|ai-observer|tax-shield)['"`]/);
    assert.doesNotMatch(src, /#[0-9a-fA-F]{6}\b/);
    assert.doesNotMatch(src, /text-\[\d+px\]/);
  }
});

test('lib has relative imports only (node --test must load it)', () => {
  assert.doesNotMatch(LIB, /from '@\//);
});
