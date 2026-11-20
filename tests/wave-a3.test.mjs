// Live-fix wave A3 (2026-11-20) — the Today page and the channel views tell
// the truth. Behaviour of the pure channel-state helpers + source pins on the
// '@/'-importing pages (comments stripped, CRLF-safe).
// QA: docs/qa/live-fix-wave-a3-qa.md (criteria A3-9 … A3-18 here).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { channelToday, todayMarks, deriveVerdict } from '../studio/lib/cockpit-verdict.mjs';
import { todayStatus, runText, lastMadeText } from '../studio/lib/channel-overview.mjs';

const strip = (src) => src.replace(/\r\n/g, '\n').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
const read = (p) => strip(fs.readFileSync(p, 'utf8'));
const HOME = read('studio/app/page.js');
const AN = read('studio/app/analytics/page.js');
const LIST = read('studio/app/channels/page.js');
const SLUG = read('studio/app/channels/[slug]/page.js');
const DRAWER = read('studio/components/ChannelOverviewDrawer.js');
const CLIENT = read('studio/app/client/page.js');
const OVERVIEW_LIB = read('studio/lib/channel-overview.mjs');
const ROUTE = read('studio/app/api/overview/route.js');

const LATE = new Date('2026-11-20T23:00:00Z');
const row = (extra = {}) => ({
  slug: 'a', label: 'A', slots: ['14:30'], yt: { subs: 1, error: null },
  today: { day: '2026-11-20', basis: 'UTC', count: 0, clips: 0, episodes: 0, shorts: 0 },
  todayRun: { status: 'none' }, todayVideos: 0, ...extra,
});
const made = (n, extra = {}) => row({ today: { day: '2026-11-20', basis: 'UTC', count: n, clips: n, episodes: 0, shorts: 0 }, todayVideos: n, ...extra });

// ---- A3-9: home row state from the truthful fields
test('A3-9: WHEN the latest run today failed, THE home row shows it as failed (bad), even if something was made earlier', () => {
  const t = channelToday(made(1, { todayRun: { status: 'failed', at: '2026-11-20T01:47:04Z' } }), LATE);
  assert.equal(t.state, 'failed');
  assert.equal(t.tone, 'bad');
  assert.match(t.label, /run failed/);
  assert.equal(channelToday(row({ todayRun: { status: 'failed' } }), LATE).label, 'run failed');
});

test('A3-9: a clip posted today reads "made today"; a succeeded run with nothing new still ran; a live run is not a problem', () => {
  assert.equal(channelToday(made(1, { todayRun: { status: 'succeeded' } }), LATE).label, '1 made today');
  const ran = channelToday(row({ todayRun: { status: 'succeeded' } }), LATE);
  assert.equal(ran.state, 'made');
  assert.equal(ran.label, 'ran · nothing new');
  const live = channelToday(row({ todayRun: { status: 'running' } }), LATE);
  assert.equal(live.state, 'waiting', 'a run in progress is not a missed day');
  assert.equal(live.label, 'running now');
});

// The verdict COUNT belongs to wave A4 — here we only prove the channel state
// it is fed is truthful: an unknown channel is never counted as "ran".
test('A3-9: WHEN state and runs are both unreadable, THE row is unknown — never made, never counted as ran', () => {
  const c = row({ today: null, todayRun: { status: 'unknown' }, todayVideos: null });
  const t = channelToday(c, LATE);
  assert.equal(t.state, 'unknown');
  assert.equal(t.label, "can't check today");
  assert.notEqual(t.tone, 'ok');
  const v = deriveVerdict({ now: LATE, channels: [c], warnings: { status: 'ok', rows: [] }, review: { status: 'ok', count: 0 } });
  assert.equal(v.ran, 0);
  assert.notEqual(v.headline, 'All good — 1 channel ran today');
});

test('A3-9: yt error and pause still outrank the run state; old-shape rows still read todayVideos', () => {
  assert.equal(channelToday(made(1, { todayRun: { status: 'failed' }, yt: { error: 'invalid_grant' } }), LATE).state, 'yt_error');
  assert.equal(channelToday(row({ flowPaused: true, todayRun: { status: 'failed' } }), LATE).state, 'paused');
  assert.equal(channelToday({ slug: 'x', slots: ['14:30'], todayVideos: 2 }, LATE).label, '2 made today');
});

test('A3-10: todayMarks adds a clip mark from today.clips (UTC) and keeps poster/episode', () => {
  const now = new Date('2026-11-20T10:00:00Z');
  assert.deepEqual(todayMarks({ deepdiveDate: '2026-11-20', today: { clips: 1 } }, now), ['episode', 'clip']);
  assert.deepEqual(todayMarks({ today: { clips: 0 } }, now), []);
});

// ---- A3-11: drawer / channel page / client wording
test('A3-11: todayStatus speaks from today/todayRun — failed is shown, unknown says so, never "not run today"', () => {
  const now = new Date('2026-11-20T12:00:00Z');
  assert.deepEqual(todayStatus(made(2), now), { tone: 'ok', text: 'Made 2 videos today' });
  assert.deepEqual(todayStatus(made(1, { todayRun: { status: 'failed' } }), now), { tone: 'bad', text: 'Made 1 · last run failed' });
  assert.deepEqual(todayStatus(row({ todayRun: { status: 'failed' } }), now), { tone: 'bad', text: 'Run failed today' });
  assert.deepEqual(todayStatus(row({ todayRun: { status: 'running' } }), now), { tone: 'plain', text: 'Running now' });
  assert.deepEqual(todayStatus(row({ todayRun: { status: 'succeeded' } }), now), { tone: 'ok', text: 'Ran today · nothing new' });
  assert.deepEqual(todayStatus(row({ today: null, todayRun: { status: 'unknown' } }), now), { tone: 'plain', text: "Can't check today right now" });
  assert.deepEqual(todayStatus(row({ flowPaused: true }), now), { tone: 'plain', text: 'Paused — nothing new today' });
  assert.deepEqual(todayStatus(row(), now), { tone: 'plain', text: 'Not made yet today' });
});

