'use client';
// Phase 2 run history (OPS-01 / I6) — answers "did today's automation run?".
// Top: one "Today" tile per channel (channels from live data via useBrands +
// whatever the runs name). Below: the run timeline from /api/runs (GitHub
// Actions), filterable by channel and status, each row linking to its log.
// Three honest states: loading skeleton, "can't load" with Retry, "no runs yet".
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { History, CircleCheck, CircleX, Loader2, Clock, CircleMinus, CircleHelp, CirclePause, ExternalLink, RotateCw } from 'lucide-react';
import { Card, CardHead, Chip, PageHeader, EmptyState, Skeleton, Segmented, BrandMark } from '@/components/ui';
import DataTable from '@/components/DataTable';
import apiFetch from '@/components/shell/api-fetch';
import { useBrands } from '@/components/use-brands';
import RunStepsDrawer from '@/components/RunStepsDrawer'; // Creator City P1 (item O): a run, step by step
import {
  todaySummary, filterRuns, runLabel, stateTone, STATE_WORD, stamp, durationText,
  runScope, runOrigin, SCOPE_LABEL, parseSavedRuns,
} from '@/lib/runs-view.mjs';

// Live fix wave C2 (T2-16): the last good answer, kept for this browser tab so
// a GitHub outage shows the last known runs instead of an error page.
const SAVED_KEY = 'quarry:runs:last-good';

const STATE_ICON = {
  ok: CircleCheck, failed: CircleX, running: Loader2, queued: Clock,
  cancelled: CircleMinus, skipped: CircleMinus, blocked: CirclePause, unknown: CircleHelp,
};
const SUMMARY_TONE = { ok: 'ok', failed: 'bad', running: 'info', other: 'plain', none: 'plain' };
const SUMMARY_WORD = { ok: 'Succeeded', failed: 'Failed', running: 'Running', other: 'Finished', none: 'No run' };
const SUMMARY_ICON = { ok: CircleCheck, failed: CircleX, running: Loader2, other: CircleMinus, none: Clock };

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'failed', label: 'Failed' },
  { value: 'running', label: 'Running' },
  { value: 'ok', label: 'Succeeded' },
  { value: 'other', label: 'Other' },
];

function StatusChip({ state }) {
  const Icon = STATE_ICON[state] || CircleHelp;
  return (
    <Chip tone={stateTone(state)}>
      <Icon size={11} className={state === 'running' ? 'animate-spin' : undefined} aria-hidden />
      {STATE_WORD[state] || 'Unknown'}
    </Chip>
  );
}

function LogLink({ url, children = 'View log' }) {
  if (!url) return <span className="t-11 text-faint">—</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 t-11 text-muted hover:text-ink underline-offset-2 hover:underline">
      {children} <ExternalLink size={11} aria-hidden />
    </a>
  );
}

// wave C2 (T2-23): a run with no single channel says what it is — a
// heartbeat that checks every channel, or an all-channel batch run
function ChannelCell({ run, brand }) {
  const slug = run.channel;
  if (!slug) return <span className="t-12 text-muted">{SCOPE_LABEL[runScope(run)]}</span>;
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <BrandMark name={brand?.label || slug} accent={brand?.accent || 'var(--muted)'} short={brand?.short || slug.slice(0, 2).toUpperCase()} size={20} />
      <span className="t-12 text-ink truncate">{brand?.label || slug}</span>
    </span>
  );
}

function TodayTile({ s, brand }) {
  const Icon = SUMMARY_ICON[s.status];
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3 min-w-0">
      {s.channel ? (
        <BrandMark name={brand?.label || s.channel} accent={brand?.accent || 'var(--muted)'} short={brand?.short || s.channel.slice(0, 2).toUpperCase()} size={30} />
      ) : (
        <span className="inline-flex items-center justify-center w-[30px] h-[30px] rounded-lg shrink-0" style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}>
          <Clock size={15} aria-hidden />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="t-13 font-semibold text-ink truncate">{s.channel ? brand?.label || s.channel : 'Scheduler (all channels)'}</div>
        <div className="t-12 text-muted truncate tnum">{s.label}</div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <Chip tone={SUMMARY_TONE[s.status]}>
          <Icon size={11} className={s.status === 'running' ? 'animate-spin' : undefined} aria-hidden />
          {SUMMARY_WORD[s.status]}
        </Chip>
        {s.run ? <LogLink url={s.run.url} /> : null}
      </div>
    </div>
  );
}

