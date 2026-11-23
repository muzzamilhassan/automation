// Creator City item 6, follow-up 2 — the /runs deep link. /runs?run=<GitHub
// run id>[&channel=<slug>] (or ?job=<job uuid>) opens the run's step drawer on
// load; the asks' "Open run" uses it whenever the run / job is known.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runHref, runTargetFromSearch } from '../studio/lib/run-link.mjs';
import { stationAsk, warningAsk } from '../studio/lib/asks.mjs';
import { STATION_KEYS } from '../studio/lib/stations.mjs';

const JOB = '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d';

test('runHref: run id (+ channel) when known, else the job id, else plain /runs', () => {
  assert.equal(runHref({ runId: '123456', channel: 'money-rulebook' }), '/runs?run=123456&channel=money-rulebook');
  assert.equal(runHref({ runId: 123456 }), '/runs?run=123456');
  assert.equal(runHref({ jobId: JOB, channel: 'money-rulebook' }), `/runs?job=${JOB}&channel=money-rulebook`);
  assert.equal(runHref({ runId: '77', jobId: JOB }), '/runs?run=77', 'the run id wins (it also carries the log link)');
  assert.equal(runHref({}), '/runs');
});

test('runHref: never emits a link the page would refuse (bad run id / non-uuid job / bad slug dropped)', () => {
  assert.equal(runHref({ runId: 'abc' }), '/runs');
  assert.equal(runHref({ jobId: 'j-1' }), '/runs');
  assert.equal(runHref({ runId: '5', channel: '../x' }), '/runs?run=5');
});

test('runTargetFromSearch: the page side — validated (parseStepsQuery rules), null when absent or bad', () => {
  assert.deepEqual(runTargetFromSearch('?run=123456&channel=money-rulebook'), { runId: '123456', jobId: null, channel: 'money-rulebook' });
  assert.deepEqual(runTargetFromSearch(`?job=${JOB}`), { runId: null, jobId: JOB, channel: null });
  assert.equal(runTargetFromSearch(''), null);
  assert.equal(runTargetFromSearch('?run=abc'), null);
  assert.equal(runTargetFromSearch('?job=j-1'), null);
  assert.equal(runTargetFromSearch('?run=1&channel=../x'), null);
  assert.equal(runTargetFromSearch(null), null);
});

test('round trip: what runHref builds, runTargetFromSearch opens', () => {
  const href = runHref({ runId: '42', channel: 'quotequarry' });
  assert.deepEqual(runTargetFromSearch(href.slice(href.indexOf('?'))), { runId: '42', jobId: null, channel: 'quotequarry' });
});

const job = (over = {}) => ({ id: JOB, channel: 'money-rulebook', status: 'failed', started_at: '2026-11-23T09:00:00.000Z', finished_at: '2026-11-23T09:30:00.000Z', error: null, meta: { runId: '9' }, resumed_from_job_id: null, ...over });
const st = (key, status) => ({ job_id: JOB, idx: 50 + STATION_KEYS.indexOf(key), name: `station:${key}`, status, started_at: '2026-11-23T09:01:00.000Z', finished_at: '2026-11-23T09:02:00.000Z', error: 'x' });

test('station ask "Open run" opens THAT run (run id from jobs.meta.runId), or the job when no run id', () => {
  const a = stationAsk({ job: job(), steps: [st('voice', 'failed')] });
  assert.equal(a.options.find((o) => o.id === 'open').href, '/runs?run=9&channel=money-rulebook');
  const b = stationAsk({ job: job({ meta: {} }), steps: [st('voice', 'failed')] });
  assert.equal(b.options.find((o) => o.id === 'open').href, `/runs?job=${JOB}&channel=money-rulebook`);
});

test('upload_failed "Open run" opens its job', () => {
  const a = warningAsk({ id: '44', channel_id: 'money-rulebook', severity: 'action_required', code: 'upload_failed', title: 'upload failed', evidence: 'HTTP 500', job_id: JOB });
  assert.equal(a.options.find((o) => o.id === 'open').href, `/runs?job=${JOB}&channel=money-rulebook`);
});

test('/runs page: reads the deep link once after the first load and opens the SAME drawer state a row click uses', () => {
  const src = fs.readFileSync('studio/app/runs/page.js', 'utf8');
  assert.match(src, /import \{ runTargetFromSearch \} from '@\/lib\/run-link\.mjs';/);
  assert.match(src, /runTargetFromSearch\(window\.location\.search\)/);
  assert.match(src, /deepLinked\.current = true;/, 'once per page load');
  assert.match(src, /setSteps\(\{\s*\.\.\.link,/);
  assert.match(src, /<RunStepsDrawer open=\{Boolean\(steps\)\} target=\{drawerTarget\} onClose=\{\(\) => setSteps\(null\)\} \/>/);
  assert.doesNotMatch(src, /useSearchParams/, 'no Suspense-bound hook on this client page');
});
