// Emotional voice — this ISO week's free Kaggle GPU use (docs/qa/emotional-voice-qa.md EV-Q).
// Read-only: the engine records every GPU run in yt-mcp/state/gpu-usage/<slug>.json
// (committed by the produce job); this sums every channel's file — the free
// quota is per Kaggle account — into the same summary the engine's quota
// guard uses (studio/lib/gpu-usage.mjs). Owner + staff (the Voice drawer).
import { requireRole } from '@/lib/route-auth';
import { readRegistry, readRepoJSON } from '@/lib/channels-registry';
import { gpuUsageSummary, gpuUsageLine, gpuUsagePath, mergeGpuUsage } from '@/lib/gpu-usage.mjs';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  if (!(await requireRole(req, ['owner', 'staff']))) return Response.json({ error: 'not signed in' }, { status: 401 });
  let usages = [];
  try {
    const reg = await readRegistry();
    const slugs = [...new Set((reg.channels || []).map((c) => c && c.slug).filter(Boolean))];
    // a channel that never used the GPU has no file (null) — that is 0, not an error
    usages = await Promise.all(slugs.map((s) => readRepoJSON(gpuUsagePath(s)).catch(() => null)));
  } catch (e) {
    return Response.json({ error: `GPU use can't load: ${String(e.message || e).slice(0, 120)}` }, { status: 502 });
  }
  const summary = gpuUsageSummary(mergeGpuUsage(usages));
  return Response.json({ ok: true, ...summary, line: gpuUsageLine(summary) });
}
