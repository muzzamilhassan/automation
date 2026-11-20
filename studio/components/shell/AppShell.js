'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  Menu,
  X,
  Search,
  Bell,
  Sun,
  Moon,
  ChevronsLeft,
  ChevronsRight,
  ChevronRight,
  ExternalLink,
  AlertTriangle,
  Info,
  OctagonAlert,
  Pickaxe,
  LogOut,
  Sparkles,
} from 'lucide-react';
import { NAV, ALL_NAV_ITEMS, MENU_ITEMS, navSectionFor } from './nav';
import CommandPalette from './CommandPalette';
import PocketBar from './PocketBar';
import NavProgress from './NavProgress';
import { ConfirmProvider } from '@/components/ConfirmDialog';
import { useBrands } from '@/components/use-brands';
import { useOpenWarnings } from '@/components/use-open-warnings';
import { needsYou } from '@/lib/notify-policy.mjs';
import { useMe, initialsOf } from '@/components/use-me';
// #126 (S-2): the bell's alert rows come from /api/warnings — the static
// hand-written September alerts are deleted from site-data.
import { cn } from '@/lib/utils';
import { buildBreadcrumbs } from '@/lib/breadcrumbs.mjs';
import { isBarePath, signedOutLoginUrl } from '@/lib/safe-next.mjs';
import { placePopover } from '@/lib/popover-place.mjs';
import { shortcutLabel } from '@/lib/palette-rank.mjs';
import { Button } from '@/components/untitledui/base/buttons/button';
import { ButtonUtility } from '@/components/untitledui/base/buttons/button-utility';
import { Badge, BadgeWithIcon } from '@/components/untitledui/base/badges/badges';
import { BrandMark } from '@/components/ui';

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // stay on the SSR default until mounted so server and first client render match
  const dark = !mounted || theme !== 'light';
  return (
    <ButtonUtility
      size="sm"
      color="tertiary"
      tooltip={dark ? 'Light theme' : 'Dark theme'}
      icon={mounted && !dark ? Sun : Moon}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
    />
  );
}

// Live fix wave B3 (T1-22): "Ctrl K" on Windows/Linux, "⌘K" on Mac. Starts
// as Ctrl K on the server and the first client render, then reads the device.
function ShortcutHint() {
  const [label, setLabel] = useState('Ctrl K');
  useEffect(() => {
    const id = requestAnimationFrame(() => setLabel(shortcutLabel(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent)));
    return () => cancelAnimationFrame(id);
  }, []);
  return <span className="ml-auto font-mono t-10 text-fg-quaternary border border-border-tertiary rounded px-1 py-px">{label}</span>;
}

// Live fix wave B3 (T1-04/T1-05): the topbar's popovers render in a portal on
// document.body. Inline, their `fixed inset-0` click-away layer was trapped
// inside the header (backdrop-filter makes it the containing block for fixed
// children), so it covered only the 57px bar: outside clicks and Escape did
// nothing. Here the layer covers the whole screen, Escape closes and puts
// focus back on the trigger, and the panel is placed from the trigger's
// rect and clamped inside the viewport (lib/popover-place.mjs).
function HeaderPopover({ open, anchorRef, onClose, width, label, children }) {
  const [rect, setRect] = useState(null);
  const panelRef = useRef(null);
  // the latest onClose without re-running the open effect on every render
  // (a re-run would re-focus the panel and steal focus from its buttons)
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    if (!open) return undefined;
    const measure = () => {
      const r = anchorRef.current?.getBoundingClientRect();
      if (r) setRect({ right: r.right, bottom: r.bottom, vw: window.innerWidth });
    };
    const id = requestAnimationFrame(() => {
      measure();
      panelRef.current?.focus({ preventScroll: true });
    });
    const trigger = () => {
      const el = anchorRef.current;
      return el?.matches?.('button') ? el : el?.querySelector?.('button');
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      closeRef.current();
      trigger()?.focus();
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', measure);
    };
  }, [open, anchorRef]);
  if (!open || typeof document === 'undefined') return null;
  const place = rect ? placePopover({ anchor: rect, width, viewportWidth: rect.vw }) : null;
  return createPortal(
    <>
      <div className="fixed inset-0 z-[90]" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-label={label}
        tabIndex={-1}
        className="fixed z-[91] rounded-lg border border-border-secondary bg-bg-primary shadow-xl overflow-hidden pop-in outline-none"
        style={place ? { top: place.top, left: place.left, width: place.width } : { visibility: 'hidden', top: 0, left: 0, width }}
      >
        {children}
      </div>
    </>,
    document.body
  );
}

