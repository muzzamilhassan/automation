// Feedback round 1 (A + G) — thumbnail design picker, the per-channel
// Thumbnails drawer panel, the wizard wiring, and the template drawer's demo
// cards + Full story / Chapters switch. Components use '@/' imports, so they
// are pinned by source scans (String.raw regexes; CRLF-safe via \s).
// Spec + QA: docs/qa/feedback-r1-templates-thumbs-qa.md.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { thumbDemoUrl, canSaveThumbSet, PICKER_MAX } from '../studio/lib/channel-kit-fields.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const PICKER = read('studio/components/ThumbnailDesignPicker.js');
const PANEL = read('studio/components/ThumbnailAssignPanel.js');
const STEP = read('studio/components/wizard/ThumbnailStep.js');
const PAGE = read('studio/app/channels/add/page.js');
const TPL = read('studio/components/TemplateAssignPanel.js');
const MEDIA = read('studio/components/TemplatePreviewMedia.js');
const GALLERY = read('studio/app/templates/page.js');

describe('pure helpers', () => {
  test('thumbDemoUrl: the real v2 render via the demo route, in the channel accent', () => {
    assert.equal(thumbDemoUrl('blackout', '#E8C15A'), '/api/thumbs/demo?id=v2%2Fblackout&accent=%23E8C15A');
    assert.equal(thumbDemoUrl('blackout'), '/api/thumbs/demo?id=v2%2Fblackout', 'no accent -> design default');
    assert.equal(thumbDemoUrl('blackout', 'red'), '/api/thumbs/demo?id=v2%2Fblackout', 'a non-hex accent is dropped (the route would 400)');
  });

  test('canSaveThumbSet: none (automatic) or 2-5', () => {
    assert.equal(canSaveThumbSet(0), true);
    assert.equal(canSaveThumbSet(1), false);
    for (let n = 2; n <= PICKER_MAX; n++) assert.equal(canSaveThumbSet(n), true, String(n));
    assert.equal(canSaveThumbSet(PICKER_MAX + 1), false);
  });
});

describe('A1/A2 — ThumbnailDesignPicker', () => {
  test('lists the thumbnail registry designs', () => {
    assert.match(PICKER, /^'use client';/);
    assert.match(PICKER, /fetch\('\/api\/thumbs\/registry'\)/);
    assert.match(PICKER, /export default function ThumbnailDesignPicker\(\{ value, onChange, accent, niche, readOnly, onLoaded \}\)/);
  });

  test('every tile is a real rendered image; a failed image says "No preview yet"', () => {
    assert.match(PICKER, /<img\s+src=\{thumbDemoUrl\(d\.id, accent\)\}[\s\S]{0,200}loading="lazy"/);
    assert.match(PICKER, /onError=\{\(\) => markBroken\(d\.id\)\}/);
    assert.match(PICKER, /No preview yet/);
  });

  test('tick up to 5; the copy says 2-5 or none = automatic', () => {
    assert.match(PICKER, /role="checkbox"/);
    assert.match(PICKER, /aria-checked=\{on\}/);
    assert.match(PICKER, /const full = picked\.length >= PICKER_MAX;/);
    assert.match(PICKER, /else if \(!full\) onChange\(\[\.\.\.picked, id\]\)/);
    assert.match(PICKER, /Pick 2–5 designs/);
    assert.match(PICKER, /none/i);
  });

  test('uses the design tokens, not raw px sizes', () => {
    assert.doesNotMatch(PICKER, /text-\[\d+px\]/);
    assert.match(PICKER, /var\(--accent\)/);
  });
});

describe('A3 — the wizard Thumbnails step + payload', () => {
  test('the step renders the picker bound to form.thumbTemplates', () => {
    assert.match(STEP, /import ThumbnailDesignPicker from '@\/components\/ThumbnailDesignPicker'/);
    assert.match(STEP, /<ThumbnailDesignPicker[\s\S]{0,200}value=\{form\.thumbTemplates \|\| \[\]\}[\s\S]{0,200}onChange=\{\(ids\) => setField\('thumbTemplates', ids\)\}/);
  });

  test('the save payload carries thumbTemplates only when the owner set (or loaded) a list', () => {
    assert.match(PAGE, /\.\.\.\(Array\.isArray\(form\.thumbTemplates\) \? \{ thumbTemplates: form\.thumbTemplates \} : \{\}\),/);
  });

  test('edit mode prefills the saved set (an untouched save never wipes it)', () => {
    assert.match(PAGE, /thumbTemplates: Array\.isArray\(entry\.kit\?\.thumbTemplates\) \? entry\.kit\.thumbTemplates : undefined,/);
  });
});

