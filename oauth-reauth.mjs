// OAuth re-authorization for 3 channels on port 3000
// Usage: node oauth-reauth.mjs
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const envRaw = fs.readFileSync(path.join(HERE, '.env'), 'utf8');
for (const m of envRaw.matchAll(/^([A-Z_0-9]+)=(.*)$/gm)) process.env[m[1]] ??= m[2].trim();

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const REDIRECT = 'http://localhost:3000/oauth2callback';
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl'
];
const SLUGS = ['investors-compass', 'money-rulebook', 'debt-free-doctrine'];
let idx = 0;

const oAuth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT);

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, REDIRECT);
  if (u.pathname !== '/oauth2callback') { res.writeHead(404); res.end(); return; }
  const code = u.searchParams.get('code');
  const slug = SLUGS[idx];
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`<html><body style="font-family:sans-serif;text-align:center;padding-top:60px"><h2>✅ ${slug} authorized! Next one opening...</h2></body></html>`);
  try {
    const { tokens } = await oAuth2.getToken(code);
    const dir = path.join(HERE, 'yt-mcp', 'channels', slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'token.json'), JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: tokens.scope,
      token_type: 'Bearer',
      expiry_date: Date.now() + 3650 * 86400000
    }, null, 2));
    console.log(`✓ ${slug} — token saved`);
    idx++;
    if (idx < SLUGS.length) {
      await new Promise(r => setTimeout(r, 2000));
      const nextUrl = oAuth2.generateAuthUrl({
        access_type: 'offline', scope: SCOPES, prompt: 'consent',
        redirect_uri: REDIRECT, state: String(idx)
      });
      console.log(`Opening next: ${SLUGS[idx]}`);
      try { execSync(`start "" "${nextUrl}"`, { shell: 'cmd.exe', timeout: 5000 }); } catch { }
    } else {
      console.log('\n=== ALL 3 CHANNELS RE-AUTHORIZED ===');
      server.close();
      process.exit(0);
    }
  } catch (e) { console.error('ERROR:', e.message); }
});

server.listen(3000, () => {
  const url = oAuth2.generateAuthUrl({
    access_type: 'offline', scope: SCOPES, prompt: 'consent',
    redirect_uri: REDIRECT, state: '0'
  });
  console.log('=== OAuth Server on :3000 ===');
  console.log('Opening browser for: ' + SLUGS[0]);
  try { execSync(`start "" "${url}"`, { shell: 'cmd.exe', timeout: 5000 }); } catch { }
});
