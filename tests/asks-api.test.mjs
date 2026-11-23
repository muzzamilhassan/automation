// Creator City item 6 — /api/asks wiring. Studio route files import through
// the '@/lib' alias, which plain node --test cannot resolve, so the wiring is
// pinned by SOURCE SCAN (house pattern: tests/stations-api.test.mjs,
// tests/fail-closed-routes.test.mjs). The behaviour behind it is proven in
// tests/asks.test.mjs (rules) and tests/asks-store.test.mjs (store + actions).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { allowedRoles } from '../studio/lib/route-roles.js';

const src = fs.readFileSync('studio/app/api/asks/route.js', 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const GET = code.slice(code.indexOf('export async function GET'), code.indexOf('export async function POST'));
const POST = code.slice(code.indexOf('export async function POST'));

test('route-roles: /api/asks is owner+staff at the front door (clients never)', () => {
  const roles = allowedRoles('/api/asks');
  assert.ok(roles && roles.includes('owner') && roles.includes('staff') && !roles.includes('client'));
});

test('GET: WHEN no user resolves THEN 401 before any data loads (fail-closed)', () => {
  assert.match(GET, /getUser\(req\)\.catch\(\(\) => null\)/);
  const gate = GET.indexOf("if (!user) return Response.json({ ok: false, error: 'not signed in' }, { status: 401 })");
  assert.ok(gate > 0);
  assert.ok(gate < GET.indexOf('stores()'), '401 fires before the DB is touched');
});

test('GET: WHEN the role is not owner/staff THEN 403 (in-route re-check)', () => {
  assert.match(GET, /if \(!\['owner', 'staff'\]\.includes\(user\.role\)\)/);
  assert.match(GET, /status: 403/);
});

test('GET: WHEN the DB is missing or the asks table cannot be read THEN 503, never an empty "no questions"', () => {
  assert.match(GET, /if \(!dbReady \|\| !db\) return Response\.json\(\{ ok: false, error: 'asks_unavailable' \}, \{ status: 503 \}\)/);
  assert.match(GET, /if \(!synced\.ok\) return Response\.json\(\{ ok: false, error: 'asks_unavailable' \}, \{ status: 503 \}\)/);
  assert.match(GET, /return Response\.json\(\{ ok: true, asks: synced\.asks, canAnswer: user\.role === 'owner' \}\)/);
});

test('GET syncs from the REAL sources: loadToday (stations), open warnings with the ask codes, approvedNotPublished — then upsert, expire, list', () => {
  assert.match(code, /\.loadToday\(\{ now \}\)/);
  assert.match(code, /listOpenByCodes\(\{ codes: \[\.\.\.ASK_WARNING_CODES\] \}\)/);
  assert.match(code, /approvedNotPublished\(\{ olderThanHours: 6 \}\)/);
  assert.match(code, /deriveAsks\(\{ today, warnings, unpublished, titles \}\)/);
  assert.match(code, /upsertAsks\(/);
  assert.match(code, /staleAsks\(pending\.rows,/);
  assert.match(code, /expireAsks\(stale\)/);
  assert.match(code, /read: \{ today: Boolean\(today\), warnings: Boolean\(warnings\), unpublished: Boolean\(unpublished\) \}/, 'a failed reader never expires its asks');
});

test('POST: 401 unknown user, then OWNER ONLY (403) — before rate limit, body parse or any DB work', () => {
  assert.match(POST, /getUser\(req\)\.catch\(\(\) => null\)/);
  const a401 = POST.indexOf("if (!user) return Response.json({ ok: false, error: 'not signed in' }, { status: 401 })");
  const a403 = POST.indexOf("if (user.role !== 'owner') return Response.json({ ok: false, error: 'owner only' }, { status: 403 })");
  assert.ok(a401 > 0 && a403 > a401);
  assert.ok(a403 < POST.indexOf('enforceLimits('));
  assert.ok(a403 < POST.indexOf('parseAnswer('));
  assert.ok(a403 < POST.indexOf('stores()'));
});

test('POST: rate-limited like the other mutating routes; a retry also spends the shared dispatch bucket (same caps as /api/action)', () => {
  assert.match(POST, /enforceLimits\(user, \[\{ bucket: 'asks', limit: 30, windowSec: 3600 \}\]\)/);
  assert.match(POST, /if \(DISPATCH_ACTIONS\.includes\(option\.action\)\)/);
  assert.match(POST, /\{ bucket: 'dispatch', limit: 10, windowSec: 3600 \}/);
  assert.match(POST, /\{ bucket: 'dispatch', limit: 30, windowSec: 86400 \}/);
  const action = fs.readFileSync('studio/app/api/action/route.js', 'utf8');
  assert.match(action, /\{ bucket: 'dispatch', limit: 10, windowSec: 3600 \}/, 'caps mirror /api/action');
});

test('POST: input validated (parseAnswer → 400), unknown/non-pending ask 404/409, only a STORED option runs (findOption)', () => {
  assert.match(POST, /const parsed = parseAnswer\(/);
  assert.match(POST, /if \(!parsed\.ok\) return Response\.json\(\{ ok: false, error: parsed\.reason \}, \{ status: 400 \}\)/);
  assert.match(POST, /status: 404/);
  assert.match(POST, /status: 409/);
  assert.match(POST, /const option = findOption\(got\.ask, parsed\.optionId\)/);
  assert.ok(POST.indexOf('status: 400') < POST.indexOf('performAskAction('));
});

test('POST: claim → action → finalize; a failed action releases the ask back to pending with its error', () => {
  const claim = POST.indexOf('.claim(parsed.id, user.email)');
  const act = POST.indexOf('performAskAction(');
  assert.ok(claim > 0 && act > claim, 'claimed atomically before anything runs (no double dispatch)');
  assert.match(POST, /if \(!r\.ok\) \{\s*await s\.asks\.release\(parsed\.id, r\.error\);/);
  assert.match(POST, /\.finalize\(parsed\.id, \{ optionId: option\.id/);
  assert.match(POST, /appendAudit\(user\.email, 'ask-answer'/);
});

test('POST actions go ONLY through existing helpers: dispatchResumeRun + channelRunBusy (review-actions), resolveStaleReviewAlerts, script/warnings stores', () => {
  assert.match(code, /import \{ dispatchResumeRun, channelRunBusy \} from '@\/lib\/review-actions\.mjs';/);
  assert.match(code, /dispatchResume: \(\{ slug, jobId \}\) => dispatchResumeRun\(\{ slug, jobId, token: TOKEN, repo: REPO \}\)/);
  assert.match(code, /runBusy: \(\{ slug \}\) => channelRunBusy\(\{ slug, token: TOKEN, repo: REPO \}\)/);
  assert.match(code, /resolveStaleReviewAlerts\(s\.warnings,/);
  assert.doesNotMatch(code, /api\.github\.com/, 'no hand-rolled GitHub call in the route');
  assert.doesNotMatch(code, /\bfetch\(/, 'no direct fetch at all');
  assert.doesNotMatch(code, /UPDATE scripts|UPDATE warnings|INSERT INTO/, 'no raw writes — stores only');
});

test('house rules: force-dynamic, studio-only imports (Vercel deploys studio/ alone)', () => {
  assert.match(code, /export const dynamic = 'force-dynamic'/);
  assert.doesNotMatch(code, /from '\.\.\//);
  assert.doesNotMatch(code, /export async function (PUT|PATCH|DELETE)/);
});
