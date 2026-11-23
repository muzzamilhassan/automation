// Creator City item 6 — the asks Neon store and the action runner
// (studio/lib/asks-store.mjs), exercised with an injected fake client and
// fake stores. Actions only ever go through the injected EXISTING helpers
// (dispatchResumeRun / channelRunBusy / script-store reject / warnings resolve).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeAsksStore, performAskAction, ASKS_DDL } from '../studio/lib/asks-store.mjs';

const SID = '0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b';

function fakeDb(handler = () => []) {
  const calls = [];
  const client = async (sql, params) => {
    calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
    return handler(sql.replace(/\s+/g, ' ').trim(), params) ?? [];
  };
  return { client, calls };
}

// ------------------------------------------------------------- schema
test('the asks table: source_key UNIQUE, kind + status CHECKs, options/answer jsonb, expires_at required', () => {
  const ddl = ASKS_DDL.join('\n');
  assert.match(ddl, /CREATE TABLE IF NOT EXISTS asks/);
  assert.match(ddl, /source_key TEXT NOT NULL UNIQUE/);
  assert.match(ddl, /kind IN \('retry_or_skip','confirm','choice'\)/);
  assert.match(ddl, /status IN \('pending','answered','expired','cancelled'\)/);
  assert.match(ddl, /options jsonb NOT NULL/);
  assert.match(ddl, /answer jsonb/);
  assert.match(ddl, /expires_at timestamptz NOT NULL/);
  assert.match(ddl, /answered_by TEXT/);
});

test('WHEN the store is used THEN the schema is ensured once per process (memoized)', async () => {
  const { client, calls } = fakeDb();
  const s = makeAsksStore(client);
  await s.listPending();
  await s.listPending();
  assert.equal(calls.filter((c) => c.sql.startsWith('CREATE TABLE')).length, 1);
});

test('makeAsksStore refuses a non-function client', () => {
  assert.throws(() => makeAsksStore(null), /dbClient must be a function/);
});

// ------------------------------------------------------------- upsert / dedupe
test('WHEN a question is derived again THEN ON CONFLICT (source_key) DO NOTHING — one row per source, answers never reopened', async () => {
  const { client, calls } = fakeDb((sql) => (sql.startsWith('INSERT INTO asks') ? [{ id: '1' }] : []));
  const s = makeAsksStore(client);
  const r = await s.upsertAsks([{ source_key: 'station:j-1:voice', channel: 'mr', kind: 'retry_or_skip', title: 'Voice failed', body: 'x', options: [{ id: 'retry' }], expires_at: '2026-11-24T12:00:00.000Z' }]);
  assert.deepEqual(r, { ok: true, inserted: 1 });
  const ins = calls.find((c) => c.sql.startsWith('INSERT INTO asks'));
  assert.match(ins.sql, /ON CONFLICT \(source_key\) DO NOTHING/);
  assert.match(ins.sql, /\$6::jsonb/);
  assert.equal(ins.params[5], JSON.stringify([{ id: 'retry' }]), 'options travel as JSON text cast to jsonb');
});

test('WHEN the DB throws THEN the store answers { ok:false } (the route turns that into 503), never throws', async () => {
  const s = makeAsksStore(async () => { throw new Error('boom'); });
  assert.equal((await s.listPending()).ok, false);
  assert.equal((await s.upsertAsks([])).ok, false);
});

test('listPending reads only pending rows', async () => {
  const { client, calls } = fakeDb((sql) => (sql.startsWith('SELECT') ? [{ id: '1', status: 'pending' }] : []));
  const r = await makeAsksStore(client).listPending();
  assert.equal(r.ok, true);
  assert.equal(r.rows.length, 1);
  assert.match(calls.at(-1).sql, /WHERE status = 'pending'/);
});

