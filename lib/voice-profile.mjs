// The channel's human-voice profile — ONE data source for every lane (step 1 V1/V4).
// lib/brands.json[slug].voiceProfile = { engine: 'kokoro', voice, speed?, mood? }.
// youtube-flow/narrate.py reads the same file (voice_profile()), so Shorts, the
// legacy doc lane, the storybook lane and the diagram lane all agree. Absent or
// malformed = null = today's voice paths, byte-identical.
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_FILE = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'brands.json');

export function voiceProfileFor(slug, file = DEFAULT_FILE) {
  if (!slug) return null;
  let kits;
  try { kits = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
  kits = kits && typeof kits === 'object' ? (kits.brands || kits) : {};
  const p = kits[slug] && typeof kits[slug] === 'object' ? kits[slug].voiceProfile : null;
  if (!p || typeof p !== 'object' || p.engine !== 'kokoro' || !String(p.voice || '').trim()) return null;
  const speed = Number(p.speed);
  return { engine: 'kokoro', voice: String(p.voice).trim(), speed: Number.isFinite(speed) && speed > 0 ? speed : 1, ...(p.mood ? { mood: String(p.mood) } : {}) };
}
