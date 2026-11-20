'use client';
// Cost dashboard (issue #104 Phase 2 BYOK vault v2, Task 7 — spec D6, AC-P2-5).
// Reads /api/usage (owner+staff GET) and renders rollups per channel /
// provider / capability over a selectable window (7/30/90 days), plus the
// last 50 usage events. Client component + URLSearchParams per house
// pattern (window choice is URL state so a refresh keeps the view).
import { useEffect, useState } from 'react';
import { Coins, Gauge, Bot, CheckCircle2, XCircle, ReceiptText, CircleAlert, RefreshCw } from 'lucide-react';
import { Card, CardHead, Chip, PageHeader, PageSkeleton, StatCard, Segmented } from '@/components/ui';
import DataTable from '@/components/DataTable';
import { failureSummary } from '@/lib/usage-view.mjs';

const WINDOWS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
];
const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const none = (k) => (k == null || k === '' ? '(none)' : k);
const when = (iso) => (iso ? String(iso).replace('T', ' ').slice(0, 16) : '');

// One rollup table's shape is identical across the three dimensions.
const rollupColumns = [
  { key: 'key', label: 'Name', rowHeader: true, render: (r) => (r.other ? (
    <span className="t-12 font-semibold text-ink truncate">
      Other <span className="t-11 font-normal text-faint font-mono">({r.parts.join(', ')})</span>
    </span>
  ) : (
    <span className="t-12 font-semibold text-ink font-mono truncate">{none(r.key)}</span>
  )) },
  { key: 'calls', label: 'Calls', render: (r) => (
    <span className="tnum t-12 text-ink">
      {fmt(r.calls)}{' '}
      <span className="text-faint">
        (<span style={{ color: 'var(--ok-ink)' }}>{fmt(r.ok_calls)}</span>
        {' / '}
        <span style={{ color: 'var(--bad-ink)' }}>{fmt(r.fail_calls)}</span>)
      </span>
    </span>
  ) },
  { key: 'tokens', label: 'Tokens', render: (r) => <span className="tnum font-semibold t-12 text-ink">{fmt(r.tokens)}</span> },
  { key: 'split', label: 'Measured / estimated', render: (r) => (
    <span className="tnum t-11 text-muted">
      {fmt(r.measured_tokens)} / {fmt(r.estimated_tokens)}
      {' '}
      <span className="text-faint">({fmt(r.measured_calls)} / {fmt(r.estimated_calls)} calls)</span>
    </span>
  ) },
];

function RollupCard({ title, sub, icon, rows, sort }) {
  const sorted = [...(rows || [])].sort((a, b) => (sort === 'calls' ? b.calls - a.calls : b.tokens - a.tokens));
  return (
    <Card>
      <CardHead title={title} sub={sub} icon={icon} />
      <div className="px-3 pb-3">
        <DataTable
          label={title}
          rows={sorted.map((r, i) => ({ ...r, id: `${none(r.key)}-${i}` }))}
          columns={rollupColumns}
          pageSize={8}
        />
      </div>
    </Card>
  );
}

