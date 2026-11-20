// Live-fix wave A3 (2026-11-20) — a truthful Today. Pure helpers behind
// /api/overview's per-channel `today`, `lastActivity` and `todayRun`, the
// registry-first schedule, and honest totals during an upstream outage.
// QA: docs/qa/live-fix-wave-a3-qa.md (criteria A3-1 … A3-8 here).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY_BASIS, productionDay, todayProduction, lastActivity, todayRunFor, autopilotSummary,
} from '../studio/lib/channel-activity.mjs';
import { overviewSchedule, overviewTotals } from '../studio/lib/overview-truth.mjs';
import { fetchAutopilotRunsToday } from '../studio/lib/autopilot-runs.mjs';

const NOW = new Date('2026-11-20T15:00:00Z');

// the real shape of yt-mcp/state/<slug>.json on 2026-11-20 (trimmed): the
// clips lane stopped writing lastRunDate in October
const qqState = {
  lastRunDate: '2026-10-23',
  lastVideos: [{ videoId: 'q0cySkr3b_o', publishAt: '2026-11-20T22:35:00Z', title: 'The Confirmation Bias Trap' }],
  deepdiveDate: '2026-11-18',
  deepdiveVideo: { videoId: 'BmPTDXMEVTw', publishAt: '2026-11-18T14:30:00Z', title: 'The Toxic Trap of False Hope' },
  clipLastPostDate: '2026-11-20',
  uploadsToday: { date: '2026-11-19', count: 1 }, // PT-dated quota counter — not the day basis
  clipQueue: {
    clips: [
      { title: 'old clip', postedAt: '2026-11-19T01:55:30.576Z' },
      { title: 'Clip posted today', postedAt: '2026-11-20T01:59:44.454Z' },
      { title: 'still queued' },
    ],
  },
};

// ---- A3-0: one day definition
test('A3-0: "today" is the UTC day — the same day key the engine stamps on every state field', () => {
  assert.equal(DAY_BASIS, 'UTC');
  assert.equal(productionDay(new Date('2026-11-20T00:00:00Z')), '2026-11-20');
  // 04:30 PKT on the 21st is still the 20th in UTC
  assert.equal(productionDay(new Date('2026-11-20T23:30:00Z')), '2026-11-20');
  assert.equal(productionDay(new Date('2026-11-21T00:00:00Z')), '2026-11-21');
});

// ---- A3-1 / A3-2: made today from the real signals, not lastRunDate
test('A3-1: WHEN a clip Short was posted today, THE today count includes it even though lastRunDate is frozen in October', () => {
  const t = todayProduction(qqState, NOW);
  assert.deepEqual(t, { day: '2026-11-20', basis: 'UTC', count: 1, clips: 1, episodes: 0, shorts: 0 });
});

test('A3-2: WHEN the episode was made today, THE count includes it; generated Shorts count from lastRunDate when it IS today', () => {
  const ep = todayProduction({ deepdiveDate: '2026-11-20', clipLastPostDate: '2026-11-20' }, NOW);
  // clipLastPostDate today without a dated queue entry still means one clip went up
  assert.equal(ep.episodes, 1);
  assert.equal(ep.clips, 1);
  assert.equal(ep.count, 2);
  const gen = todayProduction({ lastRunDate: '2026-11-20', lastVideos: [{}, {}] }, NOW);
  assert.equal(gen.shorts, 2);
  assert.equal(gen.count, 2);
  const none = todayProduction({ lastRunDate: '2026-10-20', deepdiveDate: '2026-11-18' }, NOW);
  assert.equal(none.count, 0);
});

test('A3-4: WHEN the state file could not be read, THE today value is null (unknown) — never 0', () => {
  assert.equal(todayProduction(null, NOW), null);
  assert.equal(todayProduction(undefined, NOW), null);
});

