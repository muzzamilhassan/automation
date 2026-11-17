// Living Diagram planner — pure functions, no I/O.
// Spec: docs/qa/living-diagram-demo-qa.md (R1-R3).
//
// A plan is what the script brain writes: per scene, the cast (nodes with a
// `rank` column, edges) and per spoken line, cues anchored to a WORD of that line:
//   { on: "rent", nth?: 1, afterMs?: 0, do: "flow", edge: "c-rent", ... }
// resolvePlan() binds each anchor to the real TTS WordBoundary time, so the
// renderer can fire the change exactly on the spoken word. Pixel positions are
// never in the plan; layoutScene() derives them from rank + order.

export const SAFE = { x0: 230, x1: 1690, y0: 300, y1: 840, minGap: 150, maxPerRank: 4, rankGap: 500, rowGap: 270, maxHub: 8, hubRx: 560, hubRy: 270 };

// verb -> required fields (besides `on`)
export const VERBS = {
  appear: ['node'],
  flow: ['edge'],
  block: ['edge'],
  counter: ['node', 'to'],
  tone: ['node', 'tone'],
  fail: ['node'],
  stamp: ['text'],
  focus: ['node'],
  wide: [],
  // v2 (Visualcoders grammar, research §2 / channel study 2026-11-16)
  title: ['text'],          // big centred statement; the diagram dims behind it
  card: ['card', 'title'],  // side panel: title + lines (✓ / ✗ / code), until hide or scene end
  hide: ['card'],
  badge: ['node', 'text'],  // small pill on a node: ✓, ✗, 429, 2…
  // Course template C1 (docs/qa/course-template-c1-qa.md): teaching widgets
  show: ['widget'],
  fill: ['widget', 'index'],   // boxes: put a value into cell i
  mark: ['widget', 'index'],   // boxes: pointer / highlight on cell i
  step: ['widget'],            // stepper: new value and/or a check line (text, ok)
  line: ['widget', 'line'],    // code: highlight line n (1-based)
  plot: ['widget', 'series'],  // chart: draw series i
  tick: ['widget', 'index'],   // takeaway: tick item i
  advance: ['widget', 'to'],   // roadmap: move the marker to stop i
};
// widget type -> the verbs it accepts + how its index range is read
export const WIDGET_TYPES = {
  boxes: { verbs: ['show', 'fill', 'mark'], size: (w) => (w.cells || []).length, field: 'index', what: 'index', base: 0 },
  stepper: { verbs: ['show', 'step'] },
  code: { verbs: ['show', 'line'], size: (w) => (w.lines || []).length, field: 'line', what: 'line', base: 1 },
  chart: { verbs: ['show', 'plot'], size: (w) => (w.series || []).length, field: 'series', what: 'series', base: 0 },
  takeaway: { verbs: ['show', 'tick'], size: (w) => (w.items || []).length, field: 'index', what: 'item', base: 0 },
  roadmap: { verbs: ['show', 'advance'], size: (w) => (w.stops || []).length, field: 'to', what: 'stop', base: 0 },
};
export const WIDGET_SLOTS = ['center', 'left', 'right', 'top', 'bottom', 'full'];
const TONES = new Set(['good', 'bad', 'neutral']);
export const MOODS = ['calm', 'warm', 'excited', 'serious', 'tense', 'sad', 'playful'];
const SIDES = new Set(['left', 'right', 'bottom']);

