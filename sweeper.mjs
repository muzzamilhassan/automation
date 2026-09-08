// Self-healing sweeper: runs after all content slots. Checks the last 24h of
// posts and automatically re-runs any brand whose YouTube Shorts are missing,
// and re-dispatches the daily long-form if today's never went live.
// Usage: node sweeper.mjs
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { google } from 'googleapis';

const envStr = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
const envOf = (k) => process.env[k] || (envStr.match(new RegExp(`^${k}=(.+)$`, 'm')) || [])[1]?.trim() || '';

// --- 1. YouTube uploads in the last 24h per brand --------------------------
const oauth2Client = new google.auth.OAuth2(
  envOf('YOUTUBE_CLIENT_ID'), envOf('YOUTUBE_CLIENT_SECRET'), 'http://localhost:3000/oauth2callback');
oauth2Client.setCredentials({ refresh_token: envOf('YOUTUBE_REFRESH_TOKEN') });
const y = google.youtube({ version: 'v3', auth: oauth2Client });

const ch = await y.channels.list({ part: 'contentDetails', mine: true });
const pl = await y.playlistItems.list({ part: 'contentDetails', playlistId: ch.data.items[0].contentDetails.relatedPlaylists.uploads, maxResults: 50 });
const ids = pl.data.items.map((i) => i.contentDetails.videoId).filter(Boolean);
const vids = [];
for (let i = 0; i < ids.length; i += 50) {
  const v = await y.videos.list({ part: 'snippet', id: ids.slice(i, i + 50).join(',') });
  vids.push(...(v.data.items || []));
}
const cutoff = Date.now() - 24 * 3600000;
const recent = vids.filter((v) => new Date(v.snippet.publishedAt).getTime() > cutoff);

// brand → count (title contains the authority suffix keyword)
const BRAND_KEYWORDS = [
  ['116157974886564', 'Money Psychology', 'Silent Wealth'],
  ['108044922375174', 'Stoicism Philosophy', 'Strategic Silence'],
  ['1077306835630491', '| Discipline', 'Eon Ventures'],
  ['114550268199751', 'Stoic', 'Reliq North'],
  ['106473735839651', 'Psychology', 'Boundaries Club']
];
const missing = [];
for (const [pageId, marker, name] of BRAND_KEYWORDS) {
  const count = recent.filter((v) => v.snippet.title.includes(marker) || (marker === 'Stoic' && v.snippet.title.includes('Calm'))).length;
  console.log(`${name}: ${count} Shorts in last 24h`);
  if (count === 0) missing.push(pageId);
}

// --- 2. Re-run missing brands ----------------------------------------------
const PAGE_INDEX = { '116157974886564': 0, '108044922375174': 1, '1077306835630491': 2, '114550268199751': 3, '106473735839651': 4 };
for (const pageId of missing) {
  const idx = PAGE_INDEX[pageId];
  console.log(`⚠ ${PAGE_INDEX[pageId] !== undefined ? 'Re-running' : ''} brand index ${idx} (${BRAND_KEYWORDS.find((b) => b[0] === pageId)[2]})...`);
  try {
    execFileSync('node', ['run-content-machine.mjs', String(idx)], { stdio: 'inherit', timeout: 25 * 60 * 1000 });
  } catch (e) {
    console.log(`✗ retry failed for brand ${idx}:`, String(e.message).slice(0, 100));
  }
}
if (!missing.length) console.log('✓ All 5 brands have Shorts in the last 24h.');

// --- 3. Daily long-form check + re-dispatch --------------------------------
const today = new Date(Date.now() + 300 * 60000).toISOString().slice(0, 10);
const hasLong = recent.some((v) => /compilation/i.test(v.snippet.title) && v.snippet.publishedAt.slice(0, 10) >= today);
const utcHour = new Date().getUTCHours();
if (!hasLong && utcHour >= 13 && utcHour < 21) {
  console.log('⚠ No daily long-form yet — re-dispatching compilation workflow...');
  try {
    const token = envOf('GITHUB_PAT') || envOf('SECRET_WRITER_PAT');
    const repo = process.env.GITHUB_REPOSITORY || 'muzzamilhassan/automation';
    execFileSync('curl', ['-s', '-X', 'POST',
      '-H', `Authorization: token ${token}`,
      `https://api.github.com/repos/${repo}/actions/workflows/weekly-compilation.yml/dispatches`,
      '-d', '{"ref":"main"}'], { timeout: 30000 });
    console.log('✓ Long-form re-dispatched.');
  } catch (e) { console.log('✗ re-dispatch failed:', e.message); }
} else {
  console.log(hasLong ? '✓ Daily long-form is live.' : 'Long-form window not reached yet.');
}
console.log('\nSweeper done.');
