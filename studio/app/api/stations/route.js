// Creator City Phase 1 (FEEDBACK item O): GET which of the 7 production
// stations (studio/lib/stations.mjs) each real channel's latest run is at.
// Read-only. Sources: the latest Neon job per channel started in the last
// 24h (+ its station:* job_steps), today's scripts row (approval) and today's
// upload_intents row (upload) — rules in studio/lib/station-read.mjs.
// Honesty: a DB that is missing or throws answers 503 — never an "all quiet"
// strip that nobody measured.
//
//   ?tz=<IANA zone>  optional; clock times in summaries ("Uploaded 09:04").
//                    Default UTC — the pipeline's day basis.
import { brands } from '@/lib/data.mjs';
import { getUser } from '@/lib/route-auth';
import { db, dbReady } from '@/lib/db.mjs';
import { adaptPostgres } from '@/lib/provider-routing';
import { deriveBrandList } from '@/lib/brand-list.mjs';
import { makeJobsRead } from '@/lib/jobs-read.mjs';
import { stationsPayload, safeTimeZone } from '@/lib/station-read.mjs';

export const dynamic = 'force-dynamic';

// slug of every real channel (active legacy brands + registry) — the same
// rule /api/runs and /api/brands apply.
async function knownChannels() {
  let registry = [];
  try {
    const { registryChannels } = await import('@/lib/channels-registry');
    registry = await registryChannels();
  } catch { }
  try {
    return deriveBrandList(brands() || {}, registry);
  } catch {
    return [];
  }
}

export async function GET(req) {
  const user = await getUser(req).catch(() => null);
  if (!user) return Response.json({ ok: false, error: 'not signed in' }, { status: 401 });
  // the engine room: owner + staff only (clients never see fleet-wide runs)
  if (!['owner', 'staff'].includes(user.role)) {
    return Response.json({ ok: false, error: 'your role does not allow this' }, { status: 403 });
  }
  if (!dbReady || !db) return Response.json({ ok: false, error: 'stations_unavailable' }, { status: 503 });

  const timeZone = safeTimeZone(new URL(req.url).searchParams.get('tz'));
  const now = new Date();
  let today;
  try {
    today = await makeJobsRead(adaptPostgres(db)).loadToday({ now });
  } catch {
    return Response.json({ ok: false, error: 'stations_unavailable' }, { status: 503 });
  }

  const channels = await knownChannels();
  return Response.json({
    ok: true, fetchedAt: now.toISOString(),
    channels: stationsPayload({ channels, today, timeZone }),
  });
}
