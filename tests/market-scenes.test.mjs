// QA rows 1+2 of docs/qa/market-files-p1-qa.md — the deterministic core of
// the market-files family (R3 mood/location derivation, R7 fictional
// tickers). The React scenes ride on this exact module.
import test from 'node:test';
import assert from 'node:assert/strict';
import { moodFor, moodForBeat, locationFor, sceneForBeat, tickersFor, TICKER_POOL, SETS, MOODS } from '../lib/market-scenes.mjs';

test('R3a: moodFor is deterministic and crash keywords win', () => {
  assert.equal(moodFor('Why the stock market just crashed'), 'crash');
  assert.equal(moodFor('Nvidia dropped 9% and $400 billion vanished'), 'crash');
  assert.equal(moodFor('Traders celebrate the biggest rally of the year'), 'party');
  assert.equal(moodFor('Nobody was sleeping the night before'), 'night');
  assert.equal(moodFor('600,000 chips are stuck in a data center'), 'data');
  assert.equal(moodFor('A plain index fund owns a lot of everything'), 'calm');
  assert.equal(moodFor(''), 'calm');
  // substring traps: "plain" must never read as "ai"; "downstairs" is not "down"
  assert.equal(moodFor('the plain truth about funds'), 'calm');
  assert.equal(moodFor('she went downstairs to check'), 'calm');
  assert.equal(moodFor('the power of compounding'), 'data'); // whole word still matches
  // crash outranks party when both appear (threat reads first)
  assert.equal(moodFor('record high before the crash'), 'crash');
  // same input twice → same output (no randomness)
  assert.equal(moodFor('the crash of 1929'), moodFor('the crash of 1929'));
});

test('R3b: explicit beat scene.mood wins over keyword derivation', () => {
  assert.equal(moodForBeat({ headline: 'the crash', scene: { mood: 'party' } }), 'party');
  // an unknown hint falls back to derivation, never a crash of the renderer
  assert.equal(moodForBeat({ headline: 'the crash', scene: { mood: 'nope' } }), 'crash');
  assert.equal(moodForBeat({ headline: 'the crash' }), 'crash');
});

test('R3c: locationFor rotates per beat index and honors built-set hints', () => {
  assert.equal(locationFor('split', 0), 'office');
  assert.equal(locationFor('split', 1), 'datacenter');
  assert.equal(locationFor('split', 4), 'office'); // wraps
  assert.equal(locationFor('stat', 7), 'trading'); // fixed-set layouts stay put
  assert.equal(locationFor('split', 9, 'stage'), 'stage'); // hint wins
  assert.equal(locationFor('split', 9, 'kitchen'), 'datacenter'); // unbuilt hint ignored
  for (const layout of ['hero', 'chapter', 'split', 'stat', 'quote', 'process', 'timeline', 'end']) {
    assert.ok(SETS.includes(locationFor(layout, 3)));
  }
});

test('R3d: sceneForBeat composes mood+location+chip fields deterministically', () => {
  const b = { layout: 'timeline', i: 2, headline: 'The bell rings and everything falls', scene: { time: '10:35 AM ET', day: 'THURSDAY' } };
  const s1 = sceneForBeat(b);
  const s2 = sceneForBeat(b);
  assert.deepEqual(s1, s2);
  assert.equal(s1.mood, 'crash');
  assert.equal(s1.location, 'trading');
  assert.equal(s1.time, '10:35 AM ET');
  assert.equal(s1.day, 'THURSDAY');
  assert.equal(sceneForBeat({ layout: 'hero', i: 0 }).day, null); // no directions → nulls, never undefined soup
});

test('R7: tickersFor draws only from the fictional pool, deterministic per seed', () => {
  for (let seed = 0; seed < 200; seed++) {
    const rows = tickersFor(seed, 6);
    assert.equal(rows.length, 6);
    for (const r of rows) {
      assert.ok(TICKER_POOL.includes(r.name), `${r.name} is not fictional`);
      assert.ok(parseFloat(r.price) >= 12 && parseFloat(r.price) <= 172);
      assert.ok(['up', 'down'].includes(r.dir));
    }
    // no duplicates within one wall
    assert.equal(new Set(rows.map((r) => r.name)).size, 6);
  }
  assert.deepEqual(tickersFor(42, 6), tickersFor(42, 6)); // same seed → same wall
  assert.deepEqual(tickersFor(42, 99).length, TICKER_POOL.length); // clamped to pool size
});

test('R5: all five mood palettes exist with the fields the kit needs', () => {
  for (const m of ['calm', 'party', 'crash', 'night', 'data']) {
    const p = MOODS[m];
    assert.ok(p.room.length === 2 && p.boardBg.length === 2);
    assert.ok(p.ink && p.accent && p.chip && p.chipText && p.boardText);
  }
});
