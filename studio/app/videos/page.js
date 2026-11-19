'use client';
// Phase 3 "Library" — every upload the panel has a record of (/api/library),
// not the 40-row activity slice. Channel names come live from useBrands()
// (never slugs); a failed source is shown as "may be missing videos", never
// as a complete list.
import { Suspense, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Film, Search, ArrowUpRight, AlertTriangle, RotateCw, Copy } from 'lucide-react';
import { Card, Chip, PageHeader, PageSkeleton, EmptyState, BrandMark, Segmented } from '@/components/ui';
import { useBrands } from '@/components/use-brands'; // #125: live channel names + marks
import { when, timeAgo } from '@/lib/utils';
import { filterLibrary, KIND_LABEL } from '@/lib/library-view.mjs';
import DataTable from '@/components/DataTable';

const FETCH_LIMIT = 200; // the route's max page
const STEP = 24; // grid / phone list reveal step

export default function VideosPage() {
  // useSearchParams needs a Suspense boundary (brief rule 7)
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Library />
    </Suspense>
  );
}

// ---- small presentational pieces (props only — no hooks' values leak in) ----

function Thumb({ item, className = '', showLabel = false }) {
  const [broken, setBroken] = useState(false);
  if (item.thumb && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.thumb}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        className={`aspect-video object-cover rounded-md shrink-0 ${className}`}
        style={{ background: 'var(--surface-2)' }}
      />
    );
  }
  // honest placeholder — never a stand-in picture
  const why = item.status === 'scheduled' ? 'Not live yet' : item.videoId ? 'No preview' : 'No link recorded';
  return (
    <div
      className={`aspect-video rounded-md shrink-0 flex flex-col items-center justify-center gap-1 ${className}`}
      style={{ background: 'var(--surface-2)', color: 'var(--faint)', border: '1px solid var(--line)' }}
      title={why}
    >
      <Film size={showLabel ? 20 : 14} strokeWidth={1.8} aria-hidden />
      {showLabel ? <span className="t-11">{why}</span> : null}
    </div>
  );
}

function StatusChip({ item }) {
  if (item.status === 'scheduled') return <Chip tone="info" dot>Scheduled</Chip>;
  if (item.status === 'published') return <Chip tone="ok" dot>Published</Chip>;
  return <Chip tone="plain">Time unknown</Chip>;
}

function KindChip({ kind }) {
  return <Chip tone={kind === 'long' ? 'accent' : kind === 'short' ? 'info' : 'plain'}>{KIND_LABEL[kind] || 'Video'}</Chip>;
}

// future-aware: scheduled items read "in 6h", never "just now"
function TimeText({ item }) {
  if (!item.at) return <span className="t-11 text-faint">—</span>;
  return (
    <time dateTime={item.at} title={when(item.at)} className="t-11 text-faint tnum whitespace-nowrap">
      {timeAgo(item.at)}
    </time>
  );
}

function OpenLink({ item, compact = false }) {
  if (!item.url) {
    return (
      <span className="t-11 text-faint whitespace-nowrap" title="This upload was logged without its YouTube link">
        No link
      </span>
    );
  }
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer noopener"
      className={compact ? 'icon-btn shrink-0' : 'btn btn-sm btn-outline whitespace-nowrap shrink-0'}
      aria-label={`Open "${item.title || 'video'}" on YouTube`}
    >
      {compact ? <ArrowUpRight size={15} /> : <>Open <ArrowUpRight size={13} /></>}
    </a>
  );
}

function DupChip({ item }) {
  if (!item.dupTitle) return null;
  return (
    <span title="Another upload on this channel has the same title — check YouTube for a double upload">
      <Chip tone="warn"><Copy size={11} className="inline -mt-px mr-1" aria-hidden />Possible duplicate</Chip>
    </span>
  );
}

// phone/tablet row: thumbnail, title, one meta line, Open — nothing off-screen
function StackRow({ item, brand, label }) {
  return (
    <li className="flex items-center gap-3 py-3 min-w-0">
      <Thumb item={item} className="w-24" />
      <div className="min-w-0 flex-1">
        <p className="t-13 font-medium text-ink line-clamp-2 break-words">{item.title || 'Untitled upload'}</p>
        <div className="mt-1 flex items-center gap-1.5 flex-wrap t-11 text-muted min-w-0">
          <BrandMark short={brand?.short || '•'} accent={brand?.accent || 'var(--faint)'} size={16} />
          <span className="truncate max-w-[10rem]">{label}</span>
          <span aria-hidden>·</span>
          <span>{KIND_LABEL[item.kind] || 'Video'}</span>
          <span aria-hidden>·</span>
          <span style={item.status === 'scheduled' ? { color: 'var(--info-ink)' } : undefined}>
            {item.status === 'scheduled' ? 'Scheduled' : item.status === 'published' ? 'Published' : 'Time unknown'}
          </span>
          <TimeText item={item} />
        </div>
        {item.dupTitle ? <div className="mt-1"><DupChip item={item} /></div> : null}
      </div>
      <OpenLink item={item} compact />
    </li>
  );
}

