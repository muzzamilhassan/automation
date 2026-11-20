// Owner feedback round 1, item C — a breadcrumb on every page, every width.
// Spec + QA: docs/qa/feedback-r1-shell-qa.md (R1-R7, R11).
//
// Behavioral: buildBreadcrumbs() from studio/lib/breadcrumbs.mjs, fed the REAL
// menu from nav.js. Source pins for AppShell (it uses '@/' imports plain node
// can't resolve); regexes are CRLF-safe and comment-stripped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STUDIO = path.join(ROOT, 'studio');
const { buildBreadcrumbs, prettifySegment } = await import(pathToFileURL(path.join(STUDIO, 'lib/breadcrumbs.mjs')).href);
const { NAV, ALL_NAV_ITEMS } = await import(pathToFileURL(path.join(STUDIO, 'components/shell/nav.js')).href);

const MENU = NAV.flatMap((g) => g.items);
const crumbs = (p, channelNames) => buildBreadcrumbs(p, { items: ALL_NAV_ITEMS, menu: MENU, channelNames });
const labels = (p, channelNames) => crumbs(p, channelNames).map((c) => c.label).join(' › ');

const code = (src) => src.replace(/\r\n/g, '\n').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const shell = code(fs.readFileSync(path.join(STUDIO, 'components/shell/AppShell.js'), 'utf8'));
const lib = fs.readFileSync(path.join(STUDIO, 'lib/breadcrumbs.mjs'), 'utf8');

test('R2: a screen under a menu item starts with that menu item (Settings › Team)', () => {
  assert.equal(labels('/users'), 'Settings › Team');
  assert.equal(labels('/providers'), 'Settings › AI services');
  assert.equal(labels('/warnings'), 'Inbox › Alerts');
  assert.equal(labels('/review'), 'Inbox › Script approvals');
  assert.equal(labels('/production'), 'Runs › Run a pipeline');
});

test('R2: a menu item page is a single crumb (no section repeated)', () => {
  assert.equal(labels('/channels'), 'Channels');
  assert.equal(labels('/settings'), 'Settings');
  assert.equal(labels('/tasks'), 'Inbox');
});

test('R3: nested URLs get one crumb per level, with the short crumb label', () => {
  assert.equal(labels('/templates'), 'Create › Templates');
  assert.equal(labels('/templates/drafts'), 'Create › Templates › Drafts');
  assert.equal(labels('/templates/registry'), 'Create › Templates › Registry');
  assert.equal(labels('/templates/registry/detail'), 'Create › Templates › Registry › Detail');
  assert.equal(labels('/channels/add'), 'Channels › Add channel');
});

// Live fix wave C1 (T1-24): before the live names load, the crumb is the
// neutral "Channel" — the prettified slug ("Quotequarry") flashed for ~3 s.
test('R4: a channel page shows the live display name, else the neutral "Channel"', () => {
  assert.equal(labels('/channels/money-rulebook', { 'money-rulebook': 'Money Rulebook' }), 'Channels › Money Rulebook');
  assert.equal(labels('/channels/qq', { qq: 'QuoteQuarry' }), 'Channels › QuoteQuarry');
  assert.equal(labels('/channels/money-rulebook'), 'Channels › Channel', 'names not loaded yet');
  assert.equal(labels('/channels/money-rulebook', {}), 'Channels › Channel');
  assert.equal(labels('/channels/the_old-money_code', null), 'Channels › Channel');
  // a real page wins over the names map (add is a page, not a channel)
  assert.equal(labels('/channels/add', { add: 'Some Channel' }), 'Channels › Add channel');
});

test('R5: every crumb links except the last, which is the current page', () => {
  const c = crumbs('/templates/registry/detail');
  assert.deepEqual(c.map((x) => x.href), ['/studio', '/templates', '/templates/registry', null]);
  assert.equal(c.at(-1).current, true);
  for (const x of c.slice(0, -1)) assert.ok(!x.current);
  assert.deepEqual(crumbs('/channels/qq').map((x) => x.href), ['/channels', null]);
  assert.deepEqual(crumbs('/users').map((x) => x.href), ['/settings', null]);
});

test('R7: home is the single crumb "Today"', () => {
  assert.deepEqual(crumbs('/'), [{ label: 'Today', href: null, current: true }]);
});

