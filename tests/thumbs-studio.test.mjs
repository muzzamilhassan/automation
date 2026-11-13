import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { GET as getDemo } from '../studio/app/api/thumbs/demo/route.js';
import { buildThumbSvg, TEMPLATES } from '../studio/lib/thumb-templates.js';
import { isV2Template, renderV2ById } from '../studio/lib/thumb-templates-v2.js';
import sharp from 'sharp';

describe('Thumbnail Studio — demo and preview engine hardening', () => {
  test('/api/thumbs/demo returns a valid 400x225 JPEG for core template (poster)', async () => {
    const req = new Request('http://localhost:3000/api/thumbs/demo?id=poster');
    const res = await getDemo(req);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/jpeg');
    const buf = Buffer.from(await res.arrayBuffer());
    assert.ok(buf.length > 2000, `expected realistic thumbnail size, got ${buf.length}`);
    const meta = await sharp(buf).metadata();
    assert.equal(meta.width, 400);
    assert.equal(meta.height, 225);
    assert.equal(meta.format, 'jpeg');
  });

  test('/api/thumbs/demo returns a valid JPEG for a v2 template (v2/blackout)', async () => {
    const req = new Request('http://localhost:3000/api/thumbs/demo?id=v2/blackout');
    const res = await getDemo(req);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/jpeg');
    const buf = Buffer.from(await res.arrayBuffer());
    assert.ok(buf.length > 1000);
    const meta = await sharp(buf).metadata();
    assert.equal(meta.width, 400);
    assert.equal(meta.height, 225);
  });

  test('buildThumbSvg renders gracefully without photoHref for photo-oriented templates', async () => {
    const photoTemplates = ['clean', 'hero', 'statue', 'luxury', 'splitba'];
    for (const t of photoTemplates) {
      const svg = buildThumbSvg(t, { title: 'Test Headline', chip: 'TEST', eyebrow: 'SERIES' });
      assert.ok(svg.startsWith('<svg'), `expected valid svg for ${t}`);
      const buf = await sharp(Buffer.from(svg)).jpeg().toBuffer();
      assert.ok(buf.length > 2000, `expected rendered JPEG for ${t}`);
    }
  });

  test('renderV2ById renders gracefully without photoHref for v2 templates', async () => {
    const v2Templates = ['v2/ketchup', 'v2/boxed-scream', 'v2/slab-core', 'v2/marble'];
    for (const t of v2Templates) {
      const svg = renderV2ById(t, { title: 'Test Headline', chip: 'TEST', eyebrow: 'SERIES' });
      assert.ok(svg.startsWith('<svg'), `expected valid svg for ${t}`);
      const buf = await sharp(Buffer.from(svg)).jpeg().toBuffer();
      assert.ok(buf.length > 1000, `expected rendered JPEG for ${t}`);
    }
  });

  test('buildThumbSvg has zero text blur filters or faded drop shadows', () => {
    const templates = ['poster', 'hero', 'statue', 'silhouette', 'magazine', 'motion', 'annotate', 'timeline', 'duotone', 'iso', 'map'];
    for (const id of templates) {
      const svg = buildThumbSvg(id, { title: 'Sharp Crisp Text', accentWord: 'Crisp', chip: 'RULES', eyebrow: 'SERIES' });
      assert.ok(!svg.includes('url(#textBlur)'), `${id} should not use url(#textBlur)`);
      assert.ok(!svg.includes('url(#softShadow)'), `${id} should not use url(#softShadow)`);
      assert.ok(!svg.includes('stdDeviation="9"'), `${id} should not have soft shadow blur`);
      assert.ok(!svg.includes('stdDeviation="5"'), `${id} should not have text blur`);
    }
  });

  test('template catalog is deduplicated without duplicate IDs or duplicate labels', async () => {
    const fs = await import('node:fs');
    const routeSrc = fs.readFileSync('studio/app/api/thumbs/templates/route.js', 'utf8');
    assert.match(routeSrc, /DUPLICATE_V1_IDS/, 'route must define DUPLICATE_V1_IDS');
    assert.match(routeSrc, /seenIds\.has\(t\.id\)/, 'route must deduplicate by ID');
    assert.match(routeSrc, /seenLabels\.has\(norm\)/, 'route must deduplicate by normalized label');

    const { v2List } = await import('../studio/lib/thumb-templates-v2.js');
    const DUPLICATE_V1_IDS = new Set([
      'clean', 'paper', 'luxury', 'splitba', 'vs', 'newspaper', 'bignum', 'equation', 'stats', 'brutalist', 'question'
    ]);

    const v1Entries = Object.entries(TEMPLATES)
      .filter(([id]) => !DUPLICATE_V1_IDS.has(id))
      .map(([id, t]) => ({
        id,
        label: t.label,
        desc: t.desc,
        category: t.category,
        needsPhoto: Boolean(t.needsPhoto),
        aiPreset: t.aiPreset || null,
      }));

    const all = [...v1Entries, ...v2List()];
    const seenIds = new Set();
    const seenLabels = new Set();
    const deduped = [];
    for (const t of all) {
      const norm = t.label.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!seenIds.has(t.id) && !seenLabels.has(norm)) {
        seenIds.add(t.id);
        seenLabels.add(norm);
        deduped.push(t);
      }
    }

    const ids = deduped.map((t) => t.id);
    const uniqueIds = new Set(ids);
    assert.equal(ids.length, uniqueIds.size, 'all returned template IDs must be unique');

    const labels = deduped.map((t) => t.label.toLowerCase().replace(/[^a-z0-9]/g, ''));
    const uniqueLabels = new Set(labels);
    assert.equal(labels.length, uniqueLabels.size, 'all returned template labels must be unique');

    // Confirm that legacy duplicates like 'bignum', 'paper', 'luxury' were filtered out in favor of modern v2 equivalents
    assert.ok(!ids.includes('bignum'), 'duplicate bignum should be omitted');
    assert.ok(!ids.includes('newspaper'), 'duplicate newspaper should be omitted');
    assert.ok(!ids.includes('paper'), 'duplicate paper should be omitted');
    assert.ok(!ids.includes('luxury'), 'duplicate luxury should be omitted');
    assert.ok(!ids.includes('splitba'), 'duplicate splitba should be omitted');
    assert.ok(!ids.includes('vs'), 'duplicate vs should be omitted');
    assert.ok(ids.includes('poster'), 'classic unique poster template should be retained');
    assert.ok(ids.includes('v2/big-number'), 'v2/big-number should be present');
  });
});
