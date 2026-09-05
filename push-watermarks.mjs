// Push the 150x150 brand watermark to every onboarded channel's videos.
// Uses the raw multipart REST call (googleapis watermarks.set maps a bad URL).
// Usage: node push-watermarks.mjs [--only slug]
import fs from 'node:fs';
import { google } from 'googleapis';
import { BRANDS } from './yt-brands/brands.mjs';

const envStr = fs.readFileSync('.env', 'utf8');
const CLIENT_ID = envStr.match(/^YOUTUBE_CLIENT_ID=(.+)$/m)?.[1]?.trim();
const CLIENT_SECRET = envStr.match(/^YOUTUBE_CLIENT_SECRET=(.+)$/m)?.[1]?.trim();
const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx > -1 ? process.argv[onlyIdx + 1] : null;

async function setWatermark(auth, channelId, pngPath) {
  const tok = await auth.getAccessToken();
  const at = typeof tok === 'string' ? tok : (tok?.token || tok?.res?.data?.access_token);
  const meta = JSON.stringify({
    timing: { type: 'offsetFromStart', offsetMs: 0, durationMs: 3600000 },
    position: { type: 'corner', cornerPosition: 'bottomRight' }
  });
  const B = 'XXyutuXX';
  const body = Buffer.concat([
    Buffer.from(`--${B}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${B}\r\nContent-Type: image/png\r\n\r\n`),
    fs.readFileSync(pngPath),
    Buffer.from(`\r\n--${B}--`)
  ]);
  const r = await fetch(`https://www.googleapis.com/upload/youtube/v3/watermarks/set?uploadType=multipart&channelId=${channelId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${at}`, 'Content-Type': `multipart/related; boundary=${B}` },
    body
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 140)}`);
}

for (const b of BRANDS) {
  if (only && b.slug !== only) continue;
  try {
    const t = JSON.parse(fs.readFileSync(`yt-mcp/channels/${b.slug}/token.json`, 'utf8'));
    const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
    auth.setCredentials({ refresh_token: t.refresh_token });
    const yt = google.youtube({ version: 'v3', auth });
    const { data: me } = await yt.channels.list({ part: 'id', mine: true });
    const channelId = me.items?.[0]?.id;
    if (!channelId) { console.error(`✗ ${b.label}: no channel on token`); continue; }
    await setWatermark(auth, channelId, `yt-brands/watermarks/${b.slug}.png`);
    console.log(`✓ ${b.label}: watermark set (bottom-right, entire video)`);
  } catch (e) {
    console.error(`✗ ${b.label}: ${e.message}`);
  }
}
