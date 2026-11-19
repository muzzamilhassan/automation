'use client';
// Phase 2 I4 — the "cockpit" home (plan §5.4): exception-first. The first
// line answers the owner's morning question ("All good" or "N things need
// you"), then one card per channel for today, THEN growth + lifetime totals.
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FacebookIcon, InstagramIcon } from '@/components/BrandIcons';
import {
  Users,
  Eye,
  Film,
  RefreshCw,
  Zap,
  Flame,
  CalendarDays,
  Radar,
  LayoutDashboard,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Loader2,
  ChevronRight,
  Clock,
} from 'lucide-react';
import { Card, CardHead, Chip, StatCard, PageSkeleton, EmptyState, BrandMark } from '@/components/ui';
import { MiniBars } from '@/components/charts';
import TabNav from '@/components/TabNav';
import Analytics from '@/app/analytics/page';
import { useBrands } from '@/components/use-brands'; // #125: live brand marks
import { useOpenWarnings } from '@/components/use-open-warnings'; // #126: live alerts
import { useMe } from '@/components/use-me'; // P0-7: greet the signed-in user, never a hardcoded name
import { fmt, fmtFull } from '@/lib/utils';
import { deriveVerdict, channelToday, nextSlot, fmtIn, reviewStatusFromHttp } from '@/lib/cockpit-verdict.mjs';


const OVERVIEW_TABS = [
  { id: 'pulse', label: 'Pulse & Production', icon: LayoutDashboard },
  { id: 'analytics', label: 'Deep Analytics (28d)', icon: TrendingUp },
];

const VERDICT_ICON = { all_good: CheckCircle2, needs_you: AlertTriangle, unknown: HelpCircle, loading: Loader2, empty: HelpCircle };
const TONE_INK = { ok: 'var(--ok-ink)', warn: 'var(--warn-ink)', bad: 'var(--bad-ink)', info: 'var(--info-ink)', plain: 'var(--muted)' };
const TONE_DOT = { ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--bad)', info: 'var(--info)', plain: 'var(--faint)' };

