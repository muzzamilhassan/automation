// #106 Phase 4 T1 — job store (jobs / job_steps / job_artifacts) tests.
//
// Spec: docs/superpowers/specs/2026-10-30-phase4-review-queue-analytics-spec.md
// S1 (D1-D4, D25; AC-P4-1..5) + "Resolved by review" rows 5/21 (status-based
// resume, byte-verified artifacts, stable step vocabulary) + round-1 review
// fixes (D2 top-level steps; D1 kind/trigger vocab; 'partial' terminal per
// AC-P4-3; REQUIRED staleAfterMs resume window; startStep lifecycle;
// duplicate-blob_url upgrade; per-error-class warn memoization).
//
// Stub-client style (mirror of tests/template-registry-db.test.mjs): the stub
// understands exactly the SQL shapes lib/job-store.mjs emits — nothing more —
// so a passing test cannot be trivially green. No live Neon in unit CI.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeJobStore,
  JOB_KINDS, ARTIFACT_KINDS, STEP_NAMES, TRIGGERS,
} from '../lib/job-store.mjs';

// ---------------------------------------------------------------------------
// Stub client: in-memory tables keyed by the SQL shapes the job store emits.
//   CREATE TABLE IF NOT EXISTS <t> (...)                         -> recorded, no-op
//   INSERT INTO <t> (cols) VALUES ($1..$n | NULL) [ON CONFLICT ... DO NOTHING]
//     [RETURNING col]                                            -> PK/UNIQUE enforced
//   UPDATE <t> SET col = $n, ... WHERE ... [RETURNING col]       -> in-place update
//   SELECT ... FROM <t> [WHERE ...] [ORDER BY col ASC|DESC] [LIMIT n]
//     WHERE conditions supported: `<col> = $n`, `<col> < $n` (Date compare)
//     and `<col> IN ('a', 'b')`
// State: `tables` (name -> array of rows) and `calls` (every {sql, params}).
// ---------------------------------------------------------------------------

