import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeAnalyticsStore,
  trailingWindowDays,
  boundPerVideo,
  PER_VIDEO_LIMIT,
  SETTLE_DAYS,
} from '../lib/analytics-store.mjs';

// ---------------------------------------------------------------------------
// Stub client contract (fixture seam — no live Neon in tests, house pattern
// from tests/template-registry-db.test.mjs).
//
// The store calls the client as `client(sqlText, params)` and awaits an array
// of row objects (postgres.js-compatible positional-param style). The stub
// understands exactly the SQL shapes the analytics store emits (nothing more,
// so a passing test cannot be trivially green):
//   - CREATE TABLE IF NOT EXISTS <t> (...)            -> recorded, no-op
//   - INSERT INTO analytics_snapshots (...) VALUES (...)
//     ON CONFLICT (channel_id, date, source) DO UPDATE -> keyed upsert
//   - INSERT INTO analytics_snapshots ... SELECT ... FROM analytics_snapshots
//     ... GROUP BY ...                                  -> weekly fold
//   - INSERT INTO analytics_probe_log (...) VALUES (...) -> append
//   - DELETE FROM analytics_snapshots WHERE source IN (...) AND date < $1
//   - SELECT ... FROM analytics_snapshots WHERE date >= $1 AND date <= $2
//   - SELECT ... FROM analytics_snapshots WHERE source = $1 AND per_video IS NOT NULL
//   - SELECT channel_id, ... FROM analytics_probe_log ORDER BY checked_at ASC
//   - SELECT to_regclass($1) AS reg                    -> fixture-controlled
//
// State for assertions: `tables` (Map table -> Map key -> row), `calls`,
// `created` (CREATE TABLE statements), `scriptsTable` (to_regclass result).
// ---------------------------------------------------------------------------

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}

// ISO Monday of the week containing dateStr (matches the store's SQL fold).
function isoMonday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const dow = d.getUTCDay(); // 0 = Sunday
  return addDays(dateStr, -((dow + 6) % 7));
}

