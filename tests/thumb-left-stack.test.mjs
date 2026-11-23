// Left Stack — the Money Rulebook doc thumbnail look, now a v2 catalog design
// (visible in /thumbs). Pins the parts that make it that look: left-side fade,
// last word in salmon, letterspaced brand mark bottom-right, no SVG filters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderV2ById, isV2Template, v2List } from '../studio/lib/thumb-templates-v2.js';

test('left-stack is listed in the v2 gallery as a photo design', () => {
  assert.ok(isV2Template('v2/left-stack'));
  const row = v2List().find((t) => t.id === 'v2/left-stack');
  assert.equal(row.label, 'Left Stack');
  assert.equal(row.needsPhoto, true);
});

test('left-stack renders the fade, the salmon last word and the brand mark, with no filters', () => {
  const svg = renderV2ById('v2/left-stack', { title: 'The red flags of fake wealth', brand: 'MONEYRULEBOOK', accent: '#3DDC97' });
  assert.match(svg, /linearGradient id="v2side"/);
  assert.match(svg, /url\(#v2side\)/);
  assert.equal((svg.match(/fill="#F0776E"/g) || []).length, 1, 'exactly one word takes the salmon accent');
  assert.doesNotMatch(svg, /#3DDC97/, 'the kit accent does not override the template salmon');
  assert.equal((svg.match(/fill-opacity="0.92"/g) || []).length, 'MONEYRULEBOOK'.length, 'brand mark drawn glyph by glyph');
  assert.doesNotMatch(svg, /<filter|feGaussianBlur/);
});

test('without a brand the mark is omitted; other designs keep the bottom-left tag', () => {
  const bare = renderV2ById('v2/left-stack', { title: 'Quiet money' });
  assert.doesNotMatch(bare, /fill-opacity="0.92"/);
  const other = renderV2ById('v2/ketchup', { title: 'Quiet money', brand: 'MR' });
  assert.match(other, /stroke="#000000" stroke-width="4"/, 'ketchup still uses the stroked bottom-left tag');
});

// Channel → Thumbnails (owner 2026-11-23): Left Stack is pickable, and the
// engine feeds it a frame from the video so it never ships as a blank canvas.
test('engine: a photo:frame design is drawn on the supplied video frame; no frame = degrade, never a blank thumb', async () => {
  const { renderRegistryThumb } = await import('../youtube-engine.mjs');
  const { loadThumbRegistry } = await import('../studio/lib/thumb-registry.mjs');
  const design = loadThumbRegistry().designs.find((d) => d.id === 'left-stack');
  assert.equal(design.photo, 'frame');
  const brand = { accent: '#3DDC97', bg: '#101314', label: 'THE MONEY RULEBOOK' };
  const script = { thumbHeadline: 'The red flags of fake wealth' };
  const { fileURLToPath } = await import('node:url');
  const frame = fileURLToPath(new URL('../thumbnails/photos/mr-1.jpg', import.meta.url));
  const jpeg = await renderRegistryThumb(design, brand, script, { photoFile: frame });
  assert.ok(jpeg.length > 30_000, `a photo thumbnail is a real image, got ${jpeg.length} bytes`);
  await assert.rejects(renderRegistryThumb(design, brand, script, {}), /needs a video frame/);
});
