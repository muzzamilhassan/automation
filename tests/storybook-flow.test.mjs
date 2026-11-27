import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// STORYBOOK CONTINUOUS FLOW (owner complaint 2026-11-27, Quote Quarry
// old-verses-storybook): "at every paragraph or quote a new scene starts — it
// feels like a new video begins each time; I want background clips the whole
// video". Four parts:
//   1. PACING — short per-beat pad, no 3 s floor, a longer pause only at
//      chapter boundaries (no stop-start narration).
//   2. SHOTS — consecutive beats group into shots (~15-30 s, never across a
//      chapter); the background lives on the shot, not the sentence.
//   3. BROLL AS DATA — doc_presentation.background: 'broll' asks for one
//      video clip per shot (no repeats); per-shot fallback photo -> gradient;
//      a <50% video coverage run warns loudly (never crashes).
//   4. ENGINE — DocV2 draws ONE persistent shot layer (crossfaded) and the
//      family frame once; landscape-quote no longer re-enters per beat.
// ---------------------------------------------------------------------------

import {
  timeBeats, planShots, shotQueriesFor, assignShotClips, storybookBrollGate, docPresentation,
  BEAT_PAD_MS, CHAPTER_PAD_MS, BEAT_FLOOR_MS,
} from '../lib/doc-storybook.mjs';
import { REGISTRY_META } from '../studio/lib/template-registry.data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('pacing — when beats are timed, the narration flows (no stop-start)', () => {
  const beats = [
    { i: 0, layout: 'hero' },
    { i: 1, layout: 'quote', n: 1 },
    { i: 2, layout: 'split', n: 1 },
    { i: 3, layout: 'quote', n: 2 },
    { i: 4, layout: 'end' },
  ];
  const durs = [
    { i: 0, ms: 5000, words: [] },
    { i: 1, ms: 4000, words: [] },
    { i: 2, ms: 600, words: [] },
    { i: 3, ms: 3000, words: [] },
    { i: 4, ms: 2000, words: [] },
  ];
  const { totalMs } = timeBeats(beats, durs, () => null);

  test('the pad between sentences of one chapter is ~150-200 ms', () => {
    assert.ok(BEAT_PAD_MS >= 150 && BEAT_PAD_MS <= 200, `pad ${BEAT_PAD_MS}`);
    assert.equal(beats[1].ms, 4000 + BEAT_PAD_MS, 'same-chapter sentence: spoken + short pad');
  });
  test('the 3 s floor is gone; a short line floors at a reading-time minimum (~1.2 s)', () => {
    assert.equal(BEAT_FLOOR_MS, 1200);
    assert.equal(beats[2].ms, Math.max(600 + CHAPTER_PAD_MS, BEAT_FLOOR_MS), 'last sentence of chapter 1: no 3000 floor');
    assert.ok(beats[2].ms < 3000);
  });
  test('a chapter boundary (hero -> ch1, ch1 -> ch2, last -> end) keeps a longer pause', () => {
    assert.ok(CHAPTER_PAD_MS > BEAT_PAD_MS);
    assert.equal(beats[0].ms, 5000 + CHAPTER_PAD_MS, 'hero -> chapter 1');
    assert.equal(beats[3].ms, 3000 + CHAPTER_PAD_MS, 'chapter 2 -> end');
  });
  test('beats are back to back (no gaps) and totalMs keeps the 1500 tail', () => {
    for (let k = 1; k < beats.length; k++) assert.equal(beats[k].startMs, beats[k - 1].startMs + beats[k - 1].ms);
    assert.equal(totalMs, beats[4].startMs + beats[4].ms + 1500);
  });
  test('a silent short beat still floors at 1.2 s', () => {
    const b = [{ i: 0, layout: 'quote', n: 1 }, { i: 1, layout: 'quote', n: 1 }];
    timeBeats(b, [{ i: 0, ms: 200 }], () => null);
    assert.equal(b[0].ms, BEAT_FLOOR_MS);
  });
});

