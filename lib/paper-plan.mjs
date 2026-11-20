// PAPER planner for the doc lane (docs/qa/course-template-c1b-refine-qa.md R6).
// A "paper" template turns each APPROVED chapter into 2-4 lesson BEATS: the LLM
// only chooses where each beat starts/ends (consecutive sentence ranges), its
// short headline (one *accent* word) and 1-2 teaching widgets + word-anchored
// cues. The spoken words are the approved sentences, verbatim. Chapters become
// modules (colour + progress pills); a chapter's first beat carries its badge.
// Pure apart from the injected `call` (the script brain in production).
import { validatePlan, findAnchor, MOODS } from './diagram-cues.mjs';
import { normWidget } from './course-plan.mjs';

export function paperChapterPrompt(sk, { index = 0, total = 1, brand = '', niche = '', errors = [] } = {}) {
  const n = sk.sentences.length;
  return `You design the VISUALS for ONE chapter of an animated lesson-style video for "${brand}" (niche: ${niche}).
The narration is FIXED and approved — never rewrite it. You decide how to split it into beats and what is on screen.

Chapter ${index + 1} of ${total}: "${sk.title}"
Narration sentences:
${sk.sentences.map((s, k) => `${k + 1}. ${s}`).join('\n')}

Rules:
- Split sentences 1-${n} into ${n <= 3 ? '1-2' : '2-4'} BEATS of CONSECUTIVE sentences ("from","to" inclusive), covering 1..${n} exactly once, in order.
- Each beat: a short headline (3-6 words, exactly one *accent* word) and 1-2 widgets drawn large and centred on a white page.
- Widgets: boxes (cells[] initial values, labels[] small tags) · stepper (label, value) · code (title, lines[] max 8) ·
  chart (label, series[{label, shape: linear|quad|steep|flat|log}]) · takeaway (items[] 2-3) · roadmap (stops[], current).
  Two widgets side by side: "slot":"left" + "slot":"right"; otherwise omit slot.
- Cues per sentence, keyed by the sentence NUMBER above (n = 1..${n}); each cue fires on ONE EXACT word of that sentence:
  show(widget) · fill(widget, index, value, tone?: good|bad) · mark(widget, index) · step(widget, step, text?, ok?) ·
  line(widget, line) · plot(widget, series) · tick(widget, index) · advance(widget, to) · stamp(text with *accent* words).
  NUMBERS, not text: line/index/series/to/step are integer positions. Money amounts become fills or steps.
- Every beat has at least one cue; every sentence gets a mood (${MOODS.join('|')}); pauseMs 0-1200.
${errors.length ? `\nYour previous answer was rejected. Fix exactly these problems:\n- ${errors.slice(0, 12).join('\n- ')}\n` : ''}
Reply with ONE raw JSON object only, like:
{"beats":[{"title":"Where the *money* goes","from":1,"to":2,"widgets":[{"id":"b","type":"boxes","cells":["","",""],"labels":["rent","food","fun"]}],
  "lines":[{"n":1,"mood":"calm","cues":[{"on":"rent","do":"fill","widget":"b","index":0,"value":"$1,400","tone":"bad"}]},{"n":2,"mood":"warm","cues":[]}]}]}`;
}

// LLM beats + approved sentences -> scenes. Returns { scenes, errors } (range errors fail the attempt).
export function assemblePaperChapter(sk, raw, { chapter = 1 } = {}) {
  const n = sk.sentences.length;
  const beats = raw && Array.isArray(raw.beats) ? raw.beats : [];
  const errors = [];
  let expect = 1;
  const scenes = [];
  beats.forEach((b, bi) => {
    const from = Number(b && b.from), to = Number(b && b.to);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from !== expect || to < from || to > n) {
      errors.push(`beat ${bi + 1}: from/to must be consecutive integer sentence numbers continuing at ${expect} (got ${b && b.from}-${b && b.to})`);
      return;
    }
    expect = to + 1;
    const byN = new Map((Array.isArray(b.lines) ? b.lines : []).map((l) => [Number(l && l.n), l]));
    scenes.push({
      title: String(b.title || sk.title).slice(0, 60),
      ...(scenes.length === 0 ? { badge: String(chapter).padStart(2, '0') } : {}),
      module: chapter,
      nodes: [], edges: [],
      widgets: (Array.isArray(b.widgets) ? b.widgets : []).slice(0, 2).map(normWidget),
      lines: sk.sentences.slice(from - 1, to).map((say, k) => {
        const l = byN.get(from + k) || {};
        return {
          say,
          ...(l.mood !== undefined && MOODS.includes(l.mood) ? { mood: l.mood } : {}),
          ...(Number.isFinite(+l.pauseMs) && +l.pauseMs >= 0 && +l.pauseMs <= 5000 && l.pauseMs !== undefined ? { pauseMs: +l.pauseMs } : {}),
          cues: (Array.isArray(l.cues) ? l.cues : []).filter((c) => c && typeof c === 'object'),
        };
      }),
    });
  });
  if (!beats.length) errors.push('no beats returned');
  else if (!errors.length && expect !== n + 1) errors.push(`beats cover sentences 1-${expect - 1} but the chapter has ${n} — cover every sentence once`);
  return { scenes, errors };
}

