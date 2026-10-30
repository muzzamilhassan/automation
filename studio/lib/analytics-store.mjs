// #106 Phase 4 S5 (T6) — analytics_snapshots store.
//
// Nightly per-channel snapshots (Data API per-video counters + Analytics API
// per-day metrics) over a trailing D-1..D-4 window (Analytics numbers settle
// 48–72h — re-collecting recent days catches restatements, D19). The Studio
// leaderboard / win-rate panels read THESE rows, never live YouTube calls
// (AC-P4-26); the live 28-day panel stays on /api/analytics unchanged
// (AC-P4-28).
//
// LOCATION NOTE: canonical implementation lives inside the Studio Next.js
// root (Turbopack pins `root: '.'` — imports reaching outside fail
// `next build`). lib/analytics-store.mjs at the repo root is a re-export
// shim, so the nightly script and tests keep importing
// './lib/analytics-store.mjs' — same split as the #104 quota ledger.
//
// Client contract (house positional style, tests/template-registry-db.test.mjs):
//   `client(sqlText, params)` -> Promise<rowObject[]> — $1..$n placeholders,
//   snake_case columns. `opts.begin(runTx)` (optional) runs `runTx(txClient)`
//   inside ONE transaction (postgres.js db.begin) — rollup's fold+delete
//   pair is transactional when the production client provides it.
//   Production callers use getAnalyticsStore().
//
// SOURCE SEMANTICS (pinned — D19 + review finding 11 + T6 round 1):
//   UNIQUE (channel_id, date, source) — one row per channel+day+SOURCE.
//   'analytics_api' rows carry the PER-DAY metrics (views/watch_hours/
//   subs_delta). 'data_api' rows carry the public per-video counters in
//   per_video (bounded top-50 by views — never the full catalog); their
//   views column is the lifetime-counter SUM of that bounded set and is
//   NOT a per-day metric. Consequences, enforced everywhere:
//     - readers resolve per-day metrics from analytics_api rows ONLY — a
//       data_api-only date (the census writes one EVERY night; the
//       Analytics API omits zero-traffic days) contributes NOTHING to
//       leaderboard/rollup sums;
//     - the weekly fold admits analytics_api rows only — data_api
//       lifetime counters are never summed into weekly "truth" (their raw
//       rows are still pruned past retention; per-video counters are a
//       recent-window concern only);
//     - winRates takes each video's value from its LATEST census row
//       (lifetime counters are re-reported nightly — summing across rows
//       would inflate ~N-fold).
//
// Weekly rollups (D25/AC-P4-33) live in the same table with source =
// 'weekly_rollup', date = ISO Monday of the week, per_video = NULL. Daily
// readers never select that source; daily rows older than the 90-day
// retention are deleted after they fold in.
//
// SCOPE PROBES ("the snapshot meta"): the nightly's per-channel
// yt-analytics.readonly probe outcome lands in analytics_probe_log —
// UNIQUE per channel with latest-wins upsert (self-retaining: the
// checklist reads only the latest probe, so the table cannot grow). The
// durable alert copy is S3/T4's warnings table (lands in parallel — the
// nightly carries a TODO(#106-T4) seam, not an import). Retention note:
// the spec's D25 enumeration missed this table; latest-per-channel
// upsert IS its retention (controller to disposition).

export const PER_VIDEO_LIMIT = 50; // bounded per_video window (D19)
export const SETTLE_DAYS = 2; // analytics settle 48–72h — ranking ends D-2 (D21)
export const WIN_RATE_SETTLE_DAYS = 7; // win rates exclude younger videos (D21/AC-P4-25)
export const ROLLUP_RETENTION_DAYS = 90; // daily rows kept this long (D25)
export const ANALYTICS_SOURCES = ['analytics_api', 'data_api'];
export const ROLLUP_SOURCE = 'weekly_rollup';

// ---------------------------------------------------------------------------

function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function addDaysIso(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}

/**
 * Trailing collection window D-1..D-N, ascending UTC. D19: the nightly
 * collects yesterday back four days so restated numbers overwrite in place.
 * @param {string} todayIso 'YYYY-MM-DD'
 * @param {number} days
 * @returns {string[]} [today-days .. today-1]
 */
export function trailingWindowDays(todayIso, days) {
  const n = Math.max(1, Math.trunc(Number(days) || 1));
  const out = [];
  for (let i = n; i >= 1; i--) out.push(addDaysIso(todayIso, -i));
  return out;
}

