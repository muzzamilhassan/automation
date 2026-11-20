// Live fix wave C1 (2026-11-20 live test report, research/live-e2e-test-2026-11-20.md):
// shell, login, 404, tab titles and naming.
//   T1-12  /templates/drafts lit Inbox while the breadcrumb said Create
//   T1-15  React #418 on the 404 page (static 404 HTML is rendered for
//          "/_not-found", the browser hydrates the real URL → crumb mismatch)
//   T1-16  dead "TikTok dashboard" link in the sidebar
//   T1-17 / T2-21  one place, four names → Inbox (/tasks) + Alerts (/warnings)
//   T1-18  /api/overview 401 on /login, /proof, /client
//   T1-20  /login shows the form when already signed in
//   T1-23  404 crumb prettified the made-up URL; "Back to overview"
//   T1-24  unknown channel → HTTP 200; crumb flashed the prettified slug
//   T1-25  every tab titled "Quarry Studio — Command Center"
//   T1-26  footer version wraps on phones
//   T1-27  phone crumb "Cr… › Temp… › Registry"
//   T1-28  ALL CAPS vs Mixed Case names, "TH" initials (pure helper:
//          tests/channel-display.test.mjs)
//   T1-29  "4 tries left this window"; wrong password stays in the field
//   T1-30  a password of spaces enables the button
// Pure logic is behaviour-tested; '@/' components are pinned by source scan
// (house pattern). QA: docs/qa/live-fix-wave-c1-qa.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildBreadcrumbs, notFoundCrumbs, phoneCrumbs, tabTitle, menuSectionFor } from '../studio/lib/breadcrumbs.mjs';
// nav.js imports lucide-react (a studio-only package): load it dynamically like
// tests/breadcrumbs.test.mjs, so the root-manifest import walker skips it.
const { NAV, ALL_NAV_ITEMS, MENU_ITEMS, navSectionFor } = await import(new URL('../studio/components/shell/nav.js', import.meta.url).href);
import { wrongPasswordMessage, canSubmitPassword, EMPTY_PASSWORD, LOGIN_WINDOW_MINUTES } from '../studio/lib/login-errors.mjs';

const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const SHELL = code(read('studio/components/shell/AppShell.js'));
const frame = () => SHELL.slice(SHELL.indexOf('function ShellFrame'));
const PALETTE = code(read('studio/components/shell/CommandPalette.js'));
const POCKET = code(read('studio/components/shell/PocketBar.js'));
const MISSING = code(read('studio/components/shell/page-missing.js'));
const NOT_FOUND = code(read('studio/app/not-found.js'));
const LAYOUT = code(read('studio/app/layout.js'));
const LOGIN = code(read('studio/app/login/page.js'));
const WORKSPACE = code(read('studio/components/WorkspaceContext.js'));
const TASKS = code(read('studio/app/tasks/page.js'));
const WARNINGS = code(read('studio/app/warnings/page.js'));
const CHANNEL_LAYOUT_PATH = 'studio/app/channels/[slug]/layout.js';

const opts = (channelNames) => ({ items: ALL_NAV_ITEMS, menu: MENU_ITEMS, channelNames });
const crumbs = (p, names) => buildBreadcrumbs(p, opts(names));
const labels = (p, names) => crumbs(p, names).map((c) => c.label).join(' › ');

/* --------------------------------- T1-12 ---------------------------------- */

test('T1-12 EARS: WHEN a page opens THEN the sidebar lights the same menu item the breadcrumb starts with', () => {
  assert.equal(navSectionFor('/templates/drafts').label, 'Create');
  assert.equal(labels('/templates/drafts'), 'Create › Templates › Drafts');
  const paths = [...ALL_NAV_ITEMS.map((i) => i.href), '/channels/qq', '/runs/history', '/templates/registry/detail'];
  for (const p of paths) {
    const first = crumbs(p)[0];
    assert.equal(navSectionFor(p)?.label, first.label, p);
  }
  assert.equal(navSectionFor('/nowhere'), null);
  assert.equal(menuSectionFor('/review', opts()).label, 'Inbox');
});

test('T1-12: nav.js reads the section from the breadcrumb module (one rule, not two)', () => {
  const nav = code(read('studio/components/shell/nav.js'));
  assert.match(nav, /import \{ menuSectionFor \} from '\.\.\/\.\.\/lib\/breadcrumbs\.mjs';/);
  assert.match(nav, /return menuSectionFor\(pathname, \{ items: ALL_NAV_ITEMS, menu: MENU_ITEMS \}\);/);
});

/* --------------------------- T1-15 / T1-23 (404) --------------------------- */

