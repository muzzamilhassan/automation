'use client';
// DFY client workspace — /client. Bare layout (no full studio nav): a client
// of the done-for-you service sees only their channel(s), live stats, what the
// engine produced, and the topic approvals. /api/overview already scopes the
// payload to the caller's channels (clients = registry ownerEmail match).
// Round 2: API keys open in a Drawer (not an inline expansion), removing a key
// confirms first, and a failed read says so instead of looking empty.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Lock, BadgeCheck, PauseCircle, Sparkles, Clock, KeyRound, CheckCircle2, XCircle, RefreshCw, AlertTriangle } from 'lucide-react';
import Drawer from '@/components/Drawer';
import { useConfirm } from '@/components/ConfirmDialog';
import { todayStatus, lastMadeText } from '@/lib/channel-overview.mjs';

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));

export default function ClientPage() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | anon | error | ok
  const [nonce, setNonce] = useState(0);
  const [keysFor, setKeysFor] = useState(null); // channel whose key drawer is open

  useEffect(() => {
    fetch('/api/overview')
      .then(async (r) => {
        if (r.status === 401) { setStatus('anon'); return; }
        if (!r.ok) { setStatus('error'); return; }
        setData(await r.json());
        setStatus('ok');
      })
      .catch(() => setStatus('error'));
  }, [nonce]);

  if (status === 'loading') {
    return (
      <main className="min-h-screen bg-bg text-ink flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted t-13"><Loader2 size={15} className="animate-spin" /> Loading your channel…</div>
      </main>
    );
  }

  if (status === 'anon' || status === 'error') {
    const anon = status === 'anon';
    return (
      <main className="min-h-screen bg-bg text-ink flex items-center justify-center px-4">
        <div className="card p-6 max-w-sm text-center">
          {anon ? <Lock size={18} className="mx-auto mb-2 text-muted" /> : <AlertTriangle size={18} className="mx-auto mb-2" style={{ color: 'var(--warn-ink)' }} />}
          <div className="t-14 font-semibold text-ink">{anon ? 'Client sign-in required' : "Can't load your channel right now"}</div>
          <p className="t-12 text-muted mt-1 leading-relaxed">
            {anon ? 'Sign in with the email your channel manager invited you with.' : 'Your channel keeps running — only this page could not read it. Try again in a moment.'}
          </p>
          {anon ? (
            <Link href="/login?next=/client" className="btn btn-primary mt-4">Go to sign-in</Link>
          ) : (
            <button onClick={() => { setStatus('loading'); setNonce((n) => n + 1); }} className="btn btn-outline mt-4"><RefreshCw size={14} /> Try again</button>
          )}
        </div>
      </main>
    );
  }

  const channels = data?.channels || [];
  const now = new Date();
  return (
    <main className="min-h-screen bg-bg text-ink">
      <div className="max-w-3xl mx-auto px-4 sm:px-5 py-10 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-8">
          <div className="min-w-0">
            <div className="t-11 uppercase tracking-wide text-muted">Quarry Studio · done-for-you</div>
            <h1 className="font-display text-[length:var(--text-2xl)] font-bold tracking-tight text-ink">Your channel, today</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/thumbs" className="btn btn-outline btn-sm">Thumbnails</Link>
            <Link href="/" className="btn btn-outline btn-sm">Full studio</Link>
          </div>
        </div>

        {!channels.length ? (
          <div className="card p-5 t-13 text-muted">
            No channel is linked to your account yet — your channel manager connects it during onboarding.
          </div>
        ) : (
          <div className="space-y-5">
            {channels.map((c) => {
              // wave A3: today (UTC) + the newest thing made, from the engine's
              // real signals — never the frozen "last production run" date
              const today = todayStatus(c, now);
              const statsDown = !c.yt || c.yt.error;
              return (
                <div key={c.slug} className="card overflow-hidden">
                  <div className="px-5 pt-5 pb-4 flex flex-wrap items-center gap-2.5 border-b border-line">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.accent || 'var(--accent)' }} />
                    <div className="t-14 font-semibold text-ink min-w-0 truncate">{c.label}</div>
                    <span className="ml-auto t-10 px-2 py-0.5 rounded-full border border-line flex items-center gap-1" style={{ color: c.flowPaused ? 'var(--warn-ink)' : 'var(--ok-ink)' }}>
                      {c.flowPaused ? <><PauseCircle size={11} /> paused</> : <><BadgeCheck size={11} /> autopilot on</>}
                    </span>
                  </div>
                  <div className="px-5 py-4 grid grid-cols-3 gap-2">
                    <div><div className="t-10 uppercase tracking-wide text-faint">Subscribers</div><div className="t-16 font-semibold text-ink tnum">{fmt(c.yt?.subs)}</div></div>
                    <div><div className="t-10 uppercase tracking-wide text-faint">All-time views</div><div className="t-16 font-semibold text-ink tnum">{fmt(c.yt?.views)}</div></div>
                    <div><div className="t-10 uppercase tracking-wide text-faint">Videos live</div><div className="t-16 font-semibold text-ink tnum">{fmt(c.yt?.videos)}</div></div>
                    {statsDown ? <p className="col-span-3 t-11 text-faint">YouTube stats unavailable right now — not zero.</p> : null}
                  </div>
                  <div className="px-5 pb-5 space-y-3">
                    <div className="inset-tile p-3 flex gap-2.5 items-start">
                      <Clock size={13} className="shrink-0 mt-0.5" style={{ color: 'var(--info-ink)' }} />
                      <p className="t-12 text-muted leading-relaxed">
                        Today (UTC): <span className="font-medium" style={{ color: today.tone === 'bad' ? 'var(--bad-ink)' : 'var(--ink)' }}>{today.text}</span>
                        <span className="block t-11 text-faint">{lastMadeText(c.lastActivity)}</span>
                      </p>
                    </div>
                    {c.todayTopics?.length ? (
                      <div className="inset-tile p-3">
                        <div className="flex items-center gap-1.5 t-11 uppercase tracking-wide text-faint mb-1.5"><Sparkles size={11} /> Latest topics{c.todayTopicsAt ? ` · picked ${c.todayTopicsAt}` : ''}</div>
                        {c.todayTopics.slice(0, 3).map((t, i) => (
                          <div key={i} className="t-12 text-muted truncate">· {t}</div>
                        ))}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Link href="/topics" className="btn btn-primary btn-sm"><Sparkles size={13} /> Approve or swap topics</Link>
                      <button onClick={() => setKeysFor(c)} className="btn btn-outline btn-sm"><KeyRound size={13} /> Manage API keys</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-8 t-11 text-faint">Stats update every few minutes · questions? message your channel manager.</p>
      </div>

      <Drawer
        open={!!keysFor}
        onClose={() => setKeysFor(null)}
        title={keysFor ? `API keys — ${keysFor.label}` : ''}
        description="Your keys run before the studio's shared keys. They are encrypted and never shown again after saving."
        icon={KeyRound}
        size="md"
      >
        {keysFor ? <KeysPanel key={keysFor.slug} slug={keysFor.slug} /> : null}
      </Drawer>
    </main>
  );
}

// Per-channel key manager for DFY clients — same API the owner's
// ChannelKeysPanel uses; the server only allows the channel bound to the
// client. Props only (rendered inside the drawer, hooks live here).
function KeysPanel({ slug }) {
  const confirm = useConfirm();
  const [providers, setProviders] = useState(null); // null = loading
  const [loadErr, setLoadErr] = useState('');
  const [inputs, setInputs] = useState({});
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState({});

  const load = () => {
    setLoadErr('');
    fetch(`/api/channels/keys?slug=${encodeURIComponent(slug)}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d.error) throw new Error(d.error || `the server answered ${r.status}`);
        setProviders(d.providers || {});
      })
      .catch((e) => setLoadErr(e.message || 'network error'));
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (provider) => {
    const key = (inputs[provider] || '').trim();
    if (!key) { setMsg((m) => ({ ...m, [provider]: { ok: false, text: 'paste a key first' } })); return; }
    setBusy(provider);
    try {
      const r = await fetch('/api/channels/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, provider, key }),
      });
      const d = await r.json().catch(() => ({}));
      setMsg((m) => ({ ...m, [provider]: d.ok ? { ok: true, text: `saved ${d.masked}` } : { ok: false, text: d.error || 'rejected' } }));
      if (d.ok) {
        setInputs((s) => ({ ...s, [provider]: '' }));
        load();
      }
    } catch (e) {
      setMsg((m) => ({ ...m, [provider]: { ok: false, text: e.message } }));
    } finally {
      setBusy('');
    }
  };

  const remove = async (provider, label) => {
    const ok = await confirm({
      title: `Remove your ${label} key?`,
      body: "The studio's shared key takes over again for this channel.",
      confirmLabel: 'Remove key',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(provider);
    try {
      const r = await fetch('/api/channels/keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, provider }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `the server answered ${r.status}`);
      setMsg((m) => ({ ...m, [provider]: { ok: true, text: 'removed — shared key resumes' } }));
      load();
    } catch (e) {
      setMsg((m) => ({ ...m, [provider]: { ok: false, text: `couldn't remove — ${e.message}` } }));
    } finally {
      setBusy('');
    }
  };

  if (loadErr) {
    return (
      <div className="text-center py-6">
        <p className="t-13 font-semibold text-ink">Can&apos;t load your keys right now</p>
        <p className="t-12 text-faint mt-1">{loadErr}</p>
        <button className="btn btn-outline btn-sm mt-3" onClick={load}><RefreshCw size={13} /> Try again</button>
      </div>
    );
  }
  if (!providers) return <div className="flex items-center gap-2 t-12 text-muted py-6"><Loader2 size={14} className="animate-spin" /> Loading keys…</div>;

  return (
    <div className="space-y-2">
      {Object.entries(providers).map(([p, v]) => (
        <div key={p} className="inset-tile p-3">
          <div className="flex items-center gap-2 t-12">
            <span className="font-medium text-ink">{v.label}</span>
            {v.set ? (
              <span className="ml-auto flex items-center gap-1 font-mono" style={{ color: 'var(--ok-ink)' }}><CheckCircle2 size={11} /> {v.masked}</span>
            ) : (
              <span className="ml-auto text-faint">shared key in use</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <input
              type="password"
              autoComplete="new-password"
              aria-label={`${v.label} key`}
              placeholder={v.set ? 'paste a new key to replace' : 'paste your key…'}
              value={inputs[p] || ''}
              onChange={(e) => setInputs((s) => ({ ...s, [p]: e.target.value }))}
              className="input flex-1 min-w-0 t-12"
            />
            <button onClick={() => save(p)} disabled={busy === p} className="btn btn-outline btn-sm">
              {busy === p ? <Loader2 size={12} className="animate-spin" /> : null} Save &amp; test
            </button>
            {v.set ? (
              <button onClick={() => remove(p, v.label)} disabled={busy === p} className="icon-btn" title="Remove — shared key resumes" aria-label={`Remove your ${v.label} key — the shared key resumes`}>
                <XCircle size={14} />
              </button>
            ) : null}
          </div>
          {msg[p] ? (
            <p className="t-11 mt-1.5 flex items-center gap-1" role={msg[p].ok ? 'status' : 'alert'} style={{ color: msg[p].ok ? 'var(--ok-ink)' : 'var(--bad-ink)' }}>
              {msg[p].ok ? <CheckCircle2 size={11} /> : <XCircle size={11} />} {msg[p].text}
            </p>
          ) : null}
        </div>
      ))}
      <p className="t-11 text-faint leading-relaxed pt-1">A dead key is dropped automatically and the shared key covers — you get an alert.</p>
    </div>
  );
}
