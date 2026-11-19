'use client';
// Template detail (issue #102 Phase 1, Task 8 — AC-4/AC-5/AC-6 UI halves).
// Usage list (which channels, pinned versions), major-update banner with an
// explicit per-channel re-pin action (POST /api/templates/assign with the new
// pinnedMajor), deprecation notice, and the variation/safety summary the
// pipeline records travel with. Opened from the registry browser via
// ?template=<id> (the registry key — Phase 5 T2f rename of ?family=); house
// pattern reads the query string directly (channels/add).
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import {
  Layers, ArrowLeft, RefreshCw, AlertTriangle, ArrowUpCircle, CheckCircle2,
  XCircle, Loader2, ShieldCheck, Ban, Tv, FileClock,
} from 'lucide-react';
import { PageHeader, Card, CardHead, Chip, PageSkeleton, EmptyState } from '@/components/ui';
import { Button } from '@/components/untitledui/base/buttons/button';

const noopSubscribe = () => () => {};

function majorOf(version) {
  const n = parseInt(String(version || '').split('.')[0], 10);
  return Number.isInteger(n) ? n : null;
}

export default function TemplateDetailPage() {
  // the registry key from ?template= — null during SSR/hydration, then the
  // real query string (no setState-in-effect round trip)
  const search = useSyncExternalStore(noopSubscribe, () => window.location.search, () => null);
  const q = search === null ? null : new URLSearchParams(search);
  const template = q ? (q.get('template') || '') : null;
  const [data, setData] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [labels, setLabels] = useState({});     // channel slug -> display label
  const [busy, setBusy] = useState('');         // channelId currently re-pinning
  const [msg, setMsg] = useState(null);         // { ok, text }

  const fetchView = useCallback(() => {
    if (template === null) return;
    fetch(`/api/templates?template=${encodeURIComponent(template || '')}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `request failed (${r.status})`);
        setData(d);
      })
      .catch((e) => setLoadErr(String(e.message || e)));
  }, [template]);
  useEffect(() => { fetchView(); }, [fetchView]);
  const load = () => { setLoadErr(null); fetchView(); };

  // channel display labels for the usage list (graceful fallback to raw ids)
  useEffect(() => {
    fetch('/api/overview')
      .then((r) => r.json())
      .then((d) => {
        const map = {};
        for (const c of d.channels || []) map[c.slug] = c.label;
        setLabels(map);
      })
      .catch(() => {});
  }, []);

  const repin = async (channelId, newMajor) => {
    setBusy(channelId);
    setMsg(null);
    try {
      const r = await fetch('/api/templates/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, templateId: template, pinnedMajor: newMajor }),
      });
      const d = await r.json();
      if (!r.ok) setMsg({ ok: false, text: d.error === 'incompatible' ? 'Re-pin blocked — the new major fails this channel\'s compatibility check.' : (d.error || `re-pin failed (${r.status})`) });
      else { setMsg({ ok: true, text: `${channelId} re-pinned to major ${d.pinnedMajor} — resolving v${d.resolvedVersion}.` }); load(); }
    } catch (e) {
      setMsg({ ok: false, text: String(e.message || e) });
    } finally {
      setBusy('');
    }
  };

  const t = useMemo(() => (data?.templates || []).find((x) => x.templateId === template) || null, [data, template]);
  // invalid rows are loader-shaped ({ familyId: key, errors }) — the loader
  // keeps the legacy field name for its engine consumers (T1 dual meaning);
  // the value is the registry key.
  const invalidEntry = useMemo(() => (data?.invalid || []).find((x) => x.familyId === template) || null, [data, template]);
  const usage = data?.usage || [];
  const isOwner = data?.role === 'owner';

  if (template === null || (!data && !loadErr)) return <PageSkeleton />;

  if (loadErr) {
    return (
      <div>
        <PageHeader icon={Layers} title="Template detail" sub={template ? `template ${template}` : 'no ?template= in the URL'} />
        <Card className="p-6 flex items-center gap-2.5" style={{ color: 'var(--bad)' }}>
          <Ban size={15} /> Registry unavailable: {loadErr}
        </Card>
      </div>
    );
  }

  // Unknown or invalid template — invalid shows the exact loader errors (owner).
  if (!t) {
    return (
      <div>
        <PageHeader icon={Layers} title="Template detail" sub={`template ${template || '(none)'}`} />
        <Card>
          <CardHead title="Not a registry template" sub="This id has no valid registry metadata, so it is not assignable." icon={AlertTriangle} />
          <div className="px-5 pb-5">
            {invalidEntry ? (
              isOwner ? (
                <div className="inset-tile p-3">
                  <p className="t-12 font-semibold text-ink mb-1.5">Schema v1 errors</p>
                  <ul className="space-y-1">
                    {invalidEntry.errors.map((e, i) => (
                      <li key={i} className="t-11 text-muted font-mono">— {e}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="inset-tile p-3">
                  <p className="t-12 text-muted">
                    {invalidEntry.errors.length} schema v1 error{invalidEntry.errors.length === 1 ? '' : 's'} — owner view for details.
                  </p>
                </div>
              )
            ) : (
              <EmptyState icon={Layers} title={`"${template}" has no registry metadata`} sub="Ids without a registry block stay out of browse and assignment by design." />
            )}
            <Link href="/templates/registry" className="inline-flex items-center gap-1 t-12 text-muted hover:text-ink mt-4">
              <ArrowLeft size={13} /> Back to the registry catalog
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const reg = t.registry || {};
  const curMajor = majorOf(reg.version);
  const majorPending = usage.filter((u) => curMajor !== null && u.pinned_major < curMajor);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/templates/registry" className="inline-flex items-center gap-1 t-12 text-muted hover:text-ink mb-3">
          <ArrowLeft size={13} /> Template Registry
        </Link>
        <PageHeader
          icon={Layers}
          title={t.name}
          sub={`${t.templateId} · renderer ${reg.renderer}`}
        >
          <Chip tone="accent" className="font-mono">v{reg.version}</Chip>
          {!isOwner && data?.role ? <Chip tone="info">read-only — owner only</Chip> : null}
          <Button color="secondary" onClick={load} iconLeading={<RefreshCw size={15} />}>Refresh</Button>
        </PageHeader>
      </div>

      {/* AC-6: deprecation notice */}
      {reg.deprecated ? (
        <Card className="rounded-xl border p-4" style={{ borderColor: 'color-mix(in srgb, var(--warn) 34%, transparent)', background: 'color-mix(in srgb, var(--warn) 8%, transparent)' }}>
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" style={{ color: 'var(--warn-ink)' }} />
            <div>
              <p className="t-12 font-semibold text-ink">Deprecated{reg.deprecated_on ? ` since ${reg.deprecated_on}` : ''}</p>
              <p className="t-11 text-muted mt-0.5">
                New assignments are blocked by the validator. Channels already assigned keep producing and keep resolving within their pinned major — migrate them to a successor style when ready.
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* usage list (AC-4) + major-update re-pin (AC-5) */}
        <Card className="overflow-hidden">
          <CardHead
            title="Used by"
            sub={`${usage.length} channel${usage.length === 1 ? '' : 's'} assigned · pinned majors shown`}
            icon={Tv}
          />
          <div className="px-5 pb-5 space-y-2">
            {usage.length === 0 ? (
              <EmptyState icon={Tv} title="No channels assigned yet" sub="Assign this template from a channel's card on the Channels page." />
            ) : (
              usage.map((u) => {
                const update = curMajor !== null && u.pinned_major < curMajor;
                return (
                  <div key={u.channel_id} className="inset-tile p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="t-12 font-semibold text-ink">{labels[u.channel_id] || u.channel_id}</span>
                      <span className="t-10 text-faint font-mono">{u.channel_id}</span>
                      <Chip tone="plain" className="font-mono">pin v{u.pinned_version} (major {u.pinned_major})</Chip>
                    </div>
                    <p className="t-10 text-faint mt-1 font-mono">assigned {String(u.assigned_at || '').slice(0, 16).replace('T', ' ')} UTC</p>
                    {update ? (
                      <div className="mt-2 rounded-lg border p-2.5 flex flex-wrap items-center gap-2" style={{ borderColor: 'color-mix(in srgb, var(--info) 34%, transparent)', background: 'color-mix(in srgb, var(--info) 8%, transparent)' }}>
                        <ArrowUpCircle size={13} className="shrink-0" style={{ color: 'var(--info-ink)' }} />
                        <span className="t-11 text-ink font-medium">Major update available: v{reg.version} — still pinned to {u.pinned_major}.</span>
                        {isOwner ? (
                          <button
                            onClick={() => repin(u.channel_id, curMajor)}
                            disabled={busy === u.channel_id}
                            className="btn btn-primary btn-sm ml-auto"
                          >
                            {busy === u.channel_id ? <Loader2 size={11} className="animate-spin" /> : <ArrowUpCircle size={11} />} Re-pin to v{curMajor}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
            {majorPending.length > 0 && curMajor !== null ? (
              <p className="t-11 text-faint mt-1">
                {majorPending.length} channel{majorPending.length === 1 ? '' : 's'} not yet on the latest major — majors never auto-adopt.
              </p>
            ) : null}
            {msg ? (
              <div className="rounded-xl border p-2.5 t-12 flex items-start gap-1.5" style={{ borderColor: `color-mix(in srgb, var(${msg.ok ? '--ok' : '--bad'}) 34%, transparent)`, background: `color-mix(in srgb, var(${msg.ok ? '--ok' : '--bad'}) 8%, transparent)` }}>
                {msg.ok ? <CheckCircle2 size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--ok-ink)' }} /> : <XCircle size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--bad-ink)' }} />}
                <span style={{ color: `var(${msg.ok ? '--ok-ink' : '--bad-ink'})` }}>{msg.text}</span>
              </div>
            ) : null}
            {data?.error ? (
              <p className="t-11 text-faint mt-1">Usage list could not be read from the database: {data.error}</p>
            ) : null}
          </div>
        </Card>

        {/* registry metadata summary */}
        <Card className="overflow-hidden">
          <CardHead title="Registry block" sub="Schema v1 — travels with every generation record" icon={ShieldCheck} />
          <div className="px-5 pb-5 space-y-3">
            <div className="inset-tile p-3 space-y-1.5">
              <div className="flex items-center gap-2 t-11 text-muted">
                <span className="overline w-24 shrink-0">Template id</span>
                <span className="font-mono truncate">{t.templateId}</span>
              </div>
              <div className="flex items-center gap-2 t-11 text-muted">
                <span className="overline w-24 shrink-0">Family</span>
                <span className="font-mono truncate">{t.family}</span>
              </div>
              <div className="flex items-center gap-2 t-11 text-muted">
                <span className="overline w-24 shrink-0">Niches</span>
                <span className="flex flex-wrap gap-1">{(reg.niches || []).map((n) => <Chip key={n} tone="plain">{n}</Chip>)}</span>
              </div>
              <div className="flex items-center gap-2 t-11 text-muted">
                <span className="overline w-24 shrink-0">Formats</span>
                <span className="font-mono">{(reg.formats || []).join(' · ')}</span>
              </div>
              <div className="flex items-center gap-2 t-11 text-muted">
                <span className="overline w-24 shrink-0">Renderer</span>
                <span className="font-mono">{reg.renderer}</span>
              </div>
              <div className="flex items-center gap-2 t-11 text-muted">
                <span className="overline w-24 shrink-0">Capabilities</span>
                <span className="flex flex-wrap gap-1">
                  {(reg.required_capabilities || []).length
                    ? (reg.required_capabilities || []).map((c) => <Chip key={c} tone="info">{c}</Chip>)
                    : <span className="text-faint">none declared</span>}
                </span>
              </div>
            </div>

            {/* variation rules (AC-7 display half) */}
            <div>
              <p className="overline mb-1.5">Variation rules ({(reg.variation_rules || []).length})</p>
              <div className="inset-tile p-3">
                <ul className="space-y-1">
                  {(reg.variation_rules || []).map((r, i) => (
                    <li key={i} className="t-11 text-muted">— {r}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* safety block (AC-7 display half) */}
            <div>
              <p className="overline mb-1.5">Safety</p>
              <div className="inset-tile p-3 flex flex-wrap items-center gap-2 t-11 text-muted">
                <span className="flex items-center gap-1">
                  {reg.safety?.required_sources
                    ? <><CheckCircle2 size={12} style={{ color: 'var(--ok-ink)' }} /> sources required</>
                    : <><XCircle size={12} className="text-faint" /> sources not required</>}
                </span>
                {(reg.safety?.review_required || []).length ? (
                  <span className="flex items-center gap-1">
                    review before publish: {(reg.safety.review_required || []).map((r) => <Chip key={r} tone="warn">{r}</Chip>)}
                  </span>
                ) : (
                  <span className="text-faint">no pre-publish review</span>
                )}
              </div>
            </div>

            {/* changelog */}
            <div>
              <p className="overline mb-1.5 flex items-center gap-1"><FileClock size={11} /> Changelog</p>
              <div className="inset-tile p-3">
                <ul className="space-y-1.5">
                  {(reg.changelog || []).map((e, i) => (
                    <li key={i} className="t-11 flex gap-2">
                      <span className="font-mono t-10 text-faint shrink-0">{e.date}</span>
                      <span className="font-mono t-10 shrink-0" style={{ color: 'var(--accent)' }}>v{e.version}</span>
                      <span className="text-muted">{e.note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
