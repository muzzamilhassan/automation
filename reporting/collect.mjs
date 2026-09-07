// Reporting: shared state + collection from platform APIs.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { google } from 'googleapis';

const envStr = (() => { try { return fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : ''; } catch (e) { return ''; } })();
const envOf = (k) => process.env[k] || (envStr.match(new RegExp(`^${k}=(.+)$`, 'm')) || [])[1]?.trim() || '';

const STATE_DIR = 'state';
const LOG_FILE = 'logs/posts-log.json';
export const PKT_OFFSET_MIN = 300; // UTC+5, no DST

export function pktDate(d = new Date()) {
  const pkt = new Date(d.getTime() + PKT_OFFSET_MIN * 60000);
  return pkt.toISOString().slice(0, 10);
}

function ytClient() {
  const oauth2Client = new google.auth.OAuth2(
    envOf('YOUTUBE_CLIENT_ID'), envOf('YOUTUBE_CLIENT_SECRET'), 'http://localhost:3000/oauth2callback');
  oauth2Client.setCredentials({ refresh_token: envOf('YOUTUBE_REFRESH_TOKEN') });
  return google.youtube({ version: 'v3', auth: oauth2Client });
}

// ---------------------------------------------------------------------------
// Posts log (what was posted where, published or failed)
// ---------------------------------------------------------------------------
export function logPost(entry) {
  try {
    fs.mkdirSync('logs', { recursive: true });
    const log = fs.existsSync(LOG_FILE) ? JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')) : [];
    log.push({ ts: new Date().toISOString(), ...entry });
    fs.writeFileSync(LOG_FILE, JSON.stringify(log.slice(-3000), null, 1));
  } catch (e) { console.log('[reporting] logPost failed:', e.message); }
}

export function readLog() {
  try { return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')); } catch (e) { return []; }
}

// ---------------------------------------------------------------------------
// YouTube collection
// ---------------------------------------------------------------------------
export async function collectYouTube() {
  const y = ytClient();
  const ch = await y.channels.list({ part: 'statistics,contentDetails,snippet', mine: true });
  const c = ch.data.items?.[0];
  if (!c) throw new Error('no channel');
  const stats = {
    subscribers: Number(c.statistics.subscriberCount) || 0,
    totalViews: Number(c.statistics.viewCount) || 0,
    videos: Number(c.statistics.videoCount) || 0,
    title: c.snippet.title
  };
  const pl = await y.playlistItems.list({ part: 'contentDetails', playlistId: c.contentDetails.relatedPlaylists.uploads, maxResults: 50 });
  const ids = pl.data.items.map((i) => i.contentDetails.videoId).filter(Boolean);
  const videos = [];
  for (let i = 0; i < ids.length; i += 50) {
    const v = await y.videos.list({ part: 'snippet,statistics', id: ids.slice(i, i + 50).join(',') });
    for (const it of v.data.items || []) {
      videos.push({
        id: it.id,
        title: (it.snippet.title || '').slice(0, 80),
        publishedAt: it.snippet.publishedAt,
        views: Number(it.statistics?.viewCount) || 0,
        likes: Number(it.statistics?.likeCount) || 0,
        comments: Number(it.statistics?.commentCount) || 0
      });
    }
  }
  return { stats, videos };
}

// ---------------------------------------------------------------------------
// Snapshot + deltas
// ---------------------------------------------------------------------------
export function snapshotFile(date = pktDate()) { return `${STATE_DIR}/stats-${date}.json`; }

export function readSnapshot(date) {
  try { return JSON.parse(fs.readFileSync(snapshotFile(date), 'utf8')); } catch (e) { return null; }
}

export function computeDeltas(prev, cur) {
  if (!prev) return null;
  const d = {
    subscribers: cur.stats.subscribers - prev.stats.subscribers,
    totalViews: cur.stats.totalViews - prev.stats.totalViews,
    likes: 0, comments: 0
  };
  const prevMap = new Map(prev.videos.map((v) => [v.id, v]));
  const perVideo = [];
  for (const v of cur.videos) {
    const p = prevMap.get(v.id);
    if (p) {
      const dv = v.views - p.views, dc = v.comments - p.comments, dl = v.likes - p.likes;
      d.likes += Math.max(0, dl); d.comments += Math.max(0, dc);
      if (dv > 0) perVideo.push({ id: v.id, title: v.title, viewsGained: dv, commentsGained: Math.max(0, dc), likesGained: Math.max(0, dl), views: v.views });
    }
  }
  d.perVideo = perVideo.sort((a, b) => b.viewsGained - a.viewsGained);
  return d;
}

// Posts in a PKT date range from the log
export function postsBetween(startIso, endIso) {
  return readLog().filter((e) => e.ts >= startIso && e.ts < endIso);
}

export function expectedPerDay() {
  // 3 slots × 5 brands of YT Shorts + 5 FB posts + 5 FB reels baseline
  return { youtube: 15, facebook: 10 };
}

export function sumRange(days) {
  // aggregate daily snapshots for the last N PKT days
  const out = { subscribers: 0, totalViews: 0, likes: 0, comments: 0, days: 0, top: [] };
  const topMap = new Map();
  for (let i = 1; i <= days; i++) {
    const d = new Date(Date.now() - i * 86400000);
    const snap = readSnapshot(pktDate(d));
    if (!snap?.delta) continue;
    out.days++;
    out.subscribers += snap.delta.subscribers || 0;
    out.totalViews += snap.delta.totalViews || 0;
    out.likes += snap.delta.likes || 0;
    out.comments += snap.delta.comments || 0;
    for (const v of snap.delta.perVideo || []) {
      const e = topMap.get(v.id) || { id: v.id, title: v.title, viewsGained: 0, commentsGained: 0 };
      e.viewsGained += v.viewsGained; e.commentsGained += v.commentsGained;
      topMap.set(v.id, e);
    }
  }
  out.top = [...topMap.values()].sort((a, b) => b.viewsGained - a.viewsGained).slice(0, 10);
  return out;
}

// CI run health via gh (best-effort; only on Actions where gh+token exist)
export function failedRunsToday() {
  try {
    const token = envOf('GITHUB_PAT') || envOf('SECRET_WRITER_PAT');
    if (!token || !process.env.GITHUB_REPOSITORY) return [];
    const since = new Date(Date.now() - 86400000).toISOString();
    const out = execFileSync('curl', ['-s', '-H', `Authorization: token ${token}`,
      `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/actions/runs?per_page=20`],
      { encoding: 'utf8', timeout: 30000 });
    const runs = JSON.parse(out).workflow_runs || [];
    return runs.filter((r) => r.conclusion === 'failure' && r.created_at > since)
      .map((r) => ({ name: r.name, at: r.created_at, url: r.html_url }));
  } catch (e) { return []; }
}
