// Course planner C2 (docs/qa/course-template-c2-planner-qa.md) — outline →
// render-ready paper plan. Pure apart from the injected `call` (script brain).
//
//   outline { slug, brand, title, audience, world, palette?, voice, modules:[{ n,
//   title, lectures:[{ n, title, point }] }] }
//     → per lecture, ONE brain call writes the lecture: a `say` array (the spoken
//     words, in the fixed rhythm) plus per-line mood/pause/cues over the widget
//     vocabulary. The say array is spoken verbatim; the validator keeps the LLM
//     honest (base rules + course rhythm below). Bounded re-asks, loud failure.
//
// Lecture rhythm (prompted, then checked): problem → analogy → worked example
// step by step → payoff → "here's what to take away" (takeaway widget ticks).
import { validatePlan } from './diagram-cues.mjs';

export const WIDGET_MENU = 'boxes | stepper | code | chart | takeaway | roadmap';
const RHYTHM = `Write the lecture in this rhythm, one idea per sentence:
1. the problem, as a concrete moment in the world (name the cast);
2. an everyday analogy ("think of it as ...");
3. the worked example, step by step — one sentence per step, each step a widget cue;
4. the payoff line;
5. end on "Here's what to take away." + 2-3 takeaway sentences (the takeaway widget ticks them — ONE tick per takeaway sentence, spread over the lines).`;

export function lecturePrompt(outline, module, lecture, { badge, errors = [], widgetMenu = WIDGET_MENU } = {}) {
  return `You write ONE lecture of an animated video course for "${outline.brand || 'a tech channel'}" (audience: ${outline.audience || 'curious beginners'}).

Course: "${outline.title}" · Module ${module.n} "${module.title}" · Lecture ${lecture.n}: "${lecture.title}"
The one idea this lecture must land: ${lecture.point}
${outline.world ? `The course world (reuse it, never invent a new one): ${outline.world}` : ''}

${RHYTHM}

Visuals: a persistent widget set per scene, from: ${widgetMenu}.
- Declare each widget with an id, type and ONE slot (top | center | left | right | bottom | full).
  boxes: cells[] + labels[] · stepper: label, value, unit? · code: title, lines[] ·
  chart: label, series[{label, shape: linear|quad|steep|flat|log}] · takeaway: label, items[] · roadmap: stops[], current
- Cue verbs, each anchored to ONE EXACT word of that same numbered sentence:
  show(widget) · fill(widget, index, value, tone?) · mark(widget, index) · step(widget, step, text?, ok?) ·
  line(widget, line) · plot(widget, series) · tick(widget, index) · advance(widget, to)
  plus the scene verbs: stamp(text with *accent* words) · title(text with *accent* words) · card(card, title, lines, side) · hide(card)
  NUMBERS, not text: "line"/"index"/"series"/"to"/"step" are integer positions
  (code line = 1..lines.length). NEVER put a sentence into a number field; the
  sentence lives in "say" or in the widget's own lines[]/items[]/stops[].
- At least one cue for every second sentence; numbers become counters/steps; the final takeaway sentences tick the takeaway items.
- Every line gets a mood (calm | warm | excited | serious | tense | sad | playful); long pauseMs (400-1200) before reveals.
- NO nodes/edges unless the idea truly needs a diagram — widgets carry this format.

${errors.length ? `Your previous answer was rejected. Fix exactly these problems:\n- ${errors.slice(0, 14).join('\n- ')}\n` : ''}
A correct answer for a DIFFERENT lecture (same shape, never copy the content):
{"title":"Where the *address* comes from","module":1,"badge":"01",
 "widgets":[{"id":"c","type":"code","slot":"right","title":"lookup.py","lines":["name = \\"shop.example\\"","\\"93.184.216.34\\""]},
            {"id":"t","type":"takeaway","slot":"left","label":"What to take away","items":["The book turns a name into an address","Nobody memorises addresses"]}],
 "say":["You type a name.","The book finds the address.","One line of code asks the book.","The address comes back.","Two steps, invisible.","That is the trade."],
 "lines":[{"n":1,"mood":"warm","cues":[{"on":"type","do":"show","widget":"c"}]},
          {"n":2,"mood":"calm","cues":[{"on":"book","do":"line","widget":"c","line":1}]},
          {"n":3,"mood":"calm","cues":[{"on":"asks","do":"line","widget":"c","line":2}]},
          {"n":4,"mood":"calm","cues":[{"on":"comes","do":"fill","widget":"c","index":1,"value":"93.184.216.34"}]},
          {"n":5,"mood":"warm","cues":[{"on":"invisible","do":"stamp","text":"*INVISIBLE,* NOT MAGIC"}]},
          {"n":6,"mood":"warm","cues":[{"on":"trade","do":"tick","widget":"t","index":0}]}]}

Reply with ONE raw JSON object only:
{"title":"short scene title with one *accent* word","module":${module.n},"badge":"${badge}",
 "widgets":[{"id":"t","type":"takeaway","slot":"left","label":"What to take away","items":["...","..."]}],
 "say":["sentence 1.","sentence 2.","... 6-16 sentences total ..."],
 "lines":[{"n":1,"mood":"warm","pauseMs":0,"cues":[{"on":"word1","do":"show","widget":"t"}]}]}
"say" and "lines" MUST cover the same sentences, in order (lines[n-1] is sentence n).`;
}

