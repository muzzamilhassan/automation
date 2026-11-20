'use client';
// Step 3a — the video look. Two honest layers, shown as visual card grids:
//  1. Base video style (STYLE_CATALOG) — held in the form, saved on Save.
//  2. Production templates (#115 registry + CI sample MP4s) — the demo plays
//     inside the card on hover (desktop) or tap (phones); "Details" opens a
//     drawer with the full demo. "Use" assigns through the existing lane and
//     takes effect immediately (it says so).
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Play, Pause, Maximize2, RefreshCw, Film, Star } from 'lucide-react';
import { Chip } from '@/components/ui';
import Drawer from '@/components/Drawer';
import { STYLE_CATALOG } from '@/lib/styles-catalog';
import { recommendedStyleFor } from '@/lib/niches';
import { previewSourceFor } from '@/lib/wizard-preview-helpers';
import { Notice } from './fields';

// P7 (live-fix B1): a template's OWN words — the family blurb only when the
// template IS that family (36 storybooks used to show the documentary family's).
const blurbOf = (t) => t?.registry?.story_structure?.format_description
  || (t?.templateId === t?.family ? t?.catalog?.desc : '')
  || '';

function AssignButton({ state, assigned, disabled, onAssign, className = '' }) {
  const done = assigned || state?.state === 'done';
  return (
    <button type="button" className={`btn btn-sm ${done ? 'btn-outline' : 'btn-primary'} ${className}`} onClick={onAssign} disabled={disabled || done || state?.state === 'assigning'}>
      {state?.state === 'assigning' ? 'Assigning…' : done ? (<><Check size={13} /> Assigned</>) : 'Use for this channel'}
    </button>
  );
}

