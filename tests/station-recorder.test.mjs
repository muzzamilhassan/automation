// Creator City Phase 1 (FEEDBACK item O) — the best-effort station recorder.
//
// The production pipeline records the 7 production stations (topic … upload,
// studio/lib/stations.mjs) as job_steps rows `station:<key>` at the reserved
// idx range 50..56. Recording is strictly best-effort: it never throws, never
// blocks for long, and is a silent no-op when the job store is off.
//
// Fakes only (house pattern: no live Neon in unit CI) — an in-memory
// job_steps table behind the job store's own upsertStep SQL, plus throwing /
// hanging stores for the fail-open contract.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATION_KEYS, stepNameFor } from '../studio/lib/stations.mjs';
import {
  STATION_IDX_BASE, stationIdx, shortError, makeStationRecorder, markStation, makeChildStations,
} from '../lib/station-recorder.mjs';
import { makeJobStore } from '../lib/job-store.mjs';

// In-memory job_steps behind lib/job-store.mjs's upsertStep statement. The
// fake applies the statement's documented semantics from its params, and
// refuses any SQL shape it does not know (a passing test cannot be trivially
// green).
function makeStepsDb() {
  const rows = new Map();
  const calls = [];
  const client = async (sql, params) => {
    calls.push({ sql, params });
    if (/^\s*CREATE TABLE IF NOT EXISTS/i.test(sql)) return [];
    // resetSteps: one batched INSERT of N pending rows; ON CONFLICT clears them
    if (/INSERT INTO job_steps[\s\S]*ON CONFLICT \(job_id, idx\) DO UPDATE SET[\s\S]*status = 'pending'/i.test(sql)) {
      const [jobId, ...pairs] = params;
      const out = [];
      for (let p = 0; p < pairs.length; p += 2) {
        const idx = pairs[p];
        rows.set(`${jobId}#${idx}`, { job_id: jobId, idx, name: pairs[p + 1], status: 'pending', started_at: null, finished_at: null, error: null });
        out.push({ idx });
      }
      return out;
    }
    if (/INSERT INTO job_steps[\s\S]*ON CONFLICT \(job_id, idx\) DO UPDATE/i.test(sql)) {
      const [jobId, idx, name, status, startedAt, finishedAt, error] = params;
      const k = `${jobId}#${idx}`;
      const prev = rows.get(k);
      const started = !prev ? startedAt : (status === 'running' ? startedAt : (prev.started_at ?? startedAt));
      rows.set(k, { job_id: jobId, idx, name, status, started_at: started, finished_at: finishedAt, error });
      return [{ idx }];
    }
    throw new Error('fake db: unsupported SQL: ' + sql.slice(0, 60));
  };
  return { client, rows, calls };
}

function clockFrom(start = Date.parse('2026-11-23T08:00:00Z')) {
  let t = start;
  return () => new Date((t += 1000));
}

describe('station vocabulary mapping', () => {
  test('the 7 stations map to the reserved idx range 50..56 in STATIONS order', () => {
    assert.equal(STATION_IDX_BASE, 50);
    assert.deepEqual(STATION_KEYS.map(stationIdx), [50, 51, 52, 53, 54, 55, 56]);
    assert.equal(stationIdx('topic'), 50);
    assert.equal(stationIdx('upload'), 56);
  });

  test('an unknown station key throws in the pure mapper (a typo must fail loudly in tests)', () => {
    assert.throws(() => stationIdx('thumbnails'), /unknown station/);
  });
});

describe('shortError — a SHORT plain message, no secrets', () => {
  test('first line only, at most 200 chars', () => {
    const e = new Error('boom on line one\n    at Object.<anonymous> (C:\\x\\y.mjs:1:1)');
    assert.equal(shortError(e), 'boom on line one');
    assert.equal(shortError('word '.repeat(100)).length, 200);
    assert.equal(shortError(null), null);
    assert.equal(shortError(''), null);
  });

  test('credentials in URLs, query tokens, bearer headers and long token blobs are redacted', () => {
    const msg = shortError('connect failed postgres://neondb_owner:s3cretPass@ep-x.neon.tech/db?sslmode=require&access_token=ya29.abcdefghijk Bearer abc.def.ghi ghp_0123456789abcdefABCDEF0123456789abcd');
    assert.ok(!/s3cretPass/.test(msg), 'no URL password');
    assert.ok(!/neondb_owner/.test(msg), 'no URL user');
    assert.ok(!/ya29\.abcdefghijk/.test(msg), 'no access token');
    assert.ok(!/abc\.def\.ghi/.test(msg), 'no bearer token');
    assert.ok(!/ghp_0123456789/.test(msg), 'no GitHub token');
    assert.match(msg, /^connect failed/);
  });
});

