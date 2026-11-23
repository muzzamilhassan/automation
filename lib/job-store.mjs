// #106 Phase 4 T1 — job store: jobs / job_steps / job_artifacts (spec S1).
//
// Every channel run becomes a recorded job with one row per step, and every
// produced file is indexed by a fingerprint of its bytes (D1). This is the
// store T2's channel-pipeline instrumentation and the S2/S4 slices query —
// it is inert until called (no pipeline edits in T1).
//
// House pattern: lib/ai-adapter.mjs makeUsageWriter — ensure-schema-on-write,
// injected deps ({ dbClient, warn, now }), writers that NEVER throw.
// Client contract (postgres.js-compatible positional style, same as
// studio/lib/template-registry-db.js): `dbClient(sqlText, params)` ->
// Promise<rowObject[]>; $1..$n placeholders; snake_case row columns.
//
// Fail-open contract (AC-P4-5): a dead Neon degrades every call to
// `{ ok: false, error }` with ONE warn PER ERROR CLASS (memoized —
// constraint-class vs connection-class vs other) — a dead database can never
// darken production, and one silenced class must not hide a different later
// failure. That day's runs simply have no job rows (accepted degradation,
// spec Honest Limits).
//
// Vocabularies (round-1 review):
//   kinds per D1 — 'shorts' (the daily Shorts lane) | 'doc' (documentary) |
//     'clips' | 'pipeline' (the pipeline wrapper);
//   triggers per D1 — 'cron' | 'dispatch' | 'resume' | 'studio' (validated);
//   terminals — 'succeeded' | 'failed' | 'partial' | 'held'. 'partial' is
//     added per AC-P4-3 (the video shipped but a lane failed — its own
//     terminal, never misrecorded as a clean succeed, never a resume
//     target); 'held' is additive per D15/D17 (review-gate hold). Both sit
//     beyond D1's base set by design.
//   steps per D2 — the pipeline's top-level steps preflight, brain-embed,
//     episode, staging (channel-pipeline.mjs) join the lane vocabulary
//     research|script|tts|render|clips|post|verify|fb|poster, plus the
//     skipped-* prefix for config-disabled lanes.
//
// Step lifecycle: T2 inserts steps as 'pending' (started_at NULL at
// registration) and calls startStep when the step actually begins —
// startStep stamps started_at and flips the row to 'running' (AC-P4-1 step
// durations become real). finishStep closes succeeded|failed|skipped.
//
// Hash disambiguation (D1, one line): the artifact content_hash fingerprints
// FILE BYTES (sha256 of raw bytes); the Phase 3 canonical hash fingerprints
// normalized SCRIPT TEXT — two different fingerprints for two different
// jobs, never compared.
//
// Resume contract (D4 + round-1 review): resume is step-STATUS-based.
// latestResumableJob(channel, { staleAfterMs }) — staleAfterMs is REQUIRED.
// Cancelled GHA runs never write a terminal, so stale-running rows
// accumulate BY DESIGN and the age window is the safety: a live-running job
// is NEVER a resume target (two producers on one channel/slot = the
// duplicate-spend class). The store returns the newest stale
// failed/stale-running job with its steps and artifacts; the CALLER (T2)
// decides the skip: a step is skipped only when its artifact row exists AND
// the bytes are retrievable from Blob, and the resume key (template
// id+version + brand-kit/config hash, carried in jobs.meta) must match — an
// index-only entry re-runs.

import { randomUUID, createHash } from 'node:crypto';
import { adaptPostgres } from '../studio/lib/provider-routing.js';

// Pinned vocabularies (task deliverable + round-1 review; D2: the step
// vocabulary is stable whether or not platforms are paused).
export const JOB_KINDS = ['shorts', 'doc', 'clips', 'pipeline'];
export const JOB_STATUSES = ['running', 'succeeded', 'failed', 'partial', 'held'];
export const TRIGGERS = ['cron', 'dispatch', 'resume', 'studio'];
export const STEP_NAMES = [
  'preflight', // channel-pipeline.mjs preflight (D2)
  'research',
  'script',
  'tts',
  'render',
  'brain-embed', // channel-pipeline.mjs brain-embed (D2)
  'clips',
  'post',
  'verify',
  'episode', // channel-pipeline.mjs episode (D2)
  'staging', // channel-pipeline.mjs staging (D2)
  'fb',
  'poster',
  'review', // #106 T5 (D15/D17): the review-gate hold step — a held slot records
  // this step 'skipped' with a `held: <reason>` error and the JOB closes with
  // the 'held' terminal (D15/D17's hold, additive to D1's base set by design).
];
export const ARTIFACT_KINDS = ['script_payload', 'tts_audio', 'review_render', 'thumb_candidate'];

