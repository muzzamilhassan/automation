'use client';
// The shared live-alerts hook (bell, Inbox badge, home cockpit, phone bar).
//
// Status contract (Phase 0, P0-2): 'ok' only when the check SUCCEEDED; DB-down
// (503) is 'error' — "status unknown", never quiet; 401/403 is 'forbidden'.
//
// Notification policy (owner, 2026-11-19 — "just real notifications"):
// `rows` are REAL problems only (blocking / action_required / warning),
// grouped so repeats count once ("4× script held for review"). Advisory /
// informational rows are QUIET: counted in `quiet` for the Alerts page's
// "For your information" section, never in a badge or the bell.
import { useCallback, useEffect, useState } from 'react';
import { groupRealWarnings, quietCount } from '@/lib/notify-policy.mjs';

export function useOpenWarnings() {
  const [state, setState] = useState({ rows: [], quiet: 0, canSee: false, status: 'loading' });
  const load = useCallback(() => {
    fetch('/api/warnings')
      .then((r) => {
        if (r.status === 401 || r.status === 403) return { t: 'forbidden' };
        if (!r.ok) return { t: 'error' };
        return r.json().then((d) => ({ t: 'ok', d }));
      })
      .then((res) => {
        if (res.t === 'ok') {
          const open = res.d.open || [];
          setState({ rows: groupRealWarnings(open), quiet: quietCount(open), canSee: true, status: 'ok' });
        } else if (res.t === 'forbidden') setState({ rows: [], quiet: 0, canSee: false, status: 'forbidden' });
        else setState({ rows: [], quiet: 0, canSee: false, status: 'error' });
      })
      .catch(() => setState({ rows: [], quiet: 0, canSee: false, status: 'error' }));
  }, []);
  useEffect(() => load(), [load]);
  return { ...state, retry: load };
}
