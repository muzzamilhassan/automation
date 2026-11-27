// Video Templates gallery (Round 2 — "templates demo doesn't show properly").
// Behavioral tests for the pure merge/dedupe/filter core
// (studio/lib/templates-gallery.mjs) + source scans pinning the page wiring:
// real poster/video media, the honest no-preview placeholder, the Drawer
// detail, kit buttons (no sky/zinc palette) and working action hrefs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildGallery, galleryFacets, filterGallery, previewFor, ratiosForFormats,
  humanizeId, voiceLabel, sectionLabel, createHref, registryDetailHref, majorOf,
} from '../studio/lib/templates-gallery.mjs';
import { TEMPLATES_DATA, TEMPLATE_CATEGORIES } from '../studio/lib/templates-catalog.js';
import { REGISTRY_META } from '../studio/lib/template-registry.data.js';
import { loadRegistryTemplates } from '../studio/lib/template-registry.js';

const catalog = [
  { id: 'documentary-frames', family: 'documentary-frames', name: 'Documentary Master Frames', category: 'documentary', aspectRatios: ['16:9', '9:16'], desc: 'Editorial frames.', usedFor: 'Deep dives', variants: ['chapter-card'] },
  { id: 'map-journeys', family: 'map-journeys', name: 'Geopolitical & Route Maps', category: 'documentary', aspectRatios: ['16:9'], desc: 'Map animations.', usedFor: 'War analysis', variants: ['flight-path'] },
];
const categories = [{ id: 'all', label: 'All Templates' }, { id: 'documentary', label: 'Documentary & Cinema' }];
const registryTemplates = [
  {
    templateId: 'documentary-frames', family: 'documentary-frames', name: 'Documentary Master Frames',
    registry: { version: '1.0.0', niches: ['History stories'], formats: ['long', 'short'], safety: { required_sources: true, review_required: [] } },
  },
  {
    templateId: 'history-storybook', family: 'documentary-frames', name: 'History Storybook', // loader name (templateDisplayName)
    registry: {
      version: '1.2.0', niches: ['History stories'], formats: ['long'],
      doc_presentation: { voice: 'en-GB-RyanNeural', music_mood: 'epic', theme: 'history', doc_layouts: ['split', 'map'] },
      story_structure: { doc_render: 'storybook', sections: ['cold_open', 'chapters:10', 'outro'], beats: ['b1', 'b2'], chapter_min_words: 170 },
      safety: { required_sources: true, review_required: ['finance'], disclaimers: ['Education only.'] },
    },
  },
  {
    templateId: 'systems-diagram', family: 'documentary-frames', name: 'Systems Diagram',
    registry: {
      version: '1.0.0', niches: ['AI & future tech', 'Science & how things work'], formats: ['short', 'long'],
      story_structure: { doc_render: 'diagram', format_description: 'Ten numbered parts.' },
    },
  },
];
const samples = {
  'systems-diagram': { mp4: '/api/template-previews/media?id=systems-diagram&kind=mp4', poster: '/api/template-previews/media?id=systems-diagram&kind=poster', familyId: 'documentary-frames' },
  'draft-history-storybook': { mp4: null, poster: '/api/template-previews/media?id=draft-history-storybook&kind=poster' },
};

test('buildGallery merges registry + catalog, deduped by id (registry wins)', () => {
  const items = buildGallery({ catalog, registryTemplates, samples, categories });
  const ids = items.map((i) => i.id).sort();
  assert.deepEqual(ids, ['documentary-frames', 'history-storybook', 'map-journeys', 'systems-diagram']);
  const frames = items.find((i) => i.id === 'documentary-frames');
  assert.equal(frames.assignable, true, 'the registry copy of the family wins');
  assert.equal(frames.name, 'Documentary Master Frames');
  assert.equal(frames.description, 'Editorial frames.', 'the family IS this template, so its blurb applies');
  assert.deepEqual(frames.niches, ['History stories']);
  const maps = items.find((i) => i.id === 'map-journeys');
  assert.equal(maps.assignable, false, 'a catalog-only family is never offered for assignment');
  assert.deepEqual(maps.ratios, ['16:9']);
});

test('registry templates sharing a family get their OWN name and description — never the family blurb', () => {
  const items = buildGallery({ catalog, registryTemplates, samples, categories });
  const story = items.find((i) => i.id === 'history-storybook');
  assert.equal(story.name, 'History Storybook');
  assert.notEqual(story.description, 'Editorial frames.');
  assert.match(story.description, /Storybook documentary template for History stories/);
  assert.equal(story.kind, 'storybook');
  assert.deepEqual(story.ratios, ['16:9'], 'formats long → 16:9 only');
  assert.equal(story.look.voice, 'en-GB-RyanNeural');
  assert.deepEqual(story.structure.sections, ['cold_open', 'chapters:10', 'outro']);
  assert.deepEqual(story.safety.review, ['finance']);
  const diagram = items.find((i) => i.id === 'systems-diagram');
  assert.equal(diagram.description, 'Ten numbered parts.', 'format_description is the template\'s own words');
  assert.deepEqual(diagram.ratios, ['16:9', '9:16'], 'ratios are ordered 16:9 first regardless of format order');
});

