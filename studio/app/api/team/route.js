// 10-08 P1 — TEAM management (owner only): the invite list lives in the
// Neon `users` table (mirrored to yt-mcp/access.json in the repo as the
// no-DB fallback) and gates Google sign-in roles.
import { requireRole, getUser } from '@/lib/route-auth';
import { appendAudit } from '@/lib/audit';
import { db, dbReady } from '@/lib/db.mjs';
import { revokeAllForEmail } from '@/lib/session-db';
import { readRepoJSON, writeRepoJSON } from '@/lib/channels-registry';
import { cleanTeamName, roleChangeError } from '@/lib/team-rules.mjs';

export const dynamic = 'force-dynamic';

const REPO_PATH = 'yt-mcp/access.json';
const VALID_ROLES = ['owner', 'staff', 'client'];

async function readUsers() {
  if (dbReady) {
    try {
      const rows = await db`SELECT email, role, name FROM users ORDER BY created_at, email`;
      if (rows.length) return rows.map((r) => ({ email: r.email, role: r.role, name: r.name || '' }));
    } catch { }
  }
  const repo = await readRepoJSON(REPO_PATH).catch(() => null);
  return repo?.users || [];
}

async function syncRepoMirror(users) {
  try {
    await writeRepoJSON(REPO_PATH, { users }, `team mirror: ${users.length} user(s)`);
  } catch { }
}

export async function GET(req) {
  if (!(await requireRole(req, ['owner']))) return Response.json({ error: 'owner only' }, { status: 403 });
  return Response.json({ users: await readUsers() });
}

export async function POST(req) {
  const actor = await getUser(req);
  if (!actor || actor.role !== 'owner') return Response.json({ error: 'owner only' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || '').toLowerCase().trim();
  const role = VALID_ROLES.includes(body.role) ? body.role : '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return Response.json({ error: 'invalid email' }, { status: 400 });
  if (!role) return Response.json({ error: 'invalid role' }, { status: 400 });
  // Live fix wave C4 (T5-10): validate + trim to 60 once; store and echo the same value
  const name = cleanTeamName(body.name);

  if (!dbReady) return Response.json({ error: 'database not configured on this server' }, { status: 500 });
  const users = await readUsers();
  if (users.some((u) => String(u.email).toLowerCase() === email)) {
    return Response.json({ error: 'that email is already on the team' }, { status: 400 });
  }
  await db`INSERT INTO users (email, role, name) VALUES (${email}, ${role}, ${name})`;
  const next = [...users, { email, role, name }];
  await syncRepoMirror(next);
  await appendAudit(actor.email, 'team-add', `${email} as ${role}`);
  return Response.json({ ok: true, users: next });
}

// Live fix wave C4 (T5-09): change a member's role (staff ↔ client) { email, role }.
// Owners are never made here, and the last owner is never demoted. The
// member's sessions are revoked (sessions carry the login-time role), so the
// new role applies on their next sign-in — the same rule as remove (#60).
export async function PATCH(req) {
  const actor = await getUser(req);
  if (!actor || actor.role !== 'owner') return Response.json({ error: 'owner only' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || '').toLowerCase().trim();
  if (!dbReady) return Response.json({ error: 'database not configured on this server' }, { status: 500 });
  const users = await readUsers();
  const refused = roleChangeError(users, email, body.role);
  if (refused) return Response.json({ error: refused }, { status: refused === 'unknown email' ? 404 : 400 });
  const target = users.find((u) => String(u.email).toLowerCase() === email);
  if (target.role === body.role) return Response.json({ ok: true, users });
  await db`UPDATE users SET role = ${body.role} WHERE email = ${email}`;
  const revoked = await revokeAllForEmail(email).catch(() => 0);
  const next = users.map((u) => (String(u.email).toLowerCase() === email ? { ...u, role: body.role } : u));
  await syncRepoMirror(next);
  await appendAudit(actor.email, 'team-role', `${email}: ${target.role} → ${body.role}` + (revoked ? ` · ${revoked} session(s) revoked` : ''));
  return Response.json({ ok: true, users: next });
}

export async function DELETE(req) {
  const actor = await getUser(req);
  if (!actor || actor.role !== 'owner') return Response.json({ error: 'owner only' }, { status: 403 });
  const email = String(new URL(req.url).searchParams.get('email') || '').toLowerCase();
  if (!dbReady) return Response.json({ error: 'database not configured on this server' }, { status: 500 });
  const users = await readUsers();
  const target = users.find((u) => String(u.email).toLowerCase() === email);
  if (!target) return Response.json({ error: 'unknown email' }, { status: 404 });
  const owners = users.filter((u) => u.role === 'owner');
  if (target.role === 'owner' && owners.length <= 1) {
    return Response.json({ error: 'cannot remove the last owner' }, { status: 400 });
  }
  await db`DELETE FROM users WHERE email = ${email}`;
  // revoke the removed member's sessions immediately — previously they kept
  // their frozen login-time role/access until the 30-day session expiry (issue #60)
  const revoked = await revokeAllForEmail(email).catch(() => 0);
  const next = users.filter((u) => String(u.email).toLowerCase() !== email);
  await syncRepoMirror(next);
  await appendAudit(actor.email, 'team-remove', email + (revoked ? ` · ${revoked} session(s) revoked` : ''));
  return Response.json({ ok: true, users: next });
}
