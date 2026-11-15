// Admin-panel review 2026-11-15 (panel bug #6): /review's <img> pointed at
// /api/review/thumb?id=&idx=, a route that never existed (404 for every
// candidate). The bytes are served by GET /api/review?thumb=1&id=&idx= (server-
// side URL lookup + hash verify). Spec + QA: docs/qa/review-thumb-url-qa.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('the review page loads candidates from the endpoint that exists', () => {
  const page = fs.readFileSync('studio/app/review/page.js', 'utf8');
  assert.doesNotMatch(page, /\/api\/review\/thumb/);
  assert.match(page, /\/api\/review\?thumb=1&id=\$\{detail\.script\.id\}&idx=\$\{c\.idx\}/);
});

test('the endpoint is the thumb=1 branch of GET /api/review (owner/staff, server-side lookup, hash-verified)', () => {
  const route = fs.readFileSync('studio/app/api/review/route.js', 'utf8');
  assert.match(route, /searchParams\.get\('thumb'\) === '1'/);
  assert.match(route, /expectedHash: candidate\.hash/);
  assert.match(route, /\['owner', 'staff'\]\.includes\(user\.role\)/);
  assert.equal(fs.existsSync('studio/app/api/review/thumb/route.js'), false, 'no second, divergent route');
});
