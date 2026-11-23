// Living Diagram visual layer for the doc lane (step 1 — docs/qa/step1-mr-voice-moneyflow-qa.md D1-D5).
//
// approved script -> diagram plan (LLM visuals, approved words verbatim) -> voice
// (the channel's human voiceProfile, else an Edge Multilingual voice) -> every cue
// bound to its spoken word -> approved music bed -> Remotion LivingDiagram render ->
// episode.srt + chapter lines. Returns exactly what shipEpisode() takes, so the
// upload tail stays shared and unchanged. Throws on any failure: the caller falls
// back to the storybook look (D4). Dependencies are injected (call / pickMusic),
// so the local dry-run harness runs the very same code as production.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { diagramSkeleton, planDiagram, buildDiagramTimeline, diagramSrt, diagramChapterLines } from './diagram-plan.mjs';
import { resolvePlan } from './diagram-cues.mjs';
import { planPaper } from './paper-plan.mjs';
import { emotionalVoiceArgs, reportEmotionalVoice } from './emotional-voice-run.mjs';

const EDGE_SHAPE = /^[a-z]{2}-[A-Z]{2}-[A-Za-z0-9]+Neural$/;
export const DIAGRAM_PACING = { leadMs: 1000, padMs: 380, sceneTailMs: 900, endMs: 2200 };

// the brain-reply shape check for EVERY Living Diagram planner: the node planner
// (tile/glow) answers { nodes, lines }, the paper planner answers { beats }. Callers
// (doc lane + dry run) share this so a paper reply is never rejected as "invalid JSON".
export function isDiagramPlanReply(p) {
  if (!p || typeof p !== 'object') return false;
  return (Array.isArray(p.nodes) && Array.isArray(p.lines)) || Array.isArray(p.beats);
}

// the voice_lines.py arguments for a channel: its human Kokoro profile when the kit
// carries one (step 1 V1), else an Edge voice (real word timings). With the
// emotional voice on (docs/qa/emotional-voice-qa.md) and a slug, the GPU engine
// goes first and that Kokoro profile is its fallback.
export function diagramVoiceArgs(kit, pres = {}, slug = '') {
  const prof = kit && kit.voiceProfile && kit.voiceProfile.engine === 'kokoro' && kit.voiceProfile.voice ? kit.voiceProfile : null;
  if (prof) return ['--engine', 'kokoro', '--voice', String(prof.voice), '--speed', String(prof.speed || 1), ...(prof.mood ? ['--mood', String(prof.mood)] : []), ...emotionalVoiceArgs(prof, slug)];
  const v = String(pres.voice || (kit && kit.voice) || '').trim();
  return ['--engine', 'edge', '--voice', EDGE_SHAPE.test(v) ? v : 'en-US-AndrewMultilingualNeural'];
}

