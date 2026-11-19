'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  Search,
  Sun,
  Moon,
  Play,
  LayoutDashboard,
  Clapperboard,
  Film,
  TrendingUp,
  Tv,
  Share2,
  Music,
  ScrollText,
  SquareKanban,
  Settings,
  CornerDownLeft,
} from 'lucide-react';
import { ALL_NAV_ITEMS } from './nav';
import { cn } from '@/lib/utils';

const PAGE_ICONS = {
  '/': LayoutDashboard,
  '/production': Clapperboard,
  '/videos': Film,
  '/analytics': TrendingUp,
  '/channels': Tv,
  '/social': Share2,
  '/music': Music,
  '/logs': ScrollText,
  '/tasks': SquareKanban,
  '/settings': Settings,
};

// Network-level runs — no per-channel slug. The retired 'tiktok' entry is
// gone: the workflow was deleted and /api/action answers it with a clean
// 400 'workflow retired', so the button could only ever fail.
const NETWORK_RUN_ACTIONS = [
  { id: 'run-fb', label: 'Run FB reels cross-post', action: 'fb-crosspost' },
  { id: 'run-ig', label: 'Run IG reels cross-post', action: 'ig-crosspost' },
  { id: 'run-posters', label: 'Run FB brand posters', action: 'fb-images' },
];

export default function CommandPalette({ open, onClose }) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const [chans, setChans] = useState(null); // null = not loaded yet
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  // T4d (#106): one run entry per registry channel, labeled by the registry
  // label — the dispatch route accepts every channel (T1a), so the palette
  // no longer hardcodes the legacy 4. Round 1: controlChannels (unfiltered
  // by the production filter) keeps a channel runnable even when its live
  // YouTube read errors — that is when a manual run is needed most.
  useEffect(() => {
    if (!open || chans) return;
    fetch('/api/overview')
      .then((r) => r.json())
      .then((d) => setChans((d?.controlChannels || d?.channels || []).map((c) => ({ slug: c.slug, label: c.label || c.slug }))))
      .catch(() => setChans([]));
  }, [open, chans]);

  const channelRuns = (chans || []).map((c) => ({
    kind: 'run',
    id: 'run-' + c.slug,
    label: armed === 'run-' + c.slug ? '↵ again to CONFIRM — Run ' + c.label + ' Shorts now' : 'Run ' + c.label + ' Shorts now',
    sub: 'Production action · starts in background',
    icon: Play,
    payload: { action: 'yt-daily', slug: c.slug },
  }));

  const channelJumps = (chans || []).map((c) => ({
    kind: 'channel',
    id: 'channel-' + c.slug,
    label: 'Channel: ' + c.label,
    sub: `Inspect ${c.label} in Network`,
    icon: Tv,
    run: () => router.push(`/channels#${c.slug}`),
  }));

  const items = [
    ...ALL_NAV_ITEMS.map((n) => ({
      kind: 'page',
      id: n.href,
      label: n.label,
      sub: n.desc,
      icon: PAGE_ICONS[n.href] || LayoutDashboard,
      run: () => router.push(n.href),
    })),
    ...channelJumps,
    ...channelRuns,
    ...NETWORK_RUN_ACTIONS.map((a) => ({
      kind: 'run',
      id: a.id,
      label: a.label,
      sub: 'Production action · starts in background',
      icon: Play,
      payload: { action: a.action },
    })),
    {
      kind: 'theme',
      id: 'theme',
      label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
      sub: 'Appearance',
      icon: theme === 'dark' ? Sun : Moon,
      run: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    },
  ].filter((i) => i.label.toLowerCase().includes(q.toLowerCase()));

// P0-13: production runs need a second-Enter confirm, an inline result, and
// navigation only on success.
const [armed, setArmed] = useState(null);
const [note, setNote] = useState('');

  const pick = (i) => {
    const it = items[i];
    if (!it) return;
    if (it.kind === 'run' && armed !== it.id) {
      setArmed(it.id);
      setNote('Press ↵ again to confirm — ' + it.label);
      return;
    }
    if (it.kind === 'run') {
      setNote('Starting…');
      fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(it.payload),
      })
        .then(async (r) => {
          const d = await r.json().catch(() => ({}));
          if (!r.ok || d.error) { setNote('Failed: ' + (d.error || 'HTTP ' + r.status) + ' — nothing was started'); setArmed(null); return; }
          setNote('Started ✓');
          onClose();
        })
        .catch(() => { setNote('Failed: network error — nothing was started'); setArmed(null); });
      return;
    }
    onClose();
    it.run();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[3px]" onClick={onClose} />
      <div
        className="absolute left-1/2 top-[16%] -translate-x-1/2 w-[92vw] max-w-xl card pop-in overflow-hidden"
        style={{ boxShadow: '0 24px 70px rgba(0,0,0,0.45)' }}
      >
        <div className="flex items-center gap-3 px-4 h-14 border-b border-line">
          <Search size={17} className="text-faint shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(items.length - 1, i + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
              if (e.key === 'Enter') { e.preventDefault(); pick(idx); }
              if (e.key === 'Escape') { if (armed) { setArmed(null); setNote(''); } else onClose(); }
            }}
            placeholder="Search pages and actions…"
            className="flex-1 bg-transparent outline-none text-sm text-ink placeholder:text-faint"
          />
          <span className="kbd">ESC</span>
        </div>
        {note ? (
          <p className="px-4 py-2 t-11 border-b border-line text-muted" role="status">{note}</p>
        ) : null}
        <div className="max-h-[46vh] overflow-y-auto py-2">
          {items.length === 0 ? (
            <p className="text-xs text-faint px-4 py-6 text-center">Nothing found for “{q}”</p>
          ) : (
            items.map((it, i) => {
              const Icon = it.icon;
              return (
                <button
                  key={it.id}
                  onMouseEnter={() => setIdx(i)}
                  onClick={() => pick(i)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                    i === idx ? 'bg-surface-2' : 'bg-transparent'
                  )}
                >
                  <span
                    className="flex items-center justify-center w-7 h-7 rounded-lg shrink-0"
                    style={{
                      background: it.kind === 'run' ? 'color-mix(in srgb, var(--ok) 12%, transparent)' : 'var(--accent-soft)',
                      color: it.kind === 'run' ? 'var(--ok)' : 'var(--accent)',
                    }}
                  >
                    <Icon size={14} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block t-13 font-semibold text-ink truncate">{it.label}</span>
                    <span className="block t-11 text-faint truncate">{it.sub}</span>
                  </span>
                  {i === idx ? <CornerDownLeft size={13} className="text-faint shrink-0" /> : null}
                </button>
              );
            })
          )}
        </div>
        <div className="flex items-center gap-3 px-4 h-9 border-t border-line t-10 text-faint">
          <span className="flex items-center gap-1"><span className="kbd">↑</span><span className="kbd">↓</span> move</span>
          <span className="flex items-center gap-1"><span className="kbd">↵</span> run</span>
          <span className="ml-auto">Quarry Studio command</span>
        </div>
      </div>
    </div>
  );
}
