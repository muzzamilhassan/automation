// Real "what viewers typed into YouTube search" terms, per channel — the data
// the Analytics page's search card renders. Written to yt-mcp/terms-<slug>.json
// by the CI engine (viewer-terms.mjs, verified 10-03). No dummy fallbacks.
import { terms } from '../../../lib/data.mjs';

export const dynamic = 'force-dynamic';

const SLUGS = ['quotequarry', 'investors-compass', 'money-rulebook', 'debt-free-doctrine'];

export async function GET(req) {
  const slug = new URL(req.url).searchParams.get('slug') || 'all';
  const wanted = slug === 'all' ? SLUGS : [slug];
  const merged = new Map();
  const perChannel = {};
  let any = false;
  for (const s of wanted) {
    try {
      const d = await terms(s);
      const rows = (d?.rows || d?.terms || []).map((r) => ({
        term: String(r.term || r[0] || ''),
        views: Number(r.views ?? r[1] ?? 0),
      })).filter((r) => r.term);
      perChannel[s] = rows;
      if (rows.length) any = true;
      for (const r of rows) merged.set(r.term, (merged.get(r.term) || 0) + r.views);
    } catch {
      perChannel[s] = [];
    }
  }
  const all = [...merged.entries()]
    .map(([term, views]) => ({ term, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 20);
  return Response.json({ slug, terms: slug === 'all' ? all : perChannel[slug] || [], hasData: any });
}
