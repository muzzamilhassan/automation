// Living Diagram planner (docs/qa/living-diagram-demo-qa.md R1-R3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normWord, findAnchor, validatePlan, layoutScene, resolvePlan, SAFE } from '../lib/diagram-cues.mjs';

const W = (list) => list.map(([w, t0, t1]) => ({ w, t0, t1 }));

test('normWord strips case, punctuation, $ and thousands commas', () => {
  assert.equal(normWord('Rent,'), 'rent');
  assert.equal(normWord('$3,200'), '3200');
  assert.equal(normWord("It's"), 'its');
  assert.equal(normWord('10%'), '10');
});

test('findAnchor returns the nth occurrence of a word (R1)', () => {
  const words = W([['The', 0, 100], ['rent', 100, 300], ['and', 300, 400], ['rent.', 400, 700]]);
  assert.equal(findAnchor(words, 'rent'), 1);
  assert.equal(findAnchor(words, 'rent', 2), 3);
  assert.equal(findAnchor(words, 'Rent', 3), -1);
  assert.equal(findAnchor(words, 'bills'), -1);
});

test('findAnchor matches multi-word anchors as a phrase', () => {
  const words = W([['pay', 0, 1], ['yourself', 1, 2], ['first', 2, 3], ['now', 3, 4]]);
  assert.equal(findAnchor(words, 'yourself first'), 1);
  assert.equal(findAnchor(words, 'first yourself'), -1);
});

const plan = () => ({
  scenes: [{
    title: 'One',
    nodes: [{ id: 'pay', kind: 'cash', label: 'Paycheck', rank: 0 }, { id: 'chk', kind: 'bank', label: 'Checking', rank: 1 }],
    edges: [{ id: 'e1', from: 'pay', to: 'chk' }],
    lines: [{ say: 'Your paycheck lands in checking.', cues: [
      { on: 'paycheck', do: 'appear', node: 'pay' },
      { on: 'checking', do: 'appear', node: 'chk' },
      { on: 'lands', do: 'flow', edge: 'e1' },
    ] }],
  }],
});

test('validatePlan accepts a well-formed plan', () => {
  assert.deepEqual(validatePlan(plan()), []);
});

test('validatePlan names unknown node, edge, verb and missing fields (R2)', () => {
  const p = plan();
  p.scenes[0].lines[0].cues.push(
    { on: 'paycheck', do: 'appear', node: 'ghost' },
    { on: 'paycheck', do: 'flow', edge: 'nope' },
    { on: 'paycheck', do: 'explode', node: 'pay' },
    { on: 'paycheck', do: 'counter', node: 'pay' },
    { do: 'appear', node: 'pay' },
  );
  const errs = validatePlan(p);
  assert.equal(errs.length, 5, errs.join('\n'));
  assert.match(errs[0], /scene 1 line 1 cue 4.*unknown node "ghost"/);
  assert.match(errs[1], /unknown edge "nope"/);
  assert.match(errs[2], /unknown verb "explode"/);
  assert.match(errs[3], /counter needs "to"/);
  assert.match(errs[4], /missing "on"/);
});

test('validatePlan rejects edges between nodes not in the scene and duplicate ids', () => {
  const p = plan();
  p.scenes[0].edges.push({ id: 'e2', from: 'pay', to: 'zzz' });
  p.scenes[0].nodes.push({ id: 'pay', kind: 'cash', label: 'Again', rank: 2 });
  const errs = validatePlan(p);
  assert.ok(errs.some((e) => /edge "e2".*unknown node "zzz"/.test(e)), errs.join('\n'));
  assert.ok(errs.some((e) => /duplicate node id "pay"/.test(e)), errs.join('\n'));
});

test('layoutScene: inside the safe area, no overlap, deterministic (R3)', () => {
  const scene = { nodes: [
    { id: 'a', rank: 0 }, { id: 'b', rank: 1 }, { id: 'c', rank: 2 }, { id: 'd', rank: 2 }, { id: 'e', rank: 2 }, { id: 'f', rank: 2 },
  ] };
  const L1 = layoutScene(scene);
  const L2 = layoutScene(scene);
  assert.deepEqual(L1, L2);
  const pts = Object.values(L1);
  for (const p of pts) {
    assert.ok(p.x >= SAFE.x0 && p.x <= SAFE.x1 && p.y >= SAFE.y0 && p.y <= SAFE.y1, JSON.stringify(p));
  }
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
    assert.ok(d >= SAFE.minGap, `nodes ${i},${j} too close: ${d}`);
  }
  // ranks go left -> right
  assert.ok(L1.a.x < L1.b.x && L1.b.x < L1.c.x);
  // rows keep plan order top -> bottom
  assert.ok(L1.c.y < L1.d.y && L1.d.y < L1.e.y && L1.e.y < L1.f.y);
});

