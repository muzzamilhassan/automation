#!/usr/bin/env node
// LOCAL dry run of the Living Diagram doc lane (step 1, QA row 10).
// Runs the SAME renderDiagramEpisode the doc lane runs (live script-brain planner,
// the channel's voiceProfile, approved music, Remotion render) — but NEVER uploads.
//
// Usage: node longvideo/diagram-episode-dryrun.mjs <slug> <script.json> <template> [--plan-only] [--label "Brand"]
//   script.json = { title, intro, chapters: [{title, text}], outro } (an APPROVED script)
//   template    = a registry id (e.g. lecture-notes-paper) or a template JSON file
//   --label     = test-only brand name on screen (e.g. a tech brand for a tech script)
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from '../lib/env.mjs';
import { renderDiagramEpisode, isDiagramPlanReply } from '../lib/diagram-episode.mjs';
import { REGISTRY_META } from '../studio/lib/template-registry.data.js';
import { voiceProfileFor } from '../lib/voice-profile.mjs';
import { docPresentation } from '../lib/doc-storybook.mjs';
import { resolveBrand } from '../lib/brand-resolve.mjs';
import { callScriptBrain } from '../youtube-engine.mjs';
import { pickApprovedTrack } from '../music-engine.mjs';

loadEnv();
const ROOT = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const [slug, scriptPath, templateArg] = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--label');
if (!slug || !scriptPath || !templateArg) { console.error('usage: diagram-episode-dryrun.mjs <slug> <script.json> <template-id|template.json> [--plan-only] [--label "Brand"]'); process.exit(1); }

const script = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
// a registry id is read exactly as the doc lane reads it (REGISTRY_META[id]); a path is a draft/export file
const meta = REGISTRY_META[templateArg] || (fs.existsSync(templateArg) ? JSON.parse(fs.readFileSync(templateArg, 'utf8')) : null);
if (!meta) { console.error(`[dryrun] unknown template "${templateArg}" (not a registry id, not a file)`); process.exit(1); }
const label = flag('--label');
const kit = { ...(await resolveBrand(slug)), voiceProfile: voiceProfileFor(slug), ...(label ? { label } : {}) };
const pres = { ...docPresentation(meta, kit), ...(label ? { brand: label } : {}) };
console.log(`[dryrun] template ${meta.id || templateArg} · style ${pres.style || 'tile'} · brand ${pres.brand || kit.label} · voice ${kit.voiceProfile ? kit.voiceProfile.voice : 'edge'}`);
const APPROVED_MUSIC = JSON.parse(fs.readFileSync(path.join(ROOT, 'yt-brands', 'approved-music.json'), 'utf8'));
const workDir = path.join(ROOT, 'longvideo', 'out', 'diagram-demo', `${slug}-dryrun`);
const t0 = Date.now();
if (process.argv.includes('--plan-only')) {
  // planning success check only (no voice, no render): same planner, same brain
  const { diagramSkeleton, planDiagram } = await import('../lib/diagram-plan.mjs');
  const { planPaper } = await import('../lib/paper-plan.mjs');
  const sk = diagramSkeleton(script);
  const plan = await (pres.style === 'paper' ? planPaper : planDiagram)(sk, {
    brand: pres.brand || kit.label, niche: kit.niche || '', log: console.log, sceneGapMs: 6000, outageWaitMs: 20000,
    call: async (prompt) => {
      const r = await callScriptBrain({ slug, jobId: `diagram-dryrun:${slug}`, prompt, isValidJson: isDiagramPlanReply, maxAttempts: 2, suffix: '\nReply with the raw JSON object ONLY.' });
      return r.ok ? r.parsed : null;
    },
  });
  plan.scenes.forEach((s, i) => console.log(`  scene ${i + 1}: ${s.title ? `"${s.title}" ` : ''}${(s.nodes || []).length} nodes, ${(s.widgets || []).length} widgets, ${s.lines.reduce((n, l) => n + (l.cues || []).length, 0)} cues`));
  console.log(`[dryrun] plan-only OK in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
  process.exit(0);
}
const res = await renderDiagramEpisode({
  root: ROOT, slug, kit, script, pres, workDir,
  call: async (prompt) => {
    const r = await callScriptBrain({
      slug, jobId: `diagram-dryrun:${slug}`, prompt,
      isValidJson: isDiagramPlanReply,
      maxAttempts: 2, suffix: '\nReply with the raw JSON object ONLY.',
    });
    if (r.ok) console.log(`  [brain] ${r.provider}${r.model ? ` (${r.model})` : ''}`);
    return r.ok ? r.parsed : null;
  },
  pickMusic: (mood) => pickApprovedTrack(APPROVED_MUSIC[slug] || [], mood),
  port: 3498,
});
console.log(`\n[dryrun] DONE in ${((Date.now() - t0) / 60000).toFixed(1)} min — NOTHING uploaded`);
console.log(`[dryrun] video   ${res.final} (${(res.total / 60).toFixed(1)} min)`);
console.log(`[dryrun] music   ${res.music ? res.music.title : 'none'}`);
console.log(`[dryrun] chapters\n  ${res.chapterLines.join('\n  ')}`);
