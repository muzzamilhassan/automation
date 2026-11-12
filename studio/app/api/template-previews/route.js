// Phase C — the gallery's sample lookup: template_id → { mp4, poster } from
// the Neon template_previews table (CI-written render outputs — the
// sanctioned pipeline-artifact data class). Owner-gated like the desk
// surfaces.
import { getUser } from '@/lib/route-auth';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const user = await getUser(req);
  if (!user || !['owner', 'staff'].includes(user.role)) return Response.json({ error: 'not signed in' }, { status: 401 });
  const { default: postgres } = await import('postgres');
  const url = process.env.DATABASE_URL;
  if (!url) return Response.json({ samples: {}, error: 'db unavailable' }, { status: 503 });
  const sql = postgres(url, { max: 1, idle_timeout: 5 });
  try {
    const rows = await sql`SELECT family_id, template_id, mp4_url, poster_url, rendered_at FROM template_previews ORDER BY rendered_at DESC`;
    const samples = {};       // keyed by template_id — one row per template
    const familySamples = {}; // keyed by family — the family card's latest
    for (const r of rows) {
      if (r.mp4_url) {
        const enc = encodeURIComponent(r.template_id);
        samples[r.template_id] = {
          mp4: `/api/template-previews/media?id=${enc}&kind=mp4`,
          poster: r.poster_url ? `/api/template-previews/media?id=${enc}&kind=poster` : null,
          familyId: r.family_id,
          renderedAt: r.rendered_at,
        };
        if (!familySamples[r.family_id]) familySamples[r.family_id] = samples[r.template_id];
      }
    }
    return Response.json({ samples, familySamples });
  } catch (e) {
    return Response.json({ samples: {}, error: String(e.message || e).slice(0, 120) }, { status: 502 });
  } finally {
    await sql.end();
  }
}
