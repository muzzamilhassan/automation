// Creator City Phase 1 (FEEDBACK item O): GET one run's recorded steps for
// the Runs drawer — every Neon job_steps row (station:* and the coarse lane
// steps) with friendly labels, plus the 7-station strip and its summary.
// Read-only.
//
//   ?runId=<GitHub run id, digits>  — matched on jobs.meta->>'runId'. One
//                                      scheduled autopilot run covers EVERY
//                                      channel (matrix, shared run id), so
//                                      without &channel it may return several.
//   ?jobId=<uuid>                   — the job row directly
//   &channel=<slug>                 — only that channel's job of the run
//   &startedAt=<ISO>                — with channel: fallback for runs whose job
//                                      has no runId (nearest unclaimed job ±10 min)
//   &tz=<IANA zone>                 — optional clock zone for the summary
//
// Answers (station-read.mjs stepsPayload), all 200:
//   one job   → { ok, job, steps, stations, summary }
//   several   → { ok, jobs: [{ job, steps, stations, summary }, …] }
//   none      → { ok:false, reason:'no_job' } (runs older than job recording)
// Bad input → 400; DB down → 503.
import { getUser } from '@/lib/route-auth';
import { db, dbReady } from '@/lib/db.mjs';
import { adaptPostgres } from '@/lib/provider-routing';
import { makeJobsRead } from '@/lib/jobs-read.mjs';
import { parseStepsQuery, safeTimeZone, stepsPayload } from '@/lib/station-read.mjs';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const user = await getUser(req).catch(() => null);
  if (!user) return Response.json({ ok: false, error: 'not signed in' }, { status: 401 });
  // the engine room: owner + staff only (clients never see fleet-wide runs)
  if (!['owner', 'staff'].includes(user.role)) {
    return Response.json({ ok: false, error: 'your role does not allow this' }, { status: 403 });
  }

  const params = new URL(req.url).searchParams;
  const query = parseStepsQuery(params);
  if (!query.ok) return Response.json({ ok: false, reason: query.reason }, { status: 400 });
  if (!dbReady || !db) return Response.json({ ok: false, error: 'steps_unavailable' }, { status: 503 });

  let records;
  try {
    records = await makeJobsRead(adaptPostgres(db)).loadRuns(query);
  } catch {
    return Response.json({ ok: false, error: 'steps_unavailable' }, { status: 503 });
  }
  return Response.json(stepsPayload(records, { timeZone: safeTimeZone(params.get('tz')), now: Date.now() }));
}
