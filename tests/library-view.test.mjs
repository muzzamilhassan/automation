// Phase 3 "Library" — behavioral pins for studio/lib/library-view.mjs plus
// source scans for the /api/library route and the /videos page wiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildLibrary, dedupeRows, rowsFromState, rowsFromLongform, filterLibrary,
  statusAt, clampLimit, paginate, countLibrary, ytThumb, MAX_LIMIT, DEFAULT_LIMIT,
} from '../studio/lib/library-view.mjs';

const read = (p) => fs.readFileSync(p, 'utf8');
const NOW = Date.parse('2026-11-19T12:00:00Z');

const STATE = {
  'chan-a': {
    lastVideos: [{ videoId: 'A_NEW', publishAt: '2026-11-19T18:00:00Z', title: 'Future Short' }],
    titleHistory: [
      { t: 'Old Short One', at: '2026-10-01T22:35:00Z' },
      { t: 'Old Short One', at: '2026-10-01T22:35:00Z' }, // exact repeat → one row
      { t: 'Future Short', at: '2026-11-19T18:00:00Z' }, // same upload as lastVideos
    ],
    deepdiveVideo: { videoId: 'EP1', publishAt: '2026-11-10T10:00:00Z', title: 'Legacy title' },
  },
  'chan-b': {
    lastVideos: [{ videoId: 'B1', publishAt: '2026-11-18T10:00:00Z', title: 'Same Title' }],
    recyclePending: [{ newVideoId: 'B2', publishAt: '2026-09-13T12:35:00Z', title: 'Same Title' }],
  },
};
const LONGFORM = {
  'chan-a': [
    { videoId: 'EP1', publishAt: '2026-11-10T10:00:00Z', title: 'CI episode title' },
    { videoId: 'EP2', date: '2026-11-01', title: 'Dated episode' },
    { title: 'no id — dropped' },
  ],
};

test('rows come from every source; id-less longform rows are dropped', () => {
  const s = rowsFromState(STATE);
  assert.equal(s.filter((r) => r.source === 'title-history').length, 3);
  assert.ok(s.some((r) => r.source === 're-upload' && r.videoId === 'B2'));
  const l = rowsFromLongform(LONGFORM);
  assert.deepEqual(l.map((r) => r.videoId), ['EP1', 'EP2']);
  assert.equal(l[1].at, '2026-11-01T00:00:00Z');
});

test('dedupe: one row per videoId, CI episode log wins over the legacy field', () => {
  const lib = buildLibrary({ state: STATE, longform: LONGFORM, now: NOW });
  const ep1 = lib.filter((i) => i.videoId === 'EP1');
  assert.equal(ep1.length, 1);
  assert.equal(ep1[0].title, 'CI episode title');
  assert.equal(ep1[0].kind, 'long');
});

test('dedupe: a history row folds into the uploaded row with the same title + time', () => {
  const lib = buildLibrary({ state: STATE, longform: LONGFORM, now: NOW });
  const fut = lib.filter((i) => i.slug === 'chan-a' && i.title === 'Future Short');
  assert.equal(fut.length, 1);
  assert.equal(fut[0].videoId, 'A_NEW');
  assert.equal(lib.filter((i) => i.title === 'Old Short One').length, 1);
  const old = lib.find((i) => i.title === 'Old Short One');
  assert.equal(old.url, null, 'no videoId → no fake link');
  assert.equal(old.thumb, null, 'no videoId → no fake thumbnail');
});

test('two DIFFERENT videoIds with one title are flagged, not hidden', () => {
  const lib = buildLibrary({ state: STATE, longform: LONGFORM, now: NOW });
  const same = lib.filter((i) => i.slug === 'chan-b' && i.title === 'Same Title');
  assert.equal(same.length, 2);
  assert.ok(same.every((i) => i.dupTitle));
  assert.ok(!lib.find((i) => i.videoId === 'EP2').dupTitle);
});

test('a history row far from the upload time stays its own row (a real re-upload)', () => {
  const rows = dedupeRows([
    { slug: 's', title: 'X', at: '2026-11-18T10:00:00Z', videoId: 'V', kind: 'short', source: 'latest-upload' },
    { slug: 's', title: 'X', at: '2026-10-01T10:00:00Z', videoId: null, kind: 'short', source: 'title-history' },
  ]);
  assert.equal(rows.length, 2);
});

