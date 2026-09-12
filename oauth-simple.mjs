// Simple, robust OAuth re-authorization — kills port conflicts, handles all channels.
// Each channel opens in browser → user approves → token saved → next opens.
// Usage: node oauth-simple.mjs
import http from 'node:http';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const envRaw = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
for (const m of envRaw.matchAll(/^([A-Z_0-9]+)=(.*)$/gm)) process.env[m[1]] ??= m[2].trim();

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const REDIRECT = 'http://localhost:3000/oauth2callback';
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl'
];
const SLUGS = ['investors-compass', 'money-rulebook', 'debt-free-doctrine', 'quotequarry'];
let idx = 0;

const oAuth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT);

// Kill anything on port 3000
try { execSync('powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"', { timeout: 5000 }); } catch { }

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, REDIRECT);

  if (u.pathname === '/oauth2callback') {
    const code = u.searchParams.get('code');
    const slug = u.searchParams.get('state') || SLUGS[idx];
    if (!code) { res.writeHead(400); res.end('no code'); return; }

    try {
      const { tokens } = await oAuth2.getToken(code);
      const tokenFile = path.join(ROOT, 'yt-mcp', 'channels', slug, 'token.json');
      fs.mkdirSync(path.dirname(tokenFile), { recursive: true });
      fs.writeFileSync(tokenFile, JSON.stringify({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        scope: tokens.scope,
        token_type: tokens.token_type || 'Bearer',
        expiry_date: Date.now() + 3650 * 86400000
      }, null, 2));
      console.log(`✓ ${slug} — token saved (permanent, Production mode)`);

      idx++;
      if (idx < SLUGS.length) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<html><body style="font-family:sans-serif;text-align:center;padding-top:60px"><h2>✅ ${slug} done!</h2><p>Next: ${SLUGS[idx]} — check your browser for the new tab</p></body></html>`);
        setTimeout(() => startAuth(SLUGS[idx]), 2000);
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body style="font-family:sans-serif;text-align:center;padding-top:60px"><h1>🎉 ALL CHANNELS AUTHORIZED!</h1><p>Tokens are permanent — they never expire.</p></body></html>');
        console.log('\n✓ ALL CHANNELS AUTHORIZED');
        setTimeout(() => process.exit(0), 2000);
      }
    } catch (e) {
      console.error(`✗ ${slug}: ${e.message.slice(0, 100)}`);
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`Error: ${e.message}`);
    }
    return;
  }

  res.writeHead(404); res.end();
});

function startAuth(slug) {
  const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT);
  const url = auth.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    redirect_uri: REDIRECT,
    state: slug
  });
  console.log(`\n📺 Authorizing: ${slug}`);
  try { execSync(`start "" "${url}"`, { shell: 'cmd.exe', timeout: 5000 }); } catch { }
}

server.listen(3000, () => {
  console.log('OAuth server on :3000');
  console.log('Opening first channel auth page...');
  startAuth(SLUGS[0]);
});
