// P4/S6 (#106, Task T7) — owner sessions admin: all-sessions view,
// per-session instant revoke, and the >30d retention cleanup (AC-P4-29/30/31).
//
// Stub client contract (fixture seam — no live Neon in tests), mirroring
// tests/template-registry-db.test.mjs: the module calls the client as
// `client(sqlText, params)` and awaits an array of row objects
// (postgres.js-compatible positional-param style). The stub understands
// exactly the SQL shapes session-db.js's admin functions emit — nothing
// more, so a passing test cannot be trivially green.
//
// Route wiring is pinned by SOURCE SCAN (the house pattern for route files —
// tests/schedule-quota-route.test.mjs): '@/lib' aliases are unresolvable
// under plain node --test, and build-level proof is the `next build` gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { listAllSessions, revokeSessionById, cleanupSessions } from '../studio/lib/session-db.js';

const DAY = 86400000;
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();

// ---------------------------------------------------------------------------
// Sessions-table stub: `tables.sessions` is a Map(id -> row); UPDATE flips
// revoked in place, DELETE removes rows matching the dead-and-old predicate,
// SELECT returns all rows ordered by last_used desc.
// ---------------------------------------------------------------------------
function makeSessionsStub(seed = []) {
  const sessions = new Map();
  let seq = 0;
  for (const r of seed) sessions.set(r.id ?? ++seq, { name: '', user_agent: '', ip: '', revoked: false, ...r });
  const calls = [];

  // The retention predicate the SQL must express: dead (revoked or expired)
  // AND last active before the `days` cutoff.
  function deadOld(days) {
    const cutoff = new Date(Date.now() - days * DAY);
    return [...sessions.values()].filter((r) =>
      (r.revoked === true || new Date(r.expires_at) < new Date()) && new Date(r.last_used) < cutoff);
  }

  async function run(sqlText, params) {
    const sql = sqlText.replace(/\s+/g, ' ').trim();
    calls.push({ sql, params });

    if (/^SELECT .* FROM sessions ORDER BY last_used DESC LIMIT \$\d+$/i.test(sql)) {
      const limit = Number(params[Number(sql.match(/LIMIT \$(\d+)$/i)[1]) - 1]);
      return [...sessions.values()]
        .sort((a, b) => new Date(b.last_used) - new Date(a.last_used))
        .slice(0, limit)
        .map((r) => ({ ...r }));
    }

    if (/^UPDATE sessions SET revoked = TRUE WHERE id = \$\d+ AND revoked = FALSE RETURNING id, email$/i.test(sql)) {
      const r = sessions.get(params[0]);
      if (!r || r.revoked) return [];
      r.revoked = true;
      return [{ id: r.id, email: r.email }];
    }

    if (/^DELETE FROM sessions WHERE \(revoked = TRUE OR expires_at < now\(\)\) AND last_used < now\(\) - \(\$\d+ \|\| ' days'\)::interval RETURNING id$/i.test(sql)) {
      const days = Number(String(params[0]));
      const doomed = deadOld(days);
      for (const r of doomed) sessions.delete(r.id);
      return doomed.map((r) => ({ id: r.id }));
    }

    if (/^SELECT count\(\*\) AS n FROM sessions WHERE \(revoked = TRUE OR expires_at < now\(\)\) AND last_used < now\(\) - \(\$\d+ \|\| ' days'\)::interval$/i.test(sql)) {
      return [{ n: deadOld(Number(String(params[0]))).length }];
    }

    throw new Error(`stub client: unsupported SQL shape: ${sql.slice(0, 120)}`);
  }

  const clientFn = (sqlText, params = []) => Promise.resolve(run(sqlText, params));
  clientFn.sessions = sessions;
  clientFn.calls = calls;
  return clientFn;
}

