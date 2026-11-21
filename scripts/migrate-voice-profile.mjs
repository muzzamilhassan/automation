#!/usr/bin/env node
// Human voice as a panel setting (docs/qa/human-voice-panel-qa.md, HV-M1..M5) —
// ONE-TIME copy of every static lib/brands.json voiceProfile into the channel's
// registry kit.voiceProfile = { human: true, mood, speed }, so the panel's Voice
// section shows the REAL current setting. Nothing changes on screen or in the
// audio: a channel is copied only when every lane resolves the very same
// profile afterwards (lib/voice-profile.mjs + narrate.py, kit wins); anything
// else is skipped with the reason. Data-driven — no channel is named here.
// Idempotent: a channel whose kit already has voiceProfile is left alone.
//
// RUNBOOK
//   1. Dry run (default, read-only, local files only):
//        node scripts/migrate-voice-profile.mjs
//   2. Apply (Neon kit + this working tree's yt-mcp/studio-channels.json, via
//      the panel's own single-key writer setChannelKitFields; needs
//      DATABASE_URL in .env for the Neon half):
//        node scripts/migrate-voice-profile.mjs --apply
//   3. Commit + push yt-mcp/studio-channels.json (the engine reads the committed file).
//   The static lib/brands.json voiceProfile stays in place (harmless: the kit wins).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HUMAN_MOODS, clampSpeed, staticVoiceProfile, resolveVoiceProfile } from '../studio/lib/human-voice.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');

const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
// what the lanes actually do: a mood-less profile narrates with 'warm' (voice_lines.py)
const sound = (p) => (p ? `${p.voice} ${p.mood || 'warm'} ${p.speed}` : 'the normal voice');

/**
 * @param {object} staticKits lib/brands.json (with or without the { brands } wrapper)
 * @param {object} registry   yt-mcp/studio-channels.json ({ channels: [...] })
 * @returns {{ copies: {slug, voiceProfile}[], skipped: {slug, reason}[] }}
 */
export function planVoiceProfileMigration(staticKits, registry) {
  const kits = isObj(staticKits) ? (staticKits.brands || staticKits) : {};
  const channels = isObj(registry) && Array.isArray(registry.channels) ? registry.channels : [];
  const copies = [];
  const skipped = [];
  for (const [slug, kit] of Object.entries(kits)) {
    const st = staticVoiceProfile(kit);
    if (!st) continue; // no (usable) static profile: nothing to copy
    const entry = channels.find((c) => isObj(c) && c.slug === slug);
    if (!entry) { skipped.push({ slug, reason: 'not in the engine registry (yt-mcp/studio-channels.json) — nothing to copy into' }); continue; }
    if (isObj(entry.kit) && entry.kit.voiceProfile !== undefined) { skipped.push({ slug, reason: 'already set in the panel' }); continue; }
    if (st.mood !== undefined && !HUMAN_MOODS.includes(st.mood)) { skipped.push({ slug, reason: `mood "${st.mood}" is not one of the panel moods` }); continue; }
    const voiceProfile = { human: true, mood: st.mood || 'warm', speed: clampSpeed(st.speed) };
    const before = resolveVoiceProfile({ staticKit: kit, entry });
    const after = resolveVoiceProfile({ staticKit: kit, entry: { ...entry, kit: { ...(isObj(entry.kit) ? entry.kit : {}), voiceProfile } } });
    if (sound(before) !== sound(after)) {
      skipped.push({ slug, reason: `would change what the channel sounds like (now ${sound(before)}, after ${sound(after)})` });
      continue;
    }
    copies.push({ slug, voiceProfile });
  }
  return { copies, skipped };
}

async function main() {
  const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  const plan = planVoiceProfileMigration(readJson('lib/brands.json'), readJson('yt-mcp/studio-channels.json'));
  for (const c of plan.copies) console.log(`COPY  ${c.slug.padEnd(22)} kit.voiceProfile = ${JSON.stringify(c.voiceProfile)}`);
  for (const s of plan.skipped) console.log(`SKIP  ${s.slug.padEnd(22)} ${s.reason}`);
  if (!plan.copies.length) { console.log('nothing to copy'); return 0; }
  if (!APPLY) {
    console.log(`dry run — ${plan.copies.length} channel(s) would be copied; add --apply to write`);
    return 0;
  }
  // channels-registry resolves the repo as cwd/.. (it runs from studio/): run it
  // from studio/ so it writes THIS tree's engine file (local mode) and reads .env
  process.chdir(path.join(ROOT, 'studio'));
  const { loadEnv } = await import(pathToFileURL(path.join(ROOT, 'lib', 'env.mjs')).href);
  loadEnv();
  const { setChannelKitFields } = await import(pathToFileURL(path.join(ROOT, 'studio', 'lib', 'channels-registry.js')).href);
  const { closeDb } = await import(pathToFileURL(path.join(ROOT, 'studio', 'lib', 'db.mjs')).href);
  let failed = 0;
  try {
    for (const c of plan.copies) {
      const res = await setChannelKitFields(c.slug, { voiceProfile: c.voiceProfile }, { message: `migrate: ${c.slug} human voice into the panel` });
      if (!res.ok) failed += 1;
      console.log(`${res.ok ? 'WROTE' : 'FAILED'} ${c.slug}${res.reason ? ` (${res.reason})` : ''}${res.warnings?.length ? ` — ${res.warnings.join('; ')}` : ''}`);
    }
  } finally {
    await closeDb();
  }
  console.log('done — commit yt-mcp/studio-channels.json so the engine sees it');
  return failed ? 1 : 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().then((code) => process.exit(code), (e) => { console.error(String(e?.stack || e)); process.exit(1); });
}
