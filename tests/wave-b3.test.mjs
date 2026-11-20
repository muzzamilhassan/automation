// Live fix wave B3 (2026-11-20 live test report, research/live-e2e-test-2026-11-20.md):
// shell, phone and everyday comfort.
//   T1-05  bell + avatar menus ignore Escape / outside clicks (backdrop-filter
//          made the header the containing block of the fixed click-away layer)
//   T1-04  bell popover starts 34px off-screen on a 390px phone
//   T1-21  phone menu drawer ignores Escape
//   T1-06  no loading sign for 5–11 s on page changes
//   T1-03 / T2-05  /tasks is 980px wide on phones
//   T1-07 / T2-10  home channel names squeezed to one letter on phones
//   A1 note        "Sign in with Google" was a plain link to a JSON route
//   T1-13  no phone tab highlighted on Inbox (/tasks)
// (T1-11 + T1-22 live in tests/palette-rank.test.mjs.)
// Pure logic is behaviour-tested; '@/' components are pinned by source scan
// (house pattern). QA: docs/qa/live-fix-wave-b3-qa.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { placePopover } from '../studio/lib/popover-place.mjs';
import { isTrackableNav, trickle } from '../studio/lib/nav-progress.mjs';

const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const SHELL = read('studio/components/shell/AppShell.js');
const PROGRESS = read('studio/components/shell/NavProgress.js');
const PALETTE = read('studio/components/shell/CommandPalette.js');
const POCKET = read('studio/components/shell/PocketBar.js');
const TASKS = read('studio/app/tasks/page.js');
const WARNINGS = read('studio/app/warnings/page.js');
const HOME = read('studio/app/page.js');
const LOGIN = read('studio/app/login/page.js');
const frame = () => SHELL.slice(SHELL.indexOf('function ShellFrame'));

/* ------------------------------ T1-04 (pure) ------------------------------ */

test('T1-04 EARS: WHEN the bell opens on a 390px phone THEN the popover sits fully on screen', () => {
  // the live test: bell trigger right edge ≈ 306, popover 340 wide → x = −34
  const p = placePopover({ anchor: { left: 278, right: 306, bottom: 42 }, width: 340, viewportWidth: 390 });
  assert.ok(p.left >= 8, `left ${p.left}`);
  assert.ok(p.left + p.width <= 390 - 8, `right edge ${p.left + p.width}`);
  assert.equal(p.width, 340);
  assert.equal(p.top, 52, '10px below the trigger');
});

test('T1-04 EARS: at every width from 280 to 1920 the popover stays inside the viewport (8px margin)', () => {
  for (let vw = 280; vw <= 1920; vw += 10) {
    for (const right of [36, vw / 2, vw - 80, vw - 14]) {
      const p = placePopover({ anchor: { left: right - 28, right, bottom: 42 }, width: 340, viewportWidth: vw });
      assert.ok(p.left >= 8 && p.left + p.width <= vw - 8 + 1e-9, `vw ${vw} right ${right}: ${JSON.stringify(p)}`);
      assert.ok(p.width <= vw - 16);
    }
  }
});

test('T1-04: on a wide screen the popover right-aligns to its trigger (desktop look unchanged)', () => {
  const p = placePopover({ anchor: { left: 1180, right: 1208, bottom: 45 }, width: 340, viewportWidth: 1440 });
  assert.equal(p.left + p.width, 1208);
  assert.equal(p.top, 55);
});

/* ------------------------------ T1-05 wiring ------------------------------ */

