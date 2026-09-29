'use client';
import { useEffect, useState } from 'react';
import { ScrollText, RefreshCw, ArrowUpRight, FolderOpen, Terminal } from 'lucide-react';
import { Card, Chip, PageHeader, PageSkeleton, EmptyState, BrandMark, Segmented } from '@/components/ui';
import { BRAND_META } from '@/lib/site-data';
import { timeAgo, when } from '@/lib/utils';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'YouTube', label: 'YouTube' },
  { value: 'FB/IG', label: 'FB + IG' },
  { value: 'Facebook', label: 'Facebook' },
];

export default function Logs() {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    fetch('/api/overview').then((r) => r.json()).then(setData).catch(() => setData({ logs: [] }));
  }, [tick]);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 60000);
    return () => clearInterval(t);
  }, []);

  if (!data) return <PageSkeleton />;
  const logs = (data.logs || []).filter((l) => filter === 'all' || l.platform === filter || (filter === 'FB/IG' && (l.platform === 'FB/IG' || l.platform === 'Facebook')));

  return (
    <div>
      <PageHeader icon={ScrollText} title="Posting logs" sub="Every post the machine made — newest first · auto-refreshes every minute">
        <button className="btn btn-outline" onClick={() => setTick((t) => t + 1)}>
          <RefreshCw size={14} /> Refresh now
        </button>
      </PageHeader>

      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <Segmented options={FILTERS} value={filter} onChange={setFilter} />
        <span className="text-[11.5px] text-faint">{logs.length} entries</span>
      </div>

      <Card className="overflow-hidden">
        {logs.length === 0 ? (
          <EmptyState icon={ScrollText} title="No posts match" sub="Try another filter, or run a job from Production." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: 42 }}></th>
                  <th>When</th>
                  <th>Platform</th>
                  <th>Channel</th>
                  <th>Kind</th>
                  <th>Title</th>
                  <th style={{ width: 44 }}></th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l, i) => (
                  <tr key={i}>
                    <td>
                      <BrandMark short={BRAND_META[l.slug]?.short || '•'} accent={BRAND_META[l.slug]?.accent || 'var(--faint)'} size={26} />
                    </td>
                    <td className="whitespace-nowrap">
                      <span className="block text-[12.5px] text-ink tnum">{when(l.at)}</span>
                      <span className="block text-[10.5px] text-faint">{timeAgo(l.at)}</span>
                    </td>
                    <td><Chip tone={l.platform === 'YouTube' ? 'bad' : l.platform === 'FB/IG' ? 'accent' : 'info'}>{l.platform}</Chip></td>
                    <td className="text-muted text-[12px]">{l.slug}</td>
                    <td><Chip>{l.kind}</Chip></td>
                    <td className="max-w-[360px]">
                      <span className="block truncate" title={l.title}>{l.title}</span>
                    </td>
                    <td>
                      {l.videoId ? (
                        <a href={`https://youtube.com/shorts/${l.videoId}`} target="_blank" rel="noreferrer" className="icon-btn" style={{ width: 28, height: 28 }} aria-label="Open on YouTube">
                          <ArrowUpRight size={13} />
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid md:grid-cols-2 gap-4 mt-4">
        <Card className="p-4 flex items-start gap-3">
          <FolderOpen size={16} className="text-faint mt-0.5 shrink-0" />
          <div className="text-[12px] text-muted leading-relaxed">
            <span className="font-semibold text-ink">Raw run output.</span> Every manual job writes to{' '}
            <code className="font-mono text-accent">studio-logs/</code> in the repo — one file per run with the full script output.
          </div>
        </Card>
        <Card className="p-4 flex items-start gap-3">
          <Terminal size={16} className="text-faint mt-0.5 shrink-0" />
          <div className="text-[12px] text-muted leading-relaxed">
            <span className="font-semibold text-ink">Scheduled runs.</span> GitHub Actions runs write to Actions logs, and every
            milestone pings your phone through ntfy (topic <code className="font-mono text-accent">quarry-x7f2k-reports</code>).
          </div>
        </Card>
      </div>
    </div>
  );
}
