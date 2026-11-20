// Live fix wave B4 (2026-11-20 live test) — T3-05 + T3-06.
//   T3-05: a drawer with unsaved edits asks "Discard your changes?" before it
//          closes (Escape, ✕, backdrop, browser Back).
//   T3-06: the browser Back button closes the open drawer instead of leaving
//          the page. Each open drawer owns one history entry; a swap
//          (overview → Manage drawer) reuses it, so no extra entries pile up.
// The history logic is a pure state machine (studio/lib/drawer-history.mjs);
// Drawer.js only runs its effects. Spec + QA: docs/qa/live-fix-wave-b4-qa.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DRAWER_KEY, DISCARD_ASK, initialDrawerHistory, drawerHistoryStep, drawerIdOf, entryState, guardedClose,
} from '../studio/lib/drawer-history.mjs';

const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// run a list of events; return the final state and every effect in order
function run(events, start = initialDrawerHistory()) {
  let state = start;
  const effects = [];
  for (const e of events) {
    const out = drawerHistoryStep(state, e);
    state = out.state;
    effects.push(...out.effects);
  }
  return { state, effects };
}

/* ------------------------------ state machine ----------------------------- */

test('H1 opening a drawer pushes one history entry for it', () => {
  const { state, effects } = run([{ type: 'open', id: 'a' }]);
  assert.deepEqual(effects, [{ type: 'push', id: 'a' }]);
  assert.deepEqual(state.stack, ['a']);
});

test('H2 closing by the UI pops our entry, but only after the swap window and only if it is still on top', () => {
  const closed = run([{ type: 'open', id: 'a' }, { type: 'closed', id: 'a' }]);
  assert.deepEqual(closed.effects.slice(1), [{ type: 'flush-later' }], 'never history.back() synchronously');
  const flushed = run([{ type: 'flush', top: 'a' }], closed.state);
  assert.deepEqual(flushed.effects, [{ type: 'back', steps: 1 }]);
  // our own back lands on the page entry: nothing left to close
  const landed = run([{ type: 'pop', landed: null }], flushed.state);
  assert.deepEqual(landed.effects, []);
});

test('H3 the browser Back button closes the top drawer; its unmount then does NOT go back again', () => {
  const { state, effects } = run([{ type: 'open', id: 'a' }, { type: 'pop', landed: null }, { type: 'closed', id: 'a' }]);
  assert.deepEqual(effects, [{ type: 'push', id: 'a' }, { type: 'close', id: 'a' }]);
  assert.deepEqual(state.stack, []);
  assert.deepEqual(state.pending, []);
});

test('H4 cancelling the discard question after Back re-pushes the entry and keeps the drawer', () => {
  const { state, effects } = run([{ type: 'open', id: 'a' }, { type: 'pop', landed: null }, { type: 'keep', id: 'a' }]);
  assert.deepEqual(effects.at(-1), { type: 'push', id: 'a' });
  assert.deepEqual(state.stack, ['a']);
  // keep is idempotent
  assert.deepEqual(run([{ type: 'keep', id: 'a' }], state).effects, []);
});

test('H5 a drawer SWAP (overview → Manage) reuses the entry: replace, no back, one entry total', () => {
  const { state, effects } = run([
    { type: 'open', id: 'overview' },
    { type: 'closed', id: 'overview' },   // same React commit:
    { type: 'open', id: 'schedule' },     // cleanup first, then the new effect
    { type: 'flush', top: 'schedule' },
  ]);
  assert.deepEqual(effects, [
    { type: 'push', id: 'overview' },
    { type: 'flush-later' },
    { type: 'replace', id: 'schedule' },
  ]);
  assert.deepEqual(state.stack, ['schedule']);
  // Back now closes the Manage drawer only
  assert.deepEqual(run([{ type: 'pop', landed: null }], state).effects, [{ type: 'close', id: 'schedule' }]);
});

test('H6 React StrictMode remount (open → cleanup → open) leaves exactly one entry', () => {
  const { state, effects } = run([{ type: 'open', id: 'a' }, { type: 'closed', id: 'a' }, { type: 'open', id: 'a' }, { type: 'flush', top: 'a' }]);
  assert.equal(effects.filter((e) => e.type === 'push').length, 1);
  assert.equal(effects.filter((e) => e.type === 'back').length, 0);
  assert.deepEqual(state.stack, ['a']);
});