test('previews: own render only (incl. draft- key); no borrowing from the family; ready previews sort first', () => {
  const items = buildGallery({ catalog, registryTemplates, samples, categories });
  assert.equal(items[0].id, 'systems-diagram', 'the mp4-ready template leads the grid');
  assert.equal(items[1].id, 'history-storybook', 'poster-only next');
  assert.equal(items.find((i) => i.id === 'history-storybook').preview.poster, samples['draft-history-storybook'].poster);
  assert.equal(items.find((i) => i.id === 'history-storybook').preview.mp4, null);
  // systems-diagram's family is documentary-frames — the family card must NOT borrow its video
  assert.equal(items.find((i) => i.id === 'documentary-frames').preview, null);
  assert.equal(items.find((i) => i.id === 'map-journeys').preview, null);
  assert.equal(previewFor('x', { x: { mp4: null, poster: null } }), null, 'an empty row is no preview');
  assert.equal(previewFor('x', null), null);
});

test('previews API failure still yields the full list with honest null previews', () => {
  const items = buildGallery({ catalog, registryTemplates, samples: {}, categories });
  assert.equal(items.length, 4);
  assert.ok(items.every((i) => i.preview === null));
  // registry failure: base families only, still renderable
  const base = buildGallery({ catalog, registryTemplates: [], samples, categories });
  assert.deepEqual(base.map((i) => i.id).sort(), ['documentary-frames', 'map-journeys']);
  assert.ok(base.every((i) => i.assignable === false));
});

test('filterGallery: category, format, niche and search compose', () => {
  const items = buildGallery({ catalog, registryTemplates, samples, categories });
  assert.deepEqual(filterGallery(items, { kind: 'storybook' }).map((i) => i.id), ['history-storybook']);
  assert.deepEqual(filterGallery(items, { ratio: '9:16' }).map((i) => i.id).sort(), ['documentary-frames', 'systems-diagram']);
  assert.deepEqual(filterGallery(items, { niche: 'History stories' }).map((i) => i.id).sort(), ['documentary-frames', 'history-storybook']);
  assert.deepEqual(filterGallery(items, { query: 'ROUTE maps' }).map((i) => i.id), ['map-journeys'], 'search is case-insensitive over name');
  assert.deepEqual(filterGallery(items, { query: 'science' }).map((i) => i.id), ['systems-diagram'], 'search covers niches');
  assert.deepEqual(filterGallery(items, { kind: 'storybook', ratio: '9:16' }), []);
  assert.equal(filterGallery(items, {}).length, 4);
});

test('galleryFacets: real counts from the items', () => {
  const f = galleryFacets(buildGallery({ catalog, registryTemplates, samples, categories }));
  assert.deepEqual(f.kinds.find((k) => k.id === 'documentary'), { id: 'documentary', label: 'Documentary & Cinema', count: 2 });
  assert.equal(f.kinds.find((k) => k.id === 'diagram').label, 'Animated diagram');
  assert.deepEqual(f.niches.find((n) => n.id === 'History stories'), { id: 'History stories', count: 2 });
  assert.equal(f.withPreview, 2);
});

test('small helpers', () => {
  assert.deepEqual(ratiosForFormats(['short', 'long', 'bogus']), ['16:9', '9:16']);
  assert.equal(humanizeId('mr-case-files-storybook'), 'MR Case Files Storybook');
  assert.equal(humanizeId('ai-storybook'), 'AI Storybook');
  assert.equal(voiceLabel('en-GB-RyanNeural'), 'Ryan (en-GB)');
  assert.equal(voiceLabel(''), '');
  assert.equal(sectionLabel('chapters:10'), '10 chapters');
  assert.equal(sectionLabel('cold_open'), 'Cold open');
  assert.equal(createHref('a b'), '/create?template=a%20b');
  assert.equal(registryDetailHref('x-y'), '/templates/registry/detail?template=x-y');
  assert.equal(majorOf('2.1.0'), 2);
  assert.equal(majorOf(''), null);
});

test('real data: every registry template + every unregistered family appears exactly once', () => {
  const view = loadRegistryTemplates(TEMPLATES_DATA, REGISTRY_META);
  const items = buildGallery({ catalog: TEMPLATES_DATA, registryTemplates: view.templates, samples: {}, categories: TEMPLATE_CATEGORIES });
  const ids = items.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicates');
  for (const t of view.templates) assert.ok(ids.includes(t.templateId), `${t.templateId} listed`);
  for (const c of TEMPLATES_DATA) assert.ok(ids.includes(c.id), `${c.id} listed`);
  assert.ok(items.length >= 20, `the gallery shows the real 20+ templates (got ${items.length})`);
  const names = items.map((i) => i.name);
  assert.equal(new Set(names).size, names.length, 'every card has a distinct name (no family-name clones)');
});

// ---------------------------------------------------------------- source scans
const page = fs.readFileSync('studio/app/templates/page.js', 'utf8');
const regPage = fs.readFileSync('studio/app/templates/registry/page.js', 'utf8');
const detailPage = fs.readFileSync('studio/app/templates/registry/detail/page.js', 'utf8');
// feedback r1 G: the card media moved to a shared component (the channel
// template drawer reuses it — one preview mechanism)
const media = fs.readFileSync('studio/components/TemplatePreviewMedia.js', 'utf8');

