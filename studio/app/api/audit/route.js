// 10-08 P1 — AUDIT FEED: who did what, newest first (owner + staff).
// R2: reads the Neon audit_log table.
import { requireRole } from '@/lib/route-auth';
import { listAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  if (!(await requireRole(req, ['owner', 'staff']))) return Response.json({ error: 'not signed in' }, { status: 401 });
  return Response.json({ events: await listAudit(100) });
}
