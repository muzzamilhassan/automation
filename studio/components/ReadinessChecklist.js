'use client';
// "100% ready before anything publishes" (owner, 2026-11-21). The 7-item
// checklist for one channel, shared by the channel page and the Channels
// overview drawer, plus the small "Ready N/7" chip for cards. Every missing
// item says what to do; drawer places (Templates, Thumbnails, Schedule) open
// that drawer through onOpen(place), page places (Edit profile, Connect)
// are links. Data: useReadiness() → /api/channels/readiness.
import Link from 'next/link';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Chip } from '@/components/ui';

const DRAWER_PLACES = ['templates', 'thumbnails', 'schedule'];

/** "Ready 5/7" for a channel card; nothing while unknown. */
export function ReadyChip({ r, className }) {
  if (!r) return null;
  return (
    <Chip tone={r.ready ? 'ok' : 'warn'} className={className}>
      {`Ready ${r.done}/${r.total}`}
    </Chip>
  );
}

export default function ReadinessChecklist({ slug, r, status = 'ok', onOpen, canOpen = (place) => Boolean(onOpen) && DRAWER_PLACES.includes(place) }) {
  if (!r) {
    return (
      <p className="t-12 text-muted" data-slug={slug}>
        {status === 'loading' ? 'Checking if this channel is ready to publish…' : "Couldn't check if this channel is ready to publish right now."}
      </p>
    );
  }
  return (
    <section aria-label="Ready to publish" className="space-y-2 min-w-0" data-slug={slug}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="t-13 font-semibold text-ink">Ready to publish: {r.done}/{r.total}</h3>
        {r.ready ? <Chip tone="ok" dot>Ready</Chip> : null}
      </div>
      {!r.ready ? <p className="t-12 text-muted">Nothing publishes until all {r.total} are done.</p> : null}
      <ul className="space-y-1.5">
        {r.items.map((item) => (
          <li key={item.key} className="flex items-start gap-2 min-w-0">
            {item.ok ? (
              <CheckCircle2 size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--ok-ink)' }} aria-hidden />
            ) : (
              <XCircle size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--bad-ink)' }} aria-hidden />
            )}
            <span className="min-w-0">
              <span className="block t-13 text-ink">
                {item.label}
                <span className="sr-only">{item.ok ? ' — done' : ' — not done'}</span>
              </span>
              {!item.ok ? (
                item.href ? (
                  <Link href={item.href} className="t-12 underline underline-offset-2 text-muted hover:text-ink">{item.fix}</Link>
                ) : canOpen(item.place) ? (
                  <button type="button" className="t-12 underline underline-offset-2 text-muted hover:text-ink text-left" onClick={() => onOpen(item.place)}>{item.fix}</button>
                ) : (
                  <span className="t-12 text-muted">{item.fix}</span>
                )
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