// The one-line morning answer. Pure presentation — the rules live in
// lib/cockpit-verdict.mjs (tested).
function VerdictBanner({ verdict, onRetry }) {
  const Icon = VERDICT_ICON[verdict.kind] || HelpCircle;
  const ink = TONE_INK[verdict.tone] || 'var(--muted)';
  return (
    <Card className="mb-6 overflow-hidden" aria-live="polite">
      <div
        className="flex items-start gap-3 px-5 py-4"
        style={{ background: verdict.tone === 'plain' ? undefined : `color-mix(in srgb, ${TONE_DOT[verdict.tone]} 8%, transparent)` }}
      >
        <Icon size={22} className={'shrink-0 mt-0.5' + (verdict.kind === 'loading' ? ' animate-spin' : '')} style={{ color: ink }} />
        <div className="min-w-0 flex-1">
          <p className="t-16 font-semibold text-ink text-balance" data-verdict={verdict.kind}>{verdict.headline}</p>
          {verdict.sub ? <p className="t-12 text-muted mt-0.5 text-pretty">{verdict.sub}</p> : null}
        </div>
        {verdict.unknown.length ? (
          <button className="btn btn-sm btn-outline shrink-0" onClick={onRetry}>
            <RefreshCw size={14} /> Retry
          </button>
        ) : null}
      </div>
      {verdict.items.length ? (
        <ul className="border-t border-line">
          {verdict.items.map((it) => (
            <li key={it.key}>
              <Link href={it.href} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2 transition-colors">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: TONE_DOT[it.tone] }} />
                <span className="t-13 text-ink min-w-0 flex-1 text-pretty">{it.text}</span>
                <ChevronRight size={15} className="text-faint shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

// One card per channel for TODAY: made / not run / paused / YouTube error,
// plus the next upload slot. Each opens that channel's own page.
function TodayRow({ channels, marks, now }) {
  if (!channels.length) return null;
  return (
    <section className="mb-6">
      <h2 className="overline mb-2">Channels today</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {channels.map((c) => {
          const t = channelToday(c, now);
          const next = t.state === 'paused' ? null : nextSlot(c.slots, c.longSlot, now);
          return (
            <Link key={c.slug} href={`/channels/${c.slug}`} className="card card-hover flex items-center gap-3 p-3.5 min-w-0">
              <BrandMark short={marks[c.slug]?.short || c.short || '•'} accent={c.accent || 'var(--accent)'} size={34} />
              <div className="min-w-0 flex-1">
                <div className="t-13 font-semibold text-ink truncate">{c.label || c.slug}</div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                  <Chip tone={t.tone} dot>{t.label}</Chip>
                  <span className="t-11 text-faint tnum flex items-center gap-1">
                    <Clock size={11} />
                    {next ? `next ${next.time} UTC · ${fmtIn(next.inMin)}` : t.state === 'paused' ? 'no uploads while paused' : 'no slot set'}
                  </span>
                </div>
              </div>
              <ChevronRight size={15} className="text-faint shrink-0" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function OverviewContent() {
  const { bySlug: BRAND } = useBrands(); // #125 (hooks live HERE — every use is in this component): live short/accent per slug
  const { rows: openWarningRows, canSee: warningsCanSee, status: warnStatus, retry: warnRetry } = useOpenWarnings(); // #126: live alerts
  const me = useMe();
  const searchParams = useSearchParams();
  const tabFromQuery = searchParams.get('tab');
  const activeTab = tabFromQuery && OVERVIEW_TABS.some((tab) => tab.id === tabFromQuery) ? tabFromQuery : 'pulse';

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
      setAnalytics(a && !a.error ? a : null);
      setAnalyticsCoverage(a?.coverage || null);
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

  const { channels, totals, logs, trends } = data;
  const active = channels.filter((c) => c.active);

  const now = new Date();
  const hour = now.getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const today = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // The morning answer: channels from /api/overview, warnings from the live
  // hook (status 'error' → unknown), approvals from /api/review.
  const verdict = deriveVerdict({
    channels: active,
    warnings: { status: warnStatus, rows: openWarningRows },
    review,
  });

  // Real daily views from the YouTube Analytics API (28-day window, cached 1h
  // server-side). Last 14 days feed the chart; per-channel totals in tiles.
  const daily = (analytics?.daily || []).slice(-14);
  const labels = daily.map((d) => d.date.slice(5));
  const last = daily.at(-1)?.views || 0;
  const prev = daily.at(-2)?.views || 0;
  const viewsDelta = prev ? Math.round(((last - prev) / prev) * 100) : 0;

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

      {/* the morning answer — always first */}
      <VerdictBanner verdict={verdict} onRetry={() => { warnRetry?.(); load(); }} />

      <div className="mb-6">
        <TabNav
          tabs={OVERVIEW_TABS}
          activeTab={activeTab}
          paramName="tab"
        />
      </div>

      {activeTab === 'analytics' ? (
        <Analytics />
      ) : (
        <>
      {/* one card per channel, today */}
      <TodayRow channels={active} marks={BRAND} now={now} />

      {/* chart + alerts */}
      <div className="grid lg:grid-cols-3 gap-4 mb-5">
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHead
            title="Views per day"
            sub={analytics ? 'Real YouTube Analytics · all channels · last 14 of 28 days' : analyticsCoverage && !analyticsCoverage.ok?.length ? 'YouTube Analytics unavailable right now' : 'Loading real YouTube Analytics…'}
            icon={Radar}
            right={analyticsCoverage ? (
              analyticsCoverage.failed?.length === 0 ? <Chip tone="ok">YouTube · {new Date(analyticsCoverage.fetchedAt).toLocaleDateString()}</Chip>
                : analyticsCoverage.ok?.length ? <Chip tone="warn">{analyticsCoverage.ok.length} of {analyticsCoverage.ok.length + analyticsCoverage.failed.length} channels</Chip>
                  : <Chip tone="bad">YouTube unavailable · <button type="button" className="underline" onClick={() => load(true)}>Retry</button></Chip>
            ) : null}
          />
          <div className="px-3 pb-3">
            {analytics ? (
              <>
                {/* div-based bars ONLY — the SVG MultiChart + real data combo crashed
                    tabs before (a7c4a8c); do not reintroduce it here */}
                <MiniBars data={daily.map((d) => d.views)} labels={labels.length ? labels : ['-']} color="var(--accent)" height={170} />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                  {active.map((c) => {
                    const t = analytics.channels?.[c.slug]?.totals;
                    return (
                      <div key={c.slug} className="inset-tile p-2.5 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.accent }} />
                          <span className="overline truncate">{BRAND[c.slug]?.short || c.label || c.slug}</span>
                        </div>
                        <div className="tnum t-13 font-bold text-ink">{t ? fmt(t.views) : <span className="text-faint">—</span>}</div>
                        <div className="t-10 text-faint">views · 28d{t ? '' : ' · unavailable'}</div>
                      </div>
                    );
                  })}
                </div>
              </>
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

        {warningsCanSee || warnStatus === 'error' ? (
        <Card>
          <CardHead title="Needs attention" sub={`${openWarningRows.length} open warnings`} icon={Flame} right={<Link href="/warnings" className="t-11 text-accent hover:underline">triage →</Link>} />
          <div className="px-2 pb-2">
            {warnStatus === 'error' ? (
              <div className="px-4 py-8 text-center">
                <p className="t-12 font-semibold text-ink">Can&apos;t check warnings right now</p>
                <p className="t-11 text-faint mt-1">Status unknown — this is not an all-clear.</p>
                <button className="btn btn-outline btn-sm mt-3" onClick={() => warnRetry?.()}><RefreshCw size={13} /> Retry</button>
              </div>
            ) : openWarningRows.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="t-12 font-semibold text-ink">Nothing needs attention</p>
                <p className="t-11 text-faint mt-1">All probes are quiet — no open warnings.</p>
              </div>
            ) : openWarningRows.slice(0, 4).map((w) => (
              <Link key={w.id} href="/warnings" className="flex gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-2 transition-colors">
                <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: w.severity === 'blocking' ? 'var(--bad)' : 'var(--warn)' }} />
                <span className="min-w-0">
                  <span className="block t-12 font-semibold text-ink leading-snug">{w.title}</span>
                  <span className="block t-11 text-faint mt-0.5 font-mono truncate">{w.severity}{w.channel_id ? ` · ${w.channel_id}` : ''}</span>
                </span>
              </Link>
            ))}
          </div>
        </Card>
        ) : null}
      </div>

      {/* lifetime totals — context, no longer the first thing on the page */}
      <h2 className="overline mb-2">Lifetime totals · live from each platform</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-5">
        <StatCard delay={0} icon={Users} label="YT subs" value={totals.ytSubs} fmt={fmt} />
        <StatCard delay={1} icon={Eye} label="YT views" value={totals.ytViews} fmt={fmt} delta={viewsDelta} spark={daily.map((d) => d.views)} color="var(--info)" iconBg="color-mix(in srgb, var(--info) 12%, transparent)" />
        <StatCard delay={2} icon={Film} label="Videos" value={totals.ytVideos} fmt={fmt} />
        <StatCard delay={3} icon={FacebookIcon} label="FB followers" value={totals.fbFollowers} fmt={fmt} color="var(--info)" iconBg="color-mix(in srgb, var(--info) 12%, transparent)" />
        {/* no IG data = no tile (StatCard would draw a null as 0) */}
        {totals.igFollowers > 0 ? (
          <StatCard delay={4} icon={InstagramIcon} label="IG followers" value={totals.igFollowers} fmt={fmt} color="var(--accent)" iconBg="var(--accent-soft)" />
        ) : null}
      </div>

      {/* production line */}
      <Card className="mb-5 overflow-hidden">
        <CardHead
          title="Today's production line"
          sub="What the machine already made today, and each channel's upload slots"
          icon={Zap}
        />
        <div className="overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th>Channel</th>
                <th>Shorts today</th>
                <th>Poster</th>
                <th>Episode</th>
                <th>Slots (UTC)</th>
              </tr>
            </thead>
            <tbody>
              {active.map((c) => {
                const meta = BRAND[c.slug];
                return (
                  <tr key={c.slug}>
                    <td>
                      <Link href={`/channels/${c.slug}`} className="flex items-center gap-2.5 hover:underline">
                        <BrandMark short={meta?.short || '•'} accent={c.accent} size={26} />
                        <span className="font-semibold">{c.label}</span>
                      </Link>
                    </td>
                    <td>
                      {c.todayVideos ? (
                        <Chip tone="ok" dot>{c.todayVideos} queued</Chip>
                      ) : (
                        <Chip tone="warn">not run today</Chip>
                      )}
                    </td>
                    <td>
                      {c.imageDate === new Date().toISOString().slice(0, 10) ? (
                        <Chip tone="ok">done</Chip>
                      ) : (
                        <Chip>—</Chip>
                      )}
                    </td>
                    <td>{c.deepdiveDate ? <Chip tone="ok">{c.deepdiveDate}</Chip> : <Chip>—</Chip>}</td>
                    <td className="text-muted font-mono t-11 tnum">
                      {c.slots.join(' · ')}
                      {c.longSlot ? ` + ${c.longSlot}` : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* researched topics */}
      {active.some((c) => c.todayTopics || c.episodeTopic) ? (
        <Card className="mb-5 overflow-hidden">
          <CardHead
            title="Today's researched topics"
            sub="Picked by the machine from what is provably getting views in each niche right now — no fixed lists"
            icon={Radar}
          />
          <div className="px-4 pb-4 grid md:grid-cols-2 gap-2.5">
            {active.filter((c) => c.todayTopics || c.episodeTopic).map((c) => (
              <div key={c.slug} className="inset-tile p-3.5 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <BrandMark short={BRAND[c.slug]?.short || '•'} accent={c.accent} size={22} />
                  <span className="t-12 font-semibold text-ink truncate">{c.label}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {(c.todayTopics || []).map((t, i) => (
                    <span key={i} className="t-11 text-muted leading-snug flex gap-1.5">
                      <span style={{ color: c.accent }}>▸</span>
                      <span>from viral wave: “{t}”</span>
                    </span>
                  ))}
                  {c.episodeTopic ? (
                    <span className="t-11 text-muted leading-snug flex gap-1.5">
                      <span className="text-accent">▸</span>
                      <span>episode: “{c.episodeTopic}”</span>
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* trend radar */}
      <Card>
        <CardHead title="Trend radar" sub="Live keywords + viral videos per niche" icon={Flame} />
        <div className="px-5 pb-5">
          {Object.entries(trends).length === 0 ? (
            <EmptyState icon={Radar} title="No trend cache yet" sub="Trends refresh with the next production batch." />
          ) : (
            Object.entries(trends).map(([slug, t]) => (
              <div key={slug} className="py-2.5 border-b border-line last:border-0 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <BrandMark short={BRAND[slug]?.short || '•'} accent={BRAND[slug]?.accent || 'var(--faint)'} size={20} />
                  <span className="t-12 font-semibold text-ink">{BRAND[slug]?.label || slug}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {t.keywords.map((k) => (
                    <Chip key={k} tone="accent">{k}</Chip>
                  ))}
                </div>
                <p className="t-11 text-faint truncate">viral now: {t.viral.map((v) => v.title).join(' · ').slice(0, 110)}</p>
              </div>
            ))
          )}
        </div>
      </Card>

      <p className="mt-4 t-11 text-faint">
        Live totals: {fmtFull(totals.ytSubs)} subs · {fmtFull(totals.ytViews)} all-time views · refreshed every 60s. Real 28-day numbers live on the Analytics page.
      </p>
        </>
      )}
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
