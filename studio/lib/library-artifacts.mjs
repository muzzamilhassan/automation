// Creator City Phase 2 item 5 (2026-11-23) — Library "everything made".
// The pure core behind /api/library/artifacts and the non-video Library tabs
// (Scripts · Voice · Thumbnails · Research). Relative imports only so
// `node --test` can load it directly.
//
// Where each tab's rows really live (nothing here is sample data):
//   Scripts    — Neon `scripts` (review-gated scripts: title + text) AND
//                `job_artifacts` kind script_payload (the Shorts lane's run
//                record: the day's uploaded entries, bytes on Vercel Blob)
//   Voice      — `job_artifacts` kind tts_audio (doc-lane narration files)
//   Thumbnails — `job_artifacts` kind thumb_candidate (rendered options)
//   Research   — `scripts` rows that carry a topic/seed in
//                full_render_input, or rows in `script_sources`
// Artifact rows join `jobs` for the channel. A job with exactly ONE script
// lends that script's title/id to its artifacts; with several (a Shorts run
// makes one per slot) we cannot tell which — the artifact keeps its own
// plain title rather than guess.
//
// Honesty: artifact BYTES are pruned after their retention (artifact-store
// RETENTION_DAYS, 30 days) but the index row stays — such items are listed
// with gone:'expired' so the page says "No longer stored", never a broken
// picture. A row whose upload degraded (blob_url NULL) is gone:'not_stored'.
// Blob URLs never leave the server: items carry `stored`, not the URL.
//
// Reader contract (jobs-read.mjs house pattern): dbClient(sqlText, params)
// -> rows; $n placeholders only; a DB failure THROWS (route → 503); a table
// that does not exist yet (42P01) reads as no rows.
import { retentionDaysFor } from './artifact-store.mjs';

export const LIBRARY_TABS = ['videos', 'scripts', 'voice', 'thumbnails', 'research'];
/** Library tab id → artifact item kind. */
export const ARTIFACT_TABS = Object.freeze({ scripts: 'script', voice: 'voice', thumbnails: 'thumbnail', research: 'research' });
export const ITEM_KINDS = ['script', 'voice', 'thumbnail', 'research'];
export const PAGE_MAX = 60;
export const PAGE_DEFAULT = 30;

// job_artifacts.kind → Library item kind (review_render is a video render,
// not a Library artifact tab — ignored)
const KIND_OF_ARTIFACT = { script_payload: 'script', tts_audio: 'voice', thumb_candidate: 'thumbnail' };
const ARTIFACT_KIND_FOR = { voice: 'tts_audio', thumbnail: 'thumb_candidate' };
const DAY_MS = 24 * 60 * 60 * 1000;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BIGINT_RE = /^[1-9]\d{0,17}$/;

/* ------------------------------- tabs + queries ------------------------------ */

export function libraryTab(sp) {
  const v = sp && typeof sp.get === 'function' ? sp.get('tab') : null;
  return LIBRARY_TABS.includes(v) ? v : 'videos';
}

function clampPage(raw) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return PAGE_DEFAULT;
  return Math.min(n, PAGE_MAX);
}

/**
 * ?kind=&channel=&limit=&before= → { kind, channel, limit, before } or
 * { error }. No kind = counts only (kind null).
 */
export function parseArtifactQuery(sp) {
  const get = (k) => (sp && typeof sp.get === 'function' ? sp.get(k) : null) || '';
  const kindRaw = get('kind');
  if (kindRaw && !ITEM_KINDS.includes(kindRaw)) return { error: 'kind must be one of script, voice, thumbnail, research' };
  const channelRaw = get('channel');
  let channel = null;
  if (channelRaw && channelRaw !== 'all') {
    if (!SLUG_RE.test(channelRaw)) return { error: 'channel is not a valid channel id' };
    channel = channelRaw;
  }
  const beforeRaw = get('before');
  if (beforeRaw && !CURSOR_RE.test(beforeRaw)) return { error: 'before must be a cursor from nextBefore' };
  return { kind: kindRaw || null, channel, limit: clampPage(get('limit')), before: beforeRaw || null };
}

