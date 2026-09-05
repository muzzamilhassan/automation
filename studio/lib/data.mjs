// Server-side data loaders for the Quarry Studio command center.
import fs from 'node:fs';
import path from 'node:path';

// Next dev runs with cwd = studio/. ROOT = the repo root (studio/..).
const ROOT = path.resolve(process.cwd(), '..');
const LIB = path.resolve(process.cwd(), 'lib');

const envStr = fs.readFileSync(path.resolve(ROOT, '.env'), 'utf8');
export const ENV = Object.fromEntries([...envStr.matchAll(/^([A-Z_0-9]+)=(.*)$/gm)].map(m => [m[1], m[2].trim()]));

let cache = {};
const cached = (key, ms, fn) => {
  if (cache[key] && Date.now() - cache[key].at < ms) return cache[key].val;
  const p = Promise.resolve().then(fn).then(v => { cache[key] = { at: Date.now(), val: v }; return v; }).catch(e => { console.error('[data]', key, e.message); return null; });
  return p;
};

export function brands() { return JSON.parse(fs.readFileSync(path.join(LIB, 'brands.json'), 'utf8')); }
export function state() { try { return JSON.parse(fs.readFileSync(path.resolve(ROOT, 'yt-mcp/schedule-state.json'), 'utf8')); } catch { return {}; } }
export function trend(slug) { try { return JSON.parse(fs.readFileSync(path.resolve(ROOT, `yt-mcp/trends-${slug}.json`), 'utf8')); } catch { return null; } }

export async function fbPages() {
  return cached('fb', 5 * 60000, async () => {
    const res = await fetch(`https://graph.facebook.com/v20.0/me/accounts?fields=id,name,username,fan_count,followers_count,about,instagram_business_account{username,name,followers_count,media_count,biography,profile_picture_url}&access_token=${encodeURIComponent(ENV.FB_PAGE_TOKEN)}`);
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

export async function ytChannels() {
  return cached('yt', 5 * 60000, async () => {
    const dir = path.resolve(ROOT, 'yt-mcp/channels');
    const out = [];
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
  });
}

export function outbox() {
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

export function allLogs() {
  const st = state();
  const logs = [];
  for (const [slug, s] of Object.entries(st)) {
    for (const v of s.lastVideos || []) logs.push({ platform: 'YouTube', slug, title: v.title, at: v.publishAt, videoId: v.videoId, kind: 'Short' });
    if (s.deepdiveVideo) logs.push({ platform: 'YouTube', slug, title: s.deepdiveVideo.title, at: s.deepdiveVideo.publishAt, videoId: s.deepdiveVideo.videoId, kind: 'Episode' });
    if (s.imageDate) logs.push({ platform: 'Facebook', slug, title: 'Brand poster image', at: s.imageDate, kind: 'Image post' });
  }
  for (const o of outbox()) logs.push({ platform: 'FB/IG', slug: o.slug, title: o.title, at: o.publishAt, videoId: null, kind: 'Cross-post (' + o.state + ')' });
  return logs.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
}
