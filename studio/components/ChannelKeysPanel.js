'use client';
// Per-channel API keys panel (#103). All key behavior is unchanged from the
// retired /keys page: live validate-before-save, AES-256-GCM at rest, masked
// read-back forever. Mounted only while its Drawer is open, so
// fetch-on-mount == fetch-on-open.
//
// Round 2: rendered inside a Drawer via ChannelDrawers (`frame(body)`); each
// provider row keeps its own Save & test, so there is no single footer action.
import { useEffect, useState } from 'react';
import { KeyRound, Loader2, CheckCircle2, XCircle, Trash2, ExternalLink, Info, RefreshCw, ShieldCheck } from 'lucide-react';
import { useConfirm } from '@/components/ConfirmDialog';

export default function ChannelKeysPanel({ slug, frame }) {
  const confirm = useConfirm();
  const [providers, setProviders] = useState(null);
  const [inputs, setInputs] = useState({});
  const [busy, setBusy] = useState('');       // provider currently saving/removing
  const [msg, setMsg] = useState({});         // provider -> {ok, text}
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(null); // friendly denial / network error (AC-12)

  const load = () => {
    setLoading(true);
    setLoadErr(null);
    fetch(`/api/channels/keys?slug=${encodeURIComponent(slug)}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `request failed (${r.status})`);
        setProviders(d.providers || null);
        setMeta({ updated: d.updated, updatedBy: d.updatedBy });
      })
      .catch((e) => setLoadErr(String(e.message || e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [slug]);

  const save = async (provider) => {
    const key = (inputs[provider] || '').trim();
    if (!key) { setMsg((m) => ({ ...m, [provider]: { ok: false, text: 'Paste a key first.' } })); return; }
    setBusy(provider);
    try {
      const r = await fetch('/api/channels/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, provider, key }),
      });
      const d = await r.json();
      setMsg((m) => ({ ...m, [provider]: d.ok ? { ok: true, text: `Saved and tested — ${d.masked}` } : { ok: false, text: d.error || 'rejected' } }));
      if (d.ok) {
        setInputs((s) => ({ ...s, [provider]: '' })); // never keep a secret in the field after it is stored
        load();
      }
    } catch (e) {
      setMsg((m) => ({ ...m, [provider]: { ok: false, text: e.message } }));
    } finally {
      setBusy('');
    }
  };

  const remove = async (provider, label) => {
    if (!(await confirm({
      title: `Remove the ${label} key?`,
      body: 'This channel goes back to the shared key. The saved key cannot be recovered — you would have to paste it again.',
      confirmLabel: 'Remove key',
      tone: 'danger',
    }))) return;
    setBusy(provider);
    try {
      const r = await fetch('/api/channels/keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, provider }),
      });
      const d = await r.json().catch(() => ({}));
      setMsg((m) => ({ ...m, [provider]: r.ok ? { ok: true, text: 'Removed — the shared key takes over.' } : { ok: false, text: d.error || `remove failed (${r.status})` } }));
      if (r.ok) load();
    } catch (e) {
      setMsg((m) => ({ ...m, [provider]: { ok: false, text: String(e.message || e) } }));
    } finally {
      setBusy('');
    }
  };

  const body = (
    <div className="space-y-4 min-w-0">
      <p className="flex items-start gap-2 t-12 text-muted">
        <ShieldCheck size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--info-ink)' }} />
        <span className="min-w-0">Channel keys run before shared keys. Saved keys are never shown again.</span>
      </p>

      {loadErr ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 t-13" style={{ color: 'var(--bad-ink)' }}>
          <XCircle size={14} className="shrink-0" />
          <span className="min-w-0 flex-1">Couldn&apos;t load this channel&apos;s keys: {loadErr}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={load}><RefreshCw size={13} /> Retry</button>
        </div>
      ) : loading || !providers ? (
        <div className="flex items-center gap-2 text-muted t-13 py-4"><Loader2 size={14} className="animate-spin" /> Loading keys…</div>
      ) : (
        <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {Object.entries(providers).map(([p, v]) => {
            const inputId = `key-${slug}-${p}`;
            return (
              <li key={p} className="py-3 min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <label htmlFor={inputId} className="t-13 font-semibold text-ink">{v.label}</label>
                  {v.hint ? <span className="t-11 text-faint">{v.hint}</span> : null}
                  {v.set ? (
                    <span className="ml-auto t-12 flex items-center gap-1 font-mono" style={{ color: 'var(--ok-ink)' }}><CheckCircle2 size={12} /> {v.masked}</span>
                  ) : (
                    <span className="ml-auto t-12 text-faint">Using shared key</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <input
                    id={inputId}
                    type="password"
                    placeholder={v.set ? 'Paste a new key to replace it' : `Paste a ${v.label.split(' ')[0]} key`}
                    value={inputs[p] || ''}
                    onChange={(e) => setInputs((s) => ({ ...s, [p]: e.target.value }))}
                    className="input flex-1 min-w-0 basis-56"
                    autoComplete="new-password"
                  />
                  <button type="button" onClick={() => save(p)} disabled={busy === p} className="btn btn-outline btn-sm">
                    {busy === p ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />} Save &amp; test
                  </button>
                  {v.set ? (
                    <button
                      type="button"
                      onClick={() => remove(p, v.label)}
                      disabled={busy === p}
                      className="btn btn-danger btn-sm"
                      aria-label={`Remove the ${v.label} key — the shared key takes over again`}
                    >
                      <Trash2 size={12} /> Remove
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                  {msg[p] ? (
                    <p role="status" className="t-12 flex items-center gap-1 min-w-0" style={{ color: msg[p].ok ? 'var(--ok-ink)' : 'var(--bad-ink)' }}>
                      {msg[p].ok ? <CheckCircle2 size={12} className="shrink-0" /> : <XCircle size={12} className="shrink-0" />} <span className="min-w-0">{msg[p].text}</span>
                    </p>
                  ) : null}
                  {v.url ? (
                    <a href={v.url} target="_blank" rel="noreferrer" className="t-12 text-muted hover:text-ink inline-flex items-center gap-1 ml-auto">
                      Get a key <ExternalLink size={11} />
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {meta?.updated ? (
        <p className="flex gap-2 items-start t-11 text-faint">
          <Info size={12} className="shrink-0 mt-0.5" />
          <span className="min-w-0">Last change {String(meta.updated).slice(0, 16).replace('T', ' ')} UTC by {meta.updatedBy || '—'}</span>
        </p>
      ) : null}
    </div>
  );

  if (frame) return frame(body, null);
  return (
    <div className="inset-tile p-4 mt-1 space-y-4">
      <div className="flex items-center gap-2 overline"><KeyRound size={12} /> API keys</div>
      {body}
    </div>
  );
}