// Two-part page cursor (review fix 6): `<UTC time to the µs>|<a|s>|<id>` —
// a = job_artifacts (id zero-padded to 20 digits), s = scripts (uuid). The
// SQL side builds the SAME string (to_char … COLLATE "C") so JS and Postgres
// agree on one strict byte order: no two rows tie, none is ever skipped.
const CURSOR_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}\|(?:a\|\d{20}|s\|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

function cursorOf(row, tag) {
  if (typeof row.sort_key === 'string' && CURSOR_RE.test(row.sort_key)) return row.sort_key;
  const at = (iso(row.created_at) || '1970-01-01T00:00:00.000Z').slice(0, 23); // µs precision lost → pad
  const key = tag === 'a' ? String(row.id).padStart(20, '0') : String(row.id).toLowerCase();
  return `${at}000|${tag}|${key}`;
}

/** `a-<bigint>` (job_artifacts row) | `s-<uuid>` (script) | `r-<uuid>` (research). */
export function parseArtifactId(raw) {
  if (typeof raw !== 'string') return null;
  const m = raw.match(/^([asr])-(.+)$/);
  if (!m) return null;
  if (m[1] === 'a') return BIGINT_RE.test(m[2]) ? { source: 'artifact', key: m[2] } : null;
  if (!UUID_RE.test(m[2])) return null;
  return { source: m[1] === 's' ? 'script' : 'research', key: m[2].toLowerCase() };
}

/* ----------------------------------- items ---------------------------------- */

function iso(v) {
  if (v == null) return null;
  const t = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function num(v) {
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) ? n : null;
}

function str(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function metaOf(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw);
      return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    } catch {
      return {};
    }
  }
  return {};
}

export function mimeOf(artifactKind, meta) {
  if (artifactKind === 'thumb_candidate') return 'image/jpeg';
  if (artifactKind === 'script_payload') return 'application/json';
  if (artifactKind === 'tts_audio') {
    const file = String(metaOf(meta).file || '').toLowerCase();
    return file.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg';
  }
  return 'application/octet-stream';
}

/** Why an artifact's bytes can't be served, from its index row alone. */
export function goneReason(row, now = Date.now()) {
  if (!row?.stored) return 'not_stored';
  const t = Date.parse(iso(row.created_at) || '');
  if (Number.isFinite(t) && now >= t + retentionDaysFor(row.kind) * DAY_MS) return 'expired';
  return null;
}

function artifactTitle(kind, meta, scriptTitle) {
  if (scriptTitle && kind !== 'script_payload') return scriptTitle;
  if (kind === 'thumb_candidate') return Number.isFinite(Number(meta.idx)) ? `Thumbnail option ${Number(meta.idx)}` : 'Thumbnail option';
  if (kind === 'tts_audio') {
    const part = String(meta.file || '').match(/(\d+)/);
    return part ? `Narration part ${Number(part[1])}` : 'Narration';
  }
  if (kind === 'script_payload') {
    const n = Number(meta.entries);
    return Number.isFinite(n) && n > 0 ? `${n} Shorts script${n === 1 ? '' : 's'}` : 'Shorts scripts';
  }
  return 'Artifact';
}

export function artifactItem(row, { now = Date.now() } = {}) {
  const meta = metaOf(row.meta);
  const kind = KIND_OF_ARTIFACT[row.kind] || null;
  const idx = Number(meta.idx);
  return {
    id: `a-${row.id}`,
    cursor: cursorOf(row, 'a'),
    kind,
    source: 'run',
    channel: row.channel || null,
    title: artifactTitle(row.kind, meta, str(row.script_title)),
    createdAt: iso(row.created_at),
    jobId: row.job_id ? String(row.job_id) : null,
    bytes: num(row.bytes),
    mime: mimeOf(row.kind, meta),
    previewText: null,
    scriptId: row.script_id ? String(row.script_id) : null,
    videoId: str(row.script_video_id),
    stored: !!row.stored,
    gone: goneReason({ kind: row.kind, created_at: row.created_at, stored: !!row.stored }, now),
    ...(Number.isFinite(idx) && meta.idx != null ? { option: idx } : {}),
    ...(typeof meta.file === 'string' ? { file: meta.file } : {}),
    ...(kind === 'script' && Number.isFinite(Number(meta.entries)) ? { entries: Number(meta.entries) } : {}),
  };
}

