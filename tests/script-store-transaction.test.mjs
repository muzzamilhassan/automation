// #106 Phase 5 T5f — THE REGRESSION PIN for the live-pilot bug (MR pilot run
// 41478922660): saveGeneratedScript → saveScript issued literal BEGIN/COMMIT
// through adaptPostgres → sql.unsafe — but studio/lib/db.mjs builds the prod
// client as a POOL (max: 5). postgres.js refuses manual transaction commands
// on a pooled client (CommandComplete('BEGIN') on an unreserved connection →
// UNSAFE_TRANSACTION), so EVERY live save failed, nothing ever persisted, and
// the gated channels generated nightly into an EMPTY review desk. The unit
// suite never caught it: every test injects a fake store/client, so the real
// driver path was never exercised against a real transaction.
//
// THIS suite exercises the real driver: a REAL postgres.js client (max: 5,
// prepare: false — the prod db.mjs options) pointed at a wire-level fixture
// server that speaks the Postgres backend protocol (startup handshake,
// Parse/Describe/Bind/Execute/Sync, CommandComplete, ReadyForQuery with the
// real transaction status bytes). The fixture stages INSERTs per connection
// and applies them only on COMMIT — so BEGIN..COMMIT..ROLLBACK semantics are
// proven end-to-end through postgres.js's own sql.begin machinery, and the
// old failure mode is reproduced verbatim: a raw BEGIN through the positional
// adapter on the SAME pooled client explodes with the driver's own
// UNSAFE_TRANSACTION. The store-level fakes (tests/script-store.test.mjs)
// stay for logic; this file pins the TRANSPORT.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import postgres from 'postgres';
import { adaptPostgres } from '../studio/lib/provider-routing.js';
import { makeScriptStore, adaptPostgresTransact } from '../lib/script-store.mjs';

const BASE = {
  channelId: 'money-rulebook',
  templateId: 'finance-explainers',
  templateVersion: '1.0.0',
  kind: 'shorts',
  title: 'The Savings Rate Lie',
  text: 'HOOK...\nPOINT...\nCLOSING...',
  fullRenderInput: { hook: 'h', points: [{ line: 'p1' }], closing: 'c', thumbHeadline: 'T', seed: null, themes: null, publishAt: null },
  sources: [
    { url: 'https://example.com/a', title: 'A', snippet: 'a' },
    { url: 'https://example.com/b', title: 'B', snippet: 'b' },
  ],
  claims: [
    { claim: 'c1', sourceIdx: 0, verification: 'verified' },
    { claim: 'c2', sourceIdx: null, verification: 'unverified' },
  ],
  jobId: 'job-wire-1',
  dedupeVerdictId: null,
  slotDate: '2026-11-01',
  slotIdx: 0,
  publishAt: null,
};

