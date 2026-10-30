// #106 Phase 4 T1 — job store: jobs / job_steps / job_artifacts (spec S1).
//
// Every channel run becomes a recorded job with one row per step, and every
// produced file is indexed by a fingerprint of its bytes (D1). This is the
// store T2's channel-pipeline instrumentation and the S2/S4 slices query —
// it is inert until called (no pipeline edits in T1).
//
// House pattern: lib/ai-adapter.mjs makeUsageWriter — ensure-schema-on-write,
// injected deps ({ dbClient, log, warn, now }), writers that NEVER throw.
// Client contract (postgres.js-compatible positional style, same as
// studio/lib/template-registry-db.js): `dbClient(sqlText, params)` ->
// Promise<rowObject[]>; $1..$n placeholders; snake_case row columns.
//
// Fail-open contract (AC-P4-5): a dead Neon degrades every call to
// `{ ok: false, error }` with ONE memoized warn — a dead database can never
// darken production; that day's runs simply have no job rows (accepted
// degradation, spec Honest Limits).
//
// Hash disambiguation (D1, one line): the artifact content_hash fingerprints
// FILE BYTES (sha256 of raw bytes); the Phase 3 canonical hash fingerprints
// normalized SCRIPT TEXT — two different fingerprints for two different
// jobs, never compared.
//
// Resume contract (D4 + review rows 5/21): resume is step-STATUS-based.
// latestResumableJob returns the newest failed/stale-running job with its
// steps and artifacts; the CALLER (T2) decides the skip: a step is skipped
// only when its artifact row exists AND the bytes are retrievable from Blob,
// and the resume key (template id+version + brand-kit/config hash, carried
// in jobs.meta) must match — an index-only entry re-runs.

import { randomUUID, createHash } from 'node:crypto';
import { adaptPostgres } from '../studio/lib/provider-routing.js';

// Pinned vocabularies (task deliverable; D2: the step vocabulary is stable
// whether or not platforms are paused).
export const JOB_KINDS = ['daily', 'doc', 'topup', 'resume'];
export const JOB_STATUSES = ['running', 'succeeded', 'failed', 'held'];
export const STEP_NAMES = ['research', 'script', 'tts', 'render', 'clips', 'post', 'verify', 'fb', 'poster'];
export const ARTIFACT_KINDS = ['script_payload', 'tts_audio', 'review_render', 'thumb_candidate'];

const STEP_RECORD_STATUSES = ['pending', 'running', 'skipped'];
const STEP_FINISH_STATUSES = ['succeeded', 'failed', 'skipped'];
const JOB_FINISH_STATUSES = ['succeeded', 'failed', 'held'];
const SHA256_RE = /^[0-9a-f]{64}$/;

function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

function isValidStepName(name) {
  return STEP_NAMES.includes(name) || (isNonEmptyString(name) && name.startsWith('skipped-'));
}

function redact(e) {
  return String(e && e.message ? e.message : e).slice(0, 200);
}