/** The first `lines` non-empty lines (scripts are paragraphs split by blank lines). */
export function firstLines(text, lines = 3) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, lines)
    .join('\n') || null;
}

export function scriptItem(row) {
  return {
    id: `s-${row.id}`,
    cursor: cursorOf(row, 's'),
    kind: 'script',
    source: 'review',
    channel: row.channel_id || null,
    title: str(row.title) || 'Untitled script',
    createdAt: iso(row.created_at),
    jobId: row.job_id ? String(row.job_id) : null,
    bytes: null,
    mime: 'text/plain',
    previewText: firstLines(row.preview ?? row.text),
    scriptId: String(row.id),
    videoId: str(row.video_id),
    status: str(row.status),
    lane: str(row.kind),
    slotDate: str(row.slot_date),
    stored: true,
    gone: null,
  };
}

/** full_render_input.themes as text: a string, or a JSON object/array's words. */
export function researchTopic(raw) {
  const s = str(raw);
  if (!s) return null;
  if (s.startsWith('{') || s.startsWith('[')) {
    try {
      const v = JSON.parse(s);
      if (Array.isArray(v)) return v.map((x) => str(typeof x === 'string' ? x : x?.topic || x?.title)).filter(Boolean).join(' · ') || null;
      if (v && typeof v === 'object') return str(v.topic) || str(v.title) || str(v.name);
    } catch {
      return s;
    }
  }
  return s;
}

export function researchItem(row) {
  const topic = researchTopic(row.topic);
  const seed = researchTopic(row.seed);
  const scriptTitle = str(row.title);
  return {
    id: `r-${row.id}`,
    cursor: cursorOf(row, 's'),
    kind: 'research',
    source: 'review',
    channel: row.channel_id || null,
    title: topic || seed || scriptTitle || 'Untitled topic',
    createdAt: iso(row.created_at),
    jobId: row.job_id ? String(row.job_id) : null,
    bytes: null,
    mime: 'application/json',
    previewText: seed && seed !== topic ? seed : null,
    scriptId: String(row.id),
    videoId: str(row.video_id),
    status: str(row.status),
    topic,
    seed,
    scriptTitle,
    sourceCount: num(row.source_count) ?? 0,
    stored: true,
    gone: null,
  };
}

/* ------------------------------- merge + counts ------------------------------ */

// byte order on the two-part cursor — the same order SQL's COLLATE "C" uses
const byNewest = (a, b) => (a.cursor < b.cursor ? 1 : a.cursor > b.cursor ? -1 : 0);

/**
 * Newest-first merge of already-newest-first source lists (each read with
 * LIMIT limit+1). nextBefore = the last returned item's time when more exist.
 */
export function mergePage(lists, limit) {
  const merged = lists.flat().filter(Boolean).sort(byNewest);
  const items = merged.slice(0, limit);
  const more = merged.length > limit;
  return { items, nextBefore: more && items.length ? items[items.length - 1].cursor : null };
}

export function emptyCounts() {
  return Object.fromEntries(ITEM_KINDS.map((k) => [k, { total: 0, byChannel: {} }]));
}

/** GROUP BY rows → { [kind]: { total, byChannel } } */
export function countsFrom({ artifactRows = [], scriptRows = [], researchRows = [] } = {}) {
  const c = emptyCounts();
  const add = (kind, channel, n) => {
    const v = Number(n) || 0;
    if (!c[kind] || !v) return;
    c[kind].total += v;
    const ch = channel || 'unknown';
    c[kind].byChannel[ch] = (c[kind].byChannel[ch] || 0) + v;
  };
  for (const r of artifactRows) add(KIND_OF_ARTIFACT[r.kind], r.channel, r.n);
  for (const r of scriptRows) add('script', r.channel, r.n);
  for (const r of researchRows) add('research', r.channel, r.n);
  return c;
}

/* ------------------------------- bytes serving ------------------------------- */

/** artifact-store getBytes error → the route's status + reason. */
export function bytesFailure(error) {
  const msg = String(error || '');
  if (/blob_unavailable/.test(msg)) return { status: 503, reason: 'store_unavailable' };
  if (/not.?found|does not exist|\b404\b/i.test(msg)) return { status: 410, reason: 'expired' };
  return { status: 502, reason: 'unreadable' };
}

