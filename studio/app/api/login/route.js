import { authToken } from '@/lib/auth-token';
import { signSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// 10-08: password login = OWNER session (backward-compatible) + brute-force
// throttle (5 wrong tries per IP → 10-minute lockout). Google login is the
// per-person path (roles from access.json).
const attempts = new Map(); // ip → { n, until }

function throttled(ip) {
  const a = attempts.get(ip);
  return Boolean(a && a.until > Date.now() && a.n >= 5);
}
function recordFail(ip) {
  const a = attempts.get(ip) || { n: 0, until: 0 };
  a.n += 1;
  if (a.n >= 5) a.until = Date.now() + 10 * 60 * 1000;
  attempts.set(ip, a);
}

export async function POST(req) {
  const ip = (req.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
  if (throttled(ip)) {
    return Response.json({ error: 'Too many attempts — locked for 10 minutes.' }, { status: 429 });
  }

  const { password } = await req.json().catch(() => ({}));
  const expected = process.env.STUDIO_PASSWORD;
  if (!expected) {
    return Response.json({ error: 'Server has no STUDIO_PASSWORD set — add it in the hosting dashboard.' }, { status: 500 });
  }
  if (!password || password !== expected) {
    recordFail(ip);
    const left = Math.max(0, 5 - (attempts.get(ip)?.n || 0));
    return Response.json({ error: `Wrong password.${left ? ` ${left} tries left this window.` : ' Locked for 10 minutes.'}` }, { status: 401 });
  }
  attempts.delete(ip);

  const token = await authToken(expected);
  const session = await signSession({ email: 'owner', role: 'owner', name: 'Owner', exp: Date.now() + 30 * 86400000 });
  console.log('[audit] password sign-in: owner');

  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const res = Response.json({ ok: true, role: 'owner' });
  res.headers.append('Set-Cookie', `qs_key=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${secure}`);
  res.headers.append('Set-Cookie', `qs_session=${session}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${secure}`);
  return res;
}
