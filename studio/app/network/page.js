'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Tv, PlugZap, Gauge } from 'lucide-react';
import { PageHeader } from '@/components/ui';
import TabNav from '@/components/TabNav';
import Channels from '@/app/channels/page';
import ProvidersPage from '@/app/providers/page';
import UsagePage from '@/app/usage/page';

const NETWORK_TABS = [
  { id: 'channels', label: 'Channels', icon: Tv },
  { id: 'providers', label: 'AI Providers (BYOK)', icon: PlugZap },
  { id: 'usage', label: 'Quota & Costs', icon: Gauge },
];

function NetworkContent() {
  const searchParams = useSearchParams();
  const tabFromQuery = searchParams.get('tab');
  const activeTab = tabFromQuery && NETWORK_TABS.some((tab) => tab.id === tabFromQuery) ? tabFromQuery : 'channels';

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Tv}
        title="Network & Infrastructure"
        sub="Multi-channel portfolio management, BYOK encrypted provider vault, and daily API quota ledger."
      />

      <TabNav
        tabs={NETWORK_TABS}
        activeTab={activeTab}
        paramName="tab"
      />

      <div className="pt-2">
        {activeTab === 'channels' && <Channels />}
        {activeTab === 'providers' && <ProvidersPage />}
        {activeTab === 'usage' && <UsagePage />}
      </div>
    </div>
  );
}

export default function NetworkHub() {
  return (
    <Suspense fallback={<div className="p-8 text-faint">Loading Network…</div>}>
      <NetworkContent />
    </Suspense>
  );
}
