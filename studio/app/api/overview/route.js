import { brands, state, trend, fbPages, ytChannels, allLogs } from '../../../lib/data.mjs';

export const dynamic = 'force-dynamic';

const FB_MAP = { 'investors-compass': '116157974886564', 'money-rulebook': '1077306835630491', 'debt-free-doctrine': '106473735839651', quotequarry: '108044922375174' };

export async function GET() {
  const [fb, yt] = await Promise.all([fbPages(), ytChannels()]);
  const b = brands();
  const st = state();
  const channels = Object.entries(b).map(([slug, k]) => {
    const ytRow = yt.find(c => c.slug === slug) || null;
    const fbRow = fb.find(f => f.id === FB_MAP[slug]) || null;
    const ig = fbRow?.ig || null;
    const s = st[slug] || {};
    return {
      slug, ...k,
      active: slug === 'quotequarry' ? true : k.active,
      yt: ytRow ? { title: ytRow.ytTitle, handle: ytRow.ytCustomUrl, subs: ytRow.subs, views: ytRow.views, videos: ytRow.videos } : null,
      fb: fbRow ? { name: fbRow.name, username: fbRow.username, followers: fbRow.followers } : null,
      ig: ig ? { username: ig.username, followers: ig.followers, posts: ig.posts } : null,
      lastRun: s.lastRunDate || null, imageDate: s.imageDate || null,
      deepdiveDate: s.deepdiveDate || null, todayVideos: (s.lastVideos || []).length
    };
  });
  const totals = {
    ytSubs: channels.reduce((a, c) => a + (c.yt?.subs || 0), 0),
    ytViews: channels.reduce((a, c) => a + (c.yt?.views || 0), 0),
    ytVideos: channels.reduce((a, c) => a + (c.yt?.videos || 0), 0),
    fbFollowers: channels.reduce((a, c) => a + (c.fb?.followers || 0), 0),
    igFollowers: channels.reduce((a, c) => a + (c.ig?.followers || 0), 0)
  };
  return Response.json({ channels, totals, logs: allLogs().slice(0, 40), trends: Object.keys(b).reduce((acc, slug) => { const t = trend(slug); if (t) acc[slug] = { keywords: t.hotKeywords.slice(0, 8), viral: t.videos.slice(0, 3) }; return acc; }, {}) });
}
