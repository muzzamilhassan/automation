// Server-side data loaders for the Quarry Studio command center.
// Works in TWO modes automatically:
//  - LOCAL:  running on the PC (repo files exist) — reads yt-mcp/ + fb-outbox/ + .env
//  - CLOUD:  running on Vercel — reads state files from the GitHub repo API
//            using GITHUB_TOKEN, and everything else from environment vars.
// Set FORCE_GITHUB=1 to test cloud mode locally.
import fs from 'node:fs';
import path from 'node:path';

// Next dev runs with cwd = studio/. ROOT = the repo root (studio/..).
const ROOT = path.resolve(process.cwd(), '..');
const LIB = path.resolve(process.cwd(), 'lib');

// process.env first (Vercel injects there), .env file overlaid (local dev keeps old behavior).
const envFromFile = (() => {
  try {
    return Object.fromEntries(
      [...fs.readFileSync(path.resolve(ROOT, '.env'), 'utf8').matchAll(/^([A-Z_0-9]+)=(.*)$/gm)].map((m) => [m[1], m[2].trim()])
    );
  } catch {
    return {};
  }
})();
export const ENV = { ...process.env, ...envFromFile };

const GITHUB_REPO = ENV.GITHUB_REPO || 'muzzamilhassan/automation';
const GH_TOKEN = ENV.GITHUB_TOKEN || ENV.GITHUB_PAT || '';
const HAS_LOCAL_REPO = fs.existsSync(path.resolve(ROOT, 'yt-mcp'));
const CLOUD = ENV.FORCE_GITHUB === '1' || !HAS_LOCAL_REPO;

let cache = {};
const cached = (key, ms, fn) => {
  if (cache[key] && Date.now() - cache[key].at < ms) return cache[key].val;
  const p = Promise.resolve().then(fn).then(v => { cache[key] = { at: Date.now(), val: v }; return v; }).catch(e => { console.error('[data]', key, e.message); return null; });
  return p;
};

// ---------- GitHub file access (cloud mode) ----------

async function ghFile(repoPath) {
  if (!GH_TOKEN) throw new Error('no GITHUB_TOKEN — state files unavailable in cloud mode');
  return cached('gh:' + repoPath, 60_000, async () => {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${repoPath}?ref=main`, {
      headers: {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: 'application/vnd.github.raw',
        'User-Agent': 'quarry-studio',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!res.ok) throw new Error(`github ${res.status} for ${repoPath}`);
    return JSON.parse(await res.text());
  });
}

// ---------- shared loaders ----------

export function brands() {
  return JSON.parse(fs.readFileSync(path.join(LIB, 'brands.json'), 'utf8'));
}

export async function state() {
  if (!CLOUD) {
    try { return JSON.parse(fs.readFileSync(path.resolve(ROOT, 'yt-mcp/schedule-state.json'), 'utf8')); } catch { return {}; }
  }
  try { return (await ghFile('yt-mcp/schedule-state.json')) || {}; } catch { return {}; }
}

export async function trend(slug) {
  if (!CLOUD) {
    try { return JSON.parse(fs.readFileSync(path.resolve(ROOT, `yt-mcp/trends-${slug}.json`), 'utf8')); } catch { return null; }
  }
  try { return await ghFile(`yt-mcp/trends-${slug}.json`); } catch { return null; }
}

export async function fbPages() {
  return cached('fb', 5 * 60000, async () => {
    const res = await fetch(`https://graph.facebook.com/v20.0/me/accounts?fields=id,name,username,fan_count,followers_count,about,instagram_business_account{username,name,followers_count,media_count,biography,profile_picture_url}&access_token=${encodeURIComponent(ENV.FB_PAGE_TOKEN || '')}`);
    const data = await res.json();
    return (data.data || []).map(p => ({
      id: p.id, name: p.name, username: p.username || null,
      followers: p.followers_count || 0,
      about: (p.about || '').slice(0, 90),
      ig: p.instagram_business_account ? { username: p.instagram_business_account.username, followers: p.instagram_business_account.followers_count || 0, posts: p.instagram_business_account.media_count || 0, bio: p.instagram_business_account.biography || '' } : null
    }));
  });
}

async function ytAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: ENV.YOUTUBE_CLIENT_ID, client_secret: ENV.YOUTUBE_CLIENT_SECRET, refresh_token: refreshToken, grant_type: 'refresh_token' })
  });
  const d = await res.json();
  if (!d.access_token) throw new Error('no yt token');
  return d.access_token;
}

