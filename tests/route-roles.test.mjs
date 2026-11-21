// Admin-panel review 2026-11-15 (panel bug #7): the proxy's owner-only rule
// covered every /api/channels/* path except flow/keys, so staff were blocked
// from /api/channels/schedule and /api/channels/clip-queue although both routes
// allow owner+staff (schedule/route.js, clip-queue/route.js). The matrix moves
// to studio/lib/route-roles.js (testable) with that one deliberate change.
// Spec + QA: docs/qa/route-roles-qa.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { allowedRoles } from '../studio/lib/route-roles.js';

test('staff may use the schedule and clip-queue controls their routes allow', () => {
  for (const p of ['/api/channels/schedule', '/api/channels/clip-queue']) assert.deepEqual(allowedRoles(p), ['owner', 'staff'], p);
});

test('other channel management stays owner-only', () => {
  for (const p of ['/api/channels/profile', '/api/channels/registry', '/api/channels/kit', '/api/oauth/start', '/settings', '/users', '/sessions', '/api/team', '/api/users']) {
    assert.deepEqual(allowedRoles(p), ['owner'], p);
  }
});

test('unchanged rules: engine room owner+staff, thumbs/topics/flow/keys include clients', () => {
  for (const p of ['/production', '/api/action', '/review', '/api/review', '/warnings', '/api/warnings/x', '/create', '/api/create-video']) assert.deepEqual(allowedRoles(p), ['owner', 'staff'], p);
  for (const p of ['/thumbs', '/api/thumbs/preview', '/topics', '/api/topics', '/api/channels/flow', '/api/channels/keys', '/api/channels/readiness']) assert.deepEqual(allowedRoles(p), ['owner', 'staff', 'client'], p);
});

test('unlisted paths are open to any signed-in role (null)', () => {
  assert.equal(allowedRoles('/analytics'), null);
  assert.equal(allowedRoles('/'), null);
});

test('proxy.js delegates to allowedRoles', () => {
  const src = fs.readFileSync('studio/proxy.js', 'utf8');
  assert.match(src, /allowedRoles\(pathname\)/);
  assert.doesNotMatch(src, /const RULES = \[/);
});
