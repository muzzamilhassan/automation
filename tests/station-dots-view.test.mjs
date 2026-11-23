// Creator City Phase 1 (FEEDBACK item O, 2026-11-23) — the pure view logic
// behind the station dots (Today rows + the run step drawer). Spec + QA:
// docs/qa/creator-city-phase1-qa.md (T1–T5, R1–R3). Behaviour tests for
// studio/lib/station-dots-view.mjs + source scans pinning the page wiring
// (comments stripped, CRLF-safe).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  normalizeStrip, dotAria, dotTitle, currentIndex, stripAria, firstLine,
  stepState, stationsFromPayload, stepsUrl, stationsUrl, matchRunUrl, stepsView,
} from '../studio/lib/station-dots-view.mjs';
import { STATION_KEYS } from '../studio/lib/stations.mjs';

const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const strip7 = (over = {}) => STATION_KEYS.map((key) => ({ key, state: over[key] || 'not_yet', at: null, detail: null }));

/* ------------------------------ dots (T1) ------------------------------ */

test('T1: THE strip always has the 7 stations in pipeline order, whatever the API sent', () => {
  const s = normalizeStrip([{ key: 'upload', state: 'done' }, { key: 'topic', state: 'running' }]);
  assert.deepEqual(s.map((d) => d.key), STATION_KEYS);
  assert.equal(s[0].state, 'running');
  assert.equal(s[6].state, 'done');
  assert.equal(s[3].state, 'unknown', 'a station the API did not send is "Not tracked", never "Not yet"');
  assert.equal(s[2].label, 'You approve');
});

test('T1: IF a state is not in the fixed vocabulary, THE dot reads unknown (never a guess)', () => {
  const s = normalizeStrip([{ key: 'voice', state: 'exploded' }, { key: 'render', state: null }]);
  assert.equal(s[3].state, 'unknown');
  assert.equal(s[4].state, 'unknown');
  assert.deepEqual(normalizeStrip(undefined).map((d) => d.state), Array(7).fill('unknown'));
});

test('T1: each dot has an accessible name "Voice: Running" and a tooltip with the detail', () => {
  const [, , , voice] = normalizeStrip([{ key: 'voice', state: 'running', detail: 'kokoro bm_daniel\nsecond line' }]);
  assert.equal(dotAria(voice), 'Voice: Running');
  assert.equal(dotTitle(voice), 'Voice — Running · kokoro bm_daniel');
  const [topic] = normalizeStrip([{ key: 'topic', state: 'done' }]);
  assert.equal(dotTitle(topic), 'Topic — Done', 'no trailing separator without a detail');
});

test('T1: THE current dot is the running one, else the one waiting for you, else the failed one', () => {
  assert.equal(currentIndex(normalizeStrip(strip7({ topic: 'done', script: 'running' }))), 1);
  assert.equal(currentIndex(normalizeStrip(strip7({ topic: 'done', script: 'done', approval: 'needs_you' }))), 2);
  assert.equal(currentIndex(normalizeStrip(strip7({ topic: 'done', render: 'failed' }))), 4);
  assert.equal(currentIndex(normalizeStrip(strip7())), -1);
});

test('T4: THE clickable strip names every station for screen readers', () => {
  const label = stripAria(normalizeStrip(strip7({ topic: 'done', script: 'running' })));
  assert.match(label, /^Topic: Done, Script: Running, You approve: Not yet/);
  assert.match(label, /Upload: Not yet$/);
});

test('R1: firstLine keeps one short line (no stack traces)', () => {
  assert.equal(firstLine('  alignment too weak: 12/21\n    at render (x.js:1)'), 'alignment too weak: 12/21');
  assert.equal(firstLine(null), '');
  assert.equal(firstLine('x'.repeat(300)).length, 160);
  assert.ok(firstLine('x'.repeat(300)).endsWith('…'));
});

/* --------------------------- /api/stations (T3) --------------------------- */

test('T3: IF /api/stations failed, was forbidden or is malformed, THEN there are no dots (null)', () => {
  assert.equal(stationsFromPayload(null), null);
  assert.equal(stationsFromPayload({ ok: false, error: 'db down' }), null);
  assert.equal(stationsFromPayload({ ok: true }), null);
  assert.equal(stationsFromPayload({ ok: true, channels: [] }), null);
  const ch = { mr: { jobId: 'j1', runId: 7, stations: strip7(), summary: 'Voice is running' } };
  assert.deepEqual(stationsFromPayload({ ok: true, channels: ch }), ch);
});

/* ------------------------- drawer target + log link ------------------------ */

