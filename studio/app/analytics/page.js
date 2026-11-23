'use client';
import { useEffect, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Target,
  Search,
  FileSpreadsheet,
  Info,
  Eye,
  Users,
  Clock,
  UserPlus,
  Scissors,
  Film,
  Globe,
  RefreshCw,
  Trophy,
  ShieldAlert,
  Radar,
  Flame,
} from 'lucide-react';
import { Card, CardHead, Chip, PageHeader, PageSkeleton, StatCard, BrandMark, Segmented, EmptyState } from '@/components/ui';
import { RetentionBars, MiniBars } from '@/components/charts';
import { RETENTION_GOAL } from '@/lib/site-data';
import { useBrands } from '@/components/use-brands'; // #125: live brand marks
import { fmt } from '@/lib/utils';
import DataTable from '@/components/DataTable';
// live fix wave C2: one total, honest zeros, real names, readable watch time
import {
  watchMinutes, fmtWatchTime, fmtDelta, countedOnly, lastDataDay, fmtDay,
  viewSplit, pickerOptions, boardRows, reportDay, reportsState,
} from '@/lib/analytics-view.mjs';

// #106 S5: snapshot-backed section (nightly analytics_snapshots — zero live
// YouTube calls). Analytics settle 48–72h, so every panel here carries the
// "data through <date>" lag stamp (D21); win rates start empty until Phase 4
// S4's scripts table lands (L6).
const SNAPSHOT_DAYS = [7, 28, 90];