test('resolvePlan turns anchors into absolute ms and reports unspoken anchors (R1, R2)', () => {
  const p = plan();
  const lines = [{ startMs: 1000, words: W([['Your', 0, 200], ['paycheck', 200, 600], ['lands', 600, 900], ['in', 900, 1000], ['checking.', 1000, 1500]]) }];
  const out = resolvePlan(p, lines);
  assert.deepEqual(out.errors, []);
  assert.deepEqual(out.cues.map((c) => [c.do, c.t]), [['appear', 1200], ['flow', 1600], ['appear', 2000]]);
  assert.ok(out.scenes[0].layout.pay && out.scenes[0].layout.chk);

  p.scenes[0].lines[0].cues.push({ on: 'savings', do: 'appear', node: 'pay' });
  const bad = resolvePlan(p, lines);
  assert.equal(bad.errors.length, 1);
  assert.match(bad.errors[0], /scene 1 line 1 cue 4: anchor "savings" is not spoken/);
});

test('v2 verbs: title, card, hide, badge validate their fields', () => {
  const p = plan();
  p.scenes[0].lines[0].cues = [
    { on: 'paycheck', do: 'title', text: 'HTTP forgets *every* request' },
    { on: 'paycheck', do: 'card', card: 'c1', title: '429', lines: ['Too Many Requests'] },
    { on: 'lands', do: 'hide', card: 'c1' },
    { on: 'lands', do: 'badge', node: 'pay', text: '✓', tone: 'good' },
  ];
  assert.deepEqual(validatePlan(p), []);
  p.scenes[0].lines[0].cues.push(
    { on: 'lands', do: 'card', title: 'x' },
    { on: 'lands', do: 'hide', card: 'never-shown' },
    { on: 'lands', do: 'card', card: 'c2', title: 'x', side: 'middle' },
  );
  const errs = validatePlan(p);
  assert.equal(errs.length, 3, errs.join('\n'));
  assert.match(errs[0], /card needs "card"/);
  assert.match(errs[1], /hide: unknown card "never-shown"/);
  assert.match(errs[2], /side must be left\|right\|bottom/);
});

test('hub layout: first node centred, the rest on a ring, no overlap, rank optional', () => {
  const scene = { layout: 'hub', nodes: [{ id: 'api' }, { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }, { id: 'f' }] };
  const L = layoutScene(scene);
  assert.ok(Math.abs(L.api.x - 960) < 2 && Math.abs(L.api.y - (SAFE.y0 + SAFE.y1) / 2) < 2, JSON.stringify(L.api));
  const pts = Object.values(L);
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    assert.ok(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) >= SAFE.minGap, `${i},${j}`);
  }
  for (const p of pts) assert.ok(p.x >= SAFE.x0 && p.x <= SAFE.x1 && p.y >= SAFE.y0 && p.y <= SAFE.y1, JSON.stringify(p));
  assert.deepEqual(validatePlan({ scenes: [{ layout: 'hub', nodes: scene.nodes, edges: [], lines: [{ say: 'x', cues: [] }] }] }), []);
});

test('line pauses and moods pass through validation; bad mood is named', () => {
  const p = plan();
  p.scenes[0].lines[0].mood = 'excited';
  p.scenes[0].lines[0].pauseMs = 900;
  assert.deepEqual(validatePlan(p), []);
  p.scenes[0].lines[0].mood = 'furious';
  assert.match(validatePlan(p)[0], /mood must be one of/);
});

test('resolvePlan supports a ms offset after the anchor word', () => {
  const p = plan();
  p.scenes[0].lines[0].cues = [{ on: 'lands', do: 'flow', edge: 'e1', afterMs: 250 }];
  const lines = [{ startMs: 0, words: W([['Your', 0, 200], ['paycheck', 200, 600], ['lands', 600, 900]]) }];
  assert.equal(resolvePlan(p, lines).cues[0].t, 850);
});
