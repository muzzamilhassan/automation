// Creator City Phase 2 item 5 — Library "everything made". Behavioral pins
// for the pure core studio/lib/library-artifacts.mjs: query validation,
// id validation, row → item shaping (scripts / voice / thumbnails /
// research), counts per kind + channel, retention honesty, byte-range math,
// and the Neon reader over an injected fake client.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ARTIFACT_TABS, LIBRARY_TABS, PAGE_MAX, PAGE_DEFAULT,
  libraryTab, parseArtifactQuery, parseArtifactId,
  artifactItem, scriptItem, researchItem, mergePage, countsFrom, emptyCounts,
  goneReason, bytesFailure, mimeOf, parseRange, downloadName, payloadText, safeHttpUrl,
  researchTopic, makeArtifactsRead, fmtBytes, fmtDuration,
  capRange, RANGE_CHUNK, DOWNLOAD_MAX, makeBytesCache, artifactResponse,
} from '../studio/lib/library-artifacts.mjs';

const NOW = Date.parse('2026-11-23T12:00:00Z');
const UUID = '0b6f1c5e-8a8e-4d55-9a57-3f3b0b8f2a11';
const JOB = '7d1f2c3e-1111-4222-8333-944455556666';

/* ------------------------------- tabs + queries ------------------------------ */

test('WHEN ?tab= is a known tab THEN it is used; anything else falls back to videos', () => {
  assert.deepEqual(LIBRARY_TABS, ['videos', 'scripts', 'voice', 'thumbnails', 'research']);
  assert.equal(libraryTab(new URLSearchParams('tab=scripts')), 'scripts');
  assert.equal(libraryTab(new URLSearchParams('tab=research')), 'research');
  assert.equal(libraryTab(new URLSearchParams('tab=../etc')), 'videos');
  assert.equal(libraryTab(new URLSearchParams('')), 'videos');
  assert.equal(libraryTab(null), 'videos');
  assert.equal(ARTIFACT_TABS.scripts, 'script');
  assert.equal(ARTIFACT_TABS.thumbnails, 'thumbnail');
});

test('WHEN the list query is valid THEN kind/channel/limit/before are normalised (limit capped at 60)', () => {
  const cur = `2026-11-20T00:00:00.123456|a|${'0'.repeat(18)}42`;
  const q = parseArtifactQuery(new URLSearchParams(`kind=voice&channel=money-rulebook&limit=500&before=${encodeURIComponent(cur)}`));
  assert.deepEqual(q, { kind: 'voice', channel: 'money-rulebook', limit: PAGE_MAX, before: cur });
  const sc = `2026-11-20T00:00:00.000001|s|${UUID}`;
  assert.equal(parseArtifactQuery(new URLSearchParams(`kind=script&before=${encodeURIComponent(sc)}`)).before, sc);
  assert.equal(PAGE_MAX, 60);
  assert.equal(parseArtifactQuery(new URLSearchParams('kind=script')).limit, PAGE_DEFAULT);
  assert.equal(parseArtifactQuery(new URLSearchParams('kind=script&limit=-4')).limit, PAGE_DEFAULT);
  assert.equal(parseArtifactQuery(new URLSearchParams('kind=script&channel=all')).channel, null);
});

test('WHEN no kind is given THEN the query is counts-only (kind null, no error)', () => {
  const q = parseArtifactQuery(new URLSearchParams(''));
  assert.equal(q.error, undefined);
  assert.equal(q.kind, null);
});

test('WHEN kind, channel or before is malformed THEN parseArtifactQuery returns an error (route answers 400)', () => {
  assert.match(parseArtifactQuery(new URLSearchParams('kind=video')).error, /kind/);
  assert.match(parseArtifactQuery(new URLSearchParams('kind=voice&channel=Bad Slug!')).error, /channel/);
  assert.match(parseArtifactQuery(new URLSearchParams("kind=voice&channel=a';drop")).error, /channel/);
  assert.match(parseArtifactQuery(new URLSearchParams('kind=voice&before=yesterday')).error, /before/);
  assert.match(parseArtifactQuery(new URLSearchParams('kind=voice&before=2026-11-20T00:00:00Z')).error, /before/, 'a bare ms time is not a cursor (ties would be skipped)');
  assert.match(parseArtifactQuery(new URLSearchParams(`kind=voice&before=${encodeURIComponent("2026-11-20T00:00:00.000000|a|1' OR '1")}`)).error, /before/);
});

