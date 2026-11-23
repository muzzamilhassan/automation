// Calendar (2026-11-23) — /api/calendar wiring. Studio route files import
// through the '@/lib' alias, which plain node --test cannot resolve, so the
// wiring is pinned by SOURCE SCAN (house pattern: tests/stations-api.test.mjs,
// tests/fail-closed-routes.test.mjs). The behaviour behind it (slots, merge,
// range rules) is proven in tests/calendar-view.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { allowedRoles } from '../studio/lib/route-roles.js';

const src = fs.readFileSync('studio/app/api/calendar/route.js', 'utf8');
const firstRead = src.indexOf('Promise.all([');

test('calendar: WHEN no user resolves THEN 401 before any data loads (fail-closed)', () => {
  assert.match(src, /getUser\(req\)\.catch\(\(\) => null\)/);
  const gate = src.indexOf("if (!user) return Response.json({ ok: false, error: 'not signed in' }, { status: 401 })");
  assert.ok(gate > 0, 'unknown user → 401');
  assert.ok(firstRead > 0 && gate < firstRead, '401 fires before any source is read');
});

test('calendar: WHEN the role is not owner/staff THEN 403 before any data loads (in-route re-check)', () => {
  const gate = src.indexOf("if (!['owner', 'staff'].includes(user.role))");
  assert.ok(gate > 0);
  assert.ok(gate < firstRead, '403 fires before any source is read');
  assert.match(src.slice(gate, firstRead), /status: 403/);
});

test('calendar: WHEN from/to is invalid THEN 400 from validateRange before any data loads', () => {
  const v = src.indexOf('validateRange(');
  assert.ok(v > 0 && v < firstRead);
  assert.match(src.slice(v, firstRead), /if \(!range\.ok\) return Response\.json\(\{ ok: false, error: range\.error \}, \{ status: 400 \}\)/);
});

test('calendar: nothing answers → 503 ok:false; a failed source is named in partial, never invented', () => {
  assert.match(src, /\{ status: 503 \}/);
  assert.match(src, /partial\.push\('upload_intents'\)/);
  assert.match(src, /partial\.push\('scripts'\)/);
  assert.match(src, /if \(cadR\.ok\)/, 'free slots only when the cadence answered');
});

test('calendar: force-dynamic GET only, studio lib only (never repo-root lib/)', () => {
  assert.match(src, /export const dynamic = 'force-dynamic'/);
  assert.match(src, /export async function GET\(req\)/);
  assert.doesNotMatch(src, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(src, /from '\.\.\//);
});

test('calendar: the proxy matrix gives /calendar and /api/calendar to owner + staff only', () => {
  for (const p of ['/calendar', '/api/calendar']) {
    const roles = allowedRoles(p);
    assert.ok(roles.includes('owner') && roles.includes('staff'), `${p} owner+staff`);
    assert.ok(!roles.includes('client'), `${p} not clients`);
  }
});
