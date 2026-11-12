'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Zap, ScrollText, TriangleAlert } from 'lucide-react';
import { PageHeader } from '@/components/ui';
import TabNav from '@/components/TabNav';
import Production from '@/app/production/page';
import Logs from '@/app/logs/page';
import WarningsPage from '@/app/warnings/page';

const OPERATIONS_TABS = [
  { id: 'pipelines', label: 'Pipelines', icon: Zap },
  { id: 'logs', label: 'Execution Logs', icon: ScrollText },
  { id: 'warnings', label: 'Warnings & Alerts', icon: TriangleAlert, badgeTone: 'bad' },
];

function OperationsContent() {
  const searchParams = useSearchParams();
  const tabFromQuery = searchParams.get('tab');
  const activeTab = tabFromQuery && OPERATIONS_TABS.some((tab) => tab.id === tabFromQuery) ? tabFromQuery : 'pipelines';
  const [openWarnings, setOpenWarnings] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch('/api/overview')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return;
        const count = Number(d.openWarnings);
        setOpenWarnings(Number.isFinite(count) && count > 0 ? count : 0);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [activeTab]);

  const tabs = useMemo(
    () =>
      OPERATIONS_TABS.map((tab) =>
        tab.id === 'warnings'
          ? { ...tab, badge: openWarnings > 0 ? String(openWarnings) : undefined }
          : tab
      ),
    [openWarnings]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Zap}
        title="Operations Hub"
        sub="Master flow autopilot control, background production lines, live posting logs, and policy compliance triage."
      />

      <TabNav
        tabs={tabs}
        activeTab={activeTab}
        paramName="tab"
      />

      <div className="pt-2">
        {activeTab === 'pipelines' && <Production />}
        {activeTab === 'logs' && <Logs />}
        {activeTab === 'warnings' && <WarningsPage />}
      </div>
    </div>
  );
}

export default function OperationsHub() {
  return (
    <Suspense fallback={<div className="p-8 text-faint">Loading Operations…</div>}>
      <OperationsContent />
    </Suspense>
  );
}