export default function RunsPage() {
  const { bySlug, channels: brandList } = useBrands();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(''); // fatal: nothing to show
  const [notice, setNotice] = useState(''); // refresh failed, older data still shown
  const [denied, setDenied] = useState(false);
  const dataRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [channel, setChannel] = useState('all');
  const [status, setStatus] = useState('all');
  const [steps, setSteps] = useState(null); // the run whose step drawer is open
  // the viewer's own zone: "today" means the owner's today, not UTC's
  const [timeZone] = useState(() => (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC') || 'UTC');

  // no synchronous setState here: it also runs from the mount effect
  const load = useCallback(() => {
    apiFetch('/api/runs')
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (r.status === 403) {
          const e = new Error('Run history is only for the owner and staff.');
          e.denied = true;
          throw e;
        }
        if (r.status === 429) throw new Error(d.error || 'Too many refreshes — try again in a few minutes.');
        if (!r.ok || d.ok === false) throw new Error(d.error || `The server answered ${r.status}.`);
        setErr('');
        setDenied(false);
        // the server kept an older good answer during a GitHub outage
        if (d.stale) {
          const mine = dataRef.current;
          const shown = mine && String(mine.fetchedAt) > String(d.fetchedAt) ? mine : d;
          dataRef.current = shown;
          setData(shown);
          setNotice(`Couldn't refresh — showing runs from ${stamp(shown.fetchedAt, timeZone)}. ${d.staleReason || ''}`.trim());
          return;
        }
        dataRef.current = d;
        setData(d);
        setNotice('');
        try { window.sessionStorage.setItem(SAVED_KEY, JSON.stringify(d)); } catch { /* storage full or blocked: the live copy still shows */ }
      })
      .catch((e) => {
        // keep the last good timeline on screen (this view, else this tab's
        // saved copy), but say it's stale
        let prev = dataRef.current;
        if (!prev && !e.denied) {
          try { prev = parseSavedRuns(window.sessionStorage.getItem(SAVED_KEY)); } catch { prev = null; }
          if (prev) {
            dataRef.current = prev;
            setData(prev);
          }
        }
        if (prev) setNotice(`Couldn't refresh — showing runs from ${stamp(prev.fetchedAt, timeZone)}. ${e.message}`);
        else {
          setDenied(Boolean(e.denied));
          setErr(e.message || 'network error');
        }
      })
      .finally(() => {
        setLoading(false);
        setNow(Date.now());
      });
  }, [timeZone]);

  useEffect(() => { load(); }, [load]);
  const refresh = () => { setLoading(true); load(); };

  const runs = useMemo(() => (Array.isArray(data?.runs) ? data.runs : []), [data]);
  const anyLive = runs.some((r) => r.state === 'running' || r.state === 'queued');

  // live clock for "Running for 4m"; auto-refresh slower than the 30/hour route limit
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    const poll = setInterval(load, anyLive ? 180_000 : 600_000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [load, anyLive]);

  const summary = useMemo(
    // Live fix (T2-12): "today" = the UTC day, the same day Today/channels use
    // (the engine stamps every day in UTC); row times stay in the viewer's zone.
    () => (data ? todaySummary(runs, brandList, { now, timeZone: 'UTC', coveredSince: data.coveredSince }) : null),
    [data, runs, brandList, now, timeZone],
  );

  const channelOptions = useMemo(() => {
    const slugs = [];
    for (const c of brandList) if (!slugs.includes(c.slug)) slugs.push(c.slug);
    for (const r of runs) if (r.channel && !slugs.includes(r.channel)) slugs.push(r.channel);
    const opts = [{ value: 'all', label: 'All channels' }, ...slugs.map((s) => ({ value: s, label: bySlug[s]?.label || s }))];
    if (runs.some((r) => !r.channel)) opts.push({ value: 'untagged', label: 'All-channel runs' });
    return opts;
  }, [brandList, runs, bySlug]);

  const visible = filterRuns(runs, { channel, status });

  const columns = [
    { key: 'state', label: 'Status', render: (r) => <StatusChip state={r.state} /> },
    {
      key: 'workflow',
      label: 'Workflow',
      rowHeader: true,
      // Creator City P1: the run's name opens its step drawer; the Log column keeps the GitHub link
      render: (r) => (
        <button
          type="button"
          onClick={() => setSteps({
            runId: r.id,
            channel: r.channel || null, // a fleet run (null) returns every channel's job
            name: r.channel ? bySlug[r.channel]?.label || r.channel : SCOPE_LABEL[runScope(r)],
            startedAt: r.startedAt || r.createdAt,
            logUrl: r.url,
            labels: bySlug,
          })}
          className="flex flex-col min-w-0 max-w-full text-left cursor-pointer group"
          title="Show steps"
        >
          <span className="t-12 text-ink truncate max-w-full group-hover:underline underline-offset-2">{r.name || r.workflow}</span>
          <span className="t-10 text-faint truncate max-w-full">{runOrigin(r)} · {r.workflow}</span>
        </button>
      ),
    },
    { key: 'channel', label: 'Channel', render: (r) => <ChannelCell run={r} brand={bySlug[r.channel]} /> },
    { key: 'createdAt', label: 'Started', render: (r) => <span className="t-12 text-muted tnum whitespace-nowrap" title={runLabel(r, { now, timeZone })}>{stamp(r.startedAt || r.createdAt, timeZone)}</span> },
    { key: 'durationSec', label: 'Duration', render: (r) => <span className="t-12 text-muted tnum font-mono">{durationText(r, now)}</span> },
    { key: 'url', label: 'Log', render: (r) => <LogLink url={r.url} /> },
  ];

  const failedToday = summary ? summary.channels.filter((s) => s.status === 'failed').length + (summary.scheduler.status === 'failed' ? 1 : 0) : 0;

  return (
    <div>
      <PageHeader
        icon={History}
        title="Runs"
        sub="Did today's automation work? Every production run on GitHub, newest first."
      >
        <button className="btn btn-outline btn-sm" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <RotateCw size={13} aria-hidden />} Refresh
        </button>
      </PageHeader>

      {err && !data && denied ? (
        <Card className="p-6 text-center">
          <p className="t-14 font-semibold text-ink">Run history isn&apos;t available for your account</p>
          <p className="t-12 text-faint mt-1">{err}</p>
        </Card>
      ) : err && !data ? (
        <Card className="p-6 text-center">
          <p className="t-14 font-semibold text-ink">Can&apos;t load run history right now.</p>
          <p className="t-12 text-faint mt-1">{err} Your scheduled runs are unaffected; only this view is.</p>
          <button className="btn btn-outline mt-3" onClick={refresh} disabled={loading}>
            {loading ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <RotateCw size={13} aria-hidden />} Retry
          </button>
        </Card>
      ) : !data ? (
        <div className="space-y-4" aria-busy="true" aria-label="Loading run history">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-[62px] rounded-xl" />)}
          </div>
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : (
        <>
          {notice ? <p className="t-12 mb-3" role="status" style={{ color: 'var(--warn-ink)' }}>{notice}</p> : null}

          <Card className="mb-5">
            <CardHead
              icon={Clock}
              title="Today"
              sub={`"Today" = UTC day · times in ${timeZone}${data.fetchedAt ? ` · checked ${stamp(data.fetchedAt, timeZone)}` : ''}`}
              right={failedToday ? <Chip tone="bad">{failedToday} failed</Chip> : null}
            />
            <div className="px-5 pb-5">
              {summary.channels.length ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {summary.channels.map((s) => <TodayTile key={s.channel} s={s} brand={bySlug[s.channel]} />)}
                  {summary.scheduler.count ? <TodayTile s={summary.scheduler} brand={null} /> : null}
                </div>
              ) : summary.scheduler.count ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><TodayTile s={summary.scheduler} brand={null} /></div>
              ) : (
                <p className="t-12 text-faint">No channels found and no runs today.</p>
              )}
              {summary.untaggedToday ? (
                <p className="t-11 text-faint mt-3 text-pretty">
                  {summary.untaggedToday} all-channel run{summary.untaggedToday === 1 ? '' : 's'} today (heartbeats and batch jobs). A channel can read
                  &ldquo;No channel-tagged run today&rdquo; even when one of these made its video. Open that run&apos;s log to check.
                </p>
              ) : null}
              {summary.partial ? (
                <p className="t-11 text-faint mt-2">GitHub returned only the most recent runs, so earlier runs from today may not be listed.</p>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHead icon={History} title="Run timeline" sub="Production workflows · newest first" />
            <div className="px-5 pb-5">
              {runs.length === 0 ? (
                <EmptyState icon={History} title="No runs yet" sub="GitHub answered, but none of the production workflows has run recently." />
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2 mb-3 min-w-0">
                    <div className="max-w-full overflow-x-auto">
                      <Segmented options={channelOptions} value={channel} onChange={setChannel} />
                    </div>
                    <Segmented options={STATUS_FILTERS} value={status} onChange={setStatus} />
                  </div>
                  <DataTable
                    label="Run timeline"
                    columns={columns}
                    rows={visible}
                    pageSize={15}
                    emptyIcon={History}
                    emptyTitle="No runs match these filters"
                    emptySub="Pick another channel or status."
                  />
                </>
              )}
            </div>
          </Card>
        </>
      )}
      <RunStepsDrawer open={Boolean(steps)} target={steps} onClose={() => setSteps(null)} />
    </div>
  );
}
