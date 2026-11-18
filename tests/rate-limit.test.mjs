// #121 R1–R7 — the shared Neon rate limiter (studio/lib/rate-limit.mjs) and
// its route wirings.
//
// R1  allow() = one atomic upsert; counts once per call; ok boundary AT the limit
// R2  exceeded → 429 + Retry-After header + plain-English error
// R3  DB unreachable → fail-open + warning (deliberate: cost guard, not an
//     auth gate — auth has already run when the limiter executes)
// R4  every denial → exactly one audit row (injected sink — the real
//     appendAudit's no-DB fallback writes yt-mcp/audit.json, a repo file
//     tests must never touch)
// R5  route wirings pinned by SOURCE SCAN (house pattern — routes hit the
//     network and can't be imported under plain node --test)
// R6  fresh=1 owner-only + 5/hour on analytics + overview
// R7  demo ships s-maxage=86400
//
// The stub client accepts ONLY the exact upsert SQL (the lib exports its
// template-strings array; the test compares byte-for-byte), so the
// behavioral tests cannot pass trivially.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { UPSERT_STRINGS, allow, enforceLimits, limit429 } from '../studio/lib/rate-limit.mjs';

const SQL_TEXT = UPSERT_STRINGS.join('$?');
const NOW = Date.now();
const row = (count, startMs) => [{ count, window_start: new Date(startMs).toISOString() }];

// stub client: exec(strings, ...values) — the same shape a tagged template
// receives, so the lib's call path is exercised unchanged.
function stubClient(rowsFor) {
  const calls = [];
  const exec = (strings, ...values) => {
    assert.equal(strings.join('$?'), SQL_TEXT, 'stub accepts ONLY the exact rate_limits upsert');
    assert.equal(strings.length, 4, 'three placeholders → four string parts');
    calls.push({ values });
    return Promise.resolve(rowsFor(calls.length, values));
  };
  exec.calls = calls;
  return exec;
}

// ---- R1: behavioral allow() against the stub ----

test('#121 R1: first call counts 1, params arrive in (bucket, key, windowSec) order', async () => {
  const client = stubClient((n) => row(n, NOW));
  const r = await allow({ bucket: 'b1', key: 'u@x', limit: 5, windowSec: 3600 }, client);
  assert.equal(r.ok, true);
  assert.equal(r.remaining, 4);
  assert.equal(r.retryAfterSec, 0);
  assert.deepEqual(client.calls[0].values, ['b1', 'u@x', 3600]);
});

test('#121 R1: counts increment per call; the limit-th request still passes, limit+1 denied', async () => {
  const client = stubClient((n) => row(n, NOW));
  const spec = { bucket: 'b2', key: 'u@x', limit: 2, windowSec: 3600 };
  const r1 = await allow(spec, client);
  const r2 = await allow(spec, client);
  assert.equal(r2.ok, true, 'count == limit is still allowed (boundary, not off-by-one)');
  assert.equal(r2.remaining, 0);
  const denied = await allow(spec, stubClient(() => row(3, NOW)));
  assert.equal(denied.ok, false);
  assert.equal(denied.remaining, 0);
  // retryAfterSec = window_start + windowSec - now ≈ the full hour
  assert.ok(denied.retryAfterSec >= 3595 && denied.retryAfterSec <= 3600, `got ${denied.retryAfterSec}`);
});

test('#121 R1: the window_sec travels into the SQL params (fixed window is per-spec)', async () => {
  const client = stubClient(() => row(1, NOW));
  await allow({ bucket: 'preview', key: 'u@x', limit: 30, windowSec: 600 }, client);
  assert.deepEqual(client.calls[0].values, ['preview', 'u@x', 600]);
});

// ---- R3: fail-open ----

test('#121 R3: DB throw → allow (+ failOpen flag), warning logged — never blocks the panel', async () => {
  const warned = [];
  const orig = console.warn;
  console.warn = (...a) => warned.push(a.join(' '));
  try {
    const r = await allow({ bucket: 'x', key: 'k', limit: 1, windowSec: 60 }, () => { throw new Error('neon down'); });
    assert.equal(r.ok, true);
    assert.equal(r.failOpen, true);
  } finally {
    console.warn = orig;
  }
  assert.ok(warned.some((w) => w.includes('[rate-limit]')), 'the failure is logged as a warning');
});

