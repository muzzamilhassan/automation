#!/usr/bin/env node
// Emotional voice PROOF RUN (docs/qa/emotional-voice-qa.md EV-P) — narrates one
// doc script through the emotional GPU engine EXACTLY as the storybook doc lane
// does (same beats, same tag handling, same voice_lines.py arguments, same
// fallbacks), then joins the beats into one narration.mp3 to listen to.
// NEVER uploads, never touches the DB or production state.
//
// Usage: node scripts/emotional-voice-dryrun.mjs <slug> <script.json> [--expression none|light|rich] [--as-is] [--out DIR]
//   script.json = { title, intro, chapters: [{title, text}], outro }
//   default: the channel's voice profile with the emotional voice turned ON at
//   --expression (so it can be proven BEFORE enable-emotional-voice.mjs --apply);
//   --as-is = the channel's saved profile exactly (proves the live setting).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { voiceProfileFor } from '../lib/voice-profile.mjs';
import { buildStorybookBeats } from '../lib/doc-storybook.mjs';
import { emotionalVoiceArgs, spokenBeatTexts, readVoiceReport } from '../lib/emotional-voice-run.mjs';
import {
  EXPRESSIONS, DEFAULT_EXPRESSION, DEFAULT_GPU_MODEL, sanitizeEpisodeTags, stripEpisodeTags, spokenScriptOf,
} from '../studio/lib/emotional-voice.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// the profile the proof narrates with: the saved one (--as-is) or the saved one + emotional on
export function proofProfile(saved, { expression = DEFAULT_EXPRESSION, asIs = false } = {}) {
  if (asIs) return saved;
  if (!saved) return null;
  return { ...saved, emotional: { model: DEFAULT_GPU_MODEL, expression } };
}

function main(argv = process.argv.slice(2)) {
  const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const [slug, scriptPath] = argv.filter((a, i) => !a.startsWith('--') && !['--expression', '--out'].includes(argv[i - 1]));
  if (!slug || !scriptPath) { console.error('usage: emotional-voice-dryrun.mjs <slug> <script.json> [--expression none|light|rich] [--as-is] [--out DIR]'); return 1; }
  const expression = flag('--expression') || DEFAULT_EXPRESSION;
  if (!EXPRESSIONS.includes(expression)) { console.error(`--expression must be one of ${EXPRESSIONS.join(', ')}`); return 1; }
  const prof = proofProfile(voiceProfileFor(slug), { expression, asIs: argv.includes('--as-is') });
  if (!prof || !prof.emotional) { console.error(`[proof] ${slug}: no human Kokoro voice profile${argv.includes('--as-is') ? ' with the emotional voice on' : ''} — nothing to prove`); return 1; }

  // the doc lane's own steps: sanitize at generation, strip for the screen, speak the tags
  const raw = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
  const script = stripEpisodeTags(sanitizeEpisodeTags(raw, prof.emotional.expression, prof.emotional.model));
  const opts = { followLine: 'Follow for more.' };
  const beats = buildStorybookBeats(script, opts);
  const said = spokenScriptOf(script);
  const sayText = spokenBeatTexts(beats, said === script ? [] : buildStorybookBeats(said, opts));
  const spoken = beats.filter((x) => (x.text || '').trim()).map((x) => ({ i: x.i, text: sayText.get(x.i) || x.text }));

  const out = path.resolve(flag('--out') || path.join(ROOT, 'longvideo', 'out', 'emotional-voice', `${slug}-dryrun`));
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const inPath = path.join(out, 'tts-input.json');
  fs.writeFileSync(inPath, JSON.stringify(spoken));
  const args = [path.join(ROOT, 'explainer', 'voice_lines.py'), inPath, out, '--engine', 'kokoro', '--voice', prof.voice,
    '--speed', String(prof.speed || 1), ...(prof.mood ? ['--mood', String(prof.mood)] : []), ...emotionalVoiceArgs(prof, slug), '--layout', 'edge_batch'];
  console.log(`[proof] ${slug}: ${spoken.length} beats, ${prof.voice}, emotional ${prof.emotional.model} (${prof.emotional.expression}); tagged beats: ${sayText.size}`);
  const t0 = Date.now();
  const tts = spawnSync(process.env.PYTHON || 'python', args, { stdio: 'inherit', shell: process.platform === 'win32' });
  console.log(`[proof] narration took ${((Date.now() - t0) / 60000).toFixed(1)} min`);
  if (tts.status !== 0) { console.error('[proof] voice_lines.py failed'); return 1; }

  // one file to listen to: the beats in order with a short gap
  const ff = process.env.EXPLAINER_FFMPEG || 'ffmpeg';
  const list = path.join(out, 'concat.txt');
  const files = spoken.map((s) => path.join(out, 'audio', `beat-${String(s.i).padStart(2, '0')}.mp3`)).filter((f) => fs.existsSync(f));
  const gap = path.join(out, 'gap.mp3');
  spawnSync(ff, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '0.6', '-b:a', '160k', gap]);
  fs.writeFileSync(list, files.flatMap((f) => [`file '${f.replace(/\\/g, '/')}'`, `file '${gap.replace(/\\/g, '/')}'`]).join('\n'));
  spawnSync(ff, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c:a', 'libmp3lame', '-b:a', '128k', path.join(out, 'narration.mp3')]);

  const rep = readVoiceReport(out);
  console.log(`[proof] voice-report: ${JSON.stringify(rep)}`);
  const shown = JSON.stringify(beats.map((x) => [x.headline, x.text, x.sub]));
  if (/\[(sigh|chuckle|laugh|gasp|clear throat)\]/i.test(shown)) { console.error('[proof] FAIL: a voice tag reached the screen text'); return 1; }
  const durs = JSON.parse(fs.readFileSync(path.join(out, 'tts-durations.json'), 'utf8'));
  if (durs.some((d) => (d.words || []).some((w) => /^\[/.test(w.w)))) { console.error('[proof] FAIL: a voice tag reached the caption words'); return 1; }
  console.log(`[proof] ${rep?.ok ? 'EMOTIONAL VOICE OK' : 'FELL BACK to the standard voice'} — ${files.length} beats -> ${path.join(out, 'narration.mp3')}`);
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exit(main());