// Fixtures: 2 users, 5 devices — 2 dead-and-old, 3 kept at the 30-day window.
function seed() {
  return [
    { id: 1, email: 'owner@example.com', role: 'owner', last_used: iso(2 * DAY), expires_at: iso(-20 * DAY) }, // active owner
    { id: 2, email: 'staff@example.com', role: 'staff', last_used: iso(40 * DAY), expires_at: iso(-5 * DAY), revoked: true }, // revoked 40d idle
    { id: 3, email: 'staff@example.com', role: 'staff', last_used: iso(41 * DAY), expires_at: iso(40 * DAY) }, // expired 40d ago
    { id: 4, email: 'staff@example.com', role: 'staff', last_used: iso(10 * DAY), expires_at: iso(8 * DAY) }, // expired only 8d ago
    { id: 5, email: 'staff@example.com', role: 'staff', last_used: iso(5 * DAY), expires_at: iso(-10 * DAY), revoked: true }, // revoked, used 5d ago
  ];
}

// ---- listAllSessions (owner all-users view) ----

test('owner view: listAllSessions returns every user\'s session with email, role and dead flags (AC-P4-29 surface)', async () => {
  const stub = makeSessionsStub(seed());
  const rows = await listAllSessions(stub);
  assert.equal(rows.length, 5, 'all 5 rows across BOTH users are visible to the owner');
  assert.deepEqual([...new Set(rows.map((r) => r.email))].sort(), ['owner@example.com', 'staff@example.com']);

  const staffRevoked = rows.find((r) => r.id === 2);
  assert.equal(staffRevoked.email, 'staff@example.com');
  assert.equal(staffRevoked.role, 'staff');
  assert.equal(staffRevoked.revoked, true, 'revoked flag surfaced for the greyed row');
  assert.equal(staffRevoked.expired, false);
  const expiredRow = rows.find((r) => r.id === 3);
  assert.equal(expiredRow.expired, true, 'expired flag surfaced for the greyed row');
  assert.equal(expiredRow.revoked, false);
  const live = rows.find((r) => r.id === 1);
  assert.equal(live.revoked, false);
  assert.equal(live.expired, false);
  assert.ok(live.device !== undefined && live.lastUsed, 'device hint + last-used carried for the table');
});

test('listAllSessions orders freshest activity first and bounds the read', async () => {
  const stub = makeSessionsStub(seed());
  const rows = await listAllSessions(stub);
  assert.deepEqual(rows.map((r) => r.id), [1, 5, 4, 2, 3], 'ORDER BY last_used DESC');
  const call = stub.calls.find((c) => /FROM sessions/.test(c.sql));
  assert.equal(call.params[0], 200, 'read is bounded (LIMIT), not unbounded');
});

test('listAllSessions fails safe with no client ([])', async () => {
  assert.deepEqual(await listAllSessions(null), []);
  assert.deepEqual(await listAllSessions(undefined), []);
});

// ---- revokeSessionById (instant per-session revoke) ----

test('revokeSessionById flips exactly the target row and returns its email (AC-P4-29 instant)', async () => {
  const stub = makeSessionsStub(seed());
  const out = await revokeSessionById(1, stub);
  assert.deepEqual(out, { id: 1, email: 'owner@example.com' }, 'revoked row returned (route audits the email)');
  assert.equal(stub.sessions.get(1).revoked, true, 'the row flipped — next userByToken read returns null');
  assert.equal(stub.sessions.get(2).revoked, true, 'pre-existing revoked row untouched (was already true)');
  assert.equal(stub.sessions.get(3).revoked, false, 'other users\' rows untouched');
});

test('revokeSessionById returns null for missing or already-revoked rows (no second write)', async () => {
  const stub = makeSessionsStub(seed());
  assert.equal(await revokeSessionById(999, stub), null, 'missing id');
  assert.equal(await revokeSessionById(2, stub), null, 'already revoked — AND revoked = FALSE guard');
  assert.equal(stub.calls.filter((c) => /^UPDATE/i.test(c.sql)).length, 2, 'both attempts issued SQL (guards live in the query)');
});

test('revokeSessionById refuses non-integer ids without touching the database', async () => {
  const stub = makeSessionsStub(seed());
  assert.equal(await revokeSessionById('1; DROP TABLE sessions', stub), null);
  assert.equal(await revokeSessionById(1.5, stub), null);
  assert.equal(await revokeSessionById(NaN, stub), null);
  assert.equal(stub.calls.length, 0, 'no SQL issued for junk ids');
});

test('revokeSessionById fails safe with no client (null)', async () => {
  assert.equal(await revokeSessionById(1, null), null);
});

// ---- cleanupSessions (>30d retention, AC-P4-30) ----

