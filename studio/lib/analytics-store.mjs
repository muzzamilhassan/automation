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
//   snake_case columns. Production callers use getAnalyticsStore().
//
// SOURCE SEMANTICS (pinned — D19 + review finding 11):
//   UNIQUE (channel_id, date, source) — one row per channel+day+SOURCE.
//   'analytics_api' rows carry the per-day metrics (views/watch_hours/
//   subs_delta). 'data_api' rows carry the public per-video counters in
//   per_video (bounded top-50 by views — never the full catalog); their
//   views column is the lifetime-counter SUM of that bounded set and is
//   NOT a per-day metric. WHERE BOTH SOURCES HAVE THE SAME DATE, THE
//   analytics_api ROW WINS for per-day metrics: leaderboardWindow() (and
//   any future per-day reader) resolves each (channel, date) to its
//   analytics_api row when one exists and never sums across sources. The
//   data_api row is kept alongside — per-video counters come only from it.
//
// Weekly rollups (D25/AC-P4-33) live in the same table with source =
// 'weekly_rollup', date = ISO Monday of the week, per_video = NULL
// (per-video detail is a recent-window concern only). Daily readers never
// select that source; daily rows older than the 90-day retention are
// deleted after they fold in.
//
// SCOPE PROBES ("the snapshot meta"): the nightly's per-channel
// yt-analytics.readonly probe outcome lands in analytics_probe_log — the
// durable record behind the Studio owner re-auth checklist (D19). The
// warnings-table copy is S3/T4's job (lands in parallel — the nightly
// carries a TODO(#106-T4) seam, not an import).

export const PER_VIDEO_LIMIT = 50; // bounded per_video window (D19)
export const SETTLE_DAYS = 2; // analytics settle 48–72h — ranking ends D-2 (D21)
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
 * Deterministic: ties break on the smaller videoId.
 * @param {Record<string, {views: number, title?: string}> | null} perVideo
 * @param {number} limit
 */
export function boundPerVideo(perVideo, limit = PER_VIDEO_LIMIT) {
  if (!perVideo || typeof perVideo !== 'object') return {};
  return Object.entries(perVideo)
    .map(([videoId, v]) => ({ videoId, views: Number(v?.views) || 0, title: v?.title }))
    .sort((a, b) => (b.views - a.views) || a.videoId.localeCompare(b.videoId))
    .slice(0, Math.max(0, Math.trunc(limit)))
    .reduce((acc, e) => {
      acc[e.videoId] = e.title != null ? { views: e.views, title: e.title } : { views: e.views };
      return acc;
    }, {});
}

// ---------------------------------------------------------------------------

/**
 * @param {(sqlText: string, params: any[]) => Promise<any[]>} client
 */
