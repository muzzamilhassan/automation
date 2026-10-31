'use client';
// #106 Phase 4 T5 — /warnings (D12/AC-P4-16): the durable record behind every
// ntfy push. Miss the phone and the row is still here: severity chips in the
// D9 ladder order, the verbatim official quote + source link + fetch date on
// citing rows, evidence, last_checked, acknowledge (staff+owner — never
// unblocks), "re-check now" (the probe runner), and owner manual-resolve with
// a REQUIRED note (AC-P4-15). Parked channels wear a badge; resolved history
// sits below. review_gating_inactive rows surface here (M3).
import { useEffect, useState } from 'react';
import { Loader2, TriangleAlert, Ban, Eye, RotateCw, CheckCircle2, Quote } from 'lucide-react';
import { Card, CardHead, Chip, PageHeader, StatCard, EmptyState } from '@/components/ui';
import apiFetch from '@/components/shell/api-fetch';

// D9 ladder, low→high — pinned by lib/warnings-store.mjs SEVERITIES (inlined
// here: the store imports ntfy-alert (node:child_process) and must never ride
// in the client bundle).
const SEVERITIES = ['advisory', 'warning', 'action_required', 'blocking', 'informational'];

const when = (iso) => (iso ? String(iso).replace('T', ' ').slice(0, 16) : '—');

const chipTone = (severity) => ({
  blocking: 'bad',
  action_required: 'warn',
  warning: 'info',
  advisory: 'plain',
  informational: 'accent',
}[severity] || 'plain');

