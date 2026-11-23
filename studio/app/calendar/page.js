'use client';
// Calendar (owner-approved 2026-11-23) — every real channel on one calendar:
// published · scheduled · waiting (script to approve, or approved but not out
// yet) · free slot (an upcoming slot with nothing on it).
// Design round 2 (owner: "best calendar, real icons and colours"): real lucide
// icons per kind (KIND in CalendarDayDrawer), channel-coloured event pills,
// a summary bar that is also the legend + kind filter, today/weekend/past
// styling and a timeline List view.
// Data: /api/calendar (real records only; a source that failed is named).
// Times and days are on the viewer's own clock. Phones open on the List view.
// Three honest states: loading skeleton, error with Retry, empty period.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, RotateCw } from 'lucide-react';
import { Card, PageHeader, EmptyState, Skeleton, Segmented, BrandMark } from '@/components/ui';
import apiFetch from '@/components/shell/api-fetch';
import CalendarDayDrawer, { KIND, KIND_ORDER, kindOf, KindBadge, KindIcon, LaneTag, ItemAction, itemTitle } from '@/components/CalendarDayDrawer';
import { cn } from '@/lib/utils';
import { viewRange, shiftAnchor, groupByDay, localDayOf, LIST_DAYS } from '@/lib/calendar-view.mjs';

const VIEWS = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'list', label: 'List' },
];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const PHONE_MQ = '(max-width: 639px)';
const MAX_IN_CELL = 3;
const SOURCE_WORD = {
  registry: 'channel list',
  channel_state: 'recent uploads',
  episode_log: 'episode log',
  upload_intents: 'upload history',
  scripts: 'scripts',
  cadence: 'slot times (free slots hidden)',
};

