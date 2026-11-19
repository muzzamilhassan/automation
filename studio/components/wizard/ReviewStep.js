'use client';
// Step 7 — every choice in one place, each section with an Edit link back to
// its step, plus the consent the YouTube API policy requires before the
// autopilot may publish. The Save buttons live in the page footer.
import { Pencil, AlertTriangle } from 'lucide-react';

export default function ReviewStep({ sections, onEdit, issues, consent, onConsent, channelName, accent }) {
  return (
    <div className="space-y-4">
      {issues.length ? (
        <div className="rounded-xl border p-3" style={{ borderColor: 'var(--warn)', background: 'var(--surface-2)' }} role="alert">
          <p className="t-13 font-semibold flex items-center gap-1.5" style={{ color: 'var(--warn-ink)' }}>
            <AlertTriangle size={14} /> Fix {issues.length === 1 ? 'this' : 'these'} before saving
          </p>
          <ul className="mt-1.5 space-y-1">
            {issues.map((it) => (
              <li key={`${it.step}-${it.msg}`} className="t-12 text-muted flex flex-wrap items-center gap-x-2">
                <span>{it.msg}</span>
                <button type="button" className="t-11 font-semibold text-accent underline underline-offset-2" onClick={() => onEdit(it.step)}>Go fix</button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-3">
        {sections.map((s) => (
          <section key={s.step} className="rounded-xl border border-line">
            <header className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
              <h3 className="t-13 font-semibold text-ink">{s.title}</h3>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => onEdit(s.step)} aria-label={`Edit ${s.title}`}>
                <Pencil size={12} /> Edit
              </button>
            </header>
            <dl className="px-4 pb-3 grid gap-1.5">
              {s.rows.map(([label, value]) => (
                <div key={label} className="grid sm:grid-cols-[10rem_minmax(0,1fr)] gap-x-3 gap-y-0.5">
                  <dt className="t-11 text-faint pt-0.5">{label}</dt>
                  <dd className="t-13 text-ink break-words min-w-0 flex items-center gap-2">
                    {label === 'Accent colour' ? <span className="w-3.5 h-3.5 rounded-sm border border-line shrink-0" style={{ background: accent }} aria-hidden="true" /> : null}
                    <span className="min-w-0">{value}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <label className="flex items-start gap-3 rounded-xl border p-4 cursor-pointer" style={{ borderColor: consent ? 'var(--accent)' : 'var(--line)', background: consent ? 'var(--accent-soft)' : 'transparent' }}>
        <input type="checkbox" className="mt-0.5 w-4 h-4 shrink-0 accent-[var(--accent)]" checked={consent} onChange={(e) => onConsent(e.target.checked)} />
        <span className="min-w-0">
          <span className="block t-13 font-semibold text-ink">I allow Quarry Studio to publish videos to “{channelName}” automatically.</span>
          <span className="block t-12 text-muted mt-0.5">Required to start the autopilot. Your consent is recorded with today&apos;s date, and you can pause any time from the Channels page.</span>
        </span>
      </label>
    </div>
  );
}
