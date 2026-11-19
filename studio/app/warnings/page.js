'use client';
// #106 Phase 4 T5 — /warnings (D12/AC-P4-16): the durable record behind every
// ntfy push. Miss the phone and the row is still here: severity chips in the
// D9 ladder order, the verbatim official quote + source link + fetch date on
// citing rows, evidence, last_checked, acknowledge (staff+owner — never
// unblocks), "re-check now" (the probe runner), and owner manual-resolve with
// a REQUIRED note (AC-P4-15). Parked channels wear a badge; resolved history
// sits below. review_gating_inactive rows surface here (M3).
import { useEffect, useState } from 'react';
import { isRealSeverity } from '@/lib/notify-policy.mjs';
import Link from 'next/link';
import { Loader2, TriangleAlert, Ban, Eye, RotateCw, CheckCircle2, Quote, ScrollText } from 'lucide-react';
import { Card, CardHead, Chip, PageHeader, StatCard, EmptyState } from '@/components/ui';
import Drawer from '@/components/Drawer';
import apiFetch from '@/components/shell/api-fetch';
import { useMe } from '@/components/use-me';

// D9 ladder, low→high — pinned by lib/warnings-store.mjs SEVERITIES (inlined
// here: the store imports ntfy-alert (node:child_process) and must never ride
// in the client bundle).
// P0-9 DISPLAY order — most severe first (the store's ladder is a storage
// order; this array is for sorting the visible list, blocking at the top).
const SEVERITIES = ['blocking', 'action_required', 'warning', 'advisory', 'informational'];

const when = (iso) => (iso ? String(iso).replace('T', ' ').slice(0, 16) : '—');

const chipTone = (severity) => ({
  blocking: 'bad',
  action_required: 'warn',
  warning: 'info',
  advisory: 'plain',
  informational: 'accent',
}[severity] || 'plain');

// approval_dispatch_failed evidence reads "script <id>, job …" — the script
// id deep-links the Review desk straight to its Redispatch button.
const scriptIdOf = (w) => (w.code === 'approval_dispatch_failed' ? /script ([\w-]+)/.exec(w.evidence || '')?.[1] || null : null);

