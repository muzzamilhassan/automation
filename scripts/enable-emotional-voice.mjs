#!/usr/bin/env node
// Emotional voice via the free Kaggle GPU (docs/qa/emotional-voice-qa.md EV-X) —
// turn it on for ONE channel from the command line, exactly as the panel's
// Voice drawer would: kit.voiceProfile gains { emotional: true, expression,
// model } (human pacing stays on — it is the fallback), written through the
// panel's own single-key writer setChannelKitFields. Data-driven: no channel
// is named here.
//
// RUNBOOK
//   1. Dry run (default, read-only, local files only):
//        node scripts/enable-emotional-voice.mjs money-rulebook [--expression none|light|rich]
//   2. Apply (Neon kit + this working tree's yt-mcp/studio-channels.json; needs
//      DATABASE_URL in .env for the Neon half):
//        node scripts/enable-emotional-voice.mjs money-rulebook --apply
//   3. Commit + push yt-mcp/studio-channels.json (the engine reads the committed file).
//   Turn it off again from the panel (Voice drawer) or with --off.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseVoiceProfile, resolveVoiceProfile, isKokoroVoice } from '../studio/lib/human-voice.mjs';
import { EXPRESSIONS, DEFAULT_EXPRESSION, DEFAULT_GPU_MODEL } from '../studio/lib/emotional-voice.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/**
 * @param {object} registry  yt-mcp/studio-channels.json ({ channels: [...] })
 * @param {object} staticKits lib/brands.json (with or without the { brands } wrapper)
 * @returns {{ ok: true, slug, voiceProfile, before, after } | { ok: false, error }}
 */
export function planEmotionalVoice(registry, staticKits, slug, { expression = DEFAULT_EXPRESSION, off = false } = {}) {
  if (!slug) return { ok: false, error: 'usage: enable-emotional-voice.mjs <slug> [--expression none|light|rich] [--apply] [--off]' };
  if (!EXPRESSIONS.includes(expression)) return { ok: false, error: `--expression must be one of ${EXPRESSIONS.join(', ')}` };
  const channels = isObj(registry) && Array.isArray(registry.channels) ? registry.channels : [];
  const entry = channels.find((c) => isObj(c) && c.slug === slug);
  if (!entry) return { ok: false, error: `${slug} is not in the engine registry (yt-mcp/studio-channels.json)` };
  const kits = isObj(staticKits) ? (staticKits.brands || staticKits) : {};
  const staticKit = isObj(kits[slug]) ? kits[slug] : null;
  const kit = isObj(entry.kit) ? entry.kit : {};
  const cur = parseVoiceProfile(isObj(kit.voiceProfile) ? kit.voiceProfile : { human: false });
  const base = cur.ok ? cur.value : { human: false, mood: 'warm', speed: 1 };
  const next = parseVoiceProfile(off
    ? { ...base, emotional: false }
    : { ...base, human: true, emotional: true, expression, model: DEFAULT_GPU_MODEL });
  if (!next.ok) return { ok: false, error: next.error };
  const before = resolveVoiceProfile({ staticKit, entry });
  const after = resolveVoiceProfile({ staticKit, entry: { ...entry, kit: { ...kit, voiceProfile: next.value } } });
  if (!off && !(after && after.emotional)) {
    const voice = entry.voice || kit.voice || '';
    return { ok: false, error: isKokoroVoice(voice) ? 'the emotional voice would not resolve for this channel' : `the channel voice "${voice}" is not a library (Kokoro) voice — pick one in the Voice drawer first` };
  }
  return { ok: true, slug, voiceProfile: next.value, before, after };
}

async function main(argv = process.argv.slice(2)) {
  const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const slug = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--expression');
  const APPLY = argv.includes('--apply');
  const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  const plan = planEmotionalVoice(readJson('yt-mcp/studio-channels.json'), readJson('lib/brands.json'), slug, {
    expression: flag('--expression') || DEFAULT_EXPRESSION,
    off: argv.includes('--off'),
  });
  if (!plan.ok) { console.error(plan.error); return 1; }
  console.log(`${plan.slug}: kit.voiceProfile = ${JSON.stringify(plan.voiceProfile)}`);
  console.log(`  narrates now  : ${JSON.stringify(plan.before)}`);
  console.log(`  narrates after: ${JSON.stringify(plan.after)}`);
  if (!APPLY) {
    console.log('dry run — nothing written; add --apply to write');
    return 0;
  }
  // channels-registry resolves the repo as cwd/.. (it runs from studio/): run it
  // from studio/ so it writes THIS tree's engine file (local mode) and reads .env
  process.chdir(path.join(ROOT, 'studio'));
  const { loadEnv } = await import(pathToFileURL(path.join(ROOT, 'lib', 'env.mjs')).href);
  loadEnv();
  const { setChannelKitFields } = await import(pathToFileURL(path.join(ROOT, 'studio', 'lib', 'channels-registry.js')).href);
  const { closeDb } = await import(pathToFileURL(path.join(ROOT, 'studio', 'lib', 'db.mjs')).href);
  try {
    const res = await setChannelKitFields(plan.slug, { voiceProfile: plan.voiceProfile }, { message: `studio: emotional voice for ${plan.slug}` });
    console.log(`${res.ok ? 'WROTE' : 'FAILED'} ${plan.slug}${res.reason ? ` (${res.reason})` : ''}${res.warnings?.length ? ` — ${res.warnings.join('; ')}` : ''}`);
    if (res.ok) console.log('done — commit yt-mcp/studio-channels.json so the engine sees it');
    return res.ok ? 0 : 1;
  } finally {
    await closeDb();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().then((code) => process.exit(code), (e) => { console.error(String(e?.stack || e)); process.exit(1); });
}
