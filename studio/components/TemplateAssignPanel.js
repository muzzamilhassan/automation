'use client';
// Per-channel template assignment panel (issue #102 Phase 1, Task 8).
// Talks to the Task 7 API: GET /api/templates for the cards, GET
// /api/templates?channel=<slug> for this channel's assignment, POST/DELETE
// /api/templates/assign for writes. Owner gets assign/unassign/re-pin
// controls; staff sees the same view read-only (AC-9). The picker orders
// templates niche-first (AC-10) using the channelConfig the API returns — the
// exact niches the compatibility validator compares, so ordering can never
// drift from validation. Blocking reasons (422) render as friendly
// fix-naming messages (AC-3).
// Phase 5 T2f (D1/D19 identity split): everything this panel sends and shows
// for a template keys on templateId — the registry key. Assignment rows are
// DB rows whose family_id column stores that same key (dual meaning
// documented in template-registry-db.js).
//
// Round 2: rendered inside a Drawer via ChannelDrawers; `frame(body, footer,
// { dirty })` puts the selection + "Assign & pin" in the drawer's sticky
// footer and tells the drawer when a pick is unsaved (B4 dirty guard).
//
// Feedback r1 G: every template shows as a demo card (poster + MP4 on
// hover/tap — the SAME TemplatePreviewMedia the /templates gallery uses, fed
// by /api/template-previews); the assigned one is marked on its card. The
// "Story shape" setting saves the channel's kit.hasChapters (true = Chapters,
// false = Full story, null = template default) through /api/channels/profile;
// lib/doc-storybook.mjs docPresentation hands it to the documentary lane.
// 2026-11-21 readiness: it also saves kit.storyShape ('template' | 'full' |
// 'chapters') so "Template default" is a real choice; an untouched channel
// shows nothing picked. Assign/unassign answers may carry a plain warning
// (the engine copy of the template could not be updated) — shown as-is.
//
// Live-fix wave B1:
//  - T3-04: the cards, the assignment, the demos and the story shape load
//    independently, each with a time limit and its own "Couldn't load —
//    Retry" — never one endless spinner. The demo list starts only once the
//    cards are on screen.
//  - P7/T3-13: names come from the ONE naming rule (t.name); the Assigned box
//    shows the exact template and the version the next video uses.
//  - T3-14: the selected template and its version sit in the sticky footer.
//  - T3-20: Story shape is a radio-group setting that confirms before saving.
import { useEffect, useMemo, useState } from 'react';
import { Layers, AlertTriangle, CheckCircle2, XCircle, Loader2, Trash2, ArrowUpCircle, Info, RefreshCw, ExternalLink, BookOpen, Star } from 'lucide-react';
import { Button } from '@/components/untitledui/base/buttons/button';
import { Chip } from '@/components/ui';
import { useConfirm } from '@/components/ConfirmDialog';
import TemplatePreviewMedia from '@/components/TemplatePreviewMedia';
import { previewFor, ratiosForFormats, majorOf, availableMajors, assignmentSummary, pickBlockers } from '@/lib/templates-gallery.mjs';
import { fetchJsonWithTimeout } from '@/lib/template-media.mjs';
import { chapterValueFor, storyModeOf, storyShapeFor } from '@/lib/channel-kit-ui.mjs';

// a request slower than this ends in "Couldn't load — Retry" (T3-04)
const LOAD_TIMEOUT_MS = 15000;

const CHAPTER_OPTIONS = [
  { value: 'default', label: 'Template default' },
  { value: 'story', label: 'Full story' },
  { value: 'chapters', label: 'Chapters' },
];
const CHAPTER_HINT = {
  default: 'Follows the template',
  story: 'One continuous story',
  chapters: 'Parts with title cards',
};
const CHAPTER_NOTE = {
  unset: 'Not picked yet — pick one so this channel can publish.',
  default: 'Long documentaries follow the template.',
  story: 'Long documentaries play as one continuous story, with no chapter title cards.',
  chapters: 'Long documentaries are split into chapters, each with a title card.',
};

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