export function paperSceneErrors(scenes) {
  const errs = validatePlan({ scenes }).map((e) => e.replace(/^scene (\d+)/, 'beat $1'));
  scenes.forEach((sc, i) => {
    const B = `beat ${i + 1}`;
    if (!sc.widgets.length) errs.push(`${B} ("${sc.title}") has no widget — each beat needs one focal visual`);
    if (!sc.lines.some((l) => (l.cues || []).length)) errs.push(`${B} has no cue — the page must react`);
    if (!/\*[^*]+\*/.test(sc.title)) errs.push(`${B} headline "${sc.title}" needs exactly one *accent* word`);
    sc.lines.forEach((ln, li) => {
      const toks = String(ln.say).split(/\s+/).map((w) => ({ w }));
      (ln.cues || []).forEach((c, ci) => {
        if (c.on && findAnchor(toks, c.on, c.nth || 1) < 0) errs.push(`${B} line ${li + 1} cue ${ci + 1}: anchor "${c.on}" is not a word of that sentence ("${ln.say}")`);
      });
    });
  });
  return errs;
}

// drop only broken cues — the same "repair what is safe, never invent" contract as repairScene
export function repairPaperScenes(scenes) {
  const s = structuredClone(scenes);
  for (let pass = 0; pass < 4; pass++) {
    const bad = new Set();
    for (const e of paperSceneErrors(s)) {
      const m = /^beat (\d+) line (\d+) cue (\d+)/.exec(e);
      if (m) bad.add(`${+m[1] - 1}:${+m[2] - 1}:${+m[3] - 1}`);
    }
    if (!bad.size) break;
    s.forEach((sc, bi) => sc.lines.forEach((ln, li) => { ln.cues = ln.cues.filter((_, ci) => !bad.has(`${bi}:${li}:${ci}`)); }));
  }
  return s;
}

export async function planPaper(skeleton, { call, brand = '', niche = '', attempts = 4, log = () => {}, sceneGapMs = 0, outageWaitMs = 0, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const scenes = [];
  for (let i = 0; i < skeleton.length; i++) {
    const sk = skeleton[i];
    if (i > 0 && sceneGapMs) await sleep(sceneGapMs);
    let errors = [];
    let ok = null;
    for (let a = 1; a <= attempts && !ok; a++) {
      let raw = null;
      try { raw = await call(paperChapterPrompt(sk, { index: i, total: skeleton.length, brand, niche, errors })); } catch { raw = null; }
      if (!raw) {
        errors = ['no usable JSON returned'];
        if (a < attempts && outageWaitMs) { log(`[paper] chapter ${i + 1}: no provider answered — waiting ${Math.round((outageWaitMs * a) / 1000)}s`); await sleep(outageWaitMs * a); }
        continue;
      }
      const built = assemblePaperChapter(sk, raw, { chapter: i + 1 });
      if (built.errors.length) { errors = built.errors; log(`[paper] chapter ${i + 1} attempt ${a}: ${errors[0]}`); continue; }
      const fixed = repairPaperScenes(built.scenes);
      errors = paperSceneErrors(fixed);
      if (!errors.length) ok = fixed;
      else log(`[paper] chapter ${i + 1} attempt ${a}: ${errors.length} problem(s) — ${errors[0]}`);
    }
    if (!ok) throw new Error(`chapter ${i + 1} ("${sk.title}") failed after ${attempts} attempts: ${errors.slice(0, 3).join('; ')}`);
    scenes.push(...ok);
  }
  return { scenes, course: { modules: skeleton.map((sk, i) => ({ n: i + 1, title: sk.title })) } };
}
