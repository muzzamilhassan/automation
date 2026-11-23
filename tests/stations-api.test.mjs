// Creator City Phase 1 (FEEDBACK item O) — /api/stations and /api/runs/steps
// wiring. Studio route files import through the '@/lib' alias, which plain
// node --test cannot resolve, so the wiring is pinned by SOURCE SCAN (house
// pattern: tests/schedule-quota-route.test.mjs, tests/fail-closed-routes.test.mjs).
// The behaviour behind the wiring (strip rules, payload, query validation,
// Neon reads) is proven in tests/station-read.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { allowedRoles } from '../studio/lib/route-roles.js';

const stations = fs.readFileSync('studio/app/api/stations/route.js', 'utf8');
const steps = fs.readFileSync('studio/app/api/runs/steps/route.js', 'utf8');

for (const [name, src] of [['stations', stations], ['runs/steps', steps]]) {
  test(`${name}: WHEN no user resolves THEN 401 before any data loads (fail-closed)`, () => {
    assert.match(src, /getUser\(req\)\.catch\(\(\) => null\)/);
    const gate = src.indexOf("if (!user) return Response.json({ ok: false, error: 'not signed in' }, { status: 401 })");
    assert.ok(gate > 0, 'unknown user → 401');
    assert.ok(gate < src.indexOf('makeJobsRead('), '401 fires before the DB is touched');
  });

  test(`${name}: WHEN the role is not owner/staff THEN 403 (in-route re-check, same as /api/runs)`, () => {
    assert.match(src, /if \(!\['owner', 'staff'\]\.includes\(user\.role\)\)/);
    assert.match(src, /status: 403/);
  });

  test(`${name}: reads Neon through the house client (db + dbReady + adaptPostgres), force-dynamic, GET only`, () => {
    assert.match(src, /from '@\/lib\/db\.mjs'/);
    assert.match(src, /adaptPostgres\(db\)/);
    assert.match(src, /if \(!dbReady \|\| !db\)/);
    assert.match(src, /export const dynamic = 'force-dynamic'/);
    assert.match(src, /export async function GET\(req\)/);
    assert.doesNotMatch(src, /export async function (POST|PUT|PATCH|DELETE)/, 'read-only route');
    assert.doesNotMatch(src, /from '\.\.\/|from '\.\.\/\.\.\/\.\.\/\.\.\/lib/, 'never reaches the repo-root lib/ (Vercel deploys studio/ alone)');
  });
}

test('stations: WHEN the DB is down or a query throws THEN 503 stations_unavailable, never fake data', () => {
  const n = stations.match(/Response\.json\(\{ ok: false, error: 'stations_unavailable' \}, \{ status: 503 \}\)/g) || [];
  assert.ok(n.length >= 2, 'both the not-configured and the query-failure paths answer 503');
  assert.match(stations, /catch \{\s*return Response\.json\(\{ ok: false, error: 'stations_unavailable' \}/);
});

test('stations: only the real/active channel list (deriveBrandList over brands() + registry) is reported', () => {
  assert.match(stations, /deriveBrandList\(brands\(\) \|\| \{\}, registry\)/);
  assert.match(stations, /stationsPayload\(\{ channels/);
  assert.match(stations, /ok: true, fetchedAt/);
});

test('runs/steps: inputs are validated (parseStepsQuery) and bad input is a 400, before the DB', () => {
  assert.match(steps, /const params = new URL\(req\.url\)\.searchParams;\s*const query = parseStepsQuery\(params\);/);
  assert.match(steps, /status: 400/);
  assert.ok(steps.indexOf('status: 400') < steps.indexOf('makeJobsRead('));
});

test('runs/steps: every job of the run is loaded (fleet runs share one GitHub run id) and shaped by stepsPayload — no_job/single/multi, always 200', () => {
  assert.match(steps, /\.loadRuns\(query\)/);
  assert.doesNotMatch(steps, /\.loadRun\(/, 'the single-job reader (LIMIT 1 = a random channel) is gone');
  assert.match(steps, /return Response\.json\(stepsPayload\(records, \{ timeZone: safeTimeZone\(params\.get\('tz'\)\), now: Date\.now\(\) \}\)\);/);
  assert.match(steps, /status: 503/);
});

test('route-roles: /api/stations and /api/runs/steps are owner+staff', () => {
  for (const p of ['/api/stations', '/api/runs/steps']) {
    const roles = allowedRoles(p);
    assert.ok(roles && roles.includes('owner') && roles.includes('staff') && !roles.includes('client'), p);
  }
});
