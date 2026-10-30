// #106 Phase 4 T1 — artifact store (content-addressed byte store) tests.
//
// Spec: docs/superpowers/specs/2026-10-30-phase4-review-queue-analytics-spec.md
// S1 (D3 fail-open Blob, D25 retention) + "Resolved by review" row 5 (byte
// verification is the resume skip condition). Dependency-injection style
// (mirror of lib/ffmpeg.mjs "pure core — dependencies injected"): put/get/
// delete are injected fakes, so tests never touch @vercel/blob, the network,
// or BLOB_READ_WRITE_TOKEN.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  makeArtifactStore,
  expiredEntries,
  retentionDaysFor,
  RETENTION_DAYS,
} from '../lib/artifact-store.mjs';

const HELLO_SHA = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'; // sha256('hello')
const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-30T00:00:00Z');

function makeStore(deps = {}) {
  const warns = [];
  const store = makeArtifactStore({ warn: (m) => warns.push(m), ...deps });
  return { store, warns };
}

// Stub blob put: records calls, returns a deterministic fake URL.
function stubPut() {
  const calls = [];
  const putImpl = async (pathname, bytes, opts = {}) => {
    calls.push({ pathname, bytes, opts });
    return { url: `https://fake-store.public.blob.vercel-storage.com${pathname}` };
  };
  return { calls, putImpl };
}

// ===========================================================================
// Content addressing (AC-P4-2 — the hash IS the fingerprint of the bytes)
// ===========================================================================

describe('#106 T1 artifact store — content addressing (AC-P4-2)', () => {
  test('putBytes fingerprints FILE BYTES: sha256 of the raw bytes (D1 line: never the Phase-3 text hash)', async () => {
    const { calls, putImpl } = stubPut();
    const { store } = makeStore({ putImpl });
    const out = await store.putBytes('script_payload', 'hello');
    assert.equal(out.ok, true);
    assert.equal(out.degraded, false);
    assert.equal(out.hash, HELLO_SHA, 'independent known vector');
    assert.equal(calls[0].pathname, `artifacts/${HELLO_SHA}`, 'content-addressed pathname');
    assert.equal(calls[0].opts.addRandomSuffix, false, 'deterministic pathname — re-put of same bytes overwrites in place');
    assert.equal(out.blob_url, calls[0] && `https://fake-store.public.blob.vercel-storage.com${calls[0].pathname}`);
  });

  test('the same bytes put twice yield the SAME hash and the SAME pathname (no duplicate content)', async () => {
    const { calls, putImpl } = stubPut();
    const { store } = makeStore({ putImpl });
    const a = await store.putBytes('tts_audio', Buffer.from([9, 9, 9]));
    const b = await store.putBytes('tts_audio', Buffer.from([9, 9, 9]));
    assert.equal(a.hash, b.hash);
    assert.equal(a.pathname, b.pathname);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].pathname, calls[1].pathname, 'same content -> same shelf');
  });

  test('kind is accepted for the retention/index layer and meta rides along without touching the hash', async () => {
    const { putImpl } = stubPut();
    const { store } = makeStore({ putImpl });
    const a = await store.putBytes('thumb_candidate', 'hello', { variant: 1 });
    const b = await store.putBytes('tts_audio', 'hello');
    assert.equal(a.hash, b.hash, 'same bytes -> same hash regardless of kind/meta');
    assert.equal(a.hash, HELLO_SHA);
  });

  test('putBytes rejects empty kind and null bytes — ok:false, no throw', async () => {
    const { store } = makeStore({ putImpl: async () => ({ url: 'x' }) });
    assert.equal((await store.putBytes('', 'x')).ok, false);
    assert.equal((await store.putBytes('tts_audio', null)).ok, false);
    assert.equal((await store.putBytes('tts_audio', undefined)).ok, false);
  });
});

// ===========================================================================
// Fail-open blob (D3 — a storage failure never blocks a render / never throws)
// ===========================================================================