test('expireAsks only touches still-pending rows and records why', async () => {
  const { client, calls } = fakeDb();
  await makeAsksStore(client).expireAsks([{ id: '7', reason: '24 h passed' }]);
  const up = calls.at(-1);
  assert.match(up.sql, /SET status = 'expired'/);
  assert.match(up.sql, /AND status = 'pending'/);
  assert.deepEqual(JSON.parse(up.params[1]), { expired: '24 h passed' });
});

test('claim is atomic (pending AND not expired → answered); a second click gets not_open', async () => {
  let n = 0;
  const { client, calls } = fakeDb((sql) => (sql.startsWith('UPDATE asks SET status = \'answered\'') ? (n++ === 0 ? [{ id: '7', status: 'answered' }] : []) : []));
  const s = makeAsksStore(client);
  assert.equal((await s.claim('7', 'o@x')).ok, true);
  assert.deepEqual(await s.claim('7', 'o@x'), { ok: false, reason: 'not_open' });
  assert.match(calls.at(-1).sql, /WHERE id = \$1 AND status = 'pending' AND expires_at > now\(\)/);
});

test('release puts a failed answer back to pending WITH the error shown', async () => {
  const { client, calls } = fakeDb();
  await makeAsksStore(client).release('7', 'github 500');
  const up = calls.at(-1);
  assert.match(up.sql, /SET status = 'pending', answered_by = NULL, answered_at = NULL/);
  assert.deepEqual(JSON.parse(up.params[1]), { lastError: 'github 500' });
});

// ------------------------------------------------------------- actions
const ask = (over = {}) => ({ id: '7', channel: 'money-rulebook', ...over });
function deps(over = {}) {
  const log = [];
  return {
    log,
    by: 'owner@x',
    dispatchResume: async (a) => { log.push(['dispatch', a]); return { ok: true }; },
    runBusy: async (a) => { log.push(['busy', a]); return { busy: false }; },
    resolveAlerts: async (a) => { log.push(['resolveAlerts', a]); },
    scriptStore: {
      getScript: async (id) => ({ ok: true, script: { id, channel_id: 'money-rulebook', status: 'approved', job_id: 'j-0' } }),
      reject: async (id, o) => { log.push(['reject', id, o]); return { ok: true, id }; },
    },
    warningsStore: {
      listOpenByCodes: async (o) => { log.push(['list', o]); return { ok: true, rows: [{ id: '41', code: 'approved_not_published', evidence: `script ${SID} approved` }, { id: '50', code: 'approved_not_published', evidence: 'script deadbeef00 approved' }] }; },
      resolve: async (id, o) => { log.push(['resolve', id, o]); return { ok: true, id }; },
    },
    ...over,
  };
}

test('retry_resume: WHEN the channel is idle THEN the resume dispatch (channel + job id) runs once', async () => {
  const d = deps();
  const r = await performAskAction(ask(), { action: 'retry_resume', args: { jobId: 'j-1' } }, d);
  assert.equal(r.ok, true);
  assert.deepEqual(d.log.find((x) => x[0] === 'dispatch')[1], { slug: 'money-rulebook', jobId: 'j-1' });
});

test('retry_resume: WHEN a run for the channel is already queued/running THEN no dispatch (it would cancel that run) and an error stays on the ask', async () => {
  const d = deps({ runBusy: async () => ({ busy: true, status: 'in_progress' }) });
  const r = await performAskAction(ask(), { action: 'retry_resume', args: { jobId: 'j-1' } }, d);
  assert.equal(r.ok, false);
  assert.match(r.error, /already running/);
  assert.ok(!d.log.some((x) => x[0] === 'dispatch'));
});

test('retry_resume: WHEN GitHub rejects the dispatch THEN ok:false with its error', async () => {
  const r = await performAskAction(ask(), { action: 'retry_resume', args: { jobId: 'j-1' } }, deps({ dispatchResume: async () => ({ ok: false, error: 'github 500: x' }) }));
  assert.deepEqual(r, { ok: false, error: 'github 500: x' });
});

