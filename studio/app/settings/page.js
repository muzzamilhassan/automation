'use client';
// Settings — four tabs, each job in ONE place (round 2):
//   General   → appearance, notifications, engine facts, safety rules
//   Team      → add/remove members (owner) + the super-admin user list
//   Security  → change password, this account's sign-ins, all sessions
//   Tasks     → the live operations queue
// Removed: the static "Integrations" list (it showed connected/failing chips
// nothing checked — real key status lives on /providers) and the stale
// "engine connected" chip / Oct-1 repo note.
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Settings, Sun, Moon, Check, Plug, Bell, Server, ShieldAlert, Users, Trash2, Plus, MonitorSmartphone, SquareKanban, Loader2, ChevronRight, LogOut } from 'lucide-react';
import { Card, CardHead, Chip, PageHeader, PageSkeleton } from '@/components/ui';
import TabNav from '@/components/TabNav';
import { useConfirm } from '@/components/ConfirmDialog';
import UsersPage from '@/app/users/page';
import SessionsAdminPage from '@/app/sessions/page';
import Tasks from '@/app/tasks/page';
import { cn } from '@/lib/utils';

const SETTINGS_TABS = [
  { id: 'general', label: 'General & Appearance', icon: Settings },
  { id: 'team', label: 'Team & Access', icon: Users },
  { id: 'security', label: 'Security & Sessions', icon: MonitorSmartphone },
  // id kept as 'roadmap' so existing ?tab=roadmap links still land here
  { id: 'roadmap', label: 'Live tasks', icon: SquareKanban },
];

function ThemeCard({ value, label, icon: Icon, current, onPick, preview }) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onPick(value)}
      aria-pressed={active}
      className={cn('text-left rounded-xl border p-3 transition-[transform,border-color,background-color] duration-150 ease-out flex-1 min-w-[160px] cursor-pointer active:scale-[0.98]', active ? '' : 'hover:-translate-y-0.5')}
      style={{
        borderColor: active ? 'var(--accent)' : 'var(--line)',
        background: active ? 'var(--accent-soft)' : 'var(--surface)',
        boxShadow: active ? '0 0 0 1px var(--accent)' : undefined,
      }}
    >
      <div className="rounded-lg overflow-hidden border border-line mb-3" style={{ height: 84 }}>
        {preview}
      </div>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 t-12 font-semibold text-ink">
          <Icon size={13} /> {label}
        </span>
        {active ? (
          <span className="flex items-center justify-center w-5 h-5 rounded-full" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>
            <Check size={11} strokeWidth={3} />
          </span>
        ) : null}
      </div>
    </button>
  );
}