/**
 * A single `bytes=` range → { start, end } (inclusive), 'unsatisfiable', or
 * null (no/unsupported header → serve the whole body).
 */
export function parseRange(header, size) {
  const m = typeof header === 'string' ? header.trim().match(/^bytes=(\d*)-(\d*)$/) : null;
  if (!m || (m[1] === '' && m[2] === '') || !(size > 0)) return null;
  let start;
  let end;
  if (m[1] === '') {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return 'unsatisfiable';
  return { start, end };
}

// Vercel caps a function response body at ~4.5 MB (review fix 2). Media is
// served in ≤ 2 MB ranges (RFC 9110 lets a server answer a shorter range;
// players ask again from where it ended). A download can't be chunked, so it
// is whole only up to DOWNLOAD_MAX.
export const RANGE_CHUNK = 2 * 1024 * 1024;
export const DOWNLOAD_MAX = 4 * 1024 * 1024;

/**
 * Cap a parsed range to one chunk. No range on a body bigger than a chunk →
 * the first chunk (206); no range on a small body → null (send it whole).
 */
export function capRange(range, size, chunk = RANGE_CHUNK) {
  const span = range || (size > chunk ? { start: 0, end: size - 1 } : null);
  if (!span) return null;
  return { start: span.start, end: Math.min(span.end, span.start + chunk - 1) };
}

/**
 * Tiny in-memory cache of VERIFIED bytes keyed by content hash (content
 * addressed: the same key is always the same bytes). Saves a Blob download +
 * re-hash per audio seek. Failed reads are never cached; entries expire after
 * ttlMs; total kept ≤ maxBytes (oldest out first); oversize items not kept.
 */
export function makeBytesCache({ ttlMs = 5 * 60 * 1000, maxBytes = 24 * 1024 * 1024, now = Date.now } = {}) {
  const map = new Map(); // key → { at, bytes }
  let total = 0;
  const drop = (k) => {
    const e = map.get(k);
    if (e) total -= e.bytes.length;
    map.delete(k);
  };
  return {
    async get(key, load) {
      const hit = key ? map.get(key) : null;
      if (hit && now() - hit.at < ttlMs) return { ok: true, bytes: hit.bytes, cached: true };
      if (hit) drop(key);
      const got = await load();
      if (key && got?.ok && got.bytes && got.bytes.length <= maxBytes) {
        while (map.size && total + got.bytes.length > maxBytes) drop(map.keys().next().value);
        map.set(key, { at: now(), bytes: got.bytes });
        total += got.bytes.length;
      }
      return got;
    },
  };
}

const ROLES = ['owner', 'staff', 'client'];
const BYTE_HEADERS = {
  'Cache-Control': 'private, max-age=3600',
  'Accept-Ranges': 'bytes',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; sandbox",
};
const out = (status, json) => ({ status, json });

/**
 * The whole GET /api/library/artifacts/[id] decision, dependency-injected so
 * it is tested with fake users / scope / DB / store (review fix 9). Returns
 * { status, json } or { status, bytes, headers }.
 *   scopeFor(user) → null (all) | slugs[]; a throw = [] (fail closed)
 *   read           → makeArtifactsRead(...) or null when the DB is off (503)
 *   getBytes(url, { expectedHash }) → artifact-store getBytes contract
 * Another channel's item is a 404, the same as a missing one.
 */
export async function artifactResponse({ user, id, scopeFor, read, getBytes, download = false, rangeHeader = null, now = Date.now() } = {}) {
  if (!user) return out(401, { ok: false, error: 'not signed in' });
  if (!ROLES.includes(user.role)) return out(403, { ok: false, error: 'your role does not allow this' });
  const ref = parseArtifactId(id);
  if (!ref) return out(400, { ok: false, error: 'invalid id' });
  if (!read) return out(503, { ok: false, error: 'library_unavailable' });
  let owned;
  try {
    owned = await scopeFor(user);
  } catch {
    owned = [];
  }
  const allowed = (channel) => owned === null || (Array.isArray(owned) && owned.includes(channel));

  let row;
  let research = null;
  try {
    if (ref.source === 'artifact') row = await read.artifactById(ref.key);
    else if (ref.source === 'script') row = await read.scriptById(ref.key);
    else {
      research = await read.researchById(ref.key);
      row = research?.row || null;
    }
  } catch {
    return out(503, { ok: false, error: 'library_unavailable' });
  }
  if (!row || !allowed(ref.source === 'artifact' ? row.channel : row.channel_id)) return out(404, { ok: false, error: 'not found' });

  if (ref.source === 'script') return out(200, { ok: true, item: scriptItem(row), text: row.text || '' });
  if (ref.source === 'research') {
    return out(200, {
      ok: true,
      item: researchItem({ ...row, source_count: research.sources.length }),
      sources: research.sources.map((s) => ({ url: safeHttpUrl(s.url), title: s.title || null, snippet: s.snippet || null })),
      claims: research.claims.map((c) => ({ claim: c.claim, verification: c.verification })),
    });
  }

  // ---- artifact bytes (hash-verified; the blob URL never leaves here) ----
  const item = artifactItem(row, { now });
  if (item.gone) return out(410, { ok: false, reason: item.gone });
  let got;
  try {
    got = await getBytes(row.blob_url, { expectedHash: row.content_hash });
  } catch (e) {
    got = { ok: false, error: String(e?.message || e) };
  }
  if (!got?.ok) {
    const f = bytesFailure(got?.error);
    return out(f.status, { ok: false, reason: f.reason });
  }
  if (item.kind === 'script') {
    const text = payloadText(got.bytes);
    return text == null ? out(502, { ok: false, reason: 'unreadable' }) : out(200, { ok: true, item, text });
  }

  const bytes = new Uint8Array(got.bytes.buffer, got.bytes.byteOffset, got.bytes.byteLength);
  const size = bytes.length;
  const headers = { ...BYTE_HEADERS, 'Content-Type': item.mime };
  const range = parseRange(rangeHeader, size);
  if (range === 'unsatisfiable') return { status: 416, bytes: null, headers: { ...headers, 'Content-Range': `bytes */${size}` } };
  if (download && !range) {
    if (size > DOWNLOAD_MAX) return out(413, { ok: false, reason: 'too_large' });
    return { status: 200, bytes, headers: { ...headers, 'Content-Length': String(size), 'Content-Disposition': `attachment; filename="${downloadName(item)}"` } };
  }
  const span = capRange(range, size);
  if (!span) return { status: 200, bytes, headers: { ...headers, 'Content-Length': String(size) } };
  const part = bytes.subarray(span.start, span.end + 1);
  return {
    status: 206,
    bytes: part,
    headers: { ...headers, 'Content-Range': `bytes ${span.start}-${span.end}/${size}`, 'Content-Length': String(part.length) },
  };
}

const EXT = { 'image/jpeg': 'jpg', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'application/json': 'json', 'text/plain': 'txt' };

export function downloadName(item) {
  const clean = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'file';
  return `${clean(item.channel)}-${clean(item.kind)}-${clean(item.id)}.${EXT[item.mime] || 'bin'}`;
}

/** A stored Shorts script_payload (JSON bytes) → readable text, or null. */
export function payloadText(bytes) {
  try {
    const o = JSON.parse(Buffer.isBuffer(bytes) ? bytes.toString('utf8') : String(bytes));
    const entries = Array.isArray(o?.entries) ? o.entries : [];
    const parts = entries
      .map((e) => [str(e?.title), str(e?.text)].filter(Boolean).join('\n\n'))
      .filter(Boolean);
    return parts.length ? parts.join('\n\n———\n\n') : null;
  } catch {
    return null;
  }
}

export function safeHttpUrl(u) {
  if (typeof u !== 'string' || !u) return null;
  try {
    const url = new URL(u);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/* --------------------------------- Neon reader -------------------------------- */

function isMissingTable(e) {
  return e?.code === '42P01' || /relation "[^"]+" does not exist/i.test(String(e?.message || ''));
}

// Research rows: a stored topic/seed, or any recorded source.
const RESEARCH_WHERE = `(s.full_render_input->>'themes' IS NOT NULL OR s.full_render_input->>'seed' IS NOT NULL
  OR EXISTS (SELECT 1 FROM script_sources x WHERE x.script_id = s.id))`;

// The job's script — only when it has exactly one (never a guess).
const JOB_SCRIPT = `LEFT JOIN LATERAL (
    SELECT CASE WHEN count(*) = 1 THEN max(sc.title) END AS script_title,
           CASE WHEN count(*) = 1 THEN max(sc.id::text) END AS script_id,
           CASE WHEN count(*) = 1 THEN max(sc.video_id) END AS script_video_id
      FROM scripts sc WHERE sc.job_id = a.job_id::text
  ) js ON true`;

// The cursor string, built in SQL exactly as cursorOf builds it in JS. One
// string order across BOTH sources, so a script-tab cursor from either table
// pages the other correctly too.
const KEY_A = `(to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '|a|' || lpad(a.id::text, 20, '0')) COLLATE "C"`;
const KEY_S = `(to_char(s.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '|s|' || s.id::text) COLLATE "C"`;

const ARTIFACT_COLS = `${KEY_A} AS sort_key, a.id, a.job_id, a.step, a.kind, a.bytes, a.meta, a.created_at,
  (a.blob_url IS NOT NULL AND a.blob_url <> '') AS stored, j.channel,
  js.script_title, js.script_id, js.script_video_id`;

export function makeArtifactsRead(dbClient) {
  if (typeof dbClient !== 'function') {
    throw new TypeError('makeArtifactsRead: dbClient must be a function (sqlText, params) -> Promise<rows>');
  }

  async function q(sql, params) {
    try {
      const rows = await dbClient(sql, params);
      return Array.isArray(rows) ? [...rows] : [];
    } catch (e) {
      if (isMissingTable(e)) return [];
      throw e;
    }
  }

  // WHERE fragments with running $n — values are always bound, never inlined.
  function where(col, { channel, before, scope }, params, keyExpr) {
    const parts = [];
    if (channel) {
      params.push(channel);
      parts.push(`${col} = $${params.length}`);
    }
    if (Array.isArray(scope)) {
      const start = params.length + 1;
      params.push(...scope);
      parts.push(`${col} IN (${scope.map((_, i) => `$${start + i}`).join(', ')})`);
    }
    if (before) {
      params.push(before);
      parts.push(`${keyExpr} < $${params.length}`);
    }
    return parts.length ? ` AND ${parts.join(' AND ')}` : '';
  }

  function artifactsOf(artifactKind, opts, limit) {
    const params = [artifactKind];
    const w = where('j.channel', opts, params, KEY_A);
    params.push(limit);
    return q(
      `SELECT ${ARTIFACT_COLS}
         FROM job_artifacts a JOIN jobs j ON j.id = a.job_id
         ${JOB_SCRIPT}
        WHERE a.kind = $1${w}
        ORDER BY ${KEY_A} DESC
        LIMIT $${params.length}`,
      params,
    );
  }

  function scriptsOf(opts, limit) {
    const params = [];
    const w = where('s.channel_id', opts, params, KEY_S);
    params.push(limit);
    return q(
      `SELECT ${KEY_S} AS sort_key, s.id, s.channel_id, s.title, s.kind, s.status, s.slot_date, s.video_id, s.job_id, s.created_at,
              left(s.text, 600) AS preview
         FROM scripts s
        WHERE true${w}
        ORDER BY ${KEY_S} DESC
        LIMIT $${params.length}`,
      params,
    );
  }

  function researchOf(opts, limit) {
    const params = [];
    const w = where('s.channel_id', opts, params, KEY_S);
    params.push(limit);
    return q(
      `SELECT ${KEY_S} AS sort_key, s.id, s.channel_id, s.title, s.kind, s.status, s.video_id, s.job_id, s.created_at,
              s.full_render_input->>'themes' AS topic, s.full_render_input->>'seed' AS seed,
              (SELECT count(*)::int FROM script_sources x WHERE x.script_id = s.id) AS source_count
         FROM scripts s
        WHERE ${RESEARCH_WHERE}${w}
        ORDER BY ${KEY_S} DESC
        LIMIT $${params.length}`,
      params,
    );
  }

  /**
   * One page of one kind. scope: null = every channel; [] = nothing (a
   * client with no channels — no query runs); [slugs] = only those.
   */
  async function list({ kind, channel = null, limit = PAGE_DEFAULT, before = null, scope = null, now = Date.now() } = {}) {
    if (Array.isArray(scope) && (!scope.length || (channel && !scope.includes(channel)))) return { items: [], nextBefore: null };
    const opts = { channel, before, scope: channel ? null : scope };
    const n = Math.min(Math.max(1, Number(limit) || PAGE_DEFAULT), PAGE_MAX) + 1;
    if (kind === 'script') {
      const [scripts, payloads] = await Promise.all([scriptsOf(opts, n), artifactsOf('script_payload', opts, n)]);
      return mergePage([scripts.map(scriptItem), payloads.map((r) => artifactItem(r, { now }))], n - 1);
    }
    if (kind === 'research') {
      const rows = await researchOf(opts, n);
      return mergePage([rows.map(researchItem)], n - 1);
    }
    const artifactKind = ARTIFACT_KIND_FOR[kind];
    if (!artifactKind) return { items: [], nextBefore: null };
    const rows = await artifactsOf(artifactKind, opts, n);
    return mergePage([rows.map((r) => artifactItem(r, { now }))], n - 1);
  }

  async function counts({ scope = null } = {}) {
    if (Array.isArray(scope) && !scope.length) return emptyCounts();
    const pa = [];
    const wa = where('j.channel', { scope }, pa, null);
    const ps = [];
    const ws = where('s.channel_id', { scope }, ps, null);
    const pr = [];
    const wr = where('s.channel_id', { scope }, pr, null);
    const [artifactRows, scriptRows, researchRows] = await Promise.all([
      q(`SELECT a.kind, j.channel, count(*)::int AS n FROM job_artifacts a JOIN jobs j ON j.id = a.job_id
          WHERE a.kind IN ('script_payload', 'tts_audio', 'thumb_candidate')${wa} GROUP BY a.kind, j.channel`, pa),
      q(`SELECT s.channel_id AS channel, count(*)::int AS n FROM scripts s WHERE true${ws} GROUP BY s.channel_id`, ps),
      q(`SELECT s.channel_id AS channel, count(*)::int AS n FROM scripts s WHERE ${RESEARCH_WHERE}${wr} GROUP BY s.channel_id`, pr),
    ]);
    return countsFrom({ artifactRows, scriptRows, researchRows });
  }

  /** One index row (+ content_hash, blob_url — SERVER ONLY) and its channel. */
  async function artifactById(key) {
    const rows = await q(
      `SELECT ${ARTIFACT_COLS}, a.content_hash, a.blob_url
         FROM job_artifacts a JOIN jobs j ON j.id = a.job_id
         ${JOB_SCRIPT}
        WHERE a.id = $1 AND a.kind IN ('script_payload', 'tts_audio', 'thumb_candidate')`,
      [key],
    );
    return rows[0] || null;
  }

  async function scriptById(key) {
    const rows = await q(
      `SELECT s.id, s.channel_id, s.title, s.kind, s.status, s.slot_date, s.video_id, s.job_id, s.created_at, s.text,
              s.full_render_input->>'themes' AS topic, s.full_render_input->>'seed' AS seed
         FROM scripts s WHERE s.id = $1`,
      [key],
    );
    return rows[0] || null;
  }

  async function researchById(key) {
    const row = await scriptById(key);
    if (!row) return null;
    const [sources, claims] = await Promise.all([
      q(`SELECT url, title, snippet FROM script_sources WHERE script_id = $1 ORDER BY id`, [key]),
      q(`SELECT claim, verification FROM script_claims WHERE script_id = $1 ORDER BY id`, [key]),
    ]);
    return { row, sources, claims };
  }

  return { list, counts, artifactById, scriptById, researchById };
}

/* ------------------------------- page wording ------------------------------- */

/** 48211 → "47 KB"; null/0 → null (unknown size is never shown as 0). */
export function fmtBytes(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${Math.round(v / 1024)} KB`;
  return `${(v / (1024 * 1024)).toFixed(1)} MB`;
}

/** 83.4 → "1:23"; unknown → null. */
export function fmtDuration(sec) {
  const v = Number(sec);
  if (!Number.isFinite(v) || v <= 0) return null;
  const s = Math.round(v);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
