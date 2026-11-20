// Course planner (C2, refined C1b — docs/qa/course-template-c1b-refine-qa.md R5).
// outline → render-ready paper plan. Pure apart from the injected `call` (script brain).
//
//   outline { slug, brand, title, audience, world, palette?, voice, modules:[{ n,
//   title, lectures:[{ n, title, point }] }] }
//     → per lecture, ONE brain call writes 2-5 BEATS. A beat = one idea = one
//     scene: its own short headline (one *accent* word), 1-2 widgets centred on a
//     white page, 1-5 spoken sentences with per-line mood/pause/cues. Only the
//     first beat carries the lecture badge; the last beat is the takeaway.
//     The `say` arrays are spoken verbatim; the validator keeps the LLM honest.
//
// Lecture rhythm (prompted, then checked): problem → analogy → worked example
// step by step → payoff → "here's what to take away" (takeaway widget ticks).
import { validatePlan } from './diagram-cues.mjs';

export const WIDGET_MENU = 'boxes | stepper | code | chart | takeaway | roadmap';
const RHYTHM = `Split the lecture into 2-5 BEATS. A beat is ONE idea with its own short headline
(3-6 words, exactly one *accent* word) and 1-5 sentences. Across the beats, follow this rhythm:
1. the problem, as a concrete moment in the world (name the cast);
2. an everyday analogy ("think of it as ...");
3. the worked example, step by step — one sentence per step, each step a widget cue;
4. the payoff line;
5. the LAST beat is titled "What to take *away*": "Here's what to take away." + 2-3 takeaway
   sentences; ONE tick per takeaway sentence, spread over the lines.`;

export function lecturePrompt(outline, module, lecture, { badge, errors = [], widgetMenu = WIDGET_MENU } = {}) {
  return `You write ONE lecture of an animated video course for "${outline.brand || 'a tech channel'}" (audience: ${outline.audience || 'curious beginners'}).

Course: "${outline.title}" · Module ${module.n} "${module.title}" · Lecture ${lecture.n}: "${lecture.title}" (badge "${badge}")
The one idea this lecture must land: ${lecture.point}
${outline.world ? `The course world (reuse it, never invent a new one): ${outline.world}` : ''}

${RHYTHM}

Visuals: each beat declares 1-2 widgets (they are drawn large and centred on a white page) from: ${widgetMenu}.
- boxes: cells[] (initial values, "" for empty) + labels[] (small tags, same length) · stepper: label, value ·
  code: title, lines[] (max 8) · chart: label, series[{label, shape: linear|quad|steep|flat|log}] ·
  takeaway: items[] (2-3) · roadmap: stops[], current
- Two widgets side by side: give them "slot":"left" and "slot":"right"; otherwise omit slot (stacked, centred).
- Cue verbs, each anchored to ONE EXACT word of that same numbered sentence:
  show(widget) · fill(widget, index, value, tone?: good|bad) · mark(widget, index) · step(widget, step, text?, ok?) ·
  line(widget, line) · plot(widget, series) · tick(widget, index) · advance(widget, to)
  plus stamp(text with *accent* words) for a one-line punch caption.
  NUMBERS, not text: "line"/"index"/"series"/"to"/"step" are integer positions
  (code line = 1..lines.length). NEVER put a sentence into a number field.
- At least one cue per beat and one for every second sentence; numbers become steps/fills.
- Every line gets a mood (calm | warm | excited | serious | tense | sad | playful); pauseMs 400-1200 before reveals.
- Widget ids are local to a beat (reuse "b", "s", "c" freely in another beat).

${errors.length ? `Your previous answer was rejected. Fix exactly these problems:\n- ${errors.slice(0, 14).join('\n- ')}\n` : ''}
A correct answer for a DIFFERENT lecture (same shape, never copy the content):
{"beats":[
 {"title":"Every name needs an *address*","widgets":[{"id":"b","type":"boxes","cells":["","",""],"labels":["name","book","address"]}],
  "say":["You type a name, not a number.","The browser asks the book for the address."],
  "lines":[{"n":1,"mood":"warm","cues":[{"on":"name","do":"show","widget":"b"},{"on":"type","do":"fill","widget":"b","index":0,"value":"shop"}]},
           {"n":2,"mood":"calm","cues":[{"on":"asks","do":"mark","widget":"b","index":1},{"on":"address","do":"fill","widget":"b","index":2,"value":"93.18","tone":"good"}]}]},
 {"title":"One *lookup*, then cached","widgets":[{"id":"s","type":"stepper","label":"lookups","value":0}],
  "say":["The first visit costs one lookup.","Every visit after that is free."],
  "lines":[{"n":1,"mood":"calm","cues":[{"on":"costs","do":"step","widget":"s","step":1,"text":"ask the book","ok":true}]},
           {"n":2,"mood":"excited","pauseMs":500,"cues":[{"on":"free","do":"stamp","text":"ASK *ONCE*"}]}]},
 {"title":"What to take *away*","widgets":[{"id":"t","type":"takeaway","items":["Names become addresses","Answers get cached"]}],
  "say":["Here's what to take away.","Names become addresses.","And the answer gets cached."],
  "lines":[{"n":1,"mood":"calm","cues":[{"on":"take","do":"show","widget":"t"}]},
           {"n":2,"mood":"warm","cues":[{"on":"Names","do":"tick","widget":"t","index":0}]},
           {"n":3,"mood":"warm","cues":[{"on":"cached","do":"tick","widget":"t","index":1}]}]}
]}

Reply with ONE raw JSON object only, shaped exactly like that. In each beat, "say" and "lines" cover
the same sentences in order (lines[n-1] is sentence n of THAT beat). 6-16 sentences across all beats.`;
}

