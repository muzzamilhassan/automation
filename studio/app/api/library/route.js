// Phase 3 "Library" — every upload the panel has a record of, deduped and
// newest first. Reads ONLY the state the panel already keeps (per-channel
// state files + the CI episode log); never calls YouTube per row.
// GET ?slug=&kind=&status=&q=&limit=&offset=
// Honest by construction: a source that failed is listed in `errors` and
// `complete` turns false — the page must never present a partial list as whole.
import { getUser } from '@/lib/route-auth';
import { slugsForUser } from '@/lib/access';
import { state, longformUploads, MODE } from '@/lib/data.mjs';
import { buildLibrary, filterLibrary, paginate, countLibrary } from '@/lib/library-view.mjs';

export const dynamic = 'force-dynamic';

// Load one source; an exception or an empty answer both count as "couldn't
// read" — these files always hold data for a running network, so empty means
// the read failed upstream (the loaders swallow their own errors).
async function load(id, label, fn) {
  try {
    const val = await fn();
    const n = val && typeof val === 'object' ? Object.keys(val).length : 0;
    if (!n) return { id, label, ok: false, val: {}, message: `${label} came back empty — it may be unreachable right now.` };
    return { id, label, ok: true, val };
  } catch {
    return { id, label, ok: false, val: {}, message: `Couldn't read ${label.toLowerCase()} right now.` };
  }
}

export async function GET(req) {
  const user = await getUser(req).catch(() => null);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  // FAIL-CLOSED scope: clients get only their channels; a registry blip = []
  // (nothing), never the whole network. owner/staff get null = all.
  const owned = await slugsForUser(user).catch(() => []);

  const sp = new URL(req.url).searchParams;
  const slug = sp.get('slug') || '';

  const [st, lf] = await Promise.all([
    load('channel-state', 'Channel upload history', state),
    load('episode-log', 'Episode upload log', longformUploads),
  ]);

  let items = buildLibrary({ state: st.val, longform: lf.val });
  if (owned) items = items.filter((it) => owned.includes(it.slug));
  if (slug) items = items.filter((it) => it.slug === slug);

  const counts = countLibrary(items); // per-channel totals before kind/status/search
  const filtered = filterLibrary(items, { kind: sp.get('kind'), status: sp.get('status'), q: sp.get('q') });
  const page = paginate(filtered, { limit: sp.get('limit'), offset: sp.get('offset') });

  const sources = [st, lf].map(({ id, label, ok }) => ({ id, label, ok }));
  const errors = [st, lf].filter((s) => !s.ok).map(({ id, message }) => ({ source: id, message }));

  return Response.json({
    items: page.items,
    total: page.total,
    limit: page.limit,
    offset: page.offset,
    counts,
    sources,
    errors,
    complete: errors.length === 0,
    // what the records can't tell us, said out loud
    notes: [
      'Shorts older than the last 60 per channel are not recorded here.',
      'Published/Scheduled is worked out from the publish time, not read from YouTube.',
    ],
    mode: MODE,
  });
}
