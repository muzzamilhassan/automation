// Starts the Google login for "Add Channel".
// Same Google client + scopes the CLI oauth-reauth.mjs uses, but the redirect
// comes back to Studio instead of localhost. Google's own chooser handles the
// "several YouTube channels on one Gmail" case: the user picks ONE channel
// per login; run the wizard again for each extra channel.
import { ENV } from '@/lib/data.mjs';
import { isAuthed } from '@/lib/route-auth';

export const dynamic = 'force-dynamic';

export const YT_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
];

export async function GET(req) {
  if (!(await isAuthed(req))) {
    return Response.json({ error: 'not signed in' }, { status: 401 });
  }
  const clientId = ENV.YOUTUBE_CLIENT_ID;
  const clientSecret = ENV.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return Response.json(
      { error: 'YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET are not set on the server.' },
      { status: 500 },
    );
  }

  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/oauth/callback`;
  const state = crypto.randomUUID().replace(/-/g, '');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: YT_SCOPES.join(' '),
    access_type: 'offline',
    // select_account → always show the Google chooser (needed when one Gmail
    // owns several channels/mails), consent → always issue a refresh token.
    prompt: 'consent select_account',
    include_granted_scopes: 'true',
    state,
  });

  const res = Response.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, redirectUri });
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.headers.append('Set-Cookie', `qs_oauth=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`);
  return res;
}
