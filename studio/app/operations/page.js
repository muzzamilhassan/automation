'use client';
import { Suspense } from 'react';
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
  { id: 'warnings', label: 'Warnings & Alerts', icon: TriangleAlert, badge: '1', badgeTone: 'bad' },
];

function OperationsContent() {
  const searchParams = useSearchParams();
  const tabFromQuery = searchParams.get('tab');
  const activeTab = tabFromQuery && OPERATIONS_TABS.some((tab) => tab.id === tabFromQuery) ? tabFromQuery : 'pipelines';

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Zap}
        title="Operations Hub"
        sub="Master flow autopilot control, background production lines, live posting logs, and policy compliance triage."
      />

      <TabNav
        tabs={OPERATIONS_TABS}
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
