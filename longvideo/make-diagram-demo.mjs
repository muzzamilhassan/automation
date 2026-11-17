#!/usr/bin/env node
// Living Diagram — LOCAL demo builder (docs/qa/living-diagram-demo-qa.md).
// plan.json -> Edge TTS per line (real WordBoundary timings) -> resolve every
// cue onto its spoken word -> validate -> props -> Remotion render.
// Not wired into any live pipeline (R7).
//
// Usage: node longvideo/make-diagram-demo.mjs longvideo/diagram-demo/<plan>.json [--no-render]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolvePlan, validatePlan } from '../lib/diagram-cues.mjs';
import { edgeVoiceFor } from '../lib/doc-storybook.mjs';
import { resolveBinary } from '../lib/ffmpeg.mjs';
import { loadEnv } from '../lib/env.mjs';

loadEnv(); // HF_TOKEN for the Chatterbox Space (keys stay in .env)

const ROOT = path.resolve(import.meta.dirname, '..');
const EXPL = path.join(ROOT, 'explainer');
const args = process.argv.slice(2);
const planPath = args.find((a) => a.endsWith('.json'));
const NO_RENDER = args.includes('--no-render');
if (!planPath) { console.error('usage: node longvideo/make-diagram-demo.mjs <plan.json> [--no-render]'); process.exit(1); }

const LEAD_MS = 1000;   // a scene opens this long before its first line (chip + glide)
const PAD_MS = 380;     // breath after each line
const SCENE_TAIL_MS = 900; // let the last stamp of a scene land
const END_MS = 2200;

const plan = JSON.parse(fs.readFileSync(path.resolve(planPath), 'utf8'));
const slug = plan.slug || path.basename(planPath, '.plan.json');

// brand kit = data (no-static-maps, R6)
const brands = JSON.parse(fs.readFileSync(path.join(ROOT, 'lib', 'brands.json'), 'utf8'));
const kit = (brands.brands || brands)[plan.brand] || {};
const theme = { bg: kit.bg || '#0E1113', accent: kit.accent || '#4FD1C5', label: kit.label || '' };
const voice = edgeVoiceFor(kit.voice);

const pre = validatePlan(plan);
if (pre.length) { console.error(`[diagram] plan invalid:\n  ${pre.join('\n  ')}`); process.exit(1); }

// ---- voice: one call per line, into an ignored, lane-private folder ----
// plan.voice = { engine: edge|chatterbox|kokoro, voice?, ref?: { voice, text } }
// --voice=<engine> on the CLI overrides the plan (A/B listening).
const flat = [];
plan.scenes.forEach((sc, si) => sc.lines.forEach((ln, li) => flat.push({ si, li, say: ln.say, mood: ln.mood, pauseMs: ln.pauseMs })));
const cliEngine = (args.find((a) => a.startsWith('--voice=')) || '').split('=')[1];
const V = { engine: 'edge', ...(plan.voice || {}) };
if (cliEngine) V.engine = cliEngine;
const EDGE_SHAPE = /^[a-z]{2}-[A-Z]{2}-[A-Za-z0-9]+Neural$/;
const engineVoice = V.engine === 'edge'
  ? (V.edgeVoice || (EDGE_SHAPE.test(V.voice) ? V.voice : voice))
  : (V.voice || 'af_heart');
