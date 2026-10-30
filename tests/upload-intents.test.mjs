// #106 Phase 4 T3 — upload intents + resumable uploads + reconciliation tests.
//
// Spec: docs/superpowers/specs/2026-10-30-phase4-review-queue-analytics-spec.md
// S2 (D5-D8, D24; AC-P4-6..10) + "Resolved by review" rows 6 (slot
// discriminator / INSERT-as-mutex / any-day resolution), 8 (publishAt
// recompute), 16 (session-URI honesty hierarchy) + ground truth
// research/platform-youtube-api-oauth-2026-10-24.md §1.4 (resumable protocol,
// 404 restart) + §4.2 (no idempotency — the intent row + session URI are it).
//
// All tests run against INJECTED seams (db client / fetch / log / sleep) —
// no live Neon, no live YouTube (house pattern: tests/warnings-store.test.mjs).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeUploadIntentStore, getUploadIntentStore } from '../lib/upload-intents.mjs';
import {
  INTENT_KINDS,
  INTENT_STATUSES,
  dedupeKeyFor,
  titleFingerprint,
  initiateSession,
  probeSession,
  putSessionBytes,
  uploadWithIntent,
  recoverOpenIntents,
  nextFutureSlotISO,
  makeFindByTitle,
  matchUploadByFingerprint,
} from '../lib/upload-intents.mjs';
import { normTitle } from '../lib/dup-gate.mjs';
import { ptDate } from '../lib/quota-ledger.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// ---------------------------------------------------------------------------
// Stub upload_intents "database" — driven by the exact SQL shapes
// lib/upload-intents.mjs emits, so a passing test cannot be trivially green.
// Shared `seq` log lets tests assert DB-vs-HTTP ordering (AC-P4-7: the session
// URI is persisted BEFORE the first byte).
// ---------------------------------------------------------------------------
function makeIntentDb({ fail = false, seq = null } = {}) {
  const rows = [];
  const calls = [];
  const note = (kind, sql, params) => {
    const entry = { kind, sql: sql.replace(/\s+/g, ' ').trim(), params };
    calls.push(entry);
    if (seq) seq.push(entry);
  };
  const COLS = ['id', 'channel_id', 'slot_date', 'kind', 'slot_idx', 'dedupe_key',
    'status', 'session_uri', 'video_id', 'title_fingerprint', 'job_id', 'fail_reason',
    'created_at', 'updated_at'];
  const client = async (sqlText, params = []) => {
    const sql = sqlText.replace(/\s+/g, ' ').trim();
    note('sql', sql, params);
    if (fail) throw new Error('db down');
    if (sql.startsWith('CREATE ') || sql.startsWith('ALTER ')) return [];
    if (sql.startsWith('INSERT INTO upload_intents')) {
      const m = sql.match(/INSERT INTO upload_intents \(([^)]*)\)/);
      const cols = m[1].split(',').map((c) => c.trim());
      const row = {};
      cols.forEach((c, i) => { row[c] = params[i]; });
      row.session_uri = null; row.video_id = null; row.fail_reason = null;
      row.created_at = new Date(); row.updated_at = new Date();
      if (rows.some((r) => r.dedupe_key === row.dedupe_key)) return []; // ON CONFLICT (dedupe_key) DO NOTHING
      rows.push(row);
      return [{ id: row.id }];
    }
    if (sql.startsWith('SELECT') && sql.includes('FROM upload_intents WHERE dedupe_key')) {
      return rows.filter((r) => r.dedupe_key === params[0]).map((r) => ({ ...r }));
    }
    if (sql.startsWith('UPDATE upload_intents')) {
      const id = params[0].id !== undefined ? params[0].id : params[0];
      const target = rows.find((r) => r.id === id);
      if (!target) return [];
      // the re-claim WHERE clause: only failed/abandoned rows may be re-claimed
      if (/WHERE id = \$1 AND status IN \('failed', 'abandoned'\)/.test(sql)) {
        if (!['failed', 'abandoned'].includes(target.status)) return []; // lost the claim race
        target.status = 'pending'; target.session_uri = null; target.video_id = null; target.fail_reason = null;
        target.updated_at = new Date();
        return [{ id: target.id }];
      }
      if (sql.includes('session_uri = $3')) { target.status = params[1]; target.session_uri = params[2]; }
      else if (sql.includes('video_id = $3')) { target.status = params[1]; target.video_id = params[2]; }
      else if (sql.includes('fail_reason = COALESCE($3, fail_reason)')) { target.status = params[1]; target.fail_reason = params[2] ?? target.fail_reason; }
      else if (sql.includes('fail_reason = $3')) { target.status = params[1]; target.fail_reason = params[2]; }
      else if (sql.includes('SET status =')) { target.status = params[1]; }
      target.updated_at = new Date();
      return [{ id: target.id }];
    }
    if (sql.startsWith('SELECT') && sql.includes('FROM upload_intents WHERE channel_id')) {
      let out = rows.filter((r) => r.channel_id === params[0]);
      if (sql.includes("status IN ('pending', 'initiated', 'uploading')")) {
        out = out.filter((r) => ['pending', 'initiated', 'uploading'].includes(r.status));
      }
      const dateM = sql.match(/AND slot_date = \$(\d+)/);
      if (dateM) out = out.filter((r) => r.slot_date === params[Number(dateM[1]) - 1]);
      const kindM = sql.match(/AND kind = \$(\d+)/);
      if (kindM) out = out.filter((r) => r.kind === params[Number(kindM[1]) - 1]);
      return out.map((r) => ({ ...r }));
    }
    if (sql.startsWith('SELECT') && sql.includes('updated_at < $')) {
      let out = rows.filter((r) => ['pending', 'initiated', 'uploading'].includes(r.status));
      out = out.filter((r) => new Date(r.updated_at).getTime() < new Date(params[0]).getTime());
      // round-1 MAJOR 2: the nightly resolves only PAST slots (slot_date < today)
      if (sql.includes('AND slot_date < $2')) out = out.filter((r) => String(r.slot_date) < params[1]);
      if (sql.includes('AND channel_id = $2') && !sql.includes('slot_date')) out = out.filter((r) => r.channel_id === params[1]);
      if (sql.includes('AND channel_id = $3')) out = out.filter((r) => r.channel_id === params[2]);
      return out.map((r) => ({ ...r }));
    }
    if (sql.startsWith('SELECT') && sql.includes("status = 'uploaded' AND updated_at >=")) {
      return rows
        .filter((r) => r.channel_id === params[0] && r.status === 'uploaded' && new Date(r.updated_at).getTime() >= new Date(params[1]).getTime())
        .map((r) => ({ ...r }));
    }
    throw new Error(`stub: unexpected sql: ${sql.slice(0, 90)}`);
  };
  client.rows = rows;
  client.calls = calls;
  return client;
}

// Fetch stub: routes on method+URL; records into an optional shared seq log.
function makeFetchStub(routes, { seq = null } = {}) {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ kind: 'http', method: opts.method || 'GET', url: String(url), headers: opts.headers || {}, seq });
    if (seq) seq.push({ kind: 'http', method: opts.method || 'GET', url: String(url) });
    const key = calls.length - 1;
    const handler = typeof routes === 'function' ? routes(url, opts, key) : routes.shift();
    if (!handler) throw new Error(`fetch stub: no route for ${String(url).slice(0, 80)}`);
    if (handler.throw) throw handler.throw;
    return new Response(handler.body ?? null, { status: handler.status || 200, headers: handler.headers || {} });
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

