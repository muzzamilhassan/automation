import { brands, state, trend, fbPages, ytChannels, allLogs, MODE, bustCache } from '../../../lib/data.mjs';

export const dynamic = 'force-dynamic';

const FB_MAP = { 'investors-compass': '116157974886564', 'money-rulebook': '1077306835630491', 'debt-free-doctrine': '106473735839651', quotequarry: '108044922375174' };

export async function GET(req) {
  const fresh = new URL(req.url).searchParams.get('fresh') === '1';
  if (fresh) bustCache();
  const [fb, yt, st, logs] = await Promise.all([fbPages(), ytChannels(), state(), allLogs()]);
  const b = brands();
  const channels = Object.entries(b).map(([slug, k]) => {
    const ytRow = yt.find(c => c.slug === slug) || null;
    const fbRow = fb.find(f => f.id === FB_MAP[slug]) || null;
    const ig = fbRow?.ig || null;
    const s = st[slug] || {};
    return {
      slug, ...k,
      active: slug === 'quotequarry' ? true : k.active,
        yt: ytRow ? (ytRow.error ? { error: ytRow.error } : { title: ytRow.ytTitle, handle: ytRow.ytCustomUrl, subs: ytRow.subs, views: ytRow.views, videos: ytRow.videos, error: null }) : null,
      fb: fbRow ? { name: fbRow.name, username: fbRow.username, followers: fbRow.followers } : null,
      ig: ig ? { username: ig.username, followers: ig.followers, posts: ig.posts } : null,
      lastRun: s.lastRunDate || null, imageDate: s.imageDate || null,
      deepdiveDate: s.deepdiveDate || null, todayVideos: (s.lastVideos || []).length,
      todayTopics: Array.isArray(s.todayTopics) ? s.todayTopics.map(t => t.topic) : null,
      episodeTopic: s.todayTopic?.topic || null
    };
  });
  // 10-08 CHANNEL FACTORY: wizard channels appear after the legacy brands
  try {
    const { registryChannels } = await import('../../../lib/channels-registry.js');
    for (const e of await registryChannels()) {
      if (b[e.slug]) continue;
      const ytRow = yt.find((c) => c.slug === e.slug) || null;
      const s = st[e.slug] || {};
      channels.push({
        slug: e.slug,
        short: (e.label || e.slug).slice(0, 2).toUpperCase(),
        label: e.label || e.slug,
        niche: e.niche || 'wizard channel — finish setup',
        accent: e.accent || '#38BDF8',
        active: true,
        fromRegistry: true,
        slots: e.slots || [],
        voice: e.voice || '',
        yt: ytRow ? { title: ytRow.ytTitle, handle: ytRow.ytCustomUrl, subs: ytRow.subs, views: ytRow.views, videos: ytRow.videos, error: ytRow.error || null } : (ytRow === null ? { error: 're-connect once in Studio to show live stats' } : null),
        fb: null, ig: null,
        lastRun: s.lastRunDate || null, imageDate: null,
        deepdiveDate: s.deepdiveDate || null, todayVideos: (s.lastVideos || []).length,
        todayTopics: Array.isArray(s.todayTopics) ? s.todayTopics.map((t) => t.topic) : null,
        episodeTopic: s.todayTopic?.topic || null,
      });
    }
  } catch { }
  const totals = {
    ytSubs: channels.reduce((a, c) => a + (c.yt?.subs || 0), 0),
    ytViews: channels.reduce((a, c) => a + (c.yt?.views || 0), 0),
    ytVideos: channels.reduce((a, c) => a + (c.yt?.videos || 0), 0),
    fbFollowers: channels.reduce((a, c) => a + (c.fb?.followers || 0), 0),
    igFollowers: channels.reduce((a, c) => a + (c.ig?.followers || 0), 0)
  };
  const trends = {};
  for (const slug of Object.keys(b)) {
    const t = await trend(slug);
    if (t) trends[slug] = { keywords: t.hotKeywords.slice(0, 8), viral: t.videos.slice(0, 3) };
  }
  return Response.json({ channels, totals, logs: logs.slice(0, 40), trends, mode: MODE });
}
