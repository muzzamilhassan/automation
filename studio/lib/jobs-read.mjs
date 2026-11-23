// Creator City Phase 1 (FEEDBACK item O, 2026-11-23): READ-ONLY Neon queries
// behind /api/stations and /api/runs/steps. The pipeline writes jobs /
// job_steps (lib/job-store.mjs), scripts (script-store.mjs) and
// upload_intents (lib/upload-intents.mjs); nothing in the studio read jobs
// before this module.
//
// Client contract (house pattern, script-store.mjs / warnings-store.mjs):
// `dbClient(sqlText, params)` -> Promise<rowObject[]>, $1..$n placeholders,
// snake_case rows — production passes adaptPostgres(db).
//
// The jobs are read FIRST; steps, scripts and intents are then read for those
// exact job ids (`IN ($1, $2, …)` — no array params, no second "latest"
// select that could race the first). Scripts/intents are matched by job id
// (the job's own + the parent a resume continues) as well as by today's UTC
// slot day, so a job held late on day D and approved after midnight still
// finds its script.
//
// HONESTY: a DB failure THROWS so the route answers 503 — never an empty
// "nothing ran" that would read as fake calm. The one exception is a table
// that does not exist yet (42P01): no table really means no rows.

import { stepNameFor } from './stations.mjs';

const JOB_COLS = `id, channel, kind, status, "trigger", resumed_from_job_id, started_at, finished_at, error, meta`;
const STEP_COLS = `job_id, idx, name, status, started_at, finished_at, error`;
const SCRIPT_COLS = `id, channel_id, status, slot_date, job_id, approval_at, rejected_at, rejected_note, video_id, created_at, updated_at`;
const INTENT_COLS = `id, channel_id, slot_date, kind, slot_idx, status, video_id, job_id, fail_reason, created_at, updated_at`;

const DAY_MS = 24 * 60 * 60 * 1000;
const NEAR_WINDOW = `interval '10 minutes'`;

/** YYYY-MM-DD in UTC — the pipeline's slot day (`new Date().toISOString().slice(0, 10)`). */
export function utcDay(now = new Date()) {
  return new Date(now instanceof Date ? now.getTime() : now).toISOString().slice(0, 10);
}

function isMissingTable(e) {
  return e?.code === '42P01' || /relation "[^"]+" does not exist/i.test(String(e?.message || ''));
}

/** `$from, $from+1, …` placeholders for an IN list. */
function placeholders(values, from) {
  return values.map((_, i) => `$${from + i}`).join(', ');
}

const uniq = (xs) => [...new Set(xs)];
const idsOf = (jobs) => uniq(jobs.map((j) => String(j.id)));
const linkedIdsOf = (jobs) => uniq([...idsOf(jobs), ...jobs.map((j) => j.resumed_from_job_id).filter(Boolean).map(String)]);