test('T1-23 EARS: WHEN the page does not exist THEN the breadcrumb says "Page not found", never the made-up URL', () => {
  assert.deepEqual(notFoundCrumbs(), [{ label: 'Page not found', href: null, current: true }]);
  assert.match(frame(), /const crumbs = pageMissing \? notFoundCrumbs\(\) : buildBreadcrumbs\(pathname, \{ items: ALL_NAV_ITEMS, menu: MENU_ITEMS, channelNames \}\);/);
  assert.match(frame(), /const pageMissing = usePageMissing\(\);/);
});

test('T1-23: the 404 button goes back to Today; the page marks itself missing for the shell', () => {
  assert.match(NOT_FOUND, />Back to Today<\/Link>/);
  assert.doesNotMatch(NOT_FOUND, /Back to overview/);
  assert.match(NOT_FOUND, /import \{ PageMissingMark \} from '@\/components\/shell\/page-missing';/);
  assert.match(NOT_FOUND, /<PageMissingMark \/>/);
});

test('T1-15 EARS: WHEN the static 404 hydrates THEN no URL-guessed crumb text is server-rendered (no #418)', () => {
  // a prettified (guessed) crumb is flagged; known ones are not
  assert.equal(crumbs('/does-not-exist')[0].guessed, true);
  assert.equal(crumbs('/_not-found')[0].guessed, true, 'the URL the static 404 is prerendered under');
  assert.equal(crumbs('/runs/history').at(-1).guessed, true);
  assert.ok(!crumbs('/channels/qq').some((c) => c.guessed), 'a channel crumb is never guessed');
  assert.ok(!crumbs('/templates/registry').some((c) => c.guessed));
  // the shell waits for hydration before rendering any guessed crumb
  assert.match(frame(), /const hydrated = useHydrated\(\);/);
  assert.match(frame(), /const showCrumbs = hydrated \|\| !crumbs\.some\(\(c\) => c\.guessed\);/);
  assert.match(frame(), /\{showCrumbs \? phoneCrumbs\(crumbs\)\.map\(/);
  // no time/random/locale text on the 404 page itself
  assert.doesNotMatch(NOT_FOUND, /new Date|Date\.now|Math\.random|toLocale/);
});

test('T1-15: page-missing.js — a mark counter read through useSyncExternalStore (server snapshot false)', () => {
  assert.match(MISSING, /^'use client';/);
  assert.match(MISSING, /export function usePageMissing\(\)/);
  assert.match(MISSING, /useSyncExternalStore\(subscribe, \(\) => marks > 0, \(\) => false\)/);
  assert.match(MISSING, /export function useHydrated\(\)/);
  assert.match(MISSING, /useSyncExternalStore\(noop, \(\) => true, \(\) => false\)/);
  assert.match(MISSING, /export function PageMissingMark\(\)/);
  assert.match(MISSING, /useLayoutEffect\(/);
});

/* --------------------------------- T1-24 ---------------------------------- */

test('T1-24 EARS: WHILE live names are loading THEN a channel crumb says "Channel", never a guessed slug', () => {
  assert.equal(labels('/channels/quotequarry'), 'Channels › Channel');
  assert.equal(labels('/channels/quotequarry', {}), 'Channels › Channel');
  assert.equal(labels('/channels/quotequarry', { quotequarry: 'Quote Quarry' }), 'Channels › Quote Quarry');
});

test('T1-24 EARS: WHEN /channels/<slug> is not a real channel THEN the server answers 404 (layout, fails open)', () => {
  assert.ok(fs.existsSync(CHANNEL_LAYOUT_PATH), 'a server layout wraps the channel page');
  const l = code(read(CHANNEL_LAYOUT_PATH));
  assert.doesNotMatch(l, /'use client'/);
  assert.match(l, /import \{ notFound \} from 'next\/navigation';/);
  assert.match(l, /import \{ isKnownChannelSlug \} from '@\/lib\/channel-display\.mjs';/);
  assert.match(l, /const \{ slug \} = await params;/);
  assert.match(l, /if \(!known\) notFound\(\);/);
  // a registry/brand read failure renders the page (it has its own error state)
  assert.match(l, /catch \{\s*return children;\s*\}/);
  assert.match(l, /if \(!registry\.length\) return children;/, 'an empty (degraded) registry read never 404s a real channel');
});

/* --------------------------------- T1-16 ---------------------------------- */

test('T1-16: the retired TikTok dashboard link is gone from the sidebar', () => {
  assert.doesNotMatch(SHELL, /TikTok/i);
  assert.doesNotMatch(SHELL, /quarrystudio\/dashboard\.html/);
});

/* ------------------------------ T1-17 / T2-21 ------------------------------ */

test('T2-21 EARS: one place, two names — Inbox (/tasks) and Alerts (/warnings) everywhere', () => {
  assert.equal(NAV.flatMap((g) => g.items).find((i) => i.href === '/tasks').label, 'Inbox');
  assert.equal(ALL_NAV_ITEMS.find((i) => i.href === '/warnings').label, 'Alerts');
  assert.equal(labels('/tasks'), 'Inbox');
  assert.equal(labels('/warnings'), 'Inbox › Alerts');
  assert.match(POCKET, /href: '\/warnings', label: 'Alerts'/);
  // the bell's footer link
  assert.match(SHELL, />\s*See all alerts →\s*</);
  assert.doesNotMatch(SHELL, /warning triage/);
  // page headings
  assert.match(TASKS, /<PageHeader icon=\{SquareKanban\} title="Inbox" /);
  assert.doesNotMatch(TASKS, /title="Tasks"/);
  assert.match(WARNINGS, /<PageHeader\s+icon=\{TriangleAlert\}\s+title="Alerts"/);
  assert.doesNotMatch(WARNINGS, /title="Warnings"/);
});

/* --------------------------------- T1-18 ---------------------------------- */

test('T1-18 EARS: WHILE on a bare page (/login, /proof, /client) THEN the workspace loader never calls /api/overview', () => {
  assert.match(WORKSPACE, /import \{ usePathname \} from 'next\/navigation';/);
  assert.match(WORKSPACE, /import \{ isBarePath \} from '@\/lib\/safe-next\.mjs';/);
  assert.match(WORKSPACE, /const bare = isBarePath\(usePathname\(\)\);/);
  const effect = WORKSPACE.slice(WORKSPACE.indexOf('useEffect(() => {'));
  assert.match(effect, /^useEffect\(\(\) => \{\s*if \(bare\) return undefined;/);
  assert.match(effect, /\}, \[refresh, bare\]\);/);
});

/* --------------------------------- T1-20 ---------------------------------- */

test('T1-20 EARS: WHEN /login opens on a signed-in device THEN it goes to ?next= (safe) or /', () => {
  const effect = LOGIN.slice(LOGIN.indexOf("fetch('/api/me'"));
  assert.ok(LOGIN.includes("fetch('/api/me'"), 'login asks who is signed in');
  assert.match(effect, /if \(alive && r\.ok\) router\.replace\(safeNextPath\(q\.get\('next'\)\)\);/);
});

/* ------------------------------ T1-29 / T1-30 ------------------------------ */

test('T1-29 EARS: WHEN the password is wrong THEN the message names the real 15-minute window', () => {
  assert.equal(LOGIN_WINDOW_MINUTES, 15);
  assert.equal(wrongPasswordMessage('Wrong password. 4 tries left this window.'), 'Wrong password. 4 tries left. Try again in 15 minutes if you run out.');
  assert.equal(wrongPasswordMessage('Wrong password. 1 tries left this window.'), 'Wrong password. 1 try left. Try again in 15 minutes if you run out.');
  assert.equal(wrongPasswordMessage('Wrong password. Locked for 10 minutes.'), 'Wrong password. Locked for 10 minutes.');
  assert.equal(wrongPasswordMessage(''), 'Could not sign in.');
  assert.equal(wrongPasswordMessage(undefined), 'Could not sign in.');
  // the window the login route counts failures over (session-db default)
  assert.match(read('studio/lib/session-db.js'), /export async function recentFailures\(ip, minutes = 15\)/);
});

test('T1-29: a failed sign-in clears the password field and shows the plain message', () => {
  assert.match(LOGIN, /setError\(wrongPasswordMessage\(d\.error\)\);\s*setPassword\(''\);/);
});

test('T1-30 EARS: a password of only spaces never enables the button; Enter on empty says "Enter your password"', () => {
  assert.equal(EMPTY_PASSWORD, 'Enter your password');
  assert.equal(canSubmitPassword('   '), false);
  assert.equal(canSubmitPassword(''), false);
  assert.equal(canSubmitPassword(null), false);
  assert.equal(canSubmitPassword(' pw '), true);
  assert.match(LOGIN, /disabled=\{busy \|\| !canSubmitPassword\(password\)\}/);
  assert.match(LOGIN, /if \(!canSubmitPassword\(password\)\) \{\s*setError\(EMPTY_PASSWORD\);\s*return;\s*\}/);
  assert.match(LOGIN, /onKeyDown=\{\(e\) => \{\s*if \(e\.key === 'Enter' && !canSubmitPassword\(password\)\) \{\s*e\.preventDefault\(\);\s*setError\(EMPTY_PASSWORD\);/);
});

/* --------------------------------- T1-25 ---------------------------------- */

test('T1-25 EARS: every page gets its own tab title from its breadcrumb', () => {
  assert.equal(tabTitle(crumbs('/')), 'Today · Quarry Studio');
  assert.equal(tabTitle(crumbs('/channels')), 'Channels · Quarry Studio');
  assert.equal(tabTitle(crumbs('/channels/mr', { mr: 'The Money Rulebook' })), 'The Money Rulebook · Quarry Studio');
  assert.equal(tabTitle(crumbs('/templates/registry')), 'Registry · Quarry Studio');
  assert.equal(tabTitle(notFoundCrumbs()), 'Page not found · Quarry Studio');
  assert.equal(tabTitle([]), 'Quarry Studio');
  assert.equal(tabTitle(null), 'Quarry Studio');
});

test('T1-25: the shell sets document.title from the crumbs; login names itself; the default is plain', () => {
  assert.match(frame(), /const tabLabel = tabTitle\(crumbs\);/);
  assert.match(frame(), /useEffect\(\(\) => \{\s*document\.title = tabLabel;\s*\}, \[tabLabel\]\);/);
  assert.match(LOGIN, /document\.title = 'Sign in · Quarry Studio';/);
  assert.match(LAYOUT, /title: "Quarry Studio",/);
  assert.doesNotMatch(LAYOUT, /Command Center/);
});

/* --------------------------------- T1-26 ---------------------------------- */

test('T1-26: the footer version never wraps on phones', () => {
  assert.match(SHELL, /<span className="[^"]*\bwhitespace-nowrap\b[^"]*">v4\.0 · Dreams UI<\/span>/);
});

/* --------------------------------- T1-27 ---------------------------------- */

test('T1-27 EARS: WHEN a trail is deeper than parent + page THEN phones show "… › parent › page"', () => {
  const c = phoneCrumbs(crumbs('/templates/registry'));
  // phone view: ellipsis + the last two
  const phone = c.filter((x) => x.only !== 'desk');
  assert.deepEqual(phone.map((x) => x.label), ['…', 'Templates', 'Registry']);
  // desktop view: the full trail
  const desk = c.filter((x) => x.only !== 'phone');
  assert.deepEqual(desk.map((x) => x.label), ['Create', 'Templates', 'Registry']);
  // the ellipsis links to the nearest hidden parent and names what it hides
  const dots = c.find((x) => x.ellipsis);
  assert.equal(dots.href, '/studio');
  assert.equal(dots.title, 'Create');
  // separators: none before the first item on either width
  assert.deepEqual(c.map((x) => x.sep), [false, false, true, true]);
  const deep = phoneCrumbs(crumbs('/templates/registry/detail'));
  assert.deepEqual(deep.filter((x) => x.only !== 'desk').map((x) => x.label), ['…', 'Registry', 'Detail']);
  assert.equal(deep.find((x) => x.ellipsis).title, 'Create › Templates');
  assert.equal(deep.find((x) => x.ellipsis).href, '/templates');
  assert.deepEqual(deep.map((x) => x.sep), [false, false, true, true, true]);
});

test('T1-27: short trails are untouched (no ellipsis, separators between items)', () => {
  const two = phoneCrumbs(crumbs('/users'));
  assert.deepEqual(two.map((x) => [x.label, x.only, x.sep]), [['Settings', null, false], ['Team', null, true]]);
  assert.deepEqual(phoneCrumbs(crumbs('/')).map((x) => x.label), ['Today']);
  assert.deepEqual(phoneCrumbs([]), []);
});

test('T1-27: the shell hides collapsed crumbs on phones and the ellipsis on desktop', () => {
  assert.match(SHELL, /import \{ buildBreadcrumbs, notFoundCrumbs, phoneCrumbs, tabTitle \} from '@\/lib\/breadcrumbs\.mjs';/);
  assert.match(frame(), /c\.only === 'phone' && 'md:hidden'/);
  assert.match(frame(), /c\.only === 'desk' && 'hidden md:flex'/);
  assert.match(frame(), /\{c\.sep \? <ChevronRight/);
});

/* --------------------------------- T1-28 ---------------------------------- */

test('T1-28: the sidebar, crumbs and palette show names through channel-display', () => {
  assert.match(SHELL, /import \{ channelDisplayName, displayChannel \} from '@\/lib\/channel-display\.mjs';/);
  assert.match(frame(), /const sideChannels = liveChannels\.map\(displayChannel\);/);
  assert.match(frame(), /channels=\{sideChannels\}/);
  assert.match(frame(), /\[slug, channelDisplayName\(c\.label, slug\)\]/);
  assert.match(PALETTE, /import \{ channelDisplayName \} from '@\/lib\/channel-display\.mjs';/);
  assert.match(PALETTE, /label: channelDisplayName\(c\.label, c\.slug\)/);
});
