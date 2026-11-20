// Live-fix wave B1 — templates and media (P8 / T5-04 / T3-03 / T3-04 /
// T3-12 / T3-14 / T3-20 / T5-05). Pure logic is imported; components with
// '@/' imports are pinned by source scans (CRLF-robust String.raw regexes).
// EARS criteria + plain-English QA: docs/qa/live-fix-wave-b1-qa.md.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PREVIEW_CACHE_IMMUTABLE, PREVIEW_CACHE_SHORT, previewVersion, previewMediaUrl,
  previewCacheControl, isPrivateBlobUrl, previewLookupIds, fetchJsonWithTimeout,
} from '../studio/lib/template-media.mjs';
import { buildGallery, createHref } from '../studio/lib/templates-gallery.mjs';
import { loadRegistryTemplates } from '../studio/lib/template-registry.js';
import { REGISTRY_META } from '../studio/lib/template-registry.data.js';
import { TEMPLATES_DATA, TEMPLATE_CATEGORIES } from '../studio/lib/templates-catalog.js';
import { GET as getDemo } from '../studio/app/api/thumbs/demo/route.js';

const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const MEDIA_ROUTE = read('studio/app/api/template-previews/media/route.js');
const PREVIEWS_ROUTE = read('studio/app/api/template-previews/route.js');
const MEDIA = read('studio/components/TemplatePreviewMedia.js');
const TPL = read('studio/components/TemplateAssignPanel.js');
const THUMB_PICKER = read('studio/components/ThumbnailDesignPicker.js');
const THUMB_PANEL = read('studio/components/ThumbnailAssignPanel.js');
const GALLERY = read('studio/app/templates/page.js');
const CREATE = read('studio/app/create/page.js');

