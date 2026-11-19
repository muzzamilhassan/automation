'use client';
// #113 — the AI brand-kit draft as an explicit, reviewable suggestion: each
// field has its own Apply; nothing touches the form until the owner clicks.
import { Sparkles, Check } from 'lucide-react';

export default function AiDraftPanel({ draft, names, onApply, onApplyAll, onDiscard }) {
  if (!draft) return null;
  const { kit, suggestion, applied } = draft;
  const rows = [
    ['subNiches', 'Content pillars', (kit.niches || []).join(', '), 'this step'],
    ['description', 'Description', kit.description, 'this step'],
    ['tags', 'SEO tags', (kit.tags || []).join(', '), 'this step'],
    ...(suggestion.style ? [['style', 'Video style', names.style(suggestion.style) || suggestion.style, 'Look & sound']] : []),
    ...(suggestion.voice ? [['voice', 'Voice', names.voice(suggestion.voice) || suggestion.voice, 'Look & sound']] : []),
    ['eyebrow', 'Eyebrow label', kit.eyebrow, 'Thumbnails'],
    ['tagline', 'Tagline', kit.tagline, 'Thumbnails'],
  ];
  const allApplied = rows.every(([key]) => applied[key]);
  return (
    <section className="rounded-xl border p-4" style={{ borderColor: 'var(--accent)', background: 'var(--accent-soft)' }} aria-label="AI draft">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="t-13 font-semibold text-ink flex items-center gap-1.5"><Sparkles size={14} style={{ color: 'var(--accent)' }} /> AI suggestion — review before using</p>
          <p className="t-11 text-muted mt-0.5">Drafted by AI (Groq) from your niche. Your form only changes when you press Apply.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button type="button" className="btn btn-sm btn-primary" onClick={onApplyAll} disabled={allApplied}>Apply all</button>
          <button type="button" className="btn btn-sm btn-outline" onClick={onDiscard}>Discard</button>
        </div>
      </div>
      <ul className="grid gap-1.5">
        {rows.map(([key, label, value, where]) => (
          <li key={key} className="flex items-start gap-3 rounded-lg border border-line px-3 py-2" style={{ background: 'var(--surface)' }}>
            <div className="min-w-0 flex-1">
              <p className="t-11 text-faint">
                {label} <span className="text-faint">· goes to {where}</span>
              </p>
              <p className="t-12 text-ink line-clamp-2 break-words">{value || '—'}</p>
            </div>
            {applied[key] ? (
              <span className="shrink-0 t-11 font-semibold inline-flex items-center gap-1 pt-1" style={{ color: 'var(--ok-ink)' }}>
                <Check size={12} /> Applied
              </span>
            ) : (
              <button type="button" className="btn btn-sm btn-outline shrink-0" onClick={() => onApply(key)} disabled={!value}>
                Apply
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
