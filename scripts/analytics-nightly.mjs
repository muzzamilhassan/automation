#!/usr/bin/env node
// #106 PHASE 4 S5 (T6) — nightly analytics snapshots (analytics-nightly.yml, 05:17 UTC).
//
// Per channel, in order:
//   1. SCOPE PROBE FIRST (D19/AC-P4-24): one minimal Analytics API read that
//      403s when the channel's token lacks yt-analytics.readonly. Outcome
//      lands in analytics_probe_log (the snapshot meta — the Studio owner
//      re-auth checklist reads it) + a console [warn]. A scope-less channel
//      is SKIPPED, never failed hard — an analytics read never blocks
//      publishing (D9 constraint).
//   2. TRAILING WINDOW D-1..D-4 (D19): Analytics API per-day metrics
//      (views / watch minutes / subs gained) upserted with source
//      'analytics_api' — re-runs update in place, never duplicate.
//   3. DATA API CENSUS (bounded): the channel's ~50 most recent uploads via
//      channels.list + playlistItems.list + videos.list (~3 quota units,
//      own bucket — D24), per-video public counters upserted with source
//      'data_api' (per_video jsonb, top-50 by views — never unbounded).
//      "analytics_api wins" on overlapping dates for per-day metrics —
//      pinned in lib/analytics-store.mjs (readers, not the writer).
//   4. WEEKLY ROLLUP (D25/AC-P4-33): daily rows older than 90 days fold
//      into weekly_rollup rows; raw rows deleted.
//
// Channel discovery is DATA, never a hardcoded map (owner directive): the
// CHANNELS env var (comma list) if set, else every YT_TOKEN_<SLUG> secret
// present in the environment, else yt-mcp/channels/*/token.json locally.
// Adding a channel = adding its secret (or wiring it in Studio) — zero code.
//
// All YouTube calls go through injected fetch/token providers; the store
// takes an injected SQL client. Nothing here runs in tests.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnv } from '../lib/env.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TRAILING_DAYS = 4; // D-1..D-4 (D19)

// ---------------------------------------------------------------------------
// Channel discovery — env-derived, no static slug map.
// ---------------------------------------------------------------------------

/** 'YT_TOKEN_INVESTORS_COMPASS' -> 'investors-compass' (inverse of data.mjs). */
export function slugFromTokenEnv(key) {
  if (!key || !key.startsWith('YT_TOKEN_')) return null;
  const slug = key.slice('YT_TOKEN_'.length).toLowerCase().replace(/_/g, '-');
  return slug || null;
}

