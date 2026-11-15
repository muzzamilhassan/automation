#!/usr/bin/env node
// #106 PHASE 4 S2 (T3) — nightly upload reconciliation (upload-reconcile.yml,
// 04:29 UTC off-peak + workflow_dispatch).
//
// D7b/AC-P4-9: per channel, diff the uploads playlist against upload_intents
// (channels.list + playlistItems.list ≈ 2 units/channel — NEVER search.list,
// D24):
//   orphan = a video in the playlist with NO intent row -> one orphan-noted
//            warning (advisory, code upload_orphan, per-video dedupe key so a
//            re-found orphan bumps last_checked instead of re-rowing — L4).
//            NEVER backfilled as an intent (hand-uploads included — L5).
//   ghost  = an intent marked uploaded whose video is missing from the
//            playlist -> the intent is markFailed and one warning + ntfy
//            fires (write-and-alert via T4's emitWarning; never Blocking —
//            H9: a reconcile finding can never park a channel).
//   open intents past the window -> session probe -> title lookup -> abandon
//            (D7a), matching titles against the playlist already fetched —
//            zero extra quota.
//
// Channel discovery is DATA, never a hardcoded map (owner directive): the
// CHANNELS env var (comma list) if set, else every YT_TOKEN_<SLUG> secret in
// the environment, else yt-mcp/channels/*/token.json locally. Adding a channel
// = adding its secret — zero code.
//
// All YouTube calls go through injected fetch/token providers; the stores take
// injected SQL clients. Nothing here runs in tests (same contract as
// scripts/analytics-nightly.mjs).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnv } from '../lib/env.mjs';
import { getUploadIntentStore, reconcileChannel } from '../lib/upload-intents.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Channel discovery — env-derived, no static slug map (analytics-nightly pattern).
function slugFromTokenEnv(key) {
  if (!key || !key.startsWith('YT_TOKEN_')) return null;
  const slug = key.slice('YT_TOKEN_'.length).toLowerCase().replace(/_/g, '-');
  return slug || null;
}

export function discoverChannels(env = process.env) {
  const listed = String(env.CHANNELS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (listed.length) return [...new Set(listed)];
  const slugs = new Set();
  for (const key of Object.keys(env)) {
    const s = slugFromTokenEnv(key);
    if (s) slugs.add(s);
  }
  if (slugs.size) return [...slugs].sort();
  try {
    const dir = path.join(ROOT, 'yt-mcp/channels');
    return fs
      .readdirSync(dir)
      .filter((s) => fs.existsSync(path.join(dir, s, 'token.json')))
      .sort();
  } catch {
    return [];
  }
}

export async function main(argv = process.argv) {
  loadEnv(); // repo-root .env (CI env always wins)
  const { createAccessToken } = await import('../studio/lib/yt-token.mjs');
  const { emitWarning, getDefaultWarningsStore, makeAlertDigest } = await import('../lib/warnings-store.mjs');
  // audit 2026-11-13 #4: one summary push per run, not one per orphan/ghost
  const digest = makeAlertDigest({ title: 'Upload reconcile' });
  const emitDigested = (store, fields) => emitWarning(store, fields, { sendAlert: digest.sendAlert });

  if (!process.env.DATABASE_URL) {
    console.error('[upload-reconcile] DATABASE_URL not set — no intent ledger to reconcile against');
    return 1;
  }
  const intents = await getUploadIntentStore();
  if (!intents) {
    console.error('[upload-reconcile] intent store unavailable — nothing to reconcile');
    return 1;
  }
  const warnings = await getDefaultWarningsStore(); // null -> emitWarning degrades to ntfy-only
  const accessToken = createAccessToken({ fetchImpl: fetch });
  const slugs = discoverChannels(process.env);
  if (!slugs.length) {
    console.error('[upload-reconcile] no channels discovered (CHANNELS / YT_TOKEN_* / local token files) — nothing to do');
    return 1;
  }

  const staleAfterMs = 30 * 60_000; // a live in-flight upload must never be abandoned
  const summary = [];
  for (const slug of slugs) {
    try {
      const token = await accessToken(slug);
      const r = await reconcileChannel({
        slug,
        accessToken: token,
        store: intents,
        warningsStore: warnings,
        emitWarning: emitDigested,
        fetchImpl: fetch,
        staleAfterMs,
        log: (m) => console.log(m),
      });
      summary.push(r);
      if (r.skipped) console.log(`[reconcile] ${slug}: skipped (${r.reason})`);
      else console.log(`[reconcile] ${slug}: ${r.orphans} orphan(s) noted, ${r.ghosts} ghost(s) failed, ${r.resolved} recovered, ${r.abandoned} abandoned`);
    } catch (e) {
      // one channel's failure never stops the network's reconciliation
      console.log(`[reconcile] ${slug}: FAILED (${String(e.message).slice(0, 140)}) — continuing`);
      summary.push({ slug, ok: false, error: String(e.message).slice(0, 140) });
    }
  }

  const pushed = await digest.flush();
  console.log(`[upload-reconcile] alert digest: ${pushed.count} new warning(s)${pushed.alert ? ` -> ${pushed.alert.channel} ok=${pushed.alert.ok}` : ' — nothing to push'}`);

  // Round-1 minor 12: skipped (no playlist / nothing discoverable) is NOT a
  // failure — only hard per-channel errors fail the run.
  const failed = summary.filter((r) => r.ok === false && !r.skipped).length;
  const skipped = summary.filter((r) => r.skipped).length;
  const reconciled = summary.length - failed - skipped;
  console.log(`[upload-reconcile] done: ${summary.length} channel(s) — ${reconciled} reconciled, ${skipped} skipped, ${failed} failed`);
  return failed > 0 ? 1 : 0;
}

if (Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
