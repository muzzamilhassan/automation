'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { isBarePath } from '@/lib/safe-next.mjs';

const WorkspaceContext = createContext(null);

export function WorkspaceProvider({ children }) {
  // Live fix wave C1 (T1-18): bare pages (/login, /proof, /client) are signed
  // out or client-scoped — polling /api/overview there was a 401 on every load.
  const bare = isBarePath(usePathname());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshedAt, setRefreshedAt] = useState(null);

  const refresh = useCallback(async (fresh = false) => {
    try {
      const q = fresh ? '?fresh=1' : '';
      const res = await fetch(`/api/overview${q}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
      setRefreshedAt(new Date());
    } catch (e) {
      setError(e.message || 'Could not load workspace');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (bare) return undefined;
    let alive = true;
    (async () => {
      await Promise.resolve();
      if (alive) refresh(false);
    })();
    const interval = setInterval(() => refresh(false), 60000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [refresh, bare]);

  const channels = data?.channels || [];
  const activeChannels = channels.filter((c) => c.active);
  const totals = data?.totals || { ytSubs: 0, ytViews: 0, ytVideos: 0, fbFollowers: 0, igFollowers: 0 };

  return (
    <WorkspaceContext.Provider
      value={{
        data,
        channels,
        activeChannels,
        totals,
        loading,
        error,
        refreshedAt,
        refresh,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return ctx;
}