describe('planShots — the background changes per SHOT, not per sentence', () => {
  // 1 hero (6 s) + chapter 1 = 8 x 4 s sentences + chapter 2 = 3 x 4 s + end
  const mk = () => {
    const beats = [{ i: 0, layout: 'hero', startMs: 800, ms: 6000 }];
    let t = 6800;
    const push = (b) => { b.i = beats.length; b.startMs = t; t += b.ms; beats.push(b); };
    for (let k = 0; k < 8; k++) push({ layout: 'quote', n: 1, chapterTitle: 'The Private Notes', text: 'Marcus wrote at dawn.', ms: 4000 });
    for (let k = 0; k < 3; k++) push({ layout: 'split', n: 2, chapterTitle: 'The Letter', text: 'Seneca wrote at night.', ms: 4000 });
    push({ layout: 'end', ms: 4000 });
    return beats;
  };

  test('when the beats are timed, the hero is its own shot (its hook clip stays its own)', () => {
    const beats = mk();
    const shots = planShots(beats);
    assert.equal(shots[0].beats.length, 1);
    assert.equal(beats[0].shot, 0);
    assert.notEqual(beats[1].shot, 0);
  });
  test('sentences of one chapter share a shot until ~30 s; shots run 15-30 s', () => {
    const beats = mk();
    const shots = planShots(beats);
    const ch1 = shots.filter((s) => s.n === 1);
    assert.equal(ch1.length, 2, '32 s of chapter 1 splits into two balanced shots');
    for (const s of ch1) assert.ok(s.ms >= 15000 && s.ms <= 30000, `shot ${s.k} ${s.ms}ms within 15-30 s`);
  });
  test('a shot never spans two chapters', () => {
    const beats = mk();
    planShots(beats);
    const byShot = new Map();
    for (const b of beats) if (b.layout !== 'end' && b.layout !== 'hero') {
      byShot.set(b.shot, (byShot.get(b.shot) || new Set()).add(b.n));
    }
    for (const ns of byShot.values()) assert.equal(ns.size, 1);
  });
  test('the end card joins the last shot (the footage runs into the outro)', () => {
    const beats = mk();
    planShots(beats);
    assert.equal(beats[beats.length - 1].shot, beats[beats.length - 2].shot);
  });
  test('a chapter divider opens its chapter shot', () => {
    const beats = [
      { i: 0, layout: 'hero', startMs: 0, ms: 5000 },
      { i: 1, layout: 'chapter', n: 1, startMs: 5000, ms: 3500 },
      { i: 2, layout: 'quote', n: 1, startMs: 8500, ms: 4000 },
    ];
    planShots(beats);
    assert.equal(beats[1].shot, beats[2].shot);
    assert.notEqual(beats[0].shot, beats[1].shot);
  });
  test('every beat gets a shot index and shot timing covers its beats', () => {
    const beats = mk();
    const shots = planShots(beats);
    assert.ok(beats.every((b) => Number.isInteger(b.shot)));
    for (const s of shots) {
      const last = beats[s.beats[s.beats.length - 1]];
      assert.equal(s.startMs, beats[s.beats[0]].startMs);
      assert.equal(s.ms, last.startMs + last.ms - s.startMs);
    }
  });
});

describe('doc_presentation.background — broll is template DATA (default-inert)', () => {
  test('when the block declares background, docPresentation carries it', () => {
    assert.equal(docPresentation({ doc_presentation: { background: 'broll' } }, {}).background, 'broll');
  });
  test('absent = no key at all (existing templates byte-identical)', () => {
    assert.equal('background' in docPresentation({ doc_presentation: { brand: 'X' } }, {}), false);
    assert.equal('background' in docPresentation(null, { label: 'Y' }), false);
  });
  test('old-verses-storybook (Quote Quarry) opts in; no other template does', () => {
    assert.equal(REGISTRY_META['old-verses-storybook'].doc_presentation.background, 'broll');
    const others = Object.entries(REGISTRY_META).filter(([id, m]) => id !== 'old-verses-storybook' && m?.doc_presentation?.background);
    assert.deepEqual(others.map(([id]) => id), []);
  });
});

