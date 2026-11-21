// Shared test fixtures for the "100% ready before anything publishes" rule
// (studio/lib/channel-readiness.mjs). Since 2026-11-21 the autopilot's
// discover step only runs channels that are 7/7 ready, so discovery tests
// build their own registry + cadence instead of reading the live files (the
// live channels are ready only after scripts/prefill-kit-from-brands.mjs).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const READY_DAYS = Object.freeze({ docDays: ['Thu'], shortDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] });

/** A registry entry with all 7 panel items set. `over.kit` merges into the kit. */
export function readyEntry(slug, over = {}) {
  const cron = over.cron === undefined ? '21 3 * * *' : over.cron;
  return {
    slug,
    label: slug,
    niche: 'Personal finance rules',
    tokenSecretSaved: true,
    active: true,
    autopilot: true,
    ...over,
    ...(cron ? { cron } : {}),
    kit: {
      templateId: 'myth-vs-money',
      storyShape: 'template',
      description: 'A real description.',
      tags: ['money'],
      voice: 'bm_daniel',
      thumbTemplates: ['ledger', 'coinflip'],
      slots: ['00:05'],
      longSlot: '22:30',
      ...(cron ? { gateCron: cron } : {}),
      ...(over.kit || {}),
    },
  };
}

/**
 * Pipeline harnesses (channel-pipeline.mjs spawned in a sandbox cwd): since
 * 2026-11-21 the pipeline refuses a channel that is not 7/7 ready, so a
 * sandbox needs the registry entry + cadence row production will have after
 * scripts/prefill-kit-from-brands.mjs. Built FROM the channel's static brand
 * kit so the merged brand the pipeline sees stays the same as the old
 * legacy-only sandbox (tests/readiness-gate.test.mjs pins that). The cadence
 * row sets only shortDays (all 7 — read by the stubbed clips child only); no
 * docDays, so the doc-day logic keeps the kit's own docDay.
 */
export function readyFilesFor(slug, legacy) {
  const entry = {
    slug,
    label: legacy.label,
    handle: legacy.handle || '',
    niche: legacy.niche,
    accent: legacy.accent,
    tokenSecretSaved: true,
    active: true,
    autopilot: true,
    cron: '13 2 * * *',
    kit: {
      templateId: 'fixture-template',
      storyShape: 'template',
      voice: legacy.voice,
      description: legacy.description || 'Fixture description.',
      tags: legacy.tags,
      niches: legacy.niches,
      thumbTemplates: legacy.thumbTemplates?.length >= 2 ? legacy.thumbTemplates : ['ledger', 'coinflip'],
      slots: legacy.slots,
      longSlot: legacy.longSlot,
      docDay: legacy.docDay,
      gateCron: '13 2 * * *',
    },
  };
  return {
    'yt-mcp/studio-channels.json': JSON.stringify({ channels: [entry] }),
    'yt-mcp/cadence.json': JSON.stringify({ [slug]: { shortDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] } }),
  };
}

/** A test's own cadence.json (string or object) + the ready Shorts days for `slug` (the test's fields win). */
export function withReadyDays(slug, cadence) {
  const c = typeof cadence === 'string' ? JSON.parse(cadence) : { ...(cadence || {}) };
  c[slug] = { shortDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], ...(c[slug] || {}) };
  return JSON.stringify(c);
}

/** cadence.json body giving every listed slug the ready upload days. */
export function readyCadence(slugs) {
  return Object.fromEntries(slugs.map((s) => [s, { ...READY_DAYS }]));
}

/**
 * A throwaway repo root for running the workflow's discover script: copies of
 * the two modules it imports (same relative layout) + the engine files.
 * states = { slug: stateJson } written under yt-mcp/state/.
 */
export function discoverFixtureRoot({ channels, cadence, states = {} }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ready-disc-'));
  for (const f of ['lib/schedule-slot.mjs', 'studio/lib/channel-readiness.mjs']) {
    fs.mkdirSync(path.join(dir, path.dirname(f)), { recursive: true });
    fs.copyFileSync(f, path.join(dir, f));
  }
  fs.mkdirSync(path.join(dir, 'yt-mcp', 'state'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'yt-mcp', 'studio-channels.json'), JSON.stringify({ channels }));
  if (cadence !== undefined) fs.writeFileSync(path.join(dir, 'yt-mcp', 'cadence.json'), JSON.stringify(cadence));
  for (const [slug, st] of Object.entries(states)) {
    fs.writeFileSync(path.join(dir, 'yt-mcp', 'state', `${slug}.json`), JSON.stringify(st));
  }
  return dir;
}
