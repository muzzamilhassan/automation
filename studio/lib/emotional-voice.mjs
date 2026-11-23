// Emotional voice via the free Kaggle GPU (owner-approved 2026-11-22).
// Spec + QA: docs/qa/emotional-voice-qa.md.
//
// Pure and dependency-free: the panel (Voice drawer + wizard), the profile
// validation (human-voice.mjs / channel-kit-fields.mjs), the doc script writer
// (yt-deepdive.mjs) and the doc lanes all use this one file.
//
//   kit.voiceProfile gains { emotional: boolean, expression: 'none'|'light'|'rich', model }
//   Absent / emotional:false = today's voice, byte-identical.
//
// The GPU engine model is DATA (GPU_VOICE_MODELS): a new model plugs in with a
// catalog entry here + a kernel recipe in explainer/kaggle_voice.py MODELS —
// no per-channel code. Only chatterbox-turbo is built today.
//
// Expression (owner 2026-11-22: the laughs sounded unnatural):
//   none  (default) natural delivery only — the script carries NO tags
//   light a rare sigh / throat-clear, at most one per 6 sentences
//   rich  adds chuckle / laugh / gasp, at most one per 4 sentences
// Tags never reach the screen, captions, SRT, titles or descriptions:
// stripVoiceTags / stripEpisodeTags run before anything is shown.

export const GPU_VOICE_MODELS = Object.freeze([
  Object.freeze({
    id: 'chatterbox-turbo',
    label: 'Chatterbox Turbo',
    // every tag token the model's tokenizer knows (ResembleAI/chatterbox-turbo added_tokens.json)
    tags: Object.freeze([
      'advertisement', 'angry', 'chuckle', 'clear throat', 'cough', 'crying', 'dramatic', 'fear', 'gasp', 'groan',
      'happy', 'laugh', 'narration', 'sarcastic', 'shush', 'sigh', 'sniff', 'surprised', 'whispering',
    ]),
    // the narration-safe sounds a script may carry, per expression level
    expressionTags: Object.freeze({
      none: Object.freeze([]),
      light: Object.freeze(['sigh', 'clear throat']),
      rich: Object.freeze(['sigh', 'clear throat', 'chuckle', 'laugh', 'gasp']),
    }),
  }),
]);
export const DEFAULT_GPU_MODEL = 'chatterbox-turbo';
export const EXPRESSIONS = Object.freeze(['none', 'light', 'rich']);
export const DEFAULT_EXPRESSION = 'none';
export const EXPRESSION_LABEL = Object.freeze({ none: 'None', light: 'Light', rich: 'Rich' });
export const EXPRESSION_HINT = Object.freeze({
  none: 'Natural delivery, no sounds',
  light: 'A rare sigh',
  rich: 'Sighs, chuckles, the odd laugh',
});
// at most one tag per N sentences
export const TAG_DENSITY = Object.freeze({ light: 6, rich: 4 });
export const EMOTIONAL_LABEL = 'Emotional voice (laughs, sighs) — free GPU';
export const EMOTIONAL_HINT = 'A more natural, expressive read. Falls back to the standard voice if the free GPU is busy.';

const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

export function gpuModel(id) {
  return GPU_VOICE_MODELS.find((m) => m.id === id) || null;
}

// the tags a script may carry at this level (null = unknown model)
export function expressionTags(expression, model = DEFAULT_GPU_MODEL) {
  const m = gpuModel(model);
  if (!m) return null;
  return [...(m.expressionTags[expression] || [])];
}

// { ok, value: { emotional, expression, model } } | { ok:false, error } — the
// emotional half of kit.voiceProfile. Absent expression/model = the defaults.
export function parseEmotional(v) {
  const src = isObj(v) ? v : {};
  if (src.emotional !== undefined && typeof src.emotional !== 'boolean') {
    return { ok: false, error: 'voiceProfile.emotional must be true (on) or false (off)' };
  }
  let expression = DEFAULT_EXPRESSION;
  if (src.expression !== undefined) {
    if (!EXPRESSIONS.includes(src.expression)) return { ok: false, error: `voiceProfile.expression must be one of ${EXPRESSIONS.join(', ')}` };
    expression = src.expression;
  }
  let model = DEFAULT_GPU_MODEL;
  if (src.model !== undefined) {
    if (!gpuModel(src.model)) return { ok: false, error: `voiceProfile.model must be one of ${GPU_VOICE_MODELS.map((m) => m.id).join(', ')}` };
    model = src.model;
  }
  return { ok: true, value: { emotional: src.emotional === true, expression, model } };
}

// the emotional settings the panel shows for a stored value (never throws)
export function emotionalOf(v) {
  const r = parseEmotional(v);
  return r.ok ? r.value : { emotional: false, expression: DEFAULT_EXPRESSION, model: DEFAULT_GPU_MODEL };
}

// ---- tags --------------------------------------------------------------

