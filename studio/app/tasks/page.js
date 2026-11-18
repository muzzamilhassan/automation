'use client';
// #126 (S-1) — LIVE operations board. The hardcoded September roadmap list is
// deleted; these three groups are the real, current work queue:
//   Open warnings          ← /api/warnings  (the durable alert triage source)
//   Awaiting your approval ← /api/review    (held scripts before any render)
//   Recently resolved      ← /api/warnings resolved tail (proof of motion)
// Owner/staff only — both APIs gate on role; clients get an honest state.
import { useEffect, useState } from 'react';
import { SquareKanban, OctagonAlert, ScrollText, CircleCheck, Circle } from 'lucide-react';
import { Card, CardHead, Chip, PageHeader } from '@/components/ui';
import Link from 'next/link';

const sevTone = { bad: 'bad', warn: 'warn', info: 'info' };

export default function Tasks() {
  const [warnings, setWarnings] = useState(null); // {open, resolved} | 'denied'
  const [pending, setPending] = useState(null);   // scripts[] | 'denied'
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/warnings')
      .then((r) => (r.ok ? r.json() : 'denied'))
      .then((d) => { if (alive) setWarnings(d === 'denied' ? 'denied' : { open: d.open || [], resolved: d.resolved || [] }); })
      .catch(() => { if (alive) setWarnings('denied'); });
    fetch('/api/review')
      .then((r) => (r.ok ? r.json() : 'denied'))
      .then((d) => { if (alive) setPending(d === 'denied' ? 'denied' : (d.scripts || [])); })
      .catch(() => { if (alive) setPending('denied'); });
    const t = setTimeout(() => { if (alive) setLoaded(true); }, 400);
    return () => { alive = false; clearTimeout(t); };
  }, []);

  const denied = warnings === 'denied' && pending === 'denied';
  const open = Array.isArray(warnings?.open) ? warnings.open : [];
  const resolved = Array.isArray(warnings?.resolved) ? warnings.resolved : [];
  const scripts = Array.isArray(pending) ? pending : [];
  const total = open.length + scripts.length;

  if (denied && loaded) {
    return (
      <div>
        <PageHeader icon={SquareKanban} title="Tasks" sub="Live operations queue" />
        <Card className="p-8 text-center">
          <p className="text-[13px] font-semibold text-ink">Owner / staff only</p>
          <p className="text-[12px] text-faint mt-1">The live task queue (warnings + approvals) is a staff surface.</p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader icon={SquareKanban} title="Tasks" sub={loaded ? `${total} open items · ${open.length} warnings · ${scripts.length} awaiting approval` : 'loading live queue…'} />

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        <Card hover className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <span className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              <OctagonAlert size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="section-title truncate">Open warnings</h2>
              <p className="text-[11px] text-faint">{warnings === 'denied' ? '—' : `${open.length} unresolved`}</p>
            </div>
          </div>
          {warnings === 'denied' ? (
            <p className="text-[12px] text-faint px-1">Not available for your role.</p>
          ) : open.length === 0 ? (
            <p className="text-[12px] text-faint px-1">Nothing unresolved — all probes quiet.</p>
          ) : (
            <ul className="space-y-1">
              {open.slice(0, 8).map((w) => (
                <li key={w.id} className="inset-tile px-3 py-2 flex items-center gap-2.5">
                  <Chip tone={sevTone[w.severity] || 'plain'} dot>{w.severity}</Chip>
                  <span className="min-w-0 flex-1 text-[12px] text-ink truncate">{w.title}</span>
                  {w.channel_id ? <span className="text-[10.5px] text-faint font-mono truncate max-w-[90px]">{w.channel_id}</span> : null}
                </li>
              ))}
            </ul>
          )}
          {warnings !== 'denied' ? <Link href="/warnings" className="inline-block mt-3 text-[11.5px] text-accent hover:underline">full triage →</Link> : null}
        </Card>

        <Card hover className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <span className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              <ScrollText size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="section-title truncate">Awaiting your approval</h2>
              <p className="text-[11px] text-faint">{pending === 'denied' ? '—' : `${scripts.length} held scripts`}</p>
            </div>
          </div>
          {pending === 'denied' ? (
            <p className="text-[12px] text-faint px-1">Not available for your role.</p>
          ) : scripts.length === 0 ? (
            <p className="text-[12px] text-faint px-1">Review queue is clear — nothing waiting.</p>
          ) : (
            <ul className="space-y-1">
              {scripts.slice(0, 8).map((s, i) => (
                <li key={s.id || i} className="inset-tile px-3 py-2 flex items-center gap-2.5">
                  <span className="min-w-0 flex-1 text-[12px] text-ink truncate">{s.title || s.topic || s.id}</span>
                  {s.slug ? <span className="text-[10.5px] text-faint font-mono truncate max-w-[90px]">{s.slug}</span> : null}
                </li>
              ))}
            </ul>
          )}
          {pending !== 'denied' ? <Link href="/review" className="inline-block mt-3 text-[11.5px] text-accent hover:underline">review queue →</Link> : null}
        </Card>

        <Card hover className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <span className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              <CircleCheck size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="section-title truncate">Recently resolved</h2>
              <p className="text-[11px] text-faint">{warnings === 'denied' ? '—' : `${resolved.length} in the recent tail`}</p>
            </div>
          </div>
          {warnings === 'denied' ? (
            <p className="text-[12px] text-faint px-1">Not available for your role.</p>
          ) : resolved.length === 0 ? (
            <p className="text-[12px] text-faint px-1">No resolved warnings yet.</p>
          ) : (
            <ul className="space-y-1">
              {resolved.slice(0, 6).map((w) => (
                <li key={w.id} className="inset-tile px-3 py-2 flex items-center gap-2.5">
                  <Circle size={12} className="text-faint shrink-0" />
                  <span className="min-w-0 flex-1 text-[12px] text-faint truncate">{w.title}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
