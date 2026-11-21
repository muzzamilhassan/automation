'use client';
// Production — the network master switch + per-channel "run now" buttons, all
// from LIVE channel data (/api/overview). Round 2: the per-slug buttons that
// came from a static list (QQ/IC/MR/DFD) are gone — every live channel already
// has Produce now / Force Doc + Clips below, and a slug outside the registry
// only ever got "unknown channel". Billable runs and bulk/destructive actions
// confirm in a real dialog first.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Zap,
  Clapperboard,
  Film,
  Image as ImageIcon,
  ArrowRight,
  FileText,
  History,
  Pause,
  Play,
  RefreshCw,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { Card, CardHead, Chip, PageHeader, EmptyState, PageSkeleton } from '@/components/ui';
import { useConfirm } from '@/components/ConfirmDialog';
import { PIPELINES } from '@/lib/site-data';

const ICONS = { clapperboard: Clapperboard, film: Film, image: ImageIcon };

function mapOverviewChannels(channels) {
  return (channels || []).map((c) => ({
    slug: c.slug,
    label: c.label || c.slug,
    fromRegistry: Boolean(c.fromRegistry),
    shortsSource: c.shortsSource || 'generated',
    docDays: Array.isArray(c.docDays) ? c.docDays : [],
    clipQueue: c.clipQueue || null,
    flowPaused: Boolean(c.flowPaused),
  }));
}

function ClipQueueChips({ clipQueue }) {
  const broken = Number(clipQueue?.broken) || 0;
  const remaining = Number(clipQueue?.remaining) || 0;
  if (broken > 0) {
    return (
      <>
        <Chip tone="bad">{broken} broken {broken === 1 ? 'clip' : 'clips'}</Chip>
        {remaining > 0 ? <Chip tone="ok">{remaining} {remaining === 1 ? 'clip' : 'clips'} ready</Chip> : null}
      </>
    );
  }
  if (remaining > 0) {
    return <Chip tone="ok">{remaining} {remaining === 1 ? 'clip' : 'clips'} ready</Chip>;
  }
  return <Chip tone="warn">queue empty</Chip>;
}

const runWord = (state, idle) => (state === 'busy' ? 'Starting…' : state === 'started' ? 'Started ✓' : state === 'error' ? 'Failed — retry' : idle);