export default function TemplateAssignPanel({ slug, frame }) {
  const confirm = useConfirm();
  // the card list (GET /api/templates — no database, fast)
  const [tpl, setTpl] = useState({ status: 'loading', templates: [], role: null, error: null });
  // this channel's assignment + niches/formats (GET /api/templates?channel=)
  const [asg, setAsg] = useState({ status: 'loading', assignments: [], channelConfig: null, error: null });
  const [templateId, setTemplateId] = useState('');
  const [pinnedMajor, setPinnedMajor] = useState('');
  const [busy, setBusy] = useState('');         // templateId currently writing
  const [msg, setMsg] = useState(null);         // { ok, text, reasons? }
  // CI-rendered demos (poster + MP4) — a failure keeps honest placeholders
  const [samples, setSamples] = useState({ status: 'loading', samples: {} });
  // the channel's Full story / Chapters choice (kit.hasChapters)
  const [chapters, setChapters] = useState({ status: 'loading', mode: 'unset', label: '' });
  const [chapterMsg, setChapterMsg] = useState(null); // { ok, text }

  // state is only set when a request settles (never synchronously in an effect)
  const loadTemplates = () => {
    fetchJsonWithTimeout('/api/templates', { timeoutMs: LOAD_TIMEOUT_MS })
      .then((d) => setTpl({ status: 'ready', templates: d.templates || [], role: d.role || null, error: null }))
      .catch((e) => setTpl({ status: 'error', templates: [], role: null, error: String(e.message || e) }));
  };
  const loadAssignments = () => {
    fetchJsonWithTimeout(`/api/templates?channel=${encodeURIComponent(slug)}`, { timeoutMs: LOAD_TIMEOUT_MS })
      .then((d) => setAsg({ status: 'ready', assignments: d.assignments || [], channelConfig: d.channelConfig || null, error: null }))
      .catch((e) => setAsg({ status: 'error', assignments: [], channelConfig: null, error: String(e.message || e) }));
  };
  const loadSamples = () => {
    fetchJsonWithTimeout('/api/template-previews', { timeoutMs: LOAD_TIMEOUT_MS })
      .then((d) => {
        if (!d.samples) throw new Error('no samples');
        setSamples({ status: 'ready', samples: d.samples });
      })
      .catch(() => setSamples({ status: 'error', samples: {} }));
  };
  const loadChapters = () => {
    fetchJsonWithTimeout(`/api/channels/profile?slug=${encodeURIComponent(slug)}`, { timeoutMs: LOAD_TIMEOUT_MS })
      .then((d) => {
        if (!d.channel) throw new Error('no channel');
        setChapters({ status: 'ready', mode: storyModeOf(d.channel.kit), label: d.channel.label || '' });
      })
      .catch(() => setChapters({ status: 'error', mode: 'unset', label: '' }));
  };
  // the loaders only set state when a request settles; they run once per channel
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadTemplates(); loadAssignments(); loadChapters(); }, [slug]);
  // the demo list waits for the cards, so it never competes with them
  useEffect(() => { if (tpl.status === 'ready') loadSamples(); }, [tpl.status]);

  const templates = tpl.templates;
  const assignments = asg.assignments;
  const channelNiches = useMemo(() => asg.channelConfig?.niches || [], [asg.channelConfig]);
  const isOwner = tpl.role === 'owner';
  const channelLabel = chapters.label || slug;
  const byTemplate = useMemo(() => new Map(templates.map((t) => [t.templateId, t])), [templates]);
  const assignedIds = new Set(assignments.map((a) => a.family_id)); // DB family_id = registry key

  // AC-10: templates whose niches overlap the channel's niches first.
  const orderedTemplates = useMemo(() => {
    const hit = (t) => (t.registry?.niches || []).some((n) => channelNiches.includes(n));
    // retired (deprecated) templates can't be picked — leave them out, except
    // the one this channel still runs (its card keeps the deprecated notice)
    const inUse = new Set(assignments.map((a) => a.family_id));
    return templates
      .filter((t) => !t.registry?.deprecated || inUse.has(t.templateId))
      .sort((a, b) => Number(hit(b)) - Number(hit(a)) || a.name.localeCompare(b.name));
  }, [templates, channelNiches, assignments]);

  const pickTemplate = (id) => {
    setTemplateId(id);
    setPinnedMajor('');
    setMsg(null);
    const t = byTemplate.get(id);
    if (t) setPinnedMajor(String(majorOf(t.registry.version)));
  };

  const nameOf = (tid) => assignmentSummary({ family_id: tid }, byTemplate.get(tid) || null).name;

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
        setMsg({ ok: true, text: `Assigned ${nameOf(templateId)}. The next long video uses v${d.resolvedVersion}.${d.warning ? ` ${d.warning}` : ''}` });
        setTemplateId('');
        setPinnedMajor('');
        loadAssignments();
      }
    } catch (e) {
      setMsg({ ok: false, text: String(e.message || e) });
    } finally {
      setBusy('');
    }
  };

  const unassign = async (tid) => {
    // admin-panel review #8: confirm before changing what the channel produces
    if (!(await confirm({ title: `Unassign ${nameOf(tid)}?`, body: `${channelLabel} stops publishing until you pick a template again.`, confirmLabel: 'Unassign', tone: 'danger' }))) return;
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
      else { setMsg({ ok: true, text: `Unassigned. This channel can't publish until a template is picked again.${d.warning ? ` ${d.warning}` : ''}` }); loadAssignments(); }
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
      else { setMsg({ ok: true, text: `Switched to version ${d.pinnedMajor}. The next long video uses v${d.resolvedVersion}.` }); loadAssignments(); }
    } catch (e) {
      setMsg({ ok: false, text: String(e.message || e) });
    } finally {
      setBusy('');
    }
  };

  // T3-20: a setting, not a tab — owner only, confirmed, then "Saved".
  const saveChapters = async (mode) => {
    if (!isOwner || chapters.status !== 'ready' || mode === chapters.mode) return;
    const label = CHAPTER_OPTIONS.find((o) => o.value === mode)?.label || mode;
    const ok = await confirm({
      title: `Change story shape for ${channelLabel} to ${label}?`,
      body: 'Next long video uses it.',
      confirmLabel: 'Change',
    });
    if (!ok) return;
    const prev = chapters.mode;
    setChapters((c) => ({ ...c, status: 'saving', mode }));
    setChapterMsg(null);
    try {
      const r = await fetch('/api/channels/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, kit: { hasChapters: chapterValueFor(mode), storyShape: storyShapeFor(mode) } }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `save failed (${r.status})`);
      setChapters((c) => ({ ...c, status: 'ready', mode }));
      setChapterMsg({ ok: true, text: 'Saved. The next long video uses this.' });
    } catch (e) {
      setChapters((c) => ({ ...c, status: 'ready', mode: prev }));
      setChapterMsg({ ok: false, text: `Not saved: ${String(e.message || e)}` });
    }
  };

  // B4 drawer contract: `dirty` = a picked template that isn't saved yet.
  const wrap = (body, footer, dirty = false) => {
    if (frame) return frame(body, footer, { dirty });
    return (
      <div className="inset-tile p-4 mt-1 space-y-4">
        <div className="flex items-center gap-2 overline"><Layers size={12} /> Template registry</div>
        {body}
        {footer ? <div className="flex flex-wrap items-center justify-end gap-2">{footer}</div> : null}
      </div>
    );
  };

  const picked = templateId ? byTemplate.get(templateId) : null;
  const dirty = Boolean(templateId) && !assignedIds.has(templateId);

  const body = (
    <div className="space-y-6 min-w-0">
      {tpl.status === 'ready' && !isOwner ? (
        <p className="flex items-start gap-1.5 t-12 text-muted">
          <Info size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--info-ink)' }} />
          <span>Read-only — only the owner can assign or change templates.</span>
        </p>
      ) : null}

      {/* feedback r1 G + T3-20: Full story / Chapters for this channel — a setting */}
      <section className="space-y-2 min-w-0">
        <h3 id={`story-shape-${slug}`} className="flex items-center gap-1.5 t-13 font-semibold text-ink"><BookOpen size={13} /> Story shape</h3>
        {chapters.status === 'loading' ? (
          <p className="flex items-center gap-1.5 t-12 text-muted"><Loader2 size={12} className="animate-spin" /> Loading…</p>
        ) : chapters.status === 'error' ? (
          <div role="alert" className="flex flex-wrap items-center gap-2 t-12" style={{ color: 'var(--warn-ink)' }}>
            <span className="min-w-0 flex-1">The story setting can&apos;t load right now.</span>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => { setChapters({ status: 'loading', mode: 'unset', label: '' }); loadChapters(); }}><RefreshCw size={13} /> Retry</button>
          </div>
        ) : (
          <>
            {isOwner ? (
              <div role="radiogroup" aria-labelledby={`story-shape-${slug}`} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {CHAPTER_OPTIONS.map((o) => {
                  const on = chapters.mode === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      data-kit="tile"
                      disabled={chapters.status === 'saving'}
                      onClick={() => saveChapters(o.value)}
                      className="flex items-start gap-2 rounded-lg border px-3 py-2 text-left min-w-0 disabled:opacity-60"
                      style={on ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : { borderColor: 'var(--line)' }}
                    >
                      <span aria-hidden="true" className="mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0" style={{ borderColor: on ? 'var(--accent)' : 'var(--faint)' }}>
                        {on ? <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }} /> : null}
                      </span>
                      <span className="min-w-0">
                        <span className="block t-13 font-medium text-ink">{o.label}</span>
                        <span className="block t-11 text-muted">{CHAPTER_HINT[o.value]}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="t-12 text-ink">{CHAPTER_OPTIONS.find((o) => o.value === chapters.mode)?.label || 'Not picked yet'}</p>
            )}
            <p className="t-12 text-muted">
              {chapters.status === 'saving' ? <><Loader2 size={12} className="inline animate-spin mr-1" />Saving… </> : null}
              {CHAPTER_NOTE[chapters.mode]}
            </p>
            {chapterMsg ? (
              <p role="status" aria-live="polite" className="flex items-center gap-1.5 t-12" style={{ color: chapterMsg.ok ? 'var(--ok-ink)' : 'var(--bad-ink)' }}>
                {chapterMsg.ok ? <CheckCircle2 size={13} className="shrink-0" /> : <XCircle size={13} className="shrink-0" />}
                {chapterMsg.text}
              </p>
            ) : null}
          </>
        )}
      </section>

      {/* current assignment — loads on its own (T3-04) */}
      <section className="space-y-2 min-w-0">
        <h3 className="t-13 font-semibold text-ink">Assigned template</h3>
        {asg.status === 'loading' ? (
          <p className="flex items-center gap-1.5 t-12 text-muted"><Loader2 size={12} className="animate-spin" /> Checking this channel&apos;s template…</p>
        ) : asg.status === 'error' ? (
          <div role="alert" className="flex flex-wrap items-center gap-2 t-12" style={{ color: 'var(--warn-ink)' }}>
            <span className="min-w-0 flex-1">Couldn&apos;t load this channel&apos;s template. {asg.error}</span>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => { setAsg((a) => ({ ...a, status: 'loading', error: null })); loadAssignments(); }}><RefreshCw size={13} /> Retry</button>
          </div>
        ) : assignments.length === 0 ? (
          <p className="t-12 text-muted">
            None — this channel runs its normal engine path.{isOwner ? ' Pick one below to pin a version.' : ''}
          </p>
        ) : (
          <ul className="space-y-2">
            {assignments.map((a) => {
              // DB row shape: the family_id column stores the registry key (T1
              // dual meaning) — a.family_id IS the template's templateId.
              const t = byTemplate.get(a.family_id) || null;
              const s = assignmentSummary(a, t);
              return (
                <li key={`${a.family_id}`} className="rounded-lg border border-[var(--line)] p-3 min-w-0">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="t-13 font-semibold text-ink break-words">{s.name}</p>
                      <p className="t-12 text-muted mt-0.5">
                        v{s.version} — the next long video uses this version.
                        {s.updated ? ` Assigned at v${s.assignedAt}; small updates apply on their own.` : ''}
                      </p>
                      <p className="t-11 text-faint mt-0.5 break-all">
                        Assigned by {a.assigned_by || '—'} · {String(a.assigned_at || '').slice(0, 16).replace('T', ' ')} UTC
                      </p>
                    </div>
                    {s.missing && tpl.status === 'ready' ? <Chip tone="warn">no longer listed</Chip> : null}
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
                  {s.majorUpdate !== null ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md p-2.5" style={{ background: 'color-mix(in srgb, var(--info) 10%, transparent)' }}>
                      <ArrowUpCircle size={14} className="shrink-0" style={{ color: 'var(--info-ink)' }} />
                      <span className="t-12 text-ink min-w-0 flex-1">
                        Version {s.majorUpdate} is out — this channel stays on version {s.pinnedMajor} until you switch.
                      </span>
                      {isOwner ? (
                        <button
                          type="button"
                          onClick={() => repin(a.family_id, s.majorUpdate)}
                          disabled={busy === a.family_id}
                          className="btn btn-outline btn-sm"
                        >
                          {busy === a.family_id ? <Loader2 size={12} className="animate-spin" /> : <ArrowUpCircle size={12} />} Switch to version {s.majorUpdate}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* every template as a demo card (the owner picks; staff browses) */}
      <section className="space-y-3 min-w-0">
        <h3 className="t-13 font-semibold text-ink">{!isOwner ? 'Templates' : assignments.length ? 'Assign a different template' : 'Assign a template'}</h3>
        {tpl.status === 'loading' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" aria-busy="true">
            {[0, 1, 2, 3].map((i) => <div key={i} className="rounded-xl aspect-[4/3] animate-pulse" style={{ background: 'var(--surface-2)' }} />)}
          </div>
        ) : tpl.status === 'error' ? (
          <div role="alert" className="flex flex-wrap items-center gap-2 t-12" style={{ color: 'var(--bad-ink)' }}>
            <XCircle size={14} className="shrink-0" />
            <span className="min-w-0 flex-1">Couldn&apos;t load the templates. {tpl.error}</span>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => { setTpl((t) => ({ ...t, status: 'loading', error: null })); loadTemplates(); }}><RefreshCw size={13} /> Retry</button>
          </div>
        ) : !templates.length ? (
          <p className="t-12 text-muted">No registry templates exist yet, so there is nothing to assign.</p>
        ) : (
          <>
            {channelNiches.length ? (
              <div className="min-w-0">
                <p className="t-11 text-faint mb-1.5">This channel&apos;s niches (matching templates have a star and come first)</p>
                <div className="flex flex-wrap gap-1.5">
                  {channelNiches.map((n) => (
                    <Chip key={n} tone="plain" className="max-w-full whitespace-normal break-words">{n}</Chip>
                  ))}
                </div>
              </div>
            ) : null}
            {samples.status === 'error' ? (
              <div className="flex flex-wrap items-center gap-2 t-12" style={{ color: 'var(--warn-ink)' }}>
                <span className="min-w-0 flex-1">Demos can&apos;t load right now. The templates are still listed.</span>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => { setSamples({ status: 'loading', samples: {} }); loadSamples(); }}><RefreshCw size={13} /> Retry</button>
              </div>
            ) : null}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {orderedTemplates.map((t) => {
                const nicheHit = (t.registry?.niches || []).some((n) => channelNiches.includes(n));
                // the validator's channel checks, shown before the click (owner bug 2026-11-23)
                const blockers = asg.status === 'ready' ? pickBlockers(t.registry, asg.channelConfig) : [];
                const isAssigned = assignedIds.has(t.templateId);
                const selected = templateId === t.templateId;
                const media = { name: t.name, preview: previewFor(t.templateId, samples.samples), ratios: ratiosForFormats(t.registry?.formats) };
                return (
                  <article
                    key={t.templateId}
                    className="rounded-xl border overflow-hidden flex flex-col min-w-0"
                    style={selected
                      ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 1px var(--accent)' }
                      : isAssigned
                        ? { borderColor: 'var(--ok)' }
                        : { borderColor: 'var(--line)' }}
                  >
                    <TemplatePreviewMedia item={media} previewState={samples.status} onOpen={isOwner ? () => pickTemplate(t.templateId) : undefined} />
                    <button
                      type="button"
                      data-kit="tile"
                      aria-pressed={selected}
                      disabled={!isOwner}
                      onClick={() => pickTemplate(t.templateId)}
                      className="text-left p-3 flex-1 flex flex-col gap-1.5 min-w-0 disabled:cursor-default"
                    >
                      <span className="t-13 font-semibold text-ink break-words inline-flex items-start gap-1">
                        {nicheHit ? <Star size={13} className="shrink-0 mt-[2px]" fill="currentColor" style={{ color: 'var(--warn-ink)' }} aria-label="Matches this channel's niche" /> : null}
                        <span>{t.name}</span>
                      </span>
                      <span className="t-11 text-faint">v{t.registry.version}</span>
                      <span className="flex flex-wrap gap-1">
                        {isAssigned ? <Chip tone="ok">Assigned</Chip> : null}
                        {selected ? <Chip tone="accent">Selected</Chip> : null}
                        {t.registry.deprecated ? <Chip tone="warn">deprecated</Chip> : null}
                        {blockers.includes('format_mismatch') ? <Chip tone="warn">format mismatch</Chip> : null}
                        {blockers.includes('niche_mismatch') ? <Chip tone="warn">niche mismatch</Chip> : null}
                      </span>
                    </button>
                    {selected ? (
                      <a
                        href={`/templates/registry/detail?template=${encodeURIComponent(t.templateId)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 t-12 text-muted hover:text-ink px-3 pb-3 -mt-1"
                      >
                        See this template&apos;s details <ExternalLink size={11} />
                      </a>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );

  // T3-14: the selection and its version live in the sticky footer, always
  // on screen next to "Assign & pin" — never in a box scrolled out of view.
  // Owner bug 2026-11-23: the assign ANSWER lives here too. It used to sit at
  // the end of the body, under every demo card, so a refusal (or a success)
  // was never on screen and the button looked dead.
  const assigning = !!busy && busy === templateId;
  const pickedBlockers = picked && asg.status === 'ready' ? pickBlockers(picked.registry, asg.channelConfig) : [];
  const footer = isOwner && templates.length ? (
    <>
      {msg ? (
        <div
          role="status"
          aria-live="polite"
          className="w-full rounded-lg border p-3 t-12 max-h-40 overflow-y-auto"
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
      ) : !assigning && pickedBlockers.length ? (
        <p className="w-full flex items-start gap-1.5 t-12" style={{ color: 'var(--warn-ink)' }}>
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span className="min-w-0">{friendlyReason({ code: pickedBlockers[0] })}</span>
        </p>
      ) : null}
      {picked ? (
        <div className="flex flex-wrap items-center gap-2 min-w-0 mr-auto">
          <span className="t-12 text-muted min-w-0 break-words">Selected: <b className="text-ink">{picked.name}</b></span>
          <label htmlFor={`tpl-major-${slug}`} className="sr-only">Version</label>
          <select
            id={`tpl-major-${slug}`}
            value={pinnedMajor}
            onChange={(e) => setPinnedMajor(e.target.value)}
            className="input t-12 py-1 w-auto"
          >
            {availableMajors(picked).map((m) => (
              <option key={m} value={m}>Version {m}{m === majorOf(picked.registry.version) ? ' (latest)' : ''}</option>
            ))}
          </select>
          {picked.registry.deprecated ? <Chip tone="warn">deprecated</Chip> : null}
        </div>
      ) : (
        <span className="t-12 text-muted mr-auto">Pick a template card to assign it.</span>
      )}
      {templateId ? (
        <button type="button" className="btn btn-outline" onClick={() => { setTemplateId(''); setPinnedMajor(''); setMsg(null); }}>
          Clear
        </button>
      ) : null}
      <Button color="primary" onClick={assign} isDisabled={!templateId || pinnedMajor === '' || assigning || asg.status !== 'ready'}>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          {assigning ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Assign &amp; pin
        </span>
      </Button>
    </>
  ) : null;

  return wrap(body, footer, dirty);
}
