// #118 — fail-closed sweep. Four routes resolved scope so that "no user" or
// "registry error" meant "see everything":
//   overview  : user ? scoped : NULL(=all)  + slugsForUser .catch(() => null)
//   analytics : user ? scoped : NULL(=all)  (client-scope was already [])
//   leaderboard: user ? scoped : NULL(=all) (client-scope was already [])
//   topics    : guard's .catch(() => null) + `if (owned && !…)` let a client
//               READ and WRITE any queue during a registry blip
//
// Contracts (EARS in issue #118):
//   1. no resolvable user → 401 in all four handlers, nothing disclosed
//   2. slugsForUser throw → EMPTY scope for clients (reads AND writes)
//   3. owner/staff unchanged: slugsForUser → null (= all), registry untouched
//   4. analytics cache-scope keying intact (scope = post-filter slugs)
//
// slugsForUser is tested behaviorally (pure role logic; owner/staff return
// before any registry touch). Route wiring is pinned by SOURCE SCAN (the
// house pattern for route files).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { slugsForUser } from '../studio/lib/access.js';

test('#118 EARS-3: slugsForUser — owner/staff get null (= all) and never touch the registry', async () => {
  assert.equal(await slugsForUser({ email: 'o@x.test', role: 'owner' }), null);
  assert.equal(await slugsForUser({ email: 's@x.test', role: 'staff' }), null);
  assert.deepEqual(await slugsForUser(null), [], 'missing user → empty, never null(=all)');
});

test('#118: the client branch of slugsForUser is the only registry touch (source)', () => {
  const src = fs.readFileSync('studio/lib/access.js', 'utf8');
  const body = src.slice(src.indexOf('export async function slugsForUser'));
  const tail = src.slice(src.indexOf('export async function slugsForUser'), src.indexOf('Stage C (F8)'));
  assert.match(tail, /role !== 'client'\s*\)\s*return null/, 'owner/staff short-circuit BEFORE any registry call');
  assert.match(tail, /registryChannels\(\)/, 'only the client path reads the registry');
});

// ---- route wiring (source scans) ----

const overviewSrc = fs.readFileSync('studio/app/api/overview/route.js', 'utf8');
test('#118 EARS-1+2: overview 401s unknown users and fails closed on scope errors', () => {
  // #121 pin refresh: the auth gate moved to the TOP of GET (it must precede
  // the fresh=1 owner gate + bustCache) — the fail-closed property is
  // unchanged and now provably fires BEFORE any data loads.
  const gate = overviewSrc.indexOf("if (!user) return Response.json({ error: 'not signed in' }, { status: 401 })");
  assert.ok(gate > 0, 'unknown user → 401');
  assert.ok(gate < overviewSrc.indexOf('Promise.all([fbPages'), '401 fires before any data loads');
  const seg = overviewSrc.slice(overviewSrc.indexOf('// 10-08 P2 CLIENT ROLE'));
  assert.match(seg, /slugsForUser\(user\)\.catch\(\(\) => \[\]\)/, 'scope error → EMPTY, not null(=all)');
  assert.doesNotMatch(seg, /slugsForUser\(user\)\.catch\(\(\) => null\)/, 'the old fail-open shape is gone on the SCOPE resolution (getUser.catch(null) + 401 gate is the correct fail-closed pair)');
  assert.match(overviewSrc, /const owned = await slugsForUser\(user\)\.catch/, 'owned is resolved once, post-401, for producing+logs+controlChannels alike');
});

const analyticsSrc = fs.readFileSync('studio/app/api/analytics/route.js', 'utf8');
test('#118 EARS-1: analytics 401s unknown users (client [] fallback pre-existed)', () => {
  assert.match(analyticsSrc, /if \(!user\) return Response\.json\(\{ error: 'not signed in' \}, \{ status: 401 \}\)/);
  assert.match(analyticsSrc, /slugsForUser\(user\)\.catch\(\(\) => \[\]\)/, 'fail-closed client scope intact');
  assert.doesNotMatch(analyticsSrc, /\? await slugsForUser/, 'no ternary that maps missing-user to null(=all)');
  assert.match(analyticsSrc, /scopeKey = \[\.\.\.allSlugs\]\.sort\(\)\.join\(','\)/, 'EARS-4: cache key still derives from the filtered slugs (#47)');
});

const lbSrc = fs.readFileSync('studio/app/api/analytics/leaderboard/route.js', 'utf8');
test('#118 EARS-1: leaderboard 401s unknown users', () => {
  assert.match(lbSrc, /if \(!user\) return Response\.json\(\{ error: 'not signed in' \}, \{ status: 401 \}\)/);
  assert.match(lbSrc, /slugsForUser\(user\)\.catch\(\(\) => \[\]\)/);
  assert.doesNotMatch(lbSrc, /\? await slugsForUser/);
});

const topicsSrc = fs.readFileSync('studio/app/api/topics/route.js', 'utf8');
test('#118 EARS-2 (writes too): topics guard fails closed on scope errors', () => {
  const guardSeg = topicsSrc.slice(topicsSrc.indexOf('async function guard'), topicsSrc.indexOf('export async function GET'));
  assert.match(guardSeg, /if \(!user\) return 'not signed in'/, 'unknown user stays denied');
  assert.match(guardSeg, /slugsForUser\(user\)\.catch\(\(\) => \[\]\)/, 'scope error → EMPTY owned list');
  assert.match(guardSeg, /if \(owned && !owned\.includes\(slug\)\) return 'not your channel'/, 'empty owned denies EVERY slug for a client — reads and writes share this guard');
  assert.doesNotMatch(guardSeg, /catch\(\(\) => null\)/, 'the old fail-open shape is gone');
});
