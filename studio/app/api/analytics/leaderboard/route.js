// #106 Phase 4 S5 — snapshot-backed leaderboard + win rates + re-auth list.
//
// Reads ONLY analytics_snapshots / analytics_probe_log (zero live YouTube
// calls — AC-P4-26); the live 28-day panel stays on /api/analytics unchanged
// (AC-P4-28). Every response carries `dataThrough` (the settle boundary,
// D-2) so the UI can stamp "data through <date>" and never present the
// trailing 48–72h as final (D21/AC-P4-25).
//
// Renders with ZERO snapshots: when the DB is unreachable or the tables are
// empty the route answers available:false with empty arrays and the page
// shows its empty states (house rule — a panel never blank-pages).
import { getUser } from '@/lib/route-auth';
import { slugsForUser } from '@/lib/access';
import { getAnalyticsStore } from '@/lib/analytics-store.mjs';

export const dynamic = 'force-dynamic';

const WINDOWS = [7, 28, 90];

// one Warning-shaped entry per channel whose latest probe failed
function toReAuth(probes, owned) {
  return (probes || [])
    .filter((p) => p.ok === false || p.has_scope === false)
    .filter((p) => !owned || owned.includes(p.channel_id))
    .map((p) => ({
      slug: p.channel_id,
      hasScope: p.has_scope === true,
      checkedAt: p.checked_at || null,
      error: p.error || null,
    }));
}

export async function GET(req) {
  // 10-08 P2 CLIENT ROLE: same scope resolution as the live panel — clients
  // only ever see their own channels' numbers; owner/staff see everything.
  const user = await getUser(req).catch(() => null);
  const owned = user ? await slugsForUser(user).catch(() => null) : null;

  const daysParam = Number(new URL(req.url).searchParams.get('days'));
  const days = WINDOWS.includes(daysParam) ? daysParam : 28;

  let store;
  try {
    store = await getAnalyticsStore();
  } catch {
    return Response.json({ available: false, days, dataThrough: null, rows: [], winRates: { available: false, templates: [], topics: [] }, reAuth: [] });
  }

  const board = await store.leaderboardWindow(days).catch(() => ({ ok: false, dataThrough: null, rows: [] }));
  const win = await store.winRates().catch(() => null);
  const probes = await store.latestProbes().catch(() => null);

  let rows = board.rows || [];
  if (owned) rows = rows.filter((r) => owned.includes(r.channelId));

  return Response.json({
    available: board.ok !== false,
    days,
    dataThrough: board.dataThrough || null,
    rows,
    winRates: win || { available: false, templates: [], topics: [] },
    reAuth: toReAuth(probes?.probes, owned),
  });
}
