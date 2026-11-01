// Daily Excel Report — ALL active registry channels, ALL platforms, structured data.
// Fix 2026-09-12: channels.list(mine:true) returned the account's ACTIVE channel
// (Quote Quarry) for every token — all 4 channels are on one Google account.
// Now stats are fetched per-handle via channels.list({ forHandle }) which is
// ownership-independent. FB pages filtered to the CURRENT brand pages
// (old brand pages no longer pollute the report). IG / Threads / TikTok added.
// #106 T4b: the channel list comes from the registry (yt-mcp/studio-channels.json,
// active only, via lib/registry-slugs.mjs) — new channels join without a code
// change. For the reporting-daily matrix the script gains per-invocation modes:
//   node daily-excel-report.mjs [daily|weekly|monthly]              full report (legacy path)
//   node daily-excel-report.mjs --channel <slug>                    one channel → fragment JSON
//                                                                   (reporting-daily matrix job)
//   node daily-excel-report.mjs [mode] --collect                    merge fragment JSONs into
//                                                                   the same workbook (collect job)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ExcelJS from 'exceljs';
import { google } from 'googleapis';
import { fbPageId as registryFbPageId, destinationsFor, normHandle } from './lib/registry.mjs';
import { activeRegistryChannels, loadRegistryChannels } from './lib/registry-slugs.mjs';
import { loadEnv } from './lib/env.mjs';

loadEnv();





const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const FB_TOKEN = process.env.FB_PAGE_TOKEN;

// ---- CLI: positional mode + --channel <slug> (per-channel fragment for the
// reporting matrix) + --collect (merge fragments into the daily payload) ----
export function parseReportArgs(argv = process.argv.slice(2)) {
  const channelIdx = argv.indexOf('--channel');
  const channel = channelIdx >= 0 ? argv[channelIdx + 1] : null;
  // the value after --channel is a slug, never the mode
  const mode = (argv.find((a, i) => !a.startsWith('--') && (channelIdx < 0 || i !== channelIdx + 1)) || 'daily').toLowerCase();
  return { mode, channel, collect: argv.includes('--collect') };
}

// T4b: channels come from the registry (yt-mcp/studio-channels.json, active
// only) — labels/handles ride the entry; fbPageId resolves via lib/registry.mjs
// (canonical legacy map, then the entry's destinations). NO hardcoded list.
// T4c: each channel also carries its resolved social destinations
// (igHandle/threadsHandle/tiktokHandle) — the Overview sheet's Threads/TikTok
// rows are destinations-driven.
export function reportChannels() {
  return activeRegistryChannels(loadRegistryChannels()).map((c) => ({
    ...c,
    fbPageId: registryFbPageId(c.slug),
    igHandle: destinationsFor(c.slug)?.igHandle,
    threadsHandle: destinationsFor(c.slug)?.threadsHandle,
    tiktokHandle: destinationsFor(c.slug)?.tiktokHandle,
  }));
}
const CHANNELS = reportChannels();

// FB pairing mirrors fb-crosspost.mjs PAGE_MAP (audience-matched: the YT channel
// feeds a page whose name is a legacy brand name — both are shown in the report).
// Extra owned page, not part of the brand pairing (kept visible for its stats)
const EXTRA_PAGE_IDS = []; // Reliq North is now QQ's primary FB page (moved 09-20)
const KNOWN_PAGE_IDS = new Set([...CHANNELS.map(c => c.fbPageId), ...EXTRA_PAGE_IDS]);

