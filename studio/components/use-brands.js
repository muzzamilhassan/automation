'use client';
// #125 (S-12 sweep) — the ONE client hook for brand marks. Replaces the
// deleted static lookups on every page: short codes + accents come
// live from /api/brands (legacy brands + registry), so pages always match
// reality. While loading, lookups return undefined — every call site keeps
// its own '•' / fallback so nothing fake ever renders.
import { useEffect, useState } from 'react';

export function useBrands() {
  const [bySlug, setBySlug] = useState({});
  const [channels, setChannels] = useState([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch('/api/brands')
      .then((r) => (r.ok ? r.json() : { channels: [] }))
      .then((d) => {
        if (!alive) return;
        const list = d.channels || [];
        const map = {};
        for (const c of list) map[c.slug] = c;
        setBySlug(map);
        setChannels(list);
        setLoaded(true);
      })
      .catch(() => {
        if (alive) setLoaded(true); // loaded with nothing — call sites fall back, never fake
      });
    return () => {
      alive = false;
    };
  }, []);
  return { bySlug, channels, loaded };
}
