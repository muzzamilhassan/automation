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

// ---------------------------------------------------------------------------
// R4/R5 (red-flags spec, 2026-11-03) — the left-stack doc-thumb design. The
// owner's reference video (BFCa-bRy-3M) carries a frame thumbnail with a
// top-left chip, an accent eyebrow, a LEFT-anchored Anton headline whose LAST
// word takes the accent, a red-tinted scrim, and a bottom-right brand mark.
// The doc lane switches to it ONLY from the active template's thumb_design
// data (registry, never a channel map); without the block the render is the
// default center path, untouched (R5 default-inert — the incident-sensitive
// guard: any default-path diff is a FAIL even if the image "looks fine").
// ---------------------------------------------------------------------------
import { leftStackThumbOverlay, thumbDesignFor } from '../youtube-engine.mjs';
import { REGISTRY_META } from '../studio/lib/template-registry.data.js';

const REF_TD = { layout: 'left-stack', chip: 'SCANDALS', brandmark: 'MONEYRULEBOOK', accent_word: 'last', scrim_tint: '#7A1E1E', accent: '#F0776E', eyebrow: 'MONEY RULEBOOK' };
const REF_LINES = ['7 RED FLAGS THAT LED', 'TO BERNIE MADOFF PONZI', 'EXPLAINED'];

describe('R4 — the left-stack thumb overlay renders the reference design', () => {
  const svg = leftStackThumbOverlay({ lines: REF_LINES, size: 96, accent: REF_TD.accent, eyebrow: REF_TD.eyebrow, b64: Buffer.from('stub'), td: REF_TD });

  test('1280x720 svg with the fonts still embedded', () => {
    assert.ok(svg.includes('<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"'), 'thumbnail canvas');
    assert.ok(svg.includes(EMBEDDED_FONTS_CSS), 'Anton/Oswald stay embedded');
  });

  test('the chip: dot + SCANDALS in a top-left pill', () => {
    assert.ok(svg.includes('data-thumb="chip"'), 'chip group present');
    assert.ok(svg.includes('>SCANDALS</text>'), 'chip text verbatim, uppercased');
    assert.match(svg, /<circle cx="104" cy="82" r="7" fill="#F0776E"\/>/, 'the accent dot');
    assert.match(svg, /<rect x="72" y="56"[^>]*rx="26"/, 'the pill, top-left at x=72');
  });

  test('the brand mark: accent diamond + MONEYRULEBOOK bottom-right', () => {
    assert.ok(svg.includes('data-thumb="brandmark"'), 'brandmark group present');
    assert.ok(svg.includes('>MONEYRULEBOOK</text>'), 'brandmark text verbatim');
    assert.match(svg, /x="1208" y="668" text-anchor="end"/, 'anchored bottom-right');
    assert.match(svg, /<rect x="1128" y="646" width="14" height="14" fill="#F0776E"[^>]*rotate\(45/, 'the diamond');
  });

  test('the scrim: red-tint rect UNDER the neutral gradient', () => {
    const imgEnd = svg.indexOf('</image>') + '</image>'.length;
    const tintAt = svg.indexOf('<rect width="1280" height="720" fill="#7A1E1E"');
    const gradAt = svg.indexOf('<rect width="1280" height="720" fill="url(#vg)"');
    assert.ok(tintAt > imgEnd, 'tint paints over the frame');
    assert.ok(gradAt > tintAt, 'gradient stacks over the tint (readability)');
  });

  test('the headline is LEFT-anchored and the LAST word takes the accent tspan', () => {
    assert.match(svg, /text-anchor="start" x="72" y="648"[^>]*font-size="96"/, 'last line sits on the 648 baseline, left x=72');
    const accentCount = (svg.match(/<tspan fill="#F0776E">/g) || []).length;
    assert.equal(accentCount, 2, 'shadow + white layers BOTH carry the accent tspan (default-path parity); last word, not longest');
    assert.ok(svg.includes('<tspan fill="#F0776E">EXPLAINED</tspan>'), 'the reference\'s accent word');
    assert.match(svg, /<text x="72" y="\d+"[^>]*letter-spacing="10" fill="#F0776E">MONEY RULEBOOK<\/text>/, 'salmon eyebrow above the stack');
  });

  test('single-word last line: the whole word accents; empty chip/brandmark omit their groups', () => {
    const one = leftStackThumbOverlay({ lines: ['THE BIG SHORT'], size: 112, accent: '#F0776E', eyebrow: 'MR', b64: Buffer.from('x'), td: { ...REF_TD, chip: '', brandmark: '' } });
    assert.ok(one.includes('<tspan fill="#F0776E">SHORT</tspan>'), 'the last WORD accents even on a single line');
    assert.ok(!one.includes('data-thumb='), 'no chip/brandmark groups when unset');
  });
});

describe('R5 — default-inert: the default path never sees the new design', () => {
  test('thumbDesignFor reads ONLY registry thumb_design data', () => {
    assert.deepEqual(thumbDesignFor('red-flags-explained'), REF_TD, 'the red-flags entry carries the block');
    assert.equal(thumbDesignFor('myth-vs-money'), null, 'templates without the block resolve null');
    assert.equal(thumbDesignFor(null), null, 'template-less lanes resolve null');
    assert.equal(thumbDesignFor('not-a-template'), null, 'unknown ids resolve null');
  });

  test('SOURCE PIN: the doc lane threads thumbDesignFor(docTemplateId) into both render calls', () => {
    assert.match(SRC_DEEPDIVE, /const thumbDesign = thumbDesignFor\(docTemplateId\);/, 'resolved once, inside renderAndShipEpisode (resume = the row\'s template)');
    assert.match(SRC_DEEPDIVE, /renderYouTubeThumbnail\(script\.title, `\$\{work\}\/frame\.jpg`, thumbOpts\)/, 'candidate 1 rides the shared opts');
    assert.match(SRC_DEEPDIVE, /renderYouTubeThumbnail\(script\.title, `\$\{work\}\/frame-alt\.jpg`, thumbOpts\)/, 'staggered candidates ride the same opts');
    assert.match(SRC_DEEPDIVE, /accent: \(thumbDesign\?\.accent\) \|\| b\.accent/, 'template accent wins over kit (T6 precedence); kit is the fallback');
  });

  test('SOURCE PIN: the default center path is untouched — left-stack gates on layout data only', () => {
    assert.match(SRC_DEEPDIVE.replace(/\r/g, ''), /left-stack/, 'deepdive references the design only via the data helper');
    const eng = fs.readFileSync(path.join(ROOT, 'youtube-engine.mjs'), 'utf8');
    assert.match(eng, /opts\.thumbDesign && opts\.thumbDesign\.layout === 'left-stack'/, 'the branch fires on the DATA, never on channel identity');
    assert.match(eng, /text-anchor="middle" x="640" y="120"/, 'the default centered eyebrow literal survives byte-for-byte');
    assert.match(eng, /wrapTextToLines\(raw, 13\)/, 'the default 13-char wrap survives');
  });
});
