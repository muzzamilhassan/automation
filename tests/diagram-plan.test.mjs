// Step 1 diagram planner (docs/qa/step1-mr-voice-moneyflow-qa.md D1-D3, D5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagramSkeleton, sceneErrors, assembleScene, repairScene, planDiagram, scenePrompt, buildDiagramTimeline, diagramSrt, diagramChapterLines } from '../lib/diagram-plan.mjs';
import { docRenderOf } from '../lib/doc-storybook.mjs';

const SCRIPT = {
  title: 'Pay Yourself First',
  intro: 'Most people save whatever is left. That is the trap.',
  chapters: [
    { title: 'The usual way', text: 'Your paycheck lands in checking. Rent takes the biggest bite.' },
    { title: 'Flip the order', text: 'Move ten percent to savings first. Then spend the rest.' },
  ],
  outro: 'Same paycheck. Different order.',
};

test('D1: docRenderOf recognises diagram next to storybook', () => {
  assert.equal(docRenderOf({ story_structure: { doc_render: 'diagram' } }), 'diagram');
  assert.equal(docRenderOf({ story_structure: { doc_render: 'storybook' } }), 'storybook');
  assert.equal(docRenderOf({ story_structure: { doc_render: 'other' } }), null);
  assert.equal(docRenderOf(null), null);
});

test('skeleton: intro, one scene per chapter, outro — sentences split by us', () => {
  const sk = diagramSkeleton(SCRIPT);
  assert.deepEqual(sk.map((s) => s.title), ['Pay Yourself First', 'The usual way', 'Flip the order', 'The takeaway']);
  assert.deepEqual(sk[1].sentences, ['Your paycheck lands in checking.', 'Rent takes the biggest bite.']);
  assert.equal(sk.reduce((n, s) => n + s.sentences.length, 0), 8);
});

const GOOD = {
  layout: 'flow',
  nodes: [{ id: 'pay', kind: 'cash', label: 'Paycheck', rank: 0 }, { id: 'chk', kind: 'bank', label: 'Checking', rank: 1 }, { id: 'rent', kind: 'home', label: 'Rent', rank: 2 }],
  edges: [{ id: 'p-c', from: 'pay', to: 'chk' }, { id: 'c-r', from: 'chk', to: 'rent' }],
  lines: [
    { n: 1, mood: 'calm', cues: [{ on: 'paycheck', do: 'appear', node: 'pay' }, { on: 'checking', do: 'flow', edge: 'p-c' }], say: 'IGNORED — the LLM never writes the words' },
    { n: 2, mood: 'serious', pauseMs: 500, cues: [{ on: 'Rent', do: 'appear', node: 'rent' }, { on: 'bite', do: 'flow', edge: 'c-r', label: '-$1,400' }] },
  ],
};

test('D2: assembleScene speaks the APPROVED sentences verbatim, whatever the LLM wrote', () => {
  const sk = diagramSkeleton(SCRIPT)[1];
  const sc = assembleScene(sk, GOOD);
  assert.deepEqual(sc.lines.map((l) => l.say), sk.sentences);
  assert.equal(sc.lines[1].mood, 'serious');
  assert.equal(sc.lines[1].pauseMs, 500);
  assert.equal(sc.title, 'The usual way');
});

test('D3: sceneErrors accepts a good scene and names each defect', () => {
  const sk = diagramSkeleton(SCRIPT)[1];
  assert.deepEqual(sceneErrors(assembleScene(sk, GOOD)), []);
  const bad = structuredClone(GOOD);
  bad.lines[0].cues.push({ on: 'savings', do: 'appear', node: 'pay' }); // word not in the sentence
  bad.lines[1].cues.push({ on: 'bite', do: 'flow', edge: 'nope' });     // unknown edge
  bad.lines[1].mood = 'furious';
  const errs = sceneErrors(assembleScene(sk, bad));
  assert.ok(errs.some((e) => /anchor "savings" is not a word of sentence 1/.test(e)), errs.join('\n'));
  assert.ok(errs.some((e) => /unknown edge "nope"/.test(e)), errs.join('\n'));
  assert.ok(errs.some((e) => /mood must be one of/.test(e)), errs.join('\n'));
});

test('D3: a scene with too few cues or nodes is rejected (density floor)', () => {
  const sk = diagramSkeleton(SCRIPT)[1];
  const thin = { layout: 'flow', nodes: [{ id: 'a', kind: 'cash', label: 'A', rank: 0 }], edges: [], lines: [] };
  const errs = sceneErrors(assembleScene(sk, thin));
  assert.ok(errs.some((e) => /at least 2 nodes/.test(e)), errs.join('\n'));
  assert.ok(errs.some((e) => /at least 1 cues/.test(e)), errs.join('\n'));
});