function WarningRow({ w, isOwner, onAck, onResolve, onRecheck, busy }) {
  return (
    <div className="border-b border-white/5 py-3 last:border-0">
      <div className="flex items-start gap-3">
        <Chip tone={chipTone(w.severity)} dot>{w.severity}</Chip>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-ink">
            {w.title}
            {w.blocks_publishing ? <span className="ml-2 text-[11px]" style={{ color: 'var(--bad)' }}>PUBLISHING BLOCKED</span> : null}
            {w.code === 'review_gating_inactive' ? <span className="ml-2 text-[11px] text-muted">review queue</span> : null}
          </div>
          {w.explanation ? <div className="text-[12px] text-muted mt-0.5">{w.explanation}</div> : null}
          {w.evidence ? <div className="text-[11.5px] text-faint mt-1 break-all">evidence: {w.evidence}</div> : null}
          {w.policy_quote ? (
            <div className="text-[11.5px] mt-1.5 bg-black/20 rounded-lg p-2 flex gap-2">
              <Quote size={11} className="shrink-0 mt-0.5 text-muted" />
              <span>
                &ldquo;{w.policy_quote}&rdquo;
                {w.policy_url ? <> — <a href={w.policy_url} target="_blank" rel="noreferrer" className="underline">official source</a></> : null}
                {w.quote_fetched_at ? <span className="text-faint"> (fetched {when(w.quote_fetched_at)})</span> : null}
              </span>
            </div>
          ) : null}
          {w.recommended_action ? <div className="text-[11.5px] text-muted mt-1">→ {w.recommended_action}</div> : null}
          <div className="text-[10.5px] text-faint mt-1.5 tnum">
            {w.channel_id} · {w.code}{w.job_id ? ` · job ${w.job_id}` : ''} · last checked {when(w.last_checked_at)} · opened {when(w.created_at)}
            {w.acknowledged_by ? ` · acknowledged by ${w.acknowledged_by}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {w.state === 'open' ? (
            <button onClick={() => onAck(w)} disabled={busy === `ack-${w.id}`} className="inline-flex items-center gap-1 text-[11.5px] text-muted cursor-pointer disabled:opacity-50" title='records "seen" — never unblocks (D11)'>
              {busy === `ack-${w.id}` ? <Loader2 size={11} className="animate-spin" /> : <Eye size={11} />} Acknowledge
            </button>
          ) : null}
          <button onClick={() => onRecheck(w)} disabled={busy === `recheck-${w.id}`} className="inline-flex items-center gap-1 text-[11.5px] text-muted cursor-pointer disabled:opacity-50" title="runs the probe for this channel (mapped + auto-verifiable codes only)">
            {busy === `recheck-${w.id}` ? <Loader2 size={11} className="animate-spin" /> : <RotateCw size={11} />} Re-check
          </button>
          {isOwner && w.state !== 'resolved' ? <ResolveButton w={w} busy={busy} onResolve={onResolve} /> : null}
        </div>
      </div>
    </div>
  );
}

function ResolveButton({ w, busy, onResolve }) {
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);
  return open ? (
    <span className="inline-flex items-center gap-1">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="resolve note (required)"
        className="w-40 text-[11.5px] bg-black/20 rounded px-2 py-1"
      />
      <button
        onClick={() => { if (note.trim()) { onResolve(w, note.trim()); setOpen(false); } }}
        disabled={busy === `resolve-${w.id}` || !note.trim()}
        className="text-[11.5px] cursor-pointer disabled:opacity-50"
        style={{ color: 'var(--ok, #34d399)' }}
      >
        {busy === `resolve-${w.id}` ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />} Resolve
      </button>
    </span>
  ) : (
    <button onClick={() => setOpen(true)} disabled={busy === `resolve-${w.id}`} className="inline-flex items-center gap-1 text-[11.5px] text-muted cursor-pointer disabled:opacity-50" title="owner manual resolve — note recorded, never silent (AC-P4-15)">
      Resolve
    </button>
  );
}

export default function WarningsDashboardPage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');

  const load = () => {
    apiFetch('/api/warnings')
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok || d.error) setErr(d.error || 'failed');
        else setData(d);
      })
      .catch((e) => setErr(e.message));
  };
  useEffect(load, []);

  const act = async (body, tag) => {
    setBusy(tag);
    setErr('');
    try {
      const r = await apiFetch('/api/warnings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok && r.status !== 202) throw new Error(d.error || 'failed');
    } catch (e) {
      setErr(e.message);
    }
    setBusy('');
    load();
  };

  const open = (data?.open || []).slice().sort((a, b) => SEVERITIES.indexOf(b.severity) - SEVERITIES.indexOf(a.severity));
  const byChannel = open.reduce((acc, w) => {
    (acc[w.channel_id] = acc[w.channel_id] || []).push(w);
    return acc;
  }, {});
  const parked = new Set(data?.parked || []);

  return (
    <div>
      <PageHeader
        icon={TriangleAlert}
        title="Warnings"
        sub="Every pipeline alert, durably — severity per the policy ladder, official citations on blocking rows. ntfy stays the bell; this is the record."
      />

      {err ? <p className="text-[13px] mb-4" style={{ color: 'var(--bad)' }}>{err}</p> : null}

      {!data ? (
        <div className="flex items-center gap-2 text-muted text-sm py-8"><Loader2 size={15} className="animate-spin" /> Loading warnings…</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 mb-5">
            <StatCard icon={TriangleAlert} label="Open warnings" value={open.length} color={open.length ? 'var(--warn, orange)' : undefined} />
            <StatCard icon={Ban} label="Parked channels" value={parked.size} color="var(--bad)" />
            <StatCard icon={CheckCircle2} label="Resolved (recent)" value={(data.resolved || []).length} />
          </div>

          <div className="flex justify-end mb-3">
            <button
              onClick={() => act({ action: 'recheck' }, 'recheck-all')}
              disabled={busy === 'recheck-all'}
              className="inline-flex items-center gap-1 text-[12px] text-muted cursor-pointer disabled:opacity-50"
              title="run the parked-channel probes across the network"
            >
              {busy === 'recheck-all' ? <Loader2 size={11} className="animate-spin" /> : <RotateCw size={11} />} Re-check all parked channels
            </button>
          </div>

          {open.length === 0 ? (
            <Card>
              <EmptyState icon={CheckCircle2} title="No open warnings" sub="Every alert site is quiet. Rows appear here the moment a pipeline emitter fires — they outlive the ntfy push." />
            </Card>
          ) : (
            Object.entries(byChannel).map(([channel, rows]) => (
              <Card key={channel} className="mb-4">
                <CardHead
                  icon={TriangleAlert}
                  title={channel}
                  sub={`${rows.length} open`}
                  right={parked.has(channel) ? <Chip tone="bad" dot>PARKED</Chip> : null}
                />
                <div className="px-5 pb-3">
                  {rows.map((w) => (
                    <WarningRow
                      key={w.id}
                      w={w}
                      isOwner // render the button for everyone; the route 403s non-owners (server re-check is the gate)
                      busy={busy}
                      onAck={(x) => act({ action: 'acknowledge', id: x.id }, `ack-${x.id}`)}
                      onResolve={(x, note) => act({ action: 'resolve', id: x.id, note }, `resolve-${x.id}`)}
                      onRecheck={(x) => act({ action: 'recheck', channelId: x.channel_id }, `recheck-${x.id}`)}
                    />
                  ))}
                </div>
              </Card>
            ))
          )}

          {(data.resolved || []).length ? (
            <Card className="mt-4">
              <CardHead icon={CheckCircle2} title="Resolved history" sub="manual resolves carry resolved_by + note (AC-P4-15) — newest first, 50 most recent" />
              <div className="px-5 pb-5 space-y-1.5">
                {data.resolved.map((w) => (
                  <div key={w.id} className="text-[12px] flex items-center gap-2 text-muted">
                    <Chip tone={chipTone(w.severity)}>{w.severity}</Chip>
                    <span className="flex-1">{w.title}</span>
                    <span className="text-faint">{w.channel_id}</span>
                    <span className="text-faint tnum">{w.resolved_by} · {when(w.resolved_at)}</span>
                    {w.resolve_note ? <span className="text-faint">— &ldquo;{w.resolve_note}&rdquo;</span> : null}
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