describe('shortError — Google API keys and bot tokens', () => {
  test('an AIza… API key and a <digits>:<secret> bot token are redacted', () => {
    const key = 'AIza' + 'Sy0123456789abcdefghijklmnopqrstuvw'; // AIza + 35
    assert.equal(key.length, 39);
    const bot = '1234567890:' + 'AAH_abcdefghijklmnopqrstuvwxyz012345';
    const msg = shortError(`gemini 403 for key ${key} and telegram ${bot} rejected`);
    assert.ok(!msg.includes(key), 'no Google API key');
    assert.ok(!msg.includes('AAH_abcdefghij'), 'no bot token secret');
    assert.match(msg, /^gemini 403 for key \*\*\* and telegram \*\*\* rejected$/);
  });
});

describe('job store upsertStep (the statement the recorder drives)', () => {
  test('running stamps started_at; a later terminal keeps it and stamps finished_at; error stored', async () => {
    const db = makeStepsDb();
    const jobs = makeJobStore({ dbClient: db.client, now: clockFrom(), warn: () => {} });
    const r1 = await jobs.upsertStep('job-1', 53, 'station:voice', { status: 'running' });
    assert.equal(r1.ok, true);
    const started = db.rows.get('job-1#53').started_at;
    assert.ok(started instanceof Date);
    assert.equal(db.rows.get('job-1#53').finished_at, null);
    const r2 = await jobs.upsertStep('job-1', 53, 'station:voice', { status: 'failed', error: 'tts died' });
    assert.equal(r2.ok, true);
    const row = db.rows.get('job-1#53');
    assert.equal(row.status, 'failed');
    assert.equal(row.started_at, started, 'started_at survives the terminal write');
    assert.ok(row.finished_at instanceof Date);
    assert.equal(row.error, 'tts died');
  });

  test('rejects names outside the vocabulary and unknown statuses without throwing', async () => {
    const db = makeStepsDb();
    const jobs = makeJobStore({ dbClient: db.client, warn: () => {} });
    assert.equal((await jobs.upsertStep('job-1', 50, 'station:bogus!', { status: 'running' })).ok, false);
    assert.equal((await jobs.upsertStep('job-1', 50, 'station:topic', { status: 'done' })).ok, false);
    assert.equal((await jobs.upsertStep('', 50, 'station:topic', { status: 'running' })).ok, false);
  });
});

