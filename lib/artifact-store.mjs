// #106 Phase 4 T1 — artifact store: content-addressed bytes on Vercel Blob.
//
// Holds ONLY the byte classes resume and approval depend on (OQ-2 as scoped
// by review): script JSON payloads, TTS audio, review-gated renders,
// thumbnail candidates. Full renders stay GitHub-Release-finals + ephemeral
// workspace — Vercel Blob Hobby's ~1 GB total cap is a hard stop (D3).
//
// Pure core — dependencies injected (lib/ffmpeg.mjs style): put/get/delete
// are plain async functions; tests inject fakes and never touch the network
// or @vercel/blob. The REAL impls are built lazily over @vercel/blob's put/
// get/del so the module's absence (or a missing BLOB_READ_WRITE_TOKEN)
// cannot break import — the store just runs DEGRADED.
//
// Fail-open contract (D3): a Blob write failure returns
//   { ok: true, hash, blob_url: null, degraded: true }
// plus one memoized warn — the index entry stays valid, the render is never
// blocked, and resume treats an index-only entry as re-run. This module
// NEVER throws.
//
// Content addressing: bytes are shelved at pathname `artifacts/<sha256>`
// (addRandomSuffix: false), so the same bytes always land on the same shelf
// and a re-put overwrites in place. getBytes re-hashes whatever comes back
// and refuses a mismatch (review row 5: "retrievable" means byte-verified,
// never an index entry alone).
//
// Retention (D25 / AC-P4-33): non-review bytes pruned after 30 days,
// resolved-intent bytes after 7 days; expiredEntries + deleteExpired are the
// nightly maintenance pass's tools. The days are config constants — the
// owner shortens TTS retention if 30-channel volume nears the cap.

import { createHash } from 'node:crypto';

// Retention days per byte class (D25). `resolved_intent` is the class S2's
// resolved upload-intent bytes land in; unknown kinds take the 30d default
// so growth is bounded no matter what lands here later.
export const RETENTION_DAYS = {
  script_payload: 30,
  tts_audio: 30,
  review_render: 30,
  thumb_candidate: 30,
  resolved_intent: 7,
};
const DEFAULT_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const SHA256_RE = /^[0-9a-f]{64}$/;

