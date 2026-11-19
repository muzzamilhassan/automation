'use client';
// Per-channel template assignment panel (issue #102 Phase 1, Task 8).
// Talks to the Task 7 API: GET /api/templates?channel=<slug> for the view,
// POST/DELETE /api/templates/assign for writes. Owner gets assign/unassign/
// re-pin controls; staff sees the same view read-only (AC-9). The picker
// orders templates niche-first (AC-10) using the channelConfig the API
// returns — the exact niches the compatibility validator compares, so
// ordering can never drift from validation. Blocking reasons (422) render
// as friendly fix-naming messages (AC-3).
// Phase 5 T2f (D1/D19 identity split): everything this panel sends and shows
// for a template keys on templateId — the registry key. Assignment rows are
// DB rows whose family_id column stores that same key (dual meaning
// documented in template-registry-db.js).
//
// Round 2: rendered inside a Drawer via ChannelDrawers; `frame(body, footer)`
// puts "Assign & pin" in the drawer's sticky footer.
import { useEffect, useMemo, useState } from 'react';
import { Layers, AlertTriangle, CheckCircle2, XCircle, Loader2, Trash2, ArrowUpCircle, Info, RefreshCw, ExternalLink } from 'lucide-react';
import { Button } from '@/components/untitledui/base/buttons/button';
import { Chip } from '@/components/ui';
import { useConfirm } from '@/components/ConfirmDialog';

const CAP_LABEL = {
  'script-gen': 'script generation (LLM)',
  'tts': 'text-to-speech',
  'captions': 'captions',
  'image-gen': 'image generation',
};

// Stable validator codes -> human sentences that name the fix (spec D4).
export function friendlyReason({ code, detail }) {
  if (typeof code === 'string' && code.startsWith('missing_capability:')) {
    const cap = code.slice('missing_capability:'.length);
    return `Missing capability: no ${CAP_LABEL[cap] || cap} provider is configured for this channel. Fix: add a key under Manage → API keys on this channel's card.`;
  }
  switch (code) {
    case 'format_mismatch':
      return `Format mismatch: the template's formats don't match what this channel produces. Fix: give the channel a long-form slot in Production scheduling, or pick a Shorts template.`;
    case 'niche_mismatch':
      return `Niche mismatch: this template targets niches the channel isn't tagged with. Fix: set a matching sub-niche in the channel's settings, or pick a template for this niche.`;
    case 'renderer_unavailable':
      return `Renderer unavailable: ${detail || 'the template needs a renderer this deployment does not ship'}.`;
    case 'deprecated_template':
      return `This template is deprecated — ${detail || 'new assignments are blocked'}. Pick a newer style.`;
    case 'invalid_meta':
      return `Template metadata failed validation — ${detail || 'repair the registry data in git and re-sync'}.`;
    default:
      return detail || code || 'unknown incompatibility';
  }
}

function majorOf(version) {
  const n = parseInt(String(version || '').split('.')[0], 10);
  return Number.isInteger(n) ? n : null;
}

// Distinct pinned-major options for a template (from its changelog versions).
function availableMajors(t) {
  const majors = [...new Set((t?.registry?.changelog || [])
    .map((e) => majorOf(e.version))
    .filter((m) => m !== null))];
  if (!majors.length) majors.push(majorOf(t?.registry?.version) || 0);
  return majors.sort((a, b) => b - a);
}

// Highest version within a pinned major (AC-5: minor/patch auto-adopt).
function highestInMajor(t, major) {
  const versions = (t?.registry?.changelog || [])
    .map((e) => e.version)
    .filter((v) => majorOf(v) === major)
    .sort((a, b) => {
      const [a1, a2, a3] = a.split('.').map(Number);
      const [b1, b2, b3] = b.split('.').map(Number);
      return b1 - a1 || b2 - a2 || b3 - a3;
    });
  return versions[0] || null;
}

