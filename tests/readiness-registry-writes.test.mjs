// "100% ready before anything publishes" (owner, 2026-11-21) — the panel
// writes that make the 7 items visible to the engine:
//   - template assign/unassign mirrors kit.templateId (+ version, major) into
//     the registry entry (Neon kit + the engine file), because discover reads
//     only repo JSON and the assignment rows live in Neon
//   - "Template default" saves kit.storyShape 'template'; Full story /
//     Chapters save storyShape + hasChapters together
// The kit-only writer (setChannelKitFields) follows setChannelCron's shape:
// Neon kit read-modify-write, then a fresh read of the engine file where ONLY
// the target entry changes — never a full DB→repo sync of the entry.
// Components/routes import '@/…', so they are pinned by source scans.
// Spec + QA: docs/qa/channel-readiness-qa.md.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { applyKitPatchToChannels, patchKit } from '../studio/lib/channels-registry.js';
import { kitFieldPatch } from '../studio/lib/channel-kit-fields.mjs';
import { storyModeOf, storyShapeFor, chapterValueFor } from '../studio/lib/channel-kit-ui.mjs';
import { channelReadiness } from '../studio/lib/channel-readiness.mjs';

const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

describe('W1 — the kit-only registry patch (pure)', () => {
  test('patchKit sets values and deletes keys given null/undefined', () => {
    assert.deepEqual(patchKit({ a: 1, templateId: 'old', keep: true }, { templateId: 'new', a: null }), { templateId: 'new', keep: true });
    assert.deepEqual(patchKit(null, { templateId: 'x' }), { templateId: 'x' });
    assert.deepEqual(patchKit('junk', { templateId: 'x' }), { templateId: 'x' });
    assert.deepEqual(patchKit({ a: 1 }, null), { a: 1 });
  });

  test('only the target entry changes; every other entry stays the same object', () => {
    const other = { slug: 'other', cron: '13 2 * * *', kit: { slots: ['22:35'] } };
    const target = { slug: 'target', cron: '21 3 * * *', active: true, tokenSecretSaved: true, kit: { gateCron: '21 3 * * *', slots: ['00:05'] } };
    const { channels, found } = applyKitPatchToChannels([other, target], 'target', { templateId: 'myth-vs-money', templateVersion: '1.2.0' });
    assert.equal(found, true);
    assert.equal(channels[0], other, 'byte-identical: the same object');
    assert.deepEqual(channels[1], { ...target, kit: { gateCron: '21 3 * * *', slots: ['00:05'], templateId: 'myth-vs-money', templateVersion: '1.2.0' } });
  });

  test('top-level fields (Shorts times) are set alongside the kit', () => {
    const { channels } = applyKitPatchToChannels([{ slug: 't', slots: [], kit: {} }], 't', { slots: ['21:00'], longSlot: '20:00' }, { slots: ['21:00'] });
    assert.deepEqual(channels[0], { slug: 't', slots: ['21:00'], kit: { slots: ['21:00'], longSlot: '20:00' } });
  });

  test('a slug missing from the engine file reports not-found and changes nothing', () => {
    const list = [{ slug: 'a', kit: {} }];
    const { channels, found } = applyKitPatchToChannels(list, 'zzz', { templateId: 'x' });
    assert.equal(found, false);
    assert.deepEqual(channels, list);
    assert.deepEqual(applyKitPatchToChannels(null, 'a', {}).channels, []);
  });

  test('unassign (nulls) removes the mirror, so the template item reads not done', () => {
    const { channels } = applyKitPatchToChannels([{ slug: 't', kit: { templateId: 'x', templateVersion: '1.0.0', templateMajor: 1 } }], 't', { templateId: null, templateVersion: null, templateMajor: null });
    assert.deepEqual(channels[0].kit, {});
    const r = channelReadiness({ entry: { slug: 't', ...channels[0] }, schedule: {} });
    assert.equal(r.items.find((i) => i.key === 'template').ok, false);
  });
});

