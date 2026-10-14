'use client';
import { useEffect, useState } from 'react';
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
  Activity,
  ExternalLink,
  AlertTriangle,
  Info,
  OctagonAlert,
  Pickaxe,
  LogOut,
} from 'lucide-react';
import { NAV } from './nav';
import CommandPalette from './CommandPalette';
import { ALERTS } from '@/lib/site-data';
import { cn } from '@/lib/utils';
import { NavList } from '@/components/untitledui/application/app-navigation/base-components/nav-list';
import { ButtonUtility } from '@/components/untitledui/base/buttons/button-utility';
import { Badge, BadgeWithIcon } from '@/components/untitledui/base/badges/badges';

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = theme !== 'light';
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

function Notifications({ open, onClose }) {
  if (!open) return null;
  const ICONS = { bad: OctagonAlert, warn: AlertTriangle, info: Info };
  const COLOR = { bad: 'text-error-primary', warn: 'text-warning-primary', info: 'text-fg-tertiary' };
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-[calc(100%+10px)] w-[340px] rounded-xl border border-border-secondary bg-bg-primary shadow-xl z-50 overflow-hidden pop-in">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-tertiary">
          <span className="text-sm font-semibold text-fg-primary">Alerts</span>
          <Badge color="warning" size="sm">{ALERTS.length} open</Badge>
        </div>
        <div className="max-h-[320px] overflow-y-auto">
          {ALERTS.map((a) => {
            const Icon = ICONS[a.level] || Info;
            return (
              <Link key={a.title} href={a.href} onClick={onClose} className="flex gap-3 px-4 py-3 border-b border-border-tertiary last:border-0 hover:bg-bg-secondary transition-colors">
                <Icon size={15} className={cn('shrink-0 mt-0.5', COLOR[a.level] || COLOR.info)} />
                <span>
                  <span className="block text-[12.5px] font-semibold text-fg-primary">{a.title}</span>
                  <span className="block text-[11.5px] text-fg-tertiary mt-0.5 leading-snug">{a.body}</span>
                  <span className="block text-[10.5px] text-fg-quaternary mt-1 font-mono">{a.when}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}

function NavGroups({ collapsed, onNavigate }) {
  const pathname = usePathname();
  const blocks = [];
  NAV.forEach((g, gi) => {
    if (collapsed) {
      blocks.push(<div key={`div-${g.group}`} className="mx-4 my-2"><hr className="h-px w-full border-none bg-border-secondary" /></div>);
    } else {
      blocks.push(
        <div key={`h-${g.group}`} className="px-6 pt-5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-fg-quaternary">
          {g.group}
        </div>
      );
    }
    const items = g.items.map((i) => ({
      href: i.href,
      label: collapsed ? '' : i.label,
      icon: i.icon,
      title: i.label,
    }));
    blocks.push(
      <NavList
        key={`nav-${g.group}`}
        activeUrl={pathname}
        items={items.map((it) => ({
          ...it,
          label: it.label || undefined,
        }))}
        className={collapsed ? '[&_span]:hidden [&_a]:justify-center [&_a]:px-0' : ''}
      />
    );
    void gi;
  });
  return (
    <nav className="flex-1 overflow-y-auto pb-4">
      {blocks}
      <div className={cn('mt-5 pt-4 border-t border-border-tertiary', collapsed ? 'px-1 flex justify-center' : 'px-6')}>
        <a
          href="https://muzzamilhassan.github.io/quarrystudio/dashboard.html"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 text-[12px] text-fg-quaternary hover:text-fg-secondary transition-colors"
          title="TikTok dashboard"
        >
          <ExternalLink size={13} />
          {!collapsed ? 'TikTok dashboard' : null}
        </a>
      </div>
    </nav>
  );
}

function Brand({ collapsed }) {
  return (
    <Link href="/" className="flex items-center gap-3 px-6 h-[64px] shrink-0">
      <span
        className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
        style={{ background: 'linear-gradient(135deg, var(--brand-600, #7f56d9), color-mix(in srgb, var(--brand-500, #9e77ed) 70%, #22d3ee))' }}
      >
        <Pickaxe size={16} color="#fff" strokeWidth={2.4} />
      </span>
      {!collapsed ? (
        <span className="min-w-0">
          <span className="block font-display font-semibold text-[15px] tracking-tight text-fg-primary leading-none">Quarry Studio</span>
          <span className="block text-[10.5px] text-fg-quaternary mt-0.5">Command Center</span>
        </span>
      ) : null}
    </Link>
  );
}

export default function AppShell({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

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

  // Bare pages — no sidebar, no topbar: login, the public /proof sales page,
  // and the DFY client workspace (it has its own minimal chrome).
  if (pathname === '/login' || pathname === '/proof' || pathname === '/client') return <>{children}</>;

  const logout = async () => {
    setLoggingOut(true);
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch {}
    router.replace('/login');
  };

  const current = NAV.flatMap((g) => g.items).find((i) => i.href === pathname);
  const pageTitle = current ? current.label : 'Quarry Studio';

  const sidebarInner = (collapsedState, isMobile = false) => (
    <>
      <Brand collapsed={collapsedState && !isMobile} />
      <NavGroups collapsed={collapsedState && !isMobile} onNavigate={() => setMobileOpen(false)} />
      <div className={cn('p-3 border-t border-border-tertiary shrink-0', collapsedState && !isMobile ? 'flex flex-col items-center gap-2' : 'flex items-center justify-between')}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full pulse-dot" style={{ background: 'var(--color-success-500, #12b76a)' }} />
          {!collapsedState || isMobile ? (
            <span className="text-[11px] text-fg-tertiary truncate">
              Engine connected <span className="text-fg-quaternary">· 16 brands</span>
            </span>
          ) : null}
        </div>
        {!isMobile ? (
          <ButtonUtility
            size="xs"
            color="tertiary"
            tooltip={collapsedState ? 'Expand sidebar' : 'Collapse sidebar'}
            icon={collapsedState ? ChevronsRight : ChevronsLeft}
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsedState ? 'Expand sidebar' : 'Collapse sidebar'}
          />
        ) : null}
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-bg-primary">
      {/* desktop sidebar */}
      <aside
        className="hidden lg:flex flex-col sticky top-0 h-screen shrink-0 z-30 border-r border-border-secondary bg-bg-secondary transition-all duration-200"
        style={{ width: collapsed ? 68 : 248 }}
      >
        {sidebarInner(collapsed)}
      </aside>

      {/* mobile drawer */}
      {mobileOpen ? (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[250px] bg-bg-primary border-r border-border-secondary flex flex-col pop-in">
            <button className="absolute top-4 right-3 z-10" style={{ width: 28, height: 28 }} onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <X size={15} className="text-fg-tertiary" />
            </button>
            {sidebarInner(false, true)}
          </aside>
        </div>
      ) : null}

      {/* main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-40 h-[64px] border-b border-border-secondary backdrop-blur-xl bg-bg-primary/85">
          <div className="h-full px-4 md:px-7 flex items-center gap-3">
            <button className="lg:hidden icon-btn" onClick={() => setMobileOpen(true)} aria-label="Open menu">
              <Menu size={16} />
            </button>

            <div className="hidden md:flex items-center gap-2 text-[13px] min-w-0">
              <Activity size={13} className="text-fg-quaternary" />
              <span className="text-fg-quaternary">Quarry Studio</span>
              <span className="text-fg-quaternary">/</span>
              <span className="font-semibold text-fg-primary truncate">{pageTitle}</span>
            </div>

            <div className="flex-1" />

            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden sm:flex items-center gap-2 h-9 pl-3 pr-2 rounded-lg border border-border-secondary bg-bg-primary text-fg-quaternary hover:border-border-primary hover:text-fg-tertiary transition-colors"
              style={{ width: 220 }}
            >
              <Search size={14} />
              <span className="text-[12.5px]">Search or run…</span>
              <span className="ml-auto font-mono text-[10.5px] text-fg-quaternary border border-border-tertiary rounded px-1 py-px">⌘K</span>
            </button>
            <button className="sm:hidden icon-btn" onClick={() => setPaletteOpen(true)} aria-label="Search">
              <Search size={15.5} />
            </button>

            <span className="hidden md:inline-flex">
              <BadgeWithIcon color="success" size="sm" icon={<span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: 'currentColor' }} />}>
                Engine live
              </BadgeWithIcon>
            </span>

            <div className="relative">
              <ButtonUtility
                size="sm"
                color="tertiary"
                tooltip="Alerts"
                icon={Bell}
                onClick={() => setNotifOpen((o) => !o)}
                aria-label="Alerts"
              />
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[9.5px] font-bold flex items-center justify-center bg-error-solid text-white pointer-events-none">
                {ALERTS.length}
              </span>
              <Notifications open={notifOpen} onClose={() => setNotifOpen(false)} />
            </div>

            <ThemeToggle />

            <div className="relative">
              <button
                className="flex items-center justify-center w-8 h-8 rounded-full font-display font-semibold text-[12px] shrink-0 cursor-pointer transition-transform hover:scale-105 border border-border-primary bg-brand-primary text-white"
                onClick={() => setUserOpen((o) => !o)}
                aria-label="Account menu"
                title="Muzzamil — owner"
              >
                MH
              </button>
              {userOpen ? (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserOpen(false)} />
                  <div className="absolute right-0 top-[calc(100%+10px)] w-[220px] rounded-xl border border-border-secondary bg-bg-primary shadow-xl overflow-hidden z-50 pop-in">
                    <div className="px-4 py-3 border-b border-border-tertiary">
                      <p className="text-[12.5px] font-semibold text-fg-primary">Muzzamil Hassan</p>
                      <p className="text-[11px] text-fg-quaternary mt-0.5">Studio owner · trusted 30 days</p>
                    </div>
                    <button
                      onClick={logout}
                      disabled={loggingOut}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[12.5px] font-semibold transition-colors hover:bg-bg-secondary disabled:opacity-50 text-error-primary"
                    >
                      <LogOut size={14} />
                      {loggingOut ? 'Signing out…' : 'Log out'}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </header>

        <main className="relative w-full px-4 md:px-7 py-6 md:py-8 max-w-[1200px] mx-auto">
          <div key={pathname} className="fade-up">
            {children}
          </div>
          <footer className="mt-14 pb-6 flex items-center justify-between text-[11px] text-fg-quaternary">
            <span>Quarry Studio · runs on GitHub Actions · nothing lives on this PC</span>
            <span className="font-mono">v3.0 · Untitled UI</span>
          </footer>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