function makeStubClient() {
  const tables = { jobs: [], job_steps: [], job_artifacts: [] };
  const calls = [];
  let artifactSeq = 0;

  const parseConds = (where, params) => {
    if (!where) return [];
    return where.split(/ AND /i).map((part) => {
      part = part.trim();
      const inMatch = part.match(/(\w+) IN \(([^)]*)\)/i);
      if (inMatch) {
        const vals = inMatch[2].split(',').map((v) => v.trim().replace(/^'|'$/g, ''));
        return [inMatch[1], (row) => vals.includes(String(row[inMatch[1]]))];
      }
      const lt = part.match(/(\w+) < (\$\d+)/i);
      if (lt) {
        const v = params[Number(lt[2].slice(1)) - 1];
        return [lt[1], (row) => row[lt[1]] < v];
      }
      const eq = part.match(/(\w+) = (\$\d+)/i);
      if (eq) {
        const v = params[Number(eq[2].slice(1)) - 1];
        return [eq[1], (row) => String(row[eq[1]]) === String(v)];
      }
      throw new Error('stub: unsupported WHERE clause: ' + part);
    });
  };

  const sortRows = (rows, col, dir) => {
    if (!col) return rows;
    const mul = String(dir).toUpperCase() === 'DESC' ? -1 : 1;
    return [...rows].sort((a, b) => {
      const av = a[col]; const bv = b[col];
      if (av === bv) return 0;
      return (av > bv ? 1 : -1) * mul;
    });
  };

  async function run(sqlText, params) {
    const sql = sqlText.replace(/\s+/g, ' ').trim();
    params = params || [];

    if (/^CREATE TABLE/i.test(sql)) {
      calls.push({ sql, params });
      return [];
    }

    const ins = sql.match(/^INSERT INTO (\w+)\s*\(([^)]*)\)\s*VALUES\s*\(([^)]*)\)/i);
    if (ins) {
      calls.push({ sql, params });
      const table = ins[1];
      const cols = ins[2].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      const vals = ins[3].split(',').map((v) => v.trim());
      const row = {};
      cols.forEach((c, i) => {
        row[c] = /^\$\d+$/.test(vals[i]) ? params[Number(vals[i].slice(1)) - 1] : null;
      });
      if (table === 'jobs') {
        if (tables.jobs.some((r) => r.id === row.id)) {
          throw new Error('duplicate key value violates unique constraint "jobs_pkey"');
        }
        tables.jobs.push(row);
        return [row];
      }
      if (table === 'job_steps') {
        if (tables.job_steps.some((r) => r.job_id === row.job_id && r.idx === row.idx)) {
          throw new Error('duplicate key value violates unique constraint "job_steps_pkey"');
        }
        tables.job_steps.push(row);
        return [row];
      }
      if (table === 'job_artifacts') {
        if (tables.job_artifacts.some((r) => r.job_id === row.job_id && r.step === row.step
          && r.kind === row.kind && r.content_hash === row.content_hash)) {
          return []; // ON CONFLICT (job_id, step, kind, content_hash) DO NOTHING analogue
        }
        row.id = ++artifactSeq;
        row.created_at = row.created_at ?? new Date();
        tables.job_artifacts.push(row);
        return [row];
      }
      throw new Error('stub: unknown INSERT target ' + table);
    }

    const upd = sql.match(/^UPDATE (\w+) SET (.*?)(?: WHERE (.*?))?(?: RETURNING (\w+))?$/i);
    if (upd) {
      calls.push({ sql, params });
      const table = upd[1];
      if (!tables[table]) throw new Error('stub: unknown UPDATE target ' + table);
      const sets = upd[2].split(',').map((pair) => {
        const m = pair.trim().match(/(\w+) = (\$\d+)/i);
        if (!m) throw new Error('stub: unsupported SET pair: ' + pair);
        return [m[1], params[Number(m[2].slice(1)) - 1]];
      });
      const conds = parseConds(upd[3], params);
      const returning = [];
      for (const row of tables[table]) {
        if (conds.every(([, test]) => test(row))) {
          for (const [col, val] of sets) row[col] = val;
          if (upd[4]) returning.push({ [upd[4]]: row[upd[4]] });
        }
      }
      return returning;
    }

    const sel = sql.match(/^SELECT .*?FROM (\w+)(?: WHERE (.*?))?(?: ORDER BY (\w+) (ASC|DESC))?(?: LIMIT (\d+))?$/i);
    if (sel) {
      calls.push({ sql, params });
      const table = sel[1];
      if (!tables[table]) throw new Error('stub: unknown SELECT target ' + table);
      const conds = parseConds(sel[2], params);
      let rows = tables[table].filter((row) => conds.every(([, t]) => t(row)));
      rows = sortRows(rows, sel[3], sel[4]);
      if (sel[5]) rows = rows.slice(0, Number(sel[5]));
      return rows;
    }

    throw new Error('stub: unsupported SQL: ' + sql.slice(0, 120));
  }
  return { run, tables, calls };
}

// Deterministic clock: each call advances 1s from BASE (+offset). Tests
// drive the offset (clock.advanceTo) to age jobs past the staleAfterMs
// window without sleeping.
const BASE = Date.parse('2026-10-30T00:00:00Z');
function makeClock(startOffsetMs = 0) {
  const state = { offset: startOffsetMs, n: 0 };
  const fn = () => new Date(BASE + state.offset + state.n++ * 1000);
  fn.advanceTo = (offsetMs) => { state.offset = offsetMs; state.n = 0; };
  return fn;
}

const STALE = 30 * 60 * 1000; // the tests' standard resume window: 30 min

function makeStore(overrides = {}) {
  const stub = overrides.stub || makeStubClient();
  const warns = [];
  const clock = overrides.clock || makeClock();
  const store = makeJobStore({
    dbClient: stub.run,
    warn: (msg) => warns.push(msg),
    now: clock,
    ...overrides.deps,
  });
  return { store, stub, warns, clock };
}

// A started job with two planned steps, the first finished.
async function seedBasicJob(stub, store) {
  const started = await store.startJob({ channel: 'quotequarry', kind: 'shorts', trigger: 'cron', meta: { run: 1 } });
  await store.recordStep(started.id, 0, 'research');
  await store.recordStep(started.id, 1, 'script');
  await store.startStep(started.id, 0);
  await store.finishStep(started.id, 0, { status: 'succeeded' });
  return started;
}

// ===========================================================================
// Schema-on-write (D1 — the makeUsageWriter house pattern)
// ===========================================================================

