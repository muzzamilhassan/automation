// Creator City Phase 1 (FEEDBACK item O, 2026-11-23): the best-effort station
// recorder. The production pipeline marks the 7 production stations
// (studio/lib/stations.mjs — topic … upload) as job_steps rows named
// `station:<key>` at the RESERVED idx range 50..56 (STATIONS order), so the
// panel can show which step a channel's run is at.
//
// Contract (production CI — channel-autopilot.yml): recording may NEVER throw,
// block for long, or change pipeline behaviour / exit codes.
//   - every call is wrapped: errors become { ok:false } + at most ONE short
//     warn line per recorder;
//   - every store call is time-boxed: the FIRST call gets the setup budget
//     (default 15s — store import + connect + schema DDL on a cold Neon), later
//     calls the per-mark budget (default 5s); a timeout or a throw trips a
//     breaker — later calls return immediately (a hung Neon costs one wait);
//   - no job id, JOB_STORE_ENABLED unset, or no store = silent no-op.
// Importing this module touches no database: the job store is loaded lazily,
// only by the child-process entry points, only when enabled.

import { STATION_KEYS, stepNameFor, stationFromStepName } from '../studio/lib/stations.mjs';
import { flagOn } from './review-seams.mjs';

export const STATION_IDX_BASE = 50;
const MARK_STATUSES = ['pending', 'running', 'succeeded', 'failed', 'skipped'];
const CLOSE_STATUSES = ['failed', 'skipped'];
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_SETUP_TIMEOUT_MS = 15000;
// A lane/slot reset never touches approval: the pipeline decides it ONCE per
// run, before the child lanes start.
export const RESET_KEYS = Object.freeze(STATION_KEYS.filter((k) => k !== 'approval'));

/** 'topic' → 50 … 'upload' → 56 (throws on an unknown key — tests catch typos). */
export function stationIdx(key) {
  const i = STATION_KEYS.indexOf(key);
  if (i < 0) throw new Error(`unknown station: ${key}`);
  return STATION_IDX_BASE + i;
}

/**
 * A SHORT plain error for the panel: first line, ≤200 chars, credentials
 * scrubbed (URL userinfo, token query params, bearer headers, known token
 * shapes, long opaque blobs). null/empty → null.
 */
export function shortError(e) {
  if (e === null || e === undefined) return null;
  let s = String(e && typeof e === 'object' && 'message' in e ? e.message : e);
  s = s.split(/\r?\n/)[0].trim();
  s = s
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, '$1***@')
    .replace(/\b(access_token|refresh_token|id_token|token|api_key|apikey|key|secret|password|pwd|sig|signature|code)=([^&\s]+)/gi, '$1=***')
    .replace(/\bBearer\s+\S+/gi, 'Bearer ***')
    .replace(/\bya29\.[\w.-]+/g, '***')
    .replace(/\bAIza[0-9A-Za-z_-]{35}\b/g, '***') // Google API key
    .replace(/\b\d{6,}:[A-Za-z0-9_-]{30,}/g, '***') // bot token <id>:<secret>
    .replace(/\b(?:ghp|gho|ghs|ghu|github_pat|npg|xox[abp])_[A-Za-z0-9_]{8,}/g, '***')
    .replace(/\bsk-[A-Za-z0-9_-]{12,}/g, '***')
    .replace(/[A-Za-z0-9_\-+/=]{40,}/g, '***');
  s = s.slice(0, 200);
  return s.length ? s : null;
}

function withTimeout(promise, ms) {
  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), ms);
    if (typeof timer.unref === 'function') timer.unref();
  });
  return Promise.race([Promise.resolve(promise).then((value) => ({ value })), timeout])
    .finally(() => clearTimeout(timer));
}

const posMs = (v, dflt) => (Number.isFinite(v) && v > 0 ? v : dflt);