test('#121 R3: empty rows (no counter row returned) → fail-open, not a false deny', async () => {
  const r = await allow({ bucket: 'x', key: 'k', limit: 1, windowSec: 60 }, stubClient(() => []));
  assert.equal(r.ok, true);
  assert.equal(r.failOpen, true);
});

// ---- R2 + R4: enforceLimits ----

test('#121 R2+R4: under every limit → null (continue); no audit row written', async () => {
  const audits = [];
  const res = await enforceLimits(
    { email: 'owner@studio', role: 'owner' },
    [{ bucket: 'hop', limit: 10, windowSec: 3600 }, { bucket: 'hop', limit: 30, windowSec: 86400 }],
    stubClient((n) => row(1, NOW)),
    (actor, action, detail) => audits.push({ actor, action, detail }),
  );
  assert.equal(res, null);
  assert.deepEqual(audits, []);
});

test('#121 R2+R4: exceeded → Response 429 + Retry-After + plain-English bucket name; exactly one audit row', async () => {
  const audits = [];
  const res = await enforceLimits(
    { email: 'owner@studio', role: 'owner' },
    [{ bucket: 'hop', limit: 2, windowSec: 3600 }],
    stubClient(() => row(99, NOW)),
    (actor, action, detail) => audits.push({ actor, action, detail }),
  );
  assert.ok(res instanceof Response);
  assert.equal(res.status, 429);
  const ra = Number(res.headers.get('Retry-After'));
  assert.ok(ra >= 3595 && ra <= 3600, `Retry-After ≈ 3600, got ${ra}`);
  const body = await res.json();
  assert.match(body.error, /Too many requests/);
  assert.match(body.error, /hop limit reached/);
  assert.deepEqual(audits.map((a) => ({ actor: a.actor, action: a.action })), [
    { actor: 'owner@studio', action: 'rate-limit-deny' },
  ]);
  assert.match(audits[0].detail, /hop/);
});

test('#121 R2: specs checked in order — first exceeded wins; user without email keys as unknown-actor', async () => {
  const audits = [];
  const res = await enforceLimits(
    null,
    [{ bucket: 'first', limit: 1, windowSec: 3600 }, { bucket: 'second', limit: 100, windowSec: 3600 }],
    stubClient(() => row(5, NOW)),
    (actor, action, detail) => audits.push({ actor, action }),
  );
  assert.equal(res.status, 429);
  assert.match((await res.json()).error, /first limit reached/);
  assert.equal(audits[0].actor, 'unknown-actor');
});

test('#121 R2: minute-scale Retry-After reads as minutes in the message', () => {
  const res = limit429({ bucket: 'zz' }, 600);
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('Retry-After'), '600');
});

// ---- R5–R7: route wiring pins (source scans) ----

const read = (p) => fs.readFileSync(p, 'utf8');
const RL_IMPORT = /import \{ enforceLimits \} from '@\/lib\/rate-limit\.mjs';/;

test('#121 R5: every wired route imports the shared limiter (no route-local copies)', () => {
  for (const p of [
    'studio/app/api/channels/kit/route.js',
    'studio/app/api/thumbs/ai-bg/route.js',
    'studio/app/api/action/route.js',
    'studio/app/api/create-video/route.js',
    'studio/app/api/analytics/route.js',
    'studio/app/api/overview/route.js',
    'studio/app/api/thumbs/preview/route.js',
    'studio/app/api/thumbs/performance/route.js',
    'studio/app/api/thumbs/videos/route.js',
  ]) {
    assert.match(read(p), RL_IMPORT, p);
  }
});

test('#121 R5: kit — llm-kit 10/h sits inside the useLLM branch (the cheap fallback stays unlimited)', () => {
  const src = read('studio/app/api/channels/kit/route.js');
  const branch = src.slice(src.indexOf('if (useLLM)'));
  assert.match(branch, /bucket: 'llm-kit', limit: 10, windowSec: 3600/);
  assert.match(branch, /if \(limited\) return limited;/);
});

