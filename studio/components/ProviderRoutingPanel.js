'use client';
// Per-capability provider routing panel (issue #104 Phase 2 BYOK vault v2,
// Task 4). Per channel it opens in a Drawer (ChannelDrawers passes `frame`);
// without a slug it renders inline on the /providers page, where it edits the
// workspace defaults.
//
// Talks to Task 4's API: GET /api/providers[?channel=<slug>] for catalog +
// routes + effective resolution, POST /api/providers {action: set-route |
// deactivate-route} for writes (owner-only server-side; staff renders
// read-only). Per capability it shows the priority chain (up/down reordering,
// spaced priorities 100/200/…), the local baseline lanes as always-available
// (no key, never routed — they are the implicit last resort), and — per
// channel — the effective order (channel override → workspace default,
// deduped) straight from resolveCapability so what you see is what the
// pipeline resolves.
//
// Live fix wave A1 (T3-11): ↑/↓/Add/Remove edit a LOCAL draft only. Nothing
// is written until the owner presses Save ("Save for all channels" on the
// workspace default) and confirms — one click used to re-order AI for every
// channel. T3-27: plain words only (no "prio N", ids or env var names).
import { useEffect, useMemo, useState } from 'react';
import { Route, ArrowUp, ArrowDown, Plus, Trash2, Loader2, CheckCircle2, XCircle, Info, LockKeyhole, RefreshCw, Save, Undo2 } from 'lucide-react';
import { Chip, Segmented } from '@/components/ui';
import { useConfirm } from '@/components/ConfirmDialog';
import { chainIdsFor, moveInDraft, planChainSave, sameOrder } from '@/lib/route-draft.mjs';

const CAP_LABEL = {
  'script-gen': 'script generation (LLM)',
  'tts': 'text-to-speech',
  'captions': 'captions',
  'image-gen': 'image generation',
};

