'use client';
// Providers management page (issue #104 Phase 2 BYOK vault v2, Task 4) — the
// workspace-level companion to the per-channel API-keys panels on /channels:
// a browser for the full provider catalog (capabilities, free-tier data,
// license class), per-provider key status (pipeline env + per-channel vault,
// masked only), an add-key flow that reuses the EXISTING vault path
// (POST /api/channels/keys — live test-on-save, AES-256-GCM, masked
// read-back), a key probe for providers the vault has no slot for yet, and
// the workspace-default routing editor (ProviderRoutingPanel).
// Owner writes, staff read-only (both enforced server-side by the APIs).
// Round 2: each catalog row is a calm summary; the add-key / probe form opens
// in a Drawer ("Manage key") instead of sitting expanded inside every row.
import { useEffect, useMemo, useState } from 'react';
import { PlugZap, KeyRound, Loader2, CheckCircle2, XCircle, Info, ExternalLink, LockKeyhole, FlaskConical, RefreshCw, Settings2 } from 'lucide-react';
import { Card, CardHead, Chip, PageHeader, PageSkeleton, EmptyState } from '@/components/ui';
import Drawer from '@/components/Drawer';
import ProviderRoutingPanel from '@/components/ProviderRoutingPanel';

const LICENSE_TONE = { free: 'ok', 'free-with-caveats': 'warn', paid: 'bad' };

const VAULT_GET_URL = { // where to get a key (vault-tracked providers only; UI text, not capability data)
  gemini: 'https://aistudio.google.com/apikey',
  groq: 'https://console.groq.com/keys',
  cerebras: 'https://cloud.cerebras.ai',
  mistral: 'https://console.mistral.ai/api-keys',
  hf: 'https://huggingface.co/settings/tokens',
  openai: 'https://platform.openai.com/api-keys',
  openrouter: 'https://openrouter.ai/keys',
  elevenlabs: 'https://elevenlabs.io/app/api-keys',
};