export function discoverChannels(env = process.env) {
  const listed = String(env.CHANNELS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (listed.length) return [...new Set(listed)];
  const slugs = new Set();
  for (const key of Object.keys(env)) {
    const s = slugFromTokenEnv(key);
    if (s) slugs.add(s);
  }
  if (slugs.size) return [...slugs].sort();
  // local fallback (no secrets exported): gitignored token files
  try {
    const dir = path.join(ROOT, 'yt-mcp/channels');
    return fs
      .readdirSync(dir)
      .filter((s) => fs.existsSync(path.join(dir, s, 'token.json')))
      .sort();
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// YouTube callers — plain fetch, same shape as the live analytics panel.
// ---------------------------------------------------------------------------

async function analyticsReport(fetchImpl, token, params) {
  const qs = new URLSearchParams({ ids: 'channel==MINE', ...params });
  const res = await fetchImpl(`https://youtubeanalytics.googleapis.com/v2/reports?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = new Error(`analytics ${res.status}: ${(await res.text()).slice(0, 120)}`);
    err.status = res.status;
    throw err;
  }
  return (await res.json()).rows || [];
}

async function dataApi(fetchImpl, token, pathname, params) {
  const qs = new URLSearchParams(params);
  const res = await fetchImpl(`https://www.googleapis.com/youtube/v3/${pathname}?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = new Error(`data ${pathname} ${res.status}: ${(await res.text()).slice(0, 120)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/** The probe result is 'ok' | 'scope_missing' | 'error'. */
export function classifyProbeOutcome(err) {
  const text = String(err?.message || err);
  if (err?.status === 403 || /insufficientPermissions|forbidden|Forbidden/i.test(text)) return 'scope_missing';
  return 'error';
}

// ---------------------------------------------------------------------------
// Per-channel collection
// ---------------------------------------------------------------------------

async function collectChannel({ slug, accessToken, store, fetchImpl, window }) {
  // 1. token (shared refresh flow — same one the live panel uses)
  let token;
  try {
    token = await accessToken(slug);
  } catch (e) {
    // NO probe-log write here (round 1 IMPORTANT 6c): the probe log means
    // "latest SCOPE verdict" — a token failure never learned anything about
    // scope, and the re-auth checklist reads has_scope=false. The channel
    // keeps its previous probe state; the [warn] line + T4 warnings are the
    // record for this failure class.
    console.log(`[warn] token_refresh_failed slug=${slug} — channel skipped (${String(e.message).slice(0, 100)})`);
    return { slug, ok: false, skipped: true, reason: 'token_refresh_failed' };
  }

  // 2. SCOPE PROBE FIRST — one minimal read; 403 without yt-analytics.readonly
  try {
    await analyticsReport(fetchImpl, token, { startDate: window[window.length - 1], endDate: window[window.length - 1], metrics: 'views' });
    await store.recordProbe({ channelId: slug, ok: true, hasScope: true });
  } catch (e) {
    const kind = classifyProbeOutcome(e);
    if (kind === 'scope_missing') {
      // The ONLY probe failure that writes has_scope=false (and so lands on
      // the Studio re-auth checklist). Transient 5xx/401 below do NOT — they
      // say nothing about the scope.
      await store.recordProbe({ channelId: slug, ok: false, hasScope: false, error: String(e.message).slice(0, 200) });
      // TODO(#106-T4): when lib/warnings-store.mjs lands (S3/T4, in parallel
      // with this task), ALSO write the durable warning row here:
      //   writeWarning({ code: 'analytics_scope_missing', severity: 'warning',
      //     channel_id: slug, ... })  — never Blocking (D9/D19: analytics
      //     failures never park a channel). Until then the probe log above
      //     + the Studio re-auth checklist is the record.
      console.log(`[warn] analytics_scope_missing slug=${slug} — channel skipped; owner must re-auth with yt-analytics.readonly (${String(e.message).slice(0, 100)})`);
      return { slug, ok: false, skipped: true, reason: 'analytics_scope_missing' };
    }
    console.log(`[warn] analytics_probe_failed slug=${slug} — channel skipped (${String(e.message).slice(0, 100)})`);
    return { slug, ok: false, skipped: true, reason: 'probe_failed' };
  }

  // 3. analytics_api — per-day metrics over the trailing window
  const rows = await analyticsReport(fetchImpl, token, {
    startDate: window[0],
    endDate: window[window.length - 1],
    metrics: 'views,estimatedMinutesWatched,subscribersGained',
    dimensions: 'day',
  });
  const dailyUpsert = await store.upsertWindow(
    rows
      .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(String(r[0] || '')))
      .map((r) => ({
        channelId: slug,
        date: r[0],
        source: 'analytics_api',
        views: Number(r[1] || 0),
        watchHours: Math.round((Number(r[2] || 0) / 60) * 1000) / 1000,
        subsDelta: Number(r[3] || 0),
        perVideo: null,
      })),
  );
  if (!dailyUpsert.ok) throw new Error(`snapshot upsert failed: ${dailyUpsert.error}`);

  // 4. data_api — bounded per-video census (lifetime public counters)
  let census = { videos: 0 };
  try {
    const ch = await dataApi(fetchImpl, token, 'channels', { part: 'contentDetails', mine: 'true' });
    const uploads = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (uploads) {
      const pl = await dataApi(fetchImpl, token, 'playlistItems', { part: 'contentDetails', playlistId: uploads, maxResults: '50' });
      // videoPublishedAt rides on the playlist item — recorded per video so
      // win rates can enforce the 7-day settle (AC-P4-25/D21)
      const publishedAtById = {};
      const ids = [];
      for (const item of pl.items || []) {
        const vid = item.contentDetails?.videoId;
        if (!vid || ids.length >= 50) continue;
        ids.push(vid);
        publishedAtById[vid] = item.contentDetails.videoPublishedAt || null;
      }
      const perVideo = {};
      for (let i = 0; i < ids.length; i += 50) {
        const vs = await dataApi(fetchImpl, token, 'videos', { part: 'statistics,snippet', id: ids.slice(i, i + 50).join(',') });
        for (const v of vs.items || []) {
          perVideo[v.id] = {
            views: Number(v.statistics?.viewCount || 0),
            title: String(v.snippet?.title || '').slice(0, 120),
            publishedAt: publishedAtById[v.id] || null,
          };
        }
      }
      const boundedUpsert = await store.upsertWindow([
        {
          channelId: slug,
          date: window[window.length - 1],
          source: 'data_api',
          // lifetime-counter SUM of the bounded set — NOT a per-day metric
          // (readers never use data_api rows for per-day numbers, D19)
          views: Object.values(perVideo).reduce((a, v) => a + v.views, 0),
          watchHours: null,
          subsDelta: null,
          perVideo,
        },
      ]);
      if (!boundedUpsert.ok) throw new Error(`census upsert failed: ${boundedUpsert.error}`);
      census = { videos: Object.keys(perVideo).length };
    }
  } catch (e) {
    // the census is supplementary — an analytics_api-only night beats no night
    console.log(`[warn] data_api_census_failed slug=${slug} — per-day rows kept (${String(e.message).slice(0, 100)})`);
    census = { videos: 0, error: String(e.message).slice(0, 100) };
  }

  return { slug, ok: true, skipped: false, days: dailyUpsert.upserted, ...census };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function main(argv = process.argv) {
  loadEnv(); // repo-root .env (CI env always wins — ??= semantics)
  const { createAccessToken } = await import('../studio/lib/yt-token.mjs');
  const { getAnalyticsStore, trailingWindowDays } = await import('../lib/analytics-store.mjs');

  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const window = trailingWindowDays(todayIso, TRAILING_DAYS);
  const slugs = discoverChannels(process.env);

  if (!slugs.length) {
    console.error('[analytics-nightly] no channels discovered (CHANNELS / YT_TOKEN_* / local token files) — nothing to do');
    return 1;
  }
  if (!process.env.DATABASE_URL) {
    console.error('[analytics-nightly] DATABASE_URL not set — nowhere to write snapshots');
    return 1;
  }

  const store = await getAnalyticsStore();
  const ensured = await store.ensureAnalyticsSchema();
  if (!ensured.ok) {
    console.error(`[analytics-nightly] schema ensure failed: ${ensured.error}`);
    return 1;
  }

  console.log(`[analytics-nightly] ${slugs.length} channel(s), window ${window[0]}..${window[3]}`);
  const accessToken = createAccessToken();
  const channels = [];
  for (const slug of slugs) {
    try {
      channels.push(await collectChannel({ slug, accessToken, store, fetchImpl: fetch, window }));
    } catch (e) {
      // one channel's collection failure must never stop the others
      console.log(`[warn] collection_failed slug=${slug} (${String(e.message).slice(0, 120)})`);
      channels.push({ slug, ok: false, skipped: false, reason: String(e.message).slice(0, 100) });
    }
  }

  const roll = await store.rollup({ today: now });
  if (!roll.ok) console.log(`[warn] rollup_failed (${roll.error}) — snapshots kept, retry tomorrow`);

  const okCount = channels.filter((c) => c.ok).length;
  const skipped = channels.filter((c) => c.skipped).map((c) => c.slug);
  console.log(
    `[analytics-nightly] done: ${okCount}/${channels.length} collected` +
      (skipped.length ? `, skipped (scope/re-auth checklist): ${skipped.join(', ')}` : '') +
      `, rollup folded ${roll.dailyFolded} day rows (cutoff ${roll.cutoff})`,
  );
  console.log('[analytics-nightly] ' + JSON.stringify({ today: todayIso, window, channels }));
  // all-fail fails loudly (house rule) — partial success is a normal night
  return okCount === 0 ? 1 : 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().then(
    (code) => process.exit(code || 0),
    (e) => {
      console.error(`[analytics-nightly] fatal: ${String(e?.stack || e).slice(0, 400)}`);
      process.exit(1);
    },
  );
}
