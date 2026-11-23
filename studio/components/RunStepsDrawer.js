'use client';
// Creator City Phase 1 (FEEDBACK item O, 2026-11-23) — one run, step by step.
// Opened from a run row on /runs (GitHub run id) and from a channel's dots on
// Today (job id). Shows the 7 stations as big dots, the one-line summary and
// every recorded step (fixed status words, duration, first error line).
// Honest states: loading skeleton · "no_job" (runs older than step tracking)
// · error with Retry. A scheduled fleet run covers every channel under one
// run id: the API then returns one job per channel and a Segmented control
// switches between them. Data: GET /api/runs/steps; view logic in
// lib/station-dots-view.mjs. Footer: the raw GitHub log when its URL is known.
import { useEffect, useState } from 'react';
import { ListChecks, AlertTriangle, History, RotateCw } from 'lucide-react';
import Drawer from '@/components/Drawer';
import StationDots from '@/components/StationDots';
import { Chip, EmptyState, Segmented, Skeleton } from '@/components/ui';
import apiFetch from '@/components/shell/api-fetch';
import { STATE_WORD, STATE_TONE } from '@/lib/stations.mjs';
import { stepsUrl, stepsView, browserTimeZone } from '@/lib/station-dots-view.mjs';
import { stamp } from '@/lib/runs-view.mjs';

function StepsBody({ url, startedAt, labels }) {
  const [attempt, setAttempt] = useState(0);
  const key = `${url}#${attempt}`;
  const [res, setRes] = useState({ key: null, view: null });

  useEffect(() => {
    if (!url) return;
    let alive = true;
    apiFetch(url)
      .then((r) => r.json().catch(() => null))
      .then((body) => { if (alive) setRes({ key, view: stepsView(body) }); })
      .catch(() => { if (alive) setRes({ key, view: { kind: 'error' } }); });
    return () => { alive = false; };
  }, [url, key]);

  // no id to ask about = nothing recorded for this run
  const view = !url ? { kind: 'no_job' } : res.key === key ? res.view : null;

  if (!view) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading steps">
        <Skeleton className="h-14 rounded-xl" />
        <Skeleton className="h-4 w-48" />
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-9 rounded-lg" />)}
      </div>
    );
  }
  if (view.kind === 'no_job') {
    return <EmptyState icon={History} title="Step details start with runs after 23 Nov. Open the raw log for older runs." />;
  }
  if (view.kind === 'error') {
    return (
      <EmptyState icon={AlertTriangle} title="Couldn't load steps">
        <button type="button" className="btn btn-outline btn-sm mt-3" onClick={() => setAttempt((a) => a + 1)}>
          <RotateCw size={13} aria-hidden /> Retry
        </button>
      </EmptyState>
    );
  }

  if (view.kind === 'multi') return <FleetRun items={view.items} startedAt={startedAt} labels={labels} />;
  return <OneRun view={view} startedAt={startedAt} />;
}

// One GitHub run, several channels: pick a channel, see its run.
function FleetRun({ items, startedAt, labels }) {
  const [pick, setPick] = useState(items[0].channel);
  const current = items.find((i) => i.channel === pick) || items[0];
  const options = items.map((i) => ({ value: i.channel, label: labels?.[i.channel]?.label || i.channel || 'Channel' }));
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto max-w-full -mx-1 px-1">
        <Segmented options={options} value={current.channel} onChange={setPick} />
      </div>
      <OneRun view={current.view} startedAt={startedAt} />
    </div>
  );
}

function OneRun({ view, startedAt }) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const when = view.job.startedAt || startedAt;
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        {when ? <p className="t-12 text-muted tnum">{stamp(when, timeZone)}</p> : null}
        {view.summary ? <p className="t-14 font-semibold text-ink text-pretty">{view.summary}</p> : null}
        {view.jobError ? <p className="t-12 break-words" style={{ color: 'var(--bad-ink)' }}>{view.jobError}</p> : null}
      </div>

      <StationDots stations={view.strip} size="lg" />

      <section>
        <h3 className="overline mb-2">Steps</h3>
        {view.steps.length ? (
          <ol className="rounded-xl border border-line divide-y divide-[var(--line)]">
            {view.steps.map((s, i) => (
              <li key={`${s.idx}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 min-w-0">
                <span className="t-13 text-ink min-w-0 flex-1 break-words">{s.label}</span>
                {s.duration ? <span className="t-11 text-faint tnum font-mono">{s.duration}</span> : null}
                <Chip tone={STATE_TONE[s.state] || 'plain'}>{STATE_WORD[s.state] || STATE_WORD.unknown}</Chip>
                {s.errorLine ? <p className="basis-full t-12 break-words" style={{ color: 'var(--bad-ink)' }}>{s.errorLine}</p> : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="t-12 text-faint">No steps recorded yet.</p>
        )}
      </section>
    </div>
  );
}

/**
 * target: { jobId?, runId?, channel?, name?, startedAt?, logUrl?, labels? } — the job id wins
 * when both are known; `channel` narrows a run id to that channel's job; `labels`
 * ({ [slug]: { label } }) names the channels of a fleet run.
 */
export default function RunStepsDrawer({ open, onClose, target }) {
  if (!open || !target) return null;
  const url = stepsUrl(target, browserTimeZone());
  return (
    <Drawer
      open
      onClose={onClose}
      title={target.name || 'Run steps'}
      icon={ListChecks}
      size="lg"
      footer={target.logUrl ? (
        <a href={target.logUrl} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">Raw log ↗</a>
      ) : null}
    >
      <StepsBody key={url || 'none'} url={url} startedAt={target.startedAt} labels={target.labels} />
    </Drawer>
  );
}
