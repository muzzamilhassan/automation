'use client';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Settings, Sun, Moon, Monitor, Check, Plug, Bell, Server, ShieldAlert } from 'lucide-react';
import { Card, CardHead, Chip, PageHeader, Switch } from '@/components/ui';
import { INTEGRATIONS } from '@/lib/site-data';
import { cn } from '@/lib/utils';

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
      className={cn('text-left rounded-2xl border p-3 transition-all flex-1', active ? '' : 'hover:-translate-y-0.5')}
      style={{
        borderColor: active ? 'var(--accent)' : 'var(--line)',
        background: active ? 'var(--accent-soft)' : 'var(--surface)',
        boxShadow: active ? '0 0 0 1px var(--accent)' : undefined,
      }}
    >
      <div className="rounded-xl overflow-hidden border border-line mb-3" style={{ height: 84 }}>
        {preview}
      </div>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
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
  const bg = dark ? '#0a0a0e' : '#f4f4f6';
  const card = dark ? '#121218' : '#ffffff';
  const line = dark ? 'rgba(255,255,255,0.08)' : '#e6e6ea';
  const accent = dark ? '#8b70ff' : '#6742e0';
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

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [notifs, setNotifs] = useState({ ntfy: true, fails: true, weekly: false });
  useEffect(() => setMounted(true), []);

  return (
    <div>
      <PageHeader icon={Settings} title="Settings" sub="Appearance, engine and integrations — the studio talks to live APIs, so be gentle" />

      <div className="grid lg:grid-cols-3 gap-4">
        {/* appearance */}
        <Card className="lg:col-span-2 p-5">
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
          <p className="text-[11.5px] text-faint mt-3">
            Your choice is saved in this browser. Dark is the house style — light is fully supported everywhere.
          </p>

          <div className="overline mt-7 mb-3">Typography</div>
          <div className="grid sm:grid-cols-3 gap-2.5">
            <div className="inset-tile p-3">
              <p className="text-[13px] font-semibold text-ink" style={{ fontFamily: 'var(--font-inter)' }}>Inter</p>
              <p className="text-[11px] text-faint mt-0.5">UI + body text</p>
            </div>
            <div className="inset-tile p-3">
              <p className="text-[13px] font-bold text-ink" style={{ fontFamily: 'var(--font-space-grotesk)' }}>Space Grotesk</p>
              <p className="text-[11px] text-faint mt-0.5">Headlines + big numbers</p>
            </div>
            <div className="inset-tile p-3">
              <p className="text-[12.5px] font-semibold text-ink" style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>JetBrains Mono</p>
              <p className="text-[11px] text-faint mt-0.5">Times, logs, IDs</p>
            </div>
          </div>

          <div className="overline mt-7 mb-3">Notifications</div>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between inset-tile px-3.5 py-3">
              <div>
                <p className="text-[12.5px] font-semibold text-ink">Phone pushes (ntfy)</p>
                <p className="text-[11px] text-faint">Topic quarry-x7f2k-reports — milestones + daily report</p>
              </div>
              <Switch checked={notifs.ntfy} onChange={(v) => setNotifs((n) => ({ ...n, ntfy: v }))} label="ntfy pushes" />
            </div>
            <div className="flex items-center justify-between inset-tile px-3.5 py-3">
              <div>
                <p className="text-[12.5px] font-semibold text-ink">Failure alerts only</p>
                <p className="text-[11px] text-faint">Ping only when a job fails closed</p>
              </div>
              <Switch checked={notifs.fails} onChange={(v) => setNotifs((n) => ({ ...n, fails: v }))} label="Failure alerts" />
            </div>
            <div className="flex items-center justify-between inset-tile px-3.5 py-3">
              <div>
                <p className="text-[12.5px] font-semibold text-ink">Weekly digest</p>
                <p className="text-[11px] text-faint">Retention + growth summary every Sunday</p>
              </div>
              <Switch checked={notifs.weekly} onChange={(v) => setNotifs((n) => ({ ...n, weekly: v }))} label="Weekly digest" />
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
            <div className="space-y-2 text-[12px] text-muted">
              <p className="flex justify-between"><span>Live site</span><code className="font-mono text-accent">quarry-studio.vercel.app</code></p>
              <p className="flex justify-between"><span>Local dev</span><code className="font-mono text-accent">localhost:3000</code></p>
              <p className="flex justify-between"><span>Production runs</span><span>GitHub Actions (cloud-only)</span></p>
              <p className="flex justify-between"><span>Render repo</span><code className="font-mono text-accent">quarry-render</code></p>
              <p className="flex justify-between"><span>State files</span><code className="font-mono text-accent">yt-mcp/ · fb-outbox/</code></p>
            </div>
            <div className="inset-tile p-3 mt-3 flex gap-2.5">
              <ShieldAlert size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--warn)' }} />
              <p className="text-[11px] text-muted leading-relaxed">
                The automation repo flips back to private on Oct 1 (auto-task). Rendering lives on the public
                quarry-render repo permanently.
              </p>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Plug size={15} className="text-faint" />
              <span className="section-title">Integrations</span>
            </div>
            <div className="space-y-1">
              {INTEGRATIONS.map((i) => {
                const st = STATUS_STYLE[i.status];
                return (
                  <div key={i.name} className="flex items-center gap-2.5 py-1.5">
                    <Chip tone={st.tone} dot className="w-[86px] justify-center">{st.label}</Chip>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-semibold text-ink truncate">{i.name}</span>
                      <span className="block text-[10.5px] text-faint truncate">{i.note}</span>
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
            <ul className="space-y-1.5 text-[11.5px] text-muted leading-relaxed list-none">
              <li>· Every upload passes duration, title and duplicate gates — fail closed.</li>
              <li>· Never re-upload the same file (strike risk).</li>
              <li>· Nothing posts to Facebook without your approval first.</li>
              <li>· Bugs in published videos get fixed forward, never re-uploaded.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
