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
});
