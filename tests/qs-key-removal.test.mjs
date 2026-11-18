// #117 — retire the legacy qs_key cookie. qs_key = SHA-256(STUDIO_PASSWORD +
// fixed in-repo salt): minted on every login, accepted as OWNER forever by
// both the edge proxy and getUser — no DB check, no revocation path — making
// it (a) a permanent password-equivalent credential and (b) an offline
// cracking oracle against the same password that keys session HMACs.
//
// Contracts (EARS in issue #117):
//   1. login mints ONLY qs_session — no qs_key Set-Cookie, no authToken
//   2. a request with ONLY qs_key authenticates as NOBODY (getUser → null)
//   3. a valid A1 session authenticates exactly as before
//   4. logout still clears stale qs_key cookies
//   5. fail-closed without STUDIO_PASSWORD is preserved
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getUser } from '../studio/lib/route-auth.js';
import { signSessionCookie, parseSessionCookie } from '../studio/lib/session.js';
import { hmacToken } from '../studio/lib/auth-token.js';

process.env.STUDIO_PASSWORD = 'test-only-password-#117';
delete process.env.VERCEL; // exercise the real gate, not the dev bypass

const reqWith = (cookie) => ({ headers: { get: (k) => (k === 'cookie' ? cookie : null) } });

test('#117 EARS-2: a request with ONLY a qs_key cookie is unauthenticated — whatever its value', async () => {
  const legacyHash = await hmacToken('test-only-password-#117', 'x'); // any 64-hex value
  for (const val of [legacyHash, 'a'.repeat(64), 'forged-by-attacker']) {
    const user = await getUser(reqWith(`qs_key=${val}`));
    assert.equal(user, null, `qs_key=${String(val).slice(0, 12)}… must not authenticate`);
  }
});

test('#117 EARS-3: a valid A1 session authenticates exactly as before (claims fallback with no DB)', async () => {
  const cookie = await signSessionCookie({ t: 'tok-#117', e: 'owner@x.test', r: 'owner', n: 'Owner', x: Date.now() + 86400000 });
  const claims = await parseSessionCookie(cookie);
  assert.ok(claims, 'fixture sanity');
  const user = await getUser(reqWith(`qs_session=${encodeURIComponent(cookie)}`));
  // no Neon in tests → dbReady false → the documented signed-claims fallback
  assert.equal(user?.email, 'owner@x.test');
  assert.equal(user?.role, 'owner');
});

test('#117: both cookies present → A1 wins and qs_key is simply ignored', async () => {
  const cookie = await signSessionCookie({ t: 'tok-#117b', e: 'owner@x.test', r: 'owner', n: 'Owner', x: Date.now() + 86400000 });
  const user = await getUser(reqWith(`qs_key=stale; qs_session=${encodeURIComponent(cookie)}`));
  assert.equal(user?.role, 'owner', 'A1 path unaffected by a stale qs_key riding along');
});

test('#117 EARS-5: with STUDIO_PASSWORD unset the gate stays fail-closed (dev bypass untouched here — VERCEL set)', async () => {
  const pw = process.env.STUDIO_PASSWORD;
  delete process.env.STUDIO_PASSWORD;
  try {
    process.env.VERCEL = '1';
    const user = await getUser(reqWith('qs_key=whatever'));
    assert.equal(user, null, 'no password + VERCEL → no bypass, qs_key never authenticates');
  } finally {
    delete process.env.VERCEL;
    process.env.STUDIO_PASSWORD = pw;
  }
});

test('#117: hmacToken survives (connect links + session signing still work), authToken is gone', async () => {
  const sig = await hmacToken('payload', 'key');
  assert.match(sig, /^[0-9a-f]{64}$/, 'hmacToken returns 64-hex');
  const src = fs.readFileSync('studio/lib/auth-token.js', 'utf8');
  assert.doesNotMatch(src, /export async function authToken|export function authToken/, 'authToken removed');
  assert.doesNotMatch(src, /SALT/, 'the in-repo salt constant goes with it');
});

// ---- source scans (the house pattern for route/middleware files) ----

const loginSrc = fs.readFileSync('studio/app/api/login/route.js', 'utf8');
test('#117 EARS-1: login mints only qs_session — no qs_key cookie, no authToken', () => {
  assert.doesNotMatch(loginSrc, /Set-Cookie[^;]*qs_key/, 'no qs_key Set-Cookie (comments may mention the history)');
  assert.doesNotMatch(loginSrc, /authToken/, 'login no longer imports/uses authToken');
  assert.match(loginSrc, /Set-Cookie', `qs_session=/, 'the A1 cookie is still set on success');
});

const authSrc = fs.readFileSync('studio/lib/route-auth.js', 'utf8');
test('#117 EARS-2 (wiring): getUser has no qs_key acceptance left', () => {
  assert.doesNotMatch(authSrc, /cookies\.includes\(`qs_key/, 'no legacy cookie acceptance');
  assert.doesNotMatch(authSrc, /authToken/, 'route-auth no longer imports authToken');
  assert.match(authSrc, /parseSessionCookie/, 'the A1 path is intact');
});

const proxySrc = fs.readFileSync('studio/proxy.js', 'utf8');
test('#117 EARS-2 (wiring): the proxy has no qs_key branch left', () => {
  assert.doesNotMatch(proxySrc, /authToken/, 'proxy no longer imports authToken');
  assert.doesNotMatch(proxySrc, /cookies\.get\('qs_key'\)|cookies\.get\(COOKIE\)/, 'no legacy-cookie read');
  assert.match(proxySrc, /Number\(claims\.x\) > Date\.now\(\)/, 'expiry check intact — expired A1 = unauthenticated');
});

const logoutSrc = fs.readFileSync('studio/app/api/logout/route.js', 'utf8');
test('#117 EARS-4: logout STILL clears stale qs_key cookies', () => {
  assert.match(logoutSrc, /qs_key=; Path=\/; HttpOnly/, 'stale-cookie hygiene preserved');
});
