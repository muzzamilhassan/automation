// 10-09 A1 SESSION HARDENING — opaque, revocable, DB-backed sessions.
// The cookie holds a random 64-hex token; ONLY its SHA-256 hash is stored in
// Neon (sessions table). Kill the row = that device is out everywhere,
// instantly. Every lookup also updates last_used (throttled to 1/minute).
import crypto from 'node:crypto';
import { db, dbReady } from './db.mjs';
import { parseSessionCookie } from './session.js';

const DAY_MS = 86400000;

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

export function newSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

// returns the opaque token for the cookie (hash stored server-side)
export async function createSession({ email, role, name = '', userAgent = '', ip = '', days = 30 }) {
  const token = newSessionToken();
  const expires = new Date(Date.now() + days * DAY_MS);
  if (!dbReady) return { token, fallback: { email, role, name, exp: Date.now() + days * DAY_MS } };
  await db`
    INSERT INTO sessions (token_hash, email, role, name, user_agent, ip, expires_at)
    VALUES (${sha256(token)}, ${email}, ${role}, ${name}, ${String(userAgent).slice(0, 200)}, ${String(ip).slice(0, 60)}, ${expires})`.catch(() => { });
  return { token, fallback: null };
}

// A live sessions row → the signed-in user. Live fix wave A1 (T5-03):
// route-auth reads `.id` while older callers read `.session_id`; returning
// only session_id left /api/sessions' `current` at 0, so no row was ever
// marked "this device". Both names carry the same row id.
export function sessionUserFromRow(s) {
  return { email: s.email, role: s.role, name: s.name || s.email, id: s.id, session_id: s.id };
}

// resolves the signed-in user from the opaque cookie token (or null)
export async function userByToken(token) {
  if (!token || token.includes('.') || !dbReady) return null;
  const h = sha256(token);
  const rows = await db`
    SELECT id, email, role, name, revoked, expires_at
    FROM sessions WHERE token_hash = ${h}
    LIMIT 1`.catch(() => []);
  const s = rows[0];
  if (!s) return null;
  if (s.revoked || new Date(s.expires_at) < new Date()) return null;
  // touch last_used at most once per minute (no write per request)
  db`UPDATE sessions SET last_used = now() WHERE id = ${s.id} AND last_used < now() - interval '60 seconds'`.catch(() => { });
  return sessionUserFromRow(s);
}

export async function revokeToken(token) {
  if (!token || !dbReady) return;
  await db`UPDATE sessions SET revoked = TRUE WHERE token_hash = ${sha256(token)}`.catch(() => { });
}

export async function revokeAllForEmail(email) {
  if (!dbReady) return 0;
  const rows = await db`UPDATE sessions SET revoked = TRUE WHERE email = ${email} AND revoked = FALSE RETURNING id`;
  return rows.length;
}

export async function listSessions(email) {
  if (!dbReady) return [];
  try {
    const rows = await db`
      SELECT id, user_agent, ip, created_at, last_used, expires_at, revoked
      FROM sessions WHERE email = ${email} AND revoked = FALSE AND expires_at > now()
      ORDER BY last_used DESC LIMIT 20`;
    return rows.map((r) => ({
      id: r.id,
      device: String(r.user_agent || '').slice(0, 60),
      ip: r.ip || '',
      created: r.created_at,
      lastUsed: r.last_used,
      expires: r.expires_at,
    }));
  } catch {
    return [];
  }
}

// shared brute-force throttle — counts failed logins per IP across ALL servers
export async function recentFailures(ip, minutes = 15) {
  if (!dbReady || !ip) return 0;
  try {
    const rows = await db`
      SELECT count(*) AS n FROM login_attempts
      WHERE ip = ${ip} AND ok = FALSE AND at > now() - (${minutes} || ' minutes')::interval`;
    return Number(rows[0]?.n || 0);
  } catch {
    return 0;
  }
}

export async function recordLoginAttempt(ip, ok) {
  if (!dbReady || !ip) return;
  try {
    await db`INSERT INTO login_attempts (ip, ok) VALUES (${ip}, ${ok})`;
    await db`DELETE FROM login_attempts WHERE at < now() - interval '1 day'`;
  } catch { }
}

// ---- P4/S6 (#106) OWNER SESSIONS ADMIN — all-users view, revoke-by-id,
// retention cleanup. Client contract mirrors studio/lib/quota-ledger.mjs:
// `client(sqlText, params)` -> Promise<rows> (postgres.js positional style;
// callers bridge the tagged-template db with adaptPostgres — see the
// /api/sessions route and scripts/sessions-cleanup.mjs).

