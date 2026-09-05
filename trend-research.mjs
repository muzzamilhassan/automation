// Trend research — finds what's going viral RIGHT NOW in a brand's niche.
// search.list (own 100-calls/day bucket) over the last 14 days, ordered by
// views, US region -> pulls full stats/tags -> extracts hot keywords.
// Cached ~3 days per slug to conserve quota.
// Usage (from yt-daily): const trend = await researchTrend(slug, auth, seeds);
import fs from 'node:fs';
import { google } from 'googleapis';

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'your', 'you', 'this', 'that', 'with', 'how', 'why', 'what', 'is', 'are', 'on', 'my', 'it', 'be', 'not', 'do', 'dont', 'if', 'they', 'their', 'from', 'at', 'as', 'was', 'will', 'no', 'ever', 'best', 'top', 'vs', 'new', '2024', '2025', '2026']);

export async function researchTrend(slug, auth, seeds, cacheDays = 3) {
  const file = `yt-mcp/trends-${slug}.json`;
  try {
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Date.now() - c.at < cacheDays * 86400000) return c;
  } catch { }

  const yt = google.youtube({ version: 'v3', auth });
  const after = new Date(Date.now() - 14 * 86400000).toISOString();
  const q = seeds.slice(0, 2).join(' ');
  const search = await yt.search.list({
    part: 'snippet', q, order: 'viewCount', publishedAfter: after,
    maxResults: 10, type: 'video', regionCode: 'US', relevanceLanguage: 'en'
  });
  const ids = search.data.items.map(i => i.id.videoId).filter(Boolean);
  if (!ids.length) throw new Error('no trend results');

  const vids = await yt.videos.list({ part: 'snippet,statistics', id: ids.join(',') });
  const videos = vids.data.items.map(v => ({
    title: v.snippet.title,
    channel: v.snippet.channelTitle,
    views: Number(v.statistics.viewCount || 0),
    tags: v.snippet.tags || [],
    videoId: v.id
  })).sort((a, b) => b.views - a.views);

  // hot keyword frequency from viral titles + tags
  const freq = {};
  for (const v of videos) {
    const words = (v.title + ' ' + v.tags.slice(0, 10).join(' ')).toLowerCase().match(/[a-z][a-z' ]{2,}/g) || [];
    for (const w of words.join(' ').split(/\s+/)) {
      const t = w.trim();
      if (t.length < 4 || STOP.has(t)) continue;
      freq[t] = (freq[t] || 0) + 1;
    }
  }
  const hotKeywords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 12).map(e => e[0]);

  const trend = {
    at: Date.now(), seed: q, hotKeywords,
    viralChannels: [...new Set(videos.map(v => v.channel))].slice(0, 8),
    videos: videos.slice(0, 8).map(v => ({ title: v.title, channel: v.channel, views: v.views, videoId: v.videoId }))
  };
  fs.writeFileSync(file, JSON.stringify(trend, null, 2));
  return trend;
}
