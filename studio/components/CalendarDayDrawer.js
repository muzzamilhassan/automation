'use client';
// Calendar (2026-11-23) — one day's items, opened from a month/week day cell.
// Each row: a coloured kind icon, time (viewer's clock), channel, title, and
// the one action that fits — Watch ↗ for a video, Review for a waiting script,
// nothing for a free slot.
//
// Design round 2 (owner: "best calendar, real icons and colours"): every kind
// has a real lucide icon and a fixed colour family; channels keep their own
// accent. KIND is the single source both the page and this drawer read.
import Link from 'next/link';
import { CalendarDays, CheckCircle2, Clock3, FilePen, Hourglass, CirclePlus, ExternalLink, Clapperboard, Smartphone } from 'lucide-react';
import Drawer from '@/components/Drawer';
import { BrandMark } from '@/components/ui';

// color = the kind's ink (text/icon); tint = soft background; edge = border.
export const KIND = {
  published: { icon: CheckCircle2, word: 'Published', color: 'var(--ok-ink)', tint: 'color-mix(in srgb, var(--ok) 14%, transparent)', edge: 'color-mix(in srgb, var(--ok) 45%, transparent)' },
  scheduled: { icon: Clock3, word: 'Scheduled', color: 'var(--info-ink)', tint: 'color-mix(in srgb, var(--info) 14%, transparent)', edge: 'color-mix(in srgb, var(--info) 45%, transparent)' },
  waiting: { icon: FilePen, word: 'Waiting', color: 'var(--warn-ink)', tint: 'color-mix(in srgb, var(--warn) 16%, transparent)', edge: 'color-mix(in srgb, var(--warn) 50%, transparent)' },
  free: { icon: CirclePlus, word: 'Free slot', color: 'var(--faint)', tint: 'transparent', edge: 'var(--line-strong)' },
};
export const KIND_ORDER = ['published', 'scheduled', 'waiting', 'free'];

// A waiting item is either a script that needs approval, or one already
// approved that is not out yet — same family, different icon + word.
export function kindOf(it) {
  const k = KIND[it.kind] || KIND.free;
  if (it.kind === 'waiting' && it.stage !== 'review') return { ...k, icon: Hourglass, word: 'Approved, not out yet' };
  if (it.kind === 'waiting') return { ...k, word: 'Needs approval' };
  return k;
}

const LANE = { short: { word: 'Short', icon: Smartphone }, long: { word: 'Long video', icon: Clapperboard } };

export function itemTitle(it) {
  if (it.kind === 'free') return `Free ${LANE[it.lane] ? LANE[it.lane].word.toLowerCase() : ''} slot`.replace('  ', ' ');
  if (it.title) return it.title;
  return it.kind === 'waiting' ? 'Untitled script' : 'Title not saved';
}

export function waitingWord(it) {
  return it.stage === 'review' ? 'Needs approval' : 'Approved, not out yet';
}

/** Small coloured kind badge: icon + word. */
export function KindBadge({ it, compact = false }) {
  const k = kindOf(it);
  const Icon = k.icon;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 t-11 font-semibold whitespace-nowrap"
      style={{ color: k.color, background: k.tint, border: `1px ${it.kind === 'free' ? 'dashed' : 'solid'} ${k.edge}` }}
    >
      <Icon size={12} aria-hidden />
      {compact ? null : k.word}
    </span>
  );
}

/** Round coloured icon tile used in the drawer and the List timeline. */
export function KindIcon({ it, size = 30 }) {
  const k = kindOf(it);
  const Icon = k.icon;
  return (
    <span
      className="inline-flex items-center justify-center rounded-full shrink-0"
      style={{ width: size, height: size, color: k.color, background: k.tint, border: `1px ${it.kind === 'free' ? 'dashed' : 'solid'} ${k.edge}` }}
      aria-hidden
    >
      <Icon size={Math.round(size * 0.5)} />
    </span>
  );
}

export function LaneTag({ it }) {
  const l = LANE[it.lane];
  if (!l || it.kind === 'free') return null;
  const Icon = l.icon;
  return (
    <span className="inline-flex items-center gap-1 t-11 text-faint">
      <Icon size={11} aria-hidden /> {l.word}
    </span>
  );
}

export function ItemAction({ it }) {
  if ((it.kind === 'published' || it.kind === 'scheduled') && it.url) {
    return (
      <a href={it.url} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
        Watch <ExternalLink size={12} aria-hidden />
      </a>
    );
  }
  if (it.kind === 'waiting') {
    return (
      <Link href={it.scriptId ? `/review?id=${encodeURIComponent(it.scriptId)}` : '/review'} className="btn btn-outline btn-sm">
        Review
      </Link>
    );
  }
  return null;
}

export default function CalendarDayDrawer({ open, onClose, title, items, brand, timeOf }) {
  return (
    <Drawer open={open} onClose={onClose} title={title} icon={CalendarDays} size="md">
      {items.length ? (
        <ul className="space-y-2.5">
          {items.map((it, i) => {
            const b = brand(it.channel);
            return (
              <li
                key={`${it.channel}-${it.videoId || it.scriptId || it.at || i}`}
                className="inset-tile p-3 flex items-start gap-3 min-w-0"
                style={{ borderLeft: `3px solid ${it.kind === 'free' ? 'var(--line-strong)' : b.accent}` }}
              >
                <KindIcon it={it} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="t-12 tnum font-semibold text-ink">{timeOf(it)}</span>
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      <BrandMark name={b.name} accent={b.accent} short={b.short} size={16} />
                      <span className="t-12 text-muted truncate">{b.name}</span>
                    </span>
                  </div>
                  <p className={`t-13 font-semibold mt-1 break-words ${it.kind === 'free' ? 'text-faint' : 'text-ink'}`}>{itemTitle(it)}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <KindBadge it={it} />
                    <LaneTag it={it} />
                  </div>
                </div>
                <div className="shrink-0">
                  <ItemAction it={it} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="t-13 text-faint">Nothing on this day.</p>
      )}
    </Drawer>
  );
}
