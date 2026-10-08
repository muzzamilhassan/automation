// Saves/updates the profile of a connected channel (label, niche, style,
// voice, slots). This is step 2 of the Add Channel wizard — the token was
// already stored during the Google login.
import { requireRole } from '@/lib/route-auth';
import { readRegistry, upsertChannel } from '@/lib/channels-registry';
import { STYLE_BY_ID } from '@/lib/styles-catalog';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  if (!(await requireRole(req, ['owner']))) return Response.json({ error: 'not signed in' }, { status: 401 });

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
  // 10-09 ACTIVATION CONSENT: autopilot starts ONLY on explicit consent —
  // recorded with the settings snapshot (compliance: YouTube API Developer
  // Policies require express pre-execution consent for automated uploads).
  if (body.startAutopilot === true) {
    entry.autopilot = true;
    entry.autopilotStartedAt = new Date().toISOString();
    entry.consentedAt = entry.autopilotStartedAt;
    entry.consent = {
      at: entry.autopilotStartedAt,
      niche: String(body.niche || entry.niche || '').slice(0, 120),
      style: entry.style || '',
      slots: entry.slots || [],
      docDay: entry.docDay || '',
    };
  } else if (body.startAutopilot === false) {
    entry.autopilot = false;
  }
  if (body.docDay != null) {
    entry.docDay = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(body.docDay) ? body.docDay : (entry.docDay || 'Tue');
  }
  if (body.slots != null) {
    entry.slots = String(body.slots)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 6);
  }
  // 10-05 CHANNEL FACTORY — the brand kit (identity + SEO tags + script rules
  // + music mood) drafted by the generator, edited and approved by the user.
  if (body.kit && typeof body.kit === 'object') {
    const k = body.kit;
    const s = (v, n) => (v != null ? String(v).slice(0, n) : undefined);
    entry.kit = {
      ...(entry.kit || {}),
      ...(s(k.eyebrow, 70) != null ? { eyebrow: s(k.eyebrow, 70) } : {}),
      ...(s(k.tagline, 90) != null ? { tagline: s(k.tagline, 90) } : {}),
      ...(s(k.keyword, 60) != null ? { keyword: s(k.keyword, 60) } : {}),
      ...(s(k.kwShort, 40) != null ? { kwShort: s(k.kwShort, 40) } : {}),
      ...(s(k.theme, 80) != null ? { theme: s(k.theme, 80) } : {}),
      ...(Array.isArray(k.niches) ? { niches: k.niches.slice(0, 6).map((x) => String(x).slice(0, 60)) } : {}),
      ...(s(k.authority, 80) != null ? { authority: s(k.authority, 80) } : {}),
      ...(Array.isArray(k.tags) ? { tags: k.tags.slice(0, 15).map((x) => String(x).slice(0, 50)) } : {}),
      ...(Array.isArray(k.musicFeels) ? { musicFeels: k.musicFeels.slice(0, 5).map((x) => String(x).slice(0, 30)) } : {}),
      ...(s(k.description, 900) != null ? { description: s(k.description, 900) } : {}),
      ...(k.script && typeof k.script === 'object' ? { script: k.script } : {}),
      ...(s(k.longSlot, 5) != null ? { longSlot: s(k.longSlot, 5) } : {}),
    };
  }
  entry.profileSavedAt = new Date().toISOString();

  try {
    await upsertChannel(entry, `studio: profile for ${slug}`);
    return Response.json({ ok: true, entry });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }
}