export function normWord(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// index of the first word of the nth (1-based) occurrence of `anchor` (one or
// more words) in `words` ([{w}]), or -1
export function findAnchor(words, anchor, nth = 1) {
  const want = String(anchor || '').split(/\s+/).map(normWord).filter(Boolean);
  if (!want.length) return -1;
  const have = words.map((x) => normWord(x.w));
  let seen = 0;
  for (let i = 0; i + want.length <= have.length; i++) {
    let ok = true;
    for (let k = 0; k < want.length; k++) if (have[i + k] !== want[k]) { ok = false; break; }
    if (ok && ++seen === nth) return i;
  }
  return -1;
}

export function validatePlan(plan) {
  const errs = [];
  const scenes = Array.isArray(plan?.scenes) ? plan.scenes : [];
  if (!scenes.length) return ['plan has no scenes'];
  scenes.forEach((sc, si) => {
    const S = `scene ${si + 1}`;
    const nodes = new Set();
    const perRank = new Map();
    const hub = sc.layout === 'hub';
    if (sc.layout !== undefined && sc.layout !== 'flow' && !hub) errs.push(`${S}: layout must be flow|hub`);
    for (const n of sc.nodes || []) {
      if (!n.id) { errs.push(`${S}: node without id`); continue; }
      if (nodes.has(n.id)) errs.push(`${S}: duplicate node id "${n.id}"`);
      nodes.add(n.id);
      if (hub) continue;
      if (!Number.isInteger(n.rank) || n.rank < 0) errs.push(`${S}: node "${n.id}" needs an integer rank >= 0`);
      perRank.set(n.rank, (perRank.get(n.rank) || 0) + 1);
    }
    if (hub && (sc.nodes || []).length > SAFE.maxHub + 1) errs.push(`${S}: hub layout takes at most ${SAFE.maxHub} spokes`);
    for (const [r, c] of perRank) if (c > SAFE.maxPerRank) errs.push(`${S}: rank ${r} has ${c} nodes (max ${SAFE.maxPerRank})`);
    const cards = new Set();
    const widgets = new Map();
    for (const w of sc.widgets || []) {
      if (!w || !w.id) { errs.push(`${S}: widget without id`); continue; }
      if (widgets.has(w.id)) { errs.push(`${S}: duplicate widget id "${w.id}"`); continue; }
      if (!WIDGET_TYPES[w.type]) { errs.push(`${S}: widget "${w.id}": type must be one of ${Object.keys(WIDGET_TYPES).join('|')}`); continue; }
      if (w.slot !== undefined && !WIDGET_SLOTS.includes(w.slot)) { errs.push(`${S}: widget "${w.id}": slot must be one of ${WIDGET_SLOTS.join('|')}`); continue; }
      widgets.set(w.id, w);
    }
    const edges = new Set();
    for (const e of sc.edges || []) {
      if (!e.id) { errs.push(`${S}: edge without id`); continue; }
      if (edges.has(e.id)) errs.push(`${S}: duplicate edge id "${e.id}"`);
      edges.add(e.id);
      for (const end of [e.from, e.to]) if (!nodes.has(end)) errs.push(`${S}: edge "${e.id}" points to unknown node "${end}"`);
    }
    (sc.lines || []).forEach((ln, li) => {
      if (!String(ln.say || '').trim()) errs.push(`${S} line ${li + 1}: empty "say"`);
      if (ln.mood !== undefined && !MOODS.includes(ln.mood)) errs.push(`${S} line ${li + 1}: mood must be one of ${MOODS.join('|')}`);
      if (ln.pauseMs !== undefined && !(Number.isFinite(+ln.pauseMs) && +ln.pauseMs >= 0 && +ln.pauseMs <= 5000)) errs.push(`${S} line ${li + 1}: pauseMs must be 0-5000`);
      (ln.cues || []).forEach((c, ci) => {
        const C = `${S} line ${li + 1} cue ${ci + 1}`;
        if (!c.on) return errs.push(`${C}: missing "on" (the word that triggers it)`);
        const need = VERBS[c.do];
        if (!need) return errs.push(`${C}: unknown verb "${c.do}"`);
        const missing = need.find((f) => c[f] === undefined || c[f] === '');
        if (missing) return errs.push(`${C}: ${c.do} needs "${missing}"`);
        if (c.node !== undefined && !nodes.has(c.node)) return errs.push(`${C}: unknown node "${c.node}"`);
        if (c.edge !== undefined && !edges.has(c.edge)) return errs.push(`${C}: unknown edge "${c.edge}"`);
        if (c.do === 'tone' && !TONES.has(c.tone)) return errs.push(`${C}: tone must be good|bad|neutral`);
        if (c.do === 'counter' && (!Number.isFinite(+c.to) || (c.from !== undefined && !Number.isFinite(+c.from)))) return errs.push(`${C}: counter from/to must be numbers`);
        if (c.do === 'badge' && c.tone !== undefined && !TONES.has(c.tone)) return errs.push(`${C}: tone must be good|bad|neutral`);
        if (c.do === 'card') {
          if (c.side !== undefined && !SIDES.has(c.side)) return errs.push(`${C}: side must be left|right|bottom`);
          if (c.lines !== undefined && !Array.isArray(c.lines)) return errs.push(`${C}: card lines must be a list`);
          cards.add(c.card);
        }
        if (c.do === 'hide' && !cards.has(c.card)) return errs.push(`${C}: hide: unknown card "${c.card}"`);
        if (c.widget !== undefined) {
          const w = widgets.get(c.widget);
          if (!w) return errs.push(`${C}: unknown widget "${c.widget}"`);
          const T = WIDGET_TYPES[w.type];
          if (!T.verbs.includes(c.do)) return errs.push(`${C}: ${c.do} does not apply to a ${w.type} widget`);
          if (T.size && c.do !== 'show') {
            const v = Number(c[T.field]);
            const n = T.size(w);
            if (!Number.isInteger(v) || v < T.base || v > n - 1 + T.base) {
              if (!Number.isInteger(Number(c[T.field]))) return errs.push(`${C}: ${c.do} on ${w.type} "${w.id}": ${T.field} must be a NUMBER ${T.base}-${n - 1 + T.base}, got ${JSON.stringify(c[T.field])}`);
              return errs.push(`${C}: ${T.what} ${c[T.field]} is outside ${w.type} "${w.id}" (${T.base}-${n - 1 + T.base})`);
            }
          }
        }
      });
    });
  });
  return errs;
}

// rank -> column (left to right), plan order -> row (top to bottom); the whole
// graph is centred, spacing capped so small graphs stay compact
export function layoutScene(scene) {
  if (scene.layout === 'hub') {
    // first node = hub at the centre; the rest evenly on an ellipse from the top
    const cx = (SAFE.x0 + SAFE.x1) / 2;
    const cy = (SAFE.y0 + SAFE.y1) / 2;
    const [first, ...rest] = scene.nodes || [];
    const out = {};
    if (first) out[first.id] = { x: Math.round(cx), y: Math.round(cy) };
    rest.forEach((n, k) => {
      const ang = -Math.PI / 2 + (2 * Math.PI * k) / rest.length;
      out[n.id] = { x: Math.round(cx + SAFE.hubRx * Math.cos(ang)), y: Math.round(cy + SAFE.hubRy * Math.sin(ang)) };
    });
    return out;
  }
  const byRank = new Map();
  for (const n of scene.nodes || []) {
    if (!byRank.has(n.rank)) byRank.set(n.rank, []);
    byRank.get(n.rank).push(n.id);
  }
  const ranks = [...byRank.keys()].sort((a, b) => a - b);
  const cx = (SAFE.x0 + SAFE.x1) / 2;
  const cy = (SAFE.y0 + SAFE.y1) / 2;
  const colGap = ranks.length > 1 ? Math.min(SAFE.rankGap, (SAFE.x1 - SAFE.x0) / (ranks.length - 1)) : 0;
  const out = {};
  ranks.forEach((r, ri) => {
    const x = cx + (ri - (ranks.length - 1) / 2) * colGap;
    const ids = byRank.get(r);
    const rowGap = ids.length > 1 ? Math.min(SAFE.rowGap, (SAFE.y1 - SAFE.y0) / (ids.length - 1)) : 0;
    ids.forEach((id, k) => {
      out[id] = { x: Math.round(x), y: Math.round(cy + (k - (ids.length - 1) / 2) * rowGap) };
    });
  });
  return out;
}

// lines: one entry per spoken line in plan order, { startMs (absolute),
// words: [{w, t0, t1}] (ms relative to the line) }. opts.leadMs: how long a
// scene opens before its first line; opts.totalMs: end of the last scene.
export function resolvePlan(plan, lines, opts = {}) {
  const errors = validatePlan(plan);
  if (errors.length) return { errors, scenes: [], cues: [] };
  const lead = opts.leadMs || 0;
  const flat = [];
  plan.scenes.forEach((sc, si) => (sc.lines || []).forEach((ln, li) => flat.push({ si, li, ln })));
  if (flat.length !== lines.length) return { errors: [`plan has ${flat.length} lines but TTS returned ${lines.length}`], scenes: [], cues: [], course: plan.course || null };

  const cues = [];
  const firstLine = new Map();
  flat.forEach(({ si, li, ln }, k) => {
    const L = lines[k];
    if (!firstLine.has(si)) firstLine.set(si, L.startMs);
    (ln.cues || []).forEach((c, ci) => {
      const idx = findAnchor(L.words || [], c.on, c.nth || 1);
      if (idx < 0) {
        errors.push(`scene ${si + 1} line ${li + 1} cue ${ci + 1}: anchor "${c.on}"${c.nth > 1 ? ` (#${c.nth})` : ''} is not spoken in "${ln.say}"`);
        return;
      }
      const { on, nth, afterMs, ...rest } = c;
      cues.push({ ...rest, t: Math.round(L.startMs + L.words[idx].t0 + (afterMs || 0)), scene: si });
    });
  });
  const last = lines[lines.length - 1];
  const lastEnd = last ? last.startMs + Math.max(0, ...(last.words || []).map((w) => w.t1)) : 0;
  const scenes = plan.scenes.map((sc, si) => ({
    n: si + 1,
    total: plan.scenes.length,
    title: sc.title || '',
    startMs: Math.max(0, (firstLine.get(si) ?? 0) - lead),
    layoutKind: sc.layout === 'hub' ? 'hub' : 'flow',
    ...(sc.badge !== undefined ? { badge: String(sc.badge) } : {}),
    ...(Number.isInteger(sc.module) ? { module: sc.module } : {}),
    widgets: Array.isArray(sc.widgets) ? JSON.parse(JSON.stringify(sc.widgets)) : [],
    nodes: (sc.nodes || []).map((n) => ({ id: n.id, kind: n.kind || 'dot', label: n.label || '', keep: !!n.keep, value: n.value, color: n.color, scale: Number.isFinite(+n.scale) && +n.scale > 0 ? Math.min(+n.scale, 2) : 1 })),
    edges: (sc.edges || []).map((e) => ({ id: e.id, from: e.from, to: e.to })),
    layout: layoutScene(sc),
  }));
  scenes.forEach((s, i) => { s.endMs = i + 1 < scenes.length ? scenes[i + 1].startMs : (opts.totalMs ?? lastEnd); });
  cues.sort((a, b) => a.t - b.t);
  return { errors, scenes, cues, course: plan.course || null };
}
