// #106 Phase 4 T5 (S3 dashboard) — /api/warnings: the durable record behind
// every pipeline alert (D12/AC-P4-16). Owner + staff read; acknowledge is
// staff+owner ("seen" never unblocks — D11); owner manual-resolve REQUIRES a
// note (AC-P4-15: resolves are audited, never silent); "re-check now" runs
// the SAME probe runner the parked runs and the nightly job use
// (lib/warnings-probe probeParkedChannels, scoped to the row's channel).
// Every action re-checks the role server-side — the Edge proxy is only the
// first gate.
import { getUser, requireRole } from '@/lib/route-auth';
import { db, dbReady } from '@/lib/db.mjs';
import { adaptPostgres } from '@/lib/provider-routing';
import { makeWarningsStore } from '@/lib/warnings-store.mjs';
import { probeParkedChannels } from '@/lib/warnings-probe.mjs';
import { appendAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

function store() {
  return makeWarningsStore(adaptPostgres(db));
}

export async function GET(req) {
  const user = await getUser(req);
  if (!user || !['owner', 'staff'].includes(user.role)) return Response.json({ error: 'not signed in' }, { status: 401 });
  if (!dbReady) return Response.json({ open: [], resolved: [], error: 'db unavailable' });
  const s = store();
  const open = await s.listWarnings({ includeResolved: false });
  const resolved = await s.listWarnings({ includeResolved: true, limit: 50 });
  if (!open.ok) return Response.json({ error: open.error }, { status: 503 });
  const resolvedRows = resolved.ok ? resolved.rows.filter((r) => r.state === 'resolved') : [];
  // parked-channel badges: channels with an open blocks_publishing row (D11)
  const parked = [...new Set(open.rows.filter((r) => r.blocks_publishing === true).map((r) => r.channel_id))];
  return Response.json({ open: open.rows, resolved: resolvedRows, parked });
}

export async function POST(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!dbReady) return Response.json({ error: 'db unavailable' }, { status: 503 });
  const s = store();

  if (body.action === 'acknowledge') {
    // staff + owner: records "seen" (by/at) but NEVER unblocks (D11)
    if (!(await requireRole(req, ['owner', 'staff']))) return Response.json({ error: 'owner/staff only' }, { status: 403 });
    const r = await s.acknowledge(body.id, { by: user.email });
    if (!r.ok) return Response.json({ error: r.error || r.reason }, { status: r.reason === 'not_found' ? 404 : 409 });
    await appendAudit(user.email, 'warn-acknowledge', `#${body.id}`);
    return Response.json({ ok: true });
  }

  if (body.action === 'resolve') {
    // owner only, note REQUIRED (AC-P4-15: manual resolves are recorded)
    if (!(await requireRole(req, ['owner']))) return Response.json({ error: 'owner only' }, { status: 403 });
    if (!body.note || !String(body.note).trim()) return Response.json({ error: 'resolve note required' }, { status: 400 });
    const r = await s.resolve(body.id, { by: user.email, note: String(body.note).trim() });
    if (!r.ok) return Response.json({ error: r.error || r.reason }, { status: r.reason === 'not_found' ? 404 : 409 });
    await appendAudit(user.email, 'warn-resolve', `#${body.id} · ${String(body.note).trim().slice(0, 120)}`);
    return Response.json({ ok: true });
  }

  if (body.action === 'recheck') {
    // staff + owner: the "re-check now" button — the probe runner pattern
    // scoped to the row's channel (only mapped + auto_verifiable codes run;
    // a pass auto-resolves with resolved_by='probe', AC-P4-14).
    if (!(await requireRole(req, ['owner', 'staff']))) return Response.json({ error: 'owner/staff only' }, { status: 403 });
    const open = await s.openBlockingFor(body.channelId ?? null);
    if (!open.ok) return Response.json({ error: open.error }, { status: 503 });
    const r = await probeParkedChannels({ store: s, channelId: body.channelId ?? null, log: () => {} });
    await appendAudit(user.email, 'warn-recheck', `${body.channelId ?? 'all'} · checked ${r.checked ?? 0}`);
    return Response.json({ ok: r.ok, checked: r.checked ?? 0, results: r.results ?? [] });
  }

  return Response.json({ error: 'unknown action' }, { status: 400 });
}