describe('W2 — setChannelKitFields (Neon kit + engine file, A2 guards intact)', () => {
  const REG = read('studio/lib/channels-registry.js');
  const fn = REG.slice(REG.indexOf('export async function setChannelKitFields('));
  const body = fn.slice(0, fn.indexOf('\n}\n') + 2);

  test('Neon: the kit JSONB is read, patched and written back (never a full row upsert)', () => {
    assert.match(body, /SELECT kit FROM channels WHERE slug = \$\{slug\}/);
    assert.match(body, /UPDATE channels SET kit = \$\{db\.json\(kit\)\} WHERE slug = \$\{slug\}/);
    assert.match(body, /UPDATE channels SET slots = \$\{top\.slots\} WHERE slug = \$\{slug\}/);
    assert.doesNotMatch(body, /upsertChannel\(|syncRegistryRepo\(|mergeRegistrySync\(/, 'no DB→repo entry rewrite');
  });

  test('engine file: a FRESH repo read (a failed read throws — nothing is written), only the target entry patched', () => {
    assert.match(body, /const reg = await readRegistryRepo\(\);/);
    assert.match(body, /applyKitPatchToChannels\(reg\.channels, slug, kitPatch, top\)/);
    assert.match(body, /if \(!found\) return \{ ok: false, reason: 'not-in-repo-registry', warnings \};/);
    assert.match(body, /await writeRepoJSON\(REG_PATH, \{ channels \}, /);
    assert.match(body, /await mirrorFeedBestEffort\(channels\);/);
  });

  test('the A2 guards are untouched (sync + fallback still keep the engine flags)', () => {
    assert.match(REG, /export function engineFlags\(existing, fromDb\)/);
    assert.match(REG, /const \{ tokenEnc: _dropped, overlayDegraded: _readOnly, \.\.\.fromDb \} = dbEntry;/);
    assert.match(REG, /Object\.assign\(repoEntry, engineFlags\(/);
  });
});

describe('W3 — template assign / unassign mirror kit.templateId', () => {
  const ROUTE = read('studio/app/api/templates/assign/route.js');

  test('imports the kit writer', () => {
    assert.match(ROUTE, /import \{ readRegistry, readRepoJSON, setChannelKitFields \} from '@\/lib\/channels-registry';/);
  });

  test('POST mirrors the template id, the version the next video uses and the pinned major — after the DB assignment succeeds', () => {
    const ok = ROUTE.indexOf("await appendAudit(user.email, 'template-assign'");
    const mirror = ROUTE.indexOf('await mirrorTemplate(entry.slug, { templateId, templateVersion: result.resolvedVersion || null, templateMajor: pinnedMajor }');
    assert.ok(ok > 0 && mirror > ok, 'mirror after the audited DB write');
    assert.match(ROUTE, /return Response\.json\(\{ \.\.\.result, \.\.\.\(warning \? \{ warning \} : \{\}\) \}\);/);
  });

  test('DELETE clears the mirror for the resolved channel slug', () => {
    assert.match(ROUTE, /const entry = await findChannelEntry\(channelId\);\n\s*const warning = await mirrorTemplate\(entry\?\.slug \|\| channelId, \{ templateId: null, templateVersion: null, templateMajor: null \}/);
    assert.match(ROUTE, /return Response\.json\(\{ ok: true, channelId, templateId, \.\.\.\(warning \? \{ warning \} : \{\}\) \}\);/);
  });

  test('a mirror failure never undoes the saved assignment — it comes back as a plain warning', () => {
    const fn = ROUTE.slice(ROUTE.indexOf('async function mirrorTemplate('));
    assert.match(fn, /try \{/);
    assert.match(fn, /const res = await setChannelKitFields\(slug, patch, \{ message \}\);/);
    assert.match(fn, /if \(!res\.ok\) return /);
    assert.match(fn, /\} catch \(e\) \{/);
  });

  test('the panel shows that warning', () => {
    const TPL = read('studio/components/TemplateAssignPanel.js');
    assert.match(TPL, /d\.warning \? ` \$\{d\.warning\}` : ''/);
  });
});

describe('W4 — story shape: Template default is a real choice', () => {
  test('kitFieldPatch accepts storyShape and keeps hasChapters in step', () => {
    assert.deepEqual(kitFieldPatch({ storyShape: 'template' }), { patch: { storyShape: 'template', hasChapters: null } });
    assert.deepEqual(kitFieldPatch({ storyShape: 'full' }), { patch: { storyShape: 'full', hasChapters: false } });
    assert.deepEqual(kitFieldPatch({ storyShape: 'chapters', hasChapters: true }), { patch: { hasChapters: true, storyShape: 'chapters' } });
    assert.match(kitFieldPatch({ storyShape: 'story' }).error, /storyShape/);
    assert.match(kitFieldPatch({ storyShape: 'full', hasChapters: true }).error, /disagree/);
    assert.deepEqual(kitFieldPatch({ hasChapters: false }), { patch: { hasChapters: false } }, 'old clients unchanged');
  });

  test('UI mode <-> saved values: an untouched channel shows nothing picked', () => {
    assert.equal(storyModeOf({}), 'unset');
    assert.equal(storyModeOf({ hasChapters: null }), 'unset');
    assert.equal(storyModeOf({ storyShape: 'template', hasChapters: null }), 'default');
    assert.equal(storyModeOf({ hasChapters: false }), 'story');
    assert.equal(storyModeOf({ hasChapters: true }), 'chapters');
    assert.equal(storyShapeFor('default'), 'template');
    assert.equal(storyShapeFor('story'), 'full');
    assert.equal(storyShapeFor('chapters'), 'chapters');
    for (const mode of ['default', 'story', 'chapters']) {
      const { patch, error } = kitFieldPatch({ hasChapters: chapterValueFor(mode), storyShape: storyShapeFor(mode) });
      assert.equal(error, undefined, mode);
      assert.equal(storyModeOf(patch), mode, `${mode} round-trips`);
      const r = channelReadiness({ entry: { slug: 's', kit: patch } });
      assert.equal(r.items.find((i) => i.key === 'storyShape').ok, true, `${mode} counts as chosen`);
    }
  });

  test('the Templates drawer saves both fields and reads the mode with storyModeOf', () => {
    const TPL = read('studio/components/TemplateAssignPanel.js');
    assert.match(TPL, /body: JSON\.stringify\(\{ slug, kit: \{ hasChapters: chapterValueFor\(mode\), storyShape: storyShapeFor\(mode\) \} \}\)/);
    assert.match(TPL, /mode: storyModeOf\(d\.channel\.kit\)/);
    assert.match(TPL, /unset: 'Not picked yet/);
  });

  test('the engine still reads hasChapters only (render behaviour unchanged)', () => {
    const BR = read('lib/brand-resolve.mjs');
    assert.doesNotMatch(BR, /storyShape/);
    assert.doesNotMatch(read('lib/doc-storybook.mjs'), /storyShape/);
  });
});
