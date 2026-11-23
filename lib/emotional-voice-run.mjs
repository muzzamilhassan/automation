// Emotional voice in the doc lanes (docs/qa/emotional-voice-qa.md EV-R).
// The engine side of studio/lib/emotional-voice.mjs:
//   emotionalVoiceArgs  the extra voice_lines.py args (GPU first, Kokoro fallback)
//   spokenBeatTexts     storybook: which beats SPEAK a tagged sentence
//   readVoiceReport / emotionalFallbackWarning / reportEmotionalVoice
//                       the quiet (advisory) "used the standard voice" alert
// Off = [] / no report = every lane byte-identical to today.
import fs from 'node:fs';
import path from 'node:path';
import { gpuModel, expressionTags, stripVoiceTags } from '../studio/lib/emotional-voice.mjs';

// voice_lines.py keeps `--engine kokoro ...` (the fallback); these args put the
// GPU engine in front of it. A profile without `emotional` (or an unknown
// model) adds nothing.
export function emotionalVoiceArgs(prof, slug) {
  const e = prof && prof.emotional;
  if (!e || !gpuModel(e.model) || !slug) return [];
  const tags = expressionTags(e.expression, e.model) || [];
  return ['--gpu-model', e.model, '--expression', e.expression || 'none', '--gpu-tags', tags.join(','), '--gpu-slug', String(slug)];
}

// beats = built from the SHOWN (tag-free) script; sayBeats = the same builder
// on the SPOKEN (tagged) script. Returns Map(beat.i -> tagged text) for the
// beats whose spoken text differs — or an empty Map when the two do not line
// up one-to-one (then nothing is tagged: never a misaligned beat).
export function spokenBeatTexts(beats, sayBeats) {
  const out = new Map();
  if (!Array.isArray(beats) || !Array.isArray(sayBeats) || beats.length !== sayBeats.length) return out;
  for (let k = 0; k < beats.length; k++) {
    const shown = String(beats[k]?.text || '');
    const said = String(sayBeats[k]?.text || '');
    if (beats[k]?.i !== sayBeats[k]?.i || stripVoiceTags(said) !== shown) return new Map();
    if (said !== shown) out.set(beats[k].i, said);
  }
  return out;
}

// <outdir>/voice-report.json written by voice_lines.py when the GPU was asked for
export function readVoiceReport(outDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(outDir, 'voice-report.json'), 'utf8'));
  } catch {
    return null;
  }
}

// the advisory row (recorded in Studio > Warnings, never a phone push), or null
export function emotionalFallbackWarning(slug, report, day) {
  if (!report || !report.requested || report.ok) return null;
  const why = String(report.reason || 'unknown').slice(0, 200);
  return {
    channel_id: slug,
    severity: 'advisory',
    code: 'emotional_voice_fallback',
    title: 'emotional voice unavailable today — used the standard voice',
    explanation: 'The free Kaggle GPU voice could not run for this video, so it was narrated with the standard human voice. The video still shipped.',
    evidence: `reason: ${why}`,
    recommended_action: 'No action needed. It tries the emotional voice again on the next video.',
    auto_verifiable: false,
    dedupe_key: `${slug}:emotional_voice_fallback:${day}`,
  };
}

// fail-soft end to end: a log line always, the advisory row when it can
export async function reportEmotionalVoice({ slug, outDir, log = console.log, day = new Date().toISOString().slice(0, 10) } = {}) {
  const rep = readVoiceReport(outDir);
  if (!rep || !rep.requested) return rep;
  if (rep.ok) {
    const fb = Array.isArray(rep.fallbackLines) ? rep.fallbackLines.length : 0;
    log(`[voice] emotional voice (${rep.model}) used — ${rep.gpuLines ?? '?'} line(s) on the GPU${fb ? `, ${fb} re-read with the standard voice (quality gate)` : ''}, ${Math.round((rep.gpuSeconds || 0) / 60)} GPU min`);
    return rep;
  }
  log(`[voice] emotional voice unavailable today — used the standard voice (${rep.reason})`);
  const w = emotionalFallbackWarning(slug, rep, day);
  try {
    const ws = await import('./warnings-store.mjs');
    const store = await ws.getDefaultWarningsStore();
    if (store && w) await ws.emitWarning(store, w);
  } catch (e) {
    log(`[voice] advisory not recorded (${String(e?.message || e).slice(0, 80)})`);
  }
  return rep;
}
