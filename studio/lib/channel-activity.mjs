// Live-fix wave A3 (2026-11-20) — what a channel REALLY did, from the engine's
// own per-channel state (yt-mcp/state/<slug>.json) and today's autopilot runs.
// Pure: relative imports only, so `node --test` can load it.
//
// Why: /api/overview used to build "last run" and "made today" from
// state.lastRunDate, which only the old generated-Shorts lane writes. The
// clips lane (clipLastPostDate + clipQueue[].postedAt) and the episode lane
// (deepdiveDate) never touch it, so every channel looked frozen in October.
//
// ONE day definition: "today" is the UTC day. Every date the engine stamps
// (deepdiveDate, clipLastPostDate, lastRunDate) is a UTC day, and every
// upload slot is set in UTC — so the panel's Today uses the same day key.
// (uploadsToday is a PT-dated quota counter, so it is NOT used here.)
import { todaySummary } from './runs-view.mjs';

export const DAY_BASIS = 'UTC';

/** 'YYYY-MM-DD' of `now` on the UTC day. */
export function productionDay(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (d) => typeof d === 'string' && DATE_RE.test(d);
const dayOfIso = (iso) => {
  const t = Date.parse(iso || '');
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
};
const clipsOf = (s) => (Array.isArray(s?.clipQueue?.clips) ? s.clipQueue.clips : []);

/**
 * Today's production from one state file: { day, basis, count, clips, episodes, shorts }.
 * null when the state could not be read — unknown, never 0.
 */
export function todayProduction(s, now = new Date()) {
  if (!s || typeof s !== 'object') return null;
  const day = productionDay(now);
  let clips = clipsOf(s).filter((c) => c && dayOfIso(c.postedAt) === day).length;
  // a recovered/claimed clip can mark the day without a dated queue entry
  if (!clips && s.clipLastPostDate === day) clips = 1;
  const episodes = s.deepdiveDate === day ? 1 : 0;
  const shorts = s.lastRunDate === day ? Math.max(1, Array.isArray(s.lastVideos) ? s.lastVideos.length : 0) : 0;
  return { day, basis: DAY_BASIS, count: clips + episodes + shorts, clips, episodes, shorts };
}

const KIND_LABEL = { clip: 'Clip Short', episode: 'Episode', short: 'Short' };
const KIND_ORDER = { episode: 3, clip: 2, short: 1 }; // same-day tie, no times to compare

/**
 * The newest real production signal: { kind, label, date, at, title } or null.
 * kind ∈ 'clip' (clip Short posted) | 'episode' (long video made) | 'short' (generated Short).
 */
export function lastActivity(s) {
  if (!s || typeof s !== 'object') return null;
  const found = [];

  // clips lane: the newest posted queue entry, else the day marker alone
  const posted = clipsOf(s)
    .filter((c) => c && dayOfIso(c.postedAt))
    .sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt))[0] || null;
  const postedDay = posted ? dayOfIso(posted.postedAt) : null;
  if (isDay(s.clipLastPostDate) && (!postedDay || s.clipLastPostDate > postedDay)) {
    found.push({ kind: 'clip', date: s.clipLastPostDate, at: null, title: null });
  } else if (postedDay) {
    found.push({ kind: 'clip', date: postedDay, at: posted.postedAt, title: posted.title || null });
  }

  if (isDay(s.deepdiveDate)) found.push({ kind: 'episode', date: s.deepdiveDate, at: null, title: s.deepdiveVideo?.title || null });
  if (isDay(s.lastRunDate)) found.push({ kind: 'short', date: s.lastRunDate, at: null, title: null });

  if (!found.length) return null;
  found.sort((a, b) => (a.date === b.date ? KIND_ORDER[b.kind] - KIND_ORDER[a.kind] : a.date < b.date ? 1 : -1));
  const top = found[0];
  return { kind: top.kind, label: KIND_LABEL[top.kind], date: top.date, at: top.at, title: top.title };
}

/**
 * Per-channel summary of today's autopilot runs (UTC day), built with the SAME
 * rules /runs uses (runs-view todaySummary). `runs` = fetchAutopilotRunsToday().
 * Returns null when the runs could not be read.
 */
export function autopilotSummary(runs, channels = [], now = new Date()) {
  if (!runs || runs.ok !== true || !Array.isArray(runs.rows)) return null;
  return todaySummary(runs.rows, channels, { now: now.getTime(), timeZone: DAY_BASIS, coveredSince: runs.coveredSince || null });
}

const RUN_STATUS = { ok: 'succeeded', failed: 'failed', running: 'running', none: 'none', other: 'other' };

/**
 * One channel's latest autopilot run today:
 * { status: 'succeeded'|'failed'|'running'|'none'|'other', id, at, url } or { status: 'unknown' }.
 */
export function todayRunFor(summary, slug) {
  if (!summary || !Array.isArray(summary.channels)) return { status: 'unknown' };
  const e = summary.channels.find((x) => x.channel === slug);
  if (!e) return { status: summary.partial ? 'unknown' : 'none' };
  if (e.status === 'none') return { status: summary.partial ? 'unknown' : 'none' };
  const r = e.run || {};
  return {
    status: RUN_STATUS[e.status] || 'other',
    id: r.id ?? null,
    at: (e.status === 'running' ? r.startedAt || r.createdAt : r.updatedAt || r.createdAt) || null,
    url: r.url || null,
  };
}

