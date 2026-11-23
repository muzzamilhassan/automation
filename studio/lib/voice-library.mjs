// The multi-niche voice library (owner-approved 2026-11-22).
// Spec + QA: docs/qa/emotional-voice-qa.md (EV-L).
//
// Pure DATA: every English Kokoro voice in the installed voices-v1.0.bin
// (listed from the model file, 2026-11-22: 11 af_*, 9 am_*, 4 bf_*, 4 bm_*)
// except am_santa (a novelty Santa voice) — 27 voices. Each carries plain
// labels so the owner can pick by ear for any niche. The labels are a
// listening guide, not a rule: no channel is mapped to a voice here
// (no-static-maps) — the channel's pick lives in its kit.voice.
//
// Previews (both say the same short line, no sound tags):
//   /voices/library/<id>.mp3    standard Kokoro voice, human pacing
//                               (scripts/generate-emotional-previews.py --standard)
//   /voices/emotional/<id>.mp3  the emotional GPU engine cloning that voice
//                               (one Kaggle batch, kernel quarry-voice-library)

export const GENDERS = Object.freeze({ female: 'Female', male: 'Male' });
export const ACCENTS = Object.freeze({ american: 'American', british: 'British' });
export const CHARACTERS = Object.freeze({
  deep: 'Deep & calm',
  warm: 'Warm storyteller',
  energetic: 'Energetic',
  soft: 'Soft & slow',
  clear: 'Clear & neutral',
  bright: 'Bright & friendly',
});
export const NICHES = Object.freeze({
  finance: 'Finance',
  business: 'Business',
  history: 'History',
  science: 'Science',
  tech: 'Tech',
  education: 'Education',
  news: 'News',
  motivation: 'Motivation',
  fitness: 'Fitness',
  wellness: 'Wellness',
  sleep: 'Sleep',
  stories: 'Stories',
  'true-crime': 'True crime',
  philosophy: 'Philosophy',
  lifestyle: 'Lifestyle',
  gaming: 'Gaming',
  'kids-safe': 'Kids-safe',
});

const v = (id, name, character, note, niches) => Object.freeze({
  id,
  name,
  gender: id[1] === 'f' ? 'female' : 'male',
  accent: id[0] === 'a' ? 'american' : 'british',
  character,
  note,
  niches: Object.freeze(niches),
});

export const VOICE_LIBRARY = Object.freeze([
  // American female
  v('af_heart', 'Heart', 'warm', 'Warm and bright', ['lifestyle', 'wellness', 'motivation', 'kids-safe']),
  v('af_bella', 'Bella', 'energetic', 'Lively and expressive', ['fitness', 'motivation', 'lifestyle']),
  v('af_nicole', 'Nicole', 'soft', 'Hushed, close to a whisper', ['sleep', 'wellness', 'stories']),
  v('af_aoede', 'Aoede', 'warm', 'Gentle storyteller', ['stories', 'history', 'kids-safe']),
  v('af_kore', 'Kore', 'clear', 'Clear and confident', ['tech', 'education', 'finance']),
  v('af_sarah', 'Sarah', 'bright', 'Friendly and clear', ['education', 'lifestyle', 'tech']),
  v('af_alloy', 'Alloy', 'clear', 'Even and neutral', ['tech', 'news', 'education']),
  v('af_nova', 'Nova', 'bright', 'Bright and upbeat', ['tech', 'lifestyle', 'motivation']),
  v('af_sky', 'Sky', 'bright', 'Light and airy', ['lifestyle', 'kids-safe', 'wellness']),
  v('af_jessica', 'Jessica', 'bright', 'Casual and chatty', ['lifestyle', 'gaming']),
  v('af_river', 'River', 'soft', 'Calm and steady', ['sleep', 'wellness', 'education']),
  // American male
  v('am_michael', 'Michael', 'warm', 'Warm narrator', ['finance', 'history', 'stories']),
  v('am_fenrir', 'Fenrir', 'energetic', 'Bold, high energy', ['motivation', 'fitness', 'gaming']),
  v('am_puck', 'Puck', 'energetic', 'Lively and playful', ['gaming', 'kids-safe', 'lifestyle']),
  v('am_adam', 'Adam', 'deep', 'Deep and steady', ['finance', 'true-crime', 'history']),
  v('am_onyx', 'Onyx', 'deep', 'Deep and dramatic', ['history', 'true-crime', 'motivation']),
  v('am_echo', 'Echo', 'clear', 'Even and measured', ['tech', 'news', 'education']),
  v('am_eric', 'Eric', 'clear', 'Crisp and confident', ['business', 'finance', 'tech']),
  v('am_liam', 'Liam', 'bright', 'Young and friendly', ['tech', 'gaming', 'lifestyle']),
  // British female
  v('bf_emma', 'Emma', 'warm', 'Warm and polished', ['history', 'education', 'lifestyle']),
  v('bf_isabella', 'Isabella', 'soft', 'Refined and calm', ['wellness', 'history', 'philosophy']),
  v('bf_alice', 'Alice', 'clear', 'Clear and proper', ['education', 'news', 'kids-safe']),
  v('bf_lily', 'Lily', 'soft', 'Soft and gentle', ['sleep', 'stories', 'kids-safe']),
  // British male
  v('bm_daniel', 'Daniel', 'clear', 'Documentary style', ['finance', 'science', 'history']),
  v('bm_george', 'George', 'warm', 'Mature storyteller', ['history', 'stories', 'philosophy']),
  v('bm_fable', 'Fable', 'warm', 'Warm and whimsical', ['stories', 'kids-safe', 'history']),
  v('bm_lewis', 'Lewis', 'deep', 'Deep and calm', ['sleep', 'philosophy', 'true-crime']),
]);

export function libraryVoice(id) {
  return VOICE_LIBRARY.find((x) => x.id === id) || null;
}

export function isLibraryVoice(id) {
  return Boolean(libraryVoice(typeof id === 'string' ? id.trim() : ''));
}

// { gender?, accent?, niche? } — an empty filter matches everything
export function filterLibrary({ gender = '', accent = '', niche = '' } = {}) {
  return VOICE_LIBRARY.filter((x) => (!gender || x.gender === gender) && (!accent || x.accent === accent) && (!niche || x.niches.includes(niche)));
}

// The ▶ clip for this voice: the emotional engine's clip when the emotional
// voice is on, else the standard voice. Unknown voice = no clip (never a stand-in).
export function libraryPreviewUrl(id, { emotional = false } = {}) {
  if (!libraryVoice(id)) return null;
  return emotional ? `/voices/emotional/${id}.mp3` : `/voices/library/${id}.mp3`;
}
