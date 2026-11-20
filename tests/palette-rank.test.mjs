// Live fix wave B3 — T1-11 (command palette Enter picked menu order, not the
// best match) + T1-22 (⌘K shown on Windows). Pure helper, behaviour-tested.
// QA: docs/qa/live-fix-wave-b3-qa.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rankPaletteItems, paletteScore, shortcutLabel } from '../studio/lib/palette-rank.mjs';

// nav.js imports lucide-react (a studio-only dependency) — loaded the same way
// tests/nav-ia.test.mjs does, so the root-manifest walker stays happy.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { ALL_NAV_ITEMS } = await import(pathToFileURL(path.join(ROOT, 'studio/components/shell/nav.js')).href);

// The palette's page entries, shaped exactly as CommandPalette builds them.
const pages = ALL_NAV_ITEMS.map((n) => ({ kind: 'page', id: n.href, label: n.label, sub: n.desc, keywords: n.keywords || [] }));
const top = (q) => rankPaletteItems(pages, q)[0]?.id;

test('T1-11 EARS: WHEN the query equals an item label THEN that item is first ("Team" → /users, not Settings)', () => {
  assert.equal(top('Team'), '/users');
  assert.equal(top('team'), '/users', 'case does not matter');
  assert.equal(top('  Team '), '/users', 'surrounding spaces do not matter');
});

test('T1-11 EARS: WHEN the query is "Templates" THEN Templates is first, not Create', () => {
  assert.equal(top('Templates'), '/templates');
});

test('T1-11 EARS: starts-with beats contains beats keywords beats description', () => {
  const items = [
    { id: 'desc', label: 'Zeta', sub: 'about runs', keywords: [] },
    { id: 'kw', label: 'Alpha', sub: '', keywords: ['runs'] },
    { id: 'contains', label: 'Pipeline runs', sub: '', keywords: [] },
    { id: 'starts', label: 'Runs today', sub: '', keywords: [] },
    { id: 'exact', label: 'Runs', sub: '', keywords: [] },
    { id: 'none', label: 'Nothing', sub: '', keywords: [] },
  ];
  assert.deepEqual(rankPaletteItems(items, 'runs').map((i) => i.id), ['exact', 'starts', 'contains', 'kw', 'desc']);
  assert.equal(paletteScore(items[5], 'runs'), null, 'no match = filtered out');
});

test('T1-11: equal scores keep menu order (stable); an empty query keeps every item in order', () => {
  const items = [
    { id: 'a', label: 'Run A', sub: '' },
    { id: 'b', label: 'Run B', sub: '' },
    { id: 'c', label: 'Run C', sub: '' },
  ];
  assert.deepEqual(rankPaletteItems(items, 'run').map((i) => i.id), ['a', 'b', 'c']);
  assert.deepEqual(rankPaletteItems(items, '').map((i) => i.id), ['a', 'b', 'c']);
  assert.deepEqual(rankPaletteItems(items, '   ').map((i) => i.id), ['a', 'b', 'c']);
  assert.deepEqual(items.map((i) => i.id), ['a', 'b', 'c'], 'input untouched');
});

test('T1-11: still finds items by description and keywords (nothing searchable before is lost)', () => {
  assert.ok(rankPaletteItems(pages, 'retention').some((i) => i.id === '/analytics'), 'keyword');
  assert.ok(rankPaletteItems(pages, 'Devices signed in').some((i) => i.id === '/sessions'), 'description');
  assert.equal(rankPaletteItems(pages, 'zzzz-nothing').length, 0);
  assert.deepEqual(rankPaletteItems(null, 'x'), []);
});

test('T1-22 EARS: Mac shows ⌘K; Windows, Linux and unknown show Ctrl K', () => {
  for (const p of ['MacIntel', 'macOS', 'iPhone', 'iPad', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)']) assert.equal(shortcutLabel(p), '⌘K', p);
  for (const p of ['Win32', 'Windows', 'Linux x86_64', 'Mozilla/5.0 (X11; Linux x86_64)', '', undefined, null]) assert.equal(shortcutLabel(p), 'Ctrl K', String(p));
});

test('palette-rank.mjs is pure: no @/ imports, no React', () => {
  const src = fs.readFileSync('studio/lib/palette-rank.mjs', 'utf8');
  assert.doesNotMatch(src, /from '@\//);
  assert.doesNotMatch(src, /from 'react'/);
});