// ---- YouTube auth: env-first per channel, then token file; pick one that works ----
function getYtAuth(slug) {
  const envName = 'YT_TOKEN_' + slug.toUpperCase().replace(/-/g, '_');
  const tokenFile = path.join('yt-mcp', 'channels', slug, 'token.json');
  const raw = process.env[envName] || (fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8') : '');
  if (!raw) return null;
  try {
    const t = JSON.parse(raw);
    if (!t.refresh_token) return null;
    const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
    auth.setCredentials({ refresh_token: t.refresh_token });
    return auth;
  } catch { return null; }
}

let workingAuth = null;
async function getWorkingAuth(channels = CHANNELS) {
  if (workingAuth) return workingAuth;
  for (const ch of channels) {
    const auth = getYtAuth(ch.slug);
    if (!auth) { console.log('[report] no token for ' + ch.slug); continue; }
    try {
      const yt = google.youtube({ version: 'v3', auth });
      await yt.channels.list({ part: 'id', mine: true, maxResults: 1 }); // refresh test only
      workingAuth = auth;
      return auth;
    } catch (e) {
      console.log('[report] token dead for ' + ch.slug + ': ' + e.message.slice(0, 120));
    }
  }
  return null;
}

async function fetchAll(channels = CHANNELS) {
  const ytData = [];
  const knownPageIds = new Set([...channels.map(c => c.fbPageId), ...EXTRA_PAGE_IDS]);
  const auth = await getWorkingAuth(channels);
  if (!auth) console.log('[report] GAP: no working YouTube token — YouTube rows will be empty');
  if (auth) {
    const yt = google.youtube({ version: 'v3', auth });
    const ya = google.youtubeAnalytics({ version: 'v2', auth });
    for (const ch of channels) {
      try {
        const res = await yt.channels.list({ part: 'snippet,statistics,contentDetails', forHandle: ch.handle });
        const c = res.data.items && res.data.items[0];
        if (!c) { console.log('[report] GAP: handle not found on YouTube: ' + ch.handle); continue; }
        // Retention (28d): the #1 Shorts signal — avg % watched + views + subs gained.
        let retention = null;
        try {
          const end = new Date().toISOString().slice(0, 10);
          const start = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);
          const ar = await ya.reports.query({ ids: 'channel==MINE', startDate: start, endDate: end, metrics: 'views,averageViewPercentage,subscribersGained' });
          const row = (ar.data.rows || [])[0];
          if (row) retention = { views: Number(row[0]) || 0, avgPct: Number(row[1]), subsGained: Number(row[2]) || 0 };
        } catch (e) { console.log('[report] analytics gap for ' + ch.slug + ': ' + e.message.slice(0, 70)); }
        // Per-video views: last 50 uploads (public data — any working token can read)
        const videoRows = [];
        const uploads = c.contentDetails && c.contentDetails.relatedPlaylists && c.contentDetails.relatedPlaylists.uploads;
        if (uploads) {
          const pl = await yt.playlistItems.list({ part: 'contentDetails', playlistId: uploads, maxResults: 50 });
          const ids = pl.data.items.map(i => i.contentDetails.videoId).filter(Boolean);
          for (let i = 0; i < ids.length; i += 50) {
            const vr = await yt.videos.list({ part: 'snippet,statistics,status', id: ids.slice(i, i + 50).join(',') });
            for (const it of (vr.data.items || [])) {
              videoRows.push({
                channel: ch.label,
                title: (it.snippet.title || '').slice(0, 70),
                videoId: it.id,
                goesLive: ((it.status && (it.status.publishAt || it.snippet.publishedAt)) || '').replace('T', ' ').slice(0, 16) + ' UTC',
                privacy: (it.status && it.status.privacyStatus) || 'public',
                views: Number(it.statistics && it.statistics.viewCount) || 0,
                likes: Number(it.statistics && it.statistics.likeCount) || 0,
                comments: Number(it.statistics && it.statistics.commentCount) || 0
              });
            }
          }
        }
        ytData.push({
          label: ch.label,
          title: c.snippet.title,
          handle: c.snippet.customUrl || ch.handle,
          subs: Number(c.statistics.subscriberCount) || 0,
          views: Number(c.statistics.viewCount) || 0,
          videos: Number(c.statistics.videoCount) || 0,
          retention,
          videoRows
        });
      } catch (e) {
        console.log('[report] YT error for ' + ch.slug + ': ' + e.message.slice(0, 120));
      }
    }
  }

  // FB: fetch all pages once, keep ONLY the current brand pages
  let fbPages = [];
  if (FB_TOKEN) {
    try {
      const res = await fetch('https://graph.facebook.com/v20.0/me/accounts?fields=id,name,username,fan_count,followers_count,instagram_business_account{username,followers_count,media_count}&limit=100&access_token=' + FB_TOKEN);
      const d = await res.json();
      if (d.error) console.log('[report] FB API error: ' + d.error.message);
      const all = d.data || [];
      const dropped = all.filter(p => !knownPageIds.has(p.id));
      if (dropped.length) console.log('[report] FB: ignoring ' + dropped.length + ' unknown page(s)');
      for (const ch of channels) {
        const p = all.find(x => x.id === ch.fbPageId);
        if (!p) { console.log('[report] GAP: FB page missing or not linked to this token: ' + ch.label + ' (id ' + ch.fbPageId + ')'); continue; }
        fbPages.push({
          slug: ch.slug, label: ch.label,
          name: p.name, username: p.username || '',
          followers: p.followers_count || 0,
          igUsername: p.instagram_business_account ? p.instagram_business_account.username : null,
          igFollowers: p.instagram_business_account ? (p.instagram_business_account.followers_count || 0) : 0,
          igPosts: p.instagram_business_account ? (p.instagram_business_account.media_count || 0) : 0
        });
      }
      for (const pid of EXTRA_PAGE_IDS) {
        const p = all.find(x => x.id === pid);
        if (!p) continue;
        fbPages.push({
          slug: null, label: p.name + ' (unmapped)',
          name: p.name, username: p.username || '',
          followers: p.followers_count || 0,
          igUsername: p.instagram_business_account ? p.instagram_business_account.username : null,
          igFollowers: p.instagram_business_account ? (p.instagram_business_account.followers_count || 0) : 0,
          igPosts: p.instagram_business_account ? (p.instagram_business_account.media_count || 0) : 0
        });
      }
    } catch (e) { console.log('[report] FB fetch error: ' + e.message); }
  } else {
    console.log('[report] GAP: no FB_PAGE_TOKEN — Facebook rows will be empty');
  }

  // Threads: profile read (best effort)
  const threads = await fetchThreads();

  return { ytData, fbPages, threads };
}

