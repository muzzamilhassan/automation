'use client';
import { useEffect, useState } from 'react';
import {
  TrendingUp,
  Target,
  Search,
  FileSpreadsheet,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  Eye,
  Users,
} from 'lucide-react';
import { Card, CardHead, Chip, PageHeader, PageSkeleton, StatCard } from '@/components/ui';
import { MultiChart, Donut, RetentionBars, MiniBars } from '@/components/charts';
import { RETENTION, RETENTION_GOAL, VIEWS_SERIES, TRACKED_KEYWORDS, BRAND_META, DAILY_REPORTS } from '@/lib/site-data';
import { fmt } from '@/lib/utils';

export default function Analytics() {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetch('/api/overview').then((r) => r.json()).then(setData).catch(() => setData({ totals: {}, channels: [] }));
  }, []);
  if (!data) return <PageSkeleton />;

  const { totals = {}, channels = [] } = data;
  const active = channels.filter((c) => c.active);

  const retentionRows = RETENTION.map((r) => ({
    ...r,
    name: active.find((c) => c.slug === r.slug)?.label || r.slug,
    accent: BRAND_META[r.slug]?.accent || 'var(--accent)',
  }));

  const labels = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 86400000);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
  const series = active.map((c) => ({
    key: c.slug,
    name: BRAND_META[c.slug]?.short || c.slug,
    color: c.accent,
    data: VIEWS_SERIES[c.slug] || VIEWS_SERIES['quotequarry'],
  }));
  const dayTotals = labels.map((_, i) => series.reduce((a, s) => a + (s.data[i] || 0), 0));

  const weekBars = [6, 5, 7, 6, 8, 7, 8];
  const platformSlices = [
    { name: 'YouTube', value: totals.ytSubs || 0, color: '#ff4444' },
    { name: 'Facebook', value: totals.fbFollowers || 0, color: '#3b82f6' },
    { name: 'Instagram', value: totals.igFollowers || 0, color: '#ec4899' },
  ];
  const platformTotal = platformSlices.reduce((a, s) => a + s.value, 0) || 1;

  const best = [...retentionRows].sort((a, b) => b.pct - a.pct)[0];
  const worst = [...retentionRows].sort((a, b) => a.pct - b.pct)[0];

  return (
    <div>
      <PageHeader icon={TrendingUp} title="Analytics" sub="Retention, growth and search — what the numbers say and what to fix next" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <StatCard icon={Users} label="Total audience" value={platformTotal} fmt={fmt} />
        <StatCard icon={Eye} label="Total views" value={totals.ytViews || 0} fmt={fmt} color="var(--info)" iconBg="color-mix(in srgb, var(--info) 12%, transparent)" />
        <StatCard icon={Target} label="Best retention" value={Math.round(best?.pct || 0)} fmt={(v) => `${v}%`} color="var(--ok)" iconBg="color-mix(in srgb, var(--ok) 12%, transparent)" />
        <StatCard icon={Search} label="Tracked keywords" value={TRACKED_KEYWORDS.length} fmt={(v) => String(v)} color="var(--warn)" iconBg="color-mix(in srgb, var(--warn) 12%, transparent)" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-5">
        {/* retention */}
        <Card>
          <CardHead title="Average watched" sub="Audit of Sep 19 · % of each Short people actually watch" icon={Target} />
          <div className="px-5 pb-5">
            <RetentionBars rows={retentionRows} goal={RETENTION_GOAL} />
            <div className="inset-tile p-3 mt-4 flex gap-2.5">
              <Info size={14} className="text-info shrink-0 mt-0.5" style={{ color: 'var(--info)' }} />
              <p className="text-[11.5px] text-muted leading-relaxed">
                <span className="font-semibold text-ink">The smoking gun:</span> Quote Quarry holds {best?.pct}% while {worst?.name} sits at{' '}
                {worst?.pct}%. Same feed, same length — the script hook is what makes the difference. New 4-point scripts
                are live; judge them after 10 videos.
              </p>
            </div>
          </div>
        </Card>

        {/* views chart */}
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHead
            title="Views per day"
            sub="14-day trend per channel · sample data until the metrics API is wired"
            icon={TrendingUp}
            right={
              <div className="flex items-center gap-3">
                {series.map((s) => (
                  <span key={s.key} className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: s.color }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                    {s.name}
                  </span>
                ))}
              </div>
            }
          />
          <div className="px-2 pb-2">
            <MultiChart series={series} labels={labels} />
          </div>
          <div className="px-5 pb-5">
            <div className="overline mb-2">Uploads per day this week</div>
            <MiniBars data={weekBars} labels={['M', 'T', 'W', 'T', 'F', 'S', 'S']} color="var(--accent)" />
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* platform split */}
        <Card>
          <CardHead title="Audience split" sub="Followers by platform" icon={Users} />
          <div className="px-5 pb-5 flex items-center gap-5">
            <Donut
              slices={platformSlices}
              center={
                <>
                  <span className="stat-num text-[18px] text-ink">{fmt(platformTotal)}</span>
                  <span className="overline mt-0.5">people</span>
                </>
              }
            />
            <div className="space-y-2.5 min-w-0">
              {platformSlices.map((s) => (
                <div key={s.name} className="flex items-center gap-2 text-[12px]">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
                  <span className="text-muted">{s.name}</span>
                  <span className="ml-auto tnum font-bold text-ink">{Math.round((s.value / platformTotal) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* SEO */}
        <Card className="overflow-hidden">
          <CardHead title="Keyword radar" sub="US rankings from the in-pipeline checker" icon={Search} right={<Chip tone="accent">SEO pack live</Chip>} />
          <div className="px-2 pb-2">
            {TRACKED_KEYWORDS.map((k) => (
              <div key={k.kw} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-2 transition-colors">
                <span className="tnum font-display font-bold text-[13px] w-7 text-center shrink-0" style={{ color: k.pos <= 10 ? 'var(--ok)' : 'var(--ink)' }}>
                  #{k.pos}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[12px] font-medium text-ink truncate">{k.kw}</span>
                  <span className="block text-[10.5px] text-faint">{BRAND_META[k.channel]?.short || k.channel}</span>
                </span>
                {k.delta >= 0 ? (
                  <span className="flex items-center gap-0.5 text-[11px] font-bold" style={{ color: 'var(--ok)' }}>
                    <ArrowUpRight size={12} /> {k.delta}
                  </span>
                ) : (
                  <span className="flex items-center gap-0.5 text-[11px] font-bold" style={{ color: 'var(--bad)' }}>
                    <ArrowDownRight size={12} /> {Math.abs(k.delta)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* reports */}
        <Card>
          <CardHead title="Reports" sub="Daily Excel reports from the reporting pipeline" icon={FileSpreadsheet} />
          <div className="px-3 pb-3">
            {DAILY_REPORTS.map((r) => (
              <div key={r.name} className="flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-surface-2 transition-colors">
                <span className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ background: 'color-mix(in srgb, var(--ok) 12%, transparent)', color: 'var(--ok)' }}>
                  <FileSpreadsheet size={15} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[12px] font-medium text-ink truncate font-mono">{r.name}</span>
                  <span className="block text-[10.5px] text-faint">{r.when}</span>
                </span>
                <Chip>repo /reports</Chip>
              </div>
            ))}
            <div className="inset-tile p-3 mt-2 text-[11.5px] text-muted leading-relaxed">
              Retention is now a weekly metric: every report sheet tracks avg-watched per channel so you can see if the new
              scripts are lifting the 35–54% group.
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
