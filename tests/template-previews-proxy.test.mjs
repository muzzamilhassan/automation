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

  // #124: the repo no longer stages fixture drafts (approved ones leave by
  // design) — listDrafts takes an injectable dir, so the fixture lives in a
  // temp folder. No chdir games.
  const fs = await import('node:fs');
  const os = await import('node:os');
  const pathMod = await import('node:path');
  const tmp = fs.mkdtempSync(pathMod.join(os.tmpdir(), 'drafts-inbox-'));
  fs.writeFileSync(pathMod.join(tmp, 'mr-case-files-storybook.json'), JSON.stringify({
    template_id: 'mr-case-files-storybook',
    niches: ['History stories'],
    doc_presentation: { theme: 'casefile' },
    story_structure: { has_chapters: false, narrative_format: 'full_story', sections: ['cold_open', 'hook_escalation', 'deep_investigation', 'verdict_payoff', 'outro'], title_patterns: [] },
  }));
  try {
    const drafts = await listDrafts(fakeSql, tmp);
    const target = drafts.find((d) => d.templateId === 'mr-case-files-storybook');
    assert.ok(target, 'expected mr-case-files-storybook in drafts list');
    assert.equal(target.preview.mp4, '/api/template-previews/media?id=draft-mr-case-files-storybook&kind=mp4');
    assert.equal(target.preview.poster, '/api/template-previews/media?id=draft-mr-case-files-storybook&kind=poster');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
