// Thumbnail Studio — live preview render. Owner/staff only (proxy gates too).
// Stateless: photo comes in as a URL (fetched server-side) or a dataURL,
// render happens in-process via sharp, JPEG goes back as a dataURL.
import sharp from 'sharp';
import { getUser } from '@/lib/route-auth';
import { buildThumbSvg, wrapForTemplate, pickAccentWord, TEMPLATES } from '@/lib/thumb-templates';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const user = await getUser(req);
  if (!user || !['owner', 'staff'].includes(user.role)) return Response.json({ error: 'not allowed' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const { template = 'clean', title = '', accentWord = '', accent = '#E8C15A', chip = '', eyebrow = '', shade = '#0A1128', brand = '', photoUrl = '', photoDataUrl = '' } = body || {};
    if (!TEMPLATES[template]) return Response.json({ error: 'unknown template' }, { status: 400 });

    let photoHref = '';
    if (photoDataUrl && photoDataUrl.startsWith('data:image/')) {
      photoHref = photoDataUrl;
    } else if (photoUrl && /^https:\/\//.test(photoUrl)) {
      const r = await fetch(photoUrl, { signal: AbortSignal.timeout(12000) });
      if (!r.ok) return Response.json({ error: `photo fetch failed: HTTP ${r.status}` }, { status: 400 });
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 12 * 1024 * 1024) return Response.json({ error: 'photo too large' }, { status: 400 });
      photoHref = `data:image/jpeg;base64,${buf.toString('base64')}`;
    } else if (TEMPLATES[template].needsPhoto) {
      return Response.json({ error: 'this template needs a photo' }, { status: 400 });
    }

    const svg = buildThumbSvg(template, { title, accentWord, accent, chip, eyebrow, shade, brand, photoHref });
    const jpeg = await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
    const words = String(title || '').trim().split(/\s+/).filter(Boolean).length;
    return Response.json({
      image: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
      bytes: jpeg.length,
      words,
      lines: wrapForTemplate(template, title),
      accentWordSuggested: pickAccentWord(title),
      checklist: {
        wordsOk: words > 0 && words <= 7,
        photoOk: Boolean(photoHref) || template === 'poster',
        sizeOk: jpeg.length < 2 * 1024 * 1024,
      },
    });
  } catch (e) {
    return Response.json({ error: e.message?.slice(0, 140) || 'render failed' }, { status: 500 });
  }
}