const SESSION_URI = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=SECRET-SESSION-1';
const RESOURCE = {
  snippet: { title: 'Why Discipline Beats Motivation', description: 'test', tags: ['t'], categoryId: '27' },
  status: { privacyStatus: 'private', publishAt: '2099-01-01T00:00:00Z', selfDeclaredMadeForKids: false },
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
describe('upload_intents store (D5/AC-P4-6)', () => {
  test('createIntent inserts a pending row keyed UNIQUE per channel+slot_date+kind+slot_idx, before any upload', async () => {
    const db = makeIntentDb();
    const store = makeUploadIntentStore({ dbClient: db });
    const r = await store.createIntent({ channelId: 'quotequarry', slotDate: '2026-10-31', kind: 'short', slotIdx: 1, title: 'My Title' });
    assert.equal(r.ok, true);
    assert.equal(r.conflict, false);
    assert.equal(r.intent.status, 'pending');
    assert.equal(r.intent.slot_idx, 1);
    assert.equal(r.intent.dedupe_key, 'quotequarry:2026-10-31:short:1');
    assert.equal(r.intent.title_fingerprint, titleFingerprint('My Title'));
    const ins = db.calls.find((c) => c.sql.startsWith('INSERT INTO upload_intents'));
    assert.ok(ins, 'intent row written at create time (BEFORE any videos.insert)');
  });

  test('H4 slot discriminator: 2 slots the same day = 2 intents — no false conflict', async () => {
    const db = makeIntentDb();
    const store = makeUploadIntentStore({ dbClient: db });
    const a = await store.createIntent({ channelId: 'c1', slotDate: '2026-10-31', kind: 'short', slotIdx: 0 });
    const b = await store.createIntent({ channelId: 'c1', slotDate: '2026-10-31', kind: 'short', slotIdx: 1 });
    assert.equal(a.conflict, false);
    assert.equal(b.conflict, false);
    assert.equal(db.rows.length, 2);
    assert.notEqual(a.intent.id, b.intent.id);
  });

  test('INSERT-as-mutex: same slot from another lane conflicts and returns the existing intent — never a second row', async () => {
    const db = makeIntentDb();
    const store = makeUploadIntentStore({ dbClient: db });
    await store.createIntent({ channelId: 'c1', slotDate: '2026-10-31', kind: 'doc', slotIdx: 0 });
    const r = await store.createIntent({ channelId: 'c1', slotDate: '2026-10-31', kind: 'doc', slotIdx: 0 });
    assert.equal(r.ok, true);
    assert.equal(r.conflict, true);
    assert.equal(r.existing.status, 'pending');
    assert.equal(db.rows.length, 1, 'unique constraint held — one row only');
  });

  test('status machine: pending → initiated (session_uri persisted) → uploading → uploaded (video_id); failed/abandoned carry a reason', async () => {
    const db = makeIntentDb();
    const store = makeUploadIntentStore({ dbClient: db });
    const { intent } = await store.createIntent({ channelId: 'c1', slotDate: '2026-10-31', kind: 'short', slotIdx: 0 });
    await store.markInitiated(intent.id, SESSION_URI);
    assert.equal(db.rows[0].status, 'initiated');
    assert.equal(db.rows[0].session_uri, SESSION_URI);
    await store.markUploading(intent.id);
    assert.equal(db.rows[0].status, 'uploading');
    await store.markUploaded(intent.id, 'vid123');
    assert.equal(db.rows[0].status, 'uploaded');
    assert.equal(db.rows[0].video_id, 'vid123');

    await store.markFailed(intent.id, 'probe: video missing from playlist');
    assert.equal(db.rows[0].status, 'failed');
    assert.match(db.rows[0].fail_reason, /missing from playlist/);
    await store.markAbandoned(intent.id, 'session expired, no matching upload');
    assert.equal(db.rows[0].status, 'abandoned');
  });

  test('H3 any-day rule: openIntentFor returns ANY open unresolved intent (not just today); terminals excluded; date/kind narrow', async () => {
    const db = makeIntentDb();
    const store = makeUploadIntentStore({ dbClient: db });
    await store.createIntent({ channelId: 'c1', slotDate: '2026-10-29', kind: 'short', slotIdx: 0 }); // two days old
    const { intent: up } = await store.createIntent({ channelId: 'c1', slotDate: '2026-10-31', kind: 'short', slotIdx: 0 });
    await store.markUploaded(up.id, 'vid-old');
    const { intent: other } = await store.createIntent({ channelId: 'c2', slotDate: '2026-10-31', kind: 'doc', slotIdx: 0 });

    const any = await store.openIntentFor('c1');
    assert.equal(any.ok, true);
    assert.equal(any.intents.length, 1, 'the two-day-old open intent is found (any-day, H3)');
    assert.equal(any.intents[0].slot_date, '2026-10-29');

    const today = await store.openIntentFor('c1', { slotDate: '2026-10-31' });
    assert.equal(today.intents.length, 0, 'uploaded terminal is not open');
    assert.equal((await store.openIntentFor('c1', { kind: 'doc' })).intents.length, 0, 'kind narrows');
    assert.equal((await store.openIntentFor('c2')).intents.length, 1);
    void other;
  });

  test('lifecycle reclaim: an abandoned/failed intent is re-claimable — production proceeds after recovery abandon (loser conflicts)', async () => {
    const db = makeIntentDb();
    const store = makeUploadIntentStore({ dbClient: db });
    const { intent } = await store.createIntent({ channelId: 'c1', slotDate: '2026-10-31', kind: 'short', slotIdx: 0 });
    await store.markAbandoned(intent.id, 'recovery');
    const r = await store.createIntent({ channelId: 'c1', slotDate: '2026-10-31', kind: 'short', slotIdx: 0 });
    assert.equal(r.conflict, false, 'abandoned slot is re-claimable — THIS is what lets the lane proceed after abandon');
    assert.equal(r.reclaimed, true);
    assert.equal(r.intent.status, 'pending');
    assert.equal(db.rows.length, 1, 're-claimed in place — no second row');
    // a second concurrent claim loses: the row is pending now, not failed/abandoned
    const loser = await store.createIntent({ channelId: 'c1', slotDate: '2026-10-31', kind: 'short', slotIdx: 0 });
    assert.equal(loser.conflict, true);
  });

  test('never-throw: a dead DB degrades every method to { ok:false } with ONE warn per error class', async () => {
    const warns = [];
    const db = makeIntentDb({ fail: true });
    const store = makeUploadIntentStore({ dbClient: db, warn: (m) => warns.push(m) });
    const created = await store.createIntent({ channelId: 'c1', slotDate: '2026-10-31', kind: 'short', slotIdx: 0 });
    assert.equal(created.ok, false);
    assert.ok(created.error);
    await store.markInitiated('x', SESSION_URI);
    await store.markUploaded('x', 'v');
    await store.markFailed('x', 'r');
    await store.markAbandoned('x', 'r');
    await store.openIntentFor('c1');
    await store.intentsForChannel('c1');
    await store.resolveOrphans({ windowMs: 1000, probe: async () => ({ ok: true, state: 'expired' }) });
    assert.ok(warns.length >= 1, 'warned');
    assert.equal(warns.length, 1, 'ONE memoized warn per error class — not one per call');
  });

  test('SECRET (D5): the session URI never appears in any store warn output', async () => {
    const warns = [];
    const db = makeIntentDb({ fail: true });
    const store = makeUploadIntentStore({ dbClient: db, warn: (m) => warns.push(m) });
    await store.createIntent({ channelId: 'c1', slotDate: '2026-10-31', kind: 'short', slotIdx: 0, sessionUri: SESSION_URI });
    assert.equal(warns.some((m) => m.includes(SESSION_URI)), false);
  });

  test('getUploadIntentStore returns null (never throws) without DATABASE_URL — lanes degrade, never crash', async () => {
    const old = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const store = await getUploadIntentStore();
      assert.equal(store, null);
    } finally {
      if (old !== undefined) process.env.DATABASE_URL = old;
    }
  });
});

