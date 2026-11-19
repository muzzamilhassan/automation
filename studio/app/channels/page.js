'use client';
// Channels list — Round 2 redesign: compact, scannable cards (mark, name,
// niche, real health, 4 key facts) with ONE action row: "Open channel" and a
// "Manage" menu. Every manage feature opens in a Drawer (ChannelDrawers) —
// nothing expands inline inside a card any more.
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Tv, RefreshCw, Mic, Music, Clock, Archive, Plus, PenLine, Pause, Play, KeyRound, Link2,
  ArrowRight, ChevronDown, AlertTriangle, Settings2,
} from 'lucide-react';
import { Card, CardHead, Chip, PageHeader, BrandMark, PageSkeleton, EmptyState } from '@/components/ui';
import ChannelDrawers, { CHANNEL_DRAWERS } from '@/components/ChannelDrawers';
import { useConfirm } from '@/components/ConfirmDialog';
import { MUSIC_MOODS } from '@/lib/site-data';
import { useBrands } from '@/components/use-brands'; // #125: live brand marks
import { channelHealth, levelTone, validSlots, slotDate, channelHref, editHref } from '@/lib/channel-health.mjs';
import { fmt } from '@/lib/utils';

function localTime(hhmm) {
  const d = slotDate(hhmm, new Date());
  return d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
}

function Fact({ icon: Icon, label, children }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 overline mb-1">
        <Icon size={11} aria-hidden /> {label}
      </dt>
      <dd className="t-12 text-ink min-w-0">{children}</dd>
    </div>
  );
}

// Linked accounts in one line each — only numbers the platforms returned.
function accountLines(c) {
  const out = [];
  if (c.yt && !c.yt.error) out.push({ key: 'yt', text: `YouTube · ${fmt(c.yt.subs)} subs`, tone: 'ink' });
  else if (c.yt?.error) out.push({ key: 'yt', text: 'YouTube · re-connect needed', tone: 'bad', title: String(c.yt.error) });
  if (c.fb) out.push({ key: 'fb', text: `Facebook · ${fmt(c.fb.followers)} followers`, tone: 'ink' });
  if (c.ig) out.push({ key: 'ig', text: `Instagram · ${fmt(c.ig.followers)} followers`, tone: 'ink' });
  return out;
}