test('A3-11: runText and lastMadeText are short plain facts with the UTC label', () => {
  assert.equal(runText({ status: 'failed', at: '2026-11-20T01:47:04Z' }), 'Run failed 01:47 UTC');
  assert.equal(runText({ status: 'succeeded', at: '2026-11-20T01:47:04Z' }), 'Run succeeded 01:47 UTC');
  assert.equal(runText({ status: 'running' }), 'Running now');
  assert.equal(runText({ status: 'none' }), 'No run yet today');
  assert.equal(runText({ status: 'unknown' }), "Can't check runs right now");
  assert.equal(runText(undefined), "Can't check runs right now");
  assert.equal(lastMadeText({ kind: 'clip', label: 'Clip Short', date: '2026-11-20' }), 'Last made: Clip Short · 2026-11-20');
  assert.equal(lastMadeText(null), 'Nothing made yet');
});

test('A3-12: no channel view reads the frozen lastRun date any more', () => {
  for (const [name, src] of Object.entries({ HOME, LIST, SLUG, DRAWER, CLIENT, OVERVIEW_LIB })) {
    assert.doesNotMatch(src, /\.lastRun\b/, `${name} must not read c.lastRun`);
  }
  assert.doesNotMatch(SLUG, /From the last run \(/);
  assert.doesNotMatch(CLIENT, /Last production run/);
  assert.doesNotMatch(ROUTE, /lastRun: s\.lastRunDate/);
});

test('A3-12: the overview route builds today / lastActivity / todayRun from the shared helpers', () => {
  assert.match(ROUTE, /todayProduction\(/);
  assert.match(ROUTE, /lastActivity\(/);
  assert.match(ROUTE, /todayRunFor\(/);
  assert.match(ROUTE, /fetchAutopilotRunsToday\(/);
  assert.match(ROUTE, /overviewSchedule\(/);
  assert.match(ROUTE, /overviewTotals\(/);
  assert.match(ROUTE, /degraded/);
  assert.match(ROUTE, /dayBasis: DAY_BASIS/);
});

test('A3-12: the drawer shows the run and last-made facts; the topics card dates each pick', () => {
  assert.match(DRAWER, /runText\(c\.todayRun\)/);
  assert.match(DRAWER, /lastMadeText\(c\.lastActivity\)/);
  assert.match(SLUG, /episodeTopicAt/);
  assert.match(SLUG, /todayTopicsAt/);
  assert.match(CLIENT, /todayStatus\(c, now\)/);
  assert.match(CLIENT, /lastMadeText\(c\.lastActivity\)/);
  assert.match(LIST, /todayStatus\(c, now\)/);
});

// ---- A3-13: T2-12 one labelled day
test('A3-13: home labels the day basis (UTC) next to "Channels today"', () => {
  assert.match(HOME, /Channels today · UTC day/);
});

// ---- A3-14: T3-08
test('A3-14: a connected channel whose YouTube read failed (yt null) says "stats unavailable", not "No accounts linked"', () => {
  assert.match(LIST, /c\.yt == null\) out\.push\(\{ key: 'yt', text: 'YouTube · stats unavailable'/);
});

// ---- A3-15 / A3-16: T2-04 fake zeros
test('A3-15: no printed "|| 1" total; the audience split shows "—" for unknown values', () => {
  assert.doesNotMatch(AN, /const platformTotal = [^;]*\|\| 1;/);
  assert.doesNotMatch(AN, /totals\.ytSubs \|\| 0|totals\.fbFollowers \|\| 0|totals\.igFollowers \|\| 0/);
  assert.doesNotMatch(AN, /\?\.subs \|\| 0|\?\.followers \|\| 0/);
  assert.match(AN, /s\.value == null \? '—'/);
  assert.match(AN, /Total unavailable right now/);
});

test('A3-15: analytics and home say which live sources are unavailable', () => {
  assert.match(AN, /data\.degraded/);
  assert.match(HOME, /data\.degraded/);
  assert.match(AN, /unavailable right now/);
});

test('A3-16: T2-15 — an analytics fetch failure says "unavailable right now", never "needs analytics access"', () => {
  assert.match(AN, /realErr \? \(\s*<p[^>]*>Unavailable right now — YouTube Analytics didn&apos;t answer/);
  assert.match(AN, /failedSlugs/);
});

// ---- A3-17: T2-06 the chart loads on its own
test('A3-17: home renders from overview + review without waiting for the slow analytics call', () => {
  const m = /Promise\.allSettled\(\[([\s\S]*?)\]\)\.then\(\(\[ov, rv\]\)/.exec(HOME);
  assert.ok(m, 'overview + review are awaited together');
  assert.doesNotMatch(m[1], /api\/analytics/, 'analytics is not in the same wait');
  assert.match(HOME, /const loadAnalytics = /);
  assert.match(HOME, /analyticsErr/);
});
