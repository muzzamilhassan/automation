// P2 QA rows 1-3 of docs/qa/market-files-p2-qa.md — the script schema gate
// (R3/R4), the beat builder (R5), and the voice grouping contract (R6).
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMarketScript, buildMarketBeats, voiceGroups, SCRIPT_LAYOUTS, SCENE_LOCATIONS, SCENE_MOODS, ALLOWED_VOICES } from '../lib/market-script.mjs';

// a minimal VALID script (the sidecar's shaper emits this shape)
const good = {
  version: '1.0.0',
  script_id: 'the-november-crash',
  topic: 'Why the stock market just crashed',
  voices: { narrator: 'en-US-AndrewNeural', dialogue: 'en-US-EmmaNeural' },
  beats: [
    { layout: 'hero', text: 'On Thursday, Nvidia lost more than $400 billion in a single morning.', scene: { day: 'THURSDAY', mood: 'crash', time: '9:54 AM ET' } },
    { layout: 'chapter', text: 'The cracks', scene: { mood: 'crash' } },
    { layout: 'split', text: 'If you own a plain index fund, you own a lot of Nvidia.' },
    { layout: 'quote', text: "I'm diversified. 500 companies.", dialogue: { speaker: 'Investor' } },
    { layout: 'stat', text: 'The Nasdaq needed just six minutes.', big: '-4%', label: 'six minutes to give back the rally', scene: { time: '10:35 AM ET', day: 'THURSDAY', mood: 'crash' } },
    { layout: 'process', text: 'Four cracks in the story.', lines: ['The money goes in a circle', 'The chips are the collateral', 'Three buyers', 'The plug'] },
    { layout: 'timeline', text: 'Thursday, minute by minute.', ticks: ['9:30 The bell', '10:35 Down 4%', '4:00 Closing bell'], scene: { time: '11:17 AM ET' } },
    { layout: 'end', text: 'Follow for more stories.' },
  ],
};

test('R3a: a valid script passes the gate', () => {
  const v = validateMarketScript(good);
  assert.equal(v.ok, true, JSON.stringify(v.errors));
});

test('R3b: bad layout, off-pool voice, missing speaker, empty text all fail with NAMED errors', () => {
  const bad = JSON.parse(JSON.stringify(good));
  bad.beats[2].layout = 'map'; // family doesn't cover map in P1
  bad.voices.dialogue = 'en-US-KokoroNeural';
  bad.beats[3].dialogue = { speaker: '' };
  bad.beats[7].text = '  ';
  const v = validateMarketScript(bad);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => /layout "map"/.test(e)), JSON.stringify(v.errors));
  assert.ok(v.errors.some((e) => /dialogue voice/.test(e)));
  assert.ok(v.errors.some((e) => /speaker/.test(e)));
  assert.ok(v.errors.some((e) => /beat 7/.test(e)));
});

test('R3c: structural rules — hero first, end last, enums, stat.big, timeline.ticks, process.lines', () => {
  const s = JSON.parse(JSON.stringify(good));
  s.beats[0].layout = 'split';
  let v = validateMarketScript(s);
  assert.ok(v.errors.some((e) => /first beat/.test(e)));
  s.beats[0].layout = 'hero';
  s.beats[7].layout = 'quote';
  v = validateMarketScript(s);
  assert.ok(v.errors.some((e) => /last beat/.test(e)));
  s.beats[7].layout = 'end';
  s.beats[4].big = '';
  v = validateMarketScript(s);
  assert.ok(v.errors.some((e) => /beat 4.*needs a big/.test(e)), JSON.stringify(v.errors));
  s.beats[4].big = '-4%';
  s.beats[6].ticks = [];
  v = validateMarketScript(s);
  assert.ok(v.errors.some((e) => /beat 6.*needs 1-6 ticks/.test(e)), JSON.stringify(v.errors));
  s.beats[6].ticks = ['9:30'];
  s.beats[5].lines = ['only one'];
  v = validateMarketScript(s);
  assert.ok(v.errors.some((e) => /beat 5.*needs 2-6 lines/.test(e)), JSON.stringify(v.errors));
  s.beats[5].lines = ['a', 'b', 'c', 'd'];
  s.beats[2].scene = { location: 'kitchen', mood: 'ecstatic' };
  v = validateMarketScript(s);
  assert.ok(v.errors.some((e) => /location "kitchen"/.test(e)) && v.errors.some((e) => /mood "ecstatic"/.test(e)));
});

test('R5: buildMarketBeats maps deterministically with per-beat voice', () => {
  const b1 = buildMarketBeats(good);
  const b2 = buildMarketBeats(good);
  assert.deepEqual(b1, b2, 'same script → same beats, always');
  assert.equal(b1.length, good.beats.length);
  b1.forEach((b, i) => assert.equal(b.i, i, 'sequential beat indices'));
  assert.equal(b1[0].voice, 'en-US-AndrewNeural', 'narration beats take the narrator voice');
  assert.equal(b1[3].voice, 'en-US-EmmaNeural', 'dialogue beats take the dialogue voice');
  assert.deepEqual(b1[0].scene, { day: 'THURSDAY', mood: 'crash', time: '9:54 AM ET' }, 'scene directions ride through verbatim');
  assert.equal(b1[3].headline, "I'm diversified. 500 companies.", 'the spoken line doubles as the display headline');
  assert.deepEqual(b1[6].ticks, ['9:30 The bell', '10:35 Down 4%', '4:00 Closing bell']);
  assert.equal(b1[5].lines.length, 4);
  assert.equal(b1[4].big, '-4%');
});

test('R5b: a dialogue line wins over an empty text (the spoken line is the text)', () => {
  const s = JSON.parse(JSON.stringify(good));
  delete s.beats[3].text;
  s.beats[3].dialogue = { speaker: 'Trader', line: 'Buy the dip?' };
  const v = validateMarketScript(s);
  assert.equal(v.ok, true, JSON.stringify(v.errors));
  const b = buildMarketBeats(s);
  assert.equal(b[3].text, 'Buy the dip?');
  assert.equal(b[3].dialogue.speaker, 'Trader');
});

test('R6: voiceGroups groups every beat exactly once by its voice', () => {
  const beats = buildMarketBeats(good);
  const g = voiceGroups(beats);
  assert.deepEqual(g['en-US-AndrewNeural'], [0, 1, 2, 4, 5, 6, 7]);
  assert.deepEqual(g['en-US-EmmaNeural'], [3]);
  const all = Object.values(g).flat().sort((a, b) => a - b);
  assert.deepEqual(all, beats.map((_, i) => i), 'every index appears exactly once');
});

test('R4: enums match the P1 family vocabulary', () => {
  assert.deepEqual(SCRIPT_LAYOUTS, ['hero', 'chapter', 'split', 'stat', 'quote', 'process', 'timeline', 'end']);
  assert.deepEqual(SCENE_LOCATIONS, ['trading', 'office', 'datacenter', 'stage']);
  assert.deepEqual(SCENE_MOODS, ['calm', 'party', 'crash', 'night', 'data']);
  assert.ok(ALLOWED_VOICES.includes('en-US-AndrewNeural') && ALLOWED_VOICES.length >= 4);
});