// ---- A3-3: last activity
test('A3-3: lastActivity names the newest real production signal and what it was', () => {
  assert.deepEqual(lastActivity(qqState), {
    kind: 'clip', label: 'Clip Short', date: '2026-11-20', at: '2026-11-20T01:59:44.454Z', title: 'Clip posted today',
  });
  const ep = lastActivity({ lastRunDate: '2026-10-20', deepdiveDate: '2026-11-20', deepdiveVideo: { title: 'Ep' }, clipLastPostDate: '2026-11-17' });
  assert.equal(ep.kind, 'episode');
  assert.equal(ep.label, 'Episode');
  assert.equal(ep.date, '2026-11-20');
  assert.equal(ep.title, 'Ep');
  const sh = lastActivity({ lastRunDate: '2026-11-19' });
  assert.equal(sh.kind, 'short');
  assert.equal(sh.label, 'Short');
  assert.equal(lastActivity({}), null);
  assert.equal(lastActivity(null), null);
});

// ---- A3-5: the autopilot run today (UTC)
const run = (id, channel, state, createdAt) => ({ id, channel, state, createdAt, startedAt: createdAt, updatedAt: createdAt, url: `https://example.test/${id}` });

test('A3-5: WHEN the latest autopilot run today failed, THE channel todayRun is failed (DFD 44656112937)', () => {
  const rows = [
    run(44751547867, 'money-rulebook', 'running', '2026-11-20T14:14:30Z'),
    run(44656112937, 'debt-free-doctrine', 'failed', '2026-11-20T01:47:04Z'),
    run(44656108105, 'investors-compass', 'ok', '2026-11-20T01:47:02Z'),
    run(44577056736, 'quotequarry', 'ok', '2026-11-19T17:25:40Z'), // yesterday (UTC)
  ];
  const sum = autopilotSummary({ ok: true, rows, coveredSince: null }, [{ slug: 'debt-free-doctrine' }, { slug: 'investors-compass' }, { slug: 'money-rulebook' }, { slug: 'quotequarry' }], NOW);
  assert.equal(todayRunFor(sum, 'debt-free-doctrine').status, 'failed');
  assert.equal(todayRunFor(sum, 'debt-free-doctrine').id, 44656112937);
  assert.equal(todayRunFor(sum, 'debt-free-doctrine').at, '2026-11-20T01:47:04Z');
  assert.equal(todayRunFor(sum, 'investors-compass').status, 'succeeded');
  assert.equal(todayRunFor(sum, 'money-rulebook').status, 'running');
  assert.equal(todayRunFor(sum, 'quotequarry').status, 'none', 'a run on the previous UTC day is not today');
});

test('A3-5: a later success supersedes an earlier failure; runs unreadable = unknown, never none', () => {
  const rows = [
    run(2, 'a', 'ok', '2026-11-20T09:00:00Z'),
    run(1, 'a', 'failed', '2026-11-20T02:00:00Z'),
  ];
  const sum = autopilotSummary({ ok: true, rows }, [{ slug: 'a' }], NOW);
  assert.equal(todayRunFor(sum, 'a').status, 'succeeded');
  const down = autopilotSummary({ ok: false, error: 'GitHub answered 403' }, [{ slug: 'a' }], NOW);
  assert.deepEqual(todayRunFor(down, 'a'), { status: 'unknown' });
  assert.deepEqual(todayRunFor(null, 'a'), { status: 'unknown' });
});