describe('#106 T1 job store — schema-on-write (D1, AC-P4-1)', () => {
  test('first write emits all three CREATE TABLE IF NOT EXISTS exactly once; later writes never re-emit DDL', async () => {
    const { store, stub } = makeStore();
    const a = await store.startJob({ channel: 'quotequarry', kind: 'shorts' });
    assert.equal(a.ok, true);
    const creates = stub.calls.filter((c) => /^CREATE TABLE IF NOT EXISTS/i.test(c.sql));
    assert.deepEqual(
      creates.map((c) => c.sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/i)[1]).sort(),
      ['job_artifacts', 'job_steps', 'jobs'],
      'all three tables ensured on first write',
    );
    await store.recordStep(a.id, 0, 'research');
    await store.finishStep(a.id, 0, {});
    await store.finishJob(a.id, { status: 'succeeded' });
    assert.equal(stub.calls.filter((c) => /^CREATE TABLE/i.test(c.sql)).length, 3, 'DDL is memoized after first success');
  });

  test('schema ensure failure degrades the write (ok:false) and is retried on the next write', async () => {
    let createFails = true;
    const stub = makeStubClient();
    const failing = async (sql, params) => {
      if (/^CREATE TABLE/i.test(sql) && createFails) throw new Error('connect ECONNREFUSED');
      return stub.run(sql, params);
    };
    const { store } = makeStore({ stub: { run: failing, tables: stub.tables, calls: stub.calls } });
    const first = await store.startJob({ channel: 'quotequarry', kind: 'shorts' });
    assert.equal(first.ok, false, 'dead DB -> degraded, not thrown');
    createFails = false;
    const second = await store.startJob({ channel: 'quotequarry', kind: 'shorts' });
    assert.equal(second.ok, true, 'schema ensure is retried after a failed attempt');
  });

  test('constructing without a dbClient function throws TypeError (construction only — writers never throw)', () => {
    assert.throws(() => makeJobStore({}), /dbClient must be a function/);
  });
});

// ===========================================================================
// Job + step lifecycle (AC-P4-1, AC-P4-3)
// ===========================================================================

