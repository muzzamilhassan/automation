// Clears the studio session cookie. No auth required — even a stale or
// half-valid cookie must always be clearable.
export const dynamic = 'force-dynamic';

export async function POST() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const res = Response.json({ ok: true });
  res.headers.append('Set-Cookie', `qs_key=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
  return res;
}
