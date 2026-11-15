// Thumbnail Studio — live preview render. Any signed-in Studio role the proxy
// lets onto /thumbs (owner/staff/client). Stateless: photo comes in as a
// Pexels URL (fetched server-side, host-allowlisted, no redirects) or a
// dataURL; render happens in-process via sharp, JPEG goes back as a dataURL.
import sharp from 'sharp';
import { getUser } from '@/lib/route-auth';
import { isAllowedPhotoUrl } from '@/lib/photo-url';
import { buildThumbSvg, wrapForTemplate, pickAccentWord, TEMPLATES, isSafeImageDataUrl } from '@/lib/thumb-templates';
import { renderV2ById, isV2Template, v2NeedsPhoto } from '@/lib/thumb-templates-v2';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  // audit 2026-11-13 #1: e9ef6d2 dropped this check — anonymous callers could
  // drive a server-side fetch + sharp render. Every signed-in role may preview.
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const { template = 'clean', title = '', accentWord = '', accent = '#E8C15A', chip = '', eyebrow = '', shade = '#0A1128', brand = '', photoUrl = '', photoDataUrl = '' } = body || {};
    if (!TEMPLATES[template] && !isV2Template(template)) return Response.json({ error: 'unknown template' }, { status: 400 });
    const HEX_COLOR = /^#[0-9a-fA-F]{6}$/; // same guard as thumbs/branding — colors interpolate into SVG attrs raw (issue #59)
    if (!HEX_COLOR.test(accent) || !HEX_COLOR.test(shade)) return Response.json({ error: 'accent/shade must be #RRGGBB' }, { status: 400 });

    let photoHref = '';
    if (photoDataUrl) {
      // uploads: base64 jpeg/png/webp only — no SVG into librsvg (audit 2026-11-13 #2)
      if (!isSafeImageDataUrl(photoDataUrl)) return Response.json({ error: 'upload must be a JPEG, PNG or WebP image' }, { status: 400 });
      photoHref = photoDataUrl;
    } else if (photoUrl) {
      if (!isAllowedPhotoUrl(photoUrl)) return Response.json({ error: 'photo must be a Pexels image URL' }, { status: 400 });
      const r = await fetch(photoUrl, { redirect: 'error', signal: AbortSignal.timeout(12000) });
      if (!r.ok) return Response.json({ error: `photo fetch failed: HTTP ${r.status}` }, { status: 400 });
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 12 * 1024 * 1024) return Response.json({ error: 'photo too large' }, { status: 400 });
      photoHref = `data:image/jpeg;base64,${buf.toString('base64')}`;
    }

    const svg = isV2Template(template)
      ? renderV2ById(template, { title, accentWord, accent, chip, eyebrow, shade, brand, photoHref })
      : buildThumbSvg(template, { title, accentWord, accent, chip, eyebrow, shade, brand, photoHref });
    const jpeg = await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
    const words = String(title || '').trim().split(/\s+/).filter(Boolean).length;
    const reqPhoto = Boolean(TEMPLATES[template]?.needsPhoto || (isV2Template(template) && v2NeedsPhoto(template)));
    return Response.json({
      image: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
      bytes: jpeg.length,
      words,
      lines: wrapForTemplate(template, title),
      accentWordSuggested: pickAccentWord(title),
      checklist: {
        wordsOk: words > 0 && words <= 7,
        photoOk: Boolean(photoHref) || !reqPhoto,
        sizeOk: jpeg.length < 2 * 1024 * 1024,
      },
    });
  } catch (e) {
    return Response.json({ error: e.message?.slice(0, 140) || 'render failed' }, { status: 500 });
  }
}
