// Clears the studio session cookies AND revokes the current A1 session row.
// No auth required — even a stale or half-valid cookie must always be clearable.
// #116: the A1 cookie is dotted (`hex.hmac`) and the revocable token lives
// inside its signed claims — revokeSessionFromCookie parses it (HMAC-verified)
// and revokes by claims.t; bare pre-A1 tokens are revoked directly as before.
import { revokeSessionFromCookie } from '@/lib/session-db';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  try {
    const cookies = req.headers.get('cookie') || '';
    const token = cookies.match(/qs_session=([^;]+)/)?.[1] || '';
    if (token) await revokeSessionFromCookie(token);
  } catch { }
  const res = Response.json({ ok: true });
  res.headers.append('Set-Cookie', `qs_key=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
  res.headers.append('Set-Cookie', `qs_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
  return res;
}