test('H7 if a page navigation replaced our entry (link inside the drawer), closing never goes back', () => {
  const { effects } = run([{ type: 'open', id: 'a' }, { type: 'closed', id: 'a' }, { type: 'flush', top: null }]);
  assert.equal(effects.filter((e) => e.type === 'back').length, 0);
});

test('H8 nested drawers: Back closes only the drawers above the entry we landed on', () => {
  const { state, effects } = run([{ type: 'open', id: 'a' }, { type: 'open', id: 'b' }, { type: 'pop', landed: 'a' }]);
  assert.deepEqual(effects.at(-1), { type: 'close', id: 'b' });
  assert.deepEqual(state.stack, ['a']);
  // landing on a page (or a dead entry) closes everything still open, top first
  const all = run([{ type: 'open', id: 'b' }, { type: 'pop', landed: 'gone' }], state);
  assert.deepEqual(all.effects.slice(1), [{ type: 'close', id: 'b' }, { type: 'close', id: 'a' }]);
});

test('H9 a second open of the same id and a close of an unknown id are no-ops', () => {
  const s = run([{ type: 'open', id: 'a' }]).state;
  assert.deepEqual(drawerHistoryStep(s, { type: 'open', id: 'a' }).effects, []);
  assert.deepEqual(drawerHistoryStep(s, { type: 'closed', id: 'zzz' }).effects, []);
  assert.deepEqual(drawerHistoryStep(initialDrawerHistory(), { type: 'flush', top: null }).effects, []);
  assert.deepEqual(drawerHistoryStep(s, { type: 'nonsense' }).effects, []);
});

test('H10 the machine never mutates the state it was given', () => {
  const s = run([{ type: 'open', id: 'a' }]).state;
  const snap = JSON.stringify(s);
  drawerHistoryStep(s, { type: 'open', id: 'b' });
  drawerHistoryStep(s, { type: 'pop', landed: null });
  drawerHistoryStep(s, { type: 'closed', id: 'a' });
  assert.equal(JSON.stringify(s), snap);
});

test('H11 entry state keeps the Next router keys and adds ours; drawerIdOf reads it back', () => {
  const next = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: 1 } };
  const e = entryState(next, 'x');
  assert.equal(e.__NA, true, 'Next must still own the entry (else popstate reloads the page)');
  assert.deepEqual(e.__PRIVATE_NEXTJS_INTERNALS_TREE, { tree: 1 });
  assert.equal(e[DRAWER_KEY], 'x');
  assert.equal(drawerIdOf(e), 'x');
  assert.equal(drawerIdOf(next), null);
  assert.equal(drawerIdOf(null), null);
  assert.deepEqual(entryState(null, 'y'), { [DRAWER_KEY]: 'y' });
});

/* ------------------------------- dirty guard ------------------------------ */

test('G1 clean drawer closes straight away, no question', async () => {
  let asked = 0;
  let closed = 0;
  const ok = await guardedClose({ dirty: false, ask: async () => { asked++; return true; }, close: () => { closed++; } });
  assert.equal(ok, true);
  assert.equal(asked, 0);
  assert.equal(closed, 1);
});

test('G2 dirty drawer asks "Discard your changes?" and closes only on Discard', async () => {
  let seen = null;
  let closed = 0;
  const keep = await guardedClose({ dirty: true, ask: async (q) => { seen = q; return false; }, close: () => { closed++; } });
  assert.equal(keep, false);
  assert.equal(closed, 0, 'Keep editing → stays open');
  assert.equal(seen.title, 'Discard your changes?');
  assert.deepEqual(seen, DISCARD_ASK);
  const gone = await guardedClose({ dirty: true, ask: async () => true, close: () => { closed++; } });
  assert.equal(gone, true);
  assert.equal(closed, 1);
});

/* ------------------------------ source pins ------------------------------- */

const DRAWER = read('studio/components/Drawer.js');

