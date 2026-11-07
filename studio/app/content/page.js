'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Film, Share2, Music } from 'lucide-react';
import { PageHeader } from '@/components/ui';
import TabNav from '@/components/TabNav';
import Videos from '@/app/videos/page';
import Social from '@/app/social/page';
import MusicPage from '@/app/music/page';

const CONTENT_TABS = [
  { id: 'videos', label: 'Published Videos', icon: Film },
  { id: 'social', label: 'Social Cross-Posts', icon: Share2 },
  { id: 'audio', label: 'Audio & Music Library', icon: Music },
];

function ContentHubBody() {
  const searchParams = useSearchParams();
  const tabFromQuery = searchParams.get('tab');
  const activeTab = tabFromQuery && CONTENT_TABS.some((tab) => tab.id === tabFromQuery) ? tabFromQuery : 'videos';

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Film}
        title="Content & Media Library"
        sub="Catalog of every published Short and Episode, multi-platform social cross-posting health, and channel audio tracks."
      />

      <TabNav
        tabs={CONTENT_TABS}
        activeTab={activeTab}
        paramName="tab"
      />

      <div className="pt-2">
        {activeTab === 'videos' && <Videos />}
        {activeTab === 'social' && <Social />}
        {activeTab === 'audio' && <MusicPage />}
      </div>
    </div>
  );
}

export default function ContentHub() {
  return (
    <Suspense fallback={<div className="p-8 text-faint">Loading Content Library…</div>}>
      <ContentHubBody />
    </Suspense>
  );
}
