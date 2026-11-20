'use client';
// Step 2 — what the channel is about: name, niche, content pillars, and the
// public description/tags. The AI kit draft lives here as a suggestion.
// live fix wave B2 (T4-06): the draft fills EMPTY fields only. Fields the
// owner already wrote keep their text and get a "Use this" suggestion; pillar
// suggestions merge, so a custom pillar is never dropped. The draft request
// and its state live here (the page's old handler overwrote every field).
import { useEffect, useRef, useState } from 'react';
import { Sparkles, Plus, X } from 'lucide-react';
import { NICHE_CATALOG, NICHE_MAP } from '@/lib/niches';
import { subNicheList, togglePillar, NAME_MAX } from '@/lib/wizard-steps.mjs';
import { findLabelClash } from '@/lib/brand-list.mjs';
import { planKitDraft, applyDraftField } from '@/lib/kit-draft-merge.mjs';
import { tagsToField, TAG_LIMITS } from '@/lib/tag-normalize.mjs';
import { Field, Notice } from './fields';
import AiDraftPanel from './AiDraftPanel';

export default function IdentityStep({ form, setField, setForm, names, channels = [], selfSlug = '' }) {
  const [customPillar, setCustomPillar] = useState('');
  // live fix wave A2 (T4-11): two channels with one name are easy to mix up
  const clash = findLabelClash(form.label, channels, selfSlug);
  const pillars = subNicheList(form.subNiches);
  const recommended = (NICHE_MAP[form.niche] || []).filter((p) => !pillars.includes(p.toLowerCase()));

  // T4-06 — draft state: { kit, suggestion, source, status: { key: filled|pending|same|applied } }
  const [draft, setDraft] = useState(null);
  const [filling, setFilling] = useState(false);
  const [draftError, setDraftError] = useState('');
  const [draftNote, setDraftNote] = useState('');
  // the latest form, read after the (slow) draft request returns
  const formRef = useRef(form);
  useEffect(() => { formRef.current = form; }, [form]);
  // another channel → a stale draft must not linger
  useEffect(() => { setDraft(null); setDraftNote(''); setDraftError(''); }, [selfSlug]);

  const draftKit = async () => {
    if (!form.niche.trim()) { setDraftError('Pick a niche first.'); return; }
    setFilling(true);
    setDraftError('');
    setDraftNote('');
    try {
      const r = await fetch('/api/channels/kit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: selfSlug, niche: form.niche, label: form.label, useLLM: true }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.kit) throw new Error(d.error || `Kit draft failed (${r.status})`);
      const next = { kit: d.kit, suggestion: d.suggestion || {}, source: d.source === 'llm' ? 'llm' : 'template' };
      setForm((f) => planKitDraft(f, next).form);
      setDraft({ ...next, status: planKitDraft(formRef.current, next).status });
      if (next.source !== 'llm') setDraftNote(d.note ? `${d.note}. Used the built-in template instead.` : 'Drafted from the built-in template.');
    } catch (e) {
      setDraftError(e.message);
    } finally {
      setFilling(false);
    }
  };
  const markApplied = (keys) => setDraft((d) => (d ? { ...d, status: { ...d.status, ...Object.fromEntries(keys.map((k) => [k, 'applied'])) } } : d));
  const applyOne = (key) => {
    if (!draft) return;
    setForm((f) => applyDraftField(f, key, draft));
    markApplied([key]);
  };
  const applyAll = () => {
    if (!draft) return;
    const pending = Object.keys(draft.status).filter((key) => draft.status[key] === 'pending');
    setForm((f) => pending.reduce((acc, key) => applyDraftField(acc, key, draft), f));
    markApplied(pending);
  };

  const pickNiche = (n) => {
    const subs = NICHE_MAP[n] || [];
    setForm((f) => ({ ...f, niche: n, subNiches: subs.length ? subs.join(', ') : f.subNiches }));
  };
  const addCustom = () => {
    const p = customPillar.trim().toLowerCase();
    if (!p) return;
    if (!pillars.includes(p)) setField('subNiches', togglePillar(form.subNiches, p));
    setCustomPillar('');
  };

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="min-w-0">
          <Field label="Channel name" hint={`Shown across Studio and on the videos. ${String(form.label || '').length}/${NAME_MAX}`}>
            {(id) => <input id={id} className="input w-full" value={form.label} maxLength={NAME_MAX} onChange={(e) => setField('label', e.target.value)} placeholder="e.g. Quote Quarry" aria-describedby={clash ? 'name-clash' : undefined} />}
          </Field>
          {clash ? (
            <p id="name-clash" className="t-11 mt-1.5" style={{ color: 'var(--warn-ink)' }} role="status">
              Another channel is already called “{clash.label || clash.slug}”. Pick a different name so you can tell them apart.
            </p>
          ) : null}
        </div>
        <Field label="Niche" hint="Tap a proven niche below, or type your own.">
          {(id) => <input id={id} className="input w-full" value={form.niche} onChange={(e) => setField('niche', e.target.value)} placeholder="e.g. Old money habits & quiet wealth" />}
        </Field>
      </div>

      <div>
        <p className="t-12 font-semibold text-ink mb-2">Proven niches</p>
        <div className="flex flex-wrap gap-1.5">
          {NICHE_CATALOG.map((n) => {
            const on = form.niche === n;
            return (
              <button
                key={n}
                type="button"
                aria-pressed={on}
                onClick={() => pickNiche(n)}
                data-kit="chip"
                className="rounded-full border px-3 py-1 t-12 transition-colors active:scale-[0.97]"
                style={on ? { borderColor: 'var(--accent)', color: 'var(--accent)', background: 'var(--accent-soft)' } : { borderColor: 'var(--line)', color: 'var(--muted)' }}
              >
                {n}
              </button>
            );
          })}
        </div>
        <p className="t-11 text-faint mt-1.5">Picking a niche also loads its recommended content pillars.</p>
      </div>

      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
          <p className="t-12 font-semibold text-ink">Content pillars</p>
          <p className="t-11 text-faint">Daily research rotates across these</p>
        </div>
        {pillars.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {pillars.map((p) => (
              <li key={p}>
                <span className="inline-flex items-center gap-1 rounded-full pl-3 pr-1 py-0.5 t-12" style={{ background: 'var(--accent-soft)', color: 'var(--ink)' }}>
                  {p}
                  <button type="button" data-kit="chip-close" className="rounded-full p-1 hover:bg-[var(--surface-2)]" onClick={() => setField('subNiches', togglePillar(form.subNiches, p))} aria-label={`Remove pillar ${p}`}>
                    <X size={11} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="t-12 text-faint">No pillars yet — research will use the niche itself.</p>
        )}
        {recommended.length ? (
          <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
            <span className="t-11 text-faint mr-0.5">Suggested:</span>
            {recommended.map((p) => (
              <button key={p} type="button" data-kit="chip" className="rounded-full border border-dashed border-line px-2.5 py-0.5 t-11 text-muted hover:text-ink" onClick={() => setField('subNiches', togglePillar(form.subNiches, p))}>
                <Plus size={10} className="inline -mt-0.5" /> {p}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex gap-2 mt-2.5 max-w-md">
          <input
            className="input flex-1 min-w-0"
            value={customPillar}
            onChange={(e) => setCustomPillar(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
            placeholder="Add your own pillar"
            aria-label="Add your own content pillar"
          />
          <button type="button" className="btn btn-outline shrink-0" onClick={addCustom} disabled={!customPillar.trim()}>Add</button>
        </div>
      </div>

      <div className="rounded-xl border border-line p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="t-13 font-semibold text-ink">Brand kit draft</p>
            <p className="t-11 text-faint">Drafts pillars, description, tags, style, voice, eyebrow and tagline from your niche. Fills empty fields only.</p>
          </div>
          <button type="button" className="btn btn-outline shrink-0" onClick={draftKit} disabled={filling || !form.niche.trim()} title={form.niche.trim() ? '' : 'Pick a niche first'}>
            <Sparkles size={14} /> {filling ? 'Drafting…' : 'Draft with AI'}
          </button>
        </div>
        {draftError ? <Notice tone="bad" title="Couldn't draft the kit">{draftError}</Notice> : null}
        {draftNote ? <Notice tone="warn">{draftNote}</Notice> : null}
        {draft?.kit?.mood ? <p className="t-11 text-faint">Music mood for this niche: <span className="text-muted">{draft.kit.mood}</span></p> : null}
        <AiDraftPanel draft={draft} names={names} onApply={applyOne} onApplyAll={applyAll} onDiscard={() => setDraft(null)} />
      </div>

      <Field label="Channel description" optional hint="Used for the YouTube channel description and video descriptions.">
        {(id) => <textarea id={id} className="input w-full" rows={3} value={form.description} onChange={(e) => setField('description', e.target.value)} />}
      </Field>
      <Field label="SEO tags" optional hint={`Comma separated. Duplicates are removed. Up to ${TAG_LIMITS.maxCount} tags, ${TAG_LIMITS.maxChars} characters.`}>
        {(id) => <input id={id} className="input w-full" value={form.tags} onChange={(e) => setField('tags', e.target.value)} onBlur={(e) => setField('tags', tagsToField(e.target.value))} placeholder="old money, quiet luxury, wealth habits" />}
      </Field>
    </div>
  );
}
