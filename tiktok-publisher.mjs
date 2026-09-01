// TikTok Publisher — Content Posting API (open.tiktokapis.com).
// Mirrors threads-publisher.mjs: one-time OAuth capture, refresh-token based
// access for CI, public video hosting (TikTok pulls the video from a URL).
//
// One-time setup:
//   1. developers.tiktok.com -> your app -> Login Kit "Add URL"
//      -> https://<public-https-host>/callback (set via TIKTOK_REDIRECT_URI)
//   2. Products: "Content Posting API" scopes: video.publish, video.upload
//   3. node tiktok-publisher.mjs auth   (opens browser, saves token file)
//
// Usage:
//   node tiktok-publisher.mjs auth
//   node tiktok-publisher.mjs test
//   node tiktok-publisher.mjs refresh
//   node tiktok-publisher.mjs post --video reel.mp4 --title "Title #Shorts"
// Imported by run-content-machine.mjs: publishToTikTok({ videoBuffer, title })
//
// Token model: access_token lasts 24h; refresh_token lasts ~1 year and is
// refreshable server-side (no browser). TikTok MAY rotate the refresh token on
// each refresh — when running in GitHub Actions with SECRET_WRITER_PAT set,
// the rotated token is written back to the repo's TIKTOK_REFRESH_TOKEN secret.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { exec } from 'node:child_process';

const TOKEN_PATH = 'tiktok-oauth-tokens.json';
const PORT = 3002;
const LOCAL_REDIRECT = `http://localhost:${PORT}/callback`;
const SCOPES = 'user.info.basic,video.publish,video.upload';
const API = 'https://open.tiktokapis.com/v2';
const TITLE_LIMIT = 150; // TikTok title/caption hard limit

let envStr = '';
try {
  if (fs.existsSync('.env')) {
    envStr = fs.readFileSync('.env', 'utf8');
  } else if (fs.existsSync('C:/Users/Revnix/Documents/youtube-automation/.env')) {
    envStr = fs.readFileSync('C:/Users/Revnix/Documents/youtube-automation/.env', 'utf8');
  }
} catch (e) { }

const envOf = (key) => process.env[key] || (envStr.match(new RegExp(`^${key}=(.+)$`, 'm')) || [])[1]?.trim() || '';
const CLIENT_KEY = envOf('TIKTOK_CLIENT_KEY') || envOf('TIKTOK_CLIENT_ID');
const CLIENT_SECRET = envOf('TIKTOK_CLIENT_SECRET');
const REDIRECT_URI = envOf('TIKTOK_REDIRECT_URI') || LOCAL_REDIRECT;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function clip(text, limit = TITLE_LIMIT) {
  const s = String(text || '').trim();
  return s.length <= limit ? s : s.substring(0, limit - 1).trimEnd() + '…';
}

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------
function readTokenFile() {
  try {
    if (fs.existsSync(TOKEN_PATH)) return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  } catch (e) { }
  return null;
}

async function refreshTokens(refreshToken) {
  const body = new URLSearchParams({
    client_key: CLIENT_KEY,
    client_secret: CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });
  const res = await fetch(`${API}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(JSON.stringify(data).substring(0, 300));
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken, // keep old if TikTok didn't rotate
    open_id: data.open_id,
    expires_at: Date.now() + (data.expires_in || 86400) * 1000
  };
}

// In CI: persist a rotated refresh token back to the GitHub secret so the
// next scheduled run can still authenticate. Uses the repo secrets API with
// a repo-scoped PAT (SECRET_WRITER_PAT) + libsodium sealed-box encryption.
async function persistRefreshTokenToGitHub(refreshToken) {
  try {
    const pat = envOf('SECRET_WRITER_PAT');
    const repo = process.env.GITHUB_REPOSITORY || envOf('GITHUB_REPOSITORY');
    if (!pat || !repo) return;
    const sodium = (await import('libsodium-wrappers')).default;
    await sodium.ready;
    const auth = { Authorization: `Bearer ${pat}`, Accept: 'application/vnd.github+json' };
    const keyRes = await fetch(`https://api.github.com/repos/${repo}/actions/secrets/public-key`, { headers: auth });
    if (!keyRes.ok) throw new Error('public-key HTTP ' + keyRes.status);
    const pk = await keyRes.json();
    const binKey = sodium.from_base64(pk.key, sodium.base64_variants.ORIGINAL);
    const binSecret = sodium.from_string(refreshToken);
    const encrypted = sodium.crypto_box_seal(binSecret, binKey);
    const b64 = sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL);
    const put = await fetch(`https://api.github.com/repos/${repo}/actions/secrets/TIKTOK_REFRESH_TOKEN`, {
      method: 'PUT',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ encrypted_value: b64, key_id: pk.key_id })
    });
    console.log(put.ok ? '[TikTok] Rotated refresh token persisted to GitHub secret.' : `[TikTok] Secret write-back failed: HTTP ${put.status}`);
  } catch (e) {
    console.warn('[TikTok] Secret write-back skipped:', e.message);
  }
}