describe('A6 — ThumbnailAssignPanel (drawer contract = SchedulePanel)', () => {
  test('signature + frame contract with Save in the footer', () => {
    assert.match(PANEL, /export default function ThumbnailAssignPanel\(\{ slug, frame \}\)/);
    assert.match(PANEL, /if \(frame\) return frame\(body, footer, \{ dirty \}\);/); // + B4 dirty-guard contract
    assert.match(PANEL, /const footer = isOwner \? \([\s\S]*Save designs/);
  });

  test('loads the current set from the profile and saves through the profile route', () => {
    assert.match(PANEL, /fetch\(`\/api\/channels\/profile\?slug=\$\{encodeURIComponent\(slug\)\}`\)/);
    assert.match(PANEL, /body: JSON\.stringify\(\{ slug, kit: \{ thumbTemplates: picked \} \}\)/);
    assert.match(PANEL, /isDisabled=\{!canSaveThumbSet\(picked\.length\) \|\| saving \|\| !loaded\}/);
  });

  test('staff sees it read-only', () => {
    assert.match(PANEL, /const isOwner = me\?\.role === 'owner';/);
    assert.match(PANEL, /readOnly=\{!isOwner\}/);
  });
});

describe('G1/G2 — TemplateAssignPanel shows real demos', () => {
  test('fetches the CI previews and renders the shared media component', () => {
    assert.match(TPL, /fetchJsonWithTimeout\('\/api\/template-previews', \{ timeoutMs: LOAD_TIMEOUT_MS \}\)/); // live-fix B1 T3-04: time-limited
    assert.match(TPL, /import TemplatePreviewMedia from '@\/components\/TemplatePreviewMedia'/);
    assert.match(TPL, /<TemplatePreviewMedia\b/);
    assert.match(TPL, /previewFor\(t\.templateId, samples\.samples\)/);
  });

  test('the assigned template is clearly marked on its card', () => {
    assert.match(TPL, /assignedIds\.has\(t\.templateId\)/);
    assert.match(TPL, /<Chip tone="ok"[^>]*>Assigned<\/Chip>/);
  });

  test('cards select the template for the owner only; the pinned-major select stays', () => {
    assert.match(TPL, /aria-pressed=\{selected\}/);
    assert.match(TPL, /disabled=\{!isOwner\}/);
    assert.match(TPL, /id=\{`tpl-major-\$\{slug\}`\}/);
  });

  test('the gallery and the drawer share ONE media component', () => {
    assert.match(GALLERY, /import TemplatePreviewMedia, \{ MediaPlaceholder \} from '@\/components\/TemplatePreviewMedia'/);
    assert.match(GALLERY, /<TemplatePreviewMedia\b/);
    assert.match(MEDIA, /export default function TemplatePreviewMedia\(/);
    assert.match(MEDIA, /export function MediaPlaceholder\(/);
  });
});

describe('G3/G4 — Full story / Chapters switch', () => {
  // 2026-11-21 readiness: an untouched channel shows NOTHING picked (Template
  // default became a real, saved choice — kit.storyShape 'template').
  test('three plain choices; an untouched channel shows none picked', () => {
    assert.match(TPL, /\{ value: 'default', label: 'Template default' \}/);
    assert.match(TPL, /\{ value: 'story', label: 'Full story' \}/);
    assert.match(TPL, /\{ value: 'chapters', label: 'Chapters' \}/);
    assert.match(TPL, /storyModeOf\(/);
  });

  test('saves kit.hasChapters + kit.storyShape through the profile route (owner only)', () => {
    assert.match(TPL, /body: JSON\.stringify\(\{ slug, kit: \{ hasChapters: chapterValueFor\(mode\), storyShape: storyShapeFor\(mode\) \} \}\)/);
    assert.match(TPL, /if \(!isOwner\b/);
  });
});
