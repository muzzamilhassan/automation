// Phase C — the gallery's sample lookup: template_id → { mp4, poster } from
// the Neon template_previews table (CI-written render outputs — the
// sanctioned pipeline-artifact data class). Owner-gated like the desk
// surfaces.
// Live-fix wave B1 (P8): media URLs carry `v` (the render time) so the media
// route can serve them immutable from the CDN; a re-render gets a new URL.
// The shared DB client (@/lib/db) replaces a new connection per request.
import { getUser } from '@/lib/route-auth';
import { db, dbReady } from '@/lib/db';
import { previewMediaUrl } from '@/lib/template-media.mjs';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const user = await getUser(req);
  if (!user || !['owner', 'staff'].includes(user.role)) return Response.json({ error: 'not signed in' }, { status: 401 });
  // #119 BUG-4 kept: no usable DATABASE_URL → the same honest 503, never a raw 500.
  if (!dbReady) return Response.json({ samples: {}, error: 'db unavailable' }, { status: 503 });
  try {
    const rows = await db`SELECT family_id, template_id, mp4_url, poster_url, rendered_at FROM template_previews ORDER BY rendered_at DESC`;
    const samples = {};       // keyed by template_id — one row per template
    const familySamples = {}; // keyed by family — the family card's latest
    for (const r of rows) {
      if (r.mp4_url) {
        samples[r.template_id] = {
          mp4: previewMediaUrl(r.template_id, 'mp4', r.rendered_at),
          poster: r.poster_url ? previewMediaUrl(r.template_id, 'poster', r.rendered_at) : null,
          familyId: r.family_id,
          renderedAt: r.rendered_at,
        };
        if (!familySamples[r.family_id]) familySamples[r.family_id] = samples[r.template_id];
      }
    }
    return Response.json({ samples, familySamples });
  } catch (e) {
    return Response.json({ samples: {}, error: String(e.message || e).slice(0, 120) }, { status: 502 });
  }
}