// Resolution order: env refresh token (CI) -> local token file.
// Refreshes when the access token is missing or older than 2 hours.
async function getTikTokToken() {
  const envRefresh = envOf('TIKTOK_REFRESH_TOKEN');
  if (envRefresh) {
    const file = readTokenFile();
    if (file && file.refresh_token === envRefresh && file.expires_at - Date.now() > 2 * 3600 * 1000) {
      return { token: file.access_token, openId: file.open_id };
    }
    const fresh = await refreshTokens(envRefresh);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(fresh, null, 2));
    if (fresh.refresh_token !== envRefresh) await persistRefreshTokenToGitHub(fresh.refresh_token);
    return { token: fresh.access_token, openId: fresh.open_id };
  }
  const file = readTokenFile();
  if (!file) return null;
  if (file.expires_at - Date.now() < 2 * 3600 * 1000) {
    const fresh = await refreshTokens(file.refresh_token);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(fresh, null, 2));
    if (envOf('GITHUB_REPOSITORY') && fresh.refresh_token !== file.refresh_token) {
      await persistRefreshTokenToGitHub(fresh.refresh_token);
    }
    return { token: fresh.access_token, openId: fresh.open_id };
  }
  return { token: file.access_token, openId: file.open_id };
}

// ---------------------------------------------------------------------------
// Publishing — TikTok PULLs the video from a public URL (hostImagePublicly
// from threads-publisher.mjs: uguu.se, raw bytes, correct content-type).
// ---------------------------------------------------------------------------
async function pollPublishStatus(publishId, token) {
  for (let i = 0; i < 36; i++) {
    await sleep(5000);
    try {
      const res = await fetch(`${API}/post/publish/status/fetch/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ publish_id: publishId })
      });
      const data = await res.json();
      const status = data?.data?.status;
      if (status === 'PUBLISH_COMPLETE' || status === 'COMPLETE') return { ok: true, status };
      if (status === 'PUBLISH_FAILED') return { ok: false, status, detail: data };
    } catch (e) { }
  }
  return { ok: false, status: 'TIMEOUT' };
}

export async function publishToTikTok({ videoBuffer, title } = {}) {
  // Prefer Zernio Unified API if configured in .env (avoids OAuth expiration & audit issues)
  const zernioApiKey = envOf('ZERNIO_API_KEY');
  if (zernioApiKey) {
    const { publishToTikTok: publishZernio } = await import('./zernio-tiktok-publisher.mjs');
    return await publishZernio({ videoBuffer, title });
  }

  const cfg = await getTikTokToken();
  if (!cfg) {
    console.log('[TikTok] Skipped: no token (set ZERNIO_API_KEY in .env or run: node tiktok-publisher.mjs auth)');
    return null;
  }
  try {
    const { hostImagePublicly } = await import('./threads-publisher.mjs');
    console.log('[TikTok] Publishing video (PULL_FROM_URL)...');
    const videoUrl = await hostImagePublicly(videoBuffer, 'video/mp4', 'reel.mp4');
    if (!videoUrl) {
      console.warn('      [TikTok] Skipped: public video hosting failed.');
      return null;
    }

    const init = async (privacyLevel) => fetch(`${API}/post/publish/video/init/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({
        post_info: {
          title: clip(title),
          privacy_level: privacyLevel,
          disable_comment: false,
          disable_duet: false,
          disable_stitch: false
        },
        source_info: { source: 'PULL_FROM_URL', video_url: videoUrl }
      })
    });

    let res = await init('PUBLIC_TO_EVERYONE');
    let data = await res.json();
    // Unaudited apps may be restricted to private posts — retry once as SELF_ONLY
    if (data?.error?.code === 'illegal_privacy_scenario' || /privacy/i.test(data?.error?.message || '')) {
      console.log('      [TikTok] Public posting not permitted for this app — posting as SELF_ONLY (flip to public in the TikTok app).');
      res = await init('SELF_ONLY');
      data = await res.json();
    }
    const publishId = data?.data?.publish_id;
    if (!publishId) {
      console.warn('      [TikTok] Init failed:', JSON.stringify(data).substring(0, 250));
      return null;
    }

    const result = await pollPublishStatus(publishId, cfg.token);
    if (result.ok) {
      console.log(`      ✓ TikTok Post Live! publish_id: ${publishId}`);
      return publishId;
    }
    console.warn('      [TikTok] Publish did not complete:', result.status, JSON.stringify(result.detail || {}).substring(0, 200));
    return null;
  } catch (e) {
    console.warn('      [TikTok] Error:', e.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function openBrowser(url) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"` :
    process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd);
}

async function runAuth() {
  if (!CLIENT_KEY || !CLIENT_SECRET) {
    console.error('[ERROR] TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET missing in .env');
    process.exit(1);
  }
  const state = Math.random().toString(36).substring(2);
  const authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${CLIENT_KEY}&scope=${encodeURIComponent(SCOPES)}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${state}`;

  console.log('\n======================================================');
  console.log('🔑 ONE-TIME TIKTOK AUTHENTICATION');
  console.log('======================================================');
  console.log('Opening browser for TikTok authorization...');
  console.log(`If it does not open automatically, visit:\n${authUrl}\n`);

  const server = http.createServer(async (req, res) => {
    try {
      const urlObj = new URL(req.url, `http://localhost:${PORT}`);
      if (!urlObj.pathname.startsWith('/callback')) return;
      const code = urlObj.searchParams.get('code');
      const err = urlObj.searchParams.get('error');

      if (!code) {
        console.log(`[Notice] Callback hit without a code (URL: ${req.url}). Still waiting...`);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh"><p>Waiting for a valid TikTok authorization — complete the consent in the other tab.</p></body></html>');
        return;
      }
      if (err) throw new Error(err);

      const body = new URLSearchParams({
        client_key: CLIENT_KEY,
        client_secret: CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI
      });
      const exRes = await fetch(`${API}/oauth/token/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      });
      const ex = await exRes.json();
      if (!ex.access_token) throw new Error(JSON.stringify(ex).substring(0, 300));

      const tokenFile = {
        access_token: ex.access_token,
        refresh_token: ex.refresh_token,
        open_id: ex.open_id,
        scope: ex.scope,
        obtained_at: Date.now(),
        expires_at: Date.now() + (ex.expires_in || 86400) * 1000
      };
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokenFile, null, 2));

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#0f172a;color:#fff"><div><h1 style="color:#4ade80">✓ TikTok connected!</h1><p style="color:#94a3b8">Token saved to ${TOKEN_PATH}. You can close this tab.</p></div></body></html>`);

      console.log(`✓ TikTok connected (open_id ${ex.open_id})`);
      console.log(`✓ Tokens saved to ${TOKEN_PATH}`);
      console.log('\nAdd these GitHub repo secrets to finish CI wiring:');
      console.log(`  TIKTOK_REFRESH_TOKEN = <refresh_token from ${TOKEN_PATH}>`);
      console.log(`  TIKTOK_CLIENT_KEY = ${CLIENT_KEY}`);
      server.close();
      setTimeout(() => process.exit(0), 500);
    } catch (e) {
      console.error('[ERROR] Token exchange failed:', e.message);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Token exchange failed: ' + e.message);
      server.close();
      process.exit(1);
    }
  });

  server.listen(PORT, () => openBrowser(authUrl));
  setTimeout(() => {
    console.log('[TIMEOUT] No callback received within 30 minutes. Re-run: node tiktok-publisher.mjs auth');
    try { server.close(); } catch (e) { }
    process.exit(1);
  }, 30 * 60 * 1000);
}

