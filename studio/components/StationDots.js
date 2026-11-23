'use client';
// Creator City Phase 1 (FEEDBACK item O, 2026-11-23) — the 7 production
// stations (Topic · Script · You approve · Voice · Render · Thumbnail ·
// Upload) as a row of small dots. size="sm" for the Today rows, size="lg"
// (labels under the dots) for the run step drawer. Each dot is named for
// screen readers ("Voice: Running") and has a native tooltip
// ("Voice — Running · detail"). Logic lives in lib/station-dots-view.mjs.
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { normalizeStrip, dotAria, dotTitle, currentIndex } from '@/lib/station-dots-view.mjs';

const SIZE = { sm: 10, lg: 18 };

function Dot({ state, px }) {
  const box = { width: px, height: px };
  switch (state) {
    case 'done':
      return <span className="block rounded-full" style={{ ...box, background: 'var(--ok-ink)' }} />;
    case 'running':
      return <span className="block rounded-full motion-safe:animate-pulse" style={{ ...box, background: 'var(--info-ink)' }} />;
    case 'needs_you':
      return <span className="block rounded-full" style={{ ...box, border: `${px > 12 ? 3 : 2}px solid var(--warn-ink)` }} />;
    case 'failed':
      return (
        <span className="flex items-center justify-center rounded-full" style={{ ...box, background: 'var(--bad-ink)', color: 'var(--surface)' }}>
          <X size={Math.round(px * 0.75)} strokeWidth={3.5} aria-hidden />
        </span>
      );
    case 'skipped':
      return (
        <span className="flex items-center justify-center" style={box}>
          <span className="block rounded-full" style={{ width: px, height: 2, background: 'var(--faint)' }} />
        </span>
      );
    case 'not_yet':
      return <span className="block rounded-full" style={{ ...box, border: '1.5px solid var(--faint)' }} />;
    default: // unknown — "Not tracked"
      return (
        <span className={cn('flex items-center justify-center font-bold leading-none text-faint', px > 12 ? 't-12' : 't-10')} style={box}>
          ?
        </span>
      );
  }
}

export default function StationDots({ stations, size = 'sm', className }) {
  const strip = normalizeStrip(stations);
  const px = SIZE[size] || SIZE.sm;
  const cur = currentIndex(strip);
  if (size === 'lg') {
    return (
      <ol className={cn('grid grid-cols-7 gap-1', className)} aria-label="Stations">
        {strip.map((d, i) => (
          <li key={d.key} className="flex flex-col items-center gap-1.5 min-w-0 text-center" title={dotTitle(d)}>
            <span role="img" aria-label={dotAria(d)} className="inline-flex items-center justify-center" style={{ width: 26, height: 26 }}>
              <Dot state={d.state} px={px} />
            </span>
            <span className={cn('t-10 leading-tight break-words max-w-full', i === cur ? 'font-semibold text-ink' : 'text-muted')}>{d.label}</span>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      {strip.map((d) => (
        <span key={d.key} role="img" aria-label={dotAria(d)} title={dotTitle(d)} className="inline-flex items-center justify-center shrink-0">
          <Dot state={d.state} px={px} />
        </span>
      ))}
    </span>
  );
}
