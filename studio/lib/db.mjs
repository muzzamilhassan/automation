// 10-08 PHASE R2 — Neon Postgres (serverless) via postgres.js.
// The URL lives in DATABASE_URL (root .env locally / Vercel env in prod) —
// NEVER in the repo. Every table here mirrors a JSON file the system used
// before: users=access.json, channels=studio-channels registry,
// topics_queue=topics-<slug>.json, audit_log=audit.json.
import postgres from 'postgres';
import { ENV } from './data.mjs';

const url = process.env.DATABASE_URL || ENV.DATABASE_URL || '';

const isPostgres = typeof url === 'string' && (url.startsWith('postgres://') || url.startsWith('postgresql://'));

export const dbReady = isPostgres;
// idle_timeout (audit 2026-11-13 #6): an idle pooled connection used to keep
// a pipeline script's Node process alive forever after its last query
// (yt-deepdive idled to the 45-min kill and was recorded "failed"). Idle
// connections now close after 20s; postgres.js reconnects transparently.
export const db = isPostgres
  ? postgres(url, { ssl: 'require', max: 5, prepare: false, idle_timeout: 20 })
  : null;

// Graceful close for one-shot scripts before process.exit. Never throws; safe
// to call more than once (postgres.js end() is idempotent).
export async function closeDb() {
  if (!db) return false;
  try {
    await db.end({ timeout: 5 });
    return true;
  } catch {
    return false;
  }
}

export function dbUnavailable(res) {
  return res.json({ error: 'database not configured on this server' }, { status: 500 });
}
