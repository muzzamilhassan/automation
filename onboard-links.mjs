// Guided, self-labeled onboarding flow for all 15 channels.
// I (the agent) run this in the background. The user just clicks in the
// browser: each step opens a local page that says WHICH brand to authorize,
// then hands off to Google consent. After the last consent it AUTOMATICALLY
// pushes branding, adds MCP entries, sets CI secrets, and smoke-tests.
//
// Re-run safe: brands with tokens are skipped. Wrong channel picked? Re-run
// later with: node add-yt-channel.mjs <slug> && node brand-channels.mjs --apply --only <slug>
import fs from 'node:fs';
import http from 'node:http';
import { exec, spawnSync } from 'node:child_process';
import { google } from 'googleapis';
import { BRANDS } from './yt-brands/brands.mjs';

const envStr = fs.readFileSync('.env', 'utf8');
const CLIENT_ID = envStr.match(/^YOUTUBE_CLIENT_ID=(.+)$/m)?.[1]?.trim();
const CLIENT_SECRET = envStr.match(/^YOUTUBE_CLIENT_SECRET=(.+)$/m)?.[1]?.trim();
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';
const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const has = (s) => fs.existsSync(`yt-mcp/channels/${s}/token.json`);
const pending = () => BRANDS.filter(b => !has(b.slug));

const page = (title, body) => `<html><head><meta charset="utf-8"><title>${title}</title><style>
body{font-family:Segoe UI,sans-serif;background:#0d1117;color:#e6edf3;display:flex;justify-content:center;padding:40px}
.card{max-width:640px;background:#161b22;border:1px solid #30363d;border-radius:14px;padding:32px}
h1{font-size:26px;margin:0 0 8px} .accent{color:#E8C15A} .num{color:#8b949e;font-size:14px;letter-spacing:2px;text-transform:uppercase}
a.btn{display:inline-block;background:#238636;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px}
.small{color:#8b949e;font-size:14px;margin-top:18px;line-height:1.5}
.ok{color:#3fb950;font-weight:700}</style></head><body><div class="card">${body}</div></body></html>`;

const startPage = (b, idx, total) => page(`${b.label} — authorize`, `
  <div class="num">Step ${idx + 1} of ${total}</div>
  <h1>You are authorizing: <span class="accent">${b.label}</span></h1>
  <p><b>Niche:</b> ${b.niche}<br/><b>Handle goal:</b> ${b.handle}</p>
  <p>On the next Google screen:</p>
  <ol><li>Pick your Google account</li>
  <li><b>Pick the dummy channel you want to become ${b.label}</b></li>
  <li>Click Continue / Allow</li></ol>
  <a class="btn" href="${authUrl(b.slug)}">Continue to Google →</a>
  <p class="small">Picked the wrong channel on a previous step? Finish the flow first — it can be re-done afterwards.</p>`);

const successPage = (b, chTitle, chId, next) => {
  const nextHtml = next
    ? `<p class="small">Next up: <b class="accent">${next.label}</b> — a new tab opens automatically in a few seconds.<br/>Be sure to pick a <b>different</b> dummy channel for it.</p>`
    : `<p class="small">🎉 All channels authorized! Branding is now being pushed automatically — watch the terminal. You can close this tab.</p>`;
  return page(`${b.label} — done`, `
    <div class="num">Authorized</div>
    <h1><span class="ok">✅ ${b.label}</span> is connected</h1>
    <p>Token saved for channel: <b>${chTitle}</b><br/><span class="small">${chId}</span></p>
    <p class="small">Not the dummy channel you wanted for ${b.label}? Note the name — we'll redo this one at the end (nothing else is affected).</p>
    ${nextHtml}`);
};

function authUrl(slug) {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/youtube.force-ssl'
    ],
    prompt: 'consent',
    state: slug
  });
}