describe('#106 T1 artifact store — fail-open blob (D3, AC-P4-5 posture)', () => {
  test('blob put failure -> ok:true with blob_url null + degraded:true + one warn; NEVER throws', async () => {
    const { store, warns } = makeStore({
      putImpl: async () => { throw new Error('BlobAccessError: no token'); },
    });
    const out = await store.putBytes('review_render', 'bytes');
    assert.equal(out.ok, true, 'fail-open: the INDEX entry is still valid');
    assert.equal(out.hash, createHash('sha256').update('bytes').digest('hex'));
    assert.equal(out.blob_url, null, 'index-only entry');
    assert.equal(out.degraded, true);
    assert.equal(warns.length, 1);
    assert.match(warns[0], /artifact-store/);
  });

  test('put warn memoization is PER ERROR CLASS: a different failure class warns again (round-1 minor 4+7)', async () => {
    const warns = [];
    let mode = 'access';
    const { store } = makeStore({
      warn: (m) => warns.push(m),
      putImpl: async () => {
        throw mode === 'access'
          ? new Error('BlobAccessError: no token')
          : new Error('fetch failed: ETIMEDOUT');
      },
    });
    await store.putBytes('tts_audio', 'one');
    await store.putBytes('tts_audio', 'two');
    assert.equal(warns.length, 1, 'same class -> silent');
    mode = 'network';
    await store.putBytes('tts_audio', 'three');
    assert.equal(warns.length, 2, 'a different failure class warns again');
    await store.putBytes('tts_audio', 'four');
    assert.equal(warns.length, 2, 'and is then memoized itself');
  });

  test('no BLOB_READ_WRITE_TOKEN (and no injected impl) -> degraded mode, warn memoized across calls', async () => {
    const { store, warns } = makeStore({ env: {} });
    const a = await store.putBytes('tts_audio', 'one');
    const b = await store.putBytes('tts_audio', 'two');
    assert.equal(a.ok, true);
    assert.equal(a.degraded, true);
    assert.equal(a.blob_url, null);
    assert.equal(b.degraded, true);
    assert.equal(warns.length, 1, 'one warn per process, not per artifact');
  });

  test('getBytes in degraded mode -> ok:false blob_unavailable (resume re-runs the step, never crashes)', async () => {
    const { store } = makeStore({ env: {} });
    const out = await store.getBytes(HELLO_SHA);
    assert.equal(out.ok, false);
    assert.equal(out.error, 'blob_unavailable');
  });
});

// ===========================================================================
// Byte verification (review row 5 — the resume skip condition's second half)
// ===========================================================================

describe('#106 T1 artifact store — byte verification (review M1/H2)', () => {
  test('getBytes by hash verifies the retrieved bytes re-hash to the requested hash', async () => {
    const getImpl = async (loc) => Buffer.from('hello');
    const { store } = makeStore({ getImpl });
    const out = await store.getBytes(HELLO_SHA);
    assert.equal(out.ok, true);
    assert.equal(out.verified, true);
    assert.equal(out.hash, HELLO_SHA);
    assert.equal(out.bytes.toString('utf8'), 'hello');
    assert.equal(out.pathname, `artifacts/${HELLO_SHA}`);
  });

  test('TAMPERED bytes -> ok:false hash_mismatch (an index entry with wrong bytes must never satisfy resume)', async () => {
    const getImpl = async () => Buffer.from('tampered');
    const { store } = makeStore({ getImpl });
    const out = await store.getBytes(HELLO_SHA);
    assert.equal(out.ok, false);
    assert.equal(out.error, 'hash_mismatch');
    assert.equal(out.hash, createHash('sha256').update('tampered').digest('hex'));
  });

  test('getBytes by URL passes the URL through; expectedHash opts into verification', async () => {
    const calls = [];
    const getImpl = async (loc) => { calls.push(loc); return Buffer.from('hello'); };
    const { store } = makeStore({ getImpl });
    const url = `https://fake-store.public.blob.vercel-storage.com/artifacts/${HELLO_SHA}`;
    const plain = await store.getBytes(url);
    assert.equal(plain.ok, true);
    assert.equal(plain.verified, null, 'no hash to check against');
    assert.equal(calls[0], url, 'URL used verbatim');
    const checked = await store.getBytes(url, { expectedHash: HELLO_SHA });
    assert.equal(checked.verified, true);
    const wrong = await store.getBytes(url, { expectedHash: 'f'.repeat(64) });
    assert.equal(wrong.ok, false);
    assert.equal(wrong.error, 'hash_mismatch');
  });

  test('blob get failure -> ok:false with redacted error, NEVER throws (resume falls back to re-run)', async () => {
    const { store } = makeStore({
      getImpl: async () => { throw new Error('404: https://secret-host/...'); },
    });
    const out = await store.getBytes(HELLO_SHA);
    assert.equal(out.ok, false);
    assert.ok(out.error.length <= 200);
  });

  test('garbage input -> ok:false invalid_hash_or_url', async () => {
    const { store } = makeStore({ getImpl: async () => Buffer.from('x') });
    assert.equal((await store.getBytes('not-a-hash')).ok, false);
    assert.equal((await store.getBytes('')).ok, false);
  });
});

// ===========================================================================
// Retention (D25 / AC-P4-33 math: non-review 30d, resolved-intent 7d)
// ===========================================================================

