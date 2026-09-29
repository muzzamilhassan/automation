import { NextResponse } from 'next/server';
import { authToken } from '@/lib/auth-token';

const COOKIE = 'qs_key';

// Dev convenience: no STUDIO_PASSWORD set outside Vercel → studio stays open.
// On Vercel the gate is always on (fail closed).
export default async function proxy(req) {
  const password = process.env.STUDIO_PASSWORD;
  if (!password && !process.env.VERCEL) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname === '/login' || pathname === '/api/login' || pathname === '/api/logout') return NextResponse.next();

  const cookie = req.cookies.get(COOKIE)?.value;
  if (cookie && cookie === (await authToken(password))) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'locked — sign in at /login first' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg$|.*\\.png$|.*\\.ico$).*)'],
};
