import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// STORYBOOK doc lane (spec docs/superpowers/specs/2026-11-04-storybook-doc-lane-spec.md)
// — the doc lane's storybook visual layer. Three layers, the doc-visual-layer
// pattern:
//   1. PURE — lib/doc-storybook.mjs: the DATA read (doc_render), the
//      presentation merge, the beat plan (hero / divider+splits / end), the
//      make-longform pacing, the fail-closed photo gate, the SRT builder.
//   2. SOURCE PINS — yt-deepdive.mjs threads it: the branch fires on the
//      ASSIGNED template's own DATA before any legacy visual work, TTS is ONE
//      edge_batch call with a real Edge voice (never narrate.py's per-call
//      Kokoro reload + estimated word timings), the photo gate THROWS before
//      the render, and BOTH visual layers end in the ONE shared shipEpisode.
//   3. ENGINE PINS — DocV2 (longscenes2.tsx) gains ONLY default-inert
//      furniture (badge override + circle, per-part dashes): docs without the
//      fields render byte-identically.
// ---------------------------------------------------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DEEPDIVE = fs.readFileSync(path.join(ROOT, 'yt-deepdive.mjs'), 'utf8');
const SRC_DOCV2 = fs.readFileSync(path.join(ROOT, 'explainer', 'remotion', 'longscenes2.tsx'), 'utf8');

import { docRenderOf, docPresentation, edgeVoiceFor, sentences, buildStorybookBeats, timeBeats, buildStorybookDoc, storybookPhotoGate, photoQueryFor, srtFromBeats, planStoryDirectives, planEntityDirectives } from '../lib/doc-storybook.mjs';
import { parseSrt } from '../lib/srt.mjs';
import { REGISTRY_META } from '../studio/lib/template-registry.data.js';

describe('SB-1/SB-3 — docRenderOf reads the ASSIGNED template DATA only', () => {
  test("story_structure.doc_render === 'storybook' fires the lane", () => {
    assert.equal(docRenderOf({ story_structure: { doc_render: 'storybook' } }), 'storybook');
  });
  test('missing / other values / junk shapes = null (the legacy b-roll lane)', () => {
    assert.equal(docRenderOf({ story_structure: {} }), null);
    assert.equal(docRenderOf({ story_structure: { doc_render: 'broll' } }), null);
    assert.equal(docRenderOf({}), null);
    assert.equal(docRenderOf(null), null);
    assert.equal(docRenderOf('x'), null);
    assert.equal(docRenderOf([1]), null);
    assert.equal(docRenderOf({ story_structure: [] }), null);
  });
  test('the real pilot entry declares it (registry DATA, never code)', () => {
    assert.equal(docRenderOf(REGISTRY_META['red-flags-explained']), 'storybook');
  });
});

describe('SB-2 — docPresentation: template block wins, kit falls back, initials derive', () => {
  const kit = { label: 'THE MONEY RULEBOOK', eyebrow: 'MONEY RULES // THE MONEY RULEBOOK' };
  test('the doc_presentation block carries the reference strings verbatim', () => {
    assert.deepEqual(
      docPresentation({ doc_presentation: { brand: 'MONEY RULEBOOK', eyebrow: 'BUSINESS STORIES // MR', badge: 'MR' } }, kit),
      { brand: 'MONEY RULEBOOK', eyebrow: 'BUSINESS STORIES // MR', badge: 'MR' },
    );
  });
  test('no block: kit label/eyebrow + derived initials', () => {
    assert.deepEqual(docPresentation(null, kit), { brand: 'THE MONEY RULEBOOK', eyebrow: 'MONEY RULES // THE MONEY RULEBOOK', badge: 'TMR' });
    assert.deepEqual(docPresentation({}, { label: 'Quote Quarry' }), { brand: 'Quote Quarry', eyebrow: '', badge: 'QQ' });
  });
  test('partial block: per-field fallback (blank brand string falls back too)', () => {
    assert.deepEqual(
      docPresentation({ doc_presentation: { badge: 'MR' } }, kit),
      { brand: 'THE MONEY RULEBOOK', eyebrow: 'MONEY RULES // THE MONEY RULEBOOK', badge: 'MR' },
    );
  });
  test('the real pilot entry carries the reference presentation', () => {
    assert.deepEqual(docPresentation(REGISTRY_META['red-flags-explained'], kit), { brand: 'MONEY RULEBOOK', eyebrow: 'BUSINESS STORIES // MR', badge: 'MR' });
  });
});

