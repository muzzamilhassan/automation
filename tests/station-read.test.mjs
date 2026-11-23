// Creator City Phase 1 (FEEDBACK item O) — the pure station reader
// (studio/lib/station-read.mjs) and the Neon read seam (studio/lib/jobs-read.mjs,
// exercised with an injected fake client). EARS criteria in the test names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveStrip, mapSteps, shortError, stepState, pickForJob, belongsToJob, stationsPayload, parseStepsQuery, safeTimeZone, toIso, runIdOf, stepsPayload } from '../studio/lib/station-read.mjs';
import { makeJobsRead, utcDay } from '../studio/lib/jobs-read.mjs';
import { STATION_KEYS } from '../studio/lib/stations.mjs';

const T0 = '2026-11-23T09:00:00.000Z';
const at = (min) => new Date(Date.parse(T0) + min * 60_000).toISOString();
const job = (over = {}) => ({ id: 'j-1', channel: 'money-rulebook', status: 'running', started_at: T0, finished_at: null, error: null, meta: { runId: '123' }, resumed_from_job_id: null, ...over });
const st = (key, status, over = {}) => ({ idx: 50 + STATION_KEYS.indexOf(key), name: `station:${key}`, status, started_at: at(1), finished_at: status === 'running' || status === 'pending' ? null : at(2), error: null, ...over });
const byKey = (strip) => Object.fromEntries(strip.map((s) => [s.key, s]));

// ---------------------------------------------------------------- no job
test('WHEN there is no job THEN the strip is all not_yet and the summary says no run yet today', () => {
  const r = deriveStrip({ job: null, steps: [] });
  assert.equal(r.stations.length, 7);
  assert.ok(r.stations.every((s) => s.state === 'not_yet' && s.at === null && s.detail === null));
  assert.equal(r.summary, 'No run yet today');
});

test('WHEN there is no job THEN a stray script/intent row never paints the strip', () => {
  const r = deriveStrip({ job: null, scripts: [{ status: 'awaiting_review', job_id: 'j-0' }], intents: [{ status: 'uploaded', job_id: 'j-0', video_id: 'v' }] });
  assert.ok(r.stations.every((s) => s.state === 'not_yet'));
});

// ------------------------------------------------------- station rows
test('WHEN station rows exist THEN each maps through stateFromStepStatus with its time', () => {
  const r = deriveStrip({ job: job(), steps: [st('topic', 'succeeded'), st('script', 'succeeded'), st('approval', 'skipped', { error: 'auto: no approval needed' }), st('voice', 'running'), st('render', 'pending')] });
  const s = byKey(r.stations);
  assert.equal(s.topic.state, 'done');
  assert.equal(s.topic.at, at(2));
  assert.equal(s.voice.state, 'running');
  assert.equal(s.voice.at, at(1), 'running → started_at');
  assert.equal(s.render.state, 'not_yet');
  assert.equal(s.thumbnail.state, 'not_yet', 'missing row on a running job = not yet');
  assert.equal(r.summary, 'Voice is running');
});

test('WHEN approval is skipped with a held: error THEN approval needs_you with "Waiting for your OK"', () => {
  const r = deriveStrip({ job: job({ status: 'held', finished_at: at(3) }), steps: [st('topic', 'succeeded'), st('script', 'succeeded'), st('approval', 'skipped', { error: 'held: review gate on' })] });
  const s = byKey(r.stations);
  assert.equal(s.approval.state, 'needs_you');
  assert.equal(s.approval.detail, 'Waiting for your OK');
  assert.equal(s.voice.state, 'not_yet', 'finished job with SOME station rows → missing rows were never reached');
  assert.equal(r.summary, 'Waiting for your OK on the script');
});

test('WHEN approval is skipped with auto: THEN approval is skipped with "No approval needed"', () => {
  const s = byKey(deriveStrip({ job: job(), steps: [st('approval', 'skipped', { error: 'auto: no approval needed' })] }).stations);
  assert.equal(s.approval.state, 'skipped');
  assert.equal(s.approval.detail, 'No approval needed');
});

