// Phase 4 S3 (T4) — warnings table: the durable record behind every pipeline
// alert. Today everything alarming lives (and dies) in ntfy pushes: miss the
// phone and the event never existed. Spec D9-D12 pins the fix — one Neon row
// per alert with the policy research's severity ladder, the verbatim official
// citation for blocking rows, and an idempotent dedupe key so the same OPEN
// condition never spawns a second row (review finding 21 / L4; the nightly
// orphan re-find UPDATES last_checked, it does not re-insert — AC-P4-9).
//
// SEVERITY LADDER — spec D9, verbatim: "severity (Blocking | Action-required |
// Warning | Advisory | Informational — the §4.1 ladder)", encoded low→high:
//   advisory < warning < action_required < blocking < informational.
// (research/platform-youtube-policy-compliance-2026-10-24.md §4.1-4.3.)
//   - blocking       = D10's hard-block list VERBATIM — verified technical
//     constraints ONLY: 401 revoked/expired token (insufficientPermissions,
//     youtubeSignupRequired), 403 quotaExceeded, 400 uploadLimitExceeded,
//     uploadStatus=rejected, authenticatedUserAccountSuspended/channelClosed,
//     longUploadsStatus=disallowed for >15-min renders, thumbnails.set 403
//     when a custom thumbnail is required. Account suspension folds into
//     BLOCKING per D10 — it is a YouTube-stated impossibility, not a rung of
//     its own.
//   - action_required = something YouTube rejected/changed and someone must
//     fix (§4.1) — e.g. uploadStatus=terminated, privacyStatus drift.
//   - never block on policy heuristics (§4.3): inauthentic/reused/spam risk,
//     disclosure gaps, YPP uncertainty stay advisory/warning WITH citation.
//     Developer-policy duty (§4.3): don't present our judgment as YouTube's.
//
// THE PARK PREDICATE (D11/AC-P4-13) — openBlockingFor() (blocks_publishing =
// TRUE AND state <> 'resolved') is THE predicate T2's pipeline park-check
// consumes. NEVER severity-matching: severity is a UI chip; blocks_publishing
// is the contract. The severity door below makes a blocking chip for a non-
// hard-block condition UNREPRESENTABLE.
//
// H9 emitter→severity constraint (review finding 10, AC-P4-12): a
// blocks_publishing=true write is REJECTED unless the emitter code is on
// PUBLISHING_PATH_CODES — production is never parked over an analytics read
// or a job-step failure. Enforced HERE (the single write choke point), not
// just in emitWarning, so no caller can bypass it.
//
// T5-facing column list (D9): id, channel_id, severity, code, title,
// explanation (plain English), classification, evidence, recommended_action,
// policy_quote, policy_url, quote_fetched_at, auto_verifiable, blocks_publishing,
// state, job_id, last_checked_at, acknowledged_by/at, resolved_by/resolve_note/
// resolved_at, created_at, updated_at, dedupe_key.
//
// House patterns: lib/ai-adapter.mjs makeUsageWriter (ensure-schema-on-write,
// never-throw { ok } results, injected db client), lib/ntfy-alert.mjs
// sendAlert (write-and-alert, never throws).
import { sendAlert } from './ntfy-alert.mjs';

// §4.1/D9 ladder, low → high. Order is load-bearing for UI chips and tests.
export const SEVERITIES = ['advisory', 'warning', 'action_required', 'blocking', 'informational'];

// H9 allowlist — the ONLY codes that may write blocks_publishing=TRUE (the
// exact publishing-path emitters from spec D9: revoked token, upload-path
// API error, verify-run publication failure). Everything else — job-step
// failures, analytics/collection failures, policy heuristics — is structurally
// unable to park production.
export const PUBLISHING_PATH_CODES = ['token_revoked', 'upload_failed', 'verify_publication_missing'];

// The severity CHECK as a SQL fragment — one source of truth for the CREATE
// TABLE and the migration below.
const SEVERITY_CHECK_SQL = `severity IN ('advisory','warning','action_required','blocking','informational')`;

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

