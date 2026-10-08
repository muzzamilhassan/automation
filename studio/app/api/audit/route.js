// 10-08 P1 — AUDIT FEED: who did what, newest first (owner + staff).
import { requireRole } from '@/lib/route-auth';
import { readRepoJSON } from '@/lib/channels-registry';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  if (!(await requireRole(req, ['owner', 'staff']))) return Response.json({ error: 'not signed in' }, { status: 401 });
  const d = await readRepoJSON('yt-mcp/audit.json').catch(() => null);
  return Response.json({ events: d?.events || [] });
}
