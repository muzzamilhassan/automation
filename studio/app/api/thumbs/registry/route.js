// GET /api/thumbs/registry — the Phase 5 thumbnail registry, read-only for the
// /thumbs panel (T2d minimal surface: the needsPhoto:false launch set with its
// per-niche bindings; the full assign flow is later polish). The launch set
// comes from the registry loader — never a second data source.
import { getUser } from '@/lib/route-auth';
import { loadThumbRegistry } from '@/lib/thumb-registry';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  const { designs, invalid } = loadThumbRegistry();
  return Response.json({
    registry: designs.map((d) => ({
      id: d.id,
      label: d.label,
      category: d.category,
      niches: d.niches,
    })),
    invalid,
  });
}