// ---------------------------------------------------------------------------
// Resumable protocol (D6, research §1.4)
// ---------------------------------------------------------------------------
describe('resumable upload (D6/research §1.4)', () => {
  test('initiate sends uploadType=resumable + part + X-Upload-Content-* and returns the Location session URI', async () => {
    const fetchImpl = makeFetchStub([{ status: 200, headers: { Location: SESSION_URI } }]);
    const r = await initiateSession({ accessToken: 'tok', resource: RESOURCE, sizeBytes: 1234, fetchImpl });
    assert.equal(r.ok, true);
    assert.equal(r.sessionUri, SESSION_URI);
    const call = fetchImpl.calls[0];
    assert.match(call.url, /uploadType=resumable/);
    assert.match(call.url, /part=snippet%2Cstatus|part=snippet,status/);
    assert.equal(call.headers.Authorization, 'Bearer tok');
    assert.equal(call.headers['X-Upload-Content-Length'], '1234');
    assert.equal(call.headers['X-Upload-Content-Type'], 'video/mp4');
  });

  test('AC-P4-7: the session URI is persisted BEFORE the first byte, then uploaded videoId lands on the row', async () => {
    const seq = [];
    const db = makeIntentDb({ seq });
    const store = makeUploadIntentStore({ dbClient: db });
    const fetchImpl = makeFetchStub((url, opts, key) => {
      if (opts.method === 'POST') return { status: 200, headers: { Location: SESSION_URI } };
      return { status: 201, body: JSON.stringify({ id: 'vid201', snippet: { title: RESOURCE.snippet.title } }) };
    }, { seq });
    const r = await uploadWithIntent({
      store, channelId: 'c1', slotDate: '2026-10-31', kind: 'short', slotIdx: 0,
      title: RESOURCE.snippet.title, accessToken: 'tok', resource: RESOURCE,
      bytes: Buffer.alloc(2048, 7), publishAt: '2099-01-01T00:00:00Z', fetchImpl,
    });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.videoId, 'vid201');
    const idxOf = (pred) => seq.findIndex(pred);
    const insertIdx = idxOf((c) => c.kind === 'sql' && c.sql.startsWith('INSERT INTO upload_intents'));
    const initiatedIdx = idxOf((c) => c.kind === 'sql' && c.sql.includes('session_uri = $3'));
    const putIdx = idxOf((c) => c.kind === 'http' && c.method === 'PUT');
    assert.ok(insertIdx > -1 && initiatedIdx > -1 && putIdx > -1);
    assert.ok(initiatedIdx < putIdx, 'AC-P4-7: session URI row written BEFORE the first byte');
    const markUp = db.rows[0];
    assert.equal(markUp.status, 'uploaded');
    assert.equal(markUp.video_id, 'vid201');
    const put = seq[putIdx];
    assert.match(put.url, /upload_id=SECRET-SESSION-1/);
  });

  test('PUT resumes from the received offset after a 308 (same-run interruption recovery)', async () => {
    const fetchImpl = makeFetchStub((url, opts) => {
      if (opts.method === 'POST') return { status: 200, headers: { Location: SESSION_URI } };
      const range = String(opts.headers['Content-Range'] || '');
      if (range === 'bytes 0-2047/2048') {
        // server "received" the first 1000 bytes only
        return { status: 308, headers: { Range: 'bytes=0-999' } };
      }
      if (range === 'bytes 1000-2047/2048') {
        return { status: 201, body: JSON.stringify({ id: 'vid-resumed' }) };
      }
      throw new Error('unexpected Content-Range: ' + range);
    });
    const r = await uploadWithIntent({
      store: null, channelId: 'c1', slotDate: '2026-10-31', kind: 'short', slotIdx: 0,
      title: 't', accessToken: 'tok', resource: RESOURCE, bytes: Buffer.alloc(2048, 9),
      publishAt: '2099-01-01T00:00:00Z', fetchImpl, sleep: async () => {},
    });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.videoId, 'vid-resumed');
    const put2 = fetchImpl.calls.filter((c) => c.method === 'PUT')[1];
    assert.equal(put2.headers['Content-Range'], 'bytes 1000-2047/2048');
  });

  test('5xx mid-PUT: probe the session, resume from received bytes, complete (research §1.4 retry ladder)', async () => {
    let putCount = 0;
    const fetchImpl = makeFetchStub((url, opts) => {
      if (opts.method === 'POST') return { status: 200, headers: { Location: SESSION_URI } };
      if (opts.method === 'PUT' && String(opts.headers['Content-Range']).startsWith('bytes */')) {
        return { status: 308, headers: { Range: 'bytes=0-499' } }; // status probe
      }
      putCount++;
      if (putCount === 1) return { status: 503, body: 'upstream' };
      return { status: 201, body: JSON.stringify({ id: 'vid-503' }) };
    });
    const sleeps = [];
    const r = await uploadWithIntent({
      store: null, channelId: 'c1', slotDate: '2026-10-31', kind: 'short', slotIdx: 0,
      title: 't', accessToken: 'tok', resource: RESOURCE, bytes: Buffer.alloc(512, 1),
      publishAt: '2099-01-01T00:00:00Z', fetchImpl, sleep: async (ms) => sleeps.push(ms),
    });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.videoId, 'vid-503');
    assert.ok(sleeps.length >= 1, 'backed off before retry');
    const probePut = fetchImpl.calls.find((c) => c.method === 'PUT' && String(c.headers['Content-Range']).startsWith('bytes */'));
    assert.ok(probePut, 'a bytes */N status probe ran before the resume');
  });

  test('round-1 MAJOR 5: the row is marked uploading before the PUT and re-touched on every progress iteration (slow-PUT heartbeat)', async () => {
    const db = makeIntentDb();
    const store = makeUploadIntentStore({ dbClient: db });
    const fetchImpl = makeFetchStub((url, opts) => {
      if (opts.method === 'POST') return { status: 200, headers: { Location: SESSION_URI } };
      const range = String(opts.headers['Content-Range'] || '');
      if (range === 'bytes 0-2047/2048') return { status: 308, headers: { Range: 'bytes=0-999' } };
      return { status: 201, body: JSON.stringify({ id: 'vid-beat' }) };
    });
    const r = await uploadWithIntent({
      store, channelId: 'c1', slotDate: '2026-10-31', kind: 'short', slotIdx: 0,
      title: 't', accessToken: 'tok', resource: RESOURCE, bytes: Buffer.alloc(2048, 3),
      publishAt: '2099-01-01T00:00:00Z', fetchImpl, sleep: async () => {},
    });
    assert.equal(r.ok, true, JSON.stringify(r));
    const beats = db.calls.filter((c) => c.sql === 'UPDATE upload_intents SET status = $2, updated_at = $3 WHERE id = $1 RETURNING id');
    assert.ok(beats.length >= 2, `expected a heartbeat before the PUT AND on the 308 progress iteration, got ${beats.length}`);
    assert.equal(db.rows[0].status, 'uploaded');
  });

  test('H7/D8: a publishAt already past is refused — skipProduction terminal before any HTTP call', async () => {
    const fetchImpl = makeFetchStub(() => { throw new Error('must not call YouTube'); });
    const r = await uploadWithIntent({
      store: null, channelId: 'c1', slotDate: '2026-10-31', kind: 'short', slotIdx: 0,
      title: 't', accessToken: 'tok', resource: RESOURCE, bytes: Buffer.alloc(10),
      publishAt: '2020-01-01T00:00:00Z', fetchImpl,
    });
    assert.equal(r.ok, false);
    assert.equal(r.skipProduction, true);
    assert.equal(r.reason, 'publish_at_past');
    assert.equal(fetchImpl.calls.length, 0, 'never touched YouTube');
  });

  test('H7/D8: publishAt passing DURING an interrupted resume abandons the session — never completes into an instant publish', async () => {
    const db = makeIntentDb();
    const store = makeUploadIntentStore({ dbClient: db });
    let tick = 0;
    const now = () => new Date(Date.UTC(2026, 9, 31, 12, 0, 0) + (tick++ ? 3 * 3600_000 : 0)); // 2nd read: 3h later
    const fetchImpl = makeFetchStub((url, opts) => {
      if (opts.method === 'POST') return { status: 200, headers: { Location: SESSION_URI } };
      return { status: 308, headers: { Range: 'bytes=0-4' } }; // stuck incomplete
    });
    const r = await uploadWithIntent({
      store, channelId: 'c1', slotDate: '2026-10-31', kind: 'short', slotIdx: 0,
      title: 't', accessToken: 'tok', resource: RESOURCE, bytes: Buffer.alloc(16, 1),
      publishAt: '2026-10-31T14:00:00Z', fetchImpl, sleep: async () => {}, now,
    });
    assert.equal(r.ok, false);
    assert.equal(r.skipProduction, true, 'the AC-P4-19-family terminal');
    assert.equal(db.rows[0].status, 'abandoned', 'session abandoned — a past publishAt never completes');
  });

  test('SECRET: the session URI never appears in lane log or warn output (upload + failure paths)', async () => {
    const lines = [];
    const log = (m) => lines.push(String(m));
    // failure path: initiate 500 → markFailed
    const db = makeIntentDb();
    const store = makeUploadIntentStore({ dbClient: db, warn: (m) => lines.push(String(m)) });
    const bad = makeFetchStub([{ status: 500, body: 'nope' }]);
    const failRun = await uploadWithIntent({
      store, channelId: 'c1', slotDate: '2026-10-31', kind: 'short', slotIdx: 0,
      title: 't', accessToken: 'tok', resource: RESOURCE, bytes: Buffer.alloc(10),
      publishAt: '2099-01-01T00:00:00Z', fetchImpl: bad, log, maxAttempts: 1,
    });
    assert.equal(failRun.ok, false);
    // success path with a URI in play
    const ok = makeFetchStub((url, opts) => (opts.method === 'POST'
      ? { status: 200, headers: { Location: SESSION_URI } }
      : { status: 201, body: JSON.stringify({ id: 'vid-secret' }) }));
    const okRun = await uploadWithIntent({
      store, channelId: 'c1', slotDate: '2026-10-31', kind: 'short', slotIdx: 0,
      title: 't2', accessToken: 'tok', resource: RESOURCE, bytes: Buffer.alloc(10),
      publishAt: '2099-01-01T00:00:00Z', fetchImpl: ok, log,
    });
    assert.equal(okRun.ok, true);
    assert.equal(lines.some((m) => m.includes(SESSION_URI) || m.includes('SECRET-SESSION')), false,
      `session URI leaked: ${lines.filter((m) => m.includes('SECRET')).join(' | ')}`);
  });

  test('AC-P4-5 degraded: a dead store still uploads (no intent row) and warns once — production never darkens', async () => {
    const warns = [];
    const db = makeIntentDb({ fail: true });
    const store = makeUploadIntentStore({ dbClient: db, warn: (m) => warns.push(m) });
    const fetchImpl = makeFetchStub((url, opts) => (opts.method === 'POST'
      ? { status: 200, headers: { Location: SESSION_URI } }
      : { status: 201, body: JSON.stringify({ id: 'vid-degraded' }) }));
    const r = await uploadWithIntent({
      store, channelId: 'c1', slotDate: '2026-10-31', kind: 'short', slotIdx: 0,
      title: 't', accessToken: 'tok', resource: RESOURCE, bytes: Buffer.alloc(10),
      publishAt: '2099-01-01T00:00:00Z', fetchImpl, log: () => {},
    });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.videoId, 'vid-degraded');
    assert.equal(r.degraded, true, 'caller learns the intent row is absent');
  });

  test('H3 lifecycle pin: conflict against an in-flight (pending/initiated) intent skips production — no second upload POST', async () => {
    const db = makeIntentDb();
    const store = makeUploadIntentStore({ dbClient: db });
    await store.createIntent({ channelId: 'c1', slotDate: '2026-10-31', kind: 'short', slotIdx: 0 }); // lane A owns it
    const fetchImpl = makeFetchStub(() => { throw new Error('must not touch YouTube on conflict'); });
    const r = await uploadWithIntent({
      store, channelId: 'c1', slotDate: '2026-10-31', kind: 'short', slotIdx: 0,
      title: 't', accessToken: 'tok', resource: RESOURCE, bytes: Buffer.alloc(10),
      publishAt: '2099-01-01T00:00:00Z', fetchImpl,
    });
    assert.equal(r.ok, true);
    assert.equal(r.conflict, true);
    assert.equal(r.skipProduction, true);
    assert.equal(r.videoId, null, 'in-flight owner — no video to claim');
    assert.equal(fetchImpl.calls.length, 0, 'a conflict NEVER proceeds to a second upload');
  });

  test('H3 lifecycle pin: conflict against an UPLOADED intent = slot already produced — skip cleanly WITH the videoId', async () => {
    const db = makeIntentDb();
    const store = makeUploadIntentStore({ dbClient: db });
    const { intent } = await store.createIntent({ channelId: 'c1', slotDate: '2026-10-31', kind: 'short', slotIdx: 0 });
    await store.markUploaded(intent.id, 'vid-already-there');
    const fetchImpl = makeFetchStub(() => { throw new Error('must not touch YouTube'); });
    const r = await uploadWithIntent({
      store, channelId: 'c1', slotDate: '2026-10-31', kind: 'short', slotIdx: 0,
      title: 't', accessToken: 'tok', resource: RESOURCE, bytes: Buffer.alloc(10),
      publishAt: '2099-01-01T00:00:00Z', fetchImpl,
    });
    assert.equal(r.conflict, true);
    assert.equal(r.skipProduction, true);
    assert.equal(r.videoId, 'vid-already-there', 'the caller claims the produced slot (state entry, no upload)');
  });
});

