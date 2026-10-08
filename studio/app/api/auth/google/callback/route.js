// 10-08 ROLE-BASED ACCESS — Google sign-in callback.
// Verifies the id_token with Google, looks the email up in access.json, and
// issues a signed per-person session cookie (qs_session) with the user's role.
// Unknown emails are refused ("not invited").
import { ENV } from '@/lib/data.mjs';
import { roleForEmail, verifyGoogleIdToken } from '../../../../../lib/access.js';
import { signSession } from '../../../../../lib/session.js';
import { appendAudit } from '../../../../../lib/audit.js';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const url = new URL(req.url);
  const back = (msg) => Response.redirect(`${url.origin}/login?error=${encodeURIComponent(msg)}`, 302);

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state') || '';
  const cookieState = (req.headers.get('cookie') || '').match(/qs_gstate=([a-f0-9]+)/)?.[1];
  if (!code || !state || !cookieState || state !== cookieState) return back('Sign-in expired — try again.');

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: ENV.YOUTUBE_CLIENT_ID,
      client_secret: ENV.YOUTUBE_CLIENT_SECRET,
      redirect_uri: `${url.origin}/api/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  });
  const d = await r.json();
  if (!d.id_token) return back('Google sign-in failed — try again.');
  const who = await verifyGoogleIdToken(d.id_token);
  if (!who?.email) return back('Google sign-in failed — try again.');

  const role = await roleForEmail(who.email);
  if (!role) return back(`This email (${who.email}) is not invited. Ask the owner to add it to the team list.`);

  const exp = Date.now() + 30 * 86400000;
  const session = await signSession({ email: who.email, role, name: who.name || who.email, exp });
  console.log(`[audit] google sign-in: ${who.email} as ${role}`);
  await appendAudit(who.email, 'sign-in', `Google sign-in as ${role}`);

  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const res = Response.redirect(`${url.origin}/`, 302);
  res.headers.append('Set-Cookie', `qs_session=${session}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${secure}`);
  return res;
}
