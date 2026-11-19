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
import { useEffect, useMemo, useState } from 'react';
import { Route, ArrowUp, ArrowDown, Plus, Trash2, Loader2, CheckCircle2, XCircle, Info, LockKeyhole, RefreshCw } from 'lucide-react';
import { Chip, Segmented } from '@/components/ui';
import { useConfirm } from '@/components/ConfirmDialog';

const CAP_LABEL = {
  'script-gen': 'script generation (LLM)',
  'tts': 'text-to-speech',
  'captions': 'captions',
  'image-gen': 'image generation',
};

const PRIORITY_STEP = 100;

export default function ProviderRoutingPanel({ slug, frame }) {
  const confirm = useConfirm();
  const [data, setData] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [layer, setLayer] = useState('channel');        // 'channel' override vs 'default' (workspace)
  const [busy, setBusy] = useState('');                 // `capability:providerId` currently writing
  const [msg, setMsg] = useState(null);                 // { ok, text }
  const [pick, setPick] = useState({});                 // capability -> providerId chosen in the add select

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

  const chainFor = (cap) => routes
    .filter((r) => r.capability === cap && (activeLayer === 'channel' ? r.channel_id === slug : r.channel_id === null))
    .sort((a, b) => a.priority - b.priority);

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

  const run = async (key, fn) => {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      load();
    } catch (e) {
      setMsg({ ok: false, text: String(e.message || e) });
    } finally {
      setBusy('');
    }
  };

  const reorder = (cap, idx, dir) => {
    const chain = chainFor(cap);
    const swap = idx + dir;
    if (swap < 0 || swap >= chain.length) return;
    const moved = [...chain];
    [moved[idx], moved[swap]] = [moved[swap], moved[idx]];
    const key = `${cap}:${moved[swap].provider_id}`;
    run(key, async () => {
      // Rewrite only rows whose priority actually changes (spaced 100/200/…).
      for (let i = 0; i < moved.length; i++) {
        const want = (i + 1) * PRIORITY_STEP;
        if (moved[i].priority !== want) {
          await post({ action: 'set-route', channelId: activeLayer === 'channel' ? slug : null, capability: cap, providerId: moved[i].provider_id, priority: want });
        }
      }
    });
  };

  const addProvider = (cap) => {
    const providerId = pick[cap];
    if (!providerId) return;
    const chain = chainFor(cap);
    const priority = chain.length ? chain[chain.length - 1].priority + PRIORITY_STEP : PRIORITY_STEP;
    run(`${cap}:${providerId}`, async () => {
      await post({ action: 'set-route', channelId: activeLayer === 'channel' ? slug : null, capability: cap, providerId, priority });
      setPick((p) => ({ ...p, [cap]: '' }));
      setMsg({ ok: true, text: `${catalog.get(providerId)?.label || providerId} added to the ${CAP_LABEL[cap] || cap} chain (priority ${priority}).` });
    });
  };

  const removeProvider = async (cap, providerId) => {
    // admin-panel review #8: confirm before dropping a provider from a live chain
    if (!(await confirm({ title: `Remove ${catalog.get(providerId)?.label || providerId}?`, body: `It leaves the ${CAP_LABEL[cap] || cap} chain${activeLayer === 'channel' ? ` for ${slug}` : ' (workspace default)'}. You can add it back any time.`, confirmLabel: 'Remove', tone: 'danger' }))) return;
    run(`${cap}:${providerId}`, async () => {
      await post({ action: 'deactivate-route', channelId: activeLayer === 'channel' ? slug : null, capability: cap, providerId });
    });
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
          onChange={(v) => { setLayer(v); setMsg(null); }}
          options={[{ value: 'channel', label: 'This channel' }, { value: 'default', label: 'Workspace default' }]}
        />
      ) : null}

      {data.routesError ? (
        <p className="flex items-start gap-1.5 t-12" style={{ color: 'var(--warn-ink)' }}>
          <Info size={13} className="mt-0.5 shrink-0" />
          <span className="min-w-0">Routing store unavailable ({data.routesError}). The built-in order is used until it is back.</span>
        </p>
      ) : null}

      <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
        {caps.map(({ cap }) => {
          const chain = chainFor(cap);
          const locals = localsOf(cap);
          const covering = (data.capabilities.find((c) => c.cap === cap)?.providers || [])
            .map((id) => catalog.get(id))
            .filter((p) => p && !p.local);
          const inChain = new Set(chain.map((r) => r.provider_id));
          const addable = covering.filter((p) => !inChain.has(p.id));
          const resolvedList = slug && data.resolved ? data.resolved[cap] || [] : null;
          const pickId = `route-add-${slug || 'default'}-${cap}`;
          return (
            <section key={cap} className="py-3 min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="t-13 font-semibold text-ink first-letter:uppercase">{CAP_LABEL[cap] || cap}</h3>
                {locals.map((p) => (
                  <Chip key={p.id} tone="plain" className="max-w-full"><LockKeyhole size={10} className="inline mr-1 -mt-px" />{p.label} always available</Chip>
                ))}
              </div>

              {covering.length === 0 ? (
                <p className="t-12 text-faint">No provider for this yet.</p>
              ) : chain.length === 0 ? (
                <p className="t-12 text-muted">
                  {activeLayer === 'channel' ? 'Uses the workspace default.' : 'Uses the built-in order.'}
                </p>
              ) : (
                <ol className="space-y-1.5">
                  {chain.map((r, i) => {
                    const p = catalog.get(r.provider_id);
                    const key = `${cap}:${r.provider_id}`;
                    const name = p?.label || r.provider_id;
                    return (
                      <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--line)] px-3 py-2 min-w-0">
                        <span className="tnum t-11 text-faint w-5 shrink-0">{i + 1}.</span>
                        <span className="t-13 text-ink font-medium truncate min-w-0 flex-1">{name}</span>
                        <span className="t-11 text-faint font-mono shrink-0">prio {r.priority}</span>
                        {isOwner ? (
                          <span className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => reorder(cap, i, -1)}
                              disabled={Boolean(busy) || i === 0}
                              className="icon-btn"
                              title="Move up (runs earlier)"
                              aria-label={`Move ${name} up (runs earlier)`}
                            >
                              <ArrowUp size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => reorder(cap, i, 1)}
                              disabled={Boolean(busy) || i === chain.length - 1}
                              className="icon-btn"
                              title="Move down (runs later)"
                              aria-label={`Move ${name} down (runs later)`}
                            >
                              <ArrowDown size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeProvider(cap, r.provider_id)}
                              disabled={Boolean(busy)}
                              className="icon-btn"
                              title="Remove from the chain"
                              aria-label={`Remove ${name} from the chain`}
                            >
                              {busy === key ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
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
                  <label htmlFor={pickId} className="sr-only">Add a provider to the {CAP_LABEL[cap] || cap} chain</label>
                  <select
                    id={pickId}
                    value={pick[cap] || ''}
                    onChange={(e) => setPick((p) => ({ ...p, [cap]: e.target.value }))}
                    className="input flex-1 min-w-0 basis-56"
                  >
                    <option value="">Add a provider…</option>
                    {addable.map((p) => (
                      <option key={p.id} value={p.id}>{p.label} ({p.envVar})</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => addProvider(cap)}
                    disabled={!pick[cap] || Boolean(busy)}
                    className="btn btn-outline btn-sm"
                    title="Adds it to the end of the chain (runs last)"
                  >
                    {busy.startsWith(`${cap}:`) ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add
                  </button>
                </div>
              ) : null}

              {/* effective resolution preview (channel mount only) */}
              {resolvedList ? (
                <p className="t-11 text-faint font-mono break-words">
                  {resolvedList.length
                    ? `effective: ${resolvedList.map((r) => `${r.providerId}${r.source === 'channel' ? ' (channel)' : ' (default)'}`).join(' → ')} → ${locals.map((p) => p.id).join(' → ') || 'baseline'}`
                    : `effective: catalog baseline order → ${locals.map((p) => p.id).join(' → ') || 'baseline'}`}
                </p>
              ) : null}
            </section>
          );
        })}
      </div>

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
