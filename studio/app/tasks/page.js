'use client';
// #126 (S-1) — LIVE operations board. The hardcoded September roadmap list is
// deleted; these three groups are the real, current work queue:
//   Open warnings          ← /api/warnings  (the durable alert triage source)
//   Awaiting your approval ← /api/review    (held scripts before any render)
//   Recently resolved      ← /api/warnings resolved tail (proof of motion)
//   Questions (on top)     ← /api/asks (Creator City item 6: typed asks with
//                            buttons; an ask made from a warning stands in
//                            for that warning's row — the bell/count stay
//                            warning-based, so nothing is counted twice)
// Owner/staff only — both APIs gate on role; clients get an honest state.
import { useEffect, useState } from 'react';
import { SquareKanban, OctagonAlert, ScrollText, CircleCheck, Circle, ArrowRight } from 'lucide-react';
import { Card, CardHead, Chip, PageHeader } from '@/components/ui';
import Link from 'next/link';
import { groupRealWarnings, needsYou } from '@/lib/notify-policy.mjs';
import { withoutDrills } from '@/lib/drill-rows.mjs'; // wave C2 (T1-17): drills never reach the owner's lists
import InboxAsks from '@/components/InboxAsks';

const sevTone = { blocking: 'bad', action_required: 'warn', warning: 'warn', advisory: 'info', informational: 'plain' }; // P0-9 real keys