describe('shotQueriesFor — stock queries from the chapter title / sentences', () => {
  test('when a chapter title exists it leads the query; fallbacks get simpler', () => {
    const shot = { k: 1, n: 1, beats: [1] };
    const beats = [{}, { chapterTitle: 'The Private Notes', text: 'Marcus Aurelius wrote to himself at dawn.' }];
    const qs = shotQueriesFor(shot, beats, ['wisdom', 'philosophy'], 1);
    assert.ok(qs.length >= 2);
    assert.match(qs[0], /^The Private Notes/);
    assert.ok(qs.every((q) => q.length <= 60 && q.trim()));
    assert.equal(new Set(qs).size, qs.length, 'no duplicate retries');
  });
  test('when there is no chapter title the sentence keywords lead', () => {
    const shot = { k: 0, n: 1, beats: [0] };
    const qs = shotQueriesFor(shot, [{ text: 'The candle burned beside ancient manuscripts.' }], ['wisdom'], 0);
    assert.match(qs[0], /candle|ancient|manuscripts/i);
  });
});

describe('assignShotClips — one clip per shot, no repeats, fallback per shot', () => {
  const mkShots = () => {
    const beats = [
      { i: 0, layout: 'hero', shot: 0, broll: 'lf-photos/x/hero-broll-display.mp4' },
      { i: 1, layout: 'quote', shot: 1, n: 1, text: 'One.' },
      { i: 2, layout: 'split', shot: 1, n: 1, text: 'Two.', photo: 'lf-photos/x/p-2.jpg' },
      { i: 3, layout: 'quote', shot: 2, n: 2, text: 'Three.' },
      { i: 4, layout: 'end', shot: 2 },
    ];
    const shots = [
      { k: 0, n: undefined, startMs: 0, ms: 8000, beats: [0] },
      { k: 1, n: 1, startMs: 8000, ms: 20000, beats: [1, 2] },
      { k: 2, n: 2, startMs: 28000, ms: 18000, beats: [3, 4] },
    ];
    return { beats, shots };
  };

  test('when every fetch succeeds, every beat of a shot uses that shot clip; urls never repeat', async () => {
    const { beats, shots } = mkShots();
    const calls = [];
    let n = 0;
    const fetchBroll = async (o) => { calls.push(o); n++; return { file: `/pub/lf-photos/x/shot-${n}-display.mp4`, url: `https://v/${n}` }; };
    const used = new Set(['https://v/hero']);
    const r = await assignShotClips({ shots, beats, fetchBroll, used, outPathFor: (s) => `/pub/shot-${s.k}.mp4`, relOf: (f) => f.replace('/pub/', ''), queriesFor: () => ['q'] });
    assert.equal(calls.length, 2, 'the hero shot keeps its own hook clip (no extra fetch)');
    assert.equal(r.withVideo, 3);
    assert.equal(r.total, 3);
    assert.equal(beats[1].broll, beats[2].broll, 'one clip for the whole shot');
    assert.equal(beats[3].broll, beats[4].broll);
    assert.notEqual(beats[1].broll, beats[3].broll);
    assert.ok(calls.every((c) => c.excludeUrls === used), 'the shared exclude set rides every call');
    assert.ok(used.has('https://v/1') && used.has('https://v/2'));
    assert.equal(calls[0].minDurationSec, 20, 'clip length asked = the shot length');
  });
  test('when a query fails the next query is tried; a shot with no clip keeps its photo fallback', async () => {
    const { beats, shots } = mkShots();
    const tried = [];
    const fetchBroll = async (o) => { tried.push(o.query); return null; };
    const r = await assignShotClips({ shots, beats, fetchBroll, used: new Set(), outPathFor: () => '/pub/s.mp4', relOf: (f) => f, queriesFor: () => ['a', 'b'] });
    assert.deepEqual(tried, ['a', 'b', 'a', 'b']);
    assert.equal(r.withVideo, 1, 'only the hero clip');
    assert.equal(beats[1].broll, undefined);
    assert.equal(beats[2].photo, 'lf-photos/x/p-2.jpg', 'the photo stays — the render pans it (fallback 1)');
  });
  test('a throwing fetch never crashes the run', async () => {
    const { beats, shots } = mkShots();
    const r = await assignShotClips({ shots, beats, fetchBroll: async () => { throw new Error('boom'); }, used: new Set(), outPathFor: () => 'x', relOf: (f) => f, queriesFor: () => ['a'] });
    assert.equal(r.withVideo, 1);
  });
});