export default function Analytics() {
  const { bySlug: BRAND } = useBrands(); // #125: live short/accent per slug

  const [data, setData] = useState(null);
  const [sel, setSel] = useState('all');
  const [real, setReal] = useState(null);
  const [realErr, setRealErr] = useState(false);
  const [terms, setTerms] = useState(null);
  const [termsErr, setTermsErr] = useState(false);
  const [reports, setReports] = useState([]);
  const [reportsErr, setReportsErr] = useState(false);
  const [snap, setSnap] = useState(null);
  const [snapErr, setSnapErr] = useState(false);
  const [snapDays, setSnapDays] = useState(28);
  const [reAuthing, setReAuthing] = useState(null);
  const [reAuthErr, setReAuthErr] = useState('');
  const [ovErr, setOvErr] = useState(false);

  // a failed read is "unavailable", never "no snapshots yet" (honesty doctrine)
  const loadSnap = (days = snapDays) => {
    setSnapErr(false);
    fetch('/api/analytics/leaderboard?days=' + days)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((d) => { if (d?.error) throw new Error(d.error); setSnap(d); })
      .catch(() => { setSnap(null); setSnapErr(true); });
  };
  // deferred a tick: loaders set state, which must not run synchronously in an effect
  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => { if (alive) loadSnap(snapDays); });
    return () => { alive = false; };
  }, [snapDays]); // eslint-disable-line react-hooks/exhaustive-deps

  const startReAuth = async (slug) => {
    setReAuthing(slug);
    setReAuthErr('');
    try {
      const r = await fetch('/api/oauth/start');
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.url) {
        window.location.assign(d.url);
        return;
      }
      setReAuthErr(d.error || `Couldn't start the Google sign-in (the server answered ${r.status}).`);
    } catch (e) {
      setReAuthErr(`Couldn't start the Google sign-in — ${e.message || 'network error'}.`);
    }
    setReAuthing(null);
  };

  useEffect(() => {
    // overview failure keeps the page usable but its totals read "—", never 0
    fetch('/api/overview').then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))).then(setData).catch(() => { setOvErr(true); setData({ totals: {}, channels: [] }); });
    fetch('/api/reports').then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))).then((d) => setReports(d.reports || [])).catch(() => setReportsErr(true));
  }, []);
  const load = (fresh = false) => {
    setReal(null);
    setRealErr(false);
    setTerms(null);
    const q = fresh ? '?fresh=1' : '';
    fetch('/api/analytics?slug=' + sel + q)
      .then((r) => r.json())
      // Honest: a reply where EVERY channel failed (coverage.ok empty) is not
      // data — it's zeros. Treat it as unavailable, never 'real data'.
      .then((d) => (d && !d.error && !(d.coverage && !d.coverage.ok?.length) ? setReal(d) : setRealErr(true)))
      .catch(() => setRealErr(true));
    fetch('/api/terms?slug=' + sel)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((d) => { if (d?.error) throw new Error(d.error); setTerms(d.terms || []); setTermsErr(false); })
      .catch(() => { setTerms([]); setTermsErr(true); });
  };
  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => { if (alive) load(); });
    return () => { alive = false; };
  }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <PageSkeleton />;

  const { totals = {}, channels = [] } = data;
  const active = channels.filter((c) => c.active);
  const selChannel = sel === 'all' ? null : active.find((c) => c.slug === sel);

  // Live average-watched % from the YouTube Analytics API overlays the Sep-19
  // audit numbers — the API value wins whenever it exists.
  const avgFor = (slug) => {
    if (sel === 'all') return real?.channels?.[slug]?.avgWatched;
    if (sel === slug) return real?.avgWatched;
    return undefined;
  };
  // P0-5: LIVE average-watched only. No Sep-2026 baseline — a channel without
  // analytics data shows an honest "no data" bar, never an old number.
  const channelScope = sel === 'all' ? active : active.filter((c) => c.slug === sel);
  // T2-15 (wave A3): a channel whose analytics READ failed is "unavailable
  // right now" — never "needs analytics access" (that points at a re-auth)
  const failedSlugs = new Set((real?.coverage?.failed || []).map((f) => f?.slug).filter(Boolean));
  const failedNames = channelScope.filter((c) => failedSlugs.has(c.slug)).map((c) => c.label || c.slug);
  const retentionRows = channelScope.filter((c) => !failedSlugs.has(c.slug)).map((c) => {
    const raw = sel === 'all' ? real?.channels?.[c.slug]?.avgWatched : real?.avgWatched;
    const live = Number(raw);
    const pct = Number.isFinite(live) && live > 0 ? Math.round(live) : null;
    return { slug: c.slug, pct, live: pct != null, name: c.label || c.slug, accent: BRAND[c.slug]?.accent || 'var(--accent)' };
  });
  const retentionLive = retentionRows.length > 0 && retentionRows.every((r) => r.live);

  // REAL daily views from the YouTube Analytics API (28 days)

  const keywords = (terms || []).filter((k) => k && k.term);
  // T2-04 (wave A3): a source that didn't answer is null → "—", never 0.
  // /api/overview names those sources in `degraded`.
  const degraded = Array.isArray(data.degraded) ? data.degraded : [];
  const fbDown = ovErr || degraded.includes('facebook');
  const known = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const selYt = selChannel?.yt && !selChannel.yt.error ? selChannel.yt : null;
  const platformSlices = sel === 'all'
    ? [
        { name: 'YouTube', value: ovErr ? null : known(totals.ytSubs), color: 'var(--bad)' },
        { name: 'Facebook', value: ovErr ? null : known(totals.fbFollowers), color: 'var(--info)' },
        { name: 'Instagram', value: ovErr ? null : known(totals.igFollowers), color: 'var(--accent)' },
      ]
    : [
        { name: 'YouTube', value: known(selYt?.subs), color: 'var(--bad)' },
        // no linked page = a real 0; a failed Facebook read = unknown
        { name: 'Facebook', value: selChannel?.fb ? known(selChannel.fb.followers) : fbDown ? null : 0, color: 'var(--info)' },
        { name: 'Instagram', value: selChannel?.ig ? known(selChannel.ig.followers) : fbDown ? null : 0, color: 'var(--accent)' },
      ];
  const platformTotal = platformSlices.every((s) => s.value != null) ? platformSlices.reduce((a, s) => a + s.value, 0) : null;
  // null (unknown) renders "—" in StatCard — never a fake 0
  const subsShown = ovErr ? null : sel === 'all' ? totals.ytSubs ?? null : selChannel?.yt?.subs ?? null;
  // moved from home (feedback r1, 2026-11-19): the lifetime totals this page
  // didn't already show. FB/IG followers stay in "Audience split" (no repeats).
  const lifetimeViews = ovErr ? null : sel === 'all' ? totals.ytViews ?? null : selChannel?.yt?.views ?? null;
  const lifetimeVideos = ovErr ? null : sel === 'all' ? totals.ytVideos ?? null : selChannel?.yt?.videos ?? null;
  // moved from home too: today's researched topics + trend radar, following
  // the channel picker. Overview failure = "unavailable", never "none yet".
  const topicRows = channelScope.filter((c) => c.todayTopics?.length || c.episodeTopic);
  const trendRows = Object.entries(data.trends || {}).filter(([slug]) => sel === 'all' || slug === sel);
  const liveRows = retentionRows.filter((r) => r.live);
  const best = [...liveRows].sort((a, b) => b.pct - a.pct)[0];
  const worst = liveRows.length > 1 ? [...liveRows].sort((a, b) => a.pct - b.pct)[0] : null;
  // T2-13 (wave C2): ONE 28-day total on the page — the split is shown
  // against the tile total; views the per-video report didn't sort are named.
  const split = viewSplit({ total: real?.totals?.views, shorts: real?.split?.shortsViews, long: real?.split?.longViews });
  const through = lastDataDay(real?.daily); // YouTube Analytics lags 2–3 days
  const countries = countedOnly(real?.audience?.countries); // T2-18: no "ID 0"
  const reportsNow = reportsState(reports); // T2-22: say when reports stopped
  const genderTotal = (real?.audience?.gender || []).reduce((a, g) => a + g.views, 0) || 1;
  const GENDER_NAME = { gender_female: 'Women', gender_male: 'Men', gender_user_specified: 'Other' };

  // snapshot-backed panels (leaderboard / win rates) — lag stamp is mandatory
  // T2-19 (wave C2): the leaderboard follows the channel picker
  const snapRows = boardRows(snap?.rows, sel);
  const snapThrough = snap?.dataThrough || null;
  const winRates = snap?.winRates || null;
  const winRows = winRates?.available ? [...(winRates.templates || []).map((t) => ({ ...t, kind: 'template' })), ...(winRates.topics || []).map((t) => ({ ...t, kind: 'topic' }))] : [];
  const brandOf = (slug) => BRAND[slug] || { short: (slug || '•').slice(0, 2).toUpperCase(), accent: 'var(--faint)' };
  const isOwner = snap?.viewerRole === 'owner'; // the oauth start route is owner-only

  return (
    <div>
      {/* T2-13 (wave C2): the live window's "data through" is stated ONCE, here */}
      <PageHeader
        icon={TrendingUp}
        title="Analytics"
        sub={`${sel === 'all' ? 'All channels' : BRAND[sel]?.label || selChannel?.label || sel} · YouTube, last 28 days${through ? ` · data through ${fmtDay(through)}` : ''}`}
      />

      <div className="mb-5 flex items-center gap-3 flex-wrap">
        {/* T2-19 (wave C2): real channel names, not QU / IN / TH codes */}
        <div className="max-w-full overflow-x-auto">
          <Segmented
            options={pickerOptions(active, BRAND)}
            value={sel}
            onChange={setSel}
          />
        </div>
        <button className="btn btn-outline" onClick={() => { load(true); loadSnap(snapDays); }}>
          <RefreshCw size={16} /> Refresh
        </button>
        {selChannel ? (
          <span className="flex items-center gap-2 t-12 text-muted">
            <BrandMark short={BRAND[sel]?.short || '•'} accent={selChannel.accent || 'var(--accent)'} size={20} />
            {selChannel.label}
          </span>
        ) : null}
      </div>

      {/* SNAPSHOT-BACKED: leaderboard + win rates (#106 S5). Nightly
          analytics_snapshots — no live calls; analytics settle 48–72h so the
          ranking window ends at "data through" (D-2), never today. */}
      <div className="grid lg:grid-cols-3 gap-4 mb-5">
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHead
            title="Channel leaderboard"
            sub={`${sel === 'all' ? 'All channels' : BRAND[sel]?.label || sel} · Saved nightly · ${snapDays} days${snapThrough ? ` to ${fmtDay(snapThrough)}` : ''} · ranked by views`}
            icon={Trophy}
            right={snapErr ? <Chip tone="bad">unavailable</Chip> : snapThrough ? <Chip tone="info" dot>snapshot</Chip> : snap ? <Chip tone="warn">no snapshots yet</Chip> : null}
          />
          <div className="px-5 pb-5">
            <div className="mb-3">
              <Segmented options={SNAPSHOT_DAYS.map((d) => ({ value: d, label: d + 'd' }))} value={snapDays} onChange={setSnapDays} />
            </div>
            {snapRows.length ? (
              <div className="overflow-x-auto">
                <table className="data">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Channel</th>
                      <th>Views</th>
                      <th>Watch hrs</th>
                      <th>Subs</th>
                      <th>Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapRows.map((r, i) => (
                      <tr key={r.channelId}>
                        <td className="tnum text-faint">{i + 1}</td>
                        <td>
                          <span className="flex items-center gap-2.5">
                            <BrandMark short={brandOf(r.channelId).short} accent={brandOf(r.channelId).accent} size={24} />
                            <span className="font-semibold">{BRAND[r.channelId]?.label || r.channelId}</span>
                          </span>
                        </td>
                        <td className="tnum font-bold text-ink">{fmt(r.views)}</td>
                        <td className="tnum">{fmtWatchTime(watchMinutes(r.watchHours))}</td>
                        {/* T2-18: a real 0 reads "0"; only unknown reads "—" */}
                        <td className="tnum">{fmtDelta(r.subsDelta)}</td>
                        <td>
                          {r.trendPct == null ? (
                            <Chip>new</Chip>
                          ) : (
                            <Chip tone={r.trendPct >= 0 ? 'ok' : 'warn'}>{r.trendPct >= 0 ? <TrendingUp size={12} aria-label="up" /> : <TrendingDown size={12} aria-label="down" />}{Math.abs(r.trendPct)}%</Chip>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="t-11 text-faint mt-2">Saved each night, so it can differ a little from the live 28-day numbers below.</p>
              </div>
            ) : snapErr ? (
              <EmptyState icon={Trophy} title="Can't load the leaderboard right now" sub="The snapshots weren't readable — this is not an empty leaderboard.">
                <button className="btn btn-outline btn-sm mt-3" onClick={() => loadSnap(snapDays)}><RefreshCw size={13} /> Retry</button>
              </EmptyState>
            ) : !snap ? (
              <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-6" />)}</div>
            ) : (
              snap?.rows?.length ? (
                <EmptyState icon={Trophy} title="No snapshot for this channel yet" sub="Pick All channels to see the others." />
              ) : (
                <EmptyState icon={Trophy} title="No snapshots yet" sub="The nightly analytics job (05:17 UTC) fills this after its first run." />
              )
            )}
          </div>
        </Card>

        <Card>
          <CardHead
            title="Template & topic win rates"
            sub="Views per published video, by template and topic"
            icon={Target}
            right={snapThrough ? <Chip tone="info" dot>saved nightly</Chip> : null}
          />
          <div className="px-5 pb-5">
            {snapErr ? (
              <p className="t-12 text-faint py-6 text-center">Unavailable right now — couldn&apos;t read the snapshots.</p>
            ) : winRows.length ? (
              <div className="space-y-1.5">
                {winRows.map((e) => (
                  <div key={e.kind + ':' + e.key} className="flex items-center justify-between gap-2 t-12">
                    <span className="flex items-center gap-1.5 text-muted min-w-0">
                      <Chip tone={e.kind === 'template' ? 'accent' : 'info'}>{e.kind}</Chip>
                      <span className="truncate">{e.key}</span>
                    </span>
                    <span className="tnum font-semibold text-ink shrink-0">{fmt(e.views)} · {e.published} vid{e.published === 1 ? '' : 's'}</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Target}
                title="No data yet — fills as Phase 4 S4 lands"
                sub="Win rates count published videos only (7-day settle) and join script records — this fills in as the Phase 4 review queue lands."
              />
            )}
          </div>
        </Card>
      </div>

      {/* owner re-auth checklist (D19): channels whose latest nightly scope
          probe lacked yt-analytics.readonly — the oauth start route is the
          same consent flow that added the scope on 10-03 */}
      {snap?.reAuth?.length ? (
        <Card className="mb-5 overflow-hidden">
          <CardHead
            title="Re-auth needed — yt-analytics.readonly"
            sub={`${snap.reAuth.length} channel${snap.reAuth.length === 1 ? '' : 's'} skipped by the nightly scope probe`}
            icon={ShieldAlert}
            right={<Chip tone="warn" dot>owner action</Chip>}
          />
          <div className="px-2 pb-2">
            {reAuthErr ? <p className="t-12 px-3 pb-2" role="alert" style={{ color: 'var(--bad-ink)' }}>{reAuthErr}</p> : null}
            {snap.reAuth.map((c) => (
              <div key={c.slug} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-2 transition-colors">
                <BrandMark short={brandOf(c.slug).short} accent={brandOf(c.slug).accent} size={26} />
                <span className="min-w-0 flex-1">
                  <span className="block t-12 font-semibold text-ink">{BRAND[c.slug]?.label || c.slug}</span>
                  <span className="block t-10 text-faint truncate">
                    {c.error || 'scope missing'}{c.checkedAt ? ` · probed ${String(c.checkedAt).slice(0, 10)}` : ''}
                  </span>
                </span>
                {isOwner ? (
                  <button className="btn btn-outline btn-sm shrink-0" onClick={() => startReAuth(c.slug)} disabled={reAuthing === c.slug}>
                    <RefreshCw size={14} className={reAuthing === c.slug ? 'animate-spin' : ''} /> Re-auth
                  </button>
                ) : (
                  <Chip tone="warn">owner action required</Chip>
                )}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* REAL 28-day numbers */}
      {/* T2-26 (wave C2): short labels + 3 across until 2xl, so none is cut at 1440.
          T2-14: watch time counts up in whole MINUTES (the count-up rounds). */}
      <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 gap-4 mb-5">
        <StatCard icon={Eye} label="Views · 28d" value={real ? real.totals?.views ?? null : null} fmt={fmt} color="var(--info)" iconBg="color-mix(in srgb, var(--info) 12%, transparent)" />
        <StatCard icon={Clock} label="Watch time · 28d" value={real ? watchMinutes(real.totals?.watchHours) : null} fmt={fmtWatchTime} color="var(--ok)" iconBg="color-mix(in srgb, var(--ok) 12%, transparent)" />
        <StatCard icon={UserPlus} label="New subs · 28d" value={real ? real.totals?.subsGained ?? null : null} fmt={(v) => Number(v).toLocaleString('en-US')} color="var(--accent)" iconBg="var(--accent-soft)" />
        <StatCard icon={Users} label="Subscribers · total" value={subsShown} fmt={fmt} />
        <StatCard icon={Eye} label="Views · all time" value={lifetimeViews} fmt={fmt} color="var(--info)" iconBg="color-mix(in srgb, var(--info) 12%, transparent)" />
        <StatCard icon={Film} label="Videos · total" value={lifetimeVideos} fmt={fmt} />
      </div>
      {!ovErr && (subsShown == null || lifetimeViews == null || lifetimeVideos == null || degraded.includes('youtube')) ? (
        <p className="t-11 text-faint -mt-3 mb-5" role="status">
          {sel === 'all' && totals.ytOf && totals.ytChannels && totals.ytChannels < totals.ytOf
            ? `YouTube stats unavailable right now for ${totals.ytOf - totals.ytChannels} of ${totals.ytOf} channels — totals cover the rest.`
            : 'YouTube stats unavailable right now — "—" means unknown, not zero.'}
        </p>
      ) : ovErr ? (
        <p className="t-11 text-faint -mt-3 mb-5" role="status">Live totals unavailable right now — &quot;—&quot; means unknown, not zero.</p>
      ) : null}

      <div className="grid lg:grid-cols-3 gap-4 mb-5">
        {/* retention */}
        <Card>
          <CardHead
            title="Average watched"
            sub={retentionLive ? 'Live from YouTube Analytics · last 28 days' : 'Live where the channel has analytics data — the rest say “no data”'}
            icon={Target}
            right={realErr ? <Chip tone="bad">unavailable</Chip> : real ? <Chip tone={retentionLive ? 'ok' : 'warn'}>{retentionLive ? 'live data' : 'partial data'}</Chip> : null}
          />
          <div className="px-5 pb-5">
            {realErr ? (
              <p className="t-12 text-faint py-4 text-center">Unavailable right now — YouTube Analytics didn&apos;t answer, so no numbers are shown (not zero).</p>
            ) : (
              <RetentionBars rows={retentionRows} goal={RETENTION_GOAL} />
            )}
            {!realErr && failedNames.length ? (
              <p className="t-11 text-faint mt-3">Unavailable right now: {failedNames.join(', ')}.</p>
            ) : null}
            {sel === 'all' && worst && retentionLive ? (
              <div className="inset-tile p-3 mt-4 flex gap-2.5">
                <Info size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--info)' }} />
                <p className="t-11 text-muted leading-relaxed">
                  <span className="font-semibold text-ink">The smoking gun:</span> {best?.name} holds {best?.pct}% while {worst?.name} sits at{' '}
                  {worst?.pct}%. Pick a channel above to see it alone.
                </p>
              </div>
            ) : best ? (
              <div className="inset-tile p-3 mt-4 flex gap-2.5">
                <Info size={14} className="shrink-0 mt-0.5" style={{ color: best?.pct >= RETENTION_GOAL ? 'var(--ok)' : 'var(--warn)' }} />
                <p className="t-11 text-muted leading-relaxed">
                  {best?.pct >= RETENTION_GOAL
                    ? `${best?.name} is above the ${RETENTION_GOAL}% goal — the feed is pushing it. Keep the current format.`
                    : `Below the ${RETENTION_GOAL}% goal — the first 2 seconds still lose people.`}
                </p>
              </div>
            ) : null}
          </div>
        </Card>

        {/* real views chart */}
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHead
            title="Views per day"
            sub="Real numbers · last 28 days from YouTube Analytics"
            icon={TrendingUp}
            right={realErr ? <Chip tone="bad">unavailable</Chip> : !real ? null : real.coverage?.failed?.length ? <Chip tone="warn">{real.coverage.ok.length} of {real.coverage.ok.length + real.coverage.failed.length} channels</Chip> : <Chip tone="ok">real data</Chip>}
          />
          <div className="px-2 pb-2">
            {realErr ? (
              <div className="px-4 py-10 text-center">
                <p className="t-12 text-faint">Analytics data unavailable right now — not zero, just unreadable.</p>
                <button className="btn btn-outline btn-sm mt-3" onClick={() => load(true)}><RefreshCw size={13} /> Retry</button>
              </div>
            ) : !real ? (
              <div className="px-4 py-10 space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="skeleton h-5" />)}</div>
            ) : real.daily.length ? (
              <div className="px-3">
                <MiniBars data={real.daily.map((d) => d.views)} labels={real.daily.map((d) => d.date.slice(5))} color="var(--accent)" height={170} ariaLabel={`Views per day, ${sel === 'all' ? 'all channels' : BRAND[sel]?.label || sel}`} />
              </div>
            ) : (
              <p className="t-12 text-faint px-4 py-10 text-center">No views recorded in this period.</p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-5">
        {/* shorts vs long */}
        <Card>
          <CardHead title="Shorts vs long-form" sub={split ? `Of the same ${fmt(split.total)} views, last 28 days` : 'Views in the last 28 days'} icon={Scissors} />
          <div className="px-5 pb-5">
            {realErr ? (
              <p className="t-12 text-faint py-6 text-center">Unavailable right now.</p>
            ) : !real ? (
              <div className="skeleton h-16" />
            ) : split ? (
              <>
                <div className="flex h-3.5 rounded-full overflow-hidden border border-line mb-3">
                  <div style={{ width: split.shortPct + '%', background: 'var(--accent)' }} />
                  <div style={{ width: split.longPct + '%', background: 'var(--info)' }} />
                  {split.other ? <div style={{ width: split.otherPct + '%', background: 'var(--surface-2)' }} /> : null}
                </div>
                <div className="space-y-2 t-12">
                  <p className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-muted"><Scissors size={13} /> Shorts</span>
                    <span className="tnum font-bold text-ink">{fmt(split.shorts)} · {split.shortPct}%</span>
                  </p>
                  <p className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-muted"><Film size={13} /> Long-form</span>
                    <span className="tnum font-bold text-ink">{fmt(split.long)} · {split.longPct}%</span>
                  </p>
                  {split.other ? (
                    <p className="flex items-center justify-between" title="Each channel's top 100 videos are sorted into Shorts or long-form. Views on the rest are counted here.">
                      <span className="text-muted">Not sorted (other videos)</span>
                      <span className="tnum font-bold text-ink">{fmt(split.other)} · {split.otherPct}%</span>
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="t-12 text-faint py-6 text-center">No views in this period yet.</p>
            )}
          </div>
        </Card>

        {/* audience: countries */}
        <Card>
          <CardHead title="Top countries" sub="Views where YouTube knows the country · 28 days" icon={Globe} />
          <div className="px-5 pb-5 space-y-2">
            {countries.map((c) => {
              const max = countries[0]?.views || 1;
              return (
                <div key={c.key}>
                  <div className="flex justify-between t-12 mb-0.5">
                    <span className="text-muted">{c.key}</span>
                    <span className="tnum font-semibold text-ink">{fmt(c.views)}</span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background: 'var(--surface-2)' }}>
                    <div className="h-full rounded-full" style={{ width: Math.max(3, (c.views / max) * 100) + '%', background: 'var(--accent)' }} />
                  </div>
                </div>
              );
            })}
            {!countries.length ? (
              <p className="t-12 text-faint py-4 text-center">{realErr ? 'Unavailable right now.' : !real ? 'Loading…' : 'No audience data yet.'}</p>
            ) : null}
          </div>
        </Card>

        {/* audience: age + gender */}
        <Card>
          <CardHead title="Who watches" sub="Age groups and gender, 28 days" icon={Users} />
          <div className="px-5 pb-5">
            {!(real?.audience?.age || []).length && !(real?.audience?.gender || []).length ? (
              <p className="t-12 text-faint py-4 text-center">{realErr ? 'Unavailable right now.' : !real ? 'Loading…' : 'No audience data yet.'}</p>
            ) : null}
            <div className="flex flex-wrap gap-2 mb-3">
              {(real?.audience?.gender || []).map((g) => (
                <span key={g.key} className="inset-tile px-2.5 py-1.5 t-11 font-semibold text-ink">
                  {GENDER_NAME[g.key] || g.key}: {Math.round((g.views / genderTotal) * 100)}%
                </span>
              ))}
            </div>
            <div className="space-y-1.5">
              {(real?.audience?.age || []).slice(0, 6).map((a) => {
                const max = real.audience.age[0]?.views || 1;
                return (
                  <div key={a.key} className="flex items-center gap-2">
                    <span className="t-11 text-muted w-12 font-mono">{a.key.replace('age', '')}</span>
                    <div className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--surface-2)' }}>
                      <div className="h-full rounded-full" style={{ width: Math.max(3, (a.views / max) * 100) + '%', background: 'var(--info)' }} />
                    </div>
                    <span className="t-11 tnum text-faint w-10 text-right">{fmt(a.views)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* audience split (followers) */}
        <Card>
          <CardHead title="Audience split" sub={sel === 'all' ? 'Followers by platform' : 'This channel, by platform'} icon={Users} />
          <div className="px-5 pb-5">
            <div className="space-y-2">
              {platformSlices.map((s) => (
                <div key={s.name} className="flex items-center gap-2 t-12">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
                  <span className="text-muted">{s.name}</span>
                  <span className="ml-auto tnum font-bold text-ink">{s.value == null ? '—' : fmt(s.value)}</span>
                </div>
              ))}
            </div>
            <p className="t-10 text-faint mt-3">Followers, not views.{platformTotal == null ? ' Total unavailable right now.' : ` Total ${fmt(platformTotal)}.`}</p>
          </div>
        </Card>

        {/* viewer search terms (real, from the Analytics API via the CI engine) */}
        <Card className="overflow-hidden">
          <CardHead
            title="Viewer search terms"
            sub="What viewers typed into YouTube before finding you · last 28 days"
            icon={Search}
            right={termsErr ? <Chip tone="bad">unavailable</Chip> : terms !== null ? <Chip tone="ok">real data</Chip> : null}
          />
          <div className="px-2 pb-2">
            {terms === null ? (
              <div className="px-3 py-6 space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-5" />)}</div>
            ) : termsErr ? (
              <div className="px-3 py-6 text-center">
                <p className="t-12 text-faint">Search terms unavailable right now — not an empty list.</p>
                <button className="btn btn-outline btn-sm mt-3" onClick={() => load(true)}><RefreshCw size={13} /> Retry</button>
              </div>
            ) : (
              <DataTable
                label="Viewer search terms"
                rows={keywords.map((k, i) => ({ ...k, id: `${k.term}-${i}` }))}
                emptyIcon={Search}
                emptyTitle="No search terms yet"
                emptySub="YouTube needs a few days of search traffic first."
                pageSize={8}
                columns={[
                  { key: 'term', label: 'Search term', rowHeader: true, render: (k) => (
                    <span className="flex items-center gap-2 t-12 font-medium text-ink truncate"><Search size={12} className="text-faint shrink-0" /> {k.term}</span>
                  ) },
                  { key: 'views', label: 'Views', render: (k) => <span className="tnum font-semibold t-12 text-ink">{fmt(k.views)}</span> },
                ]}
              />
            )}
          </div>
        </Card>

        {/* reports */}
        <Card>
          {/* T2-22 (wave C2): the real date, and a plain line when reports stopped */}
          <CardHead
            title="Reports"
            sub="Daily Excel reports from the reporting pipeline"
            icon={FileSpreadsheet}
            right={reportsNow?.stale ? <Chip tone="warn" dot>not current</Chip> : null}
          />
          <div className="px-3 pb-3">
            {reportsNow && !reportsErr ? (
              <p className="t-11 px-2 pb-2" role="status" style={reportsNow.stale ? { color: 'var(--warn-ink)' } : undefined}>{reportsNow.line}</p>
            ) : null}
            {reportsErr ? (
              <p className="t-12 text-faint py-6 text-center">Can&apos;t list reports right now.</p>
            ) : reports.length === 0 ? (
              <p className="t-12 text-faint py-6 text-center">No reports in the repo yet — the reporting pipeline drops them here.</p>
            ) : (
              reports.slice(0, 8).map((r) => (
                <div key={r.name} className="flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-surface-2 transition-colors">
                  <span className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ background: 'color-mix(in srgb, var(--ok) 12%, transparent)', color: 'var(--ok)' }}>
                    <FileSpreadsheet size={15} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block t-12 font-medium text-ink truncate font-mono">{r.name}</span>
                    <span className="block t-10 text-faint">{fmtDay(reportDay(r.name)) || '—'}{r.size ? ` · ${Math.round(r.size / 1024)} KB` : ''}</span>
                  </span>
                  {r.artifactId ? (
                    <a href={`/api/reports?download=${r.artifactId}`} className="btn btn-outline btn-sm whitespace-nowrap" title="Downloads a .zip with the Excel file inside (kept 30 days)">
                      Download
                    </a>
                  ) : (
                    <Chip>saved copy</Chip>
                  )}
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* moved from home (feedback r1): today's topics + trend radar */}
      <div className="grid lg:grid-cols-2 gap-4 mt-5">
        <Card className="overflow-hidden">
          <CardHead
            title="Today's researched topics"
            sub="The latest picks per channel — each shows the day it was picked (UTC)"
            icon={Radar}
          />
          <div className="px-4 pb-4">
            {ovErr ? (
              <p className="t-12 text-faint py-6 text-center">Topics unavailable right now — not an empty list.</p>
            ) : topicRows.length ? (
              <div className="grid gap-2.5">
                {topicRows.map((c) => (
                  <div key={c.slug} className="inset-tile p-3.5 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <BrandMark short={BRAND[c.slug]?.short || '•'} accent={c.accent || 'var(--accent)'} size={22} />
                      <span className="t-12 font-semibold text-ink truncate">{c.label || c.slug}</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {c.todayTopics?.length && c.todayTopicsAt ? <span className="t-10 text-faint">Shorts topics · picked {c.todayTopicsAt}</span> : null}
                      {(c.todayTopics || []).map((t, i) => (
                        <span key={i} className="t-11 text-muted leading-snug flex gap-1.5">
                          <ChevronRight size={12} aria-hidden className="shrink-0 mt-0.5" style={{ color: c.accent || 'var(--accent)' }} />
                          <span>from viral wave: “{t}”</span>
                        </span>
                      ))}
                      {c.episodeTopic ? (
                        <span className="t-11 text-muted leading-snug flex gap-1.5">
                          <ChevronRight size={12} aria-hidden className="shrink-0 mt-0.5 text-accent" />
                          <span>episode: “{c.episodeTopic}”{c.episodeTopicAt ? <span className="text-faint"> · picked {c.episodeTopicAt}</span> : null}</span>
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="t-12 text-faint py-6 text-center">No topics picked yet.</p>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHead title="Trend radar" sub="Live keywords + viral videos per niche" icon={Flame} />
          <div className="px-5 pb-5">
            {ovErr ? (
              <p className="t-12 text-faint py-6 text-center">Trends unavailable right now — not an empty radar.</p>
            ) : trendRows.length === 0 ? (
              <EmptyState icon={Radar} title="No trend cache yet" sub="Trends refresh with the next production batch." />
            ) : (
              trendRows.map(([slug, t]) => (
                <div key={slug} className="py-2.5 border-b border-line last:border-0 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <BrandMark short={BRAND[slug]?.short || '•'} accent={BRAND[slug]?.accent || 'var(--faint)'} size={20} />
                    <span className="t-12 font-semibold text-ink">{BRAND[slug]?.label || slug}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {(t.keywords || []).map((k) => (
                      <Chip key={k} tone="accent">{k}</Chip>
                    ))}
                  </div>
                  <p className="t-11 text-faint truncate">viral now: {(t.viral || []).map((v) => v.title).join(' · ').slice(0, 110)}</p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
