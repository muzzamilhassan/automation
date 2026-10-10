'use client';
// BYOK — per-channel provider API keys (owner page). Save = live validation,
// storage is encrypted server-side, read-back is masked (••••last4) forever.
import { useEffect, useState } from 'react';
import { KeyRound, Loader2, CheckCircle2, XCircle, Trash2, ExternalLink, Info } from 'lucide-react';

export default function KeysPage() {
  const [channels, setChannels] = useState([]);
  const [slug, setSlug] = useState('');
  const [providers, setProviders] = useState(null);
  const [inputs, setInputs] = useState({});
  const [busy, setBusy] = useState('');       // provider currently saving/removing
  const [msg, setMsg] = useState({});         // provider -> {ok, text}
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/overview')
      .then((r) => r.json())
      .then((d) => {
        const list = (d.channels || []).map((c) => ({ slug: c.slug, label: c.label }));
        setChannels(list);
        if (list.length) setSlug(list[0].slug);
      })
      .catch(() => setChannels([]));
  }, []);

  const load = (s) => {
    if (!s) return;
    setLoading(true);
    setInputs({});
    setMsg({});
    fetch(`/api/channels/keys?slug=${encodeURIComponent(s)}`)
      .then((r) => r.json())
      .then((d) => {
        setProviders(d.providers || null);
        setMeta({ updated: d.updated, updatedBy: d.updatedBy });
      })
      .catch(() => setProviders(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(slug); }, [slug]);

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
      const d = await r.json();
      setMsg((m) => ({ ...m, [provider]: d.ok ? { ok: true, text: `saved ${d.masked}` } : { ok: false, text: d.error || 'rejected' } }));
      if (d.ok) load(slug);
    } catch (e) {
      setMsg((m) => ({ ...m, [provider]: { ok: false, text: e.message } }));
    } finally {
      setBusy('');
    }
  };

  const remove = async (provider) => {
    setBusy(provider);
    try {
      await fetch('/api/channels/keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, provider }),
      });
      setMsg((m) => ({ ...m, [provider]: { ok: true, text: 'removed' } }));
      load(slug);
    } finally {
      setBusy('');
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight flex items-center gap-2"><KeyRound size={18} /> API Keys</h1>
          <p className="text-[12px] text-muted mt-0.5">Per-channel keys. A channel&apos;s own key replaces the shared key for that provider — validate happens live before saving, keys are stored encrypted and never shown again.</p>
        </div>
        <select
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="ml-auto text-[13px] px-3 py-2 rounded-lg border border-line bg-surface"
        >
          {channels.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
        </select>
      </div>

      {meta?.updated ? (
        <div className="inset-tile p-3 flex gap-2.5 items-start mb-4">
          <Info size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--info)' }} />
          <p className="text-[11.5px] text-muted">Last change {String(meta.updated).slice(0, 16).replace('T', ' ')} UTC · by {meta.updatedBy || '—'} · every change is also in the audit log and git history.</p>
        </div>
      ) : null}

      {loading || !providers ? (
        <div className="flex items-center gap-2 text-muted text-sm py-8"><Loader2 size={15} className="animate-spin" /> Loading…</div>
      ) : (
        <div className="space-y-3">
          {Object.entries(providers).map(([p, v]) => (
            <div key={p} className="border border-line rounded-xl bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-[13.5px]">{v.label}</span>
                <span className="text-[10.5px] px-2 py-0.5 rounded-full border border-line text-muted">{v.hint}</span>
                {v.set ? (
                  <span className="ml-auto text-[11.5px] flex items-center gap-1" style={{ color: 'var(--ok)' }}><CheckCircle2 size={13} /> {v.masked}</span>
                ) : (
                  <span className="ml-auto text-[11.5px] text-faint">not set — shared key is used</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <input
                  type="password"
                  placeholder={v.set ? 'paste a new key to replace' : `paste ${v.label.split(' ')[0]} key…`}
                  value={inputs[p] || ''}
                  onChange={(e) => setInputs((s) => ({ ...s, [p]: e.target.value }))}
                  className="flex-1 min-w-[220px] text-[13px] px-3 py-2 rounded-lg border border-line bg-bg-soft"
                  autoComplete="off"
                />
                <button
                  onClick={() => save(p)}
                  disabled={busy === p}
                  className="text-[12.5px] font-medium px-3.5 py-2 rounded-lg border border-line hover:bg-surface-2 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {busy === p ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />} Save & test
                </button>
                {v.set ? (
                  <button
                    onClick={() => remove(p)}
                    disabled={busy === p}
                    className="text-[12.5px] px-2.5 py-2 rounded-lg border border-line hover:bg-surface-2 disabled:opacity-50"
                    title="remove — shared key takes over again"
                  >
                    <Trash2 size={13} />
                  </button>
                ) : null}
                <a href={v.url} target="_blank" rel="noreferrer" className="text-[11.5px] text-muted hover:text-ink flex items-center gap-1 ml-auto">
                  get a key <ExternalLink size={11} />
                </a>
              </div>
              {msg[p] ? (
                <p className="text-[11.5px] mt-2 flex items-center gap-1" style={{ color: msg[p].ok ? 'var(--ok)' : 'var(--bad)' }}>
                  {msg[p].ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />} {msg[p].text}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div className="inset-tile p-3 flex gap-2.5 items-start mt-5">
        <Info size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--info)' }} />
        <p className="text-[11.5px] text-muted leading-relaxed">
          Channel keys run <span className="text-ink font-medium">before</span> the shared keys; if a channel has no key for a provider, the shared key is used. A saved key is encrypted with AES-256-GCM and can only be replaced or removed — never viewed again.
        </p>
      </div>
    </div>
  );
}
