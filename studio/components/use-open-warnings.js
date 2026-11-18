'use client';
// #126 (S-2) — the ONE client hook for live open warnings (bell + home card).
// canSee=false for clients (401/403) and on fetch failure — call sites hide
// the badge/card instead of ever showing a fake number. Owner/staff get the
// real open rows from /api/warnings (the surface Operations already trusts).
import { useEffect, useState } from 'react';

export function useOpenWarnings() {
  const [state, setState] = useState({ rows: [], canSee: false, loaded: false });
  useEffect(() => {
    let alive = true;
    fetch('/api/warnings')
      .then((r) => (r.ok ? r.json() : { open: [], canSee: false }))
      .then((d) => {
        if (alive) {
          setState({ rows: d.open || [], canSee: Boolean(d.open), loaded: true });
        }
      })
      .catch(() => {
        if (alive) setState({ rows: [], canSee: false, loaded: true });
      });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
