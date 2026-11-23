// Creator City Phase 2 item 5 — /api/library/artifacts (+ /[id]) wiring and
// the /videos tab shell. Studio route files import through the '@/lib' alias,
// which plain node --test cannot resolve, so the wiring is pinned by SOURCE
// SCAN (house pattern: tests/stations-api.test.mjs). The behaviour behind it
// is proven in tests/library-artifacts.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { allowedRoles } from '../studio/lib/route-roles.js';

const read = (p) => fs.readFileSync(p, 'utf8');
// strip comments so prose never trips a sentinel
const code = (src) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const list = read('studio/app/api/library/artifacts/route.js');
const one = read('studio/app/api/library/artifacts/[id]/route.js');

for (const [name, src] of [['artifacts', list], ['artifacts/[id]', one]]) {
  test(`${name}: WHEN no user resolves THEN 401 before any data loads (fail-closed)`, () => {
    assert.match(src, /getUser\(req\)\.catch\(\(\) => null\)/);
    const gate = src.indexOf("if (!user) return Response.json({ ok: false, error: 'not signed in' }, { status: 401 })");
    assert.ok(gate > 0, 'unknown user → 401');
    assert.ok(gate < src.indexOf('makeArtifactsRead(adaptPostgres'), '401 fires before the DB is touched');
  });

  test(`${name}: Neon via the house client; force-dynamic; GET only; studio-local imports`, () => {
    assert.match(src, /from '@\/lib\/db\.mjs'/);
    assert.match(src, /export const dynamic = 'force-dynamic'/);
    assert.doesNotMatch(src, /export async function (POST|PUT|PATCH|DELETE)/, 'read-only route');
    assert.doesNotMatch(src, /from '\.\.\//, 'never reaches the repo-root lib/ (Vercel deploys studio/ alone)');
  });

  test(`${name}: never leaks a blob url or token into a response`, () => {
    const c = code(src);
    assert.doesNotMatch(c, /BLOB_READ_WRITE_TOKEN/);
    for (const m of c.matchAll(/Response\.json\(([\s\S]*?)\)\s*;/g)) {
      assert.doesNotMatch(m[1], /blob_url|blobUrl|content_hash/, `response body exposes storage: ${m[1].slice(0, 80)}`);
    }
  });
}

test('artifacts: unknown role 403, bad query 400 before the DB, client scope error = EMPTY, DB down 503', () => {
  assert.match(list, /if \(!ROLES\.includes\(user\.role\)\)/);
  assert.match(list, /status: 403/);
  assert.ok(list.indexOf('status: 400') > 0 && list.indexOf('status: 400') < list.indexOf('makeArtifactsRead(adaptPostgres'));
  assert.match(list, /slugsForUser\(user\)\.catch\(\(\) => \[\]\)/);
  assert.doesNotMatch(list, /slugsForUser\(user\)\.catch\(\(\) => null\)/);
  assert.match(list, /if \(!dbReady \|\| !db\)/);
  assert.match(list, /status: 503/);
});

test('artifacts: a client with no channels gets an empty answer without touching the DB', () => {
  assert.match(list, /if \(Array\.isArray\(owned\) && !owned\.length\)/);
  assert.ok(list.indexOf('!owned.length') < list.indexOf('makeArtifactsRead(adaptPostgres'));
  assert.match(list, /scope: owned/);
  assert.match(list, /return Response\.json\(\{ ok: true, items: page\.items, counts, nextBefore: page\.nextBefore \}\)/);
});

test('artifacts: counts run on the first page only (a before=… page skips the GROUP BYs)', () => {
  assert.match(list, /query\.before \? Promise\.resolve\(null\) : read\.counts\(\{ scope: owned \}\)/);
});

test('artifacts/[id]: every decision is artifactResponse (behaviour-tested); the route wires real deps only', () => {
  assert.match(one, /const \{ id \} = await ctx\.params;/, 'Next 16: params is a Promise');
  assert.match(one, /await artifactResponse\(\{/);
  assert.match(one, /scopeFor: \(u\) => slugsForUser\(u\)/, 'the handler turns a scope throw into [] (tested)');
  assert.match(one, /read: dbReady && db \? makeArtifactsRead\(adaptPostgres\(db\)\) : null/, 'DB off → handler 503 (tested)');
  assert.match(one, /bytesCache\.get\(opts\.expectedHash, \(\) => makeArtifactStore\(\)\.getBytes\(url, opts\)\)/, 'hash-verified read, cached by content hash');
  assert.match(one, /rangeHeader: req\.headers\.get\('range'\)/);
  assert.match(one, /if \(result\.json\) return Response\.json\(result\.json, \{ status: result\.status \}\)/);
  assert.match(one, /new Response\(result\.bytes, \{ status: result\.status, headers: result\.headers \}\)/);
});

test('route-roles: /api/library/artifacts is open to every signed-in role (the route scopes clients itself)', () => {
  assert.equal(allowedRoles('/api/library/artifacts'), null);
  assert.equal(allowedRoles('/api/library/artifacts/a-1'), null);
});

/* --------------------------------- the page --------------------------------- */

const page = read('studio/app/videos/page.js');
const grid = read('studio/components/library/ArtifactGrid.js');
const viewer = read('studio/components/library/ArtifactViewer.js');

test('page: tabs Videos · Scripts · Voice · Thumbnails · Research, deep-linked by ?tab= (history push)', () => {
  assert.match(page, /libraryTab\(searchParams\)/);
  for (const label of ['Videos', 'Scripts', 'Voice', 'Thumbnails', 'Research']) assert.match(page, new RegExp(`label: '${label}'`));
  assert.match(page, /<TabNav/);
  assert.match(page, /paramName=\{null\}/, 'tab changes go through router.push, not TabNav\'s replace');
  assert.match(page, /role="tabpanel"/);
  assert.match(page, /<ArtifactGrid/);
  assert.match(page, /fetch\('\/api\/library\/artifacts'\)/, 'tab counts are real (counts-only call)');
});

test('grid: channel rail on desktop, chips on phones, honest loading/error/empty, viewer drawer', () => {
  assert.match(grid, /hidden lg:block/);
  assert.match(grid, /lg:hidden/);
  assert.match(grid, /useBrands\(\)/);
  assert.match(grid, /Nothing here yet/);
  assert.match(grid, /Retry/);
  assert.match(grid, /<Skeleton/);
  assert.match(grid, /goneText\(item\.gone\)/, 'expired items say why (the viewer\'s goneText wording)');
  assert.match(grid, /<audio/);
  assert.match(grid, /<ArtifactViewer/);
  assert.match(grid, /nextBefore/);
});

test('viewer: Drawer with Copy for text and Download for files; 410 says "No longer stored"', () => {
  assert.match(viewer, /import Drawer from '@\/components\/Drawer'/);
  assert.match(viewer, /navigator\.clipboard\.writeText/);
  assert.match(viewer, /download=1/);
  assert.match(viewer, /status === 410/);
  assert.match(viewer, /No longer stored \(kept 30 days\)/);
});

test('library UI: text scale only, no slugs rendered, no sample data, icon buttons named', () => {
  for (const [f, src] of [['page', page], ['grid', grid], ['viewer', viewer]]) {
    const c = code(src);
    assert.doesNotMatch(c, /text-\[\d+(?:\.\d+)?px\]|\btext-t-\d+\b/, f);
    assert.doesNotMatch(c, /\{(?:it|item)\.channel\}<\/span>/, `${f}: a slug must never render as text`);
    assert.doesNotMatch(c, /sample|lorem|placeholder data|SAMPLE_/i, f);
  }
});

test('review fix 1: a failed <audio>/<img> asks the route why and shows that reason (never a silent broken player)', () => {
  const g = code(grid);
  const v = code(viewer);
  for (const [f, src] of [['grid', g], ['viewer', v]]) {
    // whole element (an arrow `=>` inside an attribute would end a naive tag match)
    for (const m of src.matchAll(/<audio\b[\s\S]*?<\/audio>/g)) assert.match(m[0], /onError=/, `${f}: every <audio> has onError`);
    for (const m of src.matchAll(/<img\b[\s\S]*?\/>/g)) assert.match(m[0], /onError=/, `${f}: every <img> has onError`);
  }
  assert.match(v, /export async function probeReason\(id\)/);
  assert.match(v, /Range: 'bytes=0-0'/, 'the probe asks for one byte, not the whole file');
  assert.match(g, /probeReason\(item\.id\)/);
  assert.doesNotMatch(g, /'No preview'/, 'a broken thumbnail says why');
});

test('review fix 2 (UI): Download is offered only for files the route can send whole', () => {
  assert.match(code(viewer), /export const canDownload = \(item\) => !item\.gone && \(item\.bytes == null \|\| item\.bytes <= DOWNLOAD_MAX\)/);
  assert.match(code(viewer), /canDownload\(item\)/);
  assert.match(code(grid), /canDownload\(item\)/);
});

test('review fix 7: the Videos tab count reuses the list total (no extra /api/library call per channel change)', () => {
  const p = code(page);
  assert.doesNotMatch(p, /limit: '1'/);
  assert.match(p, /<Library onTotal=\{setVideoCount\} \/>/);
  assert.match(p, /onTotal\(\{ key: channel, n: data\.total \}\)/);
  assert.equal((p.match(/fetch\(`\/api\/library\?/g) || []).length, 2, 'only the list + "Load older" fetches remain');
});
