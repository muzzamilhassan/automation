// #106 Phase 4 T1 — job store (jobs / job_steps / job_artifacts) tests.
//
// Spec: docs/superpowers/specs/2026-10-30-phase4-review-queue-analytics-spec.md
// S1 (D1-D4, D25; AC-P4-1..5) + "Resolved by review" rows 5/21 (status-based
// resume, byte-verified artifacts, stable step vocabulary).
//
// Stub-client style (mirror of tests/template-registry-db.test.mjs): the stub
// understands exactly the SQL shapes lib/job-store.mjs emits — nothing more —
// so a passing test cannot be trivially green. No live Neon in unit CI.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeJobStore,
  JOB_KINDS, ARTIFACT_KINDS, STEP_NAMES,
} from '../lib/job-store.mjs';

// ---------------------------------------------------------------------------
// Stub client: in-memory tables keyed by the SQL shapes the job store emits.
//   CREATE TABLE IF NOT EXISTS <t> (...)                         -> recorded, no-op
//   INSERT INTO <t> (cols) VALUES ($1..$n) [RETURNING col]       -> PK/UNIQUE enforced
//   UPDATE <t> SET col = $n, ... WHERE ... [RETURNING col]       -> in-place update
//   SELECT ... FROM <t> [WHERE ...] [ORDER BY col ASC|DESC] [LIMIT n]
//     WHERE conditions supported: `<col> = $n` and `<col> IN ('a', 'b')`
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
          return []; // UNIQUE (job_id, step, kind, content_hash) DO NOTHING analogue
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

// Deterministic clock: each call advances 1s from the base so ORDER BY
// started_at is stable in fast tests.
function makeClock() {
  let n = 0;
  return () => new Date(Date.parse('2026-10-30T00:00:00Z') + (++n) * 1000);
}

function makeStore(overrides = {}) {
  const stub = overrides.stub || makeStubClient();
  const warns = [];
  const store = makeJobStore({
    dbClient: stub.run,
    warn: (msg) => warns.push(msg),
    now: makeClock(),
    ...overrides.deps,
  });
  return { store, stub, warns };
}

// A started job with two planned steps, one finished.
async function seedBasicJob(stub, store) {
  const started = await store.startJob({ channel: 'quotequarry', kind: 'daily', trigger: 'cron', meta: { run: 1 } });
  await store.recordStep(started.id, 0, 'research');
  await store.recordStep(started.id, 1, 'script');
  await store.finishStep(started.id, 0, { status: 'succeeded' });
  return started;
}

// ===========================================================================
// Schema-on-write (D1 — the makeUsageWriter house pattern)
// ===========================================================================

