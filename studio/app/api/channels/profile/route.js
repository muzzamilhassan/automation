// Saves/updates the profile of a connected channel (label, niche, sub-niches, style,
// voice, slots). Supports both wizard-added channels and existing living channels.
import { requireRole, getUser } from '@/lib/route-auth';
import { appendAudit } from '@/lib/audit';
import { readRegistry, upsertChannel, stripTokenMaterial } from '@/lib/channels-registry';
import { canAccessChannelSlug } from '@/lib/access';
import { STYLE_BY_ID } from '@/lib/styles-catalog';
import { brands } from '@/lib/data.mjs';
import { kitFieldPatch } from '@/lib/channel-kit-fields.mjs';
import { protectFilledFields } from '@/lib/edit-prefill.mjs';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const user = await getUser(req);
  if (!user || !['owner', 'staff', 'client'].includes(user.role)) return Response.json({ error: 'not signed in' }, { status: 401 });

  const slug = new URL(req.url).searchParams.get('slug');
  if (!slug) return Response.json({ error: 'missing slug' }, { status: 400 });
  // #122 R6 (SEC-9 rider): a client may only read their OWN channel's profile
  // — previously any slug was readable by changing the web address.
  if (user.role === 'client' && !(await canAccessChannelSlug(user, slug))) {
    return Response.json({ error: 'this channel is not linked to your account' }, { status: 403 });
  }

  let reg;
  try {
    reg = await readRegistry();
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }

  let entry = (reg.channels || []).find((c) => c.slug === slug);
  if (!entry) {
    // Check legacy living brands
    const bAll = brands() || {};
    const b = bAll[slug];
    if (b) {
      entry = {
        slug,
        label: b.label || slug.toUpperCase(),
        handle: b.handle || '',
        niche: b.niche || '',
        style: b.style || 'cinematic',
        voice: b.voice || 'am_michael',
        accent: b.accent || '#38BDF8',
        slots: Array.isArray(b.slots) ? b.slots : ['22:35'],
        docDay: b.docDay || 'Tue',
        kit: {
          eyebrow: b.eyebrow || '',
          tagline: b.tagline || '',
          tags: Array.isArray(b.tags) ? b.tags : [],
          niches: Array.isArray(b.niches) ? b.niches : (b.niche ? [b.niche] : []),
          description: b.description || '',
        },
        autopilot: true,
      };
    }
  }

  if (!entry) return Response.json({ error: 'channel not found' }, { status: 404 });
  // live fix wave A2 (T4-02): the static brand kit too, so "Edit setup" can
  // show what the engine falls back to (lib/edit-prefill.mjs engineFormValues)
  let legacy = null;
  try { legacy = (brands() || {})[slug] || null; } catch { legacy = null; }
  // #122 (SEC-9): the browser never receives tokenEnc — projected entry only
  return Response.json({ ok: true, channel: stripTokenMaterial(entry), legacy });
}