// ---------------------------------------------------------------------------
// The wire-level Postgres fixture server. Speaks enough of the backend
// protocol for postgres.js (max: 5, prepare: false): startup, extended-query
// sequences (Parse → ParseComplete, Describe → ParameterDescription + NoData,
// Bind → BindComplete, Execute → CommandComplete, Sync → ReadyForQuery with
// the REAL status byte 'I'/'T'), and ErrorResponse injection. INSERTs are
// staged per connection and applied only on COMMIT (a ROLLBACK discards them)
// — the stub-side twin of a real backend's transaction semantics.
// ---------------------------------------------------------------------------
function startPostgresStub({ failOnSql = null } = {}) {
  const conns = [];
  const timeline = []; // one entry per EXECUTED statement: { conn, sql, tag, inTx }
  const committed = { scripts: [], script_sources: [], script_claims: [] };

  const server = net.createServer((socket) => {
    const conn = {
      socket,
      id: `c${conns.length + 1}`,
      started: false,
      inTx: false,
      staged: [],
      pending: null,
      buf: Buffer.alloc(0),
    };
    conns.push(conn);
    socket.on('data', (chunk) => {
      conn.buf = Buffer.concat([conn.buf, chunk]);
      drain(conn);
    });
    socket.on('error', () => { /* the driver destroys sockets on purpose (the UNSAFE_TRANSACTION repro) */ });
  });

  const i32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
  const i16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16BE(n & 0xffff); return b; };
  const cs = (s) => Buffer.from(`${s}\0`, 'utf8');
  const pkt = (type, payload) => Buffer.concat([Buffer.from([type]), i32(payload.length + 4), payload]);
  const ready = (s) => pkt(0x5a, Buffer.from([s.charCodeAt(0)])); // 'I' idle | 'T' in-transaction

  function send(conn, msg) {
    if (!conn.socket.destroyed) conn.socket.write(msg);
  }

  function readCstring(buf, offset) {
    let end = offset;
    while (end < buf.length && buf[end] !== 0) end++;
    return { text: buf.toString('utf8', offset, end), next: end + 1 };
  }

  function drain(conn) {
    if (!conn.started) {
      if (conn.buf.length < 4) return;
      const len = conn.buf.readUInt32BE(0);
      if (conn.buf.length < len) return;
      conn.buf = conn.buf.subarray(len);
      conn.started = true;
      send(conn, pkt(0x52, i32(0))); // AuthenticationOk
      send(conn, pkt(0x53, Buffer.concat([cs('server_version'), cs('16.0 (fixture)')])));
      send(conn, pkt(0x53, Buffer.concat([cs('client_encoding'), cs('UTF8')])));
      send(conn, pkt(0x4b, Buffer.concat([i32(999), i32(888)]))); // BackendKeyData
      send(conn, ready('I'));
    }
    while (conn.buf.length >= 5) {
      const type = String.fromCharCode(conn.buf[0]);
      const len = conn.buf.readUInt32BE(1);
      if (conn.buf.length < 1 + len) return;
      const body = conn.buf.subarray(5, 1 + len);
      conn.buf = conn.buf.subarray(1 + len);
      handle(conn, type, body);
    }
  }

  function handle(conn, type, body) {
    if (type === 'P') { // Parse — remember the SQL for the following Bind/Execute
      const name = readCstring(body, 0);
      conn.pending = { sql: readCstring(body, name.next).text.replace(/\s+/g, ' ').trim() };
      send(conn, pkt(0x31, Buffer.alloc(0))); // ParseComplete
    } else if (type === 'D') { // Describe
      send(conn, pkt(0x74, i16(0))); // ParameterDescription (0 params — types stay client-side)
      send(conn, pkt(0x6e, Buffer.alloc(0))); // NoData
    } else if (type === 'B') { // Bind
      send(conn, pkt(0x32, Buffer.alloc(0))); // BindComplete
    } else if (type === 'E') { // Execute
      executePending(conn);
    } else if (type === 'S') { // Sync
      send(conn, ready(conn.inTx ? 'T' : 'I'));
    } else if (type === 'H') { // Flush — responses already streamed per message
    } else if (type === 'Q') { // simple query (unused by the store; kept for completeness)
      conn.pending = { sql: body.toString('utf8', 0, body.length - 1).trim() };
      executePending(conn);
      send(conn, ready(conn.inTx ? 'T' : 'I'));
    } // 'X' Terminate / anything else: ignored
  }

  function executePending(conn) {
    const sql = conn.pending?.sql || '';
    conn.pending = null;
    const s = sql.toUpperCase();
    const inTx = conn.inTx;
    let tag;
    if (s.startsWith('BEGIN')) {
      conn.inTx = true;
      tag = 'BEGIN';
    } else if (s.startsWith('COMMIT')) {
      conn.inTx = false;
      for (const item of conn.staged) committed[item.table].push(item);
      conn.staged = [];
      tag = 'COMMIT';
    } else if (s.startsWith('ROLLBACK')) {
      conn.inTx = false;
      conn.staged = [];
      tag = 'ROLLBACK';
    } else {
      const m = sql.match(/INSERT INTO (scripts|script_sources|script_claims)/i);
      tag = m ? 'INSERT 0 1' : `${sql.split(' ')[0].toUpperCase()}`;
      if (m) {
        if (failOnSql && sql.includes(failOnSql)) {
          timeline.push({ conn: conn.id, sql, tag: 'ERROR', inTx });
          send(conn, pkt(0x45, Buffer.concat([
            Buffer.from([0x53]), cs('ERROR'),
            Buffer.from([0x56]), cs('ERROR'),
            Buffer.from([0x43]), cs('23503'),
            Buffer.from([0x4d]), cs(`fixture forced failure at: ${failOnSql}`),
            Buffer.alloc(1),
          ]))); // ErrorResponse — the transaction stays open (backend semantics)
          return;
        }
        conn.staged.push({ table: m[1], sql });
      }
    }
    timeline.push({ conn: conn.id, sql, tag, inTx });
    send(conn, pkt(0x43, cs(tag))); // CommandComplete
  }

  server.listen(0, '127.0.0.1');
  return {
    server,
    timeline,
    committed,
    async url() {
      await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
      });
      return `postgres://stub:stub@127.0.0.1:${server.address().port}/stub`;
    },
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