function GridCard({ item, brand, label }) {
  return (
    <Card className="p-3 flex flex-col gap-2 min-w-0">
      <Thumb item={item} className="w-full" showLabel />
      <p className="t-13 font-medium text-ink line-clamp-2 break-words">{item.title || 'Untitled upload'}</p>
      <div className="flex items-center gap-1.5 min-w-0 t-11 text-muted">
        <BrandMark short={brand?.short || '•'} accent={brand?.accent || 'var(--faint)'} size={16} />
        <span className="truncate">{label}</span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <KindChip kind={item.kind} />
        <StatusChip item={item} />
        <TimeText item={item} />
        <DupChip item={item} />
      </div>
      <div className="mt-auto pt-1 flex justify-end">
        <OpenLink item={item} />
      </div>
    </Card>
  );
}

function ShowMore({ shown, total, onMore }) {
  if (shown >= total) return null;
  return (
    <div className="mt-4 flex justify-center">
      <button type="button" className="btn btn-sm btn-outline" onClick={onMore}>
        Show more ({total - shown} left)
      </button>
    </div>
  );
}

// ---- the page ------------------------------------------------------------------

function Library() {
  // hook values are used ONLY in this component (hook-scope rule)
  const { bySlug: BRAND, channels, loaded: brandsLoaded } = useBrands();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const channel = searchParams.get('channel') || 'all';

  const [kind, setKind] = useState('all');
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [view, setView] = useState('table');
  const [nonce, setNonce] = useState(0); // Retry bumps this
  // keyed result: a stale key = loading, so no synchronous setState in effects
  const [res, setRes] = useState({ key: null, data: null, error: null });
  const [more, setMore] = useState({ key: '', n: 0 });
  const [older, setOlder] = useState({ busy: false, error: null });

  const fetchKey = `${channel}#${nonce}`;

  useEffect(() => {
    let alive = true;
    const qs = new URLSearchParams({ limit: String(FETCH_LIMIT), offset: '0' });
    if (channel !== 'all') qs.set('slug', channel);
    fetch(`/api/library?${qs}`)
      .then(async (r) => {
        if (r.status === 401) throw new Error('signed-out');
        if (!r.ok) throw new Error('http');
        return r.json();
      })
      .then((data) => alive && setRes({ key: fetchKey, data, error: null }))
      .catch((e) => alive && setRes({ key: fetchKey, data: null, error: e.message === 'signed-out' ? 'signed-out' : 'failed' }));
    return () => {
      alive = false;
    };
  }, [channel, fetchKey]);

  const loading = res.key !== fetchKey;
  const data = loading ? null : res.data;
  const items = useMemo(() => data?.items || [], [data]);
  const filtered = useMemo(() => filterLibrary(items, { kind, status, q }), [items, kind, status, q]);

  const filterKey = `${fetchKey}|${kind}|${status}|${q}|${view}`;
  const shown = STEP + (more.key === filterKey ? more.n : 0);

  const brandOf = (slug) => BRAND[slug] || null;
  const labelOf = (slug) => BRAND[slug]?.label || (brandsLoaded ? 'Unlisted channel' : '…');

  const setChannel = (v) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (v === 'all') sp.delete('channel');
    else sp.set('channel', v);
    const s = sp.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  const loadOlder = () => {
    if (!data) return;
    setOlder({ busy: true, error: null });
    const qs = new URLSearchParams({ limit: String(FETCH_LIMIT), offset: String(items.length) });
    if (channel !== 'all') qs.set('slug', channel);
    fetch(`/api/library?${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('http'))))
      .then((next) => {
        setRes((prev) => (prev.key === fetchKey && prev.data
          ? { ...prev, data: { ...prev.data, items: [...prev.data.items, ...(next.items || [])], total: next.total ?? prev.data.total } }
          : prev));
        setOlder({ busy: false, error: null });
      })
      .catch(() => setOlder({ busy: false, error: "Couldn't load older videos — try again." }));
  };

  const counts = data?.counts || null;
  const kindOptions = [
    { value: 'all', label: counts ? `All · ${counts.all}` : 'All' },
    { value: 'short', label: counts ? `Shorts · ${counts.short}` : 'Shorts' },
    { value: 'long', label: counts ? `Episodes · ${counts.long}` : 'Episodes' },
    ...(counts?.other ? [{ value: 'other', label: `Re-uploads · ${counts.other}` }] : []),
  ];
  const statusOptions = [
    { value: 'all', label: 'Any status' },
    { value: 'published', label: counts ? `Published · ${counts.published}` : 'Published' },
    { value: 'scheduled', label: counts ? `Scheduled · ${counts.scheduled}` : 'Scheduled' },
  ];
  const filtersActive = kind !== 'all' || status !== 'all' || q.trim() !== '';
  const clearFilters = () => {
    setKind('all');
    setStatus('all');
    setQ('');
  };
  const total = data?.total ?? 0;
  const partialLoad = data && items.length < total;
  const channelLabel = channel === 'all' ? 'all channels' : labelOf(channel);

  const columns = [
    { key: 'thumb', label: 'Preview', render: (it) => <Thumb item={it} className="w-28" /> },
    {
      key: 'title',
      label: 'Title',
      rowHeader: true,
      render: (it) => (
        <div className="min-w-0 max-w-[420px]">
          <span className="block t-13 font-medium text-ink line-clamp-2 whitespace-normal break-words" title={it.title}>
            {it.title || 'Untitled upload'}
          </span>
          {it.dupTitle ? <div className="mt-1"><DupChip item={it} /></div> : null}
        </div>
      ),
    },
    {
      key: 'channel',
      label: 'Channel',
      render: (it) => {
        const b = brandOf(it.slug);
        return (
          <span className="flex items-center gap-2 min-w-0">
            <BrandMark short={b?.short || '•'} accent={b?.accent || 'var(--faint)'} size={22} />
            <span className="t-12 text-muted truncate max-w-[160px]">{labelOf(it.slug)}</span>
          </span>
        );
      },
    },
    { key: 'kind', label: 'Type', render: (it) => <KindChip kind={it.kind} /> },
    {
      key: 'status',
      label: 'Status',
      render: (it) => (
        <span className="flex flex-col items-start gap-0.5 whitespace-nowrap">
          <StatusChip item={it} />
          <TimeText item={it} />
        </span>
      ),
    },
    { key: 'open', label: 'Open', render: (it) => <OpenLink item={it} /> },
  ];

  return (
    <div className="min-w-0">
      <PageHeader icon={Film} title="Library" sub="Every upload the panel has a record of — newest first">
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search titles…"
            aria-label="Search video titles"
            className="h-9 w-full pl-9 pr-3 rounded-xl border border-line bg-surface t-13 text-ink placeholder:text-faint outline-none focus:border-line-strong"
          />
        </div>
      </PageHeader>

      {/* filters — wrap on phones, never overflow */}
      <div className="flex items-center gap-2 mb-3 flex-wrap min-w-0">
        <label className="sr-only" htmlFor="library-channel">Channel</label>
        <select
          id="library-channel"
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          className="h-9 max-w-full rounded-xl border border-line bg-surface px-3 t-13 text-ink outline-none focus:border-line-strong"
        >
          <option value="all">All channels</option>
          {channels.map((c) => (
            <option key={c.slug} value={c.slug}>{c.label}</option>
          ))}
          {/* a ?channel= not in the live list still shows as selected — never silently "All" */}
          {channel !== 'all' && !BRAND[channel] ? <option value={channel}>{labelOf(channel)}</option> : null}
        </select>
        <Segmented options={kindOptions} value={kind} onChange={setKind} className="max-w-full overflow-x-auto" />
        <Segmented options={statusOptions} value={status} onChange={setStatus} className="max-w-full overflow-x-auto" />
        <Segmented
          options={[
            { value: 'table', label: 'List' },
            { value: 'grid', label: 'Grid' },
          ]}
          value={view}
          onChange={setView}
          className="ml-auto"
        />
      </div>

      {loading ? (
        <PageSkeleton />
      ) : res.error ? (
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} style={{ color: 'var(--bad)' }} className="shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="t-14 font-semibold text-ink">
                {res.error === 'signed-out' ? "You're signed out." : "Couldn't load your videos right now."}
              </p>
              <p className="t-12 text-muted mt-1">
                {res.error === 'signed-out'
                  ? 'Sign in again to see the library.'
                  : 'This is not an empty library — the list just could not be read. Try again in a moment.'}
              </p>
            </div>
            {res.error !== 'signed-out' ? (
              <button type="button" className="btn btn-sm btn-outline shrink-0" onClick={() => setNonce((n) => n + 1)}>
                <RotateCw size={13} aria-hidden /> Retry
              </button>
            ) : (
              <a href="/login?next=/videos" className="btn btn-sm btn-primary shrink-0">Sign in</a>
            )}
          </div>
        </Card>
      ) : (
        <>
          {data.errors?.length ? (
            <div
              role="status"
              className="mb-3 rounded-xl p-3 flex items-start gap-2.5 flex-wrap"
              style={{ background: 'color-mix(in srgb, var(--warn) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--warn) 35%, transparent)' }}
            >
              <AlertTriangle size={15} style={{ color: 'var(--warn-ink)' }} className="shrink-0 mt-0.5" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="t-13 font-semibold" style={{ color: 'var(--warn-ink)' }}>This list may be missing videos.</p>
                <ul className="t-12 text-muted mt-0.5">
                  {data.errors.map((e) => <li key={e.source}>{e.message}</li>)}
                </ul>
              </div>
              <button type="button" className="btn btn-sm btn-outline shrink-0" onClick={() => setNonce((n) => n + 1)}>
                <RotateCw size={13} aria-hidden /> Retry
              </button>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap t-11 text-faint">
            <span className="tnum">
              {filtered.length} shown · {total} recorded for {channelLabel}
              {partialLoad ? ` · newest ${items.length} loaded` : ''}
            </span>
            {filtersActive ? (
              <button type="button" className="btn btn-sm btn-outline" onClick={clearFilters}>Clear filters</button>
            ) : null}
          </div>

          {!items.length ? (
            <Card className="p-4">
              <EmptyState
                icon={Film}
                title={data.complete ? 'No uploads recorded yet' : 'No videos could be read'}
                sub={data.complete
                  ? `Nothing has been uploaded for ${channelLabel} yet. New uploads appear here automatically.`
                  : 'Part of the upload history could not be read, so this may not be the whole picture.'}
              />
            </Card>
          ) : !filtered.length ? (
            <Card className="p-4">
              <EmptyState icon={Search} title="No videos match these filters" sub="Try another type, status or search — or clear the filters." />
            </Card>
          ) : view === 'grid' ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {filtered.slice(0, shown).map((it) => (
                  <GridCard key={it.id} item={it} brand={brandOf(it.slug)} label={labelOf(it.slug)} />
                ))}
              </div>
              <ShowMore shown={shown} total={filtered.length} onMore={() => setMore({ key: filterKey, n: shown })} />
            </>
          ) : (
            <>
              {/* desktop: the table */}
              <Card className="overflow-hidden p-4 hidden lg:block">
                <DataTable
                  label="Video library"
                  rows={filtered}
                  columns={columns}
                  pageSize={25}
                  emptyIcon={Film}
                  emptyTitle="No videos match these filters"
                />
              </Card>
              {/* phone + tablet: a stacked list — status and Open stay on screen */}
              <Card className="px-4 py-1 lg:hidden">
                <ul className="divide-y divide-[var(--line)]">
                  {filtered.slice(0, shown).map((it) => (
                    <StackRow key={it.id} item={it} brand={brandOf(it.slug)} label={labelOf(it.slug)} />
                  ))}
                </ul>
              </Card>
              <div className="lg:hidden">
                <ShowMore shown={shown} total={filtered.length} onMore={() => setMore({ key: filterKey, n: shown })} />
              </div>
            </>
          )}

          {partialLoad ? (
            <div className="mt-4 flex flex-col items-center gap-1">
              <button type="button" className="btn btn-sm btn-outline" onClick={loadOlder} disabled={older.busy}>
                {older.busy ? 'Loading…' : `Load older videos (${total - items.length} more)`}
              </button>
              {older.error ? <span className="t-11" style={{ color: 'var(--bad-ink)' }}>{older.error}</span> : null}
              {filtersActive ? <span className="t-11 text-faint">Filters and search only cover the videos loaded so far.</span> : null}
            </div>
          ) : null}

          {data.notes?.length ? (
            <ul className="mt-4 t-11 text-faint space-y-0.5">
              {data.notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}
