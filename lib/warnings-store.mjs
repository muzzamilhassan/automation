// Phase 4 S3 (T4) — warnings table: the durable record behind every pipeline
// alert. Today everything alarming lives (and dies) in ntfy pushes: miss the
// phone and the event never existed. Spec D9-D12 pins the fix — one Neon row
// per alert with the policy research's severity ladder, the verbatim official
// citation for blocking rows, and an idempotent dedupe key so the same OPEN
// condition never spawns a second row (review finding 21 / L4; the nightly
// orphan re-find UPDATES last_checked, it does not re-insert — AC-P4-9).
//
// Severity ladder (research/platform-youtube-policy-compliance-2026-10-24.md
// §4.1): advisory < warning < action_required < blocking < critical.
//   - blocking  = §4.3 hard-block list — a VERIFIED technical constraint
//     (401 revoked token, 403 quotaExceeded, uploadLimitExceeded,
//     uploadStatus=rejected, account suspension...). YouTube-stated
//     impossibility, not our judgment.
//   - critical  = channel-level terminal signal (account suspended /
//     uploadStatus=terminated — §4.1 "stop pipeline, alert owner").
//   - everything else NEVER blocks publishing (§4.3: never block on policy
//     heuristics — disclosure gaps, inauthentic-content risk, YPP
//     uncertainty stay advisory/warning WITH citation).
//
// H9 emitter→severity constraint (review finding 10, AC-P4-12): a
// blocks_publishing=true write is REJECTED unless the emitter code is on
// PUBLISHING_PATH_CODES — production is never parked over an analytics read
// or a job-step failure. Enforced HERE (the single write choke point), not
// just in emitWarning, so no caller can bypass it.
//
// House patterns: lib/ai-adapter.mjs makeUsageWriter (ensure-schema-on-write,
// never-throw { ok } results, injected db client), lib/ntfy-alert.mjs
// sendAlert (write-and-alert, never throws).
import { sendAlert } from './ntfy-alert.mjs';

// §4.1 ladder, low → high. blocking = §4.3 hard-block set; critical =
// channel-terminal (§4.1 account-suspension rung). Order is load-bearing for
// UI chips and tests.
export const SEVERITIES = ['advisory', 'warning', 'action_required', 'blocking', 'critical'];

// H9 allowlist — the ONLY codes that may write blocks_publishing=TRUE (the
// exact publishing-path emitters from spec D9: revoked token, upload-path
// API error, verify-run publication failure). Everything else — job-step
// failures, analytics/collection failures, policy heuristics — is structurally
// unable to park production.
export const PUBLISHING_PATH_CODES = ['token_revoked', 'upload_failed', 'verify_publication_missing'];

const BLOCKING_SEVERITIES = ['blocking', 'critical'];

function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

// Redact anything secret-shaped before an error reaches a log line (house
// redactSecrets pattern from ai-adapter; DATABASE_URLs ride error messages).
function redactedError(e) {
  return String(e && e.message ? e.message : e)
    .replace(/(postgres(ql)?:\/\/)[^\s]+/gi, '$1REDACTED')
    .replace(/(Bearer\s+)[A-Za-z0-9._\-]+/gi, '$1REDACTED')
    .slice(0, 200);
}

// Returns null when fields are writable, else a machine error code.
function validateFields(f) {
  if (!f || typeof f !== 'object') return 'fields_required';
  if (!isNonEmptyString(f.channel_id)) return 'channel_id_required';
  if (!isNonEmptyString(f.code)) return 'code_required';
  if (!isNonEmptyString(f.title)) return 'title_required';
  if (!SEVERITIES.includes(f.severity)) return `severity_invalid (must be one of ${SEVERITIES.join('|')})`;
  const wantsPark = f.blocks_publishing === true;
  // H9 (AC-P4-12): only publishing-path emitters may park a channel.
  if (wantsPark && !PUBLISHING_PATH_CODES.includes(f.code)) {
    return `blocks_publishing_rejected: code '${f.code}' is not on the publishing-path allowlist (production is never parked over analytics/job-step/policy-heuristic emissions — spec D9, review finding 10)`;
  }
  if (wantsPark && !BLOCKING_SEVERITIES.includes(f.severity)) {
    return 'blocks_publishing_rejected: requires blocking or critical severity (§4.1 — only the hard-block rungs stop publishing)';
  }
  // §4.2: blocking rows carry the verbatim official quote + source (never a
  // blog) — the dashboard renders them; a park without a citation is our
  // judgment dressed as YouTube's (§4.3 developer-policy duty).
  if (BLOCKING_SEVERITIES.includes(f.severity) && !(isNonEmptyString(f.official_quote) && isNonEmptyString(f.official_source))) {
    return 'official_citation_required: blocking/critical rows need official_quote + official_source (policy §4.2)';
  }
  return null;
}

