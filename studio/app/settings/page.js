'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Settings, Sun, Moon, Monitor, Check, Plug, Bell, Server, ShieldAlert, Users, Trash2, Plus, MonitorSmartphone, SquareKanban } from 'lucide-react';
import { Card, CardHead, Chip, PageHeader, Switch } from '@/components/ui';
import TabNav from '@/components/TabNav';
import UsersPage from '@/app/users/page';
import SessionsAdminPage from '@/app/sessions/page';
import Tasks from '@/app/tasks/page';
import { INTEGRATIONS } from '@/lib/site-data';
import { cn } from '@/lib/utils';
import { Button } from '@/components/untitledui/base/buttons/button';
import { ButtonUtility } from '@/components/untitledui/base/buttons/button-utility';

const SETTINGS_TABS = [
  { id: 'general', label: 'General & Appearance', icon: Settings },
  { id: 'team', label: 'Team & Access', icon: Users },
  { id: 'security', label: 'Security & Sessions', icon: MonitorSmartphone },
  { id: 'roadmap', label: 'System Roadmap', icon: SquareKanban },
];

const STATUS_STYLE = {
  ok: { label: 'connected', tone: 'ok' },
  warn: { label: 'attention', tone: 'warn' },
  bad: { label: 'failing', tone: 'bad' },
  pending: { label: 'setup', tone: 'info' },
};

