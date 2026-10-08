import { authToken } from '@/lib/auth-token';
import { parseSession } from '@/lib/session';
import { userByToken } from '@/lib/session-db';

// resolves the signed-in user: { email, role, name, session_id } — or null.
// A1: qs_session is an OPAQUE token resolved against the Neon sessions table
// (revocable). Legacy HMAC cookies are still honored until they expire.
export async function getUser(req) {
  // dev convenience mirrors proxy.js: gate open outside Vercel without a password
  if (!process.env.STUDIO_PASSWORD && !process.env.VERCEL) {
    return { email: 'owner', role: 'owner', name: 'Owner (dev)', session_id: 0 };
  }

  const cookies = req.headers.get('cookie') || '';
  const m = cookies.match(/qs_session=([^;]+)/);
  if (m) {
    const token = decodeURIComponent(m[1]);
    if (!token.includes('.')) {
      const s = await userByToken(token);
      if (s) return s;
    } else {
      // legacy HMAC session (pre-A1) — still valid until its 30-day expiry
      const s = await parseSession(token);
      if (s) return { email: s.email, role: s.role, name: s.name || s.email, session_id: 0 };
    }
  }
  if (process.env.STUDIO_PASSWORD) {
    const legacy = await authToken(process.env.STUDIO_PASSWORD);
    if (cookies.includes(`qs_key=${legacy}`)) return { email: 'owner', role: 'owner', name: 'Owner', session_id: 0 };
  }
  return null;
}

export async function getRole(req) {
  const u = await getUser(req);
  return u?.role || null;
}

export async function requireRole(req, roles) {
  const role = await getRole(req);
  return roles.includes(role) ? role : null;
}

// legacy helper — any signed-in role
export async function isAuthed(req) {
  return Boolean(await getRole(req));
}
