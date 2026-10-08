// 10-08 ROLE-BASED ACCESS — server-side role checks for API routes.
// getRole resolves the caller's role from the qs_session cookie (Google /
// password login) or the legacy qs_key cookie (owner). Mutating routes must
// call requireRole themselves — the proxy is only the first gate.
import { authToken } from './auth-token';
import { parseSession } from './session';

export async function getRole(req) {
  // dev convenience mirrors proxy.js: gate open outside Vercel without a password
  if (!process.env.STUDIO_PASSWORD && !process.env.VERCEL) return 'owner';

  const cookies = req.headers.get('cookie') || '';
  const m = cookies.match(/qs_session=([^;]+)/);
  if (m) {
    const s = await parseSession(m[1]);
    if (s) return s.role;
  }
  if (process.env.STUDIO_PASSWORD) {
    const legacy = await authToken(process.env.STUDIO_PASSWORD);
    if (cookies.includes(`qs_key=${legacy}`)) return 'owner';
  }
  return null;
}

export async function requireRole(req, roles) {
  const role = await getRole(req);
  return roles.includes(role) ? role : null;
}

// legacy helper — any signed-in role
export async function isAuthed(req) {
  return Boolean(await getRole(req));
}
