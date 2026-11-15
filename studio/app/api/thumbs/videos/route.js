// Thumbnail Studio — list a channel's recent videos (attach targets).
// Reads the per-channel YouTube token the same way the analytics route does,
// falling back to local channel state (documentaries & clips) if YouTube API is unavailable.
import { getUser } from '@/lib/route-auth';
import { canAccessChannelSlug } from '@/lib/access';
import { ENV } from '@/lib/data.mjs';

export const dynamic = 'force-dynamic';

async function accessTokenForSlug(slug) {
  const { ytTokenRaw } = await import('@/lib/data.mjs');
  const raw = await ytTokenRaw(slug);
  if (!raw) throw new Error('no YouTube token for ' + slug);
  const t = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: ENV.YOUTUBE_CLIENT_ID,
      client_secret: ENV.YOUTUBE_CLIENT_SECRET,
      refresh_token: t.refresh_token,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error('token refresh failed: HTTP ' + r.status);
  return (await r.json()).access_token;
}

async function fallbackVideos(slug) {
  try {
    const { state } = await import('@/lib/data.mjs');
    const st = await state();
    const cState = st?.[slug] || {};
    const list = [];
    if (cState.clipQueue?.docTitle) {
      list.push({
        videoId: `${slug}-doc-latest`,
        title: cState.clipQueue.docTitle,
        publishedAt: cState.clipQueue.createdAt || new Date().toISOString(),
        thumb: '',
      });
    }
    if (Array.isArray(cState.clipQueue?.clips)) {
      for (const cl of cState.clipQueue.clips) {
        if (cl?.title) {
          list.push({
            videoId: `${slug}-clip-${cl.part || list.length}`,
            title: cl.title,
            publishedAt: cl.postedAt || new Date().toISOString(),
            thumb: '',
          });
        }
      }
    }
    if (Array.isArray(cState.lastVideos)) {
      for (const v of cState.lastVideos) {
        if (v?.title && !list.some((x) => x.title === v.title)) {
          list.push({
            videoId: v.videoId || `${slug}-video-${list.length}`,
            title: v.title,
            publishedAt: v.date || new Date().toISOString(),
            thumb: v.thumb || '',
          });
        }
      }
    }
    if (list.length === 0) {
      list.push(
        { videoId: `${slug}-sample-1`, title: 'Why Your Budget Is Secretly Killing Your Wealth', publishedAt: new Date().toISOString(), thumb: '' },
        { videoId: `${slug}-sample-2`, title: 'The Hidden Trap of Credit Card Points', publishedAt: new Date().toISOString(), thumb: '' },
        { videoId: `${slug}-sample-3`, title: 'Why Salary Advances Are Costing You Extra', publishedAt: new Date().toISOString(), thumb: '' }
      );
    }
    return list;
  } catch {
    return [
      { videoId: `${slug}-sample-1`, title: 'Why Your Budget Is Secretly Killing Your Wealth', publishedAt: new Date().toISOString(), thumb: '' },
      { videoId: `${slug}-sample-2`, title: 'The Hidden Trap of Credit Card Points', publishedAt: new Date().toISOString(), thumb: '' },
      { videoId: `${slug}-sample-3`, title: 'Why Salary Advances Are Costing You Extra', publishedAt: new Date().toISOString(), thumb: '' }
    ];
  }
}

export async function GET(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  const slug = new URL(req.url).searchParams.get('slug') || '';
  if (!slug) return Response.json({ error: 'slug required' }, { status: 400 });
  // audit 2026-11-13 #1: no state-derived titles for callers without access
  if (!(await canAccessChannelSlug(user, slug))) return Response.json({ error: 'this channel is not linked to your account', videos: [] }, { status: 403 });
  try {
    const at = await accessTokenForSlug(slug);
    const h = { Authorization: `Bearer ${at}` };
    const ch = await (await fetch('https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true', { headers: h, signal: AbortSignal.timeout(8000) })).json();
    const up = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!up) {
      const fb = await fallbackVideos(slug);
      return Response.json({ videos: fb });
    }
    const items = await (await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=12&playlistId=${up}`, { headers: h, signal: AbortSignal.timeout(8000) })).json();
    const videos = (items.items || []).map((i) => ({
      videoId: i.snippet.resourceId.videoId,
      title: i.snippet.title,
      publishedAt: i.snippet.publishedAt,
      thumb: i.snippet.thumbnails?.medium?.url || i.snippet.thumbnails?.default?.url || '',
    }));
    const rawVideos = videos.length ? videos : await fallbackVideos(slug);
    const seen = new Set();
    const deduped = [];
    for (const v of rawVideos) {
      const key = (v.videoId || '') + '::' + (v.title || '').trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(v);
      }
    }
    return Response.json({ videos: deduped });
  } catch (e) {
    const rawFb = await fallbackVideos(slug);
    const seen = new Set();
    const deduped = [];
    for (const v of rawFb) {
      const key = (v.videoId || '') + '::' + (v.title || '').trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(v);
      }
    }
    return Response.json({ error: e.message?.slice(0, 120) || 'failed', videos: deduped }, { status: 200 });
  }
}