describe('makeStationRecorder — best-effort marks', () => {
  test('writes `station:<key>` at the reserved idx with the status; skipped keeps started_at NULL', async () => {
    const db = makeStepsDb();
    const jobs = makeJobStore({ dbClient: db.client, now: clockFrom(), warn: () => {} });
    const rec = makeStationRecorder({ store: jobs, warn: () => {} });
    for (const key of STATION_KEYS) {
      const r = await rec.mark('job-9', key, 'running');
      assert.equal(r.ok, true, key);
      const row = db.rows.get(`job-9#${stationIdx(key)}`);
      assert.equal(row.name, stepNameFor(key));
      assert.equal(row.name, `station:${key}`);
      assert.equal(row.status, 'running');
    }
    await rec.mark('job-9', 'approval', 'skipped', { error: 'auto: no approval needed' });
    const appr = db.rows.get('job-9#52');
    assert.equal(appr.status, 'skipped');
    assert.equal(appr.error, 'auto: no approval needed');
    const db2 = makeStepsDb();
    const rec2 = makeStationRecorder({ store: makeJobStore({ dbClient: db2.client, warn: () => {} }), warn: () => {} });
    await rec2.mark('job-2', 'approval', 'skipped', { error: 'held: awaiting_review' });
    assert.equal(db2.rows.get('job-2#52').started_at, null, 'a never-started skip has no start time');
    assert.equal(db2.rows.get('job-2#52').error, 'held: awaiting_review');
  });

  test('the error is truncated to a short first line before it is written', async () => {
    const db = makeStepsDb();
    const rec = makeStationRecorder({ store: makeJobStore({ dbClient: db.client, warn: () => {} }), warn: () => {} });
    await rec.mark('job-3', 'render', 'failed', { error: new Error('ffmpeg exited 1\n' + 'stack '.repeat(100)) });
    assert.equal(db.rows.get('job-3#54').error, 'ffmpeg exited 1');
    await rec.mark('job-3', 'upload', 'failed', { error: 'quota '.repeat(150) });
    assert.equal(db.rows.get('job-3#56').error.length, 200);
  });

  test('never throws when the DB client throws — one short warn, then later marks stay quiet', async () => {
    const warns = [];
    const jobs = makeJobStore({ dbClient: async () => { throw new Error('ECONNREFUSED neon down'); }, warn: () => {} });
    const rec = makeStationRecorder({ store: jobs, warn: (m) => warns.push(m) });
    const r = await rec.mark('job-4', 'topic', 'running');
    assert.equal(r.ok, false);
    await rec.mark('job-4', 'topic', 'succeeded');
    assert.equal(warns.length, 1, 'one warn line at most');
    assert.ok(warns[0].length < 300);
  });

  test('never throws when the store itself throws or lacks upsertStep', async () => {
    const throwing = { upsertStep: () => { throw new Error('spy exploded'); } };
    const r1 = await makeStationRecorder({ store: throwing, warn: () => {} }).mark('job-5', 'script', 'running');
    assert.equal(r1.ok, false);
    const r2 = await makeStationRecorder({ store: {}, warn: () => {} }).mark('job-5', 'script', 'running');
    assert.equal(r2.ok, false);
    const r3 = await makeStationRecorder({ getStore: async () => { throw new Error('no DATABASE_URL'); }, warn: () => {} }).mark('job-5', 'script', 'running');
    assert.equal(r3.ok, false);
  });

  test('an unknown key or status is refused without throwing', async () => {
    const db = makeStepsDb();
    const rec = makeStationRecorder({ store: makeJobStore({ dbClient: db.client, warn: () => {} }), warn: () => {} });
    assert.equal((await rec.mark('job-6', 'thumbnails', 'running')).ok, false);
    assert.equal((await rec.mark('job-6', 'topic', 'done')).ok, false);
    assert.equal(db.rows.size, 0);
  });

  test('a hanging store is cut off by the timeout and the breaker stops further waits', async () => {
    let calls = 0;
    const hanging = { upsertStep: () => { calls++; return new Promise(() => {}); } };
    const rec = makeStationRecorder({ store: hanging, warn: () => {}, timeoutMs: 30, setupTimeoutMs: 30 });
    const t0 = Date.now();
    const r = await rec.mark('job-7', 'render', 'running');
    assert.equal(r.ok, false);
    await rec.mark('job-7', 'render', 'succeeded');
    assert.equal(calls, 1, 'after a timeout the recorder stops calling the store');
    assert.ok(Date.now() - t0 < 1000, 'never blocks for long');
  });

  test('no job id or no store = silent no-op (no store call, no warn)', async () => {
    const warns = [];
    let got = 0;
    const rec = makeStationRecorder({ getStore: async () => { got++; return null; }, warn: (m) => warns.push(m) });
    assert.equal((await rec.mark(null, 'topic', 'running')).ok, false);
    assert.equal(got, 0, 'no job id: the store is never even resolved');
    assert.equal((await rec.mark('job-8', 'topic', 'running')).ok, false);
    assert.equal(warns.length, 0, 'a disabled store is silent');
  });
});