describe('SB-7 — edgeVoiceFor: real Edge-TTS voices only', () => {
  test('an Edge-shaped kit voice passes through', () => {
    assert.equal(edgeVoiceFor('en-US-AndrewNeural'), 'en-US-AndrewNeural');
    assert.equal(edgeVoiceFor('en-GB-SoniaNeural'), 'en-GB-SoniaNeural');
  });
  test('kokoro ids (bm_daniel) and junk resolve to the proven fallback', () => {
    assert.equal(edgeVoiceFor('bm_daniel'), 'en-US-AndrewNeural');
    assert.equal(edgeVoiceFor('am_michael'), 'en-US-AndrewNeural');
    assert.equal(edgeVoiceFor(''), 'en-US-AndrewNeural');
    assert.equal(edgeVoiceFor(undefined), 'en-US-AndrewNeural');
  });
});

describe('SB-4 — buildStorybookBeats: the reference structure', () => {
  const script = {
    title: 'Inside Bernie Madoff\'s $65 Billion Ponzi Scheme',
    intro: 'People still type his name into Google. The scheme ran for decades.',
    chapters: [
      { title: 'Madoff\'s Early Edge', text: 'He sat on the NYSE board. Investors trusted the name. The returns never missed.' },
      { title: 'The Collapse', text: 'Redemptions piled up in 2008.' },
    ],
    outro: 'The rules survived the crash.',
  };
  const beats = buildStorybookBeats(script, { followLine: 'Follow MONEY RULEBOOK for more.' });

  test('hero first: title headline, hook sub, full-intro narration', () => {
    assert.equal(beats[0].layout, 'hero');
    assert.equal(beats[0].headline, script.title);
    assert.equal(beats[0].sub, 'People still type his name into Google.');
    assert.equal(beats[0].text, script.intro);
    assert.equal(beats[0].i, 0);
  });
  test('one divider per chapter, numbered from 1, no narration', () => {
    const dividers = beats.filter((b) => b.layout === 'chapter');
    assert.deepEqual(dividers.map((b) => b.n), [1, 2]);
    assert.deepEqual(dividers.map((b) => b.chapterTitle), ['Madoff\'s Early Edge', 'The Collapse']);
    assert.ok(dividers.every((b) => !b.text), 'dividers are silent');
  });
  test('one split slide per sentence, narration = the FULL sentence', () => {
    const splits = beats.filter((b) => b.layout === 'split');
    assert.equal(splits.length, 4, '3 sentences + 1 sentence');
    assert.equal(splits[0].n, 1, 'splits carry their chapter number');
    assert.equal(splits[0].text, 'He sat on the NYSE board.');
    assert.equal(splits[0].headline, 'He sat on the NYSE board.');
    assert.equal(splits[3].n, 2, 'the second chapter\'s slide');
    assert.ok(splits.every((b) => b.text === b.headline), 'the spoken text is never truncated by the display fit');
  });
  test('end beat: brand follow line + outro narration', () => {
    const end = beats[beats.length - 1];
    assert.equal(end.layout, 'end');
    assert.equal(end.headline, 'Follow MONEY RULEBOOK for more.');
    assert.equal(end.text, script.outro);
  });
  test('sentences() splits on . ! ? boundaries and drops empties', () => {
    assert.deepEqual(sentences('One. Two! Three? Four'), ['One.', 'Two!', 'Three?', 'Four']);
    assert.deepEqual(sentences('  '), []);
    assert.deepEqual(sentences(null), []);
  });
  test('degenerate scripts still produce a valid sequence', () => {
    const b2 = buildStorybookBeats({ title: 'T', intro: 'I.', chapters: [], outro: 'O.' });
    assert.deepEqual(b2.map((b) => b.layout), ['hero', 'end']);
  });
});