test('T4: the steps URL prefers the job id, else the GitHub run id, else none', () => {
  assert.equal(stepsUrl({ jobId: 'a b', runId: 9 }), '/api/runs/steps?jobId=a%20b');
  assert.equal(stepsUrl({ runId: 123 }), '/api/runs/steps?runId=123');
  assert.equal(stepsUrl({}), null);
  assert.equal(stepsUrl(null), null);
  assert.equal(stepsUrl({ runId: 7 }, 'Asia/Karachi'), '/api/runs/steps?runId=7&tz=Asia%2FKarachi');
  assert.equal(stationsUrl('Asia/Karachi'), '/api/stations?tz=Asia%2FKarachi');
  assert.equal(stationsUrl(''), '/api/stations');
});

test('R2: THE raw log link comes from the matching run only (no invented URL)', () => {
  const todayRun = { id: 55, url: 'https://github.com/o/r/actions/runs/55' };
  assert.equal(matchRunUrl(55, todayRun), todayRun.url);
  assert.equal(matchRunUrl('55', todayRun), todayRun.url);
  assert.equal(matchRunUrl(56, todayRun), null);
  assert.equal(matchRunUrl(null, todayRun), null);
  assert.equal(matchRunUrl(55, { id: 55 }), null);
});

/* ---------------------------- drawer states (R1/R2) ---------------------------- */

test('R2: WHEN the API says no_job, THE drawer shows the friendly older-run state', () => {
  assert.equal(stepsView({ ok: false, reason: 'no_job' }).kind, 'no_job');
});

test('R1: anything else that is not ok is an error (Retry), never an empty "all fine"', () => {
  for (const b of [null, undefined, {}, { ok: false, error: 'x' }, { ok: true }, { ok: true, steps: 'nope' }]) {
    assert.equal(stepsView(b).kind, 'error', JSON.stringify(b));
  }
});

test('R1: an ok answer gives every step its fixed state word input, duration and one-line error, in idx order', () => {
  const v = stepsView({
    ok: true,
    job: { id: 'j', channel: 'mr', status: 'failed', startedAt: '2026-11-23T10:00:00Z', finishedAt: null, error: 'boom\nstack', runId: 9 },
    steps: [
      { idx: 51, name: 'station:script', label: 'Script', station: 'script', status: 'failed', state: 'failed', durationSec: 80, error: 'quota hit\n at x' },
      { idx: 2, name: 'fetch-trends', label: null, station: null, status: 'succeeded', state: undefined, durationSec: 42, error: null },
      { idx: 3, name: 'odd', label: 'Odd', station: null, status: 'weird', durationSec: null, error: null },
    ],
    stations: [{ key: 'script', state: 'failed' }],
    summary: 'Script failed',
  });
  assert.equal(v.kind, 'ok');
  assert.deepEqual(v.steps.map((s) => s.idx), [2, 3, 51]);
  assert.equal(v.steps[0].label, 'fetch-trends', 'no label → the step name');
  assert.equal(v.steps[0].state, 'done', 'state derived from status when missing');
  assert.equal(v.steps[0].duration, '42s');
  assert.equal(v.steps[1].state, 'unknown');
  assert.equal(v.steps[1].duration, '');
  assert.equal(v.steps[2].duration, '1m 20s');
  assert.equal(v.steps[2].errorLine, 'quota hit');
  assert.equal(v.jobError, 'boom');
  assert.equal(v.summary, 'Script failed');
  assert.equal(v.strip.length, 7);
  assert.equal(v.strip[1].state, 'failed');
});

test('R1: stepState trusts a valid state, else maps the job_steps status', () => {
  assert.equal(stepState({ state: 'needs_you', status: 'running' }), 'needs_you');
  assert.equal(stepState({ status: 'pending' }), 'not_yet');
  assert.equal(stepState({}), 'unknown');
});

/* ------------------------------ page wiring ------------------------------ */

const HOME = code(read('studio/app/page.js'));
const RUNS = code(read('studio/app/runs/page.js'));
const DOTS = code(read('studio/components/StationDots.js'));
const DRAWER = code(read('studio/components/RunStepsDrawer.js'));

