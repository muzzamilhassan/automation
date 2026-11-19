// Phase 2 run history (OPS-01): the owner must be able to see whether today's
// automation runs succeeded. Behavioral tests for the pure view logic
// (studio/lib/runs-view.mjs) + source scans pinning the /api/runs route's
// auth / role / rate-limit / 502-on-failure wiring and the /runs page's
// honest error + empty + loading states.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PRODUCTION_WORKFLOWS, workflowFile, runState, deriveChannel, mapRun, mapRuns,
  groupByChannel, todaySummary, runLabel, fmtDuration, durationText, filterRuns, dayKey,
} from '../studio/lib/runs-view.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const TZ = 'Asia/Karachi'; // UTC+5, no DST — fixed offsets make the assertions exact
const CHANNELS = [
  { slug: 'money-rulebook', label: 'Money Rulebook' },
  { slug: 'quotequarry', label: 'Quote Quarry' },
];

const raw = (over = {}) => ({
  id: 1,
  name: '🏭 Channel Autopilot — all channels',
  display_title: '🏭 Channel Autopilot — all channels',
  path: '.github/workflows/channel-autopilot.yml',
  event: 'schedule',
  status: 'completed',
  conclusion: 'success',
  created_at: '2026-11-18T21:35:00Z',
  run_started_at: '2026-11-18T21:35:10Z',
  updated_at: '2026-11-18T21:39:30Z',
  html_url: 'https://github.com/o/r/actions/runs/1',
  ...over,
});

// "now" = 2026-11-19 10:00 PKT (05:00Z); PKT "today" began at 2026-11-18T19:00Z
const NOW = Date.parse('2026-11-19T05:00:00Z');

/* --------------------------------- mapping -------------------------------- */

test('workflowFile strips the directory and any @ref', () => {
  assert.equal(workflowFile('.github/workflows/fb-now.yml@refs/heads/main'), 'fb-now.yml');
  assert.equal(workflowFile('.github/workflows/channel-autopilot.yml'), 'channel-autopilot.yml');
  assert.equal(workflowFile(undefined), '');
});

test('runState maps every GitHub status/conclusion; unknown is never ok', () => {
  assert.equal(runState('completed', 'success'), 'ok');
  for (const c of ['failure', 'timed_out', 'startup_failure']) assert.equal(runState('completed', c), 'failed');
  assert.equal(runState('in_progress', null), 'running');
  for (const s of ['queued', 'waiting', 'requested', 'pending']) assert.equal(runState(s, null), 'queued');
  assert.equal(runState('completed', 'cancelled'), 'cancelled');
  assert.equal(runState('completed', 'skipped'), 'skipped');
  assert.equal(runState('completed', 'action_required'), 'blocked');
  assert.equal(runState('completed', 'something-new'), 'unknown');
  assert.equal(runState('completed', null), 'unknown');
});

test('deriveChannel: run-name "<channel> · <event>" resolves by slug or label; heartbeat is null', () => {
  assert.equal(deriveChannel({ display_title: 'money-rulebook · workflow_dispatch' }, CHANNELS), 'money-rulebook');
  assert.equal(deriveChannel({ display_title: 'Quote Quarry · schedule' }, CHANNELS), 'quotequarry');
  assert.equal(deriveChannel({ display_title: 'heartbeat · schedule' }, CHANNELS), null);
  assert.equal(deriveChannel({ display_title: 'all channels · workflow_dispatch' }, CHANNELS), null);
  assert.equal(deriveChannel({ inputs: { channel: 'quotequarry' } }, CHANNELS), 'quotequarry');
});

test('deriveChannel never guesses: default workflow titles and unknown names stay null', () => {
  assert.equal(deriveChannel(raw(), CHANNELS), null);
  assert.equal(deriveChannel({ display_title: 'not-a-channel · schedule' }, CHANNELS), null);
  // no fuzzy text search — a title merely mentioning a channel is not attribution
  assert.equal(deriveChannel({ display_title: 'fix money-rulebook voice' }, CHANNELS), null);
  // registry unreadable: a slug-shaped run-name segment is still trusted
  assert.equal(deriveChannel({ display_title: 'new-chan · schedule' }, []), 'new-chan');
});

