// Phase 4 S3 (T4) — parked-channel liveness probes. Parking is designed NOT
// to deadlock (review finding 1): WHILE a Blocking warning is open the
// channel skips production, but the park itself runs the cheap auto-
// verifiable probe for its code — and this module is what the nightly
// warning-probe job (warning-probe.yml) runs over every parked channel, so
// an owner who fixes a token at midnight is un-parked by morning (D11,
// AC-P4-13/14).
//
// Probe economics (policy research platform-youtube-policy-compliance-
// 2026-10-24.md §4.4 Auth stage — cheapest point to re-test): the
// token_revoked probe is an access-token refresh + ONE channels.list call =
// 1 quota unit (quota table, API research) — a parked channel never burns
// render money to prove it is still dead.
//
// Extension point: PROBES maps code → probe fn. Codes without a mapped probe
// are non-verifiable BY CONSTRUCTION — they stay open until a passing probe
// exists or the owner resolves them manually (AC-P4-15: non-auto-verifiable
// rows never auto-unpark).
import fs from 'node:fs';
import path from 'node:path';

function redactedError(e) {
  return String(e && e.message ? e.message : e).slice(0, 160);
}

/**
 * token_revoked probe: refresh the OAuth token, then spend exactly one unit
 * on channels.list?mine=true to prove the token is LIVE again (D11: "token
 * refresh + a 1-unit channels.list").
 * @returns {Promise<{ok: boolean, stage?: string, status?: number, error?: string}>}
 */
export async function probeChannelToken({ refreshToken, clientId, clientSecret, fetchImpl = fetch } = {}) {
  let accessToken = null;
  try {
    const res = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });
    if (!res.ok) return { ok: false, stage: 'refresh', status: res.status };
    accessToken = (await res.json()).access_token;
  } catch (e) {
    return { ok: false, stage: 'refresh', error: redactedError(e) };
  }
  if (!accessToken) return { ok: false, stage: 'refresh', error: 'no_access_token' };
  try {
    const res = await fetchImpl(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return { ok: false, stage: 'channels.list', status: res.status };
    const body = await res.json();
    return { ok: Array.isArray(body?.items) && body.items.length >= 1, stage: 'channels.list', status: res.status };
  } catch (e) {
    return { ok: false, stage: 'channels.list', error: redactedError(e) };
  }
}

// The code→probe map. token_revoked only, until Batch B wires the pipeline
// park-check (T2) and adds probes for new auto-verifiable codes.
export const PROBES = { token_revoked: probeChannelToken };

/**
 * Refresh-token resolution for a channel slug — the yt-daily channelAuth
 * pattern: YT_TOKEN_<SLUG> env JSON first (dashes → underscores), then the
 * vault file yt-mcp/channels/<slug>/token.json. Returns the refresh_token or
 * null (probe records "no_refresh_token"; never throws).
 */
export function tokenForChannel(slug, { env = process.env, fsImpl = fs, cwd = process.cwd() } = {}) {
  const envName = `YT_TOKEN_${String(slug || '').toUpperCase().replace(/-/g, '_')}`;
  const raw = env[envName];
  if (raw) {
    try {
      return JSON.parse(raw).refresh_token || null;
    } catch {
      return null;
    }
  }
  try {
    const file = path.join(cwd, 'yt-mcp', 'channels', String(slug), 'token.json');
    if (!fsImpl.existsSync(file)) return null;
    return JSON.parse(fsImpl.readFileSync(file, 'utf8')).refresh_token || null;
  } catch {
    return null;
  }
}

/**
 * Probe parked channels: every open blocks_publishing row whose code has a
 * mapped probe AND is marked auto_verifiable gets its probe run; a pass
 * auto-resolves with resolved_by='probe' (the audit trail AC-P4-14 asks
 * for) and the channel un-parks. Everything else is stamped last_checked
 * and left open. channelId=null (default) covers ALL parked channels for
 * the nightly job; a channelId scopes it (parked-run / "re-check now" path).
 * Never throws — per-row failures are recorded in the results, not raised.
 */
export async function probeParkedChannels({
  store,
  channelId = null,
  clientId = process.env.YOUTUBE_CLIENT_ID,
  clientSecret = process.env.YOUTUBE_CLIENT_SECRET,
  tokenFor = tokenForChannel,
  fetchImpl = fetch,
  log = () => {},
} = {}) {
  if (!store) return { ok: false, error: 'store_required' };
  const open = await store.openBlockingFor(channelId);
  if (!open.ok) return { ok: false, error: open.error };

  const rows = (open.rows || []).filter((r) => r?.auto_verifiable && PROBES[r?.code]);
  const results = [];
  for (const row of rows) {
    try {
      const refreshToken = tokenFor(row.channel_id);
      if (!refreshToken) {
        await store.markChecked(row.id);
        results.push({ channel_id: row.channel_id, code: row.code, passed: false, stage: 'token', reason: 'no_refresh_token' });
        log(`[warning-probe] ${row.channel_id}/${row.code}: no refresh token resolvable — stays parked`);
        continue;
      }
      const r = await PROBES[row.code]({ refreshToken, clientId, clientSecret, fetchImpl });
      await store.markChecked(row.id);
      if (r.ok) {
        const res = await store.autoResolveIf({
          channel_id: row.channel_id,
          code: row.code,
          by: 'probe',
          note: `probe passed (${row.code}) at ${new Date().toISOString()} — channel un-parked`,
        });
        results.push({ channel_id: row.channel_id, code: row.code, passed: true, resolved: res.resolved === true });
        log(`[warning-probe] ${row.channel_id}/${row.code}: PASSED — resolved=${res.resolved === true}`);
      } else {
        results.push({ channel_id: row.channel_id, code: row.code, passed: false, stage: r.stage, status: r.status, error: r.error });
        log(`[warning-probe] ${row.channel_id}/${row.code}: still failing at ${r.stage}${r.status ? ` (HTTP ${r.status})` : ''} — stays parked`);
      }
    } catch (e) {
      results.push({ channel_id: row.channel_id, code: row.code, passed: false, error: redactedError(e) });
      log(`[warning-probe] ${row.channel_id}/${row.code}: probe error — stays parked`);
    }
  }
  return { ok: true, openBlocking: (open.rows || []).length, checked: rows.length, results };
}