describe('SB-5/SB-6 — timeBeats: make-longform pacing + ms word mapping', () => {
  const beats = [
    { i: 0, layout: 'hero' },
    { i: 1, layout: 'chapter' },
    { i: 2, layout: 'split' },
    { i: 3, layout: 'end' },
  ];
  const durs = [
    { i: 0, ms: 4234.6, words: [{ w: 'Hello', s: 0.1, d: 0.2 }, { w: 'world.', s: 0.3, d: 0.25 }] },
    { i: 2, ms: 1200, words: [] },
  ];
  const audioFor = (i) => (i === 0 ? 'lf-audio/x/audio/beat-00.mp3' : null);
  const { totalMs } = timeBeats(beats, durs, audioFor);

  test('pacing: lead-in 800, spoken = max(spoken+600, 3000), divider 3500, end 4000', () => {
    assert.equal(beats[0].startMs, 800);
    assert.equal(beats[0].ms, 4835, 'round(spoken)+600');
    assert.equal(beats[1].ms, 3500, 'divider');
    assert.equal(beats[2].ms, 3000, 'short spoken floors at 3000');
    assert.equal(beats[3].ms, 4000, 'end');
  });
  test('audio binds only where the caller found the file', () => {
    assert.equal(beats[0].audio, 'lf-audio/x/audio/beat-00.mp3');
    assert.equal(beats[2].audio, null);
  });
  test('words map {w,s,d} seconds -> {w,t0,t1} milliseconds', () => {
    assert.deepEqual(beats[0].words, [{ w: 'Hello', t0: 100, t1: 300 }, { w: 'world.', t0: 300, t1: 550 }]);
    assert.deepEqual(beats[2].words, []);
  });
  test('totalMs = cursor + 1500 tail', () => {
    assert.equal(totalMs, 800 + 4835 + 3500 + 3000 + 4000 + 1500);
  });
  test('beats with no duration entry still get floor timing + null audio', () => {
    assert.equal(beats[3].audio, null);
    assert.equal(beats[3].words.length, 0);
  });
});

describe('buildStorybookDoc — the DocV2 json', () => {
  test('vox theme + presentation + progressParts + music', () => {
    const doc = buildStorybookDoc({ title: 'T', presentation: { brand: 'MONEY RULEBOOK', eyebrow: 'BUSINESS STORIES // MR', badge: 'MR' }, beats: [{ i: 0 }], totalMs: 60000, music: 'lf-audio/x/music.mp3', progressParts: 10 });
    assert.equal(doc.theme, 'vox');
    assert.equal(doc.brand, 'MONEY RULEBOOK');
    assert.equal(doc.badge, 'MR');
    assert.equal(doc.progressParts, 10);
    assert.equal(doc.music, 'lf-audio/x/music.mp3');
    assert.equal(doc.width, 1920);
    assert.equal(doc.height, 1080);
    assert.equal(doc.fps, 24);
  });
  test('no music = key omitted (DocV2 renders silent-bed)', () => {
    const doc = buildStorybookDoc({ title: 'T', presentation: { brand: 'B', eyebrow: 'E', badge: 'X' }, beats: [], totalMs: 1000 });
    assert.equal('music' in doc, false);
  });
});

describe('SB-8 — storybookPhotoGate: the #106 doctrine on the photo lane', () => {
  test('zero photos across the slides = refuse', () => {
    const g = storybookPhotoGate(48, 0);
    assert.equal(g.ok, false);
    assert.match(g.reason, /0\/48 story slides carry a photo/);
    assert.match(g.reason, /refusing before the render/);
  });
  test('any photo = ship (partial coverage degrades to text-only slides)', () => {
    assert.equal(storybookPhotoGate(48, 1).ok, true);
    assert.equal(storybookPhotoGate(48, 48).ok, true);
  });
  test('degenerate counts do not refuse', () => {
    assert.equal(storybookPhotoGate(0, 0).ok, true);
    assert.equal(storybookPhotoGate(0, 3).ok, true);
  });
});