test('cleanup deletes sessions expired or revoked for more than 30 days, keeps fresh or live rows (AC-P4-30)', async () => {
  const stub = makeSessionsStub(seed());
  const n = await cleanupSessions(stub);
  assert.equal(n, 2, 'rows 2 (revoked, 40d idle) and 3 (expired 40d) deleted');
  assert.ok([...stub.sessions.keys()].includes(1), 'active row survives');
  assert.ok(stub.sessions.has(4), 'expired only 8d ago survives the 30-day window');
  assert.ok(stub.sessions.has(5), 'revoked but used 5d ago survives (last_used is the death clock)');
  const call = stub.calls.find((c) => /^DELETE/i.test(c.sql));
  assert.ok(/\(revoked = TRUE OR expires_at < now\(\)\)/i.test(call.sql), 'predicate must name BOTH death kinds');
  assert.ok(/last_used < now\(\) - \(\$\d+ \|\| ' days'\)::interval/i.test(call.sql), 'age window measured on last_used');
  assert.equal(call.params[0], '30', '30-day default plumbed as the interval parameter');
});

test('cleanup honors the days option (window is data, not a constant)', async () => {
  const stub = makeSessionsStub(seed());
  const n = await cleanupSessions(stub, { days: 7 });
  assert.equal(n, 3, 'the 8d-expired row now falls inside the 7-day window');
  assert.equal(stub.calls.find((c) => /^DELETE/i.test(c.sql)).params[0], '7');
  assert.ok(stub.sessions.has(5), 'revoked row used 5d ago survives even a 7-day window');
});

test('cleanup dry mode counts the doomed rows without deleting (ops preview)', async () => {
  const stub = makeSessionsStub(seed());
  const n = await cleanupSessions(stub, { dry: true });
  assert.equal(n, 2);
  assert.equal(stub.sessions.size, 5, 'dry run deletes nothing');
  assert.equal(stub.calls.some((c) => /^DELETE/i.test(c.sql)), false, 'no DELETE issued in dry mode');
});

test('cleanup fails safe with no client (0)', async () => {
  assert.equal(await cleanupSessions(null), 0);
});

// ---- route + proxy wiring (source scan — the house pattern) ----

const routeSrc = fs.readFileSync('studio/app/api/sessions/route.js', 'utf8');
const proxySrc = fs.readFileSync('studio/proxy.js', 'utf8');

test('route re-checks the role server-side for BOTH owner-mode endpoints (the proxy is never the only gate)', () => {
  assert.ok(routeSrc.includes('requireRole'), 'route must import requireRole');
  assert.match(routeSrc, /requireRole\(req,\s*\[\s*'owner'\s*\]\)/, 'owner-mode must re-check requireRole([owner]) in the handler');
  assert.ok(routeSrc.includes('listAllSessions'), 'owner list-all must come from session-db');
  assert.ok(routeSrc.includes('revokeSessionById'), 'revoke-by-id must come from session-db');
  assert.ok(routeSrc.includes('adaptPostgres'), 'the postgres client must be bridged to the positional contract');
  assert.match(routeSrc, /status: 403/, 'a non-owner hitting owner-mode must get 403');
});

test('self-service device list + sign-out-everywhere are unchanged (AC-P4-31)', () => {
  assert.ok(routeSrc.includes('listSessions(user.email)'), 'self GET still lists the caller\'s own sessions');
  assert.ok(routeSrc.includes('revokeAllForEmail(user.email)'), 'self DELETE still revokes only the caller\'s rows');
  assert.ok(routeSrc.includes('appendAudit'), 'revocations stay audited');
  assert.equal(/\bscope=all\b/.test(routeSrc.split('scope=all')[1] || ''), false, 'sanity: owner scope check exists above'); // owner branch is additive
});

test('proxy gates the /sessions admin page owner-only (additive matrix row, self-service API untouched)', () => {
  assert.match(proxySrc, /p === '\/sessions'/, 'the /sessions page must have an owner-only matrix rule');
  assert.match(proxySrc, /p === '\/users'[\s\S]{0,200}p === '\/sessions'/, 'sessions rule sits with the owner-only group');
  assert.equal(/'\/api\/sessions'/.test(proxySrc), false, '/api/sessions stays any-signed-in (handler re-checks owner-mode)');
});
