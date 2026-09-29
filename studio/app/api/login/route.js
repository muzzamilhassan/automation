import { authToken } from '@/lib/auth-token';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const { password } = await req.json().catch(() => ({}));
  const expected = process.env.STUDIO_PASSWORD;

  if (!expected) {
    return Response.json({ error: 'Server has no STUDIO_PASSWORD set — add it in the hosting dashboard.' }, { status: 500 });
  }
  if (!password || password !== expected) {
    return Response.json({ error: 'Wrong password.' }, { status: 401 });
  }

  const token = await authToken(expected);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const res = Response.json({ ok: true });
  res.headers.append('Set-Cookie', `qs_key=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${secure}`);
  return res;
}