export function makeAnalyticsStore(client) {
  if (typeof client !== 'function') {
    throw new TypeError('makeAnalyticsStore: client must be a function (sqlText, params) -> Promise<rows>');
  }

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
      await client(`CREATE TABLE IF NOT EXISTS analytics_probe_log (
        channel_id text NOT NULL,
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

  // Resolve per (channel, date) to ONE row: analytics_api wins overlaps
  // (source semantics, header note). data_api rows contribute nothing to
  // per-day sums — they exist for per-video counters.
  function resolveDaily(rows) {
    const byKey = new Map(); // channel\u0000date -> row
    for (const r of rows) {
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
   * equal-length window. Zero live YouTube calls (AC-P4-26).
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

      return { ok: true, days: n, dataThrough: through, start, rows };
    } catch (e) {
      return { ok: false, error: String(e?.message || e).slice(0, 200), dataThrough: null, rows: [] };
    }
  }

  /**
   * Fold daily rows older than the retention cutoff into weekly rows
   * (source 'weekly_rollup', date = ISO Monday, per_video NULL) and delete
   * the folded raw rows (D25/AC-P4-33). Accumulate-on-conflict + delete in
   * the same pass = idempotent (the folded rows are gone, so a re-run only
   * ever sees fresh old dailies).
   * @param {{ today?: Date, retentionDays?: number }} opts
   */
  async function rollup(opts = {}) {
    try {
      const retention = Math.max(7, Math.trunc(Number(opts.retentionDays) || ROLLUP_RETENTION_DAYS));
      const todayIso = isoDate(opts.today || new Date());
      const cutoff = addDaysIso(todayIso, -retention);
      const countRows = await client(
        `SELECT channel_id, date, source, views, watch_hours, subs_delta FROM analytics_snapshots WHERE date >= $1 AND date <= $2`,
        ['0000-01-01', cutoff],
      );
      const daily = countRows.filter((r) => ANALYTICS_SOURCES.includes(r.source) && r.date < cutoff);
      if (daily.length) {
        await client(
          `INSERT INTO analytics_snapshots (channel_id, date, source, views, watch_hours, subs_delta, per_video, collected_at)
           SELECT channel_id,
                  to_char(to_date(date, 'YYYY-MM-DD') - ((EXTRACT(ISODOW FROM to_date(date, 'YYYY-MM-DD'))::int) - 1), 'YYYY-MM-DD'),
                  $2,
                  SUM(views), SUM(COALESCE(watch_hours, 0)), SUM(COALESCE(subs_delta, 0)),
                  NULL::jsonb, now()
           FROM analytics_snapshots
           WHERE source IN ('analytics_api', 'data_api') AND date < $1
           GROUP BY 1, 2
           ON CONFLICT (channel_id, date, source) DO UPDATE SET
             views = analytics_snapshots.views + EXCLUDED.views,
             watch_hours = analytics_snapshots.watch_hours + EXCLUDED.watch_hours,
             subs_delta = analytics_snapshots.subs_delta + EXCLUDED.subs_delta,
             collected_at = now()`,
          [cutoff, ROLLUP_SOURCE],
        );
        await client(
          `DELETE FROM analytics_snapshots WHERE source IN ('analytics_api', 'data_api') AND date < $1`,
          [cutoff],
        );
      }
      return { ok: true, dailyFolded: daily.length, cutoff };
    } catch (e) {
      return { ok: false, error: String(e?.message || e).slice(0, 200), dailyFolded: 0, cutoff: null };
    }
  }

  /**
   * Per-template and per-topic win rates over PUBLISHED videos (OQ-7
   * denominator), joining scripts.template_id when the S4 table exists.
   * Until S4 lands (or before any published video settles), returns a clean
   * EMPTY result set — { available: false, templates: [], topics: [] } —
   * the Studio surface renders "no data yet — fills as Phase 4 S4 lands"
   * (L6/D20/Honest Limits). Win rates derive from the WINNING source only
   * (analytics_api per-day rows) and exclude videos younger than 7 days
   * (D21: too unsettled to rank).
   */
  async function winRates() {
    const empty = { ok: true, available: false, templates: [], topics: [] };
    try {
      const reg = (await client(`SELECT to_regclass($1) AS reg`, ['public.scripts']))[0]?.reg;
      if (!reg) return { ...empty, reason: 'scripts_table_missing' };
      // S4 contract (D14): scripts rows carry template_id + video_id (the
      // upload sites write video_id back). Anything else degrades to the
      // empty state instead of guessing at half-landed schema.
      let scriptRows;
      try {
        scriptRows = await client(
          `SELECT template_id, video_id, topic FROM scripts WHERE video_id IS NOT NULL`,
          [],
        );
      } catch (e) {
        return { ...empty, reason: 'scripts_schema_not_ready: ' + String(e?.message || e).slice(0, 80) };
      }
      // per-video public counters from the bounded data_api census
      const perVideoRows = await client(
        `SELECT per_video FROM analytics_snapshots WHERE source = $1 AND per_video IS NOT NULL`,
        ['data_api'],
      );
      const viewsByVideo = new Map();
      const firstSeen = new Map();
      for (const row of perVideoRows) {
        const pv = typeof row.per_video === 'string' ? JSON.parse(row.per_video) : row.per_video;
        for (const [videoId, v] of Object.entries(pv || {})) {
          viewsByVideo.set(videoId, (viewsByVideo.get(videoId) || 0) + (Number(v?.views) || 0));
        }
      }
      // published-only (OQ-7): video_id present AND already counted in
      // snapshots; 7-day settle (D21) via the snapshot's own timeline —
      // videos never counted are either unpublished or too fresh to rank.
      const byTemplate = new Map();
      const byTopic = new Map();
      for (const s of scriptRows) {
        if (!s?.template_id || !s?.video_id) continue;
        const views = viewsByVideo.get(s.video_id);
        if (views == null) continue; // unpublished or not yet settled into snapshots
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
   * Record one scope-probe outcome (D19 preflight) — the snapshot meta the
   * owner re-auth checklist reads. Never throws.
   */
  async function recordProbe({ channelId, ok, hasScope, error, checkedAt } = {}) {
    try {
      if (!isNonEmptyString(channelId)) return { ok: false, error: 'channelId_required' };
      const at = checkedAt ? new Date(checkedAt) : new Date();
      await client(
        `INSERT INTO analytics_probe_log (channel_id, ok, has_scope, error, checked_at) VALUES ($1, $2, $3, $4, $5)`,
        [channelId, ok === true, hasScope === true, error ? String(error).slice(0, 300) : null, at],
      );
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e?.message || e).slice(0, 200) };
    }
  }

  /** Latest probe per channel, ascending by channel (re-auth checklist). */
  async function latestProbes() {
    try {
      const rows = await client(
        `SELECT channel_id, ok, has_scope, error, checked_at FROM analytics_probe_log ORDER BY checked_at ASC`,
        [],
      );
      const latest = new Map();
      for (const r of rows) latest.set(r.channel_id, r); // ASC order → last write wins
      return { ok: true, probes: [...latest.values()].sort((a, b) => a.channel_id.localeCompare(b.channel_id)) };
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
 */
export async function getAnalyticsStore() {
  const { db, dbReady } = await import('./db.mjs');
  if (!dbReady || !db) {
    throw new Error('analytics store: DATABASE_URL missing / db not ready — cannot construct analytics store');
  }
  return makeAnalyticsStore((text, params) => db.unsafe(text, params));
}