test('repairScene: drops only the broken cues/edges, reflows a full column, keeps the rest valid', () => {
  const sk = { title: 'Leaks', sentences: ['Your paycheck lands in checking.', 'Rent takes the biggest bite.', 'Subscriptions nibble the rest.'] };
  const raw = {
    layout: 'flow',
    nodes: [
      { id: 'pay', kind: 'cash', label: 'Paycheck', rank: 0 },
      { id: 'a', kind: 'home', label: 'A', rank: 1 }, { id: 'b', kind: 'home', label: 'B', rank: 1 }, { id: 'c', kind: 'home', label: 'C', rank: 1 },
      { id: 'd', kind: 'home', label: 'D', rank: 1 }, { id: 'e', kind: 'home', label: 'E', rank: 1 }, // 5 in rank 1
      { id: 'z', kind: 'bank', label: 'Z', rank: 2 },
      { id: 'pay', kind: 'cash', label: 'dup', rank: 3 },                                             // duplicate id
    ],
    edges: [{ id: 'p-a', from: 'pay', to: 'a' }, { id: 'p-x', from: 'pay', to: 'ghost' }],
    lines: [
      { n: 1, mood: 'calm', cues: [{ on: 'paycheck', do: 'appear', node: 'pay' }, { on: 'checking', do: 'counter', node: 'pay' }] }, // counter without "to"
      { n: 2, mood: 'furious', pauseMs: 99999, cues: [{ on: 'Rent', do: 'flow', edge: 'p-a' }, { on: 'savings', do: 'appear', node: 'a' }] }, // absent anchor
      { n: 3, cues: [{ on: 'nibble', do: 'appear', node: 'habit' }, { on: 'rest', do: 'tone', node: 'z', tone: 'bad' }] }, // unknown node
    ],
  };
  const { scene, fixes } = repairScene(assembleScene(sk, raw));
  assert.deepEqual(sceneErrors(scene), [], 'the repaired scene validates');
  // b..e are never connected or animated -> clutter, dropped; ranks re-packed 0..n
  assert.deepEqual(scene.nodes.map((n) => n.id), ['pay', 'a', 'z']);
  assert.deepEqual(scene.nodes.map((n) => n.rank), [0, 1, 2]);
  assert.deepEqual(scene.edges.map((e) => e.id), ['p-a']);
  assert.deepEqual(scene.lines.map((l) => l.cues.map((c) => c.do)), [['appear'], ['flow'], ['tone']]);
  assert.equal(scene.lines[1].mood, undefined);
  assert.equal(scene.lines[1].pauseMs, undefined);
  assert.ok(fixes.length >= 4, fixes.join('\n'));
});

test('repairScene: a full column overflows into a new column; >7 nodes keep the most-used ones', () => {
  const sk = { title: 'Crowd', sentences: ['Your paycheck lands in checking.', 'Rent takes the biggest bite.'] };
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
  const raw = {
    layout: 'flow',
    nodes: ids.map((id, k) => ({ id, kind: 'cash', label: id.toUpperCase(), rank: k < 5 ? 1 : 3 })),
    edges: [{ id: 'a-f', from: 'a', to: 'f' }],
    lines: [
      { n: 1, cues: ids.map((id) => ({ on: 'paycheck', do: 'appear', node: id })) },
      { n: 2, cues: [{ on: 'Rent', do: 'flow', edge: 'a-f' }, { on: 'bite', do: 'tone', node: 'a', tone: 'bad' }] },
    ],
  };
  const { scene } = repairScene(assembleScene(sk, raw));
  assert.deepEqual(sceneErrors(scene), []);
  assert.equal(scene.nodes.length, 7, 'hard cap of 7 nodes per scene');
  assert.ok(scene.nodes.some((n) => n.id === 'a') && scene.nodes.some((n) => n.id === 'f'), 'the most-used nodes survive');
  const perRank = {};
  scene.nodes.forEach((n) => { perRank[n.rank] = (perRank[n.rank] || 0) + 1; });
  assert.ok(Object.values(perRank).every((c) => c <= 4), JSON.stringify(perRank));
  assert.deepEqual([...new Set(scene.nodes.map((n) => n.rank))].sort(), [0, 1, 2].slice(0, new Set(scene.nodes.map((n) => n.rank)).size), 'ranks packed from 0');
});