const ALL_TAGS = new Set(GPU_VOICE_MODELS.flatMap((m) => m.tags));
const BRACKET_RE = /\[([^\]\n]{1,30})\]/g;
const tagName = (inner) => String(inner).toLowerCase().replace(/\s+/g, ' ').trim();
const tidy = (s) => s.replace(/[ \t]{2,}/g, ' ').replace(/ +([.,!?;:…])/g, '$1').replace(/^ +| +$/gm, '').trim();

// Removes every voice tag any GPU model knows; any other bracketed text stays.
// Text with no voice tag comes back unchanged (byte-identical).
export function stripVoiceTags(text) {
  const s = typeof text === 'string' ? text : '';
  let hit = false;
  const out = s.replace(BRACKET_RE, (m, inner) => {
    if (!ALL_TAGS.has(tagName(inner))) return m;
    hit = true;
    return ' ';
  });
  return hit ? tidy(out) : s;
}

const splitSentences = (s) => s.split(/(?<=[.!?])\s+/);

// A narration's tags, made safe for the engine: only this level's tags,
// lower-case, at most one per sentence, never dangling at a sentence end, and
// at most one per TAG_DENSITY[level] sentences. 'none' (or unknown) = no tags.
export function sanitizeNarrationTags(text, expression, model = DEFAULT_GPU_MODEL) {
  const s = typeof text === 'string' ? text : '';
  const allowed = expressionTags(expression, model) || [];
  const density = TAG_DENSITY[expression];
  if (!allowed.length || !density) return stripVoiceTags(s);
  const sentences = splitSentences(s);
  let last = -Infinity;
  const out = sentences.map((snt, k) => {
    let kept = false;
    return snt.replace(BRACKET_RE, (m, inner, at) => {
      const name = tagName(inner);
      // non-voice bracketed text in a spoken line is dropped too (the engine would say it)
      if (!allowed.includes(name)) return ' ';
      const rest = snt.slice(at + m.length);
      if (kept || k - last < density || !/[A-Za-z0-9]/.test(rest)) return ' ';
      kept = true;
      last = k;
      return `[${name}]`;
    });
  });
  // a narration too short for even one tag carries none
  if (sentences.length < density) return tidy(out.join(' ').replace(BRACKET_RE, (m, inner) => (ALL_TAGS.has(tagName(inner)) ? ' ' : m)));
  return tidy(out.join(' '));
}

const titleSafe = (t) => (typeof t === 'string' ? stripVoiceTags(t) : t);

// After the doc script is written: titles lose every tag; the narration keeps
// only what this level allows. Off / 'none' / unknown = the SAME object back.
export function sanitizeEpisodeTags(script, expression, model = DEFAULT_GPU_MODEL) {
  if (!isObj(script) || !expressionTags(expression, model)?.length) return script;
  const narr = (t) => (typeof t === 'string' ? sanitizeNarrationTags(t, expression, model) : t);
  return {
    ...script,
    title: titleSafe(script.title),
    intro: narr(script.intro),
    outro: narr(script.outro),
    ...(Array.isArray(script.chapters)
      ? { chapters: script.chapters.map((c) => (isObj(c) ? { ...c, title: titleSafe(c.title), text: narr(c.text) } : c)) }
      : {}),
  };
}

const SPOKEN = Symbol.for('quarry.spokenScript');

// What is SHOWN (screen, captions, SRT, title, description, state): tag-free.
// No tags anywhere = the same object. Otherwise a clean copy that carries the
// tagged original under a non-enumerable symbol (never serialised), read back
// by spokenScriptOf for the narration only.
export function stripEpisodeTags(script) {
  if (!isObj(script)) return script;
  const s = stripVoiceTags;
  const fields = [script.title, script.intro, script.outro, ...(Array.isArray(script.chapters) ? script.chapters.flatMap((c) => [c?.title, c?.text]) : [])];
  if (!fields.some((f) => typeof f === 'string' && s(f) !== f)) return script;
  const clean = {
    ...script,
    title: titleSafe(script.title),
    intro: titleSafe(script.intro),
    outro: titleSafe(script.outro),
    ...(Array.isArray(script.chapters)
      ? { chapters: script.chapters.map((c) => (isObj(c) ? { ...c, title: titleSafe(c.title), text: titleSafe(c.text) } : c)) }
      : {}),
  };
  Object.defineProperty(clean, SPOKEN, { value: spokenScriptOf(script), enumerable: false });
  return clean;
}

export function spokenScriptOf(script) {
  return (isObj(script) && script[SPOKEN]) || script;
}

// The doc writer's extra prompt lines ('' = the prompt is byte-identical).
export function voiceTagPrompt(expression, model = DEFAULT_GPU_MODEL) {
  const tags = expressionTags(expression, model);
  const density = TAG_DENSITY[expression];
  if (!tags || !tags.length || !density) return '';
  return `
VOICE SOUNDS (optional, use sparingly): the narrator can perform ${tags.map((t) => `[${t}]`).join(' ')}. Use at most one per ${density} sentences, only where a real narrator would naturally make that sound, written inline just before the words it colours (e.g. "${tags[0] === 'sigh' ? '[sigh] ' : `[${tags[0]}] `}Most people never check."). Never in the title or chapter titles. No other bracketed text.`;
}