export default function ProviderRoutingPanel({ slug, frame }) {
  const confirm = useConfirm();
  const [data, setData] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [layer, setLayer] = useState('channel');        // 'channel' override vs 'default' (workspace)
  const [busy, setBusy] = useState(false);              // Save in flight
  const [msg, setMsg] = useState(null);                 // { ok, text }
  const [pick, setPick] = useState({});                 // capability -> providerId chosen in the add select
  const [edits, setEdits] = useState({});               // capability -> draft provider ids (unsaved, active layer only)

  // state is only set when the request settles (never synchronously in the effect)
  const load = () => {
    fetch(`/api/providers${slug ? `?channel=${encodeURIComponent(slug)}` : ''}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `request failed (${r.status})`);
        setLoadErr(null);
        setData(d);
      })
      .catch((e) => setLoadErr(String(e.message || e)));
  };
  useEffect(() => { load(); }, [slug]);

  const isOwner = data?.role === 'owner';
  const catalog = useMemo(() => new Map((data?.catalog || []).map((p) => [p.id, p])), [data]);
  const caps = data?.capabilities || [];
  const routes = data?.routes || [];
  const activeLayer = slug ? layer : 'default';

  const layerChannel = activeLayer === 'channel' ? slug : null;
  const savedIds = (cap) => chainIdsFor(routes, cap, layerChannel);
  const draftIds = (cap) => edits[cap] || savedIds(cap);
  const changedCaps = caps.map(({ cap }) => cap).filter((cap) => edits[cap] && !sameOrder(edits[cap], savedIds(cap)));
  const dirty = changedCaps.length > 0;
  const capName = (cap) => CAP_LABEL[cap] || cap;
  const providerName = (id) => catalog.get(id)?.label || id;

  const post = async (payload) => {
    const r = await fetch('/api/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error === 'invalid route' && Array.isArray(d.errors) ? d.errors.join('; ') : d.error || `request failed (${r.status})`);
    return d;
  };

  // T3-11: these three only change the local draft — Save writes it.
  const reorder = (cap, idx, dir) => {
    setMsg(null);
    setEdits((e) => ({ ...e, [cap]: moveInDraft(e[cap] || savedIds(cap), idx, dir) }));
  };

  const addProvider = (cap) => {
    const providerId = pick[cap];
    if (!providerId) return;
    setMsg(null);
    setEdits((e) => ({ ...e, [cap]: [...(e[cap] || savedIds(cap)), providerId] }));
    setPick((p) => ({ ...p, [cap]: '' }));
  };

  const removeProvider = (cap, providerId) => {
    setMsg(null);
    setEdits((e) => ({ ...e, [cap]: (e[cap] || savedIds(cap)).filter((id) => id !== providerId) }));
  };

  const discard = () => {
    setEdits({});
    setMsg(null);
  };

  // The ONE write path: confirm, then post only what changed (planChainSave).
  // Removing a provider is part of the same confirm (admin-panel review #8).
  const saveChanges = async () => {
    if (!dirty || busy) return;
    const isDefault = activeLayer === 'default';
    const what = changedCaps.map(capName).join(', ');
    const ok = await confirm({
      title: isDefault ? 'Change the AI order for all channels?' : 'Save the AI order for this channel?',
      body: isDefault
        ? `This changes ${what} for every channel that has no order of its own.`
        : `This changes ${what} for this channel only.`,
      confirmLabel: isDefault ? 'Save for all channels' : 'Save',
      tone: isDefault ? 'danger' : 'primary',
    });
    if (!ok) return;
    setBusy(true);
    setMsg(null);
    try {
      for (const cap of changedCaps) {
        const savedRows = routes.filter((r) => r.capability === cap && (layerChannel ? r.channel_id === layerChannel : r.channel_id === null));
        for (const op of planChainSave(savedRows, edits[cap])) {
          await post({ ...op, channelId: layerChannel, capability: cap });
        }
      }
      setEdits({});
      setMsg({ ok: true, text: isDefault ? 'Saved for all channels.' : 'Saved for this channel.' });
    } catch (e) {
      setMsg({ ok: false, text: `Could not save: ${String(e.message || e)}` });
    } finally {
      setBusy(false);
      load();
    }
  };

  const switchLayer = async (v) => {
    if (v === layer) return;
    if (dirty && !(await confirm({ title: 'Discard unsaved changes?', body: 'Your changes to the AI order have not been saved.', confirmLabel: 'Discard', tone: 'danger' }))) return;
    setEdits({});
    setLayer(v);
    setMsg(null);
  };

  const wrap = (body) => {
    if (frame) return frame(body, null);
    return (
      <div className="inset-tile p-4 mt-1 space-y-3">
        <div className="flex flex-wrap items-center gap-2 overline"><Route size={12} /> Provider routing</div>
        {body}
      </div>
    );
  };

  if (loadErr) {
    return wrap(
      <div role="alert" className="flex flex-wrap items-center gap-2 t-13" style={{ color: 'var(--bad-ink)' }}>
        <XCircle size={14} className="shrink-0" />
        <span className="min-w-0 flex-1">Provider routing unavailable: {loadErr}</span>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => { setLoadErr(null); load(); }}><RefreshCw size={13} /> Retry</button>
      </div>
    );
  }
  if (!data) {
    return wrap(
      <div className="flex items-center gap-2 text-muted t-13">
        <Loader2 size={14} className="animate-spin" /> Loading provider routing…
      </div>
    );
  }

  const localsOf = (cap) => (data.capabilities.find((c) => c.cap === cap)?.providers || [])
    .map((id) => catalog.get(id))
    .filter((p) => p?.local);

  return wrap(
    <div className="space-y-5 min-w-0">
      <p className="t-12 text-muted">
        {slug ? 'Top runs first. Built-in local services are always the last resort.' : 'Used by every channel without its own order.'}
        {!isOwner ? <span className="inline-flex items-center gap-1 ml-1"><Info size={12} style={{ color: 'var(--info-ink)' }} /> Read-only.</span> : null}
      </p>

      {/* channel override vs workspace default toggle (per-channel mount only) */}
      {slug ? (
        <Segmented
          value={activeLayer}
          onChange={switchLayer}
          options={[{ value: 'channel', label: 'This channel' }, { value: 'default', label: 'All channels (default)' }]}
        />
      ) : null}

      {data.routesError ? (
        <p className="flex items-start gap-1.5 t-12" style={{ color: 'var(--warn-ink)' }}>
          <Info size={13} className="mt-0.5 shrink-0" />
          <span className="min-w-0">Saved AI order can&apos;t be read right now. The built-in order is used until it is back.</span>
        </p>
      ) : null}

      <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
        {caps.map(({ cap }) => {
          const chain = draftIds(cap);
          const locals = localsOf(cap);
          const covering = (data.capabilities.find((c) => c.cap === cap)?.providers || [])
            .map((id) => catalog.get(id))
            .filter((p) => p && !p.local);
          const inChain = new Set(chain);
          const addable = covering.filter((p) => !inChain.has(p.id));
          const resolvedList = slug && data.resolved ? data.resolved[cap] || [] : null;
          const pickId = `route-add-${slug || 'default'}-${cap}`;
          const lastResort = locals.map((p) => p.label).join(', ');
          return (
            <section key={cap} className="py-3 min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="t-13 font-semibold text-ink first-letter:uppercase">{capName(cap)}</h3>
                {changedCaps.includes(cap) ? <Chip tone="warn" dot>not saved</Chip> : null}
                {locals.map((p) => (
                  <Chip key={p.id} tone="plain" className="max-w-full"><LockKeyhole size={10} className="inline mr-1 -mt-px" />{p.label} always available</Chip>
                ))}
              </div>

              {covering.length === 0 ? (
                <p className="t-12 text-faint">No provider for this yet.</p>
              ) : chain.length === 0 ? (
                <p className="t-12 text-muted">
                  {activeLayer === 'channel' ? 'Uses the all-channels default.' : 'Uses the built-in order.'}
                </p>
              ) : (
                <ol className="space-y-1.5">
                  {chain.map((providerId, i) => {
                    const name = providerName(providerId);
                    return (
                      <li key={providerId} className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--line)] px-3 py-2 min-w-0">
                        <span className="tnum t-11 text-faint w-5 shrink-0">{i + 1}.</span>
                        <span className="t-13 text-ink font-medium truncate min-w-0 flex-1">{name}</span>
                        {isOwner ? (
                          <span className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => reorder(cap, i, -1)}
                              disabled={busy || i === 0}
                              className="icon-btn"
                              title="Move up (runs earlier)"
                              aria-label={`Move ${name} up (runs earlier)`}
                            >
                              <ArrowUp size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => reorder(cap, i, 1)}
                              disabled={busy || i === chain.length - 1}
                              className="icon-btn"
                              title="Move down (runs later)"
                              aria-label={`Move ${name} down (runs later)`}
                            >
                              <ArrowDown size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeProvider(cap, providerId)}
                              disabled={busy}
                              className="icon-btn"
                              title="Remove from the list"
                              aria-label={`Remove ${name} from the list`}
                            >
                              <Trash2 size={14} />
                            </button>
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              )}

              {/* add provider (owner only) */}
              {isOwner && addable.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor={pickId} className="sr-only">Add a provider for {capName(cap)}</label>
                  <select
                    id={pickId}
                    value={pick[cap] || ''}
                    onChange={(e) => setPick((p) => ({ ...p, [cap]: e.target.value }))}
                    className="input flex-1 min-w-0 basis-56"
                  >
                    <option value="">Add a provider…</option>
                    {addable.map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => addProvider(cap)}
                    disabled={!pick[cap] || busy}
                    className="btn btn-outline btn-sm"
                    title="Adds it to the end of the list (runs last)"
                  >
                    <Plus size={12} /> Add
                  </button>
                </div>
              ) : null}

              {/* what actually runs today (channel mount only, the SAVED order) */}
              {resolvedList ? (
                <p className="t-11 text-faint break-words">
                  {resolvedList.length
                    ? `Runs today: ${resolvedList.map((r) => `${providerName(r.providerId)}${r.source === 'channel' ? ' (this channel)' : ' (all channels)'}`).join(', then ')}${lastResort ? `, then ${lastResort}` : ''}.`
                    : `Runs today: the built-in order${lastResort ? `, then ${lastResort}` : ''}.`}
                </p>
              ) : null}
            </section>
          );
        })}
      </div>

      {/* T3-11: nothing above is live until Save (+ confirm) */}
      {isOwner && dirty ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3" style={{ borderColor: 'color-mix(in srgb, var(--warn) 35%, transparent)' }}>
          <span className="t-12 min-w-0 flex-1" style={{ color: 'var(--warn-ink)' }}>
            {activeLayer === 'default' ? 'Not saved yet — this will change every channel without its own order.' : 'Not saved yet — only this channel changes.'}
          </span>
          <button type="button" onClick={discard} disabled={busy} className="btn btn-outline btn-sm">
            <Undo2 size={12} /> Discard
          </button>
          <button type="button" onClick={saveChanges} disabled={busy} className="btn btn-primary btn-sm">
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} {activeLayer === 'default' ? 'Save for all channels' : 'Save for this channel'}
          </button>
        </div>
      ) : null}

      {msg ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border p-3 t-12 flex items-start gap-1.5"
          style={{
            borderColor: `color-mix(in srgb, ${msg.ok ? 'var(--ok)' : 'var(--bad)'} 35%, transparent)`,
            background: `color-mix(in srgb, ${msg.ok ? 'var(--ok)' : 'var(--bad)'} 8%, transparent)`,
            color: msg.ok ? 'var(--ok-ink)' : 'var(--bad-ink)',
          }}
        >
          {msg.ok ? <CheckCircle2 size={13} className="mt-0.5 shrink-0" /> : <XCircle size={13} className="mt-0.5 shrink-0" />}
          <span className="min-w-0">{msg.text}</span>
        </div>
      ) : null}
    </div>
  );
}