/**
 * deps: { store } (a lib/job-store.mjs store) or { getStore } (async thunk →
 * store | null; resolved once, lazily); { warn } one-line logger;
 * { timeoutMs } per-call budget; { setupTimeoutMs } first-call budget.
 * Returns { mark, closeRunning, failRunning, reset } — none ever throws.
 */
export function makeStationRecorder(deps = {}) {
  const warn = typeof deps.warn === 'function' ? deps.warn : (m) => console.log(m);
  const timeoutMs = posMs(deps.timeoutMs, DEFAULT_TIMEOUT_MS);
  const setupTimeoutMs = Math.max(timeoutMs, posMs(deps.setupTimeoutMs, DEFAULT_SETUP_TIMEOUT_MS));
  let storePromise = deps.store !== undefined ? Promise.resolve(deps.store) : null;
  let warned = false;
  let dead = false; // breaker: a throw or a timeout stops every later call
  let ready = false; // the first store call completed — later calls use the short budget

  const warnOnce = (why) => {
    if (warned) return;
    warned = true;
    try { warn(`[station] WARN station recording degraded (non-fatal): ${shortError(why) ?? 'unknown'}`); } catch { }
  };

  const resolveStore = () => {
    if (!storePromise) {
      storePromise = typeof deps.getStore === 'function'
        ? Promise.resolve().then(() => deps.getStore())
        : Promise.resolve(null);
    }
    return storePromise;
  };

  // One time-boxed store call: fn(store) → result. Store resolution counts
  // against the same budget (setup budget until the first call completes).
  async function guarded(fn) {
    const budget = ready ? timeoutMs : setupTimeoutMs;
    const got = await withTimeout((async () => {
      const store = await resolveStore();
      if (!store) return { ok: false, skipped: 'disabled' };
      return fn(store);
    })(), budget);
    if (got.timedOut) {
      dead = true;
      warnOnce(`job store did not answer within ${budget}ms`);
      return { ok: false, error: 'timeout' };
    }
    ready = true;
    return got.value;
  }

  async function mark(jobId, key, status, { error = null } = {}) {
    try {
      if (dead) return { ok: false, skipped: 'degraded' };
      if (typeof jobId !== 'string' || !jobId) return { ok: false, skipped: 'no_job' };
      if (!STATION_KEYS.includes(key)) return { ok: false, error: `unknown station: ${key}` };
      if (!MARK_STATUSES.includes(status)) return { ok: false, error: `invalid status: ${status}` };
      const idx = stationIdx(key);
      const name = stepNameFor(key);
      const err = shortError(error);
      const res = await guarded((store) => {
        if (typeof store.upsertStep !== 'function') throw new Error('job store has no upsertStep');
        return store.upsertStep(jobId, idx, name, { status, error: err });
      });
      if (res && res.ok === false && res.error && res.error !== 'timeout') warnOnce(res.error);
      return res && typeof res === 'object' ? res : { ok: false, error: 'no_result' };
    } catch (e) {
      dead = true;
      warnOnce(e);
      return { ok: false, error: shortError(e) };
    }
  }

  /**
   * Close every `station:*` row of the job still 'running' with `status`
   * (failed | skipped) and the short error. The parent calls this after a
   * child dies (failed) and at the end of a run (skipped on a clean run — a
   * late-landing write is not a failure).
   */
  async function closeRunning(jobId, { status = 'failed', error = null } = {}) {
    try {
      if (dead) return { ok: false, skipped: 'degraded' };
      if (typeof jobId !== 'string' || !jobId) return { ok: false, skipped: 'no_job' };
      if (!CLOSE_STATUSES.includes(status)) return { ok: false, error: `invalid close status: ${status}` };
      const job = await guarded((store) => {
        if (typeof store.getJob !== 'function') throw new Error('job store has no getJob');
        return store.getJob(jobId);
      });
      if (!job || job.ok !== true) return { ok: false, error: job?.error ?? job?.skipped ?? 'no_job_row' };
      let closed = 0;
      for (const row of job.steps || []) {
        const key = stationFromStepName(row?.name);
        if (!key || row.status !== 'running') continue;
        const r = await mark(jobId, key, status, { error });
        if (r && r.ok) closed++;
      }
      return { ok: true, closed };
    } catch (e) {
      dead = true;
      warnOnce(e);
      return { ok: false, error: shortError(e) };
    }
  }

  const failRunning = (jobId, error) => closeRunning(jobId, { status: 'failed', error });

  /**
   * Put stations back to 'pending' (status, times and error cleared) in ONE
   * write — each lane / slot starts from a clean strip. Default: every
   * station except approval.
   */
  async function reset(jobId, keys = RESET_KEYS) {
    try {
      if (dead) return { ok: false, skipped: 'degraded' };
      if (typeof jobId !== 'string' || !jobId) return { ok: false, skipped: 'no_job' };
      const list = (Array.isArray(keys) ? keys : []).filter((k) => STATION_KEYS.includes(k));
      if (!list.length) return { ok: false, error: 'no_stations' };
      const steps = list.map((k) => ({ idx: stationIdx(k), name: stepNameFor(k) }));
      const res = await guarded((store) => {
        if (typeof store.resetSteps !== 'function') throw new Error('job store has no resetSteps');
        return store.resetSteps(jobId, steps);
      });
      if (res && res.ok === false && res.error && res.error !== 'timeout') warnOnce(res.error);
      return res && typeof res === 'object' ? res : { ok: false, error: 'no_result' };
    } catch (e) {
      dead = true;
      warnOnce(e);
      return { ok: false, error: shortError(e) };
    }
  }

  return { mark, closeRunning, failRunning, reset };
}

