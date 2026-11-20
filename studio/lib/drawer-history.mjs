// Live fix wave B4 (2026-11-20, T3-05 + T3-06) — the pure brain behind the
// Drawer's browser-history entry and its unsaved-changes guard. No React, no
// DOM, no '@/' imports, so node --test pins it (tests/drawer-history.test.mjs;
// spec docs/qa/live-fix-wave-b4-qa.md).
//
// Each open drawer owns ONE history entry, so the browser Back button closes
// the drawer instead of leaving the page. Drawer.js feeds events in and runs
// the effects that come out:
//
//   events   open {id} · closed {id} (closed by the UI / unmounted)
//            flush {top} (top = drawer id in history.state right now)
//            pop {landed} (popstate; landed = drawer id of the entry we are on)
//            keep {id} (the owner cancelled "Discard?" after Back)
//   effects  push {id} · replace {id} · flush-later · back {steps} · close {id}
//
// A close by the UI never goes back at once: it waits one tick (flush-later).
// If another drawer opens in that window (a SWAP: overview → Manage), it
// takes over the same entry (replace) and nothing is popped — no extra
// entries, and the new drawer is not closed by a stray popstate.

export const DRAWER_KEY = 'qsDrawer';

export const DISCARD_ASK = Object.freeze({
  title: 'Discard your changes?',
  body: 'Your changes are not saved yet.',
  confirmLabel: 'Discard',
  cancelLabel: 'Keep editing',
  tone: 'danger',
});

export function initialDrawerHistory() {
  return { stack: [], pending: [] };
}

// The drawer id stored in a history entry's state, else null.
export function drawerIdOf(state) {
  const v = state && typeof state === 'object' ? state[DRAWER_KEY] : null;
  return typeof v === 'string' && v ? v : null;
}

// The state for our entry: the current entry's state (the Next router keeps
// __NA + its tree there — without them a popstate onto our entry reloads the
// page) plus our drawer id.
export function entryState(current, id) {
  return { ...(current && typeof current === 'object' ? current : {}), [DRAWER_KEY]: id };
}

const none = (state) => ({ state, effects: [] });

export function drawerHistoryStep(state, event) {
  const s = { stack: [...(state?.stack || [])], pending: [...(state?.pending || [])] };
  const id = event?.id;
  switch (event?.type) {
    case 'open': {
      if (!id || s.stack.includes(id)) return none(state);
      s.stack.push(id);
      if (s.pending.length) {
        // swap: reuse the entry a drawer just left instead of popping it
        s.pending = [];
        return { state: s, effects: [{ type: 'replace', id }] };
      }
      return { state: s, effects: [{ type: 'push', id }] };
    }
    case 'closed': {
      const at = s.stack.indexOf(id);
      if (at < 0) return none(state); // already popped by Back
      s.stack.splice(at, 1);
      if (at !== s.stack.length) return { state: s, effects: [] }; // not on top: its entry stays (harmless)
      s.pending.push(id);
      return { state: s, effects: s.pending.length === 1 ? [{ type: 'flush-later' }] : [] };
    }
    case 'flush': {
      if (!s.pending.length) return none(state);
      const topPending = s.pending[0];
      const steps = s.pending.length;
      s.pending = [];
      // only pop when our entry is still on top (a page navigation may have
      // pushed or replaced it — then going back would leave the new page)
      return { state: s, effects: event.top === topPending ? [{ type: 'back', steps }] : [] };
    }
    case 'pop': {
      s.pending = [];
      const at = event.landed ? s.stack.indexOf(event.landed) : -1;
      const closing = s.stack.slice(at + 1).reverse();
      s.stack = s.stack.slice(0, at + 1);
      return { state: s, effects: closing.map((c) => ({ type: 'close', id: c })) };
    }
    case 'keep': {
      if (!id || s.stack.includes(id)) return none(state);
      s.stack.push(id);
      return { state: s, effects: [{ type: 'push', id }] };
    }
    default:
      return none(state);
  }
}

// The unsaved-changes guard: a clean drawer closes at once; a dirty one asks
// (DISCARD_ASK) and closes only on Discard. Returns whether it closed.
export async function guardedClose({ dirty, ask, close }) {
  if (dirty && !(await ask(DISCARD_ASK))) return false;
  close();
  return true;
}