function Notifications({ open, onClose, warnings }) {
  const SEV_ICON = { blocking: OctagonAlert, action_required: AlertTriangle, warning: AlertTriangle, advisory: Info, informational: Info };
  const SEV_COLOR = { blocking: 'text-error-primary', action_required: 'text-warning-primary', warning: 'text-warning-primary', advisory: 'text-fg-tertiary', informational: 'text-fg-tertiary' };
  if (!open) return null;
  const ICONS = { bad: OctagonAlert, warn: AlertTriangle, info: Info };
  const COLOR = { bad: 'text-error-primary', warn: 'text-warning-primary', info: 'text-fg-tertiary' };
  // #126 (S-2): real open warnings from /api/warnings — never hand-written rows
  const rows = warnings.rows || [];
  // Live fix wave A4 (T2-02): THE one count — alerts + scripts awaiting
  // approval (needsYou), the same number as home, /tasks and /warnings.
  const need = needsYou({ rows, awaiting: warnings.awaiting || 0 });
  const shown = need.approvals ? rows.filter((g) => !['review_hold', 'review_timeout'].includes(g.code)) : rows;
  // the frame (border, shadow, placement, click-away, Escape) is HeaderPopover's
  return (
    <>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-tertiary">
          <span className="text-sm font-semibold text-fg-primary">Alerts</span>
          {warnings.canSee ? <Badge color={need.count ? 'warning' : 'success'} size="sm">{need.count} need you</Badge> : null}
        </div>
        <div className="max-h-[320px] overflow-y-auto">
          {/* Live fix wave A1 (T1-02): only a SUCCESSFUL check may say "nothing
              needs attention" — a failed check is "status unknown" + Retry. */}
          {warnings.status === 'error' ? (
            <div className="px-4 py-6 text-center">
              <p className="t-12 font-semibold text-fg-primary">Can&apos;t check alerts right now — status unknown</p>
              <button type="button" className="btn btn-outline btn-sm mt-3" onClick={() => warnings.retry?.()}>
                Retry
              </button>
            </div>
          ) : warnings.status === 'loading' ? (
            <div className="px-4 py-6 text-center">
              <p className="t-12 text-fg-tertiary">Checking alerts…</p>
            </div>
          ) : warnings.status === 'forbidden' ? (
            <div className="px-4 py-6 text-center">
              <p className="t-12 text-fg-tertiary">Alerts are an owner/staff surface.</p>
            </div>
          ) : need.count === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="t-12 font-semibold text-fg-primary">Nothing needs attention</p>
              <p className="t-11 text-fg-tertiary mt-1">All checks are quiet — no open alerts.</p>
            </div>
          ) : [need.approvals ? (
            <Link key="approvals" href="/review" onClick={onClose} className="flex gap-3 px-4 py-3 border-b border-border-tertiary hover:bg-bg-secondary transition-colors">
              <Info size={15} className="shrink-0 mt-0.5 text-accent" />
              <span className="block t-12 font-semibold text-fg-primary">{need.approvals} script{need.approvals === 1 ? '' : 's'} waiting for your approval</span>
            </Link>
          ) : null, ...shown.map((w) => {
            const Icon = SEV_ICON[w.severity] || Info;
            return (
              <Link key={w.id} href="/warnings" onClick={onClose} className="flex gap-3 px-4 py-3 border-b border-border-tertiary last:border-0 hover:bg-bg-secondary transition-colors">
                <Icon size={15} className={cn('shrink-0 mt-0.5', SEV_COLOR[w.severity] || COLOR.info)} />
                <span className="min-w-0">
                  <span className="block t-12 font-semibold text-fg-primary">{w.title}</span>
                  <span className="block t-11 text-fg-tertiary mt-0.5 font-mono truncate">{w.severity}{w.channel_id ? ` · ${w.channel_id}` : ''}</span>
                </span>
              </Link>
            );
          })]}
        </div>
        {warnings.canSee ? (
          <Link href="/warnings" onClick={onClose} className="block px-4 py-2.5 border-t border-border-tertiary t-11 text-accent hover:underline">
            open the warning triage →
          </Link>
        ) : null}
    </>
  );
}

