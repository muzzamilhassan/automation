// Course planner — C2 + C1b beats (docs/qa/course-template-c2-planner-qa.md G1-G4,
// docs/qa/course-template-c1b-refine-qa.md R5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lecturePrompt, courseChecks, assembleLectureBeats, planLecture, assembleCoursePlan, normWidget } from '../lib/course-plan.mjs';

const OUTLINE = {
  slug: 'web-message', brand: 'ai-observer', title: 'How the web moves a message',
  audience: 'developers who never took a networking class',
  world: 'a laptop called LAPPY talking to a server called SHELF across the internet; cast: LAPPY, SHELF, DNS book, postman',
  palette: ['#5B4FDB', '#D96A2B'],
  voice: { engine: 'kokoro', voice: 'af_heart' },
  modules: [{ n: 1, title: 'The journey', lectures: [{ n: 1, title: 'What really happens when you type a URL', point: 'DNS finds the address, TCP opens the road, HTTP carries the message' }] }],
};

const GOOD_RAW = {
  beats: [
    {
      title: 'A name needs an *address*',
      widgets: [{ id: 'b', type: 'boxes', cells: ['', '', ''], labels: ['name', 'book', 'ip'] }],
      say: ['You type a name.', 'The book answers with the street.'],
      lines: [
        { n: 1, mood: 'warm', cues: [{ on: 'type', do: 'show', widget: 'b' }, { on: 'name', do: 'fill', widget: 'b', index: 0, value: 'shop' }] },
        { n: 2, mood: 'calm', cues: [{ on: 'street', do: 'fill', widget: 'b', index: 2, value: '93.18', tone: 'good' }] },
      ],
    },
    {
      title: 'A *road* opens',
      widgets: [{ id: 's', type: 'stepper', label: 'steps', value: 0 }],
      say: ['A road opens to the server.', 'The message rides the road.'],
      lines: [
        { n: 1, mood: 'calm', cues: [{ on: 'opens', do: 'step', widget: 's', step: 1, text: 'TCP', ok: true }] },
        { n: 2, mood: 'calm', cues: [{ on: 'rides', do: 'stamp', text: 'ONE *TRIP*' }] },
      ],
    },
    {
      title: 'What to take *away*',
      widgets: [{ id: 't', type: 'takeaway', items: ['DNS finds the address', 'TCP opens the road'] }],
      say: ["Here's what to take away.", 'The book finds the address.', 'And a road carries the message.'],
      lines: [
        { n: 1, mood: 'calm', cues: [{ on: 'take', do: 'show', widget: 't' }] },
        { n: 2, mood: 'warm', cues: [{ on: 'book', do: 'tick', widget: 't', index: 0 }] },
        { n: 3, mood: 'warm', cues: [{ on: 'road', do: 'tick', widget: 't', index: 1 }] },
      ],
    },
  ],
};
const LEC = { n: 1, title: 'What really happens when you type a URL', point: 'DNS finds the address, TCP opens the road' };
const MOD = { n: 1, title: 'The journey', lectures: [LEC] };

test('G1: lecturePrompt carries title, point, world, beats rhythm, widgets, anchors, badge/module', () => {
  const p = lecturePrompt(OUTLINE, MOD, LEC, { badge: '01', errors: [] });
  assert.match(p, /What really happens when you type a URL/);
  assert.match(p, /DNS finds the address/);
  assert.match(p, /LAPPY/);
  assert.match(p, /analogy/);
  assert.match(p, /2-5 BEATS/);
  assert.match(p, /What to take \*away\*/);
  assert.match(p, /boxes \| stepper \| code \| chart \| takeaway \| roadmap/);
  assert.match(p, /EXACT word/);
  assert.match(p, /"01"/);
  assert.match(p, /Module 1/);
  assert.match(p, /6-16 sentences/);
});

test('G1: the retry prompt names the previous errors', () => {
  const p = lecturePrompt(OUTLINE, MOD, LEC, { badge: '01', errors: ['beat 2 line 1 cue 1: unknown widget "ghost"'] });
  assert.match(p, /unknown widget "ghost"/);
});

