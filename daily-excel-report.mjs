// Daily Excel Report — ALL channels, ALL platforms, structured data.
// Usage: node daily-excel-report.mjs
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { google } from 'googleapis';

const envRaw = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
for (const m of envRaw.matchAll(/^([A-Z_0-9]+)=(.*)$/gm)) process.env[m[1]] ??= m[2].trim();

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const FB_TOKEN = process.env.FB_PAGE_TOKEN;

const CHANNELS = [
  { slug: 'quotequarry', label: 'Quote Quarry', fbPageId: '108044922375174' },
  { slug: 'investors-compass', label: "Investor's Compass", fbPageId: '116157974886564' },
  { slug: 'money-rulebook', label: 'The Money Rulebook', fbPageId: '1077306835630491' },
  { slug: 'debt-free-doctrine', label: 'Debt-Free Doctrine', fbPageId: '106473735839651' }
];

async function getYtAuth(slug) {
  const envName = 'YT_TOKEN_' + slug.toUpperCase().replace(/-/g, '_');
  const tokenFile = path.join('yt-mcp', 'channels', slug, 'token.json');
  const raw = process.env[envName] || (fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8') : '');
  if (!raw) return null;
  const t = JSON.parse(raw);
  const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
  auth.setCredentials({ refresh_token: t.refresh_token });
  return auth;
}

async function fetchAll() {
  const ytData = [];
  for (const ch of CHANNELS) {
    const auth = await getYtAuth(ch.slug);
    if (!auth) continue;
    try {
      const yt = google.youtube({ version: 'v3', auth });
      const res = await yt.channels.list({ part: 'snippet,statistics', mine: true });
      const c = res.data.items && res.data.items[0];
      if (c) {
        ytData.push({
          label: ch.label,
          title: c.snippet.title,
          handle: c.snippet.customUrl || '',
          subs: Number(c.statistics.subscriberCount) || 0,
          views: Number(c.statistics.viewCount) || 0,
          videos: Number(c.statistics.videoCount) || 0
        });
      }
    } catch (e) {
      console.log('YT error for ' + ch.slug + ': ' + e.message);
    }
  }

  let fbPages = [];
  if (FB_TOKEN) {
    try {
      const res = await fetch('https://graph.facebook.com/v20.0/me/accounts?fields=id,name,username,fan_count,followers_count,instagram_business_account{username,followers_count,media_count}&access_token=' + FB_TOKEN);
      const d = await res.json();
      fbPages = (d.data || []).map(function (p) {
        return {
          name: p.name,
          username: p.username || '',
          followers: p.followers_count || 0,
          igUsername: p.instagram_business_account ? p.instagram_business_account.username : null,
          igFollowers: p.instagram_business_account ? (p.instagram_business_account.followers_count || 0) : 0,
          igPosts: p.instagram_business_account ? (p.instagram_business_account.media_count || 0) : 0
        };
      });
    } catch (e) { console.log('FB fetch error: ' + e.message); }
  }

  return { ytData: ytData, fbPages: fbPages };
}

function styleHeader(ws) {
  var row = ws.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a1a2e' } };
  row.height = 22;
}

async function buildExcel(ytData, fbPages) {
  var wb = new ExcelJS.Workbook();
  wb.creator = 'Quarry Studio';

  var ws1 = wb.addWorksheet('Overview');
  ws1.columns = [
    { header: 'Channel', width: 28 },
    { header: 'Platform', width: 14 },
    { header: 'Handle', width: 28 },
    { header: 'Subs/Followers', width: 18 },
    { header: 'Total Views', width: 15 },
    { header: 'Videos', width: 12 }
  ];
  styleHeader(ws1);
  ytData.forEach(function (y) {
    ws1.addRow([y.label, 'YouTube', y.handle, y.subs, y.views, y.videos]);
  });
  fbPages.forEach(function (p) {
    ws1.addRow([p.name, 'Facebook', p.username ? '@' + p.username : '', p.followers, '-', '-']);
  });

  var ws2 = wb.addWorksheet('YouTube Details');
  ws2.columns = [
    { header: 'Channel', width: 28 },
    { header: 'Handle', width: 25 },
    { header: 'Subscribers', width: 15 },
    { header: 'Total Views', width: 15 },
    { header: 'Videos', width: 12 }
  ];
  styleHeader(ws2);
  ytData.forEach(function (y) {
    ws2.addRow([y.label, y.handle, y.subs, y.views, y.videos]);
  });

  var ws3 = wb.addWorksheet('Facebook Pages');
  ws3.columns = [
    { header: 'Page', width: 25 },
    { header: 'Username', width: 25 },
    { header: 'Followers', width: 15 }
  ];
  styleHeader(ws3);
  fbPages.forEach(function (p) {
    ws3.addRow([p.name, p.username ? '@' + p.username : '', p.followers]);
  });

  var dir = 'reports';
  fs.mkdirSync(dir, { recursive: true });
  var file = path.join(dir, 'daily-report-' + new Date().toISOString().slice(0, 10) + '.xlsx');
  await wb.xlsx.writeFile(file);
  return file;
}

// ---- main ----
console.log('[report] Fetching all channel data...');
fetchAll().then(function (data) {
  buildExcel(data.ytData, data.fbPages).then(function (file) {
    console.log('[report] Excel saved: ' + file);
    console.log('[report] Done');
  });
}).catch(function (e) {
  console.error('[report] Error: ' + e.message);
});
