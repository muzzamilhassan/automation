// Creator City Phase 1 (FEEDBACK item O, 2026-11-23): the PURE reader that
// turns one channel's latest job (+ its job_steps, + today's scripts and
// upload_intents rows) into the 7-station strip and one plain-English line.
// No I/O — the Neon reads live in jobs-read.mjs; the routes only wire.
//
// Rules (the station vocabulary itself is stations.mjs):
//   - `station:<key>` job_steps rows map through stateFromStepStatus; a
//     skipped step whose error starts `held:` is the review hold → needs_you.
//   - today's script row (this job's, or the resumed parent's) drives the
//     approval station; today's upload intent drives the upload station.
//   - a station with no row: job running → not_yet; job finished and SOME
//     station row exists → not_yet (never reached); job finished and NO
//     station row at all → unknown (run predates step tracking).
//   - each job starts clean: a script/intent that belongs to an OLDER job
//     never paints the strip (belongsToJob).
import { STATIONS, stationFromStepName, stateFromStepStatus, emptyStrip } from './stations.mjs';
import { clock } from './runs-view.mjs';

const LABEL = Object.fromEntries(STATIONS.map((s) => [s.key, s.label]));

// Friendly names for the coarse (pre-station) job_steps vocabulary
// (lib/job-store.mjs STEP_NAMES). Unknown names fall back to the raw name.
export const STEP_LABELS = Object.freeze({
  preflight: 'Checks',
  research: 'Research',
  script: 'Script',
  tts: 'Voice',
  render: 'Render',
  post: 'Daily video',
  clips: 'Clips',
  'brain-embed': 'Memory',
  verify: 'Check upload',
  fb: 'Facebook post',
  poster: 'Cross-post',
  episode: 'Long video',
  staging: 'TikTok staging',
  review: 'Review hold',
});

const NOT_TRACKED = 'Not tracked — run is older than step tracking';
const NOT_RECORDED = 'Steps not recorded for this run';
// Station recording shipped 2026-11-23 (the pipeline also stamps meta.runId
// from then on). A job with neither marker is genuinely older; a NEWER job
// with no station row means its recording failed — say so, never "old".
const TRACKING_SINCE_MS = Date.parse('2026-11-23T00:00:00.000Z');
const ERROR_MAX = 140;

function toMs(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const t = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/** Date | ISO | epoch ms → ISO string; null when absent/invalid (postgres.js hands back Dates). */
export function toIso(v) {
  const t = toMs(v);
  return t == null ? null : new Date(t).toISOString();
}

/** jobs.meta.runId (the GitHub run id the pipeline records) as a string, or null. */
export function runIdOf(job) {
  const v = job?.meta?.runId;
  return v == null || v === '' ? null : String(v);
}

/** A caller-supplied IANA zone if Intl accepts it, else 'UTC' (the pipeline's day basis). */
export function safeTimeZone(raw) {
  if (typeof raw !== 'string' || !raw || raw.length > 64) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: raw });
    return raw;
  } catch {
    return 'UTC';
  }
}