async function runTest() {
  const cfg = await getTikTokToken();
  if (!cfg) {
    console.log('No TikTok token found. Run: node tiktok-publisher.mjs auth');
    process.exit(1);
  }
  const res = await fetch(`${API}/user/info/?fields=open_id,display_name,avatar_url`, {
    headers: { Authorization: `Bearer ${cfg.token}` }
  });
  const data = await res.json();
  if (data?.data?.user) {
    console.log(`✓ TikTok token valid — connected as ${data.data.user.display_name} (open_id ${data.data.user.open_id})`);
  } else {
    console.error('✗ TikTok token invalid:', JSON.stringify(data).substring(0, 200));
    process.exit(1);
  }
}

async function runRefresh() {
  const file = readTokenFile();
  if (!file) {
    console.error(`No ${TOKEN_PATH} found. Run auth first.`);
    process.exit(1);
  }
  const fresh = await refreshTokens(file.refresh_token);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(fresh, null, 2));
  console.log('✓ Tokens refreshed. New access token valid ~24h; refresh token valid ~1 year.');
}

async function runPostCli() {
  const args = process.argv.slice(2);
  const pick = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : null;
  };
  const video = pick('--video');
  const title = pick('--title') || '';
  if (!video) {
    console.log('Usage: node tiktok-publisher.mjs post --video file.mp4 --title "..."');
    process.exit(1);
  }
  const id = await publishToTikTok({ videoBuffer: fs.readFileSync(video), title });
  process.exit(id ? 0 : 1);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]).replace(/\\/g, '/').endsWith('/tiktok-publisher.mjs');
if (invokedDirectly) {
  const cmd = process.argv[2] || 'help';
  if (cmd === 'auth') runAuth();
  else if (cmd === 'test') runTest();
  else if (cmd === 'refresh') runRefresh();
  else if (cmd === 'post') runPostCli();
  else console.log('Commands: auth | test | refresh | post --video f.mp4 --title "..."');
}
