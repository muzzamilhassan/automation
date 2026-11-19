'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ScrollText, RefreshCw, ArrowUpRight, History, ListChecks, TriangleAlert, AlertTriangle } from 'lucide-react';
import { Card, Chip, PageHeader, PageSkeleton, EmptyState, BrandMark, Segmented } from '@/components/ui';
import { useBrands } from '@/components/use-brands'; // #125: live brand marks
import { timeAgo, when } from '@/lib/utils';
import DataTable from '@/components/DataTable';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'YouTube', label: 'YouTube' },
  { value: 'FB/IG', label: 'FB + IG' },
  { value: 'Facebook', label: 'Facebook' },
];

export default function Logs() {
  const { bySlug: BRAND } = useBrands(); // #125: live short/accent per slug

  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');
  const [tick, setTick] = useState(0);
  const [audit, setAudit] = useState([]);
  // a failed read is "can't load", never an empty log (honesty doctrine)
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/overview')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`the server answered ${r.status}`))))
      .then((d) => { if (alive) { setData(d); setErr(''); } })
      .catch((e) => { if (alive) setErr(e.message || 'network error'); })
      .finally(() => { if (alive) setBusy(false); });
    // the audit trail is owner/staff only — a refusal just hides the card
    fetch('/api/audit').then((r) => (r.ok ? r.json() : { events: [] })).then((d) => { if (alive) setAudit(d.events || []); }).catch(() => {});
    return () => { alive = false; };
  }, [tick]);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 60000);
    return () => clearInterval(t);
  }, []);

  const refresh = () => { setBusy(true); setTick((t) => t + 1); };
  if (err && !data) {
    return (
      <div>
        <PageHeader icon={ScrollText} title="Upload log" sub="Every post the machine made — newest first" />
        <Card className="p-4">
          <EmptyState icon={AlertTriangle} title="Can't load the upload log right now" sub={`${err} — this is not an empty log, it just couldn't be read.`}>
            <button className="btn btn-outline btn-sm mt-3" onClick={refresh} disabled={busy}><RefreshCw size={13} /> Retry</button>
          </EmptyState>
        </Card>
      </div>
    );
  }
  if (!data) return <PageSkeleton />;
  const logs = (data.logs || []).filter((l) => filter === 'all' || l.platform === filter || (filter === 'FB/IG' && (l.platform === 'FB/IG' || l.platform === 'Facebook')));

  return (
    <div>
      <PageHeader icon={ScrollText} title="Upload log" sub="Every post the machine made — newest first · auto-refreshes every minute">
        <Link href="/runs" className="btn btn-outline"><History size={16} /> Run history</Link>
        <button className="btn btn-outline" onClick={refresh} disabled={busy}>
          <RefreshCw size={16} className={busy ? 'animate-spin' : ''} /> Refresh
        </button>
      </PageHeader>
      {err ? <p className="t-12 mb-3" role="status" style={{ color: 'var(--warn-ink)' }}>Couldn&apos;t refresh ({err}) — showing the last list that loaded.</p> : null}

      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <Segmented options={FILTERS} value={filter} onChange={setFilter} />
        <span className="t-11 text-faint">{logs.length} entries</span>
      </div>

      {/* team activity (audit trail) */}
      {audit.length ? (
        <Card className="overflow-hidden mb-4">
          <div className="flex items-center gap-2 px-4 pt-4 pb-2">
            <ListChecks size={15} className="text-faint" />
            <span className="section-title">Team activity</span>
            <span className="t-10 text-faint ml-auto">who did what · newest first</span>
          </div>
          <div className="px-4 pb-4 space-y-1.5">
            {audit.slice(0, 12).map((e, i) => (
              <div key={i} className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1 inset-tile px-3 py-2 min-w-0">
                <span className="t-11 font-semibold text-ink truncate max-w-[11rem] shrink-0">{e.actor}</span>
                <Chip tone="accent">{e.action}</Chip>
                <span className="t-11 text-muted truncate flex-1 min-w-0">{e.detail}</span>
                <span className="t-10 text-faint tnum shrink-0">{timeAgo(e.at)}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden p-4">
        <DataTable
          label="Posting logs"
          rows={logs.map((l, i) => ({ ...l, id: `${l.videoId || l.slug}-${i}` }))}
          emptyIcon={ScrollText}
          emptyTitle="No posts match"
          emptySub="Try another filter, or run a job from Production."
          pageSize={12}
          columns={[
            { key: 'brand', label: 'Brand', render: (l) => <BrandMark short={BRAND[l.slug]?.short || '•'} accent={BRAND[l.slug]?.accent || 'var(--faint)'} size={26} /> },
            { key: 'at', label: 'When', render: (l) => (
              <span className="whitespace-nowrap">
                <span className="block t-12 text-ink tnum">{when(l.at)}</span>
                <span className="block t-10 text-faint">{timeAgo(l.at)}</span>
              </span>
            ) },
            { key: 'platform', label: 'Platform', render: (l) => <Chip tone={l.platform === 'YouTube' ? 'bad' : l.platform === 'FB/IG' ? 'accent' : 'info'}>{l.platform}</Chip> },
            { key: 'slug', label: 'Channel', render: (l) => <Link href={`/channels/${l.slug}`} className="text-muted t-12 hover:underline">{BRAND[l.slug]?.label || l.slug}</Link> },
            { key: 'kind', label: 'Kind', render: (l) => <Chip>{l.kind}</Chip> },
            { key: 'title', label: 'Title', rowHeader: true, render: (l) => <span className="block max-w-[360px] truncate text-ink" title={l.title}>{l.title}</span> },
            { key: 'open', label: 'Open', render: (l) => l.videoId ? (
              <a href={`https://youtube.com/shorts/${l.videoId}`} target="_blank" rel="noreferrer" aria-label="Open on YouTube" className="icon-btn">
                <ArrowUpRight size={15} />
              </a>
            ) : null },
          ]}
        />
      </Card>

      <Card className="p-4 mt-4 flex flex-wrap items-center gap-3">
        <div className="t-12 text-muted leading-relaxed flex-1 min-w-[220px]">
          <span className="font-semibold text-ink">Looking for a run that didn&apos;t upload?</span> Every GitHub Actions run — with its
          full log — is on Runs; anything that needs you lands in Warnings.
        </div>
        <Link href="/runs" className="btn btn-outline btn-sm"><History size={14} /> Runs</Link>
        <Link href="/warnings" className="btn btn-outline btn-sm"><TriangleAlert size={14} /> Warnings</Link>
      </Card>
    </div>
  );
}
