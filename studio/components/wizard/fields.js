'use client';
// Small shared pieces for the wizard steps: labelled field, inline notices,
// and the one-time connect-link box (used by Connect AND the channel drawer).
import { useId } from 'react';
import { AlertTriangle, Info, X, Copy, Check } from 'lucide-react';

// Label above, optional hint under, error replaces the hint. `children` is a
// render function receiving the input id so the label is wired for screen readers.
export function Field({ label, hint, error, optional, className = '', children }) {
  const id = useId();
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="t-12 font-semibold text-ink">{label}</span>
        {optional ? <span className="t-11 text-faint">Optional</span> : null}
      </label>
      {children(id)}
      {error ? (
        <p className="t-11 mt-1.5" style={{ color: 'var(--bad-ink)' }} role="alert">{error}</p>
      ) : hint ? (
        <p className="t-11 text-faint mt-1.5 leading-relaxed">{hint}</p>
      ) : null}
    </div>
  );
}

export function Notice({ tone = 'info', title, children, action }) {
  const ink = { info: 'var(--info-ink)', warn: 'var(--warn-ink)', bad: 'var(--bad-ink)', ok: 'var(--ok-ink)' }[tone];
  const line = { info: 'var(--info)', warn: 'var(--warn)', bad: 'var(--bad)', ok: 'var(--ok)' }[tone];
  const Icon = tone === 'info' || tone === 'ok' ? Info : AlertTriangle;
  return (
    <div className="rounded-xl border p-3 flex items-start gap-2.5" style={{ borderColor: line, background: 'var(--surface-2)' }} role={tone === 'bad' ? 'alert' : undefined}>
      <Icon size={15} className="shrink-0 mt-0.5" style={{ color: ink }} />
      <div className="min-w-0 flex-1">
        {title ? <p className="t-13 font-semibold" style={{ color: ink }}>{title}</p> : null}
        {children ? <div className={`t-12 text-muted break-words ${title ? 'mt-0.5' : ''}`}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

// The copyable one-time Google connect link. Works once, 15 minutes.
export function ConnectLinkBox({ url, copied, onCopy, onClear, note }) {
  if (!url) return null;
  return (
    <div className="space-y-2">
      <div className="flex gap-2 min-w-0">
        <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="One-time connect link" className="input flex-1 min-w-0 font-mono t-11" />
        <button type="button" className="btn btn-primary shrink-0" onClick={onCopy}>
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" className="icon-btn shrink-0" onClick={onClear} aria-label="Discard this link">
          <X size={14} />
        </button>
      </div>
      <p className="t-11 text-faint leading-relaxed">{note}</p>
    </div>
  );
}
