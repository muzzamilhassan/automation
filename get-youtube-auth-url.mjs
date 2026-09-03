// One-time YouTube OAuth flow: prints a consent URL, starts a local callback
// server on :3000, exchanges the code, and saves the refresh token.
// Scopes: upload + readonly + force-ssl (force-ssl enables comment posting
// and videos.update — needed for auto-comments and slot rebalancing).
// Usage: node get-youtube-auth-url.mjs
import fs from 'node:fs';
import http from 'node:http';
import { google } from 'googleapis';

const envStr = fs.readFileSync('.env', 'utf8');
const CLIENT_ID = envStr.match(/^YOUTUBE_CLIENT_ID=(.+)$/m)?.[1]?.trim();
const CLIENT_SECRET = envStr.match(/^YOUTUBE_CLIENT_SECRET=(.+)$/m)?.[1]?.trim();
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/youtube.force-ssl'
  ],
  prompt: 'consent'
});

console.log('\n1. Open this URL in your browser and approve access:\n');
console.log(authUrl);
console.log('\n2. Waiting for the callback on http://localhost:3000 ...\n');

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, REDIRECT_URI);
    if (url.pathname !== '/oauth2callback') { res.end('waiting...'); return; }
    const code = url.searchParams.get('code');
    if (!code) { res.end('no code received'); return; }
    res.end('<html><body style="font-family:sans-serif"><h2>✅ Authorized! You can close this tab.</h2></body></html>');

    const { tokens } = await oauth2Client.getToken(code);
    console.log('\n=== SUCCESS ===');
    console.log('NEW YOUTUBE_REFRESH_TOKEN:\n');
    console.log(tokens.refresh_token);
    console.log('\nSaved to youtube-oauth-tokens.json');
    fs.writeFileSync('youtube-oauth-tokens.json', JSON.stringify(tokens, null, 2));
    server.close();
    process.exit(0);
  } catch (e) {
    console.error('Callback error:', e.message);
    res.end('error — see terminal');
  }
});
server.listen(3000);