describe('#106 T1 job store — schema-on-write (D1, AC-P4-1)', () => {
  test('first write emits all three CREATE TABLE IF NOT EXISTS exactly once; later writes never re-emit DDL', async () => {
    const { store, stub } = makeStore();
    const a = await store.startJob({ channel: 'quotequarry', kind: 'daily' });
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
    const { store, warns } = makeStore({ stub: { run: failing, tables: stub.tables, calls: stub.calls } });
    const first = await store.startJob({ channel: 'quotequarry', kind: 'daily' });
    assert.equal(first.ok, false, 'dead DB -> degraded, not thrown');
    createFails = false;
    const second = await store.startJob({ channel: 'quotequarry', kind: 'daily' });
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
    const out = await store.startJob({ channel: 'quotequarry', kind: 'daily', trigger: 'cron', meta: { a: 1 } });
    assert.equal(out.ok, true);
    assert.match(out.id, /^[0-9a-f-]{36}$/, 'uuid id');
    const row = stub.tables.jobs.find((r) => r.id === out.id);
    assert.equal(row.channel, 'quotequarry');
    assert.equal(row.kind, 'daily');
    assert.equal(row.status, 'running', 'a new job starts as running');
    assert.equal(row.trigger, 'cron');
    assert.ok(row.started_at instanceof Date, 'started_at stamped');
    assert.deepEqual(JSON.parse(row.meta), { a: 1 }, 'meta jsonb round-trips');
  });

  test('startJob rejects unknown kind vocabulary (daily|doc|topup|resume) and missing channel — ok:false, no throw', async () => {
    const { store } = makeStore();
    assert.equal((await store.startJob({ channel: 'q', kind: 'shorts' })).ok, false, 'spec D1 kinds only');
    assert.equal((await store.startJob({ kind: 'daily' })).ok, false, 'channel required');
    assert.equal((await store.startJob({ channel: 'q' })).ok, false, 'kind required');
  });

  test('steps recorded per planned step, in idx order; PLATFORMS_PAUSED-style disabled steps record as skipped (AC-P4-1)', async () => {
    const { store, stub } = makeStore();
    const job = await seedBasicJob(stub, store);
    await store.recordStep(job.id, 2, 'fb', { status: 'skipped' }); // disabled lane
    const steps = stub.tables.job_steps.filter((r) => r.job_id === job.id);
    assert.deepEqual(steps.map((r) => r.idx), [0, 1, 2]);
    assert.equal(steps[2].status, 'skipped', 'disabled-by-config step is recorded, not absent');
    assert.equal(steps[2].started_at, null, 'a skipped step never started');
    const got = await store.getJob(job.id);
    assert.deepEqual(got.steps.map((r) => r.idx), [0, 1, 2], 'getJob returns steps ordered by idx');
  });

  test('step lifecycle: recorded running stamps started_at; finishStep succeeded stamps finished_at (AC-P4-1)', async () => {
    const { store, stub } = makeStore();
    const job = await seedBasicJob(stub, store);
    const step = stub.tables.job_steps.find((r) => r.job_id === job.id && r.idx === 1);
    assert.equal(step.status, 'pending', 'recordStep defaults to pending');
    assert.ok(step.started_at instanceof Date, 'started_at stamped at record time');
    const fin = await store.finishStep(job.id, 1, { status: 'succeeded' });
    assert.equal(fin.ok, true);
    assert.equal(fin.updated, 1);
    assert.ok(step.finished_at >= step.started_at, 'finished_at not before started_at');
  });

  test('finishStep failed records the error on the step; other steps still finish independently (AC-P4-3)', async () => {
    const { store, stub } = makeStore();
    const job = await seedBasicJob(stub, store);
    await store.recordStep(job.id, 2, 'render');
    const failed = await store.finishStep(job.id, 2, { status: 'failed', error: 'render exit 1' });
    assert.equal(failed.ok, true);
    const step = stub.tables.job_steps.find((r) => r.job_id === job.id && r.idx === 2);
    assert.equal(step.status, 'failed');
    assert.equal(step.error, 'render exit 1');
    const done = await store.finishStep(job.id, 0, { status: 'succeeded' });
    assert.equal(done.ok, true, 'a failed step never blocks the independent steps');
  });

  test('finishJob stamps terminal status + finished_at + error; held is a legal terminal (gate hold, D15/D17)', async () => {
    const { store, stub } = makeStore();
    const job = await seedBasicJob(stub, store);
    const fin = await store.finishJob(job.id, { status: 'failed', error: 'render failed' });
    assert.equal(fin.ok, true);
    const row = stub.tables.jobs.find((r) => r.id === job.id);
    assert.equal(row.status, 'failed');
    assert.equal(row.error, 'render failed');
    assert.ok(row.finished_at instanceof Date);

    const held = await store.startJob({ channel: 'ledgerclinic', kind: 'doc' });
    await store.finishJob(held.id, { status: 'held' });
    assert.equal(stub.tables.jobs.find((r) => r.id === held.id).status, 'held');
  });

  test('step and status vocabularies are enforced (D2: the vocabulary is stable) — ok:false, no throw', async () => {
    const { store } = makeStore();
    const job = await store.startJob({ channel: 'q', kind: 'daily' });
    for (const bad of ['Research', 'upload', '']) {
      assert.equal((await store.recordStep(job.id, 0, bad)).ok, false, `unknown step name rejected: ${JSON.stringify(bad)}`);
    }
    assert.equal((await store.recordStep(job.id, 0, 'skipped-poster')).ok, true, 'skipped-* prefix is legal vocabulary');
    assert.equal((await store.finishStep(job.id, 0, { status: 'running' })).ok, false, 'finishStep takes terminal statuses only');
    assert.equal((await store.finishStep(job.id, 0, { status: 'nope' })).ok, false);
    assert.equal((await store.recordStep(job.id, 1, 'render', { status: 'won' })).ok, false);
    assert.equal((await store.finishJob(job.id, { status: 'pending' })).ok, false, 'finishJob takes succeeded|failed|held');
  });
});