export async function POST(req) {
  if (!(await requireRole(req, ['owner']))) return Response.json({ error: 'not signed in' }, { status: 401 });

  let body = await req.json().catch(() => ({}));
  const { slug } = body;
  if (!slug) return Response.json({ error: 'missing slug' }, { status: 400 });

  let reg;
  try {
    reg = await readRegistry();
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }

  let entry = (reg.channels || []).find((c) => c.slug === slug);
  if (!entry) {
    // If not in registry yet, initialize from living brands so existing channels can be edited!
    const bAll = brands() || {};
    const b = bAll[slug] || {};
    entry = {
      slug,
      label: b.label || slug.toUpperCase(),
      handle: b.handle || '',
      niche: b.niche || '',
      style: b.style || 'cinematic',
      voice: b.voice || 'am_michael',
      accent: b.accent || '#38BDF8',
      slots: Array.isArray(b.slots) ? b.slots : ['22:35'],
      docDay: b.docDay || 'Tue',
      active: true,
      autopilot: true,
      kit: {
        eyebrow: b.eyebrow || '',
        tagline: b.tagline || '',
        tags: Array.isArray(b.tags) ? b.tags : [],
        niches: Array.isArray(b.niches) ? b.niches : (b.niche ? [b.niche] : []),
        description: b.description || '',
      },
    };
    reg.channels = reg.channels || [];
    reg.channels.push(entry);
  }

  // live fix wave A2 (T4-02): an empty slots/tags/description/eyebrow/
  // tagline/pillars/niche never wipes a filled one unless the client lists
  // it in body.clear (an explicit clear). Kept fields are reported back.
  const guard = protectFilledFields(body, entry);
  body = guard.body;

  if (body.label) entry.label = String(body.label).slice(0, 60);
  if (body.niche != null) entry.niche = String(body.niche).slice(0, 120);
  if (body.style != null) entry.style = STYLE_BY_ID[body.style] ? body.style : '';
  if (body.voice != null) entry.voice = String(body.voice).slice(0, 40);
  if (body.accent != null) entry.accent = /^#[0-9a-fA-F]{6}$/.test(body.accent) ? body.accent : entry.accent;

  // 10-09 ACTIVATION CONSENT: autopilot starts ONLY on explicit consent
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

  // 10-16 PRODUCT SCALE: sub-niches handling
  const incomingSubNiches = Array.isArray(body.subNiches)
    ? body.subNiches
    : typeof body.subNiches === 'string'
      ? body.subNiches.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
      : null;

  // Kit configuration
  if (body.kit && typeof body.kit === 'object') {
    const k = body.kit;
    const s = (v, n) => (v != null ? String(v).slice(0, n) : undefined);
    const resolvedNiches = incomingSubNiches || (Array.isArray(k.niches) ? k.niches.slice(0, 12).map((x) => String(x).slice(0, 80)) : undefined);
    // feedback r1 A + G: thumbTemplates (design ids that rotate on uploads)
    // and hasChapters (Full story / Chapters) — validated, and patched ONLY
    // when sent, so another screen's save never wipes them.
    const extra = kitFieldPatch(k);
    if (extra.error) return Response.json({ error: extra.error }, { status: 400 });

    entry.kit = {
      ...(entry.kit || {}),
      ...(s(k.eyebrow, 70) != null ? { eyebrow: s(k.eyebrow, 70) } : {}),
      ...(s(k.tagline, 90) != null ? { tagline: s(k.tagline, 90) } : {}),
      ...(s(k.keyword, 60) != null ? { keyword: s(k.keyword, 60) } : {}),
      ...(s(k.kwShort, 40) != null ? { kwShort: s(k.kwShort, 40) } : {}),
      ...(s(k.theme, 80) != null ? { theme: s(k.theme, 80) } : {}),
      ...(resolvedNiches ? { niches: resolvedNiches } : {}),
      ...(s(k.authority, 80) != null ? { authority: s(k.authority, 80) } : {}),
      ...(Array.isArray(k.tags) ? { tags: k.tags.slice(0, 20).map((x) => String(x).slice(0, 50)) } : {}),
      ...(Array.isArray(k.musicFeels) ? { musicFeels: k.musicFeels.slice(0, 5).map((x) => String(x).slice(0, 30)) } : {}),
      ...(s(k.description, 900) != null ? { description: s(k.description, 900) } : {}),
      ...(k.script && typeof k.script === 'object' ? { script: k.script } : {}),
      ...(s(k.longSlot, 5) != null ? { longSlot: s(k.longSlot, 5) } : {}),
      ...extra.patch,
    };
  } else if (incomingSubNiches) {
    entry.kit = { ...(entry.kit || {}), niches: incomingSubNiches };
  }

  // #106 T4c: destinations — where this channel publishes off-YouTube (FB
  // page, IG/Threads/TikTok handles). Saved into entry.destinations (the
  // schema the engine's lib/registry.mjs reads) AND mirrored into
  // kit.destinations — T4d durability: the kit JSONB survives OAuth
  // re-connects and there is no dedicated destinations column yet.
  // Handles normalize with the leading @ stripped on save (the importer's
  // normHandle convention); fbPageId accepts the numeric legacy page form
  // (e.g. 114550268199751) or the UC… page form — both stored verbatim.
  // Round 1: a non-object envelope and off-charset handles are rejected
  // (400) — silently coercing them to {} would wipe saved destinations.
  if (body.destinations != null) {
    if (typeof body.destinations !== 'object' || Array.isArray(body.destinations)) {
      return Response.json({ error: 'destinations must be an object' }, { status: 400 });
    }
    const d = body.destinations;
    const pageId = String(d.fbPageId ?? '').trim();
    const FB_PAGE_ID_RE = /^(?:\d{6,}|UC[A-Za-z0-9_-]{10,})$/;
    const HANDLE_RE = /^[\w.-]{1,60}$/;
    if (pageId !== '' && !FB_PAGE_ID_RE.test(pageId)) {
      return Response.json(
        { error: 'destinations.fbPageId: use the numeric page ID (e.g. 114550268199751) or the UC… page ID' },
        { status: 400 },
      );
    }
    const handle = (v) => {
      const h = String(v ?? '').trim().replace(/^@+/, '');
      if (h !== '' && !HANDLE_RE.test(h)) return null;
      return h;
    };
    const igHandle = handle(d.igHandle);
    const threadsHandle = handle(d.threadsHandle);
    const tiktokHandle = handle(d.tiktokHandle);
    if (igHandle === null || threadsHandle === null || tiktokHandle === null) {
      return Response.json(
        { error: 'destination handles: letters, digits, dots, dashes and underscores only (leading @ is stripped)' },
        { status: 400 },
      );
    }
    const dest = Object.fromEntries(
      Object.entries({
        fbPageId: pageId,
        igHandle,
        threadsHandle,
        tiktokHandle,
      }).filter(([, v]) => v !== ''),
    );
    entry.destinations = dest;
    entry.kit = { ...(entry.kit || {}), destinations: dest };
  }

  entry.profileSavedAt = new Date().toISOString();

  try {
    await upsertChannel(entry, `studio: profile for ${slug}`);
    // admin-panel review #8: every mutating route leaves an audit row
    const actor = (await getUser(req).catch(() => null))?.email || 'owner';
    await appendAudit(actor, 'profile-save', `${slug}: ${Object.keys(body).filter((k) => k !== 'slug').join(',')}`);
    // #122 (SEC-9): the saved entry is echoed WITHOUT token material
    return Response.json({ ok: true, entry: stripTokenMaterial(entry), ...(guard.kept.length ? { kept: guard.kept } : {}) });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }
}