export function makeJobsRead(dbClient) {
  if (typeof dbClient !== 'function') {
    throw new TypeError('makeJobsRead: dbClient must be a function (sqlText, params) -> Promise<rows>');
  }

  async function q(sql, params) {
    try {
      const rows = await dbClient(sql, params);
      return Array.isArray(rows) ? [...rows] : [];
    } catch (e) {
      if (isMissingTable(e)) return [];
      throw e;
    }
  }

  function stepsFor(ids) {
    if (!ids.length) return Promise.resolve([]);
    return q(`SELECT ${STEP_COLS} FROM job_steps WHERE job_id IN (${placeholders(ids, 1)}) ORDER BY job_id, idx`, ids);
  }

  /**
   * Latest job per channel started in the last 24h, its steps, and the
   * scripts + upload intents of today OR of those jobs (and their resume
   * parents). Map<channel, { job, steps, scripts, intents }>.
   */
  async function loadToday({ now = new Date() } = {}) {
    const nowMs = now instanceof Date ? now.getTime() : Number(now);
    const since = new Date(nowMs - DAY_MS).toISOString();
    const day = utcDay(nowMs);
    const jobs = await q(`SELECT DISTINCT ON (channel) ${JOB_COLS} FROM jobs WHERE started_at >= $1 ORDER BY channel, started_at DESC`, [since]);
    const ids = idsOf(jobs);
    const linked = linkedIdsOf(jobs);
    const [steps, scripts, intents] = await Promise.all([
      stepsFor(ids),
      q(
        `SELECT ${SCRIPT_COLS} FROM scripts WHERE slot_date = $1 OR (slot_date IS NULL AND created_at >= $2)${linked.length ? ` OR job_id IN (${placeholders(linked, 3)})` : ''}`,
        [day, since, ...linked],
      ),
      q(
        `SELECT ${INTENT_COLS} FROM upload_intents WHERE slot_date = $1${ids.length ? ` OR job_id IN (${placeholders(ids, 2)})` : ''}`,
        [day, ...ids],
      ),
    ]);

    const out = new Map();
    for (const job of jobs) out.set(job.channel, { job, steps: [], scripts: [], intents: [] });
    const byJob = new Map(jobs.map((j) => [String(j.id), j.channel]));
    for (const s of steps) {
      const ch = byJob.get(String(s.job_id));
      if (ch) out.get(ch).steps.push(s);
    }
    const slot = (channel) => {
      if (!out.has(channel)) out.set(channel, { job: null, steps: [], scripts: [], intents: [] });
      return out.get(channel);
    };
    for (const r of scripts) slot(r.channel_id).scripts.push(r);
    for (const r of intents) slot(r.channel_id).intents.push(r);
    return out;
  }

  // Fallback for a GitHub run whose job row has no runId: the channel's job
  // closest to the run's start (±10 min) — never one already claimed by a
  // DIFFERENT run.
  function jobNear({ channel, startedAt, runId = null }) {
    return q(
      `SELECT ${JOB_COLS} FROM jobs
        WHERE channel = $1
          AND started_at BETWEEN $2::timestamptz - ${NEAR_WINDOW} AND $2::timestamptz + ${NEAR_WINDOW}
          AND (meta->>'runId' IS NULL OR meta->>'runId' = $3)
        ORDER BY abs(extract(epoch from (started_at - $2::timestamptz))) ASC
        LIMIT 1`,
      [channel, startedAt, runId == null ? '' : String(runId)],
    );
  }

  /**
   * Every job recorded for one run. By jobId → that job. By runId → every
   * channel's job of that GitHub run (a scheduled autopilot run is a matrix
   * over ALL channels sharing one run id), or only `channel`'s when given.
   * No runId match + channel + startedAt → the nearest unclaimed job.
   * Returns [{ job, steps, scripts, intents }] ([] = nothing recorded).
   */
  async function loadRuns({ jobId = null, runId = null, channel = null, startedAt = null } = {}) {
    let jobs = [];
    if (jobId) jobs = await q(`SELECT ${JOB_COLS} FROM jobs WHERE id = $1`, [jobId]);
    if (!jobs.length && runId) {
      jobs = channel
        ? await q(`SELECT ${JOB_COLS} FROM jobs WHERE meta->>'runId' = $1 AND channel = $2 ORDER BY started_at DESC LIMIT 1`, [String(runId), channel])
        : await q(`SELECT DISTINCT ON (channel) ${JOB_COLS} FROM jobs WHERE meta->>'runId' = $1 ORDER BY channel, started_at DESC`, [String(runId)]);
    }
    if (!jobs.length && channel && startedAt) jobs = await jobNear({ channel, startedAt, runId });
    if (!jobs.length) return [];

    const ids = idsOf(jobs);
    const linked = linkedIdsOf(jobs);
    const [steps, scripts, intents] = await Promise.all([
      stepsFor(ids),
      q(`SELECT ${SCRIPT_COLS} FROM scripts WHERE job_id IN (${placeholders(linked, 1)})`, linked),
      q(`SELECT ${INTENT_COLS} FROM upload_intents WHERE job_id IN (${placeholders(ids, 1)})`, ids),
    ]);
    return jobs.map((job) => {
      const id = String(job.id);
      const parent = job.resumed_from_job_id ? String(job.resumed_from_job_id) : null;
      return {
        job,
        steps: steps.filter((s) => String(s.job_id) === id),
        scripts: scripts.filter((r) => String(r.job_id) === id || (parent && String(r.job_id) === parent)),
        intents: intents.filter((r) => String(r.job_id) === id),
      };
    });
  }

  /**
   * Station drawer (research §5 item 7): the newest `station:<key>` job_steps
   * rows of ONE channel's jobs, newest first — one row per job (each job has
   * one row per station). `pending` rows (never reached) are not results.
   * Unknown station key → throws before any query. Shaped by
   * station-settings.mjs historyRows.
   */
  async function loadStationHistory({ channel, station, limit = 5 } = {}) {
    const name = stepNameFor(station);
    const n = Math.min(20, Math.max(1, Math.trunc(Number(limit)) || 1));
    return q(
      `SELECT s.job_id, s.idx, s.name, s.status, s.started_at, s.finished_at, s.error, j.started_at AS job_started_at
         FROM job_steps s
         JOIN jobs j ON j.id = s.job_id
        WHERE j.channel = $1 AND s.name = $2 AND s.status <> 'pending'
        ORDER BY COALESCE(s.started_at, s.finished_at, j.started_at) DESC
        LIMIT $3`,
      [String(channel), name, n],
    );
  }

  return { loadToday, loadRuns, loadStationHistory };
}