test('WHEN a station failed THEN the summary names it with a short first-line reason', () => {
  const r = deriveStrip({ job: job({ status: 'failed', finished_at: at(9) }), steps: [st('topic', 'succeeded'), st('voice', 'succeeded'), st('render', 'failed', { error: 'SIGTERM at 2700s\n    at render (x.mjs:1)\n' })] });
  assert.equal(byKey(r.stations).render.state, 'failed');
  assert.equal(byKey(r.stations).render.detail, 'SIGTERM at 2700s');
  assert.equal(r.summary, 'Failed at Render: SIGTERM at 2700s');
});

// ------------------------------------------------------- legacy job
test('WHEN the job finished and has NO station rows and no runId (pre-tracking) THEN every station is unknown "older than step tracking"', () => {
  const r = deriveStrip({ job: job({ status: 'succeeded', finished_at: at(30), meta: {} }), steps: [{ idx: 0, name: 'preflight', status: 'succeeded' }, { idx: 1, name: 'post', status: 'succeeded' }] });
  assert.ok(r.stations.every((s) => s.state === 'unknown'));
  assert.equal(r.stations[0].detail, 'Not tracked — run is older than step tracking');
  assert.equal(r.summary, 'Last run finished — steps not tracked');
});

test('WHEN a NEW run (has a runId) finished with NO station rows THEN unknown says "Steps not recorded for this run" (recording failed, not old)', () => {
  const r = deriveStrip({ job: job({ status: 'succeeded', finished_at: at(30) }), steps: [{ idx: 0, name: 'preflight', status: 'succeeded' }] });
  assert.ok(r.stations.every((s) => s.state === 'unknown'));
  assert.equal(r.stations[0].detail, 'Steps not recorded for this run');
  assert.equal(r.summary, 'Last run finished — steps not recorded');
  const old = deriveStrip({ job: job({ status: 'succeeded', started_at: '2026-11-20T09:00:00.000Z', finished_at: '2026-11-20T09:30:00.000Z' }), steps: [] });
  assert.equal(old.stations[0].detail, 'Not tracked — run is older than step tracking', 'started before tracking began → older, even with a runId');
});

test('WHEN the job is still running and has no station rows THEN stations are not_yet (not unknown)', () => {
  const r = deriveStrip({ job: job(), steps: [] });
  assert.ok(r.stations.every((s) => s.state === 'not_yet'));
  assert.equal(r.summary, 'Run in progress');
});

// ------------------------------------------------------- script overlay
test('WHEN today\'s script for this job is awaiting_review THEN approval needs_you', () => {
  const r = deriveStrip({ job: job(), steps: [], scripts: [{ status: 'awaiting_review', job_id: 'j-1', created_at: at(1) }] });
  assert.equal(byKey(r.stations).approval.state, 'needs_you');
  assert.equal(r.summary, 'Waiting for your OK on the script');
});

test('WHEN today\'s script is approved or consumed THEN approval is done; rejected THEN failed "You rejected it"', () => {
  for (const status of ['approved', 'consumed']) {
    const s = byKey(deriveStrip({ job: job(), scripts: [{ status, job_id: 'j-1', approval_at: at(4) }] }).stations);
    assert.equal(s.approval.state, 'done', status);
    assert.equal(s.approval.at, at(4));
  }
  const r = deriveStrip({ job: job({ status: 'held', finished_at: at(2) }), steps: [st('approval', 'skipped', { error: 'held: x' })], scripts: [{ status: 'rejected', job_id: 'j-1', rejected_at: at(5) }] });
  assert.equal(byKey(r.stations).approval.state, 'failed');
  assert.equal(byKey(r.stations).approval.detail, 'You rejected it');
  assert.equal(r.summary, 'Failed at You approve: You rejected it');
});

