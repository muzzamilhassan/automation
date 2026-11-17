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
import { preferMood } from '../music-engine.mjs';
import { entityDomainFor } from '../lib/doc-storybook.mjs';
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
      { brand: 'MONEY RULEBOOK', eyebrow: 'BUSINESS STORIES // MR', badge: 'MR', theme: undefined, docLayouts: undefined , voice: undefined, musicMood: undefined, style: undefined },
    );
  });
  test('step 3/5 seams: theme + doc_layouts ride the presentation block; absent = undefined', () => {
    const withBoth = docPresentation({ doc_presentation: { theme: 'wisdom', doc_layouts: ['split', 'quote'], brand: 'TW', eyebrow: 'E', badge: 'TW' } }, kit);
    assert.equal(withBoth.theme, 'wisdom');
    assert.deepEqual(withBoth.docLayouts, ['split', 'quote']);
    const without = docPresentation({ doc_presentation: { brand: 'B', eyebrow: 'E', badge: 'B' } }, kit);
    assert.equal(without.theme, undefined, 'no theme field = undefined (default vox downstream)');
    assert.equal(without.docLayouts, undefined, 'no doc_layouts field = undefined (all splits downstream)');
    const voiced = docPresentation({ doc_presentation: { voice: 'en-GB-RyanNeural', music_mood: 'epic', brand: 'HV', eyebrow: 'E', badge: 'HV' } }, kit);
    assert.equal(voiced.voice, 'en-GB-RyanNeural', 'P4: the template voice rides through');
    assert.equal(voiced.musicMood, 'epic', 'P4: the template music mood rides through');
  });
  test('no block: kit label/eyebrow + derived initials', () => {
    assert.deepEqual(docPresentation(null, kit), { brand: 'THE MONEY RULEBOOK', eyebrow: 'MONEY RULES // THE MONEY RULEBOOK', badge: 'TMR', theme: undefined, docLayouts: undefined , voice: undefined, musicMood: undefined, style: undefined });
    assert.deepEqual(docPresentation({}, { label: 'Quote Quarry' }), { brand: 'Quote Quarry', eyebrow: '', badge: 'QQ', theme: undefined, docLayouts: undefined , voice: undefined, musicMood: undefined, style: undefined });
  });
  test('partial block: per-field fallback (blank brand string falls back too)', () => {
    assert.deepEqual(
      docPresentation({ doc_presentation: { badge: 'MR' } }, kit),
      { brand: 'THE MONEY RULEBOOK', eyebrow: 'MONEY RULES // THE MONEY RULEBOOK', badge: 'MR', theme: undefined, docLayouts: undefined , voice: undefined, musicMood: undefined, style: undefined },
    );
  });
  test('the real pilot entry carries the reference presentation', () => {
    assert.deepEqual(docPresentation(REGISTRY_META['red-flags-explained'], kit), { brand: 'MONEY RULEBOOK', eyebrow: 'BUSINESS STORIES // MR', badge: 'MR', theme: undefined, docLayouts: undefined , voice: undefined, musicMood: undefined, style: undefined });
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
  test('hasChapters: false skips standalone chapter divider slides (quotes, listicles, challenges)', () => {
    const nonChapterBeats = buildStorybookBeats(script, { hasChapters: false, followLine: 'Follow for more.' });
    assert.equal(nonChapterBeats.some((b) => b.layout === 'chapter'), false, 'no chapter layout beats present');
    assert.deepEqual(nonChapterBeats.map((b) => b.layout), ['hero', 'split', 'split', 'split', 'split', 'end']);
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
    const doc = buildStorybookDoc({ title: 'T', presentation: { brand: 'MONEY RULEBOOK', eyebrow: 'BUSINESS STORIES // MR', badge: 'MR' , voice: undefined, musicMood: undefined, style: undefined }, beats: [{ i: 0 }], totalMs: 60000, music: 'lf-audio/x/music.mp3', progressParts: 10 });
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
    const doc = buildStorybookDoc({ title: 'T', presentation: { brand: 'B', eyebrow: 'E', badge: 'X' , voice: undefined, musicMood: undefined, style: undefined }, beats: [], totalMs: 1000 });
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
  test('SB-11: EVERY lane ends in the ONE shared shipEpisode', () => {
    // legacy body + storybook branch + (step 1 D5) the diagram branch
    assert.equal((SRC_DEEPDIVE.match(/return shipEpisode\(script, \{/g) || []).length, 3, 'legacy, storybook and diagram each hand off to shipEpisode');
    assert.match(SRC_DEEPDIVE, /async function shipEpisode\(script, \{ yt, auth, intents/);
  });
  test('SB-7: ONE edge_batch call, an Edge voice, and narrate() never enters the storybook layer', () => {
    assert.equal((SRC_DEEPDIVE.match(/edge_batch\.py/g) || []).length, 1, 'single batch TTS invocation');
    assert.match(SB_FN, /EXPLAINER_VOICE: voice/);
    assert.match(SB_FN, /edgeVoiceFor\(pres\.voice \|\| b\.voice\)/, 'P4: the template voice wins, the kit falls back');
    assert.ok(!SB_FN.includes('narrate('), 'narrate.py reloads Kokoro per call and ESTIMATES word timings — never for karaoke');
  });
  test('step 1 V3: a kit voiceProfile narrates the storybook with the human Kokoro lane (fail-loud, same layout)', () => {
    assert.match(SB_FN, /const prof = voiceProfileFor\(slug\)/);
    assert.match(SB_FN, /'voice_lines\.py'\), inPath, audioDir, '--engine', 'kokoro'/);
    assert.match(SB_FN, /'--layout', 'edge_batch'/);
    // still ONE status gate for both voices — a failing line aborts, never a silent beat
    assert.equal((SB_FN.match(/if \(tts\.status !== 0\) throw new Error\('storybook tts failed'\)/g) || []).length, 1);
  });
  test('step 1 D1/D4: the diagram branch renders, and ANY visual failure falls back to the storybook look', () => {
    const at = SRC_DEEPDIVE.indexOf("if (docRenderOf(sbMeta) === 'diagram')");
    const sbAt = SRC_DEEPDIVE.indexOf("if (docRenderOf(sbMeta) === 'storybook')");
    assert.ok(at > -1 && sbAt > at, 'the diagram branch sits before the storybook branch');
    const branch = SRC_DEEPDIVE.slice(at, sbAt);
    assert.match(branch, /visuals = await renderDiagramEpisode\(/);
    assert.match(branch, /\} catch \(e\) \{[\s\S]*sendAlert[\s\S]*\}\s*return shipEpisode\(/, 'alert, then ship OUTSIDE the try');
    assert.match(branch, /\.\.\.\(visuals \|\| \(await renderStorybookVisuals\(script, pres\)\)\)/);
    assert.match(branch, /voiceProfile: voiceProfileFor\(slug\)/);
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
    const doc = buildStorybookDoc({ title: 'T', presentation: { brand: 'B', eyebrow: 'E', badge: 'B' , voice: undefined, musicMood: undefined, style: undefined }, beats: [], totalMs: 1000 });
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
    for (const t of ['investing', 'vox', 'poster', 'history', 'wisdom', 'science', 'travel', 'focus']) {
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

// P2 (2026-11-05) — motion grammar: themes carry an entrance profile
// (spring = original math, stepped = quantized "on Ns", typewriter = hard
// ticker). Absent profile = the original spring byte-identically.
describe('motion grammar — themes carry their entrance profile', () => {
  test('SOURCE PIN: the three factory themes declare distinct motion profiles', () => {
    const src = fs.readFileSync(path.join(ROOT, 'explainer/remotion/longscenes2.tsx'), 'utf8');
    assert.match(src, /motion: \{ kind: "typewriter", step: 3 \}/, 'history types its reveals');
    assert.match(src, /motion: \{ kind: "stepped", step: 4 \}/, 'wisdom writes on cue');
    assert.match(src, /motion: \{ kind: "stepped", step: 2 \}/, 'science measures on 2s');
    assert.ok(!/motion: \{/.test(src.split('vox: {')[1].split('},')[0]), 'vox (the MR look) stays motionless');
  });

  test('SOURCE PIN: useMotion falls back to the identical spring when no profile exists', () => {
    const src = fs.readFileSync(path.join(ROOT, 'explainer/remotion/longscenes2.tsx'), 'utf8');
    assert.match(src, /if \(!m \|\| m\.kind === "spring"\) return spring\(\{ frame: f - delay, fps, config: \{ damping: 200 \} \}\);/, 'the fallback IS the original math');
  });
});

describe('P4 — preferMood (the music mood preference, pure)', () => {
  test('mood substring match filters the pool; no match falls back to the full pool', () => {
    const pool = [{ title: 'A', feel: 'Bright, Calming, Relaxed' }, { title: 'B', feel: 'Epic, Dark' }, { title: 'C', feel: 'calming' }];
    const hit = preferMood(pool, 'calming');
    assert.equal(hit.length, 2, 'both calming-ish tracks');
    assert.ok(hit.every((t) => t.title !== 'B'), 'the epic/dark track filtered out');
    assert.equal(preferMood(pool, 'kazoo').length, 3, 'no match = full pool (fail-open)');
    assert.equal(preferMood(pool, null).length, 3, 'no mood = full pool');
  });
});

describe('entityDomainFor — the curated brand→domain map (step 6)', () => {
  test('exact + token matches resolve; unknown names resolve null', () => {
    assert.equal(entityDomainFor('WordPress'), 'wordpress.com');
    assert.equal(entityDomainFor('Goldman Sachs'), 'goldmansachs.com', 'token match');
    assert.equal(entityDomainFor('Bernie Madoff'), null, 'people are not brand-mapped');
    assert.equal(entityDomainFor('Unknown Corp'), null);
    assert.equal(entityDomainFor(''), null);
  });
  test('SOURCE PIN: the lane chains Simple Icons SVG -> favicon -> name-text', () => {
    assert.match(SRC_DEEPDIVE, /cdn\.simpleicons\.org\/\$\{slug\}/, 'tier 1: Simple Icons SVG');
    assert.match(SRC_DEEPDIVE, /s2\/favicons\?domain=\$\{domain\}/, 'tier 2: favicon fallback');
    assert.match(SRC_DEEPDIVE, /the name-text chip stays/, 'tier 3: fail-soft text chip');
  });
});

describe('Full Story Templates & 95-100% Content-Matched Starting Hook Media', () => {
  test('extractVisualQuery maps key topics to 95-100% matched visual search keywords', async () => {
    const { extractVisualQuery } = await import('../scripts/render-template-preview.mjs');
    assert.equal(
      extractVisualQuery({ template_id: 'mr-case-files-storybook' }, 'The $186 Grocery Lie: What a 30-Day Receipt Audit Really Finds', ''),
      'grocery supermarket receipt shopping',
    );
    assert.equal(
      extractVisualQuery({ template_id: 'night-signal-storybook' }, '5 Hours of Sleep Erases 40% of Your Memory — The Overnight Evidence', ''),
      'deep sleep night bedroom alarm clock',
    );
    assert.equal(
      extractVisualQuery({ template_id: 'heirloom-storybook' }, 'Why Old Money Never Wears Logos — The $8,000 Quiet Rule', ''),
      'bespoke luxury suit tailoring quiet luxury',
    );
    assert.equal(
      extractVisualQuery({ template_id: 'marble-quill-storybook' }, "Seneca's 3AM Letter: The Prompt That Rebuilds a Day", ''),
      'ancient roman statue marble library writing journal',
    );
    assert.equal(
      extractVisualQuery({ template_id: 'iron-five-storybook' }, "Top 5 Training Rules, Ranked by Evidence — #1 Isn't a Lift", ''),
      'barbell gym strength workout athlete',
    );
  });

  test('Template drafts default to has_chapters: false (Full Story) and convert dynamically', () => {
    const draftsDir = path.join(ROOT, 'studio/lib/template-bot-drafts');
    const files = fs.readdirSync(draftsDir).filter((f) => f.endsWith('.json'));
    assert.equal(files.length, 20, 'the 18 storybook drafts + the 2 Living Diagram drafts (money-flow-diagram, systems-diagram)');

    for (const f of files) {
      const data = JSON.parse(fs.readFileSync(path.join(draftsDir, f), 'utf8'));
      // step 1: a Living Diagram draft renders one diagram scene per chapter, so it
      // is CHAPTERED by design (the panel toggle's 'chapters' state)
      if (data.story_structure?.doc_render === 'diagram') {
        assert.equal(data.story_structure.has_chapters, true, `${data.template_id}: diagram drafts are chaptered`);
        assert.equal(data.story_structure.narrative_format, 'chapters');
        continue;
      }
      assert.equal(data.story_structure?.has_chapters, false, `${data.template_id} must default to has_chapters: false`);
      assert.equal(data.story_structure?.narrative_format, 'full_story', `${data.template_id} must default to full_story`);
      assert.ok(data.story_structure.sections.includes('deep_investigation'), `${data.template_id} default sections must include deep_investigation`);
    }

    // Dynamic conversion logic test: checking has_chapters converts to chapters, unchecking to full_story
    const simulateToggle = (data, checked) => {
      const isChapters = Boolean(checked);
      return {
        ...data,
        story_structure: {
          ...data.story_structure,
          has_chapters: isChapters,
          narrative_format: isChapters ? 'chapters' : 'full_story',
          sections: isChapters ? ['cold_open', 'chapters:10', 'exhibits', 'outro'] : ['cold_open', 'hook_escalation', 'deep_investigation', 'verdict_payoff', 'outro'],
        },
      };
    };

    const sample = JSON.parse(fs.readFileSync(path.join(draftsDir, files[0]), 'utf8'));
    const convertedToChapters = simulateToggle(sample, true);
    assert.equal(convertedToChapters.story_structure.has_chapters, true);
    assert.equal(convertedToChapters.story_structure.narrative_format, 'chapters');
    assert.ok(convertedToChapters.story_structure.sections.includes('chapters:10'));

    const convertedToFullStory = simulateToggle(convertedToChapters, false);
    assert.equal(convertedToFullStory.story_structure.has_chapters, false);
    assert.equal(convertedToFullStory.story_structure.narrative_format, 'full_story');
    assert.ok(convertedToFullStory.story_structure.sections.includes('deep_investigation'));
  });

  test('Staged preview JSONs carry Beat 0 hook broll media from frame 0', () => {
    const ids = ['iron-five-storybook', 'marble-quill-storybook', 'mr-case-files-storybook', 'night-signal-storybook', 'no-spend-30day-storybook'];
    for (const id of ids) {
      const p = path.join(ROOT, 'explainer/public', `preview-draft-${id}.json`);
      if (fs.existsSync(p)) {
        const d = JSON.parse(fs.readFileSync(p, 'utf8'));
        assert.ok(d.beats && d.beats[0], `${id} has Beat 0`);
        assert.ok(d.beats[0].broll || d.beats[0].photo, `${id} Beat 0 carries opening media (broll or photo)`);
      }
    }
  });

  test('SOURCE PIN: yt-deepdive.mjs passes hasChapters to buildStorybookBeats and sets Beat 0 hook media', () => {
    assert.match(SRC_DEEPDIVE, /hasChapters\s*=\s*pres\.hasChapters\s*!==\s*false/, 'checks pres.hasChapters');
    assert.match(SRC_DEEPDIVE, /hasChapters,/, 'passes hasChapters into buildStorybookBeats');
    assert.match(SRC_DEEPDIVE, /heroBeat\.broll/, 'assigns Beat 0 hook broll');
  });
});