export default function ProvidersPage() {
  const [data, setData] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [keyForm, setKeyForm] = useState({});  // providerId -> { slug, key, busy, msg:{ok,text} }
  const [probe, setProbe] = useState({});      // providerId -> { busy, msg:{ok,text} }
  const [managing, setManaging] = useState(null); // provider id whose key drawer is open

  const load = () => {
    setLoadErr(null);
    fetch('/api/providers')
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `request failed (${r.status})`);
        setData(d);
      })
      .catch((e) => setLoadErr(String(e.message || e)));
  };
  useEffect(() => { load(); }, []);

  const isOwner = data?.role === 'owner';
  const catalog = data?.catalog || [];
  const channels = useMemo(() => [...(data?.channels || [])].sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0) || a.slug.localeCompare(b.slug)), [data]);
  const keysByProvider = data?.keys || {};
  const formOf = (id) => keyForm[id] || {};
  const setForm = (id, patch) => setKeyForm((s) => ({ ...s, [id]: { ...(s[id] || {}), ...patch } }));

  // Add-key via the EXISTING vault path: /api/channels/keys validates live
  // before saving (test-on-save), encrypts, and answers with the masked value.
  const saveKey = async (id) => {
    const form = formOf(id);
    const key = (form.key || '').trim();
    if (!form.slug) { setForm(id, { msg: { ok: false, text: 'pick a channel first' } }); return; }
    if (!key) { setForm(id, { msg: { ok: false, text: 'paste a key first' } }); return; }
    setForm(id, { busy: true, msg: null });
    try {
      const r = await fetch('/api/channels/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: form.slug, provider: id, key }),
      });
      const d = await r.json().catch(() => ({}));
      setForm(id, { busy: false, key: '', msg: d.ok ? { ok: true, text: `saved ${d.masked} on ${form.slug} — tested live at save` } : { ok: false, text: d.error || `rejected (${r.status})` } });
      if (d.ok) load();
    } catch (e) {
      setForm(id, { busy: false, msg: { ok: false, text: String(e.message || e) } });
    }
  };

  // Probe without saving — for providers the vault has no slot for yet.
  const testOnly = async (id) => {
    const key = (formOf(id).key || '').trim();
    if (!key) { setProbe((s) => ({ ...s, [id]: { busy: false, msg: { ok: false, text: 'paste a key first' } } })); return; }
    setProbe((s) => ({ ...s, [id]: { busy: true, msg: null } }));
    try {
      const r = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test-key', providerId: id, key }),
      });
      const d = await r.json().catch(() => ({}));
      setProbe((s) => ({ ...s, [id]: { busy: false, msg: d.ok ? { ok: true, text: 'key works — nothing stored' } : { ok: false, text: `rejected: ${d.detail || 'unknown error'}` } } }));
    } catch (e) {
      setProbe((s) => ({ ...s, [id]: { busy: false, msg: { ok: false, text: String(e.message || e) } } }));
    }
  };

  if (loadErr) {
    return (
      <div>
        <PageHeader icon={PlugZap} title="Providers" sub="BYOK catalog, keys & per-task routing" />
        <Card className="p-4">
          <EmptyState icon={XCircle} title="Can't load providers right now" sub={`${loadErr} — your keys and routing are unchanged; only this view couldn't read them.`}>
            <button className="btn btn-outline btn-sm mt-3" onClick={load}><RefreshCw size={13} /> Retry</button>
          </EmptyState>
        </Card>
      </div>
    );
  }
  if (!data) return <PageSkeleton />;

  return (
    <div>
      <PageHeader icon={PlugZap} title="Providers" sub={`${catalog.length} providers in the catalog · any provider, any key, per-task routing`}>
        <Chip tone={isOwner ? 'ok' : 'info'} dot>{isOwner ? 'owner — read & write' : 'staff — read-only'}</Chip>
      </PageHeader>

      <Card className="overflow-hidden mb-4">
        <CardHead
          title="Provider catalog"
          sub="Capabilities, free-tier limits (fetched-dated) and license class — the single source of truth the pipeline routes through"
          icon={PlugZap}
        />
        <div className="px-4 pb-4 space-y-2">
          {catalog.map((p) => {
            const channelKeys = keysByProvider[p.id] || [];
            const configured = p.envSet || channelKeys.length > 0 || p.local;
            const form = formOf(p.id);
            return (
              <div key={p.id} className="rounded-xl border border-line bg-surface-2 p-3 min-w-0">
                {/* head row */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="t-13 font-semibold text-ink">{p.label}</span>
                  <span className="t-10 px-2 py-0.5 rounded-full border border-line text-faint font-mono">{p.id}</span>
                  {p.capabilities.map((c) => <Chip key={c} tone="accent">{c}</Chip>)}
                  <Chip tone={LICENSE_TONE[p.licenseClass] || 'plain'}>{p.licenseClass}</Chip>
                  {p.local ? <Chip tone="plain"><LockKeyhole size={10} className="inline mr-1 -mt-px" />local — no key</Chip>
                    : p.envSet ? <Chip tone="ok" dot>env key set ({p.envVar})</Chip>
                    : null}
                  {!configured ? <span className="ml-auto t-11 text-faint">key not configured</span> : null}
                </div>

                {/* free tier + models + notes */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 t-11 text-muted">
                  <span>
                    free tier: {p.freeTier?.rpd ? `${p.freeTier.rpd} req/day` : 'no published RPD'}
                    {p.freeTier?.maxOutputTokens ? ` · ${p.freeTier.maxOutputTokens.toLocaleString()} max output tokens` : ''}
                    <span className="text-faint"> · fetched {p.freeTier?.fetched || '—'}</span>
                  </span>
                  {p.models?.length ? <span className="font-mono text-faint truncate">{p.models.join(' · ')}</span> : null}
                </div>
                <p className="t-11 text-muted mt-1.5 leading-relaxed">{p.notes}</p>
                {p.id === 'hf' ? (
                  <div className="flex items-start gap-1.5 mt-1.5 t-11" style={{ color: 'var(--warn-ink)' }}>
                    <Info size={12} className="mt-0.5 shrink-0" />
                    <span>licenseClass paid — disqualified as a free lane 2026-10-28 (zero monthly credits on free); kept in the projection only so Phase-1 vault-adds rulings stay byte-identical.</span>
                  </div>
                ) : null}

                {/* per-channel vault keys (masked forever) */}
                {channelKeys.length ? (
                  <div className="mt-2 space-y-1">
                    {channelKeys.map((k) => (
                      <div key={k.slug} className="flex flex-wrap items-center gap-2 t-11">
                        <KeyRound size={11} className="shrink-0" style={{ color: 'var(--ok-ink)' }} />
                        <span className="text-ink font-medium">{k.slug}</span>
                        <span className="font-mono" style={{ color: 'var(--ok-ink)' }}>{k.masked}</span>
                        {k.updated ? <span className="text-faint">tested {String(k.updated).slice(0, 16).replace('T', ' ')} UTC · by {k.updatedBy || '—'}</span> : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {isOwner && !p.local ? (
                  <div className="flex flex-wrap items-center gap-2 mt-2.5">
                    <button className="btn btn-outline btn-sm" onClick={() => setManaging(p.id)}>
                      <Settings2 size={12} /> {p.vaultKey ? 'Manage key' : 'Test a key'}
                    </button>
                    {form.msg?.ok ? <span className="t-11 flex items-center gap-1" style={{ color: 'var(--ok-ink)' }}><CheckCircle2 size={11} /> {form.msg.text}</span> : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>

      {/* workspace-default routing editor (channel overrides live per channel on /channels) */}
      <Card className="overflow-hidden">
        <CardHead title="Routing — workspace defaults" sub="Per-capability provider priority every channel falls back to; overrides live on each channel card at /channels" icon={PlugZap} />
        <div className="px-4 pb-4">
          <ProviderRoutingPanel />
        </div>
      </Card>

      <KeyDrawer
        provider={catalog.find((p) => p.id === managing) || null}
        onClose={() => setManaging(null)}
        channels={channels}
        form={managing ? formOf(managing) : {}}
        setForm={(patch) => setForm(managing, patch)}
        probeState={managing ? probe[managing] : null}
        onSave={() => saveKey(managing)}
        onProbe={() => testOnly(managing)}
      />
    </div>
  );
}

// The add-key (vault-tracked) or probe-only (env-riding) form, one provider at
// a time. Props only — every hook value lives in ProvidersPage.
function KeyDrawer({ provider: p, onClose, channels, form, setForm, probeState, onSave, onProbe }) {
  const getUrl = p ? VAULT_GET_URL[p.id] : null;
  const msg = p?.vaultKey ? form.msg : probeState?.msg;
  return (
    <Drawer
      open={!!p}
      onClose={onClose}
      title={p ? (p.vaultKey ? `${p.label} key` : `Test a ${p.label} key`) : ''}
      description={p ? (p.vaultKey ? 'Saved per channel: tested live, encrypted, shown masked forever after.' : `No vault slot yet — this provider rides the pipeline env (${p.envVar}). Probing never stores the key.`) : ''}
      icon={KeyRound}
      size="sm"
      footer={p ? (
        <>
          <button className="btn btn-outline" onClick={onClose}>Close</button>
          {p.vaultKey ? (
            <button className="btn btn-primary" onClick={onSave} disabled={form.busy || !channels.length || !form.slug || !(form.key || '').trim()}>
              {form.busy ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />} Save &amp; test
            </button>
          ) : (
            <button className="btn btn-primary" onClick={onProbe} disabled={probeState?.busy || !(form.key || '').trim()}>
              {probeState?.busy ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />} Test only
            </button>
          )}
        </>
      ) : null}
    >
      {p ? (
        <div className="space-y-4">
          {p.vaultKey ? (
            <div>
              <label className="block t-12 font-semibold text-ink mb-1.5" htmlFor="pk-channel">Channel</label>
              <select id="pk-channel" value={form.slug || ''} onChange={(e) => setForm({ slug: e.target.value })} className="input w-full">
                <option value="">{channels.length ? '— channel for this key —' : '— no channels yet —'}</option>
                {channels.map((c) => (
                  <option key={c.slug} value={c.slug}>{c.label || c.slug}{c.active === false ? ' (parked)' : ''}</option>
                ))}
              </select>
            </div>
          ) : null}
          <div>
            <label className="block t-12 font-semibold text-ink mb-1.5" htmlFor="pk-key">API key</label>
            <input
              id="pk-key"
              type="password"
              autoComplete="new-password"
              placeholder={`paste ${p.label.split(' ')[0].toLowerCase()} key…`}
              value={form.key || ''}
              onChange={(e) => setForm({ key: e.target.value })}
              className="input w-full"
            />
            {getUrl ? (
              <a href={getUrl} target="_blank" rel="noreferrer" className="t-11 text-muted hover:text-ink inline-flex items-center gap-1 mt-1.5">
                Get a key from {p.label} <ExternalLink size={10} />
              </a>
            ) : null}
          </div>
          {msg ? (
            <p className="t-12 flex items-center gap-1.5" role={msg.ok ? 'status' : 'alert'} style={{ color: msg.ok ? 'var(--ok-ink)' : 'var(--bad-ink)' }}>
              {msg.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />} {msg.text}
            </p>
          ) : null}
        </div>
      ) : null}
    </Drawer>
  );
}
