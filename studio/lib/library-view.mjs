// Phase 3 "Library" — the pure core behind /api/library and the /videos page.
// Turns the upload records the panel already keeps (per-channel state files +
// the CI long-form upload log) into one deduped, newest-first video list.
// Relative imports only (none needed) so `node --test` can load it directly.
//
// Sources, and what each one honestly covers:
//   state[slug].lastVideos     — the latest Short upload (has a videoId)
//   state[slug].titleHistory   — every Short title + publish time, last 60 per
//                                channel; NO videoId, so no link/thumbnail
//   state[slug].deepdiveVideo  — the legacy local episode record (videoId)
//   state[slug].recyclePending — re-uploaded videos (newVideoId)
//   longform[slug][]           — the CI episode record (videoId) — wins over
//                                the legacy episode for the same video

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;
// A history row (no videoId) and an uploaded row with the same title are the
// same upload when their times are this close (a recovered clip can carry a
// slot time that differs from the queue's own time by up to a day).
const MERGE_WINDOW_MS = 36 * 3600 * 1000;

export const KIND_LABEL = { short: 'Short', long: 'Episode', other: 'Re-upload' };

export function normTitle(t) {
  return String(t || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function ytUrl(videoId) {
  return videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : null;
}

// YouTube's own thumbnail CDN — zero API quota. Only for videos that should be
// public by now: a scheduled (still private) video gets YouTube's grey
// placeholder, which would be a fake picture.
export function ytThumb(videoId) {
  return videoId ? `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg` : null;
}

function ms(iso) {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : null;
}

// ---- 1. raw rows from each source -------------------------------------------

export function rowsFromState(state) {
  const rows = [];
  for (const [slug, s] of Object.entries(state || {})) {
    if (!s || typeof s !== 'object') continue;
    for (const v of Array.isArray(s.lastVideos) ? s.lastVideos : []) {
      if (!v) continue;
      rows.push({ slug, title: v.title || '', at: v.publishAt || null, videoId: v.videoId || null, kind: 'short', source: 'latest-upload' });
    }
    for (const h of Array.isArray(s.titleHistory) ? s.titleHistory : []) {
      if (!h || !h.t) continue;
      // J2 (2026-11-20): the engine now records the videoId (h.v) with each
      // title; older entries have none and keep the "Link not saved" note
      rows.push({ slug, title: h.t, at: h.at || null, videoId: typeof h.v === 'string' && h.v ? h.v : null, kind: 'short', source: 'title-history' });
    }
    const d = s.deepdiveVideo;
    if (d && (d.videoId || d.title)) {
      rows.push({ slug, title: d.title || '', at: d.publishAt || null, videoId: d.videoId || null, kind: 'long', source: 'legacy-episode' });
    }
    for (const r of Array.isArray(s.recyclePending) ? s.recyclePending : []) {
      if (!r || !r.newVideoId) continue;
      rows.push({ slug, title: r.title || '', at: r.publishAt || null, videoId: r.newVideoId, kind: 'other', source: 're-upload' });
    }
  }
  return rows;
}

export function rowsFromLongform(longform) {
  const rows = [];
  for (const [slug, arr] of Object.entries(longform || {})) {
    for (const e of Array.isArray(arr) ? arr : []) {
      if (!e || !e.videoId) continue;
      rows.push({
        slug,
        title: e.title || '',
        at: e.publishAt || (e.date ? `${e.date}T00:00:00Z` : null),
        videoId: e.videoId,
        kind: 'long',
        source: 'episode-log',
      });
    }
  }
  return rows;
}

// ---- 2. dedupe ----------------------------------------------------------------

// Source priority when two rows describe the same videoId: the CI episode log
// beats the legacy episode field; anything with a title beats an empty one.
const SOURCE_RANK = { 'episode-log': 0, 'latest-upload': 1, 're-upload': 2, 'legacy-episode': 3, 'title-history': 4 };

export function dedupeRows(rows) {
  // a) one row per videoId
  const byId = new Map();
  const idless = [];
  for (const r of rows || []) {
    if (!r) continue;
    if (!r.videoId) { idless.push(r); continue; }
    const prev = byId.get(r.videoId);
    if (!prev) { byId.set(r.videoId, { ...r }); continue; }
    const better = (SOURCE_RANK[r.source] ?? 9) < (SOURCE_RANK[prev.source] ?? 9) ? r : prev;
    const other = better === r ? prev : r;
    byId.set(r.videoId, { ...better, title: better.title || other.title, at: better.at || other.at });
  }
  const withId = [...byId.values()];

  // b) history rows (no videoId) fold into an uploaded row with the same
  //    channel + title + close time; else into each other (same title+time)
  const idIndex = new Map(); // slug|title → rows with ids
  for (const r of withId) {
    const k = `${r.slug}|${normTitle(r.title)}`;
    if (!idIndex.has(k)) idIndex.set(k, []);
    idIndex.get(k).push(r);
  }
  const keptIdless = [];
  const seenIdless = new Set();
  for (const r of idless) {
    const k = `${r.slug}|${normTitle(r.title)}`;
    const t = ms(r.at);
    const match = (idIndex.get(k) || []).find((u) => {
      const ut = ms(u.at);
      return t == null || ut == null || Math.abs(ut - t) <= MERGE_WINDOW_MS;
    });
    if (match) continue;
    const exact = `${k}|${t ?? ''}`;
    if (seenIdless.has(exact)) continue;
    seenIdless.add(exact);
    keptIdless.push(r);
  }

  // c) two DIFFERENT videoIds with the same channel + title are a real
  //    problem worth surfacing ("possible duplicate upload"), not hiding
  for (const group of idIndex.values()) {
    if (group.length > 1 && normTitle(group[0].title)) for (const r of group) r.dupTitle = true;
  }
  return [...withId, ...keptIdless];
}

// ---- 3. rows → library items ----------------------------------------------------

export function statusAt(at, now = Date.now()) {
  const t = ms(at);
  if (t == null) return 'unknown';
  return t > now ? 'scheduled' : 'published';
}

// Live fix wave C2 (T2-11): why a row has no YouTube link, in plain words.
//   not-saved — a Short the engine uploaded but recorded by title only
//               (titleHistory is written AFTER a successful upload, without
//               the videoId; only the latest upload keeps its id)
//   scheduled — uploaded and set to go public later
//   none      — no link and no known reason
export const LINK_NOTE = Object.freeze({
  'not-saved': 'Link not saved',
  scheduled: 'Scheduled',
  none: 'No link',
});

export function linkNoteFor(r, status) {
  if (status === 'scheduled') return 'scheduled';
  if (r.videoId) return null;
  return r.source === 'title-history' ? 'not-saved' : 'none';
}

// a YouTube search for the exact title — the only way back to an upload whose
// id wasn't saved (no API quota spent)
export function findUrl(title) {
  const t = String(title || '').trim();
  return t ? `https://www.youtube.com/results?search_query=${encodeURIComponent(`"${t}"`)}` : null;
}

export function toItem(r, now = Date.now()) {
  const status = statusAt(r.at, now);
  const linkNote = linkNoteFor(r, status);
  return {
    linkNote,
    findUrl: linkNote === 'not-saved' ? findUrl(r.title) : null,
    id: r.videoId || `${r.slug}|${normTitle(r.title)}|${r.at || ''}`,
    slug: r.slug,
    title: r.title || '',
    videoId: r.videoId || null,
    url: ytUrl(r.videoId),
    at: r.at || null,
    publishedAt: status === 'published' ? r.at : null,
    scheduledAt: status === 'scheduled' ? r.at : null,
    status,
    kind: r.kind,
    // status is inferred from the clock (there is no privacy read here), so a
    // thumbnail is only offered once the publish time has passed
    thumb: status === 'published' ? ytThumb(r.videoId) : null,
    source: r.source,
    dupTitle: !!r.dupTitle,
  };
}

export function sortNewestFirst(items) {
  return [...items].sort((a, b) => {
    const ta = ms(a.at);
    const tb = ms(b.at);
    if (ta == null && tb == null) return 0;
    if (ta == null) return 1; // undated rows sink to the bottom
    if (tb == null) return -1;
    return tb - ta;
  });
}

export function buildLibrary({ state, longform, now = Date.now() } = {}) {
  const rows = dedupeRows([...rowsFromLongform(longform), ...rowsFromState(state)]);
  return sortNewestFirst(rows.map((r) => toItem(r, now)));
}

// ---- 4. filters + paging --------------------------------------------------------

export function filterLibrary(items, { slug, kind, status, q } = {}) {
  const needle = normTitle(q);
  return (items || []).filter((it) => {
    if (slug && slug !== 'all' && it.slug !== slug) return false;
    if (kind && kind !== 'all' && it.kind !== kind) return false;
    if (status && status !== 'all' && it.status !== status) return false;
    if (needle && !normTitle(it.title).includes(needle)) return false;
    return true;
  });
}

export function clampLimit(raw) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

export function clampOffset(raw) {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function paginate(items, { limit, offset } = {}) {
  const l = clampLimit(limit);
  const o = clampOffset(offset);
  return { items: items.slice(o, o + l), total: items.length, limit: l, offset: o };
}

// ---- 5. page wording + URL filters (live fix wave C2) ----------------------------

// T2-17: say what renders. Grid/phone list: "Showing 24 of 86"; the desktop
// table pages itself: "86 videos · 25 per page".
export function countLine({ shown = 0, matched = 0, recorded = 0, perPage = 0 } = {}) {
  const filtered = recorded > matched ? ` (filtered from ${recorded})` : '';
  if (perPage) {
    const noun = `${matched} video${matched === 1 ? '' : 's'}`;
    return matched > perPage ? `${noun} · ${perPage} per page${filtered}` : `${noun}${filtered}`;
  }
  return `Showing ${Math.min(shown, matched)} of ${matched}${filtered}`;
}

// T2-24: the filters live in the URL so Back/Forward restore them.
const FILTER_DEFAULTS = Object.freeze({ channel: 'all', kind: 'all', status: 'all', view: 'table' });
const FILTER_ALLOWED = Object.freeze({
  kind: ['all', 'short', 'long', 'other'],
  status: ['all', 'published', 'scheduled'],
  view: ['table', 'grid'],
});

export function libraryFilters(sp) {
  const get = (k) => (sp && typeof sp.get === 'function' ? sp.get(k) : null) || '';
  const out = { channel: get('channel') || FILTER_DEFAULTS.channel };
  for (const k of ['kind', 'status', 'view']) {
    const v = get(k);
    out[k] = FILTER_ALLOWED[k].includes(v) ? v : FILTER_DEFAULTS[k];
  }
  return out;
}

// current query string + a patch → the next href; defaults drop out of the URL
export function libraryHref(pathname, search, patch = {}) {
  const sp = new URLSearchParams(search || '');
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === '' || v === FILTER_DEFAULTS[k]) sp.delete(k);
    else sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `${pathname}?${s}` : pathname;
}

export function countLibrary(items) {
  const c = { all: 0, short: 0, long: 0, other: 0, published: 0, scheduled: 0, unknown: 0 };
  for (const it of items || []) {
    c.all++;
    if (c[it.kind] != null) c[it.kind]++;
    if (c[it.status] != null) c[it.status]++;
  }
  return c;
}
