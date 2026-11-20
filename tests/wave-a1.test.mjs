// Live fix wave A1 (2026-11-20 live test report, research/live-e2e-test-2026-11-20.md):
//   T1-14  /login?error=<any text> rendered verbatim → only known codes, fixed copy
//   T1-02  bell false all-clear when /api/warnings fails
//   T1-10  revoked session cookie → broken app frame (client-side redirect)
//   T5-03  Sessions never marked "this device" (session_id vs id)
//   T3-11  Workspace-default AI routing saved instantly for ALL channels
//   T3-27  developer text in AI routing
// Pure logic is behaviour-tested; '@/' components are pinned by source scan
// (house pattern). T1-01 lives in tests/safe-next.test.mjs.
// QA: docs/qa/live-fix-wave-a1-qa.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loginErrorMessage, LOGIN_ERRORS } from '../studio/lib/login-errors.mjs';
import { chainIdsFor, moveInDraft, planChainSave, sameOrder } from '../studio/lib/route-draft.mjs';
import { sessionUserFromRow } from '../studio/lib/session-db.js';

const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const LOGIN = read('studio/app/login/page.js');
const CALLBACK = read('studio/app/api/auth/google/callback/route.js');
const SHELL = read('studio/components/shell/AppShell.js');
const SESSION_DB = read('studio/lib/session-db.js');
const ROUTE_AUTH = read('studio/lib/route-auth.js');
const SETTINGS = read('studio/app/settings/page.js');
const ROUTING = read('studio/components/ProviderRoutingPanel.js');

/* ------------------------------ T1-01 wiring ------------------------------ */

test('T1-01: the login page follows ?next= only through safeNextPath', () => {
  assert.match(LOGIN, /import \{ safeNextPath \} from '@\/lib\/safe-next\.mjs';/);
  assert.match(LOGIN, /setNext\(safeNextPath\(q\.get\('next'\)\)\)/);
  assert.match(LOGIN, /router\.replace\(safeNextPath\(next\)\)/, 'checked again at the moment of the redirect');
  assert.doesNotMatch(LOGIN, /startsWith\('\/'\)/, 'the old prefix-only check is gone');
});

test('T1-01: the Google callback lands on / (it carries no next) — nothing unsafe to follow', () => {
  assert.match(CALLBACK, /Response\.redirect\(`\$\{url\.origin\}\/`, 302\)/);
  assert.doesNotMatch(code(CALLBACK), /searchParams\.get\('next'\)/);
});

/* --------------------------------- T1-14 ---------------------------------- */

test('T1-14 EARS: WHEN ?error= holds a known code THEN a fixed message shows', () => {
  assert.equal(loginErrorMessage('signed_out'), 'You were signed out — please sign in again.');
  for (const c of Object.keys(LOGIN_ERRORS)) {
    assert.equal(typeof loginErrorMessage(c), 'string');
    assert.ok(loginErrorMessage(c).length > 0, c);
  }
});

test('T1-14 EARS: WHEN ?error= holds anything else THEN nothing shows (no injected text)', () => {
  for (const v of ['Your account is locked, call +1 555 0100', '<b>x</b>', '', null, undefined, '__proto__', 'constructor', 'toString', 'hasOwnProperty', 'SIGNED_OUT', ' signed_out']) {
    assert.equal(loginErrorMessage(v), '', JSON.stringify(v));
  }
});

