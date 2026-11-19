'use client';
// Replaces window.confirm(): a real, styled, keyboard-safe confirmation for
// actions with consequences (live YouTube changes, billable runs, deletes).
//
//   const confirm = useConfirm();
//   if (!(await confirm({ title, body, confirmLabel, tone: 'danger' }))) return;
//
// Mount <ConfirmHost /> once (AppShell does). Escape / backdrop = cancel;
// focus starts on CANCEL so Enter never fires a destructive action by accident.
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

const Ctx = createContext(null);

export function ConfirmProvider({ children }) {
  const [req, setReq] = useState(null); // { title, body, confirmLabel, cancelLabel, tone, resolve }
  const confirm = useCallback(
    (opts) => new Promise((resolve) => setReq({ cancelLabel: 'Cancel', confirmLabel: 'Confirm', tone: 'primary', ...opts, resolve })),
    []
  );
  const close = (v) => {
    req?.resolve(v);
    setReq(null);
  };
  return (
    <Ctx.Provider value={confirm}>
      {children}
      {req ? <Dialog req={req} onClose={close} /> : null}
    </Ctx.Provider>
  );
}

// Falls back to window.confirm if no provider is mounted (never breaks a page).
export function useConfirm() {
  const ctx = useContext(Ctx);
  return ctx || (async ({ title, body }) => window.confirm([title, body].filter(Boolean).join('\n\n')));
}

function Dialog({ req, onClose }) {
  const cancelRef = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const opener = document.activeElement;
    cancelRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener && typeof opener.focus === 'function') opener.focus();
    };
  }, [onClose]);
  const danger = req.tone === 'danger';
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4" role="presentation">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px] fade-in" onClick={() => onClose(false)} aria-hidden="true" />
      <div role="alertdialog" aria-modal="true" aria-labelledby={titleId} className="relative w-full sm:max-w-md card p-5 pop-in rounded-b-none sm:rounded-b-[var(--radius,14px)] pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5">
        <div className="flex items-start gap-3">
          <span className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0" style={{ background: danger ? 'color-mix(in srgb, var(--bad) 14%, transparent)' : 'var(--accent-soft)', color: danger ? 'var(--bad-ink)' : 'var(--accent)' }}>
            <AlertTriangle size={17} />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="t-16 font-bold text-ink">{req.title}</h2>
            {req.body ? <div className="t-13 text-muted mt-1.5 leading-relaxed">{req.body}</div> : null}
          </div>
        </div>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-5">
          <button ref={cancelRef} type="button" className="btn btn-outline min-h-[44px] sm:min-h-0" onClick={() => onClose(false)}>{req.cancelLabel}</button>
          <button type="button" className={(danger ? 'btn btn-danger' : 'btn btn-primary') + ' min-h-[44px] sm:min-h-0'} onClick={() => onClose(true)}>{req.confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
