// market-files P2 — the SCRIPT schema, gate, and builders
// (docs/superpowers/specs/2026-11-10-market-files-p2-script-brain-spec.md).
// The sidecar brain (services/ai/bot/script_graph.py) writes the styled
// script; THIS module is the Node-side truth: the validator (R3, before
// anything stages), the beat builder (R5, script → DocV2-ready beats with
// per-beat voices), and the voice-grouping contract (R6, one TTS batch per
// voice). Pure, zero deps, deterministic — same script → same beats, always.
// Scene vocabulary mirrors lib/market-scenes.mjs (P1) and the sidecar's
// ALLOWED pools mirror the template bot's (graph.py).

export const SCRIPT_LAYOUTS = ['hero', 'chapter', 'split', 'stat', 'quote', 'process', 'timeline', 'end'];
export const SCENE_LOCATIONS = ['trading', 'office', 'datacenter', 'stage'];
export const SCENE_MOODS = ['calm', 'party', 'crash', 'night', 'data'];
// the Edge-TTS pool the whole factory already uses (graph.py ALLOWED_VOICES)
export const ALLOWED_VOICES = ['en-US-AndrewNeural', 'en-US-BrianNeural', 'en-US-AriaNeural', 'en-US-EmmaNeural', 'en-US-ChristopherNeural', 'en-GB-RyanNeural'];

const clean = (v) => String(v == null ? '' : v).replace(/[�‑]/g, '-').trim();

// ---- R3/R4: the validator (the gate before staging) --------------------------
export function validateMarketScript(script) {
  const errors = [];
  const s = script && typeof script === 'object' && !Array.isArray(script) ? script : {};
  if (!clean(s.version)) errors.push('version missing');
  const id = clean(s.script_id);
  if (!id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) errors.push(`script_id "${id}" must be a kebab slug`);
  if (!clean(s.topic)) errors.push('topic missing');
  const voices = s.voices && typeof s.voices === 'object' ? s.voices : {};
  if (!ALLOWED_VOICES.includes(voices.narrator)) errors.push(`narrator voice "${voices.narrator}" is off-pool (${ALLOWED_VOICES.join(' | ')})`);
  if (!ALLOWED_VOICES.includes(voices.dialogue)) errors.push(`dialogue voice "${voices.dialogue}" is off-pool (${ALLOWED_VOICES.join(' | ')})`);
  if (voices.narrator && voices.narrator === voices.dialogue) errors.push('the dialogue voice must differ from the narrator (two voices is the format)');
  const beats = Array.isArray(s.beats) ? s.beats : [];
  if (beats.length < 6) errors.push(`an episode needs at least 6 beats (got ${beats.length})`);
  if (beats.length > 120) errors.push(`beats clamp at 120 (got ${beats.length})`);
  if (beats.length && beats[0].layout !== 'hero') errors.push('the first beat must be a hero (the cold open)');
  if (beats.length && beats[beats.length - 1].layout !== 'end') errors.push('the last beat must be the end card');
  beats.forEach((b, i) => {
    const where = `beat ${i}`;
    const text = clean(b.dialogue && !clean(b.text) ? b.dialogue.line : b.text);
    if (!text) errors.push(`${where} has no spoken text`);
    if (!SCRIPT_LAYOUTS.includes(b.layout)) errors.push(`${where}: layout "${b.layout}" is off-pool (${SCRIPT_LAYOUTS.join(' | ')})`);
    if (b.scene && typeof b.scene === 'object') {
      if (b.scene.location && !SCENE_LOCATIONS.includes(b.scene.location)) errors.push(`${where}: scene location "${b.scene.location}" is off-pool (${SCENE_LOCATIONS.join(' | ')})`);
      if (b.scene.mood && !SCENE_MOODS.includes(b.scene.mood)) errors.push(`${where}: scene mood "${b.scene.mood}" is off-pool (${SCENE_MOODS.join(' | ')})`);
    }
    if (b.dialogue != null && !(b.dialogue && clean(b.dialogue.speaker))) errors.push(`${where}: a dialogue beat needs a speaker name`);
    if (b.layout === 'stat' && !clean(b.big)) errors.push(`${where}: a stat beat needs a big (the board number, e.g. "-4%")`);
    if (b.layout === 'timeline') {
      const ticks = Array.isArray(b.ticks) ? b.ticks.filter((t) => clean(typeof t === 'string' ? t : t && t.label)) : [];
      if (ticks.length < 1 || ticks.length > 6) errors.push(`${where}: a timeline beat needs 1-6 ticks`);
    }
    if (b.layout === 'process') {
      const lines = Array.isArray(b.lines) ? b.lines.filter((x) => clean(x)) : [];
      if (lines.length < 2 || lines.length > 6) errors.push(`${where}: a process beat needs 2-6 lines`);
    }
  });
  return { ok: errors.length === 0, errors };
}

