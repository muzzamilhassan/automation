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
    const rows = await sql`SELECT family_id, template_id, mp4_url, poster_url, rendered_at FROM template_previews`;
    const samples = {};
    for (const r of rows) {
      if (r.mp4_url) samples[r.family_id] = { mp4: r.mp4_url, poster: r.poster_url, templateId: r.template_id, renderedAt: r.rendered_at };
    }
    return Response.json({ samples });
  } catch (e) {
    return Response.json({ samples: {}, error: String(e.message || e).slice(0, 120) }, { status: 502 });
  } finally {
    await sql.end();
  }
}
