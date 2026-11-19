'use client';
// Phase 2 "pocket mode" (research/ui-ux-audit-2026-11-18/09-mobile-responsive.md §4):
// a phone-only bottom tab bar for the three phone jobs — check Today, Approve a
// held script, ack an Alert — plus More, which opens the existing nav drawer.
// Badges are LIVE counts only (Phase 0 honesty): an unknown review count shows
// nothing, and a failed warnings check shows a grey "?" — never a number we
// didn't actually read.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ScrollText, Bell, Menu } from 'lucide-react';
import { useOpenWarnings } from '@/components/use-open-warnings';

const TABS = [
  { key: 'today', href: '/', label: 'Today', icon: Home },
  { key: 'approve', href: '/review', label: 'Approve', icon: ScrollText },
  { key: 'alerts', href: '/warnings', label: 'Alerts', icon: Bell },
];

const isActive = (href, pathname) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));

// Renders nothing unless n is a real, positive count.
function CountBadge({ n, tone }) {
  if (typeof n !== 'number' || !(n > 0)) return null;
  const style = tone === 'bad'
    ? { background: 'color-mix(in srgb, var(--bad) 18%, var(--surface))', color: 'var(--bad-ink)', borderColor: 'color-mix(in srgb, var(--bad) 45%, transparent)' }
    : { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'transparent' };
  return (
    <span className="absolute top-1.5 left-1/2 ml-1.5 min-w-[18px] h-[18px] px-1 rounded-full border t-10 font-bold tnum flex items-center justify-center pointer-events-none" style={style}>
      {n > 99 ? '99+' : n}
    </span>
  );
}

// The warnings check failed: status is UNKNOWN, which is not the same as zero.
function UnknownDot() {
  return (
    <span
      className="absolute top-1.5 left-1/2 ml-1.5 min-w-[18px] h-[18px] px-1 rounded-full t-10 font-bold flex items-center justify-center pointer-events-none border"
      style={{ background: 'var(--surface-2)', color: 'var(--muted)', borderColor: 'var(--line)' }}
      title="Can't check alerts right now — status unknown"
    >
      ?
    </span>
  );
}

export default function PocketBar({ onMore }) {
  const pathname = usePathname() || '/';
  const { rows: warnRows, canSee: warnCanSee, status: warnStatus } = useOpenWarnings();

  // Pending review count — fetched once. 401/403 (not allowed) and 503 (DB down)
  // leave it null, so the badge simply doesn't render.
  const [reviewCount, setReviewCount] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/review')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setReviewCount(Array.isArray(d?.scripts) ? d.scripts.length : null); })
      .catch(() => { if (alive) setReviewCount(null); });
    return () => { alive = false; };
  }, []);

  const badgeFor = (key) => {
    if (key === 'approve') return <CountBadge n={reviewCount} tone="accent" />;
    if (key === 'alerts') {
      if (warnStatus === 'error') return <UnknownDot />;
      return warnCanSee ? <CountBadge n={warnRows.length} tone="bad" /> : null;
    }
    return null;
  };

  const tabClass = 'relative flex flex-col items-center justify-center gap-1 min-h-[56px] min-w-[44px] t-11 font-semibold transition-colors';

  return (
    <nav
      aria-label="Pocket navigation"
      className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur-xl"
      style={{
        background: 'color-mix(in srgb, var(--surface) 92%, transparent)',
        borderColor: 'var(--line)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="grid grid-cols-4">
        {TABS.map((t) => {
          const active = isActive(t.href, pathname);
          const Icon = t.icon;
          return (
            <Link
              key={t.key}
              href={t.href}
              aria-current={active ? 'page' : undefined}
              className={tabClass}
              style={{ color: active ? 'var(--accent)' : 'var(--muted)' }}
            >
              <Icon size={20} strokeWidth={active ? 2.4 : 2} />
              {badgeFor(t.key)}
              <span>{t.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => onMore?.()}
          className={`${tabClass} cursor-pointer`}
          style={{ color: 'var(--muted)' }}
          aria-label="More — open the menu"
        >
          <Menu size={20} strokeWidth={2} />
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}