// ---- A3-6: the GitHub read for today's autopilot runs
test('A3-6: fetchAutopilotRunsToday asks GitHub for today-only (UTC) autopilot runs and fails honestly', async () => {
  let asked = '';
  const okFetch = async (url) => { asked = url; return { ok: true, status: 200, json: async () => ({ workflow_runs: [{ id: 1, path: '.github/workflows/channel-autopilot.yml', display_title: 'a · schedule', status: 'completed', conclusion: 'failure', created_at: '2026-11-20T01:00:00Z' }] }) }; };
  const got = await fetchAutopilotRunsToday({ repo: 'o/r', token: 't', now: NOW, fetchImpl: okFetch, channels: [{ slug: 'a' }], cacheMs: 0 });
  assert.match(asked, /\/repos\/o\/r\/actions\/workflows\/channel-autopilot\.yml\/runs\?/);
  assert.match(decodeURIComponent(asked), /created=>=2026-11-20/);
  assert.equal(got.ok, true);
  assert.equal(got.rows[0].channel, 'a');
  assert.equal(got.rows[0].state, 'failed');
  const bad = await fetchAutopilotRunsToday({ repo: 'o/r', token: 't', now: NOW, fetchImpl: async () => ({ ok: false, status: 403 }), cacheMs: 0 });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /403/);
  const noTok = await fetchAutopilotRunsToday({ repo: 'o/r', token: '', now: NOW, fetchImpl: okFetch, cacheMs: 0 });
  assert.equal(noTok.ok, false);
});

// ---- A3-7 (T3-01 / P5): registry kit first, like lib/brand-resolve.mjs
test('A3-7: WHEN the registry kit has slots 21:20 / longSlot 20:20, THE overview uses them over static brands.json 00:35 / 01:30 (DFD)', () => {
  const staticEntry = { slots: ['00:35'], longSlot: '01:30' };
  const reg = { slug: 'debt-free-doctrine', slots: [], kit: { slots: ['21:20'], longSlot: '20:20' } };
  assert.deepEqual(overviewSchedule(staticEntry, reg), { slots: ['21:20'], longSlot: '20:20' });
});

test('A3-7: precedence — registry top-level slots, then kit slots, then the static entry; missing registry keeps static', () => {
  const staticEntry = { slots: ['00:35'], longSlot: '01:30' };
  assert.deepEqual(overviewSchedule(staticEntry, { slots: ['09:00'], kit: { slots: ['21:20'] } }), { slots: ['09:00'], longSlot: '01:30' });
  assert.deepEqual(overviewSchedule(staticEntry, null), { slots: ['00:35'], longSlot: '01:30' });
  assert.deepEqual(overviewSchedule(staticEntry, { kit: {} }), { slots: ['00:35'], longSlot: '01:30' });
  assert.deepEqual(overviewSchedule(null, { kit: { slots: ['22:35'] } }), { slots: ['22:35'], longSlot: null });
});

// ---- A3-8 (T2-04 / P13): no fake zeros
test('A3-8: WHEN no channel answered from YouTube, THE totals are null (unknown) and youtube is degraded — never 0', () => {
  const chans = [{ slug: 'a', yt: null }, { slug: 'b', yt: { error: 'x' } }];
  const { totals, degraded } = overviewTotals(chans, { ytOk: false, fbOk: false });
  assert.equal(totals.ytSubs, null);
  assert.equal(totals.ytViews, null);
  assert.equal(totals.ytVideos, null);
  assert.equal(totals.fbFollowers, null);
  assert.equal(totals.igFollowers, null);
  assert.ok(degraded.includes('youtube'));
  assert.ok(degraded.includes('facebook'));
});

test('A3-8: partial answers sum what arrived and say so; a real 0 stays 0', () => {
  const chans = [
    { slug: 'a', yt: { subs: 10, views: 100, videos: 3, error: null }, fb: null, ig: null },
    { slug: 'b', yt: null },
    { slug: 'c', yt: { subs: 0, views: 0, videos: 0, error: null } },
  ];
  const { totals, degraded } = overviewTotals(chans, { ytOk: true, fbOk: true });
  assert.equal(totals.ytSubs, 10);
  assert.equal(totals.ytVideos, 3);
  assert.equal(totals.ytChannels, 2);
  assert.equal(totals.ytOf, 3);
  assert.equal(totals.fbFollowers, 0, 'FB answered and no channel has a page: a true zero');
  assert.deepEqual(degraded, ['youtube']);
  const all = overviewTotals([{ slug: 'a', yt: { subs: 1, views: 2, videos: 3, error: null } }], { ytOk: true, fbOk: true });
  assert.deepEqual(all.degraded, []);
});
