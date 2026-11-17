// #115 — pin-tests for the wizard's production-template hover previews.
// The helpers are pure (no DOM) so these run under plain node --test:
// previewSourceFor = which video/poster a template card shows;
// popupAnchorFor = where the zoomed hover popup lands, clamped on-screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewSourceFor, popupAnchorFor } from '../studio/lib/wizard-preview-helpers.js';

test('#115: previewSourceFor — the template own sample wins over the family sample', () => {
  const src = previewSourceFor(
    'systems-diagram',
    'systems',
    { 'systems-diagram': { mp4: '/api/template-previews/media?id=systems-diagram&kind=mp4', poster: '/p.jpg' } },
    { systems: { mp4: '/family.mp4', poster: '/family.jpg' } },
  );
  assert.equal(src.mp4, '/api/template-previews/media?id=systems-diagram&kind=mp4');
  assert.equal(src.poster, '/p.jpg');
});

test('#115: previewSourceFor — falls back to the family sample when no own row', () => {
  const src = previewSourceFor('no-row-template', 'systems', {}, { systems: { mp4: '/family.mp4', poster: '/family.jpg' } });
  assert.equal(src.mp4, '/family.mp4');
  assert.equal(src.poster, '/family.jpg');
});

test('#115: previewSourceFor — poster-only row still previews (mp4 null)', () => {
  const src = previewSourceFor('t', 'f', { t: { poster: '/only.jpg' } }, {});
  assert.equal(src.mp4, null);
  assert.equal(src.poster, '/only.jpg');
});

test('#115: previewSourceFor — empty rows and missing maps give null (no preview affordance)', () => {
  assert.equal(previewSourceFor('t', 'f', {}, {}), null);
  assert.equal(previewSourceFor('t', 'f', { t: {} }, { f: {} }), null);
  assert.equal(previewSourceFor('t', 'f'), null);
  assert.equal(previewSourceFor('t', 'f', undefined, undefined), null);
});

test('#115: popupAnchorFor — prefers the right side when there is room', () => {
  const pos = popupAnchorFor(
    { left: 100, right: 300, top: 100, bottom: 160 },
    { width: 360, height: 300 },
    { width: 1440, height: 900 },
  );
  assert.equal(pos.placement, 'right');
  assert.equal(pos.left, 310); // cardRect.right + gap(10)
  assert.equal(pos.top, 100);
});

test('#115: popupAnchorFor — flips to the left when the right side overflows', () => {
  const pos = popupAnchorFor(
    { left: 1200, right: 1400, top: 100, bottom: 160 },
    { width: 360, height: 300 },
    { width: 1440, height: 900 },
  );
  assert.equal(pos.placement, 'left');
  assert.equal(pos.left, 1200 - 10 - 360); // cardRect.left - gap - popupWidth
});

test('#115: popupAnchorFor — falls below-center and clamps when neither side fits', () => {
  const pos = popupAnchorFor(
    { left: 40, right: 140, top: 100, bottom: 160 },
    { width: 400, height: 300 },
    { width: 500, height: 900 },
  );
  assert.equal(pos.placement, 'below');
  assert.ok(pos.left >= 12, 'left respects the viewport margin');
  assert.ok(pos.left + 400 <= 488, 'popup right edge respects the margin');
});

test('#115: popupAnchorFor — clamps the popup inside the viewport vertically', () => {
  const pos = popupAnchorFor(
    { left: 100, right: 300, top: 700, bottom: 760 },
    { width: 360, height: 300 },
    { width: 1440, height: 800 },
  );
  assert.ok(pos.top + 300 <= 788, `top+popup height must respect the bottom margin, got ${pos.top}`);
  assert.ok(pos.top >= 12);
});