describe('failRunning — a crashed child cannot record its own crash', () => {
  test('every station row still running is closed failed with the short error; other rows untouched', async () => {
    const db = makeStepsDb();
    const jobs = makeJobStore({ dbClient: db.client, now: clockFrom(), warn: () => {} });
    const rec = makeStationRecorder({ store: jobs, warn: () => {} });
    await rec.mark('job-c', 'topic', 'succeeded');
    await rec.mark('job-c', 'voice', 'running');
    await rec.mark('job-c', 'render', 'running');
    const store = {
      upsertStep: jobs.upsertStep,
      async getJob(id) {
        const steps = [...db.rows.values()].filter((r) => r.job_id === id).sort((a, b) => a.idx - b.idx);
        return { ok: true, job: { id }, steps, artifacts: [] };
      },
    };
    const rec2 = makeStationRecorder({ store, warn: () => {} });
    const r = await rec2.failRunning('job-c', new Error('Shorts production failed\nstack'));
    assert.equal(r.ok, true);
    assert.equal(r.closed, 2);
    assert.equal(db.rows.get('job-c#53').status, 'failed');
    assert.equal(db.rows.get('job-c#54').status, 'failed');
    assert.equal(db.rows.get('job-c#54').error, 'Shorts production failed');
    assert.equal(db.rows.get('job-c#50').status, 'succeeded', 'a finished station is never rewritten');
  });

  test('never throws: no getJob, a throwing getJob, or no job id', async () => {
    assert.equal((await makeStationRecorder({ store: {}, warn: () => {} }).failRunning('j', 'x')).ok, false);
    const boom = { getJob: async () => { throw new Error('dead'); }, upsertStep: async () => ({ ok: true }) };
    assert.equal((await makeStationRecorder({ store: boom, warn: () => {} }).failRunning('j', 'x')).ok, false);
    assert.equal((await makeStationRecorder({ store: boom, warn: () => {} }).failRunning(null, 'x')).ok, false);
  });

  test('a NORMAL end closes leftover running stations skipped (never failed) with a plain note', async () => {
    const db = makeStepsDb();
    const jobs = makeJobStore({ dbClient: db.client, now: clockFrom(), warn: () => {} });
    const rec = makeStationRecorder({ store: jobs, warn: () => {} });
    await rec.mark('job-e', 'upload', 'running'); // e.g. a late-landing timed-out write
    const store = {
      upsertStep: jobs.upsertStep,
      async getJob(id) { return { ok: true, job: { id }, steps: [...db.rows.values()].filter((r) => r.job_id === id), artifacts: [] }; },
    };
    const r = await makeStationRecorder({ store, warn: () => {} }).closeRunning('job-e', { status: 'skipped', error: 'run ended before this step reported' });
    assert.equal(r.ok, true);
    assert.equal(db.rows.get('job-e#56').status, 'skipped');
    assert.equal(db.rows.get('job-e#56').error, 'run ended before this step reported');
  });
});

describe('setup budget — a cold Neon start is not a dead store', () => {
  test('the FIRST call gets the longer setup budget; later marks keep the short per-mark budget', async () => {
    let calls = 0;
    const slowFirst = {
      upsertStep: () => {
        calls++;
        if (calls === 1) return new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 80)); // cold start: 80ms
        return new Promise(() => {}); // later: hangs
      },
    };
    const rec = makeStationRecorder({ store: slowFirst, warn: () => {}, timeoutMs: 30, setupTimeoutMs: 400 });
    const first = await rec.mark('job-s', 'topic', 'running');
    assert.equal(first.ok, true, 'an 80ms first call fits the 400ms setup budget although it exceeds the 30ms mark budget');
    const t0 = Date.now();
    const second = await rec.mark('job-s', 'topic', 'succeeded');
    assert.equal(second.ok, false, 'a later hang is cut at the per-mark budget');
    assert.ok(Date.now() - t0 < 300);
  });

  test('store resolution (getStore) counts against the setup budget, not the mark budget', async () => {
    const rec = makeStationRecorder({
      getStore: () => new Promise((resolve) => setTimeout(() => resolve({ upsertStep: async () => ({ ok: true }) }), 80)),
      warn: () => {}, timeoutMs: 30, setupTimeoutMs: 400,
    });
    assert.equal((await rec.mark('job-g', 'topic', 'running')).ok, true);
  });
});

