'use client';
// Step 4 — thumbnails. Feedback r1 A: the owner picks the designs this
// channel's covers take turns through (kit.thumbTemplates — the engine's
// registryThumbCandidates reads it), from real rendered samples in the
// channel's accent (ThumbnailDesignPicker). The eyebrow / tagline / accent
// that go on every cover are edited here too, and a full-size sample with
// the owner's own headline renders on demand through the same preview route
// the Thumbnail Studio uses.
//
// Live fix wave B4: the loaded designs go up to the page (`onDesigns`) so
// Review can list the picked designs by name (T4-17); the eyebrow example is
// built from the CURRENT niche + name, whole words only (T4-16).
import { useCallback, useState } from 'react';
import { ImageIcon, Wand2 } from 'lucide-react';
import ThumbnailDesignPicker from '@/components/ThumbnailDesignPicker';
import { eyebrowFor } from '@/lib/wizard-steps.mjs';
import { Field, Notice } from './fields';

export default function ThumbnailStep({ form, setField, onEditAccent, onDesigns }) {
  const [designs, setDesigns] = useState([]);
  // the picker loads its list once per mount
  const designsLoaded = useCallback((list) => {
    setDesigns(list);
    if (onDesigns) onDesigns(list);
  }, [onDesigns]);
  const eyebrowExample = form.niche.trim() && form.label.trim() ? eyebrowFor(`${form.niche.trim().toUpperCase()} // ${form.label}`, form.label) : 'OLD MONEY HABITS // OLD MONEY CODE';
  const [design, setDesign] = useState('');
  const [headline, setHeadline] = useState('');
  const [preview, setPreview] = useState({ status: 'idle' }); // idle | rendering | ready | error

  const picked = Array.isArray(form.thumbTemplates) ? form.thumbTemplates : [];
  // the headline preview offers the picked designs first, else every design
  const previewChoices = picked.length ? designs.filter((d) => picked.includes(d.id)) : designs;
  const activeDesign = previewChoices.some((d) => d.id === design) ? design : previewChoices[0]?.id || '';
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
          {(id) => <input id={id} className="input w-full font-mono" value={form.eyebrow} onChange={(e) => setField('eyebrow', e.target.value)} maxLength={70} placeholder={eyebrowExample} />}
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
        <h3 className="t-13 font-semibold text-ink">Thumbnail designs</h3>
        <ThumbnailDesignPicker
          value={form.thumbTemplates || []}
          onChange={(ids) => setField('thumbTemplates', ids)}
          accent={form.accent}
          niche={form.niche}
          onLoaded={designsLoaded}
        />
      </section>

      <section className="rounded-xl border border-line p-4 space-y-3">
        <div>
          <h3 className="t-13 font-semibold text-ink">Try your own headline</h3>
          <p className="t-11 text-faint mt-0.5">See a full-size cover with your name, eyebrow and accent.</p>
        </div>
        {previewChoices.length ? (
          <div className="flex flex-wrap gap-2 items-end">
            <div className="min-w-[10rem]">
              <Field label="Design">
                {(id) => (
                  <select id={id} className="input w-full" value={activeDesign} onChange={(e) => setDesign(e.target.value)}>
                    {previewChoices.map((d) => <option key={d.id} value={d.id}>{d.label || d.id}</option>)}
                  </select>
                )}
              </Field>
            </div>
            <div className="flex-1 min-w-[12rem]">
              <Field label="Sample headline" hint="Only for this preview — real covers use each video's title.">
                {(id) => <input id={id} className="input w-full" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder={sampleTitle} maxLength={60} />}
              </Field>
            </div>
            <button type="button" className="btn btn-outline mb-[1.375rem]" onClick={render} disabled={preview.status === 'rendering' || !activeDesign}>
              <Wand2 size={14} /> {preview.status === 'rendering' ? 'Rendering…' : 'Render preview'}
            </button>
          </div>
        ) : null}

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
