// A1 SESSION MANAGEMENT — list your active devices / sign out everywhere.
// P4/S6 (#106) — owner mode on the same route: every user's sessions plus
// per-session INSTANT revoke (the row flips `revoked`; userByToken rejects it
// on the device's very next request). Self-service behavior is untouched
// (AC-P4-31); owner-mode endpoints re-check requireRole('owner') server-side
// — the Edge proxy is never the only gate.
// GET    /api/sessions           → active sessions for the signed-in user
// GET    /api/sessions?scope=all → owner only: every user's sessions
// POST   /api/sessions           → owner only: revoke one session { id }
// DELETE /api/sessions?all=1     → revoke every session of this user
import { getUser, requireRole } from '@/lib/route-auth';
import { revokeAllForEmail, listSessions, listAllSessions, revokeSessionById } from '@/lib/session-db';
import { db, dbReady } from '@/lib/db.mjs';
import { adaptPostgres } from '@/lib/provider-routing';
import { appendAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const user = await getUser(req);
  if (!user || !user.email?.includes('@') || !dbReady) return Response.json({ sessions: [] });
  // owner mode — ALL users' sessions (server-side role re-check, not just proxy)
  if (new URL(req.url).searchParams.get('scope') === 'all') {
    if (!(await requireRole(req, ['owner']))) return Response.json({ error: 'owner only' }, { status: 403 });
    return Response.json({ sessions: await listAllSessions(adaptPostgres(db)), current: user.session_id || 0 });
  }
  return Response.json({ sessions: await listSessions(user.email), current: user.session_id || 0 });
}

export async function POST(req) {
  const user = await getUser(req);
  if (!user || !dbReady) return Response.json({ error: 'not signed in' }, { status: 401 });
  if (!(await requireRole(req, ['owner']))) return Response.json({ error: 'owner only' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const row = await revokeSessionById(Number(body?.id), adaptPostgres(db));
  if (!row) return Response.json({ error: 'session not found or already revoked' }, { status: 404 });
  await appendAudit(user.email, 'revoke-session', `id=${row.id} ${row.email}`);
  return Response.json({ ok: true, revoked: { id: row.id, email: row.email } });
}

export async function DELETE(req) {
  const user = await getUser(req);
  if (!user || !user.email?.includes('@') || !dbReady) return Response.json({ error: 'not signed in' }, { status: 401 });
  const n = await revokeAllForEmail(user.email);
  await appendAudit(user.email, 'sign-out-everywhere', `${n} session(s) revoked`);
  return Response.json({ ok: true, revoked: n });
}