export default function Production() {
  // 10-08 FLOW CONTROL — network master switch (Hootsuite-style suspend):
  // one button pauses/resumes EVERY channel's autopilot at once.
  const confirm = useConfirm();
  const [chans, setChans] = useState(null); // null = loading; [] = none
  const [loadErr, setLoadErr] = useState('');
  const [netPaused, setNetPaused] = useState(null); // null = unknown yet
  const [netBusy, setNetBusy] = useState(false);
  const [netError, setNetError] = useState('');
  const [runs, setRuns] = useState({});
  const [runErr, setRunErr] = useState({});

  const loadOverview = useCallback(async () => {
    const d = await fetch('/api/overview').then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!d) {
      setLoadErr("Can't load your channels right now.");
      return null;
    }
    const list = d.channels || [];
    setLoadErr('');
    setChans(mapOverviewChannels(list));
    setNetPaused(list.length ? list.every((c) => c.flowPaused) : null);
    return d;
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      await Promise.resolve();
      if (alive) await loadOverview();
    })();
    return () => { alive = false; };
  }, [loadOverview]);

  const setAll = async (on) => {
    // admin-panel review #8: bulk action across every channel — confirm first
    const ok = await confirm(on
      ? { title: `Resume autopilot on all ${chans.length} channels?`, body: 'Each channel goes back to its normal schedule from its next slot.', confirmLabel: 'Resume everything', tone: 'primary' }
      : { title: `Pause autopilot on all ${chans.length} channels?`, body: 'Nothing new is produced until you resume (already-scheduled videos still publish).', confirmLabel: 'Pause everything', tone: 'danger' });
    if (!ok) return;
    setNetBusy(true);
    setNetError('');
    let fails = 0;
    // 2026-11-21: the flow route refuses Resume (409) for a channel that isn't
    // 7/7 ready to publish — that is the rule working, not a failure
    let notReady = 0;
    for (const c of chans) {
      try {
        const r = await fetch('/api/channels/flow', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: c.slug, on }),
        });
        if (r.status === 409) { notReady += 1; continue; }
        if (!r.ok) fails += 1;
      } catch { fails += 1; }
    }
    const notes = [];
    if (notReady) notes.push(`${notReady} channel(s) stayed paused — not ready to publish yet (see each channel's checklist on the Channels page).`);
    if (fails) notes.push(`${fails} channel(s) failed — try again or check the logs.`);
    setNetError(notes.join(' '));
    // the reload below is the truth; never flip the switch on a total failure
    if (fails + notReady < chans.length) setNetPaused(!on);
    await loadOverview();
    setNetBusy(false);
  };

  const runKey = (slug, key) => `${slug}:${key}`;

  // 10-08 P1: "produce now" / "force doc + clips" for ANY channel — each is a
  // billable GitHub Actions run, so it confirms first (same as the palette)
  const dispatchAction = async (c, action, extra = {}) => {
    const what = action === 'force-doc' ? 'a documentary + clips run' : 'a full production run';
    const ok = await confirm({
      title: `Start ${what} for ${c.label}?`,
      body: 'This dispatches a real GitHub Actions run (research → script → voice → render → upload). All gates still apply; finished steps skip.',
      confirmLabel: 'Start run',
      tone: 'primary',
    });
    if (!ok) return;
    const key = runKey(c.slug, action);
    setRuns((r) => ({ ...r, [key]: 'busy' }));
    setRunErr((x) => ({ ...x, [key]: '' }));
    try {
      const r = await fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, slug: c.slug, ...extra }),
      });
      const d = await r.json().catch(() => ({}));
      const started = r.ok && d.started;
      setRuns((x) => ({ ...x, [key]: started ? 'started' : 'error' }));
      if (!started) setRunErr((x) => ({ ...x, [key]: d.error || `the server answered ${r.status}` }));
    } catch (e) {
      setRuns((x) => ({ ...x, [key]: 'error' }));
      setRunErr((x) => ({ ...x, [key]: e.message || 'network error' }));
    }
  };

  const clearBrokenQueue = async (c, broken = 0) => {
    // admin-panel review #4: destructive — confirm; only broken clips are removed
    const ok = await confirm({
      title: `Remove ${broken} broken clip(s) from ${c.label}'s queue?`,
      body: 'Only broken clips are removed. Ready and posted clips are kept.',
      confirmLabel: 'Remove broken clips',
      tone: 'danger',
    });
    if (!ok) return;
    const key = runKey(c.slug, 'clear-queue');
    setRuns((r) => ({ ...r, [key]: 'busy' }));
    try {
      const r = await fetch('/api/channels/clip-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: c.slug, action: 'clear' }),
      });
      if (!r.ok) {
        setRuns((x) => ({ ...x, [key]: 'error' }));
        return;
      }
      await loadOverview();
      setRuns((x) => {
        const next = { ...x };
        delete next[key];
        return next;
      });
    } catch {
      setRuns((x) => ({ ...x, [key]: 'error' }));
    }
  };

  // only the pipelines this page can actually start (via Channel runs)
  const pipelines = PIPELINES.filter((p) => p.actions.length);

  return (
    <div>
      <PageHeader
        icon={Zap}
        title="Production"
        sub="Start or pause the pipelines that make and ship content. Every button starts a real GitHub Actions run."
      >
        <Link href="/runs" className="btn btn-outline"><History size={16} /> Run history</Link>
        <Link href="/logs" className="btn btn-outline"><FileText size={16} /> Upload log</Link>
      </PageHeader>

      {loadErr && !chans ? (
        <Card className="p-4 mb-5">
          <EmptyState icon={AlertTriangle} title={loadErr} sub="Your channels keep running on their schedules — only this view couldn't read them.">
            <button className="btn btn-outline btn-sm mt-3" onClick={loadOverview}><RefreshCw size={13} /> Retry</button>
          </EmptyState>
        </Card>
      ) : !chans ? (
        <PageSkeleton />
      ) : chans.length === 0 ? (
        <Card className="p-4 mb-5">
          <EmptyState icon={Zap} title="No channels to run yet" sub="Add a channel and its pipeline shows up here.">
            <Link href="/channels/add" className="btn btn-primary btn-sm mt-3">Add a channel</Link>
          </EmptyState>
        </Card>
      ) : (
        <>
          {/* master flow switch */}
          <Card className="p-4 mb-5 flex items-center gap-4 flex-wrap" style={netPaused ? { borderColor: 'color-mix(in srgb, var(--warn) 45%, transparent)' } : undefined}>
            <div className="flex-1 min-w-[240px]">
              <div className="flex items-center gap-2">
                <h3 className="font-display t-14 font-bold text-ink">Master flow</h3>
                <Chip tone={netPaused === false ? 'ok' : netPaused === true ? 'warn' : 'plain'} dot={netPaused === false}>
                  {netPaused === true ? 'ALL CHANNELS PAUSED' : netPaused === false ? 'RUNNING' : '…'}
                </Chip>
              </div>
              <p className="t-11 text-muted mt-1 leading-relaxed">
                {netPaused
                  ? 'Every channel is paused — nothing new is produced. Already-scheduled videos still publish. Topics, settings and keys are kept.'
                  : 'Pause stops ALL channels at once: no new videos are made until you resume. Already-scheduled videos still publish; nothing is deleted.'}
                {netError ? <span className="block mt-1" role="alert" style={{ color: 'var(--bad-ink)' }}>{netError}</span> : null}
              </p>
            </div>
            <button
              className={netPaused ? 'btn btn-primary' : 'btn btn-outline'}
              onClick={() => setAll(!netPaused)}
              disabled={netBusy || netPaused === null}
            >
              {netBusy ? <><Loader2 size={14} className="animate-spin" /> Working…</> : netPaused ? (<><Play size={14} /> Resume everything</>) : (<><Pause size={14} /> Pause everything</>)}
            </button>
          </Card>

          {/* channel runs — produce now / force doc + clips for ANY channel */}
          <Card className="mb-5 overflow-hidden">
            <CardHead icon={Zap} title="Channel runs" sub="Run the nightly pipeline now for any channel — all gates apply; finished steps skip." />
            <div className="px-4 pb-4 space-y-1.5">
              {chans.map((c) => {
                const produceKey = runKey(c.slug, 'yt-daily');
                const forceKey = runKey(c.slug, 'force-doc');
                const produceState = runs[produceKey];
                const forceDocState = runs[forceKey];
                const clearState = runs[runKey(c.slug, 'clear-queue')];
                const hasBrokenClips = (c.clipQueue?.broken || 0) > 0;
                const why = runErr[produceKey] || runErr[forceKey];
                return (
                  <div key={c.slug} className="inset-tile px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                        <Link href={`/channels/${c.slug}`} className="t-12 font-semibold text-ink truncate hover:underline">{c.label}</Link>
                        <Chip tone={c.shortsSource === 'clips' ? 'accent' : c.shortsSource === 'external-episodic' ? 'info' : 'plain'}>
                          {c.shortsSource}
                        </Chip>
                        {c.flowPaused ? <Chip tone="warn">PAUSED</Chip> : null}
                        {c.shortsSource === 'clips' ? <ClipQueueChips clipQueue={c.clipQueue} /> : null}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap shrink-0">
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => dispatchAction(c, 'yt-daily')}
                          disabled={produceState === 'busy' || produceState === 'started'}
                        >
                          {runWord(produceState, 'Produce now')}
                        </button>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => dispatchAction(c, 'force-doc', { forceDoc: true })}
                          disabled={forceDocState === 'busy' || forceDocState === 'started'}
                        >
                          {runWord(forceDocState, 'Force Doc + Clips')}
                        </button>
                        {hasBrokenClips ? (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => clearBrokenQueue(c, c.clipQueue?.broken || 0)}
                            disabled={clearState === 'busy'}
                          >
                            {clearState === 'busy' ? 'Clearing…' : clearState === 'error' ? 'Failed — retry' : 'Clear broken queue'}
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {why ? <p className="t-11 mt-1.5" role="alert" style={{ color: 'var(--bad-ink)' }}>Couldn&apos;t start: {why}</p> : null}
                    {produceState === 'started' || forceDocState === 'started' ? (
                      <p className="t-11 text-faint mt-1.5">Dispatched — follow it on <Link href="/runs" className="text-accent hover:underline">Runs</Link>.</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}

      {/* what each pipeline does — description only; runs start from Channel runs */}
      {pipelines.length ? (
        <div className="grid md:grid-cols-2 gap-4">
          {pipelines.map((p) => {
            const Icon = ICONS[p.icon] || Zap;
            return (
              <Card key={p.id} className="p-5 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                    <Icon size={19} strokeWidth={2.1} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="section-title">{p.name}</h2>
                    <p className="t-11 text-faint mt-0.5">{p.desc}</p>
                  </div>
                </div>
                <div className="flex items-center flex-wrap gap-y-2">
                  {p.stages.map((s, i) => (
                    <span key={s} className="flex items-center">
                      <span className="inset-tile px-2.5 py-1 t-11 font-semibold text-muted">{s}</span>
                      {i < p.stages.length - 1 ? <ArrowRight size={11} className="mx-1 text-faint shrink-0" /> : null}
                    </span>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      ) : null}

      <Card className="mt-5 p-5">
        <div className="flex items-start gap-3">
          <FileText size={16} className="text-faint mt-0.5 shrink-0" />
          <div className="t-12 text-muted leading-relaxed">
            <span className="font-semibold text-ink">How runs report back.</span> Every button dispatches the channel workflow on{' '}
            <span className="font-semibold text-ink">GitHub Actions</span>. Success or failure of each run shows on{' '}
            <Link href="/runs" className="text-accent hover:underline">Runs</Link>; uploads appear in the{' '}
            <Link href="/logs" className="text-accent hover:underline">upload log</Link> as they publish.
          </div>
        </div>
      </Card>
    </div>
  );
}