// The four live channels (cloud mode fetches their token files from the repo).
const LIVE_SLUGS = ['quotequarry', 'investors-compass', 'money-rulebook', 'debt-free-doctrine'];

export async function ytChannels() {
  return cached('yt', 5 * 60000, async () => {
    const out = [];
    if (!CLOUD) {
      const dir = path.resolve(ROOT, 'yt-mcp/channels');
      for (const slug of fs.readdirSync(dir)) {
        const tf = path.join(dir, slug, 'token.json');
        if (!fs.existsSync(tf)) continue;
        try {
          const t = JSON.parse(fs.readFileSync(tf, 'utf8'));
          const at = await ytAccessToken(t.refresh_token);
          const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', { headers: { Authorization: `Bearer ${at}` } });
          const d = await res.json();
          const c = d.items?.[0];
          out.push({ slug, ytTitle: c?.snippet?.title || '?', ytCustomUrl: c?.snippet?.customUrl || '', subs: Number(c?.statistics?.subscriberCount || 0), views: Number(c?.statistics?.viewCount || 0), videos: Number(c?.statistics?.videoCount || 0) });
        } catch (e) { out.push({ slug, error: e.message.slice(0, 60) }); }
      }
      return out;
    }
    for (const slug of LIVE_SLUGS) {
      try {
        // Cloud: per-channel tokens come from env (same YT_TOKEN_* secrets the
        // GitHub Actions workflows use). Repo token files are local-only.
        const envName = `YT_TOKEN_${slug.toUpperCase().replace(/-/g, '_')}`;
        const raw = ENV[envName] || (await ghFile(`yt-mcp/channels/${slug}/token.json`).catch(() => null));
        if (!raw) throw new Error(`no ${envName} on the server`);
        const t = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const at = await ytAccessToken(t.refresh_token);
        const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', { headers: { Authorization: `Bearer ${at}` } });
        const d = await res.json();
        const c = d.items?.[0];
        out.push({ slug, ytTitle: c?.snippet?.title || '?', ytCustomUrl: c?.snippet?.customUrl || '', subs: Number(c?.statistics?.subscriberCount || 0), views: Number(c?.statistics?.viewCount || 0), videos: Number(c?.statistics?.videoCount || 0) });
      } catch (e) { out.push({ slug, error: e.message.slice(0, 60) }); }
    }
    return out;
  });
}

export function outbox() {
  if (CLOUD) return []; // outbox lives in Actions caches; state files carry the publish history
  const dir = path.resolve(ROOT, 'fb-outbox');
  const out = [];
  try {
    for (const d of fs.readdirSync(dir)) {
      const dd = path.join(dir, d);
      if (!fs.statSync(dd).isDirectory()) continue;
      for (const f of fs.readdirSync(dd)) {
        if (f.endsWith('.json') || f.endsWith('.fb-done')) {
          try { const m = JSON.parse(fs.readFileSync(path.join(dd, f), 'utf8')); out.push({ ...m, state: f.endsWith('.fb-done') ? 'FB posted — IG pending' : 'pending', file: path.join(dd, f) }); } catch { }
        } else if (f.endsWith('.json.done')) {
          try { const m = JSON.parse(fs.readFileSync(path.join(dd, f), 'utf8')); out.push({ ...m, state: 'published FB+IG' }); } catch { }
        }
      }
    }
  } catch { }
  return out.sort((a, b) => (b.publishAt || '').localeCompare(a.publishAt || ''));
}

export async function allLogs() {
  const st = await state();
  const logs = [];
  for (const [slug, s] of Object.entries(st)) {
    for (const v of s.lastVideos || []) logs.push({ platform: 'YouTube', slug, title: v.title, at: v.publishAt, videoId: v.videoId, kind: 'Short' });
    if (s.deepdiveVideo) logs.push({ platform: 'YouTube', slug, title: s.deepdiveVideo.title, at: s.deepdiveVideo.publishAt, videoId: s.deepdiveVideo.videoId, kind: 'Episode' });
    if (s.imageDate) logs.push({ platform: 'Facebook', slug, title: 'Brand poster image', at: s.imageDate, kind: 'Image post' });
  }
  for (const o of outbox()) logs.push({ platform: 'FB/IG', slug: o.slug, title: o.title, at: o.publishAt, videoId: null, kind: 'Cross-post (' + o.state + ')' });
  return logs.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
}