export default function TemplatePicker({ style, onStyle, niche, connectedSlug, templates, samples, assignState, onAssign, onRetryTemplates, onRetrySamples }) {
  const [playing, setPlaying] = useState(null); // templateId whose demo plays in its card
  const [detail, setDetail] = useState(null); // templateId open in the drawer
  const dwell = useRef(null);
  useEffect(() => () => clearTimeout(dwell.current), []);
  // stable: Drawer re-runs its focus effect whenever onClose changes identity
  const closeDetail = useCallback(() => setDetail(null), []);

  const nicheRec = recommendedStyleFor(niche);
  const list = templates.templates || [];
  const fits = (t) => Array.isArray(t.registry?.niches) && t.registry.niches.includes(niche);
  const ordered = [...list].sort((a, b) => Number(fits(b)) - Number(fits(a)));
  const srcFor = (t) => previewSourceFor(t.templateId, t.family, samples.samples, samples.familySamples);
  const assignedIds = new Set(templates.assignedIds || []);

  // hover: start after a short dwell so sweeping across the grid doesn't
  // fire a dozen videos; only real mice hover — touch uses the play button.
  const hoverIn = (e, id) => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(dwell.current);
    dwell.current = setTimeout(() => setPlaying(id), 300);
  };
  const hoverOut = (e, id) => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(dwell.current);
    setPlaying((p) => (p === id ? null : p));
  };

  const detailT = detail ? list.find((t) => t.templateId === detail) : null;
  const detailSrc = detailT ? srcFor(detailT) : null;

  return (
    <div className="space-y-6">
      {/* 1 — base style */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2.5">
          <h3 className="t-13 font-semibold text-ink">Video style</h3>
          <p className="t-11 text-faint">Previews are real frames from actual renders</p>
        </div>
        <div role="radiogroup" aria-label="Video style" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {STYLE_CATALOG.map((s) => {
            const selected = style === s.id;
            const recommended = nicheRec?.style === s.id;
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onStyle(s.id)}
                data-kit="tile"
                className="text-left rounded-xl border overflow-hidden transition-[border-color,box-shadow] duration-150 min-w-0"
                style={selected ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 1px var(--accent)' } : { borderColor: 'var(--line)' }}
              >
                <span className="relative block aspect-video" style={{ background: 'var(--surface-2)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.preview} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                  {selected ? (
                    <span className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'var(--accent)', color: 'var(--surface)' }}>
                      <Check size={14} strokeWidth={3} />
                    </span>
                  ) : null}
                </span>
                <span className="block p-3">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="t-13 font-semibold text-ink">{s.name}</span>
                    <Chip tone={s.status === 'live' ? 'ok' : 'warn'}>{s.status === 'live' ? 'in production' : 'demo only'}</Chip>
                    {recommended ? <Chip tone="accent"><Star size={10} /> fits your niche</Chip> : null}
                  </span>
                  <span className="t-11 text-muted mt-1 leading-snug line-clamp-2 block">{s.desc}</span>
                  <span className="t-11 text-faint mt-1 block">{s.formats.join(' · ')}</span>
                </span>
              </button>
            );
          })}
        </div>
        {nicheRec ? (
          <p className="t-11 text-faint mt-2">
            Suggested for your niche: <b className="text-muted">{STYLE_CATALOG.find((s) => s.id === nicheRec.style)?.name}</b> — {nicheRec.reason}. Nothing is chosen for you.
          </p>
        ) : null}
      </section>

      {/* 2 — production templates */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2.5">
          <h3 className="t-13 font-semibold text-ink">
            Production templates{templates.status === 'ready' ? ` (${list.length})` : ''}
          </h3>
          <Link href="/styles" className="t-11 font-semibold text-accent hover:underline">Open the full gallery</Link>
        </div>
        <p className="t-11 text-faint mb-3">Hover or tap ▶ to watch a demo. “Use for this channel” assigns it right away — it doesn&apos;t wait for Save.</p>

        {templates.status === 'loading' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3" aria-busy="true">
            {[0, 1, 2].map((i) => <div key={i} className="rounded-xl aspect-[4/3] animate-pulse" style={{ background: 'var(--surface-2)' }} />)}
          </div>
        ) : templates.status === 'error' ? (
          <Notice tone="warn" title="Production templates can't load right now" action={<button type="button" className="btn btn-sm btn-outline" onClick={onRetryTemplates}><RefreshCw size={13} /> Retry</button>}>
            You can still pick a video style above and assign templates later from the channel page.
          </Notice>
        ) : !list.length ? (
          <p className="t-12 text-faint">No production templates are in the registry yet.</p>
        ) : (
          <>
            {samples.status === 'error' ? (
              <div className="mb-3">
                <Notice tone="info" action={<button type="button" className="btn btn-sm btn-outline" onClick={onRetrySamples}><RefreshCw size={13} /> Retry</button>}>
                  Demo videos are offline right now — pick by description; demos come back when the database is reachable.
                </Notice>
              </div>
            ) : null}
            {templates.assignError ? <p className="t-11 mb-2" style={{ color: 'var(--warn-ink)' }}>Couldn&apos;t check which templates this channel already uses — status unknown.</p> : null}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {ordered.map((t) => {
                const src = srcFor(t);
                const isPlaying = playing === t.templateId && src?.mp4;
                const a = assignState[t.templateId];
                return (
                  <article
                    key={t.templateId}
                    className="rounded-xl border border-line overflow-hidden flex flex-col min-w-0"
                    onPointerEnter={(e) => hoverIn(e, t.templateId)}
                    onPointerLeave={(e) => hoverOut(e, t.templateId)}
                  >
                    <div className="relative aspect-video" style={{ background: 'var(--surface-2)' }}>
                      {isPlaying ? (
                        <video src={src.mp4} poster={src.poster || undefined} autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover" />
                      ) : src?.poster ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={src.poster} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-faint">
                          <Film size={20} />
                          <span className="t-11">{src?.mp4 ? 'Tap ▶ for the demo' : 'No demo yet'}</span>
                        </div>
                      )}
                      {src?.mp4 ? (
                        <button
                          type="button"
                          data-kit="media-control"
                          className="absolute bottom-2 left-2 w-8 h-8 rounded-full flex items-center justify-center bg-black/65 text-white backdrop-blur-sm"
                          onClick={() => setPlaying((p) => (p === t.templateId ? null : t.templateId))}
                          aria-label={isPlaying ? `Stop the ${t.name} demo` : `Play the ${t.name} demo`}
                        >
                          {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        data-kit="media-control"
                        className="absolute bottom-2 right-2 w-8 h-8 rounded-full flex items-center justify-center bg-black/65 text-white backdrop-blur-sm"
                        onClick={() => { setPlaying(null); setDetail(t.templateId); }}
                        aria-label={`Details for ${t.name}`}
                      >
                        <Maximize2 size={13} />
                      </button>
                    </div>
                    <div className="p-3 flex flex-col gap-2 flex-1">
                      <div className="min-w-0">
                        <p className="t-13 font-semibold text-ink truncate">{t.name}</p>
                        <p className="t-11 text-muted line-clamp-2 leading-snug mt-0.5">{blurbOf(t)}</p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {fits(t) ? <Chip tone="accent"><Star size={10} /> fits your niche</Chip> : null}
                        {(t.registry?.formats || []).slice(0, 3).map((f) => <Chip key={f}>{f}</Chip>)}
                      </div>
                      <div className="mt-auto pt-1">
                        <AssignButton state={a} assigned={assignedIds.has(t.templateId)} disabled={!connectedSlug} onAssign={() => onAssign(t.templateId)} className="w-full" />
                        {a?.state === 'error' ? <p className="t-11 mt-1.5 break-words" style={{ color: 'var(--bad-ink)' }}>{a.msg}</p> : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>

      <Drawer
        open={Boolean(detailT)}
        onClose={closeDetail}
        title={detailT?.name || 'Template'}
        description={(detailT?.templateId === detailT?.family ? detailT?.catalog?.usedFor : '') || 'Production template'}
        icon={Film}
        size="lg"
        footer={
          detailT ? (
            <>
              <button type="button" className="btn btn-outline" onClick={closeDetail}>Close</button>
              <AssignButton state={assignState[detailT.templateId]} assigned={assignedIds.has(detailT.templateId)} disabled={!connectedSlug} onAssign={() => onAssign(detailT.templateId)} />
            </>
          ) : null
        }
      >
        {detailT ? (
          <div className="space-y-4">
            {detailSrc?.mp4 ? (
              <video src={detailSrc.mp4} poster={detailSrc.poster || undefined} autoPlay muted loop playsInline controls className="w-full rounded-xl border border-line max-h-[60vh] object-contain" style={{ background: 'var(--surface-2)' }} />
            ) : detailSrc?.poster ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={detailSrc.poster} alt="" className="w-full rounded-xl border border-line" />
            ) : (
              <p className="t-12 text-faint">No demo render exists for this template yet.</p>
            )}
            <p className="t-13 text-muted leading-relaxed">{blurbOf(detailT)}</p>
            {(detailT.registry?.formats || []).length ? (
              <div>
                <p className="t-11 text-faint mb-1">Formats</p>
                <div className="flex flex-wrap gap-1">{detailT.registry.formats.map((f) => <Chip key={f}>{f}</Chip>)}</div>
              </div>
            ) : null}
            {Array.isArray(detailT.registry?.niches) && detailT.registry.niches.length ? (
              <div>
                <p className="t-11 text-faint mb-1">Made for</p>
                <p className="t-12 text-muted">{detailT.registry.niches.join(' · ')}</p>
              </div>
            ) : null}
            {assignState[detailT.templateId]?.state === 'error' ? (
              <Notice tone="bad" title="Couldn't assign">{assignState[detailT.templateId].msg}</Notice>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