test('WHEN an artifact id is valid THEN it parses to its source; anything else is rejected', () => {
  assert.deepEqual(parseArtifactId('a-42'), { source: 'artifact', key: '42' });
  assert.deepEqual(parseArtifactId(`s-${UUID}`), { source: 'script', key: UUID });
  assert.deepEqual(parseArtifactId(`r-${UUID.toUpperCase()}`), { source: 'research', key: UUID });
  for (const bad of ['', 'a-', 'a-0', 'a-01', 'a-1e9', 'a-99999999999999999999', 's-not-a-uuid', `x-${UUID}`, '../a-1', 'a-1;', null, undefined, 42]) {
    assert.equal(parseArtifactId(bad), null, String(bad));
  }
});

/* ----------------------------------- items ---------------------------------- */

const thumbRow = {
  id: 9, job_id: JOB, step: 'post', kind: 'thumb_candidate', bytes: '48211', meta: { idx: 2 },
  created_at: new Date('2026-11-22T09:00:00Z'), stored: true, channel: 'money-rulebook',
  script_title: null, script_id: null, script_video_id: null,
  blob_url: 'https://secret.private.blob.vercel-storage.com/artifacts/abc?token=XYZ',
};

test('WHEN a thumbnail row is shaped THEN the item carries id/kind/channel/title/mime and NEVER the blob url', () => {
  const it = artifactItem(thumbRow, { now: NOW });
  assert.equal(it.id, 'a-9');
  assert.equal(it.kind, 'thumbnail');
  assert.equal(it.channel, 'money-rulebook');
  assert.equal(it.title, 'Thumbnail option 2');
  assert.equal(it.createdAt, '2026-11-22T09:00:00.000Z');
  assert.equal(it.jobId, JOB);
  assert.equal(it.bytes, 48211);
  assert.equal(it.mime, 'image/jpeg');
  assert.equal(it.stored, true);
  assert.equal(it.gone, null);
  assert.ok(!JSON.stringify(it).includes('blob'), 'no blob url/token leaks into an item');
  assert.ok(!JSON.stringify(it).includes('token'));
});

test('WHEN the job has exactly one script THEN the artifact borrows its title + ids', () => {
  const it = artifactItem({ ...thumbRow, script_title: 'Why banks love debt', script_id: UUID, script_video_id: 'vid1' }, { now: NOW });
  assert.equal(it.title, 'Why banks love debt');
  assert.equal(it.scriptId, UUID);
  assert.equal(it.videoId, 'vid1');
});

test('WHEN a voice row is shaped THEN mime comes from the file name and the title is the narration part', () => {
  const it = artifactItem({ ...thumbRow, id: 3, kind: 'tts_audio', meta: { file: 'narr-03.mp3' } }, { now: NOW });
  assert.equal(it.kind, 'voice');
  assert.equal(it.mime, 'audio/mpeg');
  assert.equal(it.title, 'Narration part 3');
  assert.equal(mimeOf('tts_audio', { file: 'narr-intro.wav' }), 'audio/wav');
  assert.equal(mimeOf('tts_audio', { file: 'narr-x.ogg' }), 'audio/mpeg', 'unknown extension → the lane default (mp3)');
  assert.equal(mimeOf('tts_audio', null), 'audio/mpeg');
});

test('WHEN a script_payload row is shaped THEN it is a script item titled by its entry count', () => {
  const it = artifactItem({ ...thumbRow, id: 5, kind: 'script_payload', meta: '{"entries":3}' }, { now: NOW });
  assert.equal(it.kind, 'script');
  assert.equal(it.title, '3 Shorts scripts');
  assert.equal(it.mime, 'application/json');
  assert.equal(it.source, 'run');
  assert.equal(artifactItem({ ...thumbRow, kind: 'script_payload', meta: { entries: 1 } }, { now: NOW }).title, '1 Shorts script');
});