test('T1-14: the login page renders only mapped messages; the callback only sends known codes', () => {
  assert.match(LOGIN, /import \{ loginErrorMessage \} from '@\/lib\/login-errors\.mjs';/);
  assert.match(LOGIN, /setError\(loginErrorMessage\(q\.get\('error'\)\)\)/);
  assert.doesNotMatch(LOGIN, /setError\(err\)/);
  const sent = [...code(CALLBACK).matchAll(/back\('([^']*)'\)/g)].map((m) => m[1]);
  assert.ok(sent.length >= 3, 'every failure path sends a code');
  for (const c of sent) assert.ok(Object.hasOwn(LOGIN_ERRORS, c), `callback code "${c}" must be a known login error`);
  assert.doesNotMatch(code(CALLBACK), /back\(`/, 'no free-text (template) error messages');
});

/* --------------------------------- T1-02 ---------------------------------- */

test('T1-02: the bell popover gets status + retry from useOpenWarnings', () => {
  // + awaiting (wave A4 integration: the bell uses THE one count)
  assert.match(SHELL, /warnings=\{\{ rows: openWarningRows, canSee: warningsCanSee, status: warnStatus, retry: warnRetry(, awaiting)? \}\}/);
});

test('T1-02 EARS: WHEN the alerts check failed THEN the list says status unknown with Retry, never the all-clear', () => {
  const notif = SHELL.slice(SHELL.indexOf('function Notifications'), SHELL.indexOf('function NavGroups'));
  const errAt = notif.indexOf("warnings.status === 'error'");
  const clearAt = notif.indexOf('Nothing needs attention');
  assert.ok(errAt > 0 && clearAt > errAt, 'the error branch is checked before the all-clear');
  assert.match(notif, /Can&apos;t check alerts right now — status unknown/);
  assert.match(notif, /onClick=\{\(\) => warnings\.retry\?\.\(\)\}/);
  assert.match(notif, />\s*Retry\s*</);
});

test('T1-02 EARS: the owner/staff note shows only when the role cannot see alerts (forbidden)', () => {
  const notif = SHELL.slice(SHELL.indexOf('function Notifications'), SHELL.indexOf('function NavGroups'));
  assert.match(notif, /warnings\.status === 'forbidden' \?/);
  const at = notif.indexOf('owner/staff');
  const forb = notif.indexOf("warnings.status === 'forbidden'");
  assert.ok(forb > 0 && at > forb, 'the owner/staff note sits inside the forbidden branch');
  assert.equal((notif.match(/owner\/staff/g) || []).length, 1, 'only one owner/staff note');
  assert.match(notif, /warnings\.status === 'loading'/, 'loading is not an all-clear either');
});

/* --------------------------------- T1-10 ---------------------------------- */

test('T1-10 EARS: WHEN /api/me answers 401 inside the frame THEN the device goes to /login?next=…&error=signed_out', () => {
  assert.match(SHELL, /import \{ isBarePath, signedOutLoginUrl \} from '@\/lib\/safe-next\.mjs';/);
  const frame = SHELL.slice(SHELL.indexOf('function ShellFrame'));
  assert.match(frame, /fetch\('\/api\/me'\)/);
  assert.match(frame, /r\.status !== 401/);
  assert.match(frame, /window\.location\.replace\(signedOutLoginUrl\(window\.location\.pathname \+ window\.location\.search\)\)/);
  assert.match(frame, /isBarePath\(window\.location\.pathname\)/, 'loop guard');
});

test('T1-10: bare pages (/login, /proof, /client) never mount the frame — the one shared list', () => {
  const def = SHELL.slice(SHELL.indexOf('export default function AppShell'), SHELL.indexOf('function ShellFrame'));
  assert.match(def, /if \(isBarePath\(pathname\)\) return <ConfirmProvider>\{children\}<\/ConfirmProvider>;/);
});

/* --------------------------------- T5-03 ---------------------------------- */

test('T5-03 EARS: a session row maps to BOTH id (route-auth reads it) and session_id', () => {
  const u = sessionUserFromRow({ id: 42, email: 'a@x.test', role: 'owner', name: '' });
  assert.deepEqual(u, { email: 'a@x.test', role: 'owner', name: 'a@x.test', id: 42, session_id: 42 });
  assert.equal(sessionUserFromRow({ id: 7, email: 'b@x.test', role: 'staff', name: 'Bee' }).name, 'Bee');
});

test('T5-03: userByToken returns the mapper; route-auth still reads s.id (contract both sides)', () => {
  const fn = SESSION_DB.slice(SESSION_DB.indexOf('export async function userByToken'), SESSION_DB.indexOf('export async function revokeToken'));
  assert.match(fn, /return sessionUserFromRow\(s\);/);
  assert.match(ROUTE_AUTH, /session_id: s\.id/);
});

test('T5-03: the Settings sign-ins list marks this device from the API "current"', () => {
  assert.match(SETTINGS, /setCurrentSession\(d\.current \|\| 0\)/);
  assert.match(SETTINGS, /s\.id === currentSession \? <Chip tone="accent" dot>this device<\/Chip> : null/);
});

/* ------------------------------ T3-11 (pure) ------------------------------ */

const ROUTES = [
  { id: 1, capability: 'tts', provider_id: 'b', priority: 200, channel_id: null },
  { id: 2, capability: 'tts', provider_id: 'a', priority: 100, channel_id: null },
  { id: 3, capability: 'tts', provider_id: 'c', priority: 100, channel_id: 'mr' },
  { id: 4, capability: 'script-gen', provider_id: 'g', priority: 100, channel_id: null },
];

test('route-draft: chainIdsFor picks one layer + capability, ordered by priority', () => {
  assert.deepEqual(chainIdsFor(ROUTES, 'tts', null), ['a', 'b']);
  assert.deepEqual(chainIdsFor(ROUTES, 'tts', 'mr'), ['c']);
  assert.deepEqual(chainIdsFor(ROUTES, 'captions', null), []);
  assert.deepEqual(chainIdsFor(null, 'tts', null), []);
});

test('route-draft: moveInDraft swaps neighbours and never mutates; out of range = same order', () => {
  const ids = ['a', 'b', 'c'];
  assert.deepEqual(moveInDraft(ids, 0, 1), ['b', 'a', 'c']);
  assert.deepEqual(moveInDraft(ids, 2, -1), ['a', 'c', 'b']);
  assert.deepEqual(moveInDraft(ids, 0, -1), ['a', 'b', 'c']);
  assert.deepEqual(moveInDraft(ids, 2, 1), ['a', 'b', 'c']);
  assert.deepEqual(ids, ['a', 'b', 'c'], 'input untouched');
  assert.equal(sameOrder(['a', 'b'], ['a', 'b']), true);
  assert.equal(sameOrder(['a', 'b'], ['b', 'a']), false);
  assert.equal(sameOrder(['a'], ['a', 'b']), false);
});

test('route-draft: planChainSave writes only what changed — spaced priorities, removals deactivated', () => {
  const saved = [{ provider_id: 'a', priority: 100 }, { provider_id: 'b', priority: 200 }, { provider_id: 'c', priority: 300 }];
  // swap a/b, drop c, add d
  assert.deepEqual(planChainSave(saved, ['b', 'a', 'd']), [
    { action: 'set-route', providerId: 'b', priority: 100 },
    { action: 'set-route', providerId: 'a', priority: 200 },
    { action: 'set-route', providerId: 'd', priority: 300 },
    { action: 'deactivate-route', providerId: 'c' },
  ]);
  assert.deepEqual(planChainSave(saved, ['a', 'b', 'c']), [], 'no change = no writes');
  assert.deepEqual(planChainSave([], ['x']), [{ action: 'set-route', providerId: 'x', priority: 100 }]);
  assert.deepEqual(planChainSave(saved, []), ['a', 'b', 'c'].map((p) => ({ action: 'deactivate-route', providerId: p })));
});

test('route-draft.mjs is pure: no @/ imports', () => {
  assert.doesNotMatch(read('studio/lib/route-draft.mjs'), /from '@\//);
});

/* --------------------------- T3-11 (component) ---------------------------- */

test('T3-11 EARS: reorder / add / remove only change the local draft — no POST until Save', () => {
  for (const fn of ['const reorder =', 'const addProvider =', 'const removeProvider =']) {
    const at = ROUTING.indexOf(fn);
    assert.ok(at > 0, fn);
    const body = ROUTING.slice(at, ROUTING.indexOf('\n  };\n', at));
    assert.doesNotMatch(body, /post\(|fetch\(/, `${fn} must not write to the server`);
    assert.match(body, /setEdits\(/, `${fn} edits the draft`);
  }
});

test('T3-11 EARS: WHEN the owner presses Save THEN a confirm runs first; the workspace button says "Save for all channels"', () => {
  const at = ROUTING.indexOf('const saveChanges = async');
  assert.ok(at > 0);
  const body = ROUTING.slice(at, ROUTING.indexOf('\n  };\n', at));
  const confirmAt = body.indexOf('await confirm({');
  const postAt = body.indexOf('post(');
  assert.ok(confirmAt > 0 && postAt > confirmAt, 'confirm before any write');
  assert.match(body, /planChainSave\(/);
  assert.match(ROUTING, /'Save for all channels'/);
  assert.match(ROUTING, /onClick=\{saveChanges\}/);
  assert.match(ROUTING, /import \{ chainIdsFor, moveInDraft, planChainSave, sameOrder \} from '@\/lib\/route-draft\.mjs';/);
});

test('T3-11: switching layer with unsaved changes asks before discarding them', () => {
  assert.match(ROUTING, /const switchLayer = async/);
  const at = ROUTING.indexOf('const switchLayer = async');
  assert.match(ROUTING.slice(at, at + 500), /await confirm\(\{/);
});

test('T3-27: no developer text in AI routing (prio N, effective:, env var names, catalog baseline)', () => {
  const src = code(ROUTING);
  assert.doesNotMatch(src, /prio \{/);
  assert.doesNotMatch(src, /effective:/);
  assert.doesNotMatch(src, /catalog baseline/);
  assert.doesNotMatch(src, /\{p\.envVar\}/);
  assert.doesNotMatch(src, /\(priority \$\{priority\}\)/);
});
