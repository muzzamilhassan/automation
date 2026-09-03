// One-off tool: spread crowded scheduled YouTube Shorts across the
// 05:45 / 13:30 / 18:45 PKT slots (max MAX_PER_SLOT each), oldest upload first.
// Usage: node rebalance-yt-slots.mjs
import fs from 'node:fs';
import { google } from 'googleapis';

const MAX_PER_SLOT = 5;
const envStr = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
const envOf = (k) => process.env[k] || (envStr.match(new RegExp(`^${k}=(.+)$`, 'm')) || [])[1]?.trim() || '';

const oauth2Client = new google.auth.OAuth2(
  envOf('YOUTUBE_CLIENT_ID'), envOf('YOUTUBE_CLIENT_SECRET'), 'http://localhost:3000/oauth2callback');
oauth2Client.setCredentials({ refresh_token: envOf('YOUTUBE_REFRESH_TOKEN') });
const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

const slots = [];
{
  const slotsSec = [45 * 60, 8 * 3600 + 30 * 60, 13 * 3600 + 45 * 60];
  const t = Date.now() / 1000 + 15 * 60;
  const dayStart = Math.floor(t / 86400) * 86400;
  for (let d = 0; d < 14 && slots.length < 21; d++) {
    for (const s of slotsSec) {
      const ts = dayStart + d * 86400 + s;
      if (ts > t) slots.push(new Date(ts * 1000).toISOString());
    }
  }
}

const s = await youtube.search.list({ part: 'id', forMine: true, type: 'video', order: 'date', maxResults: 50 });
const ids = (s.data.items || []).map((i) => i.id.videoId).filter(Boolean);
const v = await youtube.videos.list({ part: 'snippet,status', id: ids.join(',') });
const scheduled = (v.data.items || [])
  .filter((x) => x.status?.privacyStatus === 'private' && x.status?.publishAt)
  .sort((a, b) => a.status.publishAt.localeCompare(b.status.publishAt));

const counts = {};
const moves = [];
for (const item of scheduled) {
  const cur = item.status.publishAt;
  counts[cur] = (counts[cur] || 0) + 1;
  if (counts[cur] <= MAX_PER_SLOT) continue;
  const free = slots.find((slot) => (counts[slot] || 0) < MAX_PER_SLOT && slot > cur);
  if (!free) { console.log(`No free slot for ${item.id}; leaving at ${cur}`); continue; }
  counts[free] = (counts[free] || 0) + 1;
  counts[cur]--;
  moves.push({ id: item.id, title: item.snippet.title, from: cur, to: free });
}

for (const m of moves) {
  await youtube.videos.update({
    part: 'status',
    requestBody: { id: m.id, status: { privacyStatus: 'private', publishAt: m.to, selfDeclaredMadeForKids: false } }
  });
  console.log(`✓ ${m.title} → ${m.from} moved to ${m.to}`);
}
if (!moves.length) console.log('Nothing to rebalance.');
