import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// #106 INCIDENT (the four black Money Rulebook docs, Oct 28 -> Nov 2) — the
// doc visual-layer suite. Three layers:
//   1. PURE — lib/doc-frames.mjs: the chapter lower-third as a TRANSPARENT
//      1920x1080 overlay (the old card painted two FULL-FRAME OPAQUE rects
//      that covered the chapter b-roll 100% under overlay=0:0), and the
//      fail-closed b-roll gate (a run where ZERO chapters carry a clip
//      REFUSES before the upload — a black doc never ships again).
//   2. PURE — youtube-clips.mjs clipCandidates: the width fallback tier —
//      the 4K-only filter (width >= 3500) can return empty for many queries;
//      a full-HD tier (>= 1920) runs before the query gives up to null.
//   3. SOURCE PINS — yt-deepdive.mjs threads both: the card renders from the
//      transparent builder (never the opaque frameSvg wrapper again), every
//      failed chapter fetch is LOGGED (the silent `catch { }` is gone), and
//      the render REFUSES (log + ntfy + throw) BEFORE the upload when no
//      chapter got a clip.
// ---------------------------------------------------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DEEPDIVE = fs.readFileSync(path.join(ROOT, 'yt-deepdive.mjs'), 'utf8');
const SRC_CLIPS = fs.readFileSync(path.join(ROOT, 'youtube-clips.mjs'), 'utf8');

import { chapterLowerThirdSvg, docBrollGate } from '../lib/doc-frames.mjs';
import { clipCandidates } from '../youtube-clips.mjs';
import { EMBEDDED_FONTS_CSS } from '../typography-poster-engine.mjs';

const ACCENT = '#3DDC97';

describe('#106 DEFECT 2 — the chapter lower-third is a TRANSPARENT overlay', () => {
  const svg = chapterLowerThirdSvg({ num: 3, title: 'The Debt Snowball, Explained', accent: ACCENT });

  test('it is a 1920x1080 svg with the fonts still embedded', () => {
    assert.ok(svg.includes('<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">'), 'the overlay spans the full canvas');
    assert.ok(svg.includes(EMBEDDED_FONTS_CSS), 'Oswald @font-face stays embedded (the card keeps its type)');
  });

  test('NO full-frame opaque rect — the old gradient/glow card that covered the b-roll is gone', () => {
    assert.doesNotMatch(svg, /<rect[^>]*width="1920"[^>]*height="1080"/, 'a full-frame rect painted under overlay=0:0 covers the chapter b-roll 100% (the black-video defect)');
    assert.ok(!svg.includes('fill="url(#'), 'no gradient/glow fills on the overlay card');
  });

  test('only the bottom band (semi-transparent), the accent bar and the two text lines are painted', () => {
    assert.ok(svg.includes('<rect x="0" y="872" width="1920" height="208" fill="#000000" fill-opacity="0.58"/>'), 'the bottom band keeps its 0.58 opacity');
    assert.ok(svg.includes(`<rect x="0" y="872" width="14" height="208" fill="${ACCENT}"/>`), 'the 14px accent bar survives');
    assert.ok(svg.includes('CHAPTER 03 / 08'), 'the chapter kicker survives');
    assert.ok(svg.includes('THE DEBT SNOWBALL, EXPLAINED'), 'the chapter title survives (uppercased)');
  });

  test('the title is sliced to 46 chars and XML-escaped', () => {
    const long = chapterLowerThirdSvg({ num: 1, title: 'X'.repeat(60), accent: ACCENT });
    assert.ok(long.includes('>' + 'X'.repeat(46) + '</text>'), '46 chars max (the old slice keeps working)');
    const weird = chapterLowerThirdSvg({ num: 2, title: 'Debt & Taxes <101>', accent: ACCENT });
    assert.ok(weird.includes('DEBT &amp; TAXES &lt;101&gt;'), 'XML entities escaped — the SVG stays well-formed');
  });
});

describe('#106 hardening — the loud fail-closed b-roll gate', () => {
  test('ZERO chapters with clips REFUSES the render (the four black docs class)', () => {
    const g = docBrollGate(8, 0);
    assert.equal(g.ok, false, 'zero clips = refuse');
    assert.match(g.reason, /0\/8/, 'the reason names the tally');
    assert.match(g.reason, /b-roll/, 'the reason names the missing thing');
  });

  test('ANY chapter with a clip ships (partial coverage is degraded, not black)', () => {
    assert.equal(docBrollGate(8, 1).ok, true);
    assert.equal(docBrollGate(8, 8).ok, true);
  });

  test('a degenerate zero-chapter episode passes (validEpisode floors chapters upstream)', () => {
    assert.equal(docBrollGate(0, 0).ok, true);
  });
});

