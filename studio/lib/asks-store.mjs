// Creator City item 6 — the `asks` Neon table (Inbox questions) and the
// action runner behind an answer. Rules about WHICH asks exist and when they
// expire are the pure studio/lib/asks.mjs; /api/asks only wires.
//
// Client contract (house pattern, warnings-store.mjs / jobs-read.mjs):
// `dbClient(sqlText, params)` -> Promise<rowObject[]>, $1..$n placeholders —
// production passes adaptPostgres(db). jsonb travels as JSON text + ::jsonb.
// Every store call answers { ok:false, error } instead of throwing.
//
// ANSWERING (no double runs): claim() flips pending → answered atomically
// (WHERE status = 'pending' AND expires_at > now()), THEN the action runs. If
// the action fails, release() puts the ask back to pending with the error in
// answer.lastError — the card shows it and the owner can try again.
//
// ACTIONS reuse EXISTING safe code paths only, injected by the route:
//   retry_resume       channelRunBusy guard + dispatchResumeRun (the /review
//                      Redispatch / approve dispatch: channel-autopilot.yml
//                      channel=<slug> resume=<job id>)
//   redispatch_script  exactly /api/review 'redispatch' (approved scripts only)
//   reject_script      script-store reject (awaiting_review → rejected)
//   skip_approved_script script-store skipApproved (approved + no video →
//                      rejected, reason recorded) + resolve of THIS script's
//                      never-made alerts
//   resolve_warnings   warnings-store resolve (audited, resolved_by = owner)
//   dismiss            records the answer only
import { scriptIdOf } from './notify-policy.mjs';

export const ASKS_DDL = Object.freeze([
  `CREATE TABLE IF NOT EXISTS asks (
    id bigserial PRIMARY KEY,
    channel TEXT,
    kind TEXT NOT NULL CHECK (kind IN ('retry_or_skip','confirm','choice')),
    source_key TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    body TEXT,
    options jsonb NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','answered','expired','cancelled')),
    answer jsonb,
    answered_by TEXT,
    created_at timestamptz NOT NULL DEFAULT now(),
    answered_at timestamptz,
    expires_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS asks_status_idx ON asks (status, expires_at)`,
]);

const SKIP_NOTE = 'skipped from an Inbox question';
const SKIP_REASON = 'skipped by owner from Inbox';
const UNPUBLISHED_CODES = ['approved_not_published', 'approval_dispatch_failed'];

function redact(e) {
  return String((e && e.message) || e || 'error').replace(/postgres(ql)?:\/\/\S+/gi, 'postgres://[redacted]').slice(0, 200);
}

export function makeAsksStore(dbClient) {
  if (typeof dbClient !== 'function') {
    throw new TypeError('makeAsksStore: dbClient must be a function (sqlText, params) -> Promise<rows>');
  }
  let schemaPromise = null;

  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        for (const sql of ASKS_DDL) await dbClient(sql, []);
        return { ok: true };
      })().catch((e) => {
        schemaPromise = null;
        return { ok: false, error: redact(e) };
      });
    }
    return schemaPromise;
  }

  async function run(fn) {
    try {
      const ensured = await ensureSchema();
      if (!ensured.ok) return { ok: false, error: ensured.error };
      return await fn();
    } catch (e) {
      return { ok: false, error: redact(e) };
    }
  }

  /** Insert each new question; an existing source_key (any status) is left alone. */
  function upsertAsks(rows = []) {
    return run(async () => {
      let inserted = 0;
      for (const r of rows) {
        const got = await dbClient(
          `INSERT INTO asks (source_key, channel, kind, title, body, options, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz)
           ON CONFLICT (source_key) DO NOTHING RETURNING id`,
          [r.source_key, r.channel ?? null, r.kind, r.title, r.body ?? null, JSON.stringify(r.options || []), r.expires_at],
        );
        if (got?.length) inserted += 1;
      }
      return { ok: true, inserted };
    });
  }

  function listPending({ limit = 100 } = {}) {
    const cap = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 500) : 100;
    return run(async () => {
      const rows = await dbClient(`SELECT * FROM asks WHERE status = 'pending' ORDER BY created_at ASC LIMIT ${cap}`, []);
      return { ok: true, rows: rows ?? [] };
    });
  }

  function expireAsks(list = []) {
    return run(async () => {
      let expired = 0;
      for (const { id, reason } of list) {
        const got = await dbClient(
          `UPDATE asks SET status = 'expired', answer = $2::jsonb WHERE id = $1 AND status = 'pending' RETURNING id`,
          [String(id), JSON.stringify({ expired: reason || 'expired' })],
        );
        if (got?.length) expired += 1;
      }
      return { ok: true, expired };
    });
  }

  function getAsk(id) {
    return run(async () => {
      const rows = await dbClient(`SELECT * FROM asks WHERE id = $1`, [String(id)]);
      return { ok: true, ask: rows?.[0] ?? null };
    });
  }

  /** pending (and not past expiry) → answered, atomically. A second click → not_open. */
  function claim(id, by) {
    return run(async () => {
      const rows = await dbClient(
        `UPDATE asks SET status = 'answered', answered_by = $2, answered_at = now()
         WHERE id = $1 AND status = 'pending' AND expires_at > now() RETURNING *`,
        [String(id), String(by || '')],
      );
      return rows?.length ? { ok: true, ask: rows[0] } : { ok: false, reason: 'not_open' };
    });
  }

  /** The action failed: back to pending, the error kept for the card. */
  function release(id, error) {
    return run(async () => {
      await dbClient(
        `UPDATE asks SET status = 'pending', answered_by = NULL, answered_at = NULL, answer = $2::jsonb
         WHERE id = $1 AND status = 'answered'`,
        [String(id), JSON.stringify({ lastError: String(error || 'failed').slice(0, 200) })],
      );
      return { ok: true };
    });
  }

  /** The action worked: record what was chosen and what happened. */
  function finalize(id, answer) {
    return run(async () => {
      await dbClient(`UPDATE asks SET answer = $2::jsonb WHERE id = $1 AND status = 'answered'`, [String(id), JSON.stringify(answer ?? {})]);
      return { ok: true };
    });
  }

  return { ensureSchema, upsertAsks, listPending, expireAsks, getAsk, claim, release, finalize };
}