test('WHEN the held job\'s script is approved after the hold THEN approval reads done (owner already acted)', () => {
  const r = deriveStrip({ job: job({ status: 'held', finished_at: at(2) }), steps: [st('topic', 'succeeded'), st('approval', 'skipped', { error: 'held: gate' })], scripts: [{ status: 'approved', job_id: 'j-1', approval_at: at(30) }] });
  assert.equal(byKey(r.stations).approval.state, 'done');
  assert.equal(r.summary, 'Approved — waiting for the video build');
});

test('WHEN a resume job runs THEN the parent job\'s script still counts (resumed_from_job_id)', () => {
  const r = deriveStrip({ job: job({ id: 'j-2', resumed_from_job_id: 'j-1' }), scripts: [{ status: 'approved', job_id: 'j-1' }] });
  assert.equal(byKey(r.stations).approval.state, 'done');
});

// ------------------------------------------------------- upload overlay
test('WHEN today\'s intent is uploaded THEN upload is done with the videoId and the summary gives the time', () => {
  const r = deriveStrip({ job: job({ status: 'succeeded', finished_at: at(10) }), steps: [st('upload', 'running')], intents: [{ status: 'uploaded', job_id: 'j-1', video_id: 'abc123', updated_at: '2026-11-23T09:04:30.000Z' }] });
  const s = byKey(r.stations);
  assert.equal(s.upload.state, 'done');
  assert.equal(s.upload.detail, 'abc123');
  assert.equal(r.summary, 'Uploaded 09:04');
});

test('WHEN today\'s intent is initiated/uploading THEN upload is running; failed/abandoned THEN failed with fail_reason', () => {
  for (const status of ['initiated', 'uploading']) {
    assert.equal(byKey(deriveStrip({ job: job(), intents: [{ status, job_id: 'j-1' }] }).stations).upload.state, 'running', status);
  }
  for (const status of ['failed', 'abandoned']) {
    const s = byKey(deriveStrip({ job: job(), intents: [{ status, job_id: 'j-1', fail_reason: 'quotaExceeded\nstack' }] }).stations);
    assert.equal(s.upload.state, 'failed', status);
    assert.equal(s.upload.detail, 'quotaExceeded');
  }
  assert.equal(byKey(deriveStrip({ job: job(), intents: [{ status: 'pending', job_id: 'j-1' }] }).stations).upload.state, 'not_yet', 'pending intent = nothing to say');
});

test('WHEN the summary time zone is given THEN the upload clock uses it', () => {
  const r = deriveStrip({ job: job(), intents: [{ status: 'uploaded', job_id: 'j-1', updated_at: '2026-11-23T09:04:00.000Z' }], timeZone: 'Asia/Karachi' });
  assert.equal(r.summary, 'Uploaded 14:04');
});

// ------------------------------------------------------- stale-state reset
test('WHEN a new job starts THEN states from an OLDER job\'s script/intent never carry over', () => {
  const older = { scripts: [{ status: 'awaiting_review', job_id: 'j-old', created_at: at(-120) }], intents: [{ status: 'uploaded', job_id: 'j-old', video_id: 'old', updated_at: at(-100) }] };
  const r = deriveStrip({ job: job({ id: 'j-new' }), steps: [st('topic', 'running')], ...older });
  const s = byKey(r.stations);
  assert.equal(s.approval.state, 'not_yet');
  assert.equal(s.upload.state, 'not_yet');
  assert.equal(r.summary, 'Topic is running');
});

test('WHEN a script/intent has no job_id THEN it counts only if created at/after the job started', () => {
  const j = job();
  assert.equal(belongsToJob({ job_id: null, created_at: at(-1) }, j), false);
  assert.equal(belongsToJob({ job_id: null, created_at: at(1) }, j), true);
  assert.equal(belongsToJob({ job_id: null }, j), false, 'no timestamp → cannot vouch');
  assert.equal(belongsToJob({ job_id: 'j-1' }, j), true);
  assert.equal(belongsToJob({ job_id: 'other' }, j), false);
});