describe('photoQueryFor — portrait stock query (chapter subject + rotating niche words)', () => {
  const words = ['money rules', 'quiet wealth', 'scandal'];
  test('chapter title cleaned to 4 words + the niche word', () => {
    assert.equal(photoQueryFor('The Collapse of Enron!', words, 0), 'The Collapse of Enron money rules');
  });
  test('niche words rotate by index and the query caps at 60 chars', () => {
    assert.equal(photoQueryFor('X', words, 1).endsWith('quiet wealth'), true);
    assert.equal(photoQueryFor('X', words, 2).endsWith('scandal'), true);
    assert.ok(photoQueryFor('A'.repeat(100), words, 0).length <= 60);
  });
});

describe('SB-10 — srtFromBeats: beat words -> episode SRT (clips lane parses it)', () => {
  const beats = [
    { i: 0, layout: 'hero', startMs: 800 },
    { i: 1, layout: 'split', startMs: 6000 },
  ];
  const durs = [
    { i: 0, ms: 2000, words: [{ w: 'First', s: 0.0, d: 0.3 }, { w: 'words.', s: 0.3, d: 0.4 }] },
    { i: 1, ms: 2000, words: [{ w: 'Later', s: 0.1, d: 0.3 }, { w: 'slide.', s: 0.4, d: 0.4 }] },
  ];
  test('cues offset by each beat start; parseSrt reads the output back', () => {
    const srt = srtFromBeats(beats, durs);
    const cues = parseSrt(srt);
    assert.equal(cues.length, 2);
    assert.equal(cues[0].text, 'First words.');
    assert.ok(Math.abs(cues[0].start - 0.8) < 0.01, 'first cue sits at the hero beat start');
    assert.ok(Math.abs(cues[1].start - 6.1) < 0.01, 'second cue at beat 1 start + word offset');
  });
  test('beats without words contribute no cues', () => {
    const srt = srtFromBeats([{ i: 0, layout: 'chapter', startMs: 800 }], []);
    assert.equal(parseSrt(srt).length, 0);
  });
});

// ---------------------------------------------------------------------------
// SOURCE PINS — yt-deepdive.mjs (executes top-level code; the suite pins text)
// ---------------------------------------------------------------------------
const SB_FN = (() => {
  const a = SRC_DEEPDIVE.indexOf('async function renderStorybookVisuals');
  const z = SRC_DEEPDIVE.indexOf('async function shipEpisode');
  return a > -1 && z > a ? SRC_DEEPDIVE.slice(a, z) : '';
})();

