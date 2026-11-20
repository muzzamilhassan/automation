import { brands, state, trend, fbPages, ytChannels, allLogs, MODE, bustCache, ENV } from '../../../lib/data.mjs';
import { getUser } from '@/lib/route-auth';
import { slugsForUser } from '@/lib/access';
import { db, dbReady } from '@/lib/db';
import { selectVisibleChannels } from '@/lib/overview-visible.mjs';
import { summarizeClips } from '@/lib/clip-queue.mjs';
import { enforceLimits } from '@/lib/rate-limit.mjs';
import { DAY_BASIS, productionDay, todayProduction, lastActivity, autopilotSummary, todayRunFor } from '@/lib/channel-activity.mjs';
import { fetchAutopilotRunsToday } from '@/lib/autopilot-runs.mjs';
import { overviewSchedule, overviewTotals } from '@/lib/overview-truth.mjs';

export const dynamic = 'force-dynamic';

function summarizeClipQueue(q) {
  if (!q || typeof q !== 'object') return null;
  // one shared rule with post-next (Release-archived clips are NOT broken)
  const { total, remaining, broken } = summarizeClips(q);
  return {
    total,
    remaining,
    broken,
    docTitle: q.docTitle || null,
    createdAt: q.createdAt || null,
  };
}

// Live-fix wave A3 (2026-11-20): what the channel REALLY did, from its engine
// state file + today's autopilot runs (lib/channel-activity.mjs). The old
// lastRun / "only today's run" count read state.lastRunDate, which the clips
// and episode lanes never write, so every channel looked frozen in October.
// `s` = the channel's state, or null when the state source didn't answer
// (unknown, never "nothing made"). "Today" = the UTC day (DAY_BASIS).
function activityFields(s, runSummary, slug, now) {
  const today = todayProduction(s, now);
  const latestAt = (list) => (Array.isArray(list) ? list.map((t) => t?.at).filter(Boolean).sort().pop() || null : null);
  return {
    today,
    lastActivity: lastActivity(s),
    todayRun: todayRunFor(runSummary, slug),
    todayVideos: today ? today.count : null, // compat: the verdict counts through channelToday
    imageDate: s?.imageDate || null,
    deepdiveDate: s?.deepdiveDate || null,
    todayTopics: Array.isArray(s?.todayTopics) ? s.todayTopics.map((t) => t.topic) : null,
    todayTopicsAt: latestAt(s?.todayTopics),
    episodeTopic: s?.todayTopic?.topic || null,
    episodeTopicAt: s?.todayTopic?.at || null,
  };
}

