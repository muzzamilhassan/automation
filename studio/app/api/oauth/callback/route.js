// Google redirects here after the user picks an account + channel and clicks
// Allow. One login = ONE YouTube channel (Google's channel chooser handles
// accounts that own several channels). This route:
//   1. exchanges the code for tokens (offline → refresh_token),
//   2. identifies the channel via YouTube channels.list (title/handle/subs),
//   3. saves the token as the YT_TOKEN_<SLUG> GitHub secret (CI + Studio read it),
//   4. registers the channel in yt-mcp/studio-channels.json (no token in it),
//   5. redirects back to /channels/add?connected=<slug>.
import { ENV } from '@/lib/data.mjs';
import { isAuthed } from '@/lib/route-auth';
import { readRegistry, upsertChannel, writeTokenSecret, writeLocalTokenFile, hasGithubToken } from '@/lib/channels-registry';

export const dynamic = 'force-dynamic';

const LIVE_SLUGS = ['quotequarry', 'investors-compass', 'money-rulebook', 'debt-free-doctrine'];

function fail(req, msg) {
  const origin = new URL(req.url).origin;
  return Response.redirect(`${origin}/channels/add?error=${encodeURIComponent(msg.slice(0, 160))}`, 302);
}

function slugify(text) {
  return (
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'channel'
  );
}

export async function GET(req) {
  if (!(await isAuthed(req))) return fail(req, 'Studio session expired — sign in again.');

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookies = req.headers.get('cookie') || '';
  const cookieState = cookies.match(/qs_oauth=([a-f0-9]+)/)?.[1];
  if (!code) return fail(req, 'Google did not return a code (login cancelled?)');
  if (!state || !cookieState || state !== cookieState) return fail(req, 'Login state mismatch — start the connect again.');

  // 1. exchange code → tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: ENV.YOUTUBE_CLIENT_ID,
      client_secret: ENV.YOUTUBE_CLIENT_SECRET,
      redirect_uri: `${url.origin}/api/oauth/callback`,
      grant_type: 'authorization_code',
    }),
  });
  const tokens = await tokenRes.json();
  if (!tokens.access_token || !tokens.refresh_token) {
    return fail(req, `Token exchange failed: ${(tokens.error_description || tokens.error || 'no refresh token').slice(0, 120)}`);
  }

  // 2. identify the channel this token belongs to
  const chRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const chData = await chRes.json();
  const ch = chData.items?.[0];
  if (!ch) return fail(req, 'No YouTube channel came back — did the channel chooser get skipped?');
  const title = ch.snippet?.title || 'Unnamed channel';
  const handle = (ch.snippet?.customUrl || '').toLowerCase();
  const channelId = ch.id;
  const subs = Number(ch.statistics?.subscriberCount || 0);

  // 3. slug — unique; reconnecting the SAME channel just updates its entry
  let slug = slugify(handle || title);
  let reg;
  try {
    reg = await readRegistry();
  } catch (e) {
    return fail(req, e.message);
  }
  const existing = (reg.channels || []).find((c) => c.channelId === channelId);
  const taken = new Set([...LIVE_SLUGS, ...(reg.channels || []).map((c) => c.slug)]);
  if (!existing) {
    while (taken.has(slug)) slug = `${slugify(handle || title).slice(0, 34)}-${Math.floor(Math.random() * 90 + 10)}`;
  }

  const tokenJson = JSON.stringify(
    {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: tokens.scope,
      token_type: 'Bearer',
      expiry_date: Date.now() + 3650 * 86400000,
    },
    null,
    2,
  );
  const secretName = `YT_TOKEN_${slug.toUpperCase().replace(/-/g, '_')}`;

  let secretWarning = null;
  try {
    if (!hasGithubToken()) throw new Error('no GITHUB_TOKEN on the server');
    await writeTokenSecret(secretName, tokenJson);
  } catch (e) {
    secretWarning = e.message;
  }
  // Local mode mirror (gitignored) so local tools see the new channel too.
  writeLocalTokenFile(slug, tokenJson);

  // 4. registry entry (never contains the token)
  const entry = {
    slug,
    label: title.toUpperCase(),
    channelId,
    handle,
    subs,
    accent: '#38BDF8',
    niche: '',
    style: '',
    voice: '',
    slots: [],
    tokenSecret: secretName,
    tokenSecretSaved: !secretWarning,
    connectedAt: new Date().toISOString(),
    status: secretWarning ? 'connected · token secret FAILED (see note)' : 'connected · automation wiring pending',
    ...(secretWarning ? { tokenSecretError: secretWarning } : {}),
  };
  try {
    await upsertChannel(entry);
  } catch (e) {
    return fail(req, `Channel connected (secret ${secretWarning ? 'FAILED: ' + secretWarning : 'saved'}) but registry commit failed: ${e.message}`);
  }

  // 5. back to the wizard
  const origin = url.origin;
  const qs = new URLSearchParams({ connected: slug });
  if (secretWarning) qs.set('secretWarning', secretWarning.slice(0, 140));
  return Response.redirect(`${origin}/channels/add?${qs}`, 302);
}