test('mapRun produces the view row with real duration and link', () => {
  const r = mapRun(raw({ display_title: 'money-rulebook · schedule' }), CHANNELS);
  assert.deepEqual(
    { id: r.id, workflow: r.workflow, channel: r.channel, status: r.status, conclusion: r.conclusion, state: r.state, event: r.event, durationSec: r.durationSec, url: r.url },
    { id: 1, workflow: 'channel-autopilot.yml', channel: 'money-rulebook', status: 'completed', conclusion: 'success', state: 'ok', event: 'schedule', durationSec: 260, url: 'https://github.com/o/r/actions/runs/1' },
  );
  assert.equal(r.createdAt, '2026-11-18T21:35:00Z');
  assert.equal(r.updatedAt, '2026-11-18T21:39:30Z');
});

test('mapRun: a running run has no fixed duration (it ticks live)', () => {
  const r = mapRun(raw({ status: 'in_progress', conclusion: null }), CHANNELS);
  assert.equal(r.state, 'running');
  assert.equal(r.durationSec, null);
});

test('mapRuns merges lists, dedupes by id, drops non-production workflows, newest first', () => {
  const a = raw({ id: 1, created_at: '2026-11-18T20:00:00Z' });
  const b = raw({ id: 2, created_at: '2026-11-19T01:00:00Z', path: '.github/workflows/fb-now.yml' });
  const ci = raw({ id: 3, created_at: '2026-11-19T02:00:00Z', path: '.github/workflows/tests.yml' });
  const rows = mapRuns([[a, ci], [b, a]], CHANNELS);
  assert.deepEqual(rows.map((r) => r.id), [2, 1]);
  assert.ok(PRODUCTION_WORKFLOWS.includes('channel-autopilot.yml'));
  assert.ok(!PRODUCTION_WORKFLOWS.includes('tests.yml'));
});

/* -------------------------------- grouping -------------------------------- */

test('groupByChannel groups by channel, untagged runs last', () => {
  const rows = [
    { id: 1, channel: null }, { id: 2, channel: 'quotequarry' },
    { id: 3, channel: 'money-rulebook' }, { id: 4, channel: 'quotequarry' },
  ];
  const g = groupByChannel(rows);
  assert.deepEqual(g.map((x) => x.channel), ['quotequarry', 'money-rulebook', null]);
  assert.deepEqual(g[0].runs.map((r) => r.id), [2, 4]);
});

/* ------------------------------ today summary ----------------------------- */

const row = (over) => mapRun(raw(over), CHANNELS);

test('today summary: ok, failed, running and not-run-today per channel', () => {
  const rows = [
    row({ id: 10, display_title: 'money-rulebook · schedule', conclusion: 'failure', created_at: '2026-11-18T21:35:00Z', updated_at: '2026-11-18T21:41:00Z' }),
    row({ id: 11, display_title: 'quotequarry · schedule', created_at: '2026-11-18T21:30:00Z', updated_at: '2026-11-18T21:39:00Z' }),
  ];
  const s = todaySummary(rows, [...CHANNELS, { slug: 'tax-shield', label: 'Tax Shield' }], { now: NOW, timeZone: TZ });
  const by = Object.fromEntries(s.channels.map((c) => [c.channel, c]));
  assert.equal(by['money-rulebook'].status, 'failed');
  assert.equal(by['money-rulebook'].label, 'Failed at 02:41');
  assert.equal(by.quotequarry.status, 'ok');
  assert.equal(by.quotequarry.label, 'Succeeded 02:39');
  assert.equal(by['tax-shield'].status, 'none');
  assert.equal(by['tax-shield'].label, 'Not run today');
  assert.equal(by['tax-shield'].run, null);
});

