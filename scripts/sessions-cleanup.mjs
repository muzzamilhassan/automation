// Sessions retention CLI (Phase 4 S6, #106 / AC-P4-30): deletes sessions that
// are expired or revoked whose last activity is older than 30 days, so the
// Neon `sessions` table stays bounded on the free tier (spec D23b/D25).
// Thin orchestration over the tested core cleanupSessions()
// (studio/lib/session-db.js) — the predicate and windows live there.
//
// NIGHTLY WIRING NOTE (later batch): the spec runs this in the D25 nightly
// maintenance pass alongside the orphan diff (D7) and blob prune — that
// workflow lands with T3/T6. Until then, run it on demand or pin it into the
// nightly lane:
//   node scripts/sessions-cleanup.mjs --dry       # count the doomed rows
//   DATABASE_URL=... node scripts/sessions-cleanup.mjs            # 30-day window
//   DATABASE_URL=... node scripts/sessions-cleanup.mjs --days 7   # custom window
//
// Exit 0 on a clean run (including "nothing to delete"), 1 on database
// unavailability or a missing DATABASE_URL.
import { loadEnv } from '../lib/env.mjs';
import postgres from 'postgres';
import { adaptPostgres } from '../studio/lib/provider-routing.js';
import { cleanupSessions } from '../studio/lib/session-db.js';

loadEnv();

const DRY = process.argv.includes('--dry');
const daysArg = process.argv.find((a) => a.startsWith('--days'));
const days = daysArg ? Number(daysArg.split('=')[1] || process.argv[process.argv.indexOf(daysArg) + 1]) : 30;
const log = (m) => console.log(m);

if (!Number.isFinite(days) || days < 1) {
  log('invalid --days value (need a number >= 1)');
  process.exit(1);
}

const url = process.env.DATABASE_URL || '';
if (!url || !(url.startsWith('postgres://') || url.startsWith('postgresql://'))) {
  log('no DATABASE_URL (postgres://…) — nothing to clean');
  process.exit(1);
}

log(`── Sessions retention (${DRY ? 'DRY — ' : ''}window: ${days} days) ──`);

try {
  const db = postgres(url, { ssl: 'require', max: 1, prepare: false });
  const client = adaptPostgres(db);
  const n = await cleanupSessions(client, { days, dry: DRY });
  log(DRY ? `would delete: ${n} session row(s)` : `deleted: ${n} session row(s)`);
  await db.end();
  log('OK');
  process.exit(0);
} catch (e) {
  log(`database unavailable: ${String(e.message || e).slice(0, 200)}`);
  process.exit(1);
}
