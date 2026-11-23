// Calendar (owner-approved 2026-11-23) — every real channel on one calendar.
// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD (UTC days, at most 62; default = this
// UTC month) → { ok, from, to, channels:[{slug,name,accent,short}], items, fetchedAt, partial? }
//
// Where each kind comes from (merged + deduped in lib/calendar-view.mjs):
//   published / scheduled — channel state files + the CI episode log (the
//       Library's records: recent, with titles + go-public times), Neon
//       upload_intents (status uploaded: the month-long record, link + upload
//       time only), and scripts that became a video (video_id + publish_at)
//   waiting   — scripts awaiting_review, or approved with no video yet
//   free      — each channel's slot times (registry kit → brands.json) on its
//               cadence days (yt-mcp/cadence.json), from now on, where
//               nothing real sits
// Honest by construction: a source that fails is named in `partial` and the
// rest still answer; when nothing answers → 503 { ok:false }. Free slots are
// left out entirely when the cadence can't be read (never guessed).
// Owner + staff only (route-roles.js), re-checked here — fail-closed.
import { getUser } from '@/lib/route-auth';
import { brands, state, longformUploads } from '@/lib/data.mjs';
import { db, dbReady } from '@/lib/db';
import { deriveBrandList } from '@/lib/brand-list.mjs';
import { buildLibrary } from '@/lib/library-view.mjs';
import { validateRange, addDays, dayOf, scheduleFor, expandSlots, mergeItems, laneOf } from '@/lib/calendar-view.mjs';

export const dynamic = 'force-dynamic';

const iso = (v) => (v instanceof Date ? v.toISOString() : v || null);

// one source; an exception or an empty answer both count as "couldn't read"
// (same rule as /api/library: these always hold data for a running network)
async function load(fn, { emptyIsFailure = true } = {}) {
  try {
    const val = await fn();
    const empty = val == null || (typeof val === 'object' && !Array.isArray(val) && !Object.keys(val).length);
    return emptyIsFailure && empty ? { ok: false, val: null } : { ok: true, val };
  } catch {
    return { ok: false, val: null };
  }
}

export async function GET(req) {
  const user = await getUser(req).catch(() => null);
  if (!user) return Response.json({ ok: false, error: 'not signed in' }, { status: 401 });
  if (!['owner', 'staff'].includes(user.role)) {
    return Response.json({ ok: false, error: 'your role does not allow this' }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;
  const now = new Date();
  const monthStart = dayOf(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = dayOf(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const range = validateRange(sp.get('from') || monthStart, sp.get('to') || monthEnd);
  if (!range.ok) return Response.json({ ok: false, error: range.error }, { status: 400 });
  const { from, to } = range;

  const [regR, cadR, stR, lfR, intentsR, scriptsR] = await Promise.all([
    load(async () => {
      const { registryChannels } = await import('@/lib/channels-registry');
      return registryChannels();
    }, { emptyIsFailure: false }),
    load(async () => {
      const { readRepoJSON } = await import('@/lib/channels-registry');
      return readRepoJSON('yt-mcp/cadence.json');
    }),
    load(state),
    load(longformUploads),
    load(async () => {
      if (!dbReady || !db) throw new Error('no database');
      // a video goes public up to a day after its run day: read 2 days back
      return db`SELECT channel_id, kind, video_id, updated_at FROM upload_intents
        WHERE status = 'uploaded' AND video_id IS NOT NULL
          AND slot_date >= ${addDays(from, -2)} AND slot_date <= ${to}`;
    }, { emptyIsFailure: false }),
    load(async () => {
      if (!dbReady || !db) throw new Error('no database');
      return db`SELECT id, channel_id, title, status, kind, video_id, slot_date, publish_at FROM scripts
        WHERE (status IN ('awaiting_review', 'approved') AND video_id IS NULL AND slot_date >= ${from} AND slot_date <= ${to})
           OR (video_id IS NOT NULL AND publish_at >= ${`${from}T00:00:00Z`}::timestamptz AND publish_at < ${`${addDays(to, 1)}T00:00:00Z`}::timestamptz)`;
    }, { emptyIsFailure: false }),
  ]);

  // real channels only: active legacy brands + active registry channels
  let legacy = {};
  try { legacy = brands() || {}; } catch { legacy = {}; }
  const registry = regR.ok && Array.isArray(regR.val) ? regR.val : [];
  const channels = deriveBrandList(legacy, registry).map((c) => ({ slug: c.slug, name: c.label, accent: c.accent, short: c.short }));
  const known = new Set(channels.map((c) => c.slug));

  const partial = [];
  if (!regR.ok) partial.push('registry');
  if (!stR.ok) partial.push('channel_state');
  if (!lfR.ok) partial.push('episode_log');
  if (!intentsR.ok) partial.push('upload_intents');
  if (!scriptsR.ok) partial.push('scripts');
  if (!cadR.ok) partial.push('cadence');

  const nothing = !stR.ok && !lfR.ok && !intentsR.ok && !scriptsR.ok && !cadR.ok;
  if (!channels.length || nothing) {
    return Response.json({ ok: false, error: "Couldn't read the calendar right now.", partial }, { status: 503 });
  }

  // 1. videos the Library knows (titles + go-public times)
  const library = buildLibrary({ state: stR.val || {}, longform: lfR.val || {}, now: now.getTime() });
  const videoRows = library.map((it) => ({ channel: it.slug, at: it.at, videoId: it.videoId, title: it.title, lane: laneOf(it.kind) }));
  // 2. scripts that became a video (title + go-public time)
  const scriptRows = (scriptsR.val || []).filter((s) => s.video_id).map((s) => ({
    channel: s.channel_id, at: iso(s.publish_at), videoId: s.video_id, title: s.title || '', lane: laneOf(s.kind),
  }));
  // 3. the month-long upload record (link + upload time; no display title)
  const intentRows = (intentsR.val || []).map((r) => ({
    channel: r.channel_id, at: iso(r.updated_at), videoId: r.video_id, title: '', lane: laneOf(r.kind), untitledUpload: true,
  }));
  const waiting = (scriptsR.val || []).filter((s) => !s.video_id).map((s) => ({
    channel: s.channel_id,
    date: s.slot_date,
    at: iso(s.publish_at),
    title: s.title || '',
    scriptId: s.id,
    lane: laneOf(s.kind),
    stage: s.status === 'awaiting_review' ? 'review' : 'approved',
  }));

  // 4. free slots — only when the cadence answered
  let slots = [];
  if (cadR.ok) {
    const regBySlug = new Map(registry.map((e) => [e.slug, e]));
    for (const c of channels) {
      const sched = scheduleFor({
        slug: c.slug,
        staticEntry: legacy[c.slug] || null,
        reg: regBySlug.get(c.slug) || null,
        cadence: cadR.val[c.slug] || null,
        pausedUntil: stR.ok ? stR.val[c.slug]?.pausedUntil || null : null,
      });
      slots.push(...expandSlots(sched, from, to, now.getTime()));
    }
  }

  const items = mergeItems(
    { published: [...videoRows, ...scriptRows, ...intentRows], waiting, slots },
    { now: now.getTime() },
  ).filter((it) => known.has(it.channel) && it.date >= from && it.date <= to);

  return Response.json({
    ok: true,
    from,
    to,
    channels,
    items,
    fetchedAt: now.toISOString(),
    ...(partial.length ? { partial } : {}),
  });
}
