// Step C1 — engine feed + cadence between the repo files and Neon.
//   node scripts/export-registry.mjs --seed            dry run: what would be written to Neon
//   node scripts/export-registry.mjs --seed --apply    copy the committed files into Neon (files win)
//   node scripts/export-registry.mjs --check [--record] rebuild both files from Neon, compare with
//                                                     the committed ones (shadow week); --record
//                                                     stores the result in registry_shadow_checks.
//                                                     Always exits 0 — shadow never blocks a run.
//   node scripts/export-registry.mjs --write           (C1b) write both files from Neon into the
//                                                     working tree; keeps the committed files and
//                                                     warns if Neon is unreachable.
// Design: docs/superpowers/specs/2026-11-16-neon-single-source-of-truth-design.md (C1).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadEnv } from '../lib/env.mjs';
import {
  buildFeed, buildCadence, diffFeeds, diffCadence, seedPlan, applySeed, readFeedRows, recordShadowCheck,
} from '../studio/lib/registry-feed.mjs';

const FEED = 'yt-mcp/studio-channels.json';
const CAD = 'yt-mcp/cadence.json';
const readJson = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; } };

async function client() {
  loadEnv();
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
  const { db, closeDb } = await import(pathToFileURL(path.resolve('studio', 'lib', 'db.mjs')).href);
  if (!db) throw new Error('database not configured');
  return { sql: (text, params = []) => db.unsafe(text, params), close: closeDb };
}

async function main(argv) {
  const has = (f) => argv.includes(f);
  if (has('--seed')) {
    const { sql, close } = await client();
    try {
      const dbSlugs = (await sql('SELECT slug FROM channels ORDER BY slug')).map((r) => r.slug);
      const plan = seedPlan(readJson(FEED, { channels: [] }), readJson(CAD, {}), dbSlugs);
      for (const u of plan.updates) {
        console.log(`${u.slug.padEnd(22)} feed=${u.feed_entry ? 'SET' : 'null'} cadence=${u.cadence ? 'SET' : 'null'}`);
      }
      if (plan.missingRows.length) console.log(`feed slugs with NO channels row (not created): ${plan.missingRows.join(', ')}`);
      if (!has('--apply')) { console.log('dry run — add --apply to write'); return 0; }
      await applySeed(sql, plan);
      console.log(`seeded ${plan.updates.length} rows`);
      return 0;
    } finally { await close(); }
  }
  if (has('--check')) {
    let conn;
    try {
      conn = await client();
      const rows = await readFeedRows(conn.sql);
      const diff = [
        ...diffFeeds(readJson(FEED, { channels: [] }), buildFeed(rows)),
        ...diffCadence(readJson(CAD, {}), buildCadence(rows)),
      ];
      const ok = diff.length === 0;
      console.log(ok ? '[registry-shadow] OK — Neon rebuilds the committed feed + cadence exactly' : `[registry-shadow] DIFF (${diff.length}):\n  ${diff.join('\n  ')}`);
      if (has('--record')) await recordShadowCheck(conn.sql, { ok, diff, runId: process.env.GITHUB_RUN_ID || 'local' });
    } catch (e) {
      console.log(`[registry-shadow] skipped: ${String(e.message || e).slice(0, 160)}`);
    } finally { await conn?.close?.(); }
    return 0;
  }
  if (has('--write')) {
    let conn;
    try {
      conn = await client();
      const rows = await readFeedRows(conn.sql);
      const feed = buildFeed(rows);
      if (!feed.channels.length) throw new Error('Neon feed is empty — refusing to write an empty registry');
      fs.writeFileSync(FEED, JSON.stringify(feed, null, 2) + '\n');
      fs.writeFileSync(CAD, JSON.stringify(buildCadence(rows), null, 2) + '\n');
      console.log(`[registry-export] wrote ${FEED} (${feed.channels.length} channels) + ${CAD} from Neon`);
    } catch (e) {
      console.log(`::warning::[registry-export] Neon unavailable (${String(e.message || e).slice(0, 120)}) — using the committed files`);
    } finally { await conn?.close?.(); }
    return 0;
  }
  console.error('usage: export-registry.mjs --seed [--apply] | --check [--record] | --write');
  return 2;
}

if (Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main(process.argv.slice(2)));
}