// Returns null when fields are writable, else a machine error code. Every
// rejection here makes openWarning return { ok:false, rejected:true }.
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
  if (wantsPark && f.severity !== 'blocking') {
    return 'blocks_publishing_rejected: requires blocking severity (§4.1 — blocking is the only publish-blocked rung)';
  }
  // The severity door: a blocking chip for anything off the §4.3 hard-block
  // path is UNREPRESENTABLE — blocking rows must be allowlisted codes that
  // actually set blocks_publishing (which is what the park predicate reads).
  if (f.severity === 'blocking' && !PUBLISHING_PATH_CODES.includes(f.code)) {
    return `blocking_severity_requires_publishing_path_code: '${f.code}' is not a verified hard-block condition (§4.3) — use action_required/warning/advisory/informational`;
  }
  if (f.severity === 'blocking' && !wantsPark) {
    return 'blocking_severity_requires_blocks_publishing: blocking rows must set blocks_publishing=true — openBlockingFor (the park predicate) keys on blocks_publishing, never on severity chips';
  }
  // §4.2/D9: blocking rows carry the verbatim official quote + official URL
  // (never a blog) — the dashboard renders them; a park without a citation is
  // our judgment dressed as YouTube's (§4.3 developer-policy duty).
  if (f.severity === 'blocking' && !(isNonEmptyString(f.policy_quote) && isNonEmptyString(f.policy_url))) {
    return 'policy_citation_required: blocking rows need policy_quote + policy_url (policy §4.2)';
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

  // Idempotent schema + D9 migration, memoized per process (makeUsageWriter
  // pattern). A failed ensure resets the memo so the next write retries.
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
          severity TEXT NOT NULL CHECK (${SEVERITY_CHECK_SQL}),
          code TEXT NOT NULL,
          title TEXT NOT NULL,
          explanation TEXT,
          classification TEXT,
          evidence TEXT,
          recommended_action TEXT,
          policy_quote TEXT,
          policy_url TEXT,
          quote_fetched_at timestamptz,
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
        // --- D9 ladder migration (round 1) ---
        // The table already exists on live Neon (created by the T4 smoke run
        // BEFORE review) with two deviances: a severity CHECK containing the
        // invented 'critical' rung, and the pre-review column names. Both are
        // fixed idempotently here — every ensure re-checks and only mutates
        // when the live shape differs from D9.
        await dbClient(`DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'warnings_severity_check'
      AND conrelid = 'warnings'::regclass
      AND pg_get_constraintdef(oid) LIKE '%informational%'
  ) THEN
    ALTER TABLE warnings DROP CONSTRAINT IF EXISTS warnings_severity_check;
    ALTER TABLE warnings ADD CONSTRAINT warnings_severity_check
      CHECK (${SEVERITY_CHECK_SQL});
  END IF;
END $$`, []);
        // Column renames (official_* → policy_*, detail → explanation) plus
        // the stale DEFAULT now() on quote_fetched_at (fetch date is
        // caller-provided — silent now() stamps would lie on the dashboard).
        await dbClient(`DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'warnings' AND column_name = 'detail')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'warnings' AND column_name = 'explanation') THEN
    ALTER TABLE warnings RENAME COLUMN detail TO explanation;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'warnings' AND column_name = 'official_quote')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'warnings' AND column_name = 'policy_quote') THEN
    ALTER TABLE warnings RENAME COLUMN official_quote TO policy_quote;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'warnings' AND column_name = 'official_source')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'warnings' AND column_name = 'policy_url') THEN
    ALTER TABLE warnings RENAME COLUMN official_source TO policy_url;
  END IF;
  ALTER TABLE warnings ALTER COLUMN quote_fetched_at DROP DEFAULT;
  -- audit 2026-11-13 #4: live Neon carried warnings_quote_fetched_at_not_null;
  -- only blocking rows cite a policy, so most inserts (null) failed.
  ALTER TABLE warnings ALTER COLUMN quote_fetched_at DROP NOT NULL;
END $$`, []);
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
   * Validation failures return { ok:false, rejected:true, error } — a caller
   * bug (e.g. an H9 violation), distinct from a store failure.
   */
  async function openWarning(fields) {
    try {
      const invalid = validateFields(fields);
      if (invalid) return { ok: false, rejected: true, error: invalid };
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
           (channel_id, severity, code, title, explanation, classification, evidence, recommended_action,
            policy_quote, policy_url, quote_fetched_at, auto_verifiable, blocks_publishing, state, job_id, dedupe_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         RETURNING id`,
        [
          fields.channel_id,
          fields.severity,
          fields.code,
          fields.title,
          fields.explanation ?? null,
          fields.classification ?? null,
          fields.evidence ?? null,
          fields.recommended_action ?? null,
          fields.policy_quote ?? null,
          fields.policy_url ?? null,
          fields.quote_fetched_at ?? null,
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
      // race on the same open key — that IS the dedupe path succeeding, so
      // mirror the dedupe result (id unknown here; the winner's id stands).
      if (String(e?.code ?? '') === '23505') return { ok: true, id: null, deduped: true };
      return { ok: false, error: redactedError(e) };
    }
  }

  /** Record "seen" (by/at). Acknowledging never unblocks — D11: a revoked
   * token is not un-revoked by acknowledging it; only resolve() clears.
   * Unknown id → { ok:false, reason:'not_found' }; already-resolved →
   * { ok:false, reason:'not_open' } (the T5 UI distinction). */
  async function acknowledge(id, { by } = {}) {
    try {
      if (!isNonEmptyString(by)) return { ok: false, error: 'acknowledged_by_required' };
      const ensured = await ensureWarningsSchema();
      if (!ensured.ok) return { ok: false, error: ensured.error };
      const cur = await dbClient(`SELECT state FROM warnings WHERE id = $1`, [id]);
      if (!cur?.length) return { ok: false, reason: 'not_found' };
      if (cur[0].state === 'resolved') return { ok: false, reason: 'not_open' };
      await dbClient(
        `UPDATE warnings SET state = 'acknowledged', acknowledged_by = $1, acknowledged_at = now(), updated_at = now()
         WHERE id = $2`,
        [by, id],
      );
      return { ok: true, id };
    } catch (e) {
      return { ok: false, error: redactedError(e) };
    }
  }

  /** Resolve with an audit trail (AC-P4-15: manual resolves are recorded,
   * never silent). The escape hatch for anything the probes cannot see.
   * not_found / not_open reasons mirror acknowledge() for the T5 UI. */
  async function resolve(id, { by, note = null } = {}) {
    try {
      if (!isNonEmptyString(by)) return { ok: false, error: 'resolved_by_required' };
      const ensured = await ensureWarningsSchema();
      if (!ensured.ok) return { ok: false, error: ensured.error };
      const cur = await dbClient(`SELECT state FROM warnings WHERE id = $1`, [id]);
      if (!cur?.length) return { ok: false, reason: 'not_found' };
      if (cur[0].state === 'resolved') return { ok: false, reason: 'not_open' };
      await dbClient(
        `UPDATE warnings SET state = 'resolved', resolved_by = $1, resolve_note = $2, resolved_at = now(), updated_at = now()
         WHERE id = $3`,
        [by, note, id],
      );
      return { ok: true, id };
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
   * THE park predicate (D11/AC-P4-13): open rows with blocks_publishing = TRUE.
   * T2's pipeline park-check consumes THIS — never severity-matching (the
   * severity door makes off-hard-block blocking chips unrepresentable, so
   * blocks_publishing is the whole contract). channelId null enumerates EVERY
   * parked channel (nightly probe job); acknowledge does NOT clear the
   * predicate, only resolve does.
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

  /**
   * T5 /warnings dashboard reader (D12/AC-P4-16): every row for the board —
   * open + acknowledged by default (state <> 'resolved'), or the resolved
   * history with resolvedOnly: true (WHERE state = 'resolved' — round-1
   * minor 9: the filter is SQL-level, not client-side). channelId null = the
   * whole network. Newest first. Never throws; a dead DB is { ok:false }
   * (ntfy stays the fallback channel — AC-P4-5).
   */
  async function listWarnings({ channelId = null, resolvedOnly = false, limit = 200 } = {}) {
    try {
      const ensured = await ensureWarningsSchema();
      if (!ensured.ok) return { ok: false, error: ensured.error };
      const cap = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 1000) : 200;
      const stateFilter = resolvedOnly ? `state = 'resolved'` : `state <> 'resolved'`;
      const rows = await dbClient(
        `SELECT * FROM warnings
         WHERE ($1::text IS NULL OR channel_id = $1) AND ${stateFilter}
         ORDER BY created_at DESC LIMIT ${cap}`,
        [channelId],
      );
      return { ok: true, rows: rows ?? [] };
    } catch (e) {
      return { ok: false, error: redactedError(e) };
    }
  }

  return { ensureWarningsSchema, openWarning, acknowledge, resolve, markChecked, openBlockingFor, autoResolveIf, listWarnings };
}

/**
 * Per-run alert digest (audit 2026-11-13 #4). A batch job (the nightly upload
 * reconcile) can open dozens of warnings in one run; one push each meant ~180
 * ntfy calls a night and a wall of 429s. Pass `digest.sendAlert` as
 * emitWarning's `opts.sendAlert`: each would-be push is recorded instead, and
 * `flush()` sends ONE summary. The push still never disappears (AC-P4-11) — it
 * is batched. Deduped re-fires never reach the digest (emitWarning returns
 * before alerting), so an unchanged night sends nothing.
 */
export function makeAlertDigest({ send = sendAlert, title = 'Pipeline warnings', max = 10 } = {}) {
  let items = [];
  return {
    sendAlert: async ({ title: t, text }) => {
      items.push({ title: String(t ?? ''), text: String(text ?? '') });
      return { channel: 'digest', ok: true };
    },
    async flush() {
      const batch = items;
      items = [];
      if (!batch.length) return { count: 0, alert: null };
      const shown = batch.slice(0, max).map((i) => `- ${i.title}`);
      const extra = batch.length > max ? [`+${batch.length - max} more`] : [];
      const storeDown = batch.some((i) => i.text.includes('warnings store unavailable'))
        ? ['warnings store unavailable for some rows — ntfy is the fallback record']
        : [];
      const text = [...shown, ...extra, ...storeDown, 'Full list: Studio /warnings'].join('\n');
      let alert;
      try {
        alert = await send({ title: `${title}: ${batch.length} new warning${batch.length === 1 ? '' : 's'}`, text });
      } catch (e) {
        alert = { channel: 'none', ok: false, error: redactedError(e) };
      }
      return { count: batch.length, alert };
    },
  };
}

/**
 * Emitter helper (D9 "write-and-alert"): every alert site writes its row AND
 * fires the existing ntfy push — the push never disappears (AC-P4-11). The
 * push is built from the WRITE RESULT, not raw fields: the "PUBLISHING
 * BLOCKED" suffix renders only when a row actually landed with
 * blocks_publishing; a rejected write (H9/validation — a caller bug, the
 * store is UP) fires NO push and returns
 * { ok:false, rejected:true, alert:{ skipped:'write_rejected', detail:'write rejected: <reason>' } };
 * only a genuine store FAILURE says "unavailable" and keeps the ntfy
 * fallback (AC-P4-5). Alerting is once per park EPISODE: a deduped re-fire
 * updates the row silently (D11). Never throws; an alert failure never
 * fails the write.
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
  // Rejected write: caller bug, not an operational event — no row was written
  // and no human gets paged for a code fix (the store is up; "unavailable"
  // would be a lie). The reason renders on the returned alert slot.
  if (write.rejected) {
    return {
      ...write,
      alert: { channel: 'none', ok: false, skipped: 'write_rejected', detail: `write rejected: ${write.error}` },
    };
  }

  const title = `[${fields?.severity ?? 'unknown'}] ${fields?.code ?? 'warning'}: ${fields?.title ?? 'pipeline warning'}`;
  const parked = write.ok && fields?.blocks_publishing === true;
  const lines = [
    `channel: ${fields?.channel_id ?? 'system'}`,
    `severity: ${fields?.severity ?? 'unknown'}${parked ? ' — PUBLISHING BLOCKED' : ''}`,
    fields?.explanation ? `explanation: ${fields.explanation}` : '',
    fields?.evidence ? `evidence: ${fields.evidence}` : '',
    fields?.policy_url ? `source: ${fields.policy_url}` : '',
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

// Real-path store: lazily built over ./db.mjs (same lazy-import seam as
// ai-adapter's default usage writer), memoized per process. Null -> the
// caller degrades to ntfy-only; a missing DATABASE_URL must not halt the run.
// (Round-1 fix: the canonical module moved into studio/lib — the old
// '../studio/lib/db.mjs' paths only resolved from the repo-root shim and made
// every getDefaultWarningsStore() call degrade to null at runtime.)
let defaultStorePromise = null;
export async function getDefaultWarningsStore() {
  if (!defaultStorePromise) {
    defaultStorePromise = (async () => {
      try {
        const { db, dbReady } = await import('./db.mjs');
        if (!dbReady || !db) return null;
        const { adaptPostgres } = await import('./provider-routing.js');
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
