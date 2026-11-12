// Private-blob media proxy for template preview posters and sample MP4s.
// Raw *.private.blob.vercel-storage.com URLs return 403 in browser <img>/<video>
// tags; this route authenticates session, resolves URL server-side from Neon
// template_previews (never accepts arbitrary URLs), and streams bytes with
// HTTP Range (206 Partial Content) support for video scrubbing/playback.
import { getUser } from '@/lib/route-auth';

export const dynamic = 'force-dynamic';

const ID_RE = /^[\w-]+$/;

function upstreamHeaders(req, targetUrl) {
  const headers = {};
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token && /\.private\.blob\.vercel-storage\.com/i.test(targetUrl)) {
    headers.Authorization = `Bearer ${token}`;
  }
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
  if (!ID_RE.test(id)) {
    return Response.json({ error: 'invalid id' }, { status: 400 });
  }
  if (kind !== 'mp4' && kind !== 'poster') {
    return Response.json({ error: 'invalid kind (expected mp4 or poster)' }, { status: 400 });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return Response.json({ error: 'db unavailable' }, { status: 503 });
  }

  const { default: postgres } = await import('postgres');
  const sql = postgres(dbUrl, { max: 1, idle_timeout: 5 });
  let row = null;
  try {
    const rows = await sql`
      SELECT mp4_url, poster_url
      FROM template_previews
      WHERE template_id = ${id}
      LIMIT 1
    `;
    row = rows[0] || null;
  } finally {
    await sql.end();
  }

  const targetUrl = kind === 'mp4' ? row?.mp4_url : row?.poster_url;
  if (!targetUrl) {
    return Response.json({ error: 'preview media not found' }, { status: 404 });
  }

  let upstream;
  try {
    upstream = await fetch(targetUrl, {
      headers: upstreamHeaders(req, targetUrl),
      cache: 'no-store',
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
  resHeaders.set('Cache-Control', 'private, max-age=3600');
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