const STEP_RECORD_STATUSES = ['pending', 'skipped'];
const STEP_FINISH_STATUSES = ['succeeded', 'failed', 'skipped'];
const JOB_FINISH_STATUSES = ['succeeded', 'failed', 'partial', 'held'];
const STEP_UPSERT_STATUSES = ['pending', 'running', 'succeeded', 'failed', 'skipped'];
const STATION_STEP_RE = /^station:[a-z]+$/; // Creator City stations (studio/lib/stations.mjs)
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

// Coarse error fingerprint for the memoized warn: a T2 bug must not
// permanently silence a real dead-DB warn, so each CLASS warns once
// (constraint vs connection vs other, at minimum per round-1 review).
function errorClass(e) {
  const msg = String(e && e.message ? e.message : e);
  if (/duplicate key|unique constraint|foreign key|violates|conflict/i.test(msg)) return 'constraint';
  if (/econn(refused|reset|aborted)|etimedout|enotfound|eai_again|connection|timeout|timed out|terminated|too many (clients|connections)/i.test(msg)) return 'connection';
  return 'other';
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
  const warnedClasses = new Set();
  const warnOnce = (e) => {
    const cls = errorClass(e);
    if (warnedClasses.has(cls)) return;
    warnedClasses.add(cls);
    warn(`[job-store] degraded (${cls}) — job records skipped, pipeline continues (${redact(e)})`);
  };
  const degrade = (e) => {
    warnOnce(e);
    return { ok: false, error: redact(e) };
  };

  async function ensureSchema() {
    if (schemaReady) return { ok: true };
    try {
      for (const ddl of SCHEMA_DDL) await dbClient(ddl, []);
      schemaReady = true;
      return { ok: true };
    } catch (e) {
      return degrade(e); // one memoized warn per error class (AC-P4-5)
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
      if (!JOB_KINDS.includes(kind)) return { ok: false, error: 'invalid_kind (shorts|doc|clips|pipeline)' };
      if (trigger !== undefined && trigger !== null && !TRIGGERS.includes(trigger)) {
        return { ok: false, error: 'invalid_trigger (cron|dispatch|resume|studio)' };
      }
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
      return degrade(e);
    }
  }

  /**
   * Terminal transition for a job: succeeded | failed | partial | held.
   * 'partial' = the video shipped but a lane failed (AC-P4-3's exit-0
   * semantics); it is a TERMINAL — never a resume target (the shipped video
   * is S2 reconciliation's business, not a job re-run). 'running' is not a
   * terminal; a crashed job simply never reaches finishJob — which is
   * exactly what makes it (stale) resumable, AC-P4-4.
   */
  async function finishJob(jobId, { status = 'succeeded', error = null } = {}) {
    try {
      const schema = await ensureSchema();
      if (!schema.ok) return { ok: false, error: schema.error };
      if (!isNonEmptyString(jobId)) return { ok: false, error: 'job_id_required' };
      if (!JOB_FINISH_STATUSES.includes(status)) {
        return { ok: false, error: 'invalid_status (succeeded|failed|partial|held)' };
      }
      const rows = await dbClient(
        `UPDATE jobs SET status = $2, finished_at = $3, error = $4 WHERE id = $1 RETURNING id`,
        [jobId, status, now(), error ?? null],
      );
      return { ok: true, updated: rows.length };
    } catch (e) {
      return degrade(e);
    }
  }

  // ------------------------------------------------------------------
  // job_steps
  // ------------------------------------------------------------------

  /**
   * Register one step of a job (one job_steps row per planned step,
   * AC-P4-1). T2 inserts-at-start of the RUN: 'pending' by default, or
   * 'skipped' for a config-disabled lane. started_at stays NULL here — it
   * is stamped by startStep, so step durations are real, not planned.
   */
  async function recordStep(jobId, idx, name, { status = 'pending' } = {}) {
    try {
      const schema = await ensureSchema();
      if (!schema.ok) return { ok: false, error: schema.error };
      if (!isNonEmptyString(jobId)) return { ok: false, error: 'job_id_required' };
      if (!Number.isInteger(idx) || idx < 0) return { ok: false, error: 'invalid_idx' };
      if (!isValidStepName(name)) return { ok: false, error: 'invalid_step_name' };
      if (!STEP_RECORD_STATUSES.includes(status)) {
        return { ok: false, error: 'invalid_status (pending|skipped — use startStep to begin a step)' };
      }
      await dbClient(
        `INSERT INTO job_steps (job_id, idx, name, status, started_at, error)
         VALUES ($1, $2, $3, $4, NULL, $5)`,
        [jobId, idx, name, status, null],
      );
      return { ok: true };
    } catch (e) {
      return degrade(e);
    }
  }

  /**
   * Begin a registered step: status -> 'running' and started_at stamped
   * (AC-P4-1 durations become real). A plain UPDATE — T2 drives the
   * ordering; restarting an already-closed step overwrites it.
   */
  async function startStep(jobId, idx) {
    try {
      const schema = await ensureSchema();
      if (!schema.ok) return { ok: false, error: schema.error };
      if (!isNonEmptyString(jobId)) return { ok: false, error: 'job_id_required' };
      if (!Number.isInteger(idx) || idx < 0) return { ok: false, error: 'invalid_idx' };
      const rows = await dbClient(
        `UPDATE job_steps SET status = $3, started_at = $4 WHERE job_id = $1 AND idx = $2 RETURNING idx`,
        [jobId, idx, 'running', now()],
      );
      return { ok: true, updated: rows.length };
    } catch (e) {
      return degrade(e);
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
      return degrade(e);
    }
  }

  /**
   * Creator City Phase 1 (FEEDBACK item O): write-or-overwrite ONE step row in
   * a single statement — the station recorder (lib/station-recorder.mjs)
   * marks `station:<key>` rows at its reserved idx range without a prior
   * recordStep. 'running' stamps started_at (and clears finished_at/error);
   * succeeded|failed|skipped stamp finished_at and KEEP an earlier
   * started_at (a never-started skip stays started_at NULL). Name: the
   * pipeline vocabulary or a `station:<key>` name.
   */
  async function upsertStep(jobId, idx, name, { status, error = null } = {}) {
    try {
      const schema = await ensureSchema();
      if (!schema.ok) return { ok: false, error: schema.error };
      if (!isNonEmptyString(jobId)) return { ok: false, error: 'job_id_required' };
      if (!Number.isInteger(idx) || idx < 0) return { ok: false, error: 'invalid_idx' };
      if (!isValidStepName(name) && !STATION_STEP_RE.test(String(name))) return { ok: false, error: 'invalid_step_name' };
      if (!STEP_UPSERT_STATUSES.includes(status)) {
        return { ok: false, error: 'invalid_status (pending|running|succeeded|failed|skipped)' };
      }
      const at = now();
      const startedAt = status === 'running' || status === 'succeeded' || status === 'failed' ? at : null;
      const finishedAt = STEP_FINISH_STATUSES.includes(status) ? at : null;
      const rows = await dbClient(
        `INSERT INTO job_steps (job_id, idx, name, status, started_at, finished_at, error)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (job_id, idx) DO UPDATE SET
           name = EXCLUDED.name,
           status = EXCLUDED.status,
           started_at = CASE WHEN EXCLUDED.status = 'running' THEN EXCLUDED.started_at
                             ELSE COALESCE(job_steps.started_at, EXCLUDED.started_at) END,
           finished_at = EXCLUDED.finished_at,
           error = EXCLUDED.error
         RETURNING idx`,
        [jobId, idx, name, status, startedAt, finishedAt, error ?? null],
      );
      return { ok: true, updated: rows.length };
    } catch (e) {
      return degrade(e);
    }
  }

  /**
   * Creator City Phase 1: put N step rows back to 'pending' (started_at,
   * finished_at and error cleared) in ONE statement — the station recorder
   * starts each lane / slot from a clean strip. steps: [{ idx, name }].
   */
  async function resetSteps(jobId, steps) {
    try {
      const schema = await ensureSchema();
      if (!schema.ok) return { ok: false, error: schema.error };
      if (!isNonEmptyString(jobId)) return { ok: false, error: 'job_id_required' };
      if (!Array.isArray(steps) || steps.length === 0) return { ok: false, error: 'steps_required' };
      for (const s of steps) {
        if (!Number.isInteger(s?.idx) || s.idx < 0) return { ok: false, error: 'invalid_idx' };
        if (!isValidStepName(s.name) && !STATION_STEP_RE.test(String(s.name))) return { ok: false, error: 'invalid_step_name' };
      }
      const params = [jobId];
      const values = steps.map((s) => {
        params.push(s.idx, s.name);
        return `($1, $${params.length - 1}, $${params.length}, 'pending', NULL, NULL, NULL)`;
      });
      const rows = await dbClient(
        `INSERT INTO job_steps (job_id, idx, name, status, started_at, finished_at, error)
         VALUES ${values.join(', ')}
         ON CONFLICT (job_id, idx) DO UPDATE SET
           name = EXCLUDED.name,
           status = 'pending',
           started_at = NULL,
           finished_at = NULL,
           error = NULL
         RETURNING idx`,
        params,
      );
      return { ok: true, updated: rows.length };
    } catch (e) {
      return degrade(e);
    }
  }

  // ------------------------------------------------------------------
  // job_artifacts
  // ------------------------------------------------------------------

  /**
   * Index one produced file: sha256 of the raw BYTES (never the Phase 3
   * script-text hash, D1). Dedupe: the same bytes for the same job+step+kind
   * return the EXISTING row (duplicate: true) — AC-P4-2's "same hash, no
   * duplicate artifact row" — and when the existing row is an index-only
   * entry (blob_url NULL, a degraded upload) and we now hold a real URL, the
   * row is UPGRADED in place. The INSERT runs ON CONFLICT DO NOTHING + a
   * re-SELECT so a concurrent writer loses the race cleanly instead of
   * throwing. blob_url null is a legal index-only entry (D3) — resume must
   * treat it as re-run; that decision belongs to the caller.
   */
  async function indexArtifact(jobId, { step, kind, bytes, contentHash, blobUrl, size, meta } = {}) {
    try {
      const schema = await ensureSchema();
      if (!schema.ok) return { ok: false, error: schema.error };
      if (!isNonEmptyString(jobId)) return { ok: false, error: 'job_id_required' };
      if (!isValidStepName(step)) return { ok: false, error: 'invalid_step_name' };
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

      const dupWhere = [jobId, step, kind, hash];
      const dupSql = `SELECT id, content_hash, kind, step, blob_url FROM job_artifacts
         WHERE job_id = $1 AND step = $2 AND kind = $3 AND content_hash = $4`;
      const asDuplicate = async (row) => {
        const existingUrl = row.blob_url ?? null;
        if ((existingUrl === null || existingUrl === '') && isNonEmptyString(blobUrl)) {
          await dbClient(`UPDATE job_artifacts SET blob_url = $2 WHERE id = $1 RETURNING id`, [row.id, blobUrl]);
          return { ok: true, duplicate: true, upgraded: true, id: row.id, contentHash: hash, blobUrl };
        }
        return { ok: true, duplicate: true, upgraded: false, id: row.id, contentHash: hash, blobUrl: existingUrl };
      };

      const existing = await dbClient(dupSql, dupWhere);
      if (existing.length > 0) return asDuplicate(existing[0]);

      const inserted = await dbClient(
        `INSERT INTO job_artifacts (job_id, step, content_hash, kind, blob_url, bytes, meta)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (job_id, step, kind, content_hash) DO NOTHING
         RETURNING id`,
        [jobId, step, hash, kind, isNonEmptyString(blobUrl) ? blobUrl : null, byteCount,
          meta === undefined || meta === null ? null : JSON.stringify(meta)],
      );
      if (inserted.length === 0) {
        // Lost the insert race (a concurrent writer claimed the row): re-read
        // and resolve as a duplicate — never throw, never double-write.
        const raced = await dbClient(dupSql, dupWhere);
        if (raced.length > 0) return asDuplicate(raced[0]);
        return { ok: false, error: 'artifact_insert_conflict_unresolved' };
      }
      return { ok: true, duplicate: false, upgraded: false, id: inserted[0]?.id ?? null, contentHash: hash, blobUrl: blobUrl ?? null };
    } catch (e) {
      return degrade(e);
    }
  }

  // ------------------------------------------------------------------
  // readers (resume + drill inputs)
  // ------------------------------------------------------------------

  /**
   * The newest STALE resumable job for a channel: status 'failed' or still
   * 'running' (a killed worker never reaches finishJob — that stale-running
   * row IS the crash case, AC-P4-4), OLDER than the required staleAfterMs
   * window. Cancelled GHA runs never write a terminal, so stale-running rows
   * accumulate BY DESIGN — the age window is the safety that keeps a
   * live-running job from ever coming back as a resume target. 'held'
   * (approval, D15/D17), 'succeeded' and 'partial' (terminal, AC-P4-3) are
   * excluded. Steps come ordered by idx; artifacts ride along so the caller
   * can apply the skip condition (artifact row AND bytes retrievable —
   * review row 5).
   */
  async function latestResumableJob(channel, { staleAfterMs } = {}) {
    try {
      const schema = await ensureSchema();
      if (!schema.ok) return { ok: false, error: schema.error };
      if (!isNonEmptyString(channel)) return { ok: false, error: 'channel_required' };
      if (!Number.isFinite(staleAfterMs) || staleAfterMs < 0) {
        return { ok: false, error: 'stale_after_ms_required (age window — a live-running job must never be a resume target)' };
      }
      const cutoff = new Date(now().getTime() - staleAfterMs);
      const jobs = await dbClient(
        `SELECT id, channel, kind, status, "trigger", resumed_from_job_id, started_at, finished_at, error, meta
         FROM jobs WHERE channel = $1 AND status IN ('failed', 'running') AND started_at < $2
         ORDER BY started_at DESC LIMIT 1`,
        [channel, cutoff],
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
      return degrade(e);
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
      return degrade(e);
    }
  }

  return {
    ensureSchema,
    startJob,
    finishJob,
    recordStep,
    startStep,
    finishStep,
    upsertStep,
    resetSteps,
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
