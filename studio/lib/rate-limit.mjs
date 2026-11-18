// #121 (RL-1…RL-6) — THE shared rate limiter. One Neon-backed fixed-window
// counter, one helper that routes call right after auth, done.
//
// Why Neon and not memory: on Vercel every lambda instance has its own
// memory — an in-process counter is a suggestion, not a limit. The login
// throttle (login_attempts table) already proves the Neon pattern works.
//
// WHY FAIL-OPEN (deliberate, documented deviation from the #118 doctrine):
// this is a COST guard, not an auth gate. Auth + role checks have already
// run by the time the limiter is consulted; if Neon blips, failing closed
// would lock the whole panel's expensive features out on every database
// hiccup. Fail-open + console.warn keeps the blast radius tiny (and the
// expensive work is blocked AFTER auth, so anonymous abuse never gets here).
// The fail-closed rule stays exactly where it belongs: authentication.
import { db, dbReady } from './db.mjs';
import { appendAudit } from './audit.js';

// The ONE atomic statement: increments once per call, restarts the window
// when the old one has elapsed (fixed window), returns the NEW count +
// window start so the caller can compute Retry-After. The logic lives in
// SQL — no read-then-write race across lambda instances is possible.
// Exposed as a template STRINGS array so tests can pin the exact SQL the
// lib runs (stub clients reject anything else — house pattern).
export const UPSERT_STRINGS = Object.freeze([
  'INSERT INTO rate_limits (bucket, key, window_sec, window_start, count)\n  VALUES (',
  ', ',
  ', ',
  ', now(), 1)\n  ON CONFLICT (bucket, key, window_sec) DO UPDATE SET\n    count = CASE\n      WHEN rate_limits.window_start + make_interval(secs => rate_limits.window_sec) <= now() THEN 1\n      ELSE rate_limits.count + 1 END,\n    window_start = CASE\n      WHEN rate_limits.window_start + make_interval(secs => rate_limits.window_sec) <= now() THEN now()\n      ELSE rate_limits.window_start END\n  RETURNING count, window_start',
]);

// allow({ bucket, key, limit, windowSec }, dbClient?) →
//   { ok, remaining, retryAfterSec, failOpen? }
// dbClient injectable for tests: called as exec(UPSERT_STRINGS, ...values),
// i.e. the same shape a tagged template receives, so a stub can verify the
// SQL byte-for-byte and return controlled rows.
export async function allow({ bucket, key, limit, windowSec }, dbClient = null) {
  const failOpen = { ok: true, remaining: limit, retryAfterSec: 0, failOpen: true };
  let rows;
  try {
    if (dbClient) rows = await dbClient(UPSERT_STRINGS, bucket, key, windowSec);
    else if (!dbReady || !db) return failOpen;
    else rows = await db(UPSERT_STRINGS, bucket, key, windowSec);
  } catch (e) {
    console.warn('[rate-limit] db unavailable — failing OPEN (cost guard, not an auth gate):', String(e.message).slice(0, 80));
    return failOpen;
  }
  return interpret(rows, limit, windowSec);
}

function interpret(rows, limit, windowSec) {
  const row = rows?.[0];
  if (!row) return { ok: true, remaining: limit, retryAfterSec: 0, failOpen: true };
  const count = Number(row.count) || 0;
  const startMs = new Date(row.window_start).getTime();
  const retryAfterSec = Math.max(1, Math.ceil((startMs + windowSec * 1000 - Date.now()) / 1000));
  const ok = count <= limit;
  return { ok, remaining: Math.max(0, limit - count), retryAfterSec: ok ? 0 : retryAfterSec };
}

// The ready-made 429. Plain-English body + Retry-After the client can act on.
export function limit429(spec, retryAfterSec) {
  const wait = retryAfterSec > 90 ? `${Math.round(retryAfterSec / 60)} minutes` : `${retryAfterSec}s`;
  return Response.json(
    { error: `Too many requests — ${spec.bucket} limit reached. Try again in ${wait}.` },
    { status: 429, headers: { 'Retry-After': String(Math.max(1, retryAfterSec)) } },
  );
}

// Route helper: call AFTER auth, BEFORE the expensive work.
//   const limited = await enforceLimits(user, [{ bucket: 'ai-bg', limit: 5, windowSec: 3600 }, { bucket: 'ai-bg', limit: 20, windowSec: 86400 }]);
//   if (limited) return limited;
// specs are checked in order; the first exceeded one wins. Every denial
// lands in the existing audit surface (best-effort — can never fail the
// request, and the limiter itself already stopped the expensive work).
export async function enforceLimits(user, specs, dbClient = null, auditFn = appendAudit) {
  const key = user?.email || 'unknown-actor';
  for (const spec of specs || []) {
    const r = await allow({ bucket: spec.bucket, key, limit: spec.limit, windowSec: spec.windowSec }, dbClient);
    if (!r.ok) {
      try {
        await auditFn(key, 'rate-limit-deny', `${spec.bucket}: blocked, window resets in ${r.retryAfterSec}s`);
      } catch { }
      return limit429(spec, r.retryAfterSec);
    }
  }
  return null;
}