export async function GET(req) {
  const fresh = new URL(req.url).searchParams.get('fresh') === '1';
  // #121 R6: auth FIRST — anonymous probes used to load every upstream source
  // before hitting the 401, and anonymous fresh=1 could bust the caches. Then
  // the fresh path (bustCache + full re-pull) is owner-only and capped; every
  // other role rides the normal cached read.
  const user = await getUser(req).catch(() => null);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  if (fresh) {
    if (user.role !== 'owner') return Response.json({ error: 'fresh pulls are owner-only' }, { status: 403 });
    const limited = await enforceLimits(user, [{ bucket: 'fresh-pull', limit: 5, windowSec: 3600 }]);
    if (limited) return limited;
    bustCache();
  }
  const [fb, yt, st, logs] = await Promise.all([fbPages(), ytChannels(), state(), allLogs()]);
  const b = brands();
  const now = new Date();
  const todayStr = productionDay(now);
  // a failed upstream read comes back null: treat it as "no rows" and say so
  // in `degraded` (wave A3, T2-04) instead of crashing or printing zeros
  const ytRows = Array.isArray(yt) ? yt : [];
  const fbRows = Array.isArray(fb) ? fb : [];
  // the state source answered when at least one channel's state came back; a
  // channel without a state file then simply hasn't produced yet
  const stateOk = Boolean(st && Object.keys(st).length);
  const stateFor = (slug) => (stateOk ? st[slug] || {} : null);

  // T4d (#106): ONE registry read feeds both the destination map and the
  // wizard append. FB page IDs (and cross-post handles) live in the registry
  // entries' destinations (the schema the engine's lib/registry.mjs already
  // reads) — a channel with no destination in the registry honestly shows no
  // FB row until one is added (data, not code — no-static-maps directive).
  let reg = [];
  let regBySlug = new Map();
  let destBySlug = new Map();
  let cadence = {};
  let regOk = false;
  try {
    const { registryChannels, readRepoJSON } = await import('../../../lib/channels-registry.js');
    reg = await registryChannels();
    regBySlug = new Map(reg.map((e) => [e.slug, e]));
    destBySlug = new Map(reg.map((e) => [e.slug, e.destinations || null]));
    regOk = true;
    try {
      cadence = (await readRepoJSON('yt-mcp/cadence.json')) || {};
    } catch { cadence = {}; }
  } catch { }

  // today's autopilot runs (UTC day), tagged per channel by run-name with the
  // same rules /runs uses; a failed read is 'unknown', never "no run today"
  const runChannels = [
    ...Object.entries(b).map(([slug, k]) => ({ slug, label: k.label || slug })),
    ...reg.map((e) => ({ slug: e.slug, label: e.label || e.slug })),
  ];
  const runs = await fetchAutopilotRunsToday({
    repo: ENV.GITHUB_REPO || 'muzzamilhassan/automation',
    token: ENV.GITHUB_TOKEN || ENV.GITHUB_PAT || '',
    now,
    channels: runChannels,
  });
  const runSummary = autopilotSummary(runs, runChannels, now);

  const channels = Object.entries(b).map(([slug, k]) => {
    const ytRow = ytRows.find(c => c.slug === slug) || null;
    const regEntry = regBySlug.get(slug) || null;
    const dest = destBySlug.get(slug);
    const fbId = dest?.fbPageId;
    const fbRow = fbId ? fbRows.find(f => f.id === fbId) || null : null;
    const ig = fbRow?.ig || null;
    const s = stateFor(slug);
    const cad = cadence[slug] || {};
    return {
      slug, ...k,
      // wave A3 (T3-01): the registry kit wins over static brands.json, as in the engine
      ...overviewSchedule(k, regEntry),
      active: k.active,
      threadsHandle: dest?.threadsHandle || null,
        yt: ytRow ? (ytRow.error ? { error: ytRow.error } : { title: ytRow.ytTitle, handle: ytRow.ytCustomUrl, subs: ytRow.subs, views: ytRow.views, videos: ytRow.videos, error: null }) : null,
      fb: fbRow ? { name: fbRow.name, username: fbRow.username, followers: fbRow.followers } : null,
      ig: ig ? { username: ig.username, followers: ig.followers, posts: ig.posts } : null,
      ...activityFields(s, runSummary, slug, now),
      flowPaused: (s?.pausedUntil || '') >= todayStr,
      shortsSource: cad.shortsSource || regEntry?.shortsSource || regEntry?.kit?.shortsSource || 'generated',
      docDays: Array.isArray(cad.docDays) ? cad.docDays : (k.docDay ? [k.docDay] : []),
      clipQueue: summarizeClipQueue(s?.clipQueue),
    };
  });
  // 10-08 CHANNEL FACTORY: wizard channels appear after the legacy brands
  {
    const seenLabels = new Set(channels.map((c) => (c.label || '').toLowerCase()));
    for (const e of reg) {
      if (b[e.slug]) continue;
      if (seenLabels.has((e.label || '').toLowerCase())) continue; // duplicate of a legacy brand (e.g. OLD MONEY CODE)
      seenLabels.add((e.label || '').toLowerCase());
      const ytRow = ytRows.find((c) => c.slug === e.slug) || null;
      const s = stateFor(e.slug);
      const cad = cadence[e.slug] || {};
      channels.push({
        slug: e.slug,
        short: (e.label || e.slug).slice(0, 2).toUpperCase(),
        label: e.label || e.slug,
        niche: e.niche || 'wizard channel — finish setup',
        accent: e.accent || '#38BDF8',
        active: true,
        fromRegistry: true,
        ...overviewSchedule(null, e),
        voice: e.voice || '',
        threadsHandle: e.destinations?.threadsHandle || null,
        yt: ytRow ? { title: ytRow.ytTitle, handle: ytRow.ytCustomUrl, subs: ytRow.subs, views: ytRow.views, videos: ytRow.videos, error: ytRow.error || null } : (Array.isArray(yt) ? { error: 're-connect once in Studio to show live stats' } : null), // wave A3: YouTube read down = unavailable (null), not "re-connect"
        fb: null, ig: null,
        ...activityFields(s, runSummary, e.slug, now),
        imageDate: null,
        flowPaused: e.autopilot === false || (s?.pausedUntil || '') >= todayStr,
        shortsSource: cad.shortsSource || e.shortsSource || e.kit?.shortsSource || 'generated',
        docDays: Array.isArray(cad.docDays) ? cad.docDays : (e.docDay ? [e.docDay] : []),
        clipQueue: summarizeClipQueue(s?.clipQueue),
      });
    }
  }
  // PRODUCTION FILTER: dormant/parked brands stay hidden, but an ACTIVE channel
  // whose YouTube read fails is shown with health 'youtube_error' instead of
  // vanishing when it needs a re-login (admin-panel review 2026-11-15 #2).
  const producing = selectVisibleChannels(channels);

  // 10-08 P2 CLIENT ROLE: clients see only their own channels.
  // FAIL-CLOSED (#118, SEC-13 + SEC-5): the 401 now happens at the TOP of GET
  // (moved up in #121 — before any data loads); a slugsForUser throw (registry
  // blip) resolves to an EMPTY scope for clients — never the whole network.
  // owner/staff get null (= all) without touching the registry, so the []
  // fallback can only ever hit clients.
  const owned = await slugsForUser(user).catch(() => []);
  const visible = owned ? producing.filter((c) => owned.includes(c.slug)) : producing;
  const visibleLogs = owned ? logs.filter((l) => owned.includes(l.slug)) : logs;

  // T4d round 1 (#106): control surfaces (command palette, music tabs) must
  // keep every channel's entry even when its live YouTube read errors — the
  // production filter above hides exactly those, and that is when the owner
  // needs a manual run. Unfiltered registry-derived list, still client-scoped.
  const controlChannels = (owned ? channels.filter((c) => owned.includes(c.slug)) : channels)
    .map((c) => ({ slug: c.slug, label: c.label || c.slug, accent: c.accent }));

  // wave A3 (T2-04 / P13): a source that didn't answer is null (shown "—"),
  // never 0; `degraded` names every live source that didn't fully answer
  const { totals, degraded: statDegraded } = overviewTotals(visible, { ytOk: Array.isArray(yt), fbOk: Array.isArray(fb) });
  const degraded = [
    ...(!regOk || !stateOk ? ['github'] : []),
    ...(runs.ok ? [] : ['runs']),
    ...statDegraded,
  ];
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
  return Response.json({ channels: visible, controlChannels, totals, degraded, dayBasis: DAY_BASIS, today: todayStr, logs: visibleLogs.slice(0, 40), trends, openWarnings, mode: MODE });
}