/* 10-15 DREAMS CONVERSION: dark sidebar with custom links (replaces the UUI
   NavList so the always-dark palette is fully controlled). */
function NavGroups({ collapsed, onNavigate, channels }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 overflow-y-auto pb-4 px-2.5">
      {NAV.map((g) => (
        <div key={g.group} className="mb-2">
          {collapsed ? (
            <div className="mx-2 my-2 h-px bg-white/10" />
          ) : (
            <div className="qs-side-group">{g.group}</div>
          )}
          <div className={cn('space-y-0.5', collapsed && 'qs-rail')}>
            {g.items.map((i) => {
              const active = navSectionFor(pathname)?.href === i.href;
              const Icon = i.icon;
              return (
                <Link
                  key={i.href}
                  href={i.href}
                  onClick={onNavigate}
                  title={collapsed ? i.label : undefined}
                  className={cn('qs-side-link', active && 'active')}
                >
                  <Icon />
                  {!collapsed ? <span className="truncate flex-1">{i.label}</span> : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      {/* Channels Section — live from /api/brands (#125 S-11) */}
      <div className="mt-3 pt-3 border-t border-white/10">
        {!collapsed ? (
          <div className="qs-side-group flex items-center justify-between">
            <span>Channels</span>
            <Link href="/channels" className="t-10 lowercase text-[#6b7671] hover:text-[#98a2a7]">
              manage →
            </Link>
          </div>
        ) : null}
        <div className={cn('space-y-1', collapsed && 'flex flex-col items-center gap-1.5')}>
          {channels.map((p) => (
            <Link
              key={p.slug}
              href={`/channels/${p.slug}`}
              onClick={onNavigate}
              title={`${p.label} (${p.short})`}
              className={cn(
                'flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg t-12 text-[#98a2a7] hover:text-white hover:bg-white/5 transition-colors',
                collapsed && 'px-1 py-1'
              )}
            >
              <BrandMark short={p.short} accent={p.accent} size={20} />
              {!collapsed ? (
                <span className="truncate font-medium">{p.label}</span>
              ) : null}
            </Link>
          ))}
        </div>
      </div>

      <div className={cn('mt-4 pt-3 border-t border-white/10', collapsed ? 'flex justify-center' : '')}>
        <a
          href="https://muzzamilhassan.github.io/quarrystudio/dashboard.html"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 px-2 t-11 text-[#6b7671] hover:text-[#98a2a7] transition-colors"
          title="TikTok dashboard"
        >
          <ExternalLink size={12} />
          {!collapsed ? 'TikTok dashboard' : null}
        </a>
      </div>
    </nav>
  );
}

function Brand({ collapsed }) {
  return (
    <Link href="/" className="flex items-center gap-3 px-5 h-[58px] shrink-0 border-b border-white/10 active:scale-[0.98] transition-transform duration-100 ease-out">
      <span
        className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
        style={{ background: 'var(--accent)' }}
      >
        <Pickaxe size={16} color="#0a0a0a" strokeWidth={2.4} />
      </span>
      {!collapsed ? (
        <span className="min-w-0">
          <span className="block font-display font-bold text-[15px] tracking-tight text-white leading-none">Quarry Studio</span>
          <span className="block t-10 text-[#6b7671] mt-0.5">Command Center</span>
        </span>
      ) : null}
    </Link>
  );
}

// The shell's live data (alerts, inbox count, identity, channels) must load
// WITH the session. AppShell used to stay mounted across the /login → app
// client navigation, so those fetches ran once on the login screen (401) and
// never again — after every sign-in the bell said "owner/staff surface", the
// Inbox badge was empty and the avatar showed '··' until a manual reload.
// Bare pages now render without the frame; the frame mounts fresh (and
// fetches with the cookie) the moment a real page opens.
export default function AppShell({ children }) {
  const pathname = usePathname();
  if (isBarePath(pathname)) return <ConfirmProvider>{children}</ConfirmProvider>;
  return <ShellFrame>{children}</ShellFrame>;
}

function ShellFrame({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  // #126 (S-2): real open warnings — badge hides for clients/failures, never a fake number.
  // Owner rule (feedback round 1): the bell is the ONLY shell surface that shows them.
  const { rows: openWarningRows, canSee: warningsCanSee, status: warnStatus, retry: warnRetry } = useOpenWarnings();
  const me = useMe();
  // #125 (S-11): the sidebar's channel list is LIVE — /api/brands replaces
  // the old hardcoded list; nothing renders until it loads. The same names
  // feed the breadcrumb (/channels/<slug> → the channel's display name).
  const { channels: liveChannels, bySlug } = useBrands();
  const [userOpen, setUserOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  // Live fix wave B3: triggers the popovers anchor to + where focus returns
  const bellRef = useRef(null);
  const avatarRef = useRef(null);
  const menuBtnRef = useRef(null);
  const drawerRef = useRef(null);
  // Live fix wave A4 (T2-02): scripts awaiting approval join the bell's count
  // (needsYou) so the badge, home, /tasks and /warnings show ONE number.
  const [awaiting, setAwaiting] = useState(0);
  useEffect(() => {
    if (!warningsCanSee) return undefined;
    let alive = true;
    fetch('/api/review')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setAwaiting(Array.isArray(d.scripts) ? d.scripts.length : 0); })
      .catch(() => {});
    return () => { alive = false; };
  }, [warningsCanSee, pathname]);
  const bellCount = needsYou({ rows: openWarningRows, awaiting }).count;

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem('qs-sidebar') === '1');
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('qs-sidebar', collapsed ? '1' : '0');
    } catch {}
  }, [collapsed]);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => setMobileOpen(false), [pathname]);

  // Live fix wave B3 (T1-21): Escape closes the phone menu and focus goes back
  // to ☰ (or whatever opened it, e.g. the pocket bar's More).
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const opener = document.activeElement;
    const id = requestAnimationFrame(() => drawerRef.current?.querySelector('button[aria-label="Close menu"]')?.focus({ preventScroll: true }));
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setMobileOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener('keydown', onKey);
      const back = opener instanceof HTMLElement && opener !== document.body && document.contains(opener) && opener.offsetParent !== null ? opener : menuBtnRef.current;
      back?.focus({ preventScroll: true });
    };
  }, [mobileOpen]);

  // Live fix wave A1 (T1-10): the proxy checks only the cookie's signature, so
  // a REVOKED session still gets the frame — with every call failing 401.
  // /api/me checks the live session row; a 401 there means this device is
  // signed out → back to /login (remembering the page) with a plain reason.
  // Bare pages never mount this frame, and isBarePath guards a redirect loop.
  useEffect(() => {
    let alive = true;
    fetch('/api/me')
      .then((r) => {
        if (!alive || r.status !== 401 || isBarePath(window.location.pathname)) return;
        window.location.replace(signedOutLoginUrl(window.location.pathname + window.location.search));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Bare pages — no sidebar, no topbar: login, the public /proof sales page,
  // and the DFY client workspace (it has its own minimal chrome).

  const logout = async () => {
    setLoggingOut(true);
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch {}
    router.replace('/login');
  };

  // Feedback round 1 (C): full, clickable trail on every page at every width.
  const channelNames = Object.fromEntries(Object.entries(bySlug).map(([slug, c]) => [slug, c.label]));
  const crumbs = buildBreadcrumbs(pathname, { items: ALL_NAV_ITEMS, menu: MENU_ITEMS, channelNames });

  const sidebarInner = (collapsedState, isMobile = false) => (
    <>
      <Brand collapsed={collapsedState && !isMobile} />
      <NavGroups collapsed={collapsedState && !isMobile} onNavigate={() => setMobileOpen(false)} channels={liveChannels} />
      <div className={cn('qs-side-foot p-3 shrink-0', collapsedState && !isMobile ? 'flex flex-col items-center gap-2' : 'flex items-center justify-between')}>

        {!isMobile ? (
          <button
            className="qs-side-collapse"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsedState ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsedState ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsedState ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
          </button>
        ) : null}
      </div>
    </>
  );

  return (
    <ConfirmProvider>
    <NavProgress />
    <div className="min-h-screen flex bg-bg-primary">
      {/* desktop sidebar */}
      <aside
        className="hidden lg:flex flex-col sticky top-0 h-screen shrink-0 z-30 qs-side transition-[width] duration-200 ease-out"
        style={{ width: collapsed ? 56 : 232 }}
      >
        {sidebarInner(collapsed)}
      </aside>

      {/* mobile drawer */}
      {mobileOpen ? (
        <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} />
          <aside ref={drawerRef} className="absolute inset-y-0 left-0 w-[250px] qs-side flex flex-col pop-in">
            <button className="absolute top-2 right-2 z-10 w-11 h-11 flex items-center justify-center rounded-lg text-[#98a2a7] hover:text-white transition-colors" onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <X size={16} />
            </button>
            {sidebarInner(false, true)}
          </aside>
        </div>
      ) : null}

      {/* main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-40 h-[58px] border-b border-border-secondary backdrop-blur-xl bg-bg-primary/85">
          <div className="h-full px-4 md:px-6 flex items-center gap-2 md:gap-3">
            <button ref={menuBtnRef} className="lg:hidden icon-btn shrink-0" onClick={() => setMobileOpen(true)} aria-label="Open menu" aria-expanded={mobileOpen}>
              <Menu size={16} />
            </button>

            {/* One line at every width: earlier crumbs truncate, the current page keeps most of the room. */}
            <nav aria-label="Breadcrumb" className="flex-1 min-w-0">
              <ol className="flex items-center min-w-0 overflow-hidden whitespace-nowrap t-13">
                {crumbs.map((c, idx) => (
                  <li key={`${idx}-${c.label}`} className={cn('flex items-center min-w-0', c.current && 'shrink-0 max-w-[65%] md:max-w-none md:shrink')}>
                    {idx > 0 ? <ChevronRight size={13} aria-hidden="true" className="shrink-0 mx-1 text-faint" /> : null}
                    {c.current ? (
                      <span aria-current="page" className="min-w-0 truncate font-semibold text-ink">{c.label}</span>
                    ) : (
                      <Link href={c.href} className="min-w-0 max-w-[96px] md:max-w-[220px] truncate text-faint hover:text-ink transition-colors">{c.label}</Link>
                    )}
                  </li>
                ))}
              </ol>
            </nav>

            <Link href="/studio?tab=create" className="hidden sm:inline-flex shrink-0">
              <Button color="primary" size="sm" iconLeading={<Sparkles size={14} />}>
                Create
              </Button>
            </Link>

            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden sm:flex shrink-0 items-center gap-2 h-8 pl-3 pr-2 rounded-lg border border-transparent bg-bg-tertiary text-fg-quaternary hover:text-fg-tertiary transition-colors"
              style={{ width: 210 }}
            >
              <Search size={14} />
              <span className="t-12">Search or run…</span>
              <ShortcutHint />
            </button>
            <button className="sm:hidden icon-btn shrink-0" onClick={() => setPaletteOpen(true)} aria-label="Search">
              <Search size={15.5} />
            </button>

            {/* The bell: one of the only two places real problems show (the other is /warnings). Never hidden, never squeezed. */}
            <div ref={bellRef} className="relative shrink-0">
              <ButtonUtility
                size="sm"
                color="tertiary"
                tooltip="Alerts"
                icon={Bell}
                onClick={() => setNotifOpen((o) => !o)}
                aria-label="Alerts"
              />
              {warnStatus === 'error' ? (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[9.5px] font-bold flex items-center justify-center bg-bg-tertiary text-fg-tertiary pointer-events-none" title="Can't check alerts — status unknown">?</span>
              ) : warningsCanSee && bellCount ? (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[9.5px] font-bold flex items-center justify-center bg-error-solid text-white pointer-events-none">
                  {bellCount}
                </span>
              ) : null}
              <HeaderPopover open={notifOpen} anchorRef={bellRef} onClose={() => setNotifOpen(false)} width={340} label="Alerts">
                <Notifications open={notifOpen} onClose={() => setNotifOpen(false)} warnings={{ rows: openWarningRows, canSee: warningsCanSee, status: warnStatus, retry: warnRetry, awaiting }} />
              </HeaderPopover>
            </div>

            <div className="shrink-0">
              <ThemeToggle />
            </div>

            <div className="relative shrink-0">
              <button
                ref={avatarRef}
                className="flex items-center justify-center w-8 h-8 rounded-full font-display font-bold t-12 shrink-0 cursor-pointer relative before:absolute before:-inset-1 before:content-[''] transition-transform duration-100 ease-out hover:scale-105 active:scale-[0.96]"
                style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
                onClick={() => setUserOpen((o) => !o)}
                aria-label="Account menu"
                aria-expanded={userOpen}
                title={me ? `${me.name || me.email} — ${me.role}` : "Account menu"}
              >
                {me ? initialsOf(me.name, me.email) : '··'}
              </button>
              <HeaderPopover open={userOpen} anchorRef={avatarRef} onClose={() => setUserOpen(false)} width={220} label="Account">
                <div className="px-4 py-3 border-b border-border-tertiary">
                  <p className="t-12 font-semibold text-fg-primary break-words">{me?.name || me?.email || 'Signed in'}</p>
                  <p className="t-11 text-fg-quaternary mt-0.5 break-words">{me?.email || ''}{me?.role ? ` · ${me.role}` : ''}</p>
                </div>
                <button
                  onClick={logout}
                  disabled={loggingOut}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 t-12 font-semibold transition-colors hover:bg-bg-secondary disabled:opacity-50 text-error-primary"
                >
                  <LogOut size={14} />
                  {loggingOut ? 'Signing out…' : 'Log out'}
                </button>
              </HeaderPopover>
            </div>
          </div>
        </header>

        <main className="relative w-full px-4 md:px-6 pt-5 pb-[calc(88px+env(safe-area-inset-bottom))] md:py-7 max-w-[1240px] mx-auto">
          <div key={pathname} className="fade-up">
            {children}
          </div>
          <footer className="mt-14 pb-6 flex items-center justify-between t-11 text-fg-quaternary">
            <span>Quarry Studio · runs on GitHub Actions · nothing lives on this PC</span>
            <span className="font-mono">v4.0 · Dreams UI</span>
          </footer>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <PocketBar onMore={() => setMobileOpen(true)} />
    </div>
    </ConfirmProvider>
  );
}
