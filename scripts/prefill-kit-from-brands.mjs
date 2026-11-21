// One-time pre-fill for "100% ready before anything publishes" (owner,
// 2026-11-21, FEEDBACK item K). DO NOT RUN WITH --apply WITHOUT REVIEW.
//
// The readiness checklist (studio/lib/channel-readiness.mjs) counts only
// panel data — the registry entry + kit — never the static brand files. The
// four legacy channels still get their voice / description / tags from those
// files (yt-brands/brands.mjs → lib/brand-resolve.mjs mergeBrand). This script
// copies what the engine ALREADY uses into the registry kit, ONLY where the
// kit field is empty, so nothing about the videos changes.
//
// Channels that are running today (autopilot ON and active in the registry —
// data, not names; override with --keep-running=a,b) also get:
//   kit.storyShape = 'template'   (today's behaviour: the template default)
//   kit.templateId (+ version, major) mirrored from their ACTIVE Neon template
// so they stay 7/7 and keep publishing. Every other channel gets NO template
// and NO story shape — the owner chooses those in the panel.
//
// Usage (from the repo root):
//   node scripts/prefill-kit-from-brands.mjs                  dry run (default): reads repo files only, writes nothing
//   node scripts/prefill-kit-from-brands.mjs --apply          writes Neon + yt-mcp/studio-channels.json
//   node scripts/prefill-kit-from-brands.mjs --apply --keep-running=<slug>[,<slug>]
//   node scripts/prefill-kit-from-brands.mjs --apply --mirror-all-assignments   also mirror paused channels' Neon templates
//
// --apply writes through studio/lib/channels-registry.js setChannelKitFields —
// the same kit-only path the panel's template assign and schedule saves use
// (Neon kit JSONB patched, then the engine file re-read and ONLY that entry
// changed). It needs DATABASE_URL: process.env, or the repo-root .env that
// studio/lib/data.mjs reads. It aborts BEFORE any write if a running channel
// has no active template in Neon (it would stop publishing). Afterwards:
// commit yt-mcp/studio-channels.json together with the readiness code, and
// push promptly (the panel writes the same file through the GitHub API).
// Spec + QA: docs/qa/channel-readiness-qa.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { channelReadiness, storyShapeOfKit } from '../studio/lib/channel-readiness.mjs';

const filled = (v) => (Array.isArray(v) ? v.some((x) => String(x ?? '').trim() !== '') : String(v ?? '').trim() !== '');
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const COPY_FIELDS = ['voice', 'description', 'tags'];

/** Channels that publish today: autopilot ON and active (registry data). */
export function keepRunningSlugs(channels) {
  return (channels || []).filter((c) => isObj(c) && c.autopilot === true && c.active !== false).map((c) => c.slug);
}

/**
 * Pure plan. channels = registry entries; effectiveBrand(slug) = what the
 * engine uses today (lib/brand-resolve.mjs resolveBrand); legacyBySlug = the
 * static brand kits (only channels WITH one get anything copied — a channel
 * without one would only receive invented defaults).
 */
export function planPrefill({ channels, cadence, legacyBySlug, effectiveBrand, keepRunning = [] }) {
  const keep = new Set(keepRunning);
  const rows = [];
  for (const e of channels || []) {
    if (!isObj(e) || typeof e.slug !== 'string') continue;
    const kit = isObj(e.kit) ? e.kit : {};
    const schedule = isObj(cadence) ? cadence[e.slug] || null : null;
    const patch = {};
    const notes = [];
    if (legacyBySlug?.[e.slug]) {
      const eff = effectiveBrand(e.slug) || {};
      for (const f of COPY_FIELDS) {
        if (filled(kit[f])) continue;
        if (filled(eff[f])) patch[f] = Array.isArray(eff[f]) ? eff[f].filter((x) => filled(x)) : String(eff[f]);
        else notes.push(`${f}: nothing to copy (empty today too)`);
      }
    } else {
      notes.push('no static brand kit — nothing to copy');
    }
    const running = keep.has(e.slug);
    if (running && !storyShapeOfKit(kit)) patch.storyShape = 'template';
    const mirrorTemplate = running && !filled(kit.templateId);
    const nextKit = { ...kit, ...patch };
    rows.push({
      slug: e.slug,
      running,
      patch,
      mirrorTemplate,
      notes,
      before: channelReadiness({ entry: e, schedule }),
      after: channelReadiness({ entry: { ...e, kit: nextKit }, schedule }),
      afterWithMirror: channelReadiness({ entry: { ...e, kit: mirrorTemplate ? { ...nextKit, templateId: '(from Neon)' } : nextKit }, schedule }),
    });
  }
  return { rows };
}

/**
 * Apply a plan through injected writers (tests pass fakes; main() passes the
 * real Neon + registry writers). Order: every lookup first, then the writes —
 * a running channel without a Neon template aborts before anything is written.
 */
