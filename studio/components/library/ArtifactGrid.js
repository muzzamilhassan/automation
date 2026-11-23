'use client';
// Creator City Phase 2 item 5 — one non-video Library tab (Scripts · Voice ·
// Thumbnails · Research). Channel rail with counts on desktop, chips on
// phones; real previews from /api/library/artifacts; click opens the viewer.
// Honest states: skeleton while loading, error + Retry, "Nothing here yet".
// Channel names come live from useBrands() — never a slug on screen.
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RotateCw, Download, FileText, Mic, Image as ImageIcon, Lightbulb } from 'lucide-react';
import { Card, Chip, EmptyState, BrandMark, Skeleton } from '@/components/ui';
import { useBrands } from '@/components/use-brands';
import { timeAgo, when } from '@/lib/utils';
import { fmtBytes, fmtDuration } from '@/lib/library-artifacts.mjs';
import ArtifactViewer, { StatusChip, goneText, itemUrl, probeReason, canDownload } from '@/components/library/ArtifactViewer';

const PAGE = 30;
const ICON = { script: FileText, voice: Mic, thumbnail: ImageIcon, research: Lightbulb };

function TimeAgo({ at }) {
  if (!at) return null;
  return <time dateTime={at} title={when(at)} className="tnum whitespace-nowrap">{timeAgo(at)}</time>;
}

function Meta({ item, brand, label, extra }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0 t-11 text-muted">
      <BrandMark short={brand?.short || '•'} accent={brand?.accent || 'var(--faint)'} size={16} />
      <span className="truncate">{label}</span>
      <span aria-hidden>·</span>
      <TimeAgo at={item.createdAt} />
      {extra ? <><span aria-hidden>·</span><span className="tnum whitespace-nowrap">{extra}</span></> : null}
    </div>
  );
}

function ScriptCard({ item, brand, label, onOpen }) {
  return (
    <button type="button" data-kit="tile" className="inset-tile p-3 text-left flex flex-col gap-2 min-w-0 w-full" onClick={onOpen}>
      <p className="t-13 font-semibold text-ink line-clamp-2 break-words">{item.title}</p>
      <Meta item={item} brand={brand} label={label} />
      {item.previewText ? <p className="t-12 text-muted line-clamp-3 whitespace-pre-line break-words">{item.previewText}</p> : null}
      {item.status || item.gone ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusChip status={item.status} />
          {item.gone ? <span className="t-11 text-faint">{goneText(item.gone)}</span> : null}
        </div>
      ) : null}
    </button>
  );
}

function ResearchCard({ item, brand, label, onOpen }) {
  return (
    <button type="button" data-kit="tile" className="inset-tile p-3 text-left flex flex-col gap-2 min-w-0 w-full" onClick={onOpen}>
      <p className="t-13 font-semibold text-ink line-clamp-2 break-words">{item.title}</p>
      {item.previewText ? <p className="t-12 text-muted line-clamp-2 break-words">{item.previewText}</p> : null}
      <Meta item={item} brand={brand} label={label} />
      <div className="flex items-center gap-1.5 flex-wrap">
        <Chip tone={item.sourceCount ? 'info' : 'plain'}>{item.sourceCount ? `${item.sourceCount} source${item.sourceCount === 1 ? '' : 's'}` : 'No sources'}</Chip>
        <StatusChip status={item.status} />
      </div>
    </button>
  );
}

function ThumbTile({ item, brand, label, onOpen }) {
  // null = fine; else the route's reason (asked once, on the <img> error)
  const [failReason, setFailReason] = useState(null);
  const reason = item.gone || failReason;
  return (
    <button type="button" data-kit="tile" className="inset-tile p-2 text-left flex flex-col gap-2 min-w-0 w-full" onClick={onOpen}>
      {reason ? (
        <div
          className="aspect-video w-full rounded-md flex items-center justify-center text-center p-2 t-11"
          style={{ background: 'var(--surface-2)', color: 'var(--faint)', border: '1px solid var(--line)' }}
        >
          {goneText(reason)}
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={itemUrl(item.id)}
          alt=""
          loading="lazy"
          onError={() => probeReason(item.id).then(setFailReason)}
          className="aspect-video w-full object-cover rounded-md"
          style={{ background: 'var(--surface-2)' }}
        />
      )}
      <p className="t-12 font-medium text-ink line-clamp-1 break-words">{item.title}</p>
      <Meta item={item} brand={brand} label={label} />
    </button>
  );
}

