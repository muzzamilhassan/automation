'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Sparkles, ClipboardCheck, ListChecks, Image as ImageIcon, Clapperboard } from 'lucide-react';
import { PageHeader, PageSkeleton } from '@/components/ui';
import TabNav from '@/components/TabNav';
import FactoryBox from '@/components/FactoryBox';
import { useMe } from '@/components/use-me';
import ReviewDeskPage from '@/app/review/page';
import TopicDesk from '@/app/topics/page';
import CreatePage from '@/app/create/page';
import ThumbsPage from '@/app/thumbs/page';
import TemplatesPage from '@/app/templates/page';

const STUDIO_TABS = [
  { id: 'review', label: 'Review Queue', icon: ClipboardCheck },
  { id: 'topics', label: 'Topic Desk', icon: ListChecks },
  { id: 'create', label: 'Create Video', icon: Sparkles },
  { id: 'thumbs', label: 'Thumbnails', icon: ImageIcon },
  { id: 'templates', label: 'Video Templates', icon: Clapperboard },
];

function StudioContent() {
  const searchParams = useSearchParams();
  const tabFromQuery = searchParams.get('tab');
  const activeTab = tabFromQuery && STUDIO_TABS.some((tab) => tab.id === tabFromQuery) ? tabFromQuery : 'review';
  const me = useMe();

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Sparkles}
        title="Studio Desk"
        sub="Editorial review gates, viral topic backlog, generative vertical shorts, thumbnail studio, and video engines."
      />

      {/* "Ask the factory" (2026-11-23): one sentence → a plan → Start. Owner
          only (the /api/factory routes refuse every other role too). */}
      {me?.role === 'owner' ? <FactoryBox /> : null}

      <TabNav
        tabs={STUDIO_TABS}
        activeTab={activeTab}
        paramName="tab"
      />

      <div className="pt-2">
        {activeTab === 'review' && <ReviewDeskPage />}
        {activeTab === 'topics' && <TopicDesk />}
        {activeTab === 'create' && <CreatePage />}
        {activeTab === 'thumbs' && <ThumbsPage />}
        {activeTab === 'templates' && <TemplatesPage />}
      </div>
    </div>
  );
}

export default function StudioHub() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StudioContent />
    </Suspense>
  );
}
