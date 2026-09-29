'use client';
import { useEffect, useMemo, useState } from 'react';
import { Film, Search, ArrowUpRight, Info } from 'lucide-react';
import { YoutubeIcon, FacebookIcon, InstagramIcon } from '@/components/BrandIcons';
import { Card, Chip, PageHeader, PageSkeleton, EmptyState, BrandMark, Segmented } from '@/components/ui';
import { BRAND_META } from '@/lib/site-data';
import { timeAgo, when } from '@/lib/utils';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'Short', label: 'Shorts' },
  { value: 'Episode', label: 'Episodes' },
  { value: 'Cross', label: 'Cross-posts' },
  { value: 'Image', label: 'Posters' },
];

const PLATFORM_ICON = { YouTube: YoutubeIcon, 'FB/IG': InstagramIcon, Facebook: FacebookIcon, Instagram: InstagramIcon };

export default function Videos() {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');

  useEffect(() => {
    fetch('/api/overview').then((r) => r.json()).then(setData).catch(() => setData({ logs: [] }));
  }, []);

  const logs = data?.logs || [];
  const filtered = useMemo(
    () =>
      logs.filter((l) => {
        if (filter === 'Short' && l.kind !== 'Short') return false;
        if (filter === 'Episode' && l.kind !== 'Episode') return false;
        if (filter === 'Image' && l.kind !== 'Image post') return false;
        if (filter === 'Cross' && !String(l.kind).startsWith('Cross')) return false;
        if (q && !String(l.title || '').toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      }),
    [logs, filter, q]
  );

  const counts = {
    all: logs.length,
    Short: logs.filter((l) => l.kind === 'Short').length,
    Episode: logs.filter((l) => l.kind === 'Episode').length,
    Cross: logs.filter((l) => String(l.kind).startsWith('Cross')).length,
    Image: logs.filter((l) => l.kind === 'Image post').length,
  };

  if (!data) return <PageSkeleton />;

  return (
    <div>
      <PageHeader icon={Film} title="Videos" sub="Everything the machine published — newest first, across all platforms">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search titles…"
            className="h-9 w-56 pl-9 pr-3 rounded-xl border border-line bg-surface text-[13px] text-ink placeholder:text-faint outline-none focus:border-line-strong"
          />
        </div>
      </PageHeader>

      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <Segmented options={FILTERS} value={filter} onChange={setFilter} />
        <span className="text-[11.5px] text-faint">
          {filtered.length} of {logs.length} · {counts.Short} shorts · {counts.Episode} episodes · {counts.Cross} cross-posts
        </span>
      </div>

      {data.mode === 'cloud' ? (
        <p className="text-[11.5px] text-muted mb-4 flex items-center gap-1.5">
          <Info size={13} className="text-faint shrink-0" />
          Cross-post rows (FB / IG / Threads) show on your PC build. The live site tracks YouTube uploads, episodes and posters —
          for reels see the GitHub Actions tab.
        </p>
      ) : null}

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState icon={Film} title="Nothing here" sub="No posts match this filter yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: 46 }}></th>
                  <th>Title</th>
                  <th>Channel</th>
                  <th>Kind</th>
                  <th>Platform</th>
                  <th>When</th>
                  <th style={{ width: 44 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l, i) => {
                  const Icon = PLATFORM_ICON[l.platform] || Film;
                  return (
                    <tr key={i}>
                      <td>
                        <BrandMark short={BRAND_META[l.slug]?.short || '•'} accent={BRAND_META[l.slug]?.accent || 'var(--faint)'} size={28} />
                      </td>
                      <td className="max-w-[340px]">
                        <span className="block truncate font-medium" title={l.title}>{l.title}</span>
                      </td>
                      <td className="text-muted text-[12px]">{l.slug}</td>
                      <td>
                        <Chip tone={l.kind === 'Episode' ? 'accent' : l.kind === 'Short' ? 'info' : 'plain'}>{l.kind}</Chip>
                      </td>
                      <td>
                        <span className="flex items-center gap-1.5 text-[12px] text-muted">
                          <Icon size={13} /> {l.platform}
                        </span>
                      </td>
                      <td className="text-muted text-[12px] tnum whitespace-nowrap" title={when(l.at)}>
                        {timeAgo(l.at)}
                      </td>
                      <td>
                        {l.videoId ? (
                          <a href={`https://youtube.com/shorts/${l.videoId}`} target="_blank" rel="noreferrer" className="icon-btn" style={{ width: 28, height: 28 }} aria-label="Open on YouTube">
                            <ArrowUpRight size={13} />
                          </a>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
