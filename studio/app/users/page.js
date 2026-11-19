'use client';
// Super Admin — /users. Owner-only: every user, their channels, keys, sessions
// and last activity in one screen. Data: /api/users (assembles Neon users +
// audit log + registry bindings + encrypted-keys presence).
import { useEffect, useState } from 'react';
import { Loader2, Users as UsersIcon, KeyRound, Tv, Activity, ShieldCheck, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui';
import Drawer from '@/components/Drawer';

const fmtDay = (s) => (s ? String(s).slice(0, 16).replace('T', ' ') : '—');

export default function UsersPage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(null); // email whose activity drawer is open
  const [nonce, setNonce] = useState(0); // Retry bumps this

  useEffect(() => {
    fetch('/api/users')
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d.error) setErr(d.error || `the server answered ${r.status}`);
        else { setErr(''); setData(d); }
      })
      .catch((e) => setErr(e.message));
  }, [nonce]);
  const openUser = data?.users?.find((u) => u.email === open) || null;

  return (
    <div>
      <div className="mb-4">
        <h2 className="font-display t-16 font-bold tracking-tight text-ink flex items-center gap-2"><UsersIcon size={18} /> Users</h2>
        <p className="t-12 text-muted mt-0.5">Super admin view — every account, their channels, keys, sessions and last activity.</p>
      </div>

      {err ? (
        <Card className="p-5 text-center">
          <p className="t-13 font-semibold text-ink">Can&apos;t load users</p>
          <p className="t-12 text-faint mt-1">{err}</p>
          <button className="btn btn-outline btn-sm mt-3" onClick={() => setNonce((n) => n + 1)}><RefreshCw size={13} /> Try again</button>
        </Card>
      ) : !data ? (
        <div className="flex items-center gap-2 text-muted t-13 py-8"><Loader2 size={15} className="animate-spin" /> Loading users…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <div className="inset-tile p-4">
              <div className="t-11 uppercase tracking-wide text-muted">Accounts</div>
              <div className="text-[length:var(--text-xl)] font-bold mt-1 font-display text-ink tnum">{data.users.length}</div>
            </div>
            <div className="inset-tile p-4">
              <div className="t-11 uppercase tracking-wide text-muted">Active sessions</div>
              <div className="text-[length:var(--text-xl)] font-bold mt-1 font-display text-ink tnum">{data.totalSessions}</div>
            </div>
            <div className="inset-tile p-4">
              <div className="t-11 uppercase tracking-wide text-muted">Client channels bound</div>
              <div className="text-[length:var(--text-xl)] font-bold mt-1 font-display text-ink tnum">{data.users.reduce((a, u) => a + u.channels.length, 0)}</div>
            </div>
          </div>

          <div className="space-y-3">
            {data.users.map((u) => {
              return (
                <div key={u.email} className="border border-line rounded-xl bg-surface p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-0">
                      <div className="t-14 font-semibold text-ink truncate">{u.name || u.email}</div>
                      <div className="t-11 text-muted truncate">{u.email}</div>
                    </div>
                    <span className="ml-auto t-10 px-2 py-0.5 rounded-full border border-line flex items-center gap-1" style={{ color: u.role === 'owner' ? 'var(--accent)' : 'var(--muted)' }}>
                      <ShieldCheck size={11} /> {u.role}
                    </span>
                    <span className="t-10 px-2 py-0.5 rounded-full border border-line text-muted flex items-center gap-1">
                      <Activity size={11} /> {u.sessionsActive} session{u.sessionsActive === 1 ? '' : 's'}
                    </span>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-2 mt-3">
                    <div className="inset-tile p-2.5 flex items-start gap-2">
                      <Tv size={12} className="shrink-0 mt-0.5" style={{ color: 'var(--info)' }} />
                      <div className="t-12">
                        <div className="text-faint t-10 uppercase tracking-wide">Channels bound</div>
                        {u.channels.length
                          ? u.channels.map((c) => <div key={c.slug} className="text-muted">{c.label}</div>)
                          : <span className="text-muted">{u.role === 'owner' ? 'all legacy channels (owner)' : 'none bound'}</span>}
                      </div>
                    </div>
                    <div className="inset-tile p-2.5 flex items-start gap-2">
                      <KeyRound size={12} className="shrink-0 mt-0.5" style={{ color: 'var(--info)' }} />
                      <div className="t-12">
                        <div className="text-faint t-10 uppercase tracking-wide">API keys</div>
                        {u.keysFiles.length
                          ? u.keysFiles.map((s) => <div key={s} className="text-muted">{s}: keys configured</div>)
                          : <span className="text-muted">none saved (shared keys in use)</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-2.5">
                    <span className="t-11 text-muted flex items-center gap-1 min-w-0"><Activity size={11} /> Last action: {u.lastAction ? `${fmtDay(u.lastAction.at)} · ${u.lastAction.action}` : 'none recorded'}</span>
                    <button onClick={() => setOpen(u.email)} className="btn btn-outline btn-sm ml-auto">
                      Recent activity
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {data.unboundChannels?.length ? (
            <div className="border border-line rounded-xl bg-surface p-4 mt-5">
              <div className="t-11 uppercase tracking-wide text-muted mb-1.5">Connected channels with no owner assigned</div>
              <div className="t-12 text-muted">{data.unboundChannels.map((c) => c.label).join(' · ')}</div>
              <p className="t-10 text-faint mt-1">Assign an owner email during the Add-Channel wizard to bind them to a user.</p>
            </div>
          ) : null}
        </>
      )}

      <Drawer
        open={!!openUser}
        onClose={() => setOpen(null)}
        title={openUser ? `${openUser.name || openUser.email} — recent activity` : ''}
        description={openUser?.email}
        icon={Activity}
        size="md"
      >
        {openUser?.recentActivity?.length ? (
          <ul className="space-y-1.5">
            {openUser.recentActivity.map((a, i) => (
              <li key={i} className="inset-tile px-3 py-2 t-12 text-muted">
                <span className="text-faint tnum">{fmtDay(a.at)}</span> · <span className="text-ink font-medium">{a.action}</span>{a.detail ? ` — ${a.detail}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p className="t-12 text-muted">No recorded activity yet.</p>
        )}
      </Drawer>
    </div>
  );
}
