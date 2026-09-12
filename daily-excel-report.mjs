// Daily Excel Report — all channels, all platforms, structured data.
// Usage: node daily-excel-report.mjs
// Output: reports/daily-report-<date>.xlsx
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { google } from 'googleapis';

const ROOT = process.cwd();
const envRaw = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
for (const m of envRaw.matchAll(/^([A-Z_0-9]+)=(.*)$/gm)) process.env[m[1]] ??= m[2].trim();

const SLUGS = ['investors-compass', 'money-rulebook', 'debt-free-doctrine', 'quotequarry'];
const brands = JSON.parse(fs.readFileSync('lib/brands.json', 'utf8'));

async function ytToken(slug) {
  const envName = `YT_TOKEN_${slug.toUpperCase().replace(/-/g, '_')}`;
  const tokenFile = `yt-mcp/channels/${slug}/token.json`;
  const raw = process.env[envName] || (fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8') : '');
  if (!raw) return null;
  const t = JSON.parse(raw);
  const auth = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: t.refresh_token });
  return auth;
}

async function fetchAll() {
  const ytData = [];
  let fbData = [];
  for (const slug of SLUGS) {
    try {
      const auth = await ytToken(slug);
      if (!auth) continue;
      const yt = google.youtube({ version: 'v3', auth });
      const { data } = await yt.channels.list({ part: 'snippet,statistics', mine: true });
      const c = data.items?.[0];
      if (c) ytData.push({
        slug, title: c.snippet.title, handle: c.snippet.customUrl || '',
        subs: +c.statistics.subscriberCount || 0, views: +c.statistics.viewCount || 0, videos: +c.statistics.videoCount || 0
      });
    } catch (e) { ytData.push({ slug, title: 'ERROR', subs: 0, views: 0, videos: 0 }); }
  }

  let fbPages = [];
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/me/accounts?fields=id,name,username,fan_count,followers_count,instagram_business_account{username,followers_count,media_count}&access_token=${process.env.FB_PAGE_TOKEN}`);
    const d = await res.json();
    fbPages = (d.data || []).map(p => ({
      name: p.name, username: p.username || '', followers: p.followers_count || 0,
      igUsername: p.instagram_business_account?.username || null,
      igFollowers: p.instagram_business_account?.followers_count || 0,
      igPosts: p.instagram_business_account?.media_count || 0
    }));
  } catch { }

  return { ytData, fbPages };
}

// ---------- Build Excel ----------
async function buildExcel(ytData, fbPages) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Quarry Studio';

  // Sheet 1: Overview
  const ws1 = wb.addWorksheet('📊 Overview');
  ws1.columns = [
    { header: 'Channel', width: 25 }, { header: 'Platform', width: 15 },
    { header: 'Handle', width: 25 }, { header: 'Subscribers/Followers', width: 20 },
    { header: 'Total Views', width: 15 }, { header: 'Videos/Posts', width: 15 }
  ];
  ws1.getRow(1).font = { bold: true };
  ws1.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a1a2e' } };
  ws1.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  for (const y of ytData) {
    ws1.addRow([y.title, 'YouTube', y.handle, y.subs, y.views, y.videos]);
  }
  for (const p of fbPages) {
    ws1.addRow([p.name, 'Facebook', '@' + p.username, p.followers, '—', '—']);
    if (p.igUsername) ws1.addRow([p.name, 'Instagram', '@' + p.igUsername, p.igFollowers, p.igPosts, '—']);
  }

  // Sheet 2: YouTube Details
  const ws2 = wb.addWorksheet('📺 YouTube Details');
  ws2.columns = [
    { header: 'Channel', width: 25 }, { header: 'Handle', width: 25 },
    { header: 'Subscribers', width: 15 }, { header: 'Total Views', width: 15 },
    { header: 'Videos', width: 12 }, { header: 'Avg Views/Video', width: 18 }
  ];
  ws2.getRow(1).font = { bold: true };
  for (const y of ytData) {
    ws2.addRow([y.title, y.handle, y.subs, y.views, y.videos, y.videos > 0 ? Math.round(y.views / y.videos) : 0]);
  }

  // Sheet 3: Facebook Pages
  const ws3 = wb.addWorksheet('📘 Facebook Pages');
  ws3.columns = [
    { header: 'Page Name', width: 25 }, { header: 'Username', width: 25 },
    { header: 'Followers', width: 15 }, { header: 'IG Linked', width: 20 }, { header: 'IG Followers', width: 15 }
  ];
  ws3.getRow(1).font = { bold: true };
  for (const p of fbPages) {
    ws3.addRow([p.name, '@' + p.username, p.followers, p.igUsername ? '@' + p.igUsername : '—', p.igFollowers]);
  }

  // Sheet 4: Publishing Log (from state)
  const ws4 = wb.addWorksheet('📋 Publishing Log');
  ws4.columns = [
    { header: 'Date', width: 15 }, { header: 'Channel', width: 22 },
    { header: 'Title', width: 50 }, { header: 'Video ID', width: 18 }
  ];
  ws4.getRow(1).font = { bold: true };
  try {
    const st = JSON.parse(fs.readFileSync('yt-mcp/schedule-state.json', 'utf8'));
    for (const [slug, s] of Object.entries(st)) {
      for (const v of s.lastVideos || []) {
        ws4.addRow([v.publishAt?.slice(0, 10) || '', slug, v.title, v.videoId]);
      }
    }
  } catch { }

  // Formats
  for (const ws of [ws1, ws2, ws3, ws4]) {
    ws.views = { width: 15 };
  }

  const dir = 'reports';
  fs.mkdirSync(dir, { recursive: true });
  const file = `${dir}/daily-report-${today()}.xlsx`;
  await wb.xlsx.writeFile(file);

  // Send to NTFY (push notification + file attachment)
  if (process.env.NTFY_TOPIC) {
    try {
      const topic = process.env.NTFY_TOPIC.trim().replace(/[^a-zA-Z0-9_-]/g, '');
      const msg = `📊 Daily Report — ${today()}\n${ytData.length} YouTube channels + ${fbPages.length} FB pages tracked\n\nExcel attached ⬇️`;
      await fetch(`https://ntfy.sh/${topic}`, {
        method: 'POST',
        headers: { 'Title': 'Quarry Daily Report', 'Tags': 'chart', 'Filename': `daily-report-${today()}.xlsx` },
        body: fs.readFileSync(file)
      });
      console.log(`[report] ✅ NTFY notification sent to topic: ${topic}`);
    } catch (e) { console.log(`[report] NTFY send failed: ${e.message.slice(0, 80)}`); }
  }

  return file;
}
function today() { return new Date().toISOString().slice(0, 10); }

// ---------- main ----------
console.log('[report] Fetching all channel data...');
const { ytData, fbPages } = await fetchAll();
const file = await buildExcel(ytData, fbPages);
console.log(`[report] ✅ Excel report: ${file}`);
console.log(`[report] Channels: ${ytData.length} YT + ${fbPages.length} FB pages tracked`);