const WIDGET_FIELDS = ['label', 'cells', 'labels', 'value', 'unit', 'title', 'lines', 'series', 'items', 'stops', 'current'];
export function normWidget(w) {
  const out = { id: String((w && w.id) || ''), type: w && w.type };
  if (w && (w.slot === 'left' || w.slot === 'right')) out.slot = w.slot;
  for (const k of WIDGET_FIELDS) if (w && w[k] !== undefined) out[k] = typeof w[k] === 'string' ? w[k].slice(0, 60) : w[k];
  return out;
}

// one beat → one validator-ready scene (spoken words = beat.say, verbatim)
export function assembleBeat(beat, lecture, module, first) {
  const r = beat && typeof beat === 'object' ? beat : {};
  const say = Array.isArray(r.say) ? r.say.map((s) => String(s || '').trim()).filter(Boolean) : [];
  const byN = new Map((Array.isArray(r.lines) ? r.lines : []).map((l) => [Number(l && l.n), l]));
  return {
    title: String(r.title || lecture.title).slice(0, 60),
    ...(first ? { badge: String(lecture.n).padStart(2, '0') } : {}),
    module: Number(module.n) || 1,
    nodes: [], edges: [],
    widgets: (Array.isArray(r.widgets) ? r.widgets : []).slice(0, 2).map(normWidget),
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

export function assembleLectureBeats(raw, lecture, module) {
  const beats = raw && Array.isArray(raw.beats) ? raw.beats : [];
  return beats.slice(0, 6).map((b, i) => assembleBeat(b, lecture, module, i === 0));
}

// Course-rhythm checks over a lecture's beats (validatePlan runs first, per beat).
export function courseChecks(scenes, { lecture, module, items = 2 } = {}) {
  const errs = [];
  if (!Array.isArray(scenes) || !scenes.length) return ['lecture has no beats'];
  if (scenes.length < 2 || scenes.length > 5) errs.push(`needs 2-5 beats (has ${scenes.length})`);
  const wantBadge = String(lecture).padStart(2, '0');
  if (scenes[0].badge !== wantBadge) errs.push(`badge "${scenes[0].badge}" ≠ lecture ${lecture}`);
  scenes.forEach((sc, i) => {
    if (Number(sc.module) !== Number(module)) errs.push(`beat ${i + 1}: module ${sc.module} ≠ outline module ${module}`);
    if (!sc.widgets.length) errs.push(`beat ${i + 1} ("${sc.title}") has no widget — each beat needs one focal visual`);
    if (!sc.lines.length) errs.push(`beat ${i + 1} has no sentences`);
    if (!sc.lines.some((l) => (l.cues || []).length)) errs.push(`beat ${i + 1} has no cue — the page must react`);
    if (!/\*[^*]+\*/.test(sc.title)) errs.push(`beat ${i + 1} headline "${sc.title}" needs exactly one *accent* word`);
  });
  const lines = scenes.flatMap((s) => s.lines);
  const n = lines.length;
  if (n < 6 || n > 16) errs.push(`needs 6-16 sentences across the beats (has ${n})`);
  const cues = lines.reduce((m, l) => m + (l.cues || []).length, 0);
  if (cues < Math.max(3, Math.ceil(n / 2))) errs.push(`too few cues (${cues} for ${n} sentences) — the page must react`);
  const lastSc = scenes[scenes.length - 1];
  const tk = (lastSc.widgets || []).find((w) => w.type === 'takeaway');
  const itemCount = tk && Array.isArray(tk.items) ? tk.items.length : 0;
  if (itemCount < items) errs.push(`the LAST beat needs a takeaway widget with at least ${items} items`);
  const ticks = lastSc.lines.reduce((m, l) => m + (l.cues || []).filter((c) => c.do === 'tick').length, 0);
  if (ticks < items) errs.push(`takeaway ticks: ${ticks} < ${items}`);
  const tickLines = lastSc.lines.filter((l) => (l.cues || []).some((c) => c.do === 'tick')).length;
  if (ticks >= items && tickLines < Math.min(items, ticks)) errs.push(`takeaway ticks must be spread over sentences (${ticks} ticks on ${tickLines} line(s)) — each takeaway sentence ticks its own item`);
  return errs;
}

// One lecture: prompt → call → assemble beats → validate (base per beat + course) → re-ask, bounded.
export async function planLecture(outline, module, lecture, { call, attempts = 3, items = 2, log = () => {}, validate = null, badge = null } = {}) {
  const b = badge ?? String(lecture.n).padStart(2, '0');
  let errors = [];
  for (let a = 1; a <= attempts; a++) {
    let raw = null;
    try { raw = await call(lecturePrompt(outline, module, lecture, { badge: b, errors })); } catch { raw = null; }
    if (raw) {
      const scenes = assembleLectureBeats(raw, lecture, module);
      errors = [
        ...(scenes.length ? validatePlan({ scenes }).map((e) => e.replace(/^scene (\d+)/, 'beat $1')) : []),
        ...(validate ? validate(scenes) : courseChecks(scenes, { lecture: lecture.n, module: module.n, items })),
      ];
      if (!errors.length) return scenes;
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
      scenes.push(...(await planLecture(outline, module, lec, { call, attempts, items, log })));
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