// ---- child-process entry points (yt-daily.mjs, yt-deepdive.mjs) -------------
// The pipeline threads its job id to children as PIPELINE_JOB_ID; the child
// reaches Neon through the same lazily-imported job store (DATABASE_URL in the
// child env). JOB_STORE_ENABLED unset → no store, no import, no log line.
let defaultRecorder = null;
function childRecorder() {
  if (!flagOn(process.env.JOB_STORE_ENABLED)) return null;
  if (!defaultRecorder) {
    defaultRecorder = makeStationRecorder({
      getStore: async () => (await import('./job-store.mjs')).getJobStore(),
    });
  }
  return defaultRecorder;
}

export async function markStation(jobId, key, status, opts = {}) {
  try {
    const rec = childRecorder();
    if (!rec) return { ok: false, skipped: 'disabled' };
    return await rec.mark(jobId, key, status, opts);
  } catch {
    return { ok: false, error: 'recorder_failed' };
  }
}

export async function resetStations(jobId, keys = RESET_KEYS) {
  try {
    const rec = childRecorder();
    if (!rec) return { ok: false, skipped: 'disabled' };
    return await rec.reset(jobId, keys);
  } catch {
    return { ok: false, error: 'recorder_failed' };
  }
}

/**
 * The child lanes' station handle: `station(key, status, error)` marks one
 * station and remembers which are 'running'; `failOpen(e)` closes every
 * still-running station 'failed' with e (a slot or render that throws);
 * `reset(keys)` starts a lane / slot from a clean strip. None ever throws;
 * an empty jobId writes nothing.
 */
export function makeChildStations(jobId, { mark = markStation, reset = resetStations } = {}) {
  const open = new Set();
  async function station(key, status, error = null) {
    if (status === 'running') open.add(key);
    else open.delete(key);
    if (!jobId) return;
    try { await mark(jobId, key, status, error ? { error } : {}); } catch { }
  }
  async function failOpen(e) {
    for (const key of [...open]) await station(key, 'failed', e);
  }
  async function resetLane(keys = RESET_KEYS) {
    for (const k of keys) open.delete(k);
    if (!jobId) return;
    try { await reset(jobId, keys); } catch { }
  }
  return { station, failOpen, reset: resetLane };
}
