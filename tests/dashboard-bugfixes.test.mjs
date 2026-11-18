// #119 — two quick bugs from the 2026-11-18 deep audit.
//
// BUG-1  studio/app/page.js built the dashboard's analytics poll URL as
//        '/api/analytics?slug=all' + (fresh ? '&fresh=1' : '?fresh=1') — the
//        non-fresh branch appended a SECOND '?', so the server parsed
//        slug='all?fresh=1' → neither 'all' nor a channel → null. The 60s
//        background poll always runs non-fresh → widgets fed null forever.
// BUG-4  studio/app/api/template-previews/route.js constructed postgres(url)
//        OUTSIDE its try → malformed DATABASE_URL = raw 500 (and the
//        finally-block's sql.end() would throw again).
//
// Route/component files get SOURCE SCAN pin-tests (house pattern — '@/lib'
// aliases and JSX don't resolve under plain node). The URL-construction
// contract itself is proven BEHAVIORALLY through the same URL parser the
// server uses (URLSearchParams).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('#119 BUG-1: the poll URL contract — slug must parse as "all" on every branch', () => {
  // The OLD construction, fed through the same parser the route uses:
  // proves the root cause (a second '?' folds into the slug value).
  const oldUrl = new URL('http://x/api/analytics?slug=all' + '?fresh=1');
  assert.equal(oldUrl.searchParams.get('slug'), 'all?fresh=1', 'old shape: the stray ? glued onto the slug — the route answers null for this');
  assert.notEqual(oldUrl.searchParams.get('slug'), 'all');

  // The NEW construction (mirrors the exact expression now in page.js):
  const freshUrl = new URL('http://x/api/analytics?slug=all' + (true ? '&fresh=1' : ''));
  assert.equal(freshUrl.searchParams.get('slug'), 'all', 'fresh poll → aggregate path');
  assert.equal(freshUrl.searchParams.get('fresh'), '1', 'fresh poll still cache-busts');

  const pollUrl = new URL('http://x/api/analytics?slug=all' + (false ? '&fresh=1' : ''));
  assert.equal(pollUrl.searchParams.get('slug'), 'all', 'background poll → aggregate path');
  assert.equal(pollUrl.searchParams.get('fresh'), null, 'non-fresh poll sends NO fresh param (server cache serves)');
});

test('#119 BUG-1: page.js wires the fixed expression, old shape gone (source)', () => {
  const src = fs.readFileSync('studio/app/page.js', 'utf8');
  assert.match(src, /fetch\('\/api\/analytics\?slug=all' \+ \(fresh \? '&fresh=1' : ''\)\)/, 'new expression present');
  assert.doesNotMatch(src, /: '\?fresh=1'/, 'the second-? branch is gone');
  // the route's acceptance shape this depends on: slug='all' → aggregate
  const analytics = fs.readFileSync('studio/app/api/analytics/route.js', 'utf8');
  assert.match(analytics, /slug === 'all' \? all : channels\[slug\] \|\| null/, "route answers the aggregate for slug='all' and null for unknown slugs — the bug's blast radius");
});

test('#119 BUG-4: template-previews constructs postgres inside a guarded try (source)', () => {
  const src = fs.readFileSync('studio/app/api/template-previews/route.js', 'utf8');
  assert.doesNotMatch(src, /const sql = postgres\(/, 'no top-level constructor — the old 500 shape is gone');
  assert.match(src, /let sql;\s*\n\s*try \{\s*\n\s*sql = postgres\(url/, 'constructor runs inside its own try');
  // construction failure = the SAME 503 contract as a missing URL
  const fifties = src.match(/status: 503/g) || [];
  assert.ok(fifties.length >= 2, `missing-URL and construction-failure both 503 (found ${fifties.length})`);
  assert.match(src, /error: 'db unavailable'/, 'both 503s share the documented body');
  // query failures keep their 502 path; success path untouched
  assert.match(src, /status: 502/);
  assert.match(src, /sql\.end\(\)/, 'connection still closed on every path that built one');
});