test('planDiagram repairs a fixable scene instead of re-asking', async () => {
  let calls = 0;
  const fixable = structuredClone(GOOD);
  fixable.lines[0].cues.push({ on: 'checking', do: 'counter', node: 'pay' }); // broken, droppable
  const sk = diagramSkeleton({ ...SCRIPT, intro: '', outro: '', chapters: [SCRIPT.chapters[0]] });
  const plan = await planDiagram(sk, { call: async () => { calls++; return fixable; } });
  assert.equal(calls, 1);
  assert.deepEqual(plan.scenes[0].lines[0].cues.map((c) => c.do), ['appear', 'flow']);
});

test('scenePrompt carries the numbered sentences, the vocabulary and the previous cast', () => {
  const sk = diagramSkeleton(SCRIPT);
  const p = scenePrompt(sk[2], { index: 2, total: 4, brand: 'THE MONEY RULEBOOK', niche: 'Personal finance', prevNodes: GOOD.nodes, errors: ['scene 1: unknown edge "x"'] });
  assert.match(p, /1\. Move ten percent to savings first\./);
  assert.match(p, /2\. Then spend the rest\./);
  assert.match(p, /appear\(node\)/);
  assert.match(p, /cash, bank/);
  assert.match(p, /pay \(cash, "Paycheck"\)/);
  assert.match(p, /unknown edge "x"/);
});

test('planDiagram: retries a bad scene with its errors, then succeeds', async () => {
  const prompts = [];
  let n = 0;
  const call = async (prompt) => {
    prompts.push(prompt);
    n++;
    if (n === 2) return { ...GOOD, nodes: [GOOD.nodes[0]] }; // scene 2 first try: one node — not repairable
    return GOOD;
  };
  const sk = diagramSkeleton({ ...SCRIPT, intro: '', outro: '', chapters: [SCRIPT.chapters[0], SCRIPT.chapters[0]] });
  const plan = await planDiagram(sk, { call, brand: 'MR', niche: 'money' });
  assert.equal(plan.scenes.length, 2);
  assert.equal(prompts.length, 3);
  assert.match(prompts[2], /scene needs at least 2 nodes/, 'the retry prompt names the defect');
});

test('planDiagram: waits between scenes and backs off when no provider answers', async () => {
  const waits = [];
  let n = 0;
  const call = async () => { n++; return n === 2 ? null : GOOD; }; // scene 2 first try: outage
  const sk = diagramSkeleton({ ...SCRIPT, intro: '', outro: '', chapters: [SCRIPT.chapters[0], SCRIPT.chapters[0]] });
  await planDiagram(sk, { call, sceneGapMs: 6000, outageWaitMs: 20000, sleep: async (ms) => { waits.push(ms); } });
  assert.deepEqual(waits, [6000, 20000]);
});

test('planDiagram: a scene that never validates throws (the lane falls back to storybook)', async () => {
  const sk = diagramSkeleton({ ...SCRIPT, intro: '', outro: '', chapters: [SCRIPT.chapters[0]] });
  await assert.rejects(planDiagram(sk, { call: async () => ({ nodes: [], edges: [], lines: [] }), attempts: 2 }), /scene 1 \("The usual way"\) failed after 2 attempts/);
  await assert.rejects(planDiagram(sk, { call: async () => null, attempts: 2 }), /failed after 2 attempts/);
});

test('voiceProfileFor reads lib/brands.json DATA; diagramVoiceArgs picks profile or Edge', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const p = (await import('node:path')).join(os.tmpdir(), `brands-${process.pid}.json`);
  fs.writeFileSync(p, JSON.stringify({ mr: { voiceProfile: { engine: 'kokoro', voice: 'bm_daniel', speed: 0.95, mood: 'calm' } }, qq: { voice: 'am_michael' }, bad: { voiceProfile: { engine: 'kokoro' } } }));
  const { voiceProfileFor } = await import('../lib/voice-profile.mjs');
  const { diagramVoiceArgs } = await import('../lib/diagram-episode.mjs');
  const prof = voiceProfileFor('mr', p);
  assert.deepEqual(prof, { engine: 'kokoro', voice: 'bm_daniel', speed: 0.95, mood: 'calm' });
  assert.equal(voiceProfileFor('qq', p), null);
  assert.equal(voiceProfileFor('bad', p), null);
  assert.equal(voiceProfileFor('nope', p), null);
  fs.rmSync(p);
  assert.deepEqual(diagramVoiceArgs({ voiceProfile: prof }), ['--engine', 'kokoro', '--voice', 'bm_daniel', '--speed', '0.95', '--mood', 'calm']);
  assert.deepEqual(diagramVoiceArgs({ voice: 'am_michael' }), ['--engine', 'edge', '--voice', 'en-US-AndrewMultilingualNeural']);
  assert.deepEqual(diagramVoiceArgs({ voice: 'x' }, { voice: 'en-GB-RyanNeural' }), ['--engine', 'edge', '--voice', 'en-GB-RyanNeural']);
  // the real MR kit carries the step-1 profile
  assert.equal(voiceProfileFor('money-rulebook').voice, 'bm_daniel');
});

