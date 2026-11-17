// Living Diagram planner for the DOC lane (step 1 — docs/qa/step1-mr-voice-moneyflow-qa.md).
//
// The owner approves WORDS at Studio > Review. This module turns an approved
// episode script into a Living Diagram plan WITHOUT touching those words:
//   1. diagramSkeleton() splits the script into scenes (intro / chapter / outro)
//      and sentences — deterministically, here, never by the LLM (D2);
//   2. per scene, the LLM returns ONLY visuals keyed by sentence NUMBER
//      (nodes, edges, cues anchored to a word of that sentence, mood, pause);
//   3. assembleScene() re-attaches the approved sentence to every line;
//   4. sceneErrors() validates (planner rules + anchor-in-sentence + density);
//      planDiagram() re-asks a failing scene with its errors (bounded), and
//      throws when a scene never validates — the caller falls back to the
//      storybook look (D4).
// Pure apart from the injected `call` (the script-brain adapter in production).
import { validatePlan, findAnchor, MOODS, SAFE } from './diagram-cues.mjs';
import { sentences } from './doc-storybook.mjs';
import { cuesFromWords, toSrt } from './srt.mjs';

export const DIAGRAM_KINDS = ['cash', 'bank', 'home', 'receipt', 'bag', 'vault', 'person', 'user', 'card', 'chart', 'building', 'clock',
  'laptop', 'phone', 'server', 'database', 'api', 'gateway', 'bot', 'bucket', 'globe', 'lock', 'queue', 'dot'];
export const DIAGRAM_COLORS = ['blue', 'purple', 'green', 'yellow', 'red', 'orange', 'white', 'cyan'];
export const MAX_SCENE_NODES = 7; // one clear picture per scene (the reference grammar: 3-6 elements)

export function diagramSkeleton(script) {
  const out = [];
  const intro = sentences(script && script.intro);
  if (intro.length) out.push({ key: 'intro', title: String(script.title || 'Intro').slice(0, 48), sentences: intro });
  (Array.isArray(script && script.chapters) ? script.chapters : []).forEach((c, i) => {
    const s = sentences(c && c.text);
    if (s.length) out.push({ key: `ch${i + 1}`, title: String((c && c.title) || `Part ${i + 1}`).slice(0, 48), sentences: s });
  });
  const outro = sentences(script && script.outro);
  if (outro.length) out.push({ key: 'outro', title: 'The takeaway', sentences: outro });
  return out;
}

const num = (v) => (Number.isFinite(+v) ? +v : undefined);

// LLM visuals + approved sentences -> one planner scene. Anything the LLM wrote
// as words is dropped: `say` always comes from the skeleton.
export function assembleScene(sk, raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const byN = new Map((Array.isArray(r.lines) ? r.lines : []).map((l) => [num(l && l.n), l]));
  return {
    title: sk.title,
    layout: r.layout === 'hub' ? 'hub' : 'flow',
    nodes: (Array.isArray(r.nodes) ? r.nodes : []).map((n) => ({
      id: String(n && n.id || ''), kind: DIAGRAM_KINDS.includes(n && n.kind) ? n.kind : 'dot', label: String(n && n.label || '').slice(0, 28),
      ...(r.layout === 'hub' ? {} : { rank: Number.isInteger(n && n.rank) ? n.rank : num(n && n.rank) }),
      ...(n && n.keep ? { keep: true } : {}), ...(DIAGRAM_COLORS.includes(n && n.color) ? { color: n.color } : {}),
      ...(n && n.value !== undefined ? { value: String(n.value).slice(0, 16) } : {}),
    })),
    edges: (Array.isArray(r.edges) ? r.edges : []).map((e) => ({ id: String(e && e.id || ''), from: String(e && e.from || ''), to: String(e && e.to || '') })),
    lines: sk.sentences.map((say, k) => {
      const l = byN.get(k + 1) || {};
      return {
        say,
        ...(l.mood !== undefined ? { mood: l.mood } : {}),
        ...(l.pauseMs !== undefined ? { pauseMs: num(l.pauseMs) ?? l.pauseMs } : {}),
        cues: (Array.isArray(l.cues) ? l.cues : []).filter((c) => c && typeof c === 'object'),
      };
    }),
  };
}