test('status: future time → scheduled, past → published, missing → unknown', () => {
  assert.equal(statusAt('2026-11-19T18:00:00Z', NOW), 'scheduled');
  assert.equal(statusAt('2026-11-18T18:00:00Z', NOW), 'published');
  assert.equal(statusAt(null, NOW), 'unknown');
  const lib = buildLibrary({ state: STATE, longform: LONGFORM, now: NOW });
  const fut = lib.find((i) => i.videoId === 'A_NEW');
  assert.equal(fut.status, 'scheduled');
  assert.equal(fut.scheduledAt, '2026-11-19T18:00:00Z');
  assert.equal(fut.publishedAt, null);
  assert.equal(fut.thumb, null, 'scheduled = still private → no thumbnail');
  const pub = lib.find((i) => i.videoId === 'B1');
  assert.equal(pub.thumb, ytThumb('B1'));
  assert.equal(pub.url, 'https://www.youtube.com/watch?v=B1');
});

test('newest first, scheduled on top, undated rows last', () => {
  const lib = buildLibrary({
    state: { s: { titleHistory: [{ t: 'undated' }, { t: 'old', at: '2026-01-01T00:00:00Z' }], lastVideos: [{ videoId: 'F', publishAt: '2026-12-01T00:00:00Z', title: 'future' }] } },
    longform: {},
    now: NOW,
  });
  assert.deepEqual(lib.map((i) => i.title), ['future', 'old', 'undated']);
});

test('filters: channel, kind, status, search text (case-insensitive)', () => {
  const lib = buildLibrary({ state: STATE, longform: LONGFORM, now: NOW });
  assert.ok(filterLibrary(lib, { slug: 'chan-b' }).every((i) => i.slug === 'chan-b'));
  assert.ok(filterLibrary(lib, { kind: 'long' }).every((i) => i.kind === 'long'));
  assert.deepEqual(filterLibrary(lib, { status: 'scheduled' }).map((i) => i.videoId), ['A_NEW']);
  assert.deepEqual(filterLibrary(lib, { q: '  dated EPISODE ' }).map((i) => i.videoId), ['EP2']);
  assert.equal(filterLibrary(lib, { slug: 'all', kind: 'all', status: 'all', q: '' }).length, lib.length);
});

test('paging: default 50, max 200, offset slices', () => {
  assert.equal(clampLimit(undefined), DEFAULT_LIMIT);
  assert.equal(clampLimit('0'), DEFAULT_LIMIT);
  assert.equal(clampLimit('9999'), MAX_LIMIT);
  const p = paginate(Array.from({ length: 7 }, (_, i) => i), { limit: '3', offset: '5' });
  assert.deepEqual(p, { items: [5, 6], total: 7, limit: 3, offset: 5 });
  const c = countLibrary(buildLibrary({ state: STATE, longform: LONGFORM, now: NOW }));
  assert.equal(c.all, c.short + c.long + c.other);
  assert.equal(c.scheduled, 1);
});

// ---- source scans -----------------------------------------------------------

test('route: auth first (401), fail-closed client scope, honest errors, no YouTube calls', () => {
  const src = read('studio/app/api/library/route.js');
  assert.match(src, /const user = await getUser\(req\)\.catch\(\(\) => null\);\s*\n\s*if \(!user\) return Response\.json\(\{ error: 'not signed in' \}, \{ status: 401 \}\)/);
  assert.match(src, /slugsForUser\(user\)\.catch\(\(\) => \[\]\)/);
  assert.match(src, /if \(owned\) items = items\.filter\(\(it\) => owned\.includes\(it\.slug\)\)/);
  assert.match(src, /complete: errors\.length === 0/);
  assert.match(src, /errors,/);
  assert.doesNotMatch(src, /googleapis|ytTokenRaw|youtube\/v3/);
  // auth happens before any source is read
  assert.ok(src.indexOf('getUser(req)') < src.indexOf("load('channel-state'"), 'auth before data');
});

test('page: live channel labels (never slugs), rowHeader title, honest error + partial states', () => {
  const src = read('studio/app/videos/page.js');
  assert.match(src, /fetch\(`\/api\/library\?/);
  assert.match(src, /useBrands\(\)/);
  assert.match(src, /BRAND\[slug\]\?\.label/);
  assert.match(src, /<option key=\{c\.slug\} value=\{c\.slug\}>\{c\.label\}<\/option>/);
  assert.doesNotMatch(src, /\{(?:l|it|item)\.slug\}<\/span>/, 'slug must never render as text');
  assert.match(src, /key: 'title',\s*\n\s*label: 'Title',\s*\n\s*rowHeader: true/);
  assert.match(src, /Couldn't load your videos right now\./);
  assert.match(src, /This list may be missing videos\./);
  assert.match(src, /timeAgo\(item\.at\)/);
  assert.match(src, /<Suspense/);
  // mobile: the table only at lg+, a stacked list below it
  assert.match(src, /hidden lg:block/);
  assert.match(src, /lg:hidden/);
  assert.doesNotMatch(src, /text-\[\d+px\]|text-t-\d+/);
});
