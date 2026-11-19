'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ListChecks, Flame, Search, Plus, X, PenLine, RefreshCw, Clock3, AlertTriangle } from 'lucide-react';
import { Card, CardHead, Chip, PageHeader, PageSkeleton, EmptyState, BrandMark, Segmented } from '@/components/ui';
import { useBrands } from '@/components/use-brands'; // #125: live brand marks
import { fmt } from '@/lib/utils';

// 10-05 PHASE B — TOPIC DESK: research proposes, you approve, the nightly run
// consumes your picks first (one per slot per day) before auto-research.

export default function TopicDesk() {
  const { bySlug: BRAND } = useBrands(); // #125: live short/accent per slug

  const [ov, setOv] = useState(null);
  const [reg, setReg] = useState(null);
  const [sel, setSel] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  // a failed read is NOT "no research / empty queue" — say so (honesty doctrine)
  const [loadErr, setLoadErr] = useState('');
  const [actErr, setActErr] = useState('');

  useEffect(() => {
    fetch('/api/overview').then((r) => r.json()).then(setOv).catch(() => setOv({ channels: [] }));
    fetch('/api/channels/registry').then((r) => r.json()).then(setReg).catch(() => setReg({ channels: [] }));
  }, []);

  const options = (() => {
    const legacy = (ov?.channels || []).filter((c) => c.active).map((c) => ({ value: c.slug, label: BRAND[c.slug]?.short || c.slug }));
    const mine = (reg?.channels || [])
      .filter((c) => c.active !== false && !legacy.some((l) => l.value === c.slug))
      .map((c) => ({ value: c.slug, label: (c.label || c.slug).slice(0, 6).toUpperCase() }));
    return [...legacy, ...mine];
  })();

  // deferred one tick so the setState isn't synchronous in the effect body
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (!sel && options.length) setSel(options[0].value);
    });
    return () => cancelAnimationFrame(id);
  }, [options.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = async () => {
    if (!sel) return;
    setLoading(true);
    setLoadErr('');
    await fetch('/api/topics?slug=' + encodeURIComponent(sel))
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d.error) throw new Error(d.error || `the server answered ${r.status}`);
        setData(d);
      })
      .catch((e) => { setData(null); setLoadErr(e.message || 'network error'); })
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    let alive = true;
    (async () => {
      await Promise.resolve();
      if (alive) await load();
    })();
    return () => {
      alive = false;
    };
  }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps

  // shared POST: a refused/failed write is shown, never swallowed
  const post = async (body, what) => {
    setBusy(true);
    setActErr('');
    try {
      const r = await fetch('/api/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: sel, ...body }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || `the server answered ${r.status}`);
      setData((x) => ({ ...(x || {}), queue: d.queue }));
      return true;
    } catch (e) {
      setActErr(`Couldn't ${what} — ${e.message || 'network error'}. Nothing changed.`);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const addTopics = (topics) => post({ action: 'add', topics }, 'add that topic');
  const removeTopic = (id) => post({ action: 'remove', id }, 'remove that topic');
  const addManual = async () => {
    const text = manual.trim();
    if (!text) return;
    if (await addTopics([{ kind: 'custom', text }])) setManual('');
  };

  if (!ov || !reg) return <PageSkeleton />;
  const accent = BRAND[sel]?.accent || 'var(--accent)';

  return (
    <div>
      <PageHeader icon={ListChecks} title="Topic Desk" sub="Research proposes → you approve → the nightly run makes exactly these first. One topic = one slot.">
        <button className="btn btn-outline" onClick={load} disabled={loading || !sel}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </PageHeader>

      {options.length ? (
        <div className="mb-5">
          <Segmented options={options} value={sel} onChange={setSel} />
        </div>
      ) : (
        <Card className="p-4">
          <EmptyState icon={ListChecks} title="No channels yet" sub="Connect a channel first — topics are queued per channel.">
            <Link href="/channels/add" className="btn btn-primary btn-sm mt-3"><Plus size={14} /> Add a channel</Link>
          </EmptyState>
        </Card>
      )}

      {actErr ? <p className="t-13 mb-4" role="alert" style={{ color: 'var(--bad-ink)' }}>{actErr}</p> : null}
      {sel && loadErr && !loading ? (
        <Card className="p-5 mb-4">
          <div className="flex items-start gap-3 flex-wrap">
            <AlertTriangle size={18} style={{ color: 'var(--bad-ink)' }} className="shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="t-14 font-semibold text-ink">Can&apos;t load this channel&apos;s topics right now</p>
              <p className="t-12 text-muted mt-1">{loadErr} — the queue is not empty, it just couldn&apos;t be read. The nightly run is unaffected.</p>
            </div>
            <button className="btn btn-sm btn-outline shrink-0" onClick={load}><RefreshCw size={13} /> Retry</button>
          </div>
        </Card>
      ) : null}

      {sel && !loadErr ? (
        <div className="grid lg:grid-cols-2 gap-4">
          {/* candidates */}
          <Card className="overflow-hidden">
            <CardHead
              title="From your research"
              sub="Proven viral themes in your niche + what your viewers actually searched (last 28 days)"
              icon={Flame}
              right={data?.researchAt ? <Chip tone="ok">research ready</Chip> : <Chip tone="warn">no research yet</Chip>}
            />
            <div className="px-2 pb-2">
              {loading ? (
                <div className="px-3 py-6 space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-5" />)}</div>
              ) : (
                <>
                  {(data?.trends || []).slice(0, 8).map((v) => (
                    <div key={v.title} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-2 transition-colors">
                      <Flame size={13} className="shrink-0" style={{ color: 'var(--warn)' }} />
                      <span className="flex-1 min-w-0">
                        <span className="block t-12 font-medium text-ink truncate">{v.title}</span>
                        <span className="block t-10 text-faint">{v.channel} · {fmt(v.views)} views in 14d</span>
                      </span>
                      <button className="icon-btn shrink-0" title="Approve this theme" aria-label={`Approve theme: ${v.title}`} disabled={busy} onClick={() => addTopics([{ kind: 'seed', text: v.title }])}><Plus size={15} /></button>
                    </div>
                  ))}
                  {(data?.terms || []).slice(0, 8).map((t) => (
                    <div key={t.term} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-2 transition-colors">
                      <Search size={13} className="text-accent shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block t-12 font-medium text-ink truncate">{t.term}</span>
                        <span className="block t-10 text-faint">real viewer search · {fmt(t.views)} views</span>
                      </span>
                      <button className="icon-btn shrink-0" title="Approve this search" aria-label={`Approve search: ${t.term}`} disabled={busy} onClick={() => addTopics([{ kind: 'search', text: t.term }])}><Plus size={15} /></button>
                    </div>
                  ))}
                  {!(data?.trends || []).length && !(data?.terms || []).length ? (
                    <p className="t-12 text-faint px-3 py-8 text-center">
                      No research yet. The nightly run gathers it automatically — come back after the first run, or add a custom topic below.
                    </p>
                  ) : null}

                  <div className="px-3 pb-3 pt-3 mt-2 border-t border-line">
                    <div className="flex items-center gap-2 min-w-0">
                      <PenLine size={13} className="text-faint shrink-0" />
                      <input
                        className="input flex-1 min-w-0"
                        placeholder="Your own topic — full idea or instruction…"
                        value={manual}
                        onChange={(e) => setManual(e.target.value)}
                        aria-label="Your own topic"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') addManual();
                        }}
                      />
                      <button className="btn btn-primary shrink-0" disabled={busy || !manual.trim()} onClick={addManual}>
                        <Plus size={16} /> Add
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </Card>

          {/* approved queue */}
          <Card className="overflow-hidden">
            <CardHead
              title="Approved queue"
              sub="The nightly run takes these first — one per day/slot — then auto-research fills the rest"
              icon={Clock3}
              right={data ? <Chip tone="ok">{(data.queue || []).length} waiting</Chip> : null}
            />
            <div className="px-2 pb-2">
              {loading ? (
                <div className="px-3 py-6 space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-5" />)}</div>
              ) : (data?.queue || []).length === 0 ? (
                <EmptyState icon={Clock3} title="Queue is empty" sub="Approve candidates on the left, or add your own topic." />
              ) : (
                (data?.queue || []).map((t, i) => (
                  <div key={t.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-2 transition-colors">
                    <span className="tnum t-11 font-bold text-faint w-5 shrink-0">{i + 1}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block t-12 font-medium text-ink truncate">{t.text}</span>
                      <span className="block t-10 text-faint">
                        {t.kind === 'seed' ? 'from viral research' : t.kind === 'search' ? 'from viewer searches' : 'your own topic'}
                        {t.addedAt ? ` · added ${t.addedAt.slice(5, 10)}` : ''}
                      </span>
                    </span>
                    <button className="icon-btn shrink-0" title="Remove from queue" aria-label={`Remove topic: ${t.text}`} disabled={busy} onClick={() => removeTopic(t.id)}><X size={15} /></button>
                  </div>
                ))
              )}
              {(data?.queue || []).length ? (
                <p className="t-11 text-faint px-3 pt-2">
                  <BrandMark short="i" accent={accent} size={14} /> Consumed top-first, one per run. When the queue empties, auto-research takes over.
                </p>
              ) : null}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