/**
 * Bound a per-video map to the top-N by views (bounded jsonb — D19/D25).
 * Deterministic: ties break on the smaller videoId. Extra per-video fields
 * (title, publishedAt) ride along — win rates need publishedAt to settle.
 * @param {Record<string, {views: number, title?: string, publishedAt?: string}> | null} perVideo
 * @param {number} limit
 */
export function boundPerVideo(perVideo, limit = PER_VIDEO_LIMIT) {
  if (!perVideo || typeof perVideo !== 'object') return {};
  return Object.entries(perVideo)
    .map(([videoId, v]) => ({ videoId, views: Number(v?.views) || 0, title: v?.title, publishedAt: v?.publishedAt }))
    .sort((a, b) => (b.views - a.views) || a.videoId.localeCompare(b.videoId))
    .slice(0, Math.max(0, Math.trunc(limit)))
    .reduce((acc, e) => {
      const entry = { views: e.views };
      if (e.title != null) entry.title = e.title;
      if (e.publishedAt != null) entry.publishedAt = e.publishedAt;
      acc[e.videoId] = entry;
      return acc;
    }, {});
}

// ---------------------------------------------------------------------------

/**
 * @param {(sqlText: string, params: any[]) => Promise<any[]>} client
 * @param {{ begin?: (runTx: (txClient: (sqlText: string, params: any[]) => Promise<any[]>) => Promise<any>) => Promise<any> }} opts
 */