export async function renderDiagramEpisode({ root, slug, kit, script, pres = {}, call, pickMusic = async () => null, workDir, log = console.log, python = 'python', port = 3493 }) {
  const EXPL = path.join(root, 'explainer');
  const PUB = path.join(EXPL, 'public');
  const IS_WIN = process.platform === 'win32';
  const sOpts = { stdio: 'inherit', shell: IS_WIN };
  fs.mkdirSync(workDir, { recursive: true });

  const T0 = Date.now();
  const took = (t) => `${((Date.now() - t) / 60000).toFixed(1)} min`;
  // 1. plan — the approved words are split HERE; the LLM only adds visuals
  const skeleton = diagramSkeleton(script);
  if (!skeleton.length) throw new Error('diagram: the script has no sentences');
  // paper templates (C1b R6): chapters become lesson beats with teaching widgets;
  // tile/glow keep the node-diagram planner. Both keep the approved words verbatim.
  const paper = pres.style === 'paper';
  const planOpts = { call, brand: pres.brand || kit.label || slug, niche: kit.niche || '', log, sceneGapMs: 6000, outageWaitMs: 20000 };
  const plan = paper ? await planPaper(skeleton, planOpts) : await planDiagram(skeleton, planOpts);
  const nCues = plan.scenes.reduce((n, s) => n + s.lines.reduce((m, l) => m + (l.cues || []).length, 0), 0);
  log(`[diagram] plan: ${plan.scenes.length} scenes, ${nCues} cues (${took(T0)})`);
  const T1 = Date.now();

  // 2. voice — one line per sentence; failures exit non-zero (never a silent line)
  const flat = [];
  plan.scenes.forEach((sc, si) => sc.lines.forEach((ln, li) => flat.push({ si, li, say: ln.say, mood: ln.mood, pauseMs: Number.isFinite(ln.pauseMs) ? ln.pauseMs : undefined })));
  const audioRel = `lf-audio/${slug}-diagram`;
  const audioDir = path.join(PUB, audioRel);
  fs.mkdirSync(audioDir, { recursive: true });
  const linesIn = path.join(audioDir, 'lines.json');
  fs.writeFileSync(linesIn, JSON.stringify(flat.map((f, i) => ({ i, text: f.say, mood: f.mood }))));
  const vArgs = diagramVoiceArgs(kit, pres, slug);
  log(`[diagram] voice: ${flat.length} lines, ${vArgs.slice(0, 4).join(' ')}`);
  const tts = spawnSync(python, [path.join(EXPL, 'voice_lines.py'), linesIn, audioDir, ...vArgs], sOpts);
  if (tts.status !== 0) throw new Error('diagram voice failed');
  if (kit && kit.voiceProfile && kit.voiceProfile.emotional) await reportEmotionalVoice({ slug, outDir: audioDir, log });
  const durs = JSON.parse(fs.readFileSync(path.join(audioDir, 'voice-durations.json'), 'utf8'));
  log(`[diagram] voice done (${took(T1)})`);

  // 3. timeline + every cue onto its spoken word
  const audioFor = (i) => {
    const rel = `${audioRel}/audio/line-${String(i).padStart(2, '0')}.mp3`;
    return fs.existsSync(path.join(PUB, rel)) ? rel : null;
  };
  const { lines, totalMs } = buildDiagramTimeline(flat, durs, audioFor, DIAGRAM_PACING);
  const out = resolvePlan(plan, lines, { leadMs: DIAGRAM_PACING.leadMs, totalMs });
  if (out.errors.length) throw new Error(`diagram cues unresolved: ${out.errors.slice(0, 3).join('; ')}`);
  log(`[diagram] timeline: ${(totalMs / 60000).toFixed(1)} min, ${out.cues.length} cues on their words`);

  // 4. the channel's approved music bed (fail-soft: none = voice only)
  let track = null;
  let musicRel = null;
  try { track = await pickMusic(pres.musicMood); } catch { track = null; }
  if (track && track.file && fs.existsSync(track.file)) {
    musicRel = `${audioRel}/music.mp3`;
    fs.copyFileSync(track.file, path.join(PUB, musicRel));
    log(`[diagram] music: "${track.title}"`);
  }

  // 5. render — brand colours from the kit DATA (no-static-maps), look from the template
  const doc = {
    title: script.title, fps: 30, width: 1920, height: 1080, totalMs,
    style: paper ? 'paper' : pres.style === 'glow' ? 'glow' : 'tile',
    theme: { bg: kit.bg || '#0E1113', accent: kit.accent || '#4FD1C5', label: pres.brand || kit.label || '' },
    scenes: out.scenes, cues: out.cues,
    ...(paper ? { course: plan.course } : {}),
    lines: lines.map(({ startMs, ms, audio }) => ({ startMs, ms, audio })),
    music: musicRel,
  };
  const jsonPath = path.join(PUB, `lf-${slug}-diagram.json`);
  fs.writeFileSync(jsonPath, JSON.stringify({ doc }));
  if (!fs.existsSync(path.join(EXPL, 'node_modules', 'remotion'))) {
    log('[diagram] installing explainer deps (first render on this runner) ...');
    if (spawnSync('npm', ['ci'], { cwd: EXPL, ...sOpts }).status !== 0) throw new Error('explainer npm ci failed');
  }
  if (spawnSync('npx', ['remotion', 'browser', 'ensure'], { cwd: EXPL, ...sOpts }).status !== 0) throw new Error('remotion browser ensure failed');
  const final = path.resolve(workDir, 'episode.mp4');
  const T2 = Date.now();
  const renderArgs = (conc) => ['remotion', 'render', 'remotion/diagram/index.ts', 'LivingDiagram', final, `--props=${jsonPath}`, `--concurrency=${conc}`, '--timeout=300000', `--port=${port}`];
  let r = spawnSync('npx', renderArgs(2), { cwd: EXPL, ...sOpts });
  if (r.status !== 0) {
    log('[diagram] render retry concurrency 1');
    r = spawnSync('npx', renderArgs(1), { cwd: EXPL, ...sOpts });
  }
  if (r.status !== 0) throw new Error('diagram render failed');
  log(`[diagram] render done (${took(T2)}); lane total ${took(T0)}`);

  // 6. captions from the real word timings + chapter lines from scene starts
  fs.writeFileSync(path.join(workDir, 'episode.srt'), diagramSrt(lines));
  const chapterLines = diagramChapterLines(skeleton, lines, { leadMs: DIAGRAM_PACING.leadMs });
  log(`[diagram] ✅ episode rendered: ${final} (${(totalMs / 60000).toFixed(1)} min)`);
  return { final, total: totalMs / 1000, chapterLines, music: track, cleanupFiles: [], thumbPhotos: [] };
}
