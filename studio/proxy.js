import { NextResponse } from 'next/server';
import { parseSessionCookie } from '@/lib/session';
import { isPublicPath } from '@/lib/public-paths';
import { allowedRoles } from '@/lib/route-roles';

// 10-08 ROLE-BASED ACCESS — the site's front door.
// Identity: qs_session only (signed per-person, Google or password login;
// carries the revocable opaque session token). #117: the legacy qs_key
// cookie is no longer accepted anywhere — it was a password-equivalent
// owner credential with no revocation path. Then the route→role matrix.
// Best practice: this is the FIRST gate — mutating API routes re-check the
// role server-side in lib/route-auth.js (never trust the UI alone).

// Dev convenience: no STUDIO_PASSWORD set outside Vercel → studio stays open.
// On Vercel the gate is always on (fail closed).
export default async function proxy(req) {
  const password = process.env.STUDIO_PASSWORD;
  if (!password && !process.env.VERCEL) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  // resolve the role — the A1 cookie's signed claims only. #117: no qs_key
  // fallback; an expired/absent session is simply unauthenticated.
  let role = null;
  const sessCookie = req.cookies.get('qs_session')?.value;
  const claims = await parseSessionCookie(sessCookie);
  if (claims && Number(claims.x) > Date.now()) role = claims.r;
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

  // route → role matrix: studio/lib/route-roles.js (tested; first match wins,
  // unlisted = any signed-in role)
  const roles = allowedRoles(pathname);
  if (roles && !roles.includes(role)) {
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