describe('reset — each lane / slot starts from a clean strip', () => {
  test('one batched write puts the given stations back to pending (status, times and error cleared)', async () => {
    const db = makeStepsDb();
    const jobs = makeJobStore({ dbClient: db.client, now: clockFrom(), warn: () => {} });
    const rec = makeStationRecorder({ store: jobs, warn: () => {} });
    await rec.mark('job-r', 'upload', 'failed', { error: 'quota' });
    await rec.mark('job-r', 'approval', 'skipped', { error: 'auto: no approval needed' });
    const before = db.calls.length;
    const r = await rec.reset('job-r', ['topic', 'script', 'voice', 'render', 'thumbnail', 'upload']);
    assert.equal(r.ok, true);
    assert.equal(db.calls.length - before, 1, 'ONE statement for all rows');
    const up = db.rows.get('job-r#56');
    assert.deepEqual([up.status, up.error, up.started_at, up.finished_at, up.name], ['pending', null, null, null, 'station:upload']);
    assert.equal(db.rows.get('job-r#50').status, 'pending');
    assert.equal(db.rows.get('job-r#52').status, 'skipped', 'a station not listed (approval) is untouched');
  });

  test('reset defaults to every station except approval (decided once per run by the pipeline)', async () => {
    const db = makeStepsDb();
    const rec = makeStationRecorder({ store: makeJobStore({ dbClient: db.client, warn: () => {} }), warn: () => {} });
    await rec.reset('job-d');
    assert.deepEqual([...db.rows.values()].map((r) => r.idx).sort(), [50, 51, 53, 54, 55, 56]);
  });

  test('job store resetSteps refuses bad input without throwing', async () => {
    const db = makeStepsDb();
    const jobs = makeJobStore({ dbClient: db.client, warn: () => {} });
    assert.equal((await jobs.resetSteps('', [{ idx: 50, name: 'station:topic' }])).ok, false);
    assert.equal((await jobs.resetSteps('j', [])).ok, false);
    assert.equal((await jobs.resetSteps('j', [{ idx: -1, name: 'station:topic' }])).ok, false);
    assert.equal((await jobs.resetSteps('j', [{ idx: 50, name: 'nope!' }])).ok, false);
  });

  test('the child helper reset forgets the open stations and never throws', async () => {
    const seen = [];
    const st = makeChildStations('job-k', {
      mark: async (jobId, key, status) => { seen.push(['mark', key, status]); return { ok: true }; },
      reset: async (jobId, keys) => { seen.push(['reset', keys]); return { ok: true }; },
    });
    await st.station('render', 'running');
    await st.reset(['script', 'voice', 'render', 'thumbnail', 'upload']);
    await st.failOpen(new Error('later'));
    assert.deepEqual(seen.at(-1), ['reset', ['script', 'voice', 'render', 'thumbnail', 'upload']], 'nothing open after a reset');
    const boom = makeChildStations('job-k', { mark: async () => ({ ok: true }), reset: async () => { throw new Error('x'); } });
    await boom.reset();
  });
});

describe('markStation (the child-process entry point)', () => {
  test('JOB_STORE_ENABLED unset: silent no-op that never touches the database', async () => {
    const saved = process.env.JOB_STORE_ENABLED;
    delete process.env.JOB_STORE_ENABLED;
    try {
      const r = await markStation('job-x', 'topic', 'running');
      assert.equal(r.ok, false);
      assert.equal(r.skipped, 'disabled');
    } finally {
      if (saved !== undefined) process.env.JOB_STORE_ENABLED = saved;
    }
  });
});

