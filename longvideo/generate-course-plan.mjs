#!/usr/bin/env node
// Course planner CLI (C2, docs/qa/course-template-c2-planner-qa.md G1-G5).
// outline.json -> script brain (one call per lecture) -> <out>.plan.json
// (paper style, render-ready by longvideo/make-diagram-demo.mjs). NOTHING renders
// or uploads here — the owner reviews the generated plan first.
//
// outline.json: { slug, brand, title, audience, world, voice?, palette?,
//                 modules: [{ n, title, lectures: [{ n, title, point }] }] }
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from '../lib/env.mjs';
import { assembleCoursePlan } from '../lib/course-plan.mjs';
import { callScriptBrain } from '../youtube-engine.mjs';

loadEnv();
const ROOT = path.resolve(import.meta.dirname, '..');
const [outlinePath, outPath] = process.argv.slice(2);
if (!outlinePath || !outPath) { console.error('usage: node longvideo/generate-course-plan.mjs <outline.json> <out.plan.json>'); process.exit(1); }

const outline = JSON.parse(fs.readFileSync(path.resolve(outlinePath), 'utf8'));
const t0 = Date.now();
const plan = await assembleCoursePlan(outline, {
  attempts: Number(process.env.COURSE_ATTEMPTS || 3),
  log: (m) => console.log(m),
  call: async (prompt) => {
    const r = await callScriptBrain({
      slug: outline.slug, jobId: `course:${outline.slug}:${outline.modules[0]?.lectures[0]?.n ?? 0}`,
      prompt, isValidJson: (p) => !!p && typeof p === 'object' && Array.isArray(p.say) && Array.isArray(p.lines),
      maxAttempts: 2, suffix: '\nReply with the raw JSON object ONLY.',
    });
    if (r.ok) console.log(`  [brain] ${r.provider}${r.model ? ` (${r.model})` : ''} ok`);
    return r.ok ? r.parsed : null;
  },
});
fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(plan, null, 1));
const cues = plan.scenes.reduce((n, s) => n + s.lines.reduce((m, l) => m + l.cues.length, 0), 0);
console.log(`[course] plan -> ${outPath} in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
console.log(`[course] ${plan.scenes.length} lectures, ${cues} cues. Review the say-lines, then render:`);
console.log(`         node longvideo/make-diagram-demo.mjs ${outPath}`);