// LLM raw + lecture data → a validator-ready scene. The spoken words come from
// raw.say in order; the LLM's per-line `say` is ignored (same contract as the
// doc lane: generated visuals, owned words).
export function assembleLectureScene(raw, lecture, module) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const say = Array.isArray(r.say) ? r.say.map((s) => String(s || '').trim()).filter(Boolean) : [];
  const byN = new Map((Array.isArray(r.lines) ? r.lines : []).map((l) => [Number(l && l.n), l]));
  return {
    title: String(r.title || lecture.title).slice(0, 60),
    badge: String(lecture.n).padStart(2, '0'),
    module: Number(module.n) || 1,
    nodes: [], edges: [],
    widgets: (Array.isArray(r.widgets) ? r.widgets : []).map((w) => ({
      id: String(w && w.id || ''), type: w && w.type, slot: w && w.slot,
      ...(w && w.label !== undefined ? { label: String(w.label).slice(0, 40) } : {}),
      ...(w && w.cells !== undefined ? { cells: w.cells } : {}),
      ...(w && w.labels !== undefined ? { labels: w.labels } : {}),
      ...(w && w.value !== undefined ? { value: w.value } : {}),
      ...(w && w.unit !== undefined ? { unit: String(w.unit).slice(0, 12) } : {}),
      ...(w && w.title !== undefined ? { title: String(w.title).slice(0, 40) } : {}),
      ...(w && w.lines !== undefined ? { lines: w.lines } : {}),
      ...(w && w.series !== undefined ? { series: w.series } : {}),
      ...(w && w.items !== undefined ? { items: w.items } : {}),
      ...(w && w.stops !== undefined ? { stops: w.stops } : {}),
      ...(w && w.current !== undefined ? { current: w.current } : {}),
    })),
    lines: say.map((s, k) => {
      const l = byN.get(k + 1) || {};
      return {
        say: s,
        ...(l.mood !== undefined ? { mood: l.mood } : {}),
        ...(l.pauseMs !== undefined ? { pauseMs: Number(l.pauseMs) || 0 } : {}),
        cues: (Array.isArray(l.cues) ? l.cues : []).filter((c) => c && typeof c === 'object'),
      };
    }),
  };
}

// Course-rhythm checks ON TOP of validatePlan (which the caller runs first).
export function courseChecks(scene, { lecture, module, items = 2 } = {}) {
  const errs = [];
  const wantBadge = String(lecture).padStart(2, '0');
  if (scene.badge !== wantBadge) errs.push(`badge "${scene.badge}" ≠ lecture ${lecture}`);
  if (Number(scene.module) !== Number(module)) errs.push(`module ${scene.module} ≠ outline module ${module}`);
  const n = scene.lines.length;
  if (n < 6 || n > 16) errs.push(`needs 6-16 lines (has ${n})`);
  const cues = scene.lines.reduce((m, l) => m + (l.cues || []).length, 0);
  if (cues < Math.max(3, Math.ceil(n / 2))) errs.push(`too few cues (${cues} for ${n} lines) — the page must react`);
  const tk = (scene.widgets || []).find((w) => w.type === 'takeaway');
  const itemCount = tk && Array.isArray(tk.items) ? tk.items.length : 0;
  if (itemCount < items) errs.push(`no takeaway widget with at least ${items} items`);
  const ticks = scene.lines.reduce((m, l) => m + (l.cues || []).filter((c) => c.do === 'tick').length, 0);
  if (ticks < items) errs.push(`takeaway ticks: ${ticks} < ${items}`);
  const tickLines = scene.lines.filter((l) => (l.cues || []).some((c) => c.do === 'tick')).length;
  if (ticks >= items && tickLines < Math.min(items, ticks)) errs.push(`takeaway ticks must be spread over sentences (${ticks} ticks on ${tickLines} line(s)) — each takeaway sentence ticks its own item`);
  return errs;
}

// One lecture: prompt → call → assemble → validate (base + course) → re-ask, bounded.
export async function planLecture(outline, module, lecture, { call, attempts = 3, items = 2, log = () => {}, validate = null, badge = null } = {}) {
  const b = badge ?? String(lecture.n).padStart(2, '0');
  let errors = [];
  for (let a = 1; a <= attempts; a++) {
    let raw = null;
    try { raw = await call(lecturePrompt(outline, module, lecture, { badge: b, errors })); } catch { raw = null; }
    if (raw) {
      const scene = assembleLectureScene(raw, lecture, module);
      errors = [
        ...validatePlan({ scenes: [scene] }).map((e) => e.replace(/^scene 1/, 'lecture')),
        ...(validate ? validate(scene) : courseChecks(scene, { lecture: lecture.n, module: module.n, items })),
      ];
      if (!errors.length) return scene;
      log(`[course] lecture ${lecture.n}: ${errors.length} problem(s) — ${errors[0]}`);
    } else {
      errors = ['no usable JSON returned'];
      log(`[course] lecture ${lecture.n} attempt ${a}: no usable JSON`);
    }
  }
  throw new Error(`lecture ${lecture.n} "${lecture.title}" failed after ${attempts} attempts: ${errors.slice(0, 3).join('; ')}`);
}

// The whole course: every lecture of every module, lectures numbered across the course.
export async function assembleCoursePlan(outline, { call, attempts = 3, items = 2, log = () => {} } = {}) {
  const scenes = [];
  let n = 0;
  for (const module of outline.modules) {
    for (const lecture of module.lectures) {
      n += 1;
      const lec = { ...lecture, n };
      scenes.push(await planLecture(outline, module, lec, { call, attempts, items, log }));
    }
  }
  return {
    slug: outline.slug,
    brand: outline.brand,
    title: outline.title,
    style: 'paper',
    voice: outline.voice || { engine: 'edge', voice: 'en-US-AndrewMultilingualNeural' },
    course: { modules: outline.modules.map((m) => ({ n: m.n, title: m.title })), ...(outline.palette?.length ? { palette: outline.palette } : {}) },
    scenes,
  };
}
