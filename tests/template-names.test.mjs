// Live-fix wave B1 — P7 / T4-03 / T3-13 / T5-15: every template has a real
// human name (registry DATA `display_name`), ONE naming helper decides the
// name on every surface, and the Assigned box shows the version the next
// video really uses. EARS criteria: docs/qa/live-fix-wave-b1-qa.md (N1-N6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadRegistryTemplates, templateDisplayName } from '../studio/lib/template-registry.js';
import { REGISTRY_META } from '../studio/lib/template-registry.data.js';
import { TEMPLATES_DATA, TEMPLATE_CATEGORIES } from '../studio/lib/templates-catalog.js';
import { buildGallery, humanizeId, assignmentSummary } from '../studio/lib/templates-gallery.mjs';

const read = (p) => fs.readFileSync(p, 'utf8');
const view = loadRegistryTemplates(TEMPLATES_DATA, REGISTRY_META);

test('N1: every registry template carries its own human display_name (data, not code)', () => {
  assert.deepEqual(view.invalid, []);
  for (const [id, meta] of Object.entries(REGISTRY_META)) {
    if (!meta) continue;
    assert.equal(typeof meta.display_name, 'string', `${id}: display_name missing`);
    const n = meta.display_name.trim();
    assert.ok(n.length >= 3 && n.length <= 40, `${id}: display_name "${n}" must be 3-40 characters`);
    assert.notEqual(n, id, `${id}: display_name must not be the raw id`);
    assert.doesNotMatch(n, /^[a-z0-9]+([-_][a-z0-9]+)+$/, `${id}: display_name looks like an id`);
  }
});

test('N2: no two assignable templates share a display name (case-insensitive)', () => {
  const names = view.templates.map((t) => t.name.trim().toLowerCase());
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  assert.deepEqual(dupes, [], `shared names: ${dupes.join(', ')}`);
  // 2026-11-21 owner-approved dedupe: 22 colour-only copies removed → 19 rows
  assert.ok(view.templates.length >= 19, `expected the real 19 templates, got ${view.templates.length}`);
});

test('N2b: no gallery card (registry + base families) shares a name either', () => {
  const items = buildGallery({ catalog: TEMPLATES_DATA, registryTemplates: view.templates, samples: {}, categories: TEMPLATE_CATEGORIES });
  const names = items.map((i) => i.name.trim().toLowerCase());
  assert.equal(new Set(names).size, names.length);
});

test('N3: the auto-generated names are gone (T5-15)', () => {
  const name = (id) => view.templates.find((t) => t.templateId === id)?.name;
  assert.equal(name('cashflow-challenge-storybook'), 'Cashflow Challenge Storybook');
  assert.equal(name('mr-case-files-storybook'), 'Case Files Storybook');
  assert.equal(name('lecture-notes-paper'), 'Lecture Notes Paper');
  assert.equal(name('myth-vs-money'), 'Myth vs Money');
  assert.equal(name('red-flags-explained'), 'Red Flags Explained');
  assert.equal(name('documentary-frames'), 'Documentary Master Frames');
  // nothing but the documentary family itself is called by the family name (P7)
  const clones = view.templates.filter((t) => t.name === 'Documentary Master Frames').map((t) => t.templateId);
  assert.deepEqual(clones, ['documentary-frames']);
});

test('N4: templateDisplayName is THE rule — data first, family name only for the family itself, else the id made readable', () => {
  const fam = { id: 'documentary-frames', family: 'documentary-frames', name: 'Documentary Master Frames' };
  assert.equal(templateDisplayName('x-storybook', { display_name: '  Night Owl  ', family: 'documentary-frames' }, fam), 'Night Owl');
  assert.equal(templateDisplayName('documentary-frames', {}, fam), 'Documentary Master Frames');
  assert.equal(templateDisplayName('cool-new-storybook', { family: 'documentary-frames' }, fam), humanizeId('cool-new-storybook'));
  assert.equal(templateDisplayName('cool-new-storybook', { family: 'documentary-frames', display_name: '' }, fam), 'Cool New Storybook');
  // the loader uses it: the name every API row carries
  for (const t of view.templates) assert.equal(t.name, templateDisplayName(t.templateId, t.registry, t.catalog));
});

test('N5: every surface shows the ONE name — no family-name or raw-id titles', () => {
  const gallery = read('studio/lib/templates-gallery.mjs');
  assert.match(gallery, /name: str\(t\.name\) \|\| humanizeId\(t\.templateId\)/, 'the gallery uses the loader name');
  const panel = read('studio/components/TemplateAssignPanel.js');
  const picker = read('studio/components/wizard/TemplatePicker.js');
  const page = read('studio/app/templates/page.js');
  for (const [file, src] of [['TemplateAssignPanel', panel], ['TemplatePicker', picker], ['gallery page', page]]) {
    assert.doesNotMatch(src, /catalog\??\.name/, `${file}: never the family (catalog) name as a template title`);
  }
  assert.doesNotMatch(panel, /sharedNames/, 'the raw-id disambiguator is gone (names are unique)');
  assert.doesNotMatch(panel, /— \$\{t\.templateId\}/, 'no raw ids in card titles');
  assert.doesNotMatch(panel, /title: `Unassign "\$\{tid\}"\?`/, 'the unassign confirm names the template, not its id');
  // wizard + drawer render t.name
  assert.match(picker, /\{t\.name\}/);
  assert.match(panel, /\{t\.name\}/);
});

test('N6: the Assigned box shows the exact template name and the version the next video uses (T3-13)', () => {
  const t = view.templates.find((x) => x.templateId === 'red-flags-explained');
  const row = { family_id: 'red-flags-explained', pinned_major: 1, pinned_version: '1.0.0' };
  const s = assignmentSummary(row, t);
  assert.equal(s.name, 'Red Flags Explained');
  assert.equal(s.version, t.registry.version, 'the box shows the same version as the card (auto-adopted minor)');
  assert.equal(s.version, '1.2.0');
  assert.equal(s.assignedAt, '1.0.0');
  assert.equal(s.updated, true);
  assert.equal(s.majorUpdate, null);
  // unknown template id: say so plainly — never the raw id as a title
  const u = assignmentSummary({ family_id: 'gone-template', pinned_major: 2, pinned_version: '2.0.1' }, null);
  assert.equal(u.name, 'Gone Template');
  assert.equal(u.version, '2.0.1');
  assert.equal(u.missing, true);
  // a newer major waits for consent
  const m = assignmentSummary({ family_id: 'x', pinned_major: 1, pinned_version: '1.0.0' },
    { name: 'X', registry: { version: '2.0.0', changelog: [{ version: '1.0.0' }, { version: '1.4.0' }, { version: '2.0.0' }] } });
  assert.equal(m.version, '1.4.0');
  assert.equal(m.majorUpdate, 2);
  const panel = read('studio/components/TemplateAssignPanel.js');
  assert.match(panel, /assignmentSummary\(a, t\)/, 'the drawer uses the tested summary');
  assert.match(panel, /v\{s\.version\}/);
  assert.doesNotMatch(panel, /v\{a\.pinned_version\} · major/, 'the stale assign-time version is no longer the headline');
});
