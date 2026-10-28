// Task 6 addendum (#104, Phase 2 BYOK vault v2) — CF-1/CF-2/CF-3 wiring of the
// schedule route to the quota-model store (Task 8 review carry-forwards):
//   CF-1  advisory when a live model's insertCostUnits differs from legacy 1,700
//         (the ~17x relaxation must never be silent),
//   CF-2  ensureQuotaModelSchema at the wiring point + table-missing vs
//         row-missing distinguished in the log,
//   CF-3  projectWithQuotaModel wired with the loader injected (AC-P2-6/7 end-to-end).
//
// Studio route files import through the '@/lib' alias, which plain node --test
// cannot resolve — so the wiring seam is pinned by SOURCE SCAN (the house
// pattern for route files: tests/provider-catalog.test.mjs 'assign route
// imports capabilityProviders...'). Build-level proof is the `next build`
// exit-0 gate; behavioral proof of the projection math lives in
// tests/quota-model.test.mjs (Task 8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('studio/app/api/channels/schedule/route.js', 'utf8');

test('CF-3: route imports and wires projectWithQuotaModel with the loader injected', () => {
  assert.ok(src.includes('projectWithQuotaModel'), 'route must import projectWithQuotaModel from schedule-projection');
  assert.ok(/projectWithQuotaModel\(\s*\{/.test(src), 'route must CALL projectWithQuotaModel');
  assert.ok(/loadQuotaModel:\s*(async\s*)?\(?/.test(src), 'loader must be passed to projectWithQuotaModel (injected, CF-3)');
});

test('CF-2: ensureQuotaModelSchema is called at the wiring point', () => {
  assert.ok(src.includes('ensureQuotaModelSchema'), 'route must import ensureQuotaModelSchema');
  assert.ok(/await\s+ensureQuotaModelSchema\(/.test(src), 'route must CALL ensureQuotaModelSchema before loading the model');
  assert.ok(/from\s+'@\/lib\/db'/.test(src), 'route must acquire the real db client (db + dbReady)');
  assert.ok(src.includes('adaptPostgres'), 'the postgres client must be bridged to the positional client contract');
});

test('CF-2: table-missing and row-missing are distinguished log lines', () => {
  assert.ok(/table MISSING/i.test(src), 'ensureSchema failure must log TABLE-MISSING distinctly');
  assert.ok(/no row for project/i.test(src), 'empty lookup must log ROW-MISSING distinctly');
});

test('CF-1: legacy 1,700 cost advisory exists so the relaxation is never silent', () => {
  assert.ok(/1700/.test(src), 'legacy insert cost constant (1,700) must be named in the route');
  assert.ok(/ADVISORY/i.test(src), 'an advisory marker must exist for the cost divergence');
  // the advisory text carries both numbers and the multiplicative relaxation
  assert.ok(/units\/upload/.test(src), 'advisory must state the per-upload unit cost');
});

test('schedule-time projection is model-aware on BOTH read and write paths', () => {
  const calls = src.match(/await scheduleProjection\(/g) || [];
  assert.ok(calls.length >= 2, `GET and POST must both project through the model-aware helper (found ${calls.length})`);
  assert.equal(src.includes('projection: projection({'), false, 'the legacy sync-only projection call must be retired from GET');
  assert.equal(src.includes('const proj = projection('), false, 'the legacy sync-only projection call must be retired from POST');
});

test('blocking + response contract unchanged: validateSchedule first, blocked still 400s', () => {
  assert.ok(src.includes('validateSchedule('), 'schedule validation must stay');
  assert.ok(/proj\.blocked/.test(src), 'the blocked verdict must still gate the save');
  assert.ok(/status: 400/.test(src), 'blocked saves must still return 400');
});