// ---------------------------------------------------------------------------
// Session probe (research §1.4 step 3)
// ---------------------------------------------------------------------------
describe('session probe (research §1.4)', () => {
  test('308 + Range header → incomplete with receivedBytes; no Range → 0 received', async () => {
    const fetchImpl = makeFetchStub([{ status: 308, headers: { Range: 'bytes=0-4095' } }, { status: 308, headers: {} }]);
    const a = await probeSession({ sessionUri: SESSION_URI, totalBytes: 10000, fetchImpl });
    assert.equal(a.ok, true);
    assert.equal(a.state, 'incomplete');
    assert.equal(a.receivedBytes, 4096);
    assert.match(fetchImpl.calls[0].headers['Content-Range'], /^bytes \*\/10000$/);
    const b = await probeSession({ sessionUri: SESSION_URI, totalBytes: 10000, fetchImpl });
    assert.equal(b.state, 'incomplete');
    assert.equal(b.receivedBytes, 0);
  });

  test('probe of a COMPLETED session: 201 + video resource → complete with videoId + title', async () => {
    const fetchImpl = makeFetchStub([{ status: 201, body: JSON.stringify({ id: 'vid-done', snippet: { title: 'Finished' } }) }]);
    const r = await probeSession({ sessionUri: SESSION_URI, totalBytes: 100, fetchImpl });
    assert.equal(r.state, 'complete');
    assert.equal(r.videoId, 'vid-done');
    assert.equal(r.title, 'Finished');
  });

  test('404 → expired (session lifetime is finite/UNVERIFIED — the code never asserts an expiry duration)', async () => {
    const fetchImpl = makeFetchStub([{ status: 404, body: 'not found' }]);
    const r = await probeSession({ sessionUri: SESSION_URI, totalBytes: 100, fetchImpl });
    assert.equal(r.ok, true);
    assert.equal(r.state, 'expired');
  });

  test('unknown total length probes with bytes */*; network error → ok:false error state', async () => {
    const fetchImpl = makeFetchStub([{ status: 308, headers: {} }, { throw: new Error('ECONNRESET') }]);
    const a = await probeSession({ sessionUri: SESSION_URI, totalBytes: null, fetchImpl });
    assert.equal(a.state, 'incomplete');
    assert.equal(fetchImpl.calls[0].headers['Content-Range'], 'bytes */*');
    const b = await probeSession({ sessionUri: SESSION_URI, totalBytes: null, fetchImpl });
    assert.equal(b.ok, false);
    assert.equal(b.state, 'error');
  });
});