test('today summary: a live run wins; a later success after a failure reads ok', () => {
  const rows = [
    row({ id: 21, display_title: 'quotequarry · workflow_dispatch', status: 'in_progress', conclusion: null, created_at: '2026-11-19T04:56:00Z', run_started_at: '2026-11-19T04:56:00Z', updated_at: '2026-11-19T04:57:00Z' }),
    row({ id: 20, display_title: 'quotequarry · schedule', conclusion: 'success', created_at: '2026-11-19T01:00:00Z', updated_at: '2026-11-19T01:05:00Z' }),
    row({ id: 31, display_title: 'money-rulebook · workflow_dispatch', conclusion: 'success', created_at: '2026-11-19T03:00:00Z', updated_at: '2026-11-19T03:06:00Z' }),
    row({ id: 30, display_title: 'money-rulebook · schedule', conclusion: 'failure', created_at: '2026-11-19T00:00:00Z', updated_at: '2026-11-19T00:02:00Z' }),
  ];
  const s = todaySummary(rows, CHANNELS, { now: NOW, timeZone: TZ });
  const by = Object.fromEntries(s.channels.map((c) => [c.channel, c]));
  assert.equal(by.quotequarry.status, 'running');
  assert.equal(by.quotequarry.label, 'Running for 4m');
  assert.equal(by['money-rulebook'].status, 'ok');
  assert.equal(by['money-rulebook'].run.id, 31);
});

test("today summary: yesterday's runs (owner's zone) don't count as today", () => {
  // 18:30Z on the 18th = 23:30 PKT on the 18th → yesterday for a 19th-PKT viewer
  const rows = [row({ id: 40, display_title: 'quotequarry · schedule', created_at: '2026-11-18T18:30:00Z', updated_at: '2026-11-18T18:35:00Z' })];
  const s = todaySummary(rows, CHANNELS, { now: NOW, timeZone: TZ });
  assert.equal(s.channels.find((c) => c.channel === 'quotequarry').status, 'none');
  assert.equal(dayKey('2026-11-18T19:00:00Z', TZ), '2026-11-19');
});

test('today summary: untagged scheduler runs get their own entry and soften "not run"', () => {
  const rows = [row({ id: 50, created_at: '2026-11-19T00:05:00Z', updated_at: '2026-11-19T00:09:00Z' })];
  const s = todaySummary(rows, CHANNELS, { now: NOW, timeZone: TZ });
  assert.equal(s.untaggedToday, 1);
  assert.equal(s.scheduler.status, 'ok');
  assert.equal(s.scheduler.channel, null);
  assert.equal(s.channels[0].label, 'No channel-tagged run today');
});

test('today summary: partial coverage never claims "not run today"', () => {
  const s = todaySummary([], CHANNELS, { now: NOW, timeZone: TZ, coveredSince: '2026-11-19T02:00:00Z' });
  assert.equal(s.partial, true);
  assert.equal(s.channels[0].status, 'none');
  assert.equal(s.channels[0].label, 'No run seen since 07:00');
});

test('today summary: channels come from data, plus any channel only the runs name', () => {
  const rows = [mapRun(raw({ id: 60, display_title: 'brand-new · schedule', created_at: '2026-11-19T02:00:00Z', updated_at: '2026-11-19T02:03:00Z' }), [])];
  const s = todaySummary(rows, [], { now: NOW, timeZone: TZ });
  assert.deepEqual(s.channels.map((c) => c.channel), ['brand-new']);
});

/* --------------------------------- labels --------------------------------- */

test('labels: plain-English status lines and durations', () => {
  assert.equal(runLabel({ state: 'ok', updatedAt: '2026-11-18T21:39:00Z' }, { timeZone: TZ }), 'Succeeded 02:39');
  assert.equal(runLabel({ state: 'failed', updatedAt: '2026-11-18T21:41:00Z' }, { timeZone: TZ }), 'Failed at 02:41');
  assert.equal(runLabel({ state: 'running', startedAt: '2026-11-19T04:56:00Z' }, { now: NOW, timeZone: TZ }), 'Running for 4m');
  assert.equal(runLabel({ state: 'mystery' }, { timeZone: TZ }), 'Status unknown');
  assert.equal(fmtDuration(42), '42s');
  assert.equal(fmtDuration(260), '4m 20s');
  assert.equal(fmtDuration(3900), '1h 5m');
  assert.equal(fmtDuration(null), '—');
  assert.equal(durationText({ state: 'queued', durationSec: null }, NOW), '—');
  assert.equal(durationText({ state: 'running', startedAt: '2026-11-19T04:58:00Z' }, NOW), '2m');
});