async function fetchThreads() {
  if (!process.env.THREADS_ACCESS_TOKEN) return null;
  try {
    const res = await fetch('https://graph.threads.net/v1.0/me?fields=username,threads_profile_picture_url&access_token=' + process.env.THREADS_ACCESS_TOKEN);
    const d = await res.json();
    if (d.username) return { username: d.username, followers: null };
    console.log('[report] Threads read failed: ' + (d.error ? d.error.message : 'no username'));
  } catch (e) { console.log('[report] Threads error: ' + e.message); }
  return null;
}

// ---- per-channel fragment mode (reporting-daily matrix) ----
// One channel per invocation; the fragment artifact is merged by --collect.
export function fragmentOf(slug, data) {
  return {
    slug,
    yt: data.ytData[0] || null,
    fb: data.fbPages[0] || null,
    fetchedAt: new Date().toISOString()
  };
}

function fragmentsDir(reportsDir = 'reports') {
  return path.join(reportsDir, 'fragments');
}

async function runChannelMode(slug) {
  const ch = CHANNELS.find(c => c.slug === slug);
  if (!ch) throw new Error('unknown channel: ' + slug + ' (not an active registry channel)');
  const data = await fetchAll([ch]);
  const frag = fragmentOf(slug, data);
  const dir = fragmentsDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, slug + '.json');
  fs.writeFileSync(file, JSON.stringify(frag, null, 2));
  console.log('[report] fragment written: ' + file);
  return file;
}

// Merge per-channel fragments into the SAME payload fetchAll used to build —
// registry order (Excel row order preserved), missing fragments GAP their rows.
export function collectFragments(channels = CHANNELS, dir = fragmentsDir()) {
  const frags = {};
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    if (!f.endsWith('.json')) continue;
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (j && j.slug) frags[j.slug] = j;
    } catch (e) { console.log('[report] unreadable fragment ' + f + ': ' + e.message.slice(0, 80)); }
  }
  const ytData = [];
  const fbPages = [];
  for (const ch of channels) {
    const frag = frags[ch.slug];
    if (!frag) { console.log('[report] GAP: no fragment for ' + ch.slug + ' — channel rows will be empty'); continue; }
    if (frag.yt) ytData.push(frag.yt);
    if (frag.fb) fbPages.push(frag.fb);
  }
  return { ytData, fbPages };
}

// ---- growth deltas vs last snapshot ----
function statsKey(ytData, fbPages) {
  const s = { date: new Date().toISOString().slice(0, 10), yt: {}, fb: {} };
  ytData.forEach(y => { s.yt[y.label] = { subs: y.subs, views: y.views }; });
  fbPages.forEach(f => { s.fb[f.name] = { followers: f.followers, ig: f.igFollowers }; });
  return s;
}
function growthRows(prev, cur) {
  const rows = [];
  for (const ch of CHANNELS) {
    const p = prev.yt && prev.yt[ch.label], c = cur.yt[ch.label];
    rows.push([ch.label + ' — YouTube',
      c ? c.subs : '-',
      p && c ? c.subs - p.subs : '-',
      c ? c.views : '-',
      p && c ? c.views - p.views : '-']);
  }
  for (const name of Object.keys(cur.fb)) {
    const p = prev.fb && prev.fb[name], c = cur.fb[name];
    rows.push([name + ' — FB page',
      c ? c.followers : '-',
      p && c ? c.followers - p.followers : '-',
      c ? c.ig : '-',
      p && c ? c.ig - p.ig : '-']);
  }
  return rows;
}