function makeStubClient({ scriptsTable = null, scriptRows = [] } = {}) {
  const tables = new Map(); // table -> Map(key -> row)
  const probeRows = [];
  const calls = [];
  const created = [];

  const getStore = (table) => {
    if (!tables.has(table)) tables.set(table, new Map());
    return tables.get(table);
  };
  const snapshots = () => getStore('analytics_snapshots');

  function rowFromValues(cols, valuesTuple, params) {
    const row = {};
    cols.forEach((c, i) => {
      const v = valuesTuple[i] ?? '';
      row[c] = /^\$\d+$/.test(v) ? params[Number(v.slice(1)) - 1] : null;
    });
    return row;
  }

  function run(sqlText, params) {
    const sql = sqlText.replace(/\s+/g, ' ').trim();
    params = params || [];

    if (/^CREATE TABLE IF NOT EXISTS/i.test(sql)) {
      calls.push({ sql, params });
      created.push(sql);
      return [];
    }

    // Weekly fold: INSERT INTO analytics_snapshots (...) SELECT ... FROM analytics_snapshots ... GROUP BY
    if (/^INSERT INTO analytics_snapshots/i.test(sql) && /FROM analytics_snapshots/i.test(sql) && /GROUP BY/i.test(sql)) {
      calls.push({ sql, params });
      const cutoff = params[0];
      const groups = new Map(); // channel+week -> sum row
      for (const row of snapshots().values()) {
        if (!['analytics_api', 'data_api'].includes(row.source)) continue;
        if (!(row.date < cutoff)) continue;
        const week = isoMonday(row.date);
        const key = row.channel_id + '\u0000' + week;
        const g = groups.get(key) || { channel_id: row.channel_id, date: week, views: 0, watch_hours: 0, subs_delta: 0 };
        g.views += Number(row.views || 0);
        g.watch_hours += Number(row.watch_hours || 0);
        g.subs_delta += Number(row.subs_delta || 0);
        groups.set(key, g);
      }
      for (const g of groups.values()) {
        const key = g.channel_id + '\u0000' + g.date + '\u0000weekly_rollup';
        const prev = snapshots().get(key);
        const merged = prev
          ? {
              ...prev,
              views: Number(prev.views || 0) + g.views,
              watch_hours: Number(prev.watch_hours || 0) + g.watch_hours,
              subs_delta: Number(prev.subs_delta || 0) + g.subs_delta,
            }
          : { ...g, source: 'weekly_rollup', per_video: null };
        snapshots().set(key, merged);
      }
      return [];
    }

    // Plain keyed upsert: INSERT INTO <t> (...) VALUES (...) ON CONFLICT (cols) DO UPDATE
    const upsertMatch = sql.match(/^INSERT INTO (\w+) \(([^)]+)\) VALUES \(([^)]+)\) ON CONFLICT \(([^)]+)\) DO UPDATE/i);
    if (upsertMatch) {
      calls.push({ sql, params });
      const table = upsertMatch[1];
      const cols = upsertMatch[2].split(',').map((c) => c.trim());
      const valuesTuple = upsertMatch[3].split(',').map((v) => v.trim());
      const row = rowFromValues(cols, valuesTuple, params);
      const keyCols = upsertMatch[4].split(',').map((c) => c.trim());
      const key = keyCols.map((c) => String(row[c])).join('\u0000');
      const store = getStore(table);
      store.set(key, { ...(store.get(key) || {}), ...row });
      return [row];
    }

    // Probe append: INSERT INTO analytics_probe_log (...) VALUES (...)
    const probeMatch = sql.match(/^INSERT INTO analytics_probe_log \(([^)]+)\) VALUES \(([^)]+)\)/i);
    if (probeMatch) {
      calls.push({ sql, params });
      const cols = probeMatch[1].split(',').map((c) => c.trim());
      const valuesTuple = probeMatch[2].split(',').map((v) => v.trim());
      probeRows.push(rowFromValues(cols, valuesTuple, params));
      return [{ ...probeRows[probeRows.length - 1] }];
    }

    // DELETE FROM analytics_snapshots WHERE source IN (...) AND date < $1
    const delMatch = sql.match(/^DELETE FROM (\w+) WHERE source IN \('analytics_api', 'data_api'\) AND date < \$(\d+)$/i);
    if (delMatch) {
      calls.push({ sql, params });
      const store = getStore(delMatch[1]);
      const cutoff = params[Number(delMatch[2]) - 1];
      let deleted = 0;
      for (const [key, row] of [...store]) {
        if (['analytics_api', 'data_api'].includes(row.source) && row.date < cutoff) {
          store.delete(key);
          deleted++;
        }
      }
      return [{ deleted }];
    }

    // SELECT ... FROM analytics_snapshots WHERE date >= $1 AND date <= $2
    if (/^SELECT .* FROM analytics_snapshots WHERE date >= \$1 AND date <= \$2$/i.test(sql)) {
      calls.push({ sql, params });
      const [start, end] = params;
      return [...snapshots().values()].filter((r) => r.date >= start && r.date <= end);
    }

    // SELECT per_video FROM analytics_snapshots WHERE source = $1 AND per_video IS NOT NULL
    if (/^SELECT .* FROM analytics_snapshots WHERE source = \$1 AND per_video IS NOT NULL$/i.test(sql)) {
      calls.push({ sql, params });
      return [...snapshots().values()].filter((r) => r.source === params[0] && r.per_video != null);
    }

    // SELECT to_regclass($1) AS reg
    if (/^SELECT to_regclass\(\$1\) AS reg$/i.test(sql)) {
      calls.push({ sql, params });
      return [{ reg: scriptsTable }];
    }

    // SELECT ... FROM scripts WHERE video_id IS NOT NULL (S4 table fixture)
    if (/^SELECT .* FROM scripts WHERE video_id IS NOT NULL$/i.test(sql)) {
      calls.push({ sql, params });
      return scriptRows;
    }

    // SELECT ... FROM analytics_probe_log ORDER BY checked_at ASC
    if (/^SELECT .* FROM analytics_probe_log ORDER BY checked_at ASC$/i.test(sql)) {
      calls.push({ sql, params });
      return probeRows.map((r) => ({ ...r }));
    }

    throw new Error('stub client: unexpected SQL shape: ' + sql.slice(0, 120));
  }

  return {
    client: run,
    tables,
    calls,
    created,
    probeRows,
    snapshots,
    scriptsTable,
  };
}

function dailyRow(channelId, date, source, views, extra = {}) {
  return {
    channelId,
    date,
    source,
    views,
    watchHours: extra.watchHours ?? null,
    subsDelta: extra.subsDelta ?? null,
    perVideo: extra.perVideo ?? null,
  };
}

const TODAY = '2026-10-30';

// ---------------------------------------------------------------------------