describe('P8 — preview media is cacheable, ranged and cheap', () => {
  test('M1: a content-addressed URL is cached for a year at the CDN and in the browser', () => {
    assert.equal(PREVIEW_CACHE_IMMUTABLE, 'public, max-age=31536000, s-maxage=31536000, immutable');
    assert.equal(previewCacheControl('lq3x9k', 'lq3x9k'), PREVIEW_CACHE_IMMUTABLE);
  });

  test('M2: an unversioned or stale URL is still CDN-cached, but only briefly (an update shows within minutes)', () => {
    assert.equal(PREVIEW_CACHE_SHORT, 'public, max-age=300, s-maxage=300, stale-while-revalidate=86400');
    assert.equal(previewCacheControl('', 'lq3x9k'), PREVIEW_CACHE_SHORT);
    assert.equal(previewCacheControl('old', 'lq3x9k'), PREVIEW_CACHE_SHORT);
    assert.equal(previewCacheControl('x', ''), PREVIEW_CACHE_SHORT, 'no render time → never immutable');
    assert.doesNotMatch(PREVIEW_CACHE_SHORT + PREVIEW_CACHE_IMMUTABLE, /private/);
  });

  test('M3: the version is derived from the render time, so a re-render busts every cache', () => {
    const a = previewVersion('2026-11-09T18:10:51.798Z');
    assert.match(a, /^[0-9a-z]+$/);
    assert.equal(a, previewVersion(new Date('2026-11-09T18:10:51.798Z')));
    assert.notEqual(a, previewVersion('2026-11-10T18:10:51.798Z'));
    assert.equal(previewVersion(null), '');
    assert.equal(previewVersion('not a date'), '');
    assert.equal(previewMediaUrl('ai-storybook', 'mp4', '2026-11-09T18:10:51.798Z'), `/api/template-previews/media?id=ai-storybook&kind=mp4&v=${a}`);
    assert.equal(previewMediaUrl('a b', 'poster', null), '/api/template-previews/media?id=a%20b&kind=poster');
  });

  test('M4: private blobs are proxied; anything else is a redirect', () => {
    assert.equal(isPrivateBlobUrl('https://e3nd.private.blob.vercel-storage.com/artifacts/abc'), true);
    assert.equal(isPrivateBlobUrl('https://e3nd.public.blob.vercel-storage.com/artifacts/abc'), false);
    assert.equal(isPrivateBlobUrl(''), false);
    assert.deepEqual(previewLookupIds('draft-x'), ['draft-x', 'x']);
    assert.deepEqual(previewLookupIds('x'), ['x', 'draft-x']);
  });

  test('M5: the media route uses the shared DB client, caches lookups, forwards Range and sets the cache header', () => {
    assert.match(MEDIA_ROUTE, /import \{ db, dbReady \} from '@\/lib\/db'/);
    assert.doesNotMatch(MEDIA_ROUTE, /import\('postgres'\)|postgres\(dbUrl/, 'no new connection per request');
    assert.match(MEDIA_ROUTE, /ROW_CACHE/, 'warm instances skip the DB');
    assert.match(MEDIA_ROUTE, /req\.headers\.get\('range'\)/);
    assert.match(MEDIA_ROUTE, /previewCacheControl\(/);
    assert.match(MEDIA_ROUTE, /status: 307/);
    assert.match(MEDIA_ROUTE, /isPrivateBlobUrl\(targetUrl\)/);
    assert.doesNotMatch(MEDIA_ROUTE, /'private, max-age/);
    assert.match(MEDIA_ROUTE, /if \(range\) headers\.Range = range;/, 'Range is forwarded → 206 from the blob store');
  });

  test('M6: the previews list hands out versioned URLs from the shared DB client', () => {
    assert.match(PREVIEWS_ROUTE, /previewMediaUrl\(r\.template_id, 'mp4', r\.rendered_at\)/);
    assert.match(PREVIEWS_ROUTE, /previewMediaUrl\(r\.template_id, 'poster', r\.rendered_at\)/);
    assert.match(PREVIEWS_ROUTE, /import \{ db, dbReady \} from '@\/lib\/db'/);
    assert.doesNotMatch(PREVIEWS_ROUTE, /import\('postgres'\)/);
  });

  test('M7: one <video> per card, preload="none" until hover/tap, then play() — never re-created per hover', () => {
    assert.match(MEDIA, /preload=\{armed \? 'auto' : 'none'\}/);
    assert.doesNotMatch(MEDIA, /\{mp4 && playing \? \(\s*<video/, 'the element is not mounted per hover');
    assert.match(MEDIA, /\{mp4 && near \? \(\s*<video/, 'one element per on-screen card, kept between hovers');
    assert.match(MEDIA, /const play = \(\) => \{\s*setArmed\(true\);\s*setPlaying\(true\);/, 'the first hover/tap arms the download');
    assert.match(MEDIA, /v\.play\(\)/);
    assert.match(MEDIA, /v\.pause\(\)/);
    assert.match(MEDIA, /new IntersectionObserver\(/, 'posters load only near the screen');
    assert.match(MEDIA, /loading="lazy"/);
  });
});

describe('T3-04 — the Templates drawer never spins forever', () => {
  test('L1: fetchJsonWithTimeout gives up with a plain timeout error', async () => {
    const hang = (url, { signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
    await assert.rejects(fetchJsonWithTimeout('/api/x', { timeoutMs: 20, fetchImpl: hang }), /took too long/);
  });

  test('L2: a non-OK answer becomes an error with the server message', async () => {
    const bad = async () => ({ ok: false, status: 502, json: async () => ({ error: 'db down' }) });
    await assert.rejects(fetchJsonWithTimeout('/api/x', { timeoutMs: 1000, fetchImpl: bad }), /db down/);
    const ok = async () => ({ ok: true, status: 200, json: async () => ({ a: 1 }) });
    assert.deepEqual(await fetchJsonWithTimeout('/api/x', { timeoutMs: 1000, fetchImpl: ok }), { a: 1 });
  });

  test('L3: the cards come from /api/templates first; the assignment loads on its own with a timeout and Retry', () => {
    assert.match(TPL, /fetchJsonWithTimeout\('\/api\/templates', \{ timeoutMs: LOAD_TIMEOUT_MS \}\)/);
    assert.match(TPL, /fetchJsonWithTimeout\(`\/api\/templates\?channel=\$\{encodeURIComponent\(slug\)\}`, \{ timeoutMs: LOAD_TIMEOUT_MS \}\)/);
    assert.match(TPL, /Couldn&apos;t load this channel&apos;s template/);
    assert.match(TPL, /Couldn&apos;t load the templates/);
    assert.doesNotMatch(TPL, /Loading template assignment…/, 'no single blocking spinner');
    // the demos only start once the card list is on screen
    assert.match(TPL, /if \(tpl\.status === 'ready'\) loadSamples\(\)/);
  });
});

describe('B4 contract — drawers report unsaved changes', () => {
  test('D1: both panels pass { dirty } to frame()', () => {
    assert.match(TPL, /frame\(body, footer, \{ dirty \}\)/);
    assert.match(THUMB_PANEL, /frame\(body, footer, \{ dirty \}\)/);
    assert.match(TPL, /const dirty = Boolean\(templateId\) && !assignedIds\.has\(templateId\)/);
    assert.match(THUMB_PANEL, /const dirty = loaded && !sameSet\(picked, saved\)/);
  });
});

describe('T3-14 — the selected template and its version sit in the sticky footer', () => {
  test('S1: the version select and the selected name render in the footer, not above the grid', () => {
    const footerAt = TPL.indexOf('const footer = isOwner && templates.length ? (');
    assert.ok(footerAt > 0);
    const footerSrc = TPL.slice(footerAt);
    assert.match(footerSrc, /id=\{`tpl-major-\$\{slug\}`\}/);
    assert.match(footerSrc, /picked\.name/);
    assert.doesNotMatch(TPL.slice(0, footerAt), /Pinned major version/, 'the off-screen box above the grid is gone');
  });
});

describe('T3-20 — Story shape is a setting with a confirm', () => {
  test('R1: radio-group semantics, confirm before saving, a saved state after', () => {
    assert.match(TPL, /role="radiogroup"/);
    assert.match(TPL, /role="radio"/);
    assert.match(TPL, /aria-checked=\{on\}/);
    assert.doesNotMatch(TPL, /<Segmented options=\{CHAPTER_OPTIONS\}/, 'no tab-look control for a saving setting');
    const save = TPL.slice(TPL.indexOf('const saveChapters = async'));
    assert.match(save, /await confirm\(\{\s*title: `Change story shape for \$\{channelLabel\} to \$\{label\}\?`/);
    assert.match(save, /body: 'Next long video uses it\.'/);
    assert.match(TPL, /Saved\. The next long video uses this\./);
  });
});

describe('T3-12 — Thumbnails drawer shows a skeleton per tile and is CDN-cached', () => {
  test('T1: each tile shimmers until its image has loaded; images are lazy', () => {
    assert.match(THUMB_PICKER, /onLoad=\{\(\) => markLoaded\(d\.id\)\}/);
    assert.match(THUMB_PICKER, /!loadedIds\.has\(d\.id\) \? <span aria-hidden="true" className="absolute inset-0 animate-pulse"/);
    assert.match(THUMB_PICKER, /<img\s+src=\{thumbDemoUrl\(d\.id, accent\)\}[\s\S]{0,200}loading="lazy"/);
  });

  test('T2: /api/thumbs/demo answers public + long s-maxage (deterministic per id + accent)', async () => {
    const res = await getDemo(new Request('http://localhost:3000/api/thumbs/demo?id=v2/blackout&accent=%23F5E31C'));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'public, max-age=86400, s-maxage=31536000, stale-while-revalidate=604800');
  });
});

describe('T5-05 — "Create a video with this style" only where Create can make it', () => {
  const view = loadRegistryTemplates(TEMPLATES_DATA, REGISTRY_META);

  test('C1: a template maps to a Create style only through data (create_style)', () => {
    const items = buildGallery({
      catalog: [{ id: 'documentary-frames', family: 'documentary-frames', name: 'Documentary Master Frames', category: 'documentary', aspectRatios: ['16:9', '9:16'] }],
      registryTemplates: [{ templateId: 'lux', family: 'documentary-frames', name: 'Lux', registry: { version: '1.0.0', create_style: 'luxury' } }, { templateId: 'doc', family: 'documentary-frames', name: 'Doc', registry: { version: '1.0.0' } }],
      samples: {},
    });
    assert.equal(items.find((i) => i.id === 'lux').createStyle, 'luxury');
    assert.equal(items.find((i) => i.id === 'doc').createStyle, null);
    assert.equal(createHref('luxury'), '/create?template=luxury');
  });

  test('C2: today no real template maps to Create (all are long documentaries), so no card offers it', () => {
    const items = buildGallery({ catalog: TEMPLATES_DATA, registryTemplates: view.templates, samples: {}, categories: TEMPLATE_CATEGORIES });
    assert.deepEqual(items.filter((i) => i.createStyle).map((i) => i.id), []);
  });

  test('C3: the drawer shows the button only for a mapped template and says so plainly otherwise', () => {
    assert.match(GALLERY, /item\.createStyle \? \(\s*<Link className="btn btn-outline" href=\{createHref\(item\.createStyle\)\}>/);
    assert.match(GALLERY, /Made by your channels&apos; autopilot — Create can&apos;t make this look\./);
    assert.doesNotMatch(GALLERY, /href=\{createHref\(item\.id\)\}/);
  });

  test('C4: Create never shows a raw template id to the owner', () => {
    assert.doesNotMatch(CREATE, /"\$\{f\.dna\}" isn't a Create style/);
    assert.match(CREATE, /That template is made by your channels' autopilot, not here\./);
    assert.match(CREATE, /const fallback = \(d\?\.styles \|\| \[\]\)\.find\(\(x\) => x\.id === ids\[0\]\)\?\.name/, 'the fallback is named, not an id');
  });
});