/** First non-empty line of an error, trimmed and capped; null when empty. */
export function shortError(err, max = ERROR_MAX) {
  if (err == null) return null;
  const line = String(err).split(/\r?\n/).map((l) => l.trim()).find(Boolean);
  if (!line) return null;
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function isHeld(row) {
  return row?.status === 'skipped' && typeof row.error === 'string' && row.error.startsWith('held:');
}

function isAuto(row) {
  return row?.status === 'skipped' && typeof row.error === 'string' && row.error.startsWith('auto:');
}

/** One job_steps row → display state (skipped + `held:` = the review hold). */
export function stepState(row) {
  if (isHeld(row)) return 'needs_you';
  return stateFromStepStatus(row?.status);
}

/** Did this job run before step tracking existed (no runId, or started before it shipped)? */
function predatesTracking(job) {
  const started = toMs(job?.started_at);
  return !runIdOf(job) || (started != null && started < TRACKING_SINCE_MS);
}

function isFinished(job) {
  return job?.status !== 'running';
}

/**
 * Does a scripts / upload_intents row belong to this job? Linked rows match
 * the job (or the parent a resume run continues); unlinked rows count only
 * if created at/after the job started. Anything else is an older job's.
 */
export function belongsToJob(row, job) {
  if (!row || !job) return false;
  if (row.job_id) return row.job_id === job.id || (!!job.resumed_from_job_id && row.job_id === job.resumed_from_job_id);
  const created = toMs(row.created_at);
  const started = toMs(job.started_at);
  return created != null && started != null && created >= started;
}

function rowTime(row) {
  return toMs(row.updated_at) ?? toMs(row.created_at) ?? 0;
}

/** The row that speaks for this job: its own first, then the parent's, then unlinked; newest wins. */
export function pickForJob(rows, job) {
  const mine = (rows || []).filter((r) => belongsToJob(r, job));
  if (!mine.length) return null;
  const rank = (r) => (r.job_id === job.id ? 0 : r.job_id ? 1 : 2);
  mine.sort((a, b) => rank(a) - rank(b) || rowTime(b) - rowTime(a));
  return mine[0];
}

function rowToStation(key, row) {
  const state = stepState(row);
  let detail = null;
  if (key === 'approval' && isHeld(row)) detail = 'Waiting for your OK';
  else if (key === 'approval' && isAuto(row)) detail = 'No approval needed';
  else if (state === 'failed' || state === 'skipped') detail = shortError(row.error);
  const at = state === 'running' ? toIso(row.started_at) : toIso(row.finished_at) ?? toIso(row.started_at);
  return { key, state, at, detail };
}

function scriptToApproval(script) {
  switch (script.status) {
    case 'awaiting_review':
      return { state: 'needs_you', at: toIso(script.created_at), detail: 'Waiting for your OK' };
    case 'approved':
    case 'consumed':
      return { state: 'done', at: toIso(script.approval_at) ?? toIso(script.updated_at), detail: 'Approved' };
    case 'rejected':
      return { state: 'failed', at: toIso(script.rejected_at) ?? toIso(script.updated_at), detail: 'You rejected it' };
    default:
      return null; // draft: nothing to say yet
  }
}

function intentToUpload(intent) {
  const at = toIso(intent.updated_at) ?? toIso(intent.created_at);
  switch (intent.status) {
    case 'uploaded':
      return { state: 'done', at, detail: intent.video_id || null };
    case 'initiated':
    case 'uploading':
      return { state: 'running', at, detail: 'Uploading' };
    case 'failed':
    case 'abandoned':
      return { state: 'failed', at, detail: shortError(intent.fail_reason) || 'Upload failed' };
    default:
      return null; // pending: nothing to say yet
  }
}

function summarize(job, strip, timeZone) {
  const failed = strip.find((s) => s.state === 'failed');
  if (failed) return failed.detail ? `Failed at ${LABEL[failed.key]}: ${failed.detail}` : `Failed at ${LABEL[failed.key]}`;
  if (strip.some((s) => s.state === 'needs_you')) return 'Waiting for your OK on the script';
  const running = strip.find((s) => s.state === 'running');
  if (running) return `${LABEL[running.key]} is running`;
  const upload = strip.find((s) => s.key === 'upload');
  if (upload.state === 'done') return upload.at ? `Uploaded ${clock(upload.at, timeZone)}` : 'Uploaded';
  if (!isFinished(job)) return 'Run in progress';
  const approval = strip.find((s) => s.key === 'approval');
  if (job.status === 'held' && approval.state === 'done') return 'Approved — waiting for the video build';
  const jobErr = shortError(job.error);
  const legacy = strip.every((s) => s.state === 'unknown');
  const why = predatesTracking(job) ? 'steps not tracked' : 'steps not recorded';
  if (job.status === 'failed') return jobErr ? `Run failed: ${jobErr}` : legacy ? `Run failed — ${why}` : 'Run failed';
  if (legacy) {
    if (job.status === 'held') return `Last run is on hold — ${why}`;
    if (job.status === 'partial') return `Last run finished with problems — ${why}`;
    return `Last run finished — ${why}`;
  }
  if (job.status === 'partial') return 'Run finished with problems';
  if (job.status === 'held') return 'Run is on hold';
  return 'Run finished — nothing uploaded';
}

/**
 * The 7-station strip for ONE channel's latest job.
 * @returns {{ stations: {key,state,at,detail}[], summary: string }}
 */
export function deriveStrip({ job = null, steps = [], scripts, intents, script, intent, timeZone = 'UTC' } = {}) {
  if (!job) return { stations: emptyStrip(), summary: 'No run yet today' };

  const rows = new Map();
  for (const row of steps || []) {
    const key = stationFromStepName(row?.name);
    if (!key) continue;
    const prev = rows.get(key);
    if (!prev || Number(row.idx) > Number(prev.idx)) rows.set(key, row);
  }
  const anyStation = rows.size > 0;
  const finished = isFinished(job);
  const untracked = predatesTracking(job) ? NOT_TRACKED : NOT_RECORDED;

  const strip = STATIONS.map(({ key }) => {
    const row = rows.get(key);
    if (row) return rowToStation(key, row);
    if (finished && !anyStation) return { key, state: 'unknown', at: null, detail: untracked };
    return { key, state: 'not_yet', at: null, detail: null };
  });

  const theScript = pickForJob(scripts ?? (script ? [script] : []), job);
  const approval = theScript && scriptToApproval(theScript);
  if (approval) strip[strip.findIndex((s) => s.key === 'approval')] = { key: 'approval', ...approval };

  const theIntent = pickForJob(intents ?? (intent ? [intent] : []), job);
  const upload = theIntent && intentToUpload(theIntent);
  if (upload) strip[strip.findIndex((s) => s.key === 'upload')] = { key: 'upload', ...upload };

  return { stations: strip, summary: summarize(job, strip, timeZone) };
}

function labelFor(name) {
  const key = stationFromStepName(name);
  if (key) return LABEL[key];
  if (typeof name === 'string' && name.startsWith('skipped-')) {
    const base = name.slice('skipped-'.length);
    return `${STEP_LABELS[base] || base} (turned off)`;
  }
  return STEP_LABELS[name] || String(name ?? '');
}

/** All job_steps (station + coarse) → drawer rows, sorted by idx. */
export function mapSteps(steps, { now = Date.now() } = {}) {
  const nowMs = toMs(now) ?? Date.now();
  return [...(steps || [])]
    .sort((a, b) => Number(a.idx) - Number(b.idx))
    .map((row) => {
      const start = toMs(row.started_at);
      const end = toMs(row.finished_at) ?? (row.status === 'running' ? nowMs : null);
      return {
        idx: Number(row.idx),
        name: row.name,
        label: labelFor(row.name),
        station: stationFromStepName(row.name),
        status: row.status,
        state: stepState(row),
        startedAt: toIso(row.started_at),
        finishedAt: toIso(row.finished_at),
        durationSec: start != null && end != null && end >= start ? Math.round((end - start) / 1000) : null,
        error: shortError(row.error),
      };
    });
}

/** /api/stations `channels` object: one entry per known channel, in list order. */
export function stationsPayload({ channels = [], today = new Map(), timeZone = 'UTC' } = {}) {
  const out = {};
  for (const ch of channels) {
    const slug = ch?.slug;
    if (!slug) continue;
    const got = today.get(slug) || {};
    const job = got.job || null;
    const { stations, summary } = deriveStrip({ job, steps: got.steps, scripts: got.scripts, intents: got.intents, timeZone });
    out[slug] = {
      jobId: job?.id ?? null,
      runId: runIdOf(job),
      startedAt: toIso(job?.started_at),
      finishedAt: toIso(job?.finished_at),
      jobStatus: job?.status ?? null,
      stations,
      summary,
    };
  }
  return out;
}

/** One recorded job → the drawer's view of it: job header, every step, the strip, the summary. */
export function runRecordView({ job, steps = [], scripts = [], intents = [] } = {}, { timeZone = 'UTC', now = Date.now() } = {}) {
  const { stations, summary } = deriveStrip({ job, steps, scripts, intents, timeZone });
  return {
    job: {
      id: job.id,
      channel: job.channel,
      status: job.status,
      startedAt: toIso(job.started_at),
      finishedAt: toIso(job.finished_at),
      error: shortError(job.error),
      runId: runIdOf(job),
    },
    steps: mapSteps(steps, { now }),
    stations,
    summary,
  };
}

/**
 * /api/runs/steps body. One scheduled GitHub run can cover EVERY channel
 * (matrix, shared run id): none → no_job; exactly one → the single-job shape
 * `{ ok, job, steps, stations, summary }`; several → `{ ok, jobs:[…] }` by channel.
 */
export function stepsPayload(records, opts = {}) {
  const list = (records || []).filter((r) => r && r.job);
  if (!list.length) return { ok: false, reason: 'no_job' };
  if (list.length === 1) return { ok: true, ...runRecordView(list[0], opts) };
  const views = list.map((r) => runRecordView(r, opts));
  views.sort((a, b) => String(a.job.channel).localeCompare(String(b.job.channel)));
  return { ok: true, jobs: views };
}

const RUN_ID_RE = /^\d{1,20}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

/** /api/runs/steps query → { ok, runId, jobId, channel, startedAt } or { ok:false, reason }. */
export function parseStepsQuery(params) {
  const get = (k) => {
    const v = params?.get?.(k);
    return v == null || v === '' ? null : String(v);
  };
  const runId = get('runId');
  const jobId = get('jobId');
  const channel = get('channel');
  const startedAt = get('startedAt');
  if (!runId && !jobId) return { ok: false, reason: 'runId_or_jobId_required' };
  if (runId && !RUN_ID_RE.test(runId)) return { ok: false, reason: 'bad_runId' };
  if (jobId && !UUID_RE.test(jobId)) return { ok: false, reason: 'bad_jobId' };
  if (channel && !SLUG_RE.test(channel)) return { ok: false, reason: 'bad_channel' };
  if (startedAt && toMs(startedAt) == null) return { ok: false, reason: 'bad_startedAt' };
  return { ok: true, runId, jobId, channel, startedAt };
}