describe('makeChildStations — the shared child-process helper (yt-daily, yt-deepdive)', () => {
  test('tracks running stations; failOpen closes exactly the open ones failed with the error', async () => {
    const seen = [];
    const st = makeChildStations('job-k', { mark: async (jobId, key, status, opts) => { seen.push([jobId, key, status, opts.error ?? null]); return { ok: true }; } });
    await st.station('topic', 'running');
    await st.station('topic', 'succeeded');
    await st.station('voice', 'running');
    await st.station('render', 'running');
    await st.failOpen(new Error('ffmpeg died'));
    assert.deepEqual(seen.slice(-2).map((s) => [s[1], s[2]]), [['voice', 'failed'], ['render', 'failed']]);
    assert.equal(seen.at(-1)[3].message, 'ffmpeg died', 'the error travels to the recorder (it shortens it)');
    await st.failOpen(new Error('again'));
    assert.equal(seen.length, 6, 'nothing left open: a second failOpen writes nothing');
  });

  test('a throwing mark function never escapes; no job id = no calls', async () => {
    const st = makeChildStations('job-k', { mark: async () => { throw new Error('boom'); } });
    await st.station('upload', 'running');
    await st.failOpen('x');
    let n = 0;
    const off = makeChildStations('', { mark: async () => { n++; return { ok: true }; } });
    await off.station('upload', 'running');
    assert.equal(n, 0);
  });
});

