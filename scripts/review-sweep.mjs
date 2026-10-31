#!/usr/bin/env node
// #106 PHASE 4 S4 (T5) — nightly approval-timeout sweep (M4/D17/AC-P4-19).
// Pairs with the run-start half inside the review gate: every awaiting_review
// script past its slot's publishAt (else end-of-day) gets ONE Action-required
// `review_timeout` warning row — and the script is RETAINED awaiting_review
// (retain-and-resume: approval later resumes at render without re-spend; the
// sweep NEVER approves, rejects, or consumes). No YouTube calls, no quota.
//
// All seams injected; nothing here runs in tests (same contract as
// scripts/upload-reconcile.mjs).
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnv } from '../lib/env.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export async function main(argv = process.argv) {
  loadEnv(); // repo-root .env (CI env always wins)
  const { emitWarning, getDefaultWarningsStore } = await import('../lib/warnings-store.mjs');
  const { getScriptStore } = await import('../lib/script-store.mjs');
  const { sweepReviewTimeouts } = await import('../lib/review-gate.mjs');

  if (!process.env.DATABASE_URL) {
    console.error('[review-sweep] DATABASE_URL not set — no script ledger to sweep');
    return 1;
  }
  const scripts = await getScriptStore();
  if (!scripts) {
    console.error('[review-sweep] script store unavailable — nothing to sweep');
    return 1;
  }
  const warnings = await getDefaultWarningsStore(); // null -> emitWarning degrades to ntfy-only

  const r = await sweepReviewTimeouts({
    scriptStore: scripts,
    warningsStore: warnings,
    emit: emitWarning,
    now: () => new Date(),
    log: (m) => console.log(m),
  });
  if (!r.ok) {
    console.error(`[review-sweep] sweep failed: ${r.error}`);
    return 1;
  }
  console.log(`[review-sweep] done: ${r.timedOut} timed-out script(s) warned, all retained awaiting_review`);
  return 0;
}

if (Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