export default function TemplateAssignPanel({ slug, frame }) {
  const confirm = useConfirm();
  const [data, setData] = useState(null);       // GET /api/templates?channel=
  const [loadErr, setLoadErr] = useState(null);
  const [templateId, setTemplateId] = useState('');
  const [pinnedMajor, setPinnedMajor] = useState('');
  const [busy, setBusy] = useState('');         // templateId currently writing
  const [msg, setMsg] = useState(null);         // { ok, text, reasons? }

  // state is only set when the request settles (never synchronously in the effect)
  const load = () => {
    fetch(`/api/templates?channel=${encodeURIComponent(slug)}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `request failed (${r.status})`);
        setLoadErr(null);
        setData(d);
      })
      .catch((e) => setLoadErr(String(e.message || e)));
  };
  useEffect(() => { load(); }, [slug]);

  const templates = data?.templates || [];
  const assignments = data?.assignments || [];
  const channelNiches = data?.channelConfig?.niches || [];
  const channelFormats = data?.channelConfig?.formats || [];
  const isOwner = data?.role === 'owner';
  const byTemplate = useMemo(() => new Map(templates.map((t) => [t.templateId, t])), [templates]);

  // Registry templates may SHARE one visual family (v2: many templates -> one
  // family, e.g. myth-vs-money and red-flags-explained both render
  // beat-synced-type) — the family NAME alone is then ambiguous in the
  // picker. Count the shared names; those options get their registry key
  // appended so the owner can tell them apart.
  const sharedNames = useMemo(() => {
    const m = new Map();
    for (const t of templates) m.set(t.name, (m.get(t.name) || 0) + 1);
    return m;
  }, [templates]);

  // AC-10: templates whose niches overlap the channel's niches first.
  const orderedTemplates = useMemo(() => {
    const hit = (t) => (t.registry?.niches || []).some((n) => channelNiches.includes(n));
    return [...templates].sort((a, b) => Number(hit(b)) - Number(hit(a)) || a.name.localeCompare(b.name));
  }, [templates, channelNiches]);

  const pickTemplate = (id) => {
    setTemplateId(id);
    setPinnedMajor('');
    setMsg(null);
    const t = byTemplate.get(id);
    if (t) setPinnedMajor(String(majorOf(t.registry.version)));
  };

  const assign = async () => {
    if (!templateId || pinnedMajor === '') return;
    setBusy(templateId);
    setMsg(null);
    try {
      const r = await fetch('/api/templates/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: slug, templateId, pinnedMajor: Number(pinnedMajor) }),
      });
      const d = await r.json();
      if (r.status === 422 && Array.isArray(d.reasons)) {
        setMsg({ ok: false, text: 'Not compatible — assignment blocked:', reasons: d.reasons });
      } else if (!r.ok) {
        setMsg({ ok: false, text: d.error || `assignment failed (${r.status})` });
      } else {
        setMsg({ ok: true, text: `Assigned — pinned major ${d.pinnedMajor}, resolving v${d.resolvedVersion}.` });
        setTemplateId('');
        setPinnedMajor('');
        load();
      }
    } catch (e) {
      setMsg({ ok: false, text: String(e.message || e) });
    } finally {
      setBusy('');
    }
  };

  const unassign = async (tid) => {
    // admin-panel review #8: confirm before changing what the channel produces
    if (!(await confirm({ title: `Unassign "${tid}"?`, body: `${slug} falls back to its normal engine path. You can assign a template again any time.`, confirmLabel: 'Unassign', tone: 'danger' }))) return;
    setBusy(tid);
    setMsg(null);
    try {
      const r = await fetch('/api/templates/assign', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: slug, templateId: tid }),
      });
      const d = await r.json();
      if (!r.ok) setMsg({ ok: false, text: d.error === 'no_active_assignment' ? 'No active assignment for that template.' : (d.error || `unassign failed (${r.status})`) });
      else { setMsg({ ok: true, text: 'Unassigned — the channel falls back to its normal engine path.' }); load(); }
    } catch (e) {
      setMsg({ ok: false, text: String(e.message || e) });
    } finally {
      setBusy('');
    }
  };

  // AC-5: explicit consent per channel — re-pin to the new major.
  const repin = async (tid, newMajor) => {
    setBusy(tid);
    setMsg(null);
    try {
      const r = await fetch('/api/templates/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: slug, templateId: tid, pinnedMajor: newMajor }),
      });
      const d = await r.json();
      if (!r.ok) setMsg({ ok: false, text: d.error === 'incompatible' ? 'Re-pin blocked — see compatibility reasons below.' : (d.error || `re-pin failed (${r.status})`), reasons: d.reasons });
      else { setMsg({ ok: true, text: `Re-pinned to major ${d.pinnedMajor} — resolving v${d.resolvedVersion}.` }); load(); }
    } catch (e) {
      setMsg({ ok: false, text: String(e.message || e) });
    } finally {
      setBusy('');
    }
  };

  const wrap = (body, footer) => {
    if (frame) return frame(body, footer);
    return (
      <div className="inset-tile p-4 mt-1 space-y-4">
        <div className="flex items-center gap-2 overline"><Layers size={12} /> Template registry</div>
        {body}
        {footer ? <div className="flex flex-wrap items-center justify-end gap-2">{footer}</div> : null}
      </div>
    );
  };

  if (loadErr) {
    return wrap(
      <div role="alert" className="flex flex-wrap items-center gap-2 t-13" style={{ color: 'var(--bad-ink)' }}>
        <XCircle size={14} className="shrink-0" />
        <span className="min-w-0 flex-1">Template registry unavailable: {loadErr}</span>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => { setLoadErr(null); load(); }}><RefreshCw size={13} /> Retry</button>
      </div>
    );
  }
  if (!data) {
    return wrap(
      <div className="flex items-center gap-2 text-muted t-13">
        <Loader2 size={14} className="animate-spin" /> Loading template assignment…
      </div>
    );
  }

  const picked = templateId ? byTemplate.get(templateId) : null;

  const body = (
    <div className="space-y-6 min-w-0">
      {!isOwner ? (
        <p className="flex items-start gap-1.5 t-12 text-muted">
          <Info size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--info-ink)' }} />
          <span>Read-only — only the owner can assign or change templates.</span>
        </p>
      ) : null}

      {/* current assignments */}
      <section className="space-y-2 min-w-0">
        <h3 className="t-13 font-semibold text-ink">Assigned template</h3>
        {assignments.length === 0 ? (
          <p className="t-12 text-muted">
            None — this channel runs its normal engine path.{isOwner ? ' Pick one below to pin a version.' : ''}
          </p>
        ) : (
          <ul className="space-y-2">
            {assignments.map((a) => {
              // DB row shape: the family_id column stores the registry key (T1
              // dual meaning) — a.family_id IS the template's templateId.
              const t = byTemplate.get(a.family_id);
              const curMajor = t ? majorOf(t.registry.version) : null;
              const majorUpdate = curMajor !== null && curMajor > a.pinned_major;
              const autoVersion = t ? highestInMajor(t, a.pinned_major) : null;
              const autoAdopt = autoVersion && autoVersion !== a.pinned_version;
              return (
                <li key={`${a.family_id}`} className="rounded-lg border border-[var(--line)] p-3 min-w-0">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="t-13 font-semibold text-ink break-words">{t ? t.name : a.family_id}</p>
                      <p className="t-11 text-faint mt-0.5 font-mono break-all">
                        v{a.pinned_version} · major {a.pinned_major} · by {a.assigned_by || '—'} · {String(a.assigned_at || '').slice(0, 16).replace('T', ' ')} UTC
                      </p>
                    </div>
                    {t?.registry.deprecated ? <Chip tone="warn">deprecated</Chip> : null}
                    {isOwner ? (
                      <button
                        type="button"
                        onClick={() => unassign(a.family_id)}
                        disabled={busy === a.family_id}
                        className="btn btn-danger btn-sm"
                      >
                        {busy === a.family_id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Unassign
                      </button>
                    ) : null}
                  </div>

                  {/* AC-6: deprecation notice — existing production continues */}
                  {t?.registry.deprecated ? (
                    <p className="flex items-start gap-1.5 mt-2 t-12" style={{ color: 'var(--warn-ink)' }}>
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      <span className="min-w-0">Deprecated{t.registry.deprecated_on ? ` since ${t.registry.deprecated_on}` : ''} — existing production keeps running; move to a newer style when ready.</span>
                    </p>
                  ) : null}

                  {/* AC-5: major updates wait for explicit consent */}
                  {majorUpdate ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md p-2.5" style={{ background: 'color-mix(in srgb, var(--info) 10%, transparent)' }}>
                      <ArrowUpCircle size={14} className="shrink-0" style={{ color: 'var(--info-ink)' }} />
                      <span className="t-12 text-ink min-w-0 flex-1">
                        v{curMajor} is out — this channel stays on major {a.pinned_major} until you adopt it.
                      </span>
                      {isOwner ? (
                        <button
                          type="button"
                          onClick={() => repin(a.family_id, curMajor)}
                          disabled={busy === a.family_id}
                          className="btn btn-outline btn-sm"
                        >
                          {busy === a.family_id ? <Loader2 size={12} className="animate-spin" /> : <ArrowUpCircle size={12} />} Re-pin to v{curMajor}
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {/* AC-5: minor/patch auto-adopt note */}
                  {autoAdopt ? (
                    <p className="flex items-start gap-1.5 mt-2 t-12 text-muted">
                      <Info size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />
                      <span className="min-w-0">Minor and patch updates adopt automatically — the next video uses v{autoVersion}.</span>
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* assign flow (owner only) */}
      {isOwner ? (
        <section className="space-y-3 min-w-0">
          <h3 className="t-13 font-semibold text-ink">{assignments.length ? 'Assign a different template' : 'Assign a template'}</h3>
          {channelNiches.length ? (
            <div className="min-w-0">
              <p className="t-11 text-faint mb-1.5">This channel&apos;s niches (matching templates are starred ★ and listed first)</p>
              <div className="flex flex-wrap gap-1.5">
                {channelNiches.map((n) => (
                  <Chip key={n} tone="plain" className="max-w-full whitespace-normal break-words">{n}</Chip>
                ))}
              </div>
            </div>
          ) : null}
          <div className="min-w-0">
            <label htmlFor={`tpl-pick-${slug}`} className="block t-12 font-medium text-muted mb-1">Template</label>
            <select
              id={`tpl-pick-${slug}`}
              value={templateId}
              onChange={(e) => pickTemplate(e.target.value)}
              className="input w-full"
            >
              <option value="">Pick a template…</option>
              {orderedTemplates.map((t) => {
                const nicheHit = (t.registry?.niches || []).some((n) => channelNiches.includes(n));
                const fmtMiss = !(t.registry?.formats || []).some((f) => channelFormats.includes(f));
                return (
                  <option key={t.templateId} value={t.templateId}>
                    {nicheHit ? '★ ' : ''}{t.name}{sharedNames.get(t.name) > 1 ? ` — ${t.templateId}` : ''} · v{t.registry.version}{t.registry.deprecated ? ' (deprecated)' : ''}{fmtMiss ? ' — format mismatch' : ''}
                  </option>
                );
              })}
            </select>
          </div>
          {picked ? (
            <div className="min-w-0">
              <label htmlFor={`tpl-major-${slug}`} className="block t-12 font-medium text-muted mb-1">Pinned major version</label>
              <select
                id={`tpl-major-${slug}`}
                value={pinnedMajor}
                onChange={(e) => setPinnedMajor(e.target.value)}
                className="input w-full sm:w-48"
              >
                {availableMajors(picked).map((m) => (
                  <option key={m} value={m}>{m} {m === majorOf(picked.registry.version) ? '(current)' : ''}</option>
                ))}
              </select>
              <p className="t-11 text-faint mt-1">Minor and patch updates inside this major adopt automatically.</p>
              <a
                href={`/templates/registry/detail?template=${encodeURIComponent(picked.templateId)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 t-12 text-muted hover:text-ink mt-2"
              >
                See this template&apos;s details <ExternalLink size={11} />
              </a>
              {picked.registry.deprecated ? (
                <p className="t-12 flex items-center gap-1 mt-1.5" style={{ color: 'var(--warn-ink)' }}>
                  <AlertTriangle size={13} /> Deprecated — the validator blocks new assignments.
                </p>
              ) : null}
            </div>
          ) : null}
          {!templates.length ? (
            <p className="t-12 text-muted">No registry templates exist yet, so there is nothing to assign.</p>
          ) : null}
        </section>
      ) : null}

      {/* result / validation messages */}
      {msg ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border p-3 t-12"
          style={{
            borderColor: `color-mix(in srgb, ${msg.ok ? 'var(--ok)' : 'var(--bad)'} 35%, transparent)`,
            background: `color-mix(in srgb, ${msg.ok ? 'var(--ok)' : 'var(--bad)'} 8%, transparent)`,
            color: msg.ok ? 'var(--ok-ink)' : 'var(--bad-ink)',
          }}
        >
          <div className="flex items-start gap-1.5">
            {msg.ok ? <CheckCircle2 size={13} className="mt-0.5 shrink-0" /> : <XCircle size={13} className="mt-0.5 shrink-0" />}
            <span className="min-w-0">{msg.text}</span>
          </div>
          {Array.isArray(msg.reasons) && msg.reasons.length ? (
            <ul className="mt-1.5 space-y-1 pl-5 list-disc">
              {msg.reasons.map((r, i) => (
                <li key={i} className="break-words">
                  <span className="font-mono t-11 mr-1 opacity-80">{r.code}</span> {friendlyReason(r)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const assigning = !!busy && busy === templateId;
  const footer = isOwner && templates.length ? (
    <>
      {templateId ? (
        <button type="button" className="btn btn-outline" onClick={() => { setTemplateId(''); setPinnedMajor(''); setMsg(null); }}>
          Clear
        </button>
      ) : null}
      <Button color="primary" onClick={assign} isDisabled={!templateId || pinnedMajor === '' || assigning}>
        {assigning ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Assign &amp; pin
      </Button>
    </>
  ) : null;

  return wrap(body, footer);
}