// ---------------------------------------------------------------------------
// Crash recovery (D7a/AC-P4-8)
// ---------------------------------------------------------------------------
describe('run-start crash recovery (D7a/AC-P4-8)', () => {
  const TODAY_ISO = new Date().toISOString().slice(0, 10);
  const YESTERDAY_ISO = new Date(Date.now() - 24 * 3600_000).toISOString().slice(0, 10);
  const intentRow = (over = {}) => ({
    id: 'i1', channel_id: 'c1', slot_date: TODAY_ISO, kind: 'short', slot_idx: 0,
    status: 'initiated', session_uri: SESSION_URI, video_id: null,
    title_fingerprint: titleFingerprint('My Title'), fail_reason: null,
    created_at: new Date(Date.now() - 3600_000), updated_at: new Date(Date.now() - 3600_000),
    ...over,
  });

  function seededDb(rows) {
    const db = makeIntentDb();
    db.rows.push(...rows);
    return db;
  }

  test('probe-complete claims the video: markUploaded + resolved outcome — caller marks the slot produced and skips', async () => {
    const db = seededDb([intentRow()]);
    const store = makeUploadIntentStore({ dbClient: db });
    const fetchImpl = makeFetchStub([{ status: 201, body: JSON.stringify({ id: 'vid-claim', snippet: { title: 'My Title' } }) }]);
    const r = await recoverOpenIntents({ store, channelId: 'c1', fetchImpl, staleAfterMs: 30 * 60_000 });
    const o = r.outcomes[0];
    assert.equal(o.status, 'resolved');
    assert.equal(o.via, 'session_probe');
    assert.equal(o.videoId, 'vid-claim');
    assert.equal(db.rows[0].status, 'uploaded');
    assert.equal(db.rows[0].video_id, 'vid-claim');
  });

  test('expired session (404) falls through to the title-fingerprint lookup; found = resolved via title_lookup', async () => {
    const db = seededDb([intentRow()]);
    const store = makeUploadIntentStore({ dbClient: db });
    const fetchImpl = makeFetchStub([{ status: 404 }]); // dead URI — lifetime UNVERIFIED, never asserted
    const r = await recoverOpenIntents({
      store, channelId: 'c1', fetchImpl, staleAfterMs: 30 * 60_000,
      findByTitle: async () => ({ videoId: 'vid-by-title', title: 'My Title' }),
    });
    const o = r.outcomes[0];
    assert.equal(o.status, 'resolved');
    assert.equal(o.via, 'title_lookup');
    assert.equal(o.videoId, 'vid-by-title');
    assert.equal(db.rows[0].status, 'uploaded');
  });

  test('expired + title not found = markAbandoned — the caller proceeds with THIS run\'s fresh production', async () => {
    const db = seededDb([intentRow()]);
    const store = makeUploadIntentStore({ dbClient: db });
    const fetchImpl = makeFetchStub([{ status: 404 }]);
    const r = await recoverOpenIntents({
      store, channelId: 'c1', fetchImpl, staleAfterMs: 30 * 60_000,
      findByTitle: async () => null,
    });
    assert.equal(r.outcomes[0].status, 'abandoned');
    assert.equal(db.rows[0].status, 'abandoned');
  });

  test('a fresh intent inside the stale window is left OPEN (a live lane may own it)', async () => {
    const db = seededDb([intentRow({ updated_at: new Date() })]); // seconds old
    const store = makeUploadIntentStore({ dbClient: db });
    const fetchImpl = makeFetchStub([{ status: 308, headers: {} }]);
    const r = await recoverOpenIntents({ store, channelId: 'c1', fetchImpl, staleAfterMs: 30 * 60_000 });
    assert.equal(r.outcomes[0].status, 'open');
    assert.equal(r.outcomes[0].reason, 'recent_intent');
    assert.equal(db.rows[0].status, 'initiated', 'untouched');
  });

  test('an inconclusive probe (network error) leaves the intent open — the slot mutex still guards it', async () => {
    const db = seededDb([intentRow()]);
    const store = makeUploadIntentStore({ dbClient: db });
    const fetchImpl = makeFetchStub([{ throw: new Error('ECONNRESET') }]);
    const r = await recoverOpenIntents({ store, channelId: 'c1', fetchImpl, staleAfterMs: 30 * 60_000 });
    assert.equal(r.outcomes[0].status, 'open');
    assert.equal(r.outcomes[0].reason, 'probe_error');
  });

  test('an intent that never initiated (no session URI) past the window is abandoned', async () => {
    const db = seededDb([intentRow({ status: 'pending', session_uri: null })]);
    const store = makeUploadIntentStore({ dbClient: db });
    const fetchImpl = makeFetchStub(() => { throw new Error('nothing to probe'); });
    const r = await recoverOpenIntents({ store, channelId: 'c1', fetchImpl, staleAfterMs: 30 * 60_000 });
    assert.equal(r.outcomes[0].status, 'abandoned');
    assert.equal(fetchImpl.calls.length, 0);
  });

  test('store-level resolveOrphans resolves/abandons only open PAST-SLOT intents past the required window', async () => {
    const db = seededDb([
      intentRow({ id: 'old', slot_date: YESTERDAY_ISO, updated_at: new Date(Date.now() - 7200_000) }),
      intentRow({ id: 'fresh', slot_date: YESTERDAY_ISO, updated_at: new Date() }),
    ]);
    const store = makeUploadIntentStore({ dbClient: db });
    const fetchImpl = makeFetchStub([{ status: 404 }]);
    const r = await store.resolveOrphans({
      channelId: 'c1', windowMs: 3600_000, fetchImpl,
      probe: ({ sessionUri }) => probeSession({ sessionUri, totalBytes: null, fetchImpl }),
      findByTitle: async () => null,
    });
    assert.equal(r.ok, true);
    assert.equal(r.outcomes.length, 1, 'only the past-window intent considered');
    assert.equal(r.outcomes[0].status, 'abandoned');
    assert.equal(db.rows.find((x) => x.id === 'fresh').status, 'initiated');
    const missingWindow = await store.resolveOrphans({ probe: async () => ({ ok: true, state: 'expired' }) });
    assert.equal(missingWindow.ok, false, 'windowMs is REQUIRED (job-store staleAfterMs precedent)');
  });

  test('round-1 MAJOR 2: the NIGHTLY path leaves TODAY intents alone however stale — they belong to the lane', async () => {
    const db = seededDb([
      intentRow({ id: 'today-stale', slot_date: TODAY_ISO, updated_at: new Date(Date.now() - 3 * 3600_000) }),
      intentRow({ id: 'yesterday', slot_date: YESTERDAY_ISO, updated_at: new Date(Date.now() - 3 * 3600_000) }),
    ]);
    const store = makeUploadIntentStore({ dbClient: db });
    const fetchImpl = makeFetchStub([{ status: 404 }]);
    const r = await store.resolveOrphans({
      channelId: 'c1', windowMs: 30 * 60_000, fetchImpl,
      probe: ({ sessionUri }) => probeSession({ sessionUri, totalBytes: null, fetchImpl }),
      findByTitle: async () => null,
    });
    assert.equal(r.ok, true);
    assert.deepEqual(r.outcomes.map((o) => o.intent.id), ['yesterday'], 'only the past-slot intent was considered');
    assert.equal(db.rows.find((x) => x.id === 'today-stale').status, 'initiated', 'the today intent is UNTOUCHED — the owning lane resolves it');
  });

  test('round-1 MAJOR 3: recoverOpenIntents(kind) recovers only its own kind — a doc intent is left for the doc lane', async () => {
    const db = seededDb([
      intentRow({ id: 'short-i', kind: 'short' }),
      intentRow({ id: 'doc-i', kind: 'doc', title_fingerprint: titleFingerprint('Doc Episode') }),
    ]);
    const store = makeUploadIntentStore({ dbClient: db });
    const fetchImpl = makeFetchStub([{ status: 404 }]);
    const r = await recoverOpenIntents({
      store, channelId: 'c1', kind: 'short', fetchImpl, staleAfterMs: 30 * 60_000,
      findByTitle: async () => null,
    });
    assert.deepEqual(r.outcomes.map((o) => o.intent.id), ['short-i'], 'the doc intent never entered this lane\'s sweep');
    assert.equal(db.rows.find((x) => x.id === 'doc-i').status, 'initiated', 'the doc claim is intact for yt-deepdive');
  });

  test('round-1 minor 14a: a 308 (incomplete session) past the window with no title match is abandoned — never resumed blind', async () => {
    const db = seededDb([intentRow({ updated_at: new Date(Date.now() - 7200_000) })]);
    const store = makeUploadIntentStore({ dbClient: db });
    const fetchImpl = makeFetchStub([{ status: 308, headers: { Range: 'bytes=0-99' } }]);
    const r = await recoverOpenIntents({
      store, channelId: 'c1', fetchImpl, staleAfterMs: 30 * 60_000,
      findByTitle: async () => null,
    });
    assert.equal(r.outcomes[0].status, 'abandoned');
    assert.equal(db.rows[0].status, 'abandoned');
    const puts = fetchImpl.calls.filter((c) => c.method === 'PUT');
    assert.ok(puts.every((p) => String(p.headers['Content-Range']).startsWith('bytes *')), 'only status probes ran — no byte resume without bytes');
  });

  test('round-1 minor 8: probe-complete returns the committed publishAt from the video resource body', async () => {
    const fetchImpl = makeFetchStub([{ status: 201, body: JSON.stringify({ id: 'v', snippet: { title: 'T' }, status: { publishAt: '2026-11-05T09:00:00Z' } }) }]);
    const r = await probeSession({ sessionUri: SESSION_URI, totalBytes: 10, fetchImpl });
    assert.equal(r.publishAt, '2026-11-05T09:00:00Z');
  });
});

