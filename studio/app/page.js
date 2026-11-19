'use client';
// The "Today" home — feedback round 1 (2026-11-19, owner: "remove all extra
// detail from dashboard"). Exactly three things: the one-line verdict ("All
// good" / "N things need you"), one compact row per channel for today, and
// the views chart. Problems are LISTED only in the bell + Inbox; topics, trend
// radar and lifetime totals moved to the Analytics page.
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  RefreshCw,
  Zap,
  CalendarDays,
  Radar,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Loader2,
  ChevronRight,
  Clock,
} from 'lucide-react';
import { Card, CardHead, Chip, PageSkeleton, EmptyState, BrandMark } from '@/components/ui';
import { MiniBars } from '@/components/charts';
import { useBrands } from '@/components/use-brands'; // #125: live brand marks
import { useOpenWarnings } from '@/components/use-open-warnings'; // #126: live alerts
import { useMe } from '@/components/use-me'; // P0-7: greet the signed-in user, never a hardcoded name
import { deriveVerdict, channelToday, nextSlot, fmtIn, reviewStatusFromHttp, todayMarks, verdictHref } from '@/lib/cockpit-verdict.mjs';

const VERDICT_ICON = { all_good: CheckCircle2, needs_you: AlertTriangle, unknown: HelpCircle, loading: Loader2, empty: HelpCircle };
const TONE_INK = { ok: 'var(--ok-ink)', warn: 'var(--warn-ink)', bad: 'var(--bad-ink)', info: 'var(--info-ink)', plain: 'var(--muted)' };
const TONE_DOT = { ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--bad)', info: 'var(--info)', plain: 'var(--faint)' };

// The one-line morning answer. Pure presentation — the rules live in
// lib/cockpit-verdict.mjs (tested). No list here: problems are listed only in
// the bell and the Inbox; this line links there.
function VerdictLine({ verdict, onRetry }) {
  const Icon = VERDICT_ICON[verdict.kind] || HelpCircle;
  const ink = TONE_INK[verdict.tone] || 'var(--muted)';
  const href = verdictHref(verdict);
  return (
    <Card className="mb-5 overflow-hidden" aria-live="polite">
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
        style={{ background: verdict.tone === 'plain' ? undefined : `color-mix(in srgb, ${TONE_DOT[verdict.tone]} 8%, transparent)` }}
      >
        <Icon size={20} className={'shrink-0' + (verdict.kind === 'loading' ? ' animate-spin' : '')} style={{ color: ink }} />
        <p className="min-w-0 flex-1 text-pretty">
          <span className="t-16 font-semibold text-ink" data-verdict={verdict.kind}>{verdict.headline}</span>
          {verdict.sub ? <span className="t-12 text-muted"> · {verdict.sub}</span> : null}
        </p>
        {href ? (
          <Link href={href} className="btn btn-sm btn-outline shrink-0">
            {href === '/review' ? 'Approve scripts' : 'See problems'} <ChevronRight size={14} />
          </Link>
        ) : null}
        {verdict.unknown.length ? (
          <button className="btn btn-sm btn-outline shrink-0" onClick={onRetry}>
            <RefreshCw size={14} /> Retry
          </button>
        ) : null}
      </div>
    </Card>
  );
}

