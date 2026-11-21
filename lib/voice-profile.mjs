// The channel's human-voice profile — ONE data source for every lane (step 1 V1/V4).
// Two places can hold it (human voice as a panel setting, docs/qa/human-voice-panel-qa.md):
//   yt-mcp/studio-channels.json entry kit.voiceProfile = { human, mood, speed }  (the panel — WINS)
//   lib/brands.json[slug].voiceProfile = { engine: 'kokoro', voice, speed?, mood? } (static, legacy)
// The rule lives in studio/lib/human-voice.mjs resolveVoiceProfile; youtube-flow/narrate.py
// (voice_profile()) mirrors it, so Shorts, the legacy doc lane, the storybook lane and the
// diagram lane all agree. Kit human:false = null = the channel's normal voice chain.
// No kit field = today's behaviour, byte-identical.
import fs from 'node:fs';
import path from 'node:path';
import { resolveVoiceProfile } from '../studio/lib/human-voice.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const DEFAULT_FILE = path.resolve(HERE, 'brands.json');
const DEFAULT_REGISTRY = path.resolve(HERE, '..', 'yt-mcp', 'studio-channels.json');

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

export function voiceProfileFor(slug, file = DEFAULT_FILE, registryFile = DEFAULT_REGISTRY) {
  if (!slug) return null;
  let kits = readJson(file);
  kits = kits && typeof kits === 'object' ? (kits.brands || kits) : {};
  const staticKit = kits[slug] && typeof kits[slug] === 'object' ? kits[slug] : null;
  const reg = readJson(registryFile);
  const channels = reg && Array.isArray(reg.channels) ? reg.channels : [];
  const entry = channels.find((c) => c && c.slug === slug) || null;
  return resolveVoiceProfile({ staticKit, entry });
}