export function makeAnalyticsStore(client, opts = {}) {
  if (typeof client !== 'function') {
    throw new TypeError('makeAnalyticsStore: client must be a function (sqlText, params) -> Promise<rows>');
  }
  const begin = typeof opts.begin === 'function' ? opts.begin : null;

  async function ensureAnalyticsSchema() {
    try {
      await client(`CREATE TABLE IF NOT EXISTS analytics_snapshots (
        channel_id text NOT NULL,
        date text NOT NULL,
        source text NOT NULL,
        views bigint NOT NULL DEFAULT 0,
        watch_hours double precision,
        subs_delta bigint,
        per_video jsonb,
        collected_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (channel_id, date, source)
      )`, []);
      // UNIQUE(channel_id) + latest-wins upsert = the table IS its own
      // retention (see header retention note re D25).
      await client(`CREATE TABLE IF NOT EXISTS analytics_probe_log (
        channel_id text PRIMARY KEY,
        ok boolean NOT NULL,
        has_scope boolean NOT NULL,
        error text,
        checked_at timestamptz NOT NULL DEFAULT now()
      )`, []);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e?.message || e).slice(0, 200) };
    }
  }

  /**
   * UPSERT a batch of snapshot rows — re-runs update in place, never
   * duplicate (AC-P4-24). Rows missing channelId/date/source, carrying a
   * malformed date, or naming an unknown source fail the whole call (the
   * collector constructs rows; a bad row is a bug, not a data point).
   * @param {Array<{channelId: string, date: string, source: string, views?: number, watchHours?: number|null, subsDelta?: number|null, perVideo?: object|null}>} rows
   */
  async function upsertWindow(rows) {
    try {
      if (!Array.isArray(rows)) return { ok: false, error: 'rows_must_be_an_array', upserted: 0 };
      for (const r of rows) {
        if (!isNonEmptyString(r?.channelId)) return { ok: false, error: 'channelId_required', upserted: 0 };
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r?.date || ''))) return { ok: false, error: 'date_must_be_YYYY-MM-DD', upserted: 0 };
        if (!ANALYTICS_SOURCES.includes(r?.source)) return { ok: false, error: `source_must_be_one_of_${ANALYTICS_SOURCES.join('|')}`, upserted: 0 };
        if (r.perVideo != null && (typeof r.perVideo !== 'object' || Array.isArray(r.perVideo))) {
          return { ok: false, error: 'perVideo_must_be_an_object', upserted: 0 };
        }
      }
      let n = 0;
      for (const r of rows) {
        // per_video jsonb is BOUNDED at write time too — a collector bug can
        // never grow the column unbounded (D19).
        const perVideoJson = r.perVideo ? JSON.stringify(boundPerVideo(r.perVideo)) : null;
        await client(
          `INSERT INTO analytics_snapshots (channel_id, date, source, views, watch_hours, subs_delta, per_video)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (channel_id, date, source) DO UPDATE SET
             views = EXCLUDED.views,
             watch_hours = EXCLUDED.watch_hours,
             subs_delta = EXCLUDED.subs_delta,
             per_video = EXCLUDED.per_video,
             collected_at = now()`,
          [
            r.channelId,
            r.date,
            r.source,
            Math.max(0, Math.trunc(Number(r.views) || 0)),
            r.watchHours == null ? null : Number(r.watchHours),
            r.subsDelta == null ? null : Math.trunc(Number(r.subsDelta) || 0),
            perVideoJson,
          ],
        );
        n++;
      }
      return { ok: true, upserted: n };
    } catch (e) {
      return { ok: false, error: String(e?.message || e).slice(0, 200), upserted: 0 };
    }
  }

  // Resolve per (channel, date) to ONE row for PER-DAY METRICS:
  // data_api rows are skipped ENTIRELY (lifetime counters are not per-day
  // metrics — a census-only date must never appear as a traffic day);
  // analytics_api wins the date over a weekly_rollup row when both exist.
  function resolveDaily(rows) {
    const byKey = new Map(); // channel\u0000date -> row
    for (const r of rows) {
      if (r.source === 'data_api') continue;
      const key = r.channel_id + '\u0000' + r.date;
      const prev = byKey.get(key);
      if (!prev || (prev.source !== 'analytics_api' && r.source === 'analytics_api')) byKey.set(key, r);
    }
    return byKey;
  }

  /**
   * Channel leaderboard over a window ENDING at the settle boundary
   * (today - SETTLE_DAYS — D21/AC-P4-25: the trailing 2 days are never
   * presented as final), ranked by views desc, with trend vs the previous
   * equal-length window. Zero live YouTube calls (AC-P4-26). dataThrough is
   * NULL when there is no data (the UI shows its empty state, never a stamp
   * over an empty panel).
   * @param {number} days 7 | 28 | 90 (anything else is clamped into 1..90)
   * @param {{ today?: Date }} opts
   */
  async function leaderboardWindow(days, opts = {}) {
    try {
      const n = Math.min(90, Math.max(1, Math.trunc(Number(days) || 28)));
      const todayIso = isoDate(opts.today || new Date());
      const through = addDaysIso(todayIso, -SETTLE_DAYS);
      const start = addDaysIso(through, -(n - 1));
      const prevEnd = addDaysIso(start, -1);
      const prevStart = addDaysIso(prevEnd, -(n - 1));

      const select = `SELECT channel_id, date, source, views, watch_hours, subs_delta FROM analytics_snapshots WHERE date >= $1 AND date <= $2`;
      const cur = await client(select, [start, through]);
      const prev = await client(select, [prevStart, prevEnd]);

      const sumByChannel = (rowMap) => {
        const out = new Map();
        for (const r of rowMap.values()) {
          const acc = out.get(r.channel_id) || { views: 0, watchHours: 0, subsDelta: 0 };
          acc.views += Number(r.views || 0);
          acc.watchHours += Number(r.watch_hours || 0);
          acc.subsDelta += Number(r.subs_delta || 0);
          out.set(r.channel_id, acc);
        }
        return out;
      };

      const curSums = sumByChannel(resolveDaily(cur));
      const prevSums = sumByChannel(resolveDaily(prev));
      const rows = [...curSums.entries()]
        .map(([channelId, s]) => {
          const p = prevSums.get(channelId) || { views: 0 };
          const trendPct = p.views > 0 ? Math.round(((s.views - p.views) / p.views) * 100) : null;
          return {
            channelId,
            views: s.views,
            watchHours: Math.round(s.watchHours * 10) / 10,
            subsDelta: s.subsDelta,
            prevViews: p.views,
            trendPct,
          };
        })
        .sort((a, b) => b.views - a.views || a.channelId.localeCompare(b.channelId));

      return { ok: true, days: n, dataThrough: rows.length ? through : null, start, rows };
    } catch (e) {
      return { ok: false, error: String(e?.message || e).slice(0, 200), dataThrough: null, rows: [] };
    }
  }

  /**
   * Fold analytics_api daily rows older than the retention cutoff into
   * weekly rows (source 'weekly_rollup', date = ISO Monday, per_video NULL)
   * and delete the folded raw rows (D25/AC-P4-33). data_api lifetime-counter
   * rows NEVER enter metric sums — they are only pruned past retention (the
   * latest census row is all win rates need). The fold+delete pair runs in
   * ONE transaction when the store was built with `begin` (round 1
   * IMPORTANT 4: a crash between the two statements must not leave days
   * that a re-run would fold twice); accumulate-on-conflict stays correct
   * across nights because a folded day is always deleted in the same pass.
   * @param {{ today?: Date, retentionDays?: number }} opts
   */
  async function rollup(opts = {}) {
    const retention = Math.max(7, Math.trunc(Number(opts.retentionDays) || ROLLUP_RETENTION_DAYS));
    const todayIso = isoDate(opts.today || new Date());
    const cutoff = addDaysIso(todayIso, -retention);

    const run = async (tx) => {
      const countRows = await tx(
        `SELECT channel_id, date, source, views, watch_hours, subs_delta FROM analytics_snapshots WHERE date >= $1 AND date <= $2`,
        ['0000-01-01', cutoff],
      );
      const daily = countRows.filter((r) => r.source === 'analytics_api' && r.date < cutoff);
      if (daily.length) {
        await tx(
          `INSERT INTO analytics_snapshots (channel_id, date, source, views, watch_hours, subs_delta, per_video, collected_at)
           SELECT channel_id,
                  to_char(to_date(date, 'YYYY-MM-DD') - ((EXTRACT(ISODOW FROM to_date(date, 'YYYY-MM-DD'))::int) - 1), 'YYYY-MM-DD'),
                  'weekly_rollup',
                  SUM(views), SUM(COALESCE(watch_hours, 0)), SUM(COALESCE(subs_delta, 0)),
                  NULL::jsonb, now()
           FROM analytics_snapshots
           WHERE source = $2 AND date < $1
           GROUP BY 1, 2
           ON CONFLICT (channel_id, date, source) DO UPDATE SET
             views = analytics_snapshots.views + EXCLUDED.views,
             watch_hours = analytics_snapshots.watch_hours + EXCLUDED.watch_hours,
             subs_delta = analytics_snapshots.subs_delta + EXCLUDED.subs_delta,
             collected_at = now()`,
          [cutoff, 'analytics_api'],
        );
        await tx(
          `DELETE FROM analytics_snapshots WHERE source IN ('analytics_api', 'data_api') AND date < $1`,
          [cutoff],
        );
      }
      return { ok: true, dailyFolded: daily.length, cutoff };
    };

    try {
      if (typeof opts.begin === 'function') return await opts.begin(run);
      if (typeof begin === 'function') return await begin(run);
      return await run(client); // sequential fallback — tests without a tx seam
    } catch (e) {
      return { ok: false, error: String(e?.message || e).slice(0, 200), dailyFolded: 0, cutoff };
    }
  }

  /**
   * Per-template and per-topic win rates over PUBLISHED videos (OQ-7
   * denominator), joining scripts.template_id when the S4 table exists.
   * Until S4 lands (or before any published video settles), returns a clean
   * EMPTY result set — { available: false, templates: [], topics: [] } —
   * the Studio surface renders "no data yet — fills as Phase 4 S4 lands"
   * (L6/D20/Honest Limits). Semantics (round 1):
   *   - each video's views come from its LATEST data_api census row
   *     (lifetime counters re-reported nightly — never summed across rows);
   *   - videos younger than WIN_RATE_SETTLE_DAYS (7d, D21/AC-P4-25) are
   *     excluded — a census row without a parseable publishedAt cannot prove
   *     settle and is excluded too;
   *   - `channelIds` (a non-owner's owned-slug list) scopes the join;
     an empty list yields an empty result (fail-closed).
   */
  async function winRates({ channelIds } = {}) {
    const empty = { ok: true, available: false, templates: [], topics: [] };
    try {
      const reg = (await client(`SELECT to_regclass($1) AS reg`, ['public.scripts']))[0]?.reg;
      if (!reg) return { ...empty, reason: 'scripts_table_missing' };
      // S4 contract (D14): scripts rows carry template_id + video_id + channel
      // (the upload sites write video_id back). Anything else degrades to the
      // empty state instead of guessing at half-landed schema.
      let scriptRows;
      try {
        scriptRows = await client(
          `SELECT template_id, video_id, topic, channel_id FROM scripts WHERE video_id IS NOT NULL`,
          [],
        );
      } catch (e) {
        return { ...empty, reason: 'scripts_schema_not_ready: ' + String(e?.message || e).slice(0, 80) };
      }
      if (Array.isArray(channelIds)) scriptRows = scriptRows.filter((s) => channelIds.includes(s.channel_id));
      // per-video public counters — NEWEST census row first (ORDER BY date
      // DESC), first-wins per video
      const perVideoRows = await client(
        `SELECT per_video FROM analytics_snapshots WHERE source = $1 AND per_video IS NOT NULL ORDER BY date DESC`,
        ['data_api'],
      );
      const viewsByVideo = new Map();
      const publishedAtByVideo = new Map();
      for (const row of perVideoRows) {
        const pv = typeof row.per_video === 'string' ? JSON.parse(row.per_video) : row.per_video;
        for (const [videoId, v] of Object.entries(pv || {})) {
          if (viewsByVideo.has(videoId)) continue; // a newer row already spoke
          viewsByVideo.set(videoId, Number(v?.views) || 0);
          publishedAtByVideo.set(videoId, v?.publishedAt || null);
        }
      }
      const now = Date.now();
      const settleMs = WIN_RATE_SETTLE_DAYS * 86400000;
      const byTemplate = new Map();
      const byTopic = new Map();
      for (const s of scriptRows) {
        if (!s?.template_id || !s?.video_id) continue;
        const views = viewsByVideo.get(s.video_id);
        if (views == null) continue; // unpublished or not yet censused
        const publishedAt = publishedAtByVideo.get(s.video_id);
        const t = publishedAt ? Date.parse(publishedAt) : NaN;
        if (!Number.isFinite(t) || now - t < settleMs) continue; // too unsettled to rank (D21)
        const bump = (map, key) => {
          const acc = map.get(key) || { key, published: 0, views: 0 };
          acc.published += 1;
          acc.views += views;
          map.set(key, acc);
        };
        bump(byTemplate, s.template_id);
        if (s.topic) bump(byTopic, s.topic);
      }
      const shape = (map) =>
        [...map.values()]
          .map((e) => ({ ...e, views: Number(e.views) }))
          .sort((a, b) => b.views - a.views);
      return { ok: true, available: true, templates: shape(byTemplate), topics: shape(byTopic) };
    } catch (e) {
      return { ...empty, reason: String(e?.message || e).slice(0, 200) };
    }
  }

  /**
   * Record the latest scope-probe outcome (D19 preflight) — the snapshot
   * meta the owner re-auth checklist reads. Latest-wins per channel (the
   * table is UNIQUE(channel_id)); never throws.
   */
  async function recordProbe({ channelId, ok, hasScope, error, checkedAt } = {}) {
    try {
      if (!isNonEmptyString(channelId)) return { ok: false, error: 'channelId_required' };
      const at = checkedAt ? new Date(checkedAt) : new Date();
      await client(
        `INSERT INTO analytics_probe_log (channel_id, ok, has_scope, error, checked_at) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (channel_id) DO UPDATE SET
           ok = EXCLUDED.ok,
           has_scope = EXCLUDED.has_scope,
           error = EXCLUDED.error,
           checked_at = EXCLUDED.checked_at`,
        [channelId, ok === true, hasScope === true, error ? String(error).slice(0, 300) : null, at],
      );
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e?.message || e).slice(0, 200) };
    }
  }

  /** Latest probe per channel (UNIQUE table — at most one row each). */
  async function latestProbes() {
    try {
      const rows = await client(
        `SELECT channel_id, ok, has_scope, error, checked_at FROM analytics_probe_log ORDER BY channel_id ASC`,
        [],
      );
      return { ok: true, probes: [...(rows || [])] };
    } catch (e) {
      return { ok: false, error: String(e?.message || e).slice(0, 200), probes: [] };
    }
  }

  return {
    ensureAnalyticsSchema,
    upsertWindow,
    rollup,
    leaderboardWindow,
    winRates,
    recordProbe,
    latestProbes,
  };
}

/**
 * Production entry point. Lazy-imports db.mjs so importing this module never
 * touches the DB layer — unit tests and non-Neon machines stay safe until
 * this is actually called (getRegistryDb pattern). Throws fail-closed.
 * rollup's fold+delete runs inside db.begin (one transaction).
 */
export async function getAnalyticsStore() {
  const { db, dbReady } = await import('./db.mjs');
  if (!dbReady || !db) {
    throw new Error('analytics store: DATABASE_URL missing / db not ready — cannot construct analytics store');
  }
  return makeAnalyticsStore((text, params) => db.unsafe(text, params), {
    begin: (runTx) => db.begin(async (tx) => runTx((text, params) => tx.unsafe(text, params))),
  });
}
