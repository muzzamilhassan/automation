// 2026-11-23 owner report: "on admin panel … its preview showing something else".
// Pins the fixes: whole-word photo rules, no authoring notes on screen, the
// storybook preview renderer refuses non-storybook templates, no family borrowing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { extractVisualQuery, previewLines, isAuthoringNote } from '../lib/template-preview.mjs';
import { REGISTRY_META } from '../studio/lib/template-registry.data.js';

test('photo rules match WHOLE words: "mountain"/"explained"/"chain" are not "ai"', () => {
  assert.notEqual(extractVisualQuery({ template_id: 'x' }, 'The supply chain explained', 'mountain trade paid off'), 'data center server artificial intelligence coding');
  assert.equal(extractVisualQuery({ template_id: 'x' }, 'How AI recruiters read your CV', ''), 'data center server artificial intelligence coding');
  assert.equal(extractVisualQuery({ template_id: 'old-banners-storybook' }, 'Three routes crossed one mountain pass', ''), 'ancient mountain fortress mist castle');
});

test('authoring notes ("slot 1 …") never become preview lines', () => {
  assert.equal(isAuthoringNote('slot 1 states the popular money myth'), true);
  assert.equal(isAuthoringNote('Opening: The criteria up front'), false);
  for (const [id, meta] of Object.entries(REGISTRY_META)) {
    const l = previewLines(meta);
    for (const k of ['hook', 'photoLine', 'videoLine', 'sub']) {
      if (l[k] !== undefined) assert.equal(isAuthoringNote(l[k]), false, `${id}.${k}: "${l[k]}"`);
    }
  }
});

test('previewLines: note-only templates use their own exemplar titles', () => {
  const l = previewLines({ story_structure: { beats: ['slot 1 does x', 'slot 2 does y'], title_patterns: ['listicle ("7 Money Habits")', 'rules ("6 Rules for $10,000")', 'myths ("5 Money Myths")'] } });
  assert.equal(l.hook, '6 Rules for $10,000');
  assert.equal(l.photoLine, '5 Money Myths');
});

test('the storybook preview renderer refuses non-storybook templates before rendering', () => {
  const src = fs.readFileSync(new URL('../scripts/render-template-preview.mjs', import.meta.url), 'utf8');
  const guard = src.indexOf("if (docRender !== 'storybook')");
  assert.ok(guard > 0, 'guard missing');
  assert.ok(guard < src.indexOf('fetchPhoto'), 'guard must run before any media/render work');
});

test('gallery hides retired (deprecated) templates unless asked; the 6 legacy b-roll templates are retired', async () => {
  const { filterGallery } = await import('../studio/lib/templates-gallery.mjs');
  const items = [{ id: 'a', kind: 'k', ratios: [], niches: [], name: 'A', deprecated: false }, { id: 'b', kind: 'k', ratios: [], niches: [], name: 'B', deprecated: true }];
  assert.deepEqual(filterGallery(items).map((i) => i.id), ['a']);
  assert.deepEqual(filterGallery(items, { retired: true }).map((i) => i.id), ['a', 'b']);
  for (const id of ['documentary-frames', 'timeline-history', 'photo-stories', 'finance-explainers', 'editorial-headlines', 'myth-vs-money']) {
    assert.equal(REGISTRY_META[id].deprecated, true, id);
    assert.equal(REGISTRY_META[id].deprecated_on, '2026-11-23', id);
  }
  assert.equal(REGISTRY_META['red-flags-explained'].deprecated, false, 'the template Money Rulebook runs stays active');
});

test('the AI templates wait for owner approval (2026-11-24: an empty list published unreviewed)', async () => {
  const { resolveGating } = await import('../lib/review-gate.mjs');
  for (const id of ['systems-diagram', 'lecture-notes-paper', 'silicon-pulse-storybook']) {
    assert.deepEqual(REGISTRY_META[id].safety.review_required, ['all'], id);
    const registryDb = { listAssignments: async () => [{ family_id: id }] };
    const g = await resolveGating({ slug: 'yt-bot', registryDb, db: registryDb, templateMeta: (t) => REGISTRY_META[t] });
    assert.equal(g.state, 'gated', id);
    assert.equal(g.familyId, id, 'gated by the template itself, not the unreadable-database fallback');
  }
});
