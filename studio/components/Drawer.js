'use client';
// THE panel container for every "manage X" feature (schedule, templates,
// keys, routing, edit…). Replaces inline expansion inside cards: one feature
// at a time, full height, its own scroll, never pushes the page around.
//
// Accessibility: role=dialog + aria-modal, labelled by its title, Escape
// closes, focus moves in on open, Tab is trapped inside, focus returns to the
// element that opened it, body scroll is locked while open.
// Phones (<640px): full-width sheet; desktop: right-side panel.
import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const WIDTHS = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' };
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Drawer({ open, onClose, title, description, icon: Icon, size = 'md', footer, children }) {
  const panelRef = useRef(null);
  const titleId = useId();
  const descId = useId();

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
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
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
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]" role="presentation">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px] fade-in" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'absolute inset-y-0 right-0 w-full flex flex-col bg-[var(--surface)] border-l border-[var(--line)] shadow-2xl outline-none drawer-in',
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
          <button type="button" className="icon-btn shrink-0" onClick={onClose} aria-label="Close panel">
            <X size={16} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 min-h-0">{children}</div>
        {footer ? (
          <footer className="shrink-0 px-5 sm:px-6 py-3.5 border-t border-[var(--line)] flex flex-wrap items-center justify-end gap-2 pb-[calc(0.875rem+env(safe-area-inset-bottom))]">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