function VoiceRow({ item, brand, label, onOpen }) {
  const [dur, setDur] = useState(null);
  const [failReason, setFailReason] = useState(null); // the route's reason after a player error
  const reason = item.gone || failReason;
  const extra = [fmtDuration(dur), fmtBytes(item.bytes)].filter(Boolean).join(' · ');
  return (
    <li className="py-3 min-w-0">
      <div className="flex items-start gap-3 min-w-0">
        <div className="min-w-0 flex-1">
          <button type="button" className="t-13 font-semibold text-ink underline decoration-transparent hover:decoration-current text-left break-words" onClick={onOpen}>
            {item.title}
          </button>
          <div className="mt-1"><Meta item={item} brand={brand} label={label} extra={extra} /></div>
        </div>
        {!reason && canDownload(item) ? (
          <a href={`${itemUrl(item.id)}?download=1`} className="icon-btn shrink-0" aria-label={`Download ${item.title}`}>
            <Download size={15} />
          </a>
        ) : null}
      </div>
      {reason ? (
        <p className="t-12 text-faint mt-2">{goneText(reason)}</p>
      ) : (
        <audio
          controls
          preload="none"
          src={itemUrl(item.id)}
          onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
          onError={() => probeReason(item.id).then(setFailReason)}
          className="w-full mt-2 h-9"
        >
          <track kind="captions" />
        </audio>
      )}
    </li>
  );
}

function GridSkeleton({ kind }) {
  return (
    <div className={kind === 'thumbnail' ? 'grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3' : 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3'}>
      {[...Array(6)].map((_, i) => (
        <Skeleton key={i} className={kind === 'thumbnail' ? 'aspect-video rounded-xl' : 'h-32 rounded-xl'} />
      ))}
    </div>
  );
}

// one channel choice: rail row (desktop) or chip (phone)
function ChannelChoice({ selected, label, count, onPick, rail }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onPick}
      className={rail
        ? `btn btn-sm w-full justify-between ${selected ? 'btn-outline' : 'btn-ghost'}`
        : `btn btn-sm shrink-0 ${selected ? 'btn-primary' : 'btn-outline'}`}
    >
      <span className="truncate">{label}</span>
      <span className="tnum t-11 opacity-70">{count}</span>
    </button>
  );
}