// postgres.js's end() can linger on a connection the driver destroyed — race
// it against a short delay so a fixture quirk can never hang CI.
async function closeClient(sql) {
  await Promise.race([sql.end({ timeout: 1 }).catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);
}

describe('#106 T5f — the script save rides a REAL postgres.js reserved-connection transaction (wire-level)', () => {
  test('saveScript over the real driver: exactly BEGIN..6 INSERTs..COMMIT on ONE reserved connection, rows committed', async () => {
    const stub = startPostgresStub();
    let sql = null;
    try {
      const url = await stub.url();
      sql = postgres(url, { max: 5, prepare: false }); // db.mjs options (minus ssl — the fixture is plaintext)
      const store = makeScriptStore({ dbClient: adaptPostgres(sql), transact: adaptPostgresTransact(sql) });
      const r = await store.saveScript(BASE);
      assert.equal(r.ok, true, `the save must succeed through the real driver (was UNSAFE_TRANSACTION before T5f): ${r.error ?? ''}`);

      const ctrl = stub.timeline.filter((t) => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(t.tag));
      assert.deepEqual(ctrl.map((t) => t.tag), ['BEGIN', 'COMMIT'], 'the transport issued exactly BEGIN..COMMIT — no other transaction command anywhere');
      assert.equal(ctrl[0].conn, ctrl[1].conn, 'BEGIN..COMMIT shared one connection');
      const reservedConn = ctrl[0].conn;
      const inserts = stub.timeline.filter((t) => t.tag === 'INSERT 0 1');
      assert.equal(inserts.length, 5, '1 script + 2 sources + 2 claims executed');
      assert.ok(inserts.every((t) => t.conn === reservedConn), 'every save statement rode the RESERVED connection (the begin connection), never a random pool client');
      assert.ok(inserts.every((t) => t.inTx), 'every save statement executed INSIDE the transaction');
      const firstInsert = stub.timeline.findIndex((t) => t.tag === 'INSERT 0 1');
      const lastInsert = stub.timeline.map((t) => t.tag).lastIndexOf('INSERT 0 1');
      assert.ok(firstInsert > stub.timeline.findIndex((t) => t.tag === 'BEGIN'), 'BEGIN precedes the writes');
      assert.ok(lastInsert < stub.timeline.findIndex((t) => t.tag === 'COMMIT'), 'all writes precede COMMIT');
      assert.equal(stub.committed.scripts.length, 1, 'the COMMIT applied the script row');
      assert.equal(stub.committed.script_sources.length, 2, 'the COMMIT applied the sources');
      assert.equal(stub.committed.script_claims.length, 2, 'the COMMIT applied the claims');
    } finally {
      if (sql) await closeClient(sql);
      await stub.close();
    }
  });

  test('a mid-save failure: the transport ROLLBACKs on the wire — the driver errors, nothing commits', async () => {
    const stub = startPostgresStub({ failOnSql: 'INSERT INTO script_claims' });
    let sql = null;
    try {
      const url = await stub.url();
      sql = postgres(url, { max: 5, prepare: false });
      const store = makeScriptStore({ dbClient: adaptPostgres(sql), transact: adaptPostgresTransact(sql) });
      const r = await store.saveScript(BASE);
      assert.equal(r.ok, false, 'the save degrades, never throws');
      assert.match(r.error, /fixture forced failure/);
      assert.ok(stub.timeline.some((t) => t.tag === 'ROLLBACK'), 'sql.begin issued ROLLBACK on the wire');
      assert.equal(stub.timeline.some((t) => t.tag === 'COMMIT'), false, 'a failed save never COMMITs');
      assert.equal(stub.committed.scripts.length, 0, 'the staged script row was rolled back — nothing persisted');
      assert.equal(stub.committed.script_claims.length, 0);
      const inserts = stub.timeline.filter((t) => t.tag === 'INSERT 0 1');
      assert.ok(inserts.every((t) => t.inTx), 'even the pre-failure writes stayed inside the transaction');
    } finally {
      if (sql) await closeClient(sql);
      await stub.close();
    }
  });
});

describe('#106 T5f — the old failure mode, reproduced by the REAL driver (the guard the fix must keep)', () => {
  test('a raw BEGIN through the positional adapter on the pooled client explodes with UNSAFE_TRANSACTION', async () => {
    const stub = startPostgresStub();
    let sql = null;
    try {
      const url = await stub.url();
      sql = postgres(url, { max: 5, prepare: false });
      // THE pre-T5f save path: dbClient('BEGIN') → sql.unsafe on the pool.
      await assert.rejects(
        () => adaptPostgres(sql)('BEGIN', []),
        (e) => /UNSAFE_TRANSACTION|Only use sql\.begin|sql\.reserved|max: 1/i.test(`${e.code ?? ''} ${e.message ?? ''}`),
        'the live-pilot failure mode: postgres.js refuses manual transactions on a pool — the stores must never route BEGIN/COMMIT through the positional client',
      );
    } finally {
      if (sql) await closeClient(sql);
      await stub.close();
    }
  });
});

describe('#106 T5f — the adapter pin: adaptPostgresTransact maps transact onto sql.begin (driver API surface mocked at the ADAPTER level)', () => {
  function fakeSql({ failFn = false } = {}) {
    const seen = [];
    const make = () => {
      const sql = {};
      sql.begin = async (fn) => {
        seen.push('begin');
        const tx = () => { throw new Error('raw tx calls are not the contract — statements go through tx.unsafe'); };
        tx.unsafe = async (text, params) => {
          seen.push(`tx.unsafe:${text}`);
          if (failFn) throw new Error('statement failed');
          return [{ id: 7, params }];
        };
        try {
          const out = await fn(tx);
          seen.push('commit');
          return out;
        } catch (e) {
          seen.push('rollback');
          throw e;
        }
      };
      sql.seen = seen;
      return sql;
    };
    return make;
  }

  test('transact(fn) runs fn\'s statements on the sql.begin handle via tx.unsafe — the positional contract is preserved', async () => {
    const make = fakeSql();
    const sql = make();
    const transact = adaptPostgresTransact(sql);
    const rows = await transact(async (tx) => tx('INSERT INTO t (a) VALUES ($1)', ['x']));
    assert.deepEqual(rows, [{ id: 7, params: ['x'] }], 'rows flow back through the contract');
    assert.deepEqual(sql.seen, ['begin', 'tx.unsafe:INSERT INTO t (a) VALUES ($1)', 'commit'], 'exactly sql.begin → tx.unsafe → commit');
  });

  test('a fn rejection propagates through sql.begin (the driver rolls back), and the store degrades instead of throwing', async () => {
    const make = fakeSql({ failFn: true });
    const sql = make();
    const transact = adaptPostgresTransact(sql);
    await assert.rejects(
      () => transact(async (tx) => tx('INSERT INTO t (a) VALUES ($1)', ['x'])),
      /statement failed/,
      'the transport\'s rejection IS the rollback signal',
    );
    assert.deepEqual(sql.seen, ['begin', 'tx.unsafe:INSERT INTO t (a) VALUES ($1)', 'rollback'], 'failure path = begin → statement → rollback');
  });
});
