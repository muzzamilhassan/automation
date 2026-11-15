'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  Zap,
  Clapperboard,
  Film,
  Music2,
  Share2,
  Image as ImageIcon,
  AtSign,
  ArrowRight,
  FileText,
  Clock,
  Pause,
  Play,
} from 'lucide-react';
import ActionButton from '@/components/ActionButton';
import { Card, CardHead, Chip, PageHeader, EmptyState } from '@/components/ui';
import { PIPELINES } from '@/lib/site-data';
import { Button } from '@/components/untitledui/base/buttons/button';

const ICONS = { clapperboard: Clapperboard, film: Film, music2: Music2, share2: Share2, image: ImageIcon, 'at-sign': AtSign };

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

export default function Production() {
  // 10-08 FLOW CONTROL — network master switch (Hootsuite-style suspend):
  // one button pauses/resumes EVERY channel's autopilot at once.
  const [chans, setChans] = useState([]); // {slug, label, fromRegistry, shortsSource, docDays, clipQueue, flowPaused}
  const [netPaused, setNetPaused] = useState(null); // null = unknown yet
  const [netBusy, setNetBusy] = useState(false);
  const [netError, setNetError] = useState('');
  const [runs, setRuns] = useState({});

  const loadOverview = useCallback(async () => {
    const d = await fetch('/api/overview').then((r) => r.json()).catch(() => null);
    if (!d?.channels?.length) return null;
    setChans(mapOverviewChannels(d.channels));
    setNetPaused(d.channels.every((c) => c.flowPaused));
    return d;
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      await Promise.resolve();
      const d = await fetch('/api/overview').then((r) => r.json()).catch(() => null);
      if (!alive || !d?.channels?.length) return;
      setChans(mapOverviewChannels(d.channels));
      setNetPaused(d.channels.every((c) => c.flowPaused));
    })();
    return () => { alive = false; };
  }, []);

  const setAll = async (on) => {
    setNetBusy(true);
    setNetError('');
    let fails = 0;
    for (const c of chans) {
      try {
        const r = await fetch('/api/channels/flow', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: c.slug, on }),
        });
        if (!r.ok) fails += 1;
      } catch { fails += 1; }
    }
    setNetPaused(on ? false : true);
    if (fails) setNetError(`${fails} channel(s) failed — try again or check the logs.`);
    await loadOverview();
    setNetBusy(false);
  };

  const runKey = (slug, key) => `${slug}:${key}`;

  // 10-08 P1: "produce now" / "force doc + clips" for ANY channel
  const dispatchAction = async (slug, action, extra = {}) => {
    const key = runKey(slug, action);
    setRuns((r) => ({ ...r, [key]: 'busy' }));
    try {
      const r = await fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, slug, ...extra }),
      });
      const d = await r.json().catch(() => ({}));
      setRuns((x) => ({ ...x, [key]: r.ok && d.started ? 'started' : 'error' }));
    } catch {
      setRuns((x) => ({ ...x, [key]: 'error' }));
    }
  };

  const clearBrokenQueue = async (slug, broken = 0) => {
    // admin-panel review #4: destructive — confirm; only broken clips are removed
    if (!window.confirm(`Remove ${broken} broken clip(s) from ${slug}'s queue? Ready and posted clips are kept.`)) return;
    const key = runKey(slug, 'clear-queue');
    setRuns((r) => ({ ...r, [key]: 'busy' }));
    try {
      const r = await fetch('/api/channels/clip-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, action: 'clear' }),
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

  return (
    <div>
      <PageHeader
        icon={Zap}
        title="Production"
        sub="Every pipeline that makes and ships content. Buttons start real jobs on this machine or on GitHub Actions."
      >
        <a href="/logs"><Button color="secondary" iconLeading={<FileText size={16} />}>Open logs</Button></a>
      </PageHeader>

      {/* master flow switch */}
      {chans.length ? (
        <Card className="p-4 mb-5 flex items-center gap-4 flex-wrap" style={netPaused ? { borderColor: '#f59e0b66' } : undefined}>
          <div className="flex-1 min-w-[240px]">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-[14px] font-bold text-ink">Master flow</h3>
              <Chip tone={netPaused === false ? 'ok' : netPaused === true ? 'warn' : ''} dot={netPaused === false}>
                {netPaused === true ? 'ALL CHANNELS PAUSED' : netPaused === false ? 'RUNNING' : '…'}
              </Chip>
            </div>
            <p className="text-[11.5px] text-muted mt-1 leading-relaxed">
              {netPaused
                ? 'Every channel is paused — nothing new is produced. Already-scheduled videos still publish. Topics, settings and keys are kept.'
                : 'Pause stops ALL channels at once: no new videos are made until you resume. Already-scheduled videos still publish; nothing is deleted.'}
              {netError ? <span className="block mt-1" style={{ color: 'var(--bad)' }}>{netError}</span> : null}
            </p>
          </div>
          <Button
            color={netPaused ? 'primary' : 'secondary'}
            onClick={() => setAll(!netPaused)}
            isDisabled={netBusy}
          >
            {netBusy ? 'Working…' : netPaused ? (<><Play size={14} /> Resume everything</>) : (<><Pause size={14} /> Pause everything</>)}
          </Button>
        </Card>
      ) : null}

      {/* channel runs — produce now / force doc + clips for ANY channel */}
      {chans.length ? (
        <Card className="p-4 mb-5 overflow-hidden">
          <CardHead title="Channel runs" sub="Run the nightly pipeline now for any channel — research, script, voice, render, upload (all gates apply). Already-done steps skip automatically." />
          <div className="px-2 pb-2 space-y-1.5">
            {chans.map((c) => {
              const produceState = runs[runKey(c.slug, 'yt-daily')];
              const forceDocState = runs[runKey(c.slug, 'force-doc')];
              const clearState = runs[runKey(c.slug, 'clear-queue')];
              const hasBrokenClips = (c.clipQueue?.broken || 0) > 0;
              return (
                <div key={c.slug} className="flex flex-wrap items-center justify-between gap-2.5 inset-tile px-3 py-2.5">
                  <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                    <span className="text-[12.5px] font-semibold text-ink truncate">{c.label}</span>
                    <Chip>{c.fromRegistry ? 'wizard' : 'legacy'}</Chip>
                    <Chip tone={c.shortsSource === 'clips' ? 'accent' : c.shortsSource === 'external-episodic' ? 'info' : 'plain'}>
                      {c.shortsSource}
                    </Chip>
                    {c.flowPaused ? <Chip tone="warn">PAUSED</Chip> : null}
                    {c.shortsSource === 'clips' ? <ClipQueueChips clipQueue={c.clipQueue} /> : null}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    <Button
                      size="xs"
                      color="secondary"
                      onClick={() => dispatchAction(c.slug, 'yt-daily')}
                      isDisabled={produceState === 'busy' || produceState === 'started'}
                    >
                      {produceState === 'busy' ? 'Starting…' : produceState === 'started' ? 'Started ✓' : produceState === 'error' ? 'Failed — retry' : 'Produce now'}
                    </Button>
                    <Button
                      size="xs"
                      color="secondary"
                      onClick={() => dispatchAction(c.slug, 'force-doc', { forceDoc: true })}
                      isDisabled={forceDocState === 'busy' || forceDocState === 'started'}
                    >
                      {forceDocState === 'busy' ? 'Starting…' : forceDocState === 'started' ? 'Started ✓' : forceDocState === 'error' ? 'Failed — retry' : 'Force Doc + Clips'}
                    </Button>
                    {hasBrokenClips ? (
                      <Button
                        size="xs"
                        color="secondary-destructive"
                        onClick={() => clearBrokenQueue(c.slug, c.clipQueue?.broken || 0)}
                        isDisabled={clearState === 'busy'}
                      >
                        {clearState === 'busy' ? 'Clearing…' : clearState === 'error' ? 'Failed — retry' : 'Clear broken queue'}
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      <div className="grid md:grid-cols-2 gap-4">
        {PIPELINES.map((p) => {
          const Icon = ICONS[p.icon] || Zap;
          return (
            <Card key={p.id} hover className="p-5 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                    <Icon size={19} strokeWidth={2.1} />
                  </div>
                  <div>
                    <h2 className="section-title">{p.name}</h2>
                    <p className="text-[11.5px] text-faint mt-0.5">{p.engine}</p>
                  </div>
                </div>
                <Chip tone="ok" dot>live</Chip>
              </div>

              <p className="text-[12.5px] text-muted leading-relaxed -mt-1">{p.desc}</p>

              {/* stage flow */}
              <div className="flex items-center flex-wrap gap-y-2">
                {p.stages.map((s, i) => (
                  <span key={s} className="flex items-center">
                    <span className="inset-tile px-2.5 py-1 text-[11px] font-semibold text-muted">{s}</span>
                    {i < p.stages.length - 1 ? <ArrowRight size={11} className="mx-1 text-faint shrink-0" /> : null}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-2 text-[11.5px] text-faint">
                <Clock size={12} />
                <span className="font-mono">{p.schedule}</span>
              </div>

              {p.note ? (
                <p className="text-[11px] text-muted leading-relaxed -mt-2">{p.note}</p>
              ) : null}

              {p.actions.length ? (
                <div className="flex flex-wrap gap-2 pt-1 mt-auto">
                  {p.actions.map((a) => (
                    <ActionButton key={a.action + (a.slug || '')} small action={a.action} slug={a.slug || null} label={a.label} />
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-faint pt-1 mt-auto">Runs on its own schedule — no manual button for this one.</p>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="mt-5 p-5">
        <div className="flex items-start gap-3">
          <FileText size={16} className="text-faint mt-0.5 shrink-0" />
          <div className="text-[12.5px] text-muted leading-relaxed">
            <span className="font-semibold text-ink">How runs report back.</span> Every button dispatches the channel workflow on{' '}
            <span className="font-semibold text-ink">GitHub Actions</span>. Run history, upload status, and failures appear in{' '}
            <a href="/operations?tab=logs" className="text-accent hover:underline">
              Execution Logs
            </a>{' '}
            as jobs run and complete. If a job fails, it fails closed — nothing broken goes public.
          </div>
        </div>
      </Card>
    </div>
  );
}
