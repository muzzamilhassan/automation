'use client';
// Phase 0 (P0-2): the bell/home/tasks can only say "all quiet" when the check
// actually SUCCEEDED. DB-down answers 503 DB_DOWN — that is status 'error'
// ("unknown"), never quiet. canSee=false for 401/403 (forbidden).
import { useCallback, useEffect, useState } from 'react';

export function useOpenWarnings() {
  const [state, setState] = useState({ rows: [], canSee: false, status: 'loading' });
  const load = useCallback(() => {
    fetch('/api/warnings')
      .then((r) => {
        if (r.status === 401 || r.status === 403) return { t: 'forbidden' };
        if (!r.ok) return { t: 'error' };
        return r.json().then((d) => ({ t: 'ok', d }));
      })
      .then((res) => {
        if (res.t === 'ok') setState({ rows: res.d.open || [], canSee: true, status: 'ok' });
        else if (res.t === 'forbidden') setState({ rows: [], canSee: false, status: 'forbidden' });
        else setState({ rows: [], canSee: false, status: 'error' });
      })
      .catch(() => setState({ rows: [], canSee: false, status: 'error' }));
  }, []);
  useEffect(() => load(), [load]);
  return { ...state, retry: load };
}