export default function ArtifactGrid({ kind, channel, onChannel, counts: shellCounts }) {
  // hook values are used ONLY in this component (hook-scope rule)
  const { bySlug: BRAND, loaded: brandsLoaded } = useBrands();
  const [nonce, setNonce] = useState(0);
  const [res, setRes] = useState({ key: null, data: null, error: null });
  const [more, setMore] = useState({ key: null, items: [], nextBefore: null, busy: false, error: null });
  const [open, setOpen] = useState(null);

  const fetchKey = `${kind}|${channel}|${nonce}`;

  useEffect(() => {
    let alive = true;
    const qs = new URLSearchParams({ kind, limit: String(PAGE) });
    if (channel !== 'all') qs.set('channel', channel);
    fetch(`/api/library/artifacts?${qs}`)
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
  }, [kind, channel, fetchKey]);

  const loading = res.key !== fetchKey;
  const data = loading ? null : res.data;
  const extra = more.key === fetchKey ? more : null;
  const items = useMemo(() => [...(data?.items || []), ...(extra?.items || [])], [data, extra]);
  const nextBefore = extra ? extra.nextBefore : data?.nextBefore || null;

  const counts = (data?.counts || shellCounts)?.[kind] || null;
  const labelOf = (slug) => BRAND[slug]?.label || (brandsLoaded ? 'Unlisted channel' : '…');
  const rail = useMemo(() => {
    const by = counts?.byChannel || {};
    const rows = Object.entries(by).map(([slug, n]) => ({ slug, n })).sort((a, b) => b.n - a.n);
    if (channel !== 'all' && !by[channel]) rows.push({ slug: channel, n: 0 });
    return rows;
  }, [counts, channel]);

  const loadMore = () => {
    if (!nextBefore) return;
    const key = fetchKey;
    setMore((m) => ({ ...(m.key === key ? m : { items: [] }), key, nextBefore, busy: true, error: null }));
    const qs = new URLSearchParams({ kind, limit: String(PAGE), before: nextBefore });
    if (channel !== 'all') qs.set('channel', channel);
    fetch(`/api/library/artifacts?${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('http'))))
      .then((next) => setMore((m) => (m.key === key
        ? { key, items: [...m.items, ...(next.items || [])], nextBefore: next.nextBefore || null, busy: false, error: null }
        : m)))
      .catch(() => setMore((m) => (m.key === key ? { ...m, busy: false, error: "Couldn't load more — try again." } : m)));
  };

  const choices = [{ slug: 'all', label: 'All channels', n: counts?.total ?? 0 }, ...rail.map((r) => ({ ...r, label: labelOf(r.slug) }))];
  const Icon = ICON[kind] || FileText;
  const openItem = items.find((it) => it.id === open) || null;

  const body = loading ? (
    <GridSkeleton kind={kind} />
  ) : res.error ? (
    <Card className="p-5">
      <div className="flex items-start gap-3 flex-wrap">
        <AlertTriangle size={18} style={{ color: 'var(--bad)' }} className="shrink-0 mt-0.5" aria-hidden />
        <p className="t-14 font-semibold text-ink flex-1 min-w-0">
          {res.error === 'signed-out' ? "You're signed out." : "Couldn't load this list right now."}
        </p>
        {res.error === 'signed-out' ? (
          <a href="/login?next=/videos" className="btn btn-sm btn-primary shrink-0">Sign in</a>
        ) : (
          <button type="button" className="btn btn-sm btn-outline shrink-0" onClick={() => setNonce((n) => n + 1)}>
            <RotateCw size={13} aria-hidden /> Retry
          </button>
        )}
      </div>
    </Card>
  ) : !items.length ? (
    <Card className="p-4">
      <EmptyState icon={Icon} title="Nothing here yet" />
    </Card>
  ) : (
    <>
      {kind === 'voice' ? (
        <Card className="px-4 py-1">
          <ul className="divide-y divide-[var(--line)]">
            {items.map((it) => (
              <VoiceRow key={it.id} item={it} brand={BRAND[it.channel]} label={labelOf(it.channel)} onOpen={() => setOpen(it.id)} />
            ))}
          </ul>
        </Card>
      ) : kind === 'thumbnail' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {items.map((it) => (
            <ThumbTile key={it.id} item={it} brand={BRAND[it.channel]} label={labelOf(it.channel)} onOpen={() => setOpen(it.id)} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {items.map((it) => (kind === 'research'
            ? <ResearchCard key={it.id} item={it} brand={BRAND[it.channel]} label={labelOf(it.channel)} onOpen={() => setOpen(it.id)} />
            : <ScriptCard key={it.id} item={it} brand={BRAND[it.channel]} label={labelOf(it.channel)} onOpen={() => setOpen(it.id)} />))}
        </div>
      )}
      {nextBefore ? (
        <div className="mt-4 flex flex-col items-center gap-1">
          <button type="button" className="btn btn-sm btn-outline" onClick={loadMore} disabled={!!extra?.busy}>
            {extra?.busy ? 'Loading…' : 'Load more'}
          </button>
          {extra?.error ? <span className="t-11" style={{ color: 'var(--bad-ink)' }}>{extra.error}</span> : null}
        </div>
      ) : null}
    </>
  );

  return (
    <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-5 min-w-0">
      {/* desktop: channel rail */}
      <nav aria-label="Channels" className="hidden lg:block">
        <div className="flex flex-col gap-0.5 sticky top-4">
          {choices.map((c) => (
            <ChannelChoice key={c.slug} rail selected={channel === c.slug} label={c.label} count={c.n} onPick={() => onChannel(c.slug)} />
          ))}
        </div>
      </nav>
      <div className="min-w-0">
        {/* phone + tablet: channel chips (scroll inside the row, never the page) */}
        <div className="lg:hidden flex gap-1.5 overflow-x-auto max-w-full pb-2 mb-2" role="group" aria-label="Channels">
          {choices.map((c) => (
            <ChannelChoice key={c.slug} selected={channel === c.slug} label={c.label} count={c.n} onPick={() => onChannel(c.slug)} />
          ))}
        </div>
        {body}
      </div>
      <ArtifactViewer
        item={openItem}
        open={!!openItem}
        onClose={() => setOpen(null)}
        brand={openItem ? BRAND[openItem.channel] : null}
        label={openItem ? labelOf(openItem.channel) : ''}
      />
    </div>
  );
}
