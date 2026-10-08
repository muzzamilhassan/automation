// 10-08 P1 — TEAM management (owner only): the invite list lives in
// yt-mcp/access.json (committed) and gates Google sign-in roles.
import { requireRole } from '@/lib/route-auth';
import { accessList } from '@/lib/access';
import { readRepoJSON, writeRepoJSON } from '@/lib/channels-registry';
import { appendAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const REPO_PATH = 'yt-mcp/access.json';
const VALID_ROLES = ['owner', 'staff', 'client'];

async function readUsers() {
  try {
    const d = await readRepoJSON(REPO_PATH);
    if (d?.users?.length) return d.users;
  } catch { }
  return accessList();
}

export async function GET(req) {
  if (!(await requireRole(req, ['owner']))) return Response.json({ error: 'owner only' }, { status: 403 });
  return Response.json({ users: await readUsers() });
}

export async function POST(req) {
  const actor = await requireRole(req, ['owner']);
  if (!actor) return Response.json({ error: 'owner only' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || '').toLowerCase().trim();
  const role = VALID_ROLES.includes(body.role) ? body.role : '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return Response.json({ error: 'invalid email' }, { status: 400 });
  if (!role) return Response.json({ error: 'invalid role' }, { status: 400 });

  const users = await readUsers();
  if (users.some((u) => String(u.email).toLowerCase() === email)) {
    return Response.json({ error: 'that email is already on the team' }, { status: 400 });
  }
  users.push({ email, role, name: String(body.name || '').slice(0, 60) });
  await writeRepoJSON(REPO_PATH, { users }, `team: +${email} as ${role} (${actor})`);
  await appendAudit(actor, 'team-add', `${email} as ${role}`);
  return Response.json({ ok: true, users });
}

export async function DELETE(req) {
  const actor = await requireRole(req, ['owner']);
  if (!actor) return Response.json({ error: 'owner only' }, { status: 403 });
  const email = String(new URL(req.url).searchParams.get('email') || '').toLowerCase();
  const users = await readUsers();
  const target = users.find((u) => String(u.email).toLowerCase() === email);
  if (!target) return Response.json({ error: 'unknown email' }, { status: 404 });
  if (target.role === 'owner' && users.filter((u) => u.role === 'owner').length <= 1) {
    return Response.json({ error: 'cannot remove the last owner' }, { status: 400 });
  }
  const next = users.filter((u) => String(u.email).toLowerCase() !== email);
  await writeRepoJSON(REPO_PATH, { users: next }, `team: -${email} (${actor})`);
  await appendAudit(actor, 'team-remove', email);
  return Response.json({ ok: true, users: next });
}