// ---------------------------------------------------------------------------
// Title fingerprint + lookup glue (D7a)
// ---------------------------------------------------------------------------
describe('title fingerprint (D7a)', () => {
  test('titleFingerprint matches the dup-gate normalization exactly', () => {
    assert.equal(titleFingerprint('Stop Begging For Respect | Debt-Free Doctrine'), normTitle('Stop Begging For Respect | Debt-Free Doctrine'));
    assert.equal(titleFingerprint('  Hello, World! 3 Tips  '), normTitle('Hello, World! 3 Tips'));
  });

  test('matchUploadByFingerprint finds an upload by normalized title; empty fingerprint never matches', () => {
    const items = [
      { videoId: 'a', title: 'Why Discipline Beats Motivation' },
      { videoId: 'b', title: 'Other Video' },
    ];
    assert.equal(matchUploadByFingerprint(items, titleFingerprint('Why Discipline Beats  Motivation!')), 'a');
    assert.equal(matchUploadByFingerprint(items, titleFingerprint('unrelated')), null);
    assert.equal(matchUploadByFingerprint(items, ''), null);
  });

  test('makeFindByTitle memoizes the playlist fetch and matches fingerprints', async () => {
    const yt = {
      channels: { list: async () => ({ data: { items: [{ contentDetails: { relatedPlaylists: { uploads: 'UU-x' } } }] } }) },
      playlistItems: { list: async () => ({ data: { items: [{ snippet: { title: 'First Upload', resourceId: { videoId: 'v1' } } }] } }) },
    };
    const calls = [];
    const orig = yt.channels.list;
    yt.channels.list = async (...a) => { calls.push(1); return orig(...a); };
    const find = makeFindByTitle(yt, { log: () => {} });
    assert.equal(await find(titleFingerprint('First Upload')), 'v1');
    assert.equal(await find(titleFingerprint('First Upload')), 'v1');
    assert.equal(calls.length, 1, 'one fetch, memoized');
    assert.equal(await find(titleFingerprint('nothing')), null);
  });

  test('nextFutureSlotISO recomputes from kit slot times; null when no future slot remains today', () => {
    const now = new Date(Date.UTC(2026, 9, 31, 12, 0, 0)); // 12:00 UTC
    assert.equal(nextFutureSlotISO(['09:00', '15:00', '22:35'], { now }), '2026-10-31T15:00:00Z');
    assert.equal(nextFutureSlotISO(['09:00', '11:00'], { now }), '2026-11-01T09:00:00Z', 'nothing left today → tomorrow\'s first slot');
    assert.deepEqual(nextFutureSlotISO([], { now }), null, 'no slots at all → the skip terminal');
  });
});

