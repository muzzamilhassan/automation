import test from 'node:test';
import assert from 'node:assert/strict';
import { listDrafts } from '../studio/lib/template-approvals.mjs';

test('listDrafts rewrites private Vercel Blob preview URLs to /api/template-previews/media proxy URLs', async () => {
  const fakeSql = async (strings) => {
    const query = strings.join(' ');
    if (query.includes('FROM template_previews')) {
      return [
        {
          template_id: 'draft-mr-case-files-storybook',
          mp4_url: 'https://e3ndp1dsoddlbysc.private.blob.vercel-storage.com/artifacts/abc123',
          poster_url: 'https://e3ndp1dsoddlbysc.private.blob.vercel-storage.com/artifacts/def456',
          rendered_at: '2026-11-09T18:10:51.798Z',
        },
      ];
    }
    if (query.includes('FROM template_approvals')) {
      return [];
    }
    return [];
  };

  // Run with CWD = repo/studio so studio/lib/template-bot-drafts resolves
  const prevCwd = process.cwd();
  try {
    if (!prevCwd.endsWith('studio')) process.chdir(`${prevCwd}/studio`);
    const drafts = await listDrafts(fakeSql);
    const target = drafts.find((d) => d.templateId === 'mr-case-files-storybook');
    assert.ok(target, 'expected mr-case-files-storybook in drafts list');
    assert.equal(target.preview.mp4, '/api/template-previews/media?id=draft-mr-case-files-storybook&kind=mp4');
    assert.equal(target.preview.poster, '/api/template-previews/media?id=draft-mr-case-files-storybook&kind=poster');
  } finally {
    process.chdir(prevCwd);
  }
});