describe('#106 T1 artifact store — retention windows (D25, AC-P4-33)', () => {
  test('retention map: review-carrying kinds 30d, resolved-intent bytes 7d, unknown kinds default 30d', () => {
    assert.equal(retentionDaysFor('script_payload'), 30);
    assert.equal(retentionDaysFor('tts_audio'), 30);
    assert.equal(retentionDaysFor('review_render'), 30);
    assert.equal(retentionDaysFor('thumb_candidate'), 30);
    assert.equal(retentionDaysFor('resolved_intent'), 7);
    assert.equal(retentionDaysFor('something_new'), 30, 'unknown kinds are bounded too (default 30)');
    assert.equal(RETENTION_DAYS.resolved_intent, 7);
  });

  test('expiredEntries boundary math: exactly at the window edge expires; 1ms inside survives', () => {
    const entries = [
      { kind: 'tts_audio', created_at: new Date(NOW - 30 * DAY_MS) },          // exactly 30d -> expired
      { kind: 'tts_audio', created_at: new Date(NOW - 30 * DAY_MS + 1) },      // 1ms inside -> kept
      { kind: 'resolved_intent', created_at: new Date(NOW - 7 * DAY_MS) },     // exactly 7d -> expired
      { kind: 'resolved_intent', created_at: new Date(NOW - 6 * DAY_MS) },     // inside -> kept
      { kind: 'review_render', created_at: new Date(NOW - 100 * DAY_MS) },     // long past -> expired
    ];
    const { expired, keep } = expiredEntries(entries, NOW);
    assert.deepEqual(expired.map((e) => e.created_at.getTime()).sort(), [
      NOW - 100 * DAY_MS, NOW - 30 * DAY_MS, NOW - 7 * DAY_MS,
    ].sort());
    assert.equal(keep.length, 2, 'the 1ms-inside and 6d entries survive');
  });

  test('ISO-string and epoch created_at forms are accepted; undatable entries are KEPT (never delete what you cannot date)', () => {
    const entries = [
      { kind: 'tts_audio', created_at: new Date(NOW - 40 * DAY_MS).toISOString() },
      { kind: 'tts_audio', created_at: NOW - 40 * DAY_MS },
      { kind: 'tts_audio', created_at: 'not-a-date' },
    ];
    const { expired, keep } = expiredEntries(entries, NOW);
    assert.equal(expired.length, 2);
    assert.equal(keep.length, 1, 'undatable -> kept');
  });

  test('deleteExpired deletes ONLY expired entries through the injected deleteImpl', async () => {
    const deleted = [];
    const { store } = makeStore({
      deleteImpl: async (loc) => { deleted.push(loc); },
    });
    const entries = [
      { kind: 'tts_audio', created_at: new Date(NOW - 31 * DAY_MS), blob_url: 'https://blob/old' },
      { kind: 'tts_audio', created_at: new Date(NOW - 1 * DAY_MS), blob_url: 'https://blob/new' },
      { kind: 'resolved_intent', created_at: new Date(NOW - 8 * DAY_MS), blob_url: 'https://blob/resolved' },
      { kind: 'review_render', created_at: new Date(NOW - 2 * DAY_MS), blob_url: null }, // expired window? no — 2d < 30d
    ];
    const out = await store.deleteExpired(entries, { now: NOW });
    assert.equal(out.ok, true);
    assert.equal(out.deleted, 2);
    assert.deepEqual(deleted.sort(), ['https://blob/old', 'https://blob/resolved']);
  });

  test('deleteExpired failure posture: a throwing deleteImpl counts failed, never throws', async () => {
    const { store } = makeStore({
      deleteImpl: async (loc) => { if (loc.includes('bad')) throw new Error('delete 404'); },
    });
    const entries = [
      { kind: 'tts_audio', created_at: new Date(NOW - 31 * DAY_MS), blob_url: 'https://blob/bad' },
      { kind: 'tts_audio', created_at: new Date(NOW - 32 * DAY_MS), blob_url: 'https://blob/good' },
    ];
    const out = await store.deleteExpired(entries, { now: NOW });
    assert.equal(out.ok, true);
    assert.equal(out.deleted, 1);
    assert.equal(out.failed, 1);
  });

  test('deleteExpired without a deleteImpl skips instead of deleting (nightly pass wires the real one later)', async () => {
    const { store } = makeStore({ env: {} });
    const out = await store.deleteExpired(
      [{ kind: 'tts_audio', created_at: new Date(NOW - 31 * DAY_MS), blob_url: 'https://blob/x' }],
      { now: NOW },
    );
    assert.equal(out.ok, true);
    assert.equal(out.deleted, 0);
    assert.equal(out.skipped, 1);
  });

  test('deletion is BY-ENTRY: the isLive hook keeps live-referenced entries (shared-hash bytes survive for longer-lived kinds)', async () => {
    const deleted = [];
    const { store } = makeStore({
      deleteImpl: async (loc) => { deleted.push(loc); },
    });
    const old = { kind: 'tts_audio', created_at: new Date(NOW - 40 * DAY_MS), blob_url: 'https://blob/shared' };
    // Live reference (e.g. a longer-lived kind shares this content-addressed hash) -> kept.
    const kept = await store.deleteExpired([old], { now: NOW, isLive: async () => true });
    assert.equal(kept.ok, true);
    assert.equal(kept.deleted, 0);
    assert.equal(kept.keptLive, 1);
    assert.deepEqual(deleted, [], 'nothing deleted while a live reference exists');
    // Dead reference -> deleted.
    const gone = await store.deleteExpired([old], { now: NOW, isLive: async () => false });
    assert.equal(gone.deleted, 1);
    assert.equal(gone.keptLive, 0);
    assert.deepEqual(deleted, ['https://blob/shared']);
    // Hook failure -> kept (deletion is destructive; doubt always keeps).
    const doubtful = await store.deleteExpired([old], {
      now: NOW,
      isLive: async () => { throw new Error('reference check unavailable'); },
    });
    assert.equal(doubtful.deleted, 0);
    assert.equal(doubtful.keptLive, 1, 'a failing hook means KEEP');
  });
});
