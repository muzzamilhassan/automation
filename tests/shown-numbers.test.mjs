// docs/qa/facts-first-qa.md F7 — a number on screen must be in the narration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { numbersIn, saidNumbers, numbersSaid, groundScene } from '../lib/shown-numbers.mjs';
import { planDiagram } from '../lib/diagram-plan.mjs';

const has = (t, n) => assert.ok(numbersIn(t).has(n), `${t} -> ${n}: ${[...numbersIn(t)]}`);

test('numbers are read written and spelled out', () => {
  has('seven hundred million people', 700000000);
  has('about four hundred and fifteen terawatt hours', 415);
  has('nine hundred and forty-five', 945);
  has('zero point two four watt hours', 0.24);
  has('one hundred thousand households', 100000);
  has('In twenty thirty', 2030);
  has('September twenty twenty-five', 2025);
  has('around one and a half percent', 1.5);
  has('two million homes', 2000000);
  has('$1.5 billion', 1500000000);
  has('100,000 homes', 100000);
  has('a thousand chips', 1000);
  assert.equal(numbersIn('nothing here').size, 0);
});

const SAID = saidNumbers('It uses zero point two four watt hours. That is one building, and two million homes. About 415 terawatt hours.');
test('the mistakes of the 2026-11-25 test video are refused; the real numbers pass', () => {
  for (const bad of ['$1', '$10mo', '$3.2M', '12%']) assert.equal(numbersSaid(bad, SAID), false, bad);
  for (const ok of ['0.24 Wh', '2M Homes', '2,000,000', '415 TWh', '$0', 'no number']) assert.equal(numbersSaid(ok, SAID), true, ok);
});

test('money and percentages on screen must be money and percentages in the words', () => {
  const said = saidNumbers('It costs ten dollars, or $1.5 billion a year, up fifteen percent. Five people agreed.');
  for (const ok of ['$10', '$1.5B', '15%', '5']) assert.equal(numbersSaid(ok, said), true, ok);
  for (const bad of ['$5', '10%', '$15']) assert.equal(numbersSaid(bad, said), false, bad);
});

const scene = () => ({
  layout: 'flow',
  nodes: [{ id: 'meter', kind: 'bucket', label: 'Meter', rank: 0, value: '$1' }, { id: 'dc', kind: 'building', label: 'Data Center 900MW', rank: 1 }, { id: 'homes', kind: 'home', label: '2M Homes', rank: 2 }],
  edges: [{ id: 'a', from: 'meter', to: 'dc' }, { id: 'b', from: 'dc', to: 'homes' }],
  lines: [
    { say: 'That is one building, and two million homes.', cues: [
      { on: 'building', do: 'counter', node: 'dc', from: 0, to: 2000000, suffix: ' kWh' },
      { on: 'homes', do: 'counter', node: 'homes', from: 0, to: 2000000, suffix: ' homes' },
      { on: 'one', do: 'stamp', text: '*$10* a month' },
      { on: 'two', do: 'flow', edge: 'b', label: 'Power' },
    ] },
  ],
});

test('groundScene removes unsaid values, labels, counters and stamps, and keeps the said ones', () => {
  const { scene: s, fixes } = groundScene(scene(), scene().lines[0].say);
  assert.equal(s.nodes[0].value, undefined);
  assert.equal(s.nodes[1].label, 'Data Center');
  assert.equal(s.nodes[2].label, '2M Homes');
  assert.deepEqual(s.lines[0].cues.map((c) => c.do + (c.node || c.edge || '')), ['counterhomes', 'flowb'], 'a wrong unit is removed even when the number was said');
  assert.equal(fixes.length, 4, fixes.join(' | '));
});

test('planDiagram applies it to what the planner answers', async () => {
  const raw = scene();
  raw.lines = raw.lines.map((l, i) => ({ n: i + 1, mood: 'calm', cues: l.cues }));
  raw.lines[0].cues.push({ on: 'That', do: 'appear', node: 'meter' });
  const plan = await planDiagram([{ key: 'ch1', title: 'A building', sentences: ['That is one building, and two million homes.'] }], { call: async () => structuredClone(raw), log: () => {} });
  assert.doesNotMatch(JSON.stringify(plan), /kWh|\$10|\$1"|900MW/);
  assert.match(JSON.stringify(plan), /2000000/);
});

test('the renderer keeps a counter’s decimals', () => {
  const src = fs.readFileSync(new URL('../explainer/remotion/diagram/LivingDiagram.tsx', import.meta.url), 'utf8');
  assert.match(src, /maximumFractionDigits: dec/);
  assert.doesNotMatch(src, /Math\.round\(v\)\.toLocaleString/);
});
