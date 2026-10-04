'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { UserPlus, ShieldCheck, CheckCircle2, AlertTriangle, ArrowRight, Layers, Settings2, Plus } from 'lucide-react';
import { Card, CardHead, Chip, PageHeader, EmptyState, PageSkeleton } from '@/components/ui';
import { STYLE_CATALOG, STYLE_BY_ID } from '@/lib/styles-catalog';

const VOICE_SUGGESTIONS = ['am_michael', 'bm_george', 'bm_daniel', 'am_onyx', 'bf_emma'];

function originNow() {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

export default function AddChannel() {
  const [reg, setReg] = useState(null); // { channels, mode, canWriteSecrets }
  const [error, setError] = useState('');
  const [connectedSlug, setConnectedSlug] = useState('');
  const [secretWarning, setSecretWarning] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ label: '', niche: '', style: 'cinematic', voice: 'am_michael', accent: '#38BDF8', slots: '11:35, 15:35, 22:35' });

  const loadReg = () => fetch('/api/channels/registry').then((r) => r.json()).then(setReg).catch(() => setReg({ channels: [] }));

  useEffect(() => {
    let alive = true;
    (async () => {
      const q = new URLSearchParams(window.location.search);
      const r = await fetch('/api/channels/registry')
        .then((x) => x.json())
        .catch(() => ({ channels: [] }));
      if (!alive) return;
      setReg(r?.channels ? r : { channels: [] });
      if (q.get('error')) setError(q.get('error'));
      if (q.get('secretWarning')) setSecretWarning(q.get('secretWarning'));
      if (q.get('connected')) {
        setConnectedSlug(q.get('connected'));
        const entry = (r?.channels || []).find((c) => c.slug === q.get('connected'));
        if (entry) setForm((f) => ({ ...f, label: entry.label || '', niche: entry.niche || '' }));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const connect = async () => {
    setConnecting(true);
    setError('');
    try {
      const r = await fetch('/api/oauth/start');
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || 'Could not start the Google login.');
        if (r.status === 500) setShowSetup(true);
        setConnecting(false);
        return;
      }
      window.location.href = d.url;
    } catch {
      setError('Network error starting the login.');
      setConnecting(false);
    }
  };

  const saveProfile = async () => {
    setSaving(true);
    setError('');
    try {
      const r = await fetch('/api/channels/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: connectedSlug, ...form }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Save failed');
      setSaved(true);
      loadReg();
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  };

  if (!reg) return <PageSkeleton />;
  const entry = reg.channels?.find((c) => c.slug === connectedSlug);
  const origin = originNow();

  return (
    <div className="max-w-3xl">
      <PageHeader icon={UserPlus} title="Add Channel" sub="Log in with Google → pick the channel → choose niche + style. One login connects ONE YouTube channel." />

      {error ? (
        <Card className="p-4 mb-4" style={{ borderColor: '#ef444455' }}>
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-semibold text-ink">Connect problem</p>
              <p className="text-[12px] text-muted mt-1 break-words">{error}</p>
              <p className="text-[11px] text-faint mt-2">
                Reconnect errors like <span className="font-mono">redirect_uri_mismatch</span> mean the callback URL is not registered yet — see
                “One-time Google setup” below.
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {/* STEP 1 — connect */}
      {!connectedSlug ? (
        <Card className="p-5 mb-4">
          <CardHead title="Step 1 · Connect a YouTube channel" sub="Google's own login screen — your password never touches Studio" icon={ShieldCheck} />
          <div className="inset-tile p-3.5 mb-4">
            <div className="flex items-start gap-2.5">
              <Layers size={15} className="text-accent shrink-0 mt-0.5" />
              <div>
                <p className="text-[12.5px] font-semibold text-ink">One Gmail, several channels? That works.</p>
                <p className="text-[12px] text-muted mt-1 leading-relaxed">
                  Google will first ask which Google account to use, then ask <b>which of its YouTube channels</b> to allow. Pick ONE channel and click
                  Allow. To connect another channel from the same Gmail, run this wizard again and pick a different channel — each channel gets its own
                  key. Your Gmail address is never stored; only the channel&apos;s ID and name are saved.
                </p>
              </div>
            </div>
          </div>
          <button className="btn btn-primary w-full sm:w-auto" onClick={connect} disabled={connecting}>
            {connecting ? 'Opening Google…' : 'Connect with Google'} <ArrowRight size={14} />
          </button>
        </Card>
      ) : null}

      {/* STEP 2 — profile */}
      {connectedSlug && !saved ? (
        <Card className="p-5 mb-4">
          <CardHead
            title="Step 2 · Set up the channel"
            sub={entry ? `Connected: ${entry.label} ${entry.handle ? `(${entry.handle})` : ''} — key saved as ${entry.tokenSecret}` : 'Connected'}
            icon={Settings2}
          />
          {secretWarning ? (
            <div className="inset-tile p-3 mb-4" style={{ borderColor: '#f59e0b55' }}>
              <p className="text-[12px] text-muted">
                <b className="text-ink">Warning:</b> the GitHub token secret could not be written ({secretWarning}). The channel is registered, but CI
                can&apos;t use it until the secret <span className="font-mono">{entry?.tokenSecret}</span> exists. Run locally:{' '}
                <span className="font-mono text-[11px]">gh secret set {entry?.tokenSecret} {'<'} token.json</span>
              </p>
            </div>
          ) : null}
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="overline block mb-1.5">Channel name</span>
              <input className="input w-full" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="OLD MONEY CODE" />
            </label>
            <label className="block">
              <span className="overline block mb-1.5">Niche</span>
              <input className="input w-full" value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} placeholder="Old money & quiet luxury" />
            </label>
            <label className="block">
              <span className="overline block mb-1.5">Video style</span>
              <select className="input w-full" value={form.style} onChange={(e) => setForm({ ...form, style: e.target.value })}>
                {STYLE_CATALOG.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.status === 'live' ? '· live' : '· demo'}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="overline block mb-1.5">Voice</span>
              <input className="input w-full" list="voice-suggestions" value={form.voice} onChange={(e) => setForm({ ...form, voice: e.target.value })} />
              <datalist id="voice-suggestions">
                {VOICE_SUGGESTIONS.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </label>
            <label className="block">
              <span className="overline block mb-1.5">Accent color</span>
              <input type="color" className="input w-full h-[38px] p-1" value={form.accent} onChange={(e) => setForm({ ...form, accent: e.target.value })} />
            </label>
            <label className="block">
              <span className="overline block mb-1.5">Post slots UTC (comma separated)</span>
              <input className="input w-full font-mono" value={form.slots} onChange={(e) => setForm({ ...form, slots: e.target.value })} />
            </label>
          </div>
          {form.style && STYLE_BY_ID[form.style] ? (
            <p className="text-[11.5px] text-faint mt-3">
              Style preview: <b className="text-muted">{STYLE_BY_ID[form.style].name}</b> — {STYLE_BY_ID[form.style].desc}
            </p>
          ) : null}
          <div className="flex gap-2 mt-4">
            <button className="btn btn-primary" onClick={saveProfile} disabled={saving}>
              {saving ? 'Saving…' : 'Save channel'}
            </button>
            <Link className="btn btn-outline" href="/styles">
              Browse styles
            </Link>
          </div>
        </Card>
      ) : null}

      {/* DONE */}
      {connectedSlug && saved ? (
        <Card className="p-5 mb-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={20} className="text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-[14px] font-bold text-ink">Channel connected ✓</p>
              <p className="text-[12.5px] text-muted mt-1 leading-relaxed">
                <b className="text-ink">{form.label || connectedSlug}</b> is logged in and its access key is stored. The style, niche and voice you chose
                are saved on the channel profile. Daily video automation for this channel needs its engine wiring (workflow slot) — that&apos;s the next
                step, done in the repo&apos;s CI setup.
              </p>
              <div className="flex gap-2 mt-3">
                <Link className="btn btn-primary" href="/channels">
                  Back to channels
                </Link>
                <button
                  className="btn btn-outline"
                  onClick={() => {
                    setSaved(false);
                    setConnectedSlug('');
                    setForm({ label: '', niche: '', style: 'cinematic', voice: 'am_michael', accent: '#38BDF8', slots: '11:35, 15:35, 22:35' });
                  }}
                >
                  <Plus size={14} /> Connect another channel
                </button>
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Connected list */}
      <Card className="mt-5 overflow-hidden">
        <CardHead title="Connected via Studio" sub="Channels this wizard linked — engine wiring pending unless noted" icon={Layers} />
        {!reg ? (
          <PageSkeleton />
        ) : reg.channels?.length ? (
          <div className="px-4 pb-4 space-y-2">
            {reg.channels.map((c) => (
              <div key={c.slug} className="inset-tile p-3 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-[11px] font-bold" style={{ background: `${c.accent}22`, color: c.accent }}>
                  {(c.label || c.slug).slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-semibold text-ink truncate">{c.label || c.slug}</p>
                  <p className="text-[11px] text-faint truncate font-mono">
                    {c.handle || c.channelId} · key: {c.tokenSecret}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1 justify-end shrink-0">
                  {c.style ? <Chip tone="accent">{STYLE_BY_ID[c.style]?.name || c.style}</Chip> : null}
                  <Chip tone={c.tokenSecretSaved === false ? 'warn' : 'ok'}>{c.tokenSecretSaved === false ? 'secret missing' : 'key saved'}</Chip>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Layers} title="No channels connected yet" sub="Use Step 1 above — the Google login takes ~30 seconds." />
        )}
      </Card>

      {/* Setup */}
      <Card className="mt-5 overflow-hidden">
        <button className="w-full text-left" onClick={() => setShowSetup(!showSetup)}>
          <CardHead title="One-time Google setup" sub="If the login fails with redirect_uri_mismatch, register the callback URLs" icon={Settings2} />
        </button>
        {showSetup ? (
          <div className="px-4 pb-4 text-[12px] text-muted leading-relaxed">
            <ol className="list-decimal ml-4 space-y-1.5">
              <li>
                Open <span className="font-mono text-ink">console.cloud.google.com → APIs & Services → Credentials</span> and open the OAuth client whose
                ID matches <span className="font-mono text-ink">YOUTUBE_CLIENT_ID</span>.
              </li>
              <li>
                Under <b className="text-ink">Authorized redirect URIs</b>, add both:
                <br />
                <span className="font-mono text-accent block mt-1">{origin}/api/oauth/callback</span>
                <span className="font-mono text-accent block">http://localhost:3000/api/oauth/callback</span>
              </li>
              <li>Save (may take a few minutes to apply), then press “Connect with Google” again.</li>
            </ol>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