const work = path.join(EXPL, 'public', 'audio', `diagram-demo-${slug}-${V.engine}`);
fs.mkdirSync(work, { recursive: true });
const voicePy = path.join(EXPL, 'voice_lines.py');
const pyEnv = { ...process.env };
const extra = [];
// local dev: chatterbox lives in an isolated venv; CI sets CHATTERBOX_PYTHON or installs it globally
const venvPy = path.join(process.env.USERPROFILE || process.env.HOME || '', '.venvs', 'chatterbox', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
if (!pyEnv.CHATTERBOX_PYTHON && fs.existsSync(venvPy)) pyEnv.CHATTERBOX_PYTHON = venvPy;
if (V.engine.startsWith('chatterbox')) {
  // the timbre to clone = our own licence-clean Kokoro voice (brand kit voice)
  const refDir = path.join(work, 'ref');
  fs.mkdirSync(refDir, { recursive: true });
  const refIn = path.join(refDir, 'ref.json');
  fs.writeFileSync(refIn, JSON.stringify([{ i: 0, text: (V.ref && V.ref.text) || 'Every app you use runs on a quiet chain of machines. Today, we follow one request through that chain, and watch what happens when millions arrive at once.' }]));
  execFileSync('python', [voicePy, refIn, refDir, '--engine', 'kokoro', '--voice', (V.ref && V.ref.voice) || kit.voice || 'af_heart'], { stdio: 'inherit', env: pyEnv });
  extra.push('--ref', path.join(refDir, 'audio', 'line-00.mp3'));
}
const linesIn = path.join(work, 'lines.json');
fs.writeFileSync(linesIn, JSON.stringify(flat.map((f, i) => ({ i, text: f.say, mood: f.mood }))));
console.log(`[diagram] ${flat.length} lines, engine ${V.engine}, voice ${engineVoice}`);
execFileSync('python', [voicePy, linesIn, work, '--engine', V.engine, '--voice', engineVoice, ...extra], { stdio: 'inherit', env: pyEnv });
const durs = new Map(JSON.parse(fs.readFileSync(path.join(work, 'voice-durations.json'), 'utf8')).map((d) => [d.i, d]));

const FFPROBE = resolveBinary('ffprobe');
const probeMs = (f) => {
  try { return Math.round(parseFloat(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString()) * 1000); } catch { return 0; }
};

// ---- timeline ----
let cursor = 0;
const lines = flat.map((f, i) => {
  if (i === 0 || flat[i - 1].si !== f.si) cursor += (i === 0 ? 0 : SCENE_TAIL_MS) + LEAD_MS;
  const d = durs.get(i) || { words: [] };
  const words = (d.words || []).map((w) => ({ w: w.w, t0: Math.round(w.s * 1000), t1: Math.round((w.s + w.d) * 1000) }));
  const rel = `audio/${path.basename(work)}/audio/line-${String(i).padStart(2, '0')}.mp3`;
  const spoken = Math.max(probeMs(path.join(EXPL, 'public', rel)), words.length ? words[words.length - 1].t1 : 0);
  const line = { startMs: Math.round(cursor), ms: spoken + (f.pauseMs ?? PAD_MS), words, audio: spoken ? rel : null };
  cursor += line.ms;
  return line;
});
const totalMs = Math.round(cursor + END_MS);

const out = resolvePlan(plan, lines, { leadMs: LEAD_MS, totalMs });
console.log(`[diagram] resolved ${out.cues.length} cues, ${out.errors.length} errors`);
if (out.errors.length) {
  console.error(`  ${out.errors.join('\n  ')}`);
  console.error('[diagram] spoken words per line (for fixing anchors):');
  lines.forEach((l, i) => console.error(`  ${i}: ${l.words.map((w) => w.w).join(' | ')}`));
  process.exit(1);
}

const doc = {
  title: plan.title, fps: 30, width: 1920, height: 1080, totalMs, theme, style: plan.style || 'tile', course: out.course || null,
  scenes: out.scenes, cues: out.cues,
  lines: lines.map(({ startMs, ms, audio }) => ({ startMs, ms, audio })),
};
const outDir = path.join(ROOT, 'longvideo', 'out', 'diagram-demo');
fs.mkdirSync(outDir, { recursive: true });
const propsPath = path.join(outDir, `${slug}.props.json`);
fs.writeFileSync(propsPath, JSON.stringify({ doc }));
console.log(`[diagram] props -> ${propsPath} (${(totalMs / 1000).toFixed(1)}s)`);
if (NO_RENDER) process.exit(0);

const mp4 = path.join(outDir, `${slug}${cliEngine ? `-${cliEngine}` : ''}.mp4`);
const r = spawnSync('npx', ['remotion', 'render', 'remotion/diagram/index.ts', 'LivingDiagram', mp4,
  `--props=${propsPath}`, '--concurrency=4', '--timeout=180000', '--port=3498'],
{ cwd: EXPL, stdio: 'inherit', shell: process.platform === 'win32' });
if (r.status !== 0) { console.error('[diagram] render failed'); process.exit(r.status || 1); }
console.log(`[diagram] video -> ${mp4}`);
