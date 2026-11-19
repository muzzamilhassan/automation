// Feedback round 1 (A + G) — per-channel kit fields `thumbTemplates` (the
// thumbnail designs that rotate on uploads) and `hasChapters` (Full story vs
// Chapters for documentaries). Spec + QA: docs/qa/feedback-r1-templates-thumbs-qa.md.
//
// Proves the whole persistence path:
//   UI body -> POST /api/channels/profile (kitFieldPatch validation)
//   -> upsertChannel (kit JSONB `||` merge, then mergeRegistrySync to the
//      engine feed yt-mcp/studio-channels.json)
//   -> lib/brand-resolve.mjs resolveBrand (registryToKit + mergeBrand)
//   -> the engine `brand` (thumbTemplates -> pickCandidates; hasChapters ->
//      docPresentation -> yt-deepdive's computed hasChapters).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MAX_THUMB_TEMPLATES, PICKER_MIN, PICKER_MAX, thumbDesignIds,
  parseThumbTemplates, parseHasChapters, kitFieldPatch, chapterModeOf, chapterValueFor,
} from '../studio/lib/channel-kit-fields.mjs';
import { pickCandidates, loadThumbRegistry } from '../studio/lib/thumb-registry.mjs';
import { mergeRegistrySync } from '../studio/lib/channels-registry.js';
import { docPresentation } from '../lib/doc-storybook.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const IDS = loadThumbRegistry().designs.map((d) => d.id);

describe('A4 — thumbTemplates validation', () => {
  test('the known ids are exactly the thumbnail registry designs (the engine eligible pool)', () => {
    assert.deepEqual(thumbDesignIds(), IDS);
    assert.ok(IDS.length >= 5, 'the registry ships enough designs to pick 2-5');
  });

  test('limits: the API caps at 8, the picker asks for 2-5', () => {
    assert.equal(MAX_THUMB_TEMPLATES, 8);
    assert.equal(PICKER_MIN, 2);
    assert.equal(PICKER_MAX, 5);
  });

  test('accepts known ids, dedupes, keeps order', () => {
    assert.deepEqual(parseThumbTemplates([IDS[2], IDS[0], IDS[2]]), { ok: true, value: [IDS[2], IDS[0]] });
  });

  test('an empty array is valid and clears the set (back to automatic)', () => {
    assert.deepEqual(parseThumbTemplates([]), { ok: true, value: [] });
  });

  test('rejects an unknown id and names it', () => {
    const r = parseThumbTemplates([IDS[0], 'not-a-design']);
    assert.equal(r.ok, false);
    assert.match(r.error, /not-a-design/);
  });

  test('rejects non-arrays and non-string items', () => {
    assert.equal(parseThumbTemplates('blackout').ok, false);
    assert.equal(parseThumbTemplates({ 0: 'blackout' }).ok, false);
    assert.equal(parseThumbTemplates([IDS[0], 7]).ok, false);
    assert.equal(parseThumbTemplates(null).ok, false);
  });

  test('rejects more than 8 designs', () => {
    const r = parseThumbTemplates(IDS.slice(0, 9));
    assert.equal(r.ok, false);
    assert.match(r.error, /8/);
    assert.equal(parseThumbTemplates(IDS.slice(0, 8)).ok, true);
  });

  test('a custom known list is honoured (pure)', () => {
    assert.deepEqual(parseThumbTemplates(['a'], ['a', 'b']), { ok: true, value: ['a'] });
    assert.equal(parseThumbTemplates(['c'], ['a', 'b']).ok, false);
  });
});

describe('G4 — hasChapters validation', () => {
  test('true / false / null are the only accepted values', () => {
    assert.deepEqual(parseHasChapters(true), { ok: true, value: true });
    assert.deepEqual(parseHasChapters(false), { ok: true, value: false });
    assert.deepEqual(parseHasChapters(null), { ok: true, value: null });
    for (const bad of ['true', 0, 1, 'chapters', {}, []]) {
      assert.equal(parseHasChapters(bad).ok, false, JSON.stringify(bad));
    }
  });

  test('the UI mode <-> saved value mapping (unset = template default)', () => {
    assert.equal(chapterModeOf({}), 'default');
    assert.equal(chapterModeOf({ hasChapters: null }), 'default');
    assert.equal(chapterModeOf(null), 'default');
    assert.equal(chapterModeOf({ hasChapters: false }), 'story');
    assert.equal(chapterModeOf({ hasChapters: true }), 'chapters');
    assert.equal(chapterValueFor('default'), null);
    assert.equal(chapterValueFor('story'), false);
    assert.equal(chapterValueFor('chapters'), true);
  });
});