function WarningRow({ w, isOwner, onAck, onResolve, onRecheck, busy }) {
  const scriptId = scriptIdOf(w);
  return (
    <div className="border-b border-line py-3 last:border-0">
      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <Chip tone={chipTone(w.severity)} dot>{w.severity}</Chip>
          <div className="flex-1 min-w-0">
            <div className="t-13 font-semibold text-ink break-words">
              {w.title}
              {w.blocks_publishing ? <span className="ml-2 t-11 font-semibold" style={{ color: 'var(--bad-ink)' }}>PUBLISHING BLOCKED</span> : null}
              {w.code === 'review_gating_inactive' ? <span className="ml-2 t-11 text-muted">review queue</span> : null}
            </div>
            {w.explanation ? <div className="t-12 text-muted mt-0.5 break-words">{w.explanation}</div> : null}
            {w.evidence ? <div className="t-11 text-faint mt-1 break-all">evidence: {w.evidence}</div> : null}
            {w.policy_quote ? (
              <div className="t-11 mt-1.5 bg-surface-2 border border-line rounded-lg p-2 flex gap-2">
                <Quote size={11} className="shrink-0 mt-0.5 text-muted" />
                <span className="min-w-0 break-words">
                  &ldquo;{w.policy_quote}&rdquo;
                  {w.policy_url ? <> — <a href={w.policy_url} target="_blank" rel="noreferrer" className="underline">official source</a></> : null}
                  {w.quote_fetched_at ? <span className="text-faint"> (fetched {when(w.quote_fetched_at)})</span> : null}
                </span>
              </div>
            ) : null}
            {w.recommended_action ? <div className="t-11 text-muted mt-1 break-words">→ {w.recommended_action}</div> : null}
            <div className="t-10 text-faint mt-1.5 tnum break-words">
              {w.channel_id} · {w.code}{w.job_id ? ` · job ${w.job_id}` : ''} · last checked {when(w.last_checked_at)} · opened {when(w.created_at)}
              {w.acknowledged_by ? ` · acknowledged by ${w.acknowledged_by}` : ''}
            </div>
          </div>
        </div>
        {/* phones: 44px action buttons on their own wrapping row */}
        <div className="flex flex-wrap items-center gap-2 md:shrink-0">
          {scriptId ? (
            <Link href={`/review?id=${encodeURIComponent(scriptId)}`} className="btn btn-primary btn-sm min-h-[44px] md:min-h-0">
              <ScrollText size={11} /> Open in Review
            </Link>
          ) : null}
          {w.state === 'open' ? (
            <button onClick={() => onAck(w)} disabled={busy === `ack-${w.id}`} className="btn btn-outline btn-sm min-h-[44px] md:min-h-0" title='records "seen" — never unblocks (D11)'>
              {busy === `ack-${w.id}` ? <Loader2 size={11} className="animate-spin" /> : <Eye size={11} />} Acknowledge
            </button>
          ) : null}
          <button onClick={() => onRecheck(w)} disabled={busy === `recheck-${w.id}`} className="btn btn-outline btn-sm min-h-[44px] md:min-h-0" title="runs the probe for this channel (mapped + auto-verifiable codes only)">
            {busy === `recheck-${w.id}` ? <Loader2 size={11} className="animate-spin" /> : <RotateCw size={11} />} Re-check
          </button>
          {isOwner && w.state !== 'resolved' ? (
            <button onClick={() => onResolve(w)} disabled={busy === `resolve-${w.id}`} className="btn btn-outline btn-sm min-h-[44px] md:min-h-0" title="owner manual resolve — note recorded, never silent (AC-P4-15)">
              {busy === `resolve-${w.id}` ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />} Resolve
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function WarningsDashboardPage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  // owner manual-resolve opens a drawer (note REQUIRED, AC-P4-15) instead of
  // an inline input squeezed into the row
  const [resolving, setResolving] = useState(null);
  const [note, setNote] = useState('');
  const me = useMe();
  const isOwner = me?.role === 'owner'; // the route re-checks; this only hides a control that would 403

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

  // Most severe first (SEVERITIES is display order — the old b-a comparator
  // put informational notes at the top and buried the real problems).
  const allOpen = (data?.open || []).slice().sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));
  // Owner policy 2026-11-19: real problems are the triage list; quiet
  // advisory/informational notes fold into "For your information".
  const open = allOpen.filter((w) => isRealSeverity(w.severity));
  const quietRows = allOpen.filter((w) => !isRealSeverity(w.severity));
  const quietGroups = Object.values(quietRows.reduce((acc, w) => {
    const k = `${w.channel_id}::${w.code}`;
    (acc[k] = acc[k] || { key: k, channel: w.channel_id, code: w.code, sample: w, count: 0 }).count += 1;
    return acc;
  }, {}));
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

      {err && data ? <p className="t-13 mb-4" role="alert" style={{ color: 'var(--bad-ink)' }}>{err}</p> : null}

      {err && !data ? (
        <Card className="p-5 text-center">
          <p className="t-13 font-semibold text-ink">Can&apos;t load warnings</p>
          <p className="t-12 text-faint mt-1">{err} — the alerts on your phone (ntfy) are unaffected.</p>
          <button className="btn btn-outline mt-3" onClick={load}>Try again</button>
        </Card>
      ) : !data ? (
        <div className="flex items-center gap-2 text-muted t-13 py-8"><Loader2 size={15} className="animate-spin" /> Loading warnings…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-5">
            <StatCard icon={TriangleAlert} label="Need you" value={open.length} color={open.length ? 'var(--warn)' : undefined} />
            <StatCard icon={Ban} label="Parked channels" value={parked.size} color="var(--bad)" />
            <StatCard icon={CheckCircle2} label="Resolved (recent)" value={(data.resolved || []).length} />
          </div>

          <div className="flex justify-end mb-3">
            <button
              onClick={() => act({ action: 'recheck' }, 'recheck-all')}
              disabled={busy === 'recheck-all'}
              className="btn btn-outline btn-sm min-h-[44px] md:min-h-0 w-full sm:w-auto"
              title="run the parked-channel probes across the network"
            >
              {busy === 'recheck-all' ? <Loader2 size={11} className="animate-spin" /> : <RotateCw size={11} />} Re-check all parked channels
            </button>
          </div>

          {open.length === 0 ? (
            <Card>
              <EmptyState icon={CheckCircle2} title="Nothing needs you" sub="No real problems open. Low-priority notes (if any) are listed below under For your information." />
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
                      isOwner={isOwner}
                      busy={busy}
                      onAck={(x) => act({ action: 'acknowledge', id: x.id }, `ack-${x.id}`)}
                      onResolve={(x) => { setNote(''); setResolving(x); }}
                      onRecheck={(x) => act({ action: 'recheck', channelId: x.channel_id }, `recheck-${x.id}`)}
                    />
                  ))}
                </div>
              </Card>
            ))
          )}

          {quietGroups.length ? (
            <details className="card mt-4 group">
              <summary className="cursor-pointer list-none px-5 py-4 flex items-center gap-2 t-13 font-semibold text-ink">
                <span className="text-faint group-open:rotate-90 transition-transform">›</span>
                For your information · {quietRows.length} note{quietRows.length === 1 ? '' : 's'} — no action needed
              </summary>
              <div className="px-5 pb-4 space-y-2">
                {quietGroups.map((g) => (
                  <div key={g.key} className="inset-tile px-3 py-2.5">
                    <p className="t-12 font-semibold text-ink">{g.count}× {g.code.replace(/_/g, ' ')} · <span className="text-faint">{g.channel}</span></p>
                    {g.sample.explanation ? <p className="t-11 text-faint mt-0.5">{g.sample.explanation}</p> : null}
                  </div>
                ))}
              </div>
            </details>
          ) : null}

          {(data.resolved || []).length ? (
            <Card className="mt-4">
              <CardHead icon={CheckCircle2} title="Resolved history" sub="manual resolves carry resolved_by + note (AC-P4-15) — newest first, 50 most recent" />
              <div className="px-5 pb-5 space-y-1.5">
                {data.resolved.map((w) => (
                  <div key={w.id} className="t-12 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted">
                    <Chip tone={chipTone(w.severity)}>{w.severity}</Chip>
                    <span className="flex-1 min-w-0 break-words">{w.title}</span>
                    <span className="text-faint">{w.channel_id}</span>
                    <span className="text-faint tnum">{w.resolved_by} · {when(w.resolved_at)}</span>
                    {w.resolve_note ? <span className="text-faint break-words min-w-0">— &ldquo;{w.resolve_note}&rdquo;</span> : null}
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </>
      )}

      {resolving ? (
        <ResolveDrawer
          w={resolving}
          note={note}
          setNote={setNote}
          busy={busy}
          onClose={() => setResolving(null)}
          onResolve={async (w, text) => {
            setResolving(null);
            await act({ action: 'resolve', id: w.id, note: text }, `resolve-${w.id}`);
          }}
        />
      ) : null}
    </div>
  );
}

// Owner manual-resolve (AC-P4-15): the note is REQUIRED and recorded with the
// resolver's name. Props only — the page owns every hook value.
function ResolveDrawer({ w, note, setNote, busy, onClose, onResolve }) {
  return (
    <Drawer
      open
      onClose={onClose}
      title="Resolve warning"
      description={`${w.channel_id} · ${w.title}`}
      icon={CheckCircle2}
      size="sm"
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={busy === `resolve-${w.id}` || !note.trim()}
            onClick={() => { if (note.trim()) onResolve(w, note.trim()); }}
          >
            <CheckCircle2 size={14} /> Resolve
          </button>
        </>
      }
    >
      <label className="block t-12 font-semibold text-ink mb-1.5" htmlFor="resolve-note">Why is this resolved? (required)</label>
      <textarea
        id="resolve-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={4}
        className="input w-full t-13"
        placeholder="e.g. reconnected Google — uploads verified on the next run"
      />
      <p className="t-11 text-faint mt-2">The note is recorded with your name in the resolved history.</p>
    </Drawer>
  );
}