// One compact row per channel for TODAY: state (made / waiting / not run /
// paused / YouTube error), a poster/episode mark only when made today, and
// the next upload slot. Each row opens that channel's own page.
function TodayList({ channels, marks, now }) {
  if (!channels.length) return null;
  return (
    <section className="mb-5">
      <h2 className="overline mb-2">Channels today</h2>
      <Card className="overflow-hidden">
        <ul className="divide-y divide-[var(--line)]">
          {channels.map((c) => {
            const t = channelToday(c, now);
            const done = todayMarks(c, now);
            const next = t.state === 'paused' ? null : nextSlot(c.slots, c.longSlot, now);
            return (
              <li key={c.slug}>
                <Link href={`/channels/${c.slug}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 min-w-0 hover:bg-surface-2 transition-colors">
                  <BrandMark short={marks[c.slug]?.short || c.short || '•'} accent={c.accent || 'var(--accent)'} size={26} />
                  <span className="t-13 font-semibold text-ink truncate min-w-0 flex-1 sm:flex-none sm:w-48">{c.label || c.slug}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Chip tone={t.tone} dot>{t.label}</Chip>
                    {done.map((m) => <Chip key={m} tone="ok">{m} ✓</Chip>)}
                  </span>
                  <span className="t-11 text-faint tnum flex items-center gap-1 sm:ml-auto">
                    <Clock size={11} />
                    {next ? `next ${next.time} UTC · ${fmtIn(next.inMin)}` : t.state === 'paused' ? 'no uploads while paused' : 'no slot set'}
                  </span>
                  <ChevronRight size={15} className="text-faint shrink-0" />
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}

function OverviewContent() {
  const { bySlug: BRAND } = useBrands(); // #125 (hooks live HERE — every use is in this component): live short/accent per slug
  const { rows: openWarningRows, status: warnStatus, retry: warnRetry } = useOpenWarnings(); // #126: live alerts (feed the verdict count only)
  const me = useMe();

  const [data, setData] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsCoverage, setAnalyticsCoverage] = useState(null);
  // pending approvals: 'ok' carries a real count; 503/401/network = unknown, never 0
  const [review, setReview] = useState({ status: 'loading', count: null });
  const [err, setErr] = useState(false);
  const [tick, setTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState(null);

  const load = (fresh = false) => {
    if (fresh) setRefreshing(true);
    return Promise.allSettled([
      fetch('/api/overview' + (fresh ? '?fresh=1' : '')).then((r) => (r.ok ? r.json() : Promise.reject(new Error('overview ' + r.status)))),
      // #119 BUG-1: the non-fresh branch used to append '?fresh=1' onto a URL
      // that already had '?slug=all' → server parsed slug='all?fresh=1' → null
      // on every background poll. No param at all when not fresh.
      fetch('/api/analytics?slug=all' + (fresh ? '&fresh=1' : '')).then((r) => r.json()),
      fetch('/api/review').then((r) => (r.ok
        ? r.json().then((d) => ({ status: 'ok', count: Array.isArray(d?.scripts) ? d.scripts.length : null }))
        : { status: reviewStatusFromHttp(r.status), count: null })),
    ]).then(([ov, an, rv]) => {
      if (ov.status === 'fulfilled') { setData(ov.value); setErr(false); } else setErr(true);
      const a = an.status === 'fulfilled' ? an.value : null;
      // every channel failed (coverage.ok empty) = zeros, not data → unavailable
      setAnalytics(a && !a.error && !(a.coverage && !a.coverage.ok?.length) ? a : null);
      // fetchedAt lives on the analytics payload, not inside coverage (the chip
      // read coverage.fetchedAt → 'YouTube · Invalid Date')
      setAnalyticsCoverage(a?.coverage ? { ...a.coverage, fetchedAt: a.fetchedAt || null } : null);
      // a 200 without a scripts array is not a count either
      setReview(rv.status === 'fulfilled' && !(rv.value.status === 'ok' && rv.value.count === null) ? rv.value : { status: 'error', count: null });
      if (fresh) setRefreshedAt(new Date());
    }).finally(() => setRefreshing(false));
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      await Promise.resolve();
      if (alive) load();
    })();
    const t = setInterval(() => load(), 60000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [tick]);

  if (err && !data)
    return (
      <Card className="p-4">
        <EmptyState
          icon={AlertTriangle}
          title="Can't load today's overview"
          sub="The studio didn't answer, so nothing here is known right now — this is not an all-clear. Your channels keep running on their schedules."
        >
          <button className="btn btn-outline btn-sm mt-3" onClick={() => load(true)} disabled={refreshing}>
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> Retry
          </button>
        </EmptyState>
      </Card>
    );
  if (!data) return <PageSkeleton />;

  const { channels } = data;
  const active = channels.filter((c) => c.active);

  const now = new Date();
  const hour = now.getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const today = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // The morning answer: channels from /api/overview, warnings from the live
  // hook (status 'error' → unknown, 'forbidden' → a client: never counted),
  // approvals from /api/review.
  const verdict = deriveVerdict({
    channels: active,
    warnings: { status: warnStatus, rows: openWarningRows },
    review,
  });

  // Real daily views from the YouTube Analytics API (28-day window, cached 1h
  // server-side). The last 14 days feed the chart.
  const daily = (analytics?.daily || []).slice(-14);
  const labels = daily.map((d) => d.date.slice(5));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink leading-tight text-balance">
            {greet}{me?.name ? `, ${String(me.name).split(/\s+/)[0]}` : ''}
          </h1>
          <p className="t-13 text-muted mt-0.5 flex flex-wrap items-center gap-1.5 text-pretty">
            <CalendarDays size={13} className="text-muted" />
            {today} · {active.length} live channels
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {refreshedAt && !refreshing ? (
            <span className="t-10 text-faint tnum">updated {refreshedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
          ) : null}
          <button className="btn btn-outline" onClick={() => load(true)} disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <Link href="/runs" className="btn btn-primary"><Zap size={16} />Pipelines</Link>
        </div>
      </div>

      {err ? (
        <p className="t-12 mb-3" role="status" style={{ color: 'var(--warn-ink)' }}>Couldn&apos;t refresh just now — showing the last overview that loaded.</p>
      ) : null}

      {/* 1. the morning answer — always first, one line */}
      <VerdictLine verdict={verdict} onRetry={() => { warnRetry?.(); load(); }} />

      {/* 2. one row per channel, today */}
      <TodayList channels={active} marks={BRAND} now={now} />

      {/* 3. views chart */}
      <Card className="overflow-hidden">
        <CardHead
          title="Views per day"
          sub={analytics ? 'All channels · last 14 days' : analyticsCoverage && !analyticsCoverage.ok?.length ? 'YouTube Analytics unavailable right now' : 'Loading YouTube Analytics…'}
          icon={Radar}
          right={analyticsCoverage ? (
            analyticsCoverage.failed?.length === 0 ? <Chip tone="ok">YouTube{analyticsCoverage.fetchedAt ? ` · ${new Date(analyticsCoverage.fetchedAt).toLocaleDateString()}` : ''}</Chip>
              : analyticsCoverage.ok?.length ? <Chip tone="warn">{analyticsCoverage.ok.length} of {analyticsCoverage.ok.length + analyticsCoverage.failed.length} channels</Chip>
                : <Chip tone="bad">YouTube unavailable · <button type="button" className="underline" onClick={() => load(true)}>Retry</button></Chip>
          ) : null}
        />
        <div className="px-3 pb-3">
          {analytics ? (
            // div-based bars ONLY — the SVG MultiChart + real data combo crashed
            // tabs before (a7c4a8c); do not reintroduce it here
            <MiniBars data={daily.map((d) => d.views)} labels={labels.length ? labels : ['-']} color="var(--accent)" height={170} />
          ) : analyticsCoverage && !analyticsCoverage.ok?.length ? (
            <div className="px-4 py-10 text-center">
              <p className="t-12 font-semibold text-ink">— · unavailable</p>
              <p className="t-11 text-faint mt-1">YouTube Analytics didn&apos;t answer, so no views are shown (not zero).</p>
            </div>
          ) : (
            <div className="px-4 py-10 space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="skeleton h-5" />)}</div>
          )}
        </div>
      </Card>
      <p className="mt-3 t-11 text-faint">
        Totals, per-channel numbers, today&apos;s topics and the trend radar are on <Link href="/analytics" className="text-accent hover:underline">Analytics</Link>.
      </p>
    </div>
  );
}

export default function Overview() {

  return (
    <Suspense fallback={<PageSkeleton />}>
      <OverviewContent />
    </Suspense>
  );
}