test('WHEN an artifact is older than its retention or was never shelved THEN gone says why (expired / not_stored)', () => {
  assert.equal(goneReason({ kind: 'tts_audio', created_at: '2026-10-01T00:00:00Z', stored: true }, NOW), 'expired');
  assert.equal(goneReason({ kind: 'tts_audio', created_at: '2026-11-20T00:00:00Z', stored: false }, NOW), 'not_stored');
  assert.equal(goneReason({ kind: 'tts_audio', created_at: '2026-11-20T00:00:00Z', stored: true }, NOW), null);
  const it = artifactItem({ ...thumbRow, created_at: '2026-09-01T00:00:00Z' }, { now: NOW });
  assert.equal(it.gone, 'expired');
});

test('WHEN a scripts row is shaped THEN title, status and the first lines are the preview', () => {
  const it = scriptItem({
    id: UUID, channel_id: 'money-rulebook', title: 'Credit card float', kind: 'short', status: 'awaiting_review',
    slot_date: '2026-11-23', video_id: null, job_id: JOB, created_at: '2026-11-23T06:00:00Z',
    preview: 'Line one\n\nLine two\n\nLine three\n\nLine four',
  });
  assert.equal(it.id, `s-${UUID}`);
  assert.equal(it.kind, 'script');
  assert.equal(it.scriptId, UUID);
  assert.equal(it.status, 'awaiting_review');
  assert.equal(it.previewText, 'Line one\nLine two\nLine three');
  assert.equal(it.mime, 'text/plain');
  assert.equal(it.source, 'review');
  assert.equal(it.gone, null, 'script rows live in Neon — never expire');
  assert.equal(scriptItem({ id: UUID, channel_id: 'x', created_at: NOW }).title, 'Untitled script');
});

test('WHEN a research row is shaped THEN topic, seed and the source count are what the item shows', () => {
  const it = researchItem({
    id: UUID, channel_id: 'money-rulebook', title: 'Credit card float', kind: 'short', status: 'approved',
    video_id: 'v9', job_id: JOB, created_at: '2026-11-23T06:00:00Z',
    topic: 'How card issuers earn on float', seed: 'Banks and your balance', source_count: '2',
  });
  assert.equal(it.id, `r-${UUID}`);
  assert.equal(it.kind, 'research');
  assert.equal(it.title, 'How card issuers earn on float');
  assert.equal(it.topic, 'How card issuers earn on float');
  assert.equal(it.seed, 'Banks and your balance');
  assert.equal(it.sourceCount, 2);
  assert.equal(it.scriptTitle, 'Credit card float');
  assert.equal(it.videoId, 'v9');
});

test('researchTopic: a JSON-object themes value reads its topic/title; a plain string is itself', () => {
  assert.equal(researchTopic('Plain topic'), 'Plain topic');
  assert.equal(researchTopic('{"topic":"Inner"}'), 'Inner');
  assert.equal(researchTopic('["a","b"]'), 'a · b');
  assert.equal(researchTopic(null), null);
  assert.equal(researchTopic('  '), null);
});

/* ------------------------------- merge + counts ------------------------------ */

test("WHEN two sources are merged THEN the page is newest first, capped, and nextBefore is the last item's two-part cursor", () => {
  const a = [{ id: 'a-2', cursor: '2026-11-23T10:00:00.000000|a|00000000000000000002' }, { id: 'a-1', cursor: '2026-11-21T10:00:00.000000|a|00000000000000000001' }];
  const s = [{ id: 's-x', cursor: `2026-11-22T10:00:00.000000|s|${UUID}` }];
  const p = mergePage([a, s], 2);
  assert.deepEqual(p.items.map((i) => i.id), ['a-2', 's-x']);
  assert.equal(p.nextBefore, `2026-11-22T10:00:00.000000|s|${UUID}`);
  // a same-microsecond tie across sources keeps a strict total order
  const tie = mergePage([[{ id: 'a-1', cursor: '2026-11-22T10:00:00.000000|a|00000000000000000001' }], [{ id: 's-y', cursor: `2026-11-22T10:00:00.000000|s|${UUID}` }]], 1);
  assert.equal(tie.items[0].id, 's-y');
  const all = mergePage([a, s], 5);
  assert.equal(all.items.length, 3);
  assert.equal(all.nextBefore, null, 'nothing more → no cursor');
});