test('retry_resume: WHEN the job id is missing THEN refused', async () => {
  assert.equal((await performAskAction(ask(), { action: 'retry_resume', args: {} }, deps())).ok, false);
});

test('redispatch_script: the /review Redispatch path — approved script → resume its job → close its review alerts', async () => {
  const d = deps();
  const r = await performAskAction(ask(), { action: 'redispatch_script', args: { scriptId: SID } }, d);
  assert.equal(r.ok, true);
  assert.deepEqual(d.log.find((x) => x[0] === 'dispatch')[1], { slug: 'money-rulebook', jobId: 'j-0' });
  assert.deepEqual(d.log.find((x) => x[0] === 'resolveAlerts')[1], { channelId: 'money-rulebook', dispatchedScriptId: SID });
});

test('redispatch_script: WHEN the script is no longer approved (consumed / rejected) THEN nothing is dispatched', async () => {
  const d = deps({ scriptStore: { getScript: async (id) => ({ ok: true, script: { id, channel_id: 'money-rulebook', status: 'consumed', job_id: 'j-0' } }) } });
  const r = await performAskAction(ask(), { action: 'redispatch_script', args: { scriptId: SID } }, d);
  assert.equal(r.ok, false);
  assert.match(r.error, /consumed/);
  assert.ok(!d.log.some((x) => x[0] === 'dispatch'));
});

test('redispatch_script: WHEN the script belongs to another channel THEN refused (stored option cannot be repointed)', async () => {
  const d = deps({ scriptStore: { getScript: async (id) => ({ ok: true, script: { id, channel_id: 'other', status: 'approved', job_id: 'j-0' } }) } });
  assert.equal((await performAskAction(ask(), { action: 'redispatch_script', args: { scriptId: SID } }, d)).ok, false);
});

test('reject_script: the existing script-store reject (awaiting_review → rejected), audited by the owner, then alerts close', async () => {
  const d = deps();
  const r = await performAskAction(ask(), { action: 'reject_script', args: { scriptId: SID } }, d);
  assert.equal(r.ok, true);
  const rej = d.log.find((x) => x[0] === 'reject');
  assert.equal(rej[1], SID);
  assert.equal(rej[2].by, 'owner@x');
  assert.ok(d.log.some((x) => x[0] === 'resolveAlerts'));
});

test('reject_script: WHEN the script is no longer waiting THEN ok:false with a plain reason', async () => {
  const d = deps({ scriptStore: { reject: async () => ({ ok: false, reason: 'not_open' }) } });
  const r = await performAskAction(ask(), { action: 'reject_script', args: { scriptId: SID } }, d);
  assert.equal(r.ok, false);
  assert.match(r.error, /no longer waiting/);
});

// skip_approved_script (the real skip) is proven in tests/asks-skip.test.mjs

test('resolve_warnings: every named warning resolved; one already closed is fine; a store error fails the answer', async () => {
  const d = deps({ warningsStore: { resolve: async (id) => (id === '2' ? { ok: false, reason: 'not_open' } : { ok: true, id }) } });
  assert.equal((await performAskAction(ask(), { action: 'resolve_warnings', args: { warningIds: ['1', '2'] } }, d)).ok, true);
  const bad = deps({ warningsStore: { resolve: async () => ({ ok: false, error: 'db down' }) } });
  assert.equal((await performAskAction(ask(), { action: 'resolve_warnings', args: { warningIds: ['1'] } }, bad)).ok, false);
});

test('dismiss: records the answer only — nothing else runs', async () => {
  const d = deps();
  const r = await performAskAction(ask(), { action: 'dismiss' }, d);
  assert.equal(r.ok, true);
  assert.deepEqual(d.log, []);
});

test('an unknown action is refused (never eval-ed, never guessed)', async () => {
  assert.equal((await performAskAction(ask(), { action: 'delete_channel' }, deps())).ok, false);
});