// the viewer's today / phone width — read on the client only (server: null)
const noSubscribe = () => () => {};
function todayLocal() {
  const d = new Date();
  return localDayOf(d.toISOString(), -d.getTimezoneOffset());
}
function subscribePhone(cb) {
  const mq = window.matchMedia(PHONE_MQ);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
const isPhoneNow = () => window.matchMedia(PHONE_MQ).matches;

// an item's day on the viewer's clock (undated scripts keep their slot day)
const dayKey = (it) => (it.at ? localDayOf(it.at, -new Date(it.at).getTimezoneOffset()) : it.date);
const clock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const timeOf = (it) => (it.at ? clock.format(new Date(it.at)) : 'No time yet');
const shortTime = (it) => (it.at ? clock.format(new Date(it.at)).replace(/\s?([AP])M$/i, (_, p) => p.toLowerCase()) : '—');
// 'YYYY-MM-DD' is already the viewer's day: format it as a plain date
const dayDate = (d) => new Date(`${d}T12:00:00Z`);
const fmt = (d, opts) => new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', ...opts }).format(dayDate(d));
const isWeekend = (d) => [0, 6].includes(dayDate(d).getUTCDay());

function periodLabel(view, days, anchor) {
  if (view === 'month') return fmt(anchor, { month: 'long', year: 'numeric' });
  return `${fmt(days[0], { day: 'numeric', month: 'short' })} – ${fmt(days[days.length - 1], { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

/** One event in a month/week cell: channel-coloured pill, kind icon, time, title. */
function EventPill({ it, brand, showTitle = true }) {
  const b = brand(it.channel);
  const k = kindOf(it);
  const Icon = k.icon;
  const free = it.kind === 'free';
  return (
    <span
      className="flex items-center gap-1 min-w-0 rounded-md pl-1 pr-1.5 py-[3px] t-10 tnum leading-tight"
      style={
        free
          ? { border: '1px dashed var(--line-strong)', color: 'var(--faint)' }
          : { background: `color-mix(in srgb, ${b.accent} 13%, transparent)`, borderLeft: `3px solid ${b.accent}`, color: 'var(--ink)' }
      }
      title={`${timeOf(it)} · ${b.name} · ${k.word} — ${itemTitle(it)}`}
    >
      <Icon size={11} className="shrink-0" style={{ color: k.color }} aria-hidden />
      <span className="shrink-0 font-semibold">{shortTime(it)}</span>
      {showTitle ? <span className={cn('truncate', free ? '' : 'text-muted')}>{free ? b.short : itemTitle(it)}</span> : null}
    </span>
  );
}

function MonthCell({ d, inMonth, isToday, isPast, items, brand, onOpen }) {
  const shown = items.slice(0, MAX_IN_CELL);
  const more = items.length - shown.length;
  return (
    <button
      type="button"
      data-kit="tile"
      onClick={() => onOpen(d)}
      aria-label={`${fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}: ${items.length ? `${items.length} item${items.length === 1 ? '' : 's'}` : 'nothing'}`}
      className={cn(
        'group relative flex flex-col items-stretch gap-1 min-w-0 min-h-[68px] sm:min-h-[118px] p-1 sm:p-1.5 text-left border-r border-b border-line cursor-pointer transition-colors hover:bg-[var(--surface-2)] focus-visible:z-10',
        !inMonth && 'opacity-40',
        isPast && inMonth && !isToday && 'opacity-75',
      )}
      style={isToday ? { background: 'var(--accent-soft)' } : isWeekend(d) ? { background: 'color-mix(in srgb, var(--surface-2) 55%, transparent)' } : undefined}
    >
      <span className="flex items-center justify-between gap-1">
        <span
          className={cn('t-11 tnum font-bold inline-flex items-center justify-center rounded-full w-6 h-6', isToday ? '' : 'text-muted group-hover:text-ink')}
          style={isToday ? { background: 'var(--accent)', color: 'var(--accent-ink)' } : undefined}
        >
          {Number(d.slice(8))}
        </span>
        {isToday ? <span className="hidden sm:inline t-10 font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>Today</span> : null}
      </span>
      {/* phone: coloured kind icons only (no overflow) */}
      <span className="flex sm:hidden flex-wrap gap-0.5">
        {items.slice(0, 4).map((it, i) => {
          const k = kindOf(it);
          const Icon = k.icon;
          return <Icon key={i} size={12} style={{ color: it.kind === 'free' ? 'var(--faint)' : brand(it.channel).accent }} aria-hidden />;
        })}
        {items.length > 4 ? <span className="t-10 text-faint">+{items.length - 4}</span> : null}
      </span>
      {/* wider: channel-coloured event pills */}
      <span className="hidden sm:flex flex-col gap-[3px] min-w-0">
        {shown.map((it, i) => <EventPill key={i} it={it} brand={brand} />)}
        {more > 0 ? <span className="t-10 font-semibold text-faint pl-1">+{more} more</span> : null}
      </span>
    </button>
  );
}

/** Summary bar = legend + kind filter: icon, count, word. */
function KindSummary({ counts, hiddenKinds, onToggle }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Show kinds">
      {KIND_ORDER.map((kind) => {
        const k = KIND[kind];
        const Icon = k.icon;
        const on = !hiddenKinds.has(kind);
        return (
          <button
            key={kind}
            type="button"
            data-kit="tile"
            aria-pressed={on}
            onClick={() => onToggle(kind)}
            className={cn('inline-flex items-center gap-2 rounded-xl px-3 py-1.5 cursor-pointer transition-opacity', !on && 'opacity-40')}
            style={{ background: k.tint === 'transparent' ? 'var(--surface-2)' : k.tint, border: `1px ${kind === 'free' ? 'dashed' : 'solid'} ${k.edge}` }}
          >
            <Icon size={15} style={{ color: k.color }} aria-hidden />
            <span className="t-14 font-bold tnum text-ink">{counts[kind] || 0}</span>
            <span className="t-12 text-muted">{k.word}</span>
          </button>
        );
      })}
    </div>
  );
}

function AgendaRow({ it, brand, last }) {
  const b = brand(it.channel);
  return (
    <li className="relative flex items-start gap-3 py-2.5 min-w-0">
      {/* timeline rail */}
      {!last ? <span className="absolute left-[15px] top-[38px] bottom-[-10px] w-px bg-[var(--line)]" aria-hidden /> : null}
      <KindIcon it={it} size={30} />
      <div className="min-w-0 flex-1 flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1.5">
        <span className="t-12 tnum font-semibold text-ink w-16 shrink-0">{timeOf(it)}</span>
        <span className="min-w-0 flex-1 basis-48">
          <span className={cn('block t-13 font-semibold truncate', it.kind === 'free' ? 'text-faint' : 'text-ink')}>{itemTitle(it)}</span>
          <span className="flex items-center gap-1.5 mt-0.5 min-w-0">
            <BrandMark name={b.name} accent={b.accent} short={b.short} size={16} />
            <span className="t-11 text-muted truncate">{b.name}</span>
            <LaneTag it={it} />
          </span>
        </span>
        <KindBadge it={it} />
        <ItemAction it={it} />
      </div>
    </li>
  );
}

export default function CalendarPage() {
  const today = useSyncExternalStore(noSubscribe, todayLocal, () => null);
  const isPhone = useSyncExternalStore(subscribePhone, isPhoneNow, () => false);
  const [chosenView, setChosenView] = useState(null);
  const view = chosenView || (isPhone ? 'list' : 'month');
  const [pickedAnchor, setAnchor] = useState(null);
  const anchor = pickedAnchor || today;
  const [hidden, setHidden] = useState(() => new Set());
  const [hiddenKinds, setHiddenKinds] = useState(() => new Set());
  const [openDay, setOpenDay] = useState(null);
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState(null); // { key, data } | { key, err, denied }

  const range = useMemo(() => (anchor ? viewRange(view, anchor) : null), [view, anchor]);
  const from = range?.from;
  const to = range?.to;
  const key = from ? `${from}|${to}|${nonce}` : null;

  useEffect(() => {
    if (!from) return undefined;
    let alive = true;
    const k = `${from}|${to}|${nonce}`;
    apiFetch(`/api/calendar?from=${from}&to=${to}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (r.status === 403) {
          const e = new Error('The calendar is only for the owner and staff.');
          e.denied = true;
          throw e;
        }
        if (!r.ok || d.ok === false) throw new Error(d.error || `The server answered ${r.status}.`);
        if (alive) setResult({ key: k, data: d });
      })
      .catch((e) => {
        if (alive) setResult({ key: k, err: e.message || 'network error', denied: Boolean(e.denied) });
      });
    return () => {
      alive = false;
    };
  }, [from, to, nonce]);

  const current = result && result.key === key ? result : null;
  const data = current?.data || null;

  const brandMap = useMemo(() => {
    const m = {};
    for (const c of data?.channels || []) m[c.slug] = c;
    return m;
  }, [data]);
  const brand = (slug) => brandMap[slug] || { name: slug, accent: 'var(--muted)', short: String(slug).slice(0, 2).toUpperCase() };

  const days = useMemo(() => range?.days || [], [range]);
  const monthPrefix = anchor ? anchor.slice(0, 7) : '';
  const inPeriod = useMemo(() => (view === 'month' ? days.filter((d) => d.startsWith(monthPrefix)) : days), [view, days, monthPrefix]);

  // channel filter first (drives the kind counts), then kind filter (drives the grid)
  const byDayChannels = useMemo(
    () => groupByDay((data?.items || []).filter((it) => !hidden.has(it.channel)), dayKey),
    [data, hidden],
  );
  const kindCounts = useMemo(() => {
    const c = {};
    for (const d of inPeriod) for (const it of byDayChannels[d] || []) c[it.kind] = (c[it.kind] || 0) + 1;
    return c;
  }, [inPeriod, byDayChannels]);
  const channelCounts = useMemo(() => {
    const c = {};
    const all = groupByDay(data?.items || [], dayKey);
    for (const d of inPeriod) for (const it of all[d] || []) if (it.kind !== 'free') c[it.channel] = (c[it.channel] || 0) + 1;
    return c;
  }, [data, inPeriod]);
  const byDay = useMemo(() => {
    const out = {};
    for (const [d, list] of Object.entries(byDayChannels)) out[d] = list.filter((it) => !hiddenKinds.has(it.kind));
    return out;
  }, [byDayChannels, hiddenKinds]);

  const toggleIn = (setter) => (v) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  const toggle = toggleIn(setHidden);
  const toggleKind = toggleIn(setHiddenKinds);

  const count = inPeriod.reduce((n, d) => n + (byDay[d]?.length || 0), 0);
  const emptyText = view === 'month' ? 'Nothing on the calendar this month' : view === 'week' ? 'Nothing on the calendar this week' : `Nothing on the calendar in these ${LIST_DAYS} days`;
  const missing = (data?.partial || []).map((p) => SOURCE_WORD[p] || p);

  return (
    <div className="min-w-0">
      <PageHeader icon={CalendarDays} title="Calendar" sub="All channels · your time">
        <div className="flex items-center gap-1">
          <button type="button" className="icon-btn" aria-label="Previous" onClick={() => anchor && setAnchor(shiftAnchor(view, anchor, -1))} disabled={!anchor}>
            <ChevronLeft size={16} aria-hidden />
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setAnchor(null)}>
            Today
          </button>
          <button type="button" className="icon-btn" aria-label="Next" onClick={() => anchor && setAnchor(shiftAnchor(view, anchor, 1))} disabled={!anchor}>
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>
        <Segmented options={VIEWS} value={view} onChange={setChosenView} />
      </PageHeader>

      <h2 className="font-display t-16 font-bold text-ink mb-3">{anchor ? periodLabel(view, days, anchor) : ' '}</h2>

      {data ? (
        <div className="mb-3">
          <KindSummary counts={kindCounts} hiddenKinds={hiddenKinds} onToggle={toggleKind} />
        </div>
      ) : null}

      {data?.channels?.length ? (
        <div className="flex flex-wrap gap-1.5 mb-4" role="group" aria-label="Show channels">
          {data.channels.map((c) => {
            const on = !hidden.has(c.slug);
            return (
              <button
                key={c.slug}
                type="button"
                data-kit="tile"
                aria-pressed={on}
                onClick={() => toggle(c.slug)}
                className={cn('inline-flex items-center gap-1.5 max-w-full rounded-full pl-1 pr-2.5 py-1 cursor-pointer transition-opacity', !on && 'opacity-40')}
                style={{
                  background: on ? `color-mix(in srgb, ${c.accent} 10%, transparent)` : 'transparent',
                  border: `1px solid ${on ? `color-mix(in srgb, ${c.accent} 45%, transparent)` : 'var(--line)'}`,
                }}
              >
                <BrandMark name={c.name} accent={c.accent} short={c.short} size={20} />
                <span className="t-12 font-semibold text-ink truncate">{c.name}</span>
                {channelCounts[c.slug] ? <span className="t-11 tnum text-faint">{channelCounts[c.slug]}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {current?.err && current.denied ? (
        <Card className="p-6 text-center">
          <p className="t-14 font-semibold text-ink">The calendar isn&apos;t available for your account</p>
          <p className="t-12 text-faint mt-1">{current.err}</p>
        </Card>
      ) : current?.err ? (
        <Card className="p-6 text-center">
          <p className="t-14 font-semibold text-ink">Can&apos;t load the calendar right now.</p>
          <p className="t-12 text-faint mt-1">{current.err}</p>
          <button type="button" className="btn btn-outline mt-3" onClick={() => setNonce((n) => n + 1)}>
            <RotateCw size={13} aria-hidden /> Retry
          </button>
        </Card>
      ) : !data ? (
        <div aria-busy="true" aria-label="Loading the calendar">
          {view === 'month' ? (
            <div className="grid grid-cols-7 gap-1">
              {[...Array(35)].map((_, i) => <Skeleton key={i} className="h-16 sm:h-28 rounded-lg" />)}
            </div>
          ) : (
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
            </div>
          )}
        </div>
      ) : (
        <>
          {missing.length ? (
            <p className="t-12 mb-3" role="status" style={{ color: 'var(--warn-ink)' }}>
              Couldn&apos;t read: {missing.join(', ')}. The rest is shown.
            </p>
          ) : null}

          {!count ? (
            <Card>
              <EmptyState icon={CalendarDays} title={emptyText} />
            </Card>
          ) : view === 'month' ? (
            <Card className="overflow-hidden p-0">
              <div className="grid grid-cols-7 border-l border-t border-line">
                {WEEKDAYS.map((w, i) => (
                  <div key={w} className={cn('t-11 font-semibold uppercase tracking-wide text-center py-2 border-r border-b border-line min-w-0 truncate', i >= 5 ? 'text-faint' : 'text-muted')}>
                    {isPhone ? w.slice(0, 1) : w}
                  </div>
                ))}
                {days.map((d) => (
                  <MonthCell
                    key={d}
                    d={d}
                    inMonth={d.startsWith(monthPrefix)}
                    isToday={d === today}
                    isPast={Boolean(today) && d < today}
                    items={byDay[d] || []}
                    brand={brand}
                    onOpen={setOpenDay}
                  />
                ))}
              </div>
            </Card>
          ) : view === 'week' ? (
            <div className="grid gap-2 sm:grid-cols-7">
              {days.map((d) => {
                const list = byDay[d] || [];
                const isToday = d === today;
                return (
                  <Card key={d} className={cn('p-2 min-w-0 flex flex-col gap-1.5', isToday && 'ring-2 ring-[var(--accent)]')} style={isToday ? { background: 'var(--accent-soft)' } : undefined}>
                    <button type="button" className="btn btn-ghost btn-sm w-full justify-between px-1" onClick={() => setOpenDay(d)}>
                      <span className="t-11 font-semibold uppercase tracking-wide text-muted">{fmt(d, { weekday: 'short' })}</span>
                      <span
                        className="t-12 tnum font-bold inline-flex items-center justify-center rounded-full w-6 h-6"
                        style={isToday ? { background: 'var(--accent)', color: 'var(--accent-ink)' } : undefined}
                      >
                        {Number(d.slice(8))}
                      </span>
                    </button>
                    <div className="flex flex-col gap-1">
                      {list.map((it, i) => <EventPill key={i} it={it} brand={brand} />)}
                      {!list.length ? <span className="t-11 text-faint px-1">Nothing</span> : null}
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              {days.filter((d) => byDay[d]?.length).map((d) => (
                <Card key={d} className="px-4 py-3 min-w-0">
                  <h3 className="flex items-center gap-2 t-13 font-bold text-ink">
                    {d === today ? (
                      <span className="t-10 font-semibold uppercase tracking-wide rounded-full px-2 py-0.5" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>
                        Today
                      </span>
                    ) : null}
                    {fmt(d, { weekday: 'long', day: 'numeric', month: 'short' })}
                    <span className="t-11 font-normal text-faint tnum">· {byDay[d].length}</span>
                  </h3>
                  <ul className="mt-1">
                    {byDay[d].map((it, i) => <AgendaRow key={i} it={it} brand={brand} last={i === byDay[d].length - 1} />)}
                  </ul>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <CalendarDayDrawer
        open={Boolean(openDay)}
        onClose={() => setOpenDay(null)}
        title={openDay ? fmt(openDay, { weekday: 'long', day: 'numeric', month: 'long' }) : ''}
        items={openDay ? byDay[openDay] || [] : []}
        brand={brand}
        timeOf={timeOf}
      />
    </div>
  );
}