function ThemeCard({ value, label, icon: Icon, current, onPick, preview }) {
  const active = current === value;
  return (
    <button
      onClick={() => onPick(value)}
      className={cn('text-left rounded-xl border p-3 transition-[transform,border-color,background-color] duration-150 ease-out flex-1 cursor-pointer active:scale-[0.98]', active ? '' : 'hover:-translate-y-0.5')}
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

function MiniPreview({ dark }) {
  const bg = dark ? '#0f1113' : '#f6f7f8';
  const card = dark ? '#17191c' : '#ffffff';
  const line = dark ? 'rgba(255,255,255,0.08)' : '#e6e8eb';
  const accent = '#C9B7EF';
  return (
    <div className="w-full h-full p-2.5 flex flex-col gap-1.5" style={{ background: bg }}>
      <div className="flex gap-1.5 flex-1">
        <div className="w-8 rounded-md" style={{ background: card, border: `1px solid ${line}` }} />
        <div className="flex-1 flex flex-col gap-1.5">
          <div className="h-4 rounded-md" style={{ background: accent, opacity: 0.85 }} />
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
  const [mounted, setMounted] = useState(false);
  // 10-08 P1 — TEAM (owner only)
  const [team, setTeam] = useState(null);
  const [teamErr, setTeamErr] = useState('');
  const [teamBusy, setTeamBusy] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('staff');
  // 10-09 A1 — SECURITY (active sign-ins)
  const [sessions, setSessions] = useState(null);
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
    fetch('/api/team')
      .then((r) => (r.status === 403 ? { users: 'forbidden' } : r.json()))
      .then((d) => {
        requestAnimationFrame(() => {
          if (alive) setTeam(d?.users || 'forbidden');
        });
      })
      .catch(() => {
        requestAnimationFrame(() => {
          if (alive) setTeam('forbidden');
        });
      });
    fetch('/api/sessions')
      .then((r) => r.json())
      .then((d) => {
        if (alive) setSessions(d.sessions || []);
      })
      .catch(() => { });
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
    if (!window.confirm('Sign out EVERYWHERE? All devices (including this one) lose access and must sign in again.')) return;
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
    if (!window.confirm(`Remove ${email} from the team? They lose dashboard access immediately.`)) return;
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
      <PageHeader icon={Settings} title="Settings & Workspace" sub="Appearance, team roles, active device security, integrations and roadmap." />

      <TabNav
        tabs={SETTINGS_TABS}
        activeTab={activeTab}
        paramName="tab"
      />

      {activeTab === 'general' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* appearance */}
        <Card className="lg:col-span-2 p-5 min-w-0">
          <div className="overline mb-3">Appearance</div>
          <div className="flex gap-3 flex-wrap">
            <ThemeCard
              value="light"
              label="Light"
              icon={Sun}
              current={mounted ? theme : undefined}
              onPick={setTheme}
              preview={<MiniPreview dark={false} />}
            />
            <ThemeCard
              value="dark"
              label="Dark"
              icon={Moon}
              current={mounted ? theme : undefined}
              onPick={setTheme}
              preview={<MiniPreview dark />}
            />
          </div>
          <p className="t-11 text-faint mt-3">
            Your choice is saved in this browser. Dark is the house style — light theme is in beta until the Phase 1 pass.
          </p>

          <div className="overline mt-7 mb-3">Typography</div>
          <div className="grid sm:grid-cols-3 gap-2.5">
            <div className="inset-tile p-3">
              <p className="t-11 text-faint mt-0.5">UI + body text</p>
            </div>
            <div className="inset-tile p-3">
              <p className="t-11 text-faint mt-0.5">Headlines + big numbers</p>
            </div>
            <div className="inset-tile p-3">
              <p className="t-12 font-semibold text-ink" style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>JetBrains Mono</p>
              <p className="t-11 text-faint mt-0.5">Times, logs, IDs</p>
            </div>
          </div>

          <div className="overline mt-7 mb-3">Notifications</div>
          <div className="space-y-2.5">
            <div className="inset-tile px-3.5 py-3">
              <p className="t-12 font-semibold text-ink">Phone pushes (ntfy)</p>
              <p className="t-11 text-faint mt-0.5">On - milestone pings + the daily report go to your private ntfy topic. (These were fake switches that saved nothing; real preferences come with Phase 2.)</p>
            </div>
          </div>
        </Card>

        {/* engine + integrations */}
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Server size={15} className="text-faint" />
              <span className="section-title">Engine</span>
              <Chip tone="ok" dot className="ml-auto">connected</Chip>
            </div>
            <div className="space-y-2 t-12 text-muted">
              <p className="flex justify-between"><span>Live site</span><code className="font-mono text-accent">quarry-studio.vercel.app</code></p>
              <p className="flex justify-between"><span>Local dev</span><code className="font-mono text-accent">localhost:3000</code></p>
              <p className="flex justify-between"><span>Production runs</span><span>GitHub Actions (cloud-only)</span></p>
              <p className="flex justify-between"><span>Render repo</span><code className="font-mono text-accent">quarry-render</code></p>
              <p className="flex justify-between"><span>State files</span><code className="font-mono text-accent">yt-mcp/ · fb-outbox/</code></p>
            </div>
            <div className="inset-tile p-3 mt-3 flex gap-2.5">
              <ShieldAlert size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--warn)' }} />
              <p className="t-11 text-muted leading-relaxed">
                The automation repo flips back to private on Oct 1 (auto-task). Rendering lives on the public
                quarry-render repo permanently.
              </p>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Plug size={15} className="text-faint" />
              <span className="section-title">Integrations</span>
            <span className="t-10 text-faint">static list - not live status</span>
            </div>
            <div className="space-y-1">
              {INTEGRATIONS.map((i) => {
                const st = STATUS_STYLE[i.status];
                return (
                  <div key={i.name} className="flex items-center gap-2.5 py-1.5">
                    <Chip tone={st.tone} dot className="w-[86px] justify-center">{st.label}</Chip>
                    <span className="min-w-0 flex-1">
                      <span className="block t-12 font-semibold text-ink truncate">{i.name}</span>
                      <span className="block t-10 text-faint truncate">{i.note}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-2.5">
              <Bell size={15} className="text-faint" />
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

      {/* team (10-08 P1) */}
      <Card className="p-5 mt-4">
        <CardHead
          title="Team"
          sub="Who can sign in with Google — roles decide what they see and can do. Owner = everything · staff = dashboard + run buttons · client = their own channels only (coming)."
          icon={Users}
        />
        {team === 'forbidden' ? (
          <p className="t-12 text-faint px-1">Team management is owner-only.</p>
        ) : (
          <>
            <div className="space-y-1.5 mb-4">
              {(Array.isArray(team) ? team : []).map((u) => (
                <div key={u.email} className="flex items-center gap-3 inset-tile px-3 py-2.5">
                  <span className="flex items-center justify-center w-7 h-7 rounded-lg t-11 font-bold shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                    {(u.name || u.email).slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block t-12 font-semibold text-ink truncate">{u.name || u.email}</span>
                    <span className="block t-10 text-faint truncate">{u.email}</span>
                  </span>
                  <Chip tone={u.role === 'owner' ? 'ok' : 'accent'}>{u.role}</Chip>
                  {u.role !== 'owner' ? (
                    <ButtonUtility size="sm" color="tertiary" tooltip="Remove from team" isDisabled={teamBusy} icon={Trash2} onClick={() => removeMember(u.email)} />
                  ) : null}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                className="input flex-1 min-w-[220px]"
                placeholder="new.member@gmail.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
              <select className="input w-auto" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                <option value="staff">staff</option>
                <option value="client">client</option>
              </select>
              <Button color="primary" onClick={addMember} isDisabled={teamBusy || !newEmail.trim()} iconLeading={<Plus size={16} />}>Add</Button>
            </div>
            {teamErr ? <p className="t-11 mt-2" style={{ color: 'var(--bad)' }}>{teamErr}</p> : null}
            <p className="t-11 text-faint mt-3">
              New members sign in with Google on the login page — their email must match exactly. Owners are added by editing the invite file in the repo.
            </p>
          </>
        )}
      </Card>

      {/* #123 (OPS-12) — change panel password */}
      <Card className="p-5 mt-4">
        <CardHead
          title="Change panel password"
          sub="Verified and prepared here — the value itself is changed on Vercel, then every device signs out automatically on the next deploy."
          icon={ShieldAlert}
        />
        {pwErr ? <p className="t-12 px-1 mb-2" style={{ color: 'var(--bad)' }}>{pwErr}</p> : null}
        {!pwResult ? (
          <>
            <div className="grid gap-2 mt-1" style={{ maxWidth: 420 }}>
              <input className="input" type="password" placeholder="Current password" autoComplete="current-password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} />
              <input className="input" type="password" placeholder="New password (at least 12 characters)" autoComplete="new-password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} />
              <input className="input" type="password" placeholder="Repeat new password" autoComplete="new-password" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} />
            </div>
            <div className="flex items-center gap-2 mt-3">
              <Button color="primary" onClick={rotatePw} isDisabled={pwBusy || !pwCurrent || !pwNew || !pwConfirm}>Verify &amp; prepare rotation</Button>
              <span className="t-11 text-faint">Changing the password is safe — channel tokens live under the master key now (#120).</span>
            </div>
          </>
        ) : (
          <div className="mt-1 space-y-2">
            <p className="t-12" style={{ color: 'var(--ok, #22c55e)' }}>
              Ready — {pwResult.scanned} token row{pwResult.scanned === 1 ? '' : 's'} checked, {pwResult.migrated} re-protected{pwResult.unreadable ? `, ${pwResult.unreadable} already unreadable (pre-existing, rotation-safe)` : ''}. Now finish on Vercel:
            </p>
            <ol className="t-12 text-faint list-decimal pl-5 space-y-1">
              {pwResult.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
            <a className="t-12 underline" style={{ color: 'var(--accent)' }} href={pwResult.dashboardUrl} target="_blank" rel="noreferrer">
              Open Vercel environment variables →
            </a>
            {pwResult.warning ? <p className="t-11 text-faint">{pwResult.warning}</p> : null}
            <p className="t-11 text-faint">
              Redeployed and signed in with the new password? Done. (Changed your mind? Simply don&apos;t touch Vercel — nothing has changed yet.)
            </p>
          </div>
        )}
      </Card>

      {/* security — A1 sessions (10-09) */}
      <Card className="p-5 mt-4">
        <CardHead
          title="Security — active sign-ins"
          sub="Every device signed in with your account. Revocable instantly — this is the A1 session upgrade."
          icon={MonitorSmartphone}
          right={
            <Button color="secondary" onClick={revokeAll} isDisabled={secBusy || !sessions?.length}>Sign out everywhere</Button>
          }
        />
        {secErr ? <p className="t-12 px-1 mb-2" style={{ color: 'var(--bad)' }}>{secErr}</p> : null}
        <div className="space-y-1.5">
          {(sessions || []).map((s) => (
            <div key={s.id} className="flex items-center gap-3 inset-tile px-3 py-2.5">
              <MonitorSmartphone size={14} className="text-faint shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block t-12 font-medium text-ink truncate">{s.device || 'Unknown device'}</span>
                <span className="block t-10 text-faint">
                  signed in {s.created ? new Date(s.created).toLocaleDateString() : '—'} · last used {s.lastUsed ? new Date(s.lastUsed).toLocaleString() : '—'}
                  {s.ip ? ` · ${s.ip}` : ''}
                </span>
              </span>
            </div>
          ))}
          {sessions && !sessions.length ? (
            <p className="t-12 text-faint px-1 py-2">No active sessions found for your account yet — sign out and back in once to register this device.</p>
          ) : null}
        </div>
      </Card>
        </div>
      )}

      {activeTab === 'team' && <UsersPage />}
      {activeTab === 'security' && <SessionsAdminPage />}
      {activeTab === 'roadmap' && <Tasks />}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-faint">Loading Settings…</div>}>
      <SettingsContent />
    </Suspense>
  );
}
