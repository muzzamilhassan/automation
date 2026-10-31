#!/usr/bin/env node
// #106 PHASE 4.5 TIER 3 (T3) — migrate the LOCAL .mcp.json (gitignored Claude
// project config) from 16 static per-channel yutu servers to ONE
// registry-driven server (yt-mcp/dynamic-server.mjs). Each old block pinned
// ONE channel's token file at config-write time; the new single entry takes
// the channel as a per-call tool parameter and picks up new channels from
// yt-mcp/studio-channels.json without ever touching this file again.
//
// SAFETY CONTRACT (pinned by tests/mcp-migrate.test.mjs):
//   - DRY IS THE DEFAULT: prints the plan, writes NOTHING. --write applies.
//   - --write backs the file up FIRST (.mcp.json.backup-<date>, a byte-for-
//     byte copy) and only then replaces it.
//   - every non-yt-* block (github, n8n-mcp, colab-mcp, ...) is preserved
//     verbatim; only keys matching /^yt-/ are removed.
//   - the new entry is exactly { command: 'node', args:
//     ['yt-mcp/dynamic-server.mjs'] } under the single key 'yt'.
//   - re-run is a no-op; a foreign block already named 'yt' is a hard refusal
//     (never overwritten).
//   - a missing/unparseable .mcp.json is a clean exit 1.
//
// The APPLY itself is left to the OWNER (a config change needs a Claude
// restart, so nobody should flip it from automation):
//   node scripts/mcp-migrate.mjs            # plan (dry)
//   node scripts/mcp-migrate.mjs --write    # apply (backup + replace)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEFAULT_FILE = path.join(ROOT, '.mcp.json');

/** The single replacement entry (spec shape — no env, no absolute paths). */
export const NEW_ENTRY = { command: 'node', args: ['yt-mcp/dynamic-server.mjs'] };
/** The key the single server is registered under. */
export const TARGET_KEY = 'yt';

/** argv -> { write, filePath }. DRY IS THE DEFAULT; --write is the unlock. */
export function parseArgs(argv = []) {
  let write = false;
  let filePath = DEFAULT_FILE;
  for (const arg of argv) {
    if (arg === '--dry') write = false;
    else if (arg === '--write') write = true;
    else if (arg.startsWith('--file=')) filePath = arg.slice('--file='.length);
    else throw new Error(`unknown argument: ${arg} (usage: node scripts/mcp-migrate.mjs [--dry|--write] [--file=<path>])`);
  }
  return { write, filePath };
}

/** Split the mcpServers keys into the yt-* blocks to remove and the rest. */
export function planMigration(config) {
  if (!config || typeof config !== 'object' || !config.mcpServers || typeof config.mcpServers !== 'object') {
    throw new Error('config has no mcpServers object — is this really a Claude .mcp.json?');
  }
  const keys = Object.keys(config.mcpServers);
  return {
    ytKeys: keys.filter((k) => k.startsWith('yt-')),
    preservedKeys: keys.filter((k) => !k.startsWith('yt-')),
  };
}

/** Pure config -> new config. Throws (never overwrites) on a foreign "yt". */
export function buildNewConfig(config) {
  const plan = planMigration(config);
  if (plan.preservedKeys.includes(TARGET_KEY)) {
    throw new Error(`a non-yt-* block named "${TARGET_KEY}" already exists — refusing to overwrite it; rename it first`);
  }
  const mcpServers = {};
  for (const key of plan.preservedKeys) mcpServers[key] = config.mcpServers[key];
  mcpServers[TARGET_KEY] = { ...NEW_ENTRY };
  return { config: { ...config, mcpServers }, ...plan };
}

/**
 * One migration run over injected IO. Returns { exitCode }.
 * Dry (default): plan only. Write: backup copy FIRST, then the replacement —
 * and NEVER over an existing same-date backup (the backup is the byte-exact
 * artifact; clobbering it would destroy the only original copy).
 */
export async function migrate({ readFile, writeFile, copyFile, fileExists = (p) => fs.existsSync(p), log, nowDate = () => new Date().toISOString().slice(0, 10), filePath, write = false }) {
  const out = (line) => log(line);
  let raw;
  try {
    raw = readFile(filePath);
  } catch (e) {
    out(`[mcp-migrate] could not read ${filePath}: ${e.message}`);
    return { exitCode: 1 };
  }
  let config;
  try {
    config = JSON.parse(raw);
  } catch (e) {
    out(`[mcp-migrate] ${filePath} is not valid JSON (${e.message}) — nothing changed`);
    return { exitCode: 1 };
  }

  let plan;
  try {
    plan = planMigration(config);
  } catch (e) {
    out(`[mcp-migrate] ${e.message}`);
    return { exitCode: 1 };
  }

  if (plan.ytKeys.length === 0) {
    const already = config.mcpServers[TARGET_KEY] ? 'already migrated' : 'no yt-* blocks found';
    out(`[mcp-migrate] ${already} — nothing to do${write ? ' (no backup, no write)' : ''}`);
    return { exitCode: 0 };
  }

  let next;
  try {
    next = buildNewConfig(config); // collision refusal applies only when there is something to migrate
  } catch (e) {
    out(`[mcp-migrate] ${e.message}`);
    return { exitCode: 1 };
  }

  const backupPath = `${filePath}.backup-${nowDate()}`;
  if (write && fileExists(backupPath)) {
    out(`[mcp-migrate] refusing: a backup already exists at ${backupPath} — remove or rename it first (never overwrite the byte-exact original)`);
    return { exitCode: 1 };
  }
  const backupNote = !write && fileExists(backupPath) ? ' (already exists — --write will refuse)' : '';
  out(`[mcp-migrate] ${write ? 'WRITE' : 'DRY'} ${filePath}`);
  out(`[mcp-migrate]   backup  -> ${backupPath}${backupNote}`);
  out(`[mcp-migrate]   remove  ${plan.ytKeys.length} yt-* blocks: ${plan.ytKeys.join(', ')}`);
  out(`[mcp-migrate]   add     "${TARGET_KEY}": ${JSON.stringify(NEW_ENTRY)}`);
  out(`[mcp-migrate]   keep    ${plan.preservedKeys.length} non-yt blocks verbatim: ${plan.preservedKeys.join(', ')}`);

  if (!write) {
    out('[mcp-migrate] dry run — nothing written. Apply with: node scripts/mcp-migrate.mjs --write');
    out('[mcp-migrate] NOTE: applying changes the Claude MCP config — restart Claude afterwards.');
    return { exitCode: 0 };
  }

  copyFile(filePath, backupPath); // the original survives byte-for-byte, FIRST
  writeFile(filePath, JSON.stringify(next.config, null, 2) + '\n');
  out(`[mcp-migrate] done — backup at ${backupPath}; restart Claude to load the new server.`);
  return { exitCode: 0 };
}

/** CLI entry — real fs. Returns the process exit code. */
export async function main(argv = []) {
  const { write, filePath } = parseArgs(argv);
  return migrate({
    write,
    filePath,
    readFile: (p) => fs.readFileSync(p, 'utf8'),
    writeFile: (p, body) => fs.writeFileSync(p, body),
    copyFile: (src, dest) => fs.copyFileSync(src, dest),
    log: (line) => console.log(line),
  });
}

if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(path.resolve(process.argv[1])).href) {
  const { exitCode } = await main(process.argv.slice(2));
  process.exit(exitCode);
}