test('page: same data path as the wizard (#115) and the tested core', () => {
  assert.match(page, /fetch\('\/api\/templates'\)/);
  assert.match(page, /fetch\('\/api\/template-previews'\)/);
  assert.match(page, /buildGallery\(\{ catalog: TEMPLATES_DATA, registryTemplates: reg\.templates, samples: prev\.samples/);
  assert.match(page, /filterGallery\(items, \{ kind, ratio, niche, query, retired: showRetired \}\)/);
});

test('page: cards show the real poster (lazy) and play the mp4 muted+looped on hover/tap', () => {
  assert.match(page, /<TemplatePreviewMedia item=\{item\} previewState=\{previewState\} onOpen=\{onOpen\} \/>/, 'the card renders the shared media component');
  assert.match(media, /<img\s+src=\{poster\}[\s\S]{0,120}loading="lazy"/);
  assert.match(media, /<video\s+src=\{mp4\}[\s\S]{0,200}muted\s+loop\s+playsInline/);
  assert.match(media, /onPointerEnter=\{\(e\) => \{ if \(e\.pointerType === 'mouse' && mp4\) play\(\)/, 'hover plays for mouse only');
  assert.match(media, /pointer\.current !== 'mouse' && mp4\) \{\s*toggle\(\)/, 'tap toggles on touch');
  assert.doesNotMatch(media, /familySamples/, 'no borrowing a family sample for a sibling template');
  assert.doesNotMatch(page, /TemplateSimulator/, 'the simulated fake demo is gone from the gallery');
  assert.doesNotMatch(page, /familySamples/, 'no borrowing a family sample for a sibling template');
});

test('page: honest placeholders and error/loading states', () => {
  assert.match(media, /'Preview not rendered yet'/);
  assert.match(page, /Previews can't load right now — template list still shown\./);
  assert.match(page, /<GallerySkeleton \/>/);
  assert.match(media, /onError=\{\(\) => setPosterBroken\(true\)\}/, 'a broken poster falls back to the placeholder');
});

test('page: detail opens in the shared Drawer (xl) with player, usage and working actions', () => {
  assert.match(page, /import Drawer from '@\/components\/Drawer'/);
  assert.match(page, /<Drawer\s+open[\s\S]{0,80}size="xl"/);
  assert.match(page, /<video\s+src=\{mp4\}[\s\S]{0,120}controls/);
  assert.match(page, /fetch\(`\/api\/templates\?template=\$\{encodeURIComponent\(item\.id\)\}`\)/, 'usage = the registry usage query');
  assert.match(page, /href=\{createHref\(item\.createStyle\)\}/, 'Create a video → /create?template=<its Create style> (data-mapped only, T5-05)');
  assert.match(page, /fetch\('\/api\/templates\/assign', \{\s*method: 'POST'/, 'Use on a channel → the real assign API');
  assert.match(page, /templateId: item\.id, pinnedMajor: majorOf\(item\.version\)/);
  assert.match(page, /friendlyReason\(rs\)/, '422 reasons render in plain English');
  assert.match(page, /href=\{registryDetailHref\(item\.id\)\}/);
  assert.doesNotMatch(page, /href="#"/);
});

test('contrast: kit buttons, no sky/zinc/raw-px classes on the template surfaces', () => {
  for (const [name, src] of [['gallery', page], ['registry', regPage], ['detail', detailPage]]) {
    assert.doesNotMatch(src, /\b(?:text|bg|border)-(?:sky|zinc)-/, `${name}: no sky/zinc palette`);
    assert.doesNotMatch(src, /text-\[\d+px\]/, `${name}: type scale utilities only`);
  }
  assert.match(page, /className="btn btn-primary" onClick=\{\(\) => \{ setMode\('assign'\)/);
  assert.match(page, /className="btn btn-primary" onClick=\{assign\}/);
});

// 2026-11-27 owner: "the shorts templates are not showing"
test('the two Shorts looks show in the gallery, under 9:16, and are never assigned like a long-video template', async () => {
  const { TEMPLATES_DATA, TEMPLATE_CATEGORIES } = await import('../studio/lib/templates-catalog.js');
  const { buildGallery: build, filterGallery: filter } = await import('../studio/lib/templates-gallery.mjs');
  const items = build({ catalog: TEMPLATES_DATA, registryTemplates: [], samples: {}, categories: TEMPLATE_CATEGORIES });
  const shorts = filter(items, { ratio: '9:16', kind: 'shorts' });
  assert.deepEqual(shorts.map((s) => s.id).sort(), ['shorts-clipped', 'shorts-fresh']);
  for (const s of shorts) {
    assert.equal(s.assignable, false);
    assert.match(s.usedFor, /Where Shorts come from/);
    assert.equal(s.kindLabel, 'Shorts');
  }
  assert.equal(shorts.find((s) => s.id === 'shorts-fresh').preview.poster, '/styles/cinematic.jpg');
});
