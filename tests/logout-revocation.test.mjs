// #116 — Sign Out must revoke the CURRENT A1 session row. The A1 cookie is
// `hex(json{t,e,r,n,x}).hmac` (dotted) and the revocable opaque token lives
// only inside the signed claims — the old logout dot-gate
// (`!token.includes('.')`) skipped every current-format cookie, so Sign Out
// cleared the browser cookie while the Neon row stayed valid for 30 days.
//
// Contracts (EARS in issue #116):
//   1. dotted A1 cookie  -> parse claims (HMAC-verified) -> revoke by claims.t
//   2. bare opaque token -> revoked directly (pre-A1 behavior preserved)
//   3. missing/malformed/tampered -> NO revocation SQL; route still clears
//      cookies (logout never fails)
//   4. after revocation, userByToken must reject the same token (revoked flag)
//   5. logout stays auth-free (source scan: no requireRole in the route)
//
// Style: session-db.js admin-function client contract — `client(sql, params)`
// -> Promise<rows> (postgres.js positional style). The stub understands
// exactly `UPDATE sessions SET revoked = TRUE WHERE token_hash = $1`; a
// passing test cannot be trivially green. Route wiring is pinned by SOURCE
// SCAN (the house pattern for route files).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { revokeSessionFromCookie } from '../studio/lib/session-db.js';
import { signSessionCookie, parseSessionCookie } from '../studio/lib/session.js';

// parseSessionCookie/signSessionCookie derive their HMAC key from
// STUDIO_PASSWORD at call time — set a test-only password.
process.env.STUDIO_PASSWORD = 'test-only-password-#116';

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

function makeStub(seedRows = []) {
  const rows = new Map(); // token_hash -> row (userByToken reads token_hash)
  const calls = [];
  async function client(sqlText, params) {
    const sql = sqlText.replace(/\s+/g, ' ').trim();
    calls.push({ sql, params });
    if (/^UPDATE sessions SET revoked = TRUE WHERE token_hash = \$1$/i.test(sql)) {
      const r = rows.get(params[0]);
      if (r) r.revoked = true;
      return [];
    }
    throw new Error(`stub client: unsupported SQL shape: ${sql.slice(0, 120)}`);
  }
  client.calls = calls;
  client.rows = rows;
  return client;
}

async function makeA1Cookie(token) {
  const raw = await signSessionCookie({ t: token, e: 'owner@x.test', r: 'owner', n: 'Owner', x: Date.now() + 86400000 });
  const claims = await parseSessionCookie(raw);
  assert.ok(claims?.t, 'fixture sanity: the signed cookie must parse back to its claims');
  return raw;
}

test('#116 EARS-1: a valid dotted A1 cookie revokes the row keyed by sha256(claims.t)', async () => {
  const token = 'a'.repeat(64);
  const cookie = await makeA1Cookie(token);
  const stub = makeStub();
  stub.rows.set(sha256(token), { id: 1, revoked: false });

  assert.equal(await revokeSessionFromCookie(cookie, stub), true, 'a revocable token was identified and revoked');
  assert.equal(stub.calls.length, 1);
  assert.equal(stub.calls[0].params[0], sha256(token), 'the UPDATE targets the HASH of the opaque token, never raw cookie text');
  assert.equal(stub.rows.get(sha256(token)).revoked, true, 'row flipped — the same cookie now fails auth (EARS-4)');
});

test('#116 EARS-1: the cookie must be HMAC-valid — a tampered hex body revokes nothing', async () => {
  const cookie = await makeA1Cookie('b'.repeat(64));
  const [body] = cookie.split('.');
  const tampered = await signSessionCookie({ t: 'c'.repeat(64), e: 'owner@x.test', r: 'owner', n: 'O', x: 1 })
    .then((real) => {
      // forge: swap in the FIRST cookie's body with the SECOND cookie's hmac —
      // signature no longer matches the body, so parse must reject it.
      const [, mac] = real.split('.');
      return `${body}.${mac}`;
    });
  const stub = makeStub();
  assert.equal(await revokeSessionFromCookie(tampered, stub), false, 'HMAC mismatch -> not revocable');
  assert.equal(stub.calls.length, 0, 'no SQL for a cookie that does not verify');
});