test('T1/T3: Today fetches /api/stations on its own (never blocks the rows) and shows dots + summary per row', () => {
  assert.match(HOME, /apiFetch\(stationsUrl\(browserTimeZone\(\)\)\)/);
  assert.match(HOME, /stationsFromPayload\(/);
  const list = HOME.slice(HOME.indexOf('function TodayList'), HOME.indexOf('function OverviewContent'));
  assert.match(list, /<StationDots /);
  assert.match(list, /\.summary/);
  const m = /Promise\.allSettled\(\[([\s\S]*?)\]\)/.exec(HOME);
  assert.doesNotMatch(m[1], /api\/stations|stationsUrl/, 'the rows never wait for the stations call');
});

test('T2: Today adds no banner, card or alert text for station failures', () => {
  const list = HOME.slice(HOME.indexOf('function TodayList'), HOME.indexOf('function OverviewContent'));
  assert.doesNotMatch(list, /<Card[\s\S]*<Card/, 'still one card for the rows');
  assert.doesNotMatch(HOME, /stations?[^\n]*(?:role="alert"|<EmptyState)/i);
  assert.equal((HOME.match(/<section\b/g) || []).length, 1, 'one section (the rows) — verdict and chart are cards');
});

test('T3/T4/T5: the dots are a sibling button of the row link (no button inside a link), absent without data, and wrap on phones', () => {
  const list = HOME.slice(HOME.indexOf('function TodayList'), HOME.indexOf('function OverviewContent'));
  assert.match(list, /<\/Link>\s*<RowStations c=\{c\} \/>/);
  const row = list.slice(list.indexOf('function RowStations'));
  assert.match(row, /<button[\s\S]*?<StationDots /);
  assert.match(row, /return null;/, 'no entry / failed call → no dots');
  assert.match(list, /flex-wrap/);
  assert.match(HOME, /<RunStepsDrawer /);
});

test('R1: the Runs page opens the step drawer from a run row and keeps the GitHub log link', () => {
  assert.match(RUNS, /<RunStepsDrawer /);
  assert.match(RUNS, /setSteps\(\{\s*runId: r\.id,/);
  assert.match(RUNS, /label: 'Log', render: \(r\) => <LogLink url=\{r\.url\} \/>/);
});

test('dots: reduced motion respected; fixed words; kit tokens only', () => {
  assert.match(DOTS, /motion-safe:animate-pulse/);
  for (const src of [DOTS, DRAWER]) {
    assert.doesNotMatch(src, /text-\[\d+(?:\.\d+)?px\]/);
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,6}\b/);
  }
  assert.match(DRAWER, /STATE_WORD\[/);
  assert.match(DRAWER, /Step details start with runs after 23 Nov\. Open the raw log for older runs\./);
  assert.match(DRAWER, /Couldn&apos;t load steps|Couldn't load steps/);
  assert.match(DRAWER, /Raw log ↗/);
  assert.match(DRAWER, /from '@\/components\/Drawer'/);
});

/* ---------------------- fleet runs (one run id, many channels) ---------------------- */

test('R1 fleet: a run row with a channel asks for THAT channel (and gives the start time for the older-run fallback)', () => {
  assert.equal(
    stepsUrl({ runId: 5, channel: 'money-rulebook', startedAt: '2026-11-23T09:00:00Z' }, 'UTC'),
    '/api/runs/steps?runId=5&channel=money-rulebook&startedAt=2026-11-23T09%3A00%3A00Z&tz=UTC',
  );
  assert.equal(stepsUrl({ runId: 5, channel: null, startedAt: '2026-11-23T09:00:00Z' }), '/api/runs/steps?runId=5', 'fleet row: no channel, no fallback');
  assert.equal(stepsUrl({ jobId: 'j', channel: 'mr', startedAt: 'x' }), '/api/runs/steps?jobId=j', 'the job id needs nothing else');
});

test('R1 fleet: WHEN the API returns several jobs, THE drawer view is "multi" with one ok view per channel', () => {
  const one = (channel, summary) => ({ job: { id: channel, channel }, steps: [], stations: [], summary });
  const v = stepsView({ ok: true, jobs: [one('money-rulebook', 'Voice is running'), one('quotequarry', 'Uploaded 09:04')] });
  assert.equal(v.kind, 'multi');
  assert.deepEqual(v.items.map((i) => i.channel), ['money-rulebook', 'quotequarry']);
  assert.equal(v.items[0].view.kind, 'ok');
  assert.equal(v.items[1].view.summary, 'Uploaded 09:04');
  assert.equal(v.items[0].view.strip.length, 7);
  assert.equal(stepsView({ ok: true, jobs: [] }).kind, 'error', 'an empty list is not "all fine"');
  assert.equal(stepsView({ ok: true, jobs: [one('a', ''), { job: {}, steps: 'nope' }] }).kind, 'error', 'one malformed entry = error, never a partial guess');
});

test('R1 fleet: the Runs page passes the row channel; the drawer switches channel with a Segmented control', () => {
  assert.match(RUNS, /setSteps\(\{\s*runId: r\.id,\s*channel: r\.channel \|\| null,/);
  assert.match(RUNS, /labels: bySlug,/);
  assert.match(DRAWER, /view\.kind === 'multi'/);
  assert.match(DRAWER, /<Segmented\b/);
  assert.match(DRAWER, /overflow-x-auto/, 'many channels scroll sideways instead of overflowing on phones');
});
