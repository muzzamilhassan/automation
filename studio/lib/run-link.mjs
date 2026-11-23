// Creator City item 6 follow-up — the /runs deep link, both ends in one place.
//   /runs?run=<GitHub run id>[&channel=<slug>]  or  /runs?job=<job uuid>[&channel=]
// opens that run's step drawer on load (studio/app/runs/page.js). The Inbox
// questions' "Open run" buttons build it with runHref. Validation is THE
// /api/runs/steps rule (station-read parseStepsQuery) so the builder never
// emits a link the page (or the API) would refuse. Pure — no I/O.
import { parseStepsQuery } from './station-read.mjs';

function check({ runId = null, jobId = null, channel = null } = {}) {
  const p = new URLSearchParams();
  if (runId != null && runId !== '') p.set('runId', String(runId));
  else if (jobId != null && jobId !== '') p.set('jobId', String(jobId));
  if (channel) p.set('channel', String(channel));
  const q = parseStepsQuery(p);
  if (q.ok) return q;
  if (channel) return check({ runId, jobId }); // a bad slug never costs the link
  return null;
}

/** '/runs?run=…&channel=…' | '/runs?job=…&channel=…' | '/runs' (nothing usable known). */
export function runHref({ runId = null, jobId = null, channel = null } = {}) {
  const q = check({ runId, jobId, channel });
  if (!q) return '/runs';
  const p = new URLSearchParams();
  if (q.runId) p.set('run', q.runId);
  else p.set('job', q.jobId);
  if (q.channel) p.set('channel', q.channel);
  return `/runs?${p.toString()}`;
}

/** location.search → { runId, jobId, channel } for the drawer, or null (absent / invalid). */
export function runTargetFromSearch(search) {
  if (typeof search !== 'string' || !search) return null;
  const s = new URLSearchParams(search);
  const p = new URLSearchParams();
  for (const [from, to] of [['run', 'runId'], ['job', 'jobId'], ['channel', 'channel']]) {
    const v = s.get(from);
    if (v) p.set(to, v);
  }
  const q = parseStepsQuery(p);
  if (!q.ok) return null;
  return { runId: q.runId, jobId: q.runId ? null : q.jobId, channel: q.channel };
}