// Free LLMs get the SHAPE right but slip on details (seen live 2026-11-17, Groq
// gpt-oss-120b: 5 nodes in a column, counter without "to", a cue on an undeclared
// node, an anchor word that is not in the sentence). Repair what is safe to repair
// WITHOUT inventing content: drop the broken cue/edge/duplicate, move a column's
// overflow into a new column, drop an invalid mood/pause. Cue-level problems are
// read from sceneErrors() itself, so the validation rules live in ONE place.
// Whatever survives is fully valid; scene-level gaps (too few nodes/cues) are left
// for sceneErrors() so the scene is re-asked.
export function repairScene(scene) {
  const s = structuredClone(scene);
  const fixes = [];
  const seen = new Set();
  s.nodes = s.nodes.filter((n) => {
    if (!n.id || seen.has(n.id)) { fixes.push(`dropped duplicate/empty node "${n.id}"`); return false; }
    seen.add(n.id);
    return true;
  });
  // clutter guard (dry run 2026-11-17: scenes of 15-25 boxes, old boxes piling up
  // via keep): a node that is never connected or animated is noise -> dropped;
  // then at most MAX_SCENE_NODES survive, the most-used first (ties: plan order).
  const use = new Map(s.nodes.map((n) => [n.id, 0]));
  const bump = (id) => { if (use.has(id)) use.set(id, use.get(id) + 1); };
  s.edges.forEach((e) => { bump(e.from); bump(e.to); });
  s.lines.forEach((ln) => (ln.cues || []).forEach((c) => bump(c.node)));
  const used = s.nodes.filter((n) => use.get(n.id) > 0);
  if (used.length < s.nodes.length && used.length >= 2) {
    fixes.push(`dropped ${s.nodes.length - used.length} unused node(s)`);
    s.nodes = used;
  }
  if (s.nodes.length > MAX_SCENE_NODES) {
    const keep = new Set(s.nodes.map((n, i) => ({ id: n.id, i, u: use.get(n.id) }))
      .sort((a, b) => b.u - a.u || a.i - b.i).slice(0, MAX_SCENE_NODES).map((x) => x.id));
    fixes.push(`kept the ${MAX_SCENE_NODES} most-used of ${s.nodes.length} nodes`);
    s.nodes = s.nodes.filter((n) => keep.has(n.id));
  }
  if (s.layout === 'hub') {
    if (s.nodes.length > SAFE.maxHub + 1) { fixes.push(`dropped ${s.nodes.length - SAFE.maxHub - 1} spoke(s) over the hub limit`); s.nodes = s.nodes.slice(0, SAFE.maxHub + 1); }
    s.nodes.forEach((n) => { delete n.rank; });
  } else {
    s.nodes.forEach((n) => { if (!Number.isInteger(n.rank) || n.rank < 0) n.rank = Math.max(0, Math.round(Number(n.rank) || 0)); });
    for (let guard = 0; guard < 20; guard++) {
      const ranks = [...new Set(s.nodes.map((n) => n.rank))].sort((a, b) => a - b);
      const full = ranks.find((r) => s.nodes.filter((n) => n.rank === r).length > SAFE.maxPerRank);
      if (full === undefined) break;
      const overflow = s.nodes.filter((n) => n.rank === full).slice(SAFE.maxPerRank);
      s.nodes.forEach((n) => { if (n.rank > full) n.rank += 1; });
      overflow.forEach((n) => { n.rank = full + 1; });
      fixes.push(`moved ${overflow.length} node(s) from full column ${full} to a new column`);
    }
    // pack the columns 0..k (gaps waste width and shrink every column)
    const order = [...new Set(s.nodes.map((n) => n.rank))].sort((a, b) => a - b);
    s.nodes.forEach((n) => { n.rank = order.indexOf(n.rank); });
  }
  const ids = new Set(s.nodes.map((n) => n.id));
  const eSeen = new Set();
  s.edges = s.edges.filter((e) => {
    if (!e.id || eSeen.has(e.id) || !ids.has(e.from) || !ids.has(e.to)) { fixes.push(`dropped edge "${e.id}"`); return false; }
    eSeen.add(e.id);
    return true;
  });
  s.lines.forEach((ln) => {
    if (ln.mood !== undefined && !MOODS.includes(ln.mood)) { delete ln.mood; fixes.push('dropped an invalid mood'); }
    if (ln.pauseMs !== undefined && !(Number.isFinite(ln.pauseMs) && ln.pauseMs >= 0 && ln.pauseMs <= 5000)) { delete ln.pauseMs; fixes.push('dropped an invalid pause'); }
  });
  for (let pass = 0; pass < 5; pass++) {
    const bad = new Set();
    for (const e of sceneErrors(s)) {
      const m = /line (\d+) cue (\d+)/.exec(e);
      if (m) bad.add(`${+m[1] - 1}:${+m[2] - 1}`);
    }
    if (!bad.size) break;
    s.lines.forEach((ln, li) => { ln.cues = ln.cues.filter((_, ci) => !bad.has(`${li}:${ci}`)); });
    fixes.push(`dropped ${bad.size} broken cue(s)`);
  }
  return { scene: s, fixes };
}

