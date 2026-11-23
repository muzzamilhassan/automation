// Settings › Accounts — /api/accounts wiring + the no-secrets guarantee.
// Studio route files import through the '@/lib' alias, which plain node --test
// cannot resolve, so the route is pinned by SOURCE SCAN (house pattern:
// tests/stations-api.test.mjs, tests/fail-closed-routes.test.mjs). The status
// rules live in tests/accounts-health.test.mjs.
//
// EARS:
//   A1 WHEN no user resolves THEN /api/accounts SHALL answer 401 before any check runs.
//   A2 WHEN the user is staff or client THEN it SHALL answer 403 before any check runs.
//   A3 The response SHALL never carry a key named token / secret / access_token /
//      refresh* / appsecret — even when the upstream data holds such fields.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { allowedRoles } from '../studio/lib/route-roles.js';
import { buildAccounts, ytStatusFromChannels, checkFacebook, checkThreads } from '../studio/lib/accounts-health.mjs';

const src = fs.readFileSync('studio/app/api/accounts/route.js', 'utf8');
const body = src.slice(src.indexOf('export async function GET(req)'));
// the first thing in GET that reads data, busts caches or touches a token
const firstCheck = Math.min(...['bustCache(', 'enforceLimits(', 'threadsTokenFrom(', 'Promise.all(', 'withTimeout(', 'checkFacebook(', 'ytChannels(']
  .map((s) => body.indexOf(s))
  .filter((i) => i >= 0));

test('A1: WHEN no user resolves THEN 401 before any check runs (fail-closed)', () => {
  assert.match(body, /const user = await getUser\(req\)\.catch\(\(\) => null\);/);
  const gate = body.indexOf("if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });");
  assert.ok(gate > 0, 'unknown user → 401');
  assert.ok(gate < firstCheck, '401 fires before any data/cache/token is touched');
});

test('A2: WHEN the role is staff or client THEN 403 before any check runs (owner only, in-route)', () => {
  const gate = body.indexOf("if (user.role !== 'owner') return Response.json({ error: 'owner only' }, { status: 403 });");
  assert.ok(gate > 0, 'non-owner → 403');
  assert.ok(gate < firstCheck, '403 fires before any data/cache/token is touched');
  assert.deepEqual(allowedRoles('/api/accounts'), ['owner'], 'the proxy front door agrees: owner only');
});

test('route: GET only, force-dynamic, answers only buildAccounts output', () => {
  assert.match(src, /export const dynamic = 'force-dynamic'/);
  assert.doesNotMatch(src, /export async function (POST|PUT|PATCH|DELETE)/);
  const replies = body.match(/Response\.json\([^;]*;/g) || [];
  const success = replies.filter((r) => /ok: true/.test(r));
  assert.deepEqual(success, ['Response.json({ ok: true, accounts, fetchedAt: new Date().toISOString() });'], 'the only 200 body is { ok, accounts, fetchedAt }');
  assert.match(body, /const accounts = buildAccounts\(/);
});

// ---- A3: deep key scan ----

const BANNED = /token|secret|access_token|refresh|appsecret/i;
function bannedKeys(v, path = '$', out = []) {
  if (Array.isArray(v)) v.forEach((x, i) => bannedKeys(x, `${path}[${i}]`, out));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (BANNED.test(k)) out.push(`${path}.${k}`);
      bannedKeys(x, `${path}.${k}`, out);
    }
  }
  return out;
}
const S = 'LEAK-ME-123';
const poison = { token: S, secret: S, access_token: S, refresh_token: S, appsecret: S, appsecret_proof: S, tokenEnc: S, client_secret: S };

const fetchOf = (answers) => async () => {
  const a = answers.shift();
  return { ok: a.status < 300, status: a.status, json: async () => a.body };
};

test('A3: no response object carries a token/secret key or value, even when every upstream input holds them', async () => {
  // Graph returns page access tokens when asked — they must be dropped on the way in
  const fb = await checkFacebook({
    token: S,
    fetchImpl: fetchOf([{ status: 200, body: { data: [{ id: '11', name: 'Page', ...poison, instagram_business_account: { id: '9', username: 'ig', ...poison } }], ...poison } }]),
  });
  const th = await checkThreads({ token: S, fetchImpl: fetchOf([{ status: 200, body: { id: '1', username: 'qq8', ...poison } }]) });
  const yt = ytStatusFromChannels([
    { slug: 'qq', ytTitle: 'QQ', ytCustomUrl: '@qq', ...poison },
    { slug: 'mr', error: `invalid_grant ${S}`, ...poison },
  ]);
  const accounts = buildAccounts({
    channels: [
      { slug: 'qq', name: 'QQ', fbPageId: '11', threadsHandle: 'qq8', ...poison, destinations: poison },
      { slug: 'mr', name: 'MR', ...poison },
    ],
    readiness: { qq: { items: [{ key: 'youtube', ok: true, ...poison }], ...poison }, mr: { items: [{ key: 'youtube', ok: true }] } },
    ytStatus: yt,
    openWarnings: [{ channel_id: 'mr', code: 'token_revoked', evidence: S, ...poison }],
    fbCheck: { ...fb, ...poison },
    threadsCheck: { ...th, ...poison },
    gates: { qq: true, mr: false, ...poison },
    now: new Date('2026-11-23T10:00:00Z'),
  });
  const response = { ok: true, accounts, fetchedAt: new Date().toISOString() };

  assert.deepEqual(accounts.map((a) => `${a.kind}:${a.status}`), ['youtube:connected', 'youtube:needs_relogin', 'facebook:connected', 'instagram:connected', 'threads:connected'], 'the fixtures exercise every platform');
  assert.deepEqual(bannedKeys(response), [], 'no banned key anywhere in the response');
  assert.doesNotMatch(JSON.stringify(response), new RegExp(S), 'no secret value anywhere in the response');
  assert.deepEqual(bannedKeys(fb), [], 'checkFacebook result is key-clean');
  assert.deepEqual(bannedKeys(th), [], 'checkThreads result is key-clean');
  assert.deepEqual(bannedKeys(yt), [], 'ytStatusFromChannels result is key-clean');
});
