'use client';
// Step 4 — thumbnails. Studio has no per-channel thumbnail pick to save:
// covers rotate automatically through the registry designs bound to the
// niche. What the owner DOES control is the brand that goes on them — the
// eyebrow, tagline and accent — so this step edits those and renders a real
// sample on demand through the same preview route the Thumbnail Studio uses.
import { useEffect, useState } from 'react';
import { ImageIcon, RefreshCw, Wand2 } from 'lucide-react';
import { thumbDesignsForNiche } from '@/lib/wizard-steps.mjs';
import { Field, Notice } from './fields';

export default function ThumbnailStep({ form, setField, onEditAccent }) {
  const [reg, setReg] = useState({ status: 'loading', designs: [] });
  const [design, setDesign] = useState('');
  const [headline, setHeadline] = useState('');
  const [preview, setPreview] = useState({ status: 'idle' }); // idle | rendering | ready | error

  const fetchRegistry = () =>
    fetch('/api/thumbs/registry')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setReg({ status: 'ready', designs: Array.isArray(d.registry) ? d.registry : [] }))
      .catch(() => setReg({ status: 'error', designs: [] }));
  const loadRegistry = () => {
    setReg({ status: 'loading', designs: [] });
    fetchRegistry();
  };
  useEffect(() => {
    fetchRegistry();
  }, []);

  const { designs, matched } = thumbDesignsForNiche(reg.designs, form.niche);
  const activeDesign = designs.some((d) => d.id === design) ? design : designs[0]?.id || '';
  const sampleTitle = headline.trim() || form.tagline.trim() || form.label.trim() || 'Your headline here';

  const render = async () => {
    if (!activeDesign) return;
    setPreview({ status: 'rendering' });
    try {
      const r = await fetch('/api/thumbs/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: `v2/${activeDesign}`, title: sampleTitle, accent: form.accent, eyebrow: form.eyebrow, brand: form.label }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 429) throw new Error('Preview limit reached (30 renders per 10 minutes). Try again in a few minutes.');
      if (!r.ok || !d.image) throw new Error(d.error || `The preview couldn't render (HTTP ${r.status}).`);
      setPreview({ status: 'ready', image: d.image, design: activeDesign });
    } catch (e) {
      setPreview({ status: 'error', error: e.message });
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Eyebrow label" optional hint="The small label on videos and thumbnails, e.g. OLD MONEY HABITS // OLD MONEY CODE">
          {(id) => <input id={id} className="input w-full font-mono" value={form.eyebrow} onChange={(e) => setField('eyebrow', e.target.value)} maxLength={70} placeholder="OLD MONEY HABITS // OLD MONEY CODE" />}
        </Field>
        <Field label="Tagline" optional hint="One short line that sums up the channel.">
          {(id) => <input id={id} className="input w-full" value={form.tagline} onChange={(e) => setField('tagline', e.target.value)} maxLength={90} placeholder="Wealth whispers." />}
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <span className="w-6 h-6 rounded-md border border-line shrink-0" style={{ background: form.accent }} aria-hidden="true" />
        <span className="t-12 text-muted">Accent <span className="font-mono">{form.accent}</span></span>
        <button type="button" className="t-11 font-semibold text-accent underline underline-offset-2" onClick={onEditAccent}>Change in Look &amp; sound</button>
      </div>

      <section className="rounded-xl border border-line p-4 space-y-3">
        <div>
          <h3 className="t-13 font-semibold text-ink">Thumbnail designs</h3>
          <p className="t-11 text-faint mt-0.5">
            {reg.status !== 'ready'
              ? 'Covers rotate automatically through the designs matched to your niche.'
              : matched
                ? `Covers for “${form.niche}” rotate automatically through these ${designs.length} designs. Pick one to preview your branding on it.`
                : 'No designs are bound to this niche yet, so covers rotate through the full set. Pick one to preview your branding on it.'}
          </p>
        </div>

        {reg.status === 'loading' ? (
          <div className="flex flex-wrap gap-1.5" aria-busy="true">
            {[0, 1, 2, 3].map((i) => <span key={i} className="h-7 w-24 rounded-full animate-pulse" style={{ background: 'var(--surface-2)' }} />)}
          </div>
        ) : reg.status === 'error' ? (
          <Notice tone="warn" title="Thumbnail designs can't load right now" action={<button type="button" className="btn btn-sm btn-outline" onClick={loadRegistry}><RefreshCw size={13} /> Retry</button>}>
            Your eyebrow and tagline still save normally.
          </Notice>
        ) : !designs.length ? (
          <p className="t-12 text-faint">No thumbnail designs are registered yet.</p>
        ) : (
          <>
            <div role="radiogroup" aria-label="Preview design" className="flex flex-wrap gap-1.5">
              {designs.map((d) => {
                const on = d.id === activeDesign;
                return (
                  <button
                    key={d.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setDesign(d.id)}
                    data-kit="chip"
                    className="rounded-full border px-3 py-1 t-12 transition-colors"
                    style={on ? { borderColor: 'var(--accent)', color: 'var(--accent)', background: 'var(--accent-soft)' } : { borderColor: 'var(--line)', color: 'var(--muted)' }}
                  >
                    {d.label || d.id}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[12rem]">
                <Field label="Sample headline" hint="Only for this preview — real covers use each video's title.">
                  {(id) => <input id={id} className="input w-full" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder={sampleTitle} maxLength={60} />}
                </Field>
              </div>
              <button type="button" className="btn btn-outline mb-[1.375rem]" onClick={render} disabled={preview.status === 'rendering' || !activeDesign}>
                <Wand2 size={14} /> {preview.status === 'rendering' ? 'Rendering…' : 'Render preview'}
              </button>
            </div>
          </>
        )}

        {preview.status === 'error' ? <Notice tone="bad" title="Preview failed">{preview.error}</Notice> : null}
        <div className="relative aspect-video max-w-xl rounded-xl overflow-hidden border border-line" style={{ background: 'var(--surface-2)' }}>
          {preview.status === 'ready' ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={preview.image} alt={`Sample thumbnail in the ${preview.design} design`} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-faint px-4 text-center">
              <ImageIcon size={22} />
              <span className="t-12">{preview.status === 'rendering' ? 'Rendering a real sample…' : 'Press “Render preview” to see your branding on a real cover.'}</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