// a literal picture of each theme — these colours ARE the preview, not UI ink
function MiniPreview({ dark }) {
  const bg = dark ? '#0f1113' : '#f6f7f8';
  const card = dark ? '#17191c' : '#ffffff';
  const line = dark ? 'rgba(255,255,255,0.08)' : '#e6e8eb';
  return (
    <div className="w-full h-full p-2.5 flex flex-col gap-1.5" style={{ background: bg }}>
      <div className="flex gap-1.5 flex-1">
        <div className="w-8 rounded-md" style={{ background: card, border: `1px solid ${line}` }} />
        <div className="flex-1 flex flex-col gap-1.5">
          <div className="h-4 rounded-md" style={{ background: 'var(--accent)', opacity: 0.6 }} />
          <div className="flex gap-1.5 flex-1">
            <div className="flex-1 rounded-md" style={{ background: card, border: `1px solid ${line}` }} />
            <div className="flex-1 rounded-md" style={{ background: card, border: `1px solid ${line}` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const tabFromQuery = searchParams.get('tab');
  const activeTab = tabFromQuery && SETTINGS_TABS.some((tab) => tab.id === tabFromQuery) ? tabFromQuery : 'general';

  const { theme, setTheme } = useTheme();
  const confirm = useConfirm();
  const [mounted, setMounted] = useState(false);
  // 10-08 P1 — TEAM (owner only). null = loading · 'forbidden' · 'error' · users[]
  const [team, setTeam] = useState(null);
  const [teamErr, setTeamErr] = useState('');
  const [teamBusy, setTeamBusy] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('staff');
  // 10-09 A1 — SECURITY (active sign-ins). null = loading · 'error' · sessions[]
  const [sessions, setSessions] = useState(null);
  // Live fix wave A1 (T5-03): the API's `current` = this browser's session row id
  const [currentSession, setCurrentSession] = useState(0);
  const [secBusy, setSecBusy] = useState(false);
  const [secErr, setSecErr] = useState('');
  // #123 (OPS-12) — change panel password
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwErr, setPwErr] = useState('');
  const [pwResult, setPwResult] = useState(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    let alive = true;
    // a network failure is "can't load", never "owner-only" (honesty doctrine)
    fetch('/api/team')
      .then((r) => (r.status === 401 || r.status === 403 ? { users: 'forbidden' } : r.ok ? r.json() : { users: 'error' }))
      .then((d) => {
        requestAnimationFrame(() => {
          if (alive) setTeam(d?.users || 'error');
        });
      })
      .catch(() => {
        requestAnimationFrame(() => {
          if (alive) setTeam('error');
        });
      });
    fetch('/api/sessions')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((d) => {
        if (!alive) return;
        setSessions(d.sessions || []);
        setCurrentSession(d.current || 0);
      })
      .catch(() => { if (alive) setSessions('error'); });
    return () => {
      alive = false;
    };
  }, []);

  // #123 (OPS-12): verify + prep; the actual value change happens on Vercel
  const rotatePw = async () => {
    setPwBusy(true);
    setPwErr('');
    setPwResult(null);
    try {
      const r = await fetch('/api/settings/rotate-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew, confirm: pwConfirm }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not prepare the rotation');
      setPwResult(d);
      setPwCurrent('');
      setPwNew('');
      setPwConfirm('');
    } catch (e) {
      setPwErr(e.message);
    } finally {
      setPwBusy(false);
    }
  };

  const revokeAll = async () => {
    const ok = await confirm({
      title: 'Sign out everywhere?',
      body: 'All devices (including this one) lose access and must sign in again.',
      confirmLabel: 'Sign out everywhere',
      tone: 'danger',
    });
    if (!ok) return;
    setSecBusy(true);
    setSecErr('');
    try {
      const r = await fetch('/api/sessions', { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not revoke');
      setSessions([]);
      window.location.href = '/login';
    } catch (e) {
      setSecErr(e.message);
      setSecBusy(false);
    }
  };

  const addMember = async () => {
    setTeamBusy(true);
    setTeamErr('');
    try {
      const r = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, role: newRole }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not add');
      setTeam(d.users || team);
      setNewEmail('');
    } catch (e) {
      setTeamErr(e.message);
    }
    setTeamBusy(false);
  };

  const removeMember = async (email) => {
    const ok = await confirm({
      title: `Remove ${email} from the team?`,
      body: 'They lose dashboard access immediately.',
      confirmLabel: 'Remove member',
      tone: 'danger',
    });
    if (!ok) return;
    setTeamBusy(true);
    setTeamErr('');
    try {
      const r = await fetch('/api/team?email=' + encodeURIComponent(email), { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not remove');
      setTeam(d.users || team);
    } catch (e) {
      setTeamErr(e.message);
    }
    setTeamBusy(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader icon={Settings} title="Settings" sub="Appearance, team roles, device security and the live task queue." />

      <TabNav
        tabs={SETTINGS_TABS}
        activeTab={activeTab}
        paramName="tab"
      />

      {activeTab === 'general' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* appearance + notifications */}
          <Card className="lg:col-span-2 p-5 min-w-0">
            <div className="overline mb-3">Appearance</div>
            <div className="flex gap-3 flex-wrap">
              <ThemeCard value="light" label="Light" icon={Sun} current={mounted ? theme : undefined} onPick={setTheme} preview={<MiniPreview dark={false} />} />
              <ThemeCard value="dark" label="Dark" icon={Moon} current={mounted ? theme : undefined} onPick={setTheme} preview={<MiniPreview dark />} />
            </div>
            <p className="t-11 text-faint mt-3">Saved in this browser.</p>

            <div className="overline mt-7 mb-3">Notifications</div>
            <div className="inset-tile px-3.5 py-3 flex items-start gap-2.5">
              <Bell size={14} className="text-faint shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="t-12 font-semibold text-ink">Phone pushes (ntfy)</p>
                <p className="t-11 text-faint mt-0.5">Pipeline milestones and alerts go to your private ntfy topic. Every alert is also kept on the Warnings page, so a missed push is never lost.</p>
                <Link href="/warnings" className="t-11 text-accent hover:underline inline-flex items-center gap-0.5 mt-1">Open Warnings <ChevronRight size={12} /></Link>
              </div>
            </div>
          </Card>

          <div className="space-y-4 min-w-0">
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Server size={15} className="text-faint" />
                <span className="section-title">Engine</span>
              </div>
              <div className="space-y-2 t-12 text-muted">
                <p className="flex justify-between gap-3"><span>Live site</span><code className="font-mono text-accent truncate">quarry-studio.vercel.app</code></p>
                <p className="flex justify-between gap-3"><span>Production runs</span><span className="text-right">GitHub Actions (cloud-only)</span></p>
                <p className="flex justify-between gap-3"><span>State files</span><code className="font-mono text-accent truncate">yt-mcp/ · fb-outbox/</code></p>
              </div>
              <Link href="/runs" className="btn btn-outline btn-sm w-full mt-3">See today&apos;s runs</Link>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <Plug size={15} className="text-faint" />
                <span className="section-title">AI services &amp; keys</span>
              </div>
              <p className="t-11 text-muted leading-relaxed">Which providers have a key, what each one costs, and the per-task routing — all live.</p>
              <div className="flex flex-wrap gap-2 mt-3">
                <Link href="/providers" className="btn btn-outline btn-sm">Providers</Link>
                <Link href="/usage" className="btn btn-outline btn-sm">Usage &amp; cost</Link>
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-2 mb-2.5">
                <ShieldAlert size={15} className="text-faint" />
                <span className="section-title">Safety rules the engine obeys</span>
              </div>
              <ul className="space-y-1.5 t-11 text-muted leading-relaxed list-none">
                <li>· Every upload passes duration, title and duplicate gates — fail closed.</li>
                <li>· Never re-upload the same file (strike risk).</li>
                <li>· Nothing posts to Facebook without your approval first.</li>
                <li>· Bugs in published videos get fixed forward, never re-uploaded.</li>
              </ul>
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'team' && (
        <div className="space-y-6">
          {/* team (10-08 P1) */}
          <Card className="p-5">
            <CardHead
              title="Team"
              sub="Who can sign in with Google. Owner = everything · staff = dashboard + run buttons · client = their own channels only."
              icon={Users}
              className="px-0 pt-0"
            />
            {team === null ? (
              <div className="space-y-1.5">{[0, 1].map((i) => <div key={i} className="skeleton h-12 rounded-xl" />)}</div>
            ) : team === 'forbidden' ? (
              <p className="t-12 text-faint">Team management is owner-only.</p>
            ) : team === 'error' ? (
              <p className="t-12" role="alert" style={{ color: 'var(--bad-ink)' }}>Can&apos;t load the team right now — reload the page to try again.</p>
            ) : (
              <>
                <div className="space-y-1.5 mb-4">
                  {team.map((u) => (
                    <div key={u.email} className="flex items-center gap-3 inset-tile px-3 py-2.5 min-w-0">
                      <span className="flex items-center justify-center w-7 h-7 rounded-lg t-11 font-bold shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                        {(u.name || u.email).slice(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block t-12 font-semibold text-ink truncate">{u.name || u.email}</span>
                        <span className="block t-10 text-faint truncate">{u.email}</span>
                      </span>
                      <Chip tone={u.role === 'owner' ? 'ok' : 'accent'}>{u.role}</Chip>
                      {u.role !== 'owner' ? (
                        <button className="icon-btn shrink-0" title="Remove from team" aria-label={`Remove ${u.email} from the team`} disabled={teamBusy} onClick={() => removeMember(u.email)}>
                          <Trash2 size={14} />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
                <form className="flex items-center gap-2 flex-wrap" onSubmit={(e) => { e.preventDefault(); if (newEmail.trim()) addMember(); }}>
                  <label className="sr-only" htmlFor="team-email">New member email</label>
                  <input
                    id="team-email"
                    type="email"
                    className="input flex-1 min-w-[200px]"
                    placeholder="new.member@gmail.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                  />
                  <label className="sr-only" htmlFor="team-role">Role</label>
                  <select id="team-role" className="input w-auto" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                    <option value="staff">staff</option>
                    <option value="client">client</option>
                  </select>
                  <button type="submit" className="btn btn-primary" disabled={teamBusy || !newEmail.trim()}>
                    {teamBusy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Add
                  </button>
                </form>
                {teamErr ? <p className="t-11 mt-2" role="alert" style={{ color: 'var(--bad-ink)' }}>{teamErr}</p> : null}
                <p className="t-11 text-faint mt-3">
                  New members sign in with Google on the login page — their email must match exactly. Owners are added by editing the invite file in the repo.
                </p>
              </>
            )}
          </Card>
          <UsersPage />
        </div>
      )}

      {activeTab === 'security' && (
        <div className="space-y-6">
          {/* #123 (OPS-12) — change panel password */}
          <Card className="p-5">
            <CardHead
              title="Change panel password"
              sub="Verified and prepared here — the value itself is changed on Vercel, then every device signs out on the next deploy."
              icon={ShieldAlert}
              className="px-0 pt-0"
            />
            {pwErr ? <p className="t-12 mb-2" role="alert" style={{ color: 'var(--bad-ink)' }}>{pwErr}</p> : null}
            {!pwResult ? (
              <form onSubmit={(e) => { e.preventDefault(); rotatePw(); }}>
                <div className="grid gap-2 mt-1" style={{ maxWidth: 420 }}>
                  <input className="input" type="password" placeholder="Current password" aria-label="Current password" autoComplete="current-password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} />
                  <input className="input" type="password" placeholder="New password (at least 12 characters)" aria-label="New password" autoComplete="new-password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} />
                  <input className="input" type="password" placeholder="Repeat new password" aria-label="Repeat new password" autoComplete="new-password" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} />
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <button type="submit" className="btn btn-primary" disabled={pwBusy || !pwCurrent || !pwNew || !pwConfirm}>
                    {pwBusy ? <Loader2 size={14} className="animate-spin" /> : null}Verify &amp; prepare rotation
                  </button>
                  <span className="t-11 text-faint">Changing the password is safe — channel tokens live under the master key now (#120).</span>
                </div>
              </form>
            ) : (
              <div className="mt-1 space-y-2">
                <p className="t-12" style={{ color: 'var(--ok-ink)' }}>
                  Ready — {pwResult.scanned} token row{pwResult.scanned === 1 ? '' : 's'} checked, {pwResult.migrated} re-protected{pwResult.unreadable ? `, ${pwResult.unreadable} already unreadable (pre-existing, rotation-safe)` : ''}. Now finish on Vercel:
                </p>
                <ol className="t-12 text-muted list-decimal pl-5 space-y-1">
                  {pwResult.steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
                <a className="btn btn-outline btn-sm" href={pwResult.dashboardUrl} target="_blank" rel="noreferrer">
                  Open Vercel environment variables →
                </a>
                {pwResult.warning ? <p className="t-11 text-faint">{pwResult.warning}</p> : null}
                <p className="t-11 text-faint">
                  Redeployed and signed in with the new password? Done. (Changed your mind? Simply don&apos;t touch Vercel — nothing has changed yet.)
                </p>
              </div>
            )}
          </Card>

          {/* security — A1 sessions (10-09): this account's own devices */}
          <Card className="p-5">
            <CardHead
              title="Security — active sign-ins"
              sub="Every device signed in with your account. Revocable instantly."
              icon={MonitorSmartphone}
              className="px-0 pt-0"
              right={
                <button className="btn btn-danger btn-sm" onClick={revokeAll} disabled={secBusy || !Array.isArray(sessions) || !sessions.length}>
                  <LogOut size={13} /> Sign out everywhere
                </button>
              }
            />
            {secErr ? <p className="t-12 mb-2" role="alert" style={{ color: 'var(--bad-ink)' }}>{secErr}</p> : null}
            {sessions === null ? (
              <div className="space-y-1.5">{[0, 1].map((i) => <div key={i} className="skeleton h-12 rounded-xl" />)}</div>
            ) : sessions === 'error' ? (
              <p className="t-12" role="alert" style={{ color: 'var(--bad-ink)' }}>Can&apos;t load your sign-ins right now — reload to try again.</p>
            ) : (
              <div className="space-y-1.5">
                {sessions.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 inset-tile px-3 py-2.5 min-w-0">
                    <MonitorSmartphone size={14} className="text-faint shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="block t-12 font-medium text-ink truncate">{s.device || 'Unknown device'}</span>
                        {s.id === currentSession ? <Chip tone="accent" dot>this device</Chip> : null}
                      </span>
                      <span className="block t-10 text-faint">
                        signed in {s.created ? new Date(s.created).toLocaleDateString() : '—'} · last used {s.lastUsed ? new Date(s.lastUsed).toLocaleString() : '—'}
                        {s.ip ? ` · ${s.ip}` : ''}
                      </span>
                    </span>
                  </div>
                ))}
                {!sessions.length ? (
                  <p className="t-12 text-faint py-2">No active sessions found for your account yet — sign out and back in once to register this device.</p>
                ) : null}
              </div>
            )}
          </Card>

          <SessionsAdminPage />
        </div>
      )}

      {activeTab === 'roadmap' && <Tasks />}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SettingsContent />
    </Suspense>
  );
}
