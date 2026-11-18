'use client';
// Phase 0 (P0-7): the account menu shows the SIGNED-IN user — never a
// hardcoded identity. Backed by GET /api/me (session → email/name/role).
import { useEffect, useState } from 'react';

export function useMe() {
  const [me, setMe] = useState(null); // {email, name, role} | null
  useEffect(() => {
    let alive = true;
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setMe(d && d.email ? d : null); })
      .catch(() => { if (alive) setMe(null); });
    return () => { alive = false; };
  }, []);
  return me;
}

export function initialsOf(name, email) {
  const src = String(name || email || '?').trim();
  const parts = src.split(/[\s._@-]+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}