test('WHEN counts are built THEN every kind has total + byChannel, payload scripts add to script rows', () => {
  const c = countsFrom({
    artifactRows: [
      { kind: 'script_payload', channel: 'a', n: '2' },
      { kind: 'tts_audio', channel: 'a', n: 5 },
      { kind: 'thumb_candidate', channel: 'b', n: 4 },
      { kind: 'review_render', channel: 'b', n: 9 }, // not a Library tab — ignored
    ],
    scriptRows: [{ channel: 'a', n: 1 }, { channel: 'b', n: 3 }],
    researchRows: [{ channel: 'b', n: 2 }],
  });
  assert.deepEqual(c.script, { total: 6, byChannel: { a: 3, b: 3 } });
  assert.deepEqual(c.voice, { total: 5, byChannel: { a: 5 } });
  assert.deepEqual(c.thumbnail, { total: 4, byChannel: { b: 4 } });
  assert.deepEqual(c.research, { total: 2, byChannel: { b: 2 } });
  assert.deepEqual(emptyCounts().voice, { total: 0, byChannel: {} });
});

/* ------------------------------- bytes serving ------------------------------- */

test('WHEN the store cannot return the bytes THEN the failure maps to an honest status (410 expired / 503 / 502)', () => {
  assert.deepEqual(bytesFailure('Vercel Blob: The requested blob does not exist'), { status: 410, reason: 'expired' });
  assert.deepEqual(bytesFailure('BlobNotFoundError'), { status: 410, reason: 'expired' });
  assert.deepEqual(bytesFailure('blob_unavailable'), { status: 503, reason: 'store_unavailable' });
  assert.deepEqual(bytesFailure('hash_mismatch'), { status: 502, reason: 'unreadable' });
  assert.deepEqual(bytesFailure('socket hang up'), { status: 502, reason: 'unreadable' });
});

test('WHEN a Range header asks for part of the bytes THEN parseRange returns the slice (audio seeking, Safari)', () => {
  assert.deepEqual(parseRange('bytes=0-99', 1000), { start: 0, end: 99 });
  assert.deepEqual(parseRange('bytes=900-', 1000), { start: 900, end: 999 });
  assert.deepEqual(parseRange('bytes=-100', 1000), { start: 900, end: 999 });
  assert.deepEqual(parseRange('bytes=0-5000', 1000), { start: 0, end: 999 });
  assert.equal(parseRange(null, 1000), null);
  assert.equal(parseRange('bytes=0-1,5-9', 1000), null, 'multi-range → whole body');
  assert.equal(parseRange('bytes=2000-', 1000), 'unsatisfiable');
  assert.equal(parseRange('items=0-1', 1000), null);
});

test('downloadName: safe, kind-shaped file names (no path or quote characters)', () => {
  assert.equal(downloadName({ id: 'a-9', channel: 'money-rulebook', kind: 'thumbnail', mime: 'image/jpeg' }), 'money-rulebook-thumbnail-a-9.jpg');
  assert.equal(downloadName({ id: 'a-3', channel: 'x', kind: 'voice', mime: 'audio/wav' }), 'x-voice-a-3.wav');
  assert.equal(downloadName({ id: 'a-3', channel: '../"evil', kind: 'voice', mime: 'audio/mpeg' }), 'evil-voice-a-3.mp3');
});

test('payloadText: a stored shorts payload becomes readable text (title + script per entry)', () => {
  const raw = JSON.stringify({ slug: 'a', kind: 'shorts', date: '2026-11-23', entries: [
    { videoId: 'v1', title: 'One', text: 'Hook one' }, { videoId: 'v2', title: 'Two', text: 'Hook two' },
  ] });
  const t = payloadText(Buffer.from(raw));
  assert.match(t, /One\n\nHook one/);
  assert.match(t, /Two\n\nHook two/);
  assert.equal(payloadText(Buffer.from('not json')), null);
});

test('safeHttpUrl: only http(s) source links are rendered as links', () => {
  assert.equal(safeHttpUrl('https://example.com/a'), 'https://example.com/a');
  assert.equal(safeHttpUrl('javascript:alert(1)'), null);
  assert.equal(safeHttpUrl('data:text/html,x'), null);
  assert.equal(safeHttpUrl(''), null);
});

