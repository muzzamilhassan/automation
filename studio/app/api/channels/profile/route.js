// Saves/updates the profile of a connected channel (label, niche, style,
// voice, slots). This is step 2 of the Add Channel wizard — the token was
// already stored during the Google login.
import { isAuthed } from '@/lib/route-auth';
import { readRegistry, upsertChannel } from '@/lib/channels-registry';
import { STYLE_BY_ID } from '@/lib/styles-catalog';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  if (!(await isAuthed(req))) return Response.json({ error: 'not signed in' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { slug } = body;
  if (!slug) return Response.json({ error: 'missing slug' }, { status: 400 });

  let reg;
  try {
    reg = await readRegistry();
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }
  const entry = (reg.channels || []).find((c) => c.slug === slug);
  if (!entry) return Response.json({ error: 'unknown slug — connect the channel first' }, { status: 404 });

  if (body.label) entry.label = String(body.label).slice(0, 60);
  if (body.niche != null) entry.niche = String(body.niche).slice(0, 120);
  if (body.style != null) entry.style = STYLE_BY_ID[body.style] ? body.style : '';
  if (body.voice != null) entry.voice = String(body.voice).slice(0, 40);
  if (body.accent != null) entry.accent = /^#[0-9a-fA-F]{6}$/.test(body.accent) ? body.accent : entry.accent;
  if (body.slots != null) {
    entry.slots = String(body.slots)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 6);
  }
  entry.profileSavedAt = new Date().toISOString();

  try {
    await upsertChannel(entry, `studio: profile for ${slug}`);
    return Response.json({ ok: true, entry });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }
}
