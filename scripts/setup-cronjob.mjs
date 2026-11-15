// External heartbeat for channel-autopilot on cron-job.org (owner 2026-11-15,
// audit 2026-11-13 #10). GitHub's own 30-min cron fires 3-5 of 48 ticks/day;
// cron-job.org POSTs a workflow_dispatch with inputs.heartbeat=1 every :05/:35
// UTC instead (the discover step slot-gates it exactly like a schedule tick).
// GitHub's cron stays as a backup.
//
// Secrets come from the repo-root .env (git-ignored) and are never printed:
//   CRONJOB_API_KEY         cron-job.org Console > Settings > API
//   CRON_GH_DISPATCH_TOKEN  fine-grained PAT: this repo only, Actions read/write
//
// Usage:
//   node scripts/setup-cronjob.mjs --check-token   verify the PAT's reach (dispatch OK, contents/secrets denied)
//   node scripts/setup-cronjob.mjs                 create or update the job (idempotent, matched by title)
//   node scripts/setup-cronjob.mjs --history       last executions of the job
// Spec + QA: docs/qa/external-heartbeat-qa.md.
import { pathToFileURL } from 'node:url';
import { loadEnv } from '../lib/env.mjs';

export const HEARTBEAT_TITLE = 'Quarry autopilot heartbeat';
const REPO = 'muzzamilhassan/automation';
export const DISPATCH_URL = `https://api.github.com/repos/${REPO}/actions/workflows/channel-autopilot.yml/dispatches`;
const CRONJOB_API = 'https://api.cron-job.org';

// Pure: the cron-job.org job object (unit-tested). requestMethod 1 = POST.
export function buildHeartbeatJob(ghToken) {
  if (!ghToken) throw new Error('missing GitHub dispatch token (CRON_GH_DISPATCH_TOKEN)');
  return {
    url: DISPATCH_URL,
    enabled: true,
    title: HEARTBEAT_TITLE,
    saveResponses: true,
    requestMethod: 1,
    schedule: { timezone: 'UTC', expiresAt: 0, hours: [-1], mdays: [-1], minutes: [5, 35], months: [-1], wdays: [-1] },
    extendedData: {
      headers: {
        Authorization: `Bearer ${ghToken}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      // NEVER blank: a blank dispatch selects every channel on every tick.
      body: JSON.stringify({ ref: 'main', inputs: { heartbeat: '1' } }),
    },
    notification: { onFailure: true, onSuccess: false, onDisable: true },
  };
}

export function redactJob(job) {
  const h = { ...(job?.extendedData?.headers || {}) };
  if (h.Authorization) h.Authorization = 'Bearer ***';
  return { ...job, extendedData: { ...(job?.extendedData || {}), headers: h } };
}

async function cronApi(method, path, body) {
  const res = await fetch(`${CRONJOB_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.CRONJOB_API_KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`cron-job.org ${method} ${path} -> HTTP ${res.status} ${text.slice(0, 160)}`);
  return text ? JSON.parse(text) : {};
}

async function gh(method, path, body) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.CRON_GH_DISPATCH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  return res.status;
}

async function checkToken() {
  const checks = [
    ['heartbeat dispatch (must be 204)', await gh('POST', `/repos/${REPO}/actions/workflows/channel-autopilot.yml/dispatches`, { ref: 'main', inputs: { heartbeat: '1' } }), (s) => s === 204],
    ['read code contents (must be denied)', await gh('GET', `/repos/${REPO}/contents/package.json`), (s) => s === 403 || s === 404],
    // read-only probes only — a write probe would have side effects if the token were too broad
    ['list Actions secrets (must be denied)', await gh('GET', `/repos/${REPO}/actions/secrets`), (s) => s === 403 || s === 404],
  ];
  let ok = true;
  for (const [what, status, pass] of checks) {
    const good = pass(status);
    ok &&= good;
    console.log(`${good ? '✓' : '✗'} ${what}: HTTP ${status}`);
  }
  return ok;
}

async function upsertJob() {
  const job = buildHeartbeatJob(process.env.CRON_GH_DISPATCH_TOKEN);
  const { jobs = [] } = await cronApi('GET', '/jobs');
  const existing = jobs.filter((j) => j.title === HEARTBEAT_TITLE);
  if (existing.length > 1) throw new Error(`${existing.length} jobs titled "${HEARTBEAT_TITLE}" — delete the extras in the Console first`);
  let jobId;
  if (existing.length) {
    jobId = existing[0].jobId;
    await cronApi('PATCH', `/jobs/${jobId}`, { job });
    console.log(`updated job ${jobId}`);
  } else {
    ({ jobId } = await cronApi('PUT', '/jobs', { job }));
    console.log(`created job ${jobId}`);
  }
  const { jobDetails } = await cronApi('GET', `/jobs/${jobId}`);
  console.log(JSON.stringify(redactJob(jobDetails), null, 2));
  return jobId;
}

async function history() {
  const { jobs = [] } = await cronApi('GET', '/jobs');
  const j = jobs.find((x) => x.title === HEARTBEAT_TITLE);
  if (!j) { console.log('no heartbeat job yet'); return; }
  const { history: h = [], predictions = [] } = await cronApi('GET', `/jobs/${j.jobId}/history`);
  console.log(`job ${j.jobId} enabled=${j.enabled} lastStatus=${j.lastStatus} lastDuration=${j.lastDuration}ms`);
  for (const e of h.slice(0, 10)) console.log(`  ${new Date(e.date * 1000).toISOString()}  http=${e.httpStatus}  status=${e.status}  ${e.duration}ms`);
  console.log(`  next: ${predictions.slice(0, 3).map((t) => new Date(t * 1000).toISOString()).join(', ')}`);
}

if (Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadEnv();
  for (const k of ['CRONJOB_API_KEY', 'CRON_GH_DISPATCH_TOKEN']) {
    if (!process.env[k]) { console.error(`${k} missing from .env`); process.exit(1); }
  }
  try {
    if (process.argv.includes('--check-token')) process.exit((await checkToken()) ? 0 : 1);
    else if (process.argv.includes('--history')) await history();
    else await upsertJob();
  } catch (e) {
    console.error(String(e.message || e).replaceAll(process.env.CRON_GH_DISPATCH_TOKEN, '***').replaceAll(process.env.CRONJOB_API_KEY, '***'));
    process.exit(1);
  }
}
