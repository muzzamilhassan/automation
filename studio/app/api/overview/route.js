import { brands, state, trend, fbPages, ytChannels, allLogs, MODE, bustCache } from '../../../lib/data.mjs';
import { getUser } from '@/lib/route-auth';
import { slugsForUser } from '@/lib/access';
import { db, dbReady } from '@/lib/db';

export const dynamic = 'force-dynamic';

function summarizeClipQueue(q) {
  if (!q || typeof q !== 'object') return null;
  const clips = Array.isArray(q.clips) ? q.clips : [];
  let remaining = 0;
  let broken = 0;
  for (const c of clips) {
    if (!c || c.postedAt) continue;
    if (c.url) remaining += 1;
    else broken += 1;
  }
  return {
    total: clips.length,
    remaining,
    broken,
    docTitle: q.docTitle || null,
    createdAt: q.createdAt || null,
  };
}

export async function GET(req) {
  const fresh = new URL(req.url).searchParams.get('fresh') === '1';
  if (fresh) bustCache();
  const [fb, yt, st, logs] = await Promise.all([fbPages(), ytChannels(), state(), allLogs()]);
  const b = brands();
  const todayStr = new Date().toISOString().slice(0, 10);

  // T4d (#106): ONE registry read feeds both the destination map and the
  // wizard append. FB page IDs (and cross-post handles) live in the registry
  // entries' destinations (the schema the engine's lib/registry.mjs already
  // reads) — a channel with no destination in the registry honestly shows no
  // FB row until one is added (data, not code — no-static-maps directive).
  let reg = [];
  let regBySlug = new Map();
  let destBySlug = new Map();
  let cadence = {};
  try {
    const { registryChannels, readRepoJSON } = await import('../../../lib/channels-registry.js');
    reg = await registryChannels();
    regBySlug = new Map(reg.map((e) => [e.slug, e]));
    destBySlug = new Map(reg.map((e) => [e.slug, e.destinations || null]));
    try {
      cadence = (await readRepoJSON('yt-mcp/cadence.json')) || {};
    } catch { cadence = {}; }
  } catch { }

  const channels = Object.entries(b).map(([slug, k]) => {
    const ytRow = yt.find(c => c.slug === slug) || null;
    const regEntry = regBySlug.get(slug) || null;
    const dest = destBySlug.get(slug);
    const fbId = dest?.fbPageId;
    const fbRow = fbId ? fb.find(f => f.id === fbId) || null : null;
    const ig = fbRow?.ig || null;
    const s = st[slug] || {};
    const cad = cadence[slug] || {};
    return {
      slug, ...k,
      active: k.active,
      threadsHandle: dest?.threadsHandle || null,
        yt: ytRow ? (ytRow.error ? { error: ytRow.error } : { title: ytRow.ytTitle, handle: ytRow.ytCustomUrl, subs: ytRow.subs, views: ytRow.views, videos: ytRow.videos, error: null }) : null,
      fb: fbRow ? { name: fbRow.name, username: fbRow.username, followers: fbRow.followers } : null,
      ig: ig ? { username: ig.username, followers: ig.followers, posts: ig.posts } : null,
      lastRun: s.lastRunDate || null, imageDate: s.imageDate || null,
      deepdiveDate: s.deepdiveDate || null, todayVideos: (s.lastVideos || []).length,
      todayTopics: Array.isArray(s.todayTopics) ? s.todayTopics.map(t => t.topic) : null,
      episodeTopic: s.todayTopic?.topic || null,
      flowPaused: (s.pausedUntil || '') >= todayStr,
      shortsSource: cad.shortsSource || regEntry?.shortsSource || regEntry?.kit?.shortsSource || 'generated',
      docDays: Array.isArray(cad.docDays) ? cad.docDays : (k.docDay ? [k.docDay] : []),
      clipQueue: summarizeClipQueue(s.clipQueue),
    };
  });
  // 10-08 CHANNEL FACTORY: wizard channels appear after the legacy brands
  {
    const seenLabels = new Set(channels.map((c) => (c.label || '').toLowerCase()));
    for (const e of reg) {
      if (b[e.slug]) continue;
      if (seenLabels.has((e.label || '').toLowerCase())) continue; // duplicate of a legacy brand (e.g. OLD MONEY CODE)
      seenLabels.add((e.label || '').toLowerCase());
      const ytRow = yt.find((c) => c.slug === e.slug) || null;
      const s = st[e.slug] || {};
      const cad = cadence[e.slug] || {};
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
        threadsHandle: e.destinations?.threadsHandle || null,
        yt: ytRow ? { title: ytRow.ytTitle, handle: ytRow.ytCustomUrl, subs: ytRow.subs, views: ytRow.views, videos: ytRow.videos, error: ytRow.error || null } : (ytRow === null ? { error: 're-connect once in Studio to show live stats' } : null),
        fb: null, ig: null,
        lastRun: s.lastRunDate || null, imageDate: null,
        deepdiveDate: s.deepdiveDate || null, todayVideos: (s.lastVideos || []).length,
        todayTopics: Array.isArray(s.todayTopics) ? s.todayTopics.map((t) => t.topic) : null,
        episodeTopic: s.todayTopic?.topic || null,
        flowPaused: e.autopilot === false || (s.pausedUntil || '') >= todayStr,
        shortsSource: cad.shortsSource || e.shortsSource || e.kit?.shortsSource || 'generated',
        docDays: Array.isArray(cad.docDays) ? cad.docDays : (e.docDay ? [e.docDay] : []),
        clipQueue: summarizeClipQueue(s.clipQueue),
      });
    }
  }
  // PRODUCTION FILTER: only show channels that are actively producing
  // (have YouTube data + recent run). Dormant/parked channels are hidden
  // from the default view — they clutter the dashboard and look unfinished.
  const producing = channels.filter((c) => c.yt && !c.yt.error && (c.yt.subs > 0 || c.yt.views > 0));

  // 10-08 P2 CLIENT ROLE: clients see only their own channels
  const user = await getUser(req).catch(() => null);
  const owned = user ? await slugsForUser(user).catch(() => null) : null;
  const visible = owned ? producing.filter((c) => owned.includes(c.slug)) : producing;
  const visibleLogs = owned ? logs.filter((l) => owned.includes(l.slug)) : logs;

  // T4d round 1 (#106): control surfaces (command palette, music tabs) must
  // keep every channel's entry even when its live YouTube read errors — the
  // production filter above hides exactly those, and that is when the owner
  // needs a manual run. Unfiltered registry-derived list, still client-scoped.
  const controlChannels = (owned ? channels.filter((c) => owned.includes(c.slug)) : channels)
    .map((c) => ({ slug: c.slug, label: c.label || c.slug, accent: c.accent }));

  const totals = {
    ytSubs: visible.reduce((a, c) => a + (c.yt?.subs || 0), 0),
    ytViews: visible.reduce((a, c) => a + (c.yt?.views || 0), 0),
    ytVideos: visible.reduce((a, c) => a + (c.yt?.videos || 0), 0),
    fbFollowers: visible.reduce((a, c) => a + (c.fb?.followers || 0), 0),
    igFollowers: visible.reduce((a, c) => a + (c.ig?.followers || 0), 0),
  };
  const trends = {};
  for (const c of visible) {
    const t = await trend(c.slug);
    if (t) trends[c.slug] = { keywords: (t.hotKeywords || []).slice(0, 8), viral: (t.videos || []).slice(0, 3) };
  }
  let openWarnings = 0;
  if (dbReady && db) {
    try {
      const rows = await db`SELECT count(*)::int AS cnt FROM warnings WHERE resolved_at IS NULL`;
      openWarnings = Number(rows?.[0]?.cnt || 0);
    } catch { openWarnings = 0; }
  }
  return Response.json({ channels: visible, controlChannels, totals, logs: visibleLogs.slice(0, 40), trends, openWarnings, mode: MODE });
}