export default function Tasks() {
  const [warnings, setWarnings] = useState(null); // {open, resolved} | 'denied'
  const [pending, setPending] = useState(null);   // scripts[] | 'denied'
  const [loaded, setLoaded] = useState(false);
  const [asks, setAsks] = useState(null);         // {list, canAnswer} | 'denied' | 'error'
  const [tick, setTick] = useState(0);            // bump = reload every source (after an answer)

  useEffect(() => {
    let alive = true;
    fetch('/api/warnings')
      .then((r) => (r.status === 401 || r.status === 403 ? 'denied' : r.ok ? r.json() : 'error'))
      .then((d) => { if (alive) setWarnings(d === 'denied' ? 'denied' : d === 'error' ? 'error' : { open: d.open || [], resolved: d.resolved || [] }); })
      .catch(() => { if (alive) setWarnings('error'); });
    fetch('/api/review')
      .then((r) => (r.status === 401 || r.status === 403 ? 'denied' : r.ok ? r.json() : 'error'))
      .then((d) => { if (alive) setPending(d === 'denied' ? 'denied' : d === 'error' ? 'error' : (d.scripts || [])); })
      .catch(() => { if (alive) setPending('error'); });
    fetch('/api/asks')
      .then((r) => (r.status === 401 || r.status === 403 ? 'denied' : r.ok ? r.json() : 'error'))
      .then((d) => { if (alive) setAsks(d === 'denied' || d === 'error' ? d : { list: d.asks || [], canAnswer: d.canAnswer === true }); })
      .catch(() => { if (alive) setAsks('error'); });
    const t = setTimeout(() => { if (alive) setLoaded(true); }, 400);
    return () => { alive = false; clearTimeout(t); };
  }, [tick]);

  const denied = warnings === 'denied' && pending === 'denied';
  const anyError = warnings === 'error' || pending === 'error';
  // Owner policy 2026-11-19: the inbox lists REAL problems, grouped (repeats
  // count once); quiet advisory notes live on /warnings under FYI.
  // Open rows stay as they are so this count matches the bell and Today (one
  // number everywhere); an OPEN drill is a live exercise the owner is running.
  const open = Array.isArray(warnings?.open) ? groupRealWarnings(warnings.open) : [];
  // Creator City item 6: a warning that a question covers shows as the
  // question only (one item); the count above stays the bell's number.
  const askList = asks && typeof asks === 'object' ? asks.list : [];
  const covered = new Set(askList.flatMap((a) => a.covers || []));
  const openShown = Array.isArray(warnings?.open) ? groupRealWarnings(warnings.open.filter((w) => !covered.has(String(w.id)))) : [];
  // wave C2 (T1-17): finished drills/tests ("DRILL 2: simulated revoked token")
  // are not the owner's history
  const resolved = Array.isArray(warnings?.resolved) ? withoutDrills(warnings.resolved) : [];
  const scripts = Array.isArray(pending) ? pending : [];
  // THE one number (notify-policy needsYou — same as home, /warnings, bell):
  // a held-slot alert and its waiting script count once.
  const need = needsYou({ rows: open, awaiting: scripts.length });

  if (denied && loaded) {
    return (
      <div>
        <PageHeader icon={SquareKanban} title="Inbox" sub="Live operations queue" />
        <Card className="p-8 text-center">
          <p className="t-13 font-semibold text-ink">Owner / staff only</p>
          <p className="t-12 text-faint mt-1">The live task queue (warnings + approvals) is a staff surface.</p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader icon={SquareKanban} title="Inbox" sub={!loaded || warnings === null || pending === null ? 'loading live queue…' : anyError ? "some sources can't be checked right now — counts may be incomplete" : `${need.count} things need you · ${need.alerts} problems · ${need.approvals} awaiting approval`} />

      <InboxAsks asks={askList} canAnswer={asks?.canAnswer === true} onAnswered={() => setTick((n) => n + 1)} />
      {asks === 'error' ? <p className="t-11 mb-3" style={{ color: 'var(--bad-ink)' }}>Questions can&apos;t be checked right now.</p> : null}

      {/* Live fix wave B3 (T1-03): min-w-0 grid items + wrapping titles — one
          long alert title used to stretch the page to 980px on phones */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <Card className="p-5 min-w-0">
          <div className="flex items-center gap-3 mb-4">
            <span className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              <OctagonAlert size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="section-title truncate">Open warnings</h2>
              <p className="t-11 text-faint">{warnings === 'denied' || warnings === 'error' ? '—' : warnings === null ? 'checking…' : `${openShown.length} unresolved`}</p>
            </div>
          </div>
          {warnings === 'denied' ? (
            <p className="t-12 text-faint px-1">Not available for your role.</p>
          ) : warnings === 'error' ? (
            <p className="t-12 px-1" style={{ color: 'var(--bad-ink)' }}>Can&apos;t check right now — status unknown, not an all-clear.</p>
          ) : warnings === null ? (
            <div className="space-y-1.5">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-8" />)}</div>
          ) : open.length === 0 ? (
            <p className="t-12 text-faint px-1">Nothing unresolved — all probes quiet.</p>
          ) : openShown.length === 0 ? (
            <p className="t-12 text-faint px-1">Every open problem is a question above.</p>
          ) : (
            <ul className="space-y-1">
              {openShown.slice(0, 8).map((w) => (
                <li key={w.id}>
                  <Link href="/warnings" className="inset-tile px-3 py-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0 hover:bg-surface-2 transition-colors">
                    <span className="shrink-0"><Chip tone={sevTone[w.severity] || 'plain'} dot>{w.severity}</Chip></span>
                    <span className="min-w-0 flex-1 basis-40 t-12 text-ink break-words [overflow-wrap:anywhere]">{w.title}</span>
                    {w.channel_id ? <span className="t-10 text-faint font-mono truncate max-w-[90px]">{w.channel_id}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {warnings !== 'denied' ? <Link href="/warnings" className="inline-flex items-center gap-1 mt-3 t-11 text-accent hover:underline">full triage <ArrowRight size={12} aria-hidden /></Link> : null}
        </Card>

        <Card className="p-5 min-w-0">
          <div className="flex items-center gap-3 mb-4">
            <span className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              <ScrollText size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="section-title truncate">Awaiting your approval</h2>
              <p className="t-11 text-faint">{pending === 'denied' || pending === 'error' ? '—' : pending === null ? 'checking…' : `${scripts.length} held scripts`}</p>
            </div>
          </div>
          {pending === 'denied' ? (
            <p className="t-12 text-faint px-1">Not available for your role.</p>
          ) : pending === 'error' ? (
            <p className="t-12 px-1" style={{ color: 'var(--bad-ink)' }}>Can&apos;t check right now — status unknown.</p>
          ) : pending === null ? (
            <div className="space-y-1.5">{[0, 1].map((i) => <div key={i} className="skeleton h-8" />)}</div>
          ) : scripts.length === 0 ? (
            <p className="t-12 text-faint px-1">Review queue is clear — nothing waiting.</p>
          ) : (
            <ul className="space-y-1">
              {scripts.slice(0, 8).map((s, i) => (
                <li key={s.id || i}>
                  {/* each held script opens straight into its review */}
                  <Link href={s.id ? `/review?id=${encodeURIComponent(s.id)}` : '/review'} className="inset-tile px-3 py-2 flex items-center gap-2.5 min-w-0 hover:bg-surface-2 transition-colors">
                    <span className="min-w-0 flex-1 t-12 text-ink break-words [overflow-wrap:anywhere]">{s.title || s.topic || s.id}</span>
                    {s.channel_id || s.slug ? <span className="t-10 text-faint font-mono truncate max-w-[90px]">{s.channel_id || s.slug}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {pending !== 'denied' ? <Link href="/review" className="inline-flex items-center gap-1 mt-3 t-11 text-accent hover:underline">review queue <ArrowRight size={12} aria-hidden /></Link> : null}
        </Card>

        <Card className="p-5 min-w-0">
          <div className="flex items-center gap-3 mb-4">
            <span className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              <CircleCheck size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="section-title truncate">Recently resolved</h2>
              <p className="t-11 text-faint">{warnings === 'denied' || warnings === 'error' ? '—' : warnings === null ? 'checking…' : `${resolved.length} in the recent tail`}</p>
            </div>
          </div>
          {warnings === 'denied' ? (
            <p className="t-12 text-faint px-1">Not available for your role.</p>
          ) : warnings === 'error' ? (
            <p className="t-12 px-1" style={{ color: 'var(--bad-ink)' }}>Can&apos;t check right now — status unknown.</p>
          ) : warnings === null ? (
            <div className="space-y-1.5">{[0, 1].map((i) => <div key={i} className="skeleton h-8" />)}</div>
          ) : resolved.length === 0 ? (
            <p className="t-12 text-faint px-1">No resolved warnings yet.</p>
          ) : (
            <ul className="space-y-1">
              {resolved.slice(0, 6).map((w) => (
                <li key={w.id} className="inset-tile px-3 py-2 flex items-center gap-2.5">
                  <Circle size={12} className="text-faint shrink-0" />
                  <span className="min-w-0 flex-1 t-12 text-faint break-words [overflow-wrap:anywhere]">{w.title}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
