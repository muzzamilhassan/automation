// Private-blob media proxy for template preview posters and sample MP4s.
// Raw *.private.blob.vercel-storage.com URLs return 403 in browser <img>/<video>
// tags; this route authenticates session, resolves URL server-side from Neon
// template_previews (never accepts arbitrary URLs), and streams bytes with
// HTTP Range (206 Partial Content) support for video scrubbing/playback.
//
// Live-fix wave B1 (P8/T5-04/T3-03): the media used to be re-downloaded on
// every view (Cache-Control: private → CDN MISS every time) and each request
// opened its own Postgres connection. Now:
//  - the URLs carry `v` (the render time) — a matching `v` is cached for a
//    year at the CDN and in the browser (immutable); anything else briefly
//    (lib/template-media.mjs previewCacheControl). The session gate in
//    proxy.js runs before the CDN cache, so `public` stays signed-in only.
//  - the lookup uses the shared DB client (@/lib/db), cached per warm
//    instance, so a burst of 40 posters is not 40 connections.
//  - a non-private (public) blob URL is redirected to instead of proxied.
import { getUser } from '@/lib/route-auth';
import { db, dbReady } from '@/lib/db';
import { previewVersion, previewCacheControl, isPrivateBlobUrl, previewLookupIds } from '@/lib/template-media.mjs';

export const dynamic = 'force-dynamic';

const ID_RE = /^[\w-]+$/;
const V_RE = /^[0-9a-z]{1,16}$/;
const ROW_TTL_MS = 5 * 60 * 1000;
const ROW_CACHE = new Map(); // template id -> { at, row } (found rows only)

async function lookupRow(id) {
  const hit = ROW_CACHE.get(id);
  if (hit && Date.now() - hit.at < ROW_TTL_MS) return hit.row;
  const [first, second] = previewLookupIds(id);
  const rows = await db`
    SELECT template_id, mp4_url, poster_url, rendered_at
    FROM template_previews
    WHERE template_id = ${first} OR template_id = ${second}
    ORDER BY (template_id = ${first}) DESC, rendered_at DESC
    LIMIT 1
  `;
  const row = rows[0] || null;
  if (row) {
    if (ROW_CACHE.size >= 500) ROW_CACHE.clear();
    ROW_CACHE.set(id, { at: Date.now(), row });
  }
  return row;
}

function upstreamHeaders(req) {
  const headers = {};
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  const range = req.headers.get('range');
  if (range) headers.Range = range;
  return headers;
}

export async function GET(req) {
  const user = await getUser(req);
  if (!user || !['owner', 'staff'].includes(user.role)) {
    return Response.json({ error: 'not signed in' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = String(searchParams.get('id') || '').trim();
  const kind = String(searchParams.get('kind') || '').trim();
  const v = String(searchParams.get('v') || '').trim();
  if (!ID_RE.test(id)) {
    return Response.json({ error: 'invalid id' }, { status: 400 });
  }
  if (kind !== 'mp4' && kind !== 'poster') {
    return Response.json({ error: 'invalid kind (expected mp4 or poster)' }, { status: 400 });
  }
  if (v && !V_RE.test(v)) {
    return Response.json({ error: 'invalid v' }, { status: 400 });
  }
  if (!dbReady) {
    return Response.json({ error: 'db unavailable' }, { status: 503 });
  }

  let row = null;
  try {
    row = await lookupRow(id);
  } catch (e) {
    return Response.json({ error: `preview lookup failed: ${String(e.message || e).slice(0, 120)}` }, { status: 503 });
  }

  const targetUrl = kind === 'mp4' ? row?.mp4_url : row?.poster_url;
  if (!targetUrl) {
    return Response.json({ error: 'preview media not found' }, { status: 404 });
  }
  const cacheControl = previewCacheControl(v, previewVersion(row.rendered_at));

  // a public object needs no proxy — the browser fetches it directly
  if (!isPrivateBlobUrl(targetUrl)) {
    return new Response(null, { status: 307, headers: { Location: targetUrl, 'Cache-Control': cacheControl } });
  }

  let upstream;
  try {
    upstream = await fetch(targetUrl, {
      headers: upstreamHeaders(req),
      cache: 'no-store', // the bytes are cached at the CDN/browser, not in Next's data cache
    });
  } catch (e) {
    return Response.json({ error: `upstream fetch failed: ${String(e.message || e).slice(0, 120)}` }, { status: 502 });
  }

  if (!upstream.ok && upstream.status !== 206) {
    return Response.json({ error: `blob upstream ${upstream.status}` }, { status: upstream.status === 404 ? 404 : 502 });
  }

  const resHeaders = new Headers();
  const fallbackType = kind === 'mp4' ? 'video/mp4' : 'image/jpeg';
  resHeaders.set('Content-Type', upstream.headers.get('content-type') || fallbackType);
  resHeaders.set('Cache-Control', cacheControl);
  resHeaders.set('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');

  for (const h of ['content-length', 'content-range', 'etag', 'last-modified']) {
    const val = upstream.headers.get(h);
    if (val) resHeaders.set(h, val);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: resHeaders,
  });
}