/* ----------------------------- Neon reader (fake) ----------------------------- */

function fakeDb(handler) {
  const calls = [];
  const client = async (sql, params) => {
    calls.push({ sql, params });
    return handler(sql, params) || [];
  };
  return { client, calls };
}

test('reader: WHEN listing voice for a client scope THEN SQL filters kind + the scope channels with placeholders only', async () => {
  const { client, calls } = fakeDb((sql) => (/FROM job_artifacts/.test(sql) ? [{ ...thumbRow, kind: 'tts_audio', meta: { file: 'narr-01.mp3' } }] : []));
  const r = makeArtifactsRead(client);
  const out = await r.list({ kind: 'voice', channel: null, limit: 10, before: null, scope: ['money-rulebook', 'tax-shield'], now: NOW });
  assert.equal(out.items.length, 1);
  assert.equal(out.items[0].kind, 'voice');
  const q = calls.find((c) => /FROM job_artifacts/.test(c.sql));
  assert.match(q.sql, /a\.kind = \$1/);
  assert.match(q.sql, /j\.channel IN \(\$\d+, \$\d+\)/);
  assert.ok(q.params.includes('tts_audio'));
  assert.ok(q.params.includes('money-rulebook') && q.params.includes('tax-shield'));
  assert.doesNotMatch(q.sql, /money-rulebook/, 'values never inlined into SQL');
  assert.match(q.sql, /LIMIT \$\d+/);
});

test('reader: WHEN listing scripts THEN both the scripts table and run payloads are read and merged', async () => {
  const { client, calls } = fakeDb((sql) => {
    if (/FROM job_artifacts/.test(sql)) return [{ ...thumbRow, id: 5, kind: 'script_payload', meta: { entries: 2 }, created_at: '2026-11-21T00:00:00Z' }];
    if (/FROM scripts/.test(sql)) return [{ id: UUID, channel_id: 'money-rulebook', title: 'T', created_at: '2026-11-22T00:00:00Z', preview: 'x' }];
    return [];
  });
  const before = `2026-11-23T00:00:00.000000|s|${UUID}`;
  const out = await makeArtifactsRead(client).list({ kind: 'script', channel: 'money-rulebook', limit: 10, before, scope: null, now: NOW });
  assert.deepEqual(out.items.map((i) => i.id), [`s-${UUID}`, 'a-5']);
  assert.equal(calls.length, 2);
  for (const c of calls) {
    assert.ok(c.params.includes('money-rulebook'));
    assert.ok(c.params.includes(before));
    // two-part cursor: (created_at µs, source, id) compared byte-wise — ties are never skipped
    assert.match(c.sql, /COLLATE "C" < \$\d+/);
    assert.match(c.sql, /ORDER BY [\s\S]*COLLATE "C" DESC/);
  }
});

test('reader: WHEN the scope is an empty list THEN nothing is read and nothing is returned (fail closed)', async () => {
  const { client, calls } = fakeDb(() => [{ id: 1 }]);
  const r = makeArtifactsRead(client);
  const out = await r.list({ kind: 'thumbnail', limit: 10, scope: [], now: NOW });
  assert.deepEqual(out, { items: [], nextBefore: null });
  const c = await r.counts({ scope: [] });
  assert.deepEqual(c, emptyCounts());
  assert.equal(calls.length, 0);
});

test('reader: WHEN a query throws THEN the error propagates (route answers 503, never a fake empty list)', async () => {
  const r = makeArtifactsRead(async () => { throw new Error('connection terminated'); });
  await assert.rejects(r.list({ kind: 'voice', limit: 5, scope: null, now: NOW }), /connection/);
  await assert.rejects(r.counts({ scope: null }), /connection/);
});

test('reader: WHEN a table does not exist yet (42P01) THEN that source reads as no rows', async () => {
  const r = makeArtifactsRead(async () => { const e = new Error('relation "job_artifacts" does not exist'); e.code = '42P01'; throw e; });
  const out = await r.list({ kind: 'voice', limit: 5, scope: null, now: NOW });
  assert.deepEqual(out, { items: [], nextBefore: null });
});