test('WHEN several of today\'s rows belong THEN pickForJob prefers this job\'s own row, newest first', () => {
  const j = job({ resumed_from_job_id: 'j-0' });
  const rows = [
    { id: 'a', job_id: 'j-0', updated_at: at(9) },
    { id: 'b', job_id: 'j-1', updated_at: at(3) },
    { id: 'c', job_id: 'j-1', updated_at: at(5) },
    { id: 'd', job_id: 'zzz', updated_at: at(20) },
  ];
  assert.equal(pickForJob(rows, j).id, 'c');
  assert.equal(pickForJob([rows[0], rows[3]], j).id, 'a');
  assert.equal(pickForJob([rows[3]], j), null);
});

// ------------------------------------------------------- summaries
test('WHEN the job finished without upload or failure THEN the summary is honest about it', () => {
  assert.equal(deriveStrip({ job: job({ status: 'succeeded', finished_at: at(5) }), steps: [st('topic', 'succeeded'), st('upload', 'skipped')] }).summary, 'Run finished — nothing uploaded');
  assert.equal(deriveStrip({ job: job({ status: 'failed', finished_at: at(5), error: 'boom\nstack' }), steps: [st('topic', 'succeeded')] }).summary, 'Run failed: boom');
  assert.equal(deriveStrip({ job: job({ status: 'failed', finished_at: at(5), meta: {} }), steps: [] }).summary, 'Run failed — steps not tracked');
  assert.equal(deriveStrip({ job: job({ status: 'partial', finished_at: at(5) }), steps: [st('topic', 'succeeded')] }).summary, 'Run finished with problems');
});

// ------------------------------------------------------- helpers
test('shortError keeps the first non-empty line, trimmed and capped', () => {
  assert.equal(shortError('\n  first line  \nsecond'), 'first line');
  assert.equal(shortError(null), null);
  assert.equal(shortError('   '), null);
  const long = shortError('x'.repeat(400));
  assert.ok(long.length <= 140 && long.endsWith('…'));
});

test('stepState: skipped + held: → needs_you, everything else via stateFromStepStatus', () => {
  assert.equal(stepState({ status: 'skipped', error: 'held: gate' }), 'needs_you');
  assert.equal(stepState({ status: 'skipped', error: 'auto: no approval needed' }), 'skipped');
  assert.equal(stepState({ status: 'succeeded' }), 'done');
  assert.equal(stepState({ status: 'weird' }), 'unknown');
});

// ------------------------------------------------------- drawer mapper
test('mapSteps: every job_step (station + coarse) → friendly label, station key, state, duration, short error, sorted by idx', () => {
  const rows = [
    { idx: 90, name: 'review', status: 'skipped', error: 'held: review gate on\nmore', started_at: null, finished_at: at(3) },
    { idx: 54, name: 'station:render', status: 'failed', started_at: at(1), finished_at: at(3), error: 'crash\n at x' },
    { idx: 0, name: 'preflight', status: 'succeeded', started_at: T0, finished_at: at(0.5) },
    { idx: 1, name: 'post', status: 'running', started_at: at(1), finished_at: null },
    { idx: 2, name: 'skipped-clips', status: 'skipped' },
    { idx: 3, name: 'mystery', status: 'pending' },
  ];
  const out = mapSteps(rows, { now: Date.parse(at(4)) });
  assert.deepEqual(out.map((s) => s.idx), [0, 1, 2, 3, 54, 90]);
  const by = Object.fromEntries(out.map((s) => [s.name, s]));
  assert.equal(by.preflight.label, 'Checks');
  assert.equal(by.preflight.durationSec, 30);
  assert.equal(by.preflight.station, null);
  assert.equal(by.post.label, 'Daily video');
  assert.equal(by.post.durationSec, 180, 'running step → elapsed so far');
  assert.equal(by['skipped-clips'].label, 'Clips (turned off)');
  assert.equal(by.mystery.label, 'mystery');
  assert.equal(by['station:render'].label, 'Render');
  assert.equal(by['station:render'].station, 'render');
  assert.equal(by['station:render'].state, 'failed');
  assert.equal(by['station:render'].error, 'crash');
  assert.equal(by.review.label, 'Review hold');
  assert.equal(by.review.state, 'needs_you');
  assert.equal(by.review.error, 'held: review gate on');
  assert.equal(by.review.durationSec, null, 'no start → no duration');
  assert.deepEqual(Object.keys(by.preflight).sort(), ['durationSec', 'error', 'finishedAt', 'idx', 'label', 'name', 'startedAt', 'state', 'station', 'status']);
});