export function retentionDaysFor(kind) {
  const days = RETENTION_DAYS[kind];
  return Number.isFinite(days) ? days : DEFAULT_RETENTION_DAYS;
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

function redact(e) {
  return String(e && e.message ? e.message : e).slice(0, 200);
}

function toSha256(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return createHash('sha256').update(buf).digest('hex');
}

function toBuffer(bytes) {
  if (Buffer.isBuffer(bytes)) return bytes;
  if (bytes instanceof ArrayBuffer) return Buffer.from(bytes);
  if (ArrayBuffer.isView(bytes)) return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Buffer.from(String(bytes), 'utf8');
}

function toMs(created) {
  if (created instanceof Date) return Number.isNaN(created.getTime()) ? null : created.getTime();
  if (typeof created === 'number' && Number.isFinite(created)) return created;
  if (isNonEmptyString(created)) {
    const t = Date.parse(created);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

/**
 * Pure retention math (unit-tested directly). Returns { keep, expired } —
 * an entry expires when now >= created_at + retentionDaysFor(kind). An
 * entry with an undatable created_at is KEPT: never delete what you cannot
 * date. Accepts Date | ISO string | epoch ms.
 */
export function expiredEntries(entries, now) {
  const list = Array.isArray(entries) ? entries : [];
  const t = now instanceof Date ? now.getTime() : (typeof now === 'number' ? now : Date.parse(now));
  const keep = [];
  const expired = [];
  for (const entry of list) {
    const created = toMs(entry?.created_at);
    if (created === null) { keep.push(entry); continue; }
    const cutoff = created + retentionDaysFor(entry?.kind) * DAY_MS;
    (t >= cutoff ? expired : keep).push(entry);
  }
  return { keep, expired };
}

// ---------------------------------------------------------------------------
// Lazy @vercel/blob resolution — the ONLY place the module is imported.
// ---------------------------------------------------------------------------

let blobModulePromise = null;
async function getBlobModule(env) {
  if (!isNonEmptyString(env.BLOB_READ_WRITE_TOKEN)) return null;
  if (!blobModulePromise) {
    blobModulePromise = import('@vercel/blob').catch(() => null);
  }
  return blobModulePromise; // the module, or null when not installed
}

export function makeArtifactStore(deps = {}) {
  const warn = typeof deps.warn === 'function' ? deps.warn : console.warn;
  const env = deps.env || process.env;
  const putImpl = deps.putImpl;
  const getImpl = deps.getImpl;
  const deleteImpl = deps.deleteImpl;
  for (const [name, fn] of [['putImpl', putImpl], ['getImpl', getImpl], ['deleteImpl', deleteImpl]]) {
    if (fn !== undefined && typeof fn !== 'function') {
      throw new TypeError(`makeArtifactStore: deps.${name} must be a function when provided`);
    }
  }

  let degradedReason = null; // memoized once a default-impl build fails
  let warnedDegraded = false;
  const warnOnce = (msg) => {
    if (warnedDegraded) return;
    warnedDegraded = true;
    warn(msg);
  };

  async function resolvePut() {
    if (putImpl) return putImpl;
    if (degradedReason) return null;
    const mod = await getBlobModule(env);
    if (!mod) {
      degradedReason = 'no_token_or_module';
      warnOnce('[artifact-store] Blob unavailable (no BLOB_READ_WRITE_TOKEN / @vercel/blob not installed) — artifacts degrade to index-only, pipeline continues');
      return null;
    }
    return (pathname, bytes, opts = {}) => mod.put(pathname, bytes, opts);
  }

  async function resolveGet() {
    if (getImpl) return getImpl;
    if (degradedReason) return null;
    const mod = await getBlobModule(env);
    if (!mod) return null;
    return async (pathOrUrl) => {
      const res = await mod.get(pathOrUrl);
      return Buffer.from(await res.arrayBuffer());
    };
  }

  async function resolveDelete() {
    if (deleteImpl) return deleteImpl;
    if (degradedReason) return null;
    const mod = await getBlobModule(env);
    if (!mod) return null;
    return (url) => mod.del([url]);
  }

  /**
   * Shelf bytes under their own fingerprint. Returns
   * { ok:true, hash, pathname, blob_url, degraded } — blob_url null +
   * degraded:true when Blob failed (fail-open, D3). Never throws.
   */
  async function putBytes(kind, bytes, meta) {
    try {
      if (!isNonEmptyString(kind)) return { ok: false, error: 'kind_required' };
      if (bytes === undefined || bytes === null) return { ok: false, error: 'bytes_required' };
      const buf = toBuffer(bytes);
      const hash = createHash('sha256').update(buf).digest('hex');
      const pathname = `artifacts/${hash}`;
      const put = await resolvePut();
      if (!put) {
        return { ok: true, hash, pathname, blob_url: null, degraded: true, error: degradedReason };
      }
      const res = await put(pathname, buf, {
        access: 'public',
        addRandomSuffix: false,
        contentType: meta?.contentType ?? 'application/octet-stream',
      });
      return { ok: true, hash, pathname, blob_url: res?.url ?? null, degraded: false };
    } catch (e) {
      const error = redact(e);
      warn(`[artifact-store] blob put failed — index-only entry, pipeline continues (${error})`);
      const hash = (() => { try { return toSha256(bytes); } catch { return null; } })();
      return { ok: true, hash, pathname: hash ? `artifacts/${hash}` : null, blob_url: null, degraded: true, error };
    }
  }

  /**
   * Fetch bytes and VERIFY them. Accepts a blob URL, a bare sha256 hex hash
   * (-> canonical artifacts/<hash> pathname), or a pathname. Returns
   * { ok:true, bytes, hash, verified } where verified is true (re-hashed
   * bytes match), null (no hash known for a URL without expectedHash), or
   * the lookup fails { ok:false, error } — never throws, because a failed
   * fetch must read as "bytes not retrievable -> resume re-runs the step"
   * (D4), not as a crash.
   */
  async function getBytes(hashOrUrl, { expectedHash } = {}) {
    try {
      let loc = null;
      let verifyAgainst = null;
      if (/^https?:\/\//i.test(hashOrUrl)) {
        loc = hashOrUrl;
      } else if (isNonEmptyString(hashOrUrl) && hashOrUrl.startsWith('artifacts/')) {
        loc = hashOrUrl;
      } else if (isNonEmptyString(hashOrUrl) && SHA256_RE.test(hashOrUrl)) {
        loc = `artifacts/${hashOrUrl}`;
        verifyAgainst = hashOrUrl;
      } else {
        return { ok: false, error: 'invalid_hash_or_url' };
      }
      if (isNonEmptyString(expectedHash)) verifyAgainst = expectedHash;

      const get = await resolveGet();
      if (!get) return { ok: false, error: 'blob_unavailable' };
      const buf = toBuffer(await get(loc));
      const hash = createHash('sha256').update(buf).digest('hex');
      if (verifyAgainst) {
        if (hash !== verifyAgainst) {
          return { ok: false, error: 'hash_mismatch', hash, pathname: loc };
        }
        return { ok: true, bytes: buf, hash, verified: true, pathname: loc };
      }
      return { ok: true, bytes: buf, hash, verified: null, pathname: loc };
    } catch (e) {
      return { ok: false, error: redact(e) };
    }
  }

  /**
   * Nightly maintenance (AC-P4-33): delete the Blob bytes of every expired
   * entry. Entries come from the caller's join of the artifact index (kind +
   * created_at + blob_url). Never throws; a failing delete counts as failed
   * and the pass continues.
   */
  async function deleteExpired(entries, { now } = {}) {
    const t = now ?? Date.now();
    const { expired } = expiredEntries(entries, t);
    const targets = expired.filter((e) => isNonEmptyString(e?.blob_url));
    if (targets.length === 0) return { ok: true, deleted: 0, failed: 0, skipped: 0 };
    const del = await resolveDelete();
    if (!del) return { ok: true, deleted: 0, failed: 0, skipped: targets.length, reason: degradedReason ?? 'no_delete_impl' };
    let deleted = 0;
    let failed = 0;
    for (const entry of targets) {
      try {
        await del(entry.blob_url);
        deleted++;
      } catch {
        failed++;
      }
    }
    return { ok: true, deleted, failed, skipped: 0 };
  }

  return {
    putBytes,
    getBytes,
    deleteExpired,
  };
}

export default makeArtifactStore;