describe('#106 T1 job store — job + step lifecycle (AC-P4-1, AC-P4-3)', () => {
  test('startJob writes one jobs row with uuid id, channel, kind, trigger, started_at', async () => {
    const { store, stub } = makeStore();
    const out = await store.startJob({ channel: 'quotequarry', kind: 'shorts', trigger: 'cron', meta: { a: 1 } });
    assert.equal(out.ok, true);
    assert.match(out.id, /^[0-9a-f-]{36}$/, 'uuid id');
    const row = stub.tables.jobs.find((r) => r.id === out.id);
    assert.equal(row.channel, 'quotequarry');
    assert.equal(row.kind, 'shorts', "the daily Shorts lane records kind 'shorts' (D1)");
    assert.equal(row.status, 'running', 'a new job starts as running');
    assert.equal(row.trigger, 'cron');
    assert.ok(row.started_at instanceof Date, 'started_at stamped');
    assert.deepEqual(JSON.parse(row.meta), { a: 1 }, 'meta jsonb round-trips');
  });

  test('vocabularies enforced at startJob: kind (shorts|doc|clips|pipeline), trigger (cron|dispatch|resume|studio) — ok:false, no throw', async () => {
    const { store, stub } = makeStore();
    assert.equal((await store.startJob({ channel: 'q', kind: 'daily' })).ok, false, "kind 'daily' is not D1 vocabulary");
    assert.equal((await store.startJob({ channel: 'q', kind: 'topup' })).ok, false);
    assert.equal((await store.startJob({ channel: 'q', kind: 'shorts', trigger: 'weird' })).ok, false, 'trigger is validated (D1)');
    assert.equal((await store.startJob({ channel: 'q', kind: 'shorts', trigger: 'dispatch' })).ok, true, 'dispatch is D1 vocabulary');
    assert.equal((await store.startJob({ kind: 'shorts' })).ok, false, 'channel required');
    assert.equal((await store.startJob({ channel: 'q' })).ok, false, 'kind required');
    const noTrigger = await store.startJob({ channel: 'q', kind: 'doc' });
    assert.equal(noTrigger.ok, true, 'trigger stays optional at the store level');
    assert.equal(stub.tables.jobs.find((r) => r.id === noTrigger.id).trigger, null);
  });

  test('steps recorded per planned step with started_at NULL; PLATFORMS_PAUSED-style disabled steps record as skipped (AC-P4-1)', async () => {
    const { store, stub } = makeStore();
    const job = await seedBasicJob(stub, store);
    await store.recordStep(job.id, 2, 'fb', { status: 'skipped' }); // disabled lane
    const steps = stub.tables.job_steps.filter((r) => r.job_id === job.id);
    assert.deepEqual(steps.map((r) => r.idx), [0, 1, 2]);
    assert.equal(steps[2].status, 'skipped', 'disabled-by-config step is recorded, not absent');
    assert.equal(steps[2].started_at, null, 'a skipped step never started');
    assert.equal(steps[1].started_at, null, 'a pending step has NULL started_at at registration');
    const got = await store.getJob(job.id);
    assert.deepEqual(got.steps.map((r) => r.idx), [0, 1, 2], 'getJob returns steps ordered by idx');
  });

  test('step lifecycle: recordStep pending -> startStep stamps started_at + running -> finishStep stamps finished_at (AC-P4-1)', async () => {
    const { store, stub } = makeStore();
    const job = await seedBasicJob(stub, store);
    const step = stub.tables.job_steps.find((r) => r.job_id === job.id && r.idx === 1);
    assert.equal(step.status, 'pending');
    const started = await store.startStep(job.id, 1);
    assert.equal(started.ok, true);
    assert.equal(started.updated, 1);
    assert.equal(step.status, 'running', 'startStep flips the step to running');
    assert.ok(step.started_at instanceof Date, 'startStep stamps started_at (durations become real)');
    const fin = await store.finishStep(job.id, 1, { status: 'succeeded' });
    assert.equal(fin.ok, true);
    assert.ok(step.finished_at >= step.started_at, 'finished_at not before started_at');
  });

  test('finishStep failed records the error on the step; other steps still finish independently (AC-P4-3)', async () => {
    const { store, stub } = makeStore();
    const job = await seedBasicJob(stub, store);
    await store.recordStep(job.id, 2, 'render');
    await store.startStep(job.id, 2);
    const failed = await store.finishStep(job.id, 2, { status: 'failed', error: 'render exit 1' });
    assert.equal(failed.ok, true);
    const step = stub.tables.job_steps.find((r) => r.job_id === job.id && r.idx === 2);
    assert.equal(step.status, 'failed');
    assert.equal(step.error, 'render exit 1');
    const done = await store.finishStep(job.id, 0, { status: 'succeeded' });
    assert.equal(done.ok, true, 'a failed step never blocks the independent steps');
  });

  test("finishJob terminals: succeeded | failed | partial | held — 'partial' records shipped-video-but-lane-failed (AC-P4-3)", async () => {
    const { store, stub } = makeStore();
    const job = await seedBasicJob(stub, store);
    const fin = await store.finishJob(job.id, { status: 'failed', error: 'render died pre-upload' });
    assert.equal(fin.ok, true);
    let row = stub.tables.jobs.find((r) => r.id === job.id);
    assert.equal(row.status, 'failed');
    assert.ok(row.finished_at instanceof Date);

    const partial = await store.startJob({ channel: 'quotequarry', kind: 'shorts' });
    await store.finishJob(partial.id, { status: 'partial', error: 'video shipped; fb lane failed' });
    row = stub.tables.jobs.find((r) => r.id === partial.id);
    assert.equal(row.status, 'partial', "'partial' is a first-class terminal");

    const held = await store.startJob({ channel: 'ledgerclinic', kind: 'doc' });
    await store.finishJob(held.id, { status: 'held' });
    assert.equal(stub.tables.jobs.find((r) => r.id === held.id).status, 'held');
  });

  test('step and status vocabularies are enforced (D2: the vocabulary is stable) — ok:false, no throw', async () => {
    const { store } = makeStore();
    const job = await store.startJob({ channel: 'q', kind: 'shorts' });
    for (const bad of ['Research', 'upload', '']) {
      assert.equal((await store.recordStep(job.id, 0, bad)).ok, false, `unknown step name rejected: ${JSON.stringify(bad)}`);
    }
    assert.equal((await store.recordStep(job.id, 0, 'preflight')).ok, true, 'D2 top-level steps are vocabulary');
    assert.equal((await store.recordStep(job.id, 1, 'brain-embed')).ok, true);
    assert.equal((await store.recordStep(job.id, 2, 'episode')).ok, true);
    assert.equal((await store.recordStep(job.id, 3, 'staging')).ok, true);
    assert.equal((await store.recordStep(job.id, 4, 'skipped-poster')).ok, true, 'skipped-* prefix is legal vocabulary');
    assert.equal((await store.recordStep(job.id, 5, 'render', { status: 'running' })).ok, false, 'registration is pending|skipped — running belongs to startStep');
    assert.equal((await store.finishStep(job.id, 0, { status: 'running' })).ok, false, 'finishStep takes terminal statuses only');
    assert.equal((await store.finishStep(job.id, 0, { status: 'nope' })).ok, false);
    assert.equal((await store.finishJob(job.id, { status: 'pending' })).ok, false, 'finishJob takes succeeded|failed|partial|held');
  });
});

