'use client';
// Phase 2 "pocket mode" (research/ui-ux-audit-2026-11-18/09-mobile-responsive.md §4):
// a phone-only bottom tab bar for the three phone jobs — check Today, Approve a
// held script, ack an Alert — plus More, which opens the existing nav drawer.
// The Approve badge is a LIVE count only (Phase 0 honesty): an unknown review
// count shows nothing. Owner rule (feedback round 1): real problems show ONLY
// in the topbar bell and on the Inbox page, so the Alerts tab is a plain link
// to /warnings — no warning count, no "status unknown" dot here.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ScrollText, Bell, Menu } from 'lucide-react';

const TABS = [
  { key: 'today', href: '/', label: 'Today', icon: Home },
  { key: 'approve', href: '/review', label: 'Approve', icon: ScrollText },
  { key: 'alerts', href: '/warnings', label: 'Alerts', icon: Bell },
];

const isActive = (href, pathname) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));

// Renders nothing unless n is a real, positive count.
function CountBadge({ n }) {
  if (typeof n !== 'number' || !(n > 0)) return null;
  const style = { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'transparent' };
  return (
    <span className="absolute top-1.5 left-1/2 ml-1.5 min-w-[18px] h-[18px] px-1 rounded-full border t-10 font-bold tnum flex items-center justify-center pointer-events-none" style={style}>
      {n > 99 ? '99+' : n}
    </span>
  );
}

export default function PocketBar({ onMore }) {
  const pathname = usePathname() || '/';

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
    if (key === 'approve') return <CountBadge n={reviewCount} />;
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
