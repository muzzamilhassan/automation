// "100% ready before anything publishes" (owner, 2026-11-21) — the engine's
// file-reading half. The rule itself lives in studio/lib/channel-readiness.mjs
// (pure, shared with the panel); this module only reads the two engine files
// a run sees after checkout:
//   yt-mcp/studio-channels.json  the registry (entry + kit, incl. the
//                                template mirror kit.templateId)
//   yt-mcp/cadence.json          upload days per channel
// Used by channel-pipeline.mjs, sweeper.mjs and longvideo/longform-upload.mjs
// as a defence-in-depth stop for direct starts (the autopilot's discover step
// already drops not-ready channels via lib/schedule-slot.mjs).
// Fail closed: a missing or broken file = not ready.
// Spec + QA: docs/qa/channel-readiness-qa.md.
import fs from 'node:fs';
import path from 'node:path';

import { readinessFor, readinessLine } from '../studio/lib/channel-readiness.mjs';

function readJSON(root, rel) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Readiness of one channel from the engine files under `root` (default: cwd,
 * the repo checkout — same base lib/brand-resolve.mjs reads from).
 * @returns {{ ready: boolean, done: number, total: number, items: object[], line: string }}
 */
export function engineReadiness(slug, { root = process.cwd() } = {}) {
  const registry = readJSON(root, path.join('yt-mcp', 'studio-channels.json'));
  const cadence = readJSON(root, path.join('yt-mcp', 'cadence.json'));
  const r = readinessFor({ registry, cadence, slug });
  return { ...r, line: readinessLine(slug, r) };
}