test('reader: one artifact by id joins its job channel; research by id loads sources + claims', async () => {
  const { client, calls } = fakeDb((sql) => {
    if (/FROM job_artifacts/.test(sql)) return [{ ...thumbRow, content_hash: 'f'.repeat(64) }];
    if (/FROM script_sources/.test(sql)) return [{ url: 'https://a.test', title: 'A', snippet: 's' }];
    if (/FROM script_claims/.test(sql)) return [{ claim: 'c', verification: 'verified' }];
    if (/FROM scripts/.test(sql)) return [{ id: UUID, channel_id: 'money-rulebook', title: 'T', text: 'full', created_at: NOW, topic: 'Topic', seed: null }];
    return [];
  });
  const r = makeArtifactsRead(client);
  const a = await r.artifactById('9');
  assert.equal(a.channel, 'money-rulebook');
  assert.equal(a.content_hash, 'f'.repeat(64));
  assert.deepEqual(calls[0].params, ['9']);
  const res = await r.researchById(UUID);
  assert.equal(res.row.topic, 'Topic');
  assert.equal(res.sources.length, 1);
  assert.equal(res.claims.length, 1);
  assert.equal(await makeArtifactsRead(async () => []).scriptById(UUID), null);
});

test('fmtBytes / fmtDuration: unknown stays unknown (null), never a fake 0', () => {
  assert.equal(fmtBytes(48211), '47 KB');
  assert.equal(fmtBytes(3 * 1024 * 1024), '3.0 MB');
  assert.equal(fmtBytes(512), '512 B');
  assert.equal(fmtBytes(null), null);
  assert.equal(fmtBytes(0), null);
  assert.equal(fmtDuration(83.4), '1:23');
  assert.equal(fmtDuration(Infinity), null);
  assert.equal(fmtDuration(NaN), null);
});

test('row cursors: artifacts sort by (µs time, a, zero-padded id); scripts by (µs time, s, uuid)', () => {
  assert.equal(artifactItem({ ...thumbRow, sort_key: '2026-11-22T09:00:00.123456|a|00000000000000000009' }, { now: NOW }).cursor, '2026-11-22T09:00:00.123456|a|00000000000000000009');
  assert.equal(artifactItem(thumbRow, { now: NOW }).cursor, '2026-11-22T09:00:00.000000|a|00000000000000000009', 'fallback when the row has no sort_key');
  assert.equal(scriptItem({ id: UUID, channel_id: 'x', created_at: '2026-11-22T09:00:00Z' }).cursor, `2026-11-22T09:00:00.000000|s|${UUID}`);
});

/* ------------------------- range cap (Vercel 4.5 MB body) ------------------------- */

test('WHEN a range is open-ended or larger than 2 MB THEN capRange shortens it to one 2 MB chunk', () => {
  const big = 9 * 1024 * 1024;
  assert.equal(RANGE_CHUNK, 2 * 1024 * 1024);
  assert.deepEqual(capRange({ start: 0, end: big - 1 }, big), { start: 0, end: RANGE_CHUNK - 1 });
  assert.deepEqual(capRange({ start: 100, end: 200 }, big), { start: 100, end: 200 });
  assert.deepEqual(capRange(null, big), { start: 0, end: RANGE_CHUNK - 1 }, 'no Range on a big file → first chunk');
  assert.equal(capRange(null, 1000), null, 'small file without Range → the whole body (200)');
  assert.ok(DOWNLOAD_MAX < 4.5 * 1024 * 1024);
});

test('bytes cache: a fresh hit skips the store; a failed read is never cached; old entries expire', async () => {
  let t = 0;
  const cache = makeBytesCache({ ttlMs: 1000, maxBytes: 10, now: () => t });
  let loads = 0;
  const ok = async () => { loads++; return { ok: true, bytes: Buffer.from('abc') }; };
  assert.equal((await cache.get('h1', ok)).ok, true);
  await cache.get('h1', ok);
  assert.equal(loads, 1);
  t = 2000;
  await cache.get('h1', ok);
  assert.equal(loads, 2, 'expired → reloaded');
  let fails = 0;
  const bad = async () => { fails++; return { ok: false, error: 'blob_unavailable' }; };
  await cache.get('h2', bad);
  await cache.get('h2', bad);
  assert.equal(fails, 2);
  await cache.get('h3', async () => ({ ok: true, bytes: Buffer.alloc(50) }));
  let again = 0;
  await cache.get('h3', async () => { again++; return { ok: true, bytes: Buffer.alloc(50) }; });
  assert.equal(again, 1, 'bigger than the cache budget → not kept');
});

