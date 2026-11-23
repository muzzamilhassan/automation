'use client';
// Calendar (2026-11-23) — one day's items, opened from a month/week day cell.
// Each row: time (viewer's clock), channel, title, kind chip, and the one
// action that fits — Watch ↗ for a video, Review for a waiting script,
// nothing for a free slot.
import Link from 'next/link';
import { CalendarDays, ExternalLink } from 'lucide-react';
import Drawer from '@/components/Drawer';
import { Chip, BrandMark } from '@/components/ui';

export const KIND = {
  published: { glyph: '✓', word: 'Published', tone: 'ok' },
  scheduled: { glyph: '⏰', word: 'Scheduled', tone: 'info' },
  waiting: { glyph: '📝', word: 'Waiting', tone: 'warn' },
  free: { glyph: '░', word: 'Free slot', tone: 'plain' },
};

const LANE_WORD = { short: 'Short', long: 'Long video' };

export function itemTitle(it) {
  if (it.kind === 'free') return `Free ${LANE_WORD[it.lane] ? LANE_WORD[it.lane].toLowerCase() : ''} slot`.replace('  ', ' ');
  if (it.title) return it.title;
  return it.kind === 'waiting' ? 'Untitled script' : 'Title not saved';
}

export function waitingWord(it) {
  return it.stage === 'review' ? 'Needs approval' : 'Approved, not out yet';
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
            const k = KIND[it.kind];
            return (
              <li key={`${it.channel}-${it.videoId || it.scriptId || it.at || i}`} className="inset-tile p-3 flex items-start gap-3 min-w-0">
                <BrandMark name={b.name} accent={b.accent} short={b.short} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="t-12 tnum text-muted">{timeOf(it)}</span>
                    <span className="t-12 text-muted truncate">{b.name}</span>
                  </div>
                  <p className={`t-13 font-semibold mt-0.5 break-words ${it.kind === 'free' ? 'text-faint' : 'text-ink'}`}>{itemTitle(it)}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <Chip tone={k.tone}>
                      <span aria-hidden>{k.glyph}</span> {it.kind === 'waiting' ? waitingWord(it) : k.word}
                    </Chip>
                    {it.kind !== 'free' && LANE_WORD[it.lane] ? <span className="t-11 text-faint">{LANE_WORD[it.lane]}</span> : null}
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