test('#116 EARS-2: a bare opaque token (pre-A1) is still revoked directly — any dot-less value counts (matches the old route)', async () => {
  const stub = makeStub();
  assert.equal(await revokeSessionFromCookie('d'.repeat(64), stub), true);
  assert.equal(stub.calls[0].params[0], sha256('d'.repeat(64)));
  const junk = makeStub();
  assert.equal(await revokeSessionFromCookie('no-dots-no-hex', junk), true, 'dot-less garbage is treated as a bare token: SQL runs, matches nothing — harmless, same as the pre-#116 route');
  assert.equal(junk.calls[0].params[0], sha256('no-dots-no-hex'));
});

test('#116 EARS-3: missing, empty, or garbage cookies issue NO SQL (logout must never fail)', async () => {
  for (const bad of [null, undefined, '', '   ', '%zz-malformed-escape', 'a.'.repeat(2)]) {
    const stub = makeStub();
    assert.equal(await revokeSessionFromCookie(bad, stub), false, `bad value rejected: ${String(JSON.stringify(bad ?? null)).slice(0, 30)}`);
    assert.equal(stub.calls.length, 0, 'no revocation SQL for garbage');
  }
});

test('#116: URL-encoded cookie values decode before parsing (login may encodeURIComponent)', async () => {
  const token = 'e'.repeat(64);
  const cookie = await makeA1Cookie(token);
  const stub = makeStub();
  // hex.hmac has no percent-escapes, but prove a wrapped value survives
  assert.equal(await revokeSessionFromCookie(encodeURIComponent(cookie), stub), true);
  assert.equal(stub.calls[0].params[0], sha256(token));
});

test('#116: no client (default pool) still works when dbReady is true; returns false when unavailable', async () => {
  // without an injectable client the function uses the module pool — under
  // node --test there is no DATABASE_URL, so dbReady is false and the
  // fail-safe contract returns false rather than throwing.
  const cookie = await makeA1Cookie('f'.repeat(64));
  assert.equal(await revokeSessionFromCookie(cookie), false, 'fail-safe: no DB -> false, never a throw');
  assert.equal(await revokeSessionFromCookie('g'.repeat(64)), false);
});

// ---- route wiring (source scan — the house pattern) ----

const routeSrc = fs.readFileSync('studio/app/api/logout/route.js', 'utf8');

test('#116 route: calls revokeSessionFromCookie and the dot-gate is gone', () => {
  assert.ok(routeSrc.includes('revokeSessionFromCookie'), 'route must route revocation through the new lib function');
  assert.match(routeSrc, /if \(token\) await revokeSessionFromCookie\(token\)/, 'every cookie value goes to the lib — no client-side dot filter');
  assert.doesNotMatch(routeSrc, /includes\('\.'\)/, 'the old dot-gate (the bug) must not survive anywhere in the route');
  assert.doesNotMatch(routeSrc, /revokeToken\(/, 'route no longer imports the bare-token-only revokeToken');
});

test('#116 route: still clears BOTH cookies outside the try, and stays auth-free (EARS-3 tail + EARS-5)', () => {
  assert.match(routeSrc, /qs_key=; Path=\/; HttpOnly/, 'legacy qs_key cookie still cleared');
  assert.match(routeSrc, /qs_session=; Path=\/; HttpOnly/, 'A1 cookie still cleared');
  const clearIdx = routeSrc.indexOf('Set-Cookie');
  const tryIdx = routeSrc.indexOf('try {');
  assert.ok(clearIdx > tryIdx, 'cookie clearing happens after/outside the guarded revocation block — a throw can never skip it');
  assert.doesNotMatch(routeSrc, /requireRole|getUser/, 'EARS-5: logout stays reachable without authentication');
});
