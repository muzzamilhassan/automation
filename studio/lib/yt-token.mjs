// Shared YouTube OAuth refresh — ONE flow for every caller that needs a
// per-channel access token from a refresh token:
//   - studio/app/api/analytics/route.js (the live 28-day panel)
//   - scripts/analytics-nightly.mjs (the #106 S5 snapshot collector)
// Extracted 10-30 (#106 T6) so the two cannot drift; injectable fetch keeps
// unit tests off the network.
//
// Token source per slug = ytTokenRaw (studio/lib/data.mjs):
// env YT_TOKEN_<SLUG> (legacy 4 / CI secrets) → local gitignored token file
// (local dev) → encrypted registry token (wizard channels).
import { ENV, ytTokenRaw } from './data.mjs';

/**
 * @param {{ fetchImpl?: typeof fetch, env?: Record<string, string>, tokenRaw?: (slug: string) => Promise<string> }} deps
 * @returns {(slug: string) => Promise<string>} access token for the slug
 */
export function createAccessToken({ fetchImpl = fetch, env = ENV, tokenRaw = ytTokenRaw } = {}) {
  return async function accessToken(slug) {
    const raw = await tokenRaw(slug);
    if (!raw) throw new Error(`no token for ${slug}`);
    const t = JSON.parse(raw);
    const r = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.YOUTUBE_CLIENT_ID,
        client_secret: env.YOUTUBE_CLIENT_SECRET,
        refresh_token: t.refresh_token,
        grant_type: 'refresh_token',
      }),
    });
    const d = await r.json();
    if (!d.access_token) throw new Error('no access token');
    return d.access_token;
  };
}
