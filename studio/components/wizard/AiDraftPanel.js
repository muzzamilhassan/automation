'use client';
// #113 — the brand-kit draft as a reviewable suggestion.
// live fix wave B2 (T4-06): empty fields were already filled (marked
// "Filled"); fields the owner wrote keep their text and show the draft with
// a per-field "Use this". "Apply all" uses every remaining suggestion.
import { Sparkles, Check } from 'lucide-react';
import { draftValue } from '@/lib/kit-draft-merge.mjs';

const ROWS = [
  ['subNiches', 'Content pillars', 'this step · adds to yours'],
  ['description', 'Description', 'this step'],
  ['tags', 'SEO tags', 'this step'],
  ['style', 'Video style', 'Look & sound'],
  ['voice', 'Voice', 'Look & sound'],
  ['eyebrow', 'Eyebrow label', 'Thumbnails'],
  ['tagline', 'Tagline', 'Thumbnails'],
];

const DONE = { filled: 'Filled', applied: 'Used', same: 'Already set' };

export default function AiDraftPanel({ draft, names, onApply, onApplyAll, onDiscard }) {
  if (!draft) return null;
  const status = draft.status || {};
  const shown = (key, value) => (key === 'style' ? names.style(value) || value : key === 'voice' ? names.voice(value) || value : value);
  const rows = ROWS.filter(([key]) => status[key]);
  const pendingCount = rows.filter(([key]) => status[key] === 'pending').length;
  const ai = draft.source === 'llm';
  return (
    <section className="rounded-xl border p-4" style={{ borderColor: 'var(--accent)', background: 'var(--accent-soft)' }} aria-label="Brand kit draft">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="t-13 font-semibold text-ink flex items-center gap-1.5"><Sparkles size={14} style={{ color: 'var(--accent)' }} /> {ai ? 'AI draft' : 'Template draft'}</p>
          <p className="t-11 text-muted mt-0.5">
            {pendingCount
              ? 'Empty fields were filled. Your own text was kept. Press Use this to swap in a suggestion.'
              : 'Empty fields were filled. Nothing left to review.'}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button type="button" className="btn btn-sm btn-primary" onClick={onApplyAll} disabled={!pendingCount}>Apply all</button>
          <button type="button" className="btn btn-sm btn-outline" onClick={onDiscard}>Close</button>
        </div>
      </div>
      <ul className="grid gap-1.5">
        {rows.map(([key, label, where]) => {
          const value = shown(key, draftValue(key, draft));
          return (
            <li key={key} className="flex items-start gap-3 rounded-lg border border-line px-3 py-2" style={{ background: 'var(--surface)' }}>
              <div className="min-w-0 flex-1">
                <p className="t-11 text-faint">
                  {label} <span className="text-faint">· {where}</span>
                </p>
                <p className="t-12 text-ink line-clamp-2 break-words">{value || '—'}</p>
              </div>
              {status[key] === 'pending' ? (
                <button type="button" className="btn btn-sm btn-outline shrink-0" onClick={() => onApply(key)}>
                  Use this
                </button>
              ) : (
                <span className="shrink-0 t-11 font-semibold inline-flex items-center gap-1 pt-1" style={{ color: status[key] === 'same' ? 'var(--faint)' : 'var(--ok-ink)' }}>
                  <Check size={12} /> {DONE[status[key]] || ''}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