/* ------------------- the [id] handler (fake user / scope / db) ------------------- */

const SECRET_URL = 'https://store.private.blob.vercel-storage.com/artifacts/x?token=SECRET';
function fakeRead({ artifact = null, script = null, research = null } = {}) {
  return {
    artifactById: async () => artifact,
    scriptById: async () => script,
    researchById: async () => research,
  };
}
const OWNER = { email: 'o@x.test', role: 'owner' };
const CLIENT = { email: 'c@x.test', role: 'client' };
const scopeFor = async (u) => (u.role === 'client' ? ['mine'] : null);
const artRow = (over = {}) => ({ ...thumbRow, channel: 'theirs', content_hash: 'f'.repeat(64), blob_url: SECRET_URL, created_at: new Date(NOW - 3600e3), ...over });
const scriptRow = { id: UUID, channel_id: 'theirs', title: 'T', text: 'full text', status: 'approved', created_at: new Date(NOW), topic: 'Topic', seed: 'Seed' };
const okBytes = async () => ({ ok: true, bytes: Buffer.from('JPEGDATA') });
const noLeak = (out) => {
  const j = JSON.stringify(out.json ?? {}) + JSON.stringify(out.headers ?? {});
  assert.doesNotMatch(j, /blob_url|blob\.vercel|SECRET|token|content_hash/i);
};

test("handler: WHEN a client asks for another channel's a-/s-/r- id THEN 404 (indistinguishable from missing); owner gets 200", async () => {
  const research = { row: scriptRow, sources: [{ url: 'https://src.test', title: 'S', snippet: null }], claims: [] };
  const read = fakeRead({ artifact: artRow(), script: scriptRow, research });
  for (const id of ['a-9', `s-${UUID}`, `r-${UUID}`]) {
    const c = await artifactResponse({ user: CLIENT, id, scopeFor, read, getBytes: okBytes, now: NOW });
    assert.equal(c.status, 404, `client ${id}`);
    noLeak(c);
    const o = await artifactResponse({ user: OWNER, id, scopeFor, read, getBytes: okBytes, now: NOW });
    assert.equal(o.status, 200, `owner ${id}`);
    noLeak(o);
  }
  const mine = await artifactResponse({ user: CLIENT, id: 'a-9', scopeFor, read: fakeRead({ artifact: artRow({ channel: 'mine' }) }), getBytes: okBytes, now: NOW });
  assert.equal(mine.status, 200, 'a client reads their own channel');
});

test('handler: WHEN the scope lookup throws THEN a client sees nothing (fail closed)', async () => {
  const out = await artifactResponse({ user: CLIENT, id: 'a-9', scopeFor: async () => { throw new Error('registry down'); }, read: fakeRead({ artifact: artRow({ channel: 'mine' }) }), getBytes: okBytes, now: NOW });
  assert.equal(out.status, 404);
});

test('handler: no user 401, unknown role 403, bad id 400, no DB 503 — before any read', async () => {
  let touched = 0;
  const read = { artifactById: async () => { touched++; return artRow(); }, scriptById: async () => null, researchById: async () => null };
  assert.equal((await artifactResponse({ user: null, id: 'a-9', scopeFor, read, getBytes: okBytes })).status, 401);
  assert.equal((await artifactResponse({ user: { role: 'viewer' }, id: 'a-9', scopeFor, read, getBytes: okBytes })).status, 403);
  assert.equal((await artifactResponse({ user: OWNER, id: 'a-0x', scopeFor, read, getBytes: okBytes })).status, 400);
  assert.equal((await artifactResponse({ user: OWNER, id: 'a-9', scopeFor, read: null, getBytes: okBytes })).status, 503);
  assert.equal(touched, 0);
});

