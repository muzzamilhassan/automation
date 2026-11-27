// 2026-11-27: a database hiccup must not silently render a channel in the OLD look.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mirroredTemplateId } from '../youtube-engine.mjs';

test("the panel's saved template is used when the database can't be read", () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-')), 'reg.json');
  fs.writeFileSync(f, JSON.stringify({ channels: [{ slug: 'qq', kit: { templateId: 'old-verses-storybook' } }, { slug: 'none', kit: {} }] }));
  assert.equal(mirroredTemplateId('qq', f), 'old-verses-storybook');
  assert.equal(mirroredTemplateId('none', f), null);
  assert.equal(mirroredTemplateId('qq', f + '.missing'), null);
  const src = fs.readFileSync(new URL('../youtube-engine.mjs', import.meta.url), 'utf8');
  assert.match(src, /const mirrored = mirroredTemplateId\(channelId\);[\s\S]{0,300}return mirrored;/);
});

test('every live channel has its template saved for this fallback', () => {
  const reg = JSON.parse(fs.readFileSync(new URL('../yt-mcp/studio-channels.json', import.meta.url), 'utf8'));
  for (const c of reg.channels.filter((x) => x.autopilot !== false)) assert.ok(mirroredTemplateId(c.slug), c.slug);
});
