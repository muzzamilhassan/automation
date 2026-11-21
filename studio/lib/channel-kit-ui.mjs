// Client-safe helpers for the per-channel kit fields (feedback round 1, A + G).
// Light on purpose: client components use these without bundling the
// thumbnail registry (the only import is the data-free readiness module).
// Validation lives in channel-kit-fields.mjs.
import { storyShapeOfKit } from './channel-readiness.mjs';

export const PICKER_MIN = 2; // the UI asks for 2–5 designs (rotation room)
export const PICKER_MAX = 5;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

// UI: the three-way switch <-> the saved value.
export function chapterModeOf(kit) {
  const v = kit && typeof kit === 'object' ? kit.hasChapters : undefined;
  return v === true ? 'chapters' : v === false ? 'story' : 'default';
}

export function chapterValueFor(mode) {
  return mode === 'chapters' ? true : mode === 'story' ? false : null;
}

// 2026-11-21 readiness: the Story shape switch with a real "not picked yet".
// 'default' (Template default) counts only once the owner picked it
// (kit.storyShape 'template'); an untouched channel reads 'unset'.
const MODE_BY_SHAPE = { template: 'default', full: 'story', chapters: 'chapters' };
const SHAPE_BY_MODE = { default: 'template', story: 'full', chapters: 'chapters' };

export function storyModeOf(kit) {
  return MODE_BY_SHAPE[storyShapeOfKit(kit)] || 'unset';
}

export function storyShapeFor(mode) {
  return SHAPE_BY_MODE[mode] || null;
}

// UI: a set can be saved when it is empty (automatic) or 2–5 designs.
export function canSaveThumbSet(n) {
  return n === 0 || (n >= PICKER_MIN && n <= PICKER_MAX);
}

// The real sample: the public demo route renders the design through the same
// v2 renderer the engine uses, in the channel's accent when it is a valid hex.
export function thumbDemoUrl(id, accent) {
  const q = new URLSearchParams({ id: `v2/${id}` });
  if (HEX_COLOR.test(String(accent || ''))) q.set('accent', accent);
  return `/api/thumbs/demo?${q.toString()}`;
}