test('T1-05 EARS: the bell + avatar menus render through a portal on document.body (escapes the header containing block)', () => {
  assert.match(SHELL, /import \{ createPortal \} from 'react-dom';/);
  assert.match(SHELL, /createPortal\([\s\S]*?document\.body\s*\)/);
  assert.match(SHELL, /import \{ placePopover \} from '@\/lib\/popover-place\.mjs';/);
  const f = frame();
  assert.equal((f.match(/<HeaderPopover\b/g) || []).length, 2, 'bell + avatar both use the portal popover');
  // no click-away layer left inline inside the header
  const header = f.slice(f.indexOf('<header'), f.indexOf('</header>'));
  assert.doesNotMatch(header, /className="fixed inset-0/);
});

test('T1-05 EARS: WHEN Escape is pressed with a menu open THEN it closes and focus returns to its trigger', () => {
  const pop = SHELL.slice(SHELL.indexOf('function HeaderPopover'), SHELL.indexOf('function Notifications'));
  assert.match(pop, /e\.key [!=]== 'Escape'/);
  assert.match(pop, /closeRef\.current\(\);\s*trigger\(\)\?\.focus\(\)/, 'close, then focus the trigger');
  assert.match(pop, /focus\(\)/, 'focus goes back to the trigger');
  assert.match(pop, /document\.addEventListener\('keydown'/);
  assert.match(pop, /fixed inset-0/, 'the click-away layer covers the whole viewport (now in body)');
});

test('T1-05: the Notifications content is unchanged (A1/A4 behaviour kept)', () => {
  assert.match(SHELL, /function Notifications\(\{ open, onClose, warnings \}\)/);
  assert.match(SHELL, /warnings=\{\{ rows: openWarningRows, canSee: warningsCanSee, status: warnStatus, retry: warnRetry, awaiting \}\}/);
  const notif = SHELL.slice(SHELL.indexOf('function Notifications'), SHELL.indexOf('function NavGroups'));
  assert.match(notif, /const need = needsYou\(\{ rows, awaiting: warnings\.awaiting \|\| 0 \}\);/);
  assert.match(notif, /waiting for your approval/);
});

/* --------------------------------- T1-21 ---------------------------------- */

test('T1-21 EARS: WHEN Escape is pressed with the phone menu open THEN it closes and focus returns to ☰', () => {
  const f = frame();
  assert.match(f, /const menuBtnRef = useRef\(null\)/);
  assert.match(f, /ref=\{menuBtnRef\}/);
  const at = f.indexOf('if (!mobileOpen) return undefined;');
  assert.ok(at > 0, 'an Escape effect runs while the drawer is open');
  const body = f.slice(at, f.indexOf('}, [mobileOpen]);', at));
  assert.match(body, /e\.key [!=]== 'Escape'/);
  assert.match(body, /setMobileOpen\(false\)/);
  assert.match(body, /menuBtnRef\.current/);
  assert.match(f, /role="dialog" aria-modal="true" aria-label="Menu"/);
});

/* --------------------------------- T1-06 ---------------------------------- */

test('T1-06 (pure): only real in-app page changes start the bar', () => {
  const cur = 'https://studio.test/channels';
  assert.equal(isTrackableNav({ href: '/runs', current: cur }), true);
  assert.equal(isTrackableNav({ href: 'https://studio.test/channels/mr', current: cur }), true);
  assert.equal(isTrackableNav({ href: '/studio?tab=create', current: 'https://studio.test/studio' }), true, 'query change is a navigation');
  assert.equal(isTrackableNav({ href: '/channels', current: cur }), false, 'same page');
  assert.equal(isTrackableNav({ href: '/channels#x', current: cur }), false, 'hash only');
  assert.equal(isTrackableNav({ href: 'https://example.com/', current: cur }), false, 'other site');
  assert.equal(isTrackableNav({ href: 'mailto:a@b.c', current: cur }), false);
  assert.equal(isTrackableNav({ href: '/runs', current: cur, target: '_blank' }), false);
  assert.equal(isTrackableNav({ href: '/runs', current: cur, modified: true }), false, 'ctrl/cmd-click opens a tab');
  assert.equal(isTrackableNav({ href: '/runs', current: cur, button: 1 }), false, 'middle click');
  assert.equal(isTrackableNav({ href: '/api/export.csv', current: cur, download: true }), false);
  assert.equal(isTrackableNav({ href: '', current: cur }), false);
  assert.equal(isTrackableNav({ href: '/runs', current: cur, target: '_self' }), true);
});

test('T1-06 (pure): the bar creeps toward 90% and never passes it before the page renders', () => {
  let p = 8;
  for (let i = 0; i < 500; i++) {
    const n = trickle(p);
    assert.ok(n >= p && n <= 90, `${p} → ${n}`);
    p = n;
  }
  assert.ok(p > 85, 'it keeps moving');
});

test('T1-06 EARS: the progress bar starts on link clicks + palette pushes and finishes on route render', () => {
  assert.match(PROGRESS, /^'use client';/);
  assert.match(PROGRESS, /document\.addEventListener\('click', onClick, true\)/);
  assert.match(PROGRESS, /window\.addEventListener\(NAV_START_EVENT, onStart\)/);
  assert.match(PROGRESS, /export function startNavProgress\(href\)/);
  // finishes when the new route renders (pathname) or the URL commits (query-only changes)
  const pathAt = PROGRESS.indexOf('const pathname = usePathname()');
  assert.ok(pathAt > 0);
  assert.ok(pathAt < PROGRESS.indexOf('[pathname]'), 'pathname is declared before any effect lists it');
  assert.match(PROGRESS, /window\.location\.href !== startHref/);
  // reduced motion
  assert.match(PROGRESS, /motion-reduce:transition-none/);
  assert.match(PROGRESS, /role="progressbar"/);
  // mounted in the frame; the palette announces router.push navigations
  assert.match(frame(), /<NavProgress \/>/);
  assert.match(PALETTE, /import \{ startNavProgress \} from '\.\/NavProgress';/);
  assert.match(PALETTE, /startNavProgress\(n\.href\); router\.push\(n\.href\);/);
  assert.match(PALETTE, /startNavProgress\(`\/channels\/\$\{c\.slug\}`\)/);
});

const LOADING_ROUTES = ['', 'channels', 'channels/[slug]', 'analytics', 'runs', 'videos', 'warnings', 'tasks'];
test('T1-06 EARS: the heaviest routes have a loading.js skeleton (shown instantly while the page loads)', () => {
  for (const r of LOADING_ROUTES) {
    const p = `studio/app/${r ? r + '/' : ''}loading.js`;
    assert.ok(fs.existsSync(p), `${p} exists`);
    const src = read(p);
    assert.match(src, /export default function Loading\(\)/, p);
    assert.match(src, /import RouteLoading from '@\/components\/shell\/RouteLoading';/, p);
  }
  const rl = read('studio/components/shell/RouteLoading.js');
  assert.match(rl, /role="status"/);
  assert.match(rl, /Loading…/);
  assert.match(rl, /motion-reduce:/, 'the shimmer stops for reduced motion');
});

/* ----------------------------- T1-03 / T2-05 ------------------------------ */

test('T1-03 EARS: /tasks fits a 360–390px phone — cards may shrink, long titles wrap', () => {
  const c = code(TASKS);
  assert.match(c, /grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4/);
  assert.equal((c.match(/<Card className="p-5 min-w-0">/g) || []).length, 3, 'all three cards are min-w-0 grid items');
  assert.doesNotMatch(c, /t-12 text-ink truncate">\{w\.title\}/, 'open-warning titles no longer force one line');
  assert.match(c, /\[overflow-wrap:anywhere\][^"]*">\{w\.title\}/);
  assert.match(c, /\[overflow-wrap:anywhere\][^"]*">\{s\.title \|\| s\.topic \|\| s\.id\}/);
  assert.match(c, /Open warnings/, 'copy unchanged');
});

test('T1-03: /warnings keeps its logic; the FYI + resolved rows can wrap too', () => {
  const c = code(WARNINGS);
  assert.match(c, /const need = needsYou\(\{ rows: open, awaiting: awaitingCount \}\);/);
  assert.match(c, /<p className="t-12 font-semibold text-ink break-words \[overflow-wrap:anywhere\]">\{g\.count\}×/);
  assert.match(c, /<span className="text-faint min-w-0 break-words">\{w\.channel_id\}<\/span>/);
});

/* ----------------------------- T1-07 / T2-10 ------------------------------ */

test('T1-07 EARS: on phones the channel name gets its own line; status stacks under it', () => {
  const list = HOME.slice(HOME.indexOf('function TodayList'), HOME.indexOf('function OverviewContent'));
  // the name fills the first line beside the mark on phones (no squeezing to one letter)
  assert.match(list, /basis-\[calc\(100%-38px\)\] sm:basis-auto/);
  assert.match(list, /break-words sm:truncate/);
  // status + next slot sit under the name on phones (indented past the mark)
  assert.match(list, /pl-\[38px\] sm:pl-0/);
  // A3's data logic kept
  assert.match(list, /const t = channelToday\(c, now\);/);
  assert.match(list, /const next = t\.state === 'paused' \? null : nextSlot\(c\.slots, c\.longSlot, now\);/);
});

/* ------------------------------- Google sign-in ------------------------------ */

test('Google sign-in EARS: WHEN the button is pressed THEN it fetches the start URL and navigates there — never shows raw JSON', () => {
  const c = code(LOGIN);
  assert.doesNotMatch(c, /href="\/api\/auth\/google\/start"/, 'no plain link to the JSON route');
  assert.match(c, /const signInWithGoogle = async \(\) =>/);
  const body = c.slice(c.indexOf('const signInWithGoogle'), c.indexOf('\n  };\n', c.indexOf('const signInWithGoogle')));
  assert.match(body, /fetch\('\/api\/auth\/google\/start'/);
  assert.match(body, /window\.location\.assign\(d\.url\)/);
  assert.match(body, /setGoogleBusy\(true\)/);
  assert.match(body, /setError\(/, 'a failure shows a message');
  assert.match(c, /onClick=\{signInWithGoogle\}/);
  assert.match(c, /googleBusy \? 'Opening Google…' : 'Sign in with Google'/);
  // the route itself is untouched (JSON form + state cookie)
  const route = read('studio/app/api/auth/google/start/route.js');
  assert.match(route, /Response\.json\(\{ url: /);
  assert.match(route, /qs_gstate=/);
});

/* --------------------------------- T1-13 ---------------------------------- */

test('T1-13 EARS: on /tasks the phone bar highlights the Alerts tab (the Inbox)', () => {
  const c = code(POCKET);
  assert.match(c, /const ALSO_ACTIVE = \{ '\/warnings': \['\/tasks'\] \};/);
  const fn = c.slice(c.indexOf('const isActive'), c.indexOf('\n\n', c.indexOf('const isActive')));
  // evaluate the shipped matcher
  const isActive = new Function('ALSO_ACTIVE', `${fn.replace('const isActive =', 'return')}`)({ '/warnings': ['/tasks'] });
  assert.equal(isActive('/warnings', '/tasks'), true);
  assert.equal(isActive('/warnings', '/warnings'), true);
  assert.equal(isActive('/warnings', '/tasks/x'), true);
  assert.equal(isActive('/review', '/tasks'), false);
  assert.equal(isActive('/', '/tasks'), false);
  assert.equal(isActive('/', '/'), true);
});

/* --------------------------------- T1-22 ---------------------------------- */

test('T1-22: the topbar search hint uses the platform label (Ctrl K / ⌘K), not a hardcoded ⌘K', () => {
  const f = code(SHELL);
  assert.doesNotMatch(f, />⌘K</);
  assert.match(SHELL, /import \{ shortcutLabel \} from '@\/lib\/palette-rank\.mjs';/);
  assert.match(SHELL, /shortcutLabel\(navigator\.userAgentData\?\.platform \|\| navigator\.platform \|\| navigator\.userAgent\)/);
});

test('T1-11: the palette ranks with the shared helper (no inline includes() filter)', () => {
  assert.match(PALETTE, /import \{ rankPaletteItems \} from '@\/lib\/palette-rank\.mjs';/);
  assert.match(PALETTE, /const items = rankPaletteItems\(\[/);
  assert.doesNotMatch(PALETTE, /\.join\(' '\)\.toLowerCase\(\)\.includes\(q\.toLowerCase\(\)\)/);
});

test('new pure helpers have no @/ imports', () => {
  for (const p of ['studio/lib/popover-place.mjs', 'studio/lib/nav-progress.mjs']) assert.doesNotMatch(read(p), /from '@\//, p);
});