describe('storybookBrollGate — <50% video coverage on a broll template warns loudly, never crashes', () => {
  test('>= half the shots with video = ok', () => {
    assert.equal(storybookBrollGate(4, 2).ok, true);
    assert.equal(storybookBrollGate(4, 4).ok, true);
  });
  test('< half = not ok with a loud reason (the caller warns, it does not throw)', () => {
    const g = storybookBrollGate(5, 2);
    assert.equal(g.ok, false);
    assert.match(g.reason, /2\/5 shots/);
  });
  test('no shots = ok (degenerate)', () => {
    assert.equal(storybookBrollGate(0, 0).ok, true);
  });
});

describe('ENGINE pins — one persistent background layer, frame drawn once', () => {
  const DOCV2 = read('explainer/remotion/longscenes2.tsx');
  const LQ = read('explainer/remotion/families/landscapeQuote.tsx');
  const DEEP = read('yt-deepdive.mjs');

  test('DocV2 no longer mounts a backdrop inside the per-beat Sequence', () => {
    const beatLoop = DOCV2.slice(DOCV2.indexOf('doc.beats.map((b: V2Beat, i: number)'), DOCV2.indexOf('doc.beats.filter((b: V2Beat) => b.audio)'));
    assert.ok(beatLoop.length > 0);
    assert.ok(!/BeatBackdrop/.test(beatLoop), 'no per-beat backdrop');
  });
  test('DocV2 renders a shot layer (crossfaded) and the family frame once', () => {
    assert.match(DOCV2, /<ShotLayer /);
    assert.match(DOCV2, /SHOT_XFADE_SEC/);
    assert.match(DOCV2, /fam\?\.Frame/);
  });
  test('landscape-quote: scenes draw neither the backdrop nor the letterbox (no per-beat re-entry)', () => {
    const scenes = LQ.slice(LQ.indexOf('const PanScene'), LQ.indexOf('export const landscapeQuote'));
    assert.ok(!/<Backdrop|<BeatBackdrop|<Letterbox/.test(scenes));
    assert.match(LQ, /Backdrop: ShotBackdrop/);
    assert.match(LQ, /Frame: /);
  });
  test('captions gate: the burnt-in karaoke renders unless captions === false (absent = on)', () => {
    assert.match(DOCV2, /const showCaptions = input\?\.captions !== false && doc\?\.captions !== false;/);
    assert.match(DOCV2, /\{showCaptions && b\.words && b\.words\.length \? <Captions b=\{b\} \/> : null\}/);
  });
  test('landscape-quote pans per SHOT with a varying seed', () => {
    assert.match(LQ, /seed=\{seed\}/);
  });
  test('yt-deepdive: broll templates fetch one clip per shot with BOTH keys, then warn on low coverage', () => {
    assert.match(DEEP, /pres\.background === 'broll'/);
    assert.match(DEEP, /assignShotClips\(/);
    assert.match(DEEP, /pixabayKey: process\.env\.PIXABAY_API_KEY/);
    assert.match(DEEP, /storybookBrollGate\(/);
    assert.match(DEEP, /planShots\(beats\)/);
  });
});