// Owner-only: EVERY user's sessions, freshest activity first — active rows
// plus recently dead ones (the admin UI greys expired/revoked), bounded so a
// long-lived table can't flood the panel. Fails safe to [] like listSessions.
export async function listAllSessions(dbClient) {
  if (typeof dbClient !== 'function') return [];
  try {
    const rows = await dbClient(
      `SELECT id, email, role, name, user_agent, ip, created_at, last_used, expires_at, revoked
       FROM sessions ORDER BY last_used DESC LIMIT $1`, [200]);
    const now = new Date();
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role,
      name: r.name || '',
      device: String(r.user_agent || '').slice(0, 60),
      ip: r.ip || '',
      created: r.created_at,
      lastUsed: r.last_used,
      expires: r.expires_at,
      revoked: r.revoked === true,
      expired: new Date(r.expires_at) < now,
    }));
  } catch {
    return [];
  }
}

// Owner-only INSTANT revoke: flips the row's revoked flag — the per-request
// check in userByToken() (above) rejects any revoked token on the device's
// very next request, so the kick never waits for cookie expiry. Returns
// { id, email } so the route can audit WHOSE device died, or null when the
// row is missing/already revoked (the AND revoked = FALSE guard keeps it
// idempotent — a double click can't double-count).
export async function revokeSessionById(id, dbClient) {
  if (typeof dbClient !== 'function' || !Number.isInteger(id)) return null;
  try {
    const rows = await dbClient(
      `UPDATE sessions SET revoked = TRUE WHERE id = $1 AND revoked = FALSE RETURNING id, email`, [id]);
    return rows[0] || null;
  } catch {
    return null;
  }
}

// AC-P4-30 retention: delete dead rows — revoked OR expired — whose last
// activity is older than `days` (default 30). There is no revoked_at column
// (schema frozen): last_used freezes at death because userByToken never
// touches a dead row, so it IS the death clock. dry=true counts the doomed
// rows without deleting (ops preview for the nightly pass).
export async function cleanupSessions(dbClient, { days = 30, dry = false } = {}) {
  if (typeof dbClient !== 'function') return 0;
  const where = `(revoked = TRUE OR expires_at < now()) AND last_used < now() - ($1 || ' days')::interval`;
  try {
    if (dry) {
      const rows = await dbClient(`SELECT count(*) AS n FROM sessions WHERE ${where}`, [String(days)]);
      return Number(rows[0]?.n || 0);
    }
    const rows = await dbClient(`DELETE FROM sessions WHERE ${where} RETURNING id`, [String(days)]);
    return rows.length;
  } catch {
    return 0;
  }
}

// #116 (2026-11-18 audit, BUG-3/SEC-2): Sign Out must revoke the CURRENT
// session. The A1 cookie is `hex(json{t,e,r,n,x}).hmac` — DOTTED — and the
// revocable opaque token lives only inside the signed claims; the old
// logout dot-gate (`!token.includes('.')`) therefore skipped every
// current-format cookie and the Neon row stayed live for its full 30 days.
// This parses the dotted cookie (HMAC-verified) and revokes by claims.t;
// bare pre-A1 tokens (no dot) are revoked directly as before. Returns true
// when a revocable token was identified and the UPDATE ran; false for
// missing/malformed/tampered cookies (logout itself must never fail).
// Pass dbClient (the `(sql, params)` contract, see the admin functions
// above) to test against a stub; default runs on the module pool.
function safeDecode(v) {
  try { return decodeURIComponent(String(v || '')).trim(); } catch { return ''; }
}

export async function revokeSessionFromCookie(cookieVal, dbClient = null) {
  const val = safeDecode(cookieVal);
  if (!val) return false;
  const claims = val.includes('.') ? await parseSessionCookie(val) : { t: val };
  if (!claims?.t || !String(claims.t).trim()) return false;
  const hash = sha256(claims.t);
  try {
    if (typeof dbClient === 'function') {
      await dbClient(`UPDATE sessions SET revoked = TRUE WHERE token_hash = $1`, [hash]);
    } else {
      if (!dbReady) return false;
      await db`UPDATE sessions SET revoked = TRUE WHERE token_hash = ${hash}`;
    }
    return true;
  } catch {
    return false;
  }
}