const open = (u) => exec(`start "" "${u}"`);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:3000');
  try {
    if (url.pathname === '/') {
      const p = pending();
      res.end(page('YouTube onboarding', `<h1><span class="accent">15-channel onboarding</span></h1>
        <p>${BRANDS.length - p.length}/${BRANDS.length} channels authorized.</p>
        ${p.length ? `<p>Next: <b>${p[0].label}</b></p><a class="btn" href="/start/${p[0].slug}">Start / resume →</a>` : '<p class="ok">✅ All done — branding is being pushed.</p>'}`));
      return;
    }
    if (url.pathname.startsWith('/start/')) {
      const slug = url.pathname.split('/')[2];
      const b = BRANDS.find(x => x.slug === slug);
      if (!b) { res.writeHead(404); res.end('unknown brand'); return; }
      const p = pending();
      const idx = BRANDS.length - p.length;
      console.log(`[flow] start page shown: ${b.label}`);
      res.end(startPage(b, idx, BRANDS.length));
      return;
    }
    if (url.pathname === '/oauth2callback') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const b = BRANDS.find(x => x.slug === state) || pending()[0];
      if (!code || !b) { res.writeHead(400); res.end('missing code/state'); return; }
      const { tokens } = await oauth2Client.getToken(code);
      fs.mkdirSync(`yt-mcp/channels/${b.slug}`, { recursive: true });
      fs.writeFileSync(`yt-mcp/channels/${b.slug}/token.json`, JSON.stringify({
        access_token: tokens.access_token,
        token_type: tokens.token_type || 'Bearer',
        refresh_token: tokens.refresh_token,
        expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : new Date(Date.now() + 3500e3).toISOString()
      }, null, 2));
      oauth2Client.setCredentials(tokens);
      const yt = google.youtube({ version: 'v3', auth: oauth2Client });
      const { data } = await yt.channels.list({ part: 'id,snippet', mine: true });
      const ch = data.items?.[0];
      const chTitle = ch?.snippet?.title || '(unknown)';
      const chId = ch?.id || '(unknown)';
      console.log(`[flow] ✅ ${b.label} authorized → channel "${chTitle}" (${chId})`);
      const next = pending()[0];
      res.end(successPage(b, chTitle, chId, next));
      if (next) {
        setTimeout(() => { console.log(`[flow] opening next: ${next.label}`); open(`http://localhost:3000/start/${next.slug}`); }, 3500);
      } else {
        setTimeout(finish, 1500);
      }
      return;
    }
    res.writeHead(404); res.end();
  } catch (e) {
    console.error('[flow] error:', e.message);
    res.end(`error: ${e.message}`);
  }
});

function finish() {
  const done = BRANDS.filter(b => has(b.slug));
  console.log(`\n[flow] ${done.length}/${BRANDS.length} authorized. Running automation: branding → MCP → secrets → smoke tests...\n`);
  server.close();
  spawnSync('node', ['brand-channels.mjs', '--apply'], { stdio: 'inherit' });
  spawnSync('node', ['wire-mcp-entries.mjs'], { stdio: 'inherit' });
  spawnSync('node', ['set-yt-secrets.mjs', ...done.map(b => b.slug)], { stdio: 'inherit' });
  for (const b of done) spawnSync('node', ['yt-mcp/smoke-test.mjs', `yt-mcp/channels/${b.slug}/token.json`], { stdio: 'inherit' });
  console.log('\n[flow] ALL DONE — user should restart ZCode, then do the Studio rename/handle/avatar steps (yt-brands/ONBOARDING.md).');
  process.exit(0);
}

const first = pending()[0];
if (!first) {
  console.log('[flow] all brands already authorized — running automation only.');
  finish();
} else {
  server.listen(3000, () => {
    console.log(`[flow] server on :3000 — ${BRANDS.length - pending().length}/${BRANDS.length} already done. Opening step 1: ${first.label}`);
    open('http://localhost:3000/');
    setTimeout(() => open(`http://localhost:3000/start/${first.slug}`), 1200);
  });
}