test('mapSteps labels every coarse step name', () => {
  const want = { preflight: 'Checks', post: 'Daily video', clips: 'Clips', 'brain-embed': 'Memory', verify: 'Check upload', fb: 'Facebook post', poster: 'Cross-post', episode: 'Long video', staging: 'TikTok staging', review: 'Review hold' };
  const out = mapSteps(Object.keys(want).map((name, idx) => ({ idx, name, status: 'pending' })));
  for (const s of out) assert.equal(s.label, want[s.name], s.name);
});

test('mapSteps turns Date objects (postgres.js) into ISO strings', () => {
  const [s] = mapSteps([{ idx: 0, name: 'post', status: 'succeeded', started_at: new Date(T0), finished_at: new Date(at(1)) }]);
  assert.equal(s.startedAt, T0);
  assert.equal(s.durationSec, 60);
});

// ------------------------------------------------------- payload + query
test('stationsPayload: one entry per known channel; no job → nulls + "No run yet today"; channels outside the list are dropped', () => {
  const today = new Map([
    ['money-rulebook', { job: job(), steps: [st('voice', 'running')], scripts: [], intents: [] }],
    ['ghost', { job: job({ id: 'g', channel: 'ghost' }), steps: [], scripts: [], intents: [] }],
  ]);
  const out = stationsPayload({ channels: [{ slug: 'money-rulebook' }, { slug: 'quotequarry' }], today });
  assert.deepEqual(Object.keys(out).sort(), ['money-rulebook', 'quotequarry']);
  const mr = out['money-rulebook'];
  assert.equal(mr.jobId, 'j-1');
  assert.equal(mr.runId, '123');
  assert.equal(mr.startedAt, T0);
  assert.equal(mr.finishedAt, null);
  assert.equal(mr.jobStatus, 'running');
  assert.equal(mr.stations.length, 7);
  assert.equal(mr.summary, 'Voice is running');
  assert.deepEqual(out.quotequarry, { jobId: null, runId: null, startedAt: null, finishedAt: null, jobStatus: null, stations: out.quotequarry.stations, summary: 'No run yet today' });
  assert.ok(out.quotequarry.stations.every((s) => s.state === 'not_yet'));
});