test('#121 R5: ai-bg — 5/h AND 20/day, after the 401 and the key check, before the fetch', () => {
  const src = read('studio/app/api/thumbs/ai-bg/route.js');
  assert.match(src, /bucket: 'ai-bg', limit: 5, windowSec: 3600/);
  assert.match(src, /bucket: 'ai-bg', limit: 20, windowSec: 86400/);
  const gate = src.indexOf("bucket: 'ai-bg'");
  assert.ok(gate > src.indexOf('not allowed'), 'after the 401');
  assert.ok(gate > src.indexOf('AGNES_API_KEY not configured'), 'after the key 503');
  assert.ok(gate < src.indexOf('apihub.agnes-ai.com'), 'before the expensive fetch');
});

test('#121 R5: action + create-video — ONE shared dispatch bucket, 10/h + 30/day; topup clamped ≤ 20', () => {
  const action = read('studio/app/api/action/route.js');
  const create = read('studio/app/api/create-video/route.js');
  for (const [name, src] of [['action', action], ['create-video', create]]) {
    assert.match(src, /bucket: 'dispatch', limit: 10, windowSec: 3600/, name);
    assert.match(src, /bucket: 'dispatch', limit: 30, windowSec: 86400/, name);
  }
  assert.match(action, /String\(Math\.min\(20, body\.topup\)\)/, 'topup clamped');
  assert.doesNotMatch(action, /spec\.inputs\.topup = String\(body\.topup\)/, 'the unclamped write is gone');
  // create-video: the gate lives in POST only — the GET list stays cheap
  const post = create.slice(create.indexOf('export async function POST'));
  assert.match(post, /bucket: 'dispatch'/);
  const get = create.slice(create.indexOf('export async function GET'), create.indexOf('export async function POST'));
  assert.doesNotMatch(get, /enforceLimits/);
});

test('#121 R6: analytics — fresh gate is owner-only + 403 + fresh-pull 5/h, AFTER the 401', () => {
  const src = read('studio/app/api/analytics/route.js');
  assert.match(src, /user\.role !== 'owner'/);
  assert.match(src, /fresh pulls are owner-only' \}, \{ status: 403 \}/);
  assert.match(src, /bucket: 'fresh-pull', limit: 5, windowSec: 3600/);
  assert.ok(src.indexOf('fresh pulls are owner-only') > src.indexOf('not signed in'), 'after the 401');
});

test('#121 R6: overview — auth moved to the top (before data loads), fresh gate owner-only, bustCache only after the gate', () => {
  const src = read('studio/app/api/overview/route.js');
  assert.match(src, /user\.role !== 'owner'/);
  assert.match(src, /bucket: 'fresh-pull', limit: 5, windowSec: 3600/);
  assert.ok(src.indexOf('not signed in') < src.indexOf('Promise.all([fbPages'), '401 fires before any data loads');
  assert.equal((src.match(/const user = await getUser\(req\)/g) || []).length, 1, 'user resolved exactly once');
  const gate = src.indexOf("bucket: 'fresh-pull'");
  assert.ok(gate > 0 && gate < src.indexOf('bustCache()'), 'bustCache runs only after the gate passed');
  assert.ok(src.indexOf('return Response.json({ error: \'fresh pulls are owner-only\' }, { status: 403 })') < src.indexOf('bustCache()'), '403 never busts the cache');
});

test('#121 R5: preview 30/10min; performance + videos share thumbs-read 20/h; demo ships s-maxage', () => {
  const preview = read('studio/app/api/thumbs/preview/route.js');
  assert.match(preview, /bucket: 'preview', limit: 30, windowSec: 600/);
  for (const p of ['studio/app/api/thumbs/performance/route.js', 'studio/app/api/thumbs/videos/route.js']) {
    assert.match(read(p), /bucket: 'thumbs-read', limit: 20, windowSec: 3600/, p);
  }
  const demo = read('studio/app/api/thumbs/demo/route.js');
  assert.match(demo, /s-maxage=86400/);
});

test('#121: db-setup creates the rate_limits table with the composite PK the upsert conflicts on', () => {
  const src = read('studio/db-setup.mjs');
  assert.match(src, /CREATE TABLE IF NOT EXISTS rate_limits/);
  assert.match(src, /PRIMARY KEY \(bucket, key, window_sec\)/);
});