test('D6: both Living Diagram drafts validate, are reusable (no channel-specific brand) and pick their look', async () => {
  const fs = await import('node:fs');
  const { validateDraft } = await import('../lib/template-bot.mjs');
  const load = (f) => JSON.parse(fs.readFileSync(new URL(`../studio/lib/template-bot-drafts/${f}.json`, import.meta.url), 'utf8'));
  for (const [id, style] of [['money-flow-diagram', 'tile'], ['systems-diagram', 'glow']]) {
    const d = load(id);
    const v = validateDraft(d);
    assert.equal(v.ok, true, `${id}: ${v.errors.join('; ')}`);
    assert.equal(docRenderOf(d), 'diagram');
    assert.equal(d.doc_presentation.style, style);
    // reusable: brand strings + accent come from each channel's kit, never the template
    for (const k of ['brand', 'eyebrow', 'badge']) assert.equal(d.doc_presentation[k], undefined, `${id}.${k}`);
    assert.equal(d.thumb_design.brandmark, undefined);
    assert.equal(d.thumb_design.accent, undefined);
    assert.ok(d.niches.length >= 5, `${id} serves several niches`);
  }
  assert.deepEqual(load('money-flow-diagram').safety.review_required, ['finance']);
  assert.ok(load('money-flow-diagram').niches.includes('Personal finance rules & money habits'));
  assert.ok(load('systems-diagram').niches.includes('AI & future tech'));
});

test('enable-human-voice: one data field on, validated, and off again', async () => {
  const { setVoiceProfile } = await import('../scripts/enable-human-voice.mjs');
  const kits = { qq: { voice: 'am_michael' }, odd: { voice: 'en-US-AndrewNeural' } };
  assert.deepEqual(setVoiceProfile(kits, 'qq', { speed: '0.95', mood: 'warm' }), { engine: 'kokoro', voice: 'am_michael', speed: 0.95, mood: 'warm' });
  assert.equal(kits.qq.voiceProfile.voice, 'am_michael');
  assert.throws(() => setVoiceProfile(kits, 'odd', {}), /not a Kokoro voice id/);
  assert.equal(setVoiceProfile(kits, 'odd', { voice: 'af_heart' }).voice, 'af_heart');
  assert.throws(() => setVoiceProfile(kits, 'qq', { speed: 3 }), /speed/);
  assert.throws(() => setVoiceProfile(kits, 'qq', { mood: 'furious' }), /mood/);
  assert.throws(() => setVoiceProfile(kits, 'nope', {}), /unknown channel/);
  assert.equal(setVoiceProfile(kits, 'qq', { off: true }), null);
  assert.equal(kits.qq.voiceProfile, undefined);
});

test('timeline: lead per scene, pause per line, words shifted, srt + chapter lines', () => {
  const sk = diagramSkeleton(SCRIPT);
  const flat = [];
  sk.forEach((s, si) => s.sentences.forEach((say, li) => flat.push({ si, li, say, pauseMs: li === 0 ? 900 : undefined })));
  const durs = flat.map((f, i) => ({ i, ms: 2000, words: f.say.split(' ').map((w, k) => ({ w, s: 0.1 + k * 0.2, d: 0.18 })) }));
  const { lines, totalMs } = buildDiagramTimeline(flat, durs, (i) => `a/line-${i}.mp3`, { leadMs: 1000, padMs: 380, sceneTailMs: 900, endMs: 2200 });
  assert.equal(lines[0].startMs, 1000);
  assert.equal(lines[1].startMs, 1000 + 2000 + 900);           // line 0 carries pauseMs 900
  assert.equal(lines[2].startMs, lines[1].startMs + 2000 + 380 + 900 + 1000); // scene change: pad + tail + lead
  assert.equal(lines[0].words[0].t0, 100);
  assert.ok(totalMs > lines.at(-1).startMs);
  const srt = diagramSrt(lines);
  assert.match(srt, /^1\n00:00:01,100 --> /);
  const ch = diagramChapterLines(sk, lines, { leadMs: 1000 });
  assert.equal(ch[0], '00:00 Pay Yourself First');
  assert.equal(ch.length, 4);
});
