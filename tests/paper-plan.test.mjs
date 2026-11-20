// Doc-lane paper planner (docs/qa/course-template-c1b-refine-qa.md R6): approved
// chapter sentences -> lesson beats, words verbatim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paperChapterPrompt, assemblePaperChapter, paperSceneErrors, repairPaperScenes, planPaper } from '../lib/paper-plan.mjs';

const SK = {
  key: 'ch1', title: 'The rent trap',
  sentences: ['Your paycheck lands on Friday.', 'Rent takes the biggest bite.', 'Then food, then fun.', 'Savings get the crumbs.'],
};
const RAW = {
  beats: [
    { title: 'Where the *money* goes', from: 1, to: 2, widgets: [{ id: 'b', type: 'boxes', cells: ['', '', ''], labels: ['pay', 'rent', 'save'] }],
      lines: [{ n: 1, mood: 'calm', cues: [{ on: 'paycheck', do: 'fill', widget: 'b', index: 0, value: '$3,200', tone: 'good' }] },
              { n: 2, mood: 'tense', cues: [{ on: 'Rent', do: 'fill', widget: 'b', index: 1, value: '$1,400', tone: 'bad' }] }] },
    { title: 'Savings come *last*', from: 3, to: 4, widgets: [{ id: 's', type: 'stepper', label: 'left', value: 1800 }],
      lines: [{ n: 3, mood: 'calm', cues: [{ on: 'food', do: 'step', widget: 's', step: 600, text: '1800 - 1200' }] },
              { n: 4, mood: 'sad', pauseMs: 500, cues: [{ on: 'crumbs', do: 'stamp', text: 'SAVINGS *LAST*' }] }] },
  ],
};

test('prompt carries numbered approved sentences, beat rules and the widget vocabulary', () => {
  const p = paperChapterPrompt(SK, { index: 0, total: 3, brand: 'MR', niche: 'money' });
  assert.match(p, /1\. Your paycheck lands on Friday\./);
  assert.match(p, /4\. Savings get the crumbs\./);
  assert.match(p, /CONSECUTIVE sentences/);
  assert.match(p, /boxes .* stepper .* code/s);
  assert.match(p, /never rewrite it/);
});

test('assemblePaperChapter: beats cover the approved sentences verbatim; badge on beat 1; chapter = module', () => {
  const { scenes, errors } = assemblePaperChapter(SK, structuredClone(RAW), { chapter: 3 });
  assert.deepEqual(errors, []);
  assert.equal(scenes.length, 2);
  assert.deepEqual(scenes.flatMap((s) => s.lines.map((l) => l.say)), SK.sentences);
  assert.equal(scenes[0].badge, '03');
  assert.equal(scenes[1].badge, undefined);
  assert.ok(scenes.every((s) => s.module === 3));
  assert.equal(scenes[1].lines[1].pauseMs, 500);
  assert.deepEqual(paperSceneErrors(scenes), []);
});

test('assemblePaperChapter: gaps, overlaps and short coverage are named', () => {
  const gap = structuredClone(RAW); gap.beats[1].from = 4;
  assert.match(assemblePaperChapter(SK, gap).errors[0], /continuing at 3/);
  const short = structuredClone(RAW); short.beats[1].to = 3;
  assert.match(assemblePaperChapter(SK, short).errors[0], /cover every sentence once/);
  assert.match(assemblePaperChapter(SK, { beats: [] }).errors[0], /no beats/);
});

test('paperSceneErrors: missing widget, missing cue, missing accent, unspoken anchor', () => {
  const bad = structuredClone(RAW);
  bad.beats[0].widgets = [];
  bad.beats[0].lines = [];
  bad.beats[1].title = 'Savings come last';
  bad.beats[1].lines[1].cues = [{ on: 'pizza', do: 'stamp', text: 'X' }];
  const { scenes } = assemblePaperChapter(SK, bad);
  const errs = paperSceneErrors(scenes);
  assert.ok(errs.some((e) => /beat 1 .* has no widget/.test(e)), errs.join('\n'));
  assert.ok(errs.some((e) => /beat 1 has no cue/.test(e)), errs.join('\n'));
  assert.ok(errs.some((e) => /needs exactly one \*accent\*/.test(e)), errs.join('\n'));
  assert.ok(errs.some((e) => /anchor "pizza" is not a word/.test(e)), errs.join('\n'));
});

test('repairPaperScenes drops only the broken cue', () => {
  const bad = structuredClone(RAW);
  bad.beats[1].lines[1].cues.push({ on: 'pizza', do: 'stamp', text: 'X' });
  const { scenes } = assemblePaperChapter(SK, bad);
  const fixed = repairPaperScenes(scenes);
  assert.deepEqual(paperSceneErrors(fixed), []);
  assert.deepEqual(fixed[1].lines[1].cues.map((c) => c.on), ['crumbs']);
});

test('planPaper: re-asks a chapter with its errors, flattens beats, chapters become modules', async () => {
  const prompts = [];
  const bad = structuredClone(RAW); bad.beats[1].from = 4;
  const plan = await planPaper([SK, { ...SK, title: 'Flip the order' }], {
    call: async (p) => { prompts.push(p); return structuredClone(prompts.length === 1 ? bad : RAW); },
  });
  assert.equal(plan.scenes.length, 4);
  assert.deepEqual(plan.course.modules, [{ n: 1, title: 'The rent trap' }, { n: 2, title: 'Flip the order' }]);
  assert.match(prompts[1], /continuing at 3/);
  assert.equal(plan.scenes[2].badge, '02');
});

test('planPaper: a chapter that never validates throws (the lane falls back to storybook)', async () => {
  await assert.rejects(planPaper([SK], { call: async () => ({ beats: [] }), attempts: 2 }), /chapter 1 \("The rent trap"\) failed after 2 attempts/);
});