export function sceneErrors(scene) {
  const errs = validatePlan({ scenes: [scene] }).map((e) => e.replace(/^scene 1/, 'scene'));
  scene.lines.forEach((ln, li) => {
    const toks = String(ln.say).split(/\s+/).map((w) => ({ w }));
    (ln.cues || []).forEach((c, ci) => {
      if (c.on && findAnchor(toks, c.on, c.nth || 1) < 0) errs.push(`line ${li + 1} cue ${ci + 1}: anchor "${c.on}" is not a word of sentence ${li + 1} ("${ln.say}")`);
    });
  });
  if (scene.nodes.length < 2) errs.push('scene needs at least 2 nodes');
  // a flow scene with no edge is a row of floating icons, not a diagram (dry run 2026-11-17)
  if (scene.layout !== 'hub' && scene.nodes.length >= 2 && !scene.edges.length) errs.push('scene needs at least 1 edge — connect the nodes the money/data moves between');
  const cues = scene.lines.reduce((n, l) => n + (l.cues || []).length, 0);
  const floor = Math.max(1, Math.ceil(scene.lines.length / 2));
  if (cues < floor) errs.push(`scene needs at least ${floor} cues (has ${cues}) — make the diagram react to the narration`);
  return errs;
}

export function scenePrompt(sk, { index = 0, total = 1, brand = '', niche = '', prevNodes = [], errors = [] } = {}) {
  const prev = (prevNodes || []).map((n) => `${n.id} (${n.kind}, "${n.label}")`).join('; ');
  return `You design ONE scene of an animated explainer diagram for the YouTube channel "${brand}" (niche: ${niche}).
The narration is FIXED and already approved — never rewrite it. You only decide what is on screen and which spoken WORD triggers each change.

Scene ${index + 1} of ${total}: "${sk.title}"
Narration sentences:
${sk.sentences.map((s, k) => `${k + 1}. ${s}`).join('\n')}

${prev ? `Previous scene cast (reuse ids with "keep": true to keep them on screen and let them glide): ${prev}\n` : ''}Rules:
- ONE clear picture per scene: 3-6 nodes (hard max ${MAX_SCENE_NODES}); every node must be connected by an edge or animated by a cue — no decoration.
- The scene is a FLOW: edges connect the nodes that money/data/people move between (at least one edge); amounts go in "value" or counters, while the label NAMES the thing ("Checking", not "$120").
- kind from: ${DIAGRAM_KINDS.join(', ')}. label <= 22 chars, 1-3 words. Optional color: ${DIAGRAM_COLORS.join(', ')}. Optional value (e.g. "$0").
- Carry a previous node (same id + "keep": true) ONLY if this scene's sentences still talk about it.
- layout "flow": every node needs an integer rank (0 = left column); at most 4 nodes per rank. layout "hub": first node is the centre, no ranks.
- edges connect node ids: {"id","from","to"}.
- For EVERY sentence number give mood (${MOODS.join('|')}), optional pauseMs (0-1500, longer before a reveal) and cues.
- A cue fires on a word: {"on": "<one exact word from THAT sentence>", "do": <verb>, ...}. Verbs:
  appear(node) · flow(edge, label?, burst?) · block(edge) · counter(node, from, to, prefix?, suffix?) · tone(node, tone: good|bad|neutral)
  · fail(node) · badge(node, text, tone?) · stamp(text with *accent* words) · title(text with *accent* words) · focus(node, zoom?) · wide()
  · card(card: id, title, lines: [..], side: left|right|bottom) · hide(card)
- At least one cue for every second sentence; numbers in the narration should become counters, money moving should be a flow.
- Hard rules (answers that break them are rejected): counter ALWAYS has numeric "from" and "to"; every node/edge a cue names is declared in nodes/edges; the "on" word is copied EXACTLY from that same numbered sentence (never from another sentence, never a number that is not written there).
- Short, concrete labels. No pixel positions.
${errors.length ? `\nYour previous answer for this scene was rejected. Fix exactly these problems:\n- ${errors.slice(0, 12).join('\n- ')}\n` : ''}
Reply with ONE raw JSON object only:
{"layout":"flow","nodes":[{"id":"pay","kind":"cash","label":"Paycheck","rank":0}],"edges":[{"id":"p-c","from":"pay","to":"chk"}],"lines":[{"n":1,"mood":"calm","pauseMs":300,"cues":[{"on":"paycheck","do":"appear","node":"pay"}]}]}`;
}

