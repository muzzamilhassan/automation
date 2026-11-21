'use client';
// "100% ready before anything publishes" (owner, 2026-11-21) — the panel's
// read of the 7-item checklist (GET /api/channels/readiness). Same answer the
// engine computes. useReadiness() = every channel the viewer may see;
// useReadiness(slug) = one channel.
//   status: 'loading' | 'ok' | 'error'   — 'error' = unknown, never "ready"
//   bySlug: { [slug]: { ready, done, total, items } }
import { useCallback, useEffect, useState } from 'react';

export function useReadiness(slug) {
  const [state, setState] = useState({ status: 'loading', bySlug: {} });
  const reload = useCallback(() => {
    fetch(slug ? `/api/channels/readiness?slug=${encodeURIComponent(slug)}` : '/api/channels/readiness')
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        return d;
      })
      .then((d) => setState({ status: 'ok', bySlug: slug ? { [d.slug]: d.readiness } : d.channels || {} }))
      .catch(() => setState({ status: 'error', bySlug: {} }));
  }, [slug]);
  useEffect(() => reload(), [reload]);
  return { ...state, reload };
}
