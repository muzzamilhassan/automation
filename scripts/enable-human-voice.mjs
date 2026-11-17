#!/usr/bin/env node
// Turn the human voice lane on (or off) for ONE channel — one data field, no code
// (docs/templates/living-diagram.md). Writes lib/brands.json[slug].voiceProfile.
//
//   node scripts/enable-human-voice.mjs <slug> [--voice bm_daniel] [--speed 0.95] [--mood calm]
//   node scripts/enable-human-voice.mjs <slug> --off
//
// --voice defaults to the channel's own Kokoro voice (kit.voice). Moods: calm | warm |
// excited | serious | tense | sad | playful. Takes effect on the next pipeline run
// (Shorts, the regular doc lane, the storybook and Living Diagram lanes).
import fs from 'node:fs';
import path from 'node:path';

const KOKORO_ID = /^[ab][fm]_[a-z]+$/; // af_heart, am_michael, bm_daniel, bf_emma ...
const MOODS = ['calm', 'warm', 'excited', 'serious', 'tense', 'sad', 'playful'];

export function setVoiceProfile(kits, slug, { voice, speed, mood, off = false } = {}) {
  const root = kits.brands || kits;
  const kit = root[slug];
  if (!kit) throw new Error(`unknown channel "${slug}" — not in lib/brands.json`);
  if (off) { delete kit.voiceProfile; return null; }
  const v = String(voice || kit.voice || '').trim();
  if (!KOKORO_ID.test(v)) throw new Error(`"${v}" is not a Kokoro voice id (e.g. bm_daniel, af_heart) — pass --voice`);
  const sp = speed === undefined ? 1 : Number(speed);
  if (!(sp >= 0.7 && sp <= 1.3)) throw new Error('--speed must be between 0.7 and 1.3');
  if (mood !== undefined && !MOODS.includes(mood)) throw new Error(`--mood must be one of ${MOODS.join('|')}`);
  kit.voiceProfile = { engine: 'kokoro', voice: v, speed: sp, ...(mood ? { mood } : {}) };
  return kit.voiceProfile;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
if (isMain) {
  const args = process.argv.slice(2);
  const slug = args.find((a) => !a.startsWith('--'));
  const opt = (k) => { const i = args.indexOf(`--${k}`); return i > -1 ? args[i + 1] : undefined; };
  if (!slug) { console.error('usage: node scripts/enable-human-voice.mjs <slug> [--voice id] [--speed 0.95] [--mood calm] | --off'); process.exit(1); }
  const file = path.resolve('lib', 'brands.json');
  const kits = JSON.parse(fs.readFileSync(file, 'utf8'));
  try {
    const p = setVoiceProfile(kits, slug, { voice: opt('voice'), speed: opt('speed'), mood: opt('mood'), off: args.includes('--off') });
    fs.writeFileSync(file, JSON.stringify(kits, null, 2) + '\n');
    console.log(p ? `${slug}: human voice ON ${JSON.stringify(p)}` : `${slug}: human voice OFF (legacy voice paths)`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
