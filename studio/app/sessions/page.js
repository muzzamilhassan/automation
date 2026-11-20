'use client';
// P4/S6 (#106) — Sessions admin (owner-only, /sessions). Every user's
// sign-ins in one table with a Revoke per row: the row flips `revoked` in
// Neon and the device is out on its very next request (userByToken checks
// the flag per-request) — instant, not at cookie expiry. Expired/revoked
// rows are greyed. Data: /api/sessions?scope=all (the route re-checks the
// owner role server-side; the proxy rule is only the first gate).
import { useEffect, useState } from 'react';
import { Loader2, MonitorSmartphone, Ban } from 'lucide-react';
import { Card, CardHead, Chip, PageHeader, StatCard } from '@/components/ui';
import DataTable from '@/components/DataTable';
import apiFetch from '@/components/shell/api-fetch';
import { useConfirm } from '@/components/ConfirmDialog';
import { localTime } from '@/lib/session-view.mjs';

// Live fix wave C4 (T5-07): the same local, labelled format as Settings › Security
const when = (iso) => localTime(iso);

export default function SessionsAdminPage() {
  const [sessions, setSessions] = useState(null);
  const [current, setCurrent] = useState(0);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState(null);
  const confirm = useConfirm();

  const load = () => {
    // apiFetch: a 401 here means this device's session was revoked/expired —
    // the wrapper sends it to /login instantly (AC-P4-29's redirect half).
    apiFetch('/api/sessions?scope=all')
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d.error) setErr(d.error || `the server answered ${r.status}`);
        else {
          setSessions(d.sessions || []);
          setCurrent(d.current || 0);
        }
      })
      .catch((e) => setErr(e.message));
  };
  useEffect(load, []);

  const revoke = async (row) => {
    const self = row.id === current;
    const ok = await confirm({
      title: `Revoke ${row.email}'s session?`,
      body: `${row.device ? `${row.device} — ` : ''}that device loses access on its very next request.${self ? ' This is YOUR current device — you will be signed out.' : ''}`,
      confirmLabel: 'Revoke session',
      tone: 'danger',
    });
    if (!ok) return;
    setBusyId(row.id);
    setErr('');
    try {
      const r = await apiFetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not revoke');
      if (self) {
        window.location.href = '/login';
        return;
      }
      load();
    } catch (e) {
      setErr(e.message);
      setBusyId(null);
    }
  };

  const rows = (sessions || []).map((s) => ({ ...s, dead: s.revoked || s.expired }));
  const live = rows.filter((r) => !r.dead);
  const dead = rows.filter((r) => r.dead);
  const users = new Set(live.map((r) => r.email)).size;

  const columns = [
    {
      key: 'email',
      label: 'User',
      rowHeader: true,
      render: (r) => (
        <div className={r.dead ? 'text-faint' : ''}>
          <div className="t-13 font-semibold text-ink">{r.name || r.email}</div>
          <div className="t-11 text-muted">{r.email}</div>
        </div>
      ),
    },
    {
      key: 'role',
      label: 'Role',
      render: (r) => <Chip tone={r.dead ? 'plain' : r.role === 'owner' ? 'accent' : 'info'}>{r.role}</Chip>,
    },
    {
      key: 'device',
      label: 'Device',
      render: (r) => (
        <div className={`max-w-[260px] ${r.dead ? 'text-faint' : 'text-muted'}`}>
          <div className="truncate t-12" title={r.agent || r.device}>{r.device || 'Unknown device'}</div>
          {r.ip ? <div className="t-10 text-faint tnum">{r.ip}</div> : null}
        </div>
      ),
    },
    { key: 'lastUsed', label: 'Last used', render: (r) => <span className={`t-12 tnum ${r.dead ? 'text-faint' : 'text-muted'}`}>{when(r.lastUsed)}</span> },
    { key: 'created', label: 'Signed in', render: (r) => <span className={`t-12 tnum ${r.dead ? 'text-faint' : 'text-muted'}`}>{when(r.created)}</span> },
    {
      key: 'status',
      label: 'Status',
      render: (r) => {
        if (r.revoked) return <Chip tone="warn" dot>revoked</Chip>;
        if (r.expired) return <Chip tone="plain" dot>expired</Chip>;
        if (r.id === current) return <Chip tone="accent" dot>this device</Chip>;
        return <Chip tone="ok" dot>active</Chip>;
      },
    },
    {
      key: 'action',
      label: 'Action',
      render: (r) => (r.dead
        ? <span className="text-faint t-11">—</span>
        : (
          <button
            onClick={() => revoke(r)}
            disabled={busyId === r.id}
            className="btn btn-danger btn-sm"
          >
            {busyId === r.id ? <Loader2 size={11} className="animate-spin" /> : <Ban size={11} />} Revoke
          </button>
        )),
    },
  ];

  return (
    <div>
      <PageHeader
        icon={MonitorSmartphone}
        title="Sessions"
        sub="Every sign-in across the studio — revoke any device, effective on its next request. Dead rows clean up after 30 days."
      />

      {err && sessions ? <p className="t-13 mb-4" role="alert" style={{ color: 'var(--bad-ink)' }}>{err}</p> : null}

      {err && !sessions ? (
        <Card className="p-5 text-center">
          <p className="t-13 font-semibold text-ink">Can&apos;t load sessions</p>
          <p className="t-12 text-faint mt-1">{err}</p>
          <button className="btn btn-outline btn-sm mt-3" onClick={() => { setErr(''); load(); }}>Try again</button>
        </Card>
      ) : !sessions ? (
        <div className="flex items-center gap-2 text-muted t-13 py-8"><Loader2 size={15} className="animate-spin" /> Loading sessions…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <StatCard icon={MonitorSmartphone} label="Active sessions" value={live.length} />
            <StatCard icon={MonitorSmartphone} label="Users signed in" value={users} />
            <StatCard icon={Ban} label="Expired / revoked" value={dead.length} color="var(--bad)" iconBg="color-mix(in srgb, var(--bad) 10%, transparent)" />
          </div>

          <Card>
            <CardHead
              icon={MonitorSmartphone}
              title="All sessions"
              sub="Freshest activity first · greyed rows are expired or already revoked"
            />
            <div className="px-5 pb-5">
              <DataTable
                label="All sessions"
                rows={rows}
                columns={columns}
                pageSize={12}
                emptyIcon={MonitorSmartphone}
                emptyTitle="No sessions recorded"
                emptySub="Devices appear here the first time they sign in."
              />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
