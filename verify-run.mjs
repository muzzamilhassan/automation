// Proof-of-publication (09-20): after a channel run, verify the uploads the
// run claims REALLY exist on YouTube. Lesson from 09-19: a dead token still
// printed "✓ Shorts queued / Errors: 0" while nothing was uploaded.
// Usage: node verify-run.mjs <slug> [--min N]
//   reads lastVideos from the channel's state, checks each videoId on YouTube.
//   any missing id, or fewer than --min claimed → ntfy alert + exit 1.
import fs from 'node:fs';
import { google } from 'googleapis';
import { loadChannelState } from './lib/state.mjs';

const envRaw = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
for (const m of envRaw.matchAll(/^([A-Z_0-9]+)=(.*)$/gm)) process.env[m[1]] ??= m[2].trim();

const slug = process.argv[2];
const minArg = process.argv.indexOf('--min');
const MIN = minArg > 0 ? Math.max(1, Number(process.argv[minArg + 1]) || 1) : 1;
if (!slug) { console.error('usage: node verify-run.mjs <slug> [--min N]'); process.exit(2); }

const st = loadChannelState(slug);
const claimed = (st.lastVideos || []).filter(v => v && v.videoId);
console.log(`[verify] ${slug}: run claims ${claimed.length} upload(s), minimum expected ${MIN}`);

async function alert(text) {
  console.log(`[verify] ALERT: ${text}`);
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return;
  try {
    await fetch(`https://ntfy.sh/${topic}`, {
      method: 'POST', headers: { 'Content-Type': 'text/plain', Title: `Upload verification FAILED: ${slug}` },
      body: text
    });
  } catch { }
}

let missing = [];
try {
  const tokenFile = `yt-mcp/channels/${slug}/token.json`;
  const raw = process.env[`YT_TOKEN_${slug.toUpperCase().replace(/-/g, '_')}`] || (fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8') : '');
  if (!raw) throw new Error('no token');
  const t = JSON.parse(raw);
  const auth = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: t.refresh_token });
  const yt = google.youtube({ version: 'v3', auth });
  for (const v of claimed) {
    const r = await yt.videos.list({ part: 'id', id: v.videoId });
    if (!(r.data.items || []).length) missing.push(v.videoId);
  }
} catch (e) {
  // verifier could not even talk to YouTube — that is a failure too
  await alert(`could not verify ${slug} (${String(e.message).slice(0, 80)}). Claims: ${claimed.map(v => v.videoId).join(', ') || 'none'}`);
  process.exit(1);
}

if (missing.length) {
  await alert(`${slug}: ${missing.length} claimed upload(s) MISSING from YouTube: ${missing.join(', ')}`);
  process.exit(1);
}
if (claimed.length < MIN) {
  await alert(`${slug}: run produced only ${claimed.length}/${MIN} expected uploads — check the run log`);
  process.exit(1);
}
console.log(`[verify] OK — all ${claimed.length} upload(s) exist on YouTube`);