describe('#106 item 3 — the width fallback tier (youtube-clips)', () => {
  const hit = (id, width, dur, downloads = 100) => ({ id, duration: dur, downloads, videos: { large: { width, url: `https://cdn.pixabay.com/${id}.mp4` } } });

  test('tier 1 unchanged: 4K+ only (width >= 3500)', () => {
    const cands = clipCandidates([hit(1, 3840, 20), hit(2, 1920, 20)], { minDur: 12, used: [], minWidth: 3500 });
    assert.deepEqual(cands.map((h) => h.id), [1]);
  });

  test('the fallback tier: full-HD (>= 1920) is accepted when the 4K tier is empty', () => {
    const hits = [hit(2, 1920, 20)];
    assert.equal(clipCandidates(hits, { minDur: 12, used: [], minWidth: 3500 }).length, 0, 'the 4K tier stays empty — the old filter returned null here');
    assert.deepEqual(clipCandidates(hits, { minDur: 12, used: [], minWidth: 1920 }).map((h) => h.id), [2], 'the fallback tier rescues the query');
  });

  test('below full-HD never passes either tier', () => {
    assert.equal(clipCandidates([hit(3, 1280, 20)], { minDur: 12, used: [], minWidth: 1920 }).length, 0);
  });

  test('the duration floor and the used-filter still bind at the fallback tier', () => {
    const cands = clipCandidates(
      [hit(4, 1920, 8, 999), hit(5, 1920, 20, 10), hit(6, 1920, 30, 5)],
      { minDur: 12, used: [5], minWidth: 1920 },
    );
    assert.deepEqual(cands.map((h) => h.id), [6]);
  });

  test('still sorted by downloads and capped at 6', () => {
    const hits = Array.from({ length: 8 }, (_, i) => hit(10 + i, 1920, 30, (i + 1) * 10));
    const cands = clipCandidates(hits, { minDur: 12, used: [], minWidth: 1920 });
    assert.deepEqual(cands.map((h) => h.downloads), [80, 70, 60, 50, 40, 30]);
  });
});

describe('#106 source pins — yt-deepdive threads the fix', () => {
  test('the chapter card renders from the TRANSPARENT builder; the opaque frameSvg wrapper is gone from the card path', () => {
    assert.match(SRC_DEEPDIVE, /chapterLowerThirdSvg\(\{ num, title, accent: b\.accent \}\)/);
    assert.ok(!SRC_DEEPDIVE.includes('svg2png'), 'svg2png (the frameSvg wrapper the card used) is removed');
  });

  test('the silent per-chapter catch is gone — a failed fetch is LOGGED', () => {
    assert.doesNotMatch(SRC_DEEPDIVE, /getTopicClip\(page\(\), \{ headline: ch\.title \}\); \} catch \{ \}/, 'the bare catch { } hid the e7fb691 ReferenceError for weeks');
    assert.match(SRC_DEEPDIVE, /getTopicClip\(page\(\), \{ headline: ch\.title \}\); \}\s*catch \(e\) \{ console\.log\(/, 'the per-chapter failure is logged');
  });

  test('the render REFUSES before the upload when zero chapters carry clips', () => {
    const gateAt = SRC_DEEPDIVE.indexOf('docBrollGate(script.chapters.length, chaptersWithClips)');
    assert.ok(gateAt > -1, 'the gate runs on the render path');
    const throwAt = SRC_DEEPDIVE.indexOf('throw new Error(gate.reason)');
    assert.ok(throwAt > gateAt, 'a refused verdict THROWS');
    const uploadAt = SRC_DEEPDIVE.indexOf('uploadWithIntent(');
    assert.ok(uploadAt > -1 && throwAt < uploadAt, 'the refusal fires BEFORE any upload attempt');
    const refusal = SRC_DEEPDIVE.slice(gateAt, uploadAt);
    assert.ok(refusal.includes('sendAlert'), 'the refusal pushes the existing ntfy alert path');
  });

  test('youtube-clips runs BOTH tiers before a query gives up', () => {
    assert.match(SRC_CLIPS, /export function clipCandidates\(/, 'the quality filter is the exported pure helper');
    assert.match(SRC_CLIPS, /minWidth: 3500/, 'tier 1: 4K');
    assert.match(SRC_CLIPS, /minWidth: 1920/, 'tier 2: full-HD fallback');
    assert.match(SRC_CLIPS, /clipCandidates\(hits, \{ minDur, used, minWidth: t\.minWidth \}\)/, 'the tier loop feeds the same filter');
  });
});