// ---------------------------------------------------------------------------
// yt-deepdive.mjs wiring (source pins). The doc lane is a top-level script
// that needs YouTube/LLM/ffmpeg/remotion to run, so each station point is
// pinned in its real code region: the mark must sit between the named anchors.
// ---------------------------------------------------------------------------
describe('yt-deepdive.mjs marks every documentary station at its real point', () => {
  const SRC = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'yt-deepdive.mjs'), 'utf8');
  const between = (from, to) => {
    const a = SRC.indexOf(from);
    assert.ok(a >= 0, `anchor missing: ${from}`);
    const z = SRC.indexOf(to, a + from.length);
    assert.ok(z > a, `anchor missing after ${from}: ${to}`);
    return SRC.slice(a, z);
  };
  const has = (region, call, why) => assert.ok(region.includes(call), `${why}: expected ${call}`);

  test('uses the shared helper with the pipeline job id (PIPELINE_JOB_ID)', () => {
    assert.match(SRC, /PIPELINE_JOB_ID[\s\S]{0,400}makeChildStations/);
  });

  test('topic: running before trend research, succeeded once the theme is set', () => {
    const r = between("console.log(`[long] ${b.label} — premium daily episode`);", 'await groundedScript(');
    has(r, "station('topic', 'running')", 'topic opens before research');
    has(r, "station('topic', 'succeeded'", 'topic closes with the chosen theme');
  });

  test('script: running before the LLM call, failed when it throws, succeeded on the normal (non-review) path', () => {
    const r = between("station('topic', 'succeeded'", 'if (GENERATE_ONLY) {');
    has(r, "station('script', 'running')", 'script opens before llmScript');
    has(r, "station('script', 'failed', e)", 'a thrown generation fails the script station');
    const ok = SRC.lastIndexOf("station('script', 'succeeded')");
    assert.ok(ok > SRC.indexOf('if (GENERATE_ONLY) {'), 'normal-path script success sits after the generate-only block');
    assert.ok(ok < SRC.indexOf('const shipped = await renderAndShipEpisode('), '...and before the render');
  });

  test('generate-only: script succeeded when saved, failed/skipped otherwise, and NO later station', () => {
    const r = between('if (GENERATE_ONLY) {', 'const shipped = await renderAndShipEpisode(');
    const gen = r.slice(0, r.lastIndexOf("station('script', 'succeeded')"));
    has(gen, "station('script', 'succeeded')", 'saved for review = script done');
    has(gen, "station('script', 'failed'", 'not saved = script failed');
    has(gen, "station('script', 'skipped'", 'duplicate title = not saved');
    for (const k of ['voice', 'render', 'thumbnail', 'upload']) assert.ok(!r.includes(`station('${k}'`), `generate-only never marks ${k}`);
  });

  test('voice + render in all three visual lanes', () => {
    const diagram = between("if (docRenderOf(sbMeta) === 'diagram') {", "if (docRenderOf(sbMeta) === 'storybook') {");
    has(diagram, "station('voice', 'running')", 'diagram lane opens voice');
    has(diagram, "station('render', 'succeeded')", 'diagram lane closes render');
    const story = between('async function renderStorybookVisuals(', 'async function shipEpisode(');
    has(story, "station('voice', 'running')", 'storybook opens voice before TTS');
    has(story, "station('voice', 'succeeded')", 'storybook voice done');
    const ttsGate = story.indexOf("if (tts.status !== 0) throw new Error('storybook tts failed')");
    assert.ok(story.indexOf("station('voice', 'running')") < ttsGate && ttsGate < story.indexOf("station('voice', 'succeeded')"),
      'a TTS failure throws while voice is OPEN — the call-site failOpenStations closes it failed');
    has(story, "station('render', 'running')", 'storybook render opens');
    has(story, "station('render', 'succeeded')", 'storybook render done');
    const legacy = between('// intro: title card with cold-open narration', '// Chapter timestamps for the upload description');
    has(legacy, "station('voice', 'running')", 'legacy opens voice');
    has(legacy, "station('voice', 'succeeded')", 'legacy voice done after the outro narration');
    has(legacy, "station('render', 'succeeded')", 'legacy render done at the final mp4');
  });

  test('thumbnail + upload in the shared ship tail', () => {
    const r = between('async function shipEpisode(', 'async function resumeApprovedDoc(');
    has(r, "station('thumbnail', 'running')", 'thumbnail opens at its render');
    has(r, "station('upload', 'skipped'", 'dup/intent skip');
    has(r, "station('upload', 'running')", 'upload opens before uploadWithIntent');
    has(r, "station('upload', 'succeeded')", 'upload done on a videoId');
    has(r, "station('thumbnail', thumbErr ? 'failed' : 'succeeded'", 'thumbnail result of thumbnails.set');
    assert.ok(r.indexOf("station('upload', 'running')") < r.indexOf('uploadWithIntent('), 'upload opens before the call');
  });

  test('resume reuses topic/script; a throw in render+ship fails the open stations at both call sites', () => {
    const r = between('async function resumeApprovedDoc(', '// ---------- main ----------');
    has(r, "station('topic', 'skipped', 'reused: approved script')", 'resume topic');
    has(r, "station('script', 'skipped', 'reused: approved script')", 'resume script');
    assert.ok((SRC.match(/renderAndShipEpisode\([\s\S]{0,700}?\}\)\s*\.catch\(async \(e\) => \{ await failOpenStations\(e\); throw e; \}\)/g) || []).length >= 2,
      'both renderAndShipEpisode call sites close open stations failed, then re-throw');
  });

  test('the doc lane starts from a clean strip (main run and resume), and a success topic carries no error text', () => {
    const main = between("console.log(`[long] ${b.label} — premium daily episode`);", "station('topic', 'running')");
    has(main, 'await resetStations()', 'main doc lane resets before topic');
    const resume = between('async function resumeApprovedDoc(', "station('topic', 'skipped', 'reused: approved script')");
    has(resume, 'await resetStations()', 'resumed doc lane resets before its marks');
    assert.ok(!/station\('topic', 'succeeded', [^)]/.test(SRC), 'no error/note written on a succeeded topic');
  });
});

describe('yt-daily.mjs resets the strip per lane and per slot', () => {
  const SRC = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'yt-daily.mjs'), 'utf8');
  test('lane start (before topic) and each slot (before script) reset; the resume lane resets too', () => {
    const lane = SRC.slice(SRC.indexOf('if (RUN_SHORTS) {'), SRC.indexOf("await station('topic', 'running')"));
    assert.ok(lane.includes('await resetStations()'), 'shorts lane resets before topic');
    const loopAt = SRC.indexOf('for (let i = 0; i < slotLimit; i++) { try {');
    const slot = SRC.slice(loopAt, SRC.indexOf("await station('script', 'running')", loopAt));
    assert.ok(slot.includes("await resetStations(['script', 'voice', 'render', 'thumbnail', 'upload'])"), 'each slot resets script..upload (topic is chosen once for all slots)');
    const resume = SRC.slice(SRC.indexOf('async function resumeApprovedScript('), SRC.indexOf("await station('topic', 'skipped', 'reused: approved script')"));
    assert.ok(resume.includes('await resetStations()'), 'shorts resume lane resets');
  });
});