// Bounded re-asks per scene; throws when a scene never validates (D3/D4).
// Free providers rate-limit per minute (dry run 2026-11-17: Groq 429 + Gemini 503
// three times in a row on scene 6 of 11 fired back to back). So: a short gap
// between scenes, and a growing wait after an attempt where NO provider answered
// (limits reset within a minute). A shape failure re-asks immediately.
export async function planDiagram(skeleton, { call, brand = '', niche = '', attempts = 4, log = () => {}, sceneGapMs = 0, outageWaitMs = 0, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const scenes = [];
  let prevNodes = [];
  for (let i = 0; i < skeleton.length; i++) {
    const sk = skeleton[i];
    if (i > 0 && sceneGapMs) await sleep(sceneGapMs);
    let errors = [];
    let ok = null;
    for (let a = 1; a <= attempts && !ok; a++) {
      let raw = null;
      try { raw = await call(scenePrompt(sk, { index: i, total: skeleton.length, brand, niche, prevNodes, errors })); } catch (e) { raw = null; errors = [`no usable JSON (${String(e && e.message || e).slice(0, 80)})`]; }
      if (!raw) {
        if (!errors.length || /^no usable JSON/.test(errors[0])) errors = ['no usable JSON returned'];
        if (a < attempts && outageWaitMs) {
          log(`[diagram] scene ${i + 1}: no provider answered — waiting ${Math.round((outageWaitMs * a) / 1000)}s`);
          await sleep(outageWaitMs * a);
        }
        continue;
      }
      const { scene, fixes } = repairScene(assembleScene(sk, raw));
      errors = sceneErrors(scene);
      if (!errors.length) {
        ok = scene;
        if (fixes.length) log(`[diagram] scene ${i + 1}: repaired (${fixes.join('; ')})`);
      } else log(`[diagram] scene ${i + 1} attempt ${a}: ${errors.length} problem(s) — ${errors[0]}`);
    }
    if (!ok) throw new Error(`scene ${i + 1} ("${sk.title}") failed after ${attempts} attempts: ${errors.slice(0, 3).join('; ')}`);
    scenes.push(ok);
    prevNodes = ok.nodes;
  }
  return { scenes };
}

// voice durations -> the renderer timeline (same pacing as the local demo builder)
export function buildDiagramTimeline(flat, durs, audioFor, { leadMs = 1000, padMs = 380, sceneTailMs = 900, endMs = 2200 } = {}) {
  const byI = durs instanceof Map ? durs : new Map((durs || []).map((d) => [d.i, d]));
  let cursor = 0;
  const lines = flat.map((f, i) => {
    if (i === 0 || flat[i - 1].si !== f.si) cursor += (i === 0 ? 0 : sceneTailMs) + leadMs;
    const d = byI.get(i) || { words: [] };
    const words = (d.words || []).map((w) => ({ w: w.w, t0: Math.round(w.s * 1000), t1: Math.round((w.s + w.d) * 1000) }));
    const spoken = Math.max(d.ms || 0, words.length ? words[words.length - 1].t1 : 0);
    const line = { startMs: Math.round(cursor), ms: spoken + (Number.isFinite(f.pauseMs) ? f.pauseMs : padMs), words, audio: spoken ? audioFor(i) : null };
    cursor += line.ms;
    return line;
  });
  return { lines, totalMs: Math.round(cursor + endMs) };
}

export function diagramSrt(lines) {
  const cues = [];
  for (const l of lines) {
    if (!l.words || !l.words.length) continue;
    cues.push(...cuesFromWords(l.words.map((w) => ({ w: w.w, s: w.t0 / 1000, d: (w.t1 - w.t0) / 1000 })), l.startMs / 1000));
  }
  return toSrt(cues);
}

export function diagramChapterLines(skeleton, lines, { leadMs = 1000 } = {}) {
  let k = 0;
  return skeleton.map((sk) => {
    const first = lines[k];
    k += sk.sentences.length;
    const t = Math.max(0, ((first && first.startMs) || 0) - leadMs) / 1000;
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')} ${sk.title}`;
  });
}