test('filterRuns by channel (incl. untagged) and status group', () => {
  const rows = [
    { id: 1, channel: 'a', state: 'ok' }, { id: 2, channel: 'a', state: 'failed' },
    { id: 3, channel: null, state: 'queued' }, { id: 4, channel: 'b', state: 'cancelled' },
  ];
  assert.deepEqual(filterRuns(rows, { channel: 'a' }).map((r) => r.id), [1, 2]);
  assert.deepEqual(filterRuns(rows, { channel: 'untagged' }).map((r) => r.id), [3]);
  assert.deepEqual(filterRuns(rows, { status: 'failed' }).map((r) => r.id), [2]);
  assert.deepEqual(filterRuns(rows, { status: 'running' }).map((r) => r.id), [3]);
  assert.deepEqual(filterRuns(rows, { status: 'other' }).map((r) => r.id), [4]);
});

/* ------------------------------ route wiring ------------------------------ */

const ROUTE = read('studio/app/api/runs/route.js');

test('route: anonymous 401, clients 403 (owner + staff only)', () => {
  assert.match(ROUTE, /const user = await getUser\(req\)/);
  assert.match(ROUTE, /if \(!user\) return Response\.json\([^)]*\{ status: 401 \}\)/);
  assert.match(ROUTE, /if \(!\['owner', 'staff'\]\.includes\(user\.role\)\)/);
  assert.match(ROUTE, /\{ status: 403 \}/);
});

test("route: rate-limited on the 'runs-read' bucket, 30 per hour", () => {
  assert.match(ROUTE, /enforceLimits\(user, \[\{ bucket: 'runs-read', limit: 30, windowSec: 3600 \}\]\)/);
  assert.match(ROUTE, /if \(limited\) return limited;/);
});

test('route: same token/repo as the dispatch route, 60s cache', () => {
  assert.match(ROUTE, /ENV\.GITHUB_TOKEN \|\| ENV\.GITHUB_PAT/);
  assert.match(ROUTE, /ENV\.GITHUB_REPO \|\| 'muzzamilhassan\/automation'/);
  assert.match(ROUTE, /CACHE_MS = 60_000/);
  assert.match(ROUTE, /\/actions\/workflows\/\$\{workflow\}\/runs\?per_page=/);
});

test('route: GitHub failure answers 502 ok:false — never an empty all-good list', () => {
  assert.match(ROUTE, /if \(!res\.ok\) throw new Error/);
  assert.match(ROUTE, /catch \(e\) \{\s*return Response\.json\(\{ ok: false, error:[\s\S]{0,120}\{ status: 502 \}\)/);
  assert.match(ROUTE, /if \(!TOKEN\) \{\s*return Response\.json\(\{ ok: false[^}]*\}, \{ status: 502 \}\)/);
  // an unreadable body is a failure too, not []
  assert.match(ROUTE, /if \(!runs\) throw new Error/);
});

/* ------------------------------- page wiring ------------------------------ */

const PAGE = read('studio/app/runs/page.js');

test('page: error card with Retry, empty state, loading skeleton', () => {
  assert.match(PAGE, /Can&apos;t load run history — GitHub didn&apos;t answer\./);
  assert.match(PAGE, /onClick=\{refresh\}[^>]*>[\s\S]{0,200}Retry/);
  assert.match(PAGE, /<EmptyState icon=\{History\} title="No runs yet"/);
  assert.match(PAGE, /<Skeleton /);
  assert.match(PAGE, /apiFetch\('\/api\/runs'\)/);
});

test('page: a failed refresh keeps old data but says it is stale', () => {
  assert.match(PAGE, /Couldn't refresh — showing runs checked/);
});

test('page: design kit only — t-NN scale, no arbitrary px text, no hex text colors', () => {
  assert.doesNotMatch(PAGE, /text-\[\d+px\]/);
  assert.doesNotMatch(PAGE, /text-t-\d+/);
  assert.doesNotMatch(PAGE, /color: '#[0-9a-fA-F]{3,6}'/);
  assert.match(PAGE, /<DataTable/);
  assert.match(PAGE, /<Segmented/);
});

test('page: channels come from data (useBrands), not a hardcoded list', () => {
  assert.match(PAGE, /const \{ bySlug, channels: brandList \} = useBrands\(\);/);
  for (const c of CHANNELS) assert.ok(!PAGE.includes(c.slug), `page hardcodes ${c.slug}`);
});
