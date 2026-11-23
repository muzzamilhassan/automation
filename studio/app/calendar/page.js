'use client';
// Calendar (owner-approved 2026-11-23) — every real channel on one calendar:
// ✓ published · ⏰ scheduled · 📝 waiting (script to approve, or approved but
// not out yet) · ░ free slot (an upcoming slot with nothing on it).
// Data: /api/calendar (real records only; a source that failed is named).
// Times and days are on the viewer's own clock. Phones open on the List view.
// Three honest states: loading skeleton, error with Retry, empty period.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, RotateCw } from 'lucide-react';
import { Card, Chip, PageHeader, EmptyState, Skeleton, Segmented, BrandMark } from '@/components/ui';
import apiFetch from '@/components/shell/api-fetch';
import CalendarDayDrawer, { KIND, ItemAction, itemTitle, waitingWord } from '@/components/CalendarDayDrawer';
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
// 'YYYY-MM-DD' is already the viewer's day: format it as a plain date
const dayDate = (d) => new Date(`${d}T12:00:00Z`);
const fmt = (d, opts) => new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', ...opts }).format(dayDate(d));

function periodLabel(view, days, anchor) {
  if (view === 'month') return fmt(anchor, { month: 'long', year: 'numeric' });
  return `${fmt(days[0], { day: 'numeric', month: 'short' })} – ${fmt(days[days.length - 1], { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

function Dot({ accent }) {
  return <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: accent }} aria-hidden />;
}

function MonthCell({ d, inMonth, isToday, items, brand, onOpen }) {
  const shown = items.slice(0, MAX_IN_CELL);
  const more = items.length - shown.length;
  return (
    <button
      type="button"
      onClick={() => onOpen(d)}
      aria-label={`${fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}: ${items.length ? `${items.length} item${items.length === 1 ? '' : 's'}` : 'nothing'}`}
      className={cn(
        'relative flex flex-col items-stretch gap-1 min-w-0 min-h-[64px] sm:min-h-[104px] p-1 sm:p-1.5 text-left border-r border-b border-line cursor-pointer transition-colors hover:bg-[var(--surface-2)]',
        !inMonth && 'opacity-45',
        isToday && 'ring-2 ring-inset ring-[var(--accent)]',
      )}
    >
      <span
        className={cn('t-11 tnum font-semibold w-5 h-5 inline-flex items-center justify-center rounded-full', isToday ? 'text-[var(--accent-ink)]' : 'text-muted')}
        style={isToday ? { background: 'var(--accent)' } : undefined}
      >
        {Number(d.slice(8))}
      </span>
      {/* phone: dots only (no overflow); wider: dot + glyph + time */}
      <span className="flex sm:hidden flex-wrap gap-0.5">
        {items.slice(0, 6).map((it, i) => <Dot key={i} accent={brand(it.channel).accent} />)}
      </span>
      <span className="hidden sm:flex flex-col gap-0.5 min-w-0">
        {shown.map((it, i) => (
          <span key={i} className={cn('flex items-center gap-1 min-w-0 t-10 tnum', it.kind === 'free' ? 'text-faint' : 'text-muted')}>
            <Dot accent={brand(it.channel).accent} />
            <span aria-hidden>{KIND[it.kind].glyph}</span>
            <span className="truncate">{it.at ? clock.format(new Date(it.at)) : brand(it.channel).short}</span>
          </span>
        ))}
        {more > 0 ? <span className="t-10 text-faint">+{more} more</span> : null}
      </span>
      {items.length > 6 ? <span className="sm:hidden t-10 text-faint">+{items.length - 6}</span> : null}
    </button>
  );
}

function AgendaRow({ it, brand }) {
  const b = brand(it.channel);
  const k = KIND[it.kind];
  return (
    <li className="flex items-center gap-3 py-2.5 min-w-0 flex-wrap sm:flex-nowrap">
      <span className="t-12 tnum text-muted w-16 shrink-0">{timeOf(it)}</span>
      <BrandMark name={b.name} accent={b.accent} short={b.short} size={22} />
      <span className="min-w-0 flex-1 basis-40">
        <span className={cn('block t-13 truncate', it.kind === 'free' ? 'text-faint' : 'text-ink')}>{itemTitle(it)}</span>
        <span className="block t-11 text-faint truncate">{b.name}</span>
      </span>
      <Chip tone={k.tone}>
        <span aria-hidden>{k.glyph}</span> {it.kind === 'waiting' ? waitingWord(it) : k.word}
      </Chip>
      <ItemAction it={it} />
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

  const byDay = useMemo(
    () => groupByDay((data?.items || []).filter((it) => !hidden.has(it.channel)), dayKey),
    [data, hidden],
  );

  const toggle = (slug) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

  const days = range?.days || [];
  const monthPrefix = anchor ? anchor.slice(0, 7) : '';
  const inPeriod = view === 'month' ? days.filter((d) => d.startsWith(monthPrefix)) : days;
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

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3 min-w-0">
        <h2 className="font-display t-16 font-bold text-ink">{anchor ? periodLabel(view, days, anchor) : ' '}</h2>
        <p className="t-11 text-faint">✓ Published · ⏰ Scheduled · 📝 Waiting · ░ Free</p>
      </div>

      {data?.channels?.length ? (
        <div className="flex flex-wrap gap-1.5 mb-4" role="group" aria-label="Show channels">
          {data.channels.map((c) => {
            const on = !hidden.has(c.slug);
            return (
              <button
                key={c.slug}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(c.slug)}
                className={cn('btn btn-outline btn-sm max-w-full', !on && 'opacity-50')}
                style={on ? { borderColor: `color-mix(in srgb, ${c.accent} 55%, transparent)` } : undefined}
              >
                <Dot accent={on ? c.accent : 'var(--faint)'} />
                <span className="truncate">{c.name}</span>
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
              {[...Array(35)].map((_, i) => <Skeleton key={i} className="h-16 sm:h-24 rounded-lg" />)}
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
            <Card className="overflow-hidden">
              <div className="grid grid-cols-7 border-l border-t border-line">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="t-11 font-semibold text-faint text-center py-1.5 border-r border-b border-line min-w-0 truncate">
                    {isPhone ? w.slice(0, 1) : w}
                  </div>
                ))}
                {days.map((d) => (
                  <MonthCell
                    key={d}
                    d={d}
                    inMonth={d.startsWith(monthPrefix)}
                    isToday={d === today}
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
                return (
                  <Card key={d} className={cn('p-2 min-w-0', d === today && 'ring-2 ring-[var(--accent)]')}>
                    <button type="button" className="btn btn-ghost btn-sm w-full justify-start px-1" onClick={() => setOpenDay(d)}>
                      <span className="truncate">{fmt(d, { weekday: 'short', day: 'numeric' })}</span>
                    </button>
                    <ul className="mt-1 space-y-1">
                      {list.map((it, i) => (
                        <li key={i} className={cn('flex items-center gap-1 min-w-0 t-11 tnum', it.kind === 'free' ? 'text-faint' : 'text-muted')}>
                          <Dot accent={brand(it.channel).accent} />
                          <span aria-hidden>{KIND[it.kind].glyph}</span>
                          <span className="truncate">{it.at ? clock.format(new Date(it.at)) : '—'} · {brand(it.channel).short}</span>
                        </li>
                      ))}
                      {!list.length ? <li className="t-11 text-faint">—</li> : null}
                    </ul>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              {days.filter((d) => byDay[d]?.length).map((d) => (
                <Card key={d} className="px-4 py-2 min-w-0">
                  <h3 className={cn('t-12 font-semibold pt-1.5', d === today ? 'text-ink' : 'text-muted')}>
                    {d === today ? 'Today · ' : ''}{fmt(d, { weekday: 'long', day: 'numeric', month: 'short' })}
                  </h3>
                  <ul className="divide-y divide-[var(--line)]">
                    {byDay[d].map((it, i) => <AgendaRow key={i} it={it} brand={brand} />)}
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
