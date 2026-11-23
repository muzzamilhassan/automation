// Creator City Phase 2 item 5 — GET the Library's non-video tabs: everything
// the pipeline made (scripts, voice, thumbnails, research), one page at a time.
// Read-only. Sources + shaping: studio/lib/library-artifacts.mjs.
//
//   ?kind=script|voice|thumbnail|research   omit = counts only (items [])
//   ?channel=<slug>  ?limit=<1..60>  ?before=<the previous nextBefore cursor>
//
// → { ok, items, counts: { [kind]: { total, byChannel } } | null, nextBefore }
//   (counts on the first page only; null on before=… pages)
//
// Scope (fail closed, same rule as /api/library): owner/staff see every
// channel; a client only their own channels; a registry error = nothing.
// A DB that is missing or throws answers 503 — never an empty "nothing made".
// Blob URLs never appear in the answer (items carry `stored`, not the URL).
import { getUser } from '@/lib/route-auth';
import { slugsForUser } from '@/lib/access';
import { db, dbReady } from '@/lib/db.mjs';
import { adaptPostgres } from '@/lib/provider-routing';
import { makeArtifactsRead, parseArtifactQuery, emptyCounts } from '@/lib/library-artifacts.mjs';

export const dynamic = 'force-dynamic';

const ROLES = ['owner', 'staff', 'client'];

export async function GET(req) {
  const user = await getUser(req).catch(() => null);
  if (!user) return Response.json({ ok: false, error: 'not signed in' }, { status: 401 });
  if (!ROLES.includes(user.role)) return Response.json({ ok: false, error: 'your role does not allow this' }, { status: 403 });

  const query = parseArtifactQuery(new URL(req.url).searchParams);
  if (query.error) return Response.json({ ok: false, error: query.error }, { status: 400 });

  // FAIL-CLOSED scope: null = all (owner/staff); a client's list, or [] on error
  const owned = await slugsForUser(user).catch(() => []);
  if (Array.isArray(owned) && !owned.length) {
    return Response.json({ ok: true, items: [], counts: emptyCounts(), nextBefore: null });
  }

  if (!dbReady || !db) return Response.json({ ok: false, error: 'library_unavailable' }, { status: 503 });

  try {
    const read = makeArtifactsRead(adaptPostgres(db));
    // counts ride on the FIRST page only — a "Load more" (before=…) skips the GROUP BYs
    const [page, counts] = await Promise.all([
      query.kind
        ? read.list({ kind: query.kind, channel: query.channel, limit: query.limit, before: query.before, scope: owned })
        : Promise.resolve({ items: [], nextBefore: null }),
      query.before ? Promise.resolve(null) : read.counts({ scope: owned }),
    ]);
    return Response.json({ ok: true, items: page.items, counts, nextBefore: page.nextBefore });
  } catch {
    return Response.json({ ok: false, error: 'library_unavailable' }, { status: 503 });
  }
}