const fail = (error) => ({ ok: false, error });

async function guardedDispatch(slug, jobId, d) {
  const busy = await d.runBusy({ slug });
  if (busy?.busy) {
    return fail(`A run for this channel is already ${busy.status === 'in_progress' ? 'running' : 'waiting'} — starting another would cancel it. Try again after it finishes.`);
  }
  const r = await d.dispatchResume({ slug, jobId });
  return r?.ok ? { ok: true } : fail(r?.error || 'dispatch failed');
}

/**
 * Run one STORED option of an ask. deps (injected by the route):
 *   by, scriptStore, warningsStore,
 *   dispatchResume({slug, jobId}) → {ok,error}   (dispatchResumeRun)
 *   runBusy({slug}) → {busy,status}               (channelRunBusy)
 *   resolveAlerts({channelId, dispatchedScriptId}) (resolveStaleReviewAlerts)
 * Returns { ok, result? } or { ok:false, error }. Never throws.
 */
export async function performAskAction(ask, option, d = {}) {
  try {
    const args = option?.args || {};
    const channel = ask?.channel || null;
    switch (option?.action) {
      case 'dismiss':
        return { ok: true, result: 'dismissed' };

      case 'retry_resume': {
        if (!channel || !args.jobId) return fail('nothing to retry (no channel or run recorded)');
        const r = await guardedDispatch(channel, String(args.jobId), d);
        return r.ok ? { ok: true, result: 'dispatched' } : r;
      }

      case 'redispatch_script': {
        const g = await d.scriptStore.getScript(args.scriptId);
        if (!g?.ok) return fail('script store unavailable');
        const s = g.script;
        if (!s) return fail('script not found');
        if (s.channel_id !== channel) return fail('script belongs to another channel');
        if (s.status !== 'approved') return fail(`script is ${s.status} now — nothing to retry`);
        const r = await guardedDispatch(s.channel_id, s.job_id ?? null, d);
        if (!r.ok) return r;
        try {
          await d.resolveAlerts?.({ channelId: s.channel_id, dispatchedScriptId: s.id });
        } catch { /* the nightly sweep is the backstop */ }
        return { ok: true, result: 'dispatched' };
      }

      case 'reject_script': {
        const r = await d.scriptStore.reject(args.scriptId, { by: d.by, note: SKIP_NOTE });
        if (!r?.ok) {
          if (r?.reason === 'not_open') return fail('script is no longer waiting for review');
          if (r?.reason === 'not_found') return fail('script not found');
          return fail(r?.error || 'reject failed');
        }
        try {
          await d.resolveAlerts?.({ channelId: channel });
        } catch { /* the nightly sweep is the backstop */ }
        return { ok: true, result: 'rejected' };
      }

      case 'skip_approved_script': {
        if (!channel || !args.scriptId) return fail('nothing to skip');
        const sk = await d.scriptStore.skipApproved(String(args.scriptId), { by: d.by, reason: SKIP_REASON });
        if (!sk?.ok) {
          if (sk?.reason === 'already_changed') return fail(`already changed (${sk.status}) — nothing skipped`);
          if (sk?.reason === 'not_found') return fail('script not found');
          return fail(sk?.error || 'skip failed');
        }
        // The skip stands from here on: closing its alerts is best-effort (a
        // rejected script's alerts are also closed by the stale-alert sweep).
        let closed = 0;
        try {
          const open = await d.warningsStore.listOpenByCodes({ codes: UNPUBLISHED_CODES, channelId: channel });
          for (const w of (open?.ok ? open.rows || [] : []).filter((x) => scriptIdOf(x) === String(args.scriptId))) {
            const r = await d.warningsStore.resolve(w.id, { by: d.by, note: SKIP_NOTE });
            if (r?.ok) closed += 1;
          }
        } catch { /* the nightly sweep is the backstop */ }
        return { ok: true, result: `skipped; closed ${closed} alert${closed === 1 ? '' : 's'}` };
      }

      case 'resolve_warnings': {
        const ids = Array.isArray(args.warningIds) ? args.warningIds : [];
        for (const id of ids) {
          const r = await d.warningsStore.resolve(id, { by: d.by, note: SKIP_NOTE });
          if (!r?.ok && r?.reason !== 'not_open' && r?.reason !== 'not_found') return fail(r?.error || 'resolve failed');
        }
        return { ok: true, result: 'resolved' };
      }

      default:
        return fail('unknown action');
    }
  } catch (e) {
    return fail(redact(e));
  }
}
