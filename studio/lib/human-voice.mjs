// Human voice as a panel setting (owner-approved 2026-11-21).
// Spec + QA: docs/qa/human-voice-panel-qa.md.
//
// Pure and dependency-free: the panel (Voice drawer + wizard), the profile API
// validation (channel-kit-fields.mjs) and the ENGINE reader
// (lib/voice-profile.mjs) all use this one file, so the rule below exists once
// on the Node side. youtube-flow/narrate.py mirrors resolveVoiceProfile for the
// Python lanes; both are pinned to tests/fixtures/voice-profile-cases.json.
//
//   kit.voiceProfile = { human: boolean, mood: one of HUMAN_MOODS, speed: 0.8–1.2 }
//   The voice itself stays the channel voice (entry.voice / kit.voice).
//
// Engine precedence (resolveVoiceProfile):
//   1. the registry kit.voiceProfile (the panel) wins:
//        human:false -> null (the channel's normal voice chain)
//        human:true  -> { engine:'kokoro', voice: the channel voice, speed, mood }
//                       (null when that voice is not a Kokoro voice)
//   2. no (readable) kit field -> lib/brands.json voiceProfile, exactly as before.

// the 7 moods of explainer/voice_lines.py MOOD, in its order
export const HUMAN_MOODS = Object.freeze(['calm', 'warm', 'excited', 'serious', 'tense', 'sad', 'playful']);
export const MOOD_LABEL = Object.freeze({
  calm: 'Calm', warm: 'Warm', excited: 'Excited', serious: 'Serious', tense: 'Tense', sad: 'Sad', playful: 'Playful',
});
export const SPEED_MIN = 0.8;
export const SPEED_MAX = 1.2;
export const SPEED_STEP = 0.05;
// what the engine does with a mood-less, speed-less profile (voice_lines.py: mood or 'warm', speed 1.0)
export const DEFAULT_VOICE_SETTINGS = Object.freeze({ human: false, mood: 'warm', speed: 1 });
export const HUMAN_PACING_HINT = 'Natural pauses and pace between sentences';

const KOKORO_VOICE_RE = /^[ab][fm]_[a-z]+$/;
const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const text = (v) => (typeof v === 'string' ? v.trim() : '');

export function isKokoroVoice(id) {
  return KOKORO_VOICE_RE.test(text(id));
}

export function clampSpeed(n) {
  return Math.round(Math.min(SPEED_MAX, Math.max(SPEED_MIN, n)) * 100) / 100;
}

// { ok: true, value: { human, mood, speed } } | { ok: false, error } — the error
// is a plain sentence for the 400. Absent mood/speed = the neutral defaults; an
// out-of-range speed is clamped; anything else unexpected is refused.
export function parseVoiceProfile(v) {
  if (!isObj(v)) return { ok: false, error: 'voiceProfile must look like { human, mood, speed }' };
  if (typeof v.human !== 'boolean') return { ok: false, error: 'voiceProfile.human must be true (on) or false (off)' };
  let mood = DEFAULT_VOICE_SETTINGS.mood;
  if (v.mood !== undefined) {
    if (!HUMAN_MOODS.includes(v.mood)) return { ok: false, error: `voiceProfile.mood must be one of ${HUMAN_MOODS.join(', ')}` };
    mood = v.mood;
  }
  let speed = DEFAULT_VOICE_SETTINGS.speed;
  if (v.speed !== undefined) {
    if (typeof v.speed !== 'number' || !Number.isFinite(v.speed)) {
      return { ok: false, error: `voiceProfile.speed must be a number from ${SPEED_MIN} to ${SPEED_MAX}` };
    }
    speed = clampSpeed(v.speed);
  }
  return { ok: true, value: { human: v.human, mood, speed } };
}

// The settings the panel shows for a stored value (never throws; junk/absent = the defaults).
export function voiceSettingsOf(v) {
  const r = parseVoiceProfile(v);
  return r.ok ? r.value : { ...DEFAULT_VOICE_SETTINGS };
}

export function sameVoiceSettings(a, b) {
  const x = voiceSettingsOf(a);
  const y = voiceSettingsOf(b);
  return x.human === y.human && x.mood === y.mood && x.speed === y.speed;
}

// the word under the slider thumb
export function speedWord(speed) {
  if (speed < 0.975) return 'Slower';
  if (speed > 1.025) return 'Faster';
  return 'Normal';
}

// The pre-rendered sample for THIS voice + mood, or null (no clip = no preview,
// never a different voice). previewVoices = the voice ids that have clips
// (the picker list, studio/lib/voices.js — passed in so this file stays pure).
export function previewUrl(voice, mood, previewVoices = []) {
  const v = text(voice);
  if (!v || !previewVoices.includes(v) || !HUMAN_MOODS.includes(mood)) return null;
  return `/voices/human/${v}-${mood}.mp3`;
}

// lib/brands.json voiceProfile, read exactly as before this feature (default-inert).
export function staticVoiceProfile(staticKit) {
  const p = isObj(staticKit) ? staticKit.voiceProfile : null;
  if (!p || typeof p !== 'object' || p.engine !== 'kokoro' || !String(p.voice || '').trim()) return null;
  const speed = Number(p.speed);
  return { engine: 'kokoro', voice: String(p.voice).trim(), speed: Number.isFinite(speed) && speed > 0 ? speed : 1, ...(p.mood ? { mood: String(p.mood) } : {}) };
}

/**
 * The human-voice profile a lane narrates with, or null (the normal voice chain).
 * @param {object} p
 * @param {object|null} p.staticKit  lib/brands.json[slug]
 * @param {object|null} p.entry      yt-mcp/studio-channels.json entry for the slug
 */
export function resolveVoiceProfile({ staticKit = null, entry = null } = {}) {
  const kit = isObj(entry) && isObj(entry.kit) ? entry.kit : {};
  const own = kit.voiceProfile;
  if (isObj(own)) {
    if (own.human === false) return null; // the switch is off — always wins
    const r = parseVoiceProfile(own);
    if (r.ok && r.value.human) {
      const sk = isObj(staticKit) ? staticKit : {};
      const voice = [entry.voice, kit.voice, isObj(sk.voiceProfile) ? sk.voiceProfile.voice : '', sk.voice].map(text).find(Boolean) || '';
      if (!isKokoroVoice(voice)) return null; // human pacing runs on Kokoro only
      return { engine: 'kokoro', voice, speed: r.value.speed, mood: r.value.mood };
    }
    // unreadable kit value: ignored — today's behaviour below
  }
  return staticVoiceProfile(staticKit);
}
