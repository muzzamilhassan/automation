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

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = theme !== 'light';
  return (
    <button
      className="icon-btn"
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Light theme' : 'Dark theme'}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      {mounted && !dark ? <Sun size={15.5} /> : <Moon size={15.5} />}
    </button>
  );
}

function Notifications({ open, onClose }) {
  if (!open) return null;
  const ICONS = { bad: OctagonAlert, warn: AlertTriangle, info: Info };
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-[calc(100%+10px)] w-[340px] card pop-in overflow-hidden z-50" style={{ boxShadow: '0 18px 50px rgba(0,0,0,0.35)' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <span className="section-title">Alerts</span>
          <span className="chip chip-warn">{ALERTS.length} open</span>
        </div>
        <div className="max-h-[320px] overflow-y-auto">
          {ALERTS.map((a) => {
            const Icon = ICONS[a.level] || Info;
            const color = a.level === 'bad' ? 'var(--bad)' : a.level === 'warn' ? 'var(--warn)' : 'var(--info)';
            return (
              <Link key={a.title} href={a.href} onClick={onClose} className="flex gap-3 px-4 py-3 border-b border-line last:border-0 hover:bg-surface-2 transition-colors">
                <Icon size={15} className="shrink-0 mt-0.5" style={{ color }} />
                <span>
                  <span className="block text-[12.5px] font-semibold text-ink">{a.title}</span>
                  <span className="block text-[11.5px] text-muted mt-0.5 leading-snug">{a.body}</span>
                  <span className="block text-[10.5px] text-faint mt-1 font-mono">{a.when}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}

function NavList({ collapsed, onNavigate }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 overflow-y-auto px-[9px] pb-4">
      {NAV.map((g) => (
        <div key={g.group}>
          {!collapsed ? <div className="nav-label">{g.group}</div> : <div className="mx-3 my-3 border-t border-line" />}
          <div className="space-y-0.5">
            {g.items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  title={collapsed ? item.label : undefined}
                  className={cn('nav-item', active && 'active', collapsed && 'justify-center px-0')}
                >
                  <Icon size={16.5} strokeWidth={2.1} className={cn(active && 'text-accent')} />
                  {!collapsed ? <span className="truncate">{item.label}</span> : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
      <div className={cn('mt-5 pt-4 border-t border-line', collapsed ? 'px-1 flex justify-center' : 'px-[11px]')}>
        <a
          href="https://muzzamilhassan.github.io/quarrystudio/dashboard.html"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 text-[12px] text-faint hover:text-muted transition-colors"
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
    <Link href="/" className="flex items-center gap-3 px-3 h-[60px] shrink-0" onClick={() => {}}>
      <span
        className="flex items-center justify-center w-8 h-8 rounded-xl shrink-0"
        style={{ background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #22d3ee))' }}
      >
        <Pickaxe size={16} color="var(--accent-ink)" strokeWidth={2.4} />
      </span>
      {!collapsed ? (
        <span className="min-w-0">
          <span className="block font-display font-bold text-[15px] tracking-tight text-ink leading-none">Quarry Studio</span>
          <span className="block text-[10.5px] text-faint mt-0.5">Command Center</span>
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
  const pageTitle = current ? current.label : pathname === '/channels' ? 'Channels' : 'Quarry Studio';

  const sidebarInner = (collapsed, isMobile = false) => (
    <>
      <Brand collapsed={collapsed && !isMobile} />
      <NavList collapsed={collapsed && !isMobile} onNavigate={() => setMobileOpen(false)} />
      <div className={cn('p-3 border-t border-line shrink-0', collapsed && !isMobile ? 'flex flex-col items-center gap-2' : 'flex items-center justify-between')}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full pulse-dot" style={{ background: 'var(--ok)' }} />
          {!collapsed || isMobile ? (
            <span className="text-[11px] text-muted truncate">
              Engine connected <span className="text-faint">· 16 brands</span>
            </span>
          ) : null}
        </div>
        {!isMobile ? (
          <button
            className="icon-btn btn-sm"
            style={{ width: 26, height: 26, borderRadius: 8 }}
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronsRight size={13} /> : <ChevronsLeft size={13} />}
          </button>
        ) : null}
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-bg">
      {/* desktop sidebar */}
      <aside
        className="hidden lg:flex flex-col sticky top-0 h-screen shrink-0 z-30 border-r border-line bg-bg-soft transition-all duration-200"
        style={{ width: collapsed ? 68 : 240 }}
      >
        {sidebarInner(collapsed)}
      </aside>

      {/* mobile drawer */}
      {mobileOpen ? (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[248px] bg-bg-soft border-r border-line flex flex-col pop-in">
            <button className="absolute top-4 right-3 icon-btn" style={{ width: 28, height: 28 }} onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <X size={15} />
            </button>
            {sidebarInner(false, true)}
          </aside>
        </div>
      ) : null}

      {/* main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-40 h-[60px] border-b border-line backdrop-blur-xl" style={{ background: 'color-mix(in srgb, var(--bg) 82%, transparent)' }}>
          <div className="h-full px-4 md:px-7 flex items-center gap-3">
            <button className="icon-btn lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
              <Menu size={16} />
            </button>

            <div className="hidden md:flex items-center gap-2 text-[13px] min-w-0">
              <Activity size={13} className="text-faint" />
              <span className="text-faint">Quarry Studio</span>
              <span className="text-faint">/</span>
              <span className="font-semibold text-ink truncate">{pageTitle}</span>
            </div>

            <div className="flex-1" />

            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden sm:flex items-center gap-2 h-9 pl-3 pr-2 rounded-xl border border-line bg-surface text-faint hover:border-line-strong hover:text-muted transition-colors"
              style={{ width: 220 }}
            >
              <Search size={14} />
              <span className="text-[12.5px]">Search or run…</span>
              <span className="ml-auto kbd">⌘K</span>
            </button>
            <button className="icon-btn sm:hidden" onClick={() => setPaletteOpen(true)} aria-label="Search">
              <Search size={15.5} />
            </button>

            <span className="hidden md:inline-flex chip chip-ok">
              <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: 'var(--ok)' }} />
              Engine live
            </span>

            <div className="relative">
              <button className="icon-btn relative" onClick={() => setNotifOpen((o) => !o)} aria-label="Alerts">
                <Bell size={15.5} />
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[9.5px] font-bold flex items-center justify-center" style={{ background: 'var(--bad)', color: '#fff' }}>
                  {ALERTS.length}
                </span>
              </button>
              <Notifications open={notifOpen} onClose={() => setNotifOpen(false)} />
            </div>

            <ThemeToggle />

            <div className="relative">
              <button
                className="flex items-center justify-center w-8 h-8 rounded-full font-display font-bold text-[12px] shrink-0 cursor-pointer transition-transform hover:scale-105"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)' }}
                onClick={() => setUserOpen((o) => !o)}
                aria-label="Account menu"
                title="Muzzamil — owner"
              >
                MH
              </button>
              {userOpen ? (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserOpen(false)} />
                  <div className="absolute right-0 top-[calc(100%+10px)] w-[220px] card pop-in overflow-hidden z-50" style={{ boxShadow: '0 18px 50px rgba(0,0,0,0.35)' }}>
                    <div className="px-4 py-3 border-b border-line">
                      <p className="text-[12.5px] font-semibold text-ink">Muzzamil Hassan</p>
                      <p className="text-[11px] text-faint mt-0.5">Studio owner · trusted 30 days</p>
                    </div>
                    <button
                      onClick={logout}
                      disabled={loggingOut}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[12.5px] font-semibold transition-colors hover:bg-surface-2 disabled:opacity-50"
                      style={{ color: 'var(--bad)' }}
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

        <main className="relative page-glow w-full px-4 md:px-7 py-6 md:py-8 max-w-[1200px] mx-auto">
          <div key={pathname} className="fade-up">
            {children}
          </div>
          <footer className="mt-14 pb-6 flex items-center justify-between text-[11px] text-faint">
            <span>Quarry Studio · runs on GitHub Actions · nothing lives on this PC</span>
            <span className="font-mono">v2.0</span>
          </footer>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