export async function applyPlan(plan, { readDbKit, getAssignment, writeKit, log = console.log, mirrorAll = false }) {
  const notes = [];
  const work = [];
  for (const row of plan.rows) {
    const dbKit = (await readDbKit(row.slug)) || {};
    const patch = { ...row.patch };
    for (const f of COPY_FIELDS) {
      if (f in patch && filled(dbKit[f])) {
        patch[f] = dbKit[f];
        notes.push(`${row.slug}: kept the ${f} already saved in the panel (Neon)`);
      }
    }
    const asg = await getAssignment(row.slug);
    if (row.mirrorTemplate || (mirrorAll && asg)) {
      if (!asg) {
        return { ok: false, error: `${row.slug} has no active template in Neon — assign one in the panel first, or it stops publishing. Nothing was written.`, notes };
      }
      Object.assign(patch, { templateId: asg.family_id, templateVersion: asg.pinned_version || null, templateMajor: asg.pinned_major ?? null });
    } else if (asg && !row.mirrorTemplate) {
      notes.push(`${row.slug} has an active template "${asg.family_id}" in Neon that is not mirrored (owner choice pending) — re-assign it in the panel, or rerun with --mirror-all-assignments`);
    }
    if (Object.keys(patch).length) work.push([row.slug, patch]);
  }
  for (const [slug, patch] of work) {
    const res = await writeKit(slug, patch);
    log(`${res?.ok ? 'wrote' : 'NOT written'} ${slug}: ${Object.keys(patch).join(', ')}${res?.ok ? '' : ` (${res?.reason || 'unknown'})`}`);
  }
  return { ok: true, written: work.map(([s]) => s), notes };
}

function cell(r) {
  return `${r.done}/${r.total}${r.ready ? ' ready' : ''}`;
}

function printTable(plan, { applied = false } = {}) {
  console.log(`\nchannel                  before → after          fields written`);
  for (const row of plan.rows) {
    const after = row.mirrorTemplate && !applied ? `${cell(row.after)} (${cell(row.afterWithMirror)} with template)` : cell(row.after);
    const fields = [...Object.keys(row.patch), ...(row.mirrorTemplate ? ['templateId (+version, major) from Neon'] : [])];
    console.log(`${row.slug.padEnd(24)} ${cell(row.before).padEnd(8)} → ${after.padEnd(14)} ${fields.join(', ') || '—'}`);
    const missing = (row.mirrorTemplate ? row.afterWithMirror : row.after).items.filter((i) => !i.ok).map((i) => i.label);
    if (missing.length) console.log(`${''.padEnd(24)} still missing: ${missing.join('; ')}`);
    for (const n of row.notes) console.log(`${''.padEnd(24)} note: ${n}`);
  }
}

async function main(argv) {
  const APPLY = argv.includes('--apply');
  const MIRROR_ALL = argv.includes('--mirror-all-assignments');
  const keepArg = argv.find((a) => a.startsWith('--keep-running='));
  if (!fs.existsSync(path.join(process.cwd(), 'yt-mcp', 'studio-channels.json'))) {
    console.error('Run from the repo root (yt-mcp/studio-channels.json not found here).');
    return 1;
  }
  const registry = JSON.parse(fs.readFileSync('yt-mcp/studio-channels.json', 'utf8'));
  let cadence = null;
  try { cadence = JSON.parse(fs.readFileSync('yt-mcp/cadence.json', 'utf8')); } catch { cadence = null; }
  const { resolveBrand } = await import('../lib/brand-resolve.mjs');
  const { bySlug } = await import('../yt-brands/brands.mjs');
  const channels = registry.channels || [];
  const keepRunning = keepArg ? keepArg.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean) : keepRunningSlugs(channels);
  const plan = planPrefill({ channels, cadence, legacyBySlug: bySlug, effectiveBrand: resolveBrand, keepRunning });

  console.log(APPLY ? 'APPLY — writing Neon + yt-mcp/studio-channels.json' : 'DRY RUN — nothing is written (add --apply to write)');
  console.log(`keep running (storyShape template + Neon template mirrored): ${keepRunning.join(', ') || 'none'}`);
  printTable(plan);
  if (!APPLY) return 0;

  // --apply: Studio's own writers. studio/lib resolves the repo from cwd/..,
  // so switch into studio/ BEFORE importing them.
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  process.chdir(path.join(ROOT, 'studio'));
  const { db, dbReady, closeDb } = await import(pathToFileURL(path.join(ROOT, 'studio', 'lib', 'db.mjs')).href);
  if (!dbReady) {
    console.error('DATABASE_URL is not set (process env or the repo-root .env) — nothing was written.');
    return 1;
  }
  const { setChannelKitFields } = await import(pathToFileURL(path.join(ROOT, 'studio', 'lib', 'channels-registry.js')).href);
  const { getRegistryDb } = await import(pathToFileURL(path.join(ROOT, 'studio', 'lib', 'template-registry-db.js')).href);
  const reg = await getRegistryDb();
  const res = await applyPlan(plan, {
    readDbKit: async (slug) => (await db`SELECT kit FROM channels WHERE slug = ${slug}`)?.[0]?.kit || {},
    getAssignment: (slug) => reg.getActiveAssignment(slug),
    writeKit: (slug, patch) => setChannelKitFields(slug, patch, { message: `prefill: ${slug} kit from the engine's current brand (readiness gate)` }),
    mirrorAll: MIRROR_ALL,
  });
  for (const n of res.notes || []) console.log(`note: ${n}`);
  if (!res.ok) {
    console.error(res.error);
    await closeDb();
    return 1;
  }
  const after = JSON.parse(fs.readFileSync(path.join(ROOT, 'yt-mcp', 'studio-channels.json'), 'utf8'));
  const afterCad = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'yt-mcp', 'cadence.json'), 'utf8')); } catch { return null; } })();
  console.log('\nreadiness now (engine file):');
  for (const c of after.channels || []) {
    const r = channelReadiness({ entry: c, schedule: afterCad?.[c.slug] || null });
    console.log(`${String(c.slug).padEnd(24)} ${cell(r)}`);
  }
  await closeDb();
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => {
    console.error(e?.stack || e);
    process.exit(1);
  });
}