test('handler: expired / never-saved rows answer 410 with a reason and never touch the store', async () => {
  let reads = 0;
  const getBytes = async () => { reads++; return { ok: true, bytes: Buffer.from('x') }; };
  const old = await artifactResponse({ user: OWNER, id: 'a-9', scopeFor, read: fakeRead({ artifact: artRow({ created_at: '2026-09-01T00:00:00Z' }) }), getBytes, now: NOW });
  assert.deepEqual([old.status, old.json], [410, { ok: false, reason: 'expired' }]);
  const never = await artifactResponse({ user: OWNER, id: 'a-9', scopeFor, read: fakeRead({ artifact: artRow({ stored: false, blob_url: null }) }), getBytes, now: NOW });
  assert.deepEqual([never.status, never.json], [410, { ok: false, reason: 'not_stored' }]);
  assert.equal(reads, 0);
  const pruned = await artifactResponse({ user: OWNER, id: 'a-9', scopeFor, read: fakeRead({ artifact: artRow() }), getBytes: async () => ({ ok: false, error: 'Vercel Blob: The requested blob does not exist' }), now: NOW });
  assert.deepEqual([pruned.status, pruned.json], [410, { ok: false, reason: 'expired' }]);
});

test('handler: bytes carry type, nosniff, sandbox CSP; download is an attachment; big audio answers 206 chunks', async () => {
  const thumb = await artifactResponse({ user: OWNER, id: 'a-9', scopeFor, read: fakeRead({ artifact: artRow() }), getBytes: okBytes, download: true, now: NOW });
  assert.equal(thumb.status, 200);
  assert.equal(thumb.headers['Content-Type'], 'image/jpeg');
  assert.equal(thumb.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(thumb.headers['Content-Security-Policy'], "default-src 'none'; sandbox");
  assert.match(thumb.headers['Content-Disposition'], /^attachment; filename="theirs-thumbnail-a-9\.jpg"$/);
  const size = 5 * 1024 * 1024;
  const bigRead = fakeRead({ artifact: artRow({ kind: 'tts_audio', meta: { file: 'narr-01.mp3' } }) });
  const bigBytes = async () => ({ ok: true, bytes: Buffer.alloc(size) });
  const first = await artifactResponse({ user: OWNER, id: 'a-9', scopeFor, read: bigRead, getBytes: bigBytes, rangeHeader: 'bytes=0-', now: NOW });
  assert.equal(first.status, 206);
  assert.equal(first.bytes.length, RANGE_CHUNK);
  assert.equal(first.headers['Content-Range'], `bytes 0-${RANGE_CHUNK - 1}/${size}`);
  const plain = await artifactResponse({ user: OWNER, id: 'a-9', scopeFor, read: bigRead, getBytes: bigBytes, now: NOW });
  assert.equal(plain.status, 206, 'no Range on a big file → first chunk, never a body over the platform cap');
  const dl = await artifactResponse({ user: OWNER, id: 'a-9', scopeFor, read: bigRead, getBytes: bigBytes, download: true, now: NOW });
  assert.deepEqual([dl.status, dl.json], [413, { ok: false, reason: 'too_large' }]);
  const bad = await artifactResponse({ user: OWNER, id: 'a-9', scopeFor, read: bigRead, getBytes: bigBytes, rangeHeader: `bytes=${size}-`, now: NOW });
  assert.equal(bad.status, 416);
});

test('handler: scripts and research answer JSON (text / sources) with no storage fields', async () => {
  const s = await artifactResponse({ user: OWNER, id: `s-${UUID}`, scopeFor, read: fakeRead({ script: scriptRow }), getBytes: okBytes, now: NOW });
  assert.equal(s.json.text, 'full text');
  const r = await artifactResponse({ user: OWNER, id: `r-${UUID}`, scopeFor, read: fakeRead({ research: { row: scriptRow, sources: [{ url: 'javascript:x', title: 'Bad' }], claims: [{ claim: 'c', verification: 'verified' }] } }), getBytes: okBytes, now: NOW });
  assert.equal(r.json.item.topic, 'Topic');
  assert.equal(r.json.sources[0].url, null, 'unsafe link dropped');
  assert.equal(r.json.item.sourceCount, 1);
  noLeak(s);
  noLeak(r);
});
