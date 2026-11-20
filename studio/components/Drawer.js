'use client';
// THE panel container for every "manage X" feature (schedule, templates,
// keys, routing, edit…). Replaces inline expansion inside cards: one feature
// at a time, full height, its own scroll, never pushes the page around.
//
// Accessibility: role=dialog + aria-modal, labelled by its title, Escape
// closes, focus moves in on open, Tab is trapped inside, focus returns to the
// element that opened it, body scroll is locked while open.
// Phones (<640px): full-width sheet; desktop: right-side panel.
//
// Feedback r1 (item E): rendered through a PORTAL on document.body. The page
// wrapper in AppShell animates with `fade-up` (fill-mode both → it keeps
// `transform: translateY(0)` forever), and any transform makes an ancestor
// the containing block for position:fixed — the drawer was sized to the
// whole PAGE, so its body never overflowed (no scroll) and the scroll lock
// hid everything below the fold. From body, no ancestor can do that again.
//
// Live fix wave B4 (T3-05 + T3-06):
//   dirty  optional. While true, every close (Escape, ✕, backdrop, browser
//          Back) asks "Discard your changes?" and closes only on Discard, and
//          leaving the site asks first (beforeunload).
//   Back   each open drawer owns one history entry, so the browser Back button
//          closes the drawer instead of leaving the page. The entry logic is
//          the pure state machine in lib/drawer-history.mjs; this file only
//          runs its effects. No URL is ever passed, so the Next router keeps
//          its own URL and state.
import { useCallback, useEffect, useId, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useConfirm } from '@/components/ConfirmDialog';
import { initialDrawerHistory, drawerHistoryStep, drawerIdOf, entryState, guardedClose } from '@/lib/drawer-history.mjs';

const WIDTHS = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' };
const noopSubscribe = () => () => {};

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// One history machine for the whole page (drawers can swap or nest).
let hist = initialDrawerHistory();
const closers = new Map(); // drawer id → close request from the Back button
let listening = false;

function runHistory(event) {
  const out = drawerHistoryStep(hist, event);
  hist = out.state;
  for (const fx of out.effects) {
    if (fx.type === 'push') window.history.pushState(entryState(window.history.state, fx.id), '');
    else if (fx.type === 'replace') window.history.replaceState(entryState(window.history.state, fx.id), '');
    else if (fx.type === 'flush-later') setTimeout(() => runHistory({ type: 'flush', top: drawerIdOf(window.history.state) }), 0);
    else if (fx.type === 'back') window.history.go(-fx.steps);
    else if (fx.type === 'close') closers.get(fx.id)?.();
  }
}

function listenForBack() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('popstate', (e) => runHistory({ type: 'pop', landed: drawerIdOf(e.state) }));
}

export default function Drawer({ open, onClose, title, description, icon: Icon, size = 'md', footer, dirty = false, children }) {
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  const dirtyRef = useRef(dirty);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  const confirm = useConfirm();
  const confirmRef = useRef(confirm);
  useEffect(() => { confirmRef.current = confirm; }, [confirm]);
  const asking = useRef(false); // one "Discard?" question at a time
  const titleId = useId();
  const descId = useId();
  const histId = useId();
  // client-only mount guard (server snapshot = false → no portal during SSR)
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);

  // Every close goes through here. Resolves to whether the drawer closed.
  const requestClose = useCallback(async () => {
    if (asking.current) return false;
    asking.current = true;
    try {
      return await guardedClose({ dirty: dirtyRef.current, ask: (q) => confirmRef.current(q), close: () => onCloseRef.current?.() });
    } finally {
      asking.current = false;
    }
  }, []);
  const requestCloseRef = useRef(requestClose);
  useEffect(() => { requestCloseRef.current = requestClose; }, [requestClose]);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement;
    const orig = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // move focus inside (first focusable, else the panel itself)
    const t = setTimeout(() => {
      const first = panelRef.current?.querySelector(FOCUSABLE);
      (first || panelRef.current)?.focus();
    }, 30);
    const onKey = (e) => {
      // A confirm dialog on top owns the keyboard — Escape must close IT,
      // not the drawer underneath.
      if (document.querySelector('[role="alertdialog"]')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        requestCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const els = [...panelRef.current.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = orig;
      if (opener && typeof opener.focus === 'function') opener.focus();
    };
  }, [open]);

  // T3-06: our own history entry while open. Back → (guarded) close; if the
  // owner keeps editing, the entry is pushed again.
  useEffect(() => {
    if (!open) return;
    listenForBack();
    closers.set(histId, () => {
      requestCloseRef.current().then((closed) => {
        if (!closed) runHistory({ type: 'keep', id: histId });
      });
    });
    runHistory({ type: 'open', id: histId });
    return () => {
      closers.delete(histId);
      runHistory({ type: 'closed', id: histId });
    };
  }, [open, histId]);

  // T3-05: leaving the site with unsaved edits asks first
  useEffect(() => {
    if (!open || !dirty) return;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [open, dirty]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60]" role="presentation">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px] fade-in" onClick={requestClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'absolute inset-y-0 right-0 w-full h-full max-h-[100dvh] flex flex-col bg-[var(--surface)] border-l border-[var(--line)] shadow-2xl outline-none drawer-in',
          WIDTHS[size] || WIDTHS.md
        )}
      >
        <header className="flex items-start gap-3 px-5 sm:px-6 py-4 border-b border-[var(--line)] shrink-0">
          {Icon ? (
            <span className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              <Icon size={17} />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-display t-16 font-bold text-ink tracking-tight truncate">{title}</h2>
            {description ? <p id={descId} className="t-12 text-faint mt-0.5">{description}</p> : null}
          </div>
          <button type="button" className="icon-btn shrink-0" onClick={requestClose} aria-label="Close panel">
            <X size={16} />
          </button>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-6 py-5">{children}</div>
        {footer ? (
          <footer className="shrink-0 px-5 sm:px-6 py-3.5 border-t border-[var(--line)] flex flex-wrap items-center justify-end gap-2 pb-[calc(0.875rem+env(safe-area-inset-bottom))]">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