test('R5: assembleLectureBeats — one scene per beat, badge on beat 1 only, words verbatim', () => {
  const scenes = assembleLectureBeats(structuredClone(GOOD_RAW), LEC, MOD);
  assert.equal(scenes.length, 3);
  assert.equal(scenes[0].badge, '01');
  assert.equal(scenes[1].badge, undefined);
  assert.equal(scenes[2].badge, undefined);
  assert.deepEqual(scenes.map((s) => s.title), ['A name needs an *address*', 'A *road* opens', 'What to take *away*']);
  assert.deepEqual(scenes[2].lines.map((l) => l.say), GOOD_RAW.beats[2].say);
  assert.ok(scenes.every((s) => s.module === 1));
});

test('G3: a good lecture passes courseChecks', () => {
  const scenes = assembleLectureBeats(structuredClone(GOOD_RAW), LEC, MOD);
  assert.deepEqual(courseChecks(scenes, { lecture: 1, module: 1 }), []);
});

test('G3: courseChecks names beats count, missing widget, accent, length, takeaway and spread violations', () => {
  const bad = structuredClone(GOOD_RAW);
  bad.beats = [bad.beats[0]];                     // one beat only, no takeaway
  bad.beats[0].title = 'No accent here';
  bad.beats[0].widgets = [];
  const scenes = assembleLectureBeats(bad, LEC, MOD);
  const errs = courseChecks(scenes, { lecture: 1, module: 1 });
  assert.ok(errs.some((e) => /needs 2-5 beats \(has 1\)/.test(e)), errs.join('\n'));
  assert.ok(errs.some((e) => /has no widget/.test(e)), errs.join('\n'));
  assert.ok(errs.some((e) => /needs exactly one \*accent\* word/.test(e)), errs.join('\n'));
  assert.ok(errs.some((e) => /needs 6-16 sentences/.test(e)), errs.join('\n'));
  assert.ok(errs.some((e) => /LAST beat needs a takeaway/.test(e)), errs.join('\n'));
});

test('G3: ticks bunched on one line are rejected', () => {
  const bad = structuredClone(GOOD_RAW);
  bad.beats[2].lines[1].cues.push({ on: 'address', do: 'tick', widget: 't', index: 1 });
  bad.beats[2].lines[2].cues = [];
  const errs = courseChecks(assembleLectureBeats(bad, LEC, MOD), { lecture: 1, module: 1 });
  assert.ok(errs.some((e) => /must be spread over sentences/.test(e)), errs.join('\n'));
});

test('normWidget keeps only left/right slots and known fields', () => {
  assert.deepEqual(normWidget({ id: 'c', type: 'code', slot: 'top', title: 't', lines: ['a'], junk: 1 }), { id: 'c', type: 'code', title: 't', lines: ['a'] });
  assert.equal(normWidget({ id: 'c', type: 'code', slot: 'left' }).slot, 'left');
});

test('G2: a lecture that never passes fails loudly, naming the lecture', async () => {
  const bad = { beats: [{ title: 'x', widgets: [], say: ['one line only.'], lines: [{ n: 1, mood: 'calm', cues: [] }] }] };
  await assert.rejects(
    planLecture(OUTLINE, MOD, LEC, { call: async () => structuredClone(bad), attempts: 2 }),
    /lecture 1 "What really happens when you type a URL" failed after 2 attempts/,
  );
});

test('G2: a lecture that passes on retry returns its beats (errors were fed back)', async () => {
  const bad = structuredClone(GOOD_RAW);
  bad.beats.pop(); // forgot the takeaway beat
  const prompts = [];
  const scenes = await planLecture(OUTLINE, MOD, LEC, {
    call: async (prompt) => { prompts.push(prompt); return structuredClone(prompts.length === 1 ? bad : GOOD_RAW); },
    attempts: 2,
  });
  assert.equal(scenes.length, 3);
  assert.match(prompts[1], /LAST beat needs a takeaway/);
});

test('G4: assembleCoursePlan flattens the beats into a render-ready plan', async () => {
  const plan = await assembleCoursePlan(OUTLINE, { call: async () => structuredClone(GOOD_RAW), attempts: 2, log: () => {} });
  assert.equal(plan.style, 'paper');
  assert.deepEqual(plan.voice, OUTLINE.voice);
  assert.deepEqual(plan.course.modules.map((m) => m.title), ['The journey']);
  assert.deepEqual(plan.course.palette, OUTLINE.palette);
  assert.equal(plan.scenes.length, 3);
  assert.equal(plan.scenes[0].badge, '01');
  assert.equal(plan.slug, 'web-message');
});