describe('kitFieldPatch — only the keys the caller sent', () => {
  test('absent fields produce no patch keys (a save never wipes them)', () => {
    assert.deepEqual(kitFieldPatch({ eyebrow: 'X' }), { patch: {} });
    assert.deepEqual(kitFieldPatch(undefined), { patch: {} });
  });

  test('both fields validated and patched', () => {
    assert.deepEqual(
      kitFieldPatch({ thumbTemplates: [IDS[0], IDS[1]], hasChapters: false }),
      { patch: { thumbTemplates: [IDS[0], IDS[1]], hasChapters: false } },
    );
    assert.deepEqual(kitFieldPatch({ hasChapters: null }), { patch: { hasChapters: null } });
  });

  test('a bad field returns an error (the route answers 400)', () => {
    assert.ok(kitFieldPatch({ thumbTemplates: ['nope'] }).error);
    assert.ok(kitFieldPatch({ hasChapters: 'yes' }).error);
  });
});

describe('A4/G4 — the profile route wires the helper (source pin)', () => {
  const route = read('studio/app/api/channels/profile/route.js');
  test('POST validates through kitFieldPatch and answers 400 on a bad field', () => {
    assert.match(route, /import \{ kitFieldPatch \} from '@\/lib\/channel-kit-fields\.mjs'/);
    assert.match(route, /const extra = kitFieldPatch\(k\);/);
    assert.match(route, /if \(extra\.error\) return Response\.json\(\{ error: extra\.error \}, \{ status: 400 \}\);/);
    assert.match(route, /\.\.\.extra\.patch,/);
  });
  test('the route is still owner-only for writes', () => {
    assert.match(route, /export async function POST\(req\) \{\s*if \(!\(await requireRole\(req, \['owner'\]\)\)\)/);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: route patch -> kit JSONB merge -> repo feed sync -> resolveBrand
// -> engine selection / docPresentation / yt-deepdive's hasChapters.
// ---------------------------------------------------------------------------
describe('A5/G6 — a saved kit field reaches the engine brand', () => {
  let tmp;
  let cwd;
  let resolveBrand;
  const SLUG = 'kit-fields-e2e';

  // what the profile route + upsertChannel do with a body: the route spreads
  // the validated patch over the entry kit; Postgres `kit || EXCLUDED.kit` is a
  // shallow right-wins merge (same as the spread); mergeRegistrySync writes the
  // DB projection into the engine feed for that one slug.
  const save = (feed, slug, oldKit, body) => {
    const { patch, error } = kitFieldPatch(body.kit);
    assert.equal(error, undefined);
    const dbKit = { ...(oldKit || {}), ...patch };
    const channels = mergeRegistrySync(feed, { slug, label: 'Kit Fields', niche: 'Personal finance rules & money habits', kit: dbKit });
    fs.writeFileSync(path.join(tmp, 'yt-mcp', 'studio-channels.json'), JSON.stringify({ channels }));
    return channels;
  };

  before(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-fields-'));
    fs.mkdirSync(path.join(tmp, 'yt-mcp'));
    cwd = process.cwd();
    process.chdir(tmp); // brand-resolve reads <cwd>/yt-mcp/studio-channels.json
    ({ resolveBrand } = await import('../lib/brand-resolve.mjs'));
  });
  after(() => {
    process.chdir(cwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('thumbTemplates: saved ids -> brand.thumbTemplates -> the engine picks from them', () => {
    const picked = [IDS[3], IDS[1], IDS[6]];
    save([], SLUG, { eyebrow: 'E' }, { kit: { thumbTemplates: picked } });
    const brand = resolveBrand(SLUG);
    assert.deepEqual(brand.thumbTemplates, picked, 'registryToKit + mergeBrand carry the field');
    assert.equal(brand.eyebrow, 'E', 'other kit keys survive the patch');
    // the engine's own call shape (youtube-engine.mjs registryThumbCandidates)
    const picks = pickCandidates(brand.niche, 3, { assignedIds: brand.thumbTemplates });
    assert.equal(picks.length, 3);
    assert.ok(picks.every((d) => picked.includes(d.id)), 'every candidate is an assigned design');
  });

  test('thumbTemplates: an empty list clears the set -> no brand.thumbTemplates (engine keeps frames)', () => {
    const feed = save([], SLUG, {}, { kit: { thumbTemplates: [IDS[0], IDS[1]] } });
    save(feed, SLUG, { thumbTemplates: [IDS[0], IDS[1]] }, { kit: { thumbTemplates: [] } });
    assert.equal(resolveBrand(SLUG).thumbTemplates, undefined);
  });

  test('thumbTemplates on a legacy channel overrides the legacy kit (mergeBrand)', () => {
    save([], 'money-rulebook', {}, { kit: { thumbTemplates: [IDS[0], IDS[4]] } });
    assert.deepEqual(resolveBrand('money-rulebook').thumbTemplates, [IDS[0], IDS[4]]);
  });

  test('hasChapters false -> brand.hasChapters false -> docPresentation false -> deep-dive hasChapters false', () => {
    save([], SLUG, {}, { kit: { hasChapters: false } });
    const brand = resolveBrand(SLUG);
    assert.equal(brand.hasChapters, false);
    const pres = docPresentation(null, brand);
    assert.equal(pres.hasChapters, false);
    assert.equal(deepdiveHasChapters(pres, {}), false);
  });

  test('hasChapters true is carried too', () => {
    save([], SLUG, {}, { kit: { hasChapters: true } });
    assert.equal(resolveBrand(SLUG).hasChapters, true);
  });

  test('hasChapters null (template default) -> undefined on the brand -> today\'s behaviour', () => {
    save([], SLUG, { hasChapters: false }, { kit: { hasChapters: null } });
    const brand = resolveBrand(SLUG);
    assert.equal(brand.hasChapters, undefined);
    const pres = docPresentation(null, brand);
    assert.equal('hasChapters' in pres, false);
    assert.equal(deepdiveHasChapters(pres, {}), true);
  });
});

// yt-deepdive.mjs runs top-level code, so the test evaluates the deep-dive's
// OWN expression text (source-extracted) against pres/script.
const DEEPDIVE = read('yt-deepdive.mjs');
const HC_EXPR = /const hasChapters = (pres\.hasChapters[^;]+);/.exec(DEEPDIVE)?.[1];
function deepdiveHasChapters(pres, script) {
  assert.ok(HC_EXPR, 'yt-deepdive.mjs still computes hasChapters from pres');
  // eslint-disable-next-line no-new-func
  return new Function('pres', 'script', `return ${HC_EXPR};`)(pres, script);
}

describe('G5 — docPresentation hasChapters is default-inert', () => {
  const kit = { label: 'THE MONEY RULEBOOK', eyebrow: 'MONEY RULES // THE MONEY RULEBOOK' };

  test('unset kit -> no hasChapters key, output identical to before', () => {
    const pres = docPresentation(null, kit);
    assert.equal(pres.hasChapters, undefined);
    assert.equal(Object.prototype.hasOwnProperty.call(pres, 'hasChapters'), false);
    assert.equal(deepdiveHasChapters(pres, {}), true, 'chapters stay on, as today');
  });

  test('non-boolean kit values are ignored', () => {
    for (const v of [null, 'false', 0, undefined]) {
      assert.equal(docPresentation(null, { ...kit, hasChapters: v }).hasChapters, undefined, String(v));
    }
  });

  test('kit false -> false, and the deep-dive turns chapters off', () => {
    const pres = docPresentation(null, { ...kit, hasChapters: false });
    assert.equal(pres.hasChapters, false);
    assert.equal(deepdiveHasChapters(pres, {}), false);
  });

  test('kit true -> true (the script can still opt out)', () => {
    const pres = docPresentation(null, { ...kit, hasChapters: true });
    assert.equal(pres.hasChapters, true);
    assert.equal(deepdiveHasChapters(pres, { has_chapters: false }), false);
  });

  test("the template's story_structure.has_chapters is NOT read (no change to existing renders)", () => {
    const meta = { story_structure: { has_chapters: false }, doc_presentation: { brand: 'B', eyebrow: 'E', badge: 'B' } };
    assert.equal(docPresentation(meta, kit).hasChapters, undefined);
  });
});
