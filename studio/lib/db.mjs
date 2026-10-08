// 10-08 PHASE R2 — Neon Postgres (serverless) via postgres.js.
// The URL lives in DATABASE_URL (root .env locally / Vercel env in prod) —
// NEVER in the repo. Every table here mirrors a JSON file the system used
// before: users=access.json, channels=studio-channels registry,
// topics_queue=topics-<slug>.json, audit_log=audit.json.
import postgres from 'postgres';
import { ENV } from './data.mjs';

const url = process.env.DATABASE_URL || ENV.DATABASE_URL || '';

export const dbReady = Boolean(url);
export const db = url
  ? postgres(url, { ssl: 'require', max: 5, prepare: false })
  : null;

export function dbUnavailable(res) {
  return res.json({ error: 'database not configured on this server' }, { status: 500 });
}
