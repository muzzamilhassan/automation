// CI Doctor — checks all channels are healthy and publishing.
// Usage: node ci-doctor.mjs
// Creates a health report and GitHub issue if problems found.
import fs from 'node:fs';
import { google } from 'googleapis';

const envRaw = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
for (const m of envRaw.matchAll(/^([A-Z_0-9]+)=(.*)$/gm)) process.env[m[1]] ??= m[2].trim();

const SLUGS = ['investors-compass', 'money-rulebook', 'debt-free-doctrine', 'quotequarry'];
const results = [];

for (const slug of SLUGS) {
  const envName = `YT_TOKEN_${slug.toUpperCase().replace(/-/g, '_')}`;
  const tokenFile = `yt-mcp/channels/${slug}/token.json`;
  const raw = process.env[envName] || (fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8') : '');
  if (!raw) { results.push({ slug, status: 'NO_TOKEN' }); continue; }

  try {
    const t = JSON.parse(raw);
    const auth = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: t.refresh_token });
    const yt = google.youtube({ version: 'v3', auth });

    const { data } = await yt.channels.list({ part: 'snippet,statistics', mine: true });
    const c = data.items?.[0];
    if (!c) { results.push({ slug, status: 'NO_CHANNEL' }); continue; }

    // Check for videos in last 48h
    const since = new Date(Date.now() - 48 * 3600000).toISOString();
    const { data: vData } = await yt.search.list({
      part: 'snippet', forMine: true, type: 'video', order: 'date',
      maxResults: 5, publishedAfter: since
    });
    const recent = vData.items?.length || 0;

    results.push({
      slug,
      channel: c.snippet.title,
      subs: c.statistics.subscriberCount,
      totalVideos: c.statistics.videoCount,
      last48hVideos: recent,
      status: recent > 0 ? 'OK' : 'NO_RECENT_VIDEOS'
    });
  } catch (e) {
    results.push({ slug, status: 'ERROR', error: e.message.slice(0, 100) });
  }
}

// Report
console.log('\n=== CI DOCTOR REPORT ===');
let problems = 0;
for (const r of results) {
  const icon = r.status === 'OK' ? '✅' : '⚠️';
  console.log(`${icon} ${r.slug} | ${r.channel || 'N/A'} | subs: ${r.subs || '?'} | videos(48h): ${r.last48hVideos || 0} | status: ${r.status}`);
  if (r.status !== 'OK') problems++;
}
console.log(`\n${problems} channel(s) with issues out of ${results.length}`);

// Save report for CI to pick up
fs.writeFileSync('ci-doctor-report.json', JSON.stringify({ at: new Date().toISOString(), problems, results }, null, 2));
console.log('Report saved: ci-doctor-report.json');