test('edge cases: trailing slash, query, unknown paths, empty input', () => {
  assert.equal(labels('/users/'), 'Settings › Team');
  assert.equal(labels('/channels/qq?tab=keys#x', { qq: 'QuoteQuarry' }), 'Channels › QuoteQuarry');
  assert.equal(labels('/runs/history'), 'Runs › History');
  assert.equal(labels('/nowhere'), 'Nowhere');
  assert.deepEqual(crumbs(''), []);
  assert.deepEqual(crumbs(null), []);
  // live fix wave C1 (T1-15): a label prettified from the URL is flagged `guessed`
  assert.deepEqual(buildBreadcrumbs('/users'), [{ label: 'Users', href: null, current: true, guessed: true }], 'no menu given → prettified URL only');
});

test('prettifySegment: dashes/underscores to spaces, words capitalised, URL-decoded, never throws', () => {
  assert.equal(prettifySegment('money-rulebook'), 'Money Rulebook');
  assert.equal(prettifySegment('deep_work-os'), 'Deep Work Os');
  assert.equal(prettifySegment('caf%C3%A9-talk'), 'Café Talk');
  assert.equal(prettifySegment('%E0%A4%A'), '%E0%A4%A'); // malformed escape → raw, no throw
  assert.equal(prettifySegment(''), '');
});

test('breadcrumbs.mjs is plain-node testable: no @/ imports, no imports at all', () => {
  assert.doesNotMatch(lib, /from\s+['"]@\//);
  assert.doesNotMatch(lib, /^\s*import\s/m);
});

test('R1: AppShell renders the breadcrumb at every width (no hidden md: gate), fed by buildBreadcrumbs + live names', () => {
  assert.match(shell, /import \{ buildBreadcrumbs, notFoundCrumbs, phoneCrumbs, tabTitle \} from '@\/lib\/breadcrumbs\.mjs';/);
  assert.match(shell, /buildBreadcrumbs\(pathname, \{ items: ALL_NAV_ITEMS, menu: MENU_ITEMS, channelNames \}\)/);
  const nav = shell.match(/<nav aria-label="Breadcrumb" className="([^"]*)"/);
  assert.ok(nav, 'breadcrumb is a labelled <nav>');
  assert.doesNotMatch(nav[1], /\bhidden\b/);
  assert.match(nav[1], /\bflex-1\b/);
  assert.match(nav[1], /\bmin-w-0\b/);
  // the old one-level, desktop-only crumb is gone
  assert.doesNotMatch(shell, /hidden md:flex items-center gap-1\.5 t-13/);
  assert.doesNotMatch(shell, /crumbRoot|pageTitle/);
  // live channel names come from the one brands hook, shared with the sidebar
  assert.match(shell, /const \{ channels: liveChannels, bySlug \} = useBrands\(\);/);
  assert.equal((shell.match(/useBrands\(\)/g) || []).length, 1, 'one /api/brands fetch for the whole shell');
});

test('R5: AppShell links every crumb but the last; the last is aria-current text', () => {
  assert.match(shell, /c\.current \? \(\s*<span aria-current="page" className="[^"]*\btruncate\b[^"]*">\{c\.label\}<\/span>/);
  assert.match(shell, /<Link href=\{c\.href\} className="[^"]*\btruncate\b[^"]*">\{c\.label\}<\/Link>/);
});

test('R6: one line on phones — the list clips, earlier parts truncate, the current page keeps most room', () => {
  const ol = shell.match(/<ol className="([^"]*)"/);
  assert.ok(ol, 'crumbs are an ordered list');
  for (const cls of ['flex', 'min-w-0', 'overflow-hidden', 'whitespace-nowrap']) assert.match(ol[1], new RegExp(String.raw`(^|\s)${cls}(\s|$)`), cls);
  const link = shell.match(/<Link href=\{c\.href\} className="([^"]*)"/)[1];
  assert.match(link, /max-w-\[\d+px\]/, 'earlier crumbs are capped (px — root font is 14px)');
  assert.match(link, /\bmin-w-0\b/);
  assert.match(shell, /<li key=\{[^\n]*?className=\{cn\('flex items-center min-w-0', c\.current && 'shrink-0 max-w-\[65%\]/, 'crumbs shrink; the current page keeps up to 65% on phones');
});

test('R11: the bell is in the topbar at every width and can never be squeezed out', () => {
  // live fix wave B3: the wrapper carries ref={bellRef} (the popover anchors to it)
  const bell = shell.match(/<div (?:ref=\{bellRef\} )?className="([^"]*)">\s*<ButtonUtility[\s\S]{0,120}?icon=\{Bell\}/);
  assert.ok(bell, 'bell wrapper found');
  assert.doesNotMatch(bell[1], /\bhidden\b/);
  assert.match(bell[1], /\bshrink-0\b/);
  assert.match(bell[1], /\brelative\b/);
});
