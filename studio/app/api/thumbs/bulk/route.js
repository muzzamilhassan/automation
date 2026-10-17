// F10 — bulk redesign: apply one look (template + accent + chip + eyebrow) to
// many videos at once. Each video's CURRENT YouTube thumbnail becomes the
// background photo, its own title is re-laid-out by the template, and the
// result attaches back. Daily attach cap (10/channel/day) respected — the
// batch is clamped to whatever the channel has left today, rest is reported.
import sharp from 'sharp';
import { getUser } from '@/lib/route-auth';
import { canAccessChannelSlug } from '@/lib/access';
import { appendAudit, listAudit } from '@/lib/audit';
import { buildThumbSvg, TEMPLATES } from '@/lib/thumb-templates';
import { attachThumb, accessTokenForSlug } from '@/lib/yt-attach';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DAILY_CAP = 10;

export async function POST(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const { slug, videoIds = [], template = 'poster', accent = '#E8C15A', chip = '', eyebrow = '', shade = '#0A1128', brand = '' } = body || {};
    if (!slug || !Array.isArray(videoIds) || !videoIds.length) return Response.json({ error: 'slug and videoIds required' }, { status: 400 });
    if (!TEMPLATES[template]) return Response.json({ error: 'unknown template' }, { status: 400 });
    const HEX_COLOR = /^#[0-9a-fA-F]{6}$/; // same guard as thumbs/branding — colors interpolate into SVG attrs raw (issue #59)
    if (!HEX_COLOR.test(accent) || !HEX_COLOR.test(shade)) return Response.json({ error: 'accent/shade must be #RRGGBB' }, { status: 400 });
    if (!(await canAccessChannelSlug(user, slug))) return Response.json({ error: 'this channel is not linked to your account' }, { status: 403 });

    // daily attach quota for this channel (audit-log counted)
    let used = 0;
    try {
      const logs = await listAudit(200);
      const today = new Date().toISOString().slice(0, 10);
      used = (logs || []).filter((l) => l.action === 'thumbnail set' && String(l.detail || '').startsWith(slug) && String(l.at || '').slice(0, 10) === today).length;
    } catch { }
    const remaining = Math.max(0, DAILY_CAP - used);
    const batch = videoIds.slice(0, remaining);
    const skipped = videoIds.length - batch.length;

    // titles for the batch (one videos.list call)
    const at = await accessTokenForSlug(slug);
    const vr = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${batch.join(',')}`, { headers: { Authorization: `Bearer ${at}` } });
    const vj = await vr.json();
    const titles = {};
    for (const it of vj.items || []) titles[it.id] = it.snippet.title || '';

    const results = [];
    for (const videoId of batch) {
      try {
        const title = (titles[videoId] || '').replace(/\s*[|#].*$/, '').trim() || 'Untitled';
        // background = the video's current thumbnail (maxres, fallback hq)
        let buf = null;
        for (const q of ['maxresdefault', 'hqdefault']) {
          const r = await fetch(`https://i.ytimg.com/vi/${videoId}/${q}.jpg`, { signal: AbortSignal.timeout(10000) });
          if (r.ok) {
            const b = Buffer.from(await r.arrayBuffer());
            if (b.length > 5000) { buf = b; break; } // hqdefault returns a 120px gray placeholder when maxres is missing
          }
        }
        if (!buf) { results.push({ videoId, ok: false, error: 'no current thumbnail' }); continue; }
        const photoHref = `data:image/jpeg;base64,${buf.toString('base64')}`;
        const svg = buildThumbSvg(template, { title, accent, chip, eyebrow, shade, brand, photoHref });
        const jpeg = await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
        await attachThumb(slug, videoId, jpeg);
        try { await appendAudit(user.email, 'thumbnail set', `${slug} · ${videoId} · bulk ${(jpeg.length / 1024).toFixed(0)}KB`); } catch { }
        results.push({ videoId, ok: true, kb: Math.round(jpeg.length / 1024), title: title.slice(0, 50) });
      } catch (e) {
        results.push({ videoId, ok: false, error: e.message?.slice(0, 100) });
      }
    }
    const okCount = results.filter((r) => r.ok).length;
    return Response.json({ ok: true, processed: batch.length, okCount, failed: batch.length - okCount, skipped, remaining: Math.max(0, remaining - batch.length), results });
  } catch (e) {
    return Response.json({ error: e.message?.slice(0, 140) || 'bulk failed' }, { status: 500 });
  }
}
