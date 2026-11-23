// Creator City — Station drawer (research §5 item 7, 2026-11-23): GET the
// last 5 results of ONE station on ONE channel — its `station:<key>`
// job_steps rows, newest first. Read-only.
//
//   ?channel=<slug>&station=<topic|script|approval|voice|render|thumbnail|upload>
//
// Answer: { ok, channel, station, rows: [{ jobId, state, startedAt, durationSec, error, note }] }
// (shaping: lib/station-settings.mjs historyRows). Bad input → 400; DB down → 503.
import { getUser } from '@/lib/route-auth';
import { db, dbReady } from '@/lib/db.mjs';
import { adaptPostgres } from '@/lib/provider-routing';
import { makeJobsRead } from '@/lib/jobs-read.mjs';
import { parseHistoryQuery, historyRows, HISTORY_LIMIT } from '@/lib/station-settings.mjs';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const user = await getUser(req).catch(() => null);
  if (!user) return Response.json({ ok: false, error: 'not signed in' }, { status: 401 });
  // the engine room: owner + staff only (clients never see fleet-wide runs)
  if (!['owner', 'staff'].includes(user.role)) {
    return Response.json({ ok: false, error: 'your role does not allow this' }, { status: 403 });
  }

  const params = new URL(req.url).searchParams;
  const query = parseHistoryQuery(params);
  if (!query.ok) return Response.json({ ok: false, reason: query.reason }, { status: 400 });
  if (!dbReady || !db) return Response.json({ ok: false, error: 'history_unavailable' }, { status: 503 });

  let rows;
  try {
    rows = await makeJobsRead(adaptPostgres(db)).loadStationHistory({ channel: query.channel, station: query.station, limit: HISTORY_LIMIT });
  } catch {
    return Response.json({ ok: false, error: 'history_unavailable' }, { status: 503 });
  }
  return Response.json({ ok: true, channel: query.channel, station: query.station, rows: historyRows(rows, { now: Date.now() }) });
}