describe('yt-deepdive pins — the storybook branch + shared tail', () => {
  test('SB-1: the branch fires on the ASSIGNED template inside renderAndShipEpisode (the resume re-enters here)', () => {
    assert.match(SRC_DEEPDIVE, /const sbMeta = docTemplateId \? \(REGISTRY_META\[docTemplateId\] \|\| null\) : null;/);
    assert.match(SRC_DEEPDIVE, /if \(docRenderOf\(sbMeta\) === 'storybook'\) \{/);
  });
  test('SB-2: the presentation merges the template block over the kit', () => {
    assert.match(SRC_DEEPDIVE, /renderStorybookVisuals\(script, docPresentation\(sbMeta, b\)\)/);
  });
  test('SB-11: BOTH lanes end in the ONE shared shipEpisode', () => {
    assert.equal((SRC_DEEPDIVE.match(/return shipEpisode\(script, \{/g) || []).length, 2, 'the legacy body and the storybook branch each hand off to shipEpisode');
    assert.match(SRC_DEEPDIVE, /async function shipEpisode\(script, \{ yt, auth, intents/);
  });
  test('SB-7: ONE edge_batch call, an Edge voice, and narrate() never enters the storybook layer', () => {
    assert.equal((SRC_DEEPDIVE.match(/edge_batch\.py/g) || []).length, 1, 'single batch TTS invocation');
    assert.match(SB_FN, /EXPLAINER_VOICE: voice/);
    assert.match(SB_FN, /edgeVoiceFor\(b\.voice\)/);
    assert.ok(!SB_FN.includes('narrate('), 'narrate.py reloads Kokoro per call and ESTIMATES word timings — never for karaoke');
  });
  test('SB-8: portrait photos, then the fail-closed gate BEFORE the render spend', () => {
    assert.match(SB_FN, /orientation: 'portrait'/);
    const gateAt = SB_FN.indexOf('storybookPhotoGate(slides.length');
    const renderAt = SB_FN.indexOf("'remotion', 'render'");
    assert.ok(gateAt > -1 && renderAt > gateAt, 'a zero-photo run refuses before any render spend');
    assert.match(SB_FN, /throw new Error\(gate\.reason\)/);
  });
  test('SB-9: the render targets DocV2 with the doc json props, writing episode.mp4', () => {
    assert.match(SB_FN, /'DocV2', final, `--props=\$\{jsonPath\}`/);
    assert.match(SB_FN, /path\.resolve\(work, 'episode\.mp4'\)/);
    assert.match(SB_FN, /'remotion', 'browser', 'ensure'/);
  });
  test('SB-10: the SRT lands at demos/deepdive-<slug>/episode.srt (the pipeline artifact step reads it)', () => {
    assert.match(SB_FN, /episode\.srt/);
    assert.match(SB_FN, /srtFromBeats\(beats, durs\)/);
  });
  test('SB-12: the storybook branch lives inside renderAndShipEpisode — the resume path (stored input, zero generation) picks the same lane', () => {
    const fnStart = SRC_DEEPDIVE.indexOf('async function renderAndShipEpisode');
    const branchAt = SRC_DEEPDIVE.indexOf("if (docRenderOf(sbMeta) === 'storybook')");
    assert.ok(fnStart > -1 && branchAt > fnStart, 'the branch is inside the function the resume calls');
  });
});

describe('DocV2 engine pins — default-inert furniture (SB-13/14/15)', () => {
  test('SB-13: the badge override merges ONLY over an explicit doc field', () => {
    assert.match(SRC_DOCV2, /badge: doc\?\.badge \|\| base\.badge/);
    assert.match(SRC_DOCV2, /badge\?: string; progressParts\?: number;/);
  });
  test('SB-14: the furniture circle renders only when the doc set a badge', () => {
    assert.match(SRC_DOCV2, /showBadge=\{Boolean\(doc\?\.badge\)\}/);
    assert.match(SRC_DOCV2, /showBadge \? \(/, 'the circle is gated on the prop, not on the theme default');
  });
  test('SB-15: the dash track switches on progressParts; absent = today\'s track', () => {
    assert.match(SRC_DOCV2, /const parts = progressParts && progressParts > 0 \? Math\.min\(progressParts, 16\) : 0;/);
    assert.match(SRC_DOCV2, /const shown = Math\.min\(total, 16\);/, 'the beat-count track survives for docs without progressParts');
  });
});

describe('Registry DATA — the pilot template opts in (SB-1/SB-2 data side)', () => {
  const meta = REGISTRY_META['red-flags-explained'];
  test('story_structure declares doc_render storybook; presentation carries the reference strings', () => {
    assert.equal(meta.story_structure.doc_render, 'storybook');
    assert.deepEqual(meta.doc_presentation, { brand: 'MONEY RULEBOOK', eyebrow: 'BUSINESS STORIES // MR', badge: 'MR' });
  });
  test('the doc plan shape is UNCHANGED (structure/review/SRT untouched — pixels only)', () => {
    assert.deepEqual(meta.story_structure.sections, ['cold_open', 'chapters:10', 'exhibits', 'outro']);
    assert.equal(meta.story_structure.chapter_min_words, 170);
    assert.deepEqual(meta.safety.disclaimers, ['Education, not financial advice.']);
    assert.deepEqual(meta.formats, ['long', 'short']);
  });
});

// ---------------------------------------------------------------------------
// Batch palettes (2026-11-05) — doc_presentation.theme names a DocV2 palette.
// The look is template DATA; absent = 'vox' byte-identically (default-inert).
// ---------------------------------------------------------------------------
describe('doc_presentation.theme — palette selection is DATA, default-inert', () => {
  test('an explicit theme rides through buildStorybookDoc', () => {
    const doc = buildStorybookDoc({ title: 'T', presentation: { theme: 'wisdom', brand: 'TW', eyebrow: 'E', badge: 'B' }, beats: [], totalMs: 1000 });
    assert.equal(doc.theme, 'wisdom', 'the named palette reaches the doc json');
  });

  test('absent theme = vox byte-identically (the default-inert rule)', () => {
    const doc = buildStorybookDoc({ title: 'T', presentation: { brand: 'B', eyebrow: 'E', badge: 'B' }, beats: [], totalMs: 1000 });
    assert.equal(doc.theme, 'vox', 'templates without the field keep the original palette');
    assert.equal(buildStorybookDoc({ title: 'T', presentation: {}, beats: [], totalMs: 1 }).theme, 'vox', 'empty presentation too');
  });

  test('SOURCE PIN: the three factory variants name their palettes; red-flags stays vox', () => {
    for (const [id, theme] of [['history-storybook', 'history'], ['wisdom-storybook', 'wisdom'], ['science-storybook', 'science']]) {
      assert.equal(REGISTRY_META[id]?.doc_presentation?.theme, theme, `${id} names ${theme}`);
    }
    assert.equal(REGISTRY_META['red-flags-explained']?.doc_presentation?.theme, undefined, 'the MR pilot keeps vox by absence');
  });

  test('the engine THEMES registry carries every named palette', () => {
    const src = fs.readFileSync(path.join(ROOT, 'explainer/remotion/longscenes2.tsx'), 'utf8');
    for (const t of ['investing', 'vox', 'poster', 'history', 'wisdom', 'science']) {
      assert.match(src, new RegExp(`^  ${t}: \{`, 'm'), `THEMES.${t} exists`);
    }
    assert.match(src, /THEMES\[doc\?\.theme\] \|\| THEMES\.investing/, 'unknown names fall back safely in the engine');
  });
});

// ---------------------------------------------------------------------------
// Step 4 (2026-11-05) — the word-timed stat directives. When the narration
// SPEAKS a number, the viewer SEES it: the planner marks the beat's pop at
// that word's index, the engine fires a themed chip at that word's timing.
// Deterministic v1 — no LLM (numbers need no model). Beats without numbers
// are untouched (default-inert).
// ---------------------------------------------------------------------------
describe('planStoryDirectives — stats pop on the spoken numbers', () => {
  const beatWith = (...words) => ({ layout: 'split', words: words.map((w, i) => ({ w, t0: i * 300, t1: i * 300 + 250 })) });

  test('currency, percent, year, comma-grouped and magnitude tokens all pop', () => {
    for (const token of ['$65', '70%', '1920', '3,000,000', '1.5 million', '$65 billion']) {
      const b = beatWith('the', 'network', 'managed', token, 'quietly');
      const r = planStoryDirectives([b]);
      assert.equal(r.pops, 1, `${token} pops`);
      assert.deepEqual(b.pop, { kind: 'stat', text: token, w: 3 }, `the pop names the token at its index`);
      assert.equal(b.words[3].key, true, 'the spoken number is flagged key');
    }
  });

  test('no number = untouched beat (default-inert)', () => {
    const b = beatWith('the', 'network', 'trusted', 'nobody', 'verifying');
    const r = planStoryDirectives([b]);
    assert.equal(r.pops, 0);
    assert.equal(b.pop, undefined, 'no pop attached');
    assert.ok(b.words.every((w) => !w.key), 'no key flags');
  });

  test('word-less beats (dividers) are skipped safely', () => {
    const b = { layout: 'chapter', n: 2, words: [] };
    const r = planStoryDirectives([b]);
    assert.equal(r.pops, 0);
    assert.equal(b.pop, undefined);
  });

  test('SOURCE PIN: the engine renders the chip only when a pop exists, at the pop word timing', () => {
    const src = fs.readFileSync(path.join(ROOT, 'explainer/remotion/longscenes2.tsx'), 'utf8');
    assert.match(src, /\{b\.pop \? <BeatPop b=\{b\} \/> : null\}/, 'the pop render is conditional — pop-less beats unchanged');
    assert.match(src, /b\.words\[pop\.w\]\.t0/, 'the chip fires at the POP WORD timing, not the beat start');
    assert.match(src, /top: 150/, 'the chip sits below the top furniture band (safe area)');
  });

  test('SOURCE PIN: the doc lane plans directives after the word timings exist', () => {
    assert.match(SRC_DEEPDIVE, /timeBeats\(beats, durs, audioFor\);[\s\S]*?planStoryDirectives\(beats\)/, 'planner runs after timeBeats (words exist)');
    assert.match(SRC_DEEPDIVE, /planStoryDirectives\(beats\)/, 'the planner is wired');
  });
});

// Step 5 (2026-11-05) — entity pops: the name fires on the word it's spoken
// on. Deterministic v1 (proper-noun groups, never sentence-initial); stat
// pops win; entity chips render filled.
describe('planEntityDirectives — names pop on the words they are spoken on', () => {
  const beatWith = (...words) => ({ layout: 'split', words: words.map((w, i) => ({ w, t0: i * 300, t1: i * 300 + 250 })) });

  test('mid-sentence proper nouns pop at their first word; multi-word groups keep together', () => {
    const b = beatWith('the', 'scheme', 'behind', 'Bernie', 'Madoff', 'quietly', 'grew');
    const r = planEntityDirectives([b]);
    assert.equal(r.pops, 1);
    assert.deepEqual(b.pop, { kind: 'entity', text: 'Bernie Madoff', w: 3 }, 'the group fires at its first word, joined');
  });

  test('sentence-initial capitals are NOT entities', () => {
    const b = beatWith('WordPress', 'runs', 'millions', 'of', 'blogs', 'worldwide');
    const r = planEntityDirectives([b]);
    assert.equal(r.pops, 0, 'WordPress opens the sentence — excluded (heuristic honesty)');
    assert.equal(b.pop, undefined);
  });

  test('R7: a beat with a stat pop is left alone', () => {
    const b = beatWith('the', 'fund', 'held', '$65', 'billion', 'for', 'Decades');
    b.pop = { kind: 'stat', text: '$65', w: 3 };
    const r = planEntityDirectives([b]);
    assert.equal(r.pops, 0, 'stat wins');
    assert.deepEqual(b.pop, { kind: 'stat', text: '$65', w: 3 }, 'the stat pop untouched');
  });

  test('small caps words (The/Its/When) and acronyms never pass', () => {
    const b = beatWith('When', 'It', 'Happens', 'MR', 'speaks');
    const r = planEntityDirectives([b]);
    assert.equal(r.pops, 0, 'function words + acronyms excluded');
  });

  test('SOURCE PIN: entity chips render filled (kind-distinct), stat chips bordered', () => {
    const src = fs.readFileSync(path.join(ROOT, 'explainer/remotion/longscenes2.tsx'), 'utf8');
    assert.match(src, /pop\.kind === "entity" \? T\.accent : T\.bg/, 'entity chip = filled accent');
    const lib = fs.readFileSync(path.join(ROOT, 'lib/doc-storybook.mjs'), 'utf8');
    assert.match(lib, /export function planEntityDirectives/, 'the planner is exported from the lib');
  });

  test('SOURCE PIN: the doc lane runs entities after stats', () => {
    assert.match(SRC_DEEPDIVE, /planStoryDirectives\(beats\);[\s\S]*?planEntityDirectives\(beats\)/, 'stat pass first (R7 order)');
  });
});
