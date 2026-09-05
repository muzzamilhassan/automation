// Quarry Studio backend — token exchange + direct-post publishing.
// The ONLY place the TikTok client secret lives (never in the public site).
// Run: node quarry-studio-server.mjs   (port 8787)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 8787;
const ENV_PATH = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), '.env');
for (const m of fs.readFileSync(ENV_PATH, 'utf8').matchAll(/^([A-Z_0-9]+)=(.*)$/gm)) process.env[m[1]] ??= m[2].trim();
// New app keys take priority: put the NEW app's key/secret in .env as TIKTOK_APP_KEY / TIKTOK_APP_SECRET
const CLIENT_KEY = process.env.TIKTOK_APP_KEY || process.env.TIKTOK_CLIENT_KEY || '';
const CLIENT_SECRET = process.env.TIKTOK_APP_SECRET || process.env.TIKTOK_CLIENT_SECRET || '';
const REDIRECT_URI = 'https://muzzamilhassan.github.io/quarrystudio/callback.html';
let account = null; // { access_token, refresh_token, open_id, scope, at }

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', ...cors }); res.end(JSON.stringify(obj)); };

async function exchangeToken(code) {
  const body = new URLSearchParams({
    client_key: CLIENT_KEY, client_secret: CLIENT_SECRET, code,
    grant_type: 'authorization_code', redirect_uri: REDIRECT_URI
  });
  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(JSON.stringify(data).slice(0, 200));
  account = { ...data, at: Date.now() };
  fs.writeFileSync('quarry-studio-token.json', JSON.stringify(account, null, 2));
  return account;
}

async function directPost(videoBuf, title, privacy) {
  if (!account?.access_token) throw new Error('not connected');
  const size = videoBuf.length;
  const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${account.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      post_info: { title: title.slice(0, 2200), privacy_level: privacy, disable_duet: false, disable_stitch: false, disable_comment: false },
      source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: size, total_chunk_count: 1 }
    })
  });
  const init = await initRes.json();
  if (!init.data?.upload_url) throw new Error('init failed: ' + JSON.stringify(init).slice(0, 200));
  await fetch(init.data.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4', 'Content-Range': `bytes 0-${size - 1}/${size}` },
    body: videoBuf
  });
  const stRes = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${account.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ publish_id: init.data.publish_id })
  });
  const st = await stRes.json();
  return { publish_id: init.data.publish_id, status: st.data?.status || 'PUSHED', fail: st.data?.fail_reason || '' };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }

  if (url.pathname === '/api/status') {
    return json(res, 200, { connected: !!account?.access_token, open_id: account?.open_id || null, scope: account?.scope || null });
  }
  if (url.pathname === '/api/token' && req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const acc = await exchangeToken(body.code);
      return json(res, 200, { connected: true, open_id: acc.open_id, display_name: null });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }
  if (url.pathname === '/api/publish' && req.method === 'POST') {
    try {
      const videoBuf = await readBody(req);
      const title = url.searchParams.get('title') || 'My video';
      const privacy = url.searchParams.get('privacy') || 'SELF_ONLY';
      const r = await directPost(videoBuf, title, privacy);
      return json(res, 200, r);
    } catch (e) { return json(res, 500, { error: e.message }); }
  }
  if (url.pathname === '/api/config') {
    return json(res, 200, { client_key: CLIENT_KEY, redirect_uri: REDIRECT_URI });
  }
  json(res, 404, { error: 'not found' });
});
server.listen(PORT, () => console.log(`[quarry-studio] backend on http://localhost:${PORT} — client_key ${CLIENT_KEY ? 'loaded' : 'MISSING (set TIKTOK_APP_KEY/SECRET in .env)'}`));
