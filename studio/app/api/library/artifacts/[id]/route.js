// Creator City Phase 2 item 5 — GET one Library item.
//
//   a-<n>      a job_artifacts row. Voice/thumbnail: the BYTES, read through
//              the token-authenticated artifact store and hash-verified
//              (expectedHash = the row's content_hash). Served in ≤ 2 MB
//              ranges (206) — Vercel caps a response body at ~4.5 MB. A
//              Shorts script payload answers JSON { ok, item, text }.
//   s-<uuid>   a scripts row → JSON { ok, item, text }
//   r-<uuid>   a script's research → JSON { ok, item, sources, claims }
//   ?download=1  bytes come whole as an attachment (≤ 4 MB, else 413)
//
// Every decision (auth, scope, 404 for another channel, 410 for expired
// bytes, ranges, headers) lives in artifactResponse (studio/lib/
// library-artifacts.mjs) and is tested there with fakes. This file only
// wires the real user, scope, DB and store. The blob URL and its token never
// leave the server.
import { getUser } from '@/lib/route-auth';
import { slugsForUser } from '@/lib/access';
import { db, dbReady } from '@/lib/db.mjs';
import { adaptPostgres } from '@/lib/provider-routing';
import { makeArtifactStore } from '@/lib/artifact-store.mjs';
import { makeArtifactsRead, artifactResponse, makeBytesCache } from '@/lib/library-artifacts.mjs';

export const dynamic = 'force-dynamic';

// verified bytes, briefly, per warm instance — an audio seek is one Blob read, not one per range
const bytesCache = makeBytesCache();

export async function GET(req, ctx) {
  const user = await getUser(req).catch(() => null);
  if (!user) return Response.json({ ok: false, error: 'not signed in' }, { status: 401 });

  const { id } = await ctx.params;
  const result = await artifactResponse({
    user,
    id,
    // FAIL-CLOSED scope: null = all (owner/staff); a client's list; a throw = [] inside
    scopeFor: (u) => slugsForUser(u),
    read: dbReady && db ? makeArtifactsRead(adaptPostgres(db)) : null,
    getBytes: (url, opts) => bytesCache.get(opts.expectedHash, () => makeArtifactStore().getBytes(url, opts)),
    download: new URL(req.url).searchParams.get('download') === '1',
    rangeHeader: req.headers.get('range'),
  });

  if (result.json) return Response.json(result.json, { status: result.status });
  return new Response(result.bytes, { status: result.status, headers: result.headers });
}