// "Manage" menu: one button per card instead of six icon buttons. Each item
// opens a Drawer, the edit wizard, or pauses/resumes (confirmed first).
function ManageMenu({ label, items }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!menuRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => menuRef.current?.querySelector('[role="menuitem"]')?.focus(), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // arrow keys move between items; Tab leaves the menu and closes it
  const onMenuKey = (e) => {
    const els = [...(menuRef.current?.querySelectorAll('[role="menuitem"]') || [])];
    const i = els.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); els[(i + 1) % els.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); els[(i - 1 + els.length) % els.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); els[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); els[els.length - 1]?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
  };

  // focus goes back to the Manage button BEFORE the drawer/confirm opens, so
  // closing them returns focus to a real, still-mounted element
  const pick = (fn) => () => {
    btnRef.current?.focus();
    setOpen(false);
    fn();
  };

  const itemCls = 'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md t-13 text-ink text-left hover:bg-surface-2 focus:bg-surface-2 outline-none';
  return (
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        className="btn btn-outline btn-sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Manage ${label}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Settings2 size={13} aria-hidden /> Manage <ChevronDown size={13} aria-hidden />
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={`Manage ${label}`}
          onKeyDown={onMenuKey}
          className="absolute right-0 bottom-full mb-1.5 z-30 w-60 max-w-[calc(100vw-2rem)] card p-1.5 shadow-xl pop-in"
        >
          {items.map((it) =>
            it.divider ? (
              <div key={it.key} role="separator" className="my-1 border-t border-[var(--line)]" />
            ) : it.href ? (
              <Link key={it.key} href={it.href} role="menuitem" className={itemCls} onClick={() => setOpen(false)}>
                <it.icon size={15} className="text-muted shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">{it.label}</span>
              </Link>
            ) : (
              <button key={it.key} type="button" role="menuitem" className={itemCls} onClick={pick(it.onSelect)}>
                <it.icon size={15} className="text-muted shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">{it.label}</span>
              </button>
            )
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function Channels() {
  const { bySlug: BRAND } = useBrands(); // #125: live short/accent per slug
  const confirm = useConfirm();

  const [data, setData] = useState(null);
  // one drawer at a time: { slug, label, which } — which ∈ CHANNEL_DRAWERS keys
  const [drawer, setDrawer] = useState(null);
  const closeDrawer = useCallback(() => setDrawer(null), []); // stable: Drawer re-focuses when onClose changes
  const [highlight] = useState(() =>
    typeof window !== 'undefined' ? window.location.hash.replace('#', '') : ''
  ); // P0-17: /channels#slug deep-link
  useEffect(() => {
    if (!highlight) return;
    const t = setTimeout(() => {
      document.getElementById('chan-' + highlight)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 600);
    return () => clearTimeout(t);
  }, [highlight, data]);
  const [flowMsg, setFlowMsg] = useState(null); // { tone, text } — pause/resume result
  // a failed load is shown as an error with Retry — never as "0 channels"
  const load = (fresh = false) =>
    fetch(fresh ? '/api/overview?fresh=1' : '/api/overview')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setData(Array.isArray(d?.channels) ? d : { error: true, channels: [] }))
      .catch(() => setData({ error: true, channels: [] }));

  // 10-08 FLOW CONTROL — per-channel autopilot ON/OFF
  // admin-panel review #5: check the result, say what happened, and reload
  // FRESH data (the overview is cached 60s, so a working pause looked stuck).
  const toggleFlow = async (slug, label, currentlyPaused) => {
    const on = Boolean(currentlyPaused);
    const ok = await confirm(on
      ? { title: `Resume ${label}?`, body: 'The next daily run produces new videos again.', confirmLabel: 'Resume autopilot', tone: 'primary' }
      : { title: `Pause ${label}?`, body: 'Nothing new will be made. Videos already scheduled on YouTube still publish.', confirmLabel: 'Pause autopilot', tone: 'danger' });
    if (!ok) return;
    setFlowMsg(null);
    try {
      const r = await fetch('/api/channels/flow', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, on }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setFlowMsg({ tone: 'bad', text: `${label}: ${on ? 'resume' : 'pause'} failed — ${d.error || `HTTP ${r.status}`}` });
      } else {
        setFlowMsg({ tone: 'ok', text: `${label}: autopilot ${on ? 'resumed' : 'paused'}` });
      }
    } catch (e) {
      setFlowMsg({ tone: 'bad', text: `${label}: ${String(e.message || e)}` });
    }
    load(true);
  };
  useEffect(() => {
    load();
  }, []);

  if (!data) return <PageSkeleton />;

  const header = (sub) => (
    <PageHeader icon={Tv} title="Channels" sub={sub}>
      <Link href="/channels/add" className="btn btn-primary"><Plus size={16} aria-hidden /> New channel</Link>
      <button type="button" className="btn btn-outline" onClick={() => load(true)}><RefreshCw size={16} aria-hidden /> Refresh</button>
    </PageHeader>
  );

  if (data.error) {
    return (
      <div>
        {header('Every channel and its accounts in one place')}
        <Card className="p-5">
          <EmptyState icon={AlertTriangle} title="Couldn't load your channels right now" sub="The channel data didn't arrive, so their status is unknown right now." />
          <div className="flex justify-center">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => { setData(null); load(true); }}>
              <RefreshCw size={14} aria-hidden /> Retry
            </button>
          </div>
        </Card>
      </div>
    );
  }

  const active = data.channels.filter((c) => c.active);
  const parked = data.channels.filter((c) => !c.active);
  const now = new Date();

  return (
    <div>
      {header(`${active.length} live channel${active.length === 1 ? '' : 's'}${parked.length ? ` · ${parked.length} parked` : ''} · every platform account in one place`)}

      {flowMsg ? (
        <div role="status" aria-live="polite" className="t-12 mb-3" style={{ color: flowMsg.tone === 'bad' ? 'var(--bad-ink)' : 'var(--ok-ink)' }}>
          {flowMsg.text}
        </div>
      ) : null}

      {active.length === 0 ? (
        <Card className="p-5">
          <EmptyState icon={Tv} title="No live channels yet" sub="Add your first channel and the studio starts producing for it." />
          <div className="flex justify-center">
            <Link href="/channels/add" className="btn btn-primary btn-sm"><Plus size={14} aria-hidden /> New channel</Link>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
          {active.map((c) => {
            const label = c.label || c.slug;
            const moods = MUSIC_MOODS[c.slug] || [];
            const health = channelHealth(c, { now });
            const slots = validSlots(c.slots);
            const longSlot = validSlots([c.longSlot])[0] || null;
            const accounts = accountLines(c);
            const firstReason = health.level !== 'ok' ? health.reasons[0] : null;
            const reasonInk = health.level === 'bad' ? 'var(--bad-ink)' : health.level === 'warn' ? 'var(--warn-ink)' : 'var(--muted)';
            const openDrawer = (which) => () => setDrawer({ slug: c.slug, label, which });
            const items = [
              ...Object.entries(CHANNEL_DRAWERS).map(([which, d]) => ({ key: which, label: d.label, icon: d.icon, onSelect: openDrawer(which) })),
              { key: 'edit', label: 'Edit profile', icon: PenLine, href: editHref(c.slug) },
              { key: 'div', divider: true },
              c.flowPaused
                ? { key: 'flow', label: 'Resume autopilot', icon: Play, onSelect: () => toggleFlow(c.slug, label, true) }
                : { key: 'flow', label: 'Pause autopilot', icon: Pause, onSelect: () => toggleFlow(c.slug, label, false) },
            ];
            return (
              <Card
                key={c.slug}
                id={'chan-' + c.slug}
                className={'p-5 scroll-mt-24 min-w-0 flex flex-col @container' + (highlight === c.slug ? ' ring-2 ring-[var(--accent)]' : '')}
              >
                {/* identity + health */}
                <div className="flex items-start gap-3 min-w-0">
                  <BrandMark short={BRAND[c.slug]?.short || '•'} accent={c.accent || 'var(--accent)'} size={40} />
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display t-16 font-bold tracking-tight text-ink truncate" title={label}>
                      <Link href={channelHref(c.slug)} className="hover:underline underline-offset-2">{label}</Link>
                    </h2>
                    <p className="t-12 text-muted line-clamp-2 break-words" title={c.niche || undefined}>{c.niche || 'No niche set'}</p>
                  </div>
                  <Chip tone={levelTone(health.level)} dot className="shrink-0">{health.label}</Chip>
                </div>

                {firstReason ? (
                  <p className="t-12 mt-3 flex items-start gap-1.5 min-w-0" style={{ color: reasonInk }}>
                    <AlertTriangle size={13} className="shrink-0 mt-0.5" aria-hidden />
                    <span className="min-w-0 line-clamp-2">{firstReason}</span>
                  </p>
                ) : null}

                {/* key facts */}
                <dl className="grid grid-cols-1 @xs:grid-cols-2 gap-x-4 gap-y-3 mt-4">
                  <Fact icon={Mic} label="Voice">
                    <span className="block font-mono truncate" title={c.voice || undefined}>{c.voice || 'Default voice'}</span>
                  </Fact>
                  <Fact icon={Music} label="Music mood">
                    <span className="block truncate">{moods.length ? moods.join(' · ') : <span className="text-faint">Not set</span>}</span>
                  </Fact>
                  <Fact icon={Clock} label="Upload slots">
                    {slots.length || longSlot ? (
                      <>
                        <span className="block tnum truncate">
                          {[...slots, ...(longSlot ? [`${longSlot} long`] : [])].join(' · ')} UTC
                        </span>
                        <span className="block t-11 text-faint tnum truncate">
                          {[...slots, ...(longSlot ? [longSlot] : [])].map(localTime).filter(Boolean).join(' · ')} your time
                        </span>
                      </>
                    ) : (
                      <span className="text-faint">No slot set</span>
                    )}
                  </Fact>
                  <Fact icon={Link2} label="Accounts">
                    {accounts.length ? (
                      accounts.map((a) => (
                        <span
                          key={a.key}
                          className="block truncate tnum"
                          title={a.title}
                          style={a.tone === 'bad' ? { color: 'var(--bad-ink)' } : undefined}
                        >
                          {a.text}
                        </span>
                      ))
                    ) : (
                      <span className="text-faint">No accounts linked yet</span>
                    )}
                  </Fact>
                </dl>

                {/* one action row */}
                <div className="flex-1" />
                <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-4 border-t border-[var(--line)]">
                  <Link href={channelHref(c.slug)} className="btn btn-primary btn-sm">
                    Open channel <ArrowRight size={13} aria-hidden />
                  </Link>
                  <ManageMenu label={label} items={items} />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* parked brands — hidden when there are none */}
      {parked.length ? (
        <Card className="mt-5">
          <CardHead title="Parked brands" sub="Not producing yet — pre-load their API keys before they wake up" icon={Archive} />
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 px-4 pb-4">
            {parked.map((c) => (
              <button
                key={c.slug}
                type="button"
                onClick={() => setDrawer({ slug: c.slug, label: c.label || c.slug, which: 'keys' })}
                aria-label={`API keys for ${c.label || c.slug}`}
                className="inset-tile p-3 flex items-center gap-2.5 text-left hover:bg-surface-2 transition-colors min-w-0"
              >
                <BrandMark short={BRAND[c.slug]?.short || '•'} accent={c.accent || 'var(--faint)'} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block t-12 font-semibold text-ink truncate">{c.label || c.slug}</span>
                  <span className="block t-11 text-faint truncate">{c.niche || '—'}</span>
                </span>
                <span className="t-11 text-muted flex items-center gap-1 shrink-0"><KeyRound size={12} aria-hidden /> Keys</span>
              </button>
            ))}
          </div>
        </Card>
      ) : null}

      <ChannelDrawers slug={drawer?.slug} label={drawer?.label} open={drawer?.which} onClose={closeDrawer} />
    </div>
  );
}
