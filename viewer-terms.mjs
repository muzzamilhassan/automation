// Viewer search terms — the legal version of the Studio "Research" tab.
// YouTube Analytics API (yt-analytics.readonly): what your own viewers typed
// into YouTube search that led them to YOUR videos, last 28 days, per channel.
// Saved to yt-mcp/terms-<slug>.json (cached 3 days like trends).
// 2026-10-03: wired into yt-daily so every topic prompt knows the real words
// viewers use. If the scope/token is missing this throws — caller catches.
import fs from 'node:fs';
import { google } from 'googleapis';

export async function viewerTerms(slug, auth, cacheDays = 3) {
  const file = `yt-mcp/terms-${slug}.json`;
  try {
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Date.now() - c.at < cacheDays * 86400000) return c;
  } catch { }

  const ya = google.youtubeAnalytics({ version: 'v2', auth });
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);
  const res = await ya.reports.query({
    ids: 'channel==MINE',
    startDate: start,
    endDate: end,
    metrics: 'views',
    dimensions: 'searchTerm',
    sort: '-views',
    maxResults: 25,
    filters: 'insightTrafficSourceType==YT_SEARCH',
  });

  const rows = (res.data.rows || []).map((r) => ({ term: String(r[0]).slice(0, 60), views: Number(r[1] || 0) }));
  if (!rows.length) throw new Error('no search terms returned (new channel or no YT_SEARCH traffic)');

  const out = { at: Date.now(), terms: rows };
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  return out;
}
