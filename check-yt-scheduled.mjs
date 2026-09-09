// Local check: list the newest uploads on the channel (incl. private/scheduled)
// to confirm the YouTube Shorts flow published correctly.
// Usage: node check-yt-scheduled.mjs
import fs from 'node:fs';
import { google } from 'googleapis';

const envStr = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
const envOf = (k) => process.env[k] || (envStr.match(new RegExp(`^${k}=(.+)$`, 'm')) || [])[1]?.trim() || '';

const oauth2Client = new google.auth.OAuth2(
  envOf('YOUTUBE_CLIENT_ID'), envOf('YOUTUBE_CLIENT_SECRET'), 'http://localhost:3000/oauth2callback');
oauth2Client.setCredentials({ refresh_token: envOf('YOUTUBE_REFRESH_TOKEN') });
const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

const search = await youtube.search.list({ part: 'snippet', forMine: true, type: 'video', order: 'date', maxResults: 8 });
const ids = search.data.items?.map((i) => i.id.videoId).filter(Boolean) || [];
if (!ids.length) { console.log('No uploads found.'); process.exit(0); }

const vids = await youtube.videos.list({ part: 'snippet,status', id: ids.join(',') });
for (const v of vids.data.items || []) {
  const s = v.status || {};
  console.log(`${v.snippet.publishedAt} | ${s.privacyStatus}${s.publishAt ? ' (publishAt ' + s.publishAt + ')' : ''} | ${v.snippet.title}`);
}
