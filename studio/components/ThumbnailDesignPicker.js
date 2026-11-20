'use client';
// Feedback r1 A — pick the thumbnail designs a channel rotates through.
// Every design in the thumbnail registry (GET /api/thumbs/registry — the
// engine's eligible pool) shows as a REAL rendered sample: the public demo
// route renders it through the same v2 renderer the engine uses, in the
// channel's accent. A sample that fails to load says "No preview yet".
// Shared by the Add Channel wizard (ThumbnailStep) and the channel drawer
// (ThumbnailAssignPanel). Saved as kit.thumbTemplates by the caller.
import { useCallback, useEffect, useState } from 'react';
import { Check, ImageOff, RefreshCw, X } from 'lucide-react';
import { Chip } from '@/components/ui';
import { PICKER_MAX, thumbDemoUrl } from '@/lib/channel-kit-ui.mjs';

export default function ThumbnailDesignPicker({ value, onChange, accent, niche, readOnly, onLoaded }) {
  const [reg, setReg] = useState({ status: 'loading', designs: [] });
  const [broken, setBroken] = useState(() => new Set());
  const [loadedIds, setLoadedIds] = useState(() => new Set()); // tiles whose image arrived
  const picked = Array.isArray(value) ? value : [];

  // state is only set when the request settles (never synchronously in the effect)
  const load = useCallback(() => {
    fetch('/api/thumbs/registry')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        const designs = Array.isArray(d.registry) ? d.registry : [];
        setReg({ status: 'ready', designs });
        if (onLoaded) onLoaded(designs);
      })
      .catch(() => setReg({ status: 'error', designs: [] }));
    // onLoaded is a parent setter — the list loads once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { load(); }, [load]);
  const retry = () => {
    setReg({ status: 'loading', designs: [] });
    load();
  };

  const markBroken = (id) => setBroken((s) => new Set(s).add(id));
  const markLoaded = (id) => setLoadedIds((s) => (s.has(id) ? s : new Set(s).add(id)));
  const fits = (d) => Array.isArray(d.niches) && d.niches.includes(niche);
  const ordered = [...reg.designs].sort((a, b) => Number(fits(b)) - Number(fits(a)));
  const known = new Set(reg.designs.map((d) => d.id));
  // a saved id the registry no longer lists — shown so it can be removed
  const stale = reg.status === 'ready' ? picked.filter((id) => !known.has(id)) : [];
  const full = picked.length >= PICKER_MAX;

  const toggle = (id) => {
    if (readOnly) return;
    if (picked.includes(id)) onChange(picked.filter((x) => x !== id));
    else if (!full) onChange([...picked, id]); // at most PICKER_MAX
  };

  return (
    <div className="space-y-3 min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="t-12 text-muted min-w-0">
          Pick 2–5 designs. They take turns on new uploads. Pick none to use frames from the video.
        </p>
        <span className="t-11 text-faint shrink-0">{picked.length} of {PICKER_MAX} picked</span>
      </div>

      {picked.length === 1 ? (
        <p className="t-12" style={{ color: 'var(--warn-ink)' }}>Pick one more — a single design can&apos;t take turns.</p>
      ) : null}

      {stale.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="t-11 text-faint">No longer available:</span>
          {stale.map((id) => (
            <Chip key={id} tone="warn">
              <span className="font-mono">{id}</span>
              {!readOnly ? (
                <button type="button" data-kit="chip" aria-label={`Remove ${id}`} className="ml-1 inline-flex" onClick={() => toggle(id)}><X size={11} /></button>
              ) : null}
            </Chip>
          ))}
        </div>
      ) : null}

      {reg.status === 'loading' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5" aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className="aspect-video rounded-xl animate-pulse" style={{ background: 'var(--surface-2)' }} />)}
        </div>
      ) : reg.status === 'error' ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 t-12" style={{ color: 'var(--warn-ink)' }}>
          <span className="min-w-0 flex-1">Thumbnail designs can&apos;t load right now.</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={retry}><RefreshCw size={13} /> Retry</button>
        </div>
      ) : !ordered.length ? (
        <p className="t-12 text-faint">No thumbnail designs are registered yet.</p>
      ) : (
        <div role="group" aria-label="Thumbnail designs" className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {ordered.map((d) => {
            const on = picked.includes(d.id);
            const locked = readOnly || (!on && full);
            return (
              <button
                key={d.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                aria-disabled={locked}
                onClick={() => toggle(d.id)}
                title={!on && full && !readOnly ? `You can pick up to ${PICKER_MAX}` : undefined}
                data-kit="tile"
                className={`text-left rounded-xl border overflow-hidden min-w-0 transition-[border-color,box-shadow,opacity] duration-150 ${locked && !on ? 'opacity-60 cursor-not-allowed' : ''}`}
                style={on ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 1px var(--accent)' } : { borderColor: 'var(--line)' }}
              >
                <span className="relative block aspect-video" style={{ background: 'var(--surface-2)' }}>
                  {broken.has(d.id) ? (
                    <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-faint">
                      <ImageOff size={18} />
                      <span className="t-11">No preview yet</span>
                    </span>
                  ) : (
                    <>
                      {/* T3-12: each tile shimmers until its own sample arrives — never an empty box */}
                      {!loadedIds.has(d.id) ? <span aria-hidden="true" className="absolute inset-0 animate-pulse" style={{ background: 'var(--surface-3, var(--surface-2))' }} /> : null}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumbDemoUrl(d.id, accent)}
                        alt={`${d.label || d.id} thumbnail sample`}
                        loading="lazy"
                        decoding="async"
                        onLoad={() => markLoaded(d.id)}
                        onError={() => markBroken(d.id)}
                        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${loadedIds.has(d.id) ? 'opacity-100' : 'opacity-0'}`}
                      />
                    </>
                  )}
                  {on ? (
                    <span className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>
                      <Check size={14} />
                    </span>
                  ) : null}
                </span>
                <span className="flex items-center gap-1.5 px-2.5 py-2 min-w-0">
                  <span className="t-12 font-medium text-ink truncate">{d.label || d.id}</span>
                  {fits(d) ? <Chip tone="ok" className="shrink-0">fits niche</Chip> : null}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
