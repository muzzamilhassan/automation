// Audit 2026-11-13 improvement #2 (security-02). Colours and image hrefs are
// interpolated raw into SVG attributes and the SVG goes through sharp/librsvg
// (GHSA-wq5f-xc86-pv6w). /api/thumbs/demo is public and passed ?accent= and
// ?shade= straight through; preview accepted any data:image/* (incl. SVG).
// The fix sanitises once at the shared render entry points so every route
// (demo, preview, bulk) is covered. Spec + QA: docs/qa/thumbs-svg-safety-qa.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildThumbSvg, safeThumbOpts, isSafeImageDataUrl } from '../studio/lib/thumb-templates.js';
import { renderV2ById, v2List } from '../studio/lib/thumb-templates-v2.js';

const EVIL_COLOR = '#fff"/><image href="https://attacker.example/x.svg"/><rect fill="#000';
const EVIL_HREF = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=';
const GOOD_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDA==';

test('R1: safeThumbOpts keeps #RRGGBB colours and drops anything else', () => {
  assert.equal(safeThumbOpts({ accent: '#E8C15A' }).accent, '#E8C15A');
  assert.equal(safeThumbOpts({ shade: '#0a1128' }).shade, '#0a1128');
  for (const bad of [EVIL_COLOR, 'red', '#fff', '#GGGGGG', 'url(#x)', ' #E8C15A', '#E8C15A"']) {
    assert.equal(safeThumbOpts({ accent: bad }).accent, undefined, `accent ${bad}`);
    assert.equal(safeThumbOpts({ shade: bad }).shade, undefined, `shade ${bad}`);
  }
});

test('R2: only base64 jpeg/png/webp dataURLs are accepted as image hrefs', () => {
  assert.equal(isSafeImageDataUrl(GOOD_JPEG), true);
  assert.equal(isSafeImageDataUrl('data:image/png;base64,iVBORw0KGgo='), true);
  assert.equal(isSafeImageDataUrl('data:image/webp;base64,UklGRg=='), true);
  for (const bad of [EVIL_HREF, 'https://images.pexels.com/a.jpg', 'data:image/jpeg;base64,abc"/><x', 'data:image/gif;base64,R0lG', 'javascript:alert(1)', '', null]) {
    assert.equal(isSafeImageDataUrl(bad), false, `must reject ${String(bad).slice(0, 40)}`);
  }
  const o = safeThumbOpts({ photoHref: EVIL_HREF, faceImage: EVIL_HREF });
  assert.equal(o.photoHref, '');
  assert.equal(o.faceImage, '');
});

test('R3: a hostile accent/shade/photo never reaches the V1 SVG', () => {
  const svg = buildThumbSvg('poster', { title: 'Safe Title Here', accent: EVIL_COLOR, shade: EVIL_COLOR, photoHref: EVIL_HREF });
  assert.doesNotMatch(svg, /attacker\.example/);
  assert.doesNotMatch(svg, /image\/svg\+xml/);
  assert.match(svg, /#E8C15A/, 'falls back to the default accent');
});

test('R3: a hostile accent/shade/photo/face never reaches any V2 SVG', () => {
  const ids = v2List().map((t) => t.id);
  assert.ok(ids.length > 0);
  for (const id of ids) {
    const svg = renderV2ById(id, { title: 'Safe Title Here', accent: EVIL_COLOR, shade: EVIL_COLOR, photoHref: EVIL_HREF, faceImage: EVIL_HREF });
    assert.doesNotMatch(svg, /attacker\.example/, id);
    assert.doesNotMatch(svg, /image\/svg\+xml/, id);
  }
});

test('R4: demo route validates colours (it is public) and preview restricts uploaded dataURLs', () => {
  const demo = fs.readFileSync('studio/app/api/thumbs/demo/route.js', 'utf8');
  assert.match(demo, /HEX_COLOR\.test\(accent\)/);
  assert.match(demo, /HEX_COLOR\.test\(shade\)/);
  const preview = fs.readFileSync('studio/app/api/thumbs/preview/route.js', 'utf8');
  assert.match(preview, /isSafeImageDataUrl\(photoDataUrl\)/);
  assert.doesNotMatch(preview, /photoDataUrl\.startsWith\('data:image\/'\)/);
});
