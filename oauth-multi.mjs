// Multi-channel OAuth re-authorization tool.
// Opens browser for each channel → user selects correct YouTube channel → approves.
// Saves permanent tokens (app is now in Production mode — tokens never expire).
//
// Usage: node oauth-multi.mjs
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

const brands = JSON.parse(fs.readFileSync(path.join(ROOT, 'lib', 'brands.json'), 'utf8'));
const labels = Object.fromEntries(SLUGS.map(s => [s, brands[s]?.label || s]));

function openBrowser(url) {
  try { execSync(`start "" "${url}"`, { shell: 'cmd.exe', timeout: 5000 }); } catch { }
}

function saveToken(slug, tokens) {
  const dir = path.join(ROOT, 'yt-mcp', 'channels', slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'token.json'), JSON.stringify({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    scope: tokens.scope,
    token_type: tokens.token_type || 'Bearer',
    expiry_date: Date.now() + 365 * 86400000
  }, null, 2));
}

function buildAuthUrl(slug) {
  return auth.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    redirect_uri: REDIRECT,
    state: slug
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT);

  if (url.pathname === '/health') { res.writeHead(200); res.end('ok'); return; }

  if (url.pathname === '/oauth2callback') {
    const code = url.searchParams.get('code');
    const slug = url.searchParams.get('state') || SLUGS[idx];
    if (!code) { res.writeHead(400); res.end('no code'); return; }

    try {
      const { tokens } = await auth.getToken(code);
      saveToken(slug, tokens);
      console.log(`✓ [${idx + 1}/${SLUGS.length}] ${slug} — token saved`);

      idx++;
      if (idx < SLUGS.length) {
        const next = SLUGS[idx];
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<html><body style="font-family:sans-serif;text-align:center;padding-top:60px"><h2>✅ ${slug} done!</h2><p>Opening next channel: <b>${next}</b>...</p></body></html>`);
        setTimeout(() => {
          openBrowser(`http://localhost:3000/authorize/${next}`);
        }, 2000);
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body style="font-family:sans-serif;text-align:center;padding-top:60px"><h1>🎉 ALL 4 CHANNELS AUTHORIZED!</h1><p>You can close this tab. Tokens saved permanently.</p></body></html>');
        console.log('ALL DONE!');
      }
    } catch (e) {
      console.error(`✗ ${slug}: ${e.message}`);
      res.writeHead(500); res.end('error: ' + e.message);
    }
    return;
  }

  if (url.pathname.startsWith('/authorize/')) {
    const slug = url.pathname.split('/')[2];
    const redirect = authUrl(slug);
    res.writeHead(302, { Location: redirect });
    res.end();
    return;
  }

  res.writeHead(404); res.end();
});

function startChannel(slug) {
  const url = `http://localhost:3000/authorize/${slug}`;
  console.log(`\n📺 Opening: ${slug}`);
  console.log(`   URL: ${url.slice(0, 60)}...`);
  openBrowser(url);
}

server.listen(3000, () => {
  console.log('═══════════════════════════════════════════');
  console.log('  MULTI-CHANNEL RE-AUTHORIZATION TOOL');
  console.log('  4 channels, one at a time, automatic');
  console.log('═══════════════════════════════════════════');
  console.log('\nChannels: ' + SLUGS.join(' → '));
  console.log('First: authorize ' + SLUGS[0]);
  console.log('Opening browser...\n');
  startChannel(SLUGS[0]);
});

function flowCallback(req, res, slug) { }