// `trigger` is quoted because it is a SQL keyword in some dialects; Postgres
// treats it as non-reserved but the quotes cost nothing and keep the DDL
// portable.
const SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS jobs (
    id uuid PRIMARY KEY,
    channel text NOT NULL,
    kind text NOT NULL,
    status text NOT NULL DEFAULT 'running',
    "trigger" text,
    resumed_from_job_id uuid,
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    error text,
    meta jsonb
  )`,
  `CREATE TABLE IF NOT EXISTS job_steps (
    job_id uuid NOT NULL,
    idx integer NOT NULL,
    name text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    started_at timestamptz,
    finished_at timestamptz,
    error text,
    PRIMARY KEY (job_id, idx)
  )`,
  `CREATE TABLE IF NOT EXISTS job_artifacts (
    id bigserial PRIMARY KEY,
    job_id uuid NOT NULL,
    step text NOT NULL,
    content_hash text NOT NULL,
    kind text NOT NULL,
    blob_url text,
    bytes bigint,
    meta jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (job_id, step, kind, content_hash)
  )`,
];

export function makeJobStore(deps) {
  const dbClient = deps?.dbClient;
  if (typeof dbClient !== 'function') {
    throw new TypeError('makeJobStore: deps.dbClient must be a function (sqlText, params) -> Promise<rows>');
  }
  const warn = typeof deps.warn === 'function' ? deps.warn : console.warn;
  const now = typeof deps.now === 'function' ? deps.now : (() => new Date());

  let schemaReady = false;
  let warned = false;
  const warnOnce = (msg) => {
    if (warned) return;
    warned = true;
    warn(msg);
  };
  const degrade = (op, e) => {
    const error = redact(e);
    warnOnce(`[job-store] ${op} unavailable — job records skipped, pipeline continues (${error})`);
    return { ok: false, error };
  };

  async function ensureSchema() {
    if (schemaReady) return { ok: true };
    try {
      for (const ddl of SCHEMA_DDL) await dbClient(ddl, []);
      schemaReady = true;
      return { ok: true };
    } catch (e) {
      return degrade('job store', e); // one memoized warn (AC-P4-5)
    }
  }

  // ------------------------------------------------------------------
  // jobs
  // ------------------------------------------------------------------

  /** Create one running job row. Returns { ok, id } or { ok:false, error }. */
  async function startJob({ channel, kind, trigger, meta, resumedFromJobId } = {}) {
    try {
      const schema = await ensureSchema();
      if (!schema.ok) return { ok: false, error: schema.error };
      if (!isNonEmptyString(channel)) return { ok: false, error: 'channel_required' };
      if (!JOB_KINDS.includes(kind)) return { ok: false, error: `invalid_kind (daily|doc|topup|resume)` };
      const id = randomUUID();
      await dbClient(
        `INSERT INTO jobs (id, channel, kind, status, "trigger", resumed_from_job_id, started_at, meta)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, channel, kind, 'running', isNonEmptyString(trigger) ? trigger : null,
          isNonEmptyString(resumedFromJobId) ? resumedFromJobId : null, now(),
          meta === undefined || meta === null ? null : JSON.stringify(meta)],
      );
      return { ok: true, id };
    } catch (e) {
      return degrade('job store', e);
    }
  }

  /**
   * Terminal transition for a job: succeeded | failed | held (running is not
   * a terminal; a crashed job simply never reaches finishJob — which is
   * exactly what makes it resumable, AC-P4-4).
   */
  async function finishJob(jobId, { status = 'succeeded', error = null } = {}) {
    try {
      const schema = await ensureSchema();
      if (!schema.ok) return { ok: false, error: schema.error };
      if (!isNonEmptyString(jobId)) return { ok: false, error: 'job_id_required' };
      if (!JOB_FINISH_STATUSES.includes(status)) {
        return { ok: false, error: 'invalid_status (succeeded|failed|held)' };
      }
      const rows = await dbClient(
        `UPDATE jobs SET status = $2, finished_at = $3, error = $4 WHERE id = $1 RETURNING id`,
        [jobId, status, now(), error ?? null],
      );
      return { ok: true, updated: rows.length };
    } catch (e) {
      return degrade('job store', e);
    }
  }

  // ------------------------------------------------------------------
  // job_steps
  // ------------------------------------------------------------------

  /**
   * Register one step of a job (one job_steps row per planned step,
   * AC-P4-1). status 'pending' (default) or 'running' stamps started_at;
   * 'skipped' (a config-disabled lane) stamps nothing — the step never ran.
   */
  async function recordStep(jobId, idx, name, { status = 'pending' } = {}) {
    try {
      const schema = await ensureSchema();
      if (!schema.ok) return { ok: false, error: schema.error };
      if (!isNonEmptyString(jobId)) return { ok: false, error: 'job_id_required' };
      if (!Number.isInteger(idx) || idx < 0) return { ok: false, error: 'invalid_idx' };
      if (!isValidStepName(name)) return { ok: false, error: 'invalid_step_name' };
      if (!STEP_RECORD_STATUSES.includes(status)) {
        return { ok: false, error: 'invalid_status (pending|running|skipped)' };
      }
      await dbClient(
        `INSERT INTO job_steps (job_id, idx, name, status, started_at, error)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [jobId, idx, name, status, status === 'skipped' ? null : now(), null],
      );
      return { ok: true };
    } catch (e) {
      return degrade('job store', e);
    }
  }

  /** Close one step: succeeded | failed | skipped. failure carries error. */
  async function finishStep(jobId, idx, { status = 'succeeded', error = null } = {}) {
    try {
      const schema = await ensureSchema();
      if (!schema.ok) return { ok: false, error: schema.error };
      if (!isNonEmptyString(jobId)) return { ok: false, error: 'job_id_required' };
      if (!Number.isInteger(idx) || idx < 0) return { ok: false, error: 'invalid_idx' };
      if (!STEP_FINISH_STATUSES.includes(status)) {
        return { ok: false, error: 'invalid_status (succeeded|failed|skipped)' };
      }
      const rows = await dbClient(
        `UPDATE job_steps SET status = $3, finished_at = $4, error = $5 WHERE job_id = $1 AND idx = $2 RETURNING idx`,
        [jobId, idx, status, now(), error ?? null],
      );
      return { ok: true, updated: rows.length };
    } catch (e) {
      return degrade('job store', e);
    }
  }

  // ------------------------------------------------------------------
  // job_artifacts
  // ------------------------------------------------------------------

  /**
   * Index one produced file: sha256 of the raw BYTES (never the Phase 3
   * script-text hash, D1). Dedupe: the same bytes for the same job+step+kind
   * return the EXISTING row (duplicate: true, with its blob_url) — AC-P4-2's
   * "same hash, no duplicate artifact row". blob_url null is a legal
   * index-only entry (degraded Blob upload, D3) — resume must treat it as
   * re-run; that decision belongs to the caller.
   */
  async function indexArtifact(jobId, { step, kind, bytes, contentHash, blobUrl, size, meta } = {}) {
    try {
      const schema = await ensureSchema();
      if (!schema.ok) return { ok: false, error: schema.error };
      if (!isNonEmptyString(jobId)) return { ok: false, error: 'job_id_required' };
      if (!isNonEmptyString(step)) return { ok: false, error: 'step_required' };
      if (!ARTIFACT_KINDS.includes(kind)) {
        return { ok: false, error: 'invalid_artifact_kind (script_payload|tts_audio|review_render|thumb_candidate)' };
      }
      let hash = null;
      let byteCount = null;
      if (bytes !== undefined && bytes !== null) {
        const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes), 'utf8');
        hash = createHash('sha256').update(buf).digest('hex');
        byteCount = buf.length;
      } else if (isNonEmptyString(contentHash)) {
        if (!SHA256_RE.test(contentHash)) return { ok: false, error: 'invalid_content_hash (sha256 hex required)' };
        hash = contentHash;
        byteCount = Number.isFinite(Number(size)) ? Number(size) : null;
      } else {
        return { ok: false, error: 'bytes_or_content_hash_required' };
      }

      const existing = await dbClient(
        `SELECT id, content_hash, kind, step, blob_url FROM job_artifacts
         WHERE job_id = $1 AND step = $2 AND kind = $3 AND content_hash = $4`,
        [jobId, step, kind, hash],
      );
      if (existing.length > 0) {
        return { ok: true, duplicate: true, id: existing[0].id, contentHash: hash, blobUrl: existing[0].blob_url ?? null };
      }

      const inserted = await dbClient(
        `INSERT INTO job_artifacts (job_id, step, content_hash, kind, blob_url, bytes, meta)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [jobId, step, hash, kind, isNonEmptyString(blobUrl) ? blobUrl : null, byteCount,
          meta === undefined || meta === null ? null : JSON.stringify(meta)],
      );
      return { ok: true, duplicate: false, id: inserted[0]?.id ?? null, contentHash: hash, blobUrl: blobUrl ?? null };
    } catch (e) {
      return degrade('job store', e);
    }
  }

  // ------------------------------------------------------------------
  // readers (resume + drill inputs)
  // ------------------------------------------------------------------

  /**
   * The newest resumable job for a channel: status 'failed' or still
   * 'running' (a killed worker never reaches finishJob — that stale-running
   * row IS the crash case, AC-P4-4). 'held' is excluded: a held job waits
   * for approval (D15/D17), not resume. 'succeeded' is excluded. Steps come
   * ordered by idx; artifacts ride along so the caller can apply the skip
   * condition (artifact row AND bytes retrievable — review row 5).
   */
  async function latestResumableJob(channel) {
    try {
      const schema = await ensureSchema();
      if (!schema.ok) return { ok: false, error: schema.error };
      if (!isNonEmptyString(channel)) return { ok: false, error: 'channel_required' };
      const jobs = await dbClient(
        `SELECT id, channel, kind, status, "trigger", resumed_from_job_id, started_at, finished_at, error, meta
         FROM jobs WHERE channel = $1 AND status IN ('failed', 'running')
         ORDER BY started_at DESC LIMIT 1`,
        [channel],
      );
      if (jobs.length === 0) return { ok: true, job: null, steps: [], artifacts: [] };
      const job = jobs[0];
      const [steps, artifacts] = await Promise.all([
        dbClient(
          `SELECT job_id, idx, name, status, started_at, finished_at, error
           FROM job_steps WHERE job_id = $1 ORDER BY idx ASC`,
          [job.id],
        ),
        dbClient(
          `SELECT job_id, step, content_hash, kind, blob_url, bytes, meta, created_at
           FROM job_artifacts WHERE job_id = $1 ORDER BY created_at ASC`,
          [job.id],
        ),
      ]);
      return { ok: true, job, steps, artifacts };
    } catch (e) {
      return degrade('job store', e);
    }
  }

  /** One job with its steps and artifacts. A miss is { ok:true, job:null }. */
  async function getJob(jobId) {
    try {
      const schema = await ensureSchema();
      if (!schema.ok) return { ok: false, error: schema.error };
      if (!isNonEmptyString(jobId)) return { ok: false, error: 'job_id_required' };
      const jobs = await dbClient(
        `SELECT id, channel, kind, status, "trigger", resumed_from_job_id, started_at, finished_at, error, meta
         FROM jobs WHERE id = $1`,
        [jobId],
      );
      if (jobs.length === 0) return { ok: true, job: null, steps: [], artifacts: [] };
      const [steps, artifacts] = await Promise.all([
        dbClient(
          `SELECT job_id, idx, name, status, started_at, finished_at, error
           FROM job_steps WHERE job_id = $1 ORDER BY idx ASC`,
          [jobId],
        ),
        dbClient(
          `SELECT job_id, step, content_hash, kind, blob_url, bytes, meta, created_at
           FROM job_artifacts WHERE job_id = $1 ORDER BY created_at ASC`,
          [jobId],
        ),
      ]);
      return { ok: true, job: jobs[0], steps, artifacts };
    } catch (e) {
      return degrade('job store', e);
    }
  }

  return {
    ensureSchema,
    startJob,
    finishJob,
    recordStep,
    finishStep,
    indexArtifact,
    latestResumableJob,
    getJob,
  };
}

/**
 * Production entry point. Lazy-imports the Neon client so importing this
 * module never touches the DB layer — unit tests and non-Neon machines stay
 * safe until this is actually called. Throws fail-closed when the database
 * is not configured (the CALLER catches once at boot and runs log-only —
 * the AC-P4-5 posture; the constructed store itself never throws).
 */
export async function getJobStore() {
  const { db, dbReady } = await import('../studio/lib/db.mjs');
  if (!dbReady || !db) {
    throw new Error('job store: DATABASE_URL missing / db not ready — cannot construct job store');
  }
  return makeJobStore({ dbClient: adaptPostgres(db) });
}

export default getJobStore;