test('S1 Drawer takes an optional dirty prop and guards every close path through useConfirm', () => {
  assert.match(DRAWER, /export default function Drawer\(\{[^}]*\bdirty = false\b[^}]*\}\)/);
  assert.match(DRAWER, /import \{ useConfirm \} from '@\/components\/ConfirmDialog';/);
  assert.match(DRAWER, /import \{[^}]*guardedClose[^}]*\} from '@\/lib\/drawer-history\.mjs';/);
  // Escape, ✕ and the backdrop all go through requestClose (never onClose directly)
  assert.match(DRAWER, /if \(e\.key === 'Escape'\) \{\s*e\.preventDefault\(\);\s*requestCloseRef\.current\(\);/);
  assert.match(DRAWER, /<div className="absolute inset-0 bg-black\/55[^"]*" onClick=\{requestClose\}/);
  assert.match(DRAWER, /onClick=\{requestClose\} aria-label="Close panel"/);
  assert.doesNotMatch(DRAWER, /onClick=\{onClose\}/);
});

test('S2 Drawer warns before leaving the site while dirty (beforeunload)', () => {
  assert.match(DRAWER, /if \(!open \|\| !dirty\) return;/);
  assert.match(DRAWER, /window\.addEventListener\('beforeunload', /);
  assert.match(DRAWER, /window\.removeEventListener\('beforeunload', /);
});

test('S3 Drawer drives browser history through the pure machine (push on open, popstate closes)', () => {
  assert.match(DRAWER, /drawerHistoryStep\(/);
  assert.match(DRAWER, /window\.history\.pushState\(entryState\(window\.history\.state, fx\.id\), ''\)/);
  assert.match(DRAWER, /window\.history\.replaceState\(entryState\(window\.history\.state, fx\.id\), ''\)/);
  assert.match(DRAWER, /window\.history\.go\(-fx\.steps\)/);
  assert.match(DRAWER, /addEventListener\('popstate', /);
  assert.match(DRAWER, /type: 'pop', landed: drawerIdOf\(e\.state\)/);
  assert.match(DRAWER, /type: 'keep', id: histId/, 'cancel after Back re-pushes the entry');
  // no URL is passed: the Next router keeps its own URL and state
  assert.doesNotMatch(DRAWER, /pushState\([^)]*,\s*'',\s*[^)]/);
});

test('S4 hooks and refs are declared before any effect reads them (build safety)', () => {
  const order = ['const onCloseRef = useRef(onClose);', 'const dirtyRef = useRef(dirty);', 'const confirmRef = useRef(confirm);', 'const requestClose = useCallback(', 'const requestCloseRef = useRef(requestClose);'];
  let last = -1;
  for (const s of order) {
    const at = DRAWER.indexOf(s);
    assert.ok(at > last, `${s} declared in order`);
    last = at;
  }
  const firstEffect = DRAWER.indexOf('useEffect(() => {\n    if (!open) return;');
  assert.ok(firstEffect > last, 'the open effect comes after every ref it reads');
});

const DRAWERS = read('studio/components/ChannelDrawers.js');

test('S5 ChannelDrawers passes frame(body, footer, opts) → <Drawer dirty>', () => {
  assert.match(DRAWERS, /const frame = \(body, footer, opts\) => \(\s*<Drawer\b[\s\S]*?dirty=\{Boolean\(opts\?\.dirty\)\}[\s\S]*?<\/Drawer>/);
});

test('S6 schedule, keys and routing panels report dirty to their drawer', () => {
  const SCHED = read('studio/components/SchedulePanel.js');
  const KEYS = read('studio/components/ChannelKeysPanel.js');
  const ROUTING = read('studio/components/ProviderRoutingPanel.js');
  assert.match(SCHED, /if \(frame\) return frame\(body, footer, \{ dirty \}\);/);
  assert.match(KEYS, /if \(frame\) return frame\(body, null, \{ dirty \}\);/);
  assert.match(KEYS, /const dirty = Object\.values\(inputs\)\.some\(\(v\) => String\(v \|\| ''\)\.trim\(\)\);/);
  assert.match(ROUTING, /if \(frame\) return frame\(body, null, \{ dirty \}\);/);
  // routing reuses Wave A's own draft flag (no second notion of "changed")
  assert.match(ROUTING, /const dirty = changedCaps\.length > 0;/);
});