// ===========================================================================
// Artifact index (AC-P4-2 + D1 hash disambiguation)
// ===========================================================================

describe('#106 T1 job store — artifact index (AC-P4-2, D1)', () => {
  test('indexArtifact fingerprints FILE BYTES: sha256 of the raw bytes (the D1 line: never the Phase-3 text hash)', async () => {
    const { store } = makeStore();
    const job = await store.startJob({ channel: 'q', kind: 'shorts' });
    const out = await store.indexArtifact(job.id, {
      step: 'script', kind: 'script_payload', bytes: 'hello',
    });
    assert.equal(out.ok, true);
    assert.equal(out.duplicate, false);
    // Independent known vector: sha256('hello')
    assert.equal(out.contentHash, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  test('the same file re-produced later yields the SAME hash and NO duplicate artifact row (AC-P4-2)', async () => {
    const { store, stub } = makeStore();
    const job = await store.startJob({ channel: 'q', kind: 'shorts' });
    const a = await store.indexArtifact(job.id, { step: 'tts', kind: 'tts_audio', bytes: Buffer.from([1, 2, 3]), blobUrl: 'https://blob/x' });
    const b = await store.indexArtifact(job.id, { step: 'tts', kind: 'tts_audio', bytes: Buffer.from([1, 2, 3]) });
    assert.equal(b.contentHash, a.contentHash, 'same bytes -> same hash');
    assert.equal(b.duplicate, true, 're-index is recognized as a duplicate');
    assert.equal(b.id, a.id, 'the existing row is returned');
    assert.equal(b.blobUrl, 'https://blob/x', 'the existing blob_url comes back for resume');
    assert.equal(b.upgraded, false);
    assert.equal(stub.tables.job_artifacts.length, 1, 'no duplicate artifact row');
  });

  test('a duplicate with blob_url NULL + a new real URL UPGRADES the degraded index entry in place (D3 fail-open repair)', async () => {
    const { store, stub } = makeStore();
    const job = await store.startJob({ channel: 'q', kind: 'shorts' });
    const degraded = await store.indexArtifact(job.id, { step: 'render', kind: 'review_render', bytes: 'render-bytes' }); // blob failed upstream
    assert.equal(degraded.ok, true);
    const repaired = await store.indexArtifact(job.id, { step: 'render', kind: 'review_render', contentHash: degraded.contentHash, blobUrl: 'https://blob/recovered' });
    assert.equal(repaired.ok, true);
    assert.equal(repaired.duplicate, true);
    assert.equal(repaired.upgraded, true, 'the index-only entry is upgraded, not duplicated');
    assert.equal(repaired.blobUrl, 'https://blob/recovered');
    assert.equal(stub.tables.job_artifacts.length, 1, 'still exactly one row');
    assert.equal(stub.tables.job_artifacts[0].blob_url, 'https://blob/recovered', 'blob_url updated in place');
    const again = await store.indexArtifact(job.id, { step: 'render', kind: 'review_render', contentHash: degraded.contentHash, blobUrl: 'https://blob/recovered' });
    assert.equal(again.upgraded, false, 'a non-null existing blob_url is not re-written');
  });

  test('different bytes on the same step coexist (3 thumbnail candidates)', async () => {
    const { store, stub } = makeStore();
    const job = await store.startJob({ channel: 'q', kind: 'shorts' });
    for (const n of [1, 2, 3]) {
      const out = await store.indexArtifact(job.id, { step: 'render', kind: 'thumb_candidate', bytes: `candidate-${n}` });
      assert.equal(out.ok, true);
      assert.equal(out.duplicate, false);
    }
    assert.equal(stub.tables.job_artifacts.length, 3, 'one row per distinct byte fingerprint');
  });

  test('a degraded blob upload indexes index-only: blob_url null is a legal stored value (D3)', async () => {
    const { store, stub } = makeStore();
    const job = await store.startJob({ channel: 'q', kind: 'doc' });
    const out = await store.indexArtifact(job.id, {
      step: 'render', kind: 'review_render', contentHash: 'a'.repeat(64), blobUrl: null, size: 1234,
    });
    assert.equal(out.ok, true);
    const row = stub.tables.job_artifacts[0];
    assert.equal(row.blob_url, null, 'index-only entry (blob failed) — resume must treat this as re-run');
    assert.equal(Number(row.bytes), 1234);
  });

  test('artifact step must be pipeline vocabulary; kind vocabulary enforced; contentHash must be sha256 hex; bytes or contentHash required', async () => {
    const { store } = makeStore();
    const job = await store.startJob({ channel: 'q', kind: 'shorts' });
    assert.equal((await store.indexArtifact(job.id, { step: 'banana', kind: 'tts_audio', bytes: 'x' })).ok, false, 'step must be pipeline vocabulary');
    assert.equal((await store.indexArtifact(job.id, { step: 'tts', kind: 'video', bytes: 'x' })).ok, false, 'unknown artifact kind');
    assert.equal((await store.indexArtifact(job.id, { step: 'tts', kind: 'tts_audio', contentHash: 'nothex' })).ok, false, 'hash must be sha256 hex');
    assert.equal((await store.indexArtifact(job.id, { step: 'tts', kind: 'tts_audio' })).ok, false, 'neither bytes nor hash -> rejected');
    assert.equal((await store.indexArtifact('not-a-uuid-but-nonempty', { step: 'tts', kind: 'tts_audio', bytes: 'x' })).ok, true, 'uuid format is the caller contract, not validated here');
  });

  test('getJob returns artifacts joined for resume decisions (AC-P4-4 inputs)', async () => {
    const { store } = makeStore();
    const job = await store.startJob({ channel: 'q', kind: 'shorts' });
    await store.indexArtifact(job.id, { step: 'script', kind: 'script_payload', bytes: 'hello', blobUrl: 'https://blob/p' });
    const got = await store.getJob(job.id);
    assert.equal(got.ok, true);
    assert.equal(got.artifacts.length, 1);
    assert.equal(got.artifacts[0].content_hash, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    assert.equal(got.artifacts[0].blob_url, 'https://blob/p');
  });
});

// ===========================================================================
// Resume lookup (AC-P4-4 + review rows 5/21 + round-1: STATUS-based resume
// with a REQUIRED stale window — a live-running job must NEVER come back as
// a resume target; cancelled GHA runs never write a terminal, so
// stale-running rows accumulate BY DESIGN and the age window is the safety)
// ===========================================================================

describe('#106 T1 job store — resume lookup (AC-P4-4, review M1/H2 + round-1 staleAfterMs)', () => {
  test('latestResumableJob returns the newest stale failed-or-stale-running job with its steps and artifacts', async () => {
    const { store, clock } = makeStore();
    const old = await store.startJob({ channel: 'quotequarry', kind: 'shorts' });
    await store.finishJob(old.id, { status: 'failed', error: 'render died' });
    const newer = await store.startJob({ channel: 'quotequarry', kind: 'pipeline', trigger: 'resume' });
    await store.finishJob(newer.id, { status: 'failed', error: 'tts died' });
    await store.recordStep(newer.id, 0, 'research');
    await store.startStep(newer.id, 0);
    await store.finishStep(newer.id, 0, { status: 'succeeded' });
    await store.indexArtifact(newer.id, { step: 'research', kind: 'script_payload', bytes: 'x' });
    clock.advanceTo(60 * 60 * 1000); // an hour passes; both jobs are now >30min old

    const got = await store.latestResumableJob('quotequarry', { staleAfterMs: STALE });
    assert.equal(got.ok, true);
    assert.equal(got.job.id, newer.id, 'the NEWEST stale job wins');
    assert.deepEqual(got.steps.map((s) => s.idx), [0], 'steps ride along');
    assert.equal(got.artifacts.length, 1, 'artifacts ride along — caller checks bytes retrievability');
    assert.equal(got.job.error, 'tts died');
  });

  test('REQUIRED staleAfterMs: a job started 1 min ago is NOT a resume target at a 30-min window; at 31 min it is', async () => {
    const { store, clock } = makeStore();
    const killed = await store.startJob({ channel: 'quotequarry', kind: 'shorts' }); // worker dies; no terminal ever written
    await store.recordStep(killed.id, 0, 'research');

    clock.advanceTo(1 * 60 * 1000); // 1 minute later
    const tooFresh = await store.latestResumableJob('quotequarry', { staleAfterMs: STALE });
    assert.equal(tooFresh.ok, true);
    assert.equal(tooFresh.job, null, 'a live/just-started run is never a resume target (duplicate-spend class)');

    clock.advanceTo(31 * 60 * 1000); // 31 minutes later — past the window
    const stale = await store.latestResumableJob('quotequarry', { staleAfterMs: STALE });
    assert.equal(stale.ok, true);
    assert.equal(stale.job.id, killed.id, 'the stale-running (crashed) job is now the resume target');
    assert.deepEqual(stale.steps.map((s) => s.status), ['pending'], 'caller re-enters at the first non-succeeded step');
  });

  test('staleAfterMs is REQUIRED: missing or non-finite -> ok:false, never a silent unbounded query', async () => {
    const { store } = makeStore();
    assert.equal((await store.latestResumableJob('q', {})).ok, false);
    assert.equal((await store.latestResumableJob('q', { staleAfterMs: '30min' })).ok, false);
    assert.equal((await store.latestResumableJob('q')).ok, false);
    assert.equal((await store.latestResumableJob('q', { staleAfterMs: -1 })).ok, false);
    assert.match((await store.latestResumableJob('q', {})).error, /stale_after_ms/);
  });

  test('succeeded, partial and held jobs are NEVER resumable (partial is terminal per AC-P4-3; held waits for approval, D15/D17)', async () => {
    const { store, clock } = makeStore();
    const done = await store.startJob({ channel: 'quotequarry', kind: 'shorts' });
    await store.finishJob(done.id, { status: 'succeeded' });
    const partial = await store.startJob({ channel: 'quotequarry', kind: 'clips' });
    await store.finishJob(partial.id, { status: 'partial', error: 'video shipped; fb lane failed' });
    const held = await store.startJob({ channel: 'quotequarry', kind: 'doc' });
    await store.finishJob(held.id, { status: 'held' });
    clock.advanceTo(24 * 60 * 60 * 1000); // a day passes — still not resumable
    const got = await store.latestResumableJob('quotequarry', { staleAfterMs: STALE });
    assert.equal(got.ok, true);
    assert.equal(got.job, null, 'nothing resumable');
    assert.deepEqual(got.steps, []);
    assert.deepEqual(got.artifacts, []);
  });

  test('latestResumableJob is per-channel; unknown channel -> job null; missing channel -> ok:false', async () => {
    const { store, clock } = makeStore();
    const job = await store.startJob({ channel: 'quotequarry', kind: 'shorts' });
    await store.finishJob(job.id, { status: 'failed' });
    clock.advanceTo(60 * 60 * 1000);
    const other = await store.latestResumableJob('iron-discipline', { staleAfterMs: STALE });
    assert.equal(other.ok, true);
    assert.equal(other.job, null);
    assert.equal((await store.latestResumableJob('', { staleAfterMs: STALE })).ok, false, 'channel required');
  });
});

// ===========================================================================
// Never-throw (AC-P4-5 — a dead DB can never darken production)
// ===========================================================================

describe('#106 T1 job store — never-throw writers (AC-P4-5)', () => {
  test('dead DB: every writer and reader resolves ok:false without throwing, with ONE warn per error class', async () => {
    const warns = [];
    const DEAD = async () => { throw new Error('connect ECONNREFUSED 10.0.0.1:5432'); };
    const store = makeJobStore({ dbClient: DEAD, warn: (m) => warns.push(m) });
    const job = await store.startJob({ channel: 'q', kind: 'shorts' });
    assert.equal(job.ok, false);
    assert.match(job.error, /ECONNREFUSED/);
    assert.equal((await store.recordStep('j', 0, 'research')).ok, false);
    assert.equal((await store.startStep('j', 0)).ok, false);
    assert.equal((await store.finishStep('j', 0, {})).ok, false);
    assert.equal((await store.indexArtifact('j', { step: 'tts', kind: 'tts_audio', bytes: 'x' })).ok, false);
    assert.equal((await store.finishJob('j', { status: 'failed' })).ok, false);
    assert.equal((await store.getJob('j')).ok, false);
    assert.equal((await store.latestResumableJob('q', { staleAfterMs: STALE })).ok, false);
    assert.equal(warns.length, 1, 'exactly one warn for one error CLASS (memoized)');
    assert.match(warns[0], /job-store/);
    assert.match(warns[0], /connection/, 'the class is named in the warn');
  });

  test('warn memoization is PER ERROR CLASS: a new constraint-class failure warns again after a dead-DB class', async () => {
    const warns = [];
    let mode = 'dead';
    const flaky = async () => {
      throw mode === 'dead'
        ? new Error('connect ECONNREFUSED 10.0.0.1:5432')
        : new Error('duplicate key value violates unique constraint "jobs_pkey"');
    };
    const store = makeJobStore({ dbClient: flaky, warn: (m) => warns.push(m) });
    await store.startJob({ channel: 'q', kind: 'shorts' });
    await store.startJob({ channel: 'q', kind: 'shorts' });
    assert.equal(warns.length, 1, 'same class -> silent');
    mode = 'constraint';
    await store.startJob({ channel: 'q', kind: 'shorts' });
    assert.equal(warns.length, 2, 'a different failure class warns again — one silenced class never hides another');
    await store.startJob({ channel: 'q', kind: 'shorts' });
    assert.equal(warns.length, 2, 'and is then memoized itself');
  });

  test('getJob for an unknown id -> { ok:true, job:null } (a miss is not an error)', async () => {
    const { store } = makeStore();
    const got = await store.getJob('00000000-0000-0000-0000-000000000000');
    assert.equal(got.ok, true);
    assert.equal(got.job, null);
  });

  test('resumed_from_job_id round-trips: startJob(resumedFromJobId) -> getJob reads it back (D4 parent/child link)', async () => {
    const { store } = makeStore();
    const parent = await store.startJob({ channel: 'quotequarry', kind: 'shorts', trigger: 'cron' });
    const child = await store.startJob({
      channel: 'quotequarry', kind: 'pipeline', trigger: 'resume', resumedFromJobId: parent.id,
    });
    const got = await store.getJob(child.id);
    assert.equal(got.ok, true);
    assert.equal(got.job.resumed_from_job_id, parent.id, 'the D4 parent/child link survives the round-trip');
    assert.equal(got.job.trigger, 'resume');
  });

  test('exported vocabularies match the task deliverable + round-1 review (pin the contract)', () => {
    assert.deepEqual([...JOB_KINDS].sort(), ['clips', 'doc', 'pipeline', 'shorts'], 'D1 kinds');
    assert.deepEqual([...TRIGGERS].sort(), ['cron', 'dispatch', 'resume', 'studio'], 'D1 triggers');
    assert.deepEqual([...ARTIFACT_KINDS].sort(), ['review_render', 'script_payload', 'thumb_candidate', 'tts_audio']);
    assert.deepEqual([...STEP_NAMES].sort(),
      // 'review' is #106 T5's additive step name (D15/D17): the review-gate
      // hold records a 'review' step + closes the job with the 'held' terminal.
      ['brain-embed', 'clips', 'episode', 'fb', 'post', 'poster', 'preflight', 'render', 'research', 'review', 'script', 'staging', 'tts', 'verify'],
      'lane vocabulary + the D2 top-level steps preflight/brain-embed/episode/staging (+ T5 review)');
  });
});