// ---------------------------------------------------------------------------
// Nightly reconciliation (D7b/AC-P4-9 + round-1 CRITICAL 1)
// ---------------------------------------------------------------------------
describe('nightly reconciliation diff (D7b/AC-P4-9)', () => {
  const TODAY_ISO = new Date().toISOString().slice(0, 10);
  const OLD_ISO = '2020-06-01'; // far outside any fetched 50-item recency window

  test('diffPlaylistVsIntents: orphans have no intent row; ghosts are uploaded intents missing from the playlist', async () => {
    const { diffPlaylistVsIntents } = await import('../lib/upload-intents.mjs');
    const playlist = [{ videoId: 'v1', title: 'A' }, { videoId: 'v2', title: 'B' }, { videoId: 'hand', title: 'Hand upload' }];
    const intents = [
      { id: 'i1', status: 'uploaded', video_id: 'v1' },
      { id: 'i2', status: 'uploaded', video_id: 'GHOST' },
      { id: 'i3', status: 'abandoned', video_id: null },
    ];
    const d = diffPlaylistVsIntents({ playlist, intents });
    assert.deepEqual(d.orphans.map((o) => o.videoId).sort(), ['hand', 'v2']);
    assert.deepEqual(d.ghosts.map((g) => g.id), ['i2']);
  });

  test('orphans are orphan-noted via T4 emitWarning (advisory, per-video dedupe) and NEVER backfilled as intents (L5)', async () => {
    const { reconcileChannel } = await import('../lib/upload-intents.mjs');
    const db = makeIntentDb();
    const store = makeUploadIntentStore({ dbClient: db });
    const opened = [];
    const fakeEmit = async (wStore, fields) => { opened.push(fields); return { ok: true, id: 1, deduped: false }; };
    const fetchImpl = makeFetchStub((url) => {
      if (url.includes('/channels?')) return { status: 200, body: JSON.stringify({ items: [{ contentDetails: { relatedPlaylists: { uploads: 'UU1' } } }] }) };
      if (url.includes('/playlistItems?')) return { status: 200, body: JSON.stringify({ items: [{ contentDetails: { videoId: 'orphan1', videoPublishedAt: TODAY_ISO }, snippet: { title: 'Hand Upload' } }] }) };
      throw new Error('unexpected ' + url);
    });
    const r = await reconcileChannel({
      slug: 'c1', accessToken: 'tok', store, warningsStore: {}, emitWarning: fakeEmit,
      fetchImpl, staleAfterMs: 3600_000, log: () => {},
    });
    assert.equal(r.ok, true);
    assert.equal(opened.length, 1);
    assert.equal(opened[0].code, 'upload_orphan');
    assert.equal(opened[0].severity, 'advisory');
    assert.match(opened[0].dedupe_key, /c1:upload_orphan:orphan1/, 'per-video dedupe key (L4: re-found orphan never re-rows — T4 openWarning dedupes it)');
    assert.equal(db.rows.length, 0, 'L5: the orphan was NEVER backfilled as an intent row');
  });

  test('CRITICAL 1 TRUE ghost (in window, older than the min age, absent from playlist AND videos.list) is markFailed + warned', async () => {
    const { reconcileChannel } = await import('../lib/upload-intents.mjs');
    const db = makeIntentDb();
    const store = makeUploadIntentStore({ dbClient: db });
    const { intent } = await store.createIntent({ channelId: 'c1', slotDate: OLD_ISO, kind: 'short', slotIdx: 0 });
    await store.markUploaded(intent.id, 'ghost-vid');
    // age the row past the 12h minimum (the playlist lag guard)
    db.rows[0].updated_at = new Date(Date.now() - 13 * 3600_000);
    const opened = [];
    const fakeEmit = async (wStore, fields) => { opened.push(fields); return { ok: true, id: 1 }; };
    const fetchImpl = makeFetchStub((url) => {
      if (url.includes('/channels?')) return { status: 200, body: JSON.stringify({ items: [{ contentDetails: { relatedPlaylists: { uploads: 'UU1' } } }] }) };
      if (url.includes('/playlistItems?')) return { status: 200, body: JSON.stringify({ items: [{ contentDetails: { videoId: 'other', videoPublishedAt: OLD_ISO }, snippet: { title: 'Some Other Video' } }] }) };
      if (url.includes('/videos?')) return { status: 200, body: JSON.stringify({ items: [] }) }; // verified absent
      throw new Error('unexpected ' + url);
    });
    await reconcileChannel({
      slug: 'c1', accessToken: 'tok', store, warningsStore: {}, emitWarning: fakeEmit,
      fetchImpl, staleAfterMs: 3600_000, log: () => {},
    });
    assert.equal(db.rows[0].status, 'failed');
    assert.match(db.rows[0].fail_reason, /reconcile/);
    const ghostWarnings = opened.filter((f) => f.code === 'upload_ghost');
    assert.equal(ghostWarnings.length, 1);
    assert.equal(ghostWarnings[0].severity, 'warning');
    assert.notEqual(ghostWarnings[0].severity, 'blocking', 'a reconcile finding never parks a channel (H9)');
  });

  test('CRITICAL 1(i): an uploaded intent OLDER than the fetched playlist window is never a ghost — no false markFailed', async () => {
    const { reconcileChannel } = await import('../lib/upload-intents.mjs');
    const db = makeIntentDb();
    const store = makeUploadIntentStore({ dbClient: db });
    const { intent } = await store.createIntent({ channelId: 'c1', slotDate: '2019-01-01', kind: 'short', slotIdx: 0 });
    await store.markUploaded(intent.id, 'beyond-page-1');
    db.rows[0].updated_at = new Date(Date.now() - 13 * 3600_000);
    let reachedVideos = false;
    const opened = [];
    const fetchImpl = makeFetchStub((url) => {
      if (url.includes('/channels?')) return { status: 200, body: JSON.stringify({ items: [{ contentDetails: { relatedPlaylists: { uploads: 'UU1' } } }] }) };
      if (url.includes('/playlistItems?')) return { status: 200, body: JSON.stringify({ items: [{ contentDetails: { videoId: 'recent', videoPublishedAt: TODAY_ISO }, snippet: { title: 'Recent' } }] }) };
      if (url.includes('/videos?')) { reachedVideos = true; return { status: 200, body: JSON.stringify({ items: [] }) }; }
      throw new Error('unexpected ' + url);
    });
    const r = await reconcileChannel({
      slug: 'c1', accessToken: 'tok', store, warningsStore: {}, emitWarning: async (s, f) => { opened.push(f); return { ok: true }; },
      fetchImpl, staleAfterMs: 3600_000, log: () => {},
    });
    assert.equal(r.ghosts, 0, 'the 50-item fetch cannot see page 2 — an intent older than the window is NOT a ghost');
    assert.equal(opened.filter((f) => f.code === 'upload_ghost').length, 0, 'no ghost warning');
    assert.equal(reachedVideos, false, 'videos.list must not even be reached for out-of-window intents');
    assert.equal(db.rows[0].status, 'uploaded', 'row untouched (a false ghost would one-shot re-claim and RE-UPLOAD)');
  });

  test('CRITICAL 1(ii): an intent touched inside the 12h min-age window is never a ghost — playlist lag is not absence', async () => {
    const { reconcileChannel } = await import('../lib/upload-intents.mjs');
    const db = makeIntentDb();
    const store = makeUploadIntentStore({ dbClient: db });
    const { intent } = await store.createIntent({ channelId: 'c1', slotDate: TODAY_ISO, kind: 'short', slotIdx: 0 });
    await store.markUploaded(intent.id, 'just-uploaded');
    db.rows[0].updated_at = new Date(Date.now() - 1 * 3600_000); // 1h old — INSIDE the guard
    let reachedVideos = false;
    const opened = [];
    const fetchImpl = makeFetchStub((url) => {
      if (url.includes('/channels?')) return { status: 200, body: JSON.stringify({ items: [{ contentDetails: { relatedPlaylists: { uploads: 'UU1' } } }] }) };
      if (url.includes('/playlistItems?')) return { status: 200, body: JSON.stringify({ items: [{ contentDetails: { videoId: 'other', videoPublishedAt: TODAY_ISO }, snippet: { title: 'Other' } }] }) };
      if (url.includes('/videos?')) { reachedVideos = true; return { status: 200, body: JSON.stringify({ items: [] }) }; }
      throw new Error('unexpected ' + url);
    });
    const r = await reconcileChannel({
      slug: 'c1', accessToken: 'tok', store, warningsStore: {}, emitWarning: async (s, f) => { opened.push(f); return { ok: true }; },
      fetchImpl, staleAfterMs: 3600_000, log: () => {},
    });
    assert.equal(r.ghosts, 0);
    assert.equal(opened.filter((f) => f.code === 'upload_ghost').length, 0);
    assert.equal(reachedVideos, false, 'videos.list must not be reached for too-young intents');
    assert.equal(db.rows[0].status, 'uploaded', 'row untouched');
  });

  test('CRITICAL 1(iii): absent from the playlist but PRESENT via videos.list — exists, never a ghost (private/scheduled visibility is UNVERIFIED)', async () => {
    const { reconcileChannel } = await import('../lib/upload-intents.mjs');
    const db = makeIntentDb();
    const store = makeUploadIntentStore({ dbClient: db });
    const { intent } = await store.createIntent({ channelId: 'c1', slotDate: OLD_ISO, kind: 'short', slotIdx: 0 });
    await store.markUploaded(intent.id, 'scheduled-but-alive');
    db.rows[0].updated_at = new Date(Date.now() - 13 * 3600_000);
    const opened = [];
    const fetchImpl = makeFetchStub((url) => {
      if (url.includes('/channels?')) return { status: 200, body: JSON.stringify({ items: [{ contentDetails: { relatedPlaylists: { uploads: 'UU1' } } }] }) };
      if (url.includes('/playlistItems?')) return { status: 200, body: JSON.stringify({ items: [{ contentDetails: { videoId: 'other', videoPublishedAt: OLD_ISO }, snippet: { title: 'Other' } }] }) };
      if (url.includes('/videos?')) return { status: 200, body: JSON.stringify({ items: [{ id: 'scheduled-but-alive' }] }) }; // EXISTS
      throw new Error('unexpected ' + url);
    });
    const r = await reconcileChannel({
      slug: 'c1', accessToken: 'tok', store, warningsStore: {}, emitWarning: async (s, f) => { opened.push(f); return { ok: true }; },
      fetchImpl, staleAfterMs: 3600_000, log: () => {},
    });
    assert.equal(r.ghosts, 0, 'a video that EXISTS is never a ghost, whatever the playlist says');
    assert.equal(opened.filter((f) => f.code === 'upload_ghost').length, 0);
    assert.equal(db.rows[0].status, 'uploaded', 'row untouched');
  });

  test('round-1 MAJOR 4: matchUploadedIntentsToQueue pairs terminal-uploaded intents with unposted queue entries by fingerprint', async () => {
    const { matchUploadedIntentsToQueue } = await import('../lib/upload-intents.mjs');
    const clips = [
      { title: 'First Clip', postedAt: '2026-10-30T00:00:00Z' }, // already marked — never re-marked
      { title: 'Second Clip! (v2)' },                            // unposted, matches the intent
      { title: 'Third Clip' },                                   // unposted, no intent
    ];
    const uploadedIntents = [
      { id: 'i1', status: 'uploaded', title_fingerprint: titleFingerprint('second clip v2') },
      { id: 'i2', status: 'uploaded', title_fingerprint: titleFingerprint('first clip') },
      { id: 'i3', status: 'uploaded', title_fingerprint: '' }, // no fingerprint — skipped
    ];
    const matches = matchUploadedIntentsToQueue({ uploadedIntents, clips });
    assert.equal(matches.length, 1);
    assert.equal(matches[0].intent.id, 'i1');
    assert.equal(matches[0].entry.title, 'Second Clip! (v2)');
  });

  test('round-1 minor: slotISOOnDate builds a slot time on its OWN date; malformed input is null', async () => {
    const { slotISOOnDate } = await import('../lib/upload-intents.mjs');
    assert.equal(slotISOOnDate('2026-10-29', '9:05'), '2026-10-29T09:05:00Z');
    assert.equal(slotISOOnDate('2026-10-29', '22:35'), '2026-10-29T22:35:00Z');
    assert.equal(slotISOOnDate('garbage', '22:35'), null);
    assert.equal(slotISOOnDate('2026-10-29', ''), null);
  });
});