// ---- R5: script → DocV2-ready beats (deterministic) ---------------------------
// Voice rules: a beat carrying a dialogue line speaks in voices.dialogue
// (the second voice — the format's comedy rhythm); everything else speaks in
// voices.narrator. Display fields ride through (P1 scenes read headline/sub/
// big/label/lines/ticks/scene). Timing (ms/startMs/audio/words) is P4's
// attachTimings step — deliberately absent here.
export function buildMarketBeats(script) {
  const s = script && typeof script === 'object' ? script : {};
  const voices = s.voices && typeof s.voices === 'object' ? s.voices : {};
  const beats = Array.isArray(s.beats) ? s.beats : [];
  return beats.map((b, i) => {
    const dialogue = b.dialogue && clean(b.dialogue.speaker) ? { speaker: clean(b.dialogue.speaker), line: clean(b.dialogue.line) } : null;
    const beat = {
      i,
      layout: b.layout,
      text: clean(dialogue && !clean(b.text) ? dialogue.line : b.text),
      voice: dialogue ? voices.dialogue : voices.narrator,
    };
    if (clean(b.headline)) beat.headline = clean(b.headline);
    if (clean(b.sub)) beat.sub = clean(b.sub);
    if (clean(b.big)) beat.big = clean(b.big);
    if (clean(b.label)) beat.label = clean(b.label);
    if (dialogue) beat.dialogue = dialogue;
    // quote beats speak their line as the display headline too (P1 QuoteScene)
    if (b.layout === 'quote' && !beat.headline) beat.headline = beat.text;
    if (b.layout === 'hero' && !beat.headline) beat.headline = beat.text;
    // chapter cards carry their title in `text` — the writer never sets
    // chapterTitle, so the card would show only the number (caught in the
    // P1.7 frame review 2026-11-11)
    if (b.layout === 'chapter' && !clean(b.chapterTitle) && beat.text) beat.chapterTitle = beat.text;
    if (Array.isArray(b.lines) && b.lines.length) beat.lines = b.lines.map(clean).filter(Boolean);
    if (Array.isArray(b.ticks) && b.ticks.length) {
      beat.ticks = b.ticks.map((t) => (typeof t === 'string' ? clean(t) : clean(t && t.label))).filter(Boolean);
    }
    if (b.scene && typeof b.scene === 'object') {
      const scene = {};
      if (b.scene.location) scene.location = clean(b.scene.location);
      if (b.scene.mood) scene.mood = clean(b.scene.mood);
      if (b.scene.time) scene.time = clean(b.scene.time);
      if (b.scene.day) scene.day = clean(b.scene.day);
      if (Object.keys(scene).length) beat.scene = scene;
    }
    return beat;
  });
}

// ---- R6: the TTS batching contract (one edge_batch run per voice) ------------
export function voiceGroups(beats) {
  const groups = {};
  (Array.isArray(beats) ? beats : []).forEach((b, i) => {
    const v = String(b.voice || 'en-US-AndrewNeural');
    (groups[v] = groups[v] || []).push(i);
  });
  return groups;
}

// the runner's review table: one line per beat
export function scriptSummary(script) {
  const beats = buildMarketBeats(script);
  return beats
    .map((b) => {
      const sceneBits = [b.scene && b.scene.location, b.scene && b.scene.mood].filter(Boolean).join('/');
      const words = String(b.text || '').split(/\s+/).filter(Boolean).length;
      const tag = b.dialogue ? `${b.dialogue.speaker}:` : '';
      return `${String(b.i).padStart(3, ' ')}  ${b.layout.padEnd(8)} ${sceneBits.padEnd(18)} ${b.voice === script.voices?.dialogue ? 'VO-B' : 'vo-A'}  ${String(words).padStart(3)}w  ${tag}${String(b.text || '').slice(0, 76)}`;
    })
    .join('\n');
}