// ===========================================================================
// Artifact index (AC-P4-2 + D1 hash disambiguation)
// ===========================================================================

describe('#106 T1 job store — artifact index (AC-P4-2, D1)', () => {
  test('indexArtifact fingerprints FILE BYTES: sha256 of the raw bytes (the D1 line: never the Phase-3 text hash)', async () => {
    const { store } = makeStore();
    const job = await store.startJob({ channel: 'q', kind: 'daily' });
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
    const job = await store.startJob({ channel: 'q', kind: 'daily' });
    const a = await store.indexArtifact(job.id, { step: 'tts', kind: 'tts_audio', bytes: Buffer.from([1, 2, 3]), blobUrl: 'https://blob/x' });
    const b = await store.indexArtifact(job.id, { step: 'tts', kind: 'tts_audio', bytes: Buffer.from([1, 2, 3]) });
    assert.equal(b.contentHash, a.contentHash, 'same bytes -> same hash');
    assert.equal(b.duplicate, true, 're-index is recognized as a duplicate');
    assert.equal(b.id, a.id, 'the existing row is returned');
    assert.equal(b.blobUrl, 'https://blob/x', 'the existing blob_url comes back for resume');
    assert.equal(stub.tables.job_artifacts.length, 1, 'no duplicate artifact row');
  });

  test('different bytes on the same step coexist (3 thumbnail candidates)', async () => {
    const { store, stub } = makeStore();
    const job = await store.startJob({ channel: 'q', kind: 'daily' });
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

  test('artifact kind vocabulary enforced; contentHash must be sha256 hex; bytes or contentHash required', async () => {
    const { store } = makeStore();
    const job = await store.startJob({ channel: 'q', kind: 'daily' });
    assert.equal((await store.indexArtifact(job.id, { step: 'tts', kind: 'video', bytes: 'x' })).ok, false, 'unknown artifact kind');
    assert.equal((await store.indexArtifact(job.id, { step: 'tts', kind: 'tts_audio', contentHash: 'nothex' })).ok, false, 'hash must be sha256 hex');
    assert.equal((await store.indexArtifact(job.id, { step: 'tts', kind: 'tts_audio' })).ok, false, 'neither bytes nor hash -> rejected');
    assert.equal((await store.indexArtifact('not-a-uuid-but-nonempty', { step: 'tts', kind: 'tts_audio', bytes: 'x' })).ok, true, 'uuid format is the caller contract, not validated here');
  });

  test('getJob returns artifacts joined for resume decisions (AC-P4-4 inputs)', async () => {
    const { store } = makeStore();
    const job = await store.startJob({ channel: 'q', kind: 'daily' });
    await store.indexArtifact(job.id, { step: 'script', kind: 'script_payload', bytes: 'hello', blobUrl: 'https://blob/p' });
    const got = await store.getJob(job.id);
    assert.equal(got.ok, true);
    assert.equal(got.artifacts.length, 1);
    assert.equal(got.artifacts[0].content_hash, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    assert.equal(got.artifacts[0].blob_url, 'https://blob/p');
  });
});

// ===========================================================================
// Resume lookup (AC-P4-4 + review rows 5/21: STATUS-based resume — the store
// returns the failed/stale job + steps + artifacts; the CALLER (T2) applies
// the skip condition (artifact row AND bytes retrievable) and stale-key rule)
// ===========================================================================

describe('#106 T1 job store — resume lookup (AC-P4-4, review M1/H2)', () => {
  test('latestResumableJob returns the newest failed-or-stale-running job with its steps and artifacts', async () => {
    const { store, stub } = makeStore();
    const old = await store.startJob({ channel: 'quotequarry', kind: 'daily' });
    await store.finishJob(old.id, { status: 'failed', error: 'render died' });
    const newer = await store.startJob({ channel: 'quotequarry', kind: 'resume', trigger: 'dispatch' });
    await store.finishJob(newer.id, { status: 'failed', error: 'tts died' });
    await store.recordStep(newer.id, 0, 'research');
    await store.finishStep(newer.id, 0, { status: 'succeeded' });
    await store.indexArtifact(newer.id, { step: 'research', kind: 'script_payload', bytes: 'x' });

    const got = await store.latestResumableJob('quotequarry');
    assert.equal(got.ok, true);
    assert.equal(got.job.id, newer.id, 'the NEWEST failed job wins');
    assert.deepEqual(got.steps.map((s) => s.idx), [0], 'steps ride along');
    assert.equal(got.artifacts.length, 1, 'artifacts ride along — caller checks bytes retrievability');
    assert.equal(got.job.error, 'tts died');
  });

  test('a killed worker job (status still running, never finished) IS resumable — that is the crash case', async () => {
    const { store } = makeStore();
    const killed = await store.startJob({ channel: 'quotequarry', kind: 'daily' });
    await store.recordStep(killed.id, 0, 'research');
    await store.finishStep(killed.id, 0, { status: 'succeeded' });
    await store.recordStep(killed.id, 1, 'script', { status: 'running' }); // worker dies mid-step — finishStep/finishJob never called
    const got = await store.latestResumableJob('quotequarry');
    assert.equal(got.ok, true);
    assert.equal(got.job.id, killed.id, 'stale-running (crashed) job is the resume target');
    assert.deepEqual(got.steps.map((s) => s.status), ['succeeded', 'running'], 'caller re-enters at the first non-succeeded step');
  });

  test('succeeded and held jobs are NEVER resumable (held waits for approval, D15/D17)', async () => {
    const { store } = makeStore();
    const done = await store.startJob({ channel: 'quotequarry', kind: 'daily' });
    await store.finishJob(done.id, { status: 'succeeded' });
    const held = await store.startJob({ channel: 'quotequarry', kind: 'doc' });
    await store.finishJob(held.id, { status: 'held' });
    const got = await store.latestResumableJob('quotequarry');
    assert.equal(got.ok, true);
    assert.equal(got.job, null, 'nothing resumable');
    assert.deepEqual(got.steps, []);
    assert.deepEqual(got.artifacts, []);
  });

  test('latestResumableJob is per-channel; unknown channel -> job null', async () => {
    const { store } = makeStore();
    const job = await store.startJob({ channel: 'quotequarry', kind: 'daily' });
    await store.finishJob(job.id, { status: 'failed' });
    const other = await store.latestResumableJob('iron-discipline');
    assert.equal(other.ok, true);
    assert.equal(other.job, null);
    assert.equal((await store.latestResumableJob('')).ok, false, 'channel required');
  });
});

// ===========================================================================
// Never-throw (AC-P4-5 — a dead DB can never darken production)
// ===========================================================================

describe('#106 T1 job store — never-throw writers (AC-P4-5)', () => {
  const DEAD = async () => { throw new Error('connect ECONNREFUSED 10.0.0.1:5432'); };

  test('dead DB: every writer and reader resolves ok:false without throwing, with ONE warn total', async () => {
    const warns = [];
    const store = makeJobStore({ dbClient: DEAD, warn: (m) => warns.push(m), now: makeClock() });
    const job = await store.startJob({ channel: 'q', kind: 'daily' });
    assert.equal(job.ok, false);
    assert.match(job.error, /ECONNREFUSED/);
    assert.equal((await store.recordStep('j', 0, 'research')).ok, false);
    assert.equal((await store.finishStep('j', 0, {})).ok, false);
    assert.equal((await store.indexArtifact('j', { step: 'tts', kind: 'tts_audio', bytes: 'x' })).ok, false);
    assert.equal((await store.finishJob('j', { status: 'failed' })).ok, false);
    assert.equal((await store.getJob('j')).ok, false);
    assert.equal((await store.latestResumableJob('q')).ok, false);
    assert.equal(warns.length, 1, 'exactly one warn (memoized) — the pipeline emits the single AC-P4-5 warning');
    assert.match(warns[0], /job-store/);
  });

  test('getJob for an unknown id -> { ok:true, job:null } (a miss is not an error)', async () => {
    const { store } = makeStore();
    const got = await store.getJob('00000000-0000-0000-0000-000000000000');
    assert.equal(got.ok, true);
    assert.equal(got.job, null);
  });

  test('exported vocabularies match the task deliverable (pin the contract)', () => {
    assert.deepEqual([...JOB_KINDS].sort(), ['daily', 'doc', 'resume', 'topup']);
    assert.deepEqual([...ARTIFACT_KINDS].sort(), ['review_render', 'script_payload', 'thumb_candidate', 'tts_audio']);
    assert.deepEqual([...STEP_NAMES].sort(),
      ['clips', 'fb', 'poster', 'post', 'render', 'research', 'script', 'tts', 'verify'].sort());
  });
});