/**
 * Warnings store over an injected db client — the positional contract used by
 * makeUsageWriter/adaptPostgres: (sqlText, params) -> Promise<rows>. Never
 * throws: every method returns { ok: true, ... } | { ok: false, error } so a
 * dead Neon degrades to log-only + ntfy (AC-P4-5 posture) instead of halting
 * the pipeline.
 * @param {(sqlText: string, params: any[]) => Promise<any[]>} dbClient
 */
export function makeWarningsStore(dbClient) {
  if (typeof dbClient !== 'function') {
    throw new TypeError('makeWarningsStore: dbClient must be a function (sqlText, params) -> Promise<rows>');
  }

  let schemaPromise = null;

  // Idempotent schema, memoized per process (makeUsageWriter pattern). A
  // failed ensure resets the memo so the next write retries.
  async function ensureWarningsSchema() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        // dedupe_key + the PARTIAL unique index are the L4 idempotency
        // mechanism: UNIQUE(channel_id, code) scoped to the open window —
        // the same open condition can never double-insert, while a resolved
        // condition may freely recur (new park episode).
        await dbClient(`CREATE TABLE IF NOT EXISTS warnings (
          id bigserial PRIMARY KEY,
          channel_id TEXT NOT NULL,
          severity TEXT NOT NULL CHECK (severity IN ('advisory','warning','action_required','blocking','critical')),
          code TEXT NOT NULL,
          title TEXT NOT NULL,
          detail TEXT,
          classification TEXT,
          evidence TEXT,
          recommended_action TEXT,
          official_quote TEXT,
          official_source TEXT,
          quote_fetched_at timestamptz NOT NULL DEFAULT now(),
          auto_verifiable BOOLEAN NOT NULL DEFAULT false,
          blocks_publishing BOOLEAN NOT NULL DEFAULT false,
          state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open','acknowledged','resolved')),
          job_id TEXT,
          last_checked_at timestamptz,
          acknowledged_by TEXT,
          acknowledged_at timestamptz,
          resolved_by TEXT,
          resolved_at timestamptz,
          resolve_note TEXT,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          dedupe_key TEXT NOT NULL
        )`, []);
        await dbClient(`CREATE UNIQUE INDEX IF NOT EXISTS warnings_dedupe_open_uq
          ON warnings (dedupe_key) WHERE state <> 'resolved'`, []);
        await dbClient(`CREATE INDEX IF NOT EXISTS warnings_channel_state_idx
          ON warnings (channel_id, state)`, []);
        return { ok: true };
      })().catch((e) => {
        schemaPromise = null;
        return { ok: false, error: redactedError(e) };
      });
    }
    return schemaPromise;
  }

  /**
   * Open (or re-find) a warning. Idempotent per OPEN condition: the first
   * call inserts, any re-fire of the same channel+code bumps last_checked /
   * evidence in place and returns { deduped: true } — the same open condition
   * NEVER creates a second row (L4; AC-P4-9 orphan semantics). A resolved
   * row releases the dedupe key: a genuine recurrence is a new episode.
   */
  async function openWarning(fields) {
    try {
      const invalid = validateFields(fields);
      if (invalid) return { ok: false, error: invalid };
      const ensured = await ensureWarningsSchema();
      if (!ensured.ok) return { ok: false, error: ensured.error };

      const dedupeKey = isNonEmptyString(fields.dedupe_key) ? fields.dedupe_key : `${fields.channel_id}:${fields.code}`;
      const existing = await dbClient(
        `SELECT id, state FROM warnings WHERE dedupe_key = $1 AND state <> 'resolved' LIMIT 1`,
        [dedupeKey],
      );
      if (existing?.length) {
        const id = existing[0].id;
        // Re-found condition: stamp the check, refresh evidence — never a
        // duplicate row, never a second alert (once per park EPISODE, D11).
        await dbClient(
          `UPDATE warnings SET last_checked_at = now(), updated_at = now(), evidence = COALESCE($2, evidence)
           WHERE id = $1 RETURNING id`,
          [id, fields.evidence ?? null],
        );
        return { ok: true, id, deduped: true };
      }
      const rows = await dbClient(
        `INSERT INTO warnings
           (channel_id, severity, code, title, detail, classification, evidence, recommended_action,
            official_quote, official_source, auto_verifiable, blocks_publishing, state, job_id, dedupe_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING id`,
        [
          fields.channel_id,
          fields.severity,
          fields.code,
          fields.title,
          fields.detail ?? null,
          fields.classification ?? null,
          fields.evidence ?? null,
          fields.recommended_action ?? null,
          fields.official_quote ?? null,
          fields.official_source ?? null,
          fields.auto_verifiable === true,
          fields.blocks_publishing === true,
          'open',
          fields.job_id ?? null,
          dedupeKey,
        ],
      );
      return { ok: true, id: rows?.[0]?.id ?? null, deduped: false };
    } catch (e) {
      // 23505 = unique_violation. A concurrent lane won the SELECT/INSERT
      // race on the same open key — that IS the dedupe path succeeding.
      if (String(e?.code ?? '') === '23505') return { ok: true, id: null, deduped: true };
      return { ok: false, error: redactedError(e) };
    }
  }

  /** Record "seen" (by/at). Acknowledging never unblocks — D11: a revoked
   * token is not un-revoked by acknowledging it; only resolve() clears. */
  async function acknowledge(id, { by } = {}) {
    try {
      if (!isNonEmptyString(by)) return { ok: false, error: 'acknowledged_by_required' };
      const ensured = await ensureWarningsSchema();
      if (!ensured.ok) return { ok: false, error: ensured.error };
      const rows = await dbClient(
        `UPDATE warnings SET state = 'acknowledged', acknowledged_by = $1, acknowledged_at = now(), updated_at = now()
         WHERE id = $2 AND state <> 'resolved' RETURNING id`,
        [by, id],
      );
      return { ok: true, id: rows?.[0]?.id ?? null };
    } catch (e) {
      return { ok: false, error: redactedError(e) };
    }
  }

  /** Resolve with an audit trail (AC-P4-15: manual resolves are recorded,
   * never silent). The escape hatch for anything the probes cannot see. */
  async function resolve(id, { by, note = null } = {}) {
    try {
      if (!isNonEmptyString(by)) return { ok: false, error: 'resolved_by_required' };
      const ensured = await ensureWarningsSchema();
      if (!ensured.ok) return { ok: false, error: ensured.error };
      const rows = await dbClient(
        `UPDATE warnings SET state = 'resolved', resolved_by = $1, resolve_note = $2, resolved_at = now(), updated_at = now()
         WHERE id = $3 AND state <> 'resolved' RETURNING id`,
        [by, note, id],
      );
      return { ok: true, id: rows?.[0]?.id ?? null };
    } catch (e) {
      return { ok: false, error: redactedError(e) };
    }
  }

  /** Stamp last_checked without touching state (probe ran, row stays). */
  async function markChecked(id) {
    try {
      const ensured = await ensureWarningsSchema();
      if (!ensured.ok) return { ok: false, error: ensured.error };
      await dbClient(
        `UPDATE warnings SET last_checked_at = now(), updated_at = now() WHERE id = $1`,
        [id],
      );
      return { ok: true, id };
    } catch (e) {
      return { ok: false, error: redactedError(e) };
    }
  }

  /**
   * The parking predicate (D11/AC-P4-13): open rows that block publishing.
   * channelId null enumerates EVERY parked channel (nightly probe job);
   * acknowledge does NOT clear the predicate, only resolve does.
   */
  async function openBlockingFor(channelId = null) {
    try {
      const ensured = await ensureWarningsSchema();
      if (!ensured.ok) return { ok: false, error: ensured.error };
      const sql = channelId
        ? `SELECT * FROM warnings WHERE blocks_publishing = TRUE AND state <> 'resolved' AND channel_id = $1 ORDER BY created_at DESC`
        : `SELECT * FROM warnings WHERE blocks_publishing = TRUE AND state <> 'resolved' ORDER BY created_at DESC`;
      const rows = await dbClient(sql, channelId ? [channelId] : []);
      return { ok: true, rows: rows ?? [] };
    } catch (e) {
      return { ok: false, error: redactedError(e) };
    }
  }

  /**
   * Conditional auto-resolve (AC-P4-14): clear the open warning for
   * channel+code — but ONLY if the row is auto_verifiable (AC-P4-15: a probe
   * must be able to SEE the condition; non-verifiable rows un-park via a
   * passing probe or the owner's manual resolve, nothing else).
   */
  async function autoResolveIf({ channel_id, code, by = 'auto-resolve', note = null } = {}) {
    try {
      if (!isNonEmptyString(channel_id) || !isNonEmptyString(code)) {
        return { ok: false, error: 'channel_id_and_code_required' };
      }
      const ensured = await ensureWarningsSchema();
      if (!ensured.ok) return { ok: false, error: ensured.error };
      const rows = await dbClient(
        `SELECT id, auto_verifiable FROM warnings
         WHERE channel_id = $1 AND code = $2 AND state <> 'resolved'
         ORDER BY created_at DESC LIMIT 1`,
        [channel_id, code],
      );
      if (!rows?.length) return { ok: true, resolved: false, reason: 'no_open_warning' };
      if (rows[0].auto_verifiable !== true) return { ok: true, resolved: false, reason: 'not_auto_verifiable' };
      const r = await resolve(rows[0].id, { by, note: note ?? `auto-resolved: ${code} condition cleared` });
      return r.ok ? { ok: true, resolved: true, id: rows[0].id } : r;
    } catch (e) {
      return { ok: false, error: redactedError(e) };
    }
  }

  return { ensureWarningsSchema, openWarning, acknowledge, resolve, markChecked, openBlockingFor, autoResolveIf };
}

