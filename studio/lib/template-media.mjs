// Template preview media — the pure rules behind /api/template-previews and
// /api/template-previews/media (live-fix wave B1, P8/T5-04/T3-03).
// Framework-free and import-free so node --test can pin it
// (tests/wave-b1.test.mjs).
//
// Caching model: every media URL the Studio hands out carries `v` = the
// render time (base-36 ms). The bytes behind one `v` never change, so that
// URL is cached for a year by the Vercel CDN (s-maxage) and the browser
// (max-age, immutable); a re-render writes a new rendered_at → a new `v` →
// a new URL. An unversioned or stale-`v` URL is still CDN-cached, briefly.
// The session gate (studio/proxy.js) runs before the CDN cache, so caching
// `public` does not open the media to signed-out visitors.

export const PREVIEW_CACHE_IMMUTABLE = 'public, max-age=31536000, s-maxage=31536000, immutable';
export const PREVIEW_CACHE_SHORT = 'public, max-age=300, s-maxage=300, stale-while-revalidate=86400';

// rendered_at → a short URL-safe version token ('' when unknown).
export function previewVersion(renderedAt) {
  if (renderedAt === null || renderedAt === undefined || renderedAt === '') return '';
  const ms = renderedAt instanceof Date ? renderedAt.getTime() : Date.parse(String(renderedAt));
  return Number.isFinite(ms) ? Math.trunc(ms).toString(36) : '';
}

export function previewMediaUrl(templateId, kind, renderedAt) {
  const v = previewVersion(renderedAt);
  const base = `/api/template-previews/media?id=${encodeURIComponent(String(templateId || ''))}&kind=${kind}`;
  return v ? `${base}&v=${v}` : base;
}

// Immutable only when the URL names the CURRENT render.
export function previewCacheControl(requestedV, currentV) {
  return requestedV && currentV && requestedV === currentV ? PREVIEW_CACHE_IMMUTABLE : PREVIEW_CACHE_SHORT;
}

// Private Vercel Blob URLs 403 in <img>/<video>, so those bytes are proxied
// with the server token; any other (public) URL is simply redirected to.
export function isPrivateBlobUrl(url) {
  return /^https:\/\/[^/]+\.private\.blob\.vercel-storage\.com\//i.test(String(url || ''));
}

// Drafts approved through the Drafts Inbox keep their render under draft-<id>.
export function previewLookupIds(id) {
  const s = String(id || '');
  const clean = s.replace(/^draft-/, '');
  return s === clean ? [s, `draft-${clean}`] : [s, clean];
}

// fetch + JSON with a hard time limit — a slow request ends in a plain error
// ("took too long") the UI turns into "Couldn't load — Retry", never an
// endless spinner (T3-04). A non-OK answer throws with the server's message.
export async function fetchJsonWithTimeout(url, { timeoutMs = 15000, fetchImpl, init } = {}) {
  const doFetch = fetchImpl || globalThis.fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let r;
    try {
      r = await doFetch(url, { ...(init || {}), signal: ctrl.signal });
    } catch (e) {
      if (ctrl.signal.aborted) throw new Error('This took too long. Try again.');
      throw e;
    }
    const d = await r.json().catch(() => ({}));
    if (ctrl.signal.aborted) throw new Error('This took too long. Try again.');
    if (!r.ok) throw new Error((d && d.error) || `The server answered ${r.status}.`);
    return d;
  } finally {
    clearTimeout(timer);
  }
}