function styleHeader(ws) {
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a1a2e' } };
  row.height = 22;
}

// NTFY push headers (ASCII-only title/filename); the mode rides both.
export function ntfyHeaders(mode, ytCount, fbCount) {
  return {
    'Title': 'Quarry ' + mode + ' report - ' + ytCount + ' YT / ' + fbCount + ' FB channels',
    'Tags': 'chart',
    'Filename': mode + '-report-' + new Date().toISOString().slice(0, 10) + '.xlsx'
  };
}

async function buildExcel(ytData, fbPages, threads, { mode = 'daily', stateDir = 'state', reportsDir = 'reports', channels = CHANNELS } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Quarry Studio';

  const ws1 = wb.addWorksheet('Overview');
  ws1.columns = [
    { header: 'Channel', width: 28 },
    { header: 'Platform', width: 14 },
    { header: 'Handle', width: 30 },
    { header: 'Subs/Followers', width: 16 },
    { header: 'Total Views', width: 15 },
    { header: 'Videos/Posts', width: 13 }
  ];
  styleHeader(ws1);
  ytData.forEach(y => ws1.addRow([y.label, 'YouTube', y.handle, y.subs, y.views, y.videos]));
  fbPages.forEach(p => ws1.addRow([p.name + (p.slug ? ' (feeds: ' + p.label + ')' : ''), 'Facebook', p.username ? '@' + p.username : '', p.followers, '-', '-']));
  fbPages.filter(p => p.igUsername).forEach(p => ws1.addRow([p.name, 'Instagram', '@' + p.igUsername, p.igFollowers, '-', p.igPosts]));
  // #106 T4c: the destination rows are registry-driven — every channel with a
  // threadsHandle gets a Threads row (the global token profile only adds the
  // follower read when it IS that account), and every channel with a
  // tiktokHandle gets its manual TikTok row. Absent destination = the row is
  // honestly omitted (data, not display literals).
  for (const c of channels.filter(ch => ch.threadsHandle)) {
    const profile = threads && normHandle(threads.username) === normHandle(c.threadsHandle) ? threads : null;
    ws1.addRow([c.label, 'Threads', '@' + c.threadsHandle, profile ? (profile.followers ?? 'n/a') : 'n/a', '-', '-']);
  }
  for (const c of channels.filter(ch => ch.tiktokHandle)) {
    ws1.addRow([c.label, 'TikTok', '@' + c.tiktokHandle, 'manual — no API approval yet', '-', '-']);
  }

  const ws2 = wb.addWorksheet('YouTube Details');
  ws2.columns = [
    { header: 'Channel', width: 28 },
    { header: 'Handle', width: 30 },
    { header: 'Subscribers', width: 15 },
    { header: 'Total Views', width: 15 },
    { header: 'Videos', width: 12 }
  ];
  styleHeader(ws2);
  ytData.forEach(y => ws2.addRow([y.label, y.handle, y.subs, y.views, y.videos]));

  // Retention (28d) — the metric that decides whether the Shorts feed promotes us.
  // Feed promotion threshold is ~85% avg watched; QQ proved it, the rest are climbing.
  const ws2b = wb.addWorksheet('Retention (28d)');
  ws2b.columns = [
    { header: 'Channel', width: 28 },
    { header: 'Views (28d)', width: 14 },
    { header: 'Avg % Watched', width: 16 },
    { header: 'Subs Gained (28d)', width: 18 },
    { header: 'Verdict', width: 26 }
  ];
  styleHeader(ws2b);
  ytData.forEach(y => {
    const r = y.retention;
    const verdict = !r ? 'no data' : r.avgPct >= 80 ? '✅ feed will promote' : r.avgPct >= 65 ? '🟡 close — tighten hooks' : '🔴 fix scripts (hook + length)';
    ws2b.addRow([y.label, r ? r.views : '-', r ? Number(r.avgPct).toFixed(1) + '%' : '-', r ? r.subsGained : '-', verdict]);
  });

  const ws3 = wb.addWorksheet('Facebook Pages');
  ws3.columns = [
    { header: 'Page', width: 28 },
    { header: 'Username', width: 25 },
    { header: 'Followers', width: 15 },
    { header: 'Fed by (YouTube)', width: 24 }
  ];
  styleHeader(ws3);
  fbPages.forEach(p => ws3.addRow([p.name, p.username ? '@' + p.username : '', p.followers, p.slug ? p.label : '(none)']));

  const ws4 = wb.addWorksheet('Instagram');
  ws4.columns = [
    { header: 'Page', width: 28 },
    { header: 'Account', width: 25 },
    { header: 'Followers', width: 15 },
    { header: 'Posts', width: 12 }
  ];
  styleHeader(ws4);
  const igRows = fbPages.filter(p => p.igUsername);
  igRows.forEach(p => ws4.addRow([p.name, '@' + p.igUsername, p.igFollowers, p.igPosts]));
  if (!igRows.length) ws4.addRow(['(no IG business account linked to the 4 FB pages yet)', '', '', '']);

  // Growth vs previous snapshot (deltas appear from the 2nd run on)
  const ws5 = wb.addWorksheet('Growth (since last report)');
  ws5.columns = [
    { header: 'What', width: 34 },
    { header: 'Subs/Followers now', width: 18 },
    { header: 'Change', width: 12 },
    { header: 'Views/IG now', width: 16 },
    { header: 'Change ', width: 12 }
  ];
  styleHeader(ws5);
  const cur = statsKey(ytData, fbPages);
  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(path.join(stateDir, 'report-stats.json'), 'utf8')); } catch { }
  if (prev && prev.date !== cur.date) growthRows(prev, cur).forEach(r => ws5.addRow(r));
  else ws5.addRow(['(first run — deltas appear from the next report on)', '', '', '', '']);
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'report-stats.json'), JSON.stringify(cur, null, 2));

  // Per-video views across the brand channels — red = under 1K views
  const ws6 = wb.addWorksheet('Video Views');
  ws6.columns = [
    { header: 'Channel', width: 22 },
    { header: 'Title', width: 58 },
    { header: 'Video ID', width: 14 },
    { header: 'Goes Live', width: 20 },
    { header: 'Privacy', width: 10 },
    { header: 'Views', width: 10 },
    { header: 'Likes', width: 9 },
    { header: 'Comments', width: 10 }
  ];
  styleHeader(ws6);
  let videoCount = 0, lowCount = 0;
  ytData.forEach(y => {
    (y.videoRows || []).sort((a, b) => b.views - a.views).forEach(v => {
      const r = ws6.addRow([v.channel, v.title, v.videoId, v.goesLive, v.privacy, v.views, v.likes, v.comments]);
      videoCount++;
      if (v.views < 1000) { r.font = { color: { argb: 'FFC62828' } }; lowCount++; }
    });
  });
  if (!videoCount) ws6.addRow(['(no video rows — YouTube fetch failed)', '', '', '', '', '', '', '']);
  console.log('[report] Video Views sheet: ' + videoCount + ' videos, ' + lowCount + ' under 1K views');

  fs.mkdirSync(reportsDir, { recursive: true });
  const file = path.join(reportsDir, 'daily-report-' + new Date().toISOString().slice(0, 10) + '.xlsx');
  await wb.xlsx.writeFile(file);

  // NTFY push with the Excel attached (headers ASCII-only)
  const topic = (process.env.NTFY_TOPIC || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (topic) {
    const ntfyBody = fs.readFileSync(file);
    const res = await fetch('https://ntfy.sh/' + topic, {
      method: 'POST',
      headers: ntfyHeaders(mode, ytData.length, fbPages.length),
      body: ntfyBody
    });
    if (res.ok) console.log('[report] NTFY: Excel sent to phone OK');
    else console.log('[report] NTFY failed: ' + res.status);
  } else {
    console.log('[report] GAP: no NTFY_TOPIC — report not pushed to phone');
  }

  return file;
}

export { buildExcel };

// ---- main ----
async function main() {
  const { mode, channel, collect } = parseReportArgs();
  if (channel) {
    console.log('[report] Channel fragment mode (' + channel + ')...');
    await runChannelMode(channel);
    return;
  }
  console.log('[report] ' + (collect ? 'Collecting channel fragments' : 'Fetching all channel data') + ' (' + mode + ')...');
  const fetched = collect ? await collectFragments() : await fetchAll();
  const threads = collect ? await fetchThreads() : fetched.threads;
  console.log('[report] YouTube rows: ' + fetched.ytData.length + '/' + CHANNELS.length + ', FB pages: ' + fetched.fbPages.length + '/' + CHANNELS.length);
  const file = await buildExcel(fetched.ytData, fetched.fbPages, threads, { mode });
  console.log('[report] Excel saved: ' + file);
  console.log('[report] Done');
}

const IS_MAIN = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (IS_MAIN) {
  main().then(function () { }, function (e) {
    console.error('[report] Error: ' + e.message);
  });
}