/**
 * Emitter helper (D9 "write-and-alert"): every alert site writes its row AND
 * fires the existing ntfy push — the push never disappears (AC-P4-11). The
 * H9 allowlist is enforced inside openWarning, so a non-publishing emitter
 * asking for blocks_publishing is rejected before any write. Alerting is
 * once per park EPISODE: a deduped re-fire updates the row silently (D11).
 * Never throws; an alert failure never fails the write.
 */
export async function emitWarning(store, fields, opts = {}) {
  const send = opts.sendAlert || sendAlert;
  let write;
  try {
    write = await store.openWarning(fields);
  } catch (e) {
    write = { ok: false, error: redactedError(e) };
  }
  // Deduped re-fire: row already open, push already sent this episode.
  if (write.ok && write.deduped) return { ...write, alert: null };

  const title = `[${fields?.severity ?? 'unknown'}] ${fields?.code ?? 'warning'}: ${fields?.title ?? 'pipeline warning'}`;
  const lines = [
    `channel: ${fields?.channel_id ?? 'system'}`,
    `severity: ${fields?.severity ?? 'unknown'}${fields?.blocks_publishing ? ' — PUBLISHING BLOCKED' : ''}`,
    fields?.detail ? `detail: ${fields.detail}` : '',
    fields?.evidence ? `evidence: ${fields.evidence}` : '',
    fields?.official_source ? `source: ${fields.official_source}` : '',
    write.ok ? '' : `warnings store unavailable (${write.error}) — ntfy is the fallback channel (AC-P4-5)`,
  ];
  let alert = { channel: 'none', ok: false };
  try {
    alert = await send({ title, text: lines.filter(Boolean).join('\n') });
  } catch (e) {
    alert = { channel: 'none', ok: false, error: redactedError(e) };
  }
  return { ...write, alert };
}

// Real-path store: lazily built over studio/lib/db.mjs (same lazy-import seam
// as ai-adapter's default usage writer), memoized per process. Null -> the
// caller degrades to ntfy-only; a missing DATABASE_URL must not halt the run.
let defaultStorePromise = null;
export async function getDefaultWarningsStore() {
  if (!defaultStorePromise) {
    defaultStorePromise = (async () => {
      try {
        const { db, dbReady } = await import('../studio/lib/db.mjs');
        if (!dbReady || !db) return null;
        const { adaptPostgres } = await import('../studio/lib/provider-routing.js');
        const store = makeWarningsStore(adaptPostgres(db));
        const ensured = await store.ensureWarningsSchema();
        return ensured.ok ? store : null;
      } catch {
        return null;
      }
    })();
  }
  return defaultStorePromise;
}
