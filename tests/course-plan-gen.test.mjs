// Course planner C2 (docs/qa/course-template-c2-planner-qa.md G1-G4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lecturePrompt, courseChecks, assembleLectureScene, planLecture, assembleCoursePlan } from '../lib/course-plan.mjs';

const OUTLINE = {
  slug: 'web-message', brand: 'ai-observer', title: 'How the web moves a message',
  audience: 'developers who never took a networking class',
  world: 'a laptop called LAPPY talking to a server called SHELF across the internet; cast: LAPPY, SHELF, DNS book, postman',
  palette: ['#5B4FDB', '#D96A2B'],
  voice: { engine: 'kokoro', voice: 'af_heart' },
  modules: [{ n: 1, title: 'The journey', lectures: [{ n: 1, title: 'What really happens when you type a URL', point: 'DNS finds the address, TCP opens the road, HTTP carries the message' }] }],
};

const GOOD_RAW = {
  title: 'Typed a URL', module: 1,
  widgets: [{ id: 't', type: 'takeaway', slot: 'left', items: ['DNS finds the address', 'TCP opens the road'] }],
  say: ['You type a address.', 'The book answers with the street.', 'A road opens to the server.', 'The message rides the road.', 'Two books, one journey.', 'That is the whole trip.'],
  lines: [
    { n: 1, mood: 'warm', cues: [{ on: 'type', do: 'show', widget: 't' }] },
    { n: 2, mood: 'calm', cues: [{ on: 'book', do: 'tick', widget: 't', index: 0 }] },
    { n: 3, mood: 'calm', cues: [{ on: 'road', do: 'tick', widget: 't', index: 1 }] },
    { n: 4, mood: 'calm', cues: [{ on: 'rides', do: 'stamp', text: 'ONE *TRIP.*' }] },
    { n: 5, mood: 'calm', cues: [] },
    { n: 6, mood: 'warm', pauseMs: 500, cues: [] },
  ],
};
const LEC = { n: 1, title: 'What really happens when you type a URL', point: 'DNS finds the address, TCP opens the road' };
const MOD = { n: 1, title: 'The journey', lectures: [LEC] };

test('G1: lecturePrompt carries title, point, world, rhythm, widgets, anchors, badge/module', () => {
  const p = lecturePrompt(OUTLINE, MOD, LEC, { badge: '01', errors: [] });
  assert.match(p, /What really happens when you type a URL/);
  assert.match(p, /DNS finds the address/);
  assert.match(p, /LAPPY/);                                    // world cast
  assert.match(p, /analogy/);                                  // rhythm
  assert.match(p, /takeaway/);                                 // payoff widget
  assert.match(p, /boxes \| stepper \| code \| chart \| takeaway \| roadmap/);
  assert.match(p, /EXACT word/);
  assert.match(p, /"01"/);                                     // zero-padded badge
  assert.match(p, /Module 1/);
  assert.match(p, /6-16 sentences|6-16 lines|6–16 lines/);
});

test('G1: the retry prompt names the previous errors', () => {
  const p = lecturePrompt(OUTLINE, MOD, LEC, { badge: '01', errors: ['line 2 cue 1: unknown widget "ghost"'] });
  assert.match(p, /unknown widget "ghost"/);
});

const goodScene = () => assembleLectureScene(structuredClone(GOOD_RAW), LEC, MOD);

test('G3: a good lecture scene passes courseChecks (badge/module from lecture data)', () => {
  const sc = goodScene();
  assert.deepEqual(courseChecks(sc, { lecture: LEC.n, module: MOD.n }), []);
});

test('G3: courseChecks names badge, module, length, density and takeaway violations', () => {
  const bad = {
    title: 'L', badge: '7', module: 2, nodes: [], edges: [], widgets: [],
    lines: [{ say: 'only one line', mood: 'calm', cues: [] }],
  };
  const errs = courseChecks(bad, { lecture: 1, module: 1 });
  assert.ok(errs.some((e) => /badge "7" ≠ lecture 1/.test(e)), errs.join('\n'));
  assert.ok(errs.some((e) => /module 2 ≠ outline module 1/.test(e)), errs.join('\n'));
  assert.ok(errs.some((e) => /needs 6-16 lines \(has 1\)/.test(e)), errs.join('\n'));
  assert.ok(errs.some((e) => /too few cues/.test(e)), errs.join('\n'));
  assert.ok(errs.some((e) => /no takeaway widget with at least 2 items/.test(e)), errs.join('\n'));
});

test('G4: assembleLectureScene speaks the generated say array and stamps lecture data', () => {
  const sc = goodScene();
  assert.equal(sc.badge, '01');                       // from lecture.n, not the LLM
  assert.equal(sc.module, 1);
  assert.equal(sc.title, 'Typed a URL');              // the LLM's scene title is kept
  assert.deepEqual(sc.lines.map((l) => l.say), GOOD_RAW.say);
  assert.equal(sc.lines[1].mood, 'calm');
});

test('G2: a lecture that never passes fails loudly, naming the lecture', async () => {
  const bad = structuredClone(GOOD_RAW);
  bad.say = ['one line only.'];
  bad.lines = [{ n: 1, mood: 'calm', cues: [] }];
  await assert.rejects(
    planLecture(OUTLINE, MOD, LEC, { call: async () => structuredClone(bad), attempts: 2 }),
    /lecture 1 "What really happens when you type a URL" failed after 2 attempts/,
  );
});

test('G2: a lecture that passes on retry returns the scene (errors were fed back)', async () => {
  const bad = structuredClone(GOOD_RAW);
  delete bad.widgets; // the brain forgot the takeaway widget — assemble cannot repair that
  const prompts = [];
  const sc = await planLecture(OUTLINE, MOD, LEC, {
    call: async (prompt) => { prompts.push(prompt); return structuredClone(prompts.length === 1 ? bad : GOOD_RAW); },
    attempts: 2,
  });
  assert.equal(sc.badge, '01');
  assert.match(prompts[1], /no takeaway widget with at least 2 items/);
});

test('G4: assembleCoursePlan builds the render-ready plan (style/voice/course/scenes)', async () => {
  const plan = await assembleCoursePlan(OUTLINE, { call: async () => structuredClone(GOOD_RAW), attempts: 2, log: () => {} });
  assert.equal(plan.style, 'paper');
  assert.deepEqual(plan.voice, OUTLINE.voice);
  assert.deepEqual(plan.course.modules.map((m) => m.title), ['The journey']);
  assert.deepEqual(plan.course.palette, OUTLINE.palette);
  assert.equal(plan.scenes.length, 1);
  assert.equal(plan.scenes[0].badge, '01');
  assert.equal(plan.slug, 'web-message');
});