test('parseStepsQuery validates runId digits, jobId uuid, channel slug, startedAt date', () => {
  const q = (o) => parseStepsQuery(new URLSearchParams(o));
  assert.deepEqual(q({ runId: '41478922660' }), { ok: true, runId: '41478922660', jobId: null, channel: null, startedAt: null });
  assert.equal(q({ jobId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' }).jobId, '3f2504e0-4f89-41d3-9a0c-0305e82c3301');
  assert.equal(q({}).ok, false);
  assert.equal(q({ runId: '12a' }).ok, false);
  assert.equal(q({ runId: "1' OR 1=1" }).ok, false);
  assert.equal(q({ jobId: 'not-a-uuid' }).ok, false);
  assert.equal(q({ runId: '1', channel: '../x' }).ok, false);
  assert.equal(q({ runId: '1', startedAt: 'yesterday' }).ok, false);
  assert.deepEqual(q({ runId: '9', channel: 'money-rulebook', startedAt: T0 }), { ok: true, runId: '9', jobId: null, channel: 'money-rulebook', startedAt: T0 });
});

// ------------------------------------------------------- jobs-read (fake client)
function fakeDb(handlers) {
  const calls = [];
  const client = async (sql, params) => {
    calls.push({ sql, params });
    for (const [re, fn] of handlers) if (re.test(sql)) return typeof fn === 'function' ? fn(params, sql) : fn;
    return [];
  };
  return { client, calls };
}

test('jobs-read loadToday: latest job per channel in the last 24h + its steps + today\'s scripts/intents, grouped by channel', async () => {
  const now = new Date('2026-11-23T12:00:00.000Z');
  const { client, calls } = fakeDb([
    [/FROM job_steps/, [{ job_id: 'j-1', ...st('voice', 'running') }, { job_id: 'j-2', ...st('topic', 'succeeded') }]],
    [/FROM jobs/, [job({ id: 'j-1' }), job({ id: 'j-2', channel: 'quotequarry' })]],
    [/FROM scripts/, [{ channel_id: 'money-rulebook', status: 'approved', job_id: 'j-1' }]],
    [/FROM upload_intents/, [{ channel_id: 'quotequarry', status: 'uploaded', job_id: 'j-2' }]],
  ]);
  const map = await makeJobsRead(client).loadToday({ now });
  assert.equal(map.get('money-rulebook').job.id, 'j-1');
  assert.equal(map.get('money-rulebook').steps.length, 1);
  assert.equal(map.get('money-rulebook').scripts.length, 1);
  assert.equal(map.get('quotequarry').intents.length, 1);
  const jobsCall = calls.find((c) => /FROM jobs/.test(c.sql));
  assert.match(jobsCall.sql, /DISTINCT ON \(channel\)/);
  assert.equal(jobsCall.params[0], '2026-11-22T12:00:00.000Z', '24h window');
  const scriptCall = calls.find((c) => /FROM scripts/.test(c.sql));
  assert.equal(scriptCall.params[0], '2026-11-23', 'today = UTC slot day (pipeline basis)');
});

test('jobs-read loadToday: steps are read for the EXACT job ids the jobs query returned (no second "latest" select racing it)', async () => {
  const { client, calls } = fakeDb([
    [/FROM job_steps/, []],
    [/FROM jobs/, [job({ id: 'j-1' }), job({ id: 'j-2', channel: 'quotequarry' })]],
  ]);
  await makeJobsRead(client).loadToday({ now: new Date('2026-11-23T12:00:00.000Z') });
  const jobsIdx = calls.findIndex((c) => /FROM jobs\b/.test(c.sql));
  const stepsIdx = calls.findIndex((c) => /FROM job_steps/.test(c.sql));
  assert.ok(stepsIdx > jobsIdx, 'steps after jobs');
  const stepsCall = calls[stepsIdx];
  assert.doesNotMatch(stepsCall.sql, /DISTINCT ON|FROM jobs\b/);
  assert.match(stepsCall.sql, /job_id IN \(\$1, \$2\)/);
  assert.deepEqual(stepsCall.params, ['j-1', 'j-2']);
});

test('jobs-read loadToday: no job in 24h → no steps query at all', async () => {
  const { client, calls } = fakeDb([]);
  await makeJobsRead(client).loadToday({ now: new Date() });
  assert.equal(calls.some((c) => /FROM job_steps/.test(c.sql)), false);
});

test('jobs-read loadToday: a job held on day D and approved after 00:00 UTC still finds its script by job_id (and a resume finds the parent\'s)', async () => {
  const now = new Date('2026-11-24T01:00:00.000Z');
  const held = job({ id: 'j-held', status: 'held', started_at: '2026-11-23T22:00:00.000Z', finished_at: '2026-11-23T22:05:00.000Z' });
  const resumed = job({ id: 'j-res', channel: 'quotequarry', resumed_from_job_id: 'j-par', started_at: '2026-11-24T00:30:00.000Z' });
  const seen = {};
  const { client } = fakeDb([
    [/FROM job_steps/, [{ job_id: 'j-held', ...st('approval', 'skipped', { error: 'held: gate' }) }]],
    [/FROM jobs/, [held, resumed]],
    [/FROM scripts/, (params, sql) => {
      seen.scripts = { params, sql };
      return [
        { channel_id: 'money-rulebook', status: 'approved', job_id: 'j-held', slot_date: '2026-11-23', approval_at: '2026-11-24T00:10:00.000Z' },
        { channel_id: 'quotequarry', status: 'approved', job_id: 'j-par', slot_date: '2026-11-23' },
      ];
    }],
    [/FROM upload_intents/, (params, sql) => { seen.intents = { params, sql }; return []; }],
  ]);
  const map = await makeJobsRead(client).loadToday({ now });
  assert.match(seen.scripts.sql, /job_id IN \(\$3, \$4, \$5\)/);
  assert.deepEqual(seen.scripts.params, ['2026-11-24', '2026-11-23T01:00:00.000Z', 'j-held', 'j-res', 'j-par']);
  assert.match(seen.intents.sql, /job_id IN \(\$2, \$3\)/);
  assert.deepEqual(seen.intents.params, ['2026-11-24', 'j-held', 'j-res']);
  const mr = deriveStrip(map.get('money-rulebook'));
  assert.equal(byKey(mr.stations).approval.state, 'done', 'never "Needs you" after the owner approved past midnight');
  const qq = deriveStrip(map.get('quotequarry'));
  assert.equal(byKey(qq.stations).approval.state, 'done', 'the resume run sees the parent\'s approved script');
});

test('jobs-read: a DB failure THROWS (the route turns it into 503, never fake data); a missing table reads as empty', async () => {
  const broken = async () => { throw new Error('connection terminated'); };
  await assert.rejects(makeJobsRead(broken).loadToday({ now: new Date() }));
  const noTable = async (sql) => {
    if (/FROM upload_intents/.test(sql)) { const e = new Error('relation "upload_intents" does not exist'); e.code = '42P01'; throw e; }
    if (/FROM jobs\b/.test(sql)) return [job()];
    return [];
  };
  const map = await makeJobsRead(noTable).loadToday({ now: new Date() });
  assert.deepEqual(map.get('money-rulebook').intents, []);
});

test('jobs-read loadRuns: by jobId → one record with its steps, scripts and intents', async () => {
  const id = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
  const { client } = fakeDb([
    [/FROM job_steps/, [{ job_id: id, ...st('topic', 'succeeded') }]],
    [/FROM scripts/, [{ job_id: id, status: 'approved', channel_id: 'money-rulebook' }]],
    [/WHERE id = \$1/, [job({ id })]],
  ]);
  const recs = await makeJobsRead(client).loadRuns({ jobId: id });
  assert.equal(recs.length, 1);
  assert.equal(recs[0].job.id, id);
  assert.equal(recs[0].steps.length, 1);
  assert.equal(recs[0].scripts.length, 1, 'the run\'s own scripts are read');
  assert.deepEqual(recs[0].intents, []);
});

test('jobs-read loadRuns: a fleet run id (one GitHub run, many channels) → EVERY channel\'s job, steps split per job', async () => {
  const { client, calls } = fakeDb([
    [/FROM job_steps/, [{ job_id: 'a', ...st('topic', 'succeeded') }, { job_id: 'b', ...st('voice', 'running') }, { job_id: 'b', ...st('topic', 'succeeded') }]],
    [/meta->>'runId' = \$1/, [job({ id: 'a', channel: 'money-rulebook' }), job({ id: 'b', channel: 'quotequarry' })]],
  ]);
  const recs = await makeJobsRead(client).loadRuns({ runId: '777' });
  assert.deepEqual(recs.map((r) => r.job.id), ['a', 'b']);
  assert.equal(recs[0].steps.length, 1);
  assert.equal(recs[1].steps.length, 2);
  const byRun = calls.find((c) => /meta->>'runId' = \$1/.test(c.sql));
  assert.doesNotMatch(byRun.sql, /LIMIT 1/, 'never a random single channel');
  assert.deepEqual(byRun.params, ['777']);
});

test('jobs-read loadRuns: runId + channel → only that channel\'s job', async () => {
  const { client, calls } = fakeDb([
    [/meta->>'runId' = \$1 AND channel = \$2/, (params) => (params[1] === 'quotequarry' ? [job({ id: 'b', channel: 'quotequarry' })] : [])],
  ]);
  const recs = await makeJobsRead(client).loadRuns({ runId: '777', channel: 'quotequarry' });
  assert.deepEqual(recs.map((r) => r.job.id), ['b']);
  assert.ok(calls.find((c) => /AND channel = \$2/.test(c.sql)));
});

test('jobs-read loadRuns: no runId match → the channel+time fallback (±10 min, never a job owned by another run)', async () => {
  const near = fakeDb([
    [/interval '10 minutes'/, (params) => (params[0] === 'money-rulebook' ? [job({ id: 'near' })] : [])],
    [/meta->>'runId' = \$1/, []],
  ]);
  const recs = await makeJobsRead(near.client).loadRuns({ runId: '555', channel: 'money-rulebook', startedAt: T0 });
  assert.equal(recs[0].job.id, 'near');
  const fb = near.calls.find((c) => /interval '10 minutes'/.test(c.sql));
  assert.match(fb.sql, /meta->>'runId' IS NULL OR meta->>'runId' = \$3/, 'never steal a job that belongs to another run');
  assert.deepEqual(fb.params, ['money-rulebook', T0, '555']);

  const none = fakeDb([]);
  assert.deepEqual(await makeJobsRead(none.client).loadRuns({ runId: '555' }), [], 'no runId match and no fallback inputs → []');
  assert.equal(none.calls.some((c) => /interval/.test(c.sql)), false);
});

// ------------------------------------------------------- steps payload
test('stepsPayload: none → no_job; one → the single-job shape; several (fleet run) → { ok, jobs:[…] } sorted by channel', () => {
  assert.deepEqual(stepsPayload([]), { ok: false, reason: 'no_job' });
  const one = stepsPayload([{ job: job({ error: 'x\ny' }), steps: [st('voice', 'running')], scripts: [], intents: [] }], { now: Date.parse(at(5)) });
  assert.equal(one.ok, true);
  assert.deepEqual(Object.keys(one).sort(), ['job', 'ok', 'stations', 'steps', 'summary']);
  assert.deepEqual(one.job, { id: 'j-1', channel: 'money-rulebook', status: 'running', startedAt: T0, finishedAt: null, error: 'x', runId: '123' });
  assert.equal(one.summary, 'Voice is running');
  assert.equal(one.steps[0].label, 'Voice');
  const many = stepsPayload([
    { job: job({ id: 'q', channel: 'quotequarry' }), steps: [] },
    { job: job({ id: 'm', channel: 'money-rulebook' }), steps: [st('topic', 'running')] },
  ]);
  assert.equal(many.ok, true);
  assert.equal(many.job, undefined);
  assert.deepEqual(many.jobs.map((j) => j.job.channel), ['money-rulebook', 'quotequarry']);
  assert.equal(many.jobs[0].summary, 'Topic is running');
  assert.equal(many.jobs[0].stations.length, 7);
});

test('utcDay is the pipeline\'s slot day (UTC)', () => {
  assert.equal(utcDay(new Date('2026-11-23T23:30:00.000-05:00')), '2026-11-24');
});

test('safeTimeZone accepts a real IANA zone and falls back to UTC; toIso/runIdOf normalise', () => {
  assert.equal(safeTimeZone('Asia/Karachi'), 'Asia/Karachi');
  assert.equal(safeTimeZone('Not/AZone'), 'UTC');
  assert.equal(safeTimeZone(null), 'UTC');
  assert.equal(toIso(new Date(T0)), T0);
  assert.equal(toIso('garbage'), null);
  assert.equal(runIdOf({ meta: { runId: 42 } }), '42');
  assert.equal(runIdOf({ meta: {} }), null);
  assert.equal(runIdOf(null), null);
});