// ---------------------------------------------------------------------------
// Lane wiring pins (the three lanes use the shared module correctly)
// ---------------------------------------------------------------------------
describe('lane wiring (yt-daily / yt-deepdive / shorts-clips)', () => {
  const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

  test('yt-daily: recovery BEFORE the slot loop; two-step upload with kind short + slotIdx = loop index; conflicts skip', () => {
    const s = src('yt-daily.mjs');
    const recIdx = s.indexOf('recoverOpenIntents');
    const loopIdx = s.indexOf('for (let i = 0; i < slotLimit; i++)');
    assert.ok(recIdx > -1 && loopIdx > -1);
    assert.ok(recIdx < loopIdx, 'AC-P4-8: open intents resolved BEFORE any slot production');
    assert.match(s, /recoverOpenIntents\(\{\s*store: intents, channelId: slug, kind: 'short'/, 'round-1 MAJOR 3: recovery is kind-scoped to shorts');
    assert.match(s, /kind:\s*'short'/, 'kind = short');
    assert.match(s, /slotIdx:\s*i\b/, 'H4: the b.slots loop index is the slot discriminator');
    assert.ok(s.includes('uploadWithIntent'), 'videos.insert replaced by the shared two-step upload');
    assert.ok(!/yt\.videos\.insert\s*\(/.test(s), 'no googleapis one-shot insert remains in yt-daily');
    assert.match(s, /recoveredSlotIdx/, 'recovered slots are marked produced and skipped');
    assert.match(s, /if \(up\.conflict\)/, 'round-1 MAJOR 4/minor 9: the conflict-claim path is explicit');
    assert.match(s, /titleFingerprint|title_fingerprint/, 'claimed uploads record the fingerprint, not this run\'s title');
  });

  test('yt-deepdive: recovery before production; kind doc + slotIdx 0; resolved claim writes deepdiveDate and exits', () => {
    const s = src('yt-deepdive.mjs');
    assert.match(s, /kind: 'doc'/);
    assert.match(s, /slotIdx:\s*0/);
    assert.ok(s.includes('recoverOpenIntents'));
    assert.ok(s.includes('uploadWithIntent'));
    assert.ok(!/yt\.videos\.insert\s*\(/.test(s), 'no googleapis one-shot insert remains in yt-deepdive');
    assert.match(s, /deepdiveDate\s*=\s*today\(\)/, 'recovered/claimed doc marks the slot produced');
    assert.match(s, /const docTitle = .*slice\(0, 95\)/, 'minor 7: the intent fingerprints the EXACT uploaded (sliced) title');
  });

  test('shorts-clips: publisher uploads via the shared two-step with kind short + slotIdx 0; recovered claims mark the queue entry posted', () => {
    const s = src('longvideo/shorts-clips.mjs');
    assert.match(s, /recoverOpenIntents\(\{ store: intents, channelId: slug, kind: 'short'/, 'round-1 MAJOR 3: recovery is kind-scoped');
    assert.match(s, /kind:\s*'short'/);
    assert.match(s, /slotIdx:\s*0/);
    assert.ok(s.includes('uploadWithIntent'));
    assert.ok(!/yt\.videos\.insert\s*\(/.test(s), 'no googleapis one-shot insert remains in shorts-clips');
    assert.match(s, /postedAt/, 'recovered claims mark the queue entry so the slot is never re-picked');
    assert.match(s, /uploadedIntentsFor/, 'round-1 MAJOR 4: the terminal-intent sweep runs before picking');
    assert.match(s, /matchUploadedIntentsToQueue/, 'the sweep matches by fingerprint');
    assert.match(s, /const clipUploadTitle = clip\.title\.slice\(0, 100\)/, 'minor 7: the intent fingerprints the EXACT uploaded (sliced) title');
  });
});

// ---------------------------------------------------------------------------
// D24/AC-P4-32 — the pipeline quota gate consumes youtube_quota_models rows;
// the legacy 10k-pool/1,700-per-upload math is the NO-DB path only.
// ---------------------------------------------------------------------------
describe('quota-model wiring (D24/AC-P4-32)', () => {
  test('with the #104 model, ~15 uploads/day do NOT false-park; legacy math parks at ~5', async () => {
    // NOTE (round-1 minor 13, pinned here): evaluate() enforces the shared
    // UNITS pool (10,000/day) — it does NOT enforce the model's insertPerDay
    // CALL bucket (100 calls/day). That is fine today: ~30 channels at a few
    // uploads/day sit far below 100 insert calls; revisit only if upload
    // volume approaches the call cap.
    const { evaluate, DEFAULT_QUOTA_MODEL } = await import('../lib/quota-ledger.mjs');
    const state = { c1: { uploadsToday: { date: ptDate(), count: 15 } } };
    const modeled = evaluate(state, { model: DEFAULT_QUOTA_MODEL });
    assert.equal(modeled.allowed, true, '15 x 100 units vs the 10k pool — no false park');
    const custom = evaluate(state, { model: { ...DEFAULT_QUOTA_MODEL, seededDefault: false, insertCostUnits: 100, sharedUnitsPerDay: 10000 } });
    assert.equal(custom.allowed, true, 'a stored row (not just the default) drives the verdict');
    const legacy = evaluate(state);
    assert.equal(legacy.allowed, false, 'the legacy fallback (15 x 1700) parks — it is the no-DB path ONLY');
    const five = evaluate({ c1: { uploadsToday: { date: ptDate(), count: 5 } } });
    assert.equal(five.allowed, false, 'legacy math parks at ~5 uploads (the false-park D24 kills)');
  });

  test('the pipeline quotaGate loads the model row (workspace key, no-row → DEFAULT) and passes { model } to evaluate', async () => {
    const s = fs.readFileSync(path.join(ROOT, 'channel-pipeline.mjs'), 'utf8');
    const gate = s.slice(s.indexOf('async function quotaGate'), s.indexOf("if (q.allowed) return true;"));
    assert.match(gate, /loadQuotaModel/, 'the gate loads the youtube_quota_models row (D24)');
    assert.match(gate, /YT_GCP_PROJECT_ID \|\| 'workspace-default'/, 'same workspace key as the Studio schedule route');
    assert.match(gate, /evaluate\(loadState\(\), \{ model \}\) : evaluate\(loadState\(\)\)/, 'model-aware evaluate when loaded; legacy evaluate as the no-DB fallback');
    assert.match(gate, /dbReady && db/, 'legacy constants survive ONLY the no-DB path');
  });
});
