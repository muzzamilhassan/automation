// #106 Phase 4 T5 (S4) — script store: scripts / script_sources / script_claims
// (spec D14, AC-P4-17). The record of record for review STATE: full text,
// sources[], claims[] (which claim cites which source), the COMPLETE
// structured render input (hook/points/closing/thumbHeadline + seed + themes +
// publishAt — D4: a resume never re-generates), template id+version, the
// Phase 3 dedupe verdict id, and the job id. `script_memory` (Phase 3) stays
// the embedding corpus for script TEXT; `scripts` is what /review queries and
// what the S5 win-rate join reads (scripts.video_id × snapshots, D20).
//
// LOCATION NOTE: canonical implementation lives inside the Studio Next.js
// root (Turbopack pins `root: '.'` — imports reaching outside fail
// `next build`). lib/script-store.mjs at the repo root is a re-export shim,
// so the pipeline gate, the nightly sweep, and the tests keep importing
// './lib/script-store.mjs' — same split as the #104 quota ledger / S5
// analytics store.
//
// STATUS VOCABULARY (D14): draft | awaiting_review | approved | rejected |
// consumed. awaiting_review = held for the owner (D15 gate); approved =
// owner approval recorded (+ dispatch, D16); rejected = the lane terminal —
// the script never uploads (D17); consumed = uploaded — video_id is the
// WRITE-BACK SEAM (D14: the upload sites hold both videoId and job_id and
// write it back here; latestApproved() + markConsumed() are the call pair).
// Audit columns ride both approval (approval_by/at/note) and rejection
// (rejected_by/at/note) — owner decisions are never silent (D16).
//
// THE ONE-TRANSACTION SAVE (D14): saveScript writes the script row, every
// source, and every claim inside ONE BEGIN..COMMIT emitted through the
// injected client (services/ai/brain/store.py transaction precedent) — a
// failure mid-save ROLLBACKs the whole record, never a script without its
// sources.
//
// House patterns: lib/job-store.mjs makeJobStore / lib/ai-adapter.mjs
// makeUsageWriter — ensure-schema-on-write, injected deps
// ({ dbClient, warn, now }), writers that NEVER throw ({ ok } results,
// memoized warn per error class). Client contract: `dbClient(sqlText,
// params)` -> Promise<rowObject[]>; $1..$n placeholders; snake_case rows.
import { randomUUID } from 'node:crypto';

export const SCRIPT_STATUSES = ['draft', 'awaiting_review', 'approved', 'rejected', 'consumed'];
export const CLAIM_VERIFICATIONS = ['verified', 'unverified', 'flagged'];

function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

function redact(e) {
  return String(e && e.message ? e.message : e).slice(0, 200);
}

function errorClass(e) {
  const msg = String(e && e.message ? e.message : e);
  if (/duplicate key|unique constraint|foreign key|violates|conflict/i.test(msg)) return 'constraint';
  if (/econn(refused|reset|aborted)|etimedout|enotfound|eai_again|connection|timeout|timed out|terminated|too many (clients|connections)/i.test(msg)) return 'connection';
  return 'other';
}

const SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS scripts (
    id uuid PRIMARY KEY,
    channel_id text NOT NULL,
    template_id text,
    template_version text,
    kind text,
    title text,
    full_render_input jsonb,
    text text,
    status text NOT NULL DEFAULT 'awaiting_review'
      CHECK (status IN ('draft','awaiting_review','approved','rejected','consumed')),
    video_id text,
    job_id text,
    dedupe_verdict_id bigint,
    slot_date text,
    slot_idx integer,
    publish_at timestamptz,
    approval_by text,
    approval_at timestamptz,
    approval_note text,
    rejected_by text,
    rejected_at timestamptz,
    rejected_note text,
    meta jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS scripts_channel_status_idx ON scripts (channel_id, status)`,
  `CREATE TABLE IF NOT EXISTS script_sources (
    id bigserial PRIMARY KEY,
    script_id uuid NOT NULL,
    url text NOT NULL,
    title text,
    snippet text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS script_sources_script_idx ON script_sources (script_id)`,
  `CREATE TABLE IF NOT EXISTS script_claims (
    id bigserial PRIMARY KEY,
    script_id uuid NOT NULL,
    claim text NOT NULL,
    source_id bigint,
    verification text NOT NULL DEFAULT 'unverified'
      CHECK (verification IN ('verified','unverified','flagged')),
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS script_claims_script_idx ON script_claims (script_id)`,
];

export function makeScriptStore(deps) {
  const dbClient = deps?.dbClient;
  if (typeof dbClient !== 'function') {
    throw new TypeError('makeScriptStore: deps.dbClient must be a function (sqlText, params) -> Promise<rows>');
  }
  const warn = typeof deps.warn === 'function' ? deps.warn : console.warn;
  const now = typeof deps.now === 'function' ? deps.now : (() => new Date());

  let schemaReady = false;
  const warnedClasses = new Set();
  const warnOnce = (e) => {
    const cls = errorClass(e);
    if (warnedClasses.has(cls)) return;
    warnedClasses.add(cls);
    warn(`[script-store] degraded (${cls}) — script records skipped, the lane continues (${redact(e)})`);
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
      return degrade(e);
    }
  }

  /**
   * Validate one save up front — every rejection here happens BEFORE any SQL
   * runs (a caller bug must never half-write a record).
   */
  function validateSave(f) {
    if (!isNonEmptyString(f.channelId)) return 'channel_id_required';
    if (!isNonEmptyString(f.text)) return 'text_required';
    if (f.status !== undefined && f.status !== null && !SCRIPT_STATUSES.includes(f.status)) {
      return `invalid_status (must be one of ${SCRIPT_STATUSES.join('|')})`;
    }
    if (f.fullRenderInput === null || typeof f.fullRenderInput !== 'object' || Array.isArray(f.fullRenderInput)) {
      return 'full_render_input_required (the COMPLETE render input — a resume must never re-generate, D4)';
    }
    const sources = Array.isArray(f.sources) ? f.sources : [];
    for (let i = 0; i < sources.length; i++) {
      if (!sources[i] || !isNonEmptyString(sources[i].url)) return `source_url_required (sources[${i}])`;
    }
    const claims = Array.isArray(f.claims) ? f.claims : [];
    for (let i = 0; i < claims.length; i++) {
      const c = claims[i];
      if (!c || !isNonEmptyString(c.claim)) return `claim_required (claims[${i}])`;
      if (!CLAIM_VERIFICATIONS.includes(c.verification)) {
        return `invalid_verification (claims[${i}]: must be one of ${CLAIM_VERIFICATIONS.join('|')})`;
      }
      if (c.sourceIdx !== undefined && c.sourceIdx !== null
        && (!Number.isInteger(c.sourceIdx) || c.sourceIdx < 0 || c.sourceIdx >= sources.length)) {
        return `invalid_source_index (claims[${i}]: sourceIdx must reference a sources[] entry or be null)`;
      }
    }
    return null;
  }

  /**
   * THE save (AC-P4-17): script + sources[] + claims[] in ONE transaction.
   * Claim→source links resolve by sourceIdx into the sources array; a null
   * sourceIdx is an unsourced claim (source_id NULL — legal, the review panel
   * flags it). Returns { ok, id } or { ok:false, error }.
   */
  async function saveScript(fields = {}) {
    const invalid = validateSave(fields);
    if (invalid) return { ok: false, error: invalid };
    const ensured = await ensureSchema();
    if (!ensured.ok) return { ok: false, error: ensured.error };

    const id = randomUUID();
    const status = fields.status ?? 'awaiting_review';
    let txStarted = false;
    try {
      await dbClient('BEGIN', []);
      txStarted = true;
      await dbClient(
        `INSERT INTO scripts (id, channel_id, template_id, template_version, kind, title, text, full_render_input, status, job_id, dedupe_verdict_id, slot_date, slot_idx, publish_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
        [id, fields.channelId, fields.templateId ?? null, fields.templateVersion ?? null, fields.kind ?? null,
          fields.title ?? null, fields.text, JSON.stringify(fields.fullRenderInput), status,
          fields.jobId ?? null, fields.dedupeVerdictId ?? null, fields.slotDate ?? null,
          Number.isInteger(fields.slotIdx) ? fields.slotIdx : null, fields.publishAt ?? null],
      );
      const sourceIds = [];
      for (const s of fields.sources) {
        const rows = await dbClient(
          `INSERT INTO script_sources (script_id, url, title, snippet) VALUES ($1,$2,$3,$4) RETURNING id`,
          [id, s.url, s.title ?? null, s.snippet ?? null],
        );
        sourceIds.push(rows?.[0]?.id ?? null);
      }
      for (const c of fields.claims) {
        const sourceId = c.sourceIdx === undefined || c.sourceIdx === null ? null : sourceIds[c.sourceIdx];
        await dbClient(
          `INSERT INTO script_claims (script_id, claim, source_id, verification) VALUES ($1,$2,$3,$4)`,
          [id, c.claim, sourceId, c.verification],
        );
      }
      await dbClient('COMMIT', []);
      return { ok: true, id };
    } catch (e) {
      if (txStarted) {
        try { await dbClient('ROLLBACK', []); } catch { /* the connection is already gone */ }
      }
      return degrade(e);
    }
  }

  /** Current status (for the not_found vs not_open UI distinction). */
  async function statusOf(id) {
    const rows = await dbClient(`SELECT status FROM scripts WHERE id = $1`, [id]);
    return rows?.length ? rows[0].status : null;
  }

  /**
   * Owner approval (D16): awaiting_review -> approved with the audit fields.
   * Unknown id -> { ok:false, reason:'not_found' }; anything not
   * awaiting_review -> { ok:false, reason:'not_open' } (mirrors
   * warnings-store's acknowledge/resolve reasons).
   */
  async function approve(id, { by, note = null } = {}) {
    try {
      if (!isNonEmptyString(by)) return { ok: false, error: 'approval_by_required' };
      const ensured = await ensureSchema();
      if (!ensured.ok) return { ok: false, error: ensured.error };
      const cur = await statusOf(id);
      if (!cur) return { ok: false, reason: 'not_found' };
      if (cur !== 'awaiting_review') return { ok: false, reason: 'not_open' };
      const rows = await dbClient(
        `UPDATE scripts SET status = 'approved', approval_by = $2, approval_at = $3, approval_note = $4, updated_at = $3
         WHERE id = $1 AND status = 'awaiting_review' RETURNING id`,
        [id, by, now(), note],
      );
      if (!rows.length) return { ok: false, reason: 'not_open' };
      return { ok: true, id };
    } catch (e) {
      return degrade(e);
    }
  }

  /** Owner rejection (D17): awaiting_review -> rejected; a rejected script
   * never uploads and the slot takes the lane terminal. */
  async function reject(id, { by, note = null } = {}) {
    try {
      if (!isNonEmptyString(by)) return { ok: false, error: 'rejected_by_required' };
      const ensured = await ensureSchema();
      if (!ensured.ok) return { ok: false, error: ensured.error };
      const cur = await statusOf(id);
      if (!cur) return { ok: false, reason: 'not_found' };
      if (cur !== 'awaiting_review') return { ok: false, reason: 'not_open' };
      const rows = await dbClient(
        `UPDATE scripts SET status = 'rejected', rejected_by = $2, rejected_at = $3, rejected_note = $4, updated_at = $3
         WHERE id = $1 AND status = 'awaiting_review' RETURNING id`,
        [id, by, now(), note],
      );
      if (!rows.length) return { ok: false, reason: 'not_open' };
      return { ok: true, id };
    } catch (e) {
      return degrade(e);
    }
  }

  /**
   * The /review list (D16): awaiting_review scripts — channel, template,
   * title, the Phase 3 dedupe verdict joined, created_at for the age column.
   * channelId null enumerates every channel's queue.
   */
  async function pendingFor(channelId = null) {
    try {
      const ensured = await ensureSchema();
      if (!ensured.ok) return { ok: false, error: ensured.error };
      const sql = `SELECT s.id, s.channel_id, s.template_id, s.template_version, s.kind, s.title, s.text, s.status,
         s.video_id, s.job_id, s.slot_date, s.slot_idx, s.publish_at, s.meta, s.created_at,
         d.verdict AS dedupe_verdict, d.score AS dedupe_score
       FROM scripts s LEFT JOIN dedupe_verdicts d ON d.id = s.dedupe_verdict_id
       WHERE s.status = 'awaiting_review'${channelId ? ' AND s.channel_id = $1' : ''}
       ORDER BY s.created_at ASC`;
      const rows = await dbClient(sql, channelId ? [channelId] : []);
      return { ok: true, scripts: rows ?? [] };
    } catch (e) {
      return degrade(e);
    }
  }

  /** One script with its sources and claims — the side-by-side review payload. */
  async function getScript(id) {
    try {
      const ensured = await ensureSchema();
      if (!ensured.ok) return { ok: false, error: ensured.error };
      const rows = await dbClient(`SELECT * FROM scripts WHERE id = $1`, [id]);
      if (!rows?.length) return { ok: true, script: null, sources: [], claims: [] };
      const [sources, claims] = await Promise.all([
        dbClient(`SELECT id, script_id, url, title, snippet FROM script_sources WHERE script_id = $1 ORDER BY id ASC`, [id]),
        dbClient(`SELECT id, script_id, claim, source_id, verification FROM script_claims WHERE script_id = $1 ORDER BY id ASC`, [id]),
      ]);
      return { ok: true, script: rows[0], sources: sources ?? [], claims: claims ?? [] };
    } catch (e) {
      return degrade(e);
    }
  }

  /** The newest approved, unconsumed script for a channel — the write-back
   * call site's lookup (D14: the upload sites hold videoId + job_id). */
  async function latestApproved(channelId) {
    try {
      const ensured = await ensureSchema();
      if (!ensured.ok) return { ok: false, error: ensured.error };
      const rows = await dbClient(
        `SELECT * FROM scripts WHERE channel_id = $1 AND status = 'approved' ORDER BY created_at DESC LIMIT 1`,
        [channelId],
      );
      return { ok: true, script: rows?.[0] ?? null };
    } catch (e) {
      return degrade(e);
    }
  }

  /** Every script row for channel+slot, newest first — the gate's slot lookup. */
  async function scriptsForSlot(channelId, slotDate) {
    try {
      const ensured = await ensureSchema();
      if (!ensured.ok) return { ok: false, error: ensured.error };
      const rows = await dbClient(
        `SELECT * FROM scripts WHERE channel_id = $1 AND slot_date = $2 ORDER BY created_at DESC`,
        [channelId, slotDate],
      );
      return { ok: true, scripts: rows ?? [] };
    } catch (e) {
      return degrade(e);
    }
  }

  /**
   * The newest script row linked to a JOB id — the resumed-run approval
   * lookup (round-1 MAJOR 5): the approval dispatches resume=<held job id>,
   * and the resumed run may happen days after the slot date, so the gate
   * resolves the held job's script by job_id first.
   */
  async function latestForJob(jobId) {
    try {
      const ensured = await ensureSchema();
      if (!ensured.ok) return { ok: false, error: ensured.error };
      const rows = await dbClient(
        `SELECT * FROM scripts WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [jobId],
      );
      return { ok: true, script: rows?.[0] ?? null };
    } catch (e) {
      return degrade(e);
    }
  }

  /**
   * THE write-back (D14): the upload's videoId lands on the script row and
   * the record retires to consumed. Only an approved script consumes — an
   * awaiting/rejected row can never be claimed by an upload.
   */
  async function markConsumed(id, videoId) {
    try {
      if (!isNonEmptyString(videoId)) return { ok: false, error: 'video_id_required' };
      const ensured = await ensureSchema();
      if (!ensured.ok) return { ok: false, error: ensured.error };
      const cur = await statusOf(id);
      if (!cur) return { ok: false, reason: 'not_found' };
      if (cur !== 'approved') return { ok: false, reason: 'not_open' };
      const rows = await dbClient(
        `UPDATE scripts SET status = 'consumed', video_id = $2, updated_at = $3 WHERE id = $1 AND status = 'approved' RETURNING id`,
        [id, videoId, now()],
      );
      if (!rows.length) return { ok: false, reason: 'not_open' };
      return { ok: true, id };
    } catch (e) {
      return degrade(e);
    }
  }

  /** Merge the thumbnail pick into meta (D18 pick state lives on the record:
   * { thumb_pick: { candidate, at, by, applied } }). Round-1 minor 11: only
   * an uploaded script may take a pick — approved (pre-consume) or consumed
   * (uploaded; the recorded-not-applied case). */
  async function recordThumbPick(id, pick) {
    try {
      const ensured = await ensureSchema();
      if (!ensured.ok) return { ok: false, error: ensured.error };
      const cur = await statusOf(id);
      if (!cur) return { ok: false, reason: 'not_found' };
      if (cur !== 'approved' && cur !== 'consumed') return { ok: false, reason: 'not_open' };
      const rows = await dbClient(`SELECT meta FROM scripts WHERE id = $1`, [id]);
      let meta = {};
      try { meta = rows?.length && rows[0].meta ? (typeof rows[0].meta === 'string' ? JSON.parse(rows[0].meta) : rows[0].meta) : {}; } catch { meta = {}; }
      meta.thumb_pick = pick;
      await dbClient(`UPDATE scripts SET meta = $2 WHERE id = $1`, [id, JSON.stringify(meta)]);
      return { ok: true, id, meta };
    } catch (e) {
      return degrade(e);
    }
  }

  return {
    ensureSchema,
    saveScript,
    approve,
    reject,
    pendingFor,
    getScript,
    latestApproved,
    scriptsForSlot,
    latestForJob,
    markConsumed,
    recordThumbPick,
  };
}

/**
 * Production entry point — lazy-imports the Neon client so importing this
 * module never touches the DB layer (unit tests and non-Neon machines stay
 * safe). NULL-degrading (upload-intents seam): the pipeline gate treats null
 * as "review state unavailable" and logs — a missing DATABASE_URL never
 * halts production setup (AC-P4-5).
 */
export async function getScriptStore() {
  try {
    const { db, dbReady } = await import('./db.mjs');
    if (!dbReady || !db) return null;
    const { adaptPostgres } = await import('./provider-routing.js');
    return makeScriptStore({ dbClient: adaptPostgres(db) });
  } catch {
    return null;
  }
}

export default getScriptStore;