export default function UsageDashboard() {
  // window + sort live in the URL (?days=7|30|90) per house URLSearchParams pattern
  const [days, setDays] = useState(null);
  const [sort, setSort] = useState('tokens');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [nonce, setNonce] = useState(0); // Retry bumps this

  useEffect(() => {
    let alive = true;
    // deferred a tick: no synchronous setState inside an effect
    Promise.resolve().then(() => {
      if (!alive) return;
      const q = new URLSearchParams(window.location.search);
      const d = WINDOWS.some((w) => w.value === q.get('days')) ? q.get('days') : '30';
      setDays(d);
      if (q.get('days') !== d) {
        q.set('days', d);
        window.history.replaceState(null, '', `${window.location.pathname}?${q.toString()}`);
      }
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!days) return undefined;
    let alive = true;
    Promise.resolve().then(() => { if (alive) { setData(null); setErr(''); } });
    fetch('/api/usage?days=' + days)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `the server answered ${r.status}`);
        if (alive) setData(d);
      })
      .catch((e) => { if (alive) setErr(String(e.message || e).slice(0, 160)); });
    return () => { alive = false; }; // a stale window's answer never lands on the new one
  }, [days, nonce]);

  const setWindow = (d) => {
    setDays(d);
    const q = new URLSearchParams(window.location.search);
    q.set('days', d);
    window.history.replaceState(null, '', `${window.location.pathname}?${q.toString()}`);
  };

  if (!days) return <PageSkeleton />;

  const totals = data?.totals || {};
  const loaded = Boolean(data);
  const isEmpty = loaded && !err && (totals.events || 0) === 0;
  // Live fix wave C4 (T5-13): failures with their top reason, in words
  const failures = loaded ? failureSummary(totals, data.topErrors) : '';

  return (
    <div>
      <PageHeader icon={Coins} title="AI usage" sub={`AI calls and tokens · last ${days} days`} />

      <div className="mb-5 flex items-center gap-3 flex-wrap">
        <Segmented options={WINDOWS} value={days} onChange={setWindow} />
        <Segmented
          options={[{ value: 'tokens', label: 'Sort: tokens' }, { value: 'calls', label: 'Sort: calls' }]}
          value={sort}
          onChange={setSort}
        />
      </div>

      {err ? (
        <Card className="mb-5">
          <div className="px-5 py-6 flex flex-wrap items-center gap-3">
            <CircleAlert size={18} style={{ color: 'var(--bad-ink)' }} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="t-13 font-semibold text-ink">Usage ledger unavailable — this is not zero usage</p>
              <p className="t-12 text-muted mt-0.5 font-mono break-all">{err}</p>
            </div>
            <button className="btn btn-outline btn-sm shrink-0" onClick={() => setNonce((n) => n + 1)}><RefreshCw size={13} /> Retry</button>
          </div>
        </Card>
      ) : null}

      {isEmpty ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <span className="flex items-center justify-center w-12 h-12 rounded-2xl mb-4" style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>
              <ReceiptText size={22} />
            </span>
            <p className="t-14 font-semibold text-ink">No usage recorded yet — events appear after the first routed AI call</p>
            <p className="t-12 text-muted mt-1.5 max-w-md leading-relaxed">
              Every routed call (script-gen, tts, captions, search) writes one row to the usage ledger with its provider, model, tokens and measured-vs-estimated flag. Generate a documentary or a Short and this dashboard fills in.
            </p>
          </div>
        </Card>
      ) : null}

      {!loaded && !err ? <PageSkeleton /> : null}

      {loaded && !err && !isEmpty ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            <StatCard icon={Coins} label={`Tokens · ${days} days`} value={totals.tokens} fmt={fmt} color="var(--accent)" iconBg="color-mix(in srgb, var(--accent) 12%, transparent)" />
            <StatCard icon={Gauge} label="AI calls" value={totals.events} fmt={fmt} color="var(--info)" iconBg="color-mix(in srgb, var(--info) 12%, transparent)" />
            <StatCard icon={CheckCircle2} label="OK calls" value={totals.ok_calls} fmt={fmt} color="var(--ok)" iconBg="color-mix(in srgb, var(--ok) 12%, transparent)" />
            <StatCard icon={XCircle} label="Failed calls" value={totals.fail_calls} fmt={fmt} color="var(--bad)" iconBg="color-mix(in srgb, var(--bad) 12%, transparent)" />
          </div>
          {failures ? (
            <p className="t-12 text-muted -mt-2 mb-5 flex items-center gap-1.5">
              <XCircle size={13} style={{ color: 'var(--bad-ink)' }} className="shrink-0" /> {failures}
            </p>
          ) : null}

          <div className="mb-5">
            <RollupCard title="By channel" sub={`Tokens per channel · calls not tied to a channel are under Other · last ${days} days`} icon={Gauge} rows={data.byChannel} sort={sort} />
          </div>
          <div className="mb-5">
            <RollupCard title="By provider" sub={`Token spend per provider · last ${days} days`} icon={Bot} rows={data.byProvider} sort={sort} />
          </div>
          <div className="mb-5">
            <RollupCard title="By capability" sub={`Token spend per capability (script-gen / tts / …) · last ${days} days`} icon={Coins} rows={data.byCapability} sort={sort} />
          </div>

          <Card>
            <CardHead title="Recent events" sub="Last 50 ledger rows · newest first" icon={ReceiptText} />
            <div className="px-3 pb-3">
              <DataTable
                label="Recent usage events"
                rows={(data.recent || []).map((r) => ({ ...r, id: r.id }))}
                pageSize={10}
                columns={[
                  { key: 'created_at', label: 'When', rowHeader: true, render: (r) => <span className="tnum t-11 text-faint">{when(r.created_at)}</span> },
                  { key: 'provider', label: 'Provider', render: (r) => <span className="t-12 font-semibold text-ink font-mono">{none(r.provider)}</span> },
                  { key: 'model', label: 'Model', render: (r) => <span className="t-11 text-muted font-mono">{none(r.model)}</span> },
                  { key: 'capability', label: 'Capability', render: (r) => <Chip>{none(r.capability)}</Chip> },
                  { key: 'channel_id', label: 'Channel', render: (r) => <span className="t-11 text-muted font-mono">{none(r.channel_id)}</span> },
                  { key: 'tokens', label: 'Tokens', render: (r) => (
                    <span className="tnum t-12 font-semibold text-ink">
                      {fmt(r.tokens)} <span className="t-10 font-normal text-faint">{r.usage_source}</span>
                    </span>
                  ) },
                  { key: 'ok', label: 'Status', render: (r) => (
                    <Chip tone={r.ok ? 'ok' : 'bad'}>{r.ok ? 'ok' : `fail${r.error_class ? ` · ${r.error_class}` : ''}`}</Chip>
                  ) },
                  { key: 'job_id', label: 'Job', render: (r) => <span className="tnum t-11 text-faint font-mono">{none(r.job_id)}</span> },
                ]}
              />
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