test('trailingWindowDays returns D-1..D-N ascending in UTC across month boundaries', () => {
  // D-1..D-4 for 2026-11-01 reaches back into October
  assert.deepEqual(trailingWindowDays('2026-11-01', 4), ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']);
  assert.deepEqual(trailingWindowDays('2026-10-30', 4), ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29']);
  // single-day window is just yesterday
  assert.deepEqual(trailingWindowDays('2026-03-01', 1), ['2026-02-28']);
});

test('ensureAnalyticsSchema creates the snapshots + probe tables and is safe to call twice', async () => {
  const fx = makeStubClient();
  const store = makeAnalyticsStore(fx.client);
  const r1 = await store.ensureAnalyticsSchema();
  const r2 = await store.ensureAnalyticsSchema();
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
  const creates = [...new Set(fx.created.filter((c) => /CREATE TABLE IF NOT EXISTS/i.test(c)))];
  assert.equal(creates.length, 2, 'two distinct CREATE TABLE statements recorded');
  assert.ok(creates.some((c) => c.includes('analytics_snapshots')));
  assert.ok(creates.some((c) => c.includes('analytics_probe_log')));
  // UNIQUE(channel_id, date, source) is pinned in the emitted DDL
  const snapDdl = creates.find((c) => c.includes('analytics_snapshots'));
  assert.match(snapDdl, /UNIQUE \(channel_id, date, source\)/);
});

test('upsertWindow re-collecting the same trailing window updates rows in place, never duplicates (AC-P4-24)', async () => {
  const fx = makeStubClient();
  const store = makeAnalyticsStore(fx.client);
  await store.ensureAnalyticsSchema();

  const win = trailingWindowDays(TODAY, 4);
  const first = win.map((d) => dailyRow('quotequarry', d, 'analytics_api', 10));
  const r1 = await store.upsertWindow(first);
  assert.equal(r1.ok, true);
  assert.equal(r1.upserted, 4);
  assert.equal(fx.snapshots().size, 4);

  // nightly re-run: same window, restated numbers
  const second = win.map((d) => dailyRow('quotequarry', d, 'analytics_api', 25, { subsDelta: 1 }));
  const r2 = await store.upsertWindow(second);
  assert.equal(r2.ok, true);
  assert.equal(r2.upserted, 4);
  assert.equal(fx.snapshots().size, 4, 're-run must not add rows');
  for (const [key, row] of fx.snapshots()) {
    assert.equal(row.views, 25, `restated value overwrote in place for ${key}`);
    assert.equal(row.subs_delta, 1);
  }
});

test('upsertWindow rejects rows missing channel/date/source or with an unknown source', async () => {
  const fx = makeStubClient();
  const store = makeAnalyticsStore(fx.client);
  await store.ensureAnalyticsSchema();

  assert.equal((await store.upsertWindow([{ date: '2026-10-29', source: 'analytics_api', views: 1 }])).ok, false, 'missing channelId');
  assert.equal((await store.upsertWindow([dailyRow('quotequarry', 'not-a-date', 'analytics_api', 1)])).ok, false, 'bad date');
  assert.equal((await store.upsertWindow([dailyRow('quotequarry', '2026-10-29', 'magic_source', 1)])).ok, false, 'unknown source');
  assert.equal(fx.snapshots().size, 0, 'nothing written for invalid input');

  // sources are exactly the two named in D19
  assert.equal((await store.upsertWindow([dailyRow('quotequarry', '2026-10-29', 'data_api', 1)])).ok, true);
  assert.equal((await store.upsertWindow([dailyRow('quotequarry', '2026-10-29', 'analytics_api', 1)])).ok, true);
});

test('analytics_api wins the overlapping date for per-day metrics while data_api keeps per-video counters (AC-P4-24)', async () => {
  const fx = makeStubClient();
  const store = makeAnalyticsStore(fx.client);
  await store.ensureAnalyticsSchema();

  // both sources report for the same channel+date (inside the ranked window,
  // which ends at the D-2 settle boundary) — a data_api row holds the public
  // per-video counters, the analytics_api row holds the per-day truth
  await store.upsertWindow([
    dailyRow('quotequarry', '2026-10-25', 'data_api', 100, { perVideo: { vid1: { views: 60 }, vid2: { views: 40 } } }),
  ]);
  await store.upsertWindow([dailyRow('quotequarry', '2026-10-25', 'analytics_api', 70, { watchHours: 3.5, subsDelta: 2 })]);

  const board = await store.leaderboardWindow(7, { today: new Date(TODAY + 'T12:00:00Z') });
  assert.equal(board.ok, true);
  const qq = board.rows.find((r) => r.channelId === 'quotequarry');
  assert.equal(qq.views, 70, 'per-day metrics resolve to the analytics_api row — never summed across sources');
  assert.equal(qq.watchHours, 3.5);
  assert.equal(qq.subsDelta, 2);

  // the data_api row still exists (it feeds per-video counters, it is not deleted)
  const dataRows = [...fx.snapshots().values()].filter((r) => r.source === 'data_api');
  assert.equal(dataRows.length, 1);
  assert.deepEqual(JSON.parse(dataRows[0].per_video), { vid1: { views: 60 }, vid2: { views: 40 } });
});

test('bounded per_video: boundPerVideo keeps only the top-N videos by views and never exceeds the cap (D19/D25)', () => {
  assert.equal(PER_VIDEO_LIMIT, 50, 'bounded window pinned at 50');
  // 60 videos with distinct views -> exactly the top 50 survive
  const perVideo = {};
  for (let i = 0; i < 60; i++) perVideo['vid' + String(i).padStart(2, '0')] = { views: i + 1 };
  const out = boundPerVideo(perVideo);
  assert.equal(Object.keys(out).length, PER_VIDEO_LIMIT);
  // highest-viewed survivor present, lowest-viewed dropped
  assert.ok(out.vid59, 'top video kept');
  assert.equal(out.vid59.views, 60);
  assert.ok(!out.vid00 && !out.vid09, 'lowest 10 dropped');

  // deterministic tie-break: equal views -> lexicographically smaller videoId wins
  const tied = boundPerVideo({ b: { views: 5 }, a: { views: 5 }, c: { views: 9 } }, 2);
  assert.deepEqual(Object.keys(tied).sort(), ['a', 'c']);

  // small input passes through unchanged; null/undefined input yields an empty object
  assert.deepEqual(boundPerVideo({ x: { views: 1 } }), { x: { views: 1 } });
  assert.deepEqual(boundPerVideo(null), {});
});

test('rollup folds daily rows older than 90 days into weekly rows, deletes the raw rows, and is idempotent (D25/AC-P4-33)', async () => {
  const fx = makeStubClient();
  const store = makeAnalyticsStore(fx.client);
  await store.ensureAnalyticsSchema();

  // two days inside the same ISO week (Mon 2026-07-20 + Wed 2026-07-22), one
  // other old day, and one young day that must survive untouched
  await store.upsertWindow([
    dailyRow('quotequarry', '2026-07-20', 'analytics_api', 100, { watchHours: 2, subsDelta: 1 }),
    dailyRow('quotequarry', '2026-07-22', 'analytics_api', 50, { watchHours: 1, subsDelta: 2 }),
    dailyRow('quotequarry', '2026-07-25', 'data_api', 7),
    dailyRow('quotequarry', '2026-10-20', 'analytics_api', 999),
  ]);

  const r = await store.rollup({ today: new Date(TODAY + 'T12:00:00Z') });
  assert.equal(r.ok, true);

  const rows = [...fx.snapshots().values()];
  const weekly = rows.filter((r) => r.source === 'weekly_rollup');
  assert.equal(weekly.length, 1, 'the three old days fold into ONE week (Mon 2026-07-20)');
  assert.equal(weekly[0].date, '2026-07-20');
  assert.equal(weekly[0].channel_id, 'quotequarry');
  assert.equal(Number(weekly[0].views), 157, '100 + 50 + 7 summed');
  assert.equal(Number(weekly[0].subs_delta), 3);
  assert.ok(
    !rows.some((r) => ['analytics_api', 'data_api'].includes(r.source) && ['2026-07-20', '2026-07-22', '2026-07-25'].includes(r.date)),
    'rolled raw daily rows deleted (the weekly_rollup row legitimately lives at the week start)',
  );

  // young daily row (>90d retention boundary NOT reached) survives untouched
  const young = rows.find((r) => r.date === '2026-10-20');
  assert.ok(young, 'recent daily row kept');
  assert.equal(young.source, 'analytics_api');
  assert.equal(young.views, 999);

  // idempotent: a second rollup must not double the weekly sums
  await store.rollup({ today: new Date(TODAY + 'T12:00:00Z') });
  const weekly2 = [...fx.snapshots().values()].filter((r) => r.source === 'weekly_rollup');
  assert.equal(weekly2.length, 1);
  assert.equal(Number(weekly2[0].views), 157, 'no double counting on re-run');
});

test('leaderboardWindow ranks channels over the settle window ending D-2 with trend vs the previous window (D21/AC-P4-25/26)', async () => {
  const fx = makeStubClient();
  const store = makeAnalyticsStore(fx.client);
  await store.ensureAnalyticsSchema();

  // today = 2026-10-30 -> settle boundary dataThrough = 2026-10-28 (SETTLE_DAYS=2)
  assert.equal(SETTLE_DAYS, 2);
  const win7 = [];
  for (let i = 15; i >= 0; i--) {
    const d = addDays(TODAY, -i);
    // 7-day ranked window [10-22..10-28]; previous window [10-15..10-21]
    const inRanked = d >= '2026-10-22' && d <= '2026-10-28';
    const inPrev = d >= '2026-10-15' && d <= '2026-10-21';
    if (inRanked || inPrev) {
      win7.push(dailyRow('alpha', d, 'analytics_api', inRanked ? 10 : 5)); // 70 vs 35 -> +100%
      win7.push(dailyRow('beta', d, 'analytics_api', inRanked ? 100 : 200)); // 700 vs 1400 -> -50%
    }
  }
  // an unsettled row INSIDE D-2..D-0 must be excluded from the ranking window
  win7.push(dailyRow('alpha', '2026-10-30', 'analytics_api', 50000));
  await store.upsertWindow(win7);

  const board = await store.leaderboardWindow(7, { today: new Date(TODAY + 'T12:00:00Z') });
  assert.equal(board.ok, true);
  assert.equal(board.dataThrough, '2026-10-28', 'ranking ends at the 48h settle boundary, never today');
  assert.equal(board.rows.length, 2);
  assert.equal(board.rows[0].channelId, 'beta', 'ranked by window views desc');
  assert.equal(board.rows[0].views, 700);
  assert.equal(board.rows[0].prevViews, 1400);
  assert.equal(board.rows[0].trendPct, -50);
  assert.equal(board.rows[1].channelId, 'alpha');
  assert.equal(board.rows[1].views, 70);
  assert.equal(board.rows[1].prevViews, 35);
  assert.equal(board.rows[1].trendPct, 100);

  // zero-snapshot run: clean empty leaderboard with a null stamp (D21 empty state)
  const fx2 = makeStubClient();
  const store2 = makeAnalyticsStore(fx2.client);
  await store2.ensureAnalyticsSchema();
  const empty = await store2.leaderboardWindow(7, { today: new Date(TODAY + 'T12:00:00Z') });
  assert.equal(empty.ok, true);
  assert.deepEqual(empty.rows, []);
  assert.equal(empty.dataThrough, '2026-10-28');
});

test('winRates returns an empty result set cleanly while the S4 scripts table does not exist (L6/OQ-7)', async () => {
  const fx = makeStubClient({ scriptsTable: null });
  const store = makeAnalyticsStore(fx.client);
  await store.ensureAnalyticsSchema();

  const wr = await store.winRates();
  assert.equal(wr.ok, true, 'the empty state is a SUCCESS result, not an error');
  assert.equal(wr.available, false);
  assert.deepEqual(wr.templates, []);
  assert.deepEqual(wr.topics, []);
  // studio renders this as "no data yet — fills as Phase 4 S4 lands"
});

test('recordProbe + latestProbes expose each channel’s latest scope-probe outcome (D19 re-auth checklist)', async () => {
  const fx = makeStubClient();
  const store = makeAnalyticsStore(fx.client);
  await store.ensureAnalyticsSchema();

  await store.recordProbe({ channelId: 'alpha', ok: false, hasScope: false, error: 'analytics 403: insufficientPermissions', checkedAt: '2026-10-29T05:17:00Z' });
  await store.recordProbe({ channelId: 'alpha', ok: true, hasScope: true, checkedAt: '2026-10-30T05:17:00Z' });
  await store.recordProbe({ channelId: 'beta', ok: false, hasScope: false, error: 'analytics 403: forbidden', checkedAt: '2026-10-30T05:17:00Z' });

  const r = await store.latestProbes();
  assert.equal(r.ok, true);
  assert.equal(r.probes.length, 2, 'one row per channel — the LATEST probe');
  const alpha = r.probes.find((p) => p.channel_id === 'alpha');
  const beta = r.probes.find((p) => p.channel_id === 'beta');
  assert.equal(alpha.ok, true, 'newest probe wins, not the first');
  assert.equal(alpha.has_scope, true);
  assert.equal(beta.ok, false);
  assert.equal(beta.has_scope, false);
  assert.match(beta.error, /403/);
});
