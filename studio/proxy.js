import { NextResponse } from 'next/server';
import { authToken } from '@/lib/auth-token';
import { parseSession } from '@/lib/session';

// 10-08 ROLE-BASED ACCESS — the site's front door.
// Identity: qs_session (signed per-person, Google or password login) OR the
// legacy qs_key cookie (counts as owner). Then the route→role matrix below.
// Best practice: this is the FIRST gate — mutating API routes re-check the
// role server-side in lib/route-auth.js (never trust the UI alone).

const COOKIE = 'qs_key';

// Dev convenience: no STUDIO_PASSWORD set outside Vercel → studio stays open.
// On Vercel the gate is always on (fail closed).
export default async function proxy(req) {
  const password = process.env.STUDIO_PASSWORD;
  if (!password && !process.env.VERCEL) return NextResponse.next();

  const { pathname } = req.nextUrl;
  const isPublic =
    pathname === '/login' ||
    pathname === '/api/login' ||
    pathname === '/api/logout' ||
    pathname === '/api/oauth/callback' || // self-authenticating (signed link / session)
    pathname.startsWith('/api/auth/google/');
  if (isPublic) return NextResponse.next();

  // resolve the role
  let role = null;
  const sess = await parseSession(req.cookies.get('qs_session')?.value);
  if (sess) role = sess.role;
  else {
    const legacy = req.cookies.get(COOKIE)?.value;
    if (legacy && legacy === (await authToken(password))) role = 'owner';
  }
  if (!role) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'locked — sign in at /login first' }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // route → role matrix (first match wins; everything else = any signed-in role)
  const RULES = [
    { match: (p) => p === '/settings', roles: ['owner'] },
    { match: (p) => p.startsWith('/api/channels/') || p === '/api/oauth/start', roles: ['owner'] },
    { match: (p) => p === '/production' || p === '/api/action' || p === '/topics' || p.startsWith('/api/topics') || p === '/music', roles: ['owner', 'staff'] },
  ];
  const rule = RULES.find((r) => r.match(pathname));
  if (rule && !rule.roles.includes(role)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'your role does not allow this' }, { status: 403 });
    }
    return NextResponse.redirect(new URL('/', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg$|.*\\.png$|.*\\.ico$).*)'],
};